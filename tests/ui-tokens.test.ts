import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Order 004 §1: every colour and size lives in theme.ts, and nowhere else in
 * src/ui. This is the reviewer rule, written down so it cannot quietly rot.
 */
describe('src/ui keeps colour and size in theme.ts', () => {
  const files = walk(join(ROOT, 'src', 'ui'))
    .filter((file) => extname(file) === '.ts')
    .filter((file) => basename(file) !== 'theme.ts');

  it('covers the whole of src/ui bar the theme itself', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((file) => basename(file) === 'theme.ts')).toBe(false);
  });

  it.each([
    ['a hex colour', /#[0-9a-fA-F]{3,8}\b/],
    ['an rgb()/rgba() colour', /\brgba?\s*\(/],
    ['a pixel literal', /\b\d+(\.\d+)?px\b/],
  ])('never spells out %s', (label, pattern) => {
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const match = pattern.exec(code);
      expect(
        match,
        `${basename(file)} spells out ${label}: ${match?.[0] ?? ''} — move it to theme.ts`,
      ).toBe(null);
    }
  });

  it('ships no image file: the art is drawn in code', () => {
    const assets = walk(join(ROOT, 'src'))
      .map((file) => extname(file).toLowerCase())
      .filter((ext) => ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext));
    expect(assets).toEqual([]);
  });

  it('keeps the bundled audio inside the order 004 budget', () => {
    const sounds = walk(join(ROOT, 'src', 'ui', 'sounds'));
    const total = sounds.reduce((sum, file) => sum + statSync(file).size, 0);
    expect(sounds.length).toBe(6);
    // Order 004 §5: 500 KB for all six cues together.
    expect(total).toBeLessThanOrEqual(500 * 1024);
  });
});

/**
 * Order 009 §2-3: the image slots are a spec the import script follows
 * (tools/art-slots.json), a list the game knows (src/ui/art.ts), and a
 * document the artist works from (docs/ART_SLOTS.md). Three copies of one
 * list drift apart unless something holds them together.
 */
describe('the image slots agree everywhere they are listed', () => {
  const spec = JSON.parse(readFileSync(join(ROOT, 'tools', 'art-slots.json'), 'utf8')) as {
    sheets: { file: string; pieces: string[]; derived?: string[] }[];
    vectorOnly: string[];
  };
  // What the game can be given: every piece cut from a sheet, and anything
  // made from one (the night glow made from the finished floor).
  const pieces = spec.sheets.flatMap((sheet) => [...sheet.pieces, ...(sheet.derived ?? [])]);
  const doc = readFileSync(join(ROOT, 'docs', 'ART_SLOTS.md'), 'utf8');
  const art = readFileSync(join(ROOT, 'src', 'ui', 'art.ts'), 'utf8');
  const files = readFileSync(join(ROOT, 'src', 'ui', 'art-files.ts'), 'utf8');

  it('has the pieces orders 009 and 010 name', () => {
    // 009: five floors, foundation, roof, crane, two skylines, ground.
    // 010: the crane's head and mast in place of its tower, the night glow,
    // six worker poses, three inspector poses and the mixer.
    expect(pieces).toHaveLength(24);
  });

  it('documents every piece and every sheet', () => {
    for (const piece of pieces) {
      expect(doc.includes(`\`${piece}\``), `docs/ART_SLOTS.md does not list ${piece}`).toBe(true);
    }
    for (const sheet of spec.sheets) {
      expect(doc.includes(sheet.file), `docs/ART_SLOTS.md does not name ${sheet.file}`).toBe(true);
    }
  });

  it('says which layers are not image slots', () => {
    expect(doc).toContain('이미지 슬롯 아님');
    for (const name of spec.vectorOnly) {
      expect(doc.includes(`\`${name}\``), `docs/ART_SLOTS.md does not mark ${name} as vector`).toBe(true);
    }
  });

  it('is the list the game looks pictures up by', () => {
    const union = art.slice(art.indexOf('export type ArtPiece'), art.indexOf(';', art.indexOf('export type ArtPiece')));
    const named = [...union.matchAll(/'([a-z-]+)'/g)].map((hit) => hit[1]);
    expect(named.sort()).toEqual([...pieces].sort());
  });

  it('has no picture the spec does not know about', () => {
    const listed = [...files.matchAll(/^ {2}'([a-z-]+)':/gm)].map((hit) => hit[1] ?? '');
    for (const name of listed) expect(pieces, `art-files.ts has ${name}`).toContain(name);
  });
});
