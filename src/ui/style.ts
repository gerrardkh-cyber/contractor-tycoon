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
  const css = [base(), building(), panels(), animations()].join('\n');
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
}

function base(): string {
  const { color: c, size: s, font: f, layout, motion: m, easing } = theme;
  return `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  background:${c.bg};color:${c.text};font-family:${f.stack};font-size:${f.body};
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
#app{max-width:${layout.maxWidth}px;margin:0 auto;padding:${s.gap}px;padding-bottom:${s.pageBottomPad}px}
h1,h2,h3{margin:0;font-weight:600}
button{font:inherit;color:inherit}

/* Rain drains the colour out of the whole screen while it falls. */
#app{transition:filter ${m.flashMs}ms ${easing.out}}
#app.is-wet{filter:saturate(.55) brightness(.92)}

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

.columns{display:grid;grid-template-columns:1fr;gap:${s.gap}px}
@media(min-width:${layout.twoColumnMinWidth}px){.columns{grid-template-columns:1.15fr .85fr}}
.sites{display:grid;grid-template-columns:1fr;gap:${s.gap}px}
@media(min-width:${s.siteGridBreakpoint}px){.sites{grid-template-columns:repeat(auto-fit,minmax(${s.siteMinWidth}px,1fr))}}
`;
}

/** The site drawing: floors, envelope, crane, weather, punch dots, badges. */
function building(): string {
  const { color: c, size: s, svg: v, font: f, motion: m, easing } = theme;
  return `
.building{
  display:block;width:100%;max-width:${s.canvasMaxWidth}px;min-width:${s.canvasMinWidth}px;
  margin:0 auto;border-radius:${s.radiusSmall}px;background:${c.sky};overflow:hidden;
}
.bld-sky{fill:${c.sky};transition:fill ${m.flashMs}ms ${easing.out}}
.building.is-raining .bld-sky{fill:${c.skyRain}}
.bld-ground rect{fill:${c.ground}}
.bld-ground-line{stroke:${c.groundLine}}

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
  position:fixed;left:50%;transform:translateX(-50%);bottom:${s.toastOffset}px;z-index:40;
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
html.guide-first-job .empty-lot{display:none}
html.guide-hide-company .company-panel{display:none}
html.guide-first-job .log-list{max-height:0;overflow:hidden}
html.guide-first-job details>summary{pointer-events:none;opacity:.5}
html.guide-only-named .rfq:not(.named){display:none}
html.guide-only-named .rfq.lifeline{display:none}
html.guide-dim-stats .topbar .stat:not([data-guide="cash"]){opacity:.35}
/* The language and sound controls stay usable: the order never asked for
   them to be locked, and a player who cannot read the guide needs them. */
html.guide-on .topbar-tools{opacity:.6}

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
  .btn.small,.btn.icon-only,.tier{min-height:${s.touchTarget}px}
  .btn.icon-only{min-width:${s.touchTarget}px}
  #app{padding:${s.gapSmall}px;padding-bottom:${s.pageBottomPad}px}
  .panel{padding:${s.padSmall}px}
  .site-grid{grid-template-columns:1fr 1fr}
  .title-name{font-size:${f.huge}}
  .topbar{padding:${s.padSmall}px;gap:${s.gapSmall}px}
}
`;
}

/**
 * Keyframes. Every one of these moves transform or opacity only.
 * The block at the end is the master off switch.
 */
function animations(): string {
  const { size: s, svg: v, motion: m } = theme;
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
html.no-motion .bld-rain,html.no-motion .title-crane{opacity:.75}
html.no-motion .bld-floor.is-structureGate .floor-gate,
html.no-motion .bld-floor.is-servicesGate .floor-gate{opacity:1}

/* Degraded only: keep the game legible, drop the continuous decoration. */
html.degraded .bld-rain{display:none}
html.degraded .bld-crane .crane-load{opacity:.45}
`;
}
