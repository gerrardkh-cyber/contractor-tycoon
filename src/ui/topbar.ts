import { data, netWorth } from '../core';
import { bar, clear, el, stat } from './dom';
import { money } from './format';
import { strings } from './strings.en';
import type { Ctx } from './context';

export function renderTopBar(host: HTMLElement, ctx: Ctx): void {
  const { company } = ctx.state;
  clear(host);

  host.append(stat(strings.topBar.cash, money(company.cash)));
  if (company.debt > 0) {
    host.append(stat(strings.topBar.debt, money(company.debt), 'bad'));
  }

  const worth = netWorth(ctx.state);
  host.append(stat(strings.topBar.netWorth, money(worth), worth < 0 ? 'bad' : undefined));

  const trust = el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: strings.topBar.trust }),
    el('span', { class: 'stat-value', text: String(Math.round(company.trust)) }),
    bar(company.trust / data.balance.trust.max, 'bar-fill trust'),
  ]);
  host.append(trust);

  host.append(stat(strings.topBar.license, String(company.licenseTier)));
  host.append(
    stat(strings.topBar.sites, `${ctx.state.projects.length} / ${company.siteSlots}`),
  );
}
