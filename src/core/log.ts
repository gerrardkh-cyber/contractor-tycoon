// A short, serialisable record of what just happened, for toasts, the event
// log and the offline summary. The UI reads it; it never drives any rule.

import { balance } from './data';
import { nextId } from './state';
import type { BidTierId, GameEvent, GameState } from './types';

type EventBody =
  | { kind: 'awarded'; projectId: string; typeId: string; bidTier: BidTierId; amount: number }
  | { kind: 'bidLost'; typeId: string }
  | {
      kind: 'inspection';
      projectId: string;
      typeId: string;
      gateId: string;
      floor: number | null;
      passed: boolean;
      minors: number;
    }
  | { kind: 'payment'; projectId: string; typeId: string; amount: number; delayed: boolean }
  | { kind: 'completed'; projectId: string; typeId: string; late: boolean; amount: number }
  | { kind: 'abandoned'; projectId: string; typeId: string }
  | { kind: 'defect'; typeId: string; occurred: boolean; amount: number }
  | { kind: 'licenseUp'; tier: number };

export function pushEvent(state: GameState, body: EventBody): void {
  const event = { id: nextId(state, 'ev'), atSec: state.elapsedSec, ...body } as GameEvent;
  state.log.push(event);
  const overflow = state.log.length - balance.log.maxEntries;
  if (overflow > 0) state.log.splice(0, overflow);
}

/** Events recorded at or after a given elapsed time. Used for the offline summary. */
export function eventsSince(state: GameState, sinceSec: number): GameEvent[] {
  return state.log.filter((event) => event.atSec >= sinceSec);
}
