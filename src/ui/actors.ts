// Who is on site.
//
// Workers, a mixer truck and the inspector, drawn as two- and three-frame
// vector figures in the same coordinate space as the building so they can
// stand on its ground line and climb to its floors.
//
// They read the project the same way the building does - whatever the crew is
// doing is what the figures do - and they animate with transform and opacity
// only, so the whole layer costs one composited frame.

import { findTask, type GameState, type Project } from '../core';
import { floorTopOf, type Geometry } from './building';
import { clear, svgEl, toggleClass } from './dom';
import { theme } from './theme';

export interface Actors {
  node: SVGSVGElement;
  update(project: Project, state: GameState): void;
  /** The inspector walks in, gives a verdict and leaves. */
  inspect(passed: boolean): void;
  /** Handover: everyone downs tools. */
  cheer(): void;
  dispose(): void;
}

/** How many of the crew work up on the floor that is going up. */
const CLIMBERS = 2;

interface Worker {
  group: SVGGElement;
  /** Where this one walks from, in viewBox units. */
  base: number;
}

export function createActors(g: Geometry): Actors {
  const s = theme.scene;
  const svg = svgEl('svg', {
    class: 'actors',
    viewBox: `0 0 ${g.width} ${g.height}`,
    preserveAspectRatio: 'xMidYMax meet',
    'aria-hidden': 'true',
  });

  // The hut the crew shelters in when it rains.
  svg.append(hut(g));

  const ground = svgEl('g', { class: 'actor-ground' });
  const climbers = svgEl('g', { class: 'actor-climbers' });
  const truck = buildTruck(g);
  const inspector = buildInspector(g);
  svg.append(truck.group, ground, climbers, inspector.group);

  const crew: Worker[] = [];
  const climbing: SVGGElement[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  let crewSize = -1;
  let climbTo: number | null = null;
  let fixing: boolean | null = null;
  let started = new Set<string>();
  let sheltering: boolean | null = null;
  let resting: boolean | null = null;

  function update(project: Project, state: GameState): void {
    syncCrew(project);

    // Someone is up there whenever there is something to do up there:
    // framing the floor that is going up, or rubbing out a punch item.
    const framing = project.tasks.find(
      (task) =>
        task.stageId === 'structural' &&
        task.floor !== null &&
        (task.status === 'working' || task.status === 'rework'),
    );
    const clearing = project.punchClearQueued > 0;
    const floor = framing?.floor ?? (clearing ? project.floors - 1 : null);
    if (floor !== climbTo) {
      climbTo = floor;
      placeClimbers(floor);
      syncCrew(project);
    }
    if (clearing !== fixing) {
      fixing = clearing;
      toggleClass(svg, 'is-fixing', clearing);
    }

    // A pour brings the mixer in: foundation, and the first floor of framing.
    for (const stageId of ['foundation', 'structural']) {
      const task = findTask(project, stageId, stageId === 'structural' ? 0 : null);
      const running = task?.status === 'working';
      if (running && !started.has(stageId)) {
        started.add(stageId);
        pour();
      }
      if (!running && task?.status === 'waiting') started.delete(stageId);
    }

    const wet = state.weather.raining && !project.riskyPourActive;
    if (wet !== sheltering) {
      sheltering = wet;
      toggleClass(svg, 'is-sheltering', wet);
    }

    // Out of money: the crew sits down rather than vanishing.
    const stalled = project.stalled && !wet;
    if (stalled !== resting) {
      resting = stalled;
      toggleClass(svg, 'is-resting', stalled);
    }
  }

  /** Crew size follows the size of the job. */
  function syncCrew(project: Project): void {
    const floors = project.floors;
    const total = Math.max(
      s.workerMin,
      Math.min(s.workerMax, s.workerMin + Math.floor(floors / s.workerFloorsPerExtra)),
    );
    // Order 008 §3 is a crew of three to six. The two up on the floor are two
    // of them, not two more.
    const want = Math.max(1, total - (climbTo === null ? 0 : CLIMBERS));
    if (want === crewSize) return;
    crewSize = want;

    clear(ground);
    crew.length = 0;
    const span = g.bodyRight - g.bodyLeft + s.workerHeight * 4;
    for (let i = 0; i < want; i += 1) {
      const base = g.bodyLeft - s.workerHeight * 2 + (span / want) * i;
      const group = walker('worker', base, g.groundLevel, i);
      crew.push({ group, base });
      ground.append(group);
    }
  }

  /** Two figures on whichever floor is being framed. */
  function placeClimbers(floor: number | null): void {
    if (floor === null) {
      clear(climbers);
      climbing.length = 0;
      return;
    }
    if (climbing.length === 0) {
      for (let i = 0; i < CLIMBERS; i += 1) {
        const group = walker('worker is-climber', 0, 0, i + 2);
        climbing.push(group);
        climbers.append(group);
      }
    }
    const y = floorTopOf(g, floor) + g.floorHeight;
    for (let i = 0; i < climbing.length; i += 1) {
      const x = g.bodyLeft + g.bodyWidth * (i === 0 ? 0.28 : 0.68);
      climbing[i]?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }
  }

  /** The mixer drives in, stands while the pour runs, and backs out. */
  function pour(): void {
    truck.group.classList.remove('is-pouring');
    void truck.group.getBoundingClientRect();
    truck.group.classList.add('is-pouring');
    const life = s.truckEnterMs + s.truckStayMs + s.truckLeaveMs;
    timers.push(globalThis.setTimeout(() => truck.group.classList.remove('is-pouring'), life));
  }

  function inspect(passed: boolean): void {
    inspector.verdict(passed);
    inspector.group.classList.remove('is-visiting');
    void inspector.group.getBoundingClientRect();
    inspector.group.classList.add('is-visiting');
    const life = s.inspectorWalkMs * 2 + s.inspectorStayMs;
    timers.push(
      globalThis.setTimeout(() => inspector.group.classList.remove('is-visiting'), life),
    );
  }

  function cheer(): void {
    svg.classList.add('is-cheering');
    timers.push(globalThis.setTimeout(() => svg.classList.remove('is-cheering'), s.celebrateMs));
  }

  function dispose(): void {
    for (const timer of timers) globalThis.clearTimeout(timer);
    timers.length = 0;
    clear(svg);
  }

  return { node: svg, update, inspect, cheer, dispose };
}

// ---- figures --------------------------------------------------------------

/**
 * One figure: a hard hat, a body, and two pairs of legs swapped by a two-frame
 * animation. The outer group places it, the middle one walks, the inner one
 * steps - so a walk never fights with a position.
 */
function walker(className: string, x: number, y: number, index: number): SVGGElement {
  const s = theme.scene;
  const h = s.workerHeight;
  const outer = svgEl('g', { class: className });
  outer.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

  const walk = svgEl('g', { class: 'actor-walk' });
  walk.style.animationDelay = `${index * s.workerStepMs}ms`;
  walk.style.animationDuration = `${s.workerWalkMs + index * s.workerStepMs}ms`;

  const body = svgEl('g', { class: 'actor-body' });
  body.append(
    svgEl('path', { class: 'actor-hat', d: `M ${-h * 0.2} ${-h} h ${h * 0.4} a ${h * 0.2} ${h * 0.2} 0 0 0 ${-h * 0.4} 0 z` }),
    svgEl('line', { class: 'actor-torso', x1: 0, y1: -h * 0.92, x2: 0, y2: -h * 0.4 }),
    svgEl('line', { class: 'actor-arm', x1: 0, y1: -h * 0.8, x2: h * 0.3, y2: -h * 0.6 }),
    svgEl('g', { class: 'actor-legs is-a' }, [
      svgEl('line', { x1: 0, y1: -h * 0.4, x2: -h * 0.22, y2: 0 }),
      svgEl('line', { x1: 0, y1: -h * 0.4, x2: h * 0.22, y2: 0 }),
    ]),
    svgEl('g', { class: 'actor-legs is-b' }, [
      svgEl('line', { x1: 0, y1: -h * 0.4, x2: -h * 0.05, y2: 0 }),
      svgEl('line', { x1: 0, y1: -h * 0.4, x2: h * 0.3, y2: 0 }),
    ]),
  );

  walk.append(body);
  outer.append(walk);
  return outer;
}

/** The site office: where the crew goes when it rains. */
function hut(g: Geometry): SVGGElement {
  const s = theme.scene;
  const w = s.workerHeight * 2.4;
  const h = s.workerHeight * 1.3;
  const x = g.bodyLeft - w - s.workerHeight;
  const y = g.groundLevel - h;
  return svgEl('g', { class: 'actor-hut' }, [
    svgEl('rect', { class: 'hut-body', x, y, width: w, height: h }),
    svgEl('rect', { class: 'hut-door', x: x + w * 0.6, y: y + h * 0.35, width: w * 0.22, height: h * 0.65 }),
    svgEl('line', { class: 'hut-roof', x1: x - 1, y1: y, x2: x + w + 1, y2: y }),
  ]);
}

/** A mixer: cab, drum and two wheels. */
function buildTruck(g: Geometry): { group: SVGGElement } {
  const s = theme.scene;
  const w = s.truckWidth;
  const h = s.truckHeight;
  const y = g.groundLevel;
  const group = svgEl('g', { class: 'actor-truck' });
  // Enters from the left, stands in front of the pour, reverses out the way
  // it came (order 008 §3).
  group.style.setProperty('--truck-from', `${(-w * 1.4).toFixed(1)}px`);
  group.style.setProperty('--truck-stop', `${(g.bodyLeft - w * 0.2).toFixed(1)}px`);
  group.style.setProperty('--truck-back', `${(g.bodyLeft - w * 0.9).toFixed(1)}px`);
  group.style.setProperty('--truck-enter', `${s.truckEnterMs}ms`);
  group.style.setProperty('--truck-stay', `${s.truckStayMs}ms`);
  group.style.setProperty('--truck-leave', `${s.truckLeaveMs}ms`);

  group.append(
    svgEl('rect', { class: 'truck-cab', x: 0, y: y - h, width: w * 0.3, height: h * 0.7 }),
    svgEl('rect', { class: 'truck-bed', x: w * 0.3, y: y - h * 0.55, width: w * 0.7, height: h * 0.3 }),
    svgEl('ellipse', { class: 'truck-drum', cx: w * 0.62, cy: y - h * 0.75, rx: w * 0.26, ry: h * 0.42 }),
    svgEl('circle', { class: 'truck-wheel', cx: w * 0.2, cy: y - h * 0.12, r: h * 0.18 }),
    svgEl('circle', { class: 'truck-wheel', cx: w * 0.78, cy: y - h * 0.12, r: h * 0.18 }),
  );
  return { group };
}

/** The inspector: a figure with a clipboard and a verdict bubble. */
function buildInspector(g: Geometry): { group: SVGGElement; verdict(passed: boolean): void } {
  const s = theme.scene;
  const h = s.inspectorHeight;
  const group = svgEl('g', { class: 'actor-inspector' });
  group.style.setProperty('--walk-ms', `${s.inspectorWalkMs}ms`);
  group.style.setProperty('--stay-ms', `${s.inspectorStayMs}ms`);
  // The figure starts off the right edge and walks to the front of the site.
  group.style.setProperty('--walk-to', `${(g.bodyLeft - h * 1.6 - g.width).toFixed(1)}px`);

  const figure = walker('inspector-figure', g.width, g.groundLevel, 0);
  figure.append(
    svgEl('rect', {
      class: 'inspector-board',
      x: -h * 0.55,
      y: -h * 0.72,
      width: h * 0.4,
      height: h * 0.5,
    }),
  );

  // Drawn in the group's own space: the whole group is what walks, so a
  // final-position coordinate here would end up one walk too far left.
  const bubble = svgEl('g', { class: 'inspector-bubble' });
  const cx = g.width;
  const cy = g.groundLevel - h * 1.9;
  const mark = svgEl('path', { class: 'bubble-mark', d: theme.svg.badgeTick });
  bubble.append(
    svgEl('circle', { class: 'bubble-disc', cx, cy, r: s.bubbleSize / 2 }),
    mark,
  );
  mark.setAttribute('transform', `translate(${cx} ${cy})`);
  group.append(figure, bubble);

  function verdict(passed: boolean): void {
    toggleClass(bubble, 'is-pass', passed);
    toggleClass(bubble, 'is-fail', !passed);
    mark.setAttribute('d', passed ? theme.svg.badgeTick : theme.svg.badgeCross);
  }

  return { group, verdict };
}
