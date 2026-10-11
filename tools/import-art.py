"""Cuts the generated art sheets in art-raw/ into the game's image slots.

Order 009 §3. Run from the repository root, isolated:

    python3 -I tools/import-art.py

What it does, sheet by sheet (tools/art-slots.json says which sheet is which):

  1. keys the flat magenta background out to transparency, and pulls the
     magenta fringe off the edges it leaves behind (despill);
  2. splits multi-piece sheets along the empty columns between pieces, and
     warns when an even split would have cut through a drawing;
  3. trims each piece, makes the five floor states one size, and checks the
     edges that have to meet - floors stacked on floors, skylines and ground
     tiled end to end;
  4. writes public/art/<piece>.webp at the slot's width (never larger than
     the source), src/ui/art-files.ts for the game to find them, and a
     contact sheet and report in art-raw/.

Every warning is printed and written to art-raw/import-report.txt. Nothing
here decides whether the art is good; it only says where it does not fit.
"""

import json
import os
import site
import sys

# `python -I` drops the user site-packages, which is where Pillow is installed
# on this machine. Put back that one directory and nothing else: the script's
# own folder and the working directory stay off the import path, which is the
# point of -I when the inputs are downloaded images.
_USER_SITE = site.getusersitepackages()
if _USER_SITE not in sys.path:
    sys.path.append(_USER_SITE)

from PIL import Image, ImageDraw  # noqa: E402

ROOT = os.getcwd()
RAW = os.path.join(ROOT, "art-raw")
OUT = os.path.join(ROOT, "public", "art")
MANIFEST = os.path.join(ROOT, "src", "ui", "art-files.ts")
SPEC = os.path.join(ROOT, "tools", "art-slots.json")

# Keying. A pixel's "magenta-ness" is how far red and blue both stand above
# green: pure #FF00FF scores 255, grey and every colour in this palette score
# at or below zero. Between the two thresholds the pixel is part background.
KEY_SOLID = 150  # at or above: background, fully transparent
KEY_CLEAR = 45  # at or below: art, fully opaque
EMPTY_ALPHA = 16  # a pixel this transparent counts as empty
EMPTY_COLUMN = 0.995  # a column this empty is a gap between pieces

# Seam checks.
SPAN_TOLERANCE = 0.02  # opaque spans may differ by 2% of the width
COLOUR_TOLERANCE = 28.0  # mean channel difference along a seam
ASPECT_TOLERANCE = 0.05  # floor pieces may differ in shape by 5%
GROUND_ROW = 0.9  # the dirt line is the first row this opaque

warnings = []


def warn(message):
    warnings.append(message)
    print(f"  ! {message}")


# ---- keying ---------------------------------------------------------------


def key_magenta(image):
    """Magenta background to alpha, then the magenta fringe off the edges."""
    rgb = image.convert("RGB")
    out = []
    for r, g, b in rgb.getdata():
        score = min(r, b) - g
        if score >= KEY_SOLID:
            out.append((0, 0, 0, 0))
            continue
        alpha = 255
        if score > KEY_CLEAR:
            alpha = round(255 * (KEY_SOLID - score) / (KEY_SOLID - KEY_CLEAR))
        # Despill: whatever red and blue both carry above green is the
        # background bleeding in. This palette has no purple to lose.
        if score > 0:
            r -= score
            b -= score
        out.append((r, g, b, alpha))
    keyed = Image.new("RGBA", rgb.size)
    keyed.putdata(out)
    return keyed


def magenta_left(image):
    """How many visible pixels still read as magenta after keying."""
    count = 0
    for r, g, b, a in image.getdata():
        if a > EMPTY_ALPHA and min(r, b) - g > KEY_CLEAR:
            count += 1
    return count


# ---- slicing --------------------------------------------------------------


def column_emptiness(image):
    w, h = image.size
    alpha = image.getchannel("A").load()
    return [sum(1 for y in range(h) if alpha[x, y] <= EMPTY_ALPHA) / h for x in range(w)]


def content_runs(empty):
    """Runs of columns that hold something, as (start, end) pairs."""
    runs, start = [], None
    for x, value in enumerate(empty):
        filled = value < EMPTY_COLUMN
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(empty)))
    return runs


