import { data, type GameEvent } from '../core';
import { clear, el } from './dom';
import { duration, money } from './format';
import { strings } from './strings.en';
import type { Ctx } from './context';

const VISIBLE = 8;

function typeName(typeId: string): string {
  const stage = strings.stage as Record<string, string>;
  return stage[typeId] ?? data.projectTypeById[typeId]?.id ?? typeId;
}

function gateName(gateId: string): string {
  return (strings.gate as Record<string, string>)[gateId] ?? gateId;
}

function describe(event: GameEvent): { text: string; tone: string } {
  switch (event.kind) {
    case 'awarded':
      return { text: strings.log.awarded(typeName(event.typeId)), tone: 'good' };
    case 'bidLost':
      return { text: strings.log.bidLost(typeName(event.typeId)), tone: '' };
    case 'inspection':
      if (!event.passed) return { text: strings.log.failed(gateName(event.gateId)), tone: 'bad' };
      return {
        text: event.minors > 0
          ? strings.log.passedWithMinors(gateName(event.gateId), event.minors)
          : strings.log.passed(gateName(event.gateId)),
        tone: 'good',
      };
    case 'payment':
      return {
        text: event.delayed
          ? strings.log.paymentDelayed(money(event.amount))
          : strings.log.payment(money(event.amount)),
        tone: event.delayed ? '' : 'good',
      };
    case 'completed':
      return {
        text: event.late
          ? strings.log.completedLate(typeName(event.typeId))
          : strings.log.completed(typeName(event.typeId)),
        tone: event.late ? '' : 'good',
      };
    case 'abandoned':
      return { text: strings.log.abandoned(typeName(event.typeId)), tone: 'bad' };
    case 'defect':
      return event.occurred
        ? { text: strings.log.defect(money(event.amount)), tone: 'bad' }
        : { text: strings.log.defectClear, tone: 'good' };
    case 'licenseUp':
      return { text: strings.log.licenseUp(event.tier), tone: 'good' };
  }
}

export interface LogPanel {
  node: HTMLElement;
  update(ctx: Ctx): void;
}

/** Rebuilt only when the tail of the log actually moved. */
export function createLog(): LogPanel {
  const list = el('div', { class: 'log-list' });
  const node = el('div', { class: 'panel' }, [
    el('details', { open: true }, [el('summary', { text: strings.log.title }), list]),
  ]);
  let lastId = '';

  function update(ctx: Ctx): void {
    const tail = ctx.state.log[ctx.state.log.length - 1];
    const id = tail?.id ?? '';
    if (id === lastId) return;
    lastId = id;
    fill(list, ctx);
  }

  return { node, update };
}

function fill(list: HTMLElement, ctx: Ctx): void {
  clear(list);
  const recent = ctx.state.log.slice(-VISIBLE).reverse();

  if (recent.length === 0) {
    list.append(el('div', { class: 'log-line', text: strings.log.empty }));
  }
  for (const event of recent) {
    const { text, tone } = describe(event);
    list.append(
      el('div', { class: tone ? `log-line ${tone}` : 'log-line' }, [
        el('span', { class: 't', text: duration(event.atSec) }),
        el('span', { text }),
      ]),
    );
  }

}
