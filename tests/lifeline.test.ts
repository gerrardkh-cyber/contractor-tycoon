import { describe, it, expect } from 'vitest';
import {
  advance,
  applyAction,
  canAffordBid,
  createInitialState,
  data,
  isLifeline,
  isLockedOut,
  minCashToBid,
  punchItemCost,
} from '../src/core';
import type { GameState } from '../src/core';
import { awardProject, seeded } from './helpers';

const { balance, requireProjectType } = data;

function brokeAndIdle(cash: number, seed = 5): GameState {
  const rng = seeded(seed);
  let state = advance(createInitialState(), 0.25, rng);
  state = { ...state, company: { ...state.company, cash } };
  return advance(state, 0.25, rng);
}

describe('the repair job', () => {
  it('is not posted while real work is affordable', () => {
    const state = advance(createInitialState(), 0.25, seeded(5));
    expect(state.company.cash).toBe(80_000);
    expect(state.board.some(isLifeline)).toBe(false);
  });

  it('appears once nothing on the board can be bid and no site is running', () => {
    const state = brokeAndIdle(0);
    expect(state.projects.length).toBe(0);
    expect(state.board.some(isLifeline)).toBe(true);
  });

  it('only ever posts one, in a slot of its own beside the board', () => {
    let state = brokeAndIdle(0);
    for (let i = 0; i < 40; i += 1) {
      state = advance(state, 30, seeded(9));
      expect(state.board.filter(isLifeline).length).toBe(1);
      // The three ordinary slots are untouched: the lifeline is the fourth.
      expect(state.board.filter((rfq) => !isLifeline(rfq)).length).toBe(
        balance.bidding.boardSlots,
      );
      expect(state.board.length).toBe(balance.bidding.boardSlots + 1);
    }
  });

  it('costs nothing to bid on and cannot be lost', () => {
    const state = brokeAndIdle(0);
    const repair = state.board.find(isLifeline)!;

    expect(repair.minCash).toBe(0);
    expect(canAffordBid(state, repair)).toBe(true);
    expect(repair.directAward).toBe(true);
    expect(repair.contractBase).toBe(requireProjectType('repair').baseContract);

    // A losing roll still wins it: this is the floor, it must not be missable.
    const result = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(1));
    expect(result.ok).toBe(true);
    expect(result.state.projects.length).toBe(1);
    expect(result.state.projects[0]!.typeId).toBe('repair');
  });

  it('charges no stage cost and pays out the whole contract', () => {
    let state = brokeAndIdle(0);
    const repair = state.board.find(isLifeline)!;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(1)).state;

    const project = state.projects[0]!;
    expect(project.totalCost * data.requireStage('repair').costShare).toBe(0);

    for (let i = 0; i < 200 && state.projects.length > 0; i += 1) {
      state = advance(state, 1, seeded(3));
      expect(state.company.cash).toBeGreaterThanOrEqual(0);
    }

    // Exempt from the warranty fee, so the full contract lands.
    expect(state.stats.repairCount).toBe(1);
    expect(state.company.cash).toBeCloseTo(project.awarded, 6);
  });

  it('is kept out of the licence count, trust and the warranty window', () => {
    let state = brokeAndIdle(0);
    const repair = state.board.find(isLifeline)!;
    const trustBefore = state.company.trust;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(1)).state;

    for (let i = 0; i < 400 && state.projects.length > 0; i += 1) state = advance(state, 1, seeded(3));

    expect(state.stats.repairCount).toBe(1);
    expect(state.company.completedProjects).toBe(0);
    expect(state.company.trust).toBe(trustBefore);
    expect(state.warranties.length).toBe(0);
    expect(state.stats.lateCompletions).toBe(0);
  });

  it('never unlocks a licence, however many are finished', () => {
    const rng = seeded(41);
    let state = brokeAndIdle(0, 41);
    const required = balance.license.unlocks[0]!.completedProjects;

    for (let i = 0; i < 4000 && state.stats.repairCount <= required; i += 1) {
      const repair = state.board.find(isLifeline);
      if (repair && state.projects.length === 0) {
        state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, rng).state;
      }
      state = advance(state, 1, rng);
      // Held broke on purpose, so the lifeline keeps coming back.
      state = { ...state, company: { ...state.company, cash: 0 } };
    }

    expect(state.stats.repairCount).toBeGreaterThan(required);
    expect(state.company.completedProjects).toBe(0);
    expect(state.company.licenseTier).toBe(1);
  });

  it('takes about the advertised minute', () => {
    let state = brokeAndIdle(0);
    const repair = state.board.find(isLifeline)!;
    const startedAt = state.elapsedSec;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(1)).state;

    for (let i = 0; i < 400 && state.projects.length > 0; i += 1) state = advance(state, 1, seeded(3));

    expect(data.requireStage('repair').baseSec).toBe(60);
    expect(state.elapsedSec - startedAt).toBeLessThan(90);
  });

  it('is withdrawn once the company can bid on real work again', () => {
    let state = brokeAndIdle(0);
    expect(state.board.some(isLifeline)).toBe(true);

    state = { ...state, company: { ...state.company, cash: 1_000_000 } };
    state = advance(state, 0.25, seeded(11));
    expect(state.board.some(isLifeline)).toBe(false);
    expect(state.board.length).toBe(balance.bidding.boardSlots);
  });

  it('is not posted while a site is still making progress', () => {
    const rng = seeded(13);
    let state = awardProject(rng, 'fair', 'house');
    state = advance(state, 0.25, rng);

    expect(state.projects[0]!.stalled).toBe(false);
    expect(state.board.some(isLifeline)).toBe(false);
  });

  it('is posted when every site is parked for lack of funds', () => {
    const rng = seeded(13);
    let state = awardProject(rng, 'fair', 'house');
    state = { ...state, company: { ...state.company, cash: 0 } };

    for (let i = 0; i < 200 && !state.projects[0]?.stalled; i += 1) {
      state = advance(state, 1, rng);
    }

    expect(state.projects[0]!.stalled).toBe(true);
    expect(state.board.some(isLifeline)).toBe(true);
  });

  it('can be taken on even while a stalled site holds the only slot', () => {
    const rng = seeded(13);
    let state = awardProject(rng, 'fair', 'house');
    state = { ...state, company: { ...state.company, cash: 0 } };

    for (let i = 0; i < 200 && !state.board.some(isLifeline); i += 1) {
      state = advance(state, 1, rng);
    }

    expect(state.company.siteSlots).toBe(1);
    expect(state.projects.length).toBe(1);

    const repair = state.board.find(isLifeline)!;
    const result = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, rng);

    // Lifeline work does not occupy a site slot.
    expect(result.ok).toBe(true);
    expect(result.state.projects.length).toBe(2);
  });

  it('never appears in the random RFQ rotation', () => {
    let state = advance(createInitialState(), 0.25, seeded(17));
    state = { ...state, company: { ...state.company, cash: 10_000_000 } };
    for (let i = 0; i < 60; i += 1) {
      state = advance(state, 95, seeded(17 + i));
      expect(state.board.some(isLifeline)).toBe(false);
    }
  });
});

