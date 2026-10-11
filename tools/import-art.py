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
EDGE_ROW = 0.3  # an edge row this covered is a real edge, not a stray corner
SLAB_FLATNESS = 12.0  # a floor slab's row varies this little in brightness
TRIM_ALPHA = 128  # pixels this opaque, and only these, decide a piece's box
STOREY_SPREAD = 0.12  # storeys may differ in height by 12% before a warning
MAST_TOLERANCE = 4  # px a mast's edges may wander and still be the mast
MAST_MIN_PERIOD = 12  # the shortest lattice repeat worth believing
MAST_REPEAT_LIMIT = 18.0  # mean brightness mismatch above which the repeat is loose
GLASS_MARGIN = 25  # glass is blue at least this far above red
GLASS_FLOOR = 110  # and at least this bright in blue
GLASS_MIN_PANE = 20  # pixels; anything smaller is a speck, not a window
GLOW_COLOUR = (255, 206, 120, 255)  # what a lit window looks like
GLASS_DETAIL = 3  # how strongly the glass's shading shows through its light
COLUMN_ROWS = (0.2, 0.8)  # the part of a storey's height a column is judged on
COLUMN_FILL = 0.9  # a column is solid through at least this share of it
COLUMN_THIN = 0.04  # and no wider than this share of the tile
COLUMN_MATCH = 6  # px: how far apart two storeys may put the same column

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

    # Too many: the extras are smears and specks, so the smallest go.
    while len(runs) > count:
        smallest = min(runs, key=lambda r: r[1] - r[0])
        warn(f"{name}: dropping a {smallest[1] - smallest[0]}px fragment at x={smallest[0]}")
        runs.remove(smallest)
    # Too few: two drawings overlap across, so no straight cut parts them -
    # a runner's fist can reach past a cheering arm. The widest run is parted
    # by what is joined to what: each separate shape goes with the figure it
    # sits nearest.
    crops = [image.crop((a, 0, b, image.size[1])) for a, b in runs]
    while len(crops) < count:
        i = max(range(len(crops)), key=lambda k: crops[k].size[0])
        a, b = runs[i]
        warn(f"{name}: two drawings overlap inside x={a}-{b}; parted shape by shape")
        left, right = part_by_shape(crops[i])
        crops[i:i + 1] = [left, right]
        runs[i:i + 1] = [(a, b), (a, b)]
    return crops


def shapes_of(image):
    """Every separate shape in a picture, as (pixel list, centre x)."""
    w, h = image.size
    alpha = image.getchannel("A").load()
    seen = [[False] * h for _ in range(w)]
    found = []
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or alpha[sx, sy] <= EMPTY_ALPHA:
                continue
            stack, pixels = [(sx, sy)], []
            seen[sx][sy] = True
            while stack:
                x, y = stack.pop()
                pixels.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and alpha[nx, ny] > EMPTY_ALPHA:
                        seen[nx][ny] = True
                        stack.append((nx, ny))
            found.append((pixels, sum(p[0] for p in pixels) / len(pixels)))
    return found


