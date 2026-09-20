// One site card: the building, its numbers, why it is stopped, the punch list,
// the rain decision and the walk-off button.

import {
  data,
  isLate,
  nextSiteSlotCost,
  progressOf,
  punchItemCost,
  stageDurationSec,
  type Project,
  type Task,
} from '../core';
import { bar, button, el, stat } from './dom';
import { duration, money, percent } from './format';
import { createBuildingCanvas, drawBuilding } from './building';
import { strings } from './strings.en';
import { theme } from './theme';
import type { Ctx } from './context';

const stageNames = strings.stage as Record<string, string>;
const traitNames = strings.board.traits as Record<string, string>;
const inspectorNames = strings.board.inspectors as Record<string, string>;

/** The task the crew is actually on, for the progress bar and stall reason. */
function activeTask(project: Project): Task | undefined {
  return (
    project.tasks.find((task) => task.status === 'working' || task.status === 'rework') ??
    project.tasks.find((task) => task.status === 'gate') ??
    project.tasks.find((task) => task.pendingCostDue > 0 && task.status !== 'done')
  );
}

function stallNote(ctx: Ctx, project: Project): HTMLElement | null {
  const blocked = project.tasks.find(
    (task) => task.pendingCostDue > 0 && task.status !== 'done',
  );

  if (project.stalled && blocked) {
    return el('div', {
      class: 'site-note',
      text: strings.site.stalledFunds(money(blocked.pendingCostDue)),
    });
  }
  if (ctx.state.weather.raining && !project.riskyPourActive) {
    return el('div', {
      class: 'site-note info',
      text: strings.site.stalledRain(duration(ctx.state.weather.remainingSec)),
    });
  }
  if (project.tasks.some((task) => task.status === 'gate')) {
    return el('div', { class: 'site-note info', text: strings.site.awaitingInspection });
  }
  return null;
}

function punchBlock(ctx: Ctx, project: Project): HTMLElement {
  const cost = punchItemCost(project);
  const blocking = project.tasks.some((task) => task.status === 'gate' && task.stageId === 'final');
  const rows: (Node | string)[] = [];

  rows.push(
    el('div', { class: 'site-head' }, [
      el('span', {
        text: project.punchOpen > 0 ? strings.site.punchOpen(project.punchOpen) : strings.site.punchNone,
      }),
      el('span', {
        class: 'site-sub',
        text: strings.site.punchCost(money(cost), duration(data.balance.punchList.clearSec)),
      }),
    ]),
  );

  if (project.punchClearQueued > 0) {
    rows.push(el('div', { class: 'site-sub', text: strings.site.clearing(project.punchClearQueued) }));
  } else if (project.punchOpen > 0) {
    rows.push(
      button(strings.site.punchClear, () => {
        ctx.dispatch({ type: 'clearPunchList', projectId: project.id, count: project.punchOpen });
      }, { class: blocking ? 'btn primary small' : 'btn small' }),
    );
  }

  if (blocking && project.punchOpen > 0) {
    rows.push(el('div', { class: 'site-note blocking', text: strings.site.punchBlocking }));
  } else if (project.punchOpen > 0) {
    rows.push(el('div', { class: 'site-sub', text: strings.site.punchBilled }));
  }

  return el('div', { class: 'site' }, rows);
}

function decisionBlock(ctx: Ctx, project: Project): HTMLElement | null {
  const decision = ctx.state.pendingDecisions.find((entry) => entry.projectId === project.id);
  if (!decision) return null;

  const penalty = percent(data.balance.inspection.riskyPourPenalty);
  return el('div', { class: 'site' }, [
    el('div', { class: 'site-note', text: strings.decision.rainTitle }),
    el('div', { class: 'btn-row' }, [
      button(strings.decision.pourAnyway(`-${penalty}`), () => {
        ctx.dispatch({ type: 'resolveDecision', decisionId: decision.id, choice: 'risky_pour' });
      }, { class: 'btn small' }),
      button(strings.decision.wait, () => {
        ctx.dispatch({ type: 'resolveDecision', decisionId: decision.id, choice: 'wait' });
      }, { class: 'btn small primary' }),
    ]),
  ]);
}

export function renderSiteCard(ctx: Ctx, project: Project): HTMLElement {
  const type = data.requireProjectType(project.typeId);
  const canvas = createBuildingCanvas();
  drawBuilding(canvas, project);

  const task = activeTask(project);
  const stageLabel = task ? stageNames[task.stageId] ?? task.stageId : '';
  const total = task ? stageDurationSec(ctx.state, task.stageId) : 0;
  const ratio = task && total > 0 ? 1 - Math.max(0, task.remainingSec) / total : 0;

  const remaining = project.deadlineAtSec - ctx.state.elapsedSec;
  const late = isLate(ctx.state, project);

  const card = el('div', { class: 'panel site' }, [
    el('div', { class: 'site-head' }, [
      el('span', { class: 'site-type', text: stageNames[type.id] ?? type.id }),
      el('span', { class: 'site-sub', text: strings.site.floors(type.floors) }),
    ]),
    canvas,
    el('div', { class: 'site-head' }, [
      el('span', { class: 'site-sub', text: stageLabel }),
      el('span', { class: 'site-sub', text: percent(progressOf(project)) }),
    ]),
    bar(ratio),
    el('div', { class: 'site-grid' }, [
      stat(strings.site.contract, money(project.awarded)),
      stat(strings.site.paid, money(project.paidOut)),
      stat(strings.site.retainage, money(project.retainage)),
      stat(
        late ? strings.site.overdue : strings.site.deadline,
        duration(Math.abs(remaining)),
        late ? 'bad' : undefined,
      ),
      stat(strings.site.inspector, inspectorNames[project.inspector] ?? project.inspector),
      stat(strings.site.client, traitNames[project.clientTrait] ?? project.clientTrait),
    ]),
  ]);

  const note = stallNote(ctx, project);
  if (note) card.append(note);

  const decision = decisionBlock(ctx, project);
  if (decision) card.append(decision);

  card.append(punchBlock(ctx, project));
  card.append(
    el('div', { class: 'footer-bar' }, [
      el('span', { class: 'legend' }, [
        legendSwatch(theme.color.floorStructure, strings.floorState.structure),
        legendSwatch(theme.color.floorServices, strings.floorState.services),
        legendSwatch(theme.color.floorDone, strings.floorState.done),
      ]),
      button(strings.site.abandon, () => ctx.openAbandon(project.id), { class: 'btn danger small' }),
    ]),
  );

  return card;
}

function legendSwatch(color: string, label: string): HTMLElement {
  return el('span', {}, [
    el('span', { class: 'swatch', style: `background:${color}` }),
    el('span', { text: label }),
  ]);
}

export function renderEmptyLot(ctx: Ctx): HTMLElement {
  const cost = nextSiteSlotCost(ctx.state);
  if (cost === null) {
    return el('div', { class: 'empty-lot' }, [
      el('span', { text: strings.site.emptyTitle }),
      el('span', { class: 'site-sub', text: strings.site.slotCapReached }),
    ]);
  }

  const affordable = ctx.state.company.cash >= cost;
  return el('div', { class: 'empty-lot' }, [
    el('span', { text: strings.site.emptyTitle }),
    button(strings.site.buySlot(money(cost)), () => ctx.dispatch({ type: 'buySiteSlot' }), {
      class: 'btn primary small',
      disabled: !affordable,
    }),
    affordable ? null : el('span', { class: 'site-sub', text: strings.site.cannotAfford }),
  ]);
}
