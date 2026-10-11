// The image slots, and the vector fallback behind every one of them.
//
// Order 009 §2: twelve pieces of the scene can be pictures - the five floor
// states, foundation, roof, the crane's tower and jib, both skylines and the
// ground. Whether they are is decided by src/ui/art-files.ts, which the import
// script writes; a slot with no file there keeps drawing itself as vectors.
// The sky, the rain, the crew, the mixer, the inspector and the hoarding are
// not image slots at all (docs/ART_SLOTS.md).

import { ART_FILES, type ArtFile } from './art-files';
import type { FloorState } from './building';
import { theme } from './theme';

export type ArtPiece =
  | 'floor-grid'
  | 'floor-framing'
  | 'floor-framed'
  | 'floor-services'
  | 'floor-complete'
  | 'foundation'
  | 'roof'
  | 'crane-tower'
  | 'crane-jib'
  | 'skyline-far'
  | 'skyline-near'
  | 'ground';

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
