import { describe, it, expect } from 'vitest';
import { data } from '../src/core';
import { applyOffline, builtOf, builtRecordFor, readSave, save, serialize, type StorageLike } from '../src/save';
import { awardProject, seeded } from './helpers';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/**
 * Order 011 §5: the save keeps a list of handed-over buildings - type, floors
 * and order - for the skyline. Display only: no rule reads it.
 */
describe('the skyline record in the save', () => {
  it('round-trips with the save', () => {
    const rng = seeded(3);
    const state = awardProject(rng, 'fair', 'house');
    const storage = memoryStorage();
    const built = [{ typeId: 'midrise', floors: 8, order: 1 }, { typeId: 'house', floors: 1, order: 2 }];
    expect(save(state, rng, 0, storage, built)).toBe(true);
    expect(readSave(storage)?.built).toEqual(built);
  });

  it('fills a save from before the list with one house per completion', () => {
    const rng = seeded(4);
    const state = awardProject(rng, 'fair', 'house');
    const old = serialize(state, rng, 0);
    delete old.built;
    old.state.company.completedProjects = 5;
    const house = data.requireProjectType('house');
    expect(builtOf(old)).toEqual(
      [1, 2, 3, 4, 5].map((order) => ({ typeId: 'house', floors: house.floors, order })),
    );
  });

  it('adds a site handed over while away, in order after the ones before', () => {
    const rng = seeded(5);
    const state = awardProject(rng, 'fair', 'house');
    const saved = serialize(state, rng, 0, [{ typeId: 'lowrise', floors: 3, order: 1 }]);
    saved.state.company.completedProjects = 1;
    const result = applyOffline(saved, EIGHT_HOURS_MS);
    expect(result.state.projects).toHaveLength(0);
    expect(result.built).toEqual([
      { typeId: 'lowrise', floors: 3, order: 1 },
      { typeId: 'house', floors: data.requireProjectType('house').floors, order: 2 },
    ]);
  });

  it('leaves repair work out', () => {
    const rng = seeded(6);
    const state = awardProject(rng, 'fair', 'house');
    const saved = serialize(state, rng, 0);
    const site = saved.state.projects[0];
    if (!site) throw new Error('no site');
    (site as { typeId: string }).typeId = 'repair';
    const result = applyOffline(saved, EIGHT_HOURS_MS);
    expect(result.state.projects).toHaveLength(0);
    expect(result.built).toEqual([]);
  });

  it('keeps no record for repair work, and one for any other handover', () => {
    expect(builtRecordFor('repair', 3)).toBeNull();
    expect(builtRecordFor('midrise', 3)).toEqual({ typeId: 'midrise', floors: data.requireProjectType('midrise').floors, order: 3 });
  });

  it('drops entries that are not records rather than trusting them', () => {
    const rng = seeded(7);
    const state = awardProject(rng, 'fair', 'house');
    const odd = serialize(state, rng, 0) as unknown as { built: unknown };
    odd.built = [{ typeId: 'house', floors: 1, order: 1 }, null, { typeId: 7 }];
    expect(builtOf(odd as never)).toEqual([{ typeId: 'house', floors: 1, order: 1 }]);
  });
});
