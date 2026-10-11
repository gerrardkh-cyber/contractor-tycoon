// The image slots, and the vector fallback behind every one of them.
//
// Order 009 §2 made the building and the city pictures; order 010 added the
// crew, the inspector and the mixer, split the crane into a head and a mast
// that stacks, and took the hook off the jib so the drawn one can ride. Which
// slots have a picture is decided by src/ui/art-files.ts, which the import
// script writes; a slot with no file there keeps drawing itself as vectors.
// The sky, the rain and the hoarding are never pictures (docs/ART_SLOTS.md).

import { ART_FILES, type ArtFile } from './art-files';
import type { FloorState } from './building';
import { theme } from './theme';

export type ArtPiece =
  | 'floor-grid'
  | 'floor-framing'
  | 'floor-framed'
  | 'floor-services'
  | 'floor-complete'
  | 'floor-glow'
  | 'foundation'
  | 'roof'
  | 'crane-head'
  | 'crane-mast'
  | 'crane-jib'
  | 'skyline-far'
  | 'skyline-near'
  | 'ground'
  | 'worker-walk-a'
  | 'worker-walk-b'
  | 'worker-carry'
  | 'worker-sit'
  | 'worker-run'
  | 'worker-cheer'
  | 'inspector-walk'
  | 'inspector-check'
  | 'inspector-thumb'
  | 'truck';

/** The six worker poses: the crew is drawn from all of them or none. */
export const WORKER_POSES = [
  'worker-walk-a',
  'worker-walk-b',
  'worker-carry',
  'worker-sit',
  'worker-run',
  'worker-cheer',
] as const satisfies readonly ArtPiece[];

export const INSPECTOR_POSES = [
  'inspector-walk',
  'inspector-check',
  'inspector-thumb',
] as const satisfies readonly ArtPiece[];

/** True when every one of these pieces has a picture. */
export function allHaveArt(pieces: readonly ArtPiece[]): boolean {
  return pieces.every((piece) => artFor(piece) !== null);
}

/** The picture for a slot, or null to draw it as vectors. */
export function artFor(piece: ArtPiece): ArtFile | null {
  if (!theme.artEnabled) return null;
  return ART_FILES[piece] ?? null;
}

/**
 * The five floor pictures against the six states a floor can be in. A floor
 * waiting on its services inspection looks like one with its services in.
 */
export const FLOOR_PIECE: Record<FloorState, ArtPiece> = {
  waiting: 'floor-grid',
  structure: 'floor-framing',
  structureGate: 'floor-framed',
  services: 'floor-services',
  servicesGate: 'floor-services',
  done: 'floor-complete',
};

/** True when every floor state has a picture: floors are all or nothing. */
export function floorsHaveArt(): boolean {
  return Object.values(FLOOR_PIECE).every((piece) => artFor(piece) !== null);
}
