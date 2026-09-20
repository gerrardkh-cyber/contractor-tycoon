// The site, drawn in section: ground line, foundation, floors, roof, and a
// tower crane standing beside it.
//
// Everything is inline SVG built from theme.svg geometry. The view is created
// once per site and then patched in place: floors change class, the crane and
// the rain run as CSS animations, and nothing is torn down between frames.

import { findTask, stageDurationSec, type GameState, type Project } from '../core';
import { clear, setAttr, svgEl, toggleClass } from './dom';
import { theme } from './theme';

export type FloorState =
  | 'waiting'
  | 'structure'
  | 'structureGate'
  | 'services'
  | 'servicesGate'
  | 'done';
export type BandState = 'waiting' | 'active' | 'done';

/** Where every part of one project's drawing sits, in viewBox units. */
export interface Geometry {
  width: number;
  height: number;
  groundLevel: number;
  floorHeight: number;
  bodyLeft: number;
  bodyRight: number;
  bodyWidth: number;
  foundationTop: number;
  buildingTop: number;
  roofTop: number;
  mastTop: number;
}

/** Reads the two per-floor tasks and reports which of six states a floor is in. */
export function floorStateOf(project: Project, floor: number): FloorState {
  const structure = findTask(project, 'structural', floor);
  const services = findTask(project, 'mep', floor);
  if (services?.status === 'done') return 'done';
  if (services?.status === 'gate' || services?.status === 'rework') return 'servicesGate';
  if (services?.status === 'working') return 'services';
  if (structure?.status === 'done') return 'servicesGate';
  if (structure?.status === 'gate' || structure?.status === 'rework') return 'structureGate';
  if (structure?.status === 'working') return 'structure';
  return 'waiting';
}

export function bandStateOf(project: Project, stageId: string): BandState {
  const task = findTask(project, stageId, null);
  if (!task) return 'waiting';
  if (task.status === 'done') return 'done';
  if (task.status === 'waiting') return 'waiting';
  return 'active';
}

/**
 * Lays out one project. Floor height shrinks as the block grows so an
 * eight-storey tower stays on the same sheet as a house, and the drawing is
 * only ever as tall as what it has to hold.
 */
export function geometryFor(floors: number): Geometry {
  const s = theme.svg;
  // Three floors is the reference block: shorter ones get taller storeys so a
  // house still reads as a building, taller ones get squatter ones so eight
  // storeys fit the same sheet.
  const floorHeight = Math.max(
    s.minFloorHeight,
    Math.min(s.maxFloorHeight, s.floorHeight + (3 - floors) * s.floorHeightBonus),
  );
  const bodyHeight = floors * floorHeight + Math.max(0, floors - 1) * s.floorGap;
  const structureHeight = s.foundationHeight + bodyHeight + s.roofHeight + s.parapetHeight;
  const mastHeight = Math.max(s.craneMinHeight, structureHeight + s.craneHeadroom);
  const height = Math.round(s.topPad + mastHeight + s.groundY);
  const groundLevel = height - s.groundY;

  return {
    width: s.width,
    height,
    groundLevel,
    floorHeight,
    bodyLeft: s.bodyLeft,
    bodyRight: s.bodyRight,
    bodyWidth: s.bodyRight - s.bodyLeft,
    foundationTop: groundLevel - s.foundationHeight,
    buildingTop: groundLevel - s.foundationHeight - bodyHeight,
    roofTop: groundLevel - structureHeight,
    mastTop: groundLevel - mastHeight,
  };
}

/** The on-screen height a site card should reserve, in CSS pixels. */
export function heightForWidth(floors: number, widthPx: number): number {
  const geometry = geometryFor(floors);
  return Math.round((geometry.height / geometry.width) * widthPx);
}

interface FloorParts {
  group: SVGGElement;
  steel: SVGGElement;
  state: FloorState | null;
  raised: boolean;
}

export interface BuildingView {
  node: SVGSVGElement;
  update(project: Project, state: GameState): void;
  /** Pops a green tick over the part that just passed. */
  markPass(stageId: string): void;
  dispose(): void;
}

