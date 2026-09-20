// Company panel: subcontractor levels, the next site slot, licence progress,
// prestige placeholder, and the (hidden) ad hooks.

import {
  data,
  netWorth,
  nextSiteSlotCost,
  subInspectionBonus,
  subTimeMultiplier,
  upgradeCost,
  type SubId,
} from '../core';
import { bar, button, clear, el } from './dom';
import { duration, money, multiplier, percentSigned } from './format';
import { strings } from './strings.en';
import { theme } from './theme';
import type { Ctx } from './context';

const subNames = strings.company.subs as Record<string, string>;

function subRow(ctx: Ctx, subId: SubId): HTMLElement {
  const level = ctx.state.company.subLevels[subId];
  const max = data.balance.subcontractors.maxLevel;
  const atMax = level >= max;
  const cost = atMax ? 0 : upgradeCost(level);
  const affordable = ctx.state.company.cash >= cost;

  return el('div', { class: 'sub-row' }, [
    el('div', { class: 'sub-name' }, [
      el('div', { text: subNames[subId] ?? subId }),
      el('div', {
        class: 'sub-effect',
        text: strings.company.subEffect(
          multiplier(subTimeMultiplier(level)),
          percentSigned(subInspectionBonus(level)),
        ),
      }),
    ]),
    el('span', { class: 'tag', text: strings.company.level(level) }),
    atMax
      ? el('span', { class: 'site-sub', text: strings.company.maxLevel })
      : button(`${strings.company.upgrade} ${money(cost)}`, () => {
          ctx.dispatch({ type: 'upgradeSub', subId });
        }, { class: 'btn small', disabled: !affordable }),
  ]);
}

function licenseBlock(ctx: Ctx): HTMLElement {
  const unlock = data.balance.license.unlocks[0];
  if (!unlock) return el('div');

  const { company } = ctx.state;
  if (company.licenseTier >= unlock.tier) {
    return el('div', { class: 'site-note info', text: strings.company.licenseHeld });
  }

  const worth = netWorth(ctx.state);
  return el('div', {}, [
    el('div', { class: 'site-head' }, [
      el('span', { text: strings.company.licenseProgress }),
      el('span', {
        class: 'site-sub',
        text: strings.company.licenseNeeds(
          Math.min(company.completedProjects, unlock.completedProjects),
          unlock.completedProjects,
          money(Math.max(0, worth)),
          money(unlock.netWorth),
        ),
      }),
    ]),
    bar(Math.min(worth / unlock.netWorth, company.completedProjects / unlock.completedProjects)),
  ]);
}

function adHooks(): HTMLElement | null {
  if (!theme.adHooksEnabled) return null;
  const minutes = duration(data.balance.boosts.doubleIncomeSec);
  return el('div', { class: 'btn-row' }, [
    button(strings.ads.doubleIncome(minutes), () => {}, { class: 'btn small' }),
    button(strings.ads.clearRain, () => {}, { class: 'btn small' }),
    button(strings.ads.instantRework, () => {}, { class: 'btn small' }),
  ]);
}

export function renderCompany(host: HTMLElement, ctx: Ctx): void {
  clear(host);
  host.append(el('div', { class: 'panel-title', text: strings.company.title }));
  host.append(el('div', { class: 'site-sub', text: strings.company.subcontractors }));

  for (const subId of data.subIds) host.append(subRow(ctx, subId));

  const slotCost = nextSiteSlotCost(ctx.state);
  if (slotCost !== null) {
    host.append(
      el('div', { class: 'sub-row' }, [
        el('div', { class: 'sub-name', text: strings.topBar.sites }),
        button(strings.site.buySlot(money(slotCost)), () => ctx.dispatch({ type: 'buySiteSlot' }), {
          class: 'btn small',
          disabled: ctx.state.company.cash < slotCost,
        }),
      ]),
    );
  }

  host.append(licenseBlock(ctx));

  const ads = adHooks();
  if (ads) host.append(ads);

  host.append(
    el('div', { class: 'footer-bar' }, [
      button(strings.company.prestige, () => {}, { class: 'btn small', disabled: true }),
      button(strings.settings.open, () => ctx.openSettings(), { class: 'btn small' }),
    ]),
  );
}
