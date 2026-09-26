// One site card: the drawing, its numbers, why it is stopped, the punch list,
// the rain decision and the walk-off button.
//
// The card is built once and then patched. Nothing is torn down between
// frames, so the crane keeps turning, a floor can rise into place, and a
// payment can lift off the card that earned it.

import {
  data,
  isLate,
  progressOf,
  punchItemCost,
  stageDurationSec,
  type GameState,
  type Project,
  type Task,
} from '../core';
import {
  bar,
  button,
  clear,
  el,
  replayAnimation,
  setBar,
  setClass,
  setText,
  stat,
  toggleClass,
  withIcon,
} from './dom';
import { duration, money, moneySigned, percent } from './format';
import { createBuildingView } from './building';
import { inspectorIcon, traitIcon } from './icons';
import { play } from './sound';
import { strings } from './strings';
import { theme } from './theme';
import type { Ctx } from './context';

const stageName = (id: string): string => (strings.stage as Record<string, string>)[id] ?? id;
const typeName = (id: string): string =>
  (strings.projectType as Record<string, string>)[id] ?? id;
const traitName = (id: string): string => (strings.board.traits as Record<string, string>)[id] ?? id;
const inspectorName = (id: string): string =>
  (strings.board.inspectors as Record<string, string>)[id] ?? id;

/** The task the crew is actually on, for the progress bar and stall reason. */
function activeTask(project: Project): Task | undefined {
  return (
    project.tasks.find((task) => task.status === 'working' || task.status === 'rework') ??
    project.tasks.find((task) => task.status === 'gate') ??
    project.tasks.find((task) => task.pendingCostDue > 0 && task.status !== 'done')
  );
}

export interface SiteCard {
  node: HTMLElement;
  readonly projectId: string;
  update(ctx: Ctx, project: Project): void;
  /** A gate passed: pop a tick over the part it belongs to. */
  pass(gateId: string): void;
  /** A gate failed: shake the card and flash its edge. */
  fail(): void;
  /** Money landed: float the figure off the card. */
  payment(amount: number): void;
  dispose(): void;
}

