// The stylesheet, built from theme.ts and injected once.
//
// Kept in code so the theme stays the single source of colour and size, and so
// the build stays one index.html plus assets with no stylesheet to fetch.
//
// Motion rule: everything animated uses transform and opacity only, so nothing
// here can force the page to lay out again. When <html> carries `no-motion`
// (reduced-motion, the theme switch, or a run of dropped frames) every
// animation and transition is cut at the end of the file.

import { theme } from './theme';

export function injectStyles(): void {
  const css = [base(), scene(), building(), panels(), animations()].join('\n');
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
}

function base(): string {
  const { color: c, size: s, font: f, motion: m, easing } = theme;
  return `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  background:${c.bg};color:${c.text};font-family:${f.stack};font-size:${f.body};
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
#app{min-height:100%;margin:0;padding:0}
body{overflow:hidden}
h1,h2,h3{margin:0;font-weight:600}
button{font:inherit;color:inherit}

/* Rain drains the colour out of the whole screen while it falls. */
#app{transition:filter ${m.flashMs}ms ${easing.out}}
#app.is-wet{filter:saturate(.6) brightness(.94)}

.icon{
  width:${s.iconSize}px;height:${s.iconSize}px;flex:0 0 auto;
  fill:none;stroke:currentColor;stroke-width:${s.strokeThin};
  stroke-linecap:round;stroke-linejoin:round;
}
.icon-large{width:${s.iconSizeLarge}px;height:${s.iconSizeLarge}px}
.icon-row{display:inline-flex;align-items:center;gap:${s.gapSmall}px;min-width:0}
.inspector-lenient{color:${c.good}}
.inspector-normal{color:${c.textDim}}
.inspector-strict{color:${c.bad}}

.skeleton{display:flex;flex-direction:column;gap:${s.gap}px;padding:${s.gap}px}
.skeleton-block{
  background:${c.panel};border:${s.hairline}px solid ${c.border};border-radius:${s.radius}px;
  position:relative;overflow:hidden;
}
.skeleton-block::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,${c.transparent},${c.panelRaised},${c.transparent});
  transform:translateX(-100%);animation:sweep ${m.sweepMs}ms ${easing.inOut} infinite;
}

.bar{background:${c.panelSunk};border-radius:${s.radiusPill}px;height:${s.barHeight}px;overflow:hidden}
.bar-fill{
  background:${c.accent};height:100%;width:100%;transform-origin:left center;transform:scaleX(0);
  transition:transform ${m.barMs}ms ${easing.linear};
}
.bar-fill.trust{background:${c.blueprint}}
.bar-fill.good{background:${c.good}}
.bar.thin{height:${s.barHeightThin}px}

.gauge{
  background:${c.panelSunk};border:${s.hairline}px solid ${c.border};border-radius:${s.radiusPill}px;
  height:${s.gaugeHeight}px;width:${s.gaugeWidth}px;overflow:hidden;flex:0 0 auto;
}
.gauge-fill{
  background:${c.accent};height:100%;width:100%;transform-origin:left center;transform:scaleX(0);
  transition:transform ${m.tweenMsFast}ms ${easing.out};
}

`;
}

/** The site drawing: floors, envelope, crane, weather, punch dots, badges. */
/**
 * The scene: sky, city, ground, the row of sites, the weather over all of it.
 *
 * Order 008. The whole thing is one fixed layer behind the interface, and the
 * only numbers it needs are the ground line and the daylight phase - both set
 * as custom properties so a phase change is a colour transition, not a redraw.
 */
