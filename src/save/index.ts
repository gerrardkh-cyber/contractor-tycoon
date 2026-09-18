// src/save - persistence and offline progress.
//
// Contract (CLAUDE.md):
//   - Save/restore via localStorage.
//   - Offline progress is replayed through core.advance() from the last saved
//     timestamp, capped by the offline limit in src/data.
//
// Storage is injected so the module is testable outside a browser.

import { advance, createInitialState, createRng, data, type GameState, type Rng } from '../core';

export const SAVE_KEY = 'contractor-tycoon:save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAtMs: number;
  rngState: number;
  state: GameState;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
}

export function defaultStorage(): StorageLike | null {
  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}

export function serialize(state: GameState, rng: Rng, nowMs: number): SaveData {
  return { version: SAVE_VERSION, savedAtMs: nowMs, rngState: rng.getState(), state };
}

export function save(
  state: GameState,
  rng: Rng,
  nowMs: number,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, rng, nowMs)));
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

/** Replays a save forward to now. No bidding happens, so sites simply finish what they hold. */
export function applyOffline(saveData: SaveData, nowMs: number): LoadResult {
  const rng = createRng(0);
  rng.setState(saveData.rngState);

  const { sec, capped } = offlineSecondsFor(saveData.savedAtMs, nowMs);
  const state = sec > 0 ? advance(saveData.state, sec, rng) : saveData.state;

  return { state, rng, offlineSec: sec, offlineCapped: capped, fresh: false };
}

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
    };
  }
  return applyOffline(saveData, nowMs);
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  storage?.removeItem(SAVE_KEY);
}

export interface AutosaveHandle {
  /** Call every frame with the real seconds elapsed; saves once the interval is due. */
  tick(dtSec: number, state: GameState, rng: Rng, nowMs: number): void;
  /** Saves immediately, regardless of the interval. */
  flush(state: GameState, rng: Rng, nowMs: number): void;
  dispose(): void;
}

/** Autosave on an interval, plus one final save on beforeunload where that exists. */
export function createAutosave(
  getSnapshot: () => { state: GameState; rng: Rng },
  storage: StorageLike | null = defaultStorage(),
): AutosaveHandle {
  const intervalSec = data.balance.save.autosaveSec;
  let sinceSaveSec = 0;

  const flush = (state: GameState, rng: Rng, nowMs: number): void => {
    sinceSaveSec = 0;
    save(state, rng, nowMs, storage);
  };

  const onUnload = (): void => {
    const snapshot = getSnapshot();
    flush(snapshot.state, snapshot.rng, Date.now());
  };

  const target = (globalThis as { addEventListener?: typeof addEventListener }).addEventListener
    ? (globalThis as unknown as Window)
    : null;
  target?.addEventListener('beforeunload', onUnload);

  return {
    tick(dtSec, state, rng, nowMs) {
      sinceSaveSec += dtSec;
      if (sinceSaveSec >= intervalSec) flush(state, rng, nowMs);
    },
    flush,
    dispose() {
      target?.removeEventListener('beforeunload', onUnload);
    },
  };
}