export function createBuildingView(floors: number): BuildingView {
  const g = geometryFor(floors);
  const s = theme.svg;

  const svg = svgEl('svg', {
    class: 'building',
    viewBox: `0 0 ${g.width} ${g.height}`,
    preserveAspectRatio: 'xMidYMax meet',
    role: 'img',
  });
  svg.style.aspectRatio = `${g.width} / ${g.height}`;

  svg.append(sky(g), ground(g));

  const foundation = svgEl('rect', {
    class: 'bld-foundation',
    x: g.bodyLeft - s.foundationOverhang,
    y: g.foundationTop,
    width: g.bodyWidth + s.foundationOverhang * 2,
    height: s.foundationHeight,
  });
  svg.append(foundation);

  // Floors stack upward from the foundation.
  const floorParts: FloorParts[] = [];
  const floorLayer = svgEl('g', { class: 'bld-floors' });
  for (let floor = 0; floor < floors; floor += 1) {
    const parts = buildFloor(g, floor);
    floorParts.push(parts);
    floorLayer.append(parts.group);
  }
  svg.append(floorLayer);

  const envelope = svgEl('rect', {
    class: 'bld-envelope',
    x: g.bodyLeft - s.envelopeInset,
    y: g.buildingTop - s.envelopeInset,
    width: g.bodyWidth + s.envelopeInset * 2,
    height: g.groundLevel - g.buildingTop + s.envelopeInset,
  });
  svg.append(envelope);

  const roof = buildRoof(g);
  svg.append(roof.group);

  const punchLayer = svgEl('g', { class: 'bld-punch' });
  svg.append(punchLayer);

  const crane = buildCrane(g);
  svg.append(crane.group);

  // Rain falls in front of the site, over everything but the pass badges.
  const rainLayer = rain(g);
  svg.append(rainLayer);

  const badgeLayer = svgEl('g', { class: 'bld-badges' });
  svg.append(badgeLayer);

  let punchShown = -1;
  let raining: boolean | null = null;
  let craneWorking: boolean | null = null;
  const badgeTimers: ReturnType<typeof setTimeout>[] = [];

  function update(project: Project, state: GameState): void {
    for (let floor = 0; floor < floorParts.length; floor += 1) {
      const parts = floorParts[floor];
      if (!parts) continue;
      const next = floorStateOf(project, floor);
      applyFloorState(parts, next, project, state, floor);
    }

    setBandClass(foundation, 'bld-foundation', bandStateOf(project, 'foundation'));
    setBandClass(envelope, 'bld-envelope', bandStateOf(project, 'weatherproof'));
    setBandClass(roof.group, 'bld-roof', bandStateOf(project, 'final'));

    const wet = state.weather.raining && !project.riskyPourActive;
    if (wet !== raining) {
      raining = wet;
      toggleClass(svg, 'is-raining', wet);
      toggleClass(rainLayer, 'is-on', wet);
    }

    // The crane only works while there is framing to lift for.
    const working =
      !project.stalled &&
      !wet &&
      project.tasks.some(
        (task) =>
          (task.status === 'working' || task.status === 'rework') &&
          (task.stageId === 'structural' || task.stageId === 'foundation'),
      );
    if (working !== craneWorking) {
      craneWorking = working;
      toggleClass(crane.group, 'is-working', working);
      toggleClass(crane.group, 'is-idle', !working);
    }

    if (project.punchOpen !== punchShown) {
      renderPunch(punchLayer, g, project.punchOpen, punchShown);
      punchShown = project.punchOpen;
    }
  }

  function markPass(stageId: string): void {
    const y = badgeYFor(stageId, g);
    const badge = buildBadge(g.bodyLeft + g.bodyWidth / 2, y);
    badgeLayer.append(badge);
    const timer = globalThis.setTimeout(
      () => badge.remove(),
      theme.motion.badgePopMs + theme.motion.badgeHoldMs,
    );
    badgeTimers.push(timer);
  }

  function dispose(): void {
    for (const timer of badgeTimers) globalThis.clearTimeout(timer);
    badgeTimers.length = 0;
    clear(badgeLayer);
  }

  return { node: svg, update, markPass, dispose };
}

// ---- pieces ---------------------------------------------------------------

function sky(g: Geometry): SVGElement {
  return svgEl('rect', { class: 'bld-sky', x: 0, y: 0, width: g.width, height: g.height });
}