function scene(): string {
  const { color: c, size: s, font: f, motion: m, easing, scene: sc, daylight: d } = theme;
  const phase = (id: keyof typeof d.morning extends never ? never : 'morning' | 'day' | 'evening' | 'night'): string => {
    const p = d[id];
    return `.scene[data-phase="${id}"]{
  --sky-top:${p.skyTop};--sky-bottom:${p.skyBottom};--haze:${p.haze};
  --ground-col:${p.ground};--window-lit:${p.windows};--shadow-x:${p.shadow};
}`;
  };

  return `
.scene{
  position:fixed;inset:0;z-index:0;overflow:hidden;
  --ground:${(sc.groundRatio * 100).toFixed(1)}%;
  transition:none;
  --sky-top:${d.day.skyTop};--sky-bottom:${d.day.skyBottom};--haze:${d.day.haze};
  --ground-col:${d.day.ground};--window-lit:${d.day.windows};--shadow-x:${d.day.shadow};
}
${phase('morning')}
${phase('day')}
${phase('evening')}
${phase('night')}

.scene-sky{
  position:absolute;left:0;right:0;top:0;height:var(--ground);
  background:linear-gradient(180deg,var(--sky-top),var(--sky-bottom));
  transition:background ${d.blendMs}ms ${easing.inOut};
}
.scene-sky::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(180deg,${c.transparent},var(--haze));
  transition:background ${d.blendMs}ms ${easing.inOut};
}
.scene-skyline{
  position:absolute;left:0;width:100%;bottom:calc(100% - var(--ground));
  display:block;pointer-events:none;
}
.scene-skyline.is-far{height:${(sc.skylineFarHeight * 100).toFixed(0)}%;opacity:.35}
.scene-skyline.is-near{height:${(sc.skylineNearHeight * 100).toFixed(0)}%;opacity:.55}
.scene-skyline .skyline-block{fill:${c.panelSunk};stroke:${c.bg};stroke-width:.5}
.scene-skyline.is-near .skyline-block{fill:${c.panelSunk}}
.scene[data-phase="night"] .scene-skyline.is-far{opacity:.3}

/* The site card opens under the scene, so the ground line comes up to meet
   it rather than letting it cover the building it describes. */
#app.has-detail .scene{
  --ground:calc(100% - ${(sc.detailMaxRatio * 100).toFixed(1)}% - ${sc.tabBarHeight + sc.plotGapPx}px);
}
.scene-ground,.scene-row,.scene-skyline{
  transition:top ${m.slideInMs * 2}ms ${easing.out},bottom ${m.slideInMs * 2}ms ${easing.out};
}
.scene-ground{
  position:absolute;left:0;right:0;top:var(--ground);bottom:0;
  background:linear-gradient(180deg,var(--ground-col),${c.bg});
  border-top:${s.hairline * 2}px solid ${c.groundLine};
  transition:background ${d.blendMs}ms ${easing.inOut};
}
.scene-ground::after{
  content:'';position:absolute;left:0;right:0;top:0;height:${s.gap}px;
  background:linear-gradient(180deg,${c.shadow},${c.transparent});opacity:.5;
}

.scene-row{
  position:absolute;left:0;right:0;bottom:calc(100% - var(--ground));
  display:flex;align-items:flex-end;justify-content:flex-start;gap:${sc.plotGapPx}px;
  padding:0 ${sc.plotGapPx}px;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x proximity;scrollbar-width:none;
}
/* Centres the row when it fits and leaves the first site reachable when it
   does not, which a centred justify-content would not. */
.scene-row::before,.scene-row::after{content:'';flex:1 1 auto}
.scene-row::-webkit-scrollbar{display:none}

.plot{
  position:relative;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;
  scroll-snap-align:center;cursor:pointer;
}
.plot .building{display:block;width:100%;height:auto}
.plot .actors{position:absolute;left:0;bottom:0;width:100%;height:100%;pointer-events:none}
.plot::before{
  content:'';position:absolute;bottom:0;left:50%;width:62%;height:${s.gapSmall}px;
  border-radius:50%;background:${c.shadow};opacity:.55;
  transform:translateX(calc(-50% + var(--shadow-x,0) * 22%)) scaleX(1.1);
  transition:transform ${d.blendMs}ms ${easing.inOut};
}
.plot::after{
  content:'';position:absolute;left:4%;right:4%;bottom:0;height:${s.hairline * 3}px;
  background:${c.accent};opacity:0;transition:opacity ${m.flashMs}ms ${easing.out};
}
.plot.is-selected::after{opacity:.5}
/* Handed over: the building stays long enough to be cheered, then goes. */
.plot.is-leaving{pointer-events:none}
.plot.is-leaving .actors{opacity:.6;transition:opacity ${m.slideInMs}ms ${easing.out}}

.plot.is-empty{
  flex-direction:column;align-items:center;justify-content:flex-end;gap:0;cursor:default;
}
.plot-fence{display:block;width:100%;height:${sc.fenceHeight}px;opacity:.8}
.plot-fence .fence-post,.plot-fence .fence-rail{stroke:${c.steelDark}}
.plot.is-empty .empty-lot{
  width:100%;min-height:0;order:-1;margin-bottom:0;gap:${s.gapTiny}px;
  padding:${s.padSmall}px;font-size:${f.small};
  background:${c.panel};border:${s.hairline}px solid ${c.border};
  border-bottom:0;border-radius:${s.radius}px ${s.radius}px 0 0;
}
.plot.is-empty .slot-title{font-size:${f.body}}
.plot.is-empty .btn{padding:${s.gapTiny}px ${s.gapSmall}px}

.scene-weather{
  position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;
  transition:opacity ${m.flashMs * 2}ms ${easing.out};
}
.scene-weather line{stroke:${c.rain};opacity:.5}
.scene.is-raining .scene-weather{opacity:1}
.scene.is-raining .scene-sky{filter:saturate(.5) brightness(.75)}
.scene.is-raining .scene-weather line{animation:rainfall ${m.rainMs}ms ${easing.linear} infinite}

.scene-coins{position:absolute;inset:0;pointer-events:none}
.coin{
  position:absolute;width:${sc.coinRadius * 2}px;height:${sc.coinRadius * 2}px;border-radius:50%;
  background:${c.accent};box-shadow:0 0 ${s.gapSmall}px ${c.accentGlow};
  animation:coin-fly ${sc.coinFlightMs}ms ${easing.inOut} forwards;
}

/* ---- the crew ---------------------------------------------------- */
.actors .actor-body line{stroke:${c.steel};stroke-width:1.1;stroke-linecap:round}
.actors .actor-hat{fill:${c.accent}}
.actors .actor-body .actor-arm{stroke:${c.steel}}
.actors .actor-body .actor-torso{stroke:${c.blueprint}}
.actors .actor-legs.is-b{opacity:0}
.actors .actor-walk{
  animation:walk-span 8s ${easing.inOut} infinite alternate;
  --walk-span:${(sc.workerHeight * 2.4).toFixed(1)}px;
}
.actors .actor-legs.is-a{animation:frame-a ${sc.stepFrameMs * 2}ms steps(1) infinite}
.actors .actor-legs.is-b{animation:frame-b ${sc.stepFrameMs * 2}ms steps(1) infinite}
.actors.is-resting .actor-walk,
.actors.is-resting .actor-legs{animation:none}
.actors.is-resting .actor-legs.is-b{opacity:0}
.actors.is-resting .worker .actor-body{transform:translateY(${sc.workerHeight * 0.35}px) scaleY(.72)}
/* Rain: the crew runs for the site office at the left and goes inside. */
.actors .worker{--to-hut:${(-sc.workerHeight * 4).toFixed(1)}px}
.actors.is-sheltering .worker .actor-walk{
  animation:none;transform:translateX(var(--to-hut,0));opacity:0;
}
.actors .worker .actor-walk{
  transition:opacity ${m.slideInMs}ms ${easing.out},transform ${m.slideInMs * 2}ms ${easing.out};
}
.actors .actor-arm{transform-box:fill-box;transform-origin:center}
.actors.is-cheering .actor-arm{transform:rotate(${sc.cheerArmDeg}deg)}
/* Rubbing out a punch item: the arm works, the figure stays put. */
.actors.is-fixing .is-climber .actor-walk{animation:none}
.actors.is-fixing .is-climber .actor-arm{
  animation:fix-arm ${sc.stepFrameMs * 2}ms ${easing.inOut} infinite alternate;
}
.actors .actor-hut .hut-body{fill:${c.panelRaised};stroke:${c.border}}
.actors .actor-hut .hut-door{fill:${c.panelSunk}}
.actors .actor-hut .hut-roof{stroke:${c.steel};stroke-width:1.2}

.actors .actor-truck{opacity:0;transform:translateX(${theme.svg.width}px)}
.actors .actor-truck.is-pouring{
  animation:truck-visit calc(var(--truck-enter) + var(--truck-stay) + var(--truck-leave)) ${easing.inOut} forwards;
}
.actors .truck-cab,.actors .truck-bed{fill:${c.crane}}
.actors .truck-drum{fill:${c.concreteLit};stroke:${c.steelDark};stroke-width:.8}
.actors .truck-wheel{fill:${c.panelSunk};stroke:${c.steelDark};stroke-width:.8}

.actors .actor-inspector{opacity:0}
.actors .actor-inspector.is-visiting{
  animation:inspector-visit calc(var(--walk-ms) * 2 + var(--stay-ms)) ${easing.inOut} forwards;
}
.actors .inspector-board{fill:${c.panel};stroke:${c.textDim};stroke-width:.7}
.actors .inspector-bubble{opacity:0;transform-box:fill-box;transform-origin:center}
.actors .actor-inspector.is-visiting .inspector-bubble{
  animation:bubble-pop calc(var(--walk-ms) * 2 + var(--stay-ms)) ${easing.out} forwards;
}
.actors .bubble-disc{fill:${c.panel};stroke:${c.border};stroke-width:.8}
.actors .bubble-mark{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.actors .is-pass .bubble-disc{stroke:${c.good}}
.actors .is-pass .bubble-mark{stroke:${c.good}}
.actors .is-fail .bubble-disc{stroke:${c.bad}}
.actors .is-fail .bubble-mark{stroke:${c.bad}}

/* ---- what floats over the scene ---------------------------------- */
.topbar{
  position:fixed;left:0;right:0;top:0;z-index:30;
  display:flex;flex-wrap:wrap;align-items:center;gap:${sc.hudChipGap}px;
  padding:${sc.hudPadY}px ${sc.hudPadX}px;margin:0;border:0;border-radius:0;
  background:linear-gradient(180deg,${c.scrim},${c.transparent});
}
.topbar .stat{
  flex:0 0 auto;flex-direction:row;align-items:baseline;gap:${s.gapSmall}px;
  background:${c.overlay};border:${s.hairline}px solid ${c.border};
  border-radius:${s.radiusPill}px;padding:${sc.hudPadY}px ${sc.hudPadX}px;
}
.topbar .stat-label{text-transform:none;letter-spacing:0}
.topbar .stat-value{font-size:${f.body}}
.topbar .bar{display:none}
.topbar-tools{margin-left:auto}

.detail-host{
  max-height:${(sc.detailMaxRatio * 100).toFixed(0)}vh;
  padding:0 ${s.gapSmall}px ${s.gapSmall}px;overflow:auto;pointer-events:none;
  transition:max-height ${m.slideInMs * 2}ms ${easing.out};
}
.detail-host > *{pointer-events:auto;max-width:${theme.layout.maxWidth}px;margin:0 auto}
/* With a drawer open the card gives way, but it never disappears: the rain
   decision and the punch list live in it. */
.drawers.is-open .detail-host{
  max-height:${(sc.detailMaxRatio * sc.detailOpenRatio * 100).toFixed(1)}vh;
}
.detail-host .site-card{
  background:${c.scrim};border-color:${c.borderBright};
  box-shadow:0 ${s.gapSmall}px ${s.gap}px ${c.shadow};
}
#app.drawer-open .scene-row{opacity:.85}

/* ---- drawers ------------------------------------------------------ *
 * Order 008 §1: an open drawer never takes the top of the scene. The sheet
 * gets what is left once the scene's share, the tab bar and the site card
 * have had theirs.
 */
.drawers{
  position:fixed;left:0;right:0;bottom:0;z-index:25;
  display:flex;flex-direction:column;justify-content:flex-end;pointer-events:none;
}
.drawers > *{pointer-events:auto}
.drawer-sheet{
  max-height:0;overflow:hidden;background:${c.scrim};
  border-top:${s.hairline}px solid ${c.border};
  transition:max-height ${m.slideInMs * 2}ms ${easing.out};
  /* Clipped is not closed: without this the board inside a shut drawer is
     still clickable and still in the tab order. */
  visibility:hidden;
}
.drawers.is-open .drawer-sheet{max-height:var(--drawer-max);overflow:auto;visibility:visible}
.drawer-panel{display:none;padding:${s.gapSmall}px;margin:0 auto;max-width:${theme.layout.maxWidth}px}
.drawer-panel.is-shown{display:block}
.tab-bar{
  display:flex;align-items:stretch;height:${sc.tabBarHeight}px;
  background:${c.panelRaised};border-top:${s.hairline}px solid ${c.border};
}
.tab{
  flex:1 1 0;border:0;background:${c.transparent};color:${c.textDim};
  font-size:${f.small};font-weight:600;cursor:pointer;
  border-top:${s.hairline * 2}px solid ${c.transparent};
  transition:color ${m.flashMs}ms ${easing.out},background ${m.flashMs}ms ${easing.out};
}
.tab:hover{color:${c.text};background:${c.panel}}
.tab.is-on{color:${c.accent};border-top-color:${c.accent};background:${c.panel}}
`;
}

