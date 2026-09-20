// The motion budget.
//
// Animation is a courtesy, not a feature: it is switched off entirely when the
// player has asked for reduced motion, when theme.motion.motionEnabled is
// false, or when the frame rate says the device cannot afford it. Everything
// that animates asks here first, and the stylesheet mirrors the answer through
// a class on <html> so CSS-only decoration stops at the same moment.

import { theme } from './theme';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** Set on <html> when motion is off, so the stylesheet can shut animation down. */
export const NO_MOTION_CLASS = 'no-motion';
/** Set on <html> when the frame guard has stripped the heavier decoration. */
export const DEGRADED_CLASS = 'degraded';

let prefersReduced = false;
let degraded = false;
let slowRun = 0;
let fastRun = 0;
let listeners: (() => void)[] = [];

function mediaQuery(): MediaQueryList | null {
  try {
    return globalThis.matchMedia?.(REDUCED_QUERY) ?? null;
  } catch {
    return null;
  }
}

/** Reads the player's setting and starts watching it for changes. */
export function initMotion(): void {
  const query = mediaQuery();
  if (query) {
    prefersReduced = query.matches;
    const onChange = (): void => {
      prefersReduced = query.matches;
      syncClasses();
      for (const listener of listeners) listener();
    };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
  }
  syncClasses();
}

export function onMotionChange(listener: () => void): void {
  listeners = [...listeners, listener];
}

/** True when a decorative animation may run at all. */
export function motionAllowed(): boolean {
  return theme.motion.motionEnabled && !prefersReduced && !degraded;
}

/** True when the heavier, continuous decoration (crane, rain) may run. */
export function richMotionAllowed(): boolean {
  return motionAllowed();
}

export function isDegraded(): boolean {
  return degraded;
}

export function prefersReducedMotion(): boolean {
  return prefersReduced;
}

/**
 * Feeds one frame's cost to the guard. A sustained run of slow frames drops
 * decoration; a sustained run of healthy ones brings it back, with the two
 * thresholds far enough apart that it cannot flap.
 */
export function noteFrame(frameMs: number): void {
  const { slowFrameMs, budgetFrames, recoverFrames } = theme.motion;

  if (frameMs > slowFrameMs) {
    slowRun += 1;
    fastRun = 0;
    if (!degraded && slowRun >= budgetFrames) {
      degraded = true;
      syncClasses();
    }
    return;
  }

  fastRun += 1;
  slowRun = 0;
  if (degraded && fastRun >= recoverFrames) {
    degraded = false;
    syncClasses();
  }
}

function syncClasses(): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.classList.toggle(NO_MOTION_CLASS, !motionAllowed());
  root.classList.toggle(DEGRADED_CLASS, degraded);
}

/** Test seam: forgets what the guard has learned. */
export function resetMotionGuard(): void {
  degraded = false;
  slowRun = 0;
  fastRun = 0;
  syncClasses();
}

/**
 * A number on its way to another number.
 *
 * Cash, trust and net worth never snap to a new value: they run to it over
 * `durationMs`. With motion off the tween resolves immediately, so the figure
 * is still correct — it simply arrives without the journey.
 */
export class NumberTween {
  private current: number;
  private from: number;
  private target: number;
  private startedAt = 0;
  private readonly durationMs: number;

  constructor(initial: number, durationMs = theme.motion.tweenMs) {
    this.current = initial;
    this.from = initial;
    this.target = initial;
    this.durationMs = durationMs;
  }

  /** Points the tween at a new value. Restarts from wherever it currently is. */
  set(target: number, now: number): void {
    if (target === this.target) return;
    this.from = this.current;
    this.target = target;
    this.startedAt = now;
  }

  /** Jumps straight to a value, with no journey. Used on first paint. */
  reset(value: number): void {
    this.current = value;
    this.from = value;
    this.target = value;
  }

  value(now: number): number {
    if (!motionAllowed() || this.durationMs <= 0) {
      this.current = this.target;
      return this.current;
    }
    const elapsed = now - this.startedAt;
    if (elapsed >= this.durationMs) {
      this.current = this.target;
      return this.current;
    }
    const t = Math.max(0, elapsed / this.durationMs);
    this.current = this.from + (this.target - this.from) * easeOut(t);
    return this.current;
  }

  get settled(): boolean {
    return this.current === this.target;
  }
}

/** Decelerating curve: fast at first, easing into the final figure. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}
