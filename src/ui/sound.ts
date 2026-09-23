// Six short CC0 cues, bundled into assets/ by the build so nothing is fetched
// from a network at runtime. See docs/ASSETS.md for the source and licence.
//
// The game ships muted: sound is something the player turns on, never
// something that happens to them.

import clickUrl from './sounds/click.ogg';
import awardedUrl from './sounds/awarded.ogg';
import passUrl from './sounds/pass.ogg';
import failUrl from './sounds/fail.ogg';
import paymentUrl from './sounds/payment.ogg';
import handoverUrl from './sounds/handover.ogg';
import { theme } from './theme';

export type CueName = 'click' | 'awarded' | 'pass' | 'fail' | 'payment' | 'handover';

const urls: Record<CueName, string> = {
  click: clickUrl,
  awarded: awardedUrl,
  pass: passUrl,
  fail: failUrl,
  payment: paymentUrl,
  handover: handoverUrl,
};

const STORAGE_KEY = 'contractor-tycoon:sound';

/** Cues fired closer together than this are dropped, so a burst cannot stack. */
const MIN_GAP_MS = 60;

let enabled: boolean = theme.soundDefaultOn;
let elements: Partial<Record<CueName, HTMLAudioElement>> = {};
let lastPlayedAt: Partial<Record<CueName, number>> = {};
let listeners: ((on: boolean) => void)[] = [];

export function initSound(): void {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === 'on') enabled = true;
    else if (raw === 'off') enabled = false;
  } catch {
    // Private browsing: the default stands for this session.
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Nothing to do: the preference simply will not survive the session.
  }
  for (const listener of listeners) listener(on);
}

export function toggleSound(): boolean {
  setSoundEnabled(!enabled);
  return enabled;
}

export function onSoundChange(listener: (on: boolean) => void): void {
  listeners = [...listeners, listener];
}

/**
 * Plays a cue if sound is on. Audio is created lazily on first use, so a muted
 * player never decodes any of it.
 */
export function play(cue: CueName): void {
  if (!enabled) return;

  const now = performance.now();
  const last = lastPlayedAt[cue] ?? 0;
  if (now - last < MIN_GAP_MS) return;
  lastPlayedAt[cue] = now;

  try {
    const element = elements[cue] ?? create(cue);
    element.currentTime = 0;
    // Autoplay can still be refused before the first gesture; that is fine.
    void element.play().catch(() => undefined);
  } catch {
    // Audio is decoration. If it will not play, the game carries on.
  }
}

function create(cue: CueName): HTMLAudioElement {
  const element = new Audio(urls[cue]);
  element.preload = 'auto';
  element.volume = theme.soundVolume;
  elements[cue] = element;
  return element;
}

/** Test seam. */
export function resetSound(): void {
  enabled = theme.soundDefaultOn;
  elements = {};
  lastPlayedAt = {};
  listeners = [];
}
