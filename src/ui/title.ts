// The first screen. A name, one button, and a crane standing in the dark.
//
// It also covers the first paint: the game boots behind it, so the player
// never sees an empty white page.

import { button, el } from './dom';
import { craneSilhouette } from './icons';
import { play } from './sound';
import { strings } from './strings.en';
import { theme } from './theme';

export interface TitleScreen {
  node: HTMLElement;
  /** Fades out and removes itself, then calls back. */
  dismiss(then: () => void): void;
}

/**
 * `hasSave` decides the wording: a returning player is offered Continue, and
 * a new one gets Start.
 */
export function createTitleScreen(hasSave: boolean, onStart: () => void): TitleScreen {
  const start = button(
    hasSave ? strings.title.continue : strings.title.start,
    () => {
      play('click');
      onStart();
    },
    { class: 'btn primary' },
  );

  const node = el('div', { class: 'title-screen' }, [
    craneSilhouette(),
    el('div', { class: 'title-inner' }, [
      el('div', { class: 'title-name' }, [
        el('span', { text: strings.title.nameFirst }),
        el('span', { class: 'accent', text: strings.title.nameSecond }),
      ]),
      el('div', { class: 'title-tagline', text: strings.title.tagline }),
      start,
      el('div', { class: 'title-note', text: hasSave ? strings.title.savedNote : strings.title.newNote }),
    ]),
  ]);

  function dismiss(then: () => void): void {
    node.classList.add('is-leaving');
    globalThis.setTimeout(() => {
      node.remove();
      then();
    }, theme.motion.titleFadeMs);
  }

  return { node, dismiss };
}

/** The placeholder shown while the save is read: shapes, never a blank page. */
export function createSkeleton(): HTMLElement {
  const blocks = theme.size.skeletonHeights.map((height) => {
    const block = el('div', { class: 'skeleton-block' });
    block.style.height = `${height}px`;
    return block;
  });
  return el('div', { class: 'skeleton' }, blocks);
}
