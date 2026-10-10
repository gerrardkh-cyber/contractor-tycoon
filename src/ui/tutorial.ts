// The guided first job.
//
// Not a separate mode: it runs on top of a real game, on a real contract, with
// real money. It only ever does three things — dim everything but one element,
// say one line about it, and wait. There is no Next button, and nothing is
// explained before it happens.
//
// The shape is a small machine with one resting state. `watch` is the site
// working away with no spotlight up; the teaching steps interrupt it when the
// game does something worth a sentence, and hand control back when they are
// done. That is what lets rain, punch items and a failed inspection arrive in
// any order, or not at all.
//
//   t1 --bid--> t2 --cash leaves--> t2cash --1.5s--> watch
//   watch --first inspection--> t3    --toast gone--> watch
//   watch --rain decision---->  t4    --choice----->  watch
//   watch --punch raised----->  t5    --cleared---->  watch
//   watch --handover--------->  t6    --2s--------->  t7
//   t7 --bid--> t8 --3s--> done

import { data, type GameEvent, type GameState } from '../core';
import { toggleClass } from './dom';
import { percent } from './format';
import { createSpotlight } from './spotlight';
import { onLanguageChange, strings } from './strings';
import { theme } from './theme';

export type StepId =
  | 't1' | 't2' | 't2cash' | 'watch' | 't3' | 't4' | 't5' | 't6' | 't7' | 't8' | 'done';

export type TargetName =
  | 'namedCard' | 'siteProgress' | 'cash' | 'toast'
  | 'rainChoice' | 'punchButton' | 'siteCard' | 'tierButtons' | 'subcontractors';

const STORAGE_KEY = 'contractor-tycoon:guide';

/** Steps during which the first job is the only thing worth looking at. */
const FIRST_JOB: StepId[] = ['t1', 't2', 't2cash', 'watch', 't3', 't4', 't5', 't6'];

/** Which element each step points at. `watch` points at nothing on purpose. */
const TARGET: Partial<Record<StepId, TargetName>> = {
  t1: 'namedCard',
  t2: 'siteProgress',
  t2cash: 'cash',
  t3: 'toast',
  t4: 'rainChoice',
  t5: 'punchButton',
  t6: 'siteCard',
  t7: 'tierButtons',
  t8: 'subcontractors',
};

export interface TutorialHost {
  /** Finds the element a step wants to light, or null if it is not up yet. */
  find(what: TargetName): Element | null;
  /** Re-renders so the new step's hide rules take effect. */
  refresh(): void;
}

export interface Tutorial {
  node: HTMLElement;
  /** The skip control, mounted separately so it is never hidden. */
  skipNode: HTMLElement;
  active(): boolean;
  step(): StepId;
  sync(state: GameState): void;
  observe(event: GameEvent): void;
  acted(what: 'bid' | 'clearPunch' | 'rainChoice'): void;
  skip(): void;
  dispose(): void;
}

export function tutorialSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTutorialSeen(seen: boolean): void {
  try {
    if (seen) globalThis.localStorage?.setItem(STORAGE_KEY, 'done');
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing: the guide simply offers itself again.
  }
}

