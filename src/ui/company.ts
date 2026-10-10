// Company panel: subcontractor trades, the next site slot, licence progress,
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
import { bar, button, clear, el, gauge, setBar, setGauge, setText, withIcon } from './dom';
import { duration, money, multiplier, percentSigned } from './format';
import { subIcon } from './icons';
import { play } from './sound';
import { strings } from './strings';
import { theme } from './theme';
import type { Ctx } from './context';

const subName = (id: string): string => (strings.company.subs as Record<string, string>)[id] ?? id;

export interface CompanyPanel {
  node: HTMLElement;
  update(ctx: Ctx): void;
}

export function createCompanyPanel(ctx: Ctx): CompanyPanel {
  const rows = data.subIds.map((subId) => createSubRow(subId));
  const slotSlot = el('div');
  const licenseSlot = el('div');

  const trades = el('div', { class: 'sub-list', 'data-guide': 'subcontractors' }, [
    el('div', { class: 'site-sub', text: strings.company.subcontractors }),
    ...rows.map((row) => row.node),
  ]);

  const node = el('div', { class: 'panel company-panel' }, [
    el('div', { class: 'panel-title', text: strings.company.title }),
    trades,
    slotSlot,
    licenseSlot,
    adHooks(),
    el('div', { class: 'footer-bar' }, [
      button(strings.company.prestige, () => undefined, { class: 'btn small', disabled: true }),
      button(strings.settings.open, () => {
        play('click');
        ctx.openSettings();
      }, { class: 'btn small' }),
    ]),
  ]);

  let slotKey = '';
  let licenseKey = '';

  function update(context: Ctx): void {
    for (const row of rows) row.update(context);

    const cost = nextSiteSlotCost(context.state);
    const affordable = cost !== null && context.state.company.cash >= cost;
    const key = `${cost ?? 'none'}:${affordable}`;
    if (key !== slotKey) {
      slotKey = key;
      clear(slotSlot);
      if (cost !== null) {
        slotSlot.append(
          el('div', { class: 'sub-row' }, [
            el('div', { class: 'sub-name', text: strings.topBar.sites }),
            button(strings.site.buySlot(money(cost)), () => {
              play('click');
              context.dispatch({ type: 'buySiteSlot' });
            }, { class: 'btn small', disabled: !affordable }),
          ]),
        );
      }
    }

    syncLicense(context);
  }

  function syncLicense(context: Ctx): void {
    const unlock = data.balance.license.unlocks[0];
    if (!unlock) return;

    const { company } = context.state;
    const held = company.licenseTier >= unlock.tier;
    const worth = netWorth(context.state);
    const done = Math.min(company.completedProjects, unlock.completedProjects);

    if (held) {
      if (licenseKey !== 'held') {
        licenseKey = 'held';
        clear(licenseSlot);
        licenseSlot.append(
          el('div', { class: 'site-note info', text: strings.company.licenseHeld }),
        );
      }
      return;
    }

    if (licenseKey !== 'progress') {
      licenseKey = 'progress';
      clear(licenseSlot);
      licenseSlot.append(
        el('div', {}, [
          el('div', { class: 'site-head' }, [
            el('span', { text: strings.company.licenseProgress }),
            el('span', { class: 'site-sub license-needs' }),
          ]),
          bar(0),
        ]),
      );
    }

    setText(
      licenseSlot.querySelector('.license-needs'),
      strings.company.licenseNeeds(
        done,
        unlock.completedProjects,
        money(Math.max(0, worth)),
        money(unlock.netWorth),
      ),
    );
    const progressBar = licenseSlot.querySelector('.bar');
    if (progressBar) {
      setBar(
        progressBar,
        Math.min(worth / unlock.netWorth, company.completedProjects / unlock.completedProjects),
      );
    }
  }

  return { node, update };
}

interface SubRow {
  node: HTMLElement;
  update(ctx: Ctx): void;
}

/** One trade: its icon, what its level buys, and a gauge rather than dots. */
function createSubRow(subId: SubId): SubRow {
  const max = data.balance.subcontractors.maxLevel;
  const effect = el('div', { class: 'sub-effect' });
  const levelGauge = gauge(0, max);
  const action = el('div');

  const node = el('div', { class: 'sub-row' }, [
    el('div', { class: 'sub-name' }, [
      withIcon(subIcon(subId), el('div', { text: subName(subId) })),
      effect,
    ]),
    levelGauge,
    action,
  ]);

  let actionKey = '';

  function update(context: Ctx): void {
    const level = context.state.company.subLevels[subId];
    setText(
      effect,
      strings.company.subEffect(
        multiplier(subTimeMultiplier(level)),
        percentSigned(subInspectionBonus(level)),
      ),
    );
    setGauge(levelGauge, level, max);

    const atMax = level >= max;
    const cost = atMax ? 0 : upgradeCost(level);
    const affordable = context.state.company.cash >= cost;
    const key = `${level}:${affordable}`;
    if (key === actionKey) return;
    actionKey = key;

    clear(action);
    action.append(
      atMax
        ? el('span', { class: 'site-sub', text: strings.company.maxLevel })
        : button(`${strings.company.upgrade} ${money(cost)}`, () => {
            play('click');
            context.dispatch({ type: 'upgradeSub', subId });
          }, { class: 'btn small', disabled: !affordable }),
    );
  }

  return { node, update };
}

function adHooks(): HTMLElement | null {
  if (!theme.adHooksEnabled) return null;
  const minutes = duration(data.balance.boosts.doubleIncomeSec);
  return el('div', { class: 'btn-row' }, [
    button(strings.ads.doubleIncome(minutes), () => undefined, { class: 'btn small' }),
    button(strings.ads.clearRain, () => undefined, { class: 'btn small' }),
    button(strings.ads.instantRework, () => undefined, { class: 'btn small' }),
  ]);
}
