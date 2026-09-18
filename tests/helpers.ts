// Shared test helpers. Not a test file.

import { advance, applyAction, createInitialState, createRng } from '../src/core';
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

/** Bids repeatedly until a site is under construction. Returns the state holding it. */
export function awardProject(
  rng: Rng,
  tier: BidTierId = 'fair',
  typeId?: string,
  startFrom?: GameState,
): GameState {
  let state = advance(startFrom ?? createInitialState(), 0.25, rng);

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    if (state.projects.length > 0) return state;

    const rfq = typeId
      ? state.board.find((entry) => entry.typeId === typeId)
      : state.board[0];

    if (rfq) {
      state = applyAction(state, { type: 'submitBid', rfqId: rfq.id, tier }, rng).state;
    }
    if (state.projects.length > 0) return state;
    state = advance(state, 0.25, rng);
  }
  throw new Error('no project was awarded within the attempt budget');
}

export function seeded(seed: number): Rng {
  return createRng(seed);
}
