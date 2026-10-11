// The site is the screen.
//
// Order 008 turns the layout inside out: this scene fills the window, the
// numbers float over it, and the panels that used to own the page are drawers
// that slide up from the bottom. Everything the player is actually doing -
// framing, pouring, failing an inspection, getting paid - happens out here.
//
// The scene is built once and patched. Layers, back to front:
//
//   sky -> skyline far -> skyline near -> ground -> plots -> actors -> weather
//
// The skylines and the ground are image slots (order 009): when the import
// script has put a picture in src/ui/art-files.ts they show it, and otherwise
// they draw themselves as vectors. The sky, the rain and the hoarding are
// always vectors.

import { data, type GameState, type Project } from '../core';
import { createActors, type Actors } from './actors';
import { createBuildingView, geometryFor, type BuildingView } from './building';
import { clear, el, svgEl, toggleClass } from './dom';
import { motionAllowed } from './motion';
import { renderSlotCard } from './site';
import { theme } from './theme';
import { artFor, type ArtPiece } from './art';
import type { Ctx } from './context';

export interface Scene {
  node: HTMLElement;
  /** Which site the detail card should be showing, or null for none. */
  selectedId(): string | null;
  select(projectId: string | null): void;
  onSelect(listener: (projectId: string | null) => void): void;
  update(ctx: Ctx): void;
  /** Redraws what the scene says in words. Called on a language change. */
  relabel(): void;
  /** A gate passed on this site. */
  pass(projectId: string, gateId: string): void;
  /** A gate failed: blink the floor it was on. */
  fail(projectId: string, floor: number | null): void;
  /** Money landed: fly it to the cash figure. */
  payment(projectId: string, amount: number): void;
  /** Handover: flash the building and raise the flag. */
  completed(projectId: string): void;
  dispose(): void;
}

export interface SceneHost {
  /** The HUD figure money flies to. */
  cashAnchor(): Element | null;
}

interface Plot {
  node: HTMLElement;
  building: BuildingView;
  actors: Actors;
  floors: number;
}

