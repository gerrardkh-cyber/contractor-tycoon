// The tender board: three ordinary slots plus the lifeline slot.

import {
  activeSiteCount,
  canAffordBid,
  data,
  estimateMargin,
  isLifeline,
  winChanceFor,
  type BidTierId,
  type Rfq,
} from '../core';
import { button, clear, el } from './dom';
import { duration, money, percent, percentSigned } from './format';
import { strings } from './strings.en';
import type { Ctx } from './context';

const tierNames = strings.board.tiers as Record<string, string>;
const traitNames = strings.board.traits as Record<string, string>;
const inspectorNames = strings.board.inspectors as Record<string, string>;
const typeNames = strings.stage as Record<string, string>;

/** Bid results linger on the card for a moment before the slot refills. */
export interface BidResult {
  rfqId: string;
  won: boolean;
  until: number;
}

function tierButton(ctx: Ctx, rfq: Rfq, tierId: BidTierId, blocked: boolean): HTMLElement {
  const chance = winChanceFor(ctx.state, rfq, tierId);
  const estimate = estimateMargin(ctx.state, rfq, tierId);
  const node = el('button', {
    class: 'tier',
    type: 'button',
    disabled: blocked,
  }, [
    el('span', { class: 'tier-name', text: tierNames[tierId] ?? tierId }),
    el('span', { class: 'tier-line', text: `${strings.board.winChance} ${percent(chance)}` }),
    el('span', {
      class: estimate.ratio >= 0 ? 'tier-line good' : 'tier-line bad',
      text: `${strings.board.margin} ${percentSigned(estimate.ratio)}`,
    }),
  ]);
  node.addEventListener('click', () => {
    if (!blocked) ctx.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: tierId });
  });
  return node;
}

function lifelineCard(ctx: Ctx, rfq: Rfq): HTMLElement {
  return el('div', { class: 'rfq lifeline' }, [
    el('div', { class: 'rfq-head' }, [
      el('span', { class: 'site-type', text: strings.board.repairTitle }),
      el('span', { class: 'stat-value', text: money(rfq.contractBase) }),
    ]),
    el('div', { class: 'site-sub', text: strings.board.repairBlurb }),
    el('div', { class: 'btn-row' }, [
      button(strings.board.takeRepair, () => {
        ctx.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: 'fair' });
      }, { class: 'btn primary' }),
    ]),
  ]);
}

function rfqCard(ctx: Ctx, rfq: Rfq, result: BidResult | undefined): HTMLElement {
  const type = data.requireProjectType(rfq.typeId);
  const affordable = canAffordBid(ctx.state, rfq);
  const hasSlot = activeSiteCount(ctx.state) < ctx.state.company.siteSlots;
  const blocked = !affordable || !hasSlot;

  const card = el('div', { class: rfq.directAward ? 'rfq named' : 'rfq' }, [
    el('div', { class: 'rfq-head' }, [
      el('span', { class: 'site-type', text: typeNames[type.id] ?? type.id }),
      el('span', { class: 'stat-value', text: money(rfq.contractBase) }),
    ]),
    el('div', { class: 'rfq-tags' }, [
      el('span', { class: 'tag', text: strings.site.floors(type.floors) }),
      el('span', { class: 'tag', text: traitNames[rfq.clientTrait] ?? rfq.clientTrait }),
      el('span', { class: 'tag', text: inspectorNames[rfq.inspector] ?? rfq.inspector }),
      el('span', { class: 'tag', text: `${strings.site.deadline} ${duration(rfq.deadlineSec)}` }),
      el('span', {
        class: affordable ? 'tag' : 'tag accent',
        text: `${strings.board.minCash} ${money(rfq.minCash)}`,
      }),
      rfq.directAward ? el('span', { class: 'tag accent', text: strings.board.named }) : null,
    ]),
  ]);

  if (rfq.directAward) {
    // A named or negotiated contract is a single Fair button, per order 003.
    card.append(
      el('div', { class: 'btn-row' }, [
        button(strings.board.accept, () => {
          ctx.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: 'fair' });
        }, { class: 'btn primary', disabled: blocked }),
      ]),
    );
  } else {
    card.append(
      el('div', { class: 'tiers' }, [
        tierButton(ctx, rfq, 'low', blocked),
        tierButton(ctx, rfq, 'fair', blocked),
        tierButton(ctx, rfq, 'high', blocked),
      ]),
    );
    // GDD 3.1: declining refills the slot at once. Named, negotiated and
    // lifeline work is take-it-or-leave-it and has no Decline.
    card.append(
      el('div', { class: 'btn-row' }, [
        button(strings.board.decline, () => {
          ctx.dispatch({ type: 'rejectRfq', rfqId: rfq.id });
        }, { class: 'btn small' }),
      ]),
    );
  }

  if (!affordable) {
    card.append(
      el('div', {
        class: 'site-note',
        text: strings.board.short(money(rfq.minCash - ctx.state.company.cash)),
      }),
    );
  }

  if (result) {
    card.append(
      el('div', {
        class: result.won ? 'rfq-result won' : 'rfq-result lost',
        text: result.won ? strings.board.won : strings.board.lost,
      }),
    );
  }

  return card;
}

export function renderBoard(
  host: HTMLElement,
  ctx: Ctx,
  results: BidResult[],
  hint: string | null,
): void {
  clear(host);
  host.append(el('div', { class: 'panel-title', text: strings.board.title }));

  const losses = ctx.state.company.consecutiveBidLosses;
  if (losses > 0) {
    host.append(el('div', { class: 'site-sub', text: strings.board.lossStreak(losses) }));
  }

  const ordinary = ctx.state.board.filter((rfq) => !isLifeline(rfq));
  const lifeline = ctx.state.board.find(isLifeline);

  let first = true;
  for (const rfq of ordinary) {
    const result = results.find((entry) => entry.rfqId === rfq.id);
    const card = rfqCard(ctx, rfq, result);
    if (first && hint) card.append(el('div', { class: 'hint', text: hint }));
    first = false;
    host.append(card);
  }

  if (lifeline) {
    host.append(lifelineCard(ctx, lifeline));
  } else if (ctx.state.lifelineCooldownRemainingSec > 0) {
    host.append(
      el('div', { class: 'rfq lifeline' }, [
        el('div', { class: 'site-type', text: strings.board.repairTitle }),
        el('div', {
          class: 'site-sub',
          text: strings.board.cooldown(duration(ctx.state.lifelineCooldownRemainingSec)),
        }),
      ]),
    );
  }
}
