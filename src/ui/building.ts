// One building, drawn in section: foundation, floors, roof, and a tower crane
// standing beside it.
//
// Everything is inline SVG built from theme.svg geometry. The view is created
// once per site and then patched in place: floors change class, the crane runs
// as a CSS animation, and nothing is torn down between frames.
//
// Order 008 moved the sky, the ground and the weather out to the scene, which
// draws them once behind every site. Floors are one tile height for every
// project, so a house and an eight-storey block stack the same unit and a
// single scale factor sizes them both against the same ground line.

import { findTask, stageDurationSec, type GameState, type Project } from '../core';
import { artFor, FLOOR_PIECE, floorsHaveArt, type ArtPiece } from './art';
import { clear, replayAnimation, setAttr, svgEl, toggleClass } from './dom';
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
  /** Foundation to parapet: what "an eight-storey block" means on screen. */
  structureHeight: number;
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
 * Lays out one project. Every floor is the same tile, so the drawing is as
 * tall as the building actually is and the scene can scale them against one
 * another. The sheet ends at the ground line: what is below it belongs to the
 * scene, not to any one site.
 */
export function geometryFor(floors: number): Geometry {
  const s = theme.svg;
  const floorHeight = floorTileHeight();
  const bodyHeight = floors * floorHeight + Math.max(0, floors - 1) * s.floorGap;
  const structureHeight = s.foundationHeight + bodyHeight + s.roofHeight + s.parapetHeight;
  const mastHeight = Math.max(s.craneMinHeight, structureHeight + s.craneHeadroom);
  const height = Math.round(s.topPad + mastHeight);
  const groundLevel = height;

  return {
    width: s.width,
    height,
    groundLevel,
    structureHeight,
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

interface FloorParts {
  group: SVGGElement;
  steel: SVGGElement;
  /** The floor's picture, when the floor slots have them. */
  art: SVGImageElement | null;
  state: FloorState | null;
  raised: boolean;
}

export interface BuildingView {
  node: SVGSVGElement;
  /** Where this building's parts sit, for anything drawn against it. */
  geometry: Geometry;
  update(project: Project, state: GameState): void;
  /** Pops a green tick over the part that just passed. */
  markPass(stageId: string): void;
  /** Blinks the floor a gate just failed on. */
  markFail(floor: number | null): void;
  /** Handover: flash, and raise the flag. */
  celebrate(): void;
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

  // Order 009: each part draws itself unless its image slot has a picture.
  // The drawn part stays underneath as the carrier of the state classes, so
  // the stylesheet only has to stop painting it.
  const floorArt = floorsHaveArt();
  toggleClass(svg, 'has-floor-art', floorArt);

  const foundationArt = artImage(
    'foundation',
    g.bodyLeft - s.foundationOverhang,
    g.bodyWidth + s.foundationOverhang * 2,
    'bld-art bld-foundation-art',
  );
  if (foundationArt) {
    // The slab's top edge is flat and sits where the drawn one does; the
    // footings hang below it into the ground.
    foundationArt.node.setAttribute('y', String(g.foundationTop));
    svg.append(foundationArt.node);
    svg.classList.add('has-foundation-art');
  }

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
  const roofArt = artImage(
    'roof',
    g.bodyLeft - s.envelopeInset,
    g.bodyWidth + s.envelopeInset * 2,
    'bld-art bld-roof-art',
  );
  if (roofArt) {
    // Its bottom edge is flat and sits on the top floor.
    roofArt.node.setAttribute('y', String(g.buildingTop - roofArt.height));
    svg.append(roofArt.node);
    svg.classList.add('has-roof-art');
  }

  // Topped out: the flag goes up at handover and stays up.
  const flag = buildFlag(g);
  svg.append(flag);

  const punchLayer = svgEl('g', { class: 'bld-punch' });
  svg.append(punchLayer);

  const crane = buildCrane(g);
  svg.append(crane.group);
  toggleClass(svg, 'has-crane-art', crane.art);
  let liftedFloor: number | null = null;

  const badgeLayer = svgEl('g', { class: 'bld-badges' });
  svg.append(badgeLayer);

  // Handover: a sheet of light over the building, which is an opacity rather
  // than a filter on the whole drawing.
  const flash = svgEl('rect', {
    class: 'bld-flash',
    x: g.bodyLeft - s.envelopeInset,
    y: g.roofTop,
    width: g.bodyWidth + s.envelopeInset * 2,
    height: g.groundLevel - g.roofTop,
  });
  svg.append(flash);

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
    if (foundationArt) {
      setBandClass(foundationArt.node, 'bld-art bld-foundation-art', bandStateOf(project, 'foundation'));
    }
    if (roofArt) setBandClass(roofArt.node, 'bld-art bld-roof-art', bandStateOf(project, 'final'));

    const wet = state.weather.raining && !project.riskyPourActive;
    if (wet !== raining) {
      raining = wet;
      toggleClass(svg, 'is-raining', wet);
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

    // The hook rides up to whichever floor is being framed.
    const framing = project.tasks.find(
      (task) =>
        task.stageId === 'structural' &&
        task.floor !== null &&
        (task.status === 'working' || task.status === 'rework'),
    );
    const target = working && framing ? framing.floor : null;
    if (target !== liftedFloor) {
      liftedFloor = target;
      const rest = crane.restY;
      const to = target === null ? rest : floorTopOf(g, target);
      crane.lift.style.transform = `translateY(${(to - rest).toFixed(1)}px)`;
    }

    if (project.punchOpen !== punchShown) {
      renderPunch(punchLayer, g, project.punchOpen, punchShown);
      punchShown = project.punchOpen;
    }
  }

  /** Handover: the whole building flashes and the flag goes up. */
  function celebrate(): void {
    svg.classList.add('is-topped-out');
    replayAnimation(svg, 'is-celebrating');
    const timer = globalThis.setTimeout(
      () => svg.classList.remove('is-celebrating'),
      theme.scene.celebrateMs,
    );
    badgeTimers.push(timer);
  }

  /** A gate failed: the floor it belongs to blinks red. */
  function markFail(floor: number | null): void {
    const parts = floor === null ? null : floorParts[floor];
    const node = parts ? parts.group : envelope;
    replayAnimation(node, 'is-failing');
    // Long enough for all three blinks the stylesheet asks for.
    const timer = globalThis.setTimeout(
      () => node.classList.remove('is-failing'),
      theme.motion.blinkFastMs * theme.scene.failBlinks,
    );
    badgeTimers.push(timer);
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

  return { node: svg, geometry: g, update, markPass, markFail, celebrate, dispose };
}

// ---- pieces ---------------------------------------------------------------

/**
 * One floor's height. With floor pictures it is the pictures' own shape at
 * the building's width, so a tile is never squashed to fit a number; without
 * them it is the drawn tile from the theme.
 */
function floorTileHeight(): number {
  const s = theme.svg;
  const tile = floorsHaveArt() ? artFor('floor-complete') : null;
  return tile ? (s.bodyRight - s.bodyLeft) * (tile.h / tile.w) : s.floorHeight;
}

/** An image slot laid into the drawing, at the picture's own proportions. */
function artImage(piece: ArtPiece, x: number, width: number, className: string): {
  node: SVGImageElement;
  height: number;
} | null {
  const file = artFor(piece);
  if (!file) return null;
  const height = width * (file.h / file.w);
  const node = svgEl('image', {
    class: className,
    href: file.url,
    x,
    width,
    height,
    preserveAspectRatio: 'none',
  });
  return { node, height };
}

/** The top edge of a floor, in viewBox units. */
export function floorTopOf(g: Geometry, floor: number): number {
  return g.foundationTop - (floor + 1) * g.floorHeight - floor * theme.svg.floorGap;
}

function buildFlag(g: Geometry): SVGGElement {
  const s = theme.scene;
  const group = svgEl('g', { class: 'bld-flag' });
  const x = g.bodyLeft + g.bodyWidth / 2;
  const base = g.roofTop;
  group.append(
    svgEl('line', {
      class: 'flag-pole',
      x1: x,
      y1: base,
      x2: x,
      y2: base - s.flagPoleHeight,
      'stroke-width': theme.svg.wallStroke,
    }),
    svgEl('path', {
      class: 'flag-cloth',
      d: `M ${x} ${base - s.flagPoleHeight} h ${s.flagWidth} l ${-s.flagWidth / 3} ${s.flagHeight / 2}` +
        ` l ${s.flagWidth / 3} ${s.flagHeight / 2} h ${-s.flagWidth} z`,
    }),
  );
  return group;
}

function buildFloor(g: Geometry, floor: number): FloorParts {
  const s = theme.svg;
  const y = floorTopOf(g, floor);
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

  // With floor pictures, one image per floor shows whichever state it is in.
  let art: SVGImageElement | null = null;
  if (floorsHaveArt()) {
    art = svgEl('image', {
      class: 'floor-art',
      x: g.bodyLeft,
      y,
      width: g.bodyWidth,
      height: g.floorHeight,
      preserveAspectRatio: 'none',
    });
    // After dark a finished floor is lived in: a warm wash over the picture,
    // since the picture's windows are wherever the artist put them.
    group.insertBefore(art, group.firstChild);
    group.append(
      svgEl('rect', {
        class: 'floor-glow',
        x: g.bodyLeft,
        y,
        width: g.bodyWidth,
        height: g.floorHeight,
      }),
    );
  }

  return { group, steel, art, state: null, raised: false };
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
    if (parts.art) {
      const file = artFor(FLOOR_PIECE[next]);
      if (file) setAttr(parts.art, 'href', file.url);
    }
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

function buildCrane(g: Geometry): {
  group: SVGGElement;
  lift: SVGGElement;
  restY: number;
  art: boolean;
} {
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
  // Two groups: the inner one swings, the outer one rides up to a floor.
  const lift = svgEl('g', { class: 'crane-lift' });
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
  lift.append(hoist);
  slew.append(lift);
  group.append(slew);

  // Order 009: the tower and the jib can be pictures. The tower stands where
  // the drawn mast stands; the jib turns with the drawn one, inside the same
  // slewing group, so the crane still swings. Its picture carries its own
  // hook, so the drawn hoist is put away rather than hung twice.
  const towerFile = artFor('crane-tower');
  const jibFile = artFor('crane-jib');
  const art = towerFile !== null && jibFile !== null;
  if (art) {
    const mastHeight = g.groundLevel - top;
    const towerWidth = mastHeight * (towerFile.w / towerFile.h);
    group.insertBefore(
      svgEl('image', {
        class: 'crane-art',
        href: towerFile.url,
        x: x - towerWidth / 2,
        y: top - s.cabSize,
        width: towerWidth,
        height: mastHeight + s.cabSize,
        preserveAspectRatio: 'none',
      }),
      slew,
    );
    const jibWidth = s.jibLength + s.jibBack;
    const jibHeight = jibWidth * (jibFile.h / jibFile.w);
    slew.append(
      svgEl('image', {
        class: 'crane-art',
        href: jibFile.url,
        x: x - s.jibLength,
        y: top - s.jibHeight,
        width: jibWidth,
        height: jibHeight,
        preserveAspectRatio: 'none',
      }),
    );
  }

  return { group, lift, restY: top + hookDrop, art };
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
