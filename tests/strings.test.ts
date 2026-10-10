import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en, ko } from '../src/ui/strings';

const ROOT = process.cwd();
const UI = join(ROOT, 'src', 'ui');

/**
 * Every UI file, read from the directory rather than listed by hand: a file
 * added later is covered the day it lands.
 */
function uiFiles(): { name: string; source: string }[] {
  return readdirSync(UI)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(join(UI, name), 'utf8') }));
}

type Node = Record<string, unknown>;

/**
 * Walks a string table and reports every leaf as a path plus what it is, so
 * two tables can be compared key for key and shape for shape.
 */
function shapeOf(value: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();

  if (typeof value === 'function') {
    out.set(path, `function/${(value as (...a: unknown[]) => unknown).length}`);
    return out;
  }
  if (Array.isArray(value)) {
    out.set(path, `array/${value.length}`);
    value.forEach((entry, i) => {
      for (const [k, v] of shapeOf(entry, `${path}[${i}]`)) out.set(k, v);
    });
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Node)) {
      for (const [k, v] of shapeOf(child, path ? `${path}.${key}` : key)) out.set(k, v);
    }
    return out;
  }
  out.set(path, typeof value);
  return out;
}

const english = shapeOf(en);
const korean = shapeOf(ko);

describe('the Korean table matches the English one key for key', () => {
  it('has something to compare', () => {
    expect(english.size).toBeGreaterThan(100);
  });

  it('is missing no key', () => {
    const missing = [...english.keys()].filter((key) => !korean.has(key));
    expect(missing, `not translated: ${missing.join(', ')}`).toEqual([]);
  });

  it('invents no key the English table does not have', () => {
    const extra = [...korean.keys()].filter((key) => !english.has(key));
    expect(extra, `not in the English table: ${extra.join(', ')}`).toEqual([]);
  });

  it('keeps every leaf the same kind, and every function the same arity', () => {
    const wrong: string[] = [];
    for (const [key, kind] of english) {
      const other = korean.get(key);
      if (other !== undefined && other !== kind) wrong.push(`${key}: ${kind} vs ${other}`);
    }
    expect(wrong, wrong.join('; ')).toEqual([]);
  });

  it('leaves no English string sitting untranslated in the Korean table', () => {
    // Deliberate exceptions: a brand-ish word and the unit-free number formats.
    const allowed = new Set(['title.nameSecond']);
    const same: string[] = [];

    for (const [key, value] of Object.entries(flatten(en))) {
      if (allowed.has(key)) continue;
      const other = flatten(ko)[key];
      if (typeof value === 'string' && typeof other === 'string' && value === other && /[a-z]/i.test(value)) {
        same.push(key);
      }
    }
    expect(same, `still in English: ${same.join(', ')}`).toEqual([]);
  });

  it('writes its Korean in Korean', () => {
    const hangul = /[가-힣]/;
    const checked = ['topBar.cash', 'board.title', 'company.title', 'settings.title', 'stage.foundation'];
    for (const key of checked) {
      const value = flatten(ko)[key];
      expect(typeof value === 'string' && hangul.test(value), `${key} is not Korean`).toBe(true);
    }
  });
});

function flatten(value: unknown, path = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value !== 'function') {
    for (const [key, child] of Object.entries(value as Node)) {
      flatten(child, path ? `${path}.${key}` : key, out);
    }
    return out;
  }
  out[path] = value;
  return out;
}

describe('the game speaks one language at a time', () => {
  it('keeps Korean out of every UI file except the Korean table', () => {
    const hangul = /[가-힣]/;
    for (const { name, source } of uiFiles()) {
      if (name === 'strings.ko.ts') continue;
      expect(hangul.test(source), `${name} has Korean in it; it belongs in strings.ko.ts`).toBe(false);
    }
  });

  it('routes every consumer through the language entry point', () => {
    for (const { name, source } of uiFiles()) {
      if (name === 'strings.ts') continue;
      expect(
        /from '\.\/strings\.en'/.test(source),
        `${name} imports the English table directly, so it cannot switch language`,
      ).toBe(false);
    }
  });

  /**
   * Order 007 §4 asked for a glossary. A term defined but never attached to
   * anything is the defect that got through review once already, so the suite
   * checks that each one reached the screen.
   */
  it('attaches every glossary term to something on screen', () => {
    const sources = uiFiles().map((file) => file.source).join('\n');
    for (const key of Object.keys(en.terms)) {
      expect(
        sources.includes(`terms.${key}`),
        `strings.terms.${key} is defined but nothing uses it`,
      ).toBe(true);
    }
  });
});
