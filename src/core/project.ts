// Project construction: the task graph, stage durations, costs and payments.
//
// The floor pipeline is a flow shop: one crew per trade, jobs are floors.
//   task(stage i, floor f) waits for task(stage i, floor f-1)   - same crew, previous floor
//                          and task(stage i-1, floor f)          - previous trade, same floor

import {
  balance,
  requireProjectType,
  requireStage,
  shareOf,
  type ProjectTypeData,
  type StageData,
} from './data';
import { stageTimeMultiplier } from './company';
import type { GameState, Project, Task } from './types';

export function stagesOf(type: ProjectTypeData): StageData[] {
  return type.stages.map(requireStage);
}

/** Flow-shop makespan at level 1 with no failures: the basis for every deadline. */
export function expectedDurationSec(typeId: string): number {
  const type = requireProjectType(typeId);
  const all = stagesOf(type);
  const serial = all.filter((stage) => !stage.perFloor);
  const perFloor = all.filter((stage) => stage.perFloor);

  const serialSec = serial.reduce((sum, stage) => sum + stage.baseSec, 0);
  if (perFloor.length === 0) return serialSec;

  const pipelineSec = perFloor.reduce((sum, stage) => sum + stage.baseSec, 0);
  const bottleneckSec = Math.max(...perFloor.map((stage) => stage.baseSec));
  return serialSec + pipelineSec + (type.floors - 1) * bottleneckSec;
}

export function deadlineSecFor(
  typeId: string,
  traitDeadlineMultiplier: number,
  baseMultiplier: number = balance.economy.deadlineMultiplier,
): number {
  return expectedDurationSec(typeId) * baseMultiplier * traitDeadlineMultiplier;
}

export function buildTasks(type: ProjectTypeData): Task[] {
  const tasks: Task[] = [];
  for (const stage of stagesOf(type)) {
    const count = stage.perFloor ? type.floors : 1;
    for (let floor = 0; floor < count; floor += 1) {
      tasks.push({
        stageId: stage.id,
        floor: stage.perFloor ? floor : null,
        status: 'waiting',
        remainingSec: 0,
        gateCursor: 0,
        pendingCostDue: 0,
        riskyPour: false,
        costMultiplier: 1,
        majorFailures: 0,
      });
    }
  }
  return tasks;
}

export function findTask(project: Project, stageId: string, floor: number | null): Task | undefined {
  return project.tasks.find((task) => task.stageId === stageId && task.floor === floor);
}

export function tasksOfStage(project: Project, stageId: string): Task[] {
  return project.tasks.filter((task) => task.stageId === stageId);
}

/** True when everything this task depends on has passed its gates. */
export function prerequisitesMet(project: Project, task: Task): boolean {
  const order = requireProjectType(project.typeId).stages;
  const index = order.indexOf(task.stageId);

  // Same crew, previous floor.
  if (task.floor !== null && task.floor > 0 && !isDone(project, task.stageId, task.floor - 1)) {
    return false;
  }
  if (index <= 0) return true;

  const previousStageId = order[index - 1];
  if (previousStageId === undefined) return true;

  // Previous trade, same floor - or the whole of it when it is not a per-floor stage.
  if (requireStage(previousStageId).perFloor && task.floor !== null) {
    return isDone(project, previousStageId, task.floor);
  }
  return allDone(project, previousStageId);
}

function isDone(project: Project, stageId: string, floor: number | null): boolean {
  for (const task of project.tasks) {
    if (task.stageId === stageId && task.floor === floor) return task.status === 'done';
  }
  return false;
}

function allDone(project: Project, stageId: string): boolean {
  for (const task of project.tasks) {
    if (task.stageId === stageId && task.status !== 'done') return false;
  }
  return true;
}

/** Work seconds for one run of a stage, after subcontractor level effects. */
export function stageDurationSec(state: GameState, stageId: string): number {
  const stage = requireStage(stageId);
  return stage.baseSec * stageTimeMultiplier(state, stage.subs);
}

/** Cash charged when the stage starts. Per-floor stages split their share. */
export function stageCost(project: Project, stageId: string): number {
  const stage = requireStage(stageId);
  const divisor = stage.perFloor ? project.floors : 1;
  return (project.totalCost * shareOf(project.typeId, stageId).costShare) / divisor;
}

/** Gross progress payment released when the stage's last gate passes. */
export function stagePay(project: Project, stageId: string): number {
  const stage = requireStage(stageId);
  const divisor = stage.perFloor ? project.floors : 1;
  return (project.awarded * shareOf(project.typeId, stageId).payShare) / divisor;
}

/**
 * Cash a bidder must hold before it may take this job on: the stages named in
 * balance.bidding.minCashStages, which is the first payment-free run of work.
 * Priced off the build cost, so it does not move with the inspector.
 */
export function minCashToBid(typeId: string): number {
  const type = requireProjectType(typeId);
  const totalCost = type.baseContract * balance.economy.constructionCostRatio;
  let required = 0;
  for (const stageId of balance.bidding.minCashStages) {
    if (!type.stages.includes(stageId)) continue;
    const stage = requireStage(stageId);
    const share = shareOf(typeId, stageId).costShare;
    required += (totalCost * share) / (stage.perFloor ? type.floors : 1);
  }
  return required;
}

export function isLifelineProject(project: Project): boolean {
  return requireProjectType(project.typeId).lifeline === true;
}

/** Sites that count against the company's site slots. Lifeline work does not. */
export function activeSiteCount(state: GameState): number {
  return state.projects.filter((project) => !isLifelineProject(project)).length;
}

/** Share of the task list that has passed its gates. */
export function progressOf(project: Project): number {
  if (project.tasks.length === 0) return 0;
  const done = project.tasks.filter((task) => task.status === 'done').length;
  return done / project.tasks.length;
}

export function isComplete(project: Project): boolean {
  return project.tasks.every((task) => task.status === 'done');
}

export function isLate(state: GameState, project: Project): boolean {
  return state.elapsedSec > project.deadlineAtSec;
}
