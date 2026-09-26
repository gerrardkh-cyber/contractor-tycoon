// The first screen. A name, one button, and a crane standing in the dark.
//
// It also covers the first paint: the game boots behind it, so the player
// never sees an empty white page.

import { button, clear, el } from './dom';
import { craneSilhouette } from './icons';
import { play } from './sound';
import { languageToggle } from './language';
import { onLanguageChange, strings } from './strings';
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
export function createTitleScreen(
  hasSave: boolean,
  onStart: () => void,
  onNewGame: () => void,
): TitleScreen {
  const node = el('div', { class: 'title-screen' });

  // The language switch sits on this very screen, so the screen has to be able
  // to redraw itself. It is rebuilt rather than patched: the New game button
  // carries a confirmation state, and that state should not survive a change
  // of language — asking again in the new wording is the safer read.
  function fill(): void {
    clear(node);

    const start = button(
      hasSave ? strings.title.continue : strings.title.start,
      () => {
        play('click');
        onStart();
      },
      { class: 'btn primary' },
    );

    const buttons: HTMLElement[] = [start];

    // Order 006: starting over must not require finding the settings dialog.
    // A returning player gets it next to Continue, armed on a second press.
    if (hasSave) {
      let armed = false;
      const fresh = button(strings.title.newGame, () => {
        play('click');
        if (!armed) {
          armed = true;
          fresh.textContent = strings.title.newGameConfirm;
          fresh.className = 'btn danger';
          return;
        }
        onNewGame();
      }, { class: 'btn' });
      buttons.push(fresh);
    }

    node.append(
      craneSilhouette(),
      el('div', { class: 'title-inner' }, [
        el('div', { class: 'title-name' }, [
          el('span', { text: strings.title.nameFirst }),
          el('span', { class: 'accent', text: strings.title.nameSecond }),
        ]),
        el('div', { class: 'title-tagline', text: strings.title.tagline }),
        el('div', { class: 'title-buttons' }, buttons),
        el('div', {
          class: 'title-note',
          text: hasSave ? strings.title.savedNote : strings.title.newNote,
        }),
        languageToggle(),
      ]),
    );
  }

  fill();
  const stopListening = onLanguageChange(fill);

  function dismiss(then: () => void): void {
    stopListening();
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
