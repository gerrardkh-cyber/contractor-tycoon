// Draws a project as a stack of rectangles: one per floor, with a band for the
// foundation below and weatherproofing / fit-out above. Shapes only - no art.

import { findTask, type Project } from '../core';
import { theme } from './theme';

export type FloorState = 'waiting' | 'structure' | 'structureGate' | 'services' | 'servicesGate' | 'done';
export type BandState = 'waiting' | 'active' | 'done';

const floorColors: Record<FloorState, string> = {
  waiting: theme.color.floorWaiting,
  structure: theme.color.floorStructure,
  structureGate: theme.color.floorStructureGate,
  services: theme.color.floorServices,
  servicesGate: theme.color.floorServicesGate,
  done: theme.color.floorDone,
};

const bandColors: Record<BandState, string> = {
  waiting: theme.color.bandWaiting,
  active: theme.color.bandActive,
  done: theme.color.bandDone,
};

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

export function createBuildingCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'building';
  canvas.width = theme.size.canvasWidth;
  canvas.height = theme.size.canvasHeight;
  canvas.style.aspectRatio = `${theme.size.canvasWidth} / ${theme.size.canvasHeight}`;
  return canvas;
}

export function drawBuilding(canvas: HTMLCanvasElement, project: Project): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { canvasWidth: w, canvasHeight: h, bandHeight, floorGap } = theme.size;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  if (canvas.width !== w * ratio) {
    canvas.width = w * ratio;
    canvas.height = h * ratio;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.fillStyle = theme.color.sky;
  ctx.fillRect(0, 0, w, h);

  const margin = 16;
  const bodyWidth = w - margin * 2;
  const groundHeight = 6;

  // Ground line.
  ctx.fillStyle = theme.color.ground;
  ctx.fillRect(0, h - groundHeight, w, groundHeight);

  // Two bands on top (fit-out, weatherproofing) and one below (foundation).
  const topBands = ['final', 'weatherproof'] as const;
  const available = h - groundHeight - bandHeight * (topBands.length + 1) - floorGap * 2;
  const floorHeight = Math.max(
    theme.size.minFloorHeight,
    Math.min(theme.size.maxFloorHeight, available / Math.max(1, project.floors) - floorGap),
  );

  let y = h - groundHeight;

  // Foundation band sits at the bottom.
  y -= bandHeight;
  ctx.fillStyle = bandColors[bandStateOf(project, 'foundation')];
  ctx.fillRect(margin - 4, y, bodyWidth + 8, bandHeight);
  y -= floorGap;

  // Floors stack upward.
  for (let floor = 0; floor < project.floors; floor += 1) {
    y -= floorHeight;
    if (y < bandHeight * 2) break;
    ctx.fillStyle = floorColors[floorStateOf(project, floor)];
    ctx.fillRect(margin, y, bodyWidth, floorHeight);
    y -= floorGap;
  }

  // Weatherproofing then fit-out cap the building.
  for (const stageId of ['weatherproof', 'final'] as const) {
    y -= bandHeight;
    if (y < 0) break;
    const inset = stageId === 'final' ? 10 : 2;
    ctx.fillStyle = bandColors[bandStateOf(project, stageId)];
    ctx.fillRect(margin + inset, y, bodyWidth - inset * 2, bandHeight);
    y -= floorGap;
  }
}
