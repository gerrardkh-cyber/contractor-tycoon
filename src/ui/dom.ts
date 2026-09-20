// Tiny DOM helpers. No framework, per CLAUDE.md.

import { theme } from './theme';

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The same helper for SVG, which needs its own namespace. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs);
  append(node, children);
  return node;
}

function apply(node: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', String(value));
    else if (key === 'text') node.textContent = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
}

function append(node: Element, children: (Node | string | null | undefined)[]): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(
  label: string | Node,
  onClick: () => void,
  options: { class?: string; disabled?: boolean; title?: string; ariaLabel?: string } = {},
): HTMLButtonElement {
  const node = el('button', {
    class: options.class ?? 'btn',
    type: 'button',
    disabled: options.disabled,
    title: options.title,
    'aria-label': options.ariaLabel,
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
  const node = el('div', { class: 'bar' }, [el('div', { class: fillClass })]);
  setBar(node, ratio);
  return node;
}

/**
 * Bars scale rather than resize: a width change would lay the page out again,
 * a transform only repaints.
 */
export function setBar(node: Element, ratio: number): void {
  const fill = node.firstElementChild as HTMLElement | null;
  if (!fill) return;
  const clamped = Math.max(0, Math.min(1, ratio));
  fill.style.transform = `scaleX(${clamped.toFixed(4)})`;
}

/** Sets text only when it actually changed, so the DOM stays still. */
export function setText(node: Node | null | undefined, value: string): void {
  if (node && node.textContent !== value) node.textContent = value;
}

/** Sets an attribute only when it changed. */
export function setAttr(node: Element | null | undefined, name: string, value: string): void {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function setClass(node: Element | null | undefined, value: string): void {
  if (node && node.getAttribute('class') !== value) node.setAttribute('class', value);
}

/** Toggles a class without disturbing the rest. */
export function toggleClass(node: Element | null | undefined, name: string, on: boolean): void {
  if (!node) return;
  if (on) node.classList.add(name);
  else node.classList.remove(name);
}

/**
 * Restarts a CSS animation on a node that may already be running one.
 * Reading offsetWidth between the two writes forces the style to settle.
 */
export function replayAnimation(node: HTMLElement | SVGElement, className: string): void {
  node.classList.remove(className);
  void (node as HTMLElement).offsetWidth;
  node.classList.add(className);
}

/** A number formatted into a span that later tweens rather than jumping. */
export function tweenValue(className = 'stat-value'): HTMLElement {
  return el('span', { class: className });
}

export function px(value: number): string {
  return `${value}px`;
}

export function ms(value: number): string {
  return `${value}ms`;
}

/** The standard icon + label pairing used across the panels. */
export function withIcon(icon: Node, label: string | Node, className = 'icon-row'): HTMLElement {
  return el('span', { class: className }, [
    icon,
    typeof label === 'string' ? el('span', { text: label }) : label,
  ]);
}

/** A level gauge: filled segments out of a maximum. */
export function gauge(level: number, max: number, className = 'gauge'): HTMLElement {
  const node = el('div', { class: className, role: 'img' }, [el('div', { class: 'gauge-fill' })]);
  setGauge(node, level, max);
  return node;
}

export function setGauge(node: HTMLElement, level: number, max: number): void {
  const ratio = max > 0 ? Math.max(0, Math.min(1, level / max)) : 0;
  setBar(node, ratio);
  setAttr(node, 'aria-label', `${level} / ${max}`);
}

/** How long a CSS transition should take, honouring the motion switch. */
export function motionMs(value: number): number {
  return theme.motion.motionEnabled ? value : 0;
}
