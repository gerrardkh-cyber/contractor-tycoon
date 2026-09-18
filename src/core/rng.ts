// Seeded, reproducible pseudo-random source.
// Injected into advance() so tests and balance simulations replay exactly.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Serializable internal state, for save/restore. */
  getState(): number;
  setState(value: number): void;
}

/** mulberry32 - small, fast, good enough for gameplay rolls. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => s,
    setState(value: number) {
      s = value >>> 0;
    },
  };
}

/** Uniform float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** Uniform integer in [min, max], inclusive on both ends. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Picks one entry, weighted. Weights must be positive. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('weightedPick called with an empty list');
  return last;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng.next() * items.length)];
  if (item === undefined) throw new Error('pick called with an empty list');
  return item;
}
