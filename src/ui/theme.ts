// Every colour, size, duration and shape the UI draws with.
//
// Nothing else in src/ui may hold a colour or a pixel literal. Art is drawn as
// inline SVG from the geometry tokens below, so a retheme happens here alone.

/**
 * Construction-site palette. Concrete grey carries the screen, hard-hat yellow
 * is the only accent, and blueprint blue marks anything numeric.
 */
const color = {
  // Concrete, from the deepest shadow up to the light that falls on a form.
  bg: '#191b1d',
  panel: '#212427',
  panelRaised: '#292d31',
  panelSunk: '#141618',
  border: '#383d43',
  borderBright: '#4a5058',

  text: '#e9ebed',
  textDim: '#9aa2a9',
  textFaint: '#6c747c',

  /** Hard-hat yellow. The only accent: if it is yellow, it wants a decision. */
  accent: '#f5c518',
  accentDim: '#a8880f',
  accentText: '#1b1503',

  /** Blueprint blue, for figures and drawn information. */
  blueprint: '#5aa0e0',
  blueprintDim: '#2c4a66',
  blueprintLine: 'rgba(90, 160, 224, 0.13)',
  blueprintPaper: '#1c2733',

  good: '#4eb56c',
  goodDim: '#2b6b40',
  warn: '#e8871e',
  warnDim: '#8a4f12',
  bad: '#e04a3c',
  badDim: '#7d2a22',

  /** Steel and material, for the building itself. */
  steel: '#8b949c',
  steelDark: '#5b636a',
  concrete: '#6e757c',
  concreteLit: '#878e95',
  glass: '#3d5b73',
  glassLit: '#6f9dc4',
  rebar: '#a8733f',

  sky: '#151a20',
  skyRain: '#0e151d',
  ground: '#2a2419',
  groundLine: '#4a4030',
  rain: 'rgba(186, 216, 242, 0.85)',

  crane: '#d8a42a',
  craneDark: '#8e6c1a',
  craneCable: '#6b7278',

  /** Translucent layers, kept here so a retheme moves them too. */
  overlay: 'rgba(8, 10, 12, 0.74)',
  scrim: 'rgba(20, 22, 25, 0.93)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  shadowStrong: 'rgba(0, 0, 0, 0.6)',
  hintBg: 'rgba(245, 197, 24, 0.08)',
  hintBorder: 'rgba(245, 197, 24, 0.32)',
  goodBg: 'rgba(78, 181, 108, 0.12)',
  badBg: 'rgba(224, 74, 60, 0.12)',
  warnBg: 'rgba(232, 135, 30, 0.12)',
  accentGlow: 'rgba(245, 197, 24, 0.22)',
  transparent: 'transparent',
} as const;

/**
 * The building drawing, in its own SVG coordinate space. The viewBox is a
 * fixed width and a height that follows the floor count, so one set of numbers
 * describes every project from a one-storey house to an eight-storey block.
 */
const svg = {
  /** viewBox width. Everything below is in these units. */
  width: 170,

  /** Ground and foundation. */
  groundY: 10,
  groundStroke: 1.4,
  foundationHeight: 11,
  foundationOverhang: 7,

  /** The building body. */
  bodyLeft: 36,
  bodyRight: 118,
  floorHeight: 15,
  floorGap: 1.5,
  minFloorHeight: 8,
  maxFloorHeight: 24,
  wallStroke: 1,
  gridStroke: 0.6,
  gridDash: '3 3',
  steelStroke: 1.6,
  serviceStroke: 1,
  serviceDash: '2 2.5',

  /** Windows on a finished floor. */
  windowCount: 3,
  /** A short block gets taller floors so it still reads as a building. */
  floorHeightBonus: 4,
  windowInsetX: 7,
  windowInsetY: 3.5,
  windowGap: 5,
  windowRadius: 0.8,

  /** Weatherproofing wraps the body; fit-out caps it. */
  envelopeInset: 2.6,
  envelopeStroke: 2,
  roofHeight: 7,
  roofInset: 5,
  parapetHeight: 2.5,

  /** Tower crane, standing to the right of the building. */
  craneX: 143,
  craneBaseWidth: 18,
  craneBaseHeight: 5,
  mastWidth: 7,
  mastRungGap: 7,
  mastStroke: 1.5,
  jibLength: 96,
  jibBack: 22,
  jibHeight: 5,
  jibStroke: 1.6,
  cabSize: 6,
  hookTrolleyFrom: 0.42,
  hookTrolleyTo: 0.86,
  hookLineStroke: 0.9,
  hookSize: 3.4,
  loadSize: 7,
  /** How far the mast rises above the topmost floor. */
  craneHeadroom: 26,
  craneMinHeight: 52,

  /** Punch dots ride above the roof. */
  punchRadius: 3.2,
  punchGap: 8.5,
  punchRowY: 5,
  punchMax: 10,

  /** The pass badge that pops on an inspected part. */
  badgeRadius: 9,
  badgeStroke: 1.8,
  badgeTick: 'M -3.6 0.2 L -1.2 2.8 L 3.8 -2.8',

  /** Rain. */
  rainDrops: 26,
  rainLength: 14,
  rainStroke: 1.9,

  /** Headroom above the crane so nothing is clipped. */
  topPad: 6,
} as const;

