import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artFor, INSPECTOR_POSES, WORKER_POSES } from '../src/ui/art';
import { geometryFor } from '../src/ui/building';
import { theme } from '../src/ui/theme';

const mast = artFor('crane-mast');
const pictured = mast !== null && artFor('crane-head') !== null && artFor('crane-jib') !== null;

/**
 * Order 010 §2: a pictured crane is a head on whole lengths of mast, as many
 * as the planned building needs - a house gets a short one, a block a tall one.
 */
describe.skipIf(!pictured)('a pictured crane stands on whole lengths of mast', () => {
  const tile = mast ? mast.h * (theme.svg.craneMastWidth / mast.w) : 1;

  it.each([1, 2, 4, 8, 12])('%i floor(s): whole lengths, clear of the roof', (floors) => {
    const g = geometryFor(floors);
    const lengths = (g.groundLevel - g.mastTop) / tile;
    expect(Math.abs(lengths - Math.round(lengths))).toBeLessThan(1e-6);
    expect(g.roofTop - g.mastTop).toBeGreaterThanOrEqual(theme.svg.craneArtClearance - 1e-6);
    // ...and no more than one length over what it needs.
    expect(g.roofTop - g.mastTop).toBeLessThan(theme.svg.craneArtClearance + tile);
  });

  it('is short for a house and tall for an eight-storey block', () => {
    const house = geometryFor(1);
    const block = geometryFor(8);
    expect(block.groundLevel - block.mastTop).toBeGreaterThan(2 * (house.groundLevel - house.mastTop));
  });
});

/** Order 010 §3: every pose has a state in the stylesheet that shows it. */
describe('every pictured pose is shown by some state', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', 'style.ts'), 'utf8');
  it.each([...WORKER_POSES, ...INSPECTOR_POSES])('%s', (piece) => {
    const pose = piece.slice(piece.indexOf('-') + 1);
    expect(css).toMatch(new RegExp(`\\.pose-${pose}\\{[^}]*(opacity:1|animation:)`));
  });
});
