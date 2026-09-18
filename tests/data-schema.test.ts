import { describe, it, expect } from 'vitest';
import { data } from '../src/core';

const { balance, projectTypes, stages, gates, eventTemplates } = data;

describe('project types', () => {
  it('declare the fields the engine reads', () => {
    for (const type of projectTypes) {
      expect(typeof type.id).toBe('string');
      expect(type.floors).toBeGreaterThan(0);
      expect(type.baseContract).toBeGreaterThan(0);
      expect(type.licenseTier).toBeGreaterThanOrEqual(1);
      expect(type.stages.length).toBeGreaterThan(0);
      expect(type.pipelineMode).toBe('floorPipeline');
    }
  });

  it('only reference stages that exist', () => {
    const known = new Set(stages.map((stage) => stage.id));
    for (const type of projectTypes) {
      for (const stageId of type.stages) expect(known).toContain(stageId);
    }
  });

  it('match the figures locked in BALANCE.md', () => {
    expect(projectTypes.map((type) => [type.id, type.floors, type.baseContract, type.licenseTier])).toEqual([
      ['house', 1, 150000, 1],
      ['lowrise', 3, 600000, 1],
      ['midrise', 8, 2000000, 2],
    ]);
  });
});

describe('process stages', () => {
  it('only reference gates that exist', () => {
    const known = new Set(gates.map((gate) => gate.id));
    for (const stage of stages) {
      expect(stage.gates.length).toBeGreaterThan(0);
      for (const gateId of stage.gates) expect(known).toContain(gateId);
    }
  });

  it('distribute the whole construction cost', () => {
    const total = stages.reduce((sum, stage) => sum + stage.costShare, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('distribute the whole contract as progress payments', () => {
    const total = stages.reduce((sum, stage) => sum + stage.payShare, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('staff every stage with known subcontractors', () => {
    const known = new Set(balance.subcontractors.ids);
    for (const stage of stages) {
      expect(stage.subs.length).toBeGreaterThan(0);
      for (const sub of stage.subs) expect(known).toContain(sub);
    }
  });
});

describe('inspection gates', () => {
  it('staff every gate with known subcontractors', () => {
    const known = new Set(balance.subcontractors.ids);
    for (const gate of gates) {
      expect(gate.subs.length).toBeGreaterThan(0);
      for (const sub of gate.subs) expect(known).toContain(sub);
    }
  });

  it('marks exactly one gate as risky-pour sensitive and one as punch-gated', () => {
    expect(gates.filter((gate) => gate.riskyPourApplies).map((gate) => gate.id)).toEqual(['structural']);
    expect(gates.filter((gate) => gate.requiresZeroPunch).map((gate) => gate.id)).toEqual(['final']);
  });
});

describe('balance figures', () => {
  it('carries the confirmed start state', () => {
    expect(balance.start).toEqual({ cash: 60000, trust: 50, licenseTier: 1, siteSlots: 1, subLevel: 1 });
  });

  it('keeps inspector weights at a full distribution', () => {
    const total = balance.inspectors.reduce((sum, inspector) => sum + inspector.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('prices construction below every bid tier', () => {
    const cost = balance.economy.constructionCostRatio;
    for (const tier of balance.bidding.tiers) {
      expect(tier.contractMultiplier).toBeGreaterThan(cost);
    }
  });

  it('caps offline replay at eight hours', () => {
    expect(balance.offline.maxSec).toBe(8 * 60 * 60);
  });
});

describe('event templates', () => {
  it('declare a trigger the engine understands', () => {
    const triggers = new Set(['interval', 'projectStart', 'payment']);
    for (const event of eventTemplates) {
      expect(triggers).toContain(event.trigger);
      expect(event.chance).toBeGreaterThan(0);
      expect(event.chance).toBeLessThanOrEqual(1);
    }
  });

  it('gives interval events an interval', () => {
    for (const event of eventTemplates) {
      if (event.trigger === 'interval') expect(event.intervalSec).toBeGreaterThan(0);
    }
  });

  it('exposes rain as the only choice event', () => {
    expect(eventTemplates.filter((event) => event.decision).map((event) => event.id)).toEqual(['rain']);
  });
});