/** `fresh` is false when resuming a save — they are past their first job. */
export function createTutorial(host: TutorialHost, fresh: boolean): Tutorial {
  const spotlight = createSpotlight(strings.tutorial.skip, () => finish());

  let current: StepId = fresh && !tutorialSeen() ? 't1' : 'done';
  let dwellUntil = 0;
  let toastGoneAt = 0;
  let taughtInspection = false;
  let taughtRain = false;
  let taughtPunch = false;
  let failedFirst = false;
  let taughtHandover = false;
  /**
   * What an engine event asked to teach. The frame paints before it drains
   * events, so without this the poll in sync() would reach a later step first
   * and the event would arrive to find itself already out of date.
   */
  let queued: StepId | null = null;
  let holdUntil = 0;

  applyClasses();
  spotlight.setSkipVisible(active());
  onLanguageChange(() => spotlight.setSkipLabel(strings.tutorial.skip));

  function active(): boolean {
    return current !== 'done';
  }

  function finish(): void {
    current = 'done';
    dwellUntil = 0;
    markTutorialSeen(true);
    spotlight.hide();
    applyClasses();
    host.refresh();
  }

  function go(to: StepId, dwellMs = 0): void {
    if (current === 'done') return;
    current = to;
    dwellUntil = dwellMs > 0 ? performance.now() + dwellMs : 0;
    toastGoneAt = 0;
    applyClasses();
    if (to === 'done') {
      finish();
      return;
    }
    host.refresh();
  }

  /**
   * Hide rules live in CSS keyed off <html>, so a step change does not have to
   * reach into every panel to tell it to disappear.
   */
  function applyClasses(): void {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    const on = active();
    toggleClass(root, 'guide-on', on);
    spotlight.setSkipVisible(on);
    toggleClass(root, 'guide-first-job', on && FIRST_JOB.includes(current));
    // Order 007 §3: through the first job the board shows the named card only.
    toggleClass(root, 'guide-only-named', on && FIRST_JOB.includes(current));
    toggleClass(root, 'guide-dim-stats', on && (current === 't1' || current === 't2'));
    toggleClass(root, 'guide-hide-company', on && current !== 't8');
  }

  function lines(): { say: string; why: string } {
    const t = strings.tutorial;
    switch (current) {
      case 't1': return t.t1;
      case 't2': return t.t2;
      case 't2cash': return t.t2cash;
      case 't3':
        if (failedFirst) return t.t3fail;
        // The share held back is a balance number, not a sentence.
        return {
          say: t.t3pass.say,
          why: t.t3pass.why(percent(data.balance.economy.retainageRatio)),
        };
      case 't4': return t.t4;
      case 't5': return t.t5;
      case 't6': return t.t6;
      case 't7': return t.t7;
      case 't8': return t.t8;
      default: return { say: '', why: '' };
    }
  }

  function sync(state: GameState): void {
    if (!active()) return;
    const now = performance.now();

    // Anything an event asked for takes precedence over the polling below.
    if (queued !== null) {
      const next = queued;
      queued = null;
      go(next);
      // Teaching steps get a floor on their time so a fast game cannot blink
      // them past the player.
      holdUntil = now + theme.motion.guideHoldMs;
    }

    // A step being held is left alone.
    if (holdUntil > 0) {
      if (now < holdUntil) {
        paint();
        return;
      }
      holdUntil = 0;
    }

    // Steps that end on a clock.
    if (dwellUntil > 0 && now >= dwellUntil) {
      if (current === 't2cash') return go('watch');
      if (current === 't6') return go('t7');
      if (current === 't8') return go('done');
    }

    // T2 runs on a dwell. The build takes its money on the same tick as the
    // award, so there is no "cash drops" moment left to wait for — the step
    // shows the site starting, then hands over to the cash figure.
    if (current === 't2' && dwellUntil > 0 && now >= dwellUntil) {
      return go('t2cash', theme.motion.guideCashMs);
    }

    // T3 holds while the toast is up, with a grace period so it does not snap
    // away the instant the toast starts fading.
    if (current === 't3') {
      if (host.find('toast')) toastGoneAt = 0;
      else if (toastGoneAt === 0) toastGoneAt = now + theme.motion.guideToastGraceMs;
      else if (now >= toastGoneAt) return go('watch');
    }

    // A handover can be missed: coming back from a long absence resets the
    // event marker. Poll for it so the guide cannot sit in `watch` for ever.
    // Once only: t6 is itself a first-job step, so an unguarded poll would
    // re-enter it every frame and keep resetting its dwell.
    if (
      !taughtHandover &&
      FIRST_JOB.includes(current) &&
      current !== 't1' &&
      state.company.completedProjects > 0
    ) {
      taughtHandover = true;
      return go('t6', theme.motion.guideHandoverMs);
    }
    // From the resting state, whatever the site throws up next gets taught.
    if (current === 'watch') {
      if (!taughtRain && state.pendingDecisions.some((d) => d.eventId === 'rain')) {
        taughtRain = true;
        return go('t4');
      }
      if (!taughtPunch && state.projects.some((p) => p.punchOpen > 0)) {
        taughtPunch = true;
        return go('t5');
      }
    }

    // If the player clears the punch list elsewhere, stop pointing at a button
    // that is no longer there.
    if (current === 't5' && !state.projects.some((p) => p.punchOpen > 0)) return go('watch');
    if (current === 't4' && !state.pendingDecisions.some((d) => d.eventId === 'rain')) {
      return go('watch');
    }

    paint();
  }

  /** Puts the spotlight where the current step wants it. */
  function paint(): void {
    const want = TARGET[current];
    let node = want ? host.find(want) : null;
    // A toast is short-lived; if it has gone, keep the lesson on the site it
    // was about instead of dropping the caption entirely.
    if (!node && current === 't3') node = host.find('siteCard');
    // Handover removes the site card, which is the one thing T6 wanted to
    // point at. The money it just paid is the better target anyway.
    if (!node && current === 't6') node = host.find('cash');
    if (!node) {
      // The thing this step is about is not on screen yet, or this is `watch`.
      spotlight.hide();
      return;
    }

    const { say, why } = lines();
    spotlight.show({ node, say, why, place: current === 't3' ? 'above' : 'auto' });
    spotlight.reposition();
  }

  function observe(event: GameEvent): void {
    if (!active()) return;

    if (event.kind === 'inspection' && !taughtInspection) {
      taughtInspection = true;
      failedFirst = !event.passed;
      if (current !== 't1') queued = 't3';
      return;
    }

    if (event.kind === 'completed' && !taughtHandover && FIRST_JOB.includes(current)) {
      taughtHandover = true;
      queued = null;
      holdUntil = 0;
      go('t6', theme.motion.guideHandoverMs);
    }

    // Walking off the first job ends the guide rather than stranding the
    // player behind hide rules that nothing will lift.
    if (event.kind === 'abandoned' && FIRST_JOB.includes(current)) finish();
  }

  function acted(what: 'bid' | 'clearPunch' | 'rainChoice'): void {
    if (!active()) return;
    if (what === 'bid' && current === 't1') {
      go('t2', theme.motion.guideStartMs);
      return;
    }
    if (what === 'rainChoice' && current === 't4') return go('watch');
    if (what === 'clearPunch' && current === 't5') return go('watch');
    if (what === 'bid' && current === 't7') go('t8', theme.motion.guideSubsMs);
  }

  function dispose(): void {
    spotlight.dispose();
    const root = globalThis.document?.documentElement;
    if (!root) return;
    for (const name of [
      'guide-on', 'guide-first-job', 'guide-only-named', 'guide-dim-stats', 'guide-hide-company',
    ]) {
      root.classList.remove(name);
    }
  }

  return {
    node: spotlight.node,
    skipNode: spotlight.skipNode,
    active,
    step: () => current,
    sync,
    observe,
    acted,
    skip: finish,
    dispose,
  };
}
