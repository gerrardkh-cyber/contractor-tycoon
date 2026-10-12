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
import { craneTopFor, createBuildingView, createLandmark, floorsStarted, geometryFor, type BuildingView } from './building';
import { layoutSkyline, type Span } from './skyline';
import type { BuiltRecord } from '../save';
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
  /**
   * Handover: flash the building and raise the flag, and - given its record
   * (order 011 §6) - fly it back into the company's skyline.
   */
  completed(projectId: string, record?: BuiltRecord | null): void;
  /** Order 011 §4: the handed-over buildings to stand behind the sites, oldest first. */
  setBuilt(list: readonly BuiltRecord[]): void;
  dispose(): void;
}

export interface SceneHost {
  /** The HUD figure money flies to. */
  cashAnchor(): Element | null;
  /** The HUD bar, whose bottom edge the camera keeps clear of. */
  hud(): Element | null;
}

interface Plot {
  node: HTMLElement;
  building: BuildingView;
  actors: Actors;
  floors: number;
  /** Floors with framing under way or done: how high the crane has climbed. */
  started: number;
}

/** Order 011 §4: one finished building in the company's skyline. */
interface Landmark {
  node: HTMLElement;
  /** Its drawing's size, in drawing units. */
  width: number;
  height: number;
}

export function createScene(host: SceneHost): Scene {
  const sky = el('div', { class: 'scene-sky' });
  const skylineFar = skyline('far', theme.scene.skylineFarCount, theme.scene.skylineFarHeight);
  const skylineNear = skyline('near', theme.scene.skylineNearCount, theme.scene.skylineNearHeight);
  const ground = groundLayer();
  const row = el('div', { class: 'scene-row', 'data-guide': 'scene-row' });
  // Order 011 §4: the company's finished buildings, behind the sites. The
  // track follows the row's scroll, so they stand where the row says.
  const builtTrack = el('div', { class: 'built-track' });
  const built = el('div', { class: 'scene-built' }, [builtTrack]);
  row.addEventListener('scroll', () => {
    builtTrack.style.transform = `translateX(${-row.scrollLeft}px)`;
  }, { passive: true });
  const weather = weatherLayer();
  const coins = el('div', { class: 'scene-coins' });

  const node = el('div', { class: 'scene', 'data-phase': 'day' }, [
    sky,
    skylineFar,
    skylineNear,
    ground,
    built,
    row,
    weather,
    coins,
  ]);

  const plots = new Map<string, Plot>();
  /** Floors standing on the tallest site; what the camera frames. */
  let framed = 0;
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
  /** The room under the HUD at the last rescale, in pixels. */
  let lastRoom = 0;
  const landmarks = new Map<number, Landmark>();
  let builtList: readonly BuiltRecord[] = [];

  const onResize = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      rescale();
    });
  };
  globalThis.addEventListener('resize', onResize);
  // Decision 010-6: the HUD is measured, not assumed, and measured again
  // whenever it changes size - a rotation, a language, the guide's padding.
  const hudWatch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
  let watchedHud: Element | null = null;
  let hudEdge = theme.scene.hudRoomPx;

  /** Where the camera's room starts: under the HUD as it stands, plus a margin. */
  function hudBottom(): number {
    const hud = host.hud();
    if (!hud) return theme.scene.hudRoomPx;
    if (hud !== watchedHud) {
      hudWatch?.disconnect();
      hudWatch?.observe(hud);
      watchedHud = hud;
    }
    // Opening the HUD's extras is a peek, not a new layout: the camera keeps
    // to the bar as it stands closed.
    if (!hud.classList.contains('is-expanded')) {
      hudEdge = hud.getBoundingClientRect().bottom - node.getBoundingClientRect().top;
    }
    return hudEdge + theme.scene.hudClearPx;
  }

  /**
   * The camera. One scale for the whole row, so the buildings stay to each
   * other what they are in the fiction, and that scale follows the tallest
   * building on site as it actually stands (order 009 §6):
   *
   *   - a house, or a block with one floor up, fills about `houseShare` of
   *     the window;
   *   - a block of `referenceFloors` fills the room between the HUD and the
   *     ground line, as before;
   *   - in between, the share runs straight from one to the other, so each
   *     floor that goes up pulls the camera back a step;
   *   - the empty sky above it never takes more than `maxSkyShare`.
   *
   * Width still has the last word: the building being framed has to fit the
   * window across, and past that the row scrolls rather than shrinks.
   */
  function rescale(): void {
    const sc = theme.scene;
    const height = node.clientHeight || globalThis.innerHeight;
    const width = node.clientWidth || globalThis.innerWidth;
    const unitWidth = theme.svg.width;

    // The ground line rises when the site card opens; the camera frames for
    // the tighter of the two, so nothing resizes under the player.
    const withCard = 1 - sc.detailMaxRatio - (sc.tabBarHeight + sc.plotGapPx) / height;
    const groundY = height * Math.min(sc.groundRatio, withCard);
    const room = groundY - hudBottom();
    lastRoom = room;

    let next: number;
    if (framed === 0) {
      // Nothing being built: show the lots, as many as fit.
      const columns = Math.max(1, lots * sc.lotWidthRatio);
      const byWidth = (width - (columns + 1) * sc.plotGapPx) / (columns * unitWidth);
      const byHeight = room / geometryFor(sc.referenceFloors).structureHeight;
      next = Math.min(byHeight, byWidth);
    } else {
      const structure = geometryFor(framed).structureHeight;
      const fill = room / height;
      const t = Math.min(1, (framed - 1) / Math.max(1, sc.referenceFloors - 1));
      const share = sc.houseShare + (fill - sc.houseShare) * t;
      next = (share * height) / structure;
      // No more sky above it than the rule allows...
      next = Math.max(next, (groundY - sc.maxSkyShare * height) / structure);
      // ...but the building and its crane, head and all, stay in frame
      // (decision 010-1): the tallest crane, as high as it has climbed so far
      // (order 011 A3), clears the HUD...
      const sites = [...plots.values()].map((plot) => plot.building.geometry);
      const crane = Math.max(
        structure,
        ...[...plots.values()].map((plot) => {
          const g = plot.building.geometry;
          return g.groundLevel - craneTopFor(g, plot.started);
        }),
      );
      next = Math.min(next, room / crane);
      // ...and the widest site, crane head included, fits the window across.
      const span = Math.max(0, ...sites.map((g) => g.frameRight - g.frameLeft));
      if (span > 0) next = Math.min(next, (width - sc.plotGapPx * 2) / span);
    }
    next = Math.max(next, sc.minPlotWidthPx / unitWidth);
    if (Math.abs(next - scale) < 0.01) {
      layoutBuilt();
      return;
    }

    const previous = scale;
    scale = next;
    for (const plot of plots.values()) sizePlot(plot);
    sizeLots();
    bringIntoView(selected, true);
    layoutBuilt();
    if (previous > 0) glide(previous / next);
  }

  /** Order 011 §4: the handed-over buildings to show, the last few, oldest first. */
  function setBuilt(list: readonly BuiltRecord[]): void {
    builtList = list.slice(-theme.scene.landmarkMax);
    const keep = new Set(builtList.map((record) => record.order));
    for (const [order, landmark] of landmarks) {
      if (keep.has(order)) continue;
      landmark.node.remove();
      landmarks.delete(order);
    }
    for (const record of builtList) {
      if (landmarks.has(record.order)) continue;
      const drawing = createLandmark(record.floors, record.typeId);
      const item = el('div', { class: 'built-item' });
      item.append(drawing.node);
      builtTrack.append(item);
      landmarks.set(record.order, { node: item, width: drawing.width, height: drawing.height });
    }
    layoutBuilt(true);
  }

  /**
   * Stands the finished buildings in the free stretches of the row, from the
   * left, clear of the live sites, at `landmarkScale` of the camera. When a
   * site comes or goes they slide to their new places; when the camera moves
   * they ride its glide instead, so they do not slide as well.
   */
  function layoutBuilt(shuffle = false): void {
    if (scale <= 0 || builtList.length === 0) return;
    toggleClass(builtTrack, 'is-shuffling', shuffle && motionAllowed());
    const sc = theme.scene;
    const shown = builtList.map((record) => landmarks.get(record.order)).filter((l): l is Landmark => !!l);
    const tallest = Math.max(...shown.map((landmark) => landmark.height));
    const k = Math.min(scale * sc.landmarkScale, lastRoom > 0 ? (lastRoom * sc.landmarkRoomShare) / tallest : Infinity);
    const sites: Span[] = [];
    for (const [id, plot] of plots) {
      if (leaving.has(id)) continue;
      const g = plot.building.geometry;
      sites.push({
        left: plot.node.offsetLeft + g.frameLeft * scale,
        right: plot.node.offsetLeft + g.frameRight * scale,
      });
    }
    const room = Math.max(row.scrollWidth, row.clientWidth);
    const lefts = layoutSkyline(shown.map((landmark) => landmark.width * k), sites, room, sc.landmarkGapPx);
    shown.forEach((landmark, i) => {
      landmark.node.style.left = `${Math.round(lefts[i] ?? 0)}px`;
      landmark.node.style.width = `${Math.round(landmark.width * k)}px`;
      landmark.node.style.height = `${Math.round(landmark.height * k)}px`;
    });
  }

  /**
   * Plays a scale change as a move rather than a jump. The layout has already
   * changed; the row is put back to how it looked with a transform and then
   * let go, so the change itself is a one-second transform and nothing else.
   */
  function glide(from: number): void {
    if (!motionAllowed()) return;
    row.style.transition = 'none';
    row.style.transformOrigin = '50% 100%';
    row.style.transform = `scale(${from.toFixed(4)})`;
    void row.offsetWidth;
    row.style.transition = `transform ${theme.scene.zoomMs}ms ${theme.easing.inOut}`;
    row.style.transform = '';
    // The skyline behind rides the same move.
    built.style.transition = 'none';
    built.style.transformOrigin = '50% 100%';
    built.style.transform = `scale(${from.toFixed(4)})`;
    void built.offsetWidth;
    built.style.transition = row.style.transition;
    built.style.transform = '';
  }

  /**
   * How many floors of the tallest site are standing, counting the one going
   * up. A house is one; a block with nothing framed yet is one too.
   */
  function framedFloors(state: GameState): number {
    let tallest = 0;
    for (const project of state.projects) {
      tallest = Math.max(tallest, Math.min(project.floors, Math.max(1, floorsStarted(project))));
    }
    // A handed-over site keeps the camera until it has flown back into the
    // skyline, so the camera does not pull away mid-handover (order 011 §6).
    const live = new Set(state.projects.map((project) => project.id));
    for (const [id, plot] of plots) {
      if (!live.has(id)) tallest = Math.max(tallest, Math.min(plot.floors, Math.max(1, plot.started)));
    }
    return tallest;
  }

  function sizePlot(plot: Plot): void {
    const g = plot.building.geometry;
    const width = Math.round(g.width * scale);
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
    // How far each crane has climbed, before the camera reads it.
    let climbed = false;
    for (const project of context.state.projects) {
      const plot = plots.get(project.id);
      const started = floorsStarted(project);
      if (plot && plot.started !== started) {
        plot.started = started;
        climbed = true;
      }
    }
    const standing = framedFloors(context.state);
    if (standing !== framed || climbed) {
      framed = standing;
      rescale();
    }
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
    let changed = false;
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
        changed = true;
        continue;
      }
      if (now < due) continue;
      leaving.delete(id);
      plot.building.dispose();
      plot.actors.dispose();
      plot.node.remove();
      plots.delete(id);
      changed = true;
      // The camera lets go of it now, and frames whatever is left.
      const standing = framedFloors(context.state);
      if (standing !== framed) {
        framed = standing;
        rescale();
      }
    }

    for (const project of context.state.projects) {
      let plot = plots.get(project.id);
      const fresh = plot === undefined;
      if (!plot) {
        plot = buildPlot(project);
        plots.set(project.id, plot);
        rescale();
        sizePlot(plot);
        changed = true;
      }
      plot.building.update(project, context.state);
      plot.actors.update(project, context.state);
      toggleClass(plot.node, 'is-selected', project.id === selected);
      if (fresh && project.id === selected) bringIntoView(selected);
    }

    syncLots(context);
    syncSelection(context.state);
    if (changed) layoutBuilt(true);
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
        el('div', { class: 'plot is-empty' }, [fence(), lotSign(renderSlotCard(context, slot))]),
      );
    }
    lots = Math.max(0, maxSlots - first + 1);
    rescale();
    sizeLots();
    layoutBuilt(true);
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
    const building = createBuildingView(type.floors, type.id);
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
    return { node, building, actors, floors: type.floors, started: floorsStarted(project) };
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
  function bringIntoView(projectId: string | null, instant = false): void {
    const plot = projectId === null ? null : plots.get(projectId);
    if (!plot) return;
    // The middle of what the camera frames - the building and the crane head
    // beside it - not of the plot, whose hut and jib may run off the edges.
    const g = plot.building.geometry;
    const middle = ((g.frameLeft + g.frameRight) / 2) * scale;
    const left = plot.node.offsetLeft + middle - row.clientWidth / 2;
    row.scrollTo({
      left: Math.max(0, left),
      behavior: !instant && motionAllowed() ? 'smooth' : 'auto',
    });
  }

  function pass(projectId: string, gateId: string): void {
    plots.get(projectId)?.building.markPass(gateId);
    plots.get(projectId)?.actors.inspect(true);
  }

  function fail(projectId: string, floor: number | null): void {
    plots.get(projectId)?.building.markFail(floor);
    plots.get(projectId)?.actors.inspect(false);
  }

  function completed(projectId: string, record: BuiltRecord | null = null): void {
    const plot = plots.get(projectId);
    plot?.building.celebrate();
    plot?.actors.cheer();
    const landmark = record ? landmarks.get(record.order) : undefined;
    if (!plot || !landmark) return;
    // Order 011 §6: the crane comes down, then the building flies back into
    // its place in the skyline at its new size, and the lot is a lot again.
    const sc = theme.scene;
    landmark.node.classList.add('is-arriving');
    leaving.set(projectId, performance.now() + sc.craneDownMs + sc.landmarkMoveMs);
    plot.node.classList.add('is-leaving');
    globalThis.setTimeout(() => flyBack(plot, landmark), sc.craneDownMs);
  }

  /** Plays the move from the site to the skyline as one transform. */
  function flyBack(plot: Plot, landmark: Landmark): void {
    const g = plot.building.geometry;
    const box = plot.building.node.getBoundingClientRect();
    const to = landmark.node.getBoundingClientRect();
    plot.building.node.style.opacity = '0';
    plot.actors.node.style.opacity = '0';
    landmark.node.classList.remove('is-arriving');
    if (!motionAllowed() || box.width === 0 || to.width === 0) return;
    const unit = box.width / g.width;
    const fromLeft = box.left + g.frameLeft * unit;
    const k = (landmark.width * unit) / to.width;
    const node = landmark.node;
    node.style.transition = 'none';
    node.style.transformOrigin = '0 100%';
    node.style.transform = `translate(${(fromLeft - to.left).toFixed(1)}px, ${(box.bottom - to.bottom).toFixed(1)}px) scale(${k.toFixed(4)})`;
    void node.offsetWidth;
    node.style.transition = `transform ${theme.scene.landmarkMoveMs}ms ${theme.easing.inOut}`;
    node.style.transform = '';
    globalThis.setTimeout(() => {
      node.style.transition = '';
    }, theme.scene.landmarkMoveMs);
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
    hudWatch?.disconnect();
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
    setBuilt,
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

/**
 * Order 011 §8: what a lot says, on a sign standing on it - a board on two
 * posts that go down to the ground - rather than a card in the air.
 */
function lotSign(board: HTMLElement): HTMLElement {
  return el('div', { class: 'lot-sign' }, [
    board,
    el('div', { class: 'lot-sign-posts' }, [el('span', { class: 'lot-sign-post' }), el('span', { class: 'lot-sign-post' })]),
  ]);
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
