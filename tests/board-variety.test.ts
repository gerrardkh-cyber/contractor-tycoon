import { describe, it, expect } from 'vitest';
import {
  advance,
  applyAction,
  createInitialState,
  data,
  isLifeline,
  minCashToBid,
  stageCost,
  type GameState,
  type Rfq,
} from '../src/core';
import { seeded } from './helpers';

const { balance } = data;

function ordinary(state: GameState): Rfq[] {
  return state.board.filter((rfq) => !isLifeline(rfq));
}

function comboOf(rfq: Rfq): string {
  return `${rfq.typeId}|${rfq.inspector}|${rfq.clientTrait}`;
}

/**
 * Runs the board forward and hands back every arrangement it went through.
 *
 * Slots are turned over by declining, not by waiting out the 90-second
 * rotation: it exercises the same generator and keeps the test quick enough
 * to live in the suite.
 */
function boardsOver(seed: number, rounds: number, opts: { trust?: number; tier?: number } = {}) {
  const rng = seeded(seed);
  let state = advance(createInitialState(), 0.25, rng);
  state = {
    ...state,
    company: {
      ...state.company,
      trust: opts.trust ?? state.company.trust,
      licenseTier: opts.tier ?? state.company.licenseTier,
      cash: 10_000_000,
    },
  };

  const seen: Rfq[][] = [ordinary(state)];
  for (let i = 0; i < rounds; i += 1) {
    const oldest = ordinary(state)[0];
    if (!oldest) break;
    state = applyAction(state, { type: 'rejectRfq', rfqId: oldest.id }, rng).state;
    seen.push(ordinary(state));
  }
  return seen;
}

describe('the board offers a choice, not a queue', () => {
  it('caps how many slots one type may take', () => {
    expect(balance.bidding.maxPerType).toBe(2);
    expect(balance.bidding.maxPerType).toBeLessThan(balance.bidding.boardSlots);
  });

  it('never repeats a type/inspector/client combination across live slots', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const board of boardsOver(seed, 10)) {
        const combos = board.map(comboOf);
        expect(new Set(combos).size, `seed ${seed}: ${combos.join(', ')}`).toBe(combos.length);
      }
    }
  });

  it('never lets one type take more than two of the three slots', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const board of boardsOver(seed, 10)) {
        const counts = new Map<string, number>();
        for (const rfq of board) counts.set(rfq.typeId, (counts.get(rfq.typeId) ?? 0) + 1);
        for (const [typeId, count] of counts) {
          expect(count, `seed ${seed}: ${typeId} took ${count} slots`).toBeLessThanOrEqual(
            balance.bidding.maxPerType,
          );
        }
      }
    }
  });

  it('holds once licence 2 and strict inspectors widen the pool', () => {
    for (let seed = 40; seed <= 52; seed += 1) {
      for (const board of boardsOver(seed, 10, { trust: 100, tier: 2 })) {
        const combos = board.map(comboOf);
        expect(new Set(combos).size, `seed ${seed}`).toBe(combos.length);
      }
    }
  });

  it('still fills every slot rather than leaving the board short', () => {
    for (let seed = 60; seed <= 72; seed += 1) {
      for (const board of boardsOver(seed, 10)) {
        expect(board.length, `seed ${seed}`).toBe(balance.bidding.boardSlots);
      }
    }
  });

  it('keeps the scripted first tender exactly as order 003 set it', () => {
    const state = advance(createInitialState(), 0.25, seeded(7));
    const first = ordinary(state)[0]!;
    expect(first.typeId).toBe(balance.bidding.firstRfq.typeId);
    expect(first.inspector).toBe(balance.bidding.firstRfq.inspector);
    expect(first.clientTrait).toBe(balance.bidding.firstRfq.clientTrait);
    expect(first.directAward).toBe(true);
  });

  it('gives the opening board three different jobs to look at', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const board = ordinary(advance(createInitialState(), 0.25, seeded(seed)));
      expect(board.length).toBe(balance.bidding.boardSlots);
      expect(new Set(board.map(comboOf)).size, `seed ${seed}`).toBe(board.length);
    }
  });
});

describe('the opening cash position', () => {
  it('covers the first house and its services out of pocket', () => {
    const state = advance(createInitialState(), 0.25, seeded(3));
    expect(state.company.cash).toBe(95_000);

    const house = data.requireProjectType('house');
    const project = {
      typeId: 'house',
      floors: house.floors,
      totalCost: house.baseContract * balance.economy.constructionCostRatio,
    } as never as Parameters<typeof stageCost>[0];

    // BALANCE 1: what is left after the bid must still cover the services
    // stage, so the first house cannot stall before any money comes in.
    const left = state.company.cash - minCashToBid('house');
    expect(left).toBeCloseTo(37_625, 6);
    expect(left).toBeGreaterThan(stageCost(project, 'mep'));
  });
});
