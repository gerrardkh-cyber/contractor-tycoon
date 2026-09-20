import { describe, it, expect } from 'vitest';
import { advance, createInitialState, data, estimateMargin } from '../src/core';
import type { GameState, InspectorId, Rfq } from '../src/core';
import { seeded } from './helpers';

const { balance, requireProjectType } = data;

/** A stand-in RFQ for a type and inspector, priced exactly as the board prices one. */
function rfqFor(typeId: string, inspectorId: InspectorId): Rfq {
  const type = requireProjectType(typeId);
  const inspector = balance.inspectors.find((entry) => entry.id === inspectorId)!;
  return {
    id: 'x',
    typeId,
    contractBase: type.baseContract * inspector.contractMultiplier,
    clientTrait: 'price',
    inspector: inspectorId,
    deadlineSec: 1_000,
    advanceAvailable: false,
    minCash: 0,
    directAward: false,
    postedAtSec: 0,
  };
}

function atLevel(level: number): GameState {
  const state = advance(createInitialState(), 0.25, seeded(1));
  const levels = { ...state.company.subLevels };
  for (const id of data.subIds) levels[id] = level;
  return { ...state, company: { ...state.company, subLevels: levels } };
}

// The table published in BALANCE.md 4.1.3, as percentages of the awarded amount.
const PUBLISHED: Record<string, Record<string, [number, number]>> = {
  house: { lenient: [9.1, 10.7], normal: [10.9, 12.9], strict: [10.4, 12.9] },
  lowrise: { lenient: [9.6, 11.1], normal: [12.4, 14.3], strict: [14.1, 16.4] },
  midrise: { lenient: [9.4, 10.9], normal: [12.1, 14.1], strict: [15.2, 17.6] },
};

describe('the margin table in BALANCE.md matches the engine', () => {
  const lv1 = atLevel(1);
  const lv5 = atLevel(5);

  for (const [typeId, byInspector] of Object.entries(PUBLISHED)) {
    for (const [inspectorId, [expectedLv1, expectedLv5]] of Object.entries(byInspector)) {
      it(`${typeId} / ${inspectorId}`, () => {
        const rfq = rfqFor(typeId, inspectorId as InspectorId);
        expect(estimateMargin(lv1, rfq, 'fair').ratio * 100).toBeCloseTo(expectedLv1, 1);
        expect(estimateMargin(lv5, rfq, 'fair').ratio * 100).toBeCloseTo(expectedLv5, 1);
      });
    }
  }

  it('keeps every combination profitable at level 1', () => {
    for (const typeId of Object.keys(PUBLISHED)) {
      for (const inspector of balance.inspectors) {
        const ratio = estimateMargin(lv1, rfqFor(typeId, inspector.id as InspectorId), 'fair').ratio;
        expect(ratio, `${typeId}/${inspector.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('pays a standard inspector the multiplier recorded in BALANCE.md', () => {
    const normal = balance.inspectors.find((entry) => entry.id === 'normal')!;
    expect(normal.contractMultiplier).toBe(1.12);
  });
});
