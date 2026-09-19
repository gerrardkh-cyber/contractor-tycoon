// Shared types for the simulation engine.
// No DOM, no Canvas, no imports from src/ui.

export type SubId = 'sitework' | 'structure' | 'electrical' | 'plumbing' | 'fire';
export type BidTierId = 'low' | 'fair' | 'high';
export type ClientTraitId = 'price' | 'track' | 'schedule';
export type InspectorId = 'lenient' | 'normal' | 'strict';

export type TaskStatus = 'waiting' | 'working' | 'gate' | 'rework' | 'done';

/** One unit of work: a stage, optionally bound to a floor. */
export interface Task {
  readonly stageId: string;
  /** 0-based floor index, or null for whole-project stages. */
  readonly floor: number | null;
  status: TaskStatus;
  /** Seconds of work left in the current run (initial run or rework). */
  remainingSec: number;
  /** Index into the stage's gate list. */
  gateCursor: number;
  /** Cash that must be paid before this task can progress. Stalls the site while unaffordable. */
  pendingCostDue: number;
  /** Set when the task made progress while the site chose to pour through rain. */
  riskyPour: boolean;
  /** Cost multiplier locked in when the stage started (material_spike). */
  costMultiplier: number;
  /** Major failures recorded against this task. */
  majorFailures: number;
}

export interface PendingPayment {
  id: string;
  projectId: string;
  amount: number;
  dueAtSec: number;
}

export interface ProjectEvents {
  strictInspector: boolean;
  /** Elapsed-seconds timestamp at which change_order fires, or null if it never will. */
  changeOrderAtSec: number | null;
  changeOrderApplied: boolean;
}

export interface Project {
  readonly id: string;
  readonly typeId: string;
  readonly floors: number;
  readonly pipelineMode: string;
  /** P for this contract: the RFQ base after the inspector multiplier. */
  readonly contractBase: number;
  readonly bidTier: BidTierId;
  readonly clientTrait: ClientTraitId;
  readonly inspector: InspectorId;
  /** Awarded amount. Rises if change_order fires. */
  awarded: number;
  /** Fixed construction cost for the whole job. */
  readonly totalCost: number;
  readonly startedAtSec: number;
  readonly deadlineAtSec: number;
  tasks: Task[];
  /** Retainage withheld so far, released at CO. */
  retainage: number;
  /** Advance still to be recovered from progress payments. */
  advanceOutstanding: number;
  punchOpen: number;
  punchTotalGenerated: number;
  /** Punch work billed to the job, settled against retainage at CO. */
  punchCostAccrued: number;
  /** Seconds accumulated toward clearing the next punch item. */
  punchClearElapsedSec: number;
  punchClearQueued: number;
  events: ProjectEvents;
  /** True while rain is falling and this site chose to pour anyway. */
  riskyPourActive: boolean;
  /** The player already answered this rain's decision for this site. */
  rainDecided: boolean;
  stalled: boolean;
  stalledSec: number;
  inspectionsPassed: number;
  inspectionsFailed: number;
  paidOut: number;
  spent: number;
}

export interface Warranty {
  readonly id: string;
  readonly projectId: string;
  readonly contractBase: number;
  readonly defectChance: number;
  remainingSec: number;
}

/** What is left behind when a site is walked away from. Record only. */
export interface AbandonedRecord {
  readonly id: string;
  readonly projectId: string;
  readonly typeId: string;
  readonly bidTier: BidTierId;
  readonly contractBase: number;
  readonly abandonedAtSec: number;
  readonly retainageForfeited: number;
  readonly advanceReturned: number;
  /** Fraction of the task list that had passed its gates. */
  readonly progress: number;
}

export interface Rfq {
  readonly id: string;
  readonly typeId: string;
  /** P after the inspector multiplier. */
  readonly contractBase: number;
  readonly clientTrait: ClientTraitId;
  readonly inspector: InspectorId;
  readonly deadlineSec: number;
  readonly advanceAvailable: boolean;
  /** Cash needed before this RFQ can be bid: foundation plus one floor of structural. */
  readonly minCash: number;
  /** Named / negotiated award: fair only, wins with certainty. */
  readonly directAward: boolean;
  readonly postedAtSec: number;
}

export interface PendingDecision {
  readonly id: string;
  readonly eventId: string;
  readonly projectId: string;
  readonly options: readonly string[];
}

export interface WeatherState {
  raining: boolean;
  remainingSec: number;
  /** Seconds until the next interval roll. */
  nextRollInSec: number;
}

export interface MarketState {
  /** Multiplier applied to the next stage that starts, then consumed. */
  pendingCostMultiplier: number;
  nextRollInSec: number;
}

/** Ad boost hooks. Fields only: order 002 does not apply any effect. */
export interface BoostState {
  doubleIncomeRemainingSec: number;
  rainClearAvailable: number;
  instantReworkAvailable: number;
}

export interface Company {
  cash: number;
  /** Money owed. Cash never goes below zero; the overflow lands here instead. */
  debt: number;
  trust: number;
  licenseTier: number;
  siteSlots: number;
  subLevels: Record<SubId, number>;
  completedProjects: number;
  consecutiveBidLosses: number;
  /** A named bid is owed to the player and will be attached to the next RFQ. */
  pendingDirectAward: boolean;
}

export interface Stats {
  totalInspections: number;
  totalInspectionFailures: number;
  totalMinorsGenerated: number;
  totalStalledSec: number;
  defectsOccurred: number;
  defectsCleared: number;
  lateCompletions: number;
  abandonedProjects: number;
  /** Lifeline repair jobs finished. Counted apart from real completions. */
  repairCount: number;
  /** Seconds spent with no site running and nothing on the board that can be bid. */
  lockedOutSec: number;
  /** Elapsed seconds at which cash first went negative, or null. */
  bankruptAtSec: number | null;
}

export interface GameState {
  elapsedSec: number;
  company: Company;
  board: Rfq[];
  /** Seconds until the oldest board slot rotates. */
  boardRotationInSec: number;
  projects: Project[];
  warranties: Warranty[];
  abandoned: AbandonedRecord[];
  pendingPayments: PendingPayment[];
  pendingDecisions: PendingDecision[];
  weather: WeatherState;
  market: MarketState;
  boosts: BoostState;
  stats: Stats;
  /** Monotonic counter behind every generated id. Keeps ids deterministic. */
  nextId: number;
}

export type Action =
  | { type: 'submitBid'; rfqId: string; tier: BidTierId }
  | { type: 'rejectRfq'; rfqId: string }
  | { type: 'upgradeSub'; subId: SubId }
  | { type: 'buySiteSlot' }
  | { type: 'clearPunchList'; projectId: string; count: number }
  | { type: 'abandonProject'; projectId: string }
  | { type: 'resolveDecision'; decisionId: string; choice: string };

export interface ActionResult {
  state: GameState;
  ok: boolean;
  error?: string;
}