function ground(g: Geometry): SVGElement {
  const s = theme.svg;
  return svgEl('g', { class: 'bld-ground' }, [
    svgEl('rect', {
      x: 0,
      y: g.groundLevel,
      width: g.width,
      height: g.height - g.groundLevel,
    }),
    svgEl('line', {
      class: 'bld-ground-line',
      x1: 0,
      y1: g.groundLevel,
      x2: g.width,
      y2: g.groundLevel,
      'stroke-width': s.groundStroke,
    }),
  ]);
}

function rain(g: Geometry): SVGGElement {
  const s = theme.svg;
  const layer = svgEl('g', { class: 'bld-rain' });

  // Drops are spread across the sheet and down it, each starting at a
  // different point in the fall, so the rain covers the whole drawing rather
  // than a band at the top.
  for (let i = 0; i < s.rainDrops; i += 1) {
    const x = (((i * 7) % s.rainDrops) + 0.5) * (g.width / s.rainDrops);
    const y = (((i * 5) % s.rainDrops) / s.rainDrops) * g.height;
    const drop = svgEl('line', {
      x1: x,
      y1: y,
      x2: x - s.rainLength / 2,
      y2: y + s.rainLength,
      'stroke-width': s.rainStroke,
    });
    const delay = (((i * 3) % s.rainDrops) / s.rainDrops) * theme.motion.rainMs;
    drop.style.animationDelay = `${delay.toFixed(0)}ms`;
    layer.append(drop);
  }
  return layer;
}

function buildFloor(g: Geometry, floor: number): FloorParts {
  const s = theme.svg;
  const y = g.foundationTop - (floor + 1) * g.floorHeight - floor * s.floorGap;
  const group = svgEl('g', { class: 'bld-floor', 'data-floor': floor });

  // Not started: an empty grid, the way an unbuilt floor reads on a drawing.
  group.append(
    svgEl('rect', {
      class: 'floor-grid',
      x: g.bodyLeft,
      y,
      width: g.bodyWidth,
      height: g.floorHeight,
      'stroke-width': s.gridStroke,
      'stroke-dasharray': s.gridDash,
    }),
  );

  // Framing: steel that fills in from the left as the crew works across.
  const steel = svgEl('g', { class: 'floor-steel' });
  steel.style.transformOrigin = `${g.bodyLeft}px ${y + g.floorHeight / 2}px`;
  const bays = 4;
  for (let bay = 0; bay <= bays; bay += 1) {
    const x = g.bodyLeft + (g.bodyWidth / bays) * bay;
    steel.append(
      svgEl('line', { x1: x, y1: y, x2: x, y2: y + g.floorHeight, 'stroke-width': s.steelStroke }),
    );
  }
  steel.append(
    svgEl('line', {
      x1: g.bodyLeft,
      y1: y,
      x2: g.bodyRight,
      y2: y,
      'stroke-width': s.steelStroke,
    }),
    svgEl('line', {
      x1: g.bodyLeft,
      y1: y + g.floorHeight,
      x2: g.bodyRight,
      y2: y + g.floorHeight,
      'stroke-width': s.steelStroke,
    }),
  );
  group.append(steel);

  // Services: pipe and conduit runs threaded through the floor.
  const services = svgEl('g', { class: 'floor-services' });
  const midY = y + g.floorHeight / 2;
  services.append(
    svgEl('line', {
      x1: g.bodyLeft + s.windowInsetX,
      y1: midY,
      x2: g.bodyRight - s.windowInsetX,
      y2: midY,
      'stroke-width': s.serviceStroke,
      'stroke-dasharray': s.serviceDash,
    }),
    svgEl('line', {
      x1: g.bodyLeft + g.bodyWidth / 3,
      y1: y + s.windowInsetY,
      x2: g.bodyLeft + g.bodyWidth / 3,
      y2: y + g.floorHeight - s.windowInsetY,
      'stroke-width': s.serviceStroke,
    }),
    svgEl('line', {
      x1: g.bodyLeft + (g.bodyWidth * 2) / 3,
      y1: y + s.windowInsetY,
      x2: g.bodyLeft + (g.bodyWidth * 2) / 3,
      y2: y + g.floorHeight - s.windowInsetY,
      'stroke-width': s.serviceStroke,
    }),
  );
  group.append(services);

  // Finished: a solid wall with windows punched into it.
  const wall = svgEl('g', { class: 'floor-wall' });
  wall.append(
    svgEl('rect', {
      class: 'floor-wall-face',
      x: g.bodyLeft,
      y,
      width: g.bodyWidth,
      height: g.floorHeight,
      'stroke-width': s.wallStroke,
    }),
  );
  const windowWidth =
    (g.bodyWidth - s.windowInsetX * 2 - s.windowGap * (s.windowCount - 1)) / s.windowCount;
  const windowHeight = Math.max(s.minFloorHeight / 2, g.floorHeight - s.windowInsetY * 2);
  for (let i = 0; i < s.windowCount; i += 1) {
    wall.append(
      svgEl('rect', {
        class: 'floor-window',
        x: g.bodyLeft + s.windowInsetX + i * (windowWidth + s.windowGap),
        y: y + (g.floorHeight - windowHeight) / 2,
        width: windowWidth,
        height: windowHeight,
        rx: s.windowRadius,
      }),
    );
  }
  group.append(wall);

  // The dashed outline that blinks while a gate is pending.
  group.append(
    svgEl('rect', {
      class: 'floor-gate',
      x: g.bodyLeft,
      y,
      width: g.bodyWidth,
      height: g.floorHeight,
      'stroke-width': s.gridStroke * 2,
      'stroke-dasharray': s.gridDash,
    }),
  );

  return { group, steel, state: null, raised: false };
}

