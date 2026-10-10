// The spotlight: everything dims except one element.
//
// Built from four panels that surround the target rather than a hole punched
// in one overlay, because the panels are unaffected by whatever `overflow` the
// target happens to sit inside. The panels also swallow clicks, so while the
// spotlight is up the only thing the player can press is the thing it is
// pointing at.

import { clear, el } from './dom';
import { theme } from './theme';

export interface SpotlightTarget {
  /** The element to leave lit. */
  node: Element;
  /** Instruction line. */
  say: string;
  /** The reason, one line under it. */
  why: string;
  /** Where the caption sits relative to the target. */
  place?: 'above' | 'below' | 'auto';
}

export interface Spotlight {
  /** The dimming panels and caption. Hidden between steps. */
  node: HTMLElement;
  /** The skip control. Order 007 §1: visible the whole time the guide runs. */
  skipNode: HTMLElement;
  show(target: SpotlightTarget): void;
  hide(): void;
  /** Recomputes the cut-out; call when layout may have moved. */
  reposition(): void;
  setSkipVisible(on: boolean): void;
  setSkipLabel(label: string): void;
  dispose(): void;
}

export function createSpotlight(skipLabel: string, onSkip: () => void): Spotlight {
  const top = el('div', { class: 'spot-panel' });
  const bottom = el('div', { class: 'spot-panel' });
  const left = el('div', { class: 'spot-panel' });
  const right = el('div', { class: 'spot-panel' });
  const ring = el('div', { class: 'spot-ring' });

  const say = el('div', { class: 'spot-say' });
  const why = el('div', { class: 'spot-why' });
  const caption = el('div', { class: 'spot-caption' }, [say, why]);

  const skip = el('button', { class: 'btn small spot-skip', type: 'button' }, [skipLabel]);
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    onSkip();
  });

  const node = el('div', { class: 'spotlight' }, [top, bottom, left, right, ring, caption]);
  node.style.display = 'none';

  // Skip lives outside `node`: hide() blanks the panels between steps, and the
  // player must still be able to leave from the resting state.
  const skipHost = el('div', { class: 'spot-skip-host' }, [skip]);
  skipHost.style.display = 'none';

  let current: SpotlightTarget | null = null;
  let frame = 0;

  function place(): void {
    if (!current) return;
    const rect = current.node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const pad = theme.size.spotlightPad;
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = Math.min(globalThis.innerWidth - x, rect.width + pad * 2);
    const h = Math.min(globalThis.innerHeight - y, rect.height + pad * 2);

    setBox(top, 0, 0, globalThis.innerWidth, y);
    setBox(bottom, 0, y + h, globalThis.innerWidth, Math.max(0, globalThis.innerHeight - y - h));
    setBox(left, 0, y, x, h);
    setBox(right, x + w, y, Math.max(0, globalThis.innerWidth - x - w), h);
    setBox(ring, x, y, w, h);

    // The caption goes wherever there is room, preferring below.
    const below = globalThis.innerHeight - (y + h);
    const wantAbove = current.place === 'above' || (current.place !== 'below' && below < theme.size.spotCaptionRoom);
    caption.style.left = `${Math.round(Math.max(theme.size.gap, Math.min(x, globalThis.innerWidth - theme.size.panelMaxWidth - theme.size.gap)))}px`;
    if (wantAbove) {
      caption.style.top = '';
      caption.style.bottom = `${Math.round(Math.max(theme.size.gap, globalThis.innerHeight - y + theme.size.gapSmall))}px`;
    } else {
      caption.style.bottom = '';
      caption.style.top = `${Math.round(y + h + theme.size.gapSmall)}px`;
    }
  }

  function setBox(target: HTMLElement, x: number, y: number, w: number, h: number): void {
    target.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    target.style.width = `${Math.round(Math.max(0, w))}px`;
    target.style.height = `${Math.round(Math.max(0, h))}px`;
  }

  /** Shows or hides the skip control independently of the panels. */
  function setSkipVisible(on: boolean): void {
    skipHost.style.display = on ? '' : 'none';
  }

  /** Keeps the skip label in step with the current language. */
  function setSkipLabel(label: string): void {
    skip.textContent = label;
  }

  function show(target: SpotlightTarget): void {
    current = target;
    node.style.display = '';
    say.textContent = target.say;
    why.textContent = target.why;
    place();
  }

  function hide(): void {
    current = null;
    node.style.display = 'none';
  }

  function reposition(): void {
    if (!current) return;
    // Coalesce bursts of resize/scroll into one measurement per frame.
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  }

  const onResize = (): void => reposition();
  globalThis.addEventListener('resize', onResize);
  globalThis.addEventListener('scroll', onResize, true);

  function dispose(): void {
    globalThis.removeEventListener('resize', onResize);
    globalThis.removeEventListener('scroll', onResize, true);
    if (frame) cancelAnimationFrame(frame);
    hide();
    clear(node);
    node.remove();
    skipHost.remove();
  }

  return { node, skipNode: skipHost, show, hide, reposition, dispose, setSkipVisible, setSkipLabel };
}
