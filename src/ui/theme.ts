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
  /** How many floors deep the band a roof picture sits in is. */
  roofArtFloors: 0.9,
  roofInset: 5,
  parapetHeight: 2.5,

  /** Tower crane, standing to the right of the building. */
  craneX: 143,
  craneBaseWidth: 18,
  /** How wide the crane tower picture stands, whatever the mast's height. */
  craneArtWidth: 15,
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
  /** The inspector's other verdict. */
  badgeCross: 'M -3 -3 L 3 3 M 3 -3 L -3 3',

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
  /** How far below the screen's middle the title crane's top must stay. */
  titleCraneClearPx: 190,

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

  /** Guided tour: the gap the spotlight leaves around what it is lighting. */
  spotlightPad: 8,
  /** Below this much room under the target, the caption goes above it. */
  spotCaptionRoom: 150,
  tooltipMaxWidth: 260,
  tooltipOffset: 8,
  infoDot: 13,
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
  /** Guided tour dwell times. */
  guideCashMs: 1500,
  /** T2 shows the site starting before handing over to the cash figure. */
  guideStartMs: 3000,
  /** Floor on a teaching step, so a fast game cannot blink it past. */
  guideHoldMs: 2600,
  guideToastGraceMs: 400,
  guideHandoverMs: 2000,
  guideSubsMs: 3000,
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

/**
 * The scene: the site is the screen, and everything else sits over it.
 *
 * Order 008 turns the layout inside out. These are the proportions that make
 * one set of numbers describe a one-storey house and an eight-storey block on
 * the same ground line: every floor is the same tile, and one scale factor
 * (derived from `referenceFloors` filling `maxBuildingRatio` of the viewport)
 * sizes every building in the row.
 */
const scene = {
  /**
   * Where the ground line sits, as a fraction of the scene's height. It has
   * to clear the site card that opens below it, or the card would cover the
   * very thing it describes.
   */
  groundRatio: 0.78,
  /**
   * A block of `referenceFloors` fills this much of the room between the HUD
   * and the ground line. With the ground line at 0.78 that comes out at about
   * 70% of the window, which is what order 008 §2 asks for. The crane rises
   * past it into the HUD band, which is translucent on purpose.
   */
  maxBuildingRatio: 1,
  referenceFloors: 8,
  /**
   * The camera (order 009 §6). A house fills this much of the window; a block
   * of `referenceFloors` fills the room above the ground; the sky above the
   * tallest building never takes more than `maxSkyShare`; a change of framing
   * takes `zoomMs`.
   */
  houseShare: 0.38,
  maxSkyShare: 0.5,
  zoomMs: 1000,
  /** The band at the top the HUD sits in, kept clear of the skyline. */
  hudRoomPx: 56,
  /** Below this the scene stops shrinking and the row scrolls instead. */
  minPlotWidthPx: 210,
  /** An empty lot is a hoarding, not a building: it needs less room. */
  lotWidthRatio: 0.62,
  plotGapPx: 24,
  /** How much of the scene an open drawer may never take (order 008 §1). */
  sceneVisibleWithDrawer: 0.34,
  /** How much of the window the selected site's numbers may take. */
  detailMaxRatio: 0.22,
  /** ...and how much of that they keep while a drawer is open. */
  detailOpenRatio: 0.55,

  tabBarHeight: 52,
  hudChipGap: 8,
  hudPadY: 6,
  hudPadX: 10,

  /** Empty lot: fence posts and the sign that sells the slot. */
  fenceHeight: 34,
  fencePostGap: 22,
  fencePostWidth: 2,
  fenceRailOffset: 8,
  /** Skyline silhouettes behind the site. */
  skylineFarCount: 16,
  skylineNearCount: 13,
  skylineFarHeight: 0.26,
  skylineNearHeight: 0.3,
  skylineSeed: 1973,
  /** The drawn skylines' own boxes, when there is no picture for them. */
  skylineViewHeight: { far: 42, near: 56 },
  fenceViewWidth: 128,
  /** How tall the ground picture is laid, from its top to the bottom edge. */
  groundArtHeightPx: 220,

  /** How long one frame of a two-frame walk is held. */
  stepFrameMs: 260,

  /** Street-level life, in the building's own viewBox units. */
  workerHeight: 9,
  workerMin: 3,
  workerMax: 6,
  workerFloorsPerExtra: 2,
  workerStepMs: 520,
  workerWalkMs: 9000,
  truckWidth: 44,
  truckHeight: 17,
  truckEnterMs: 2600,
  truckStayMs: 5200,
  truckLeaveMs: 2400,
  inspectorHeight: 10,
  inspectorWalkMs: 2400,
  inspectorStayMs: 3600,
  bubbleSize: 13,

  /** The lot sign only redraws when cash moves in round figures. */
  signRedrawStep: 1000,

  /** How many times a failed floor blinks. */
  failBlinks: 3,
  /** How bright the handover flash gets, as an opacity. */
  flashOpacity: 0.55,
  /** How far the crew throws its arms up. */
  cheerArmDeg: -40,

  /** The weather layer's own box. Bigger box, smaller-looking drops. */
  weatherBox: 420,
  weatherDropFactor: 6,

  /** Money flying home. */
  coinCount: 4,
  coinRadius: 7,
  coinFlightMs: 900,
  coinStaggerMs: 110,

  /** Handover. */
  celebrateMs: 1500,
  flagWidth: 12,
  flagHeight: 8,
  flagPoleHeight: 16,
} as const;

