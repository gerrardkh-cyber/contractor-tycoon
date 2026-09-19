import { describe, it, expect } from 'vitest';
import {
  advance,
  buildTasks,
  data,
  expectedDurationSec,
  findTask,
  prerequisitesMet,
} from '../src/core';
import type { GameState, Project } from '../src/core';
import { awardProject, seeded } from './helpers';

const { requireProjectType } = data;

function buildFreshProject(typeId: string): Project {
  const type = requireProjectType(typeId);
  return {
    id: 'p',
    typeId,
    floors: type.floors,
    pipelineMode: type.pipelineMode,
    contractBase: type.baseContract,
    bidTier: 'fair',
    clientTrait: 'price',
    inspector: 'normal',
    awarded: type.baseContract,
    totalCost: type.baseContract * 0.85,
    startedAtSec: 0,
    deadlineAtSec: 1e9,
    tasks: buildTasks(type),
    retainage: 0,
    advanceOutstanding: 0,
    punchOpen: 0,
    punchTotalGenerated: 0,
    punchCostAccrued: 0,
    punchClearElapsedSec: 0,
    punchClearQueued: 0,
    events: { strictInspector: false, changeOrderAtSec: null, changeOrderApplied: false },
    riskyPourActive: false,
    rainDecided: false,
    stalled: false,
    stalledSec: 0,
    inspectionsPassed: 0,
    inspectionsFailed: 0,
    paidOut: 0,
    spent: 0,
  };
}

describe('floor pipeline ordering', () => {
  it('lets only the foundation start on a fresh lowrise', () => {
    const project = buildFreshProject('lowrise');
    const ready = project.tasks.filter((task) => prerequisitesMet(project, task));
    expect(ready.map((task) => [task.stageId, task.floor])).toEqual([['foundation', null]]);
  });

  it('opens structural floor 0 only once the foundation is done', () => {
    const project = buildFreshProject('lowrise');
    const structural0 = findTask(project, 'structural', 0);
    expect(structural0).toBeDefined();
    expect(prerequisitesMet(project, structural0!)).toBe(false);

    findTask(project, 'foundation', null)!.status = 'done';
    expect(prerequisitesMet(project, structural0!)).toBe(true);
  });

  it('starts mep n and structural n+1 together once structural n passes', () => {
    const project = buildFreshProject('lowrise');
    findTask(project, 'foundation', null)!.status = 'done';
    findTask(project, 'structural', 0)!.status = 'done';

    expect(prerequisitesMet(project, findTask(project, 'mep', 0)!)).toBe(true);
    expect(prerequisitesMet(project, findTask(project, 'structural', 1)!)).toBe(true);
    // Floor 2 still waits on floor 1.
    expect(prerequisitesMet(project, findTask(project, 'structural', 2)!)).toBe(false);
  });

  it('never lets mep n start before structural n has passed', () => {
    const project = buildFreshProject('lowrise');
    findTask(project, 'foundation', null)!.status = 'done';
    expect(prerequisitesMet(project, findTask(project, 'mep', 0)!)).toBe(false);
  });

  it('holds weatherproof until every floor is finished', () => {
    const project = buildFreshProject('lowrise');
    for (const task of project.tasks) {
      if (task.stageId !== 'weatherproof' && task.stageId !== 'final') task.status = 'done';
    }
    expect(prerequisitesMet(project, findTask(project, 'weatherproof', null)!)).toBe(true);

    findTask(project, 'mep', 2)!.status = 'waiting';
    expect(prerequisitesMet(project, findTask(project, 'weatherproof', null)!)).toBe(false);
  });

  it('holds final until weatherproof is done', () => {
    const project = buildFreshProject('lowrise');
    for (const task of project.tasks) {
      if (task.stageId !== 'final') task.status = 'done';
    }
    expect(prerequisitesMet(project, findTask(project, 'final', null)!)).toBe(true);

    findTask(project, 'weatherproof', null)!.status = 'waiting';
    expect(prerequisitesMet(project, findTask(project, 'final', null)!)).toBe(false);
  });
});

describe('expected duration', () => {
  it('matches the flow-shop makespan recorded in BALANCE.md', () => {
    expect(expectedDurationSec('house')).toBe(205);
    expect(expectedDurationSec('lowrise')).toBe(325);
    expect(expectedDurationSec('midrise')).toBe(625);
  });
});

describe('pipeline invariants during a live run', () => {
  function assertInvariants(state: GameState): void {
    for (const project of state.projects) {
      for (const task of project.tasks) {
        if (task.floor === null || task.status === 'waiting') continue;

        if (task.stageId === 'mep') {
          expect(findTask(project, 'structural', task.floor)?.status).toBe('done');
        }
        if (task.floor > 0) {
          expect(findTask(project, task.stageId, task.floor - 1)?.status).toBe('done');
        }
      }
    }
  }

  it('holds across a long seeded run', { timeout: 90_000 }, () => {
    for (const seed of [1, 7, 4242]) {
      const rng = seeded(seed);
      let state = awardProject(rng, 'fair', 'lowrise', { cash: 5_000_000 });
      for (let i = 0; i < 400; i += 1) {
        state = advance(state, 2, rng);
        assertInvariants(state);
      }
    }
  });
});

describe('advance purity', () => {
  it('does not mutate the state it is given', () => {
    const rng = seeded(99);
    const before = awardProject(rng, 'fair');
    const snapshot = JSON.stringify(before);
    advance(before, 600, rng);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
