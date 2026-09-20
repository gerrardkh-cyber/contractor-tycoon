// Expected-value estimates the bidding screen needs.
//
// These are rule calculations, so they live here: src/ui only displays them.
// They are estimates - the deterministic part of a job's economics, before
// weather, material spikes, change orders and late-delivery penalties.

import {
  balance,
  requireBidTier,
  requireGate,
  requireInspector,
  requireProjectType,
  requireStage,
  shareOf,
} from './data';
import { gateInspectionBonus } from './company';
import { passRateFrom } from './inspection';
import type { BidTierId, GameState, Rfq } from './types';

export interface MarginEstimate {
  awarded: number;
  totalCost: number;
  /** Expected cost of failed gates. */
  rework: number;
  /** Expected cost of clearing the punch list. */
  punch: number;
  warrantyFee: number;
  /** Expected defect cost over the warranty window. */
  defect: number;
  net: number;
  /** net / awarded. */
  ratio: number;
}

/**
 * What a job is worth at the company's current subcontractor levels.
 * Excludes random events, so it is an optimistic floor on a bad run and a fair
 * guide on an average one.
 */
export function estimateMargin(state: GameState, rfq: Rfq, tierId: BidTierId): MarginEstimate {
  const type = requireProjectType(rfq.typeId);
  const inspector = requireInspector(rfq.inspector);
  const awarded = rfq.contractBase * requireBidTier(tierId).contractMultiplier;
  const totalCost = type.baseContract * balance.economy.constructionCostRatio;

  let rework = 0;
  let expectedMinors = 0;

  for (const stageId of type.stages) {
    const stage = requireStage(stageId);
    const instances = stage.perFloor ? type.floors : 1;
    const stageCost = (totalCost * shareOf(type.id, stageId).costShare) / instances;

    for (const gateId of stage.gates) {
      const passRate = passRateFrom({
        inspectorBase: inspector.basePassRate,
        subBonus: gateInspectionBonus(state, requireGate(gateId).subs),
        lowBid: tierId === 'low',
        riskyPour: false,
        strictInspectorEvent: false,
      });
      const failuresPerGate = (1 - passRate) / passRate;
      rework += instances * failuresPerGate * stageCost * balance.inspection.reworkCostRatio;
      expectedMinors += (instances * (inspector.minorMin + inspector.minorMax)) / 2;
    }
  }

  const punch =
    expectedMinors * (rfq.contractBase / Math.max(1, type.floors)) * balance.punchList.costRatio;
  const warrantyFee = type.lifeline ? 0 : rfq.contractBase * balance.defect.warrantyFeeRatio;

  const defectChance = Math.min(
    balance.defect.maxChance,
    balance.defect.baseChance +
      expectedMinors * balance.defect.perMinorChance +
      (tierId === 'low' ? balance.defect.lowBidChance : 0),
  );
  const defect = type.lifeline ? 0 : defectChance * rfq.contractBase * balance.defect.costRatio;

  const net = awarded - totalCost - rework - punch - warrantyFee - defect;
  return { awarded, totalCost, rework, punch, warrantyFee, defect, net, ratio: net / awarded };
}
