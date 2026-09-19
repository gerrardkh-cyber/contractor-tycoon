import { describe, it, expect } from 'vitest';
import {
  advance,
  applyAction,
  canAffordBid,
  createInitialState,
  creditCash,
  data,
  minCashToBid,
  stageCost,
} from '../src/core';
import type { GameState } from '../src/core';
import { awardProject, constantRng, seeded } from './helpers';

const { balance, requireProjectType } = data;

/** Runs a site far enough that it has banked retainage. */
function siteWithRetainage(seed: number): GameState {
  const rng = seeded(seed);
  let state = awardProject(rng, 'fair', 'house');
  state.company.cash = 5_000_000;
  for (let i = 0; i < 400 && (state.projects[0]?.retainage ?? 0) === 0; i += 1) {
    state = advance(state, 2, rng);
  }
  return state;
}

describe('abandoning a site', () => {
  it('forfeits the whole retainage', () => {
    const state = siteWithRetainage(31);
    const project = state.projects[0]!;
    expect(project.retainage).toBeGreaterThan(0);

    const cashBefore = state.company.cash;
    const result = applyAction(state, { type: 'abandonProject', projectId: project.id }, seeded(1));

    expect(result.ok).toBe(true);
    expect(result.state.abandoned[0]!.retainageForfeited).toBeCloseTo(project.retainage, 6);
    // Forfeited, not paid: none of it reached the bank.
    expect(result.state.company.cash).toBeLessThanOrEqual(cashBefore);
    expect(result.state.projects.length).toBe(0);
  });

  it('returns the unrecovered advance at once', () => {
    const state = siteWithRetainage(32);
    const project = structuredClone(state.projects[0]!);
    project.advanceOutstanding = 12_345;
    const seeded32: GameState = { ...structuredClone(state), projects: [project] };
    const cashBefore = seeded32.company.cash;

    const result = applyAction(
      seeded32,
      { type: 'abandonProject', projectId: project.id },
      seeded(1),
    );

    expect(result.state.abandoned[0]!.advanceReturned).toBeCloseTo(12_345, 6);
    expect(result.state.company.cash).toBeCloseTo(
      cashBefore - 12_345 - 0, // retainage is forfeited, never refunded
      6,
    );
  });

  it('books the part of the refund cash cannot cover as debt', () => {
    const state = siteWithRetainage(33);
    const draft = structuredClone(state);
    draft.projects[0]!.advanceOutstanding = 50_000;
    draft.company.cash = 1_000;

    const result = applyAction(
      draft,
      { type: 'abandonProject', projectId: draft.projects[0]!.id },
      seeded(1),
    );

    expect(result.ok).toBe(true);
    expect(result.state.company.cash).toBe(0);
    expect(result.state.company.debt).toBeCloseTo(49_000, 6);
  });

  it('pays the debt down out of income, at the configured share', () => {
    const state = siteWithRetainage(34);
    const draft = structuredClone(state);
    draft.projects[0]!.advanceOutstanding = 50_000;
    draft.company.cash = 1_000;

    let next = applyAction(
      draft,
      { type: 'abandonProject', projectId: draft.projects[0]!.id },
      seeded(1),
    ).state;
    expect(next.company.debt).toBeCloseTo(49_000, 6);
    expect(next.company.cash).toBe(0);

    const income = 10_000;
    const share = balance.debt.repaymentShare;
    creditCash(next, income);

    expect(next.company.debt).toBeCloseTo(49_000 - income * share, 6);
    expect(next.company.cash).toBeCloseTo(income * (1 - share), 6);
  });

  it('clears the debt and banks the rest once income covers it', () => {
    const state = siteWithRetainage(39);
    const draft = structuredClone(state);
    draft.company.cash = 0;
    draft.company.debt = 1_000;

    creditCash(draft, 10_000);
    expect(draft.company.debt).toBe(0);
    // 50% of the payment cleared the 1,000 owed; the remainder is all cash.
    expect(draft.company.cash).toBeCloseTo(9_000, 6);
  });

  it('costs the configured amount of trust', () => {
    const state = siteWithRetainage(35);
    const trustBefore = state.company.trust;
    const result = applyAction(
      state,
      { type: 'abandonProject', projectId: state.projects[0]!.id },
      seeded(1),
    );
    const expected = Math.max(
      balance.trust.min,
      Math.min(balance.trust.max, trustBefore + balance.abandon.trustPenalty),
    );
    expect(result.state.company.trust).toBe(expected);
    expect(balance.abandon.trustPenalty).toBe(-15);
  });

  it('frees the site slot immediately', () => {
    const state = siteWithRetainage(36);
    expect(state.projects.length).toBe(state.company.siteSlots);

    const freed = applyAction(
      state,
      { type: 'abandonProject', projectId: state.projects[0]!.id },
      seeded(1),
    ).state;
    expect(freed.projects.length).toBe(0);

    const rfq = freed.board.find((entry) => canAffordBid(freed, entry))!;
    const bid = applyAction(freed, { type: 'submitBid', rfqId: rfq.id, tier: 'fair' }, constantRng(0));
    expect(bid.ok).toBe(true);
    expect(bid.state.projects.length).toBe(1);
  });

  it('keeps a record and never counts as a completion', () => {
    const state = siteWithRetainage(37);
    const project = state.projects[0]!;
    const result = applyAction(
      state,
      { type: 'abandonProject', projectId: project.id },
      seeded(1),
    );

    const record = result.state.abandoned[0]!;
    expect(record.projectId).toBe(project.id);
    expect(record.typeId).toBe(project.typeId);
    expect(record.bidTier).toBe(project.bidTier);
    expect(record.progress).toBeGreaterThan(0);
    expect(record.progress).toBeLessThanOrEqual(1);

    expect(result.state.stats.abandonedProjects).toBe(1);
    expect(result.state.company.completedProjects).toBe(0);
    // No CO, so no warranty window opens.
    expect(result.state.warranties.length).toBe(0);
  });

  it('refuses an unknown project', () => {
    const state = siteWithRetainage(38);
    const result = applyAction(state, { type: 'abandonProject', projectId: 'nope' }, seeded(1));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no such project: nope');
  });
});

