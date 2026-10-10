// Term tooltips: an ⓘ next to a label, one line of plain language behind it.
//
// Hover opens it on a mouse. On a touch screen there is no hover, so it opens
// on tap and closes on the next tap anywhere else — which is also why the
// dismissal is wired to the document rather than to the dot.

import { el, svgEl } from './dom';
import { theme } from './theme';
import { strings } from './strings';

let openTip: HTMLElement | null = null;
let listening = false;

function closeOpen(): void {
  if (!openTip) return;
  openTip.classList.remove('is-open');
  openTip = null;
}

function listenOnce(): void {
  if (listening) return;
  listening = true;
  // Capture phase: a tap anywhere that is not this dot closes the bubble,
  // including taps that the target stops from bubbling.
  globalThis.document?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (openTip && target && openTip.contains(target)) return;
    closeOpen();
  }, true);
  globalThis.document?.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') closeOpen();
  });
}

/**
 * An information dot carrying one line. `text` is already translated.
 */
export function infoDot(text: string, labelledBy?: string): HTMLElement {
  listenOnce();

  const bubble = el('span', { class: 'tip-bubble', role: 'tooltip', text });
  const dot = el('button', {
    class: 'tip-dot',
    type: 'button',
    'aria-label': labelledBy ? `${labelledBy}: ${strings.terms.label}` : strings.terms.label,
  }, [
    svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'icon tip-icon' }, [
      svgEl('circle', { cx: 12, cy: 12, r: 9 }),
      svgEl('path', { d: 'M12 11v5' }),
      svgEl('path', { d: 'M12 7.6v.01' }),
    ]),
  ]);

  const host = el('span', { class: 'tip' }, [dot, bubble]);

  // A bubble opened by hover gets the same treatment as one opened by tap:
  // centred on its dot, it would run off the edge near the right-hand side.
  host.addEventListener('mouseenter', () => keepOnScreen(bubble));
  dot.addEventListener('focus', () => keepOnScreen(bubble));

  dot.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wasOpen = host.classList.contains('is-open');
    closeOpen();
    if (!wasOpen) {
      host.classList.add('is-open');
      openTip = host;
      keepOnScreen(bubble);
    }
  });

  return host;
}

/**
 * Slides a bubble back inside the viewport. It is centred on its dot by
 * default, which runs off the edge for anything near the right-hand side.
 */
function keepOnScreen(bubble: HTMLElement): void {
  bubble.style.transform = '';
  bubble.style.left = '';
  const rect = bubble.getBoundingClientRect();
  const margin = theme.size.gapSmall;
  let shift = 0;
  if (rect.right > globalThis.innerWidth - margin) {
    shift = globalThis.innerWidth - margin - rect.right;
  } else if (rect.left < margin) {
    shift = margin - rect.left;
  }
  if (shift !== 0) {
    bubble.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
  }
}

/** A label with its ⓘ, the pairing used across the panels. */
export function labelWithTip(label: string, tip: string, className = 'stat-label'): HTMLElement {
  return el('span', { class: `${className} has-tip` }, [
    el('span', { text: label }),
    infoDot(tip, label),
  ]);
}
