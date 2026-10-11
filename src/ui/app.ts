// The application shell: owns the state, runs the loop, and keeps the screen
// in step with it.
//
// src/ui calls src/core and formats what comes back. It computes no rules.
//
// Panels are built once and patched every frame. That is what lets a floor
// rise into place, a payment lift off its card and the crane keep turning:
// nothing on screen is thrown away between frames.
//
// Order 008 made the site the screen. The scene fills the window, the HUD
// floats over it, the selected site's numbers open beneath it, and the board,
// the company and the log are drawers along the bottom.

import {
  advance,
  applyAction,
  isLifeline,
  type Action,
  type GameEvent,
  type GameState,
  type Rng,
} from '../core';
import { clearSave, createAutosave, load, PREVIEW_BUILD, save, storageKey, type OfflineSummary } from '../save';
import { clear, el, toggleClass } from './dom';
import { faviconDataUrl } from './icons';
import { initMotion, noteFrame } from './motion';
import { initSound, play } from './sound';
import { initLanguage, onLanguageChange } from './strings';
import { injectStyles } from './style';
import { createBoard, type BidResult } from './board';
import { createCompanyPanel } from './company';
import { createLog } from './log';
import { createSiteCard, type SiteCard } from './site';
import { createScene, type Scene } from './scene';
import { createDrawers, type DrawerId, type Drawers } from './drawers';
import { createTopBar } from './topbar';
import { createSkeleton, createTitleScreen } from './title';
import { createTutorial, markTutorialSeen, type TargetName, type Tutorial } from './tutorial';
import { abandonDialog, defectLine, offlineDialog, settingsDialog, Toasts } from './overlays';
import { TARGET_DRAWER, TARGET_SELECTOR } from './targets';
import { strings } from './strings';
import { theme } from './theme';
import type { Ctx } from './context';

const STEP_SEC = 0.1;
const HINT_KEY = storageKey('hint');

