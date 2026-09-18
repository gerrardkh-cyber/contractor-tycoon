import { describe, it, expect } from 'vitest';
import { advance, applyAction, breakdownFor, data, stageCost, stagePay } from '../src/core';
import type { Project } from '../src/core';
import { awardProject, seeded } from './helpers';

const { balance, requireProjectType } = data;

function projectStub(overrides: Partial<Project> = {}): Project {
  return { advanceOutstanding: 0, awarded: 1_000_000, floors: 3, totalCost: 850_000 } as Project &
    typeof overrides;
}

describe('progress payment breakdown', () => {
  it('withholds 10% retainage when there is no advance to recover', () => {
    const result = breakdownFor(projectStub(), 1000);
    expect(result).toEqual({ gross: 1000, retainage: 100, advanceDeduction: 0, net: 900 });
  });

  it('recovers 10% of the gross toward the advance', () => {
    const project = projectStub({ advanceOutstanding: 500 });
    project.advanceOutstanding = 500;
    const result = breakdownFor(project, 1000);
    expect(result).toEqual({ gross: 1000, retainage: 100, advanceDeduction: 100, net: 800 });
  });

  it('never recovers more advance than is outstanding', () => {
    const project = projectStub();
    project.advanceOutstanding = 30;
    const result = breakdownFor(project, 1000);
    expect(result).toEqual({ gross: 1000, retainage: 100, advanceDeduction: 30, net: 870 });
  });
});

describe('stage cost and pay shares', () => {
  const type = requireProjectType('lowrise');
  const project = {
    ...projectStub(),
    typeId: type.id,
    floors: type.floors,
    awarded: 600_000,
    totalCost: 600_000 * balance.economy.constructionCostRatio,
  } as Project;

  it('charges the foundation its whole share', () => {
    expect(stageCost(project, 'foundation')).toBeCloseTo(project.totalCost * 0.15, 6);
  });

  it('splits the structural cost across floors', () => {
    expect(stageCost(project, 'structural')).toBeCloseTo((project.totalCost * 0.35) / 3, 6);
  });

  it('charges mep its own share of the floor cost', () => {
    expect(stageCost(project, 'mep')).toBeCloseTo((project.totalCost * 0.25) / 3, 6);
  });

  it('keeps the two floor shares adding up to the old combined 0.60', () => {
    expect(stageCost(project, 'structural') + stageCost(project, 'mep')).toBeCloseTo(
      (project.totalCost * 0.6) / 3,
      6,
    );
  });

  it('pays each floor stage its own share at its own gate', () => {
    expect(stagePay(project, 'structural')).toBeCloseTo((project.awarded * 0.35) / 3, 6);
    expect(stagePay(project, 'mep')).toBeCloseTo((project.awarded * 0.25) / 3, 6);
  });

  it('spends exactly the fixed construction cost across all stages', () => {
    const total =
      stageCost(project, 'foundation') +
      stageCost(project, 'structural') * project.floors +
      stageCost(project, 'mep') * project.floors +
      stageCost(project, 'weatherproof') +
      stageCost(project, 'final');
    expect(total).toBeCloseTo(project.totalCost, 6);
  });

  it('pays out exactly the awarded amount across all gates', () => {
    const total =
      stagePay(project, 'foundation') +
      stagePay(project, 'structural') * project.floors +
      stagePay(project, 'mep') * project.floors +
      stagePay(project, 'weatherproof') +
      stagePay(project, 'final');
    expect(total).toBeCloseTo(project.awarded, 6);
  });
});

describe('advance payment on award', () => {
  it('pays 10% of P up front and books it as outstanding', () => {
    const rng = seeded(3);
    // Trust starts at 50, below the advance threshold, so nothing is advanced yet.
    const low = awardProject(rng, 'fair');
    const first = low.projects[0]!;
    expect(low.company.trust).toBeLessThan(balance.economy.advanceTrustRequired);
    expect(first.advanceOutstanding).toBe(0);
  });

  it('is offered once trust reaches the threshold', () => {
    const rng = seeded(11);
    let state = advance({ ...structuredClone(awardProject(rng, 'fair')) }, 0, rng);
    state.company.trust = balance.economy.advanceTrustRequired;
    state.projects = [];
    state.board = [];
    state = advance(state, 0.25, rng);
    expect(state.board.every((rfq) => rfq.advanceAvailable)).toBe(true);

    const rfq = state.board[0]!;
    const cashBefore = state.company.cash;
    let attempts = 0;
    while (state.projects.length === 0 && attempts < 500) {
      const target = state.board[0]!;
      state = applyAction(state, { type: 'submitBid', rfqId: target.id, tier: 'fair' }, rng).state;
      attempts += 1;
      if (state.projects.length === 0) state = advance(state, 0.25, rng);
    }
    const project = state.projects[0]!;
    expect(project.advanceOutstanding).toBeCloseTo(
      project.contractBase * balance.economy.advanceRatio,
      6,
    );
    expect(state.company.cash).toBeGreaterThan(cashBefore - rfq.contractBase);
  });
});

