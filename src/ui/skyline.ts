// Order 011 §4: where the company's finished buildings stand behind the sites.
//
// Pure layout, no DOM: given how wide each building is, where the live sites
// stand and how much room there is, it says where each building goes. The
// oldest is placed first, each at the leftmost spot that keeps it clear of
// the sites and of the buildings already placed; when no such spot is left,
// at the spot where it overlaps least.

/** A stretch across the row, in pixels from its left edge. */
export interface Span {
  left: number;
  right: number;
}

/** How far a stretch at `left` and `width` wide runs into the ones taken. */
function overlap(left: number, width: number, taken: readonly Span[]): number {
  let total = 0;
  for (const span of taken) {
    total += Math.max(0, Math.min(left + width, span.right) - Math.max(left, span.left));
  }
  return total;
}

/**
 * Places buildings of the given widths, oldest first, and returns each one's
 * left edge. `obstacles` are the live sites; `room` is the width of the row;
 * `gap` is kept between neighbours and from the row's ends.
 */
export function layoutSkyline(
  widths: readonly number[],
  obstacles: readonly Span[],
  room: number,
  gap: number,
): number[] {
  const taken: Span[] = obstacles.map((span) => ({ ...span }));
  const lefts: number[] = [];
  for (const width of widths) {
    const lowest = gap;
    const highest = Math.max(lowest, room - gap - width);
    const candidates = [lowest, highest];
    for (const span of taken) candidates.push(span.right + gap, span.left - gap - width);
    const sorted = [...new Set(candidates.map((x) => Math.min(highest, Math.max(lowest, x))))].sort((a, b) => a - b);

    let best = lowest;
    let least = Number.POSITIVE_INFINITY;
    for (const left of sorted) {
      // Gaps count as part of a building's footprint, so neighbours never touch.
      const cost = overlap(left - gap / 2, width + gap, taken);
      if (cost < least - 1e-6) {
        least = cost;
        best = left;
        if (cost <= 1e-6) break;
      }
    }
    lefts.push(best);
    taken.push({ left: best, right: best + width });
  }
  return lefts;
}