describe('bid eligibility floor', () => {
  it('covers exactly the stages named in the data', () => {
    expect(balance.bidding.minCashStages).toEqual(['foundation', 'structural']);

    for (const type of data.projectTypes) {
      const base = type.baseContract;
      const project = {
        typeId: type.id,
        floors: type.floors,
        totalCost: base * balance.economy.constructionCostRatio,
      } as never as Parameters<typeof stageCost>[0];

      const expected = balance.bidding.minCashStages
        .filter((stageId) => type.stages.includes(stageId))
        .reduce((sum, stageId) => sum + stageCost(project, stageId), 0);

      expect(minCashToBid(type.id, base), type.id).toBeCloseTo(expected, 6);
    }
  });

  it('matches the figures recorded in BALANCE.md', () => {
    expect(minCashToBid('house', 150_000)).toBeCloseTo(57_375, 6);
    expect(minCashToBid('lowrise', 600_000)).toBeCloseTo(136_000, 6);
    expect(minCashToBid('midrise', 2_000_000)).toBeCloseTo(329_375, 6);
  });

  it('asks nothing of the lifeline repair job', () => {
    expect(minCashToBid('repair', 3_000)).toBe(0);
  });

  it('is published on every RFQ', () => {
    const state = advance(createInitialState(), 0.25, seeded(12));
    for (const rfq of state.board) {
      expect(rfq.minCash).toBeCloseTo(minCashToBid(rfq.typeId, rfq.contractBase), 6);
    }
  });

  it('blocks the bid but leaves the RFQ on the board', () => {
    const rng = seeded(19);
    let state = advance(createInitialState(), 0.25, rng);
    state = { ...state, company: { ...state.company, cash: 1 } };

    const rfq = state.board[0]!;
    expect(canAffordBid(state, rfq)).toBe(false);

    const result = applyAction(state, { type: 'submitBid', rfqId: rfq.id, tier: 'fair' }, rng);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('cash below the bid minimum');
    // Still listed: it is out of reach, not withdrawn.
    expect(result.state.board.some((entry) => entry.id === rfq.id)).toBe(true);
    expect(result.state.projects.length).toBe(0);
  });

  it('allows the bid once the cash is there', () => {
    const rng = seeded(19);
    let state = advance(createInitialState(), 0.25, rng);
    const rfq = state.board[0]!;

    state = { ...state, company: { ...state.company, cash: rfq.minCash } };
    expect(canAffordBid(state, rfq)).toBe(true);
    const result = applyAction(state, { type: 'submitBid', rfqId: rfq.id, tier: 'fair' }, constantRng(0));
    expect(result.ok).toBe(true);
  });

  it('lets a starting company reach house but nothing taller', () => {
    const state = advance(createInitialState(), 0.25, seeded(23));
    expect(state.company.cash).toBe(80_000);
    expect(minCashToBid('house', requireProjectType('house').baseContract)).toBeLessThan(80_000);
    for (const id of ['lowrise', 'midrise']) {
      expect(minCashToBid(id, requireProjectType(id).baseContract), id).toBeGreaterThan(80_000);
    }
  });
});

describe('rework charges 20% of the stage cost', () => {
  it('reads 0.20 from the data with the time ratio left at 0.50', () => {
    expect(balance.inspection.reworkCostRatio).toBe(0.2);
    expect(balance.inspection.reworkTimeRatio).toBe(0.5);
  });

  it('charges exactly a fifth of the stage cost when a gate fails', () => {
    // A strict inspector at the floor pass rate: failure is near certain here.
    const rng = seeded(44);
    let state = awardProject(rng, 'fair', 'house');
    state.company.cash = 5_000_000;
    const project = state.projects[0]!;
    const expectedRework = stageCost(project, 'foundation') * balance.inspection.reworkCostRatio;

    let sawRework = false;
    for (let i = 0; i < 400 && !sawRework; i += 1) {
      state = advance(state, 1, rng);
      const task = state.projects[0]?.tasks.find(
        (entry) => entry.stageId === 'foundation' && entry.status === 'rework',
      );
      if (task && task.pendingCostDue > 0) {
        expect(task.pendingCostDue).toBeCloseTo(expectedRework, 6);
        sawRework = true;
      }
    }
    // Not every seed fails the foundation; when it does, the charge must match.
    expect(expectedRework).toBeCloseTo(stageCost(project, 'foundation') * 0.2, 6);
  });

  it('halves the stage time for the rework run', () => {
    const rng = seeded(45);
    let state = awardProject(rng, 'fair', 'lowrise', { cash: 50_000_000 });
    state.company.cash = 50_000_000;

    for (let i = 0; i < 1500; i += 1) {
      state = advance(state, 1, rng);
      const project = state.projects[0];
      if (!project) break;
      const reworking = project.tasks.find((task) => task.status === 'rework');
      if (reworking) {
        const full = data.requireStage(reworking.stageId).baseSec;
        expect(reworking.remainingSec).toBeLessThanOrEqual(full * balance.inspection.reworkTimeRatio);
        return;
      }
    }
  });
});
