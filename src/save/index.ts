// src/save - persistence and offline progress.
//
// Contract (CLAUDE.md):
//   - Save/restore via localStorage.
//   - Offline progress is replayed through core.advance() from the last saved
//     timestamp, capped by the offline limit in src/data.
//
// Storage is injected so the module is testable outside a browser.

import {
  advance,
  createInitialState,
  createRng,
  data,
  netWorth,
  type GameState,
  type Rng,
} from '../core';

/**
 * The preview build is served on the same origin as the real game, one folder
 * down, so it shares the browser's storage. It keeps everything under its own
 * prefix: trying the preview never touches the real save, guide or settings.
 */
export const PREVIEW_BUILD = import.meta.env.VITE_PREVIEW === '1';
const STORAGE_PREFIX = PREVIEW_BUILD ? 'contractor-tycoon-preview' : 'contractor-tycoon';

/** The browser-storage key for one thing the game remembers. */
export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}:${name}`;
}

export const SAVE_KEY = storageKey('save');
export const SAVE_VERSION = 3;

/**
 * Order 011 §5: a building the company has handed over, kept for the skyline
 * behind the sites. A record for the screen only - no rule reads it.
 */
export interface BuiltRecord {
  readonly typeId: string;
  readonly floors: number;
  /** 1 for the company's first handover, 2 for its second, and so on. */
  readonly order: number;
}

export interface SaveData {
  version: number;
  savedAtMs: number;
  rngState: number;
  state: GameState;
  /** Absent in saves from before order 011. */
  built?: BuiltRecord[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What happened while the tab was away, for the welcome-back screen. */
export interface OfflineSummary {
  completed: number;
  repairs: number;
  inspectionsPassed: number;
  inspectionsFailed: number;
  cashDelta: number;
  netWorthDelta: number;
}

export interface LoadResult {
  state: GameState;
  rng: Rng;
  /** Seconds actually replayed. 0 for a fresh game. */
  offlineSec: number;
  /** True when the real gap exceeded the offline cap and was clipped. */
  offlineCapped: boolean;
  /** True when no usable save was found and a new game was started. */
  fresh: boolean;
  summary: OfflineSummary;
  /** The handed-over buildings, oldest first, including any finished while away. */
  built: BuiltRecord[];
}

export function defaultStorage(): StorageLike | null {
  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}

export function serialize(
  state: GameState,
  rng: Rng,
  nowMs: number,
  built: readonly BuiltRecord[] = [],
): SaveData {
  return { version: SAVE_VERSION, savedAtMs: nowMs, rngState: rng.getState(), state, built: [...built] };
}

export function save(
  state: GameState,
  rng: Rng,
  nowMs: number,
  storage: StorageLike | null = defaultStorage(),
  built: readonly BuiltRecord[] = [],
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, rng, nowMs, built)));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: StorageLike | null = defaultStorage()): SaveData | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Seconds of offline time to replay, clipped to the cap in src/data. */
export function offlineSecondsFor(savedAtMs: number, nowMs: number): { sec: number; capped: boolean } {
  const rawSec = Math.max(0, (nowMs - savedAtMs) / 1000);
  const cap = data.balance.offline.maxSec;
  return { sec: Math.min(rawSec, cap) * data.balance.offline.efficiency, capped: rawSec > cap };
}

/**
 * The record for one handover, or null for repair work, which is not a
 * building of the company's own. The one place that decides it, for a
 * handover seen live and one replayed while away alike.
 */
export function builtRecordFor(typeId: string, order: number): BuiltRecord | null {
  const type = data.projectTypeById[typeId];
  if (!type || type.lifeline) return null;
  return { typeId: type.id, floors: type.floors, order };
}

function isBuiltRecord(value: unknown): value is BuiltRecord {
  const record = value as Partial<BuiltRecord> | null;
  return (
    typeof record === 'object' &&
    record !== null &&
    typeof record.typeId === 'string' &&
    typeof record.floors === 'number' &&
    typeof record.order === 'number'
  );
}

/**
 * The handed-over buildings a save records. A save from before the list
 * existed gets one house per completion, so its skyline is not empty; a
 * list that is not one is ignored rather than trusted.
 */
export function builtOf(saveData: SaveData): BuiltRecord[] {
  if (Array.isArray(saveData.built)) return saveData.built.filter(isBuiltRecord);
  const house = data.requireProjectType('house');
  return Array.from({ length: saveData.state.company.completedProjects }, (_, i) => ({
    typeId: house.id,
    floors: house.floors,
    order: i + 1,
  }));
}

/**
 * Sites handed over between two states, in the order they were handed over:
 * by their handover in the log where it is still there, otherwise by when
 * they started. Offline no site is ever walked away from, so a site gone
 * from the list was finished.
 */
function handedOver(before: GameState, after: GameState, startOrder: number): BuiltRecord[] {
  const still = new Set(after.projects.map((project) => project.id));
  const finishedAt = new Map<string, number>();
  for (const event of after.log) {
    if (event.kind === 'completed') finishedAt.set(event.projectId, event.atSec);
  }
  const gone = before.projects
    .filter((project) => !still.has(project.id))
    .sort((a, b) => (finishedAt.get(a.id) ?? a.startedAtSec) - (finishedAt.get(b.id) ?? b.startedAtSec));
  const records: BuiltRecord[] = [];
  for (const project of gone) {
    const record = builtRecordFor(project.typeId, startOrder + records.length + 1);
    if (record) records.push(record);
  }
  return records;
}

function withHandovers(built: BuiltRecord[], before: GameState, after: GameState): BuiltRecord[] {
  const last = built[built.length - 1]?.order ?? before.company.completedProjects;
  return [...built, ...handedOver(before, after, last)];
}

/** Replays a save forward to now. No bidding happens, so sites simply finish what they hold. */
export function applyOffline(saveData: SaveData, nowMs: number): LoadResult {
  const rng = createRng(0);
  rng.setState(saveData.rngState);

  const before = saveData.state;
  const { sec, capped } = offlineSecondsFor(saveData.savedAtMs, nowMs);
  const state = sec > 0 ? advance(before, sec, rng) : before;

  return {
    state,
    rng,
    offlineSec: sec,
    offlineCapped: capped,
    fresh: false,
    summary: summarise(before, state),
    built: withHandovers(builtOf(saveData), before, state),
  };
}

function summarise(before: GameState, after: GameState): OfflineSummary {
  const passedBefore = before.stats.totalInspections - before.stats.totalInspectionFailures;
  const passedAfter = after.stats.totalInspections - after.stats.totalInspectionFailures;
  return {
    completed: after.company.completedProjects - before.company.completedProjects,
    repairs: after.stats.repairCount - before.stats.repairCount,
    inspectionsPassed: passedAfter - passedBefore,
    inspectionsFailed: after.stats.totalInspectionFailures - before.stats.totalInspectionFailures,
    cashDelta: after.company.cash - before.company.cash,
    netWorthDelta: netWorth(after) - netWorth(before),
  };
}

const emptySummary: OfflineSummary = {
  completed: 0,
  repairs: 0,
  inspectionsPassed: 0,
  inspectionsFailed: 0,
  cashDelta: 0,
  netWorthDelta: 0,
};

export function load(
  nowMs: number,
  seed: number,
  storage: StorageLike | null = defaultStorage(),
): LoadResult {
  const saveData = readSave(storage);
  if (!saveData) {
    return {
      state: createInitialState(),
      rng: createRng(seed),
      offlineSec: 0,
      offlineCapped: false,
      fresh: true,
      summary: emptySummary,
      built: [],
    };
  }
  return applyOffline(saveData, nowMs);
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  storage?.removeItem(SAVE_KEY);
}

export interface AutosaveHandle {
  /** Call every frame with the real seconds elapsed; saves once the interval is due. */
  tick(dtSec: number, state: GameState, rng: Rng, nowMs: number, built?: readonly BuiltRecord[]): void;
  /** Saves immediately, regardless of the interval. */
  flush(state: GameState, rng: Rng, nowMs: number, built?: readonly BuiltRecord[]): void;
  dispose(): void;
}

/** Autosave on an interval, plus one final save on beforeunload where that exists. */
export function createAutosave(
  getSnapshot: () => { state: GameState; rng: Rng; built?: readonly BuiltRecord[] },
  storage: StorageLike | null = defaultStorage(),
): AutosaveHandle {
  const intervalSec = data.balance.save.autosaveSec;
  let sinceSaveSec = 0;

  let disposed = false;

  const flush = (state: GameState, rng: Rng, nowMs: number, built: readonly BuiltRecord[] = []): void => {
    if (disposed) return;
    sinceSaveSec = 0;
    save(state, rng, nowMs, storage, built);
  };

  const onUnload = (): void => {
    const snapshot = getSnapshot();
    flush(snapshot.state, snapshot.rng, Date.now(), snapshot.built);
  };

  const target = (globalThis as { addEventListener?: typeof addEventListener }).addEventListener
    ? (globalThis as unknown as Window)
    : null;
  target?.addEventListener('beforeunload', onUnload);

  return {
    tick(dtSec, state, rng, nowMs, built) {
      if (disposed) return;
      sinceSaveSec += dtSec;
      if (sinceSaveSec >= intervalSec) flush(state, rng, nowMs, built);
    },
    flush,
    /** Stops all further saving, including the unload flush. */
    dispose() {
      disposed = true;
      target?.removeEventListener('beforeunload', onUnload);
    },
  };
}
