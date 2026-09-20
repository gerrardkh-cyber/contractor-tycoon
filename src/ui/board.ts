// The tender board: three ordinary slots plus the lifeline slot.
//
// Cards persist between frames so a new invitation can slide in from the top
// and a declined or won one can slide out, rather than blinking in place.

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
import {
  bar,
  button,
  clear,
  el,
  setBar,
  setClass,
  setText,
  withIcon,
} from './dom';
import { duration, money, percent, percentSigned } from './format';
import { inspectorIcon, traitIcon } from './icons';
import { play } from './sound';
import { strings } from './strings.en';
import { theme } from './theme';
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

interface Card {
  node: HTMLElement;
  update(ctx: Ctx, rfq: Rfq, result: BidResult | undefined, hint: string | null): void;
}

export interface BoardView {
  node: HTMLElement;
  update(ctx: Ctx, results: BidResult[], hint: string | null): void;
}

export function createBoard(): BoardView {
  const title = el('div', { class: 'panel-title', text: strings.board.title });
  const streak = el('div', { class: 'site-sub' });
  const list = el('div');
  const lifelineSlot = el('div');
  const node = el('div', { class: 'panel' }, [title, streak, list, lifelineSlot]);

  const cards = new Map<string, Card>();
  const leaving = new Set<string>();
  let lifelineKey = '';

  function update(ctx: Ctx, results: BidResult[], hint: string | null): void {
    const losses = ctx.state.company.consecutiveBidLosses;
    setText(streak, losses > 0 ? strings.board.lossStreak(losses) : '');
    streak.style.display = losses > 0 ? '' : 'none';

    const ordinary = ctx.state.board.filter((rfq) => !isLifeline(rfq));
    const live = new Set(ordinary.map((rfq) => rfq.id));

    // Anything that left the board slides out, then goes.
    for (const [id, card] of cards) {
      if (live.has(id) || leaving.has(id)) continue;
      leaving.add(id);
      card.node.classList.add('is-leaving');
      globalThis.setTimeout(() => {
        card.node.remove();
        cards.delete(id);
        leaving.delete(id);
      }, theme.motion.slideOutMs);
    }

    let first = true;
    for (const rfq of ordinary) {
      let card = cards.get(rfq.id);
      if (!card) {
        card = createRfqCard(rfq);
        cards.set(rfq.id, card);
        card.node.classList.add('is-entering');
        globalThis.setTimeout(
          () => card?.node.classList.remove('is-entering'),
          theme.motion.slideInMs,
        );
        list.append(card.node);
      }
      card.update(ctx, rfq, results.find((entry) => entry.rfqId === rfq.id), first ? hint : null);
      first = false;
    }

    syncLifeline(ctx);
  }

  function syncLifeline(ctx: Ctx): void {
    const rfq = ctx.state.board.find(isLifeline);
    const cooling = ctx.state.lifelineCooldownRemainingSec > 0;
    const key = rfq ? `open:${rfq.id}` : cooling ? 'cooling' : 'none';

    if (key !== lifelineKey) {
      lifelineKey = key;
      clear(lifelineSlot);
      if (rfq) lifelineSlot.append(lifelineCard(ctx, rfq));
      else if (cooling) lifelineSlot.append(cooldownCard());
    }

    if (!rfq && cooling) {
      setText(
        lifelineSlot.querySelector('.cooldown-text'),
        strings.board.cooldown(duration(ctx.state.lifelineCooldownRemainingSec)),
      );
    }
  }

  return { node, update };
}

