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
import type { ArtFile } from './art-files';
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
  /** Decision 010-8: how high the foundation stands above the ground. */
  foundationHeight: number;
  /** The crane's mast, on its centre line. */
  craneX: number;
  /** The highest point of the crane, head or jib. */
  craneTop: number;
  /** Building and crane head, left to right: what the camera keeps in frame. */
  frameLeft: number;
  frameRight: number;
  /**
   * Decision 010-7: which parts of the storey picture make up this building,
   * as fractions across it, left to right; null where the floors are drawn.
   */
  slices: readonly TileSlice[] | null;
}

/** A stretch of a storey picture, from one fraction across it to another. */
export interface TileSlice {
  from: number;
  to: number;
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
export function geometryFor(floors: number, typeId: string | null = null): Geometry {
  const s = theme.svg;
  const floorHeight = floorTileHeight();
  const slices = baySlices(typeId);
  const fullWidth = s.bodyRight - s.bodyLeft;
  const bodyWidth = slices ? slices.reduce((sum, slice) => sum + (slice.to - slice.from), 0) * fullWidth : fullWidth;
  const foundationHeight = floorHeight * s.foundationFloorShare;
  const bodyHeight = floors * floorHeight + Math.max(0, floors - 1) * s.floorGap;
  const structureHeight = foundationHeight + bodyHeight + roofBandHeight(floorHeight);

  // Decision 010-1: the jib stands a floor and a half over the planned roof.
  // A pictured crane gets there on whole lengths of mast, so a house gets a
  // short crane and a block a tall one.
  const pictured = craneArtSizes();
  const reach = structureHeight + floorHeight * s.craneClearanceFloors;
  const mastHeight = pictured
    ? Math.ceil(reach / pictured.tileHeight) * pictured.tileHeight
    : Math.max(s.craneMinHeight, reach);
  const above = pictured ? Math.max(pictured.headHeight, pictured.jibAbove) : s.jibHeight;
  const height = Math.round(s.topPad + mastHeight + above);
  const groundLevel = height;

  // The crane stands close on the building's right, the gap a share of its width.
  const bodyRight = s.bodyLeft + bodyWidth;
  const mastWidth = pictured ? s.craneMastWidth : s.mastWidth;
  const craneX = bodyRight + bodyWidth * s.craneGapShare + mastWidth / 2;
  const headRight = pictured ? craneX + (1 - pictured.headPivot) * pictured.headWidth : craneX + s.craneBaseWidth / 2;
  const shortArm = pictured ? pictured.pivot * pictured.jibWidth : s.jibBack;

  return {
    width: craneX + Math.max(shortArm, headRight - craneX) + s.craneSidePad,
    height,
    groundLevel,
    structureHeight,
    floorHeight,
    bodyLeft: s.bodyLeft,
    bodyRight,
    bodyWidth,
    foundationTop: groundLevel - foundationHeight,
    buildingTop: groundLevel - foundationHeight - bodyHeight,
    roofTop: groundLevel - structureHeight,
    mastTop: groundLevel - mastHeight,
    foundationHeight,
    craneX,
    craneTop: groundLevel - mastHeight - above,
    frameLeft: s.bodyLeft - s.foundationOverhang,
    frameRight: headRight,
    slices,
  };
}

/**
 * Decision 010-7: the storey picture cut to a building's bays. Cuts fall on
 * column centres, so two pieces meet as one whole column. Fewer bays than the
 * picture has: the end bays from each side, so both ends keep their own
 * columns and edges. More: the middle bays again, in order. Null when the
 * floors are drawn or the picture's columns are not known.
 */
function baySlices(typeId: string | null): TileSlice[] | null {
  const tile = floorsHaveArt() ? artFor('floor-complete') : null;
  const columns = tile?.columns;
  if (!columns || columns.length < 3) return null;
  const edges = [0, ...columns.slice(1, -1), 1];
  const bays: TileSlice[] = edges.slice(1).map((to, i) => ({ from: edges[i] ?? 0, to }));
  const want = typeId === null ? undefined : theme.svg.baysByType[typeId];
  if (want === undefined || want === bays.length) return [{ from: 0, to: 1 }];

  const first = bays[0];
  const last = bays[bays.length - 1];
  if (!first || !last) return null;
  let picked: TileSlice[];
  if (want < bays.length) {
    const left = Math.ceil(want / 2);
    picked = [...bays.slice(0, left), ...bays.slice(bays.length - (want - left))];
  } else {
    const middle = bays.length > 2 ? bays.slice(1, -1) : [first];
    picked = [first];
    for (let i = 0; i < want - 2; i += 1) picked.push(middle[i % middle.length] ?? first);
    picked.push(last);
  }
  // Bays that were neighbours in the picture stay one piece.
  const joined: TileSlice[] = [];
  for (const bay of picked) {
    const previous = joined[joined.length - 1];
    if (previous && Math.abs(previous.to - bay.from) < 1e-9) previous.to = bay.to;
    else joined.push({ ...bay });
  }
  return joined;
}

interface FloorParts {
  group: SVGGElement;
  steel: SVGGElement;
  /** The floor's picture, in as many pieces as the building has slices; empty when drawn. */
  art: SVGImageElement[];
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

export function createBuildingView(floors: number, typeId: string | null = null): BuildingView {
  const g = geometryFor(floors, typeId);
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

  // The slab's top edge is flat and sits where the drawn one does; the
  // footings hang below it into the ground. Cut to the building's width with
  // both ends kept (decision 010-7).
  const foundationArt = cappedArt(
    'foundation',
    g.bodyLeft - s.foundationOverhang,
    g.bodyWidth + s.foundationOverhang * 2,
    s.bodyRight - s.bodyLeft + s.foundationOverhang * 2,
    g.foundationTop,
    null,
    'bld-art bld-foundation-art',
  );
  if (foundationArt) {
    svg.append(foundationArt);
    svg.classList.add('has-foundation-art');
  }

  const foundation = svgEl('rect', {
    class: 'bld-foundation',
    x: g.bodyLeft - s.foundationOverhang,
    y: g.foundationTop,
    width: g.bodyWidth + s.foundationOverhang * 2,
    height: g.foundationHeight,
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
  // A band one floor deep on the top floor, showing the picture's top: the
  // parapet and railing, not a second storey of plain wall under them. Cut
  // to the building's width with both railing ends kept (decision 010-7).
  const band = roofBandHeight(g.floorHeight);
  const roofArt = cappedArt(
    'roof',
    g.bodyLeft - s.envelopeInset,
    g.bodyWidth + s.envelopeInset * 2,
    s.bodyRight - s.bodyLeft + s.envelopeInset * 2,
    g.buildingTop - band,
    band,
    'bld-art bld-roof-art',
  );
  if (roofArt) {
    svg.append(roofArt);
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
      setBandClass(foundationArt, 'bld-art bld-foundation-art', bandStateOf(project, 'foundation'));
    }
    if (roofArt) setBandClass(roofArt, 'bld-art bld-roof-art', bandStateOf(project, 'final'));

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
      crane.setDrop(target === null ? crane.restY : floorTopOf(g, target));
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

/**
 * How tall the roof stands above the top floor. A roof picture gets a band
 * one floor deep and shows its top part in it - the parapet and the railing -
 * because at its own proportions it would stand as tall as two floors.
 */
function roofBandHeight(floorHeight: number): number {
  const s = theme.svg;
  return artFor('roof') ? floorHeight * s.roofArtFloors : s.roofHeight + s.parapetHeight;
}

/**
 * The crane pictures and their sizes in drawing units, or null to draw the
 * crane. The layout and the drawing both read this, so they cannot disagree.
 */
function craneArtSizes(): {
  head: ArtFile;
  mast: ArtFile;
  jib: ArtFile;
  tileHeight: number;
  headWidth: number;
  headHeight: number;
  /** Where the mast meets the head, as a fraction across the head picture. */
  headPivot: number;
  pivot: number;
  jibWidth: number;
  jibHeight: number;
  jibAbove: number;
} | null {
  const s = theme.svg;
  const head = artFor('crane-head');
  const mast = artFor('crane-mast');
  const jib = artFor('crane-jib');
  if (!head || !mast || !jib) return null;
  const unit = s.craneMastWidth / mast.w;
  // The jib picture is scaled so its long arm, pivot to tip, is the jib length.
  const pivot = jib.pivotX ?? 0;
  const jibWidth = s.jibLength / Math.max(0.01, 1 - pivot);
  const jibHeight = jibWidth * (jib.h / jib.w);
  return {
    head,
    mast,
    jib,
    tileHeight: mast.h * unit,
    headWidth: head.w * unit,
    headHeight: head.h * unit,
    headPivot: head.pivotX ?? 0.5,
    pivot,
    jibWidth,
    jibHeight,
    jibAbove: (jib.beamY ?? 0) * jibHeight,
  };
}

/**
 * One stretch of a picture laid into the drawing: the picture's columns
 * `from`..`to` (pixels) shown across `width` units at `x`, `height` units
 * tall from its top. A nested viewport does the cutting. Each piece runs a
 * hair past its right edge, under its neighbour, so no seam shows.
 */
function pictureSlice(
  file: ArtFile,
  from: number,
  to: number,
  x: number,
  y: number,
  width: number,
  height: number,
  imageClass: string,
): { frame: SVGSVGElement; image: SVGImageElement } {
  const unitsPerPx = width / (to - from);
  const extra = theme.svg.tileOverlap;
  const frame = svgEl('svg', {
    x,
    y,
    width: width + extra,
    height,
    viewBox: `${from} 0 ${(to - from) + extra / unitsPerPx} ${height / unitsPerPx}`,
    preserveAspectRatio: 'none',
  });
  const image = svgEl('image', {
    class: imageClass,
    href: file.url,
    width: file.w,
    height: file.h,
    preserveAspectRatio: 'none',
  });
  frame.append(image);
  return { frame, image };
}

/**
 * A foundation or roof picture cut to a building's width with both ends kept
 * (decision 010-7): the left half of the width from the picture's left end,
 * the right half from its right end, at the scale the whole picture has
 * across a whole-picture building (`fullWidth`). A narrow building loses
 * the middle; a wide one shows some of it twice. Height null keeps the
 * picture's own proportions; a number shows that much of its top.
 */
function cappedArt(
  piece: ArtPiece,
  x: number,
  width: number,
  fullWidth: number,
  y: number,
  height: number | null,
  className: string,
): SVGGElement | null {
  const file = artFor(piece);
  if (!file) return null;
  const unitsPerPx = fullWidth / file.w;
  const shown = height ?? file.h * unitsPerPx;
  const half = width / 2;
  const halfPx = half / unitsPerPx;
  const group = svgEl('g', { class: className });
  group.append(
    pictureSlice(file, 0, halfPx, x, y, half, shown, 'bld-art-piece').frame,
    pictureSlice(file, file.w - halfPx, file.w, x + half, y, half, shown, 'bld-art-piece').frame,
  );
  return group;
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
  // Grows from its own left edge: the stylesheet sets transform-box to the
  // group's box, so an origin written in drawing units here would land that
  // far to the right of it - invisible small, plain once the camera zooms in.
  const steel = svgEl('g', { class: 'floor-steel' });
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

  // With floor pictures, the floor shows whichever state it is in, cut to
  // the building's bays (decision 010-7); the picture swaps per state.
  const art: SVGImageElement[] = [];
  const tile = floorsHaveArt() ? artFor('floor-complete') : null;
  if (tile) {
    const slices = g.slices ?? [{ from: 0, to: 1 }];
    const pieces = laySlices(tile, slices, g, y, 'floor-art');
    for (const piece of [...pieces].reverse()) group.insertBefore(piece.frame, group.firstChild);
    art.push(...pieces.map((piece) => piece.image));
    // After dark a finished floor is lived in. With a window mask (order 010
    // §4: the glass picked out of the finished-floor picture) only the
    // windows light; without one, a warm wash over the whole floor.
    const glow = artFor('floor-glow');
    if (glow) {
      for (const piece of laySlices(glow, slices, g, y, 'floor-glow is-art')) group.append(piece.frame);
    } else {
      group.append(
        svgEl('rect', { class: 'floor-glow', x: g.bodyLeft, y, width: g.bodyWidth, height: g.floorHeight }),
      );
    }
  }

  return { group, steel, art, state: null, raised: false };
}

/** A storey picture laid across the building, slice after slice. */
function laySlices(
  file: ArtFile,
  slices: readonly TileSlice[],
  g: Geometry,
  y: number,
  imageClass: string,
): { frame: SVGSVGElement; image: SVGImageElement }[] {
  const fullWidth = theme.svg.bodyRight - theme.svg.bodyLeft;
  let x = g.bodyLeft;
  return slices.map((slice) => {
    const width = (slice.to - slice.from) * fullWidth;
    const piece = pictureSlice(file, slice.from * file.w, slice.to * file.w, x, y, width, g.floorHeight, imageClass);
    x += width;
    return piece;
  });
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
    const file = parts.art.length > 0 ? artFor(FLOOR_PIECE[next]) : null;
    if (file) for (const image of parts.art) setAttr(image, 'href', file.url);
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
  /** Lets the hook down to a height, in drawing units. */
  setDrop(y: number): void;
  restY: number;
  art: boolean;
} {
  const s = theme.svg;
  const group = svgEl('g', { class: 'bld-crane is-idle' });
  const x = g.craneX;
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
  // The pictured mast and head, when there are pictures, stand behind the jib.
  const standing = svgEl('g', { class: 'crane-standing' });
  group.append(standing);

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

  // The pictured crane, when there is one: whole lengths of mast stacked up
  // from the ground, the head on top, and the jib seated by its A-frame. The
  // jib's own hook was taken off by the import script; the drawn cable and
  // hook below hang from where it was, so they can ride to a floor.
  const pictured = craneArtSizes();
  const art = pictured !== null;
  let hoistX = x - s.jibLength * s.hookTrolleyTo;
  let cableTop = top;
  if (pictured) {
    const { head, mast: mastTile, jib, tileHeight, headWidth, headHeight, pivot, jibWidth, jibHeight } = pictured;
    const tiles = Math.round((g.groundLevel - top) / tileHeight);
    for (let i = 0; i < tiles; i += 1) {
      standing.append(
        svgEl('image', {
          class: 'crane-art',
          href: mastTile.url,
          x: x - s.craneMastWidth / 2,
          y: g.groundLevel - (i + 1) * tileHeight,
          width: s.craneMastWidth,
          // A hair of overlap so stacked tiles never show a hairline gap.
          height: tileHeight + s.tileOverlap,
          preserveAspectRatio: 'none',
        }),
      );
    }
    standing.append(
      svgEl('image', {
        class: 'crane-art',
        href: head.url,
        x: x - (head.pivotX ?? 0.5) * headWidth,
        y: top - headHeight,
        width: headWidth,
        height: headHeight,
        preserveAspectRatio: 'none',
      }),
    );

    // Drawn long arm right; the scene wants it out over the building to the
    // left, so it is mirrored about the mast.
    const jibY = top - pictured.jibAbove;
    slew.append(
      svgEl('image', {
        class: 'crane-art',
        href: jib.url,
        x: x - pivot * jibWidth,
        y: jibY,
        width: jibWidth,
        height: jibHeight,
        preserveAspectRatio: 'none',
        transform: `matrix(-1 0 0 1 ${2 * x} 0)`,
      }),
    );
    if (jib.hookX !== undefined) hoistX = x - (jib.hookX - pivot) * jibWidth;
    if (jib.hookY !== undefined) cableTop = jibY + jib.hookY * jibHeight;
  }

  // The cable and what hangs on it. The cable is drawn one unit long and
  // stretched to length, and the block (hook and load) rides at its end, so
  // the stylesheet can sway and bob them together off one length.
  const hoist = svgEl('g', { class: 'crane-hoist' });
  hoist.style.transformOrigin = `${hoistX}px ${cableTop}px`;
  const restY = cableTop + Math.max(s.craneMinHeight / 3, (g.groundLevel - top) * s.hookRestShare);
  const cable = svgEl('line', {
    class: 'crane-cable',
    x1: hoistX,
    y1: cableTop,
    x2: hoistX,
    y2: cableTop + 1,
    'stroke-width': s.hookLineStroke,
  });
  cable.style.transformOrigin = `${hoistX}px ${cableTop}px`;
  const block = svgEl('g', { class: 'crane-block' });
  // With a pictured crane the cable ends in a drawn hook, as the picture's
  // did; the drawn crane keeps its plain load.
  const hung = art ? s.hookSize : 0;
  const curl = s.hookSize / 2;
  if (art) {
    block.append(
      svgEl('path', {
        class: 'crane-hook',
        // A shank and a curl, half the hook each, so it ends where the load starts.
        d: `M${hoistX} ${cableTop}v${curl}a${curl} ${curl} 0 1 1 -${curl} ${curl}`,
        'stroke-width': s.hookLineStroke * s.hookStrokeScale,
      }),
    );
  }
  block.append(
    svgEl('rect', {
      class: 'crane-load',
      x: hoistX - s.loadSize / 2,
      y: cableTop + hung,
      width: s.loadSize,
      height: s.hookSize,
    }),
  );
  hoist.append(cable, block);
  slew.append(hoist);
  group.append(slew);

  function setDrop(y: number): void {
    // The block always hangs clear of the trolley, and above the floor it
    // serves rather than inside it.
    const length = Math.max(s.hookSize, y - cableTop - hung - s.hookSize);
    hoist.style.setProperty('--cable', length.toFixed(1));
    hoist.style.setProperty('--cable-y', `${length.toFixed(1)}px`);
  }
  setDrop(restY);

  return { group, setDrop, restY, art };
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
  if (stageId === 'foundation') return g.foundationTop + g.foundationHeight / 2;
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
