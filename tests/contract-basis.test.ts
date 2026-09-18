import { describe, it, expect } from 'vitest';
import { advance, breakdownFor, data, stageCost, stagePay } from '../src/core';
import type { GameState } from '../src/core';
import { awardProject, seeded } from './helpers';

const { balance, requireEvent } = data;
const CHANGE_ORDER_MULTIPLIER = requireEvent('change_order').contractMultiplier ?? 1;

/** Makes the scheduled change order due on the next tick. */
function forceChangeOrderDue(state: GameState): GameState {
  const next = structuredClone(state);
  const project = next.projects[0]!;
  project.events.changeOrderAtSec = next.elapsedSec;
  project.events.changeOrderApplied = false;
  return next;
}

describe('construction cost is 0.85P and independent of the bid tier', () => {
  it.each(['low', 'fair', 'high'] as const)('holds for a %s bid', (tier) => {
    const state = awardProject(seeded(40 + tier.length), tier, 'house');
    const project = state.projects[0]!;
    expect(project.totalCost).toBeCloseTo(
      project.contractBase * balance.economy.constructionCostRatio,
      6,
    );
  });

  it('moves the awarded amount but not the cost', () => {
    // A losing streak can turn the win into a named bid, which is fair-only,
    // so the tier is read off the project rather than assumed from the request.
    for (const requested of ['low', 'fair', 'high'] as const) {
      const project = awardProject(seeded(61), requested, 'house').projects[0]!;
      const multiplier = balance.bidding.tiers.find((entry) => entry.id === project.bidTier)!
        .contractMultiplier;

      expect(project.totalCost).toBeCloseTo(project.contractBase * 0.85, 6);
      expect(project.awarded).toBeCloseTo(project.contractBase * multiplier, 6);
    }
  });
});

describe('stage shares read from the right base', () => {
  it('charges cost against the construction cost', () => {
    const project = awardProject(seeded(71), 'high', 'lowrise').projects[0]!;
    expect(stageCost(project, 'foundation')).toBeCloseTo(project.totalCost * 0.15, 6);
    expect(stageCost(project, 'structural')).toBeCloseTo((project.totalCost * 0.6) / project.floors, 6);
  });

  it('pays against the awarded amount', () => {
    const project = awardProject(seeded(71), 'high', 'lowrise').projects[0]!;
    expect(stagePay(project, 'foundation')).toBeCloseTo(project.awarded * 0.15, 6);
    expect(stagePay(project, 'mep')).toBeCloseTo((project.awarded * 0.6) / project.floors, 6);
  });
});

describe('change order raises the contract only', () => {
  it('multiplies the awarded amount and leaves the construction cost alone', () => {
    let state = awardProject(seeded(83), 'fair', 'house');
    const before = state.projects[0]!;
    const awardedBefore = before.awarded;
    const totalCostBefore = before.totalCost;
    const foundationCostBefore = stageCost(before, 'foundation');

    state = advance(forceChangeOrderDue(state), 0.25, seeded(83));
    const after = state.projects[0]!;

    expect(after.events.changeOrderApplied).toBe(true);
    expect(after.awarded).toBeCloseTo(awardedBefore * CHANGE_ORDER_MULTIPLIER, 6);
    expect(after.totalCost).toBe(totalCostBefore);
    expect(stageCost(after, 'foundation')).toBeCloseTo(foundationCostBefore, 6);
  });

  it('lifts every remaining progress payment by the same multiplier', () => {
    let state = awardProject(seeded(84), 'fair', 'lowrise');
    const before = state.projects[0]!;
    const paysBefore = ['foundation', 'mep', 'weatherproof', 'final'].map((id) =>
      stagePay(before, id),
    );

    state = advance(forceChangeOrderDue(state), 0.25, seeded(84));
    const after = state.projects[0]!;
    const paysAfter = ['foundation', 'mep', 'weatherproof', 'final'].map((id) => stagePay(after, id));

    paysAfter.forEach((pay, index) => {
      expect(pay).toBeCloseTo(paysBefore[index]! * CHANGE_ORDER_MULTIPLIER, 6);
    });
  });

  it('never fires twice', () => {
    let state = awardProject(seeded(85), 'fair', 'house');
    const awardedBefore = state.projects[0]!.awarded;

    state = advance(forceChangeOrderDue(state), 0.25, seeded(85));
    const once = state.projects[0]!.awarded;
    state = advance(state, 60, seeded(85));

    expect(once).toBeCloseTo(awardedBefore * CHANGE_ORDER_MULTIPLIER, 6);
    expect(state.projects[0]!.awarded).toBeCloseTo(once, 6);
  });
});

describe('retainage and advance recovery read from the pay amount', () => {
  it('takes both cuts out of the gross progress payment, not the cost or P', () => {
    // A high bid, so the awarded amount, the cost and P are three different numbers.
    const state = awardProject(seeded(91), 'high', 'lowrise');
    const project = structuredClone(state.projects[0]!);
    project.advanceOutstanding = 1_000_000;

    const gross = stagePay(project, 'foundation');
    const result = breakdownFor(project, gross);

    expect(result.gross).toBeCloseTo(project.awarded * 0.15, 6);
    expect(result.retainage).toBeCloseTo(gross * balance.economy.retainageRatio, 6);
    expect(result.advanceDeduction).toBeCloseTo(gross * balance.economy.advanceRecoveryRatio, 6);
    expect(result.net).toBeCloseTo(gross * 0.8, 6);

    // Neither cut is anchored to the construction cost or to P.
    expect(result.retainage).not.toBeCloseTo(project.totalCost * 0.15 * 0.1, 6);
    expect(result.retainage).not.toBeCloseTo(project.contractBase * 0.15 * 0.1, 6);
  });

  it('scales both cuts with the contract once a change order lands', () => {
    let state = awardProject(seeded(92), 'fair', 'house');
    const grossBefore = stagePay(state.projects[0]!, 'foundation');

    state = advance(forceChangeOrderDue(state), 0.25, seeded(92));
    const project = structuredClone(state.projects[0]!);
    project.advanceOutstanding = 1_000_000;

    const grossAfter = stagePay(project, 'foundation');
    expect(grossAfter).toBeCloseTo(grossBefore * CHANGE_ORDER_MULTIPLIER, 6);

    const result = breakdownFor(project, grossAfter);
    expect(result.retainage).toBeCloseTo(grossAfter * balance.economy.retainageRatio, 6);
    expect(result.advanceDeduction).toBeCloseTo(
      grossAfter * balance.economy.advanceRecoveryRatio,
      6,
    );
  });
});
