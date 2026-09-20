// The application shell: owns the state, runs the loop, and keeps the screen
// in step with it.
//
// src/ui calls src/core and formats what comes back. It computes no rules.
//
// Panels are built once and patched every frame. That is what lets a floor
// rise into place, a payment lift off its card and the crane keep turning:
// nothing on screen is thrown away between frames.

import {
  advance,
  applyAction,
  data,
  isLifeline,
  type Action,
  type GameEvent,
  type GameState,
  type Rng,
} from '../core';
import { clearSave, createAutosave, load, save, type OfflineSummary } from '../save';
import { clear, el, toggleClass } from './dom';
import { faviconDataUrl } from './icons';
import { initMotion, noteFrame } from './motion';
import { initSound, play } from './sound';
import { injectStyles } from './style';
import { createBoard, type BidResult } from './board';
import { createCompanyPanel } from './company';
import { createLog } from './log';
import { createSiteCard, renderEmptyLot, type SiteCard } from './site';
import { createTopBar } from './topbar';
import { createSkeleton, createTitleScreen } from './title';
import { abandonDialog, defectLine, offlineDialog, settingsDialog, Toasts } from './overlays';
import { strings } from './strings.en';
import { theme } from './theme';
import type { Ctx } from './context';

const STEP_SEC = 0.1;
const HINT_KEY = 'contractor-tycoon:hint';

export function mount(root: HTMLElement): void {
  injectStyles();
  initMotion();
  initSound();
  document.title = strings.app.title;
  applyFavicon();

  // Shapes, not a blank page, while the save is read.
  root.append(createSkeleton());

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const seed = Math.floor(Math.random() * 0xffffffff);
      const loaded = load(Date.now(), seed);

      // The game is built behind the title, so the screen the player is about
      // to see is already there when the title fades off it. The clock does
      // not start until they ask for it.
      const game = boot(root, loaded, seed);
      const title = createTitleScreen(!loaded.fresh, () => title.dismiss(game.start));
      document.body.append(title.node);
    }),
  );
}

function applyFavicon(): void {
  const link = el('link', { rel: 'icon', type: 'image/svg+xml' });
  link.setAttribute('href', faviconDataUrl(theme.color.panel, theme.color.accent));
  document.head.append(link);
}

type Loaded = ReturnType<typeof load>;

interface Game {
  /** Starts the clock. Called once the title screen has gone. */
  start(): void;
}

