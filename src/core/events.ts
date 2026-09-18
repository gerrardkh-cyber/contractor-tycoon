// Event templates: weather, market, and the per-project rolls.
// Choice events are exposed as pending decisions. core never decides for the player.

import { requireEvent } from './data';
import { nextId } from './state';
import { randRange, type Rng } from './rng';
import type { GameState, Project } from './types';

export function tickWeather(state: GameState, dtSec: number, rng: Rng): void {
  const template = requireEvent('rain');

  if (state.weather.raining) {
    state.weather.remainingSec -= dtSec;
    if (state.weather.remainingSec <= 0) {
      state.weather.raining = false;
      state.weather.remainingSec = 0;
      for (const project of state.projects) {
        project.riskyPourActive = false;
        project.rainDecided = false;
      }
    }
  }

  state.weather.nextRollInSec -= dtSec;
  if (state.weather.nextRollInSec <= 0) {
    state.weather.nextRollInSec += template.intervalSec ?? 0;
    if (!state.weather.raining && rng.next() < template.chance) {
      state.weather.raining = true;
      state.weather.remainingSec = randRange(
        rng,
        template.durationMinSec ?? 0,
        template.durationMaxSec ?? 0,
      );
    }
  }

  syncRainDecisions(state);
}

/** One open decision per active site while it rains, none once it stops. */
function syncRainDecisions(state: GameState): void {
  const hasRainDecisions = state.pendingDecisions.some((decision) => decision.eventId === 'rain');

  if (!state.weather.raining) {
    if (hasRainDecisions) {
      state.pendingDecisions = state.pendingDecisions.filter(
        (decision) => decision.eventId !== 'rain',
      );
    }
    return;
  }

  const template = requireEvent('rain');
  const decisionId = template.decision?.id ?? 'risky_pour';

  for (const project of state.projects) {
    if (project.riskyPourActive || project.rainDecided) continue;
    const already = state.pendingDecisions.some(
      (decision) => decision.eventId === 'rain' && decision.projectId === project.id,
    );
    if (already) continue;
    state.pendingDecisions.push({
      id: nextId(state, 'dec'),
      eventId: 'rain',
      projectId: project.id,
      options: [decisionId, template.decision?.defaultChoice ?? 'wait'],
    });
  }
}

export function tickMarket(state: GameState, dtSec: number, rng: Rng): void {
  const template = requireEvent('material_spike');
  state.market.nextRollInSec -= dtSec;
  if (state.market.nextRollInSec > 0) return;
  state.market.nextRollInSec += template.intervalSec ?? 0;
  if (rng.next() < template.chance) {
    state.market.pendingCostMultiplier = template.nextStageCostMultiplier ?? 1;
  }
}

/** Reads the spike and clears it: it applies to one stage start only. */
export function consumeCostMultiplier(state: GameState): number {
  const multiplier = state.market.pendingCostMultiplier;
  state.market.pendingCostMultiplier = 1;
  return multiplier;
}

export interface ProjectStartEvents {
  strictInspector: boolean;
  changeOrderAtSec: number | null;
}

/** Rolled once when a bid is won. change_order is scheduled, not fired immediately. */
export function rollProjectStartEvents(
  rng: Rng,
  startedAtSec: number,
  expectedDurationSec: number,
): ProjectStartEvents {
  const strict = requireEvent('strict_inspector');
  const change = requireEvent('change_order');

  const strictInspector = rng.next() < strict.chance;
  const changeOrderAtSec =
    rng.next() < change.chance ? startedAtSec + rng.next() * expectedDurationSec : null;

  return { strictInspector, changeOrderAtSec };
}

/** Raises the contract and drags out whatever is mid-flight when it lands. */
export function applyChangeOrderIfDue(state: GameState, project: Project): boolean {
  const { changeOrderAtSec, changeOrderApplied } = project.events;
  if (changeOrderApplied || changeOrderAtSec === null) return false;
  if (state.elapsedSec < changeOrderAtSec) return false;

  const template = requireEvent('change_order');
  project.awarded *= template.contractMultiplier ?? 1;
  for (const task of project.tasks) {
    if (task.status === 'working' || task.status === 'rework') {
      task.remainingSec *= template.activeStageTimeMultiplier ?? 1;
    }
  }
  project.events.changeOrderApplied = true;
  return true;
}
