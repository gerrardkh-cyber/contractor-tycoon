// Tiny DOM helpers. No framework, per CLAUDE.md.

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(
  label: string,
  onClick: () => void,
  options: { class?: string; disabled?: boolean; title?: string } = {},
): HTMLButtonElement {
  const node = el('button', {
    class: options.class ?? 'btn',
    type: 'button',
    disabled: options.disabled,
    title: options.title,
  }, [label]);
  node.addEventListener('click', (event) => {
    event.preventDefault();
    if (!node.disabled) onClick();
  });
  return node;
}

/** A labelled value, the shape most of this UI is made of. */
export function stat(label: string, value: string, valueClass?: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: valueClass ? `stat-value ${valueClass}` : 'stat-value', text: value }),
  ]);
}

export function bar(ratio: number, fillClass = 'bar-fill'): HTMLElement {
  const clamped = Math.max(0, Math.min(1, ratio));
  return el('div', { class: 'bar' }, [
    el('div', { class: fillClass, style: `width:${(clamped * 100).toFixed(1)}%` }),
  ]);
}
