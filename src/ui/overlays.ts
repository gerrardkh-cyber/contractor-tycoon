// Toasts, the walk-off confirmation, the welcome-back screen and settings.

import { data, type GameState, type Project } from '../core';
import { button, el } from './dom';
import { duration, money, moneySigned } from './format';
import { prefersReducedMotion } from './motion';
import { strings } from './strings.en';
import { theme } from './theme';
import type { ToastRequest } from './context';
import type { OfflineSummary } from '../save';

export class Toasts {
  private readonly host: HTMLElement;

  constructor(parent: HTMLElement) {
    this.host = el('div', { class: 'toasts' });
    parent.append(this.host);
  }

  show(request: ToastRequest): void {
    const node = el('div', { class: `toast ${request.tone}` }, [
      el('span', { text: request.text }),
      request.detail ? el('span', { class: 'toast-sub', text: request.detail }) : null,
    ]);
    this.host.append(node);
    globalThis.setTimeout(() => node.remove(), theme.motion.toastMs);
  }
}

function modal(children: (Node | null)[], onBackdrop?: () => void): HTMLElement {
  const box = el('div', { class: 'modal' }, children);
  const back = el('div', { class: 'modal-back' }, [box]);
  back.addEventListener('click', (event) => {
    if (event.target === back && onBackdrop) onBackdrop();
  });
  return back;
}

export function abandonDialog(
  project: Project,
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  return modal([
    el('div', { class: 'modal-title', text: strings.abandonDialog.title }),
    el('div', { class: 'modal-body' }, [
      el('span', { text: strings.abandonDialog.body }),
      el('span', { text: strings.abandonDialog.retainage(money(project.retainage)) }),
      el('span', { text: strings.abandonDialog.advance(money(project.advanceOutstanding)) }),
      el('span', { text: strings.abandonDialog.trust(data.balance.abandon.trustPenalty) }),
    ]),
    el('div', { class: 'btn-row' }, [
      button(strings.abandonDialog.cancel, onCancel, { class: 'btn primary' }),
      button(strings.abandonDialog.confirm, onConfirm, { class: 'btn danger' }),
    ]),
  ], onCancel);
}

export function offlineDialog(
  offlineSec: number,
  capped: boolean,
  summary: OfflineSummary,
  onClose: () => void,
): HTMLElement {
  const lines: (Node | null)[] = [
    el('span', { text: strings.offline.elapsed(duration(offlineSec)) }),
    capped ? el('span', { text: strings.offline.capped(duration(data.balance.offline.maxSec)) }) : null,
    el('span', { text: strings.offline.completed(summary.completed) }),
    el('span', { text: strings.offline.repairs(summary.repairs) }),
    el('span', {
      text: strings.offline.inspections(summary.inspectionsPassed, summary.inspectionsFailed),
    }),
    el('span', { text: strings.offline.cash(moneySigned(summary.cashDelta)) }),
  ];

  return modal([
    el('div', { class: 'modal-title', text: strings.offline.title }),
    el('div', { class: 'modal-body' }, lines),
    el('div', { class: 'btn-row' }, [
      button(strings.offline.resume, onClose, { class: 'btn primary' }),
    ]),
  ], onClose);
}

export function settingsDialog(
  onReset: () => void,
  onClose: () => void,
): HTMLElement {
  let armed = false;
  const resetButton = button(strings.settings.reset, () => {
    if (!armed) {
      armed = true;
      resetButton.textContent = strings.settings.resetConfirmAgain;
      resetButton.className = 'btn danger';
      return;
    }
    onReset();
  }, { class: 'btn' });

  return modal([
    el('div', { class: 'modal-title', text: strings.settings.title }),
    el('div', { class: 'modal-body' }, [
      el('span', { text: strings.settings.soundHint }),
      prefersReducedMotion() ? el('span', { text: strings.settings.motionReduced }) : null,
    ]),
    resetButton,
    el('div', { class: 'btn-row' }, [
      button(strings.settings.close, onClose, { class: 'btn primary' }),
    ]),
  ], onClose);
}

/** Picks one of the flavour lines for a failed gate. */
export function defectLine(gateId: string, state: GameState): string | undefined {
  const table = strings.defects as Record<string, readonly string[]>;
  const lines = table[gateId];
  if (!lines || lines.length === 0) return undefined;
  // Deterministic from the run's own clock, so no extra randomness is needed.
  const index = Math.abs(Math.floor(state.elapsedSec * 10)) % lines.length;
  return lines[index];
}
