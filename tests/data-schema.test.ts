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
      ['repair', 1, 3000, 1],
      ['house', 1, 150000, 1],
      ['lowrise', 3, 600000, 1],
      ['midrise', 8, 2000000, 2],
    ]);
  });

  it('marks exactly one type as the lifeline', () => {
    expect(projectTypes.filter((type) => type.lifeline).map((type) => type.id)).toEqual(['repair']);
    expect(balance.lifeline.typeId).toBe('repair');
  });
});

describe('process stages', () => {
  it('only reference gates that exist', () => {
    const known = new Set(gates.map((gate) => gate.id));
    for (const stage of stages) {
      for (const gateId of stage.gates) expect(known).toContain(gateId);
    }
  });

  it('gives every stage a gate except the lifeline repair job', () => {
    const ungated = stages.filter((stage) => stage.gates.length === 0).map((stage) => stage.id);
    expect(ungated).toEqual(['repair']);
  });

  it('distributes the whole construction cost within each project type', () => {
    for (const type of projectTypes) {
      const total = type.stages.reduce(
        (sum, stageId) => sum + data.shareOf(type.id, stageId).costShare,
        0,
      );
      expect(total, type.id).toBeCloseTo(type.lifeline ? 0 : 1, 10);
    }
  });

  it('distributes the whole contract as progress payments within each project type', () => {
    for (const type of projectTypes) {
      const total = type.stages.reduce(
        (sum, stageId) => sum + data.shareOf(type.id, stageId).payShare,
        0,
      );
      expect(total, type.id).toBeCloseTo(1, 10);
    }
  });

  it('gives house its own split and leaves the taller types on the defaults', () => {
    expect(data.projectTypeById['house']!.stageShares).toBeDefined();
    expect(data.shareOf('house', 'structural')).toEqual({ costShare: 0.25, payShare: 0.25 });
    // lowrise and midrise fall through to the stage defaults.
    for (const id of ['lowrise', 'midrise']) {
      expect(data.projectTypeById[id]!.stageShares, id).toBeUndefined();
      expect(data.shareOf(id, 'structural').costShare, id).toBeCloseTo(0.35, 10);
    }
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
    expect(balance.start).toEqual({ cash: 95000, trust: 50, licenseTier: 1, siteSlots: 1, subLevel: 1 });
  });

  it('splits the floor share across structural and mep', () => {
    const structural = stages.find((stage) => stage.id === 'structural')!;
    const mep = stages.find((stage) => stage.id === 'mep')!;
    expect(structural.costShare).toBeCloseTo(0.35, 10);
    expect(mep.costShare).toBeCloseTo(0.25, 10);
    expect(structural.costShare + mep.costShare).toBeCloseTo(0.6, 10);
    // Each floor stage now pays its own share at its own gate.
    expect(structural.payShare).toBe(structural.costShare);
    expect(mep.payShare).toBe(mep.costShare);
  });

  it('leaves no stage carrying cost it cannot bill for', () => {
    for (const stage of stages) {
      if (stage.costShare > 0) expect(stage.payShare).toBeGreaterThan(0);
    }
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
