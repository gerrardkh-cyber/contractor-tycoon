// What every panel is handed: the current state, a way to act on it, and the
// UI-only bits (toasts, hint step). Panels never hold state of their own.

import type { Action, GameState } from '../core';

export interface ToastRequest {
  text: string;
  detail?: string;
  tone: 'good' | 'bad' | 'info';
}

export interface Ctx {
  state: GameState;
  dispatch(action: Action): void;
  toast(request: ToastRequest): void;
  /** Index into strings.hints, or -1 once the player is past them. */
  hintStep: number;
  advanceHint(step: number): void;
  openAbandon(projectId: string): void;
  openSettings(): void;
}