export function createSiteCard(ctx: Ctx, project: Project): SiteCard {
  const type = data.requireProjectType(project.typeId);
  const view = createBuildingView(type.floors);

  const stageLabel = el('span', { class: 'site-sub' });
  const progressLabel = el('span', { class: 'site-sub' });
  const progressBar = bar(0);

  const contract = stat(strings.site.contract, '');
  const paid = stat(strings.site.paid, '');
  const retainage = stat(strings.site.retainage, '');
  const deadline = stat(strings.site.deadline, '');

  const noteSlot = el('div');
  const decisionSlot = el('div');
  const punchSlot = el('div');

  const node = el('div', { class: 'panel site site-card' }, [
    el('div', { class: 'site-head' }, [
      el('span', { class: 'site-type', text: typeName(type.id) }),
      el('span', { class: 'site-sub', text: strings.site.floors(type.floors) }),
    ]),
    view.node,
    el('div', { class: 'site-head' }, [stageLabel, progressLabel]),
    progressBar,
    el('div', { class: 'site-grid' }, [
      contract,
      paid,
      retainage,
      deadline,
      el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: strings.site.inspector }),
        withIcon(
          inspectorIcon(project.inspector),
          el('span', {
            class: 'stat-value plain',
            text: inspectorName(project.inspector),
          }),
        ),
      ]),
      el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: strings.site.client }),
        withIcon(
          traitIcon(project.clientTrait),
          el('span', {
            class: 'stat-value plain',
            text: traitName(project.clientTrait),
          }),
        ),
      ]),
    ]),
    noteSlot,
    decisionSlot,
    punchSlot,
    el('div', { class: 'footer-bar' }, [
      el('span', { class: 'legend' }, [
        legendSwatch(theme.color.rebar, strings.floorState.structure),
        legendSwatch(theme.color.blueprint, strings.floorState.services),
        legendSwatch(theme.color.concrete, strings.floorState.done),
      ]),
      button(strings.site.abandon, () => ctx.openAbandon(project.id), {
        class: 'btn danger small',
      }),
    ]),
  ]);

  // Remembered so the panels are only rebuilt when what they say changes.
  let noteKey = '';
  let decisionKey = '';
  let punchKey = '';

  function update(context: Ctx, current: Project): void {
    view.update(current, context.state);

    const task = activeTask(current);
    setText(stageLabel, task ? stageName(task.stageId) : '');
    setText(progressLabel, percent(progressOf(current)));

    const total = task ? stageDurationSec(context.state, task.stageId) : 0;
    setBar(progressBar, task && total > 0 ? 1 - Math.max(0, task.remainingSec) / total : 0);

    setValue(contract, money(current.awarded));
    setValue(paid, money(current.paidOut));
    setValue(retainage, money(current.retainage));
    applyDeadline(deadline, context.state, current);

    const starved = current.stalled && current.tasks.some((entry) => entry.pendingCostDue > 0);
    toggleClass(node, 'is-starved', starved);

    syncNote(context, current);
    syncDecision(context, current);
    syncPunch(context, current);
  }

  function syncNote(context: Ctx, current: Project): void {
    const note = stallNote(context, current);
    const key = note ? `${note.tone}:${note.text}` : '';
    if (key === noteKey) return;
    noteKey = key;
    clear(noteSlot);
    if (note) {
      noteSlot.append(
        el('div', { class: note.tone }, [
          el('span', { text: note.text }),
          note.amount ? el('span', { class: 'short', text: ` ${note.amount}` }) : null,
        ]),
      );
    }
  }

  function syncDecision(context: Ctx, current: Project): void {
    const decision = context.state.pendingDecisions.find(
      (entry) => entry.projectId === current.id,
    );
    const key = decision?.id ?? '';
    if (key === decisionKey) return;
    decisionKey = key;
    clear(decisionSlot);
    if (!decision) return;

    const penalty = percent(data.balance.inspection.riskyPourPenalty);
    decisionSlot.append(
      el('div', { class: 'site' }, [
        el('div', { class: 'site-note', text: strings.decision.rainTitle }),
        el('div', { class: 'btn-row' }, [
          // Pouring through rain is the risky call, so it wears the warning colour.
          button(strings.decision.pourAnyway(`-${penalty}`), () => {
            play('click');
            context.dispatch({
              type: 'resolveDecision',
              decisionId: decision.id,
              choice: 'risky_pour',
            });
          }, { class: 'btn small warn' }),
          button(strings.decision.wait, () => {
            play('click');
            context.dispatch({ type: 'resolveDecision', decisionId: decision.id, choice: 'wait' });
          }, { class: 'btn small primary' }),
        ]),
      ]),
    );
  }

  function syncPunch(context: Ctx, current: Project): void {
    const blocking = current.tasks.some(
      (task) => task.status === 'gate' && task.stageId === 'final',
    );
    const key = `${current.punchOpen}:${current.punchClearQueued}:${blocking}`;
    if (key === punchKey) return;
    punchKey = key;
    clear(punchSlot);
    punchSlot.append(punchBlock(context, current, blocking));
  }

  function pass(gateId: string): void {
    view.markPass(gateId);
  }

  function fail(): void {
    replayAnimation(node, 'is-failed');
  }

  function payment(amount: number): void {
    const float = el('div', { class: 'float-money', text: moneySigned(amount) });
    node.append(float);
    globalThis.setTimeout(() => float.remove(), theme.motion.floatMs);
  }

  function dispose(): void {
    view.dispose();
  }

  return { node, projectId: project.id, update, pass, fail, payment, dispose };
}

function setValue(host: HTMLElement, value: string): void {
  setText(host.querySelector('.stat-value'), value);
}

/** Deadline turns amber inside the last fifth, then red once it is blown. */
function applyDeadline(host: HTMLElement, state: GameState, project: Project): void {
  const remaining = project.deadlineAtSec - state.elapsedSec;
  const late = isLate(state, project);
  const window = project.deadlineAtSec - project.startedAtSec;
  const ratio = window > 0 ? remaining / window : 1;

  setText(host.querySelector('.stat-label'), late ? strings.site.overdue : strings.site.deadline);
  const value = host.querySelector('.stat-value');
  setText(value, duration(Math.abs(remaining)));
  setClass(
    value,
    late ? 'stat-value bad is-overdue' : ratio <= theme.motion.deadlineWarnRatio
      ? 'stat-value warn'
      : 'stat-value',
  );
}

