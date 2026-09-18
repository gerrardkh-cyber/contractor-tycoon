// The RFQ board: generation, rotation, and win probability.

import {
  balance,
  clientTraits,
  inspectors,
  projectTypes,
  requireBidTier,
  requireClientTrait,
  requireProjectType,
} from './data';
import { deadlineSecFor } from './project';
import { nextId } from './state';
import { weightedPick, type Rng } from './rng';
import type { BidTierId, GameState, Rfq } from './types';

function eligibleTypes(state: GameState) {
  const eligible = projectTypes.filter((type) => type.licenseTier <= state.company.licenseTier);
  return eligible.length > 0 ? eligible : projectTypes.slice(0, 1);
}

export function createRfq(state: GameState, rng: Rng): Rfq {
  const type = weightedPick(rng, eligibleTypes(state), () => 1);
  const trait = weightedPick(rng, clientTraits, (entry) => entry.weight);
  const inspector = weightedPick(rng, inspectors, (entry) => entry.weight);

  const owedNamedBid = state.company.pendingDirectAward;
  const negotiated =
    !owedNamedBid &&
    state.company.trust >= balance.bidding.negotiatedTrustRequired &&
    rng.next() < balance.bidding.negotiatedChance;

  if (owedNamedBid) state.company.pendingDirectAward = false;

  return {
    id: nextId(state, 'rfq'),
    typeId: type.id,
    contractBase: type.baseContract * inspector.contractMultiplier,
    clientTrait: trait.id,
    inspector: inspector.id,
    deadlineSec: deadlineSecFor(type.id, trait.deadlineMultiplier ?? 1),
    advanceAvailable: state.company.trust >= balance.economy.advanceTrustRequired,
    directAward: owedNamedBid || negotiated,
    postedAtSec: state.elapsedSec,
  };
}

export function refillBoard(state: GameState, rng: Rng): void {
  while (state.board.length < balance.bidding.boardSlots) {
    state.board.push(createRfq(state, rng));
  }
}

/** Every rotationSec the oldest slot is replaced. */
export function tickBoard(state: GameState, dtSec: number, rng: Rng): void {
  refillBoard(state, rng);
  state.boardRotationInSec -= dtSec;
  if (state.boardRotationInSec > 0) return;
  state.boardRotationInSec += balance.bidding.rotationSec;

  let oldestIndex = 0;
  for (let i = 1; i < state.board.length; i += 1) {
    const candidate = state.board[i];
    const oldest = state.board[oldestIndex];
    if (candidate && oldest && candidate.postedAtSec < oldest.postedAtSec) oldestIndex = i;
  }
  state.board.splice(oldestIndex, 1);
  refillBoard(state, rng);
}

/** Removes one RFQ and immediately posts a replacement. */
export function replaceRfq(state: GameState, rfqId: string, rng: Rng): void {
  state.board = state.board.filter((rfq) => rfq.id !== rfqId);
  refillBoard(state, rng);
}

export function winChanceFor(state: GameState, rfq: Rfq, tierId: BidTierId): number {
  if (rfq.directAward) return 1;

  const tier = requireBidTier(tierId);
  const trait = requireClientTrait(rfq.clientTrait);
  let chance = tier.winChance;

  const perTier = trait.winChanceDelta?.[tierId];
  if (perTier !== undefined) chance += perTier;

  if (trait.winChanceDeltaAll !== undefined) {
    const required = trait.trustRequired ?? 0;
    if (state.company.trust >= required) chance += trait.winChanceDeltaAll;
  }

  return Math.max(0, Math.min(1, chance));
}

export function contractAmountFor(rfq: Rfq, tierId: BidTierId): number {
  return rfq.contractBase * requireBidTier(tierId).contractMultiplier;
}

export function constructionCostFor(rfq: Rfq): number {
  return rfq.contractBase * balance.economy.constructionCostRatio;
}

export function typeOf(rfq: Rfq) {
  return requireProjectType(rfq.typeId);
}