function createRfqCard(rfq: Rfq): Card {
  const type = data.requireProjectType(rfq.typeId);

  const minCashTag = el('span', { class: 'tag mono' });
  const node = el('div', { class: rfq.directAward ? 'rfq named' : 'rfq' }, [
    el('div', { class: 'rfq-head' }, [
      el('span', { class: 'site-type', text: typeNames[type.id] ?? type.id }),
      el('span', { class: 'rfq-price', text: money(rfq.contractBase) }),
    ]),
    el('div', { class: 'rfq-tags' }, [
      el('span', { class: 'tag mono', text: strings.site.floors(type.floors) }),
      el('span', { class: 'tag' }, [
        withIcon(traitIcon(rfq.clientTrait), traitNames[rfq.clientTrait] ?? rfq.clientTrait),
      ]),
      el('span', { class: 'tag' }, [
        withIcon(
          inspectorIcon(rfq.inspector),
          inspectorNames[rfq.inspector] ?? rfq.inspector,
        ),
      ]),
      el('span', {
        class: 'tag mono',
        text: `${strings.site.deadline} ${duration(rfq.deadlineSec)}`,
      }),
      minCashTag,
      rfq.directAward ? el('span', { class: 'tag accent', text: strings.board.named }) : null,
    ]),
  ]);

  const shortNote = el('div', { class: 'site-note' });
  const resultSlot = el('div');
  const hintSlot = el('div');

  let tiers: TierButton[] = [];
  let accept: HTMLButtonElement | null = null;

  if (rfq.directAward) {
    // A named or negotiated contract is a single Fair button, per order 003.
    accept = button(strings.board.accept, () => {
      play('click');
      currentCtx?.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: 'fair' });
    }, { class: 'btn primary' });
    node.append(el('div', { class: 'btn-row' }, [accept]));
  } else {
    tiers = (['low', 'fair', 'high'] as BidTierId[]).map((tierId) => createTier(rfq, tierId));
    node.append(el('div', { class: 'tiers' }, tiers.map((tier) => tier.node)));
    // GDD 3.1: declining refills the slot at once. Named, negotiated and
    // lifeline work is take-it-or-leave-it and has no Decline.
    node.append(
      el('div', { class: 'btn-row' }, [
        button(strings.board.decline, () => {
          play('click');
          currentCtx?.dispatch({ type: 'rejectRfq', rfqId: rfq.id });
        }, { class: 'btn small' }),
      ]),
    );
  }

  node.append(shortNote, hintSlot, resultSlot);

  let currentCtx: Ctx | null = null;
  let resultKey = '';
  let hintKey = '';

  function update(
    ctx: Ctx,
    current: Rfq,
    result: BidResult | undefined,
    hint: string | null,
  ): void {
    currentCtx = ctx;
    const affordable = canAffordBid(ctx.state, current);
    const hasSlot = activeSiteCount(ctx.state) < ctx.state.company.siteSlots;
    const blocked = !affordable || !hasSlot;

    setText(minCashTag, `${strings.board.minCash} ${money(current.minCash)}`);
    setClass(minCashTag, affordable ? 'tag mono' : 'tag mono accent');

    if (accept) accept.disabled = blocked;
    for (const tier of tiers) tier.update(ctx, current, blocked);

    const short = affordable
      ? ''
      : strings.board.short(money(current.minCash - ctx.state.company.cash));
    setText(shortNote, short);
    shortNote.style.display = short ? '' : 'none';

    const nextHint = hint ?? '';
    if (nextHint !== hintKey) {
      hintKey = nextHint;
      clear(hintSlot);
      if (hint) hintSlot.append(el('div', { class: 'hint', text: hint }));
    }

    const nextResult = result ? (result.won ? 'won' : 'lost') : '';
    if (nextResult !== resultKey) {
      resultKey = nextResult;
      clear(resultSlot);
      if (result) {
        resultSlot.append(
          el('div', {
            class: result.won ? 'rfq-result won' : 'rfq-result lost',
            text: result.won ? strings.board.won : strings.board.lost,
          }),
        );
      }
    }
  }

  return { node, update };
}

interface TierButton {
  node: HTMLButtonElement;
  update(ctx: Ctx, rfq: Rfq, blocked: boolean): void;
}

/** One bid tier: the odds as a bar, the margin as a colour. */
function createTier(rfq: Rfq, tierId: BidTierId): TierButton {
  const chanceBar = bar(0, 'bar-fill good');
  const marginLine = el('span', { class: 'tier-line' });
  const chanceLine = el('span', { class: 'tier-line' });

  const node = el('button', { class: 'tier', type: 'button' }, [
    el('span', { class: 'tier-name', text: tierNames[tierId] ?? tierId }),
    chanceLine,
    chanceBar,
    marginLine,
  ]);

  let ctxRef: Ctx | null = null;
  node.addEventListener('click', () => {
    if (node.disabled) return;
    play('click');
    ctxRef?.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: tierId });
  });

  function update(ctx: Ctx, current: Rfq, blocked: boolean): void {
    ctxRef = ctx;
    node.disabled = blocked;

    const chance = winChanceFor(ctx.state, current, tierId);
    setText(chanceLine, `${strings.board.winChance} ${percent(chance)}`);
    setBar(chanceBar, chance);

    const estimate = estimateMargin(ctx.state, current, tierId);
    setText(marginLine, `${strings.board.margin} ${percentSigned(estimate.ratio)}`);
    setClass(marginLine, estimate.ratio >= 0 ? 'tier-line good' : 'tier-line bad');
  }

  return { node, update };
}

function lifelineCard(ctx: Ctx, rfq: Rfq): HTMLElement {
  return el('div', { class: 'rfq lifeline' }, [
    el('div', { class: 'rfq-head' }, [
      el('span', { class: 'site-type', text: strings.board.repairTitle }),
      el('span', { class: 'rfq-price', text: money(rfq.contractBase) }),
    ]),
    el('div', { class: 'site-sub', text: strings.board.repairBlurb }),
    el('div', { class: 'btn-row' }, [
      button(strings.board.takeRepair, () => {
        play('click');
        ctx.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: 'fair' });
      }, { class: 'btn primary' }),
    ]),
  ]);
}

function cooldownCard(): HTMLElement {
  return el('div', { class: 'rfq lifeline' }, [
    el('div', { class: 'site-type', text: strings.board.repairTitle }),
    el('div', { class: 'site-sub cooldown-text' }),
  ]);
}
