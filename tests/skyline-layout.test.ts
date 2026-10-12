import { describe, it, expect } from 'vitest';
import { layoutSkyline } from '../src/ui/skyline';

/** Order 011 §4: finished buildings fill free spots from the left, overlapping as little as they can. */
describe('the company skyline layout', () => {
  it('fills from the left, oldest first, with a gap between', () => {
    expect(layoutSkyline([10, 20, 10], [], 200, 2)).toEqual([2, 14, 36]);
  });

  it('keeps clear of the live sites', () => {
    const lefts = layoutSkyline([30, 30], [{ left: 20, right: 80 }], 200, 2);
    expect(lefts).toEqual([82, 114]);
  });

  it('uses a free spot before a site when one is wide enough', () => {
    const lefts = layoutSkyline([10, 30], [{ left: 20, right: 80 }], 200, 2);
    expect(lefts).toEqual([2, 82]);
  });

  it('overlaps as little as it can once the row is full', () => {
    const lefts = layoutSkyline([50, 50, 50], [], 110, 2);
    expect(lefts.slice(0, 2)).toEqual([2, 54]);
    // The third cannot fit clear: it goes where it runs into the others least.
    const into = (left: number): number =>
      [2, 54].reduce((sum, other) => sum + Math.max(0, Math.min(left + 50, other + 50) - Math.max(left, other)), 0);
    let least = Number.POSITIVE_INFINITY;
    for (let left = 2; left <= 58; left += 1) least = Math.min(least, into(left));
    expect(into(lefts[2] ?? 0)).toBeLessThanOrEqual(least + 2);
  });

  it('stays inside the row', () => {
    for (const left of layoutSkyline([40, 40, 40, 40], [{ left: 0, right: 60 }], 150, 2)) {
      expect(left).toBeGreaterThanOrEqual(2);
      expect(left + 40).toBeLessThanOrEqual(148 + 1e-6);
    }
  });
});
