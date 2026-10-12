// The EN / KO switch.
//
// The control is deliberately not translated: "EN" and "KO" read the same in
// either language, which is the point of a language switch.

import { button, el } from './dom';
import { play } from './sound';
import { language, onLanguageChange, setLanguage, strings, type LanguageId } from './strings';

const order: LanguageId[] = ['en', 'ko'];
const labels: Record<LanguageId, string> = { en: 'EN', ko: 'KO' };

/**
 * A two-state switch rather than a dropdown: with two languages a dropdown is
 * a menu you have to open to find out it has two entries in it.
 */
export function languageToggle(className = 'lang-toggle'): HTMLElement {
  const host = el('div', { class: className, role: 'group' });

  const buttons = order.map((id) =>
    button(labels[id], () => {
      if (language() === id) return;
      play('click');
      setLanguage(id);
    }, { class: 'btn small lang-btn', ariaLabel: `${strings.settings.languageSwitch}: ${labels[id]}` }),
  );

  host.append(...buttons);
  sync();
  // Once this switch has been on screen and is gone, it stops listening.
  let shown = false;
  const off = onLanguageChange(() => {
    if (host.isConnected) shown = true;
    else if (shown) {
      off();
      return;
    }
    sync();
  });

  function sync(): void {
    const active = language();
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i];
      const node = buttons[i];
      if (!id || !node) continue;
      node.classList.toggle('is-active', id === active);
      node.setAttribute('aria-pressed', id === active ? 'true' : 'false');
      node.setAttribute('aria-label', `${strings.settings.languageSwitch}: ${labels[id]}`);
    }
  }

  return host;
}
