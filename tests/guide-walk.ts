// Plays the guided first job the way a player would. Not a test file.
//
// This is app.ts's loop with the screen taken out: the same engine step, the
// same "paint, then drain the events" order, the same calls into the guide
// from dispatch. What it keeps instead of a screen is a list of every step the
// guide entered, so a test can say what the player was taught and when.

import {
  advance,
  applyAction,
  canAffordBid,
  createInitialState,
  createRng,
  type Action,
  type GameState,
  type Rng,
} from '../src/core';
import { theme } from '../src/ui/theme';
import { createTutorial, type StepId, type TargetName, type Tutorial } from '../src/ui/tutorial';
import { installFakeDom, FakeNode, type FakeDom } from './fake-dom';

/** app.ts runs the engine in tenths of a second. */
export const STEP_SEC = 0.1;
const STEP_MS = STEP_SEC * 1000;

/** How a step was left: by the player doing something, or by the clock. */
export type Act = 'bid' | 'clearPunch' | 'rainChoice';

export class GuideWalk {
  readonly dom: FakeDom;
  readonly tutorial: Tutorial;
  /** Every step the guide entered, in order, repeats included. */
  readonly steps: StepId[] = [];
  state: GameState;

  /** Game seconds at which the first handover landed. */
  completedAtSec: number | null = null;
  /** Game seconds at which the guide switched itself off. */
  doneAtSec: number | null = null;
  /** How many inspections have been reported so far. */
  inspections = 0;
  /** Whether the job ever offered a rain decision / raised a punch item. */
  rained = false;
  punched = false;
  /** Steps whose spotlight was actually on screen while they were current. */
  readonly shown = new Set<StepId>();
  /** False if the guide was ever running with no way out of it on screen. */
  skipAlwaysVisible = true;
  /** True if the guide switched itself off before the handover landed. */
  endedBeforeHandover = false;

  private readonly rng: Rng;
  private readonly panels: FakeNode;
  private readonly skip: FakeNode;
  private readonly targets = new Map<TargetName, FakeNode>();
  private seenEvent: string | null = null;
  /** Live toasts: what raised each one, and when it goes away. */
  private toasts: { kind: string; until: number }[] = [];
  private depth = 0;

  constructor(seed: number) {
    this.dom = installFakeDom();
    this.rng = createRng(seed);
    this.state = createInitialState();

    // Same test as app.ts: a company that has finished nothing and has nothing
    // running is on its first job.
    this.tutorial = createTutorial(
      { find: (what) => this.find(what), refresh: () => this.render() },
      this.state.company.completedProjects === 0 && this.state.projects.length === 0,
    );
    this.panels = this.tutorial.node as unknown as FakeNode;
    this.skip = this.tutorial.skipNode as unknown as FakeNode;
    this.record();

    // app.ts takes one step before the first paint so the board is full.
    this.state = advance(this.state, STEP_SEC, this.rng);
    this.render();
  }

  dispose(): void {
    this.tutorial.dispose();
    this.dom.restore();
  }

  /** Runs until the guide finishes or the game time runs out. */
  run(maxSec: number): void {
    const ticks = Math.round(maxSec / STEP_SEC);
    for (let i = 0; i < ticks; i += 1) {
      if (this.tutorial.step() === 'done') return;
      this.tick();
    }
  }

  /** Runs while a condition holds, for tests that stop part way. */
  runUntil(stop: (walk: GuideWalk) => boolean, maxSec: number): void {
    const ticks = Math.round(maxSec / STEP_SEC);
    for (let i = 0; i < ticks; i += 1) {
      if (stop(this)) return;
      this.tick();
    }
  }

  private tick(): void {
    this.dom.clock.ms += STEP_MS;
    this.state = advance(this.state, STEP_SEC, this.rng);

    if (this.state.pendingDecisions.some((d) => d.eventId === 'rain')) this.rained = true;
    if (this.state.projects.some((p) => p.punchOpen > 0)) this.punched = true;

    // app.ts paints first, so a card exists for the events about to arrive.
    this.render();
    this.drain();
    this.act();
  }

  /** What render() does for the guide, plus the re-entrancy host.refresh has. */
  private render(): void {
    this.depth += 1;
    if (this.depth > 8) throw new Error(`the guide re-entered render ${this.depth} deep`);
    try {
      this.tutorial.sync(this.state);
      this.record();
      this.watchScreen();
    } finally {
      this.depth -= 1;
    }
  }

  private drain(): void {
    const log = this.state.log;
    if (log.length === 0) return;
    const index = this.seenEvent === null ? -1 : log.findIndex((e) => e.id === this.seenEvent);
    if (this.seenEvent !== null && index === -1) {
      this.seenEvent = log[log.length - 1]!.id;
      return;
    }

    const fresh = log.slice(index + 1);
    if (fresh.length === 0) return;
    this.seenEvent = log[log.length - 1]!.id;

    for (const event of fresh) {
      // A toast is what T3 waits on, so the walk has to keep one on screen
      // for as long as the real one lives.
      if (event.kind === 'inspection') {
        this.inspections += 1;
        this.raiseToast('inspection');
      }
      if (event.kind === 'completed' && this.completedAtSec === null) {
        this.completedAtSec = this.state.elapsedSec;
      }
      this.tutorial.observe(event);
      this.record();
    }
  }

