// Which language the screen is in.
//
// `strings` is a live binding: reading `strings.board.title` inside a function
// always gives the current language. Nothing may capture a branch of the table
// at module level, or it would freeze on whatever language loaded first.

import { strings as en, type Strings } from './strings.en';
import { ko } from './strings.ko';

export type LanguageId = 'en' | 'ko';

/**
 * Widens the English literal types into plain strings, so a translation is
 * not forced to repeat the English wording to satisfy the compiler while
 * still having to match every key and every function signature.
 */
export type Widen<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : T extends object
            ? { [K in keyof T]: Widen<T[K]> }
            : T;

export type StringTable = Widen<Strings>;

const tables: Record<LanguageId, StringTable> = { en, ko };

const STORAGE_KEY = 'contractor-tycoon:lang';

let current: LanguageId = 'en';
let listeners: ((id: LanguageId) => void)[] = [];

/** The table the UI reads. Reassigned on a language change. */
export let strings: StringTable = tables.en;

export function language(): LanguageId {
  return current;
}

/**
 * Picks the starting language: what the player chose last, or failing that
 * their browser's own preference.
 */
export function initLanguage(): LanguageId {
  let chosen: LanguageId | null = null;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ko') chosen = saved;
  } catch {
    // Private browsing: fall through to the browser preference.
  }

  if (chosen === null) chosen = detectLanguage();
  setLanguage(chosen, { remember: false });
  return chosen;
}

/** Korean if the browser asks for it, English otherwise. */
export function detectLanguage(): LanguageId {
  try {
    const tags = globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? ''];
    for (const tag of tags) {
      if (typeof tag === 'string' && tag.toLowerCase().startsWith('ko')) return 'ko';
    }
  } catch {
    // No navigator (tests, odd embeds): English.
  }
  return 'en';
}

export function setLanguage(id: LanguageId, options: { remember?: boolean } = {}): void {
  current = id;
  strings = tables[id];

  if (options.remember !== false) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, id);
    } catch {
      // The choice simply will not survive the session.
    }
  }

  try {
    if (globalThis.document) globalThis.document.documentElement.lang = id;
  } catch {
    // No document: nothing to label.
  }

  for (const listener of listeners) listener(id);
}

/** Returns an unsubscribe: a screen that goes away must stop listening. */
export function onLanguageChange(listener: (id: LanguageId) => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

/** Test seam. */
export function resetLanguage(): void {
  listeners = [];
  setLanguage('en', { remember: false });
}

export { en, ko };
export type { Strings };
