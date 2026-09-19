// src/core - pure simulation engine.
//
// Contract (CLAUDE.md / docs/GDD.md):
//   - No DOM, no Canvas, no imports from src/ui.
//   - advance(state, dtSec, rng) returns a NEW state. The input is never mutated.
//   - Every number comes from src/data JSON. Nothing here is hardcoded.

export { advance } from './advance';
export { applyAction } from './actions';
export { createInitialState } from './state';
export { createRng, randInt, randRange, type Rng } from './rng';

export {
  adjustTrust,
  chargeCash,
  creditCash,
  gateInspectionBonus,
  netWorth,
  nextSiteSlotCost,
  refreshLicense,
  stageTimeMultiplier,
  subInspectionBonus,
  subTimeMultiplier,
  upgradeCost,
} from './company';

export {
  buildTasks,
  deadlineSecFor,
  expectedDurationSec,
  findTask,
  isComplete,
  isLate,
  minCashToBid,
  prerequisitesMet,
  progressOf,
  stageCost,
  stageDurationSec,
  stagePay,
  tasksOfStage,
} from './project';

export { passRateFor, passRateFrom, punchItemCost, type PassRateInputs } from './inspection';
export { breakdownFor, type PaymentBreakdown } from './payments';
export {
  canAffordBid,
  isLifeline,
  isLockedOut,
  contractAmountFor,
  constructionCostFor,
  refillBoard,
  winChanceFor,
} from './rfq';

export * as data from './data';
export type * from './types';