  /**
   * What the player does with the screen in front of them.
   *
   * Rain gets an answer and punch items get cleared whenever they turn up,
   * not only while the guide is pointing at them: a second rain shower or a
   * second punch item left alone would stall the job for ever, and the guide
   * only teaches each of them once.
   */
  private act(): void {
    const decision = this.state.pendingDecisions[0];
    if (decision) {
      this.dispatch(
        { type: 'resolveDecision', decisionId: decision.id, choice: decision.options[0]! },
        'rainChoice',
      );
    }

    const punching = this.state.projects.find((p) => p.punchOpen > 0 && p.punchClearQueued === 0);
    if (punching) {
      this.dispatch(
        { type: 'clearPunchList', projectId: punching.id, count: punching.punchOpen },
        'clearPunch',
      );
    }

    // The two steps that ask for a bid.
    const step = this.tutorial.step();
    if (step === 't1') {
      const named = this.state.board.find((rfq) => rfq.directAward);
      if (named && canAffordBid(this.state, named)) {
        this.dispatch({ type: 'submitBid', rfqId: named.id, tier: 'fair' }, 'bid');
      }
      return;
    }
    if (step === 't7') {
      const rfq = this.state.board.find((entry) => canAffordBid(this.state, entry));
      if (rfq) this.dispatch({ type: 'submitBid', rfqId: rfq.id, tier: 'fair' }, 'bid');
    }
  }

  /** ctx.dispatch: the action, then what it told the guide, then a paint. */
  private dispatch(action: Action, what: Act): void {
    const result = applyAction(this.state, action, this.rng);
    this.state = result.state;
    // app.ts only reports a bid the engine accepted; the other two are
    // reported either way.
    if (what === 'bid' ? result.ok : true) this.tutorial.acted(what);
    this.record();
    this.render();
  }

  /** What the player could see on the last paint. */
  private watchScreen(): void {
    const step = this.tutorial.step();
    if (step === 'done') return;
    if (this.panels.style.display !== 'none') this.shown.add(step);
    if (this.skip.style.display === 'none') this.skipAlwaysVisible = false;
  }

  /** Puts a toast on screen. `kind` is what raised it. */
  raiseToast(kind: string, forMs: number = theme.motion.toastMs): void {
    this.toasts = [...this.toasts, { kind, until: this.dom.clock.ms + forMs }];
  }

  /** How many times the guide asked for a target to be brought into view. */
  scrollsFor(what: TargetName): number {
    return this.targets.get(what)?.scrolledIntoView ?? 0;
  }

  /** Whether the guide would find this target on the screen right now. */
  onScreen(what: TargetName): boolean {
    return this.find(what) !== null;
  }

  /** Presses the skip control the way a finger would. */
  pressSkip(): void {
    const button = this.skip.findByClass('spot-skip');
    if (!button) throw new Error('the skip control is not on screen');
    button.fire('click');
  }

  /** The classes the guide is holding on <html> right now. */
  guideClasses(): string[] {
    return (this.dom.root.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((name) => name.startsWith('guide-'));
  }

  /** Which of the guide's targets are on screen right now. */
  private find(what: TargetName): Element | null {
    const on = (): boolean => {
      switch (what) {
        case 'namedCard': return this.state.board.some((rfq) => rfq.directAward);
        case 'siteProgress':
        case 'siteCard': return this.state.projects.length > 0;
        case 'cash': return true;
        case 'toast':
          // GUIDE_TOAST_SELECTOR: an inspection result, and nothing else.
          return this.toasts.some(
            (toast) => toast.kind === 'inspection' && this.dom.clock.ms < toast.until,
          );
        case 'rainChoice': return this.state.pendingDecisions.length > 0;
        case 'punchButton':
          return this.state.projects.some((p) => p.punchOpen > 0 && p.punchClearQueued === 0);
        case 'tierButtons': return this.state.board.length > 0;
        case 'subcontractors': return true;
        default: return false;
      }
    };
    if (!on()) return null;
    let node = this.targets.get(what);
    if (!node) {
      node = new FakeNode('div');
      node.setAttribute('data-guide', what);
      this.targets.set(what, node);
    }
    return node as unknown as Element;
  }

  private record(): void {
    const step = this.tutorial.step();
    if (this.steps[this.steps.length - 1] === step) return;
    this.steps.push(step);
    if (step !== 'done' || this.doneAtSec !== null) return;
    this.doneAtSec = this.state.elapsedSec;
    if (this.completedAtSec === null) this.endedBeforeHandover = true;
  }

  /** The steps a test cares about, with the resting state taken out. */
  taught(): StepId[] {
    return this.steps.filter((step) => step !== 'watch');
  }

  countOf(step: StepId): number {
    return this.steps.filter((entry) => entry === step).length;
  }
}