/**
 * Four minutes of real time carry the site from morning to night. Each phase
 * is a flat set of colours with a slow transition between them, so the sky
 * never needs colour arithmetic at runtime.
 */
const daylight = {
  cycleMs: 240_000,
  /** How long the sky takes to cross from one phase to the next. */
  blendMs: 9000,
  phases: ['morning', 'day', 'evening', 'night'] as const,
  morning: {
    skyTop: '#2b3c52',
    skyBottom: '#7d6a55',
    haze: 'rgba(255, 206, 150, 0.16)',
    ground: '#332b1d',
    shadow: '-0.7',
    windows: 'rgba(111, 157, 196, 0.25)',
  },
  day: {
    skyTop: '#2d4a68',
    skyBottom: '#6d8ba6',
    haze: 'rgba(255, 255, 255, 0.07)',
    ground: '#3a3122',
    shadow: '-0.25',
    windows: 'rgba(111, 157, 196, 0.18)',
  },
  evening: {
    skyTop: '#2a2a44',
    skyBottom: '#8a5a44',
    haze: 'rgba(255, 158, 92, 0.2)',
    ground: '#302618',
    shadow: '0.6',
    windows: 'rgba(245, 197, 24, 0.45)',
  },
  night: {
    skyTop: '#0d1219',
    skyBottom: '#1b2531',
    haze: 'rgba(90, 160, 224, 0.08)',
    ground: '#1e1a12',
    shadow: '0.2',
    windows: 'rgba(245, 197, 24, 0.85)',
  },
} as const;

export type DaylightPhase = (typeof daylight.phases)[number];

export const theme = {
  /** Ad buttons exist but stay hidden until there is an SDK behind them. */
  adHooksEnabled: false,

  /**
   * Image slots on or off (order 009 decision A). Off, every slot draws
   * itself as vectors whatever src/ui/art-files.ts lists - the switch the
   * deployed build uses while the art is finished on its own branch.
   */
  artEnabled: true,

  /** Sound ships muted; the player turns it on. */
  soundDefaultOn: false,
  /**
   * Cues sit under the game, not on top of it. Order 005 fixes this at 0.4
   * because the pack was chosen by filename, not by ear.
   */
  soundVolume: 0.4,

  color,
  size,
  svg,
  scene,
  daylight,
  font,
  layout,
  motion,
  easing,
} as const;

export type Theme = typeof theme;
