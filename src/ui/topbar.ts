// The top bar: the company's figures, and the sound toggle.
//
// Cash, debt, net worth and trust never jump to a new value — each one runs to
// it, so money arriving reads as money arriving.

import { data, netWorth } from '../core';
import { button, el, setBar, setClass, setText } from './dom';
import { money } from './format';
import { soundIcon } from './icons';
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

  const soundButton = button(soundIcon(soundEnabled()), () => {
    const on = toggleSound();
    // The click is the gesture that unlocks audio, so it is worth hearing.
    if (on) play('click');
  }, { class: 'btn small icon-only', ariaLabel: strings.settings.sound });
  refreshSoundLabel(soundButton);
  onSoundChange(() => refreshSoundLabel(soundButton));

  cash.node.setAttribute('data-guide', 'cash');
  const node = el('div', { class: 'topbar' }, [
    cash.node,
    debt.node,
    worth.node,
    trust.node,
    license,
    sites,
    el('div', { class: 'topbar-tools' }, [languageToggle(), soundButton]),
  ]);

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

function refreshSoundLabel(node: HTMLButtonElement): void {
  const on = soundEnabled();
  node.replaceChildren(soundIcon(on));
  node.setAttribute('aria-label', on ? strings.settings.soundOn : strings.settings.soundOff);
  node.setAttribute('title', on ? strings.settings.soundOn : strings.settings.soundOff);
  node.setAttribute('aria-pressed', on ? 'true' : 'false');
}
