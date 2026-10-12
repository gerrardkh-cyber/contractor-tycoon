// The top bar: the company's figures, and the sound toggle.
//
// Cash, debt, net worth and trust never jump to a new value — each one runs to
// it, so money arriving reads as money arriving.

import { data, netWorth } from '../core';
import { button, el, setBar, setClass, setText } from './dom';
import { money } from './format';
import { gearIcon, soundIcon } from './icons';
import { languageToggle } from './language';
import { labelWithTip } from './tooltip';
import { NumberTween } from './motion';
import { onSoundChange, play, soundEnabled, toggleSound } from './sound';
import { strings } from './strings';
import type { Ctx } from './context';

export interface TopBar {
  node: HTMLElement;
  update(ctx: Ctx, now: number): void;
}

export function createTopBar(ctx: Ctx): TopBar {
  const cash = tweenStat(strings.topBar.cash);
  const debt = tweenStat(strings.topBar.debt, 'bad');
  const worth = tweenStat(strings.topBar.netWorth);
  const trust = tweenStat(strings.topBar.trust, 'plain');
  const trustBar = el('div', { class: 'bar thin' }, [el('div', { class: 'bar-fill trust' })]);
  trust.node.append(trustBar);

  const license = el('div', { class: 'stat' }, [
    labelWithTip(strings.topBar.license, strings.terms.license),
    el('span', { class: 'stat-value' }),
  ]);
  const sites = el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: strings.topBar.sites }),
    el('span', { class: 'stat-value' }),
  ]);

  cash.node.setAttribute('data-guide', 'cash');
  // Order 011 §7: on a phone the bar is one line - cash, trust and sites.
  // Licence and net worth are the extras: tapping any chip shows them too.
  // Language and sound fold into the settings, behind one gear at the right.
  worth.node.classList.add('is-extra');
  license.classList.add('is-extra');
  debt.node.classList.add('is-extra');
  const chips = [cash.node, debt.node, worth.node, trust.node, license, sites];
  const gear = button(gearIcon(), () => ctx.openSettings(), {
    class: 'btn small icon-only topbar-gear',
    ariaLabel: strings.settings.open,
  });
  const node = el('div', { class: 'topbar' }, [
    ...chips,
    el('div', { class: 'topbar-tools' }, [languageToggle(), soundToggleButton()]),
    gear,
  ]);
  for (const chip of chips) {
    chip.addEventListener('click', () => node.classList.toggle('is-expanded'));
  }

  const company = ctx.state.company;
  cash.tween.reset(company.cash);
  debt.tween.reset(company.debt);
  worth.tween.reset(netWorth(ctx.state));
  trust.tween.reset(company.trust);

  function update(context: Ctx, now: number): void {
    const current = context.state.company;

    cash.tween.set(current.cash, now);
    setText(cash.value, money(cash.tween.value(now)));

    debt.tween.set(current.debt, now);
    setText(debt.value, money(debt.tween.value(now)));
    debt.node.style.display = current.debt > 0 ? '' : 'none';

    const netNow = netWorth(context.state);
    worth.tween.set(netNow, now);
    const shown = worth.tween.value(now);
    setText(worth.value, money(shown));
    setClass(worth.value, shown < 0 ? 'stat-value bad' : 'stat-value');

    trust.tween.set(current.trust, now);
    const trustNow = trust.tween.value(now);
    setText(trust.value, String(Math.round(trustNow)));
    setBar(trustBar, trustNow / data.balance.trust.max);

    setText(license.querySelector('.stat-value'), String(current.licenseTier));
    setText(
      sites.querySelector('.stat-value'),
      `${context.state.projects.length} / ${current.siteSlots}`,
    );
  }

  return { node, update };
}

interface TweenStat {
  node: HTMLElement;
  value: HTMLElement;
  tween: NumberTween;
}

function tweenStat(label: string, extra?: string): TweenStat {
  const value = el('span', { class: extra ? `stat-value ${extra}` : 'stat-value' });
  const node = el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    value,
  ]);
  return { node, value, tween: new NumberTween(0) };
}

/** The sound on/off switch; the HUD and the settings each carry one. */
export function soundToggleButton(): HTMLButtonElement {
  const node = button(soundIcon(soundEnabled()), () => {
    const on = toggleSound();
    // The click is the gesture that unlocks audio, so it is worth hearing.
    if (on) play('click');
  }, { class: 'btn small icon-only', ariaLabel: strings.settings.sound });
  refreshSoundLabel(node);
  // The HUD is rebuilt on a language change and the settings on every
  // opening: once this button has been on screen and is gone, it lets go.
  let shown = false;
  const off = onSoundChange(() => {
    if (node.isConnected) shown = true;
    else if (shown) {
      off();
      return;
    }
    refreshSoundLabel(node);
  });
  return node;
}

function refreshSoundLabel(node: HTMLButtonElement): void {
  const on = soundEnabled();
  node.replaceChildren(soundIcon(on));
  node.setAttribute('aria-label', on ? strings.settings.soundOn : strings.settings.soundOff);
  node.setAttribute('title', on ? strings.settings.soundOn : strings.settings.soundOff);
  node.setAttribute('aria-pressed', on ? 'true' : 'false');
}
