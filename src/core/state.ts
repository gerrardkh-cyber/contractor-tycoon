// Initial state construction and id generation.

import { balance, eventTemplates } from './data';
import { initialSubLevels } from './company';
import type { GameState } from './types';

const eventIntervals: Record<string, number> = Object.fromEntries(
  eventTemplates
    .filter((event): event is typeof event & { intervalSec: number } => typeof event.intervalSec === 'number')
    .map((event) => [event.id, event.intervalSec]),
);

function intervalSecOf(eventId: string): number {
  const interval = eventIntervals[eventId];
  if (interval === undefined) throw new Error(`event ${eventId} has no intervalSec`);
  return interval;
}

export function nextId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}_${state.nextId}`;
}

export function createInitialState(): GameState {
  return {
    elapsedSec: 0,
    company: {
      cash: balance.start.cash,
      debt: 0,
      trust: balance.start.trust,
      licenseTier: balance.start.licenseTier,
      siteSlots: balance.start.siteSlots,
      subLevels: initialSubLevels(),
      completedProjects: 0,
      consecutiveBidLosses: 0,
      pendingDirectAward: false,
    },
    board: [],
    boardRotationInSec: balance.bidding.rotationSec,
    lifelineCooldownRemainingSec: 0,
    projects: [],
    warranties: [],
    abandoned: [],
    pendingPayments: [],
    pendingDecisions: [],
    weather: {
      raining: false,
      remainingSec: 0,
      nextRollInSec: intervalSecOf('rain'),
    },
    market: {
      pendingCostMultiplier: 1,
      nextRollInSec: intervalSecOf('material_spike'),
    },
    boosts: {
      doubleIncomeRemainingSec: 0,
      rainClearAvailable: 0,
      instantReworkAvailable: 0,
    },
    stats: {
      totalInspections: 0,
      totalInspectionFailures: 0,
      totalMinorsGenerated: 0,
      totalStalledSec: 0,
      defectsOccurred: 0,
      defectsCleared: 0,
      lateCompletions: 0,
      abandonedProjects: 0,
      repairCount: 0,
      lockedOutSec: 0,
      bankruptAtSec: null,
    },
    nextId: 0,
  };
}
