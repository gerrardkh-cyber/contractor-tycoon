import { describe, it, expect } from 'vitest';
import {
  advance,
  applyAction,
  canAffordBid,
  chargeCash,
  createInitialState,
  creditCash,
  data,
  isLifeline,
  isLockedOut,
} from '../src/core';
import type { GameState } from '../src/core';
import { awardProject, seeded } from './helpers';

const { balance } = data;

describe('cash never goes below zero', () => {
  it('chargeCash takes what it can and books the rest as debt', () => {
    const state = createInitialState();
    state.company.cash = 1_000;

    expect(chargeCash(state, 400)).toBe(0);
    expect(state.company.cash).toBe(600);
    expect(state.company.debt).toBe(0);

    expect(chargeCash(state, 1_000)).toBeCloseTo(400, 6);
    expect(state.company.cash).toBe(0);
    expect(state.company.debt).toBeCloseTo(400, 6);
  });

  it('creditCash sweeps the configured share into debt first', () => {
    const state = createInitialState();
    state.company.cash = 0;
    state.company.debt = 10_000;

    creditCash(state, 1_000);
    const share = balance.debt.repaymentShare;
    expect(state.company.debt).toBeCloseTo(10_000 - 1_000 * share, 6);
    expect(state.company.cash).toBeCloseTo(1_000 * (1 - share), 6);
  });

  it('stops sweeping once the debt is gone', () => {
    const state = createInitialState();
    state.company.cash = 0;
    state.company.debt = 100;

    creditCash(state, 10_000);
    expect(state.company.debt).toBe(0);
    expect(state.company.cash).toBeCloseTo(9_900, 6);
  });

  // Six long integration runs; it needs more than the suite default.
  it('holds across a long run at every bid tier', { timeout: 90_000 }, () => {
    for (const tier of ['low', 'fair', 'high'] as const) {
      for (const seed of [3, 29]) {
        const rng = seeded(seed);
        let state = awardProject(rng, tier, 'house');

        for (let i = 0; i < 240 && state.elapsedSec < 1_800; i += 1) {
          const project = state.projects[0];
          if (project && project.punchOpen > 0 && project.punchClearQueued === 0) {
            state = applyAction(
              state,
              { type: 'clearPunchList', projectId: project.id, count: project.punchOpen },
              rng,
            ).state;
          }
          const lifeline = state.board.find(isLifeline);
          if (lifeline) {
            state = applyAction(
              state,
              { type: 'submitBid', rfqId: lifeline.id, tier: 'fair' },
              rng,
            ).state;
          }
          const open = state.board.find((rfq) => !isLifeline(rfq) && canAffordBid(state, rfq));
          if (open) {
            state = applyAction(state, { type: 'submitBid', rfqId: open.id, tier }, rng).state;
          }

          state = advance(state, 5, rng);

          expect(state.company.cash, `${tier}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(state.company.debt, `${tier}/${seed}`).toBeGreaterThanOrEqual(0);
        }

        // Bankruptcy is now unreachable by construction.
        expect(state.stats.bankruptAtSec, `${tier}/${seed}`).toBeNull();
      }
    }
  });

  it('survives abandoning a site that owes more advance than it holds in cash', () => {
    const rng = seeded(47);
    let state = awardProject(rng, 'fair', 'house');
    for (let i = 0; i < 200 && state.projects[0]!.retainage === 0; i += 1) {
      state = advance(state, 2, rng);
    }

    const draft: GameState = structuredClone(state);
    draft.company.cash = 100;
    draft.projects[0]!.advanceOutstanding = 90_000;

    let next = applyAction(
      draft,
      { type: 'abandonProject', projectId: draft.projects[0]!.id },
      rng,
    ).state;

    expect(next.company.cash).toBe(0);
    expect(next.company.debt).toBeGreaterThan(0);

    for (let i = 0; i < 300; i += 1) {
      const lifeline = next.board.find(isLifeline);
      if (lifeline && next.projects.length === 0) {
        next = applyAction(next, { type: 'submitBid', rfqId: lifeline.id, tier: 'fair' }, rng).state;
      }
      next = advance(next, 5, rng);
      expect(next.company.cash).toBeGreaterThanOrEqual(0);
      expect(isLockedOut(next)).toBe(false);
    }

    // Repair work pays the debt down instead of leaving the company frozen.
    expect(next.stats.repairCount).toBeGreaterThan(0);
    expect(next.company.debt).toBeLessThan(90_000 - 100);
    expect(next.stats.lockedOutSec).toBe(0);
  });

  it('keeps the lifeline biddable no matter how deep the debt is', () => {
    const rng = seeded(53);
    let state = advance(createInitialState(), 0.25, rng);
    state = { ...state, company: { ...state.company, cash: 0, debt: 500_000 } };
    state = advance(state, 0.25, rng);

    const repair = state.board.find(isLifeline)!;
    expect(canAffordBid(state, repair)).toBe(true);
    expect(isLockedOut(state)).toBe(false);

    const result = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, rng);
    expect(result.ok).toBe(true);
  });
});

describe('lifeline payments are never delayed', () => {
  it('lands the whole contract the moment the job closes', () => {
    const rng = seeded(61);
    let state = advance(createInitialState(), 0.25, rng);
    state = { ...state, company: { ...state.company, cash: 0 } };
    state = advance(state, 0.25, rng);

    const repair = state.board.find(isLifeline)!;
    state = applyAction(state, { type: 'submitBid', rfqId: repair.id, tier: 'fair' }, rng).state;
    const awarded = state.projects[0]!.awarded;

    for (let i = 0; i < 300 && state.projects.length > 0; i += 1) {
      state = advance(state, 1, rng);
      expect(state.pendingPayments.length, 'a repair payment was queued for later').toBe(0);
    }

    expect(state.stats.repairCount).toBe(1);
    expect(state.company.cash).toBeCloseTo(awarded, 6);
  });
});