function applyFloorState(
  parts: FloorParts,
  next: FloorState,
  project: Project,
  state: GameState,
  floor: number,
): void {
  if (parts.state !== next) {
    setAttr(parts.group, 'class', `bld-floor is-${next}`);
    // Topping out: the floor rises into place and settles.
    if (next === 'done' && parts.state !== null && !parts.raised) {
      parts.raised = true;
      parts.group.classList.add('is-rising');
      globalThis.setTimeout(
        () => parts.group.classList.remove('is-rising'),
        theme.motion.floorRiseMs * 2,
      );
    }
    parts.state = next;
  }

  // Framing fills from the left in step with the stage's own clock.
  if (next === 'structure') {
    const task = findTask(project, 'structural', floor);
    const total = stageDurationSec(state, 'structural');
    const done = task && total > 0 ? 1 - Math.max(0, task.remainingSec) / total : 0;
    const ratio = Math.max(0.08, Math.min(1, done));
    parts.steel.style.transform = `scaleX(${ratio.toFixed(3)})`;
  } else if (parts.steel.style.transform !== '') {
    parts.steel.style.transform = '';
  }
}

function buildRoof(g: Geometry): { group: SVGGElement } {
  const s = theme.svg;
  const group = svgEl('g', { class: 'bld-roof' });
  group.append(
    svgEl('rect', {
      class: 'roof-deck',
      x: g.bodyLeft + s.roofInset,
      y: g.buildingTop - s.roofHeight,
      width: g.bodyWidth - s.roofInset * 2,
      height: s.roofHeight,
    }),
    svgEl('rect', {
      class: 'roof-parapet',
      x: g.bodyLeft - s.envelopeInset,
      y: g.buildingTop - s.roofHeight - s.parapetHeight,
      width: g.bodyWidth + s.envelopeInset * 2,
      height: s.parapetHeight,
    }),
  );
  return { group };
}

function setBandClass(node: SVGElement, base: string, state: BandState): void {
  setAttr(node, 'class', `${base} is-${state}`);
}

