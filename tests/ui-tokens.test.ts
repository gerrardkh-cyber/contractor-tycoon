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
