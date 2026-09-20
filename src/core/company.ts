// Company-layer helpers: subcontractor effects, trust, license, net worth.

import { balance, subIds } from './data';
import { pushEvent } from './log';
import type { GameState, SubId } from './types';

/** Time multiplier for one subcontractor: base^(level - 1). */
export function subTimeMultiplier(level: number): number {
  return Math.pow(balance.subcontractors.timeMultiplierBase, level - 1);
}

/** Inspection bonus for one subcontractor: perLevel * (level - 1). */
export function subInspectionBonus(level: number): number {
  return balance.subcontractors.inspectionBonusPerLevel * (level - 1);
}

export function levelOf(state: GameState, subId: SubId): number {
  return state.company.subLevels[subId];
}

/** Average time multiplier across the subs that staff a stage. */
export function stageTimeMultiplier(state: GameState, subs: readonly SubId[]): number {
  if (subs.length === 0) return 1;
  const total = subs.reduce((sum, id) => sum + subTimeMultiplier(levelOf(state, id)), 0);
  return total / subs.length;
}

/** Average inspection bonus across the subs a gate holds responsible. */
export function gateInspectionBonus(state: GameState, subs: readonly SubId[]): number {
  if (subs.length === 0) return 0;
  const total = subs.reduce((sum, id) => sum + subInspectionBonus(levelOf(state, id)), 0);
  return total / subs.length;
}

export function upgradeCost(level: number): number {
  const { upgradeBaseCost, upgradeCostGrowth } = balance.subcontractors;
  return Math.round(upgradeBaseCost * Math.pow(upgradeCostGrowth, level - 1));
}

/** Cost of the next site slot, or null when the cap is reached. */
export function nextSiteSlotCost(state: GameState): number | null {
  const next = state.company.siteSlots + 1;
  if (next > balance.sites.maxSlots) return null;
  const entry = balance.sites.slotCosts.find((slot) => slot.slot === next);
  return entry ? entry.cost : null;
}

/**
 * Spends what cash allows and books the rest as debt. Cash never goes below
 * zero: every outflow that is not gated on affordability goes through here.
 */
export function chargeCash(state: GameState, amount: number): number {
  if (amount <= 0) return 0;
  const fromCash = Math.min(amount, state.company.cash);
  state.company.cash -= fromCash;
  const borrowed = amount - fromCash;
  if (borrowed > 0) state.company.debt += borrowed;
  return borrowed;
}

/** Income pays debt down first, at the share set in the data, then banks the rest. */
export function creditCash(state: GameState, amount: number): number {
  if (amount <= 0) return 0;
  let remaining = amount;
  if (state.company.debt > 0) {
    const toDebt = Math.min(state.company.debt, amount * balance.debt.repaymentShare);
    state.company.debt -= toDebt;
    remaining -= toDebt;
  }
  state.company.cash += remaining;
  return remaining;
}

export function adjustTrust(state: GameState, delta: number): void {
  const { min, max } = balance.trust;
  state.company.trust = Math.max(min, Math.min(max, state.company.trust + delta));
}

/** Promotes the licence as soon as both conditions hold. */
export function refreshLicense(state: GameState): void {
  for (const unlock of balance.license.unlocks) {
    if (
      state.company.licenseTier < unlock.tier &&
      state.company.completedProjects >= unlock.completedProjects &&
      netWorth(state) >= unlock.netWorth
    ) {
      state.company.licenseTier = unlock.tier;
      pushEvent(state, { kind: 'licenseUp', tier: unlock.tier });
    }
  }
}

/** Cash plus retainage still held by clients, less debt. Prestige is not implemented. */
export function netWorth(state: GameState): number {
  const held = state.projects.reduce((sum, project) => sum + project.retainage, 0);
  return state.company.cash + held - state.company.debt;
}

export function initialSubLevels(): Record<SubId, number> {
  const levels = {} as Record<SubId, number>;
  for (const id of subIds) levels[id] = balance.start.subLevel;
  return levels;
}
