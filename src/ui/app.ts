// The application shell: owns the state, runs the loop, and re-renders.
//
// src/ui calls src/core and formats what comes back. It computes no rules.

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
import { clear, el } from './dom';
import { injectStyles } from './style';
import { renderBoard, type BidResult } from './board';
import { renderCompany } from './company';
import { renderLog } from './log';
import { renderEmptyLot, renderSiteCard } from './site';
import { renderTopBar } from './topbar';
import { abandonDialog, defectLine, offlineDialog, settingsDialog, Toasts } from './overlays';
import { strings } from './strings.en';
import { theme } from './theme';
import type { Ctx } from './context';

const STEP_SEC = 0.1;
const HINT_KEY = 'contractor-tycoon:hint';

export function mount(root: HTMLElement): void {
  injectStyles();
  document.title = strings.app.title;
  root.append(el('div', { class: 'loading' }, [el('div', { class: 'spinner' }), strings.app.loading]));

  // One frame of loading, then boot: keeps the indicator visible on slow devices.
  requestAnimationFrame(() => requestAnimationFrame(() => boot(root)));
}

function boot(root: HTMLElement): void {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const loaded = load(Date.now(), seed);

  let state: GameState = loaded.state;
  let rng: Rng = loaded.rng;
  let seenEvents = state.log.length > 0 ? (state.log[state.log.length - 1] as GameEvent).id : null;
  let results: BidResult[] = [];
  let hintStep = readHint();
  let overlay: HTMLElement | null = null;

  clear(root);
  const topbar = el('div', { class: 'topbar' });
  const sites = el('div', { class: 'sites' });
  const board = el('div', { class: 'panel' });
  const company = el('div', { class: 'panel' });
  const logPanel = el('div', { class: 'panel' });

  root.append(
    topbar,
    el('div', { class: 'columns' }, [
      el('div', {}, [sites]),
      el('div', {}, [board, company]),
    ]),
    logPanel,
  );
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

  /** Turns new engine events into toasts. The log panel shows them all. */
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
      if (event.kind !== 'inspection') continue;
      const gate = (strings.gate as Record<string, string>)[event.gateId] ?? event.gateId;
      if (event.passed) {
        toasts.show({
          text: event.minors > 0
            ? strings.toast.passedMinors(gate, event.minors)
            : strings.toast.passed(gate),
          tone: 'good',
        });
        if (hintStep === 1) setHint(2);
      } else {
        const detail = defectLine(event.gateId, state);
        toasts.show({
          text: strings.toast.failed(gate),
          ...(detail === undefined ? {} : { detail }),
          tone: 'bad',
        });
      }
    }
  }

  function render(): void {
    renderTopBar(topbar, ctx);

    clear(sites);
    for (const project of state.projects) sites.append(renderSiteCard(ctx, project));
    const lots = state.company.siteSlots - state.projects.filter((p) => !isRepair(p.typeId)).length;
    for (let i = 0; i < lots; i += 1) sites.append(renderEmptyLot(ctx));

    const now = performance.now();
    results = results.filter((entry) => entry.until > now);
    const hint = hintStep >= 0 && hintStep < strings.hints.length ? strings.hints[hintStep] ?? null : null;
    renderBoard(board, ctx, results, hint);

    renderCompany(company, ctx);
    renderLog(logPanel, ctx);
  }

  function isRepair(typeId: string): boolean {
    return data.projectTypeById[typeId]?.lifeline === true;
  }

  // ---- loop -------------------------------------------------------------
  let last = performance.now();
  let accumulator = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }
    accumulator += Math.min((now - last) / 1000, 1);
    last = now;

    let stepped = false;
    while (accumulator >= STEP_SEC) {
      state = advance(state, STEP_SEC, rng);
      accumulator -= STEP_SEC;
      stepped = true;
    }
    if (!stepped) return;

    drainEvents();
    autosave.tick(STEP_SEC, state, rng, Date.now());
    render();
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

  if (!loaded.fresh && loaded.offlineSec >= theme.motion.offlineModalMinSec) {
    showWelcomeBack(loaded.offlineSec, loaded.offlineCapped, loaded.summary);
  }

  // One step before the first paint, so the board is already full when the
  // player first looks at it rather than filling in on the next frame.
  state = advance(state, STEP_SEC, rng);
  save(state, rng, Date.now());
  render();
  requestAnimationFrame(frame);
}
