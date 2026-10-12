// Inline SVG icons, drawn on a 24x24 grid.
//
// Paths carry geometry only: every icon inherits its colour from the element
// around it via currentColor, and its size from the stylesheet, so no colour or
// pixel value is spelled out here.

import { svgEl } from './dom';

const BOX = 24;

/** Path data only. Colour and size come from CSS. */
const paths = {
  /** Hard hat: sitework. */
  hardHat: 'M4 17h16M6 17a6 6 0 0 1 12 0M10 7.4V6a2 2 0 0 1 4 0v1.4',
  /** I-beam seen end-on: structure. */
  beam: 'M6 5h12M6 19h12M12 5v14M8.5 5v0M15.5 19v0',
  /** Bolt: electrical. */
  bolt: 'M13 3 6 13h5l-1 8 7-10h-5z',
  /** Trapped waste pipe: plumbing. */
  pipe: 'M7 4v7a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v1M5 4h4M15 20h4',
  /** Extinguisher: fire protection. */
  extinguisher: 'M9 9h6v11H9zM10 9V7a2 2 0 0 1 4 0v2M15 6h2.5M12 4v3',

  /** Clipboard: the inspector. */
  clipboard: 'M8 4h8v3H8zM6 6h2M16 6h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1',
  clipboardTick: 'M9 13.5l2 2 4-4.5',
  clipboardCross: 'M9.5 11.5l5 5M14.5 11.5l-5 5',
  clipboardDash: 'M9 14h6',

  /** Price tag: a price-driven client. */
  tag: 'M4 12.5 12.5 4H20v7.5L11.5 20z M16.2 7.8v0',
  /** Ribbon: a record-driven client. */
  ribbon: 'M12 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10M9 13.5 7.5 21l4.5-2.5 4.5 2.5-1.5-7.5',
  /** Clock: a schedule-driven client. */
  clock: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 7.5V12l3 2',

  /** Speaker, with and without waves. */
  speaker: 'M4 9.5h3.5L12 6v12L7.5 14.5H4z',
  speakerWaves: 'M15.5 9.8a3.5 3.5 0 0 1 0 4.4M18 7.6a7 7 0 0 1 0 8.8',
  speakerMuted: 'M15.5 10l4 4M19.5 10l-4 4',
  gear: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6',

  /*
   * The crane behind the title, drawn the way one actually stands: a latticed
   * mast on the right, the jib reaching left across the sheet, a short
   * counter-jib and its weight behind, and the hook hanging off the trolley.
   */
  craneMast: 'M84 92V20M92 92V20M84 27l8 7M92 27l-8 7M84 41l8 7M92 41l-8 7'
    + 'M84 55l8 7M92 55l-8 7M84 69l8 7M92 69l-8 7M84 83l8 7M92 83l-8 7',
  craneHead: 'M84 20 88 7 92 20',
  craneJib: 'M10 20h96',
  cranePendant: 'M88 7 16 20M88 7 104 20',
  craneWeight: 'M97 20h9v8h-9z',
  craneHoist: 'M34 20v15M28 35h12v9H28z',
  craneGround: 'M0 92h116',
} as const;

export type IconName = keyof typeof paths;

/** Builds one icon. `className` decides its colour and size. */
export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  return iconOf([paths[name]], className);
}

/** Several strokes in one icon, for the inspector marks over a clipboard. */
export function iconStack(names: IconName[], className = 'icon'): SVGSVGElement {
  return iconOf(names.map((name) => paths[name]), className);
}

function iconOf(data: string[], className: string): SVGSVGElement {
  const svg = svgEl('svg', {
    class: className,
    viewBox: `0 0 ${BOX} ${BOX}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const d of data) svg.append(svgEl('path', { d }));
  return svg;
}

const subIcons: Record<string, IconName> = {
  sitework: 'hardHat',
  structure: 'beam',
  electrical: 'bolt',
  plumbing: 'pipe',
  fire: 'extinguisher',
};

export function subIcon(subId: string): SVGSVGElement {
  return icon(subIcons[subId] ?? 'hardHat', 'icon sub-icon');
}

const traitIcons: Record<string, IconName> = {
  price: 'tag',
  track: 'ribbon',
  schedule: 'clock',
};

export function traitIcon(traitId: string): SVGSVGElement {
  return icon(traitIcons[traitId] ?? 'tag', 'icon');
}

/** Lenient passes it, strict marks it up, standard just notes it. */
const inspectorMarks: Record<string, IconName> = {
  lenient: 'clipboardTick',
  normal: 'clipboardDash',
  strict: 'clipboardCross',
};

export function inspectorIcon(inspectorId: string): SVGSVGElement {
  const mark = inspectorMarks[inspectorId] ?? 'clipboardDash';
  return iconStack(['clipboard', mark], `icon inspector-${inspectorId}`);
}

export function soundIcon(on: boolean): SVGSVGElement {
  return iconStack(
    on ? ['speaker', 'speakerWaves'] : ['speaker', 'speakerMuted'],
    'icon',
  );
}

/** Order 011 §7: the settings gear in the HUD. */
export function gearIcon(): SVGSVGElement {
  return iconStack(['gear'], 'icon');
}

/** The crane silhouette behind the title screen, on its own larger grid. */
export function craneSilhouette(className = 'title-crane'): SVGSVGElement {
  const svg = svgEl('svg', {
    class: className,
    viewBox: '0 0 116 98',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const parts = [
    'craneGround', 'craneMast', 'craneHead', 'craneJib', 'cranePendant', 'craneWeight', 'craneHoist',
  ] as const;
  for (const key of parts) {
    svg.append(svgEl('path', { class: key === 'craneHoist' ? 'title-crane-load' : '', d: paths[key] }));
  }
  return svg;
}

/**
 * The favicon, generated rather than shipped as a file: a hard hat on a
 * concrete square. Written as a data URL so the build stays one HTML file
 * plus assets with nothing else to fetch.
 */
export function faviconDataUrl(bg: string, stroke: string): string {
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">` +
    `<rect width="${BOX}" height="${BOX}" rx="5" fill="${bg}"/>` +
    `<path d="${paths.hardHat}" fill="none" stroke="${stroke}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}
