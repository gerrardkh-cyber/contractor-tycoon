// The RFQ board: generation, rotation, and win probability.

import {
  balance,
  clientTraits,
  inspectors,
  projectTypes,
  requireBidTier,
  requireClientTrait,
  requireInspector,
  requireProjectType,
} from './data';
import { deadlineSecFor, minCashToBid } from './project';
import type { InspectorId, ClientTraitId } from './types';
import { nextId } from './state';
import { weightedPick, type Rng } from './rng';
import type { BidTierId, GameState, Rfq } from './types';

function eligibleTypes(state: GameState) {
  // Lifeline work is never posted at random: syncLifeline decides when it appears.
  const eligible = projectTypes.filter(
    (type) => !type.lifeline && type.licenseTier <= state.company.licenseTier,
  );
  return eligible.length > 0 ? eligible : projectTypes.filter((type) => !type.lifeline).slice(0, 1);
}

export function isLifeline(rfq: Rfq): boolean {
  return rfq.typeId === balance.lifeline.typeId;
}

/**
 * The repair job. Small, dull and unlosable: it exists so a company that cannot
 * afford any real work still has a way back. This is also where an ad hook
 * ("emergency funds") would sit later.
 */
function createLifelineRfq(state: GameState): Rfq {
  const config = balance.lifeline;
  const type = requireProjectType(config.typeId);
  const inspector = requireInspector(config.inspector as InspectorId);
  const trait = requireClientTrait(config.clientTrait as ClientTraitId);
  const contractBase = type.baseContract * inspector.contractMultiplier;

  return {
    id: nextId(state, 'rfq'),
    typeId: type.id,
    contractBase,
    clientTrait: trait.id,
    inspector: inspector.id,
    deadlineSec: deadlineSecFor(type.id, trait.deadlineMultiplier ?? 1),
    advanceAvailable: config.advanceAvailable,
    minCash: minCashToBid(type.id, contractBase),
    directAward: true,
    postedAtSec: state.elapsedSec,
  };
}

/** No site running and nothing on the board within reach. Should never persist. */
export function isLockedOut(state: GameState): boolean {
  return state.projects.length === 0 && !state.board.some((rfq) => canAffordBid(state, rfq));
}

/** Posts the repair job while the company is stuck, withdraws it once it is not. */
export function syncLifeline(state: GameState, rng: Rng): void {
  const posted = state.board.some(isLifeline);
  const stuck =
    state.projects.length === 0 &&
    !state.board.some((rfq) => !isLifeline(rfq) && canAffordBid(state, rfq));

  if (stuck) {
    if (posted) return;
    if (state.board.length >= balance.bidding.boardSlots) state.board.splice(oldestIndex(state), 1);
    state.board.push(createLifelineRfq(state));
    return;
  }

  if (posted) {
    state.board = state.board.filter((rfq) => !isLifeline(rfq));
    refillBoard(state, rng);
  }
}

function oldestIndex(state: GameState): number {
  let index = 0;
  for (let i = 1; i < state.board.length; i += 1) {
    const candidate = state.board[i];
    const oldest = state.board[index];
    if (candidate && oldest && candidate.postedAtSec < oldest.postedAtSec) index = i;
  }
  return index;
}

export function createRfq(state: GameState, rng: Rng): Rfq {
  const type = weightedPick(rng, eligibleTypes(state), () => 1);
  const trait = weightedPick(rng, clientTraits, (entry) => entry.weight);
  const inspector = weightedPick(rng, inspectors, (entry) => entry.weight);

  const contractBase = type.baseContract * inspector.contractMultiplier;
  const owedNamedBid = state.company.pendingDirectAward;
  const negotiated =
    !owedNamedBid &&
    state.company.trust >= balance.bidding.negotiatedTrustRequired &&
    rng.next() < balance.bidding.negotiatedChance;

  if (owedNamedBid) state.company.pendingDirectAward = false;

  return {
    id: nextId(state, 'rfq'),
    typeId: type.id,
    contractBase,
    clientTrait: trait.id,
    inspector: inspector.id,
    deadlineSec: deadlineSecFor(type.id, trait.deadlineMultiplier ?? 1),
    advanceAvailable: state.company.trust >= balance.economy.advanceTrustRequired,
    minCash: minCashToBid(type.id, contractBase),
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
  if (state.boardRotationInSec > 0) {
    syncLifeline(state, rng);
    return;
  }
  state.boardRotationInSec += balance.bidding.rotationSec;

  state.board.splice(oldestIndex(state), 1);
  refillBoard(state, rng);
  syncLifeline(state, rng);
}

/** Removes one RFQ and immediately posts a replacement. */
export function replaceRfq(state: GameState, rfqId: string, rng: Rng): void {
  state.board = state.board.filter((rfq) => rfq.id !== rfqId);
  refillBoard(state, rng);
  syncLifeline(state, rng);
}

/** An RFQ below the bidder's means stays on the board but cannot be bid. */
export function canAffordBid(state: GameState, rfq: Rfq): boolean {
  return state.company.cash >= rfq.minCash;
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
