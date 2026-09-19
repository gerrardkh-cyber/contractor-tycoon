// The simulation step. advance() never mutates the state it is handed:
// it clones once, drives the clone forward in fixed ticks, and returns it.

import { balance, requireClientTrait, requireProjectType, requireStage } from './data';
import { adjustTrust, refreshLicense } from './company';
import {
  applyChangeOrderIfDue,
  consumeCostMultiplier,
  tickMarket,
  tickWeather,
} from './events';
import {
  gateBlockedByPunchList,
  punchItemCost,
  rollGate,
} from './inspection';
import { releaseProgressPayment, releaseRetainage, tickPendingPayments } from './payments';
import {
  isComplete,
  isLate,
  prerequisitesMet,
  stageCost,
  stageDurationSec,
  stagePay,
} from './project';
import { isLockedOut, syncLifeline, tickBoard } from './rfq';
import { nextId } from './state';
import type { Rng } from './rng';
import type { GameState, Project, Task } from './types';

/** Pure: returns a new state advanced by dtSec. The input is left untouched. */
export function advance(state: GameState, dtSec: number, rng: Rng): GameState {
  const draft: GameState = structuredClone(state);
  if (dtSec <= 0) return draft;

  const tick = balance.simulation.tickSec;
  const wholeSteps = Math.floor(dtSec / tick);
  for (let i = 0; i < wholeSteps; i += 1) stepOnce(draft, tick, rng);

  const remainder = dtSec - wholeSteps * tick;
  if (remainder > 1e-9) stepOnce(draft, remainder, rng);

  return draft;
}

function stepOnce(state: GameState, dtSec: number, rng: Rng): void {
  state.elapsedSec += dtSec;

  tickWeather(state, dtSec, rng);
  tickMarket(state, dtSec, rng);
  tickPendingPayments(state);
  tickBoard(state, dtSec, rng);

  for (const project of [...state.projects]) tickProject(state, project, dtSec, rng);

  tickWarranties(state, dtSec, rng);
  tickBoosts(state, dtSec);
  refreshLicense(state);

  // Sites finish after the board was refreshed, so re-check the lifeline here:
  // the repair job must be up in the same tick the last site closes.
  syncLifeline(state, rng);

  // Nothing running and nothing biddable: the lifeline should keep this at zero.
  if (isLockedOut(state)) state.stats.lockedOutSec += dtSec;

  if (state.company.cash < 0 && state.stats.bankruptAtSec === null) {
    state.stats.bankruptAtSec = state.elapsedSec;
  }
}

/** Boost timers only. Order 002 does not apply any boost effect. */
function tickBoosts(state: GameState, dtSec: number): void {
  if (state.boosts.doubleIncomeRemainingSec > 0) {
    state.boosts.doubleIncomeRemainingSec = Math.max(
      0,
      state.boosts.doubleIncomeRemainingSec - dtSec,
    );
  }
}

function tickProject(state: GameState, project: Project, dtSec: number, rng: Rng): void {
  applyChangeOrderIfDue(state, project);
  project.stalled = false;
  tickPunchClearing(project, dtSec);

  for (const task of project.tasks) {
    if (task.status === 'done') continue;
    advanceTask(state, project, task, dtSec, rng);
  }

  if (project.stalled) {
    project.stalledSec += dtSec;
    state.stats.totalStalledSec += dtSec;
  }

  if (isComplete(project)) completeProject(state, project);
}

function advanceTask(
  state: GameState,
  project: Project,
  task: Task,
  dtSec: number,
  rng: Rng,
): void {
  const stage = requireStage(task.stageId);

  if (task.status === 'gate') {
    processGates(state, project, task, rng);
    return;
  }

  if (task.status === 'waiting') {
    if (!prerequisitesMet(project, task)) return;
    const baseCost = stageCost(project, task.stageId);
    task.pendingCostDue = baseCost > 0 ? baseCost * consumeCostMultiplier(state) : 0;
    task.remainingSec = stageDurationSec(state, task.stageId);
    task.status = 'working';
  }

  const rainStops = stage.blockedByRain && state.weather.raining;
  if (rainStops && !project.riskyPourActive) return;

  if (task.pendingCostDue > 0) {
    if (state.company.cash < task.pendingCostDue) {
      project.stalled = true;
      return;
    }
    state.company.cash -= task.pendingCostDue;
    project.spent += task.pendingCostDue;
    task.pendingCostDue = 0;
  }

  if (rainStops && project.riskyPourActive) task.riskyPour = true;

  task.remainingSec -= dtSec;
  if (task.remainingSec > 0) return;

  task.remainingSec = 0;
  task.status = 'gate';
  processGates(state, project, task, rng);
}

