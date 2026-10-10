// The panels that used to own the page.
//
// Order 008: the scene is the screen, so the board, the company and the log
// live in drawers that slide up from a tab bar along the bottom. They open one
// at a time, they start closed, and an open one never covers more than
// `drawerMaxHeightRatio` of the window - the site stays in sight.

import { el, toggleClass } from './dom';
import { play } from './sound';
import { strings } from './strings';
import { theme } from './theme';

export type DrawerId = 'bid' | 'company' | 'log';

export const DRAWER_IDS: DrawerId[] = ['bid', 'company', 'log'];

export interface Drawers {
  /** The tab bar and the drawer above it. */
  node: HTMLElement;
  /** Told whenever a drawer opens or closes. */
  onChange(listener: (id: DrawerId | null) => void): void;
  open(id: DrawerId): void;
  close(): void;
  toggle(id: DrawerId): void;
  openId(): DrawerId | null;
  dispose(): void;
}

export interface DrawerPanels {
  bid: HTMLElement;
  company: HTMLElement;
  log: HTMLElement;
}

/**
 * `above` rides on top of the sheet - the selected site's numbers, which must
 * stay reachable whether a drawer is open or not: a rain decision the player
 * cannot see is a site that stops.
 */
export function createDrawers(panels: DrawerPanels, above?: HTMLElement): Drawers {
  const sheet = el('div', { class: 'drawer-sheet' });
  const tabs = new Map<DrawerId, HTMLButtonElement>();

  for (const id of DRAWER_IDS) {
    const panel = panels[id];
    panel.classList.add('drawer-panel');
    panel.setAttribute('data-drawer', id);
    sheet.append(panel);
  }

  const bar = el('div', { class: 'tab-bar', role: 'tablist' });
  for (const id of DRAWER_IDS) {
    const tab = el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'data-guide': `tab-${id}`,
      'aria-selected': 'false',
    }, [labelFor(id)]);
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      play('click');
      toggle(id);
    });
    tabs.set(id, tab);
    bar.append(tab);
  }

  const node = el('div', { class: 'drawers' }, [above ?? null, sheet, bar]);
  // What is left of the window once the scene has kept its share, the tab bar
  // has its strip and the site card has the room it gets while open.
  const sc = theme.scene;
  const taken = (sc.sceneVisibleWithDrawer + sc.detailMaxRatio * sc.detailOpenRatio) * 100;
  node.style.setProperty('--drawer-max', `calc(${(100 - taken).toFixed(1)}vh - ${sc.tabBarHeight}px)`);

  let current: DrawerId | null = null;
  let listeners: ((id: DrawerId | null) => void)[] = [];
  apply();

  function apply(): void {
    toggleClass(node, 'is-open', current !== null);
    for (const [id, tab] of tabs) {
      const on = id === current;
      toggleClass(tab, 'is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const id of DRAWER_IDS) {
      toggleClass(panels[id], 'is-shown', id === current);
    }
    for (const listener of listeners) listener(current);
  }

  function open(id: DrawerId): void {
    if (current === id) return;
    current = id;
    apply();
  }

  function close(): void {
    if (current === null) return;
    current = null;
    apply();
  }

  function toggle(id: DrawerId): void {
    if (current === id) close();
    else open(id);
  }

  function dispose(): void {
    tabs.clear();
    listeners = [];
  }

  return {
    node,
    onChange: (listener) => {
      listeners = [...listeners, listener];
    },
    open,
    close,
    toggle,
    openId: () => current,
    dispose,
  };
}

/** The drawers are named after the panels they hold. */
function labelFor(id: DrawerId): string {
  if (id === 'bid') return strings.board.title;
  if (id === 'company') return strings.company.title;
  return strings.log.title;
}
