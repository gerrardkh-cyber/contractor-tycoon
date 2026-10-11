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

  it.each([1, 2, 4, 8, 12])('%i floor(s): whole lengths, a floor and a half over the roof', (floors) => {
    const g = geometryFor(floors);
    const lengths = (g.groundLevel - g.mastTop) / tile;
    const clearance = g.floorHeight * theme.svg.craneClearanceFloors;
    expect(Math.abs(lengths - Math.round(lengths))).toBeLessThan(1e-6);
    // Decision 010-1: at least a floor and a half over the planned roof...
    expect(g.roofTop - g.mastTop).toBeGreaterThanOrEqual(clearance - 1e-6);
    // ...and no more than one length over that.
    expect(g.roofTop - g.mastTop).toBeLessThan(clearance + tile);
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

const storey = artFor('floor-complete');
const columns = storey?.columns ?? [];

/**
 * Decision 010-7/8: a building is as many bays of the storey picture as its
 * type calls for, cut on column centres, standing on a foundation 0.4 of a
 * floor high; the crane stands beside it at 0.15 of its width.
 */
describe.skipIf(columns.length < 3)('buildings are cut to their bays', () => {
  const centres = columns.slice(1, -1);
  const onColumn = (x: number): boolean => x === 0 || x === 1 || centres.some((c) => Math.abs(c - x) < 1e-9);
  // The picture's own bays, as fractions across it.
  const edges = [0, ...centres, 1];
  const bays = edges.slice(1).map((to, i) => to - (edges[i] ?? 0));

  it.each(['repair', 'house', 'lowrise', 'midrise'])('%s: every cut falls on a column centre', (typeId) => {
    const g = geometryFor(1, typeId);
    expect(g.slices).not.toBeNull();
    for (const slice of g.slices ?? []) {
      expect(onColumn(slice.from)).toBe(true);
      expect(onColumn(slice.to)).toBe(true);
    }
    // Both ends of the building are the picture's own ends.
    expect(g.slices?.[0]?.from).toBe(0);
    expect(g.slices?.[(g.slices?.length ?? 1) - 1]?.to).toBe(1);
  });

  it('a house is two bays, a low-rise four, a mid-rise the whole picture', () => {
    const whole = theme.svg.bodyRight - theme.svg.bodyLeft;
    expect(geometryFor(1, 'midrise').bodyWidth).toBeCloseTo(whole, 6);
    const first = bays[0] ?? 0;
    const last = bays[bays.length - 1] ?? 0;
    // Two: the first and the last, so both ends are the picture's own.
    expect(geometryFor(1, 'house').bodyWidth).toBeCloseTo((first + last) * whole, 6);
    // Four, from a picture of three: the middle bay twice.
    expect(bays).toHaveLength(3);
    expect(geometryFor(1, 'lowrise').bodyWidth).toBeCloseTo((first + 2 * (bays[1] ?? 0) + last) * whole, 6);
  });

  it.each(['house', 'lowrise', 'midrise'])('%s: foundation 0.4 of a floor, crane 0.15 of the width away', (typeId) => {
    const g = geometryFor(3, typeId);
    expect(g.foundationHeight).toBeCloseTo(g.floorHeight * theme.svg.foundationFloorShare, 6);
    const mast = pictured ? theme.svg.craneMastWidth : theme.svg.mastWidth;
    expect(g.craneX - mast / 2 - g.bodyRight).toBeCloseTo(g.bodyWidth * theme.svg.craneGapShare, 6);
    // The crane head is inside what the camera frames.
    expect(g.frameRight).toBeGreaterThan(g.craneX);
    expect(g.frameRight).toBeLessThanOrEqual(g.width);
  });
});