const size = {
  hairline: 1,
  radius: 8,
  radiusSmall: 5,
  radiusTiny: 3,
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
  barHeightThin: 5,
  gaugeHeight: 6,
  gaugeWidth: 54,

  /** The building drawing on screen. Width is capped so a wide column
   *  does not blow the building up; height follows the floor count. */
  canvasMaxWidth: 240,
  canvasMinWidth: 150,

  touchTarget: 44,
  touchTargetSmall: 36,
  iconSize: 15,
  iconSizeLarge: 20,
  iconSizeTitle: 132,

  pageBottomPad: 64,
  statMinWidth: 112,
  siteMinWidth: 280,
  siteGridBreakpoint: 640,
  emptyLotMinHeight: 200,
  spinner: 18,
  strokeThin: 2,
  accentBar: 3,
  toastBar: 4,
  logMaxHeight: 220,
  toastOffset: 18,
  panelMaxWidth: 430,
  swatch: 9,
  shadowBlur: 18,
  shadowDrop: 6,
  shadowBlurStrong: 32,
  riseOffset: 8,
  slideOffset: 14,
  floatRise: 34,
  shakeOffset: 6,
  tagPadX: 7,
  tagPadY: 2,
  tierPadY: 8,
  notePadX: 9,
  listRowPadY: 7,
  toastPadX: 12,
  toastPadY: 10,
  loadingGap: 10,
  skeletonHeights: [64, 200, 120] as readonly number[],

  /** Blueprint grid on RFQ cards. */
  blueprintGrid: 14,
  blueprintGridStroke: 1,

  titleGap: 22,
  titleButtonMinWidth: 200,
} as const;

const font = {
  /** System stack only. No web font is downloaded: it would cost load time. */
  stack:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  tiny: '11px',
  small: '12px',
  body: '13px',
  title: '15px',
  big: '19px',
  huge: '30px',
  display: '40px',
} as const;

const layout = {
  /** Below this width the two columns stack. */
  twoColumnMinWidth: 900,
  maxWidth: 1180,
  /** The order's mobile target. */
  mobileWidth: 390,
} as const;

/**
 * Durations and the motion switch. Everything animated reads from here, so
 * `motionEnabled: false` (or the player's reduced-motion setting, or a run of
 * dropped frames) silences the whole screen at once.
 */
const motion = {
  /** Master switch. The stylesheet and every animation honour it. */
  motionEnabled: true,

  toastMs: 2600,
  bidResultMs: 1500,
  offlineModalMinSec: 60,

  /** Numbers never jump: they tween. */
  tweenMs: 800,
  tweenMsFast: 320,

  floorRiseMs: 200,
  badgePopMs: 300,
  badgeHoldMs: 700,
  shakeMs: 400,
  flashMs: 600,
  floatMs: 1100,
  slideInMs: 240,
  slideOutMs: 200,
  punchPopMs: 320,
  craneTurnMs: 20000,
  craneSwayMs: 3400,
  craneLiftMs: 4200,
  rainMs: 900,
  blinkMs: 1400,
  blinkFastMs: 900,
  spinMs: 800,
  titleFadeMs: 420,
  /** Small interface reactions: hover tint, button press, bar growth. */
  hoverMs: 120,
  pressMs: 80,
  barMs: 200,
  sweepMs: 1200,

  /** Deadline styling switches here, per the order: 20% left. */
  deadlineWarnRatio: 0.2,

  /**
   * Frame-rate guard. If the loop spends `budgetFrames` consecutive frames
   * slower than `slowFrameMs`, decoration is dropped until it recovers.
   */
  slowFrameMs: 24,
  budgetFrames: 45,
  recoverFrames: 120,
} as const;

const easing = {
  /** Overshoots a little, then settles: used for a floor topping out. */
  bounce: 'cubic-bezier(.34, 1.56, .64, 1)',
  out: 'cubic-bezier(.22, .61, .36, 1)',
  inOut: 'cubic-bezier(.65, .05, .36, 1)',
  linear: 'linear',
} as const;

export const theme = {
  /** Ad buttons exist but stay hidden until there is an SDK behind them. */
  adHooksEnabled: false,

  /** Sound ships muted; the player turns it on. */
  soundDefaultOn: false,

  color,
  size,
  svg,
  font,
  layout,
  motion,
  easing,
} as const;

export type Theme = typeof theme;