def split_sheet(image, count, name):
    """Cuts a sheet into `count` pieces along the gaps between them."""
    w, _ = image.size
    if count == 1:
        return [image]

    empty = column_emptiness(image)

    # Where an even split would cut, and whether it cuts through something.
    for k in range(1, count):
        x = round(k * w / count)
        if empty[min(x, w - 1)] < EMPTY_COLUMN:
            warn(f"{name}: an even {count}-way split cuts a drawing at x={x}; "
                 "the cut is moved to the nearest empty column")

    runs = content_runs(empty)
    # Specks of noise make runs of their own; ignore anything a fiftieth wide.
    runs = [r for r in runs if r[1] - r[0] >= w / (count * 50)]
    if len(runs) == count:
        return [image.crop((a, 0, b, image.size[1])) for a, b in runs]

    warn(f"{name}: found {len(runs)} separate drawings where {count} were expected; "
         "falling back to an even split moved to the nearest empty columns")
    cuts = [0]
    half = w // (count * 2)
    for k in range(1, count):
        nominal = round(k * w / count)
        best = nominal
        for d in range(half):
            for x in (nominal - d, nominal + d):
                if 0 <= x < w and empty[x] >= EMPTY_COLUMN:
                    best = x
                    break
            else:
                continue
            break
        else:
            warn(f"{name}: no empty column near x={nominal}; cutting through the drawing")
        cuts.append(best)
    cuts.append(w)
    return [image.crop((cuts[i], 0, cuts[i + 1], image.size[1])) for i in range(count)]


def trim(image):
    box = image.getchannel("A").point(lambda a: 255 if a > EMPTY_ALPHA else 0).getbbox()
    return image.crop(box) if box else image


# ---- seams ----------------------------------------------------------------


def opaque_span(row):
    xs = [i for i, (_, _, _, a) in enumerate(row) if a > EMPTY_ALPHA]
    return (xs[0], xs[-1]) if xs else None


def row_of(image, y):
    w = image.size[0]
    px = image.load()
    return [px[x, y] for x in range(w)]


def column_of(image, x):
    h = image.size[1]
    px = image.load()
    return [px[x, y] for y in range(h)]


def colour_gap(a, b):
    pairs = [(p, q) for p, q in zip(a, b) if p[3] > EMPTY_ALPHA and q[3] > EMPTY_ALPHA]
    if not pairs:
        return 0.0
    return sum(abs(p[i] - q[i]) for p, q in pairs for i in range(3)) / (3 * len(pairs))


def check_stack(pieces, names):
    """Every floor sits on every other: each bottom edge has to meet each top edge."""
    w = pieces[0].size[0]
    for lower, lower_name in zip(pieces, names):
        top = row_of(lower, 0)
        for upper, upper_name in zip(pieces, names):
            bottom = row_of(upper, upper.size[1] - 1)
            a, b = opaque_span(top), opaque_span(bottom)
            if a is None or b is None:
                warn(f"{upper_name} on {lower_name}: an edge row is empty, the floors will float")
                continue
            drift = max(abs(a[0] - b[0]), abs(a[1] - b[1])) / w
            if drift > SPAN_TOLERANCE:
                warn(f"{upper_name} on {lower_name}: walls miss by {drift:.1%} of the width")
    for piece, name in zip(pieces, names):
        gap = colour_gap(row_of(piece, 0), row_of(piece, piece.size[1] - 1))
        if gap > COLOUR_TOLERANCE:
            warn(f"{name} stacked on itself: top and bottom edges differ by {gap:.0f}/255 in colour")


def check_tile(image, name):
    """A tile meets itself end to end: its left and right edges have to agree."""
    left, right = column_of(image, 0), column_of(image, image.size[0] - 1)
    h = image.size[1]
    mismatch = sum(1 for p, q in zip(left, right) if (p[3] > EMPTY_ALPHA) != (q[3] > EMPTY_ALPHA)) / h
    if mismatch > SPAN_TOLERANCE:
        warn(f"{name}: left and right edges disagree on {mismatch:.1%} of rows; the tile seam will show")
    gap = colour_gap(left, right)
    if gap > COLOUR_TOLERANCE:
        warn(f"{name}: left and right edges differ by {gap:.0f}/255 in colour")


def ground_line(image):
    """The first row of solid dirt, counted from the top."""
    w, h = image.size
    alpha = image.getchannel("A").load()
    for y in range(h):
        if sum(1 for x in range(w) if alpha[x, y] > EMPTY_ALPHA) / w >= GROUND_ROW:
            return y
    warn("ground: no row is solid across the width; there is no dirt line to stand on")
    return 0


# ---- output ---------------------------------------------------------------


def fit_width(image, width, name):
    w, h = image.size
    if w < width:
        warn(f"{name}: source is {w}px wide, under the {width}px target; kept at {w}px rather than enlarged")
        return image
    return image.resize((width, max(1, round(h * width / w))), Image.LANCZOS)