export function createScene(host: SceneHost): Scene {
  const sky = el('div', { class: 'scene-sky' });
  const skylineFar = skyline('far', theme.scene.skylineFarCount, theme.scene.skylineFarHeight);
  const skylineNear = skyline('near', theme.scene.skylineNearCount, theme.scene.skylineNearHeight);
  const ground = groundLayer();
  const row = el('div', { class: 'scene-row', 'data-guide': 'scene-row' });
  const weather = weatherLayer();
  const coins = el('div', { class: 'scene-coins' });

  const node = el('div', { class: 'scene', 'data-phase': 'day' }, [
    sky,
    skylineFar,
    skylineNear,
    ground,
    row,
    weather,
    coins,
  ]);

  const plots = new Map<string, Plot>();
  /** Handed-over sites, and when their plot may go. */
  const leaving = new Map<string, number>();
  let lots = 0;
  let slotKey = '';
  let selected: string | null = null;
  let listeners: ((id: string | null) => void)[] = [];
  let phase = '';
  let wet: boolean | null = null;
  let scale = 0;
  let frame = 0;

  const onResize = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      rescale();
    });
  };
  globalThis.addEventListener('resize', onResize);

  /**
   * One scale for the whole row, so the buildings are to each other what they
   * are in the fiction: a block of `referenceFloors` fills `maxBuildingRatio`
   * of the scene, and a house is small because it is small.
   *
   * Height decides it when there is room. When there is not - several sites,
   * or a phone - width decides it instead, and below `minPlotWidthPx` the row
   * stops shrinking and scrolls.
   */
  function rescale(): void {
    const sc = theme.scene;
    const height = node.clientHeight || globalThis.innerHeight;
    const width = node.clientWidth || globalThis.innerWidth;
    const unitWidth = theme.svg.width;

    // Only the room above the ground line is the building's to use, the HUD
    // has the top of it, and the ground line itself rises when the site card
    // opens. Buildings are sized for the tighter of the two, so they never
    // overflow and never resize under the player.
    const withCard = 1 - sc.detailMaxRatio - (sc.tabBarHeight + sc.plotGapPx) / height;
    const room = height * Math.min(sc.groundRatio, withCard) - sc.hudRoomPx;
    const byHeight = (room * sc.maxBuildingRatio) / geometryFor(sc.referenceFloors).structureHeight;
    const columns = Math.max(1, plots.size + lots * sc.lotWidthRatio);
    const gaps = (columns + 1) * sc.plotGapPx;
    const byWidth = (width - gaps) / (columns * unitWidth);

    const next = Math.max(sc.minPlotWidthPx / unitWidth, Math.min(byHeight, byWidth));
    if (Math.abs(next - scale) < 0.01) return;
    scale = next;
    for (const plot of plots.values()) sizePlot(plot);
    sizeLots();
  }

  function sizePlot(plot: Plot): void {
    const g = plot.building.geometry;
    const width = Math.round(theme.svg.width * scale);
    plot.node.style.width = `${width}px`;
    plot.building.node.style.width = `${width}px`;
    plot.building.node.style.height = `${Math.round(g.height * scale)}px`;
  }

  /** A hoarding needs less room than a building. */
  function sizeLots(): void {
    const width = Math.round(theme.svg.width * scale * theme.scene.lotWidthRatio);
    for (const lot of row.querySelectorAll<HTMLElement>('.plot.is-empty')) {
      lot.style.width = `${width}px`;
    }
  }

  function update(context: Ctx): void {
    if (scale === 0) rescale();
    syncPhase();
    syncWeather(context.state);
    syncPlots(context);
  }

  /** Four minutes of real time, morning to night. */
  function syncPhase(): void {
    const cycle = theme.daylight.cycleMs;
    const phases = theme.daylight.phases;
    const slice = cycle / phases.length;
    const index = Math.floor((Date.now() % cycle) / slice) % phases.length;
    const next = phases[index] ?? 'day';
    if (next === phase) return;
    phase = next;
    node.setAttribute('data-phase', next);
  }

  function syncWeather(state: GameState): void {
    if (state.weather.raining === wet) return;
    wet = state.weather.raining;
    toggleClass(node, 'is-raining', wet);
  }

  function syncPlots(context: Ctx): void {
    const live = new Set(context.state.projects.map((project) => project.id));
    const now = performance.now();
    for (const [id, plot] of plots) {
      if (live.has(id)) {
        leaving.delete(id);
        continue;
      }
      // A finished site does not blink out of existence: the frame that drops
      // it from the state is the frame before the handover is announced, and
      // the flash, the flag and the cheer all belong to this building.
      const due = leaving.get(id);
      if (due === undefined) {
        leaving.set(id, now + theme.scene.celebrateMs + theme.motion.slideInMs);
        plot.node.classList.add('is-leaving');
        continue;
      }
      if (now < due) continue;
      leaving.delete(id);
      plot.building.dispose();
      plot.actors.dispose();
      plot.node.remove();
      plots.delete(id);
    }

    for (const project of context.state.projects) {
      let plot = plots.get(project.id);
      const fresh = plot === undefined;
      if (!plot) {
        plot = buildPlot(project);
        plots.set(project.id, plot);
        rescale();
        sizePlot(plot);
      }
      plot.building.update(project, context.state);
      plot.actors.update(project, context.state);
      toggleClass(plot.node, 'is-selected', project.id === selected);
      if (fresh && project.id === selected) bringIntoView(selected);
    }

    syncLots(context);
    syncSelection(context.state);
  }

  /**
   * Empty lots keep their place in the row, so the room to grow is on screen
   * from the first minute. Repair work is excluded: it takes no slot.
   */
  function syncLots(context: Ctx): void {
    const maxSlots = data.balance.sites.maxSlots;
    const running = context.state.projects.filter((p) => !isRepair(p.typeId)).length;
    const first = running + 1;
    const key = [first, maxSlots, context.state.company.siteSlots, shortfallStep(context)].join(':');
    if (key === slotKey) return;
    slotKey = key;

    for (const lot of row.querySelectorAll('.plot.is-empty')) lot.remove();
    for (let slot = first; slot <= maxSlots; slot += 1) {
      row.append(
        el('div', { class: 'plot is-empty' }, [fence(), renderSlotCard(context, slot)]),
      );
    }
    lots = Math.max(0, maxSlots - first + 1);
    rescale();
    sizeLots();
  }

  /** The sign only needs redrawing when the shortfall moves in round figures. */
  function shortfallStep(context: Ctx): number {
    return Math.round(context.state.company.cash / theme.scene.signRedrawStep);
  }

  function isRepair(typeId: string): boolean {
    return data.projectTypeById[typeId]?.lifeline === true;
  }

  function buildPlot(project: Project): Plot {
    const type = data.requireProjectType(project.typeId);
    const building = createBuildingView(type.floors);
    const actors = createActors(building.geometry);
    const node = el('div', { class: 'plot', 'data-guide': 'site-plot', role: 'button' }, [
      building.node,
      actors.node,
    ]);
    node.addEventListener('click', () => select(project.id));
    // Empty lots always come after the running sites.
    const firstLot = row.querySelector('.plot.is-empty');
    if (firstLot) row.insertBefore(node, firstLot);
    else row.append(node);
    return { node, building, actors, floors: type.floors };
  }

  /**
   * With nothing chosen, the scene shows the site the player is on. This runs
   * inside a paint, so it changes the selection quietly: the paint it is part
   * of is about to draw the card anyway, and telling the shell here would send
   * it round again.
   */
  function syncSelection(state: GameState): void {
    if (selected !== null && state.projects.some((p) => p.id === selected)) return;
    choose(state.projects[0]?.id ?? null, false);
  }

  function select(projectId: string | null): void {
    choose(projectId, true);
  }

  function choose(projectId: string | null, tell: boolean): void {
    if (projectId === selected) return;
    selected = projectId;
    for (const [id, plot] of plots) toggleClass(plot.node, 'is-selected', id === projectId);
    bringIntoView(projectId);
    if (!tell) return;
    for (const listener of listeners) listener(projectId);
  }

  /**
   * On a narrow screen the row is wider than the window, and what the player
   * is building should be what they are looking at.
   */
  function bringIntoView(projectId: string | null): void {
    const plot = projectId === null ? null : plots.get(projectId);
    if (!plot) return;
    const left = plot.node.offsetLeft - (row.clientWidth - plot.node.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: motionAllowed() ? 'smooth' : 'auto' });
  }

  function pass(projectId: string, gateId: string): void {
    plots.get(projectId)?.building.markPass(gateId);
    plots.get(projectId)?.actors.inspect(true);
  }

  function fail(projectId: string, floor: number | null): void {
    plots.get(projectId)?.building.markFail(floor);
    plots.get(projectId)?.actors.inspect(false);
  }

  function completed(projectId: string): void {
    plots.get(projectId)?.building.celebrate();
    plots.get(projectId)?.actors.cheer();
  }

  /** Coins lift off the building and land on the cash figure. */
  function payment(projectId: string, _amount: number): void {
    const plot = plots.get(projectId);
    const anchor = host.cashAnchor();
    if (!plot || !anchor) return;

    const from = plot.building.node.getBoundingClientRect();
    const to = anchor.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const startX = from.left - box.left + from.width / 2;
    const startY = from.top - box.top + from.height / 3;
    const endX = to.left - box.left + to.width / 2;
    const endY = to.top - box.top + to.height / 2;

    for (let i = 0; i < theme.scene.coinCount; i += 1) {
      const coin = el('div', { class: 'coin' });
      const spread = (i - (theme.scene.coinCount - 1) / 2) * theme.scene.coinRadius * 2;
      coin.style.left = `${Math.round(startX + spread)}px`;
      coin.style.top = `${Math.round(startY)}px`;
      coin.style.animationDelay = `${i * theme.scene.coinStaggerMs}ms`;
      coin.style.setProperty('--fly-x', `${Math.round(endX - startX - spread)}px`);
      coin.style.setProperty('--fly-y', `${Math.round(endY - startY)}px`);
      coins.append(coin);
      const life = theme.scene.coinFlightMs + i * theme.scene.coinStaggerMs;
      globalThis.setTimeout(() => coin.remove(), life + theme.motion.flashMs);
    }
  }

  function dispose(): void {
    globalThis.removeEventListener('resize', onResize);
    if (frame) cancelAnimationFrame(frame);
    for (const plot of plots.values()) {
      plot.building.dispose();
      plot.actors.dispose();
    }
    plots.clear();
    leaving.clear();
    listeners = [];
    clear(node);
  }

  function relabel(): void {
    slotKey = '';
  }

  return {
    node,
    selectedId: () => selected,
    relabel,
    select,
    onSelect: (listener) => {
      listeners = [...listeners, listener];
    },
    update,
    pass,
    fail,
    payment,
    completed,
    dispose,
  };
}

