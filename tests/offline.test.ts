import { describe, it, expect } from 'vitest';
import { advance, createInitialState, createRng, data } from '../src/core';
import {
  applyOffline,
  clearSave,
  createAutosave,
  load,
  offlineSecondsFor,
  readSave,
  save,
  serialize,
  SAVE_KEY,
  type StorageLike,
} from '../src/save';
import { seeded } from './helpers';

const CAP = data.balance.offline.maxSec;

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('offline window', () => {
  it('caps replay at eight hours', () => {
    expect(CAP).toBe(28800);
    expect(offlineSecondsFor(0, CAP * 1000)).toEqual({ sec: CAP, capped: false });
  });

  it('reports a longer gap as capped', () => {
    const tenHoursMs = 10 * 60 * 60 * 1000;
    expect(offlineSecondsFor(0, tenHoursMs)).toEqual({ sec: CAP, capped: true });
  });

  it('replays a short gap in full', () => {
    expect(offlineSecondsFor(0, 120_000)).toEqual({ sec: 120, capped: false });
  });

  it('treats a clock that went backwards as zero', () => {
    expect(offlineSecondsFor(5_000, 1_000)).toEqual({ sec: 0, capped: false });
  });

  it('advances elapsed time by exactly the cap, never more', () => {
    const rng = seeded(2);
    const state = advance(createInitialState(), 1, rng);
    const saveData = serialize(state, rng, 0);

    const result = applyOffline(saveData, 24 * 60 * 60 * 1000);
    expect(result.offlineCapped).toBe(true);
    expect(result.state.elapsedSec - state.elapsedSec).toBeCloseTo(CAP, 6);
  });
});

describe('save round trip', () => {
  it('stores and reads back a save', () => {
    const storage = memoryStorage();
    const rng = seeded(17);
    const state = advance(createInitialState(), 30, rng);

    expect(save(state, rng, 1_000, storage)).toBe(true);
    expect(storage.map.has(SAVE_KEY)).toBe(true);

    const read = readSave(storage);
    expect(read).not.toBeNull();
    expect(read!.savedAtMs).toBe(1_000);
    expect(read!.rngState).toBe(rng.getState());
    expect(read!.state.elapsedSec).toBeCloseTo(state.elapsedSec, 6);
  });

  it('starts a fresh game when nothing is stored', () => {
    const storage = memoryStorage();
    const result = load(0, 1, storage);
    expect(result.fresh).toBe(true);
    expect(result.offlineSec).toBe(0);
    expect(result.state.elapsedSec).toBe(0);
    expect(result.state.company.cash).toBe(data.balance.start.cash);
  });

  it('ignores a save written by a different version', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, savedAtMs: 0, rngState: 0, state: {} }));
    expect(readSave(storage)).toBeNull();
    expect(load(0, 1, storage).fresh).toBe(true);
  });

  it('ignores corrupted json', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, 'not json');
    expect(readSave(storage)).toBeNull();
  });

  it('clears a save on request', () => {
    const storage = memoryStorage();
    save(createInitialState(), seeded(1), 0, storage);
    clearSave(storage);
    expect(readSave(storage)).toBeNull();
  });
});

describe('offline determinism', () => {
  it('replays the same result for the same rng state', () => {
    const rng = seeded(64);
    const state = advance(createInitialState(), 10, rng);
    const saveData = serialize(state, rng, 0);

    const first = applyOffline(structuredClone(saveData), 600_000);
    const second = applyOffline(structuredClone(saveData), 600_000);
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state));
  });

  it('restores the rng stream so play continues where it left off', () => {
    const rng = createRng(500);
    const state = advance(createInitialState(), 10, rng);
    const saveData = serialize(state, rng, 0);

    const expected = advance(state, 60, createRngAt(rng.getState()));
    const restored = applyOffline(saveData, 60_000);
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(expected));
  });
});

function createRngAt(value: number) {
  const rng = createRng(0);
  rng.setState(value);
  return rng;
}

describe('autosave disposal', () => {
  it('stops writing once disposed, so a delete actually sticks', () => {
    const storage = memoryStorage();
    const rng = seeded(71);
    const state = createInitialState();

    const autosave = createAutosave(() => ({ state, rng }), storage);
    autosave.tick(data.balance.save.autosaveSec, state, rng, 1_000);
    expect(readSave(storage)).not.toBeNull();

    autosave.dispose();
    clearSave(storage);

    // Anything that would have saved after the delete must be a no-op.
    autosave.tick(data.balance.save.autosaveSec, state, rng, 2_000);
    autosave.flush(state, rng, 3_000);
    expect(readSave(storage)).toBeNull();
  });
});
