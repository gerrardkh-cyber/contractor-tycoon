// The RFQ board: generation, rotation, and win probability.

import {
  balance,
  clientTraits,
  inspectors,
  projectTypes,
  type ClientTraitData,
  type InspectorData,
  type ProjectTypeData,
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

/** Harsh inspectors only bid out work to companies with a record behind them. */
function availableInspectors(state: GameState) {
  const open = inspectors.filter(
    (entry) => state.company.trust >= (entry.trustRequired ?? 0),
  );
  return open.length > 0 ? open : inspectors.slice(0, 1);
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
    minCash: minCashToBid(type.id),
    directAward: true,
    postedAtSec: state.elapsedSec,
  };
}

/**
 * Nothing that can make progress and nothing on the board within reach.
 * A lifeline cooldown does not count: the way out is on its way, just delayed.
 */
export function isLockedOut(state: GameState): boolean {
  if (state.lifelineCooldownRemainingSec > 0) return false;
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
    // Held back while the cooldown from the last repair runs down.
    if (!posted && state.lifelineCooldownRemainingSec <= 0) {
      state.board.push(createLifelineRfq(state));
    }
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

/** One possible posting: what it is, who wants it, and who will inspect it. */
interface Posting {
  type: ProjectTypeData;
  trait: ClientTraitData;
  inspector: InspectorData;
  weight: number;
}

function postingKey(typeId: string, inspectorId: string, traitId: string): string {
  return `${typeId}|${inspectorId}|${traitId}`;
}

/** Everything the board could legally post right now. */
function allPostings(state: GameState): Posting[] {
  const out: Posting[] = [];
  for (const type of eligibleTypes(state)) {
    for (const trait of clientTraits) {
      for (const inspector of availableInspectors(state)) {
        out.push({ type, trait, inspector, weight: trait.weight * inspector.weight });
      }
    }
  }
  return out;
}

/**
 * GDD 3.1: the three live slots never repeat a (type, inspector, client)
 * combination, and no single type takes more than `maxPerType` of them. Three
 * versions of the same job is not a choice, it is a queue.
 *
 * When the player's licence and standing cannot produce a distinct posting,
 * the constraint is dropped rather than leaving a slot empty: a board with a
 * gap in it would be a worse lie than a board with a repeat.
 */
function pickPosting(state: GameState, rng: Rng): Posting {
  const live = normalRfqs(state);
  const taken = new Set(live.map((rfq) => postingKey(rfq.typeId, rfq.inspector, rfq.clientTrait)));
  const perType = new Map<string, number>();
  for (const rfq of live) perType.set(rfq.typeId, (perType.get(rfq.typeId) ?? 0) + 1);

  const all = allPostings(state);
  const distinct = all.filter(
    (posting) =>
      !taken.has(postingKey(posting.type.id, posting.inspector.id, posting.trait.id)) &&
      (perType.get(posting.type.id) ?? 0) < balance.bidding.maxPerType,
  );

  return weightedPick(rng, distinct.length > 0 ? distinct : all, (posting) => posting.weight);
}

export function createRfq(state: GameState, rng: Rng): Rfq {
  const { type, trait, inspector } = pickPosting(state, rng);

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
    minCash: minCashToBid(type.id),
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

/**
 * The build costs what it costs. An inspector's multiplier is a premium on the
 * contract, not an inflation of the work, so cost is priced off the type's base
 * contract before any multiplier.
 */
export function constructionCostFor(rfq: Rfq): number {
  return requireProjectType(rfq.typeId).baseContract * balance.economy.constructionCostRatio;
}

export function typeOf(rfq: Rfq) {
  return requireProjectType(rfq.typeId);
}
