// Order 008 §5: the guide has to survive the new layout.
//
// The flow test plays the guide against a stand-in screen, which proves the
// step machine but says nothing about where the targets actually are. This
// checks the other half: that every step has a target, that the markers it
// names exist in the UI, and that the drawers really open and close.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDrawers, DRAWER_IDS, type DrawerId } from '../src/ui/drawers';
import { TARGET_DRAWER, TARGET_SELECTOR } from '../src/ui/targets';
import { installFakeDom, FakeNode } from './fake-dom';

const ROOT = process.cwd();
const UI = join(ROOT, 'src', 'ui');

/** Every step the guide can be on, read from the controller itself. */
function targetNames(): string[] {
  const source = readFileSync(join(UI, 'tutorial.ts'), 'utf8');
  const block = source.slice(source.indexOf('export type TargetName'));
  const list = block.slice(0, block.indexOf(';'));
  return [...list.matchAll(/'([a-zA-Z]+)'/g)].map((hit) => hit[1] ?? '');
}

function uiSource(): string {
  return readdirSync(UI)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(UI, name), 'utf8'))
    .join('\n');
}

describe('every guided step has somewhere to point', () => {
  const names = targetNames();

  it('found the step targets to check', () => {
    expect(names.length).toBeGreaterThan(5);
  });

  it('gives every target a selector', () => {
    for (const name of names) {
      expect(TARGET_SELECTOR[name as keyof typeof TARGET_SELECTOR], `${name} has no selector`)
        .toBeTruthy();
    }
    expect(Object.keys(TARGET_SELECTOR).sort()).toEqual([...names].sort());
  });

  it('names markers the UI actually sets', () => {
    const source = uiSource();
    for (const [name, selector] of Object.entries(TARGET_SELECTOR)) {
      const marker = /data-guide="([^"]+)"/.exec(selector)?.[1];
      expect(marker, `${name}: ${selector} has no data-guide marker`).toBeTruthy();
      expect(
        source.includes(`'${marker}'`),
        `nothing in src/ui sets data-guide="${marker}" for ${name}`,
      ).toBe(true);
    }
  });

  it('sends the board and company steps through a drawer', () => {
    expect(TARGET_DRAWER.namedCard).toBe('bid');
    expect(TARGET_DRAWER.tierButtons).toBe('bid');
    expect(TARGET_DRAWER.subcontractors).toBe('company');
    // Everything else is out on the scene, where no drawer can hide it.
    for (const name of names) {
      if (['namedCard', 'tierButtons', 'subcontractors'].includes(name)) continue;
      expect(TARGET_DRAWER[name as keyof typeof TARGET_DRAWER], `${name} is behind a drawer`)
        .toBeUndefined();
    }
  });

  it('is what the shell uses, rather than a list of its own', () => {
    const app = readFileSync(join(UI, 'app.ts'), 'utf8');
    expect(app).toContain('TARGET_SELECTOR[what]');
    expect(app).toContain('TARGET_DRAWER[what]');
  });
});

describe('the drawers', () => {
  function withDrawers(run: (drawers: ReturnType<typeof createDrawers>, panels: FakeNode[]) => void): void {
    const dom = installFakeDom();
    const panels = DRAWER_IDS.map(() => new FakeNode('div'));
    const drawers = createDrawers({
      bid: panels[0] as unknown as HTMLElement,
      company: panels[1] as unknown as HTMLElement,
      log: panels[2] as unknown as HTMLElement,
    });
    try {
      run(drawers, panels);
    } finally {
      drawers.dispose();
      dom.restore();
    }
  }

  it('starts closed', () => {
    withDrawers((drawers, panels) => {
      expect(drawers.openId()).toBeNull();
      for (const panel of panels) expect(panel.classList.contains('is-shown')).toBe(false);
    });
  });

  it('opens one at a time', () => {
    withDrawers((drawers, panels) => {
      drawers.open('bid');
      expect(drawers.openId()).toBe('bid');
      expect(panels[0]?.classList.contains('is-shown')).toBe(true);

      drawers.open('company');
      expect(panels[0]?.classList.contains('is-shown')).toBe(false);
      expect(panels[1]?.classList.contains('is-shown')).toBe(true);
    });
  });

  it('closes on a second press of the same tab', () => {
    withDrawers((drawers) => {
      drawers.toggle('log');
      expect(drawers.openId()).toBe('log');
      drawers.toggle('log');
      expect(drawers.openId()).toBeNull();
    });
  });

  it('tells whoever is listening', () => {
    withDrawers((drawers) => {
      const seen: (DrawerId | null)[] = [];
      drawers.onChange((id) => seen.push(id));
      drawers.open('bid');
      drawers.close();
      expect(seen).toEqual(['bid', null]);
    });
  });
});