function building(): string {
  const { color: c, svg: v, font: f, motion: m, easing } = theme;
  return `
.building{display:block;overflow:visible}

/* Foundation, envelope and roof each report their own stage. */
.bld-foundation{fill:${c.panelSunk};stroke:${c.steelDark};stroke-width:${v.wallStroke}}
.bld-foundation.is-active{fill:${c.rebar};stroke:${c.accent}}
.bld-foundation.is-done{fill:${c.concrete};stroke:${c.steel}}

.bld-envelope{fill:none;stroke:${c.transparent};stroke-width:${v.envelopeStroke}}
.bld-envelope.is-active{stroke:${c.accent};stroke-dasharray:${v.gridDash}}
.bld-envelope.is-done{stroke:${c.concreteLit}}

.bld-roof{opacity:.3}
.bld-roof.is-active,.bld-roof.is-done{opacity:1}
.bld-roof .roof-deck,.bld-roof .roof-parapet{fill:${c.panelSunk};stroke:${c.steelDark};stroke-width:${v.wallStroke}}
.bld-roof.is-active .roof-deck{fill:${c.accentDim};stroke:${c.accent}}
.bld-roof.is-active .roof-parapet{fill:${c.accentDim};stroke:${c.accent}}
.bld-roof.is-done .roof-deck{fill:${c.concrete};stroke:${c.steel}}
.bld-roof.is-done .roof-parapet{fill:${c.concreteLit};stroke:${c.steel}}

/* A floor shows exactly one of its five drawings. */
.bld-floor .floor-grid{fill:none;stroke:${c.steelDark}}
.bld-floor .floor-steel line{stroke:${c.rebar}}
.bld-floor .floor-steel{transform-box:fill-box;transform-origin:left center}
.bld-floor .floor-services line{stroke:${c.blueprint}}
.bld-floor .floor-wall-face{fill:${c.concrete};stroke:${c.steel}}
.bld-floor .floor-window{fill:${c.glass}}
.bld-floor .floor-gate{fill:none;stroke:${c.accent};opacity:0}

.bld-floor .floor-steel,.bld-floor .floor-services,.bld-floor .floor-wall{display:none}

.bld-floor.is-structure .floor-grid{opacity:.5}
.bld-floor.is-structure .floor-steel{display:block}

.bld-floor.is-structureGate .floor-steel{display:block}
.bld-floor.is-structureGate .floor-gate{opacity:1;animation:blink ${m.blinkMs}ms ${easing.inOut} infinite}

.bld-floor.is-services .floor-grid{opacity:.35}
.bld-floor.is-services .floor-steel{display:block;opacity:.55}
.bld-floor.is-services .floor-services{display:block}

.bld-floor.is-servicesGate .floor-steel{display:block;opacity:.55}
.bld-floor.is-servicesGate .floor-services{display:block}
.bld-floor.is-servicesGate .floor-gate{opacity:1;animation:blink ${m.blinkMs}ms ${easing.inOut} infinite}

.bld-floor.is-done .floor-grid{display:none}
.bld-floor.is-done .floor-wall{display:block}
.bld-floor.is-done .floor-window{fill:${c.glassLit}}

/* Topping out: the floor rises the last of the way and settles. */
.bld-floor.is-rising{animation:floor-rise ${m.floorRiseMs}ms ${easing.bounce}}

/* Tower crane. The jib swings a full turn; the hoist sways under it. */
.bld-crane line{stroke:${c.crane};fill:none}
.bld-crane .crane-base{fill:${c.craneDark}}
.bld-crane .crane-rung{stroke:${c.craneDark}}
.bld-crane .crane-cab{fill:${c.craneDark};stroke:${c.crane};stroke-width:${v.wallStroke}}
.bld-crane .crane-cable{stroke:${c.craneCable}}
.bld-crane .crane-load{fill:${c.rebar};stroke:${c.craneDark};stroke-width:${v.wallStroke}}
.bld-crane .crane-slew{transform-box:view-box}
.bld-crane .crane-hoist{transform-box:view-box}
.bld-crane.is-working .crane-slew{animation:crane-slew ${m.craneTurnMs}ms ${easing.linear} infinite}
.bld-crane.is-working .crane-hoist{animation:crane-sway ${m.craneSwayMs}ms ${easing.inOut} infinite}
.bld-crane.is-working .crane-load{animation:crane-lift ${m.craneLiftMs}ms ${easing.inOut} infinite}
.bld-crane.is-idle .crane-load{opacity:.45}

.bld-rain{opacity:0;pointer-events:none}
.bld-rain.is-on{opacity:1}
.bld-rain line{stroke:${c.rain}}
.bld-rain.is-on line{animation:rainfall ${m.rainMs}ms ${easing.linear} infinite}

/* Topped out: the flag goes up and stays up. */
.bld-flag{opacity:0;transition:opacity ${m.slideInMs}ms ${easing.out}}
.building.is-topped-out .bld-flag{opacity:1}
.bld-flag .flag-pole{stroke:${c.steel}}
.bld-flag .flag-cloth{fill:${c.accent}}
.bld-flash{fill:${c.text};opacity:0;pointer-events:none}
.building.is-celebrating .bld-flash{animation:celebrate ${theme.scene.celebrateMs}ms ${easing.out}}

/* A gate failed: the floor it was on blinks. */
.bld-floor.is-failing .floor-grid,
.bld-floor.is-failing .floor-gate,
.bld-floor.is-failing .floor-wall-face{stroke:${c.bad}}
.bld-floor.is-failing,
.bld-envelope.is-failing{
  animation:blink ${m.blinkFastMs}ms ${easing.inOut} ${theme.scene.failBlinks};
}

/* After dark the finished floors are lived in, and the crane shows a light. */
.scene[data-phase="night"] .bld-floor.is-done .floor-window,
.scene[data-phase="evening"] .bld-floor.is-done .floor-window{fill:var(--window-lit)}
.scene[data-phase="night"] .crane-cab{animation:blink ${m.blinkMs * 2}ms ${easing.inOut} infinite}

.punch-dot{fill:${c.warn};stroke:${c.bg};stroke-width:${v.wallStroke}}
.punch-dot.is-new{transform-box:fill-box;transform-origin:center;animation:punch-pop ${m.punchPopMs}ms ${easing.bounce}}
.punch-more{fill:${c.warn};font-family:${f.mono};font-size:${f.tiny};dominant-baseline:middle}

.bld-badge{transform-box:view-box;animation:badge-pop ${m.badgePopMs}ms ${easing.bounce},badge-fade ${m.badgeHoldMs}ms ${easing.out} ${m.badgePopMs}ms forwards}
.badge-disc{fill:${c.goodBg};stroke:${c.good}}
.badge-tick{fill:none;stroke:${c.good};stroke-linecap:round;stroke-linejoin:round}
`;
}

