// Player actions. Pure: each returns a new state and never mutates the input.

import { balance, requireProjectType } from './data';
import { adjustTrust, nextSiteSlotCost, upgradeCost } from './company';
import { rollProjectStartEvents } from './events';
import { buildTasks, expectedDurationSec, progressOf } from './project';
import { canAffordBid, constructionCostFor, contractAmountFor, replaceRfq, winChanceFor } from './rfq';
import { nextId } from './state';
import type { Rng } from './rng';
import type {
  Action,
  ActionResult,
  BidTierId,
  GameState,
  Project,
  Rfq,
  SubId,
} from './types';

export function applyAction(state: GameState, action: Action, rng: Rng): ActionResult {
  const draft: GameState = structuredClone(state);
  switch (action.type) {
    case 'submitBid':
      return submitBid(draft, action.rfqId, action.tier, rng);
    case 'rejectRfq':
      return rejectRfq(draft, action.rfqId, rng);
    case 'upgradeSub':
      return upgradeSub(draft, action.subId);
    case 'buySiteSlot':
      return buySiteSlot(draft);
    case 'clearPunchList':
      return clearPunchList(draft, action.projectId, action.count);
    case 'abandonProject':
      return abandonProject(draft, action.projectId);
    case 'resolveDecision':
      return resolveDecision(draft, action.decisionId, action.choice);
  }
}

function fail(state: GameState, error: string): ActionResult {
  return { state, ok: false, error };
}

function submitBid(state: GameState, rfqId: string, tier: BidTierId, rng: Rng): ActionResult {
  const rfq = state.board.find((entry) => entry.id === rfqId);
  if (!rfq) return fail(state, `no such rfq: ${rfqId}`);
  if (state.projects.length >= state.company.siteSlots) return fail(state, 'no free site slot');
  // A job whose opening run of work cannot be funded may not be taken on.
  if (!canAffordBid(state, rfq)) return fail(state, 'cash below the bid minimum');

  // A named or negotiated award is fair-only by definition.
  const tierId: BidTierId = rfq.directAward ? 'fair' : tier;
  const won = rng.next() < winChanceFor(state, rfq, tierId);

  // Counters settle before the slot refills, so the named bid lands on the
  // replacement RFQ - the next one posted, as the rule reads.
  if (won) {
    state.company.consecutiveBidLosses = 0;
  } else {
    state.company.consecutiveBidLosses += 1;
    if (state.company.consecutiveBidLosses >= balance.bidding.consecutiveLossesForDirectAward) {
      state.company.consecutiveBidLosses = 0;
      state.company.pendingDirectAward = true;
    }
  }

  const awardedRfq = rfq;
  replaceRfq(state, rfq.id, rng);

  if (won) state.projects.push(createProject(state, awardedRfq, tierId, rng));
  return { state, ok: true };
}

function createProject(state: GameState, rfq: Rfq, tierId: BidTierId, rng: Rng): Project {
  const type = requireProjectType(rfq.typeId);
  const startEvents = rollProjectStartEvents(
    rng,
    state.elapsedSec,
    expectedDurationSec(type.id),
  );

  const project: Project = {
    id: nextId(state, 'prj'),
    typeId: type.id,
    floors: type.floors,
    pipelineMode: type.pipelineMode,
    contractBase: rfq.contractBase,
    bidTier: tierId,
    clientTrait: rfq.clientTrait,
    inspector: rfq.inspector,
    awarded: contractAmountFor(rfq, tierId),
    totalCost: constructionCostFor(rfq),
    startedAtSec: state.elapsedSec,
    deadlineAtSec: state.elapsedSec + rfq.deadlineSec,
    tasks: buildTasks(type),
    retainage: 0,
    advanceOutstanding: 0,
    punchOpen: 0,
    punchTotalGenerated: 0,
    punchCostAccrued: 0,
    punchClearElapsedSec: 0,
    punchClearQueued: 0,
    events: {
      strictInspector: startEvents.strictInspector,
      changeOrderAtSec: startEvents.changeOrderAtSec,
      changeOrderApplied: false,
    },
    riskyPourActive: false,
    rainDecided: false,
    stalled: false,
    stalledSec: 0,
    inspectionsPassed: 0,
    inspectionsFailed: 0,
    paidOut: 0,
    spent: 0,
  };

  if (rfq.advanceAvailable) {
    const advance = rfq.contractBase * balance.economy.advanceRatio;
    state.company.cash += advance;
    project.advanceOutstanding = advance;
  }

  return project;
}

