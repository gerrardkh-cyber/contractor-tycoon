// Order 007: the guided first job, walked end to end.
//
// The guide is a state machine wired to a live game, so the only honest test
// of it is to play one. GuideWalk is app.ts's loop with the screen removed; it
// records which step the player was on, whether anything was actually lit, and
// what the game was doing at the time.
//
// The four seeds below cover the matrix that matters: rain and punch work are
// both chance, and the guide has to come out in the same order whether they
// happen or not. They were picked by walking seeds 1-120 and are named for
// what they produce.

import { describe, expect, it, vi } from 'vitest';
import { GuideWalk } from './guide-walk';
import { markTutorialSeen, tutorialSeen, createTutorial } from '../src/ui/tutorial';
import { GUIDE_TOAST_SELECTOR, Toasts } from '../src/ui/overlays';
import { installFakeDom } from './fake-dom';
import type { StepId } from '../src/ui/tutorial';

/** Long enough for a first job and the two steps after it. */
const BUDGET_SEC = 1200;

/** The steps every first job must teach, in this order. */
const SPINE: StepId[] = ['t1', 't2', 't2cash', 't3', 't6', 't7', 't8', 'done'];

interface Case {
  seed: number;
  rain: boolean;
  punch: boolean;
}

const CASES: Case[] = [
  { seed: 2, rain: true, punch: true },
  { seed: 1, rain: false, punch: true },
  { seed: 18, rain: true, punch: false },
  { seed: 116, rain: false, punch: false },
];

function walk(seed: number): GuideWalk {
  const run = new GuideWalk(seed);
  run.run(BUDGET_SEC);
  return run;
}

/**
 * One finished walk, as plain facts. The walk owns the stand-in DOM while it
 * runs, so it is taken down before any assertion looks at it.
 */
interface Played {
  taught: StepId[];
  countOf(step: StepId): number;
  shown: Set<StepId>;
  rained: boolean;
  punched: boolean;
  completedAtSec: number | null;
  doneAtSec: number | null;
  endedBeforeHandover: boolean;
  skipAlwaysVisible: boolean;
  active: boolean;
  guideClasses: string[];
  seen: boolean;
}

function play(seed: number): Played {
  const run = walk(seed);
  const counts = new Map<StepId, number>();
  for (const step of run.steps) counts.set(step, (counts.get(step) ?? 0) + 1);
  const played: Played = {
    taught: run.taught(),
    countOf: (step) => counts.get(step) ?? 0,
    shown: run.shown,
    rained: run.rained,
    punched: run.punched,
    completedAtSec: run.completedAtSec,
    doneAtSec: run.doneAtSec,
    endedBeforeHandover: run.endedBeforeHandover,
    skipAlwaysVisible: run.skipAlwaysVisible,
    active: run.tutorial.active(),
    guideClasses: run.guideClasses(),
    seen: tutorialSeen(),
  };
  run.dispose();
  return played;
}

describe.each(CASES)('a guided first job (seed $seed)', ({ seed, rain, punch }) => {
  const run = play(seed);
  const taught = run.taught;

  it('produced the chance events this seed was chosen for', () => {
    expect({ rain: run.rained, punch: run.punched }).toEqual({ rain, punch });
  });

  it('taught every step, in order', () => {
    expect(taught.filter((step) => step !== 't4' && step !== 't5')).toEqual(SPINE);
  });

  it('taught each step exactly once', () => {
    for (const step of SPINE) expect(run.countOf(step), `${step} count`).toBe(1);
    expect(run.countOf('t4'), 't4 count').toBe(rain ? 1 : 0);
    expect(run.countOf('t5'), 't5 count').toBe(punch ? 1 : 0);
  });

  it('lit something on every step it taught', () => {
    const unlit = taught.filter((step) => step !== 'done' && !run.shown.has(step));
    expect(unlit, 'steps whose caption never appeared').toEqual([]);
  });

  it('ran to the handover rather than ending early', () => {
    expect(run.completedAtSec, 'the first job never completed').not.toBeNull();
    expect(run.endedBeforeHandover, 'the guide ended before the handover').toBe(false);
    expect(run.doneAtSec).not.toBeNull();
  });

  it('kept a way out on screen the whole time', () => {
    expect(run.skipAlwaysVisible).toBe(true);
  });

  it('let the panels go when it finished', () => {
    expect(run.active).toBe(false);
    expect(run.guideClasses).toEqual([]);
    expect(run.seen, 'the guide was not remembered as done').toBe(true);
  });
});