function boot(root: HTMLElement, loaded: Loaded, seed: number): Game {
  let state: GameState = loaded.state;
  let rng: Rng = loaded.rng;
  let seenEvents = state.log.length > 0 ? (state.log[state.log.length - 1] as GameEvent).id : null;
  let results: BidResult[] = [];
  let hintStep = readHint();
  let overlay: HTMLElement | null = null;

  clear(root);
  const toasts = new Toasts(document.body);
  const autosave = createAutosave(() => ({ state, rng }));

  const ctx: Ctx = {
    get state() {
      return state;
    },
    dispatch(action: Action) {
      const before = state;
      const result = applyAction(state, action, rng);
      state = result.state;
      if (action.type === 'submitBid') noteBidResult(before, state, action.rfqId);
      if (hintStep === 0 && action.type === 'submitBid') setHint(1);
      render();
    },
    toast: (request) => toasts.show(request),
    get hintStep() {
      return hintStep;
    },
    advanceHint: setHint,
    openAbandon(projectId: string) {
      const project = state.projects.find((entry) => entry.id === projectId);
      if (!project) return;
      showOverlay(
        abandonDialog(
          project,
          () => {
            closeOverlay();
            ctx.dispatch({ type: 'abandonProject', projectId });
          },
          closeOverlay,
        ),
      );
    },
    openSettings() {
      showOverlay(
        settingsDialog(() => {
          // Stop autosaving first: otherwise the unload flush writes the save
          // straight back and the delete does nothing.
          autosave.dispose();
          clearSave();
          globalThis.location.reload();
        }, closeOverlay),
      );
    },
  };

  const topbar = createTopBar(ctx);
  const sites = el('div', { class: 'sites' });
  const board = createBoard();
  const company = createCompanyPanel(ctx);
  const logPanel = createLog();

  root.append(
    topbar.node,
    el('div', { class: 'columns' }, [
      el('div', {}, [sites]),
      el('div', {}, [board.node, company.node]),
    ]),
    logPanel.node,
  );

  /** One card per running site, kept across frames and keyed by project id. */
  const siteCards = new Map<string, SiteCard>();

  function setHint(step: number): void {
    hintStep = step;
    try {
      globalThis.localStorage?.setItem(HINT_KEY, String(step));
    } catch {
      // Private browsing: the hint simply restarts next time.
    }
  }

  function readHint(): number {
    try {
      const raw = globalThis.localStorage?.getItem(HINT_KEY);
      return raw === null || raw === undefined ? 0 : Number(raw);
    } catch {
      return 0;
    }
  }

  function showOverlay(node: HTMLElement): void {
    closeOverlay();
    overlay = node;
    document.body.append(node);
  }

  function closeOverlay(): void {
    overlay?.remove();
    overlay = null;
  }

  function noteBidResult(before: GameState, after: GameState, rfqId: string): void {
    const rfq = before.board.find((entry) => entry.id === rfqId);
    if (!rfq || isLifeline(rfq)) return;
    const won = after.projects.length > before.projects.length;
    results = [
      ...results.filter((entry) => entry.rfqId !== rfqId),
      { rfqId, won, until: performance.now() + theme.motion.bidResultMs },
    ];
  }

  /**
   * Turns new engine events into what the player sees and hears: a badge on
   * the part that passed, a shake on the one that failed, money lifting off a
   * card, and one cue each. The log panel keeps them all.
   */
  function drainEvents(): void {
    if (state.log.length === 0) return;
    const index = seenEvents === null ? -1 : state.log.findIndex((e) => e.id === seenEvents);

    // The log is a ring buffer. If the last seen event has aged out of it we
    // have no idea what is new, so skip ahead rather than toast sixty at once.
    if (seenEvents !== null && index === -1) {
      seenEvents = (state.log[state.log.length - 1] as GameEvent).id;
      return;
    }

    const fresh = state.log.slice(index + 1);
    if (fresh.length === 0) return;
    seenEvents = (state.log[state.log.length - 1] as GameEvent).id;

    for (const event of fresh) handleEvent(event);
  }

  function handleEvent(event: GameEvent): void {
    switch (event.kind) {
      case 'awarded':
        play('awarded');
        return;

      case 'payment': {
        if (event.delayed) return;
        siteCards.get(event.projectId)?.payment(event.amount);
        play('payment');
        return;
      }

      case 'completed':
        play('handover');
        return;

      case 'inspection': {
        const gate = (strings.gate as Record<string, string>)[event.gateId] ?? event.gateId;
        const card = siteCards.get(event.projectId);
        if (event.passed) {
          card?.pass(event.gateId);
          play('pass');
          toasts.show({
            text:
              event.minors > 0
                ? strings.toast.passedMinors(gate, event.minors)
                : strings.toast.passed(gate),
            tone: 'good',
          });
          if (hintStep === 1) setHint(2);
          return;
        }
        card?.fail();
        play('fail');
        const detail = defectLine(event.gateId, state);
        toasts.show({
          text: strings.toast.failed(gate),
          ...(detail === undefined ? {} : { detail }),
          tone: 'bad',
        });
        return;
      }

      default:
        return;
    }
  }

  function render(): void {
    const now = performance.now();
    topbar.update(ctx, now);
    syncSites();

    results = results.filter((entry) => entry.until > now);
    const hint =
      hintStep >= 0 && hintStep < strings.hints.length ? strings.hints[hintStep] ?? null : null;
    board.update(ctx, results, hint);

    company.update(ctx);
    logPanel.update(ctx);

    // Rain drains the colour from the whole screen while it falls.
    toggleClass(root, 'is-wet', state.weather.raining);
  }

  /** Adds a card for a new site, drops the card for one that has gone. */
  function syncSites(): void {
    const live = new Set(state.projects.map((project) => project.id));
    for (const [id, card] of siteCards) {
      if (live.has(id)) continue;
      card.dispose();
      card.node.remove();
      siteCards.delete(id);
    }

    for (const project of state.projects) {
      let card = siteCards.get(project.id);
      if (!card) {
        card = createSiteCard(ctx, project);
        siteCards.set(project.id, card);
        sites.append(card.node);
      }
      card.update(ctx, project);
    }

    // Empty lots fill whatever the running sites do not.
    const running = state.projects.filter((p) => !isRepair(p.typeId)).length;
    const wanted = Math.max(0, state.company.siteSlots - running);
    const lots = sites.querySelectorAll('.empty-lot');
    if (lots.length !== wanted) {
      for (const lot of lots) lot.remove();
      for (let i = 0; i < wanted; i += 1) sites.append(renderEmptyLot(ctx));
    }
  }

  function isRepair(typeId: string): boolean {
    return data.projectTypeById[typeId]?.lifeline === true;
  }

  // ---- loop -------------------------------------------------------------
  let last = performance.now();
  let accumulator = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const frameMs = now - last;
    if (document.hidden) {
      last = now;
      return;
    }
    // What the last frame cost decides whether decoration is affordable.
    noteFrame(frameMs);
    accumulator += Math.min(frameMs / 1000, 1);
    last = now;

    let stepped = false;
    while (accumulator >= STEP_SEC) {
      state = advance(state, STEP_SEC, rng);
      accumulator -= STEP_SEC;
      stepped = true;
    }
    if (!stepped) return;

    // Paint first, so a card exists for the events about to be announced.
    render();
    drainEvents();
    autosave.tick(STEP_SEC, state, rng, Date.now());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autosave.flush(state, rng, Date.now());
      return;
    }
    last = performance.now();
    accumulator = 0;
    resumeFromBackground();
  });

  function resumeFromBackground(): void {
    const result = load(Date.now(), seed);
    if (result.fresh || result.offlineSec < theme.motion.offlineModalMinSec) return;
    state = result.state;
    rng = result.rng;
    seenEvents = state.log.length > 0 ? (state.log[state.log.length - 1] as GameEvent).id : null;
    showWelcomeBack(result.offlineSec, result.offlineCapped, result.summary);
    render();
  }

  function showWelcomeBack(sec: number, capped: boolean, summary: OfflineSummary): void {
    showOverlay(offlineDialog(sec, capped, summary, closeOverlay));
  }

  // One step before the first paint, so the board is already full when the
  // player first looks at it rather than filling in on the next frame.
  state = advance(state, STEP_SEC, rng);
  save(state, rng, Date.now());
  render();

  function start(): void {
    if (!loaded.fresh && loaded.offlineSec >= theme.motion.offlineModalMinSec) {
      showWelcomeBack(loaded.offlineSec, loaded.offlineCapped, loaded.summary);
    }
    last = performance.now();
    accumulator = 0;
    requestAnimationFrame(frame);
  }

  return { start };
}