def same_size(pieces, names, width):
    aspects = sorted(p.size[1] / p.size[0] for p in pieces)
    median = aspects[len(aspects) // 2]
    for piece, name in zip(pieces, names):
        aspect = piece.size[1] / piece.size[0]
        if abs(aspect - median) / median > ASPECT_TOLERANCE:
            warn(f"{name}: shaped {aspect:.3f} against the others' {median:.3f}; squeezed to match")
    source = min(p.size[0] for p in pieces)
    target = min(width, source)
    if source < width:
        warn(f"floors: narrowest piece is {source}px, under the {width}px target; kept at {source}px")
    size = (target, max(1, round(target * median)))
    return [p.resize(size, Image.LANCZOS) for p in pieces]


def contact_sheet(pieces, path):
    pad, label = 16, 18
    width = max(p.size[0] for _, p in pieces) + pad * 2
    height = sum(p.size[1] + label + pad for _, p in pieces) + pad
    sheet = Image.new("RGBA", (width, height), (40, 44, 48, 255))
    draw = ImageDraw.Draw(sheet)
    y = pad
    for name, piece in pieces:
        draw.text((pad, y), f"{name}  {piece.size[0]}x{piece.size[1]}", fill=(233, 235, 237, 255))
        y += label
        # A checkerboard behind each piece, so transparency reads as such.
        board = Image.new("RGBA", piece.size, (70, 74, 78, 255))
        bd = ImageDraw.Draw(board)
        for by in range(0, piece.size[1], 12):
            for bx in range(0, piece.size[0], 12):
                if (bx // 12 + by // 12) % 2:
                    bd.rectangle((bx, by, bx + 11, by + 11), fill=(90, 94, 98, 255))
        board.alpha_composite(piece)
        sheet.alpha_composite(board, (pad, y))
        y += piece.size[1] + pad
    sheet.convert("RGB").save(path)


def write_manifest(entries):
    lines = [
        "// Generated by tools/import-art.py from art-raw/. Do not edit by hand:",
        "// run `python3 -I tools/import-art.py` again instead.",
        "//",
        "// Which image slots have a picture. A slot missing from this list draws",
        "// itself as vectors, exactly as it did before there was any art.",
        "",
        "export interface ArtFile {",
        "  readonly url: string;",
        "  readonly w: number;",
        "  readonly h: number;",
        "  /** Ground only: the dirt line, in image pixels from the top. */",
        "  readonly groundLine?: number;",
        "}",
        "",
        "export const ART_FILES: Readonly<Record<string, ArtFile>> = {",
    ]
    for name, meta in entries:
        extra = f", groundLine: {meta['groundLine']}" if "groundLine" in meta else ""
        lines.append(f"  '{name}': {{ url: 'art/{name}.webp', w: {meta['w']}, h: {meta['h']}{extra} }},")
    lines.append("};")
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def main():
    with open(SPEC, encoding="utf-8") as handle:
        spec = json.load(handle)
    os.makedirs(OUT, exist_ok=True)

    produced = []
    contact = []
    for sheet in spec["sheets"]:
        path = os.path.join(RAW, sheet["file"])
        print(f"{sheet['file']}")
        if not os.path.exists(path):
            warn(f"{sheet['file']}: not in art-raw/; its slots stay vector")
            continue

        keyed = key_magenta(Image.open(path))
        pieces = [trim(p) for p in split_sheet(keyed, len(sheet["pieces"]), sheet["file"])]
        names = sheet["pieces"]

        target = sheet["targetWidth"]
        widths = target if isinstance(target, dict) else {n: target for n in names}

        if sheet.get("sameSize"):
            pieces = same_size(pieces, names, widths[names[0]])
        else:
            pieces = [fit_width(p, widths[n], n) for p, n in zip(pieces, names)]

        if sheet.get("seam") == "stack":
            check_stack(pieces, names)

        for piece, name in zip(pieces, names):
            if sheet.get("seam") == "tile":
                check_tile(piece, name)
            left = magenta_left(piece)
            if left:
                warn(f"{name}: {left} visible pixels still read as magenta after keying")
            meta = {"w": piece.size[0], "h": piece.size[1]}
            if sheet.get("groundLine"):
                meta["groundLine"] = ground_line(piece)
            out = os.path.join(OUT, f"{name}.webp")
            piece.save(out, "WEBP", quality=88, method=6)
            size = os.path.getsize(out)
            print(f"  {name:16} {piece.size[0]:5}x{piece.size[1]:<5} {size / 1024:7.1f} KB")
            produced.append((name, meta))
            contact.append((name, piece))

    total = sum(os.path.getsize(os.path.join(OUT, f"{n}.webp")) for n, _ in produced)
    print(f"total {total / 1024 / 1024:.2f} MB of {spec['budgetBytes'] / 1024 / 1024:.0f} MB budget")
    if total > spec["budgetBytes"]:
        warn(f"art totals {total / 1024 / 1024:.2f} MB, over the {spec['budgetBytes'] / 1024 / 1024:.0f} MB budget")

    write_manifest(produced)
    if contact:
        contact_sheet(contact, os.path.join(RAW, "contact-sheet.png"))
    with open(os.path.join(RAW, "import-report.txt"), "w", encoding="utf-8") as handle:
        handle.write(f"pieces: {len(produced)}\ntotal bytes: {total}\n")
        handle.write("warnings:\n" + "".join(f"- {w}\n" for w in warnings) if warnings else "warnings: none\n")
    print(f"{len(produced)} pieces, {len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