describe('leaving the guide', () => {
  it('releases everything the moment the player skips', () => {
    const run = new GuideWalk(2);
    run.runUntil((w) => w.tutorial.step() === 'watch', BUDGET_SEC);
    expect(run.tutorial.step()).toBe('watch');
    expect(run.guideClasses().length).toBeGreaterThan(0);

    run.pressSkip();

    expect(run.tutorial.step()).toBe('done');
    expect(run.tutorial.active()).toBe(false);
    expect(run.guideClasses()).toEqual([]);
    expect(tutorialSeen()).toBe(true);
    run.dispose();
  });

  it('does not come back after a skip, even for a new company', () => {
    const run = new GuideWalk(2);
    run.runUntil((w) => w.tutorial.step() === 'watch', BUDGET_SEC);
    run.pressSkip();
    const dom = run.dom;

    // A brand new company, with the flag the skip left behind.
    const second = createTutorial({ find: () => null, refresh: () => undefined }, true);
    expect(second.step()).toBe('done');
    expect(second.active()).toBe(false);
    expect(dom.root.getAttribute('class') ?? '').not.toContain('guide-on');
    second.dispose();
    run.dispose();
  });

  it('does not come back after it has run to the end', () => {
    expect(play(116).seen).toBe(true);

    const dom = installFakeDom();
    dom.storage.set('contractor-tycoon:guide', 'done');
    const again = createTutorial({ find: () => null, refresh: () => undefined }, true);
    expect(again.step()).toBe('done');
    expect(again.active()).toBe(false);
    again.dispose();
    dom.restore();
  });

  it('offers itself again once Settings clears the flag', () => {
    const dom = installFakeDom();
    dom.storage.set('contractor-tycoon:guide', 'done');
    markTutorialSeen(false);
    const again = createTutorial({ find: () => null, refresh: () => undefined }, true);
    expect(again.step()).toBe('t1');
    expect(again.active()).toBe(true);
    again.dispose();
    dom.restore();
  });
});

describe('the inspection toast', () => {
  // GDD 14.1: T3 teaches the inspection result. Any other toast that happens
  // to be up - rain stopping work, a lost bid - is not its business.
  it('is the only toast the guide is allowed to point at', () => {
    vi.useFakeTimers();
    const dom = installFakeDom();
    const toasts = new Toasts(dom.body as unknown as HTMLElement);

    toasts.show({ text: 'Footings passed', tone: 'good', kind: 'inspection' });
    toasts.show({ text: 'Rain stopped work', tone: 'info' });

    const host = dom.body.children[0];
    const [inspection, other] = host!.children;
    expect(inspection!.matches(GUIDE_TOAST_SELECTOR)).toBe(true);
    expect(other!.matches(GUIDE_TOAST_SELECTOR)).toBe(false);

    dom.restore();
    vi.useRealTimers();
  });

  it('does not let another toast start T3 before the first inspection', () => {
    const run = new GuideWalk(2);
    run.runUntil((w) => w.tutorial.step() === 'watch', BUDGET_SEC);
    expect(run.tutorial.step()).toBe('watch');
    expect(run.inspections, 'nothing has been inspected yet').toBe(0);

    // A toast that is not an inspection result, up for the next half minute.
    run.raiseToast('rain', 30_000);
    expect(run.onScreen('toast'), 'the guide can see a toast it should not').toBe(false);

    run.runUntil((w) => w.inspections > 0, 20);
    expect(run.inspections, 'the seed inspected sooner than this test assumes').toBe(0);
    expect(run.tutorial.step(), 'the guide left the resting state').toBe('watch');
    expect(run.countOf('t3'), 't3 was taught with no inspection to teach').toBe(0);

    // And it still teaches T3 once the real thing arrives.
    run.run(BUDGET_SEC);
    expect(run.countOf('t3')).toBe(1);
    expect(run.shown.has('t3'), 'T3 never lit anything').toBe(true);
    run.dispose();
  });
});
