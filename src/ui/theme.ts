// Every colour, size and shape the UI draws with. No image files: the building
// is drawn from rectangles so it can be swapped for real art later without
// touching layout code.

export const theme = {
  /** Ad buttons exist but stay hidden until there is an SDK behind them. */
  adHooksEnabled: false,

  color: {
    bg: '#12151a',
    panel: '#1b1f27',
    panelRaised: '#232833',
    border: '#2e3541',
    text: '#e7ecf3',
    textDim: '#8e99a9',
    textFaint: '#5d6775',

    accent: '#f0a020',
    accentText: '#1a1205',
    good: '#4fbf6a',
    bad: '#e05c4a',
    warn: '#e0a92c',
    info: '#4a9be0',

    /** Floor states, drawn on the building canvas. */
    floorWaiting: '#262c36',
    floorStructure: '#7a6a4a',
    floorStructureGate: '#c59a3a',
    floorServices: '#3f6a86',
    floorServicesGate: '#4a9be0',
    floorDone: '#4fbf6a',

    bandWaiting: '#262c36',
    bandActive: '#c59a3a',
    bandDone: '#4fbf6a',

    sky: '#171b22',
    ground: '#2a2118',
  },

  size: {
    radius: 8,
    radiusSmall: 5,
    gap: 12,
    gapSmall: 6,
    pad: 14,
    barHeight: 8,
    /** Building canvas geometry, in CSS pixels before device scaling. */
    canvasWidth: 168,
    /** Cap on screen so a wide column does not blow the building up. */
    canvasMaxWidth: 210,
    canvasHeight: 190,
    floorGap: 2,
    bandHeight: 10,
    minFloorHeight: 7,
    maxFloorHeight: 20,
    touchTarget: 44,
  },

  font: {
    stack: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    mono: "'SF Mono', 'Roboto Mono', ui-monospace, monospace",
    tiny: '11px',
    small: '12px',
    body: '13px',
    title: '15px',
    big: '19px',
  },

  layout: {
    /** Below this width the two columns stack. */
    twoColumnMinWidth: 900,
    maxWidth: 1180,
  },

  motion: {
    toastMs: 2600,
    bidResultMs: 1500,
    /** Below this, coming back is not worth a screen of its own. */
    offlineModalMinSec: 60,
  },
} as const;

export type Theme = typeof theme;