/** Panels, cards, buttons, toasts, modals, the title screen. */
function panels(): string {
  const { color: c, size: s, font: f, layout, motion: m, easing } = theme;
  return `
.panel{background:${c.panel};border:${s.hairline}px solid ${c.border};border-radius:${s.radius}px;padding:${s.pad}px}
.panel + .panel{margin-top:${s.gap}px}
.panel-title{font-size:${f.title};margin-bottom:${s.gap}px;display:flex;justify-content:space-between;align-items:center;gap:${s.gapSmall}px}

.topbar{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(${s.statMinWidth}px,1fr));gap:${s.gap}px;
  background:${c.panelRaised};border:${s.hairline}px solid ${c.border};border-radius:${s.radius}px;
  padding:${s.pad}px;margin-bottom:${s.gap}px;align-items:start;
}
.stat{display:flex;flex-direction:column;gap:${s.gapTiny}px;min-width:0}
.stat-label{font-size:${f.tiny};color:${c.textFaint};text-transform:uppercase;letter-spacing:.06em}
.stat-value{font-size:${f.title};font-family:${f.mono};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${c.blueprint}}
.stat-value.good{color:${c.good}} .stat-value.bad{color:${c.bad}} .stat-value.warn{color:${c.warn}}
.stat-value.plain{color:${c.text}}
.stat-value.is-overdue{animation:blink ${m.blinkFastMs}ms ${easing.inOut} infinite}
.topbar-tools{display:flex;align-items:center;justify-content:flex-end;gap:${s.gapSmall}px;flex-wrap:wrap}
.lang-toggle{display:inline-flex;gap:0;border:${s.hairline}px solid ${c.border};border-radius:${s.radiusSmall}px;overflow:hidden}
.lang-btn{border:none;border-radius:0;background:${c.panelSunk};color:${c.textDim};font-family:${f.mono};min-width:${s.touchTargetSmall}px}
.lang-btn + .lang-btn{border-left:${s.hairline}px solid ${c.border}}
.lang-btn.is-active{background:${c.accent};color:${c.accentText};font-weight:600}
.lang-btn:hover:not(.is-active){background:${c.border};color:${c.text}}
.title-buttons{display:flex;gap:${s.gapSmall}px;flex-wrap:wrap;justify-content:center}
.title-screen .title-buttons .btn{min-width:${s.titleButtonMinWidth}px}
.title-screen .lang-toggle{margin-top:${s.gap}px}
.title-screen .lang-btn{min-width:${s.touchTarget}px}

.site{display:flex;flex-direction:column;gap:${s.gapSmall}px}
.site-head{display:flex;justify-content:space-between;align-items:baseline;gap:${s.gapSmall}px}
.site-type{font-size:${f.title};font-weight:600}
.site-sub{font-size:${f.tiny};color:${c.textDim}}
.site-grid{display:grid;grid-template-columns:1fr 1fr;gap:${s.gapSmall}px}
.site-note{
  font-size:${f.small};padding:${s.padTight}px ${s.notePadX}px;border-radius:${s.radiusSmall}px;
  background:${c.panelSunk};border-left:${s.accentBar}px solid ${c.warn};color:${c.textDim};
}
.site-note.blocking{border-left-color:${c.bad};color:${c.text}}
.site-note.info{border-left-color:${c.blueprint}}
.site-note .short{color:${c.bad};font-family:${f.mono};font-weight:600}

/* A site starved of cash pulses slowly until it is fed. */
.site-card.is-starved{animation:starve ${m.blinkMs * 2}ms ${easing.inOut} infinite}
.site-card.is-failed{animation:shake ${m.shakeMs}ms ${easing.inOut},flash ${m.flashMs}ms ${easing.out}}

.empty-lot{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s.gapSmall}px;
  min-height:${s.emptyLotMinHeight}px;padding:${s.pad}px;
  border:${s.hairline}px dashed ${c.border};border-radius:${s.radius}px;
  color:${c.textFaint};background:
    repeating-linear-gradient(90deg,${c.blueprintLine} 0 ${s.blueprintGridStroke}px,${c.transparent} ${s.blueprintGridStroke}px ${s.blueprintGrid}px),
    repeating-linear-gradient(0deg,${c.blueprintLine} 0 ${s.blueprintGridStroke}px,${c.transparent} ${s.blueprintGridStroke}px ${s.blueprintGrid}px);
}

.slot-head{display:flex;justify-content:space-between;align-items:baseline;gap:${s.gapSmall}px;width:100%}
.slot-title{font-size:${f.title};font-weight:600;color:${c.text}}
.slot-price{font-family:${f.mono};color:${c.blueprint}}
.slot-short{color:${c.warn}}
.empty-lot.is-next{border-color:${c.accentDim};color:${c.textDim}}
.empty-lot.is-locked{opacity:.55}
.empty-lot > .btn{flex:0 0 auto}

.btn{
  background:${c.panelRaised};border:${s.hairline}px solid ${c.border};border-radius:${s.radiusSmall}px;
  padding:${s.padSmall}px ${s.toastPadX}px;min-height:${s.touchTarget}px;cursor:pointer;font-size:${f.small};
  transition:background ${m.hoverMs}ms,border-color ${m.hoverMs}ms,transform ${m.pressMs}ms ${easing.out};touch-action:manipulation;
  display:inline-flex;align-items:center;justify-content:center;gap:${s.gapSmall}px;
}
.btn:hover:not(:disabled){background:${c.border}}
.btn:active:not(:disabled){transform:translateY(${s.hairline}px)}
.btn:disabled{opacity:.42;cursor:not-allowed}
.btn.primary{background:${c.accent};color:${c.accentText};border-color:${c.accent};font-weight:600}
.btn.primary:hover:not(:disabled){filter:brightness(1.08)}
.btn.warn{border-color:${c.warn};color:${c.warn};background:${c.warnBg}}
.btn.warn:hover:not(:disabled){background:${c.warn};color:${c.accentText}}
.btn.danger{border-color:${c.bad};color:${c.bad}}
.btn.small{min-height:${s.touchTargetSmall}px;padding:${s.gapSmall}px ${s.loadingGap}px;font-size:${f.tiny}}
.btn.icon-only{min-width:${s.touchTargetSmall}px;padding:${s.gapSmall}px}
.btn-row{display:flex;gap:${s.gapSmall}px;flex-wrap:wrap}
.btn-row .btn{flex:1 1 auto}

/* Tender cards read as blueprint sheets. */
.rfq{
  border:${s.hairline}px solid ${c.border};border-radius:${s.radius}px;padding:${s.pad}px;
  position:relative;overflow:hidden;background-color:${c.blueprintPaper};
  background-image:
    repeating-linear-gradient(90deg,${c.blueprintLine} 0 ${s.blueprintGridStroke}px,${c.transparent} ${s.blueprintGridStroke}px ${s.blueprintGrid}px),
    repeating-linear-gradient(0deg,${c.blueprintLine} 0 ${s.blueprintGridStroke}px,${c.transparent} ${s.blueprintGridStroke}px ${s.blueprintGrid}px);
}
.rfq + .rfq{margin-top:${s.gapSmall}px}
.rfq.lifeline{border-color:${c.blueprint}}
.rfq.named{border-color:${c.accent};box-shadow:0 0 0 ${s.hairline}px ${c.accentGlow}}
.rfq.is-entering{animation:slide-in ${m.slideInMs}ms ${easing.out}}
.rfq.is-leaving{animation:slide-out ${m.slideOutMs}ms ${easing.out} forwards;pointer-events:none}
.rfq-head{display:flex;justify-content:space-between;align-items:baseline;gap:${s.gapSmall}px;margin-bottom:${s.gapSmall}px}
.rfq-price{font-family:${f.mono};font-size:${f.title};color:${c.blueprint}}
.rfq-tags{display:flex;gap:${s.padCell}px;flex-wrap:wrap;margin-bottom:${s.gapSmall}px}
.tag{
  font-size:${f.tiny};padding:${s.tagPadY}px ${s.tagPadX}px;border-radius:${s.radiusPill}px;
  background:${c.panelSunk};color:${c.textDim};border:${s.hairline}px solid ${c.border};
  display:inline-flex;align-items:center;gap:${s.padCell}px;
}
.tag .icon{width:${f.tiny};height:${f.tiny}}
.tag.accent{color:${c.accent};border-color:${c.accentDim}}
.tag.info{color:${c.blueprint};border-color:${c.blueprintDim}}
.tag.warn{color:${c.warn};border-color:${c.warnDim}}
.tag.mono{font-family:${f.mono}}
.rfq-result{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  border-radius:${s.radius}px;font-size:${f.big};font-weight:700;background:${c.scrim};
  animation:fade-in ${m.slideInMs}ms ${easing.out};
}
.rfq-result.won{color:${c.good}} .rfq-result.lost{color:${c.bad}}

/* Bid tiers: a bar for the odds, a colour for the money. */
.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:${s.gapSmall}px}
.tier{
  display:flex;flex-direction:column;align-items:stretch;gap:${s.tagPadY}px;
  padding:${s.tierPadY}px ${s.padCell}px;min-height:${s.touchTarget}px;
  background:${c.panelRaised};border:${s.hairline}px solid ${c.border};
  border-radius:${s.radiusSmall}px;cursor:pointer;transition:background ${m.hoverMs}ms,border-color ${m.hoverMs}ms;
}
.tier:hover:not(:disabled){background:${c.border};border-color:${c.borderBright}}
.tier:disabled{opacity:.42;cursor:not-allowed}
.tier-name{font-weight:600;font-size:${f.small};text-align:center}
.tier-line{font-size:${f.tiny};color:${c.textDim};font-family:${f.mono};text-align:center}
.tier-line.good{color:${c.good}} .tier-line.bad{color:${c.bad}}
.tier .bar{height:${s.barHeightThin}px;margin:${s.tagPadY}px 0}

.sub-row{display:flex;align-items:center;gap:${s.gapSmall}px;padding:${s.listRowPadY}px 0;border-top:${s.hairline}px solid ${c.border}}
.sub-row:first-of-type{border-top:none}
.sub-name{flex:1 1 auto;min-width:0}
.sub-effect{font-size:${f.tiny};color:${c.textFaint};font-family:${f.mono}}
.sub-icon{color:${c.accent}}

.log-list{display:flex;flex-direction:column;gap:${s.gapTiny}px;max-height:${s.logMaxHeight}px;overflow-y:auto}
.log-line{font-size:${f.small};color:${c.textDim};display:flex;gap:${s.tierPadY}px}
.log-line .t{color:${c.textFaint};font-family:${f.mono};flex:0 0 auto}
.log-line.good{color:${c.good}} .log-line.bad{color:${c.bad}}
details>summary{cursor:pointer;list-style:none;font-size:${f.title};font-weight:600}
details>summary::-webkit-details-marker{display:none}

/* A payment lifts off the card it came from. */
.float-money{
  position:absolute;left:50%;top:40%;transform:translateX(-50%);pointer-events:none;
  font-family:${f.mono};font-weight:600;color:${c.good};font-size:${f.title};z-index:5;
  animation:float-up ${m.floatMs}ms ${easing.out} forwards;text-shadow:0 ${s.hairline}px ${s.shadowDrop}px ${c.shadowStrong};
}
.site-card{position:relative}

.toasts{
  position:fixed;left:50%;transform:translateX(-50%);z-index:40;
  bottom:calc(${theme.scene.tabBarHeight}px + ${s.toastOffset}px);
  display:flex;flex-direction:column;gap:${s.gapSmall}px;
  width:min(${s.panelMaxWidth}px,calc(100vw - ${s.gap * 2}px));
}
.toast{
  background:${c.panelRaised};border:${s.hairline}px solid ${c.border};border-left:${s.toastBar}px solid ${c.blueprint};
  border-radius:${s.radiusSmall}px;padding:${s.toastPadY}px ${s.toastPadX}px;font-size:${f.small};
  animation:rise ${m.slideInMs}ms ${easing.out};box-shadow:0 ${s.shadowDrop}px ${s.shadowBlur}px ${c.shadow};
}
.toast.good{border-left-color:${c.good};background:${c.goodBg}}
.toast.bad{border-left-color:${c.bad};background:${c.badBg}}
.toast-sub{display:block;color:${c.textDim};font-size:${f.tiny};margin-top:${s.gapTiny}px}

.modal-back{
  position:fixed;inset:0;background:${c.overlay};display:flex;align-items:center;justify-content:center;
  padding:${s.gap}px;animation:fade-in ${m.slideInMs}ms ${easing.out};
  /* Above the spotlight: a dialog must never be unreachable behind it. */
  z-index:60;
}
.modal{
  background:${c.panel};border:${s.hairline}px solid ${c.border};border-radius:${s.radius}px;
  padding:${s.padModal}px;width:min(${s.panelMaxWidth}px,100%);display:flex;flex-direction:column;gap:${s.gap}px;
  animation:rise ${m.slideInMs}ms ${easing.out};box-shadow:0 ${s.shadowDrop}px ${s.shadowBlurStrong}px ${c.shadowStrong};
}
.modal-title{font-size:${f.big};font-weight:600}
.modal-body{color:${c.textDim};font-size:${f.small};display:flex;flex-direction:column;gap:${s.radiusSmall}px}

.hint{
  margin-top:${s.gapSmall}px;font-size:${f.small};color:${c.accent};
  background:${c.hintBg};border:${s.hairline}px solid ${c.hintBorder};
  border-radius:${s.radiusSmall}px;padding:${s.tierPadY}px ${s.loadingGap}px;
}
.legend{display:flex;flex-wrap:wrap;gap:${s.tierPadY}px;font-size:${f.tiny};color:${c.textFaint};margin-top:${s.padCell}px}
.legend span{display:flex;align-items:center;gap:${s.padCell}px}
.swatch{width:${s.swatch}px;height:${s.swatch}px;border-radius:${s.radiusTiny}px;display:inline-block}
.footer-bar{display:flex;justify-content:space-between;align-items:center;gap:${s.gapSmall}px;margin-top:${s.gap}px}


/* ---- guided first job -------------------------------------------------- */
/*
 * The spotlight is four panels around the target rather than a hole cut in one
 * overlay: panels are not clipped by the overflow rules the target sits in,
 * and they absorb clicks, so the only pressable thing is what is lit.
 */
.spotlight{position:fixed;inset:0;z-index:55;pointer-events:none}
.spot-panel{
  position:fixed;top:0;left:0;background:${c.overlay};pointer-events:auto;
  transform-origin:top left;will-change:transform,width,height;
}
.spot-ring{
  position:fixed;top:0;left:0;pointer-events:none;border-radius:${s.radius}px;
  box-shadow:0 0 0 ${s.strokeThin}px ${c.accent},0 0 ${s.shadowBlurStrong}px ${c.accentGlow};
  transform-origin:top left;
}
.spot-caption{
  position:fixed;z-index:56;pointer-events:none;
  width:min(${s.panelMaxWidth}px,calc(100vw - ${s.gap * 2}px));
  background:${c.panelRaised};border:${s.hairline}px solid ${c.accentDim};
  border-left:${s.accentBar}px solid ${c.accent};
  border-radius:${s.radiusSmall}px;padding:${s.toastPadY}px ${s.toastPadX}px;
  box-shadow:0 ${s.shadowDrop}px ${s.shadowBlur}px ${c.shadow};
  animation:rise ${m.slideInMs}ms ${easing.out};
}
.spot-say{font-size:${f.title};font-weight:600;color:${c.text}}
.spot-why{font-size:${f.small};color:${c.textDim};margin-top:${s.gapTiny}px}
.spot-skip-host{position:fixed;top:${s.gap}px;right:${s.gap}px;z-index:57}
.spot-skip{
  pointer-events:auto;background:${c.panelRaised};border-color:${c.border};
  box-shadow:0 ${s.shadowDrop}px ${s.shadowBlur}px ${c.shadow};
}

/* What the guide hides while the first job is the whole game. */
html.guide-first-job .plot.is-empty{display:none}
html.guide-hide-company .company-panel{display:none}
/* A tab that opens onto something hidden is worse than no tab at all. */
html.guide-hide-company .tab[data-guide="tab-company"]{display:none}
html.guide-first-job .tab[data-guide="tab-log"]{display:none}
html.guide-first-job .log-list{max-height:0;overflow:hidden}
html.guide-first-job details>summary{pointer-events:none;opacity:.5}
html.guide-only-named .rfq:not(.named){display:none}
html.guide-only-named .rfq.lifeline{display:none}
html.guide-dim-stats .topbar .stat:not([data-guide="cash"]){opacity:.35}
/* The language and sound controls stay usable: the order never asked for
   them to be locked, and a player who cannot read the guide needs them. */
html.guide-on .topbar-tools{opacity:.6}
/* ...which means the way out must not sit on top of them. The top bar gives
   it a band of its own at every width while the guide is running. */
html.guide-on .topbar{padding-top:${s.touchTarget + s.gapSmall}px}

/* ---- term tooltips ----------------------------------------------------- */
.tip{position:relative;display:inline-flex;align-items:center;margin-left:${s.padCell}px}
.tip-dot{
  display:inline-flex;align-items:center;justify-content:center;
  width:${s.infoDot}px;height:${s.infoDot}px;padding:0;border:none;background:none;
  color:${c.textFaint};cursor:pointer;flex:0 0 auto;
}
.tip-dot:hover,.tip-dot:focus-visible{color:${c.blueprint}}
.tip-icon{width:${s.infoDot}px;height:${s.infoDot}px;stroke-width:${s.strokeThin}}
.tip-bubble{
  position:absolute;bottom:calc(100% + ${s.tooltipOffset}px);left:50%;
  transform:translateX(-50%);z-index:45;
  width:max-content;max-width:${s.tooltipMaxWidth}px;
  background:${c.panelRaised};color:${c.text};
  border:${s.hairline}px solid ${c.borderBright};border-radius:${s.radiusSmall}px;
  padding:${s.padTight}px ${s.notePadX}px;font-size:${f.tiny};font-weight:400;
  line-height:1.45;white-space:normal;text-align:left;text-transform:none;letter-spacing:0;
  box-shadow:0 ${s.shadowDrop}px ${s.shadowBlur}px ${c.shadowStrong};
  opacity:0;visibility:hidden;transition:opacity ${m.hoverMs}ms;
}
.tip:hover .tip-bubble,.tip.is-open .tip-bubble,.tip-dot:focus-visible + .tip-bubble{
  opacity:1;visibility:visible;
}
.has-tip{display:inline-flex;align-items:center;gap:0}
.tag .tip-dot{color:inherit;opacity:.65}
.tag .tip-dot:hover{opacity:1}

@media(hover:none){
  /* No hover on a finger: the dot is a tap target and needs room. */
  .tip-dot{width:${s.touchTarget}px;height:${s.touchTarget}px;margin:-${s.pad}px}
  .tip:hover .tip-bubble{opacity:0;visibility:hidden}
  .tip.is-open .tip-bubble{opacity:1;visibility:visible}
}

/* Title screen. */
.title-screen{
  position:fixed;inset:0;z-index:60;background:${c.bg};
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s.titleGap}px;
  padding:${s.gap}px;overflow:hidden;
}
.title-screen.is-leaving{animation:fade-out ${m.titleFadeMs}ms ${easing.out} forwards;pointer-events:none}
.title-crane{
  position:absolute;right:0;bottom:0;width:min(62vw,${s.iconSizeTitle * 4}px);height:auto;
  fill:none;stroke:${c.border};stroke-width:${s.hairline};stroke-linecap:round;opacity:.9;
  pointer-events:none;
}
.title-crane .title-crane-load{stroke:${c.accentDim}}
.title-inner{position:relative;display:flex;flex-direction:column;align-items:center;gap:${s.gapSmall}px;text-align:center}
.title-name{
  font-size:${f.display};font-weight:700;letter-spacing:-.02em;
  animation:rise ${m.titleFadeMs}ms ${easing.out};
}
.title-name .accent{color:${c.accent}}
.title-tagline{color:${c.textDim};font-size:${f.title};margin-bottom:${s.gap}px}
.title-screen .btn{min-width:${s.titleButtonMinWidth}px}
.title-note{color:${c.textFaint};font-size:${f.tiny}}

/*
 * Order 004 §7: 44px minimum touch target. The compact buttons are only
 * compact for a mouse — on a finger they grow back to full size.
 */
@media(hover:none) and (pointer:coarse){
  .btn.small,.btn.icon-only,.tier{min-height:${s.touchTarget}px}
  .btn.icon-only{min-width:${s.touchTarget}px}
}
@media(max-width:${layout.mobileWidth}px){
  /* The HUD gives the scene its height back: smaller chips, and the tools
     flow with them instead of claiming a row of their own. */
  .topbar{gap:${s.gapTiny}px;padding:${s.gapTiny}px ${s.gapSmall}px}
  .topbar .stat{padding:${s.gapTiny}px ${s.gapSmall}px;gap:${s.gapTiny}px}
  .topbar .stat-label{font-size:${f.tiny}}
  .topbar .stat-value{font-size:${f.small}}
  .topbar-tools{margin-left:${s.gapTiny}px}
  .plot.is-empty .empty-lot{font-size:${f.tiny};padding:${s.gapSmall}px}
  .btn.small,.btn.icon-only,.tier{min-height:${s.touchTarget}px}
  .btn.icon-only{min-width:${s.touchTarget}px}
  #app{padding:${s.gapSmall}px;padding-bottom:${s.pageBottomPad}px}
  .panel{padding:${s.padSmall}px}
  .site-grid{grid-template-columns:1fr 1fr}
  .title-name{font-size:${f.huge}}
}
`;
}