function buildCrane(g: Geometry): { group: SVGGElement } {
  const s = theme.svg;
  const group = svgEl('g', { class: 'bld-crane is-idle' });
  const x = s.craneX;
  const half = s.mastWidth / 2;
  const top = g.mastTop;

  // Base pad.
  group.append(
    svgEl('rect', {
      class: 'crane-base',
      x: x - s.craneBaseWidth / 2,
      y: g.groundLevel - s.craneBaseHeight,
      width: s.craneBaseWidth,
      height: s.craneBaseHeight,
    }),
  );

  // Mast: two legs with rungs between them.
  const mast = svgEl('g', { class: 'crane-mast' });
  mast.append(
    svgEl('line', {
      x1: x - half,
      y1: g.groundLevel - s.craneBaseHeight,
      x2: x - half,
      y2: top,
      'stroke-width': s.mastStroke,
    }),
    svgEl('line', {
      x1: x + half,
      y1: g.groundLevel - s.craneBaseHeight,
      x2: x + half,
      y2: top,
      'stroke-width': s.mastStroke,
    }),
  );
  for (let y = top; y < g.groundLevel - s.craneBaseHeight; y += s.mastRungGap) {
    mast.append(
      svgEl('line', {
        class: 'crane-rung',
        x1: x - half,
        y1: y,
        x2: x + half,
        y2: y + s.mastRungGap / 2,
        'stroke-width': s.mastStroke / 2,
      }),
    );
  }
  group.append(mast);

  // The slewing part: jib, counter-jib, cab, trolley and hook all turn together.
  const slew = svgEl('g', { class: 'crane-slew' });
  slew.style.transformOrigin = `${x}px ${top}px`;

  slew.append(
    svgEl('line', {
      class: 'crane-jib',
      x1: x + s.jibBack,
      y1: top,
      x2: x - s.jibLength,
      y2: top,
      'stroke-width': s.jibStroke,
    }),
    svgEl('line', {
      class: 'crane-tie',
      x1: x + s.jibBack,
      y1: top,
      x2: x,
      y2: top - s.jibHeight,
      'stroke-width': s.jibStroke / 2,
    }),
    svgEl('line', {
      class: 'crane-tie',
      x1: x - s.jibLength,
      y1: top,
      x2: x,
      y2: top - s.jibHeight,
      'stroke-width': s.jibStroke / 2,
    }),
    svgEl('rect', {
      class: 'crane-cab',
      x: x - s.cabSize,
      y: top,
      width: s.cabSize,
      height: s.cabSize,
    }),
  );

  // Hoist: the cable and its load swing from the trolley.
  const hoistX = x - s.jibLength * s.hookTrolleyTo;
  const hoist = svgEl('g', { class: 'crane-hoist' });
  hoist.style.transformOrigin = `${hoistX}px ${top}px`;
  const hookDrop = Math.max(s.craneMinHeight / 3, (g.groundLevel - top) * 0.45);
  hoist.append(
    svgEl('line', {
      class: 'crane-cable',
      x1: hoistX,
      y1: top,
      x2: hoistX,
      y2: top + hookDrop,
      'stroke-width': s.hookLineStroke,
    }),
    svgEl('rect', {
      class: 'crane-load',
      x: hoistX - s.loadSize / 2,
      y: top + hookDrop,
      width: s.loadSize,
      height: s.hookSize,
    }),
  );
  slew.append(hoist);
  group.append(slew);

  return { group };
}

function renderPunch(layer: SVGGElement, g: Geometry, open: number, previous: number): void {
  clear(layer);
  if (open <= 0) return;

  const s = theme.svg;
  const shown = Math.min(open, s.punchMax);
  const y = g.roofTop - s.punchRowY;
  const startX = g.bodyLeft + g.bodyWidth / 2 - ((shown - 1) * s.punchGap) / 2;

  for (let i = 0; i < shown; i += 1) {
    const dot = svgEl('circle', {
      class: 'punch-dot',
      cx: startX + i * s.punchGap,
      cy: y,
      r: s.punchRadius,
    });
    // Only the newly-raised items pop; the rest were already there.
    if (previous >= 0 && i >= Math.min(previous, s.punchMax)) dot.classList.add('is-new');
    layer.append(dot);
  }

  if (open > s.punchMax) {
    layer.append(
      svgEl('text', {
        class: 'punch-more',
        x: startX + shown * s.punchGap,
        y: y + s.punchRadius,
        text: `+${open - s.punchMax}`,
      }),
    );
  }
}

function badgeYFor(stageId: string, g: Geometry): number {
  if (stageId === 'foundation') return g.foundationTop + theme.svg.foundationHeight / 2;
  if (stageId === 'final' || stageId === 'fire' || stageId === 'weatherproof') {
    return g.roofTop + theme.svg.roofHeight / 2;
  }
  return (g.buildingTop + g.foundationTop) / 2;
}

function buildBadge(cx: number, cy: number): SVGGElement {
  const s = theme.svg;
  const group = svgEl('g', { class: 'bld-badge' });
  group.style.transformOrigin = `${cx}px ${cy}px`;
  group.append(
    svgEl('circle', { class: 'badge-disc', cx, cy, r: s.badgeRadius, 'stroke-width': s.badgeStroke }),
    svgEl('path', {
      class: 'badge-tick',
      d: s.badgeTick,
      transform: `translate(${cx} ${cy})`,
      'stroke-width': s.badgeStroke,
    }),
  );
  return group;
}