// ---- layers ---------------------------------------------------------------

/**
 * A strip that tiles sideways, from its image slot. Null when the slot has no
 * picture and the layer should draw itself instead.
 */
function stripArt(piece: ArtPiece, className: string): HTMLElement | null {
  const file = artFor(piece);
  if (!file) return null;
  const node = el('div', { class: `${className} is-art` });
  node.style.backgroundImage = `url(${file.url})`;
  node.style.backgroundRepeat = 'repeat-x';
  node.style.backgroundSize = 'auto 100%';
  node.style.backgroundPosition = 'left bottom';
  return node;
}

/**
 * The ground band, and - when there is one - the ground picture laid along
 * it with its own dirt line on the scene's.
 */
function groundLayer(): HTMLElement {
  const band = el('div', { class: 'scene-ground' });
  const file = artFor('ground');
  if (!file) return band;

  const height = theme.scene.groundArtHeightPx;
  const line = ((file.groundLine ?? 0) / file.h) * height;
  const strip = el('div', { class: 'scene-ground-art' });
  strip.style.backgroundImage = `url(${file.url})`;
  strip.style.backgroundSize = `auto ${height}px`;
  strip.style.height = `${height}px`;
  // The strip hangs from the ground line by however much of it is above the dirt.
  strip.style.transform = `translateY(${(-line).toFixed(1)}px)`;
  band.append(strip);
  return band;
}

