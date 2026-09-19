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

/** Nothing that can make progress and nothing on the board within reach. */
export function isLockedOut(state: GameState): boolean {
  return !hasRunnableSite(state) && !state.board.some((rfq) => canAffordBid(state, rfq));
}

/** A site counts as runnable unless it is parked for lack of funds. */
function hasRunnableSite(state: GameState): boolean {
  return state.projects.some((project) => !project.stalled);
}

/**
 * Posts the repair job when no site can make progress and no ordinary RFQ is
 * within reach, and withdraws it once either is true again. It takes a slot of
 * its own beside the board, never one of the three, and only ever one at a time.
 */
export function syncLifeline(state: GameState, rng: Rng): void {
  const posted = state.board.some(isLifeline);
  const stuck =
    !hasRunnableSite(state) && !normalRfqs(state).some((rfq) => canAffordBid(state, rfq));

  if (stuck) {
    if (!posted) state.board.push(createLifelineRfq(state));
    return;
  }

  if (posted) {
    state.board = normalRfqs(state);
    refillBoard(state, rng);
  }
}

function oldestNormalRfq(state: GameState): Rfq | undefined {
  let oldest: Rfq | undefined;
  for (const rfq of normalRfqs(state)) {
    if (!oldest || rfq.postedAtSec < oldest.postedAtSec) oldest = rfq;
  }
  return oldest;
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

/** The lifeline sits in a slot of its own, so it never counts toward the board size. */
function normalRfqs(state: GameState): Rfq[] {
  return state.board.filter((rfq) => !isLifeline(rfq));
}

export function refillBoard(state: GameState, rng: Rng): void {
  while (normalRfqs(state).length < balance.bidding.boardSlots) {
    const lifeline = state.board.filter(isLifeline);
    state.board = [...normalRfqs(state), createRfq(state, rng), ...lifeline];
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

  const oldest = oldestNormalRfq(state);
  if (oldest) state.board = state.board.filter((rfq) => rfq.id !== oldest.id);
  refillBoard(state, rng);
  syncLifeline(state, rng);
}

/** Removes one RFQ and immediately posts a replacement. */
export function replaceRfq(state: GameState, rfqId: string, rng: Rng): void {
  state.board = state.board.filter((rfq) => rfq.id !== rfqId);
  refillBoard(state, rng);
  syncLifeline(state, rng);
}

/**
 * An RFQ below the bidder's means stays on the board but cannot be bid.
 * The lifeline is the exception: it is the way out of being broke, so it is
 * always biddable, whatever the books say.
 */
export function canAffordBid(state: GameState, rfq: Rfq): boolean {
  if (isLifeline(rfq)) return true;
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
