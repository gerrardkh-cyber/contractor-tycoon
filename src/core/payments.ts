// Progress payments, retainage, advance recovery and payment delay.

import { balance, requireClientTrait, requireEvent } from './data';
import { nextId } from './state';
import type { Rng } from './rng';
import type { GameState, Project } from './types';

export interface PaymentBreakdown {
  gross: number;
  retainage: number;
  advanceDeduction: number;
  net: number;
}

/** BALANCE.md section 8. Retainage first, then advance recovery, then payout. */
export function breakdownFor(project: Project, gross: number): PaymentBreakdown {
  const retainage = gross * balance.economy.retainageRatio;
  const advanceDeduction = Math.min(
    gross * balance.economy.advanceRecoveryRatio,
    project.advanceOutstanding,
  );
  return { gross, retainage, advanceDeduction, net: gross - retainage - advanceDeduction };
}

/** Applies a progress payment, routing it through payment_delay when it rolls. */
export function releaseProgressPayment(
  state: GameState,
  project: Project,
  gross: number,
  rng: Rng,
): PaymentBreakdown {
  const breakdown = breakdownFor(project, gross);
  project.retainage += breakdown.retainage;
  project.advanceOutstanding -= breakdown.advanceDeduction;
  project.paidOut += breakdown.net;

  const template = requireEvent('payment_delay');
  const trait = requireClientTrait(project.clientTrait);
  const chance = trait.paymentDelayChance ?? template.chance;
  const delayed = rng.next() < chance;

  if (delayed) {
    state.pendingPayments.push({
      id: nextId(state, 'pay'),
      projectId: project.id,
      amount: breakdown.net,
      dueAtSec: state.elapsedSec + (template.delaySec ?? 0),
    });
  } else {
    state.company.cash += breakdown.net;
  }
  return breakdown;
}

/** Retainage is settled in full at CO and is not a progress payment, so it is never delayed. */
export function releaseRetainage(state: GameState, project: Project): number {
  const amount = project.retainage;
  project.retainage = 0;
  project.paidOut += amount;
  state.company.cash += amount;
  return amount;
}

export function tickPendingPayments(state: GameState): void {
  if (state.pendingPayments.length === 0) return;
  const due = state.pendingPayments.filter((payment) => payment.dueAtSec <= state.elapsedSec);
  if (due.length === 0) return;
  for (const payment of due) state.company.cash += payment.amount;
  state.pendingPayments = state.pendingPayments.filter(
    (payment) => payment.dueAtSec > state.elapsedSec,
  );
}
