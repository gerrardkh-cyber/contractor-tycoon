// Loads and freezes every tunable number from src/data.
// Nothing in src/core may hardcode a balance figure: it comes from here.

import balanceJson from '../data/balance.json';
import projectTypesJson from '../data/project-types.json';
import processStagesJson from '../data/process-stages.json';
import inspectionGatesJson from '../data/inspection-gates.json';
import eventTemplatesJson from '../data/event-templates.json';
import type { BidTierId, ClientTraitId, InspectorId, SubId } from './types';

export interface BidTierData {
  id: BidTierId;
  contractMultiplier: number;
  winChance: number;
}

export interface ClientTraitData {
  id: ClientTraitId;
  weight: number;
  winChanceDelta?: Partial<Record<BidTierId, number>>;
  winChanceDeltaAll?: number;
  trustRequired?: number;
  deadlineMultiplier?: number;
  lateFinalPaymentMultiplier?: number;
  paymentDelayChance?: number;
}

export interface InspectorData {
  id: InspectorId;
  weight: number;
  basePassRate: number;
  minorMin: number;
  minorMax: number;
  contractMultiplier: number;
}

export interface StageData {
  id: string;
  subs: SubId[];
  baseSec: number;
  costShare: number;
  payShare: number;
  perFloor: boolean;
  gates: string[];
  blockedByRain: boolean;
}

export interface GateData {
  id: string;
  subs: SubId[];
  perFloor: boolean;
  riskyPourApplies: boolean;
  requiresZeroPunch: boolean;
}

export interface ProjectTypeData {
  id: string;
  /** A job the board offers only to keep a broke company alive. */
  lifeline?: boolean;
  category: string;
  pipelineMode: string;
  floors: number;
  baseContract: number;
  licenseTier: number;
  stages: string[];
}

export interface EventTemplateData {
  id: string;
  trigger: string;
  scope: string;
  chance: number;
  intervalSec?: number;
  durationMinSec?: number;
  durationMaxSec?: number;
  nextStageCostMultiplier?: number;
  passRatePenalty?: number;
  scheduleTraitChance?: number;
  delaySec?: number;
  contractMultiplier?: number;
  activeStageTimeMultiplier?: number;
  decision?: { id: string; defaultChoice: string };
}

export const balance = balanceJson;
export const projectTypes = projectTypesJson as ProjectTypeData[];
export const stages = processStagesJson as StageData[];
export const gates = inspectionGatesJson as GateData[];
export const eventTemplates = eventTemplatesJson as EventTemplateData[];

export const bidTiers = balance.bidding.tiers as BidTierData[];
export const clientTraits = balance.clientTraits as ClientTraitData[];
export const inspectors = balance.inspectors as InspectorData[];
export const subIds = balance.subcontractors.ids as SubId[];

function indexBy<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const item of items) map[item.id] = item;
  return map;
}

export const stageById = indexBy(stages);
export const gateById = indexBy(gates);
export const projectTypeById = indexBy(projectTypes);
export const eventById = indexBy(eventTemplates);
export const bidTierById = indexBy(bidTiers);
export const clientTraitById = indexBy(clientTraits);
export const inspectorById = indexBy(inspectors);

export function requireStage(id: string): StageData {
  const stage = stageById[id];
  if (!stage) throw new Error(`unknown stage: ${id}`);
  return stage;
}

export function requireGate(id: string): GateData {
  const gate = gateById[id];
  if (!gate) throw new Error(`unknown gate: ${id}`);
  return gate;
}

export function requireProjectType(id: string): ProjectTypeData {
  const type = projectTypeById[id];
  if (!type) throw new Error(`unknown project type: ${id}`);
  return type;
}

export function requireBidTier(id: BidTierId): BidTierData {
  const tier = bidTierById[id];
  if (!tier) throw new Error(`unknown bid tier: ${id}`);
  return tier;
}

export function requireClientTrait(id: ClientTraitId): ClientTraitData {
  const trait = clientTraitById[id];
  if (!trait) throw new Error(`unknown client trait: ${id}`);
  return trait;
}

export function requireInspector(id: InspectorId): InspectorData {
  const inspector = inspectorById[id];
  if (!inspector) throw new Error(`unknown inspector: ${id}`);
  return inspector;
}

export function requireEvent(id: string): EventTemplateData {
  const event = eventById[id];
  if (!event) throw new Error(`unknown event: ${id}`);
  return event;
}
