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
    let state = advance(createInitialState(), 0.25, seeded(5));
    state = { ...state, company: { ...state.company, cash: 10_000_000 } };
    state = advance(state, 0.25, seeded(5));

    expect(state.board.some((rfq) => canAffordBid(state, rfq) && !isLifeline(rfq))).toBe(true);
    expect(state.board.some(isLifeline)).toBe(false);
  });

  it('is never needed at the start of a new game', () => {
    // The scripted opening RFQ is a house the starting capital can always fund,
    // so a new game never opens on the repair job.
    for (const seed of [1, 5, 9, 13, 21]) {
      const state = advance(createInitialState(), 0.25, seeded(seed));
      const affordable = state.board.filter((rfq) => !isLifeline(rfq) && canAffordBid(state, rfq));
      expect(affordable.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(state.board.some(isLifeline), `seed ${seed}`).toBe(false);
    }
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
    const houseEntry = minCashToBid('house');

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

describe('the lifeline cooldown', () => {
  it('is configured at fifteen seconds', () => {
    expect(balance.lifeline.cooldownSec).toBe(15);
  });

  it('starts when a repair closes and holds the next one back', () => {
    let state = brokeAndIdle(0, 71);
    const repair = state.board.find(isLifeline)!;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(71)).state;

    for (let i = 0; i < 300 && state.projects.length > 0; i += 1) state = advance(state, 1, seeded(71));
    expect(state.stats.repairCount).toBe(1);
    expect(state.lifelineCooldownRemainingSec).toBeGreaterThan(0);
    expect(state.board.some(isLifeline)).toBe(false);
  });

  it('posts the next repair once the cooldown runs out', () => {
    let state = brokeAndIdle(0, 73);
    const repair = state.board.find(isLifeline)!;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(73)).state;
    for (let i = 0; i < 300 && state.projects.length > 0; i += 1) state = advance(state, 1, seeded(73));

    // Broke again, so the condition still holds: only the cooldown is in the way.
    state = { ...state, company: { ...state.company, cash: 0 } };
    state = advance(state, balance.lifeline.cooldownSec + 1, seeded(73));

    expect(state.lifelineCooldownRemainingSec).toBe(0);
    expect(state.board.some(isLifeline)).toBe(true);
  });

  it('counts the cooldown as waiting, not as being locked out', () => {
    let state = brokeAndIdle(0, 79);
    const repair = state.board.find(isLifeline)!;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(79)).state;

    for (let i = 0; i < 400; i += 1) {
      const next = state.board.find(isLifeline);
      if (next && state.projects.length === 0) {
        state = applyAction(state, { type: 'submitBid', rfqId: next.id, tier: 'fair' }, seeded(79)).state;
      }
      state = advance(state, 1, seeded(79));
      // Held broke, so only the cooldown ever stands between jobs.
      state = { ...state, company: { ...state.company, cash: 0 } };
      expect(isLockedOut(state)).toBe(false);
    }
    expect(state.stats.lockedOutSec).toBe(0);
    expect(state.stats.repairCount).toBeGreaterThan(1);
  });

  it('pays the reduced contract', () => {
    let state = brokeAndIdle(0, 83);
    const repair = state.board.find(isLifeline)!;
    expect(repair.contractBase).toBe(3_000);

    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, seeded(83)).state;
    for (let i = 0; i < 300 && state.projects.length > 0; i += 1) state = advance(state, 1, seeded(83));

    expect(state.company.cash).toBeCloseTo(3_000, 6);
  });
});

describe('punch work is priced per floor', () => {
  it('charges P divided by the floor count', () => {
    for (const typeId of ['house', 'lowrise', 'midrise']) {
      const type = data.requireProjectType(typeId);
      const project = {
        contractBase: type.baseContract,
        floors: type.floors,
      } as Parameters<typeof punchItemCost>[0];

      expect(punchItemCost(project), typeId).toBeCloseTo(
        (type.baseContract / type.floors) * balance.punchList.costRatio,
        6,
      );
    }
  });

  it('leaves a single-floor house where it was', () => {
    const house = data.requireProjectType('house');
    const project = { contractBase: house.baseContract, floors: 1 } as Parameters<
      typeof punchItemCost
    >[0];
    expect(punchItemCost(project)).toBeCloseTo(house.baseContract * 0.003, 6);
  });

  it('cuts a midrise item to an eighth', () => {
    const midrise = data.requireProjectType('midrise');
    const perContract = midrise.baseContract * balance.punchList.costRatio;
    const project = { contractBase: midrise.baseContract, floors: midrise.floors } as Parameters<
      typeof punchItemCost
    >[0];
    expect(punchItemCost(project)).toBeCloseTo(perContract / 8, 6);
  });

  it('keeps total punch cost roughly flat across project sizes', () => {
    // minors scale with gate count, which scales with floors; the per-floor
    // price cancels that out so punch work stays a similar share of any job.
    const share = (typeId: string, inspectorId: string): number => {
      const type = data.requireProjectType(typeId);
      const inspector = balance.inspectors.find((entry) => entry.id === inspectorId)!;
      const gates = type.stages.reduce((sum, stageId) => {
        const stage = data.requireStage(stageId);
        return sum + stage.gates.length * (stage.perFloor ? type.floors : 1);
      }, 0);
      const minors = ((inspector.minorMin + inspector.minorMax) / 2) * gates;
      return (minors * (type.baseContract / type.floors) * balance.punchList.costRatio) /
        type.baseContract;
    };

    for (const inspectorId of ['lenient', 'normal', 'strict']) {
      const house = share('house', inspectorId);
      const midrise = share('midrise', inspectorId);
      // Before this change the midrise share was 3.3x the house share.
      expect(midrise, inspectorId).toBeLessThan(house);
    }
    expect(share('midrise', 'strict')).toBeCloseTo(0.03375, 5);
  });
});