function rejectRfq(state: GameState, rfqId: string, rng: Rng): ActionResult {
  const rfq = state.board.find((entry) => entry.id === rfqId);
  if (!rfq) return fail(state, `no such rfq: ${rfqId}`);
  // Declining is not a lost bid, so the consecutive-loss counter is untouched.
  replaceRfq(state, rfq.id, rng);
  return { state, ok: true };
}

function upgradeSub(state: GameState, subId: SubId): ActionResult {
  const level = state.company.subLevels[subId];
  if (level === undefined) return fail(state, `no such subcontractor: ${subId}`);
  if (level >= balance.subcontractors.maxLevel) return fail(state, 'already at max level');

  const cost = upgradeCost(level);
  if (state.company.cash < cost) return fail(state, 'not enough cash');

  state.company.cash -= cost;
  state.company.subLevels[subId] = level + 1;
  return { state, ok: true };
}

function buySiteSlot(state: GameState): ActionResult {
  const cost = nextSiteSlotCost(state);
  if (cost === null) return fail(state, 'site slot cap reached');
  if (state.company.cash < cost) return fail(state, 'not enough cash');

  state.company.cash -= cost;
  state.company.siteSlots += 1;
  return { state, ok: true };
}

function clearPunchList(state: GameState, projectId: string, count: number): ActionResult {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return fail(state, `no such project: ${projectId}`);
  if (count <= 0) return fail(state, 'count must be positive');

  project.punchClearQueued = Math.min(project.punchOpen, Math.floor(count));
  return { state, ok: true };
}

/**
 * Walks away from a site. Retainage is forfeited in full, the unrecovered
 * advance goes back at once - overdrawing if it has to, which the next income
 * then pays down first - trust takes the hit and the slot frees immediately.
 * Progress payments already in flight are not clawed back.
 */
function abandonProject(state: GameState, projectId: string): ActionResult {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return fail(state, `no such project: ${projectId}`);

  const rules = balance.abandon;
  const retainageForfeited = rules.forfeitRetainage ? project.retainage : 0;
  project.retainage -= retainageForfeited;

  const advanceReturned = rules.returnAdvance ? project.advanceOutstanding : 0;
  state.company.cash -= advanceReturned;
  project.advanceOutstanding -= advanceReturned;

  adjustTrust(state, rules.trustPenalty);

  state.abandoned.push({
    id: nextId(state, 'abn'),
    projectId: project.id,
    typeId: project.typeId,
    bidTier: project.bidTier,
    contractBase: project.contractBase,
    abandonedAtSec: state.elapsedSec,
    retainageForfeited,
    advanceReturned,
    progress: progressOf(project),
  });
  state.stats.abandonedProjects += 1;

  state.projects = state.projects.filter((entry) => entry.id !== projectId);
  state.pendingDecisions = state.pendingDecisions.filter(
    (entry) => entry.projectId !== projectId,
  );
  return { state, ok: true };
}

function resolveDecision(state: GameState, decisionId: string, choice: string): ActionResult {
  const decision = state.pendingDecisions.find((entry) => entry.id === decisionId);
  if (!decision) return fail(state, `no such decision: ${decisionId}`);
  if (!decision.options.includes(choice)) return fail(state, `invalid choice: ${choice}`);

  const project = state.projects.find((entry) => entry.id === decision.projectId);
  if (project) {
    project.rainDecided = true;
    if (choice === 'risky_pour') project.riskyPourActive = true;
  }

  state.pendingDecisions = state.pendingDecisions.filter((entry) => entry.id !== decisionId);
  return { state, ok: true };
}