/**
 * A city behind the site, drawn as blocks of varied height from one seed so
 * the skyline is the same every time the game is opened.
 */
function skyline(depth: 'far' | 'near', count: number, heightRatio: number): Element {
  const art = stripArt(depth === 'far' ? 'skyline-far' : 'skyline-near', `scene-skyline is-${depth}`);
  if (art) return art;

  const width = 100;
  const top = theme.scene.skylineViewHeight[depth];
  const svg = svgEl('svg', {
    class: `scene-skyline is-${depth}`,
    viewBox: `0 0 ${width} ${top}`,
    preserveAspectRatio: 'none',
  });
  let seed = theme.scene.skylineSeed + (depth === 'far' ? 0 : 1);
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  let x = 0;
  const step = width / count;
  while (x < width) {
    const w = step * (0.7 + random() * 0.8);
    const h = top * (heightRatio + random() * heightRatio);
    svg.append(
      svgEl('rect', { class: 'skyline-block', x, y: top - h, width: w, height: h }),
    );
    x += w;
  }
  return svg;
}

/** Rain is not an image slot: it is drawn, and it stays drawn. */
function weatherLayer(): Element {
  const s = theme.svg;
  // The layer is stretched across the whole window, so it is laid out in a
  // large box: a small one would blow every drop up into a plank.
  const box = theme.scene.weatherBox;
  const svg = svgEl('svg', {
    class: 'scene-weather',
    viewBox: `0 0 ${box} ${box}`,
    preserveAspectRatio: 'none',
  });
  const count = s.rainDrops * theme.scene.weatherDropFactor;
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 37) % box) + (i % 7) * 3;
    const y = (i * 53) % box;
    const drop = svgEl('line', {
      x1: x,
      y1: y,
      x2: x - s.rainLength / 4,
      y2: y + s.rainLength,
      'stroke-width': s.rainStroke / 2,
    });
    drop.style.animationDelay = `${((i * 13) % 100) * (theme.motion.rainMs / 100)}ms`;
    svg.append(drop);
  }
  return svg;
}

/** The hoarding around a lot nobody is building on yet. Not an image slot. */
function fence(): Element {
  const art = { w: theme.scene.fenceViewWidth };
  const s = theme.scene;
  const svg = svgEl('svg', {
    class: 'plot-fence',
    viewBox: `0 0 ${art.w} ${s.fenceHeight}`,
    preserveAspectRatio: 'none',
  });
  for (let x = 0; x <= art.w; x += s.fencePostGap) {
    svg.append(
      svgEl('line', {
        class: 'fence-post',
        x1: x,
        y1: 0,
        x2: x,
        y2: s.fenceHeight,
        'stroke-width': s.fencePostWidth,
      }),
    );
  }
  for (const y of [s.fenceRailOffset, s.fenceHeight - s.fenceRailOffset]) {
    svg.append(
      svgEl('line', {
        class: 'fence-rail',
        x1: 0,
        y1: y,
        x2: art.w,
        y2: y,
        'stroke-width': s.fencePostWidth,
      }),
    );
  }
  return svg;
}
