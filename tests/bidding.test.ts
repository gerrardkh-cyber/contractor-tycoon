import { describe, it, expect } from 'vitest';
import { advance, applyAction, createInitialState, data, winChanceFor } from '../src/core';
import type { GameState, Rfq } from '../src/core';
import { constantRng, seeded } from './helpers';

const { balance } = data;

function boardedState(rng = seeded(5), cash?: number): GameState {
  const state = advance(createInitialState(), 0.25, rng);
  return cash === undefined ? state : { ...state, company: { ...state.company, cash } };
}

/** Every RFQ is within reach, so the bid itself is what is under test. */
function fundedBoard(rng = seeded(5)): GameState {
  return boardedState(rng, 10_000_000);
}

function rfqWith(state: GameState, predicate: (rfq: Rfq) => boolean): Rfq | undefined {
  return state.board.find(predicate);
}

describe('board', () => {
  it('posts exactly the configured number of slots', () => {
    const state = boardedState();
    expect(state.board.length).toBe(balance.bidding.boardSlots);
  });

  it('hides project types above the current licence', () => {
    const state = boardedState(seeded(12345));
    expect(state.company.licenseTier).toBe(1);
    expect(state.board.every((rfq) => rfq.typeId !== 'midrise')).toBe(true);
  });

  it('replaces the oldest slot on the rotation interval', () => {
    const rng = seeded(8);
    let state = boardedState(rng);
    const before = state.board.map((rfq) => rfq.id);
    state = advance(state, balance.bidding.rotationSec, rng);
    const after = state.board.map((rfq) => rfq.id);
    expect(after.length).toBe(balance.bidding.boardSlots);
    expect(after.filter((id) => before.includes(id)).length).toBe(before.length - 1);
  });

  it('replaces a slot immediately when it is declined', () => {
    const rng = seeded(31);
    const state = boardedState(rng);
    const target = state.board[0]!;
    const result = applyAction(state, { type: 'rejectRfq', rfqId: target.id }, rng);
    expect(result.ok).toBe(true);
    expect(result.state.board.some((rfq) => rfq.id === target.id)).toBe(false);
    expect(result.state.board.length).toBe(balance.bidding.boardSlots);
  });

  it('does not count a declined RFQ as a lost bid', () => {
    const rng = seeded(32);
    const state = boardedState(rng);
    const result = applyAction(state, { type: 'rejectRfq', rfqId: state.board[0]!.id }, rng);
    expect(result.state.company.consecutiveBidLosses).toBe(0);
  });
});

describe('win chance', () => {
  it('uses the tier base for a trait with no bid effect', () => {
    const state = boardedState();
    const rfq = rfqWith(state, (entry) => entry.clientTrait === 'schedule');
    if (!rfq) return;
    expect(winChanceFor(state, rfq, 'low')).toBeCloseTo(0.8, 10);
    expect(winChanceFor(state, rfq, 'fair')).toBeCloseTo(0.5, 10);
    expect(winChanceFor(state, rfq, 'high')).toBeCloseTo(0.2, 10);
  });

  it('shifts low up and high down for a price-driven client', () => {
    let state = boardedState(seeded(77));
    let rfq = rfqWith(state, (entry) => entry.clientTrait === 'price');
    for (let i = 0; i < 50 && !rfq; i += 1) {
      state = advance(state, 90, seeded(77 + i));
      rfq = rfqWith(state, (entry) => entry.clientTrait === 'price');
    }
    expect(rfq).toBeDefined();
    expect(winChanceFor(state, rfq!, 'low')).toBeCloseTo(0.9, 10);
    expect(winChanceFor(state, rfq!, 'fair')).toBeCloseTo(0.5, 10);
    expect(winChanceFor(state, rfq!, 'high')).toBeCloseTo(0.1, 10);
  });

  it('gives a record-driven client a flat bonus only above the trust threshold', () => {
    let state = boardedState(seeded(101));
    let rfq = rfqWith(state, (entry) => entry.clientTrait === 'track');
    for (let i = 0; i < 50 && !rfq; i += 1) {
      state = advance(state, 90, seeded(101 + i));
      rfq = rfqWith(state, (entry) => entry.clientTrait === 'track');
    }
    expect(rfq).toBeDefined();

    expect(winChanceFor(state, rfq!, 'fair')).toBeCloseTo(0.5, 10);
    const trusted = { ...state, company: { ...state.company, trust: 70 } };
    expect(winChanceFor(trusted, rfq!, 'fair')).toBeCloseTo(0.65, 10);
  });

  it('is certain for a direct award', () => {
    const state = boardedState();
    const named: Rfq = { ...state.board[0]!, directAward: true };
    expect(winChanceFor(state, named, 'high')).toBe(1);
  });
});

describe('three consecutive losses earn a named bid', () => {
  it('flags the next posted RFQ as a direct award', () => {
    const losing = constantRng(0.999);
    let state = fundedBoard(losing);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const target = state.board[0]!;
      const result = applyAction(state, { type: 'submitBid', rfqId: target.id, tier: 'fair' }, losing);
      expect(result.ok).toBe(true);
      state = result.state;
    }

    expect(state.company.consecutiveBidLosses).toBe(0);
    expect(state.board.some((rfq) => rfq.directAward)).toBe(true);
  });

  it('does not flag anything before the third loss', () => {
    const losing = constantRng(0.999);
    let state = fundedBoard(losing);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, losing).state;
    }

    expect(state.company.consecutiveBidLosses).toBe(2);
    expect(state.company.pendingDirectAward).toBe(false);
    expect(state.board.some((rfq) => rfq.directAward)).toBe(false);
  });

  it('resets the counter on a win', () => {
    const losing = constantRng(0.999);
    const winning = constantRng(0);
    let state = fundedBoard(losing);

    state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, losing).state;
    state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, losing).state;
    expect(state.company.consecutiveBidLosses).toBe(2);

    state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, winning).state;
    expect(state.company.consecutiveBidLosses).toBe(0);
    expect(state.projects.length).toBe(1);
  });

  it('forces a direct award to the fair tier', () => {
    const losing = constantRng(0.999);
    let state = fundedBoard(losing);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, losing).state;
    }
    const named = state.board.find((rfq) => rfq.directAward)!;
    // Still a losing rng, yet a named bid cannot be lost.
    const result = applyAction(state, { type: 'submitBid', rfqId: named.id, tier: 'low' }, losing);
    expect(result.state.projects.length).toBe(1);
    expect(result.state.projects[0]!.bidTier).toBe('fair');
  });
});

describe('site slots', () => {
  it('refuses a bid when every site is occupied', () => {
    const winning = constantRng(0);
    let state = fundedBoard(winning);
    state = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, winning).state;
    expect(state.projects.length).toBe(1);

    const result = applyAction(state, { type: 'submitBid', rfqId: state.board[0]!.id, tier: 'fair' }, winning);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no free site slot');
  });

  it('charges the listed price for each extra slot and stops at the cap', () => {
    const rng = seeded(4);
    const state = fundedBoard(rng);

    let result = applyAction(state, { type: 'buySiteSlot' }, rng);
    expect(result.ok).toBe(true);
    expect(result.state.company.siteSlots).toBe(2);
    expect(result.state.company.cash).toBe(10_000_000 - 150_000);

    result = applyAction(result.state, { type: 'buySiteSlot' }, rng);
    expect(result.state.company.siteSlots).toBe(3);
    expect(result.state.company.cash).toBe(10_000_000 - 150_000 - 600_000);

    result = applyAction(result.state, { type: 'buySiteSlot' }, rng);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('site slot cap reached');
  });
});