describe('lock-out cannot happen', () => {
  it('reports zero locked-out time even from an empty account', () => {
    let state = brokeAndIdle(0, 21);
    expect(isLockedOut(state)).toBe(false);

    for (let i = 0; i < 200; i += 1) {
      state = advance(state, 10, seeded(21));
      expect(isLockedOut(state)).toBe(false);
    }
    expect(state.stats.lockedOutSec).toBe(0);
  });

  it('a broke idle company can repair its way back to real work', () => {
    const rng = seeded(29);
    let state = brokeAndIdle(0, 29);
    const houseEntry = minCashToBid('house', requireProjectType('house').baseContract);

    for (let i = 0; i < 2000 && state.company.cash < houseEntry; i += 1) {
      const repair = state.board.find(isLifeline);
      if (repair && state.projects.length === 0) {
        state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, rng).state;
      }
      state = advance(state, 1, rng);
      expect(isLockedOut(state)).toBe(false);
    }

    // Back above the entry price for ordinary work, with no dead time on the clock.
    expect(state.company.cash).toBeGreaterThanOrEqual(houseEntry);
    expect(state.stats.lockedOutSec).toBe(0);
    expect(state.stats.repairCount).toBeGreaterThan(0);
  });

});

describe('punch work is billed to the job, not to cash', () => {
  it('clears punch items with no cash on hand and no stall', () => {
    const rng = seeded(31);
    let state = awardProject(rng, 'fair', 'house');

    for (let i = 0; i < 600 && (state.projects[0]?.punchOpen ?? 0) === 0; i += 1) {
      state = advance(state, 1, rng);
    }
    const open = state.projects[0]!.punchOpen;
    expect(open).toBeGreaterThan(0);

    const broke = { ...state, company: { ...state.company, cash: 0 } };
    const queued = applyAction(
      broke,
      { type: 'clearPunchList', projectId: broke.projects[0]!.id, count: open },
      rng,
    ).state;

    let next = queued;
    for (let i = 0; i < 200 && next.projects[0] && next.projects[0].punchOpen > 0; i += 1) {
      next = advance(next, 1, rng);
    }

    const project = next.projects[0]!;
    expect(project.punchOpen).toBe(0);
    expect(project.stalled).toBe(false);
    expect(next.company.cash).toBe(0);
    expect(project.punchCostAccrued).toBeCloseTo(open * punchItemCost(project), 6);
  });

  it('settles the punch bill out of retainage at CO', () => {
    const rng = seeded(37);
    let state = awardProject(rng, 'fair', 'house');
    state.company.cash = 5_000_000;

    let accrued = 0;
    let retainageAtPeak = 0;
    for (let i = 0; i < 800 && state.projects.length > 0; i += 1) {
      const project = state.projects[0];
      if (project) {
        accrued = project.punchCostAccrued;
        retainageAtPeak = Math.max(retainageAtPeak, project.retainage);
        if (project.punchOpen > 0 && project.punchClearQueued === 0) {
          state = applyAction(
            state,
            { type: 'clearPunchList', projectId: project.id, count: project.punchOpen },
            rng,
          ).state;
        }
      }
      const cashBefore = state.company.cash;
      state = advance(state, 1, rng);
      const after = state.projects[0];
      // Clearing punch never moves cash while the job runs.
      if (after && after.punchCostAccrued > accrued) {
        expect(state.company.cash).toBe(cashBefore);
      }
    }

    expect(state.company.completedProjects).toBe(1);
    expect(accrued).toBeGreaterThan(0);
    expect(accrued).toBeLessThan(retainageAtPeak);
  });
});