def part_by_shape(image):
    """Two figures that overlap across, separated into one picture each."""
    shapes = sorted(shapes_of(image), key=lambda s: len(s[0]), reverse=True)
    if len(shapes) < 2:
        w = image.size[0]
        return image.crop((0, 0, w // 2, image.size[1])), image.crop((w // 2, 0, w, image.size[1]))
    # The two biggest shapes are the two figures; every other shape joins
    # whichever of them its middle is closer to.
    centres = sorted([shapes[0][1], shapes[1][1]])
    halves = [Image.new("RGBA", image.size, (0, 0, 0, 0)) for _ in range(2)]
    src = image.load()
    for pixels, centre in shapes:
        side = 0 if abs(centre - centres[0]) <= abs(centre - centres[1]) else 1
        dst = halves[side].load()
        for x, y in pixels:
            dst[x, y] = src[x, y]
    return trim(halves[0]), trim(halves[1])


def split_storeys(image, count, name):
    """
    Cuts one building drawn storey on storey into its storeys, bottom first.

    There are no gaps between storeys to cut along, so the cuts start even
    and each one is moved to the nearest floor slab: a slab is a row that is
    solid across the building and nearly flat in colour, which the open
    frames, pipes and windows inside a storey are not. Each cut goes through
    the middle of its slab, so every storey carries half a slab top and
    bottom and any two of them stacked make a whole one.
    """
    image = trim(image)
    w, h = image.size
    px = image.load()
    margin = max(1, w // 100)

    def flatness(y):
        row = [px[x, y] for x in range(margin, w - margin)]
        if sum(1 for p in row if p[3] <= EMPTY_ALPHA) > len(row) * 0.02:
            return None  # not solid across: not a slab
        lum = [(p[0] + p[1] + p[2]) / 3 for p in row]
        mean = sum(lum) / len(lum)
        return (sum((v - mean) ** 2 for v in lum) / len(lum)) ** 0.5

    flat = [flatness(y) for y in range(h)]
    reach = max(2, h // (count * 4))
    cuts = [0]
    for k in range(1, count):
        nominal = round(k * h / count)
        slab = [y for y in range(max(1, nominal - reach), min(h - 1, nominal + reach))
                if flat[y] is not None and flat[y] <= SLAB_FLATNESS]
        if not slab:
            warn(f"{name}: no floor slab near y={nominal}; cutting there evenly")
            cuts.append(nominal)
            continue
        # The run of slab rows nearest the even cut, and its middle.
        best = min(slab, key=lambda y: abs(y - nominal))
        top = bottom = best
        while top - 1 in slab:
            top -= 1
        while bottom + 1 in slab:
            bottom += 1
        cuts.append((top + bottom) // 2)
    cuts.append(h)
    heights = [cuts[i + 1] - cuts[i] for i in range(count)]
    spread = (max(heights) - min(heights)) / (sum(heights) / count)
    if spread > STOREY_SPREAD:
        warn(f"{name}: storeys come out {min(heights)}-{max(heights)}px tall; evened out when sized")
    # Top of the drawing first; the sheet lists its pieces bottom first.
    pieces = [image.crop((0, cuts[i], w, cuts[i + 1])) for i in range(count)]
    return list(reversed(pieces))


def trim(image):
    # Only what is solidly there decides the box: a background that is a
    # shade off pure magenta keys out half-transparent, and would otherwise
    # stretch the box by its whole width.
    box = image.getchannel("A").point(lambda a: 255 if a > TRIM_ALPHA else 0).getbbox()
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


def edge_row(image, from_top):
    """
    The outermost row that is substantially there. The very first and last
    rows after trimming are often a few antialiased pixels of a slab's corner,
    which say nothing about where the wall is.
    """
    w, h = image.size
    alpha = image.getchannel("A").load()
    ys = range(h) if from_top else range(h - 1, -1, -1)
    for y in ys:
        if sum(1 for x in range(w) if alpha[x, y] > EMPTY_ALPHA) / w >= EDGE_ROW:
            return row_of(image, y)
    return row_of(image, 0 if from_top else h - 1)


def check_stack(pieces, names):
    """Every floor sits on every other: each bottom edge has to meet each top edge."""
    w = pieces[0].size[0]
    for lower, lower_name in zip(pieces, names):
        top = edge_row(lower, True)
        for upper, upper_name in zip(pieces, names):
            bottom = edge_row(upper, False)
            a, b = opaque_span(top), opaque_span(bottom)
            if a is None or b is None:
                warn(f"{upper_name} on {lower_name}: an edge row is empty, the floors will float")
                continue
            drift = max(abs(a[0] - b[0]), abs(a[1] - b[1])) / w
            if drift > SPAN_TOLERANCE:
                warn(f"{upper_name} on {lower_name}: walls miss by {drift:.1%} of the width")
    for piece, name in zip(pieces, names):
        gap = colour_gap(edge_row(piece, True), edge_row(piece, False))
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


def jib_pivot(image):
    """
    Where a jib sits on its tower: the A-frame is the highest thing on a tower
    crane's jib, so the column it tops is the pivot; the boom is the row that
    runs furthest across. Both as fractions of the picture.
    """
    w, h = image.size
    alpha = image.getchannel("A").load()
    top_x, top_y = 0, h
    for x in range(w):
        for y in range(h):
            if alpha[x, y] > EMPTY_ALPHA:
                if y < top_y:
                    top_x, top_y = x, y
                break
    widest, beam_y = -1, 0
    for y in range(h):
        count = sum(1 for x in range(w) if alpha[x, y] > EMPTY_ALPHA)
        if count > widest:
            widest, beam_y = count, y
    return round(top_x / w, 4), round(beam_y / h, 4)


def strip_hook(image, pivot):
    """
    Takes the hook and its cables off a jib (order 010 §2): the game draws its
    own, which can ride down to the floor being framed. Everything hanging
    below the trolley on the long arm goes; the counterweight, on the short
    side of the pivot, stays. Returns the jib, and where the hook hung as
    fractions across and down - the line the drawn cable should follow.
    """
    w, h = image.size
    px = image.load()
    arm = int(pivot * w) + w // 50
    cover = [sum(1 for x in range(arm, w) if px[x, y][3] > TRIM_ALPHA) for y in range(h)]
    beam = max(range(h), key=lambda y: cover[y])
    # The trolley hangs right under the boom; the first empty row below it is
    # where the cable starts.
    cut = next((y for y in range(beam + 1, h) if cover[y] == 0), None)
    if cut is None:
        warn("crane-jib: nothing hangs clear of the trolley; no hook to take off")
        return image, None, None
    xs = []
    for y in range(cut, h):
        for x in range(arm, w):
            alpha = px[x, y][3]
            if alpha > EMPTY_ALPHA:
                xs.append(x)
            # The faint edge of the cable goes too, or a ghost of it stays.
            if alpha > 0:
                px[x, y] = (0, 0, 0, 0)
    if not xs:
        warn("crane-jib: no hook found below the trolley")
        return image, None, None
    return image, round(sum(xs) / len(xs) / w, 4), round(cut / h, 4)


def split_tower(image, name):
    """
    Cuts a tower into its head and one repeating length of mast (order 010
    §2). The head is everything down to where the tower settles to the mast's
    width; the mast tile is one period of the lattice, found by matching the
    mast against itself, so stacking tiles reads as one continuous mast.
    """
    w, h = image.size
    alpha = image.getchannel("A").load()
    spans = []
    for y in range(h):
        xs = [x for x in range(w) if alpha[x, y] > TRIM_ALPHA]
        spans.append((xs[0], xs[-1]) if xs else None)
    lower = [s for s in spans[h // 2:] if s]
    mast = (sorted(s[0] for s in lower)[len(lower) // 2], sorted(s[1] for s in lower)[len(lower) // 2])
    head_end = 0
    for y, span in enumerate(spans):
        if span and (abs(span[0] - mast[0]) > MAST_TOLERANCE or abs(span[1] - mast[1]) > MAST_TOLERANCE):
            head_end = y + 1
    if head_end == 0 or head_end >= h - 20:
        warn(f"{name}: could not tell the head from the mast")
        return image, None, None
    head = image.crop((0, 0, w, head_end))
    # Where the mast meets the head, across it: the head overhangs one side.
    centre = round((mast[0] + mast[1] + 1) / 2 / w, 4)

    # One period of the lattice: the shift at which the mast best matches itself.
    body = image.crop((mast[0], head_end, mast[1] + 1, h)).convert("L")
    bw, bh = body.size
    rows = [sum(body.getpixel((x, y)) for x in range(bw)) / bw for y in range(bh)]
    best, period = None, None
    for shift in range(MAST_MIN_PERIOD, bh // 2):
        diff = sum(abs(rows[y] - rows[y + shift]) for y in range(bh - shift)) / (bh - shift)
        if best is None or diff < best:
            best, period = diff, shift
    if period is None:
        warn(f"{name}: mast too short to find its repeat")
        return head, None, centre
    start = head_end + (bh - period) // 2
    tile = image.crop((mast[0], start, mast[1] + 1, start + period))
    if best > MAST_REPEAT_LIMIT:
        warn(f"{name}: the mast repeats only loosely (mismatch {best:.1f}); stacked tiles may show seams")
    return head, tile, centre


def is_glass(pixel):
    """The blueprint blue of glass and of the sky behind an open frame."""
    r, g, b, a = pixel
    return b > r + GLASS_MARGIN and b >= g and b > GLASS_FLOOR


def column_runs(tile):
    """
    The stretches of a storey tile that stand solid through most of its
    height (slab rows at top and bottom left out): columns, walls between
    windows. Returned as (first, last) pixel columns.
    """
    w, h = tile.size
    px = tile.load()
    rows = range(int(h * COLUMN_ROWS[0]), int(h * COLUMN_ROWS[1]))
    runs, start = [], None
    for x in range(w + 1):
        solid = False
        if x < w:
            hits = sum(1 for y in rows if px[x, y][3] > TRIM_ALPHA and not is_glass(px[x, y]))
            solid = hits >= COLUMN_FILL * len(rows)
        if solid and start is None:
            start = x
        if not solid and start is not None:
            runs.append((start, x - 1))
            start = None
    return runs


def find_columns(pieces, names):
    """
    Order 010 decision 7: where the frame's columns stand, so a narrower
    building can be cut bay by bay and joined on column centres. A column is
    a thin solid stretch in some storey that every storey has something solid
    at: the bare grid, the framing, the finished frame, the services and the
    finished wall all agree on it. Returned as centres, fractions across.
    """
    w = pieces[0].size[0]
    runs = {name: column_runs(piece) for piece, name in zip(pieces, names)}
    thin = sorted((a + b) / 2 for found in runs.values() for a, b in found if b - a + 1 <= w * COLUMN_THIN)
    centres = []
    for c in thin:
        if all(any(a - COLUMN_MATCH <= c <= b + COLUMN_MATCH for a, b in found) for found in runs.values()):
            if centres and c - centres[-1][-1] <= COLUMN_MATCH:
                centres[-1].append(c)
            else:
                centres.append([c])
    columns = [round(sum(group) / len(group) / w, 4) for group in centres]
    if len(columns) < 3:
        warn(f"storeys: only {len(columns)} column(s) found in every storey; buildings keep the whole tile")
        return None
    print(f"  columns: {len(columns)} at {', '.join(f'{c * w:.1f}' for c in columns)} px "
          f"-> {len(columns) - 1} bays")
    return columns


def window_glow(tile):
    """
    Order 010 §4: the finished floor's glass, as a picture of its own. Glass
    is the blueprint blue - blue well above red and above green - and only
    those pixels light up after dark. Returns the glow image and how many
    separate panes were found.
    """
    w, h = tile.size
    px = tile.load()
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gp = glow.load()
    lit = set()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > TRIM_ALPHA and is_glass(px[x, y]):
                lit.add((x, y))
    # The light keeps the glass's own shading, pushed up, so the mullions and
    # reflections still read through it rather than one flat slab of colour.
    shade = {p: sum(px[p[0], p[1]][:3]) for p in lit}
    mean = sum(shade.values()) / max(1, len(shade))
    for p, value in shade.items():
        k = max(0.0, 1 + GLASS_DETAIL * (value / mean - 1))
        gp[p[0], p[1]] = tuple(min(255, round(c * k)) for c in GLOW_COLOUR[:3]) + (GLOW_COLOUR[3],)
    panes, seen = 0, set()
    for start in lit:
        if start in seen:
            continue
        panes += 1
        stack = [start]
        seen.add(start)
        size = 0
        while stack:
            x, y = stack.pop()
            size += 1
            for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nb in lit and nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        if size < GLASS_MIN_PANE:
            panes -= 1
    return glow, panes, len(lit)


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


def same_canvas(pieces):
    """
    Sprite frames share one canvas so the character stays one size: each
    pose is centred across and stands on the bottom edge, padded rather than
    scaled - a sitting figure is shorter than a standing one, and should be.
    """
    width = max(p.size[0] for p in pieces)
    height = max(p.size[1] for p in pieces)
    out = []
    for piece in pieces:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(piece, ((width - piece.size[0]) // 2, height - piece.size[1]))
        out.append(canvas)
    return out


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
        "  /** Jib only: where it sits on the tower, as fractions across and down. */",
        "  readonly pivotX?: number;",
        "  readonly beamY?: number;",
        "  /** Jib only: where its hook hung before it was taken off. */",
        "  readonly hookX?: number;",
        "  readonly hookY?: number;",
        "  /** Storeys only: column centres, as fractions across, left to right. */",
        "  readonly columns?: readonly number[];",
        "}",
        "",
        "export const ART_FILES: Readonly<Record<string, ArtFile>> = {",
    ]
    for name, meta in entries:
        extra = "".join(f", {key}: {meta[key]}" for key in ("groundLine", "pivotX", "beamY", "hookX", "hookY") if key in meta)
        if "columns" in meta:
            extra += ", columns: [" + ", ".join(str(c) for c in meta["columns"]) + "]"
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
    head_centre = {}
    for sheet in spec["sheets"]:
        path = os.path.join(RAW, sheet["file"])
        print(f"{sheet['file']}")
        if not os.path.exists(path):
            warn(f"{sheet['file']}: not in art-raw/; its slots stay vector")
            continue

        keyed = key_magenta(Image.open(path))
        # What is cut out of the sheet. Usually the pieces themselves; a tower
        # is one drawing that becomes two pieces (head and mast).
        drawings = sheet.get("drawings", sheet["pieces"])
        if sheet.get("stacked"):
            pieces = split_storeys(keyed, len(drawings), sheet["file"])
        else:
            pieces = [trim(p) for p in split_sheet(keyed, len(drawings), sheet["file"])]
        names = list(drawings)

        target = sheet["targetWidth"]
        widths = target if isinstance(target, dict) else {n: target for n in names}

        if sheet.get("frames"):
            # Sprite frames: one canvas for all, then one width for all.
            pieces = same_canvas(pieces)
            pieces = [fit_width(p, widths[n], n) for p, n in zip(pieces, names)]
        elif sheet.get("sameSize"):
            pieces = same_size(pieces, names, widths[names[0]])
        else:
            pieces = [fit_width(p, widths[n], n) for p, n in zip(pieces, names)]

        # A tower is cut again into a head and a repeating length of mast.
        extra = []
        tower = sheet.get("tower")
        if tower and tower["from"] in names:
            i = names.index(tower["from"])
            head, tile, centre = split_tower(pieces[i], tower["from"])
            if tile is not None:
                pieces[i] = head
                names[i] = tower["head"]
                extra.append((tower["mast"], tile))
                head_centre[tower["head"]] = centre

        columns = None
        if sheet.get("seam") == "stack":
            check_stack(pieces, names)
            columns = find_columns(pieces, names)
        limit = sheet.get("maxTileAspect")
        if limit is not None:
            shape = pieces[0].size[1] / pieces[0].size[0]
            if shape > limit:
                warn(f"{sheet['file']}: each tile is {shape:.2f} as tall as it is wide "
                     f"(limit {limit}); a tile this tall reads as more than one storey")
        held = sheet.get("hold")
        if held:
            warn(f"{sheet['file']}: HELD - written and reported, but not listed for the game. {held}")

        for name, piece in extra:
            pieces.append(piece)
            names.append(name)

        for piece, name in zip(pieces, names):
            if sheet.get("seam") == "tile":
                check_tile(piece, name)
            left = magenta_left(piece)
            if left:
                warn(f"{name}: {left} visible pixels still read as magenta after keying")
            meta = {"w": piece.size[0], "h": piece.size[1]}
            if sheet.get("groundLine"):
                meta["groundLine"] = ground_line(piece)
            if columns:
                meta["columns"] = columns
            if name in head_centre:
                meta["pivotX"] = head_centre[name]
            if name == "crane-jib":
                meta["pivotX"], meta["beamY"] = jib_pivot(piece)
                piece, hook_x, hook_y = strip_hook(piece, meta["pivotX"])
                if hook_x is not None:
                    meta["hookX"], meta["hookY"] = hook_x, hook_y
            if name == "floor-complete" and not held:
                glow, panes, lit = window_glow(piece)
                if panes == 0:
                    warn("floor-complete: no window glass found; nights will stay dark")
                else:
                    print(f"  windows: {panes} pane(s), {lit} px of glass")
                    glow_out = os.path.join(OUT, "floor-glow.webp")
                    glow.save(glow_out, "WEBP", quality=88, method=6)
                    glow_meta = {"w": glow.size[0], "h": glow.size[1]}
                    if columns:
                        glow_meta["columns"] = columns
                    produced.append(("floor-glow", glow_meta))
                    contact.append(("floor-glow", glow))
            # A held piece is kept for review but must not ship in the build.
            folder = os.path.join(RAW, "held") if held else OUT
            os.makedirs(folder, exist_ok=True)
            out = os.path.join(folder, f"{name}.webp")
            piece.save(out, "WEBP", quality=88, method=6)
            size = os.path.getsize(out)
            print(f"  {name:16} {piece.size[0]:5}x{piece.size[1]:<5} {size / 1024:7.1f} KB"
                  + ("  (held)" if held else ""))
            if not held:
                produced.append((name, meta))
            contact.append((name + (" (held)" if held else ""), piece))

    # What ships: the pieces listed for the game.
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
