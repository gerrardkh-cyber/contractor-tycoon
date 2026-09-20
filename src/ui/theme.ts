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

    /** Translucent layers. Kept here so a retheme moves them with everything else. */
    overlay: 'rgba(8, 10, 13, 0.72)',
    scrim: 'rgba(18, 21, 26, 0.93)',
    shadow: 'rgba(0, 0, 0, 0.4)',
    hintBg: 'rgba(240, 160, 32, 0.08)',
    hintBorder: 'rgba(240, 160, 32, 0.30)',
  },

  size: {
    hairline: 1,
    radius: 8,
    radiusSmall: 5,
    radiusPill: 99,
    gap: 12,
    gapSmall: 6,
    gapTiny: 3,
    pad: 14,
    padSmall: 9,
    padTight: 7,
    padCell: 4,
    padModal: 20,
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
    /** Building canvas insets, in the canvas's own coordinate space. */
    buildingMargin: 16,
    buildingGround: 6,
    foundationOverhang: 4,
    roofInset: 10,
    capInset: 2,

    touchTarget: 44,
    touchTargetSmall: 34,

    /** Layout stops and accents used by the stylesheet. */
    pageBottomPad: 64,
    statMinWidth: 112,
    siteMinWidth: 260,
    siteGridBreakpoint: 620,
    emptyLotMinHeight: 180,
    spinner: 18,
    strokeThin: 2,
    accentBar: 3,
    toastBar: 4,
    logMaxHeight: 220,
    toastOffset: 18,
    panelMaxWidth: 420,
    swatch: 9,
    shadowBlur: 18,
    shadowDrop: 6,
    riseOffset: 8,
    tagPadX: 7,
    tagPadY: 2,
    tierPadY: 8,
    notePadX: 9,
    listRowPadY: 7,
    toastPadX: 12,
    toastPadY: 10,
    loadingGap: 10,
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