function processGates(state: GameState, project: Project, task: Task, rng: Rng): void {
  const stage = requireStage(task.stageId);

  while (task.gateCursor < stage.gates.length) {
    const gateId = stage.gates[task.gateCursor];
    if (gateId === undefined) break;

    // A gate that demands a clean punch list parks the task until it is clear.
    if (gateBlockedByPunchList(project, gateId)) return;

    const outcome = rollGate(state, project, task, gateId, rng);
    if (!outcome.passed) {
      task.status = 'rework';
      task.remainingSec = stageDurationSec(state, task.stageId) * balance.inspection.reworkTimeRatio;
      task.pendingCostDue = stageCost(project, task.stageId) * balance.inspection.reworkCostRatio;
      return;
    }
    task.gateCursor += 1;
  }

  task.status = 'done';
  payForStage(state, project, task, rng);
}

function payForStage(state: GameState, project: Project, task: Task, rng: Rng): void {
  let gross = stagePay(project, task.stageId);
  if (gross <= 0) return;

  const type = requireProjectType(project.typeId);
  const isFinalStage = type.stages[type.stages.length - 1] === task.stageId;
  if (isFinalStage && isLate(state, project)) {
    const trait = requireClientTrait(project.clientTrait);
    gross *= trait.lateFinalPaymentMultiplier ?? 1;
  }

  releaseProgressPayment(state, project, gross, rng);
}

/**
 * Punch work is billed to the job, not paid in cash: it is settled against
 * retainage at CO. So a site is never held up by a punch item it cannot afford.
 */
function tickPunchClearing(project: Project, dtSec: number): void {
  if (project.punchClearQueued <= 0 || project.punchOpen <= 0) return;

  const perItemSec = balance.punchList.clearSec;
  const cost = punchItemCost(project);
  project.punchClearElapsedSec += dtSec;

  while (
    project.punchClearElapsedSec >= perItemSec &&
    project.punchClearQueued > 0 &&
    project.punchOpen > 0
  ) {
    project.punchCostAccrued += cost;
    project.punchClearElapsedSec -= perItemSec;
    project.punchClearQueued -= 1;
    project.punchOpen -= 1;
  }
}

function completeProject(state: GameState, project: Project): void {
  // The punch bill comes out of retainage first; anything over it is paid in cash.
  const fromRetainage = Math.min(project.punchCostAccrued, project.retainage);
  project.retainage -= fromRetainage;
  project.spent += fromRetainage;

  const shortfall = project.punchCostAccrued - fromRetainage;
  if (shortfall > 0) {
    state.company.cash -= shortfall;
    project.spent += shortfall;
  }

  releaseRetainage(state, project);

  // A lifeline repair job is not a real completion: it carries no warranty, is
  // kept out of the licence count and settles no trust. It only gets counted.
  if (requireProjectType(project.typeId).lifeline) {
    state.stats.repairCount += 1;
  } else {
    const late = isLate(state, project);
    adjustTrust(state, late ? balance.trust.coLate : balance.trust.coOnTime);
    if (late) state.stats.lateCompletions += 1;

    const penaltyUnits = Math.floor(project.punchOpen / balance.trust.openMinorsPerPenalty);
    if (penaltyUnits > 0) adjustTrust(state, penaltyUnits * balance.trust.openMinorPenalty);

    const fee = project.contractBase * balance.defect.warrantyFeeRatio;
    state.company.cash -= fee;
    project.spent += fee;

    state.company.completedProjects += 1;

    const { baseChance, perMinorChance, lowBidChance, maxChance, windowSec } = balance.defect;
    const chance = Math.min(
      maxChance,
      baseChance +
        project.punchTotalGenerated * perMinorChance +
        (project.bidTier === 'low' ? lowBidChance : 0),
    );

    state.warranties.push({
      id: nextId(state, 'wty'),
      projectId: project.id,
      contractBase: project.contractBase,
      defectChance: chance,
      remainingSec: windowSec,
    });
  }

  state.projects = state.projects.filter((other) => other.id !== project.id);
  state.pendingDecisions = state.pendingDecisions.filter(
    (decision) => decision.projectId !== project.id,
  );
}

function tickWarranties(state: GameState, dtSec: number, rng: Rng): void {
  if (state.warranties.length === 0) return;

  const survivors = [];
  for (const warranty of state.warranties) {
    warranty.remainingSec -= dtSec;
    if (warranty.remainingSec > 0) {
      survivors.push(warranty);
      continue;
    }
    if (rng.next() < warranty.defectChance) {
      state.company.cash -= warranty.contractBase * balance.defect.costRatio;
      adjustTrust(state, balance.trust.defectOccurred);
      state.stats.defectsOccurred += 1;
    } else {
      adjustTrust(state, balance.trust.defectClear);
      state.stats.defectsCleared += 1;
    }
  }
  state.warranties = survivors;
}
