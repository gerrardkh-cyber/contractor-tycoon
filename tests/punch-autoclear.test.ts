// Order 009 §1: a site parked at the final gate by open punch items no longer
// waits for a player who is not there.
//
// GDD 5.3: reaching `final` queues every open item. The wait is still the
// price of not clearing early - each item takes its usual time and cost - but
// the site gets to handover. Offline progress is just a long advance(), so the
// same rule carries it through a night away.

import { describe, expect, it } from 'vitest';
import {
  advance,
  data,
  findTask,
  punchItemCost,
  type GameState,
  type Project,
  type Rng,
} from '../src/core';
import { applyOffline, serialize } from '../src/save';
import { awardProject, seeded } from './helpers';

const STEP = 0.5;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const PUNCH_LEFT = 4;

/**
 * A house walked up to the moment its final gate is waiting, with four punch
 * items open and none queued - exactly the save a player leaves behind when
 * they close the tab without clearing the list.
 */
function parkedAtFinal(seed: number): { state: GameState; rng: Rng } {
  const rng = seeded(seed);
  let state = awardProject(rng, 'fair', 'house');
  for (let i = 0; i < 20000; i += 1) {
    const project = state.projects[0];
    if (!project) throw new Error(`seed ${seed}: the house finished before reaching final`);
    const final = findTask(project, 'final', null);
    if (final && (final.status === 'gate' || final.status === 'working')) {
      const parked: Project = { ...project, punchOpen: PUNCH_LEFT, punchClearQueued: 0 };
      return { state: { ...state, projects: [parked, ...state.projects.slice(1)] }, rng };
    }
    // Keep the walk honest: answer nothing, clear nothing.
    state = advance(state, STEP, rng);
  }
  throw new Error(`seed ${seed}: never reached the final stage`);
}

describe('punch items at the final gate', () => {
  it.each([3, 11, 27])('do not hold a site for ever (seed %i)', (seed) => {
    const { state, rng } = parkedAtFinal(seed);
    const before = state.company.completedProjects;

    // Long enough for the final stage and every item, short of eight hours.
    const after = advance(state, 30 * 60, rng);

    expect(after.company.completedProjects, 'the house never handed over').toBeGreaterThan(before);
  });

  it('take their usual time each, not none', () => {
    const { state, rng } = parkedAtFinal(3);
    const clearSec = data.balance.punchList.clearSec;

    // Well short of the time four items take: the gate must still be waiting.
    const early = advance(state, clearSec * (PUNCH_LEFT - 1) * 0.5, rng);
    expect(early.company.completedProjects).toBe(state.company.completedProjects);
    expect(early.projects[0]?.punchOpen ?? 0).toBeGreaterThan(0);
  });

  it('still cost what clearing them by hand costs', () => {
    let { state, rng } = parkedAtFinal(11);
    const id = state.projects[0]!.id;
    const perItem = punchItemCost(state.projects[0]!);

    // Every item the queue clears is billed at the hand-clearing rate. The
    // last one clears in the same tick the site hands over, so it is the
    // ones before it that can be watched.
    let cleared = 0;
    for (let i = 0; i < 20000; i += 1) {
      const before = state.projects.find((p) => p.id === id);
      state = advance(state, STEP, rng);
      const after = state.projects.find((p) => p.id === id);
      if (!before || !after) break;
      const dropped = before.punchOpen - after.punchOpen;
      if (dropped <= 0) continue;
      cleared += dropped;
      expect(after.punchCostAccrued - before.punchCostAccrued).toBeCloseTo(perItem * dropped, 6);
    }
    expect(cleared, 'the queue cleared nothing before handover').toBeGreaterThanOrEqual(PUNCH_LEFT - 1);
  });

  it('let an eight-hour absence end in a handover and more cash', () => {
    const { state, rng } = parkedAtFinal(27);
    const savedAt = 1_000_000;
    const loaded = applyOffline(serialize(state, rng, savedAt), savedAt + EIGHT_HOURS_MS);

    expect(loaded.summary.completed, 'welcome back: 0 handovers').toBeGreaterThanOrEqual(1);
    expect(loaded.summary.cashDelta, 'welcome back: cash +$0').toBeGreaterThan(0);
  });
});