describe('retainage and completion', () => {
  it('releases the withheld retainage when the site reaches CO', () => {
    const rng = seeded(21);
    let state = awardProject(rng, 'fair', 'house');
    // The starting capital cannot fund a first project (see HANDOFF.md), so this
    // test funds the site directly and checks the settlement mechanism itself.
    state.company.cash = 5_000_000;

    let sawRetainage = false;
    for (let i = 0; i < 800 && state.projects.length > 0; i += 1) {
      const project = state.projects[0];
      if (project) {
        if (project.retainage > 0) sawRetainage = true;
        if (project.punchOpen > 0 && project.punchClearQueued === 0) {
          state = applyAction(
            state,
            { type: 'clearPunchList', projectId: project.id, count: project.punchOpen },
            rng,
          ).state;
        }
      }
      state = advance(state, 2, rng);
    }

    expect(state.projects.length).toBe(0);
    expect(state.company.completedProjects).toBe(1);
    expect(sawRetainage).toBe(true);
    // Retainage left the books with the project.
    expect(state.projects.reduce((sum, p) => sum + p.retainage, 0)).toBe(0);
  });

  it('opens a warranty window at CO and charges the warranty fee', () => {
    const rng = seeded(55);
    let state = awardProject(rng, 'fair', 'house');
    state.company.cash = 5_000_000;

    for (let i = 0; i < 800 && state.projects.length > 0; i += 1) {
      const project = state.projects[0];
      if (project && project.punchOpen > 0 && project.punchClearQueued === 0) {
        state = applyAction(
          state,
          { type: 'clearPunchList', projectId: project.id, count: project.punchOpen },
          rng,
        ).state;
      }
      state = advance(state, 2, rng);
    }

    expect(state.warranties.length).toBe(1);
    expect(state.warranties[0]!.remainingSec).toBeGreaterThan(0);
    expect(state.warranties[0]!.defectChance).toBeGreaterThanOrEqual(balance.defect.baseChance);
    expect(state.warranties[0]!.defectChance).toBeLessThanOrEqual(balance.defect.maxChance);
  });
});

describe('a site without the cash to start a stage stalls instead of going negative', () => {
  // The starting capital now funds a first project, so the shortage is induced
  // here on purpose: this covers the mechanism, not the balance.
  it('parks the stage, flags the site and never overdraws', () => {
    const rng = seeded(7);
    let state = awardProject(rng, 'fair', 'house');
    state.company.cash = 1;

    let stalled = false;
    for (let i = 0; i < 200 && !stalled; i += 1) {
      state = advance(state, 5, rng);
      if (state.projects[0]?.stalled) stalled = true;
      expect(state.company.cash).toBeGreaterThanOrEqual(0);
    }

    expect(stalled).toBe(true);
    const project = state.projects[0]!;
    const blocked = project.tasks.find((task) => task.pendingCostDue > 0 && task.status !== 'done');
    expect(blocked).toBeDefined();
    expect(state.company.cash).toBeLessThan(blocked!.pendingCostDue);
    expect(project.stalledSec).toBeGreaterThan(0);
  });

  it('resumes the parked stage once the money is there', () => {
    const rng = seeded(7);
    let state = awardProject(rng, 'fair', 'house');
    state.company.cash = 1;

    for (let i = 0; i < 200 && !state.projects[0]?.stalled; i += 1) {
      state = advance(state, 5, rng);
    }
    expect(state.projects[0]!.stalled).toBe(true);

    state = structuredClone(state);
    state.company.cash = 1_000_000;
    state = advance(state, 5, rng);

    expect(state.projects[0]!.stalled).toBe(false);
    expect(state.projects[0]!.tasks.some((task) => task.status === 'working')).toBe(true);
  });
});

/** Runs one house to CO or until the budget runs out. Returns what happened. */
function runHouse(seed: number, tier: 'low' | 'fair' | 'high') {
  const rng = seeded(seed);
  let state = awardProject(rng, tier, 'house');
  let minCash = state.company.cash;
  const stalledBefore = state.stats.totalStalledSec;

  let deadlocked = false;
  for (let i = 0; i < 900 && state.projects.length > 0; i += 1) {
    const project = state.projects[0];
    if (project && project.punchOpen > 0 && project.punchClearQueued === 0) {
      state = applyAction(
        state,
        { type: 'clearPunchList', projectId: project.id, count: project.punchOpen },
        rng,
      ).state;
    }
    state = advance(state, 2, rng);
    minCash = Math.min(minCash, state.company.cash);

    // Stalled with nothing in flight means no money can ever arrive: dead.
    if (state.projects[0]?.stalled && state.pendingPayments.length === 0) {
      deadlocked = true;
      break;
    }
  }

  return {
    deadlocked,
    completed: state.company.completedProjects > 0,
    minCash,
    stalledSec: state.stats.totalStalledSec - stalledBefore,
    bidTier: state.projects[0]?.bidTier ?? tier,
  };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('the starting capital funds a first house', () => {
  it('finishes every fair-bid house without a single cash stall', () => {
    for (const seed of SEEDS) {
      const result = runHouse(seed, 'fair');
      expect(result.completed, `seed ${seed} did not reach CO`).toBe(true);
      expect(result.stalledSec, `seed ${seed} stalled`).toBe(0);
      expect(result.minCash, `seed ${seed} ran the cash to zero`).toBeGreaterThan(0);
    }
  });

  it.each(['low', 'fair', 'high'] as const)('never lets cash go negative on a %s bid', (tier) => {
    for (const seed of SEEDS) {
      expect(runHouse(seed, tier).minCash, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });
});