export function mount(root: HTMLElement): void {
  injectStyles();
  initMotion();
  initSound();
  // Language first: everything built after this reads the chosen table.
  initLanguage();
  document.title = strings.app.title;
  applyFavicon();

  // The preview build says so, in a corner, over everything.
  if (PREVIEW_BUILD) {
    document.body.append(el('div', { class: 'preview-badge', 'aria-hidden': 'true' }, [strings.app.preview]));
  }

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
      const title = createTitleScreen(
        !loaded.fresh,
        () => title.dismiss(game.start),
        game.discardSave,
      );
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
  /** Throws the save away and reloads into a fresh company. */
  discardSave(): void;
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
      if (action.type === 'submitBid' && result.ok) tutorial.acted('bid');
      if (action.type === 'clearPunchList') tutorial.acted('clearPunch');
      if (action.type === 'resolveDecision') tutorial.acted('rainChoice');
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
        }, closeOverlay, () => markTutorialSeen(false)),
      );
    },
  };

  let topbar = createTopBar(ctx);
  let board = createBoard();
  let company = createCompanyPanel(ctx);
  let logPanel = createLog();

  /** Where the selected site's numbers open, under the scene. */
  const detail = el('div', { class: 'detail-host' });

  // The scene outlives a language change: it has no words of its own beyond
  // the lot signs, which it redraws on request.
  const scene: Scene = createScene({
    cashAnchor: () => document.querySelector('[data-guide="cash"]'),
    hud: () => document.querySelector('.topbar'),
  });
  scene.onSelect(() => render());

  let drawers: Drawers = createDrawers(
    { bid: board.node, company: company.node, log: logPanel.node },
    detail,
  );
  drawers.onChange(onDrawerChange);

  /** An open drawer leaves the site's numbers less room, not none. */
  function onDrawerChange(id: DrawerId | null): void {
    toggleClass(root, 'drawer-open', id !== null);
    if (id === null) guideOpened = null;
  }

  /**
   * Which drawer the guide opened for the step it is on. The next step that
   * wants something else closes it again, so the guide never leaves a panel
   * standing over the site.
   */
  let guideOpened: DrawerId | null = null;

  /** One card per running site, kept across frames and keyed by project id. */
  let siteCards = new Map<string, SiteCard>();

  /**
   * Where each guided step points. Kept here because app.ts is the only place
   * that knows the whole screen; the guide itself knows nothing about layout.
   */
  function findTarget(what: TargetName): Element | null {
    const drawer = TARGET_DRAWER[what];
    // Order 008 §5: a step whose target is in a closed drawer opens it, and
    // the next step that wants something else puts it back.
    if (drawer === undefined) closeGuideDrawer();
    const node = document.querySelector(TARGET_SELECTOR[what]);
    if (!node) return null;
    if (drawer !== undefined && drawers.openId() !== drawer) {
      drawers.open(drawer);
      guideOpened = drawer;
    }
    return node;
  }

  /** Puts back what the guide opened, once the guide has moved on. */
  function closeGuideDrawer(): void {
    if (guideOpened === null) return;
    if (drawers.openId() === guideOpened) drawers.close();
    guideOpened = null;
  }

  function mountPanels(): void {
    clear(root);
    root.append(scene.node, topbar.node, drawers.node);
  }
  mountPanels();

  // The guide belongs to a company that has not finished anything yet, which
   // is a truer test than `fresh`: booting writes a save immediately, so a
   // reload on the title screen would otherwise count as "not new".
  const tutorial: Tutorial = createTutorial(
    { find: findTarget, refresh: () => render() },
    state.company.completedProjects === 0 && state.projects.length === 0,
  );
  document.body.append(tutorial.node, tutorial.skipNode);

  /**
   * A language change swaps every label at once. Rather than teach each panel
   * to re-translate itself in place, the panels are rebuilt: the game state is
   * untouched, so the only thing that changes is the words.
   */
  onLanguageChange(() => {
    for (const card of siteCards.values()) card.dispose();
    siteCards = new Map();
    clear(detail);
    topbar = createTopBar(ctx);
    board = createBoard();
    company = createCompanyPanel(ctx);
    logPanel = createLog();
    const wasOpen = drawers.openId();
    drawers.dispose();
    drawers = createDrawers(
      { bid: board.node, company: company.node, log: logPanel.node },
      detail,
    );
    drawers.onChange(onDrawerChange);
    if (wasOpen) drawers.open(wasOpen);
    scene.relabel();
    mountPanels();
    document.title = strings.app.title;
    render();
  });

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

    for (const event of fresh) {
      handleEvent(event);
      tutorial.observe(event);
    }
  }

  function handleEvent(event: GameEvent): void {
    switch (event.kind) {
      case 'awarded':
        play('awarded');
        return;

      case 'payment': {
        if (event.delayed) return;
        siteCards.get(event.projectId)?.payment(event.amount);
        scene.payment(event.projectId, event.amount);
        play('payment');
        return;
      }

      case 'completed':
        scene.completed(event.projectId);
        play('handover');
        return;

      case 'inspection': {
        const gate = (strings.gate as Record<string, string>)[event.gateId] ?? event.gateId;
        const card = siteCards.get(event.projectId);
        if (event.passed) {
          scene.pass(event.projectId, event.gateId);
          play('pass');
          toasts.show({
            text:
              event.minors > 0
                ? strings.toast.passedMinors(gate, event.minors)
                : strings.toast.passed(gate),
            tone: 'good',
            kind: 'inspection',
          });
          if (hintStep === 1) setHint(2);
          return;
        }
        card?.fail();
        scene.fail(event.projectId, event.floor);
        play('fail');
        const detail = defectLine(event.gateId, state);
        toasts.show({
          text: strings.toast.failed(gate),
          ...(detail === undefined ? {} : { detail }),
          tone: 'bad',
          kind: 'inspection',
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
    scene.update(ctx);
    syncSites();

    results = results.filter((entry) => entry.until > now);
    const hint =
      hintStep >= 0 && hintStep < strings.hints.length ? strings.hints[hintStep] ?? null : null;
    board.update(ctx, results, hint);

    company.update(ctx);
    logPanel.update(ctx);

    // Rain drains the colour from the whole screen while it falls.
    toggleClass(root, 'is-wet', state.weather.raining);

    tutorial.sync(state);
    if (!tutorial.active()) closeGuideDrawer();
  }

  /** Keeps a card per running site, and shows the one the scene has chosen. */
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
      }
      card.update(ctx, project);
    }

    const chosen = scene.selectedId();
    const wanted = chosen === null ? null : siteCards.get(chosen) ?? null;
    const shown = detail.firstElementChild;
    if (shown === (wanted?.node ?? null)) return;
    clear(detail);
    if (wanted) detail.append(wanted.node);
    // The scene's ground line follows the card up and down.
    toggleClass(root, 'has-detail', wanted !== null);
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

  function discardSave(): void {
    // Stop autosaving first: the unload flush would write the save straight
    // back and the delete would do nothing.
    autosave.dispose();
    clearSave();
    globalThis.location.reload();
  }

  return { start, discardSave };
}