interface Note {
  text: string;
  tone: string;
  amount?: string;
}

function stallNote(ctx: Ctx, project: Project): Note | null {
  const blocked = project.tasks.find(
    (task) => task.pendingCostDue > 0 && task.status !== 'done',
  );

  if (project.stalled && blocked) {
    return {
      text: strings.site.stalledFundsPlain,
      amount: money(blocked.pendingCostDue),
      tone: 'site-note blocking',
    };
  }
  if (ctx.state.weather.raining && !project.riskyPourActive) {
    return {
      text: strings.site.stalledRain(duration(ctx.state.weather.remainingSec)),
      tone: 'site-note info',
    };
  }
  if (project.tasks.some((task) => task.status === 'gate')) {
    return { text: strings.site.awaitingInspection, tone: 'site-note info' };
  }
  return null;
}

function punchBlock(ctx: Ctx, project: Project, blocking: boolean): HTMLElement {
  const cost = punchItemCost(project);
  const rows: (Node | string)[] = [
    el('div', { class: 'site-head' }, [
      el('span', {
        text:
          project.punchOpen > 0
            ? strings.site.punchOpen(project.punchOpen)
            : strings.site.punchNone,
      }),
      el('span', {
        class: 'site-sub',
        text: strings.site.punchCost(money(cost), duration(data.balance.punchList.clearSec)),
      }),
    ]),
  ];

  if (project.punchClearQueued > 0) {
    rows.push(
      el('div', { class: 'site-sub', text: strings.site.clearing(project.punchClearQueued) }),
    );
  } else if (project.punchOpen > 0) {
    rows.push(
      button(strings.site.punchClear, () => {
        play('click');
        ctx.dispatch({
          type: 'clearPunchList',
          projectId: project.id,
          count: project.punchOpen,
        });
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

function legendSwatch(color: string, label: string): HTMLElement {
  return el('span', {}, [
    el('span', { class: 'swatch', style: `background:${color}` }),
    el('span', { text: label }),
  ]);
}

/** What the next slot costs, or null if the board has no such slot. */
function slotCostFor(slotNumber: number): number | null {
  const entry = data.balance.sites.slotCosts.find((row) => row.slot === slotNumber);
  return entry ? entry.cost : null;
}

/**
 * One position in the site area. Order 005: every slot the company could ever
 * hold keeps its place on screen, so the room to grow is visible from the
 * first screen rather than appearing once it is affordable.
 */
export function renderSlotCard(ctx: Ctx, slotNumber: number): HTMLElement {
  const { company } = ctx.state;

  // A slot already owned is simply an empty lot waiting for a job.
  if (slotNumber <= company.siteSlots) {
    return el('div', { class: 'empty-lot' }, [
      el('span', { text: strings.site.emptyTitle }),
      el('span', { class: 'site-sub', text: strings.site.emptyReady }),
    ]);
  }

  const cost = slotCostFor(slotNumber);
  if (cost === null) {
    return el('div', { class: 'empty-lot is-locked' }, [
      el('span', { text: strings.site.emptyTitle }),
      el('span', { class: 'site-sub', text: strings.site.slotCapReached }),
    ]);
  }

  // Only the very next slot can be bought; the ones past it show what is coming.
  const isNext = slotNumber === company.siteSlots + 1;
  const shortfall = cost - company.cash;
  const affordable = isNext && shortfall <= 0;

  const rows: (Node | null)[] = [
    el('div', { class: 'slot-head' }, [
      el('span', { class: 'slot-title', text: strings.site.nextSite }),
      el('span', { class: 'slot-price', text: money(cost) }),
    ]),
  ];

  if (isNext) {
    rows.push(
      button(strings.site.buySlot(money(cost)), () => {
        play('click');
        ctx.dispatch({ type: 'buySiteSlot' });
      }, { class: 'btn primary small', disabled: !affordable }),
      affordable
        ? null
        : el('span', { class: 'site-sub slot-short', text: strings.site.slotShort(money(shortfall)) }),
    );
  } else {
    rows.push(
      el('span', { class: 'site-sub', text: strings.site.slotLocked(slotNumber - 1) }),
    );
  }

  return el('div', {
    class: isNext ? 'empty-lot is-next' : 'empty-lot is-locked',
  }, rows);
}

