// Inspection gates: pass probability, major failures, punch list minors.

import { balance, requireEvent, requireGate, requireInspector } from './data';
import { adjustTrust, gateInspectionBonus } from './company';
import { randInt, type Rng } from './rng';
import type { GameState, Project, Task } from './types';

export interface PassRateInputs {
  inspectorBase: number;
  subBonus: number;
  lowBid: boolean;
  riskyPour: boolean;
  strictInspectorEvent: boolean;
}

/** The formula from BALANCE.md section 5.1, clamped at both ends. */
export function passRateFrom(inputs: PassRateInputs): number {
  const rules = balance.inspection;
  const strictPenalty = requireEvent('strict_inspector').passRatePenalty ?? 0;
  let rate = inputs.inspectorBase + inputs.subBonus;
  if (inputs.lowBid) rate -= rules.lowBidPenalty;
  if (inputs.riskyPour) rate -= rules.riskyPourPenalty;
  if (inputs.strictInspectorEvent) rate -= strictPenalty;
  return Math.max(rules.minPassRate, Math.min(rules.maxPassRate, rate));
}

export function passRateFor(state: GameState, project: Project, task: Task, gateId: string): number {
  const gate = requireGate(gateId);
  const inspector = requireInspector(project.inspector);
  return passRateFrom({
    inspectorBase: inspector.basePassRate,
    subBonus: gateInspectionBonus(state, gate.subs),
    lowBid: project.bidTier === 'low',
    riskyPour: gate.riskyPourApplies && task.riskyPour,
    strictInspectorEvent: project.events.strictInspector,
  });
}

export interface GateOutcome {
  passed: boolean;
  minors: number;
}

/** Rolls one gate. Mutates the working state: trust, punch list and counters. */
export function rollGate(
  state: GameState,
  project: Project,
  task: Task,
  gateId: string,
  rng: Rng,
): GateOutcome {
  const rate = passRateFor(state, project, task, gateId);
  const passed = rng.next() < rate;

  state.stats.totalInspections += 1;

  if (!passed) {
    state.stats.totalInspectionFailures += 1;
    project.inspectionsFailed += 1;
    task.majorFailures += 1;
    adjustTrust(state, balance.trust.inspectionMajorFail);
    return { passed: false, minors: 0 };
  }

  const inspector = requireInspector(project.inspector);
  const minors = randInt(rng, inspector.minorMin, inspector.minorMax);
  project.inspectionsPassed += 1;
  project.punchOpen += minors;
  project.punchTotalGenerated += minors;
  state.stats.totalMinorsGenerated += minors;
  adjustTrust(state, balance.trust.inspectionPass);
  return { passed: true, minors };
}

/** A gate that demands a clean punch list holds the project until it is clear. */
export function gateBlockedByPunchList(project: Project, gateId: string): boolean {
  return requireGate(gateId).requiresZeroPunch && project.punchOpen > 0;
}

/**
 * Per floor, not per contract: gates are rolled floor by floor, so charging the
 * whole contract for each one made punch work grow with the size of the job.
 */
export function punchItemCost(project: Project): number {
  return (project.contractBase / Math.max(1, project.floors)) * balance.punchList.costRatio;
}
