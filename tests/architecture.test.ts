import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

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

/** Strip comments so prose about the rules does not trip the rules. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('src/core stays a pure simulation engine', () => {
  const coreFiles = walk(join(ROOT, 'src', 'core')).filter((f) => extname(f) === '.ts');

  it('has at least one source file', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it.each([
    ['document', /\bdocument\b/],
    ['window', /\bwindow\b/],
    ['navigator', /\bnavigator\b/],
    ['localStorage', /\blocalStorage\b/],
    ['HTMLElement', /\bHTML[A-Za-z]*Element\b/],
    ['Canvas API', /\bCanvasRenderingContext2D\b|\bgetContext\s*\(/],
  ])('never touches %s', (_label, pattern) => {
    for (const file of coreFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(pattern.test(code), `${file} violates the src/core DOM/Canvas ban`).toBe(false);
    }
  });

  it('never imports from src/ui', () => {
    for (const file of coreFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(/from\s+['"][^'"]*\/ui(\/|['"])/.test(code), `${file} imports src/ui`).toBe(false);
    }
  });
});

describe('src/data holds valid JSON', () => {
  const dataFiles = walk(join(ROOT, 'src', 'data')).filter((f) => extname(f) === '.json');

  it('has the four template files', () => {
    const names = dataFiles.map((f) => f.split('/').pop());
    expect(names.sort()).toEqual([
      'event-templates.json',
      'inspection-gates.json',
      'process-stages.json',
      'project-types.json',
    ]);
  });

  it('parses every data file', () => {
    for (const file of dataFiles) {
      expect(() => JSON.parse(readFileSync(file, 'utf8')), `${file} is not valid JSON`).not.toThrow();
    }
  });
});

describe('offline submission requirement', () => {
  it('index.html references no external origin', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(/(src|href)\s*=\s*["']https?:\/\//.test(html), 'index.html pulls from a CDN').toBe(false);
  });
});
