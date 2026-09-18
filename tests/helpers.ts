// Shared test helpers. Not a test file.

import { advance, applyAction, canAffordBid, createInitialState, createRng } from '../src/core';
import type { BidTierId, GameState, Rng } from '../src/core';

/** An rng that always returns the same value. Handy for forcing win/lose paths. */
export function constantRng(value: number): Rng {
  let state = 0;
  return {
    next: () => value,
    getState: () => state,
    setState: (next: number) => {
      state = next;
    },
  };
}

/**
 * Bids until a site is under construction. RFQs that do not match `typeId`, or
 * that sit above the bid minimum, are skipped and the board is churned instead.
 * `cash` tops the company up first, for jobs a starting company cannot bid on.
 */
export function awardProject(
  rng: Rng,
  tier: BidTierId = 'fair',
  typeId?: string,
  options: { cash?: number; startFrom?: GameState } = {},
): GameState {
  let state = advance(options.startFrom ?? createInitialState(), 0.25, rng);
  if (options.cash !== undefined) {
    state = { ...state, company: { ...state.company, cash: options.cash } };
  }

  for (let attempt = 0; attempt < 20000; attempt += 1) {
    if (state.projects.length > 0) return state;

    const candidates = typeId ? state.board.filter((entry) => entry.typeId === typeId) : state.board;
    const match = candidates.find((entry) => canAffordBid(state, entry));

    if (match) {
      state = applyAction(state, { type: 'submitBid', rfqId: match.id, tier }, rng).state;
    } else if (state.board.length > 0) {
      state = applyAction(state, { type: 'rejectRfq', rfqId: state.board[0]!.id }, rng).state;
    }

    if (state.projects.length > 0) return state;
    state = advance(state, 0.25, rng);
  }
  throw new Error('no project was awarded within the attempt budget');
}

export function seeded(seed: number): Rng {
  return createRng(seed);
}
