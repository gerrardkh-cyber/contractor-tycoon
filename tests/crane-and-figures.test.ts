import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artFor, INSPECTOR_POSES, WORKER_POSES } from '../src/ui/art';
import { craneMastTopFor, craneTopFor, floorTopOf, geometryFor } from '../src/ui/building';
import { theme } from '../src/ui/theme';

const mast = artFor('crane-mast');
const pictured = mast !== null && artFor('crane-head') !== null && artFor('crane-jib') !== null;

/**
 * Order 011 A3: the crane climbs with the building. Its jib stands a floor
 * and a half over the highest floor in hand, on whole lengths of a pictured
 * mast, and ends a floor and a half over the top floor.
 */
describe.skipIf(!pictured)('a pictured crane climbs on whole lengths of mast', () => {
  const tile = mast ? mast.h * (theme.svg.craneMastWidth / mast.w) : 1;

  it.each([2, 4, 8, 12])('%i floors: each climb is whole lengths, a floor and a half over the floor in hand', (floors) => {
    const g = geometryFor(floors, 'midrise');
    let previous = g.groundLevel;
    for (let started = 0; started <= floors; started += 1) {
      const top = craneMastTopFor(g, started);
      const lengths = (g.groundLevel - top) / tile;
      expect(Math.abs(lengths - Math.round(lengths))).toBeLessThan(1e-6);
      const floorTop = started > 0 ? floorTopOf(g, started - 1) : g.foundationTop;
      const clearance = g.floorHeight * theme.svg.craneClearanceFloors;
      expect(floorTop - top).toBeGreaterThanOrEqual(clearance - 1e-6);
      expect(floorTop - top).toBeLessThan(clearance + tile);
      // It only ever climbs.
      expect(top).toBeLessThanOrEqual(previous);
      previous = top;
    }
    // Its full height is where it ends, over the top floor, clear of the roof.
    expect(craneMastTopFor(g, floors)).toBeCloseTo(g.mastTop, 6);
    expect(g.mastTop).toBeLessThan(g.roofTop);
  });

  it('is short for a low building and tall for an eight-storey block', () => {
    const low = geometryFor(2, 'lowrise');
    const block = geometryFor(8, 'midrise');
    expect(block.groundLevel - block.mastTop).toBeGreaterThan(2 * (low.groundLevel - low.mastTop));
  });
});

/** Order 011 A2: a house has no tower crane, and the camera frames the house alone. */
describe('a house goes up without a tower crane', () => {
  it.each(['house', 'repair'])('%s', (typeId) => {
    const g = geometryFor(1, typeId);
    expect(g.crane).toBe(false);
    expect(g.frameRight).toBeCloseTo(g.bodyRight + theme.svg.foundationOverhang, 6);
    expect(craneTopFor(g, 1)).toBe(g.roofTop);
  });

  it('a low-rise and a mid-rise do have one', () => {
    expect(geometryFor(3, 'lowrise').crane).toBe(true);
    expect(geometryFor(8, 'midrise').crane).toBe(true);
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
 * Order 011 A1 / decision 010-7·8: a building is as many bays of the storey
 * picture as its type calls for - house 1, low-rise 2, mid-rise the whole
 * picture - cut on column centres with both ends kept and no bay drawn
 * twice, standing on a foundation 0.4 of a floor high.
 */
describe.skipIf(columns.length < 3)('buildings are cut to their bays', () => {
  const onColumn = (x: number): boolean => x === 0 || x === 1 || columns.some((c) => Math.abs(c - x) < 1e-9);
  const whole = theme.svg.bodyRight - theme.svg.bodyLeft;
  const inner = columns.slice(1, -1);
  const first = inner[0] ?? 0;
  const lastInner = inner[inner.length - 1] ?? 1;
  const lastColumn = columns[columns.length - 1] ?? 1;

  it.each(['repair', 'house', 'lowrise', 'midrise'])('%s: cuts on column centres, both ends kept, nothing twice', (typeId) => {
    const g = geometryFor(1, typeId);
    const slices = g.slices ?? [];
    expect(slices.length).toBeGreaterThan(0);
    for (const slice of slices) {
      expect(onColumn(slice.from)).toBe(true);
      expect(onColumn(slice.to)).toBe(true);
    }
    expect(slices[0]?.from).toBe(0);
    expect(slices[slices.length - 1]?.to).toBe(1);
    // In order across the picture, never overlapping: no bay is drawn twice.
    for (let i = 1; i < slices.length; i += 1) {
      expect(slices[i]?.from ?? 0).toBeGreaterThanOrEqual(slices[i - 1]?.to ?? 1);
    }
  });

  it('a house is one bay, a low-rise two, a mid-rise the whole picture', () => {
    // One bay: the first, with the last column's outer half for its right end.
    expect(geometryFor(1, 'house').bodyWidth).toBeCloseTo((first + (1 - lastColumn)) * whole, 6);
    // Two: the first and the last.
    expect(geometryFor(3, 'lowrise').bodyWidth).toBeCloseTo((first + (1 - lastInner)) * whole, 6);
    expect(geometryFor(8, 'midrise').bodyWidth).toBeCloseTo(whole, 6);
  });

  it.each([['house', 1], ['lowrise', 3], ['midrise', 8]] as const)('%s: foundation 0.4 of a floor', (typeId, floors) => {
    const g = geometryFor(floors, typeId);
    expect(g.foundationHeight).toBeCloseTo(g.floorHeight * theme.svg.foundationFloorShare, 6);
  });

  it.each([['lowrise', 3], ['midrise', 8]] as const)('%s: crane 0.15 of the width away, head in frame', (typeId, floors) => {
    const g = geometryFor(floors, typeId);
    const mastWidth = pictured ? theme.svg.craneMastWidth : theme.svg.mastWidth;
    expect(g.craneX - mastWidth / 2 - g.bodyRight).toBeCloseTo(g.bodyWidth * theme.svg.craneGapShare, 6);
    expect(g.frameRight).toBeGreaterThan(g.craneX);
    expect(g.frameRight).toBeLessThanOrEqual(g.width);
  });
});