/**
 * Keyframes. Every one of these moves transform or opacity only.
 * The block at the end is the master off switch.
 */
function animations(): string {
  const { size: s, svg: v, motion: m, scene: sc } = theme;
  // The visit animations are one keyframe set each; where their stops fall is
  // worked out from the timings rather than written in twice.
  const truckTotal = sc.truckEnterMs + sc.truckStayMs + sc.truckLeaveMs;
  const truckIn = ((sc.truckEnterMs / truckTotal) * 100).toFixed(1);
  const truckOut = (((sc.truckEnterMs + sc.truckStayMs) / truckTotal) * 100).toFixed(1);
  // The reversing step: a short back-up before it drives off.
  const truckBack = (((sc.truckEnterMs + sc.truckStayMs + sc.truckLeaveMs * 0.45) / truckTotal) * 100).toFixed(1);
  const visitTotal = sc.inspectorWalkMs * 2 + sc.inspectorStayMs;
  const walkIn = ((sc.inspectorWalkMs / visitTotal) * 100).toFixed(1);
  const walkOut = (((sc.inspectorWalkMs + sc.inspectorStayMs) / visitTotal) * 100).toFixed(1);
  const bubbleIn = (((sc.inspectorWalkMs * 1.2) / visitTotal) * 100).toFixed(1);
  return `
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sweep{to{transform:translateX(100%)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes fade-out{from{opacity:1}to{opacity:0}}
@keyframes rise{from{opacity:0;transform:translateY(${s.riseOffset}px)}to{opacity:1;transform:none}}
@keyframes slide-in{from{opacity:0;transform:translateY(-${s.slideOffset}px)}to{opacity:1;transform:none}}
@keyframes slide-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(${s.slideOffset}px)}}
@keyframes float-up{
  0%{opacity:0;transform:translate(-50%,0) scale(.9)}
  18%{opacity:1;transform:translate(-50%,-${s.riseOffset}px) scale(1)}
  100%{opacity:0;transform:translate(-50%,-${s.floatRise}px) scale(1)}
}
@keyframes shake{
  0%,100%{transform:translateX(0)}
  15%{transform:translateX(-${s.shakeOffset}px)}
  30%{transform:translateX(${s.shakeOffset}px)}
  45%{transform:translateX(-${s.shakeOffset * 0.6}px)}
  60%{transform:translateX(${s.shakeOffset * 0.6}px)}
  80%{transform:translateX(-${s.shakeOffset * 0.25}px)}
}
@keyframes flash{
  0%{box-shadow:0 0 0 ${s.strokeThin}px ${theme.color.bad}}
  100%{box-shadow:0 0 0 ${s.strokeThin}px ${theme.color.transparent}}
}
@keyframes starve{
  0%,100%{box-shadow:0 0 0 ${s.hairline}px ${theme.color.transparent}}
  50%{box-shadow:0 0 0 ${s.strokeThin}px ${theme.color.bad}}
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes floor-rise{
  0%{transform:translateY(${s.riseOffset}px);opacity:.3}
  100%{transform:translateY(0);opacity:1}
}
@keyframes punch-pop{0%{transform:scale(0)}70%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes badge-pop{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:scale(1)}}
@keyframes badge-fade{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
@keyframes rainfall{
  0%{transform:translateY(0);opacity:0}
  15%{opacity:.9}
  85%{opacity:.9}
  100%{transform:translateY(${v.rainLength * 4}px);opacity:0}
}
/* A full turn of the jib, read in section: it shortens as it comes side-on. */
@keyframes crane-slew{
  0%{transform:scaleX(1)}
  25%{transform:scaleX(.08)}
  50%{transform:scaleX(-1)}
  75%{transform:scaleX(.08)}
  100%{transform:scaleX(1)}
}
@keyframes walk-span{from{transform:translateX(0)}to{transform:translateX(var(--walk-span,0))}}
@keyframes frame-a{0%,49.9%{opacity:1}50%,100%{opacity:0}}
@keyframes fix-arm{from{transform:rotate(-18deg)}to{transform:rotate(14deg)}}
@keyframes frame-b{0%,49.9%{opacity:0}50%,100%{opacity:1}}
@keyframes celebrate{
  0%{opacity:0}
  20%{opacity:${theme.scene.flashOpacity}}
  100%{opacity:0}
}
@keyframes coin-fly{
  0%{transform:translate(0,0) scale(.5);opacity:0}
  12%{opacity:1;transform:translate(0,-${s.gap}px) scale(1)}
  100%{transform:translate(var(--fly-x,0),var(--fly-y,0)) scale(.45);opacity:0}
}
@keyframes truck-visit{
  0%{opacity:0;transform:translateX(var(--truck-from,0))}
  6%{opacity:1}
  ${truckIn}%{transform:translateX(var(--truck-stop,0))}
  ${truckOut}%{opacity:1;transform:translateX(var(--truck-stop,0))}
  ${truckBack}%{transform:translateX(var(--truck-back,0))}
  100%{opacity:0;transform:translateX(var(--truck-from,0))}
}
@keyframes inspector-visit{
  0%{opacity:0;transform:translateX(0)}
  6%{opacity:1}
  ${walkIn}%{transform:translateX(var(--walk-to,0))}
  ${walkOut}%{opacity:1;transform:translateX(var(--walk-to,0))}
  100%{opacity:0;transform:translateX(0)}
}
@keyframes bubble-pop{
  0%,${walkIn}%{opacity:0;transform:scale(.4)}
  ${bubbleIn}%{opacity:1;transform:scale(1)}
  ${walkOut}%{opacity:1;transform:scale(1)}
  100%{opacity:0;transform:scale(.8)}
}
@keyframes crane-sway{0%,100%{transform:rotate(-2.2deg)}50%{transform:rotate(2.2deg)}}
@keyframes crane-lift{
  0%,100%{transform:translateY(0)}
  45%{transform:translateY(-${v.craneHeadroom / 2}px)}
  55%{transform:translateY(-${v.craneHeadroom / 2}px)}
}
.spinner{
  width:${s.spinner}px;height:${s.spinner}px;
  border:${s.strokeThin}px solid ${theme.color.border};border-top-color:${theme.color.accent};
  border-radius:50%;animation:spin ${m.spinMs}ms linear infinite;
}
.loading{display:flex;align-items:center;justify-content:center;height:70vh;gap:${s.loadingGap}px;color:${theme.color.textDim}}

/*
 * The master switch. Reduced motion, the theme flag and the frame-rate guard
 * all land here: nothing animates, but every final state still applies, so the
 * screen reads the same — it simply stops moving.
 */
html.no-motion *,html.no-motion *::before,html.no-motion *::after{
  animation-duration:1ms !important;
  animation-iteration-count:1 !important;
  transition-duration:1ms !important;
  scroll-behavior:auto !important;
}
html.no-motion .scene-weather,html.no-motion .title-crane{opacity:.75}
html.no-motion .bld-floor.is-structureGate .floor-gate,
html.no-motion .bld-floor.is-servicesGate .floor-gate{opacity:1}

/* Degraded only: keep the game legible, drop the continuous decoration. */
html.degraded .scene-weather{display:none}
html.degraded .actors .actor-walk,
html.degraded .actors .actor-legs{animation:none}
html.degraded .scene-skyline.is-far{display:none}
html.degraded .bld-crane .crane-load{opacity:.45}
`;
}
