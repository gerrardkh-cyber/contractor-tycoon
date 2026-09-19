import { describe, it, expect } from 'vitest';
import { data, passRateFrom, subInspectionBonus, subTimeMultiplier, upgradeCost } from '../src/core';

const rules = data.balance.inspection;
const inspectors = data.balance.inspectors;

function baseOf(id: string): number {
  const inspector = inspectors.find((entry) => entry.id === id);
  if (!inspector) throw new Error(`no inspector ${id}`);
  return inspector.basePassRate;
}

describe('pass rate formula', () => {
  it('returns the inspector base at level 1 with no modifiers', () => {
    for (const inspector of inspectors) {
      const rate = passRateFrom({
        inspectorBase: inspector.basePassRate,
        subBonus: 0,
        lowBid: false,
        riskyPour: false,
        strictInspectorEvent: false,
      });
      expect(rate).toBeCloseTo(inspector.basePassRate, 10);
    }
  });

  it('adds the subcontractor bonus', () => {
    const rate = passRateFrom({
      inspectorBase: baseOf('normal'),
      subBonus: subInspectionBonus(5),
      lowBid: false,
      riskyPour: false,
      strictInspectorEvent: false,
    });
    expect(rate).toBeCloseTo(0.7 + 0.06, 10);
  });

  it('subtracts each penalty', () => {
    const rate = passRateFrom({
      inspectorBase: baseOf('lenient'),
      subBonus: 0,
      lowBid: true,
      riskyPour: true,
      strictInspectorEvent: true,
    });
    const strictEvent = data.eventTemplates.find((entry) => entry.id === 'strict_inspector')!;
    expect(rate).toBeCloseTo(
      baseOf('lenient') - rules.lowBidPenalty - rules.riskyPourPenalty - strictEvent.passRatePenalty!,
      10,
    );
  });
});

describe('pass rate boundaries', () => {
  it('clamps at the ceiling when a lenient inspector meets a maxed crew', () => {
    const raw = baseOf('lenient') + subInspectionBonus(data.balance.subcontractors.maxLevel);
    expect(raw).toBeGreaterThan(rules.maxPassRate);

    const rate = passRateFrom({
      inspectorBase: baseOf('lenient'),
      subBonus: subInspectionBonus(data.balance.subcontractors.maxLevel),
      lowBid: false,
      riskyPour: false,
      strictInspectorEvent: false,
    });
    expect(rate).toBe(rules.maxPassRate);
  });

  it('clamps at the floor when every penalty stacks on a strict inspector', () => {
    const strictEvent = data.eventTemplates.find((entry) => entry.id === 'strict_inspector')!;
    const raw =
      baseOf('strict') - rules.lowBidPenalty - rules.riskyPourPenalty - strictEvent.passRatePenalty!;
    expect(raw).toBeLessThan(rules.minPassRate);

    const rate = passRateFrom({
      inspectorBase: baseOf('strict'),
      subBonus: 0,
      lowBid: true,
      riskyPour: true,
      strictInspectorEvent: true,
    });
    expect(rate).toBe(rules.minPassRate);
  });

  it('never leaves the clamp range for any reachable combination', () => {
    for (const inspector of inspectors) {
      for (let level = 1; level <= data.balance.subcontractors.maxLevel; level += 1) {
        for (const lowBid of [false, true]) {
          for (const riskyPour of [false, true]) {
            for (const strictInspectorEvent of [false, true]) {
              const rate = passRateFrom({
                inspectorBase: inspector.basePassRate,
                subBonus: subInspectionBonus(level),
                lowBid,
                riskyPour,
                strictInspectorEvent,
              });
              expect(rate).toBeGreaterThanOrEqual(rules.minPassRate);
              expect(rate).toBeLessThanOrEqual(rules.maxPassRate);
            }
          }
        }
      }
    }
  });
});

describe('subcontractor level effects', () => {
  it('leaves level 1 unmodified', () => {
    expect(subTimeMultiplier(1)).toBe(1);
    expect(subInspectionBonus(1)).toBe(0);
  });

  it('follows the curves recorded in BALANCE.md', () => {
    expect(subTimeMultiplier(10)).toBeCloseTo(0.472, 3);
    expect(subInspectionBonus(10)).toBeCloseTo(0.135, 10);
    expect(upgradeCost(1)).toBe(20000);
    expect(upgradeCost(2)).toBe(32000);
    expect(upgradeCost(9)).toBe(858993);
  });
});
