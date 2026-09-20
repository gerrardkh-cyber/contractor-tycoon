// The stylesheet, built from theme.ts and injected once. Kept in code so the
// theme stays the single source of colour and size, and so the build stays a
// single index.html plus assets with no image files.

import { theme } from './theme';

export function injectStyles(): void {
  const { color: c, size: s, font: f, layout } = theme;
  const css = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  background:${c.bg};color:${c.text};font-family:${f.stack};font-size:${f.body};
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
#app{max-width:${layout.maxWidth}px;margin:0 auto;padding:${s.gap}px;padding-bottom:64px}
h1,h2,h3{margin:0;font-weight:600}
button{font:inherit;color:inherit}

.loading{display:flex;align-items:center;justify-content:center;height:70vh;gap:10px;color:${c.textDim}}
.spinner{
  width:18px;height:18px;border:2px solid ${c.border};border-top-color:${c.accent};
  border-radius:50%;animation:spin .8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

.panel{background:${c.panel};border:1px solid ${c.border};border-radius:${s.radius}px;padding:${s.pad}px}
.panel + .panel{margin-top:${s.gap}px}
.panel-title{font-size:${f.title};margin-bottom:${s.gap}px;display:flex;justify-content:space-between;align-items:center}

.topbar{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:${s.gap}px;
  background:${c.panelRaised};border:1px solid ${c.border};border-radius:${s.radius}px;
  padding:${s.pad}px;margin-bottom:${s.gap}px;
}
.stat{display:flex;flex-direction:column;gap:3px;min-width:0}
.stat-label{font-size:${f.tiny};color:${c.textFaint};text-transform:uppercase;letter-spacing:.06em}
.stat-value{font-size:${f.title};font-family:${f.mono};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat-value.good{color:${c.good}} .stat-value.bad{color:${c.bad}} .stat-value.warn{color:${c.warn}}

.bar{background:${c.bg};border-radius:99px;height:${s.barHeight}px;overflow:hidden}
.bar-fill{background:${c.accent};height:100%;transition:width .2s linear}
.bar-fill.trust{background:${c.info}}
.bar-fill.good{background:${c.good}}

.columns{display:grid;grid-template-columns:1fr;gap:${s.gap}px}
@media(min-width:${layout.twoColumnMinWidth}px){.columns{grid-template-columns:1.15fr .85fr}}

.sites{display:grid;grid-template-columns:1fr;gap:${s.gap}px}
@media(min-width:620px){.sites{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}}

.site{display:flex;flex-direction:column;gap:${s.gapSmall}px}
.site-head{display:flex;justify-content:space-between;align-items:baseline;gap:${s.gapSmall}px}
.site-type{font-size:${f.title};font-weight:600}
.site-sub{font-size:${f.tiny};color:${c.textDim}}
.building{display:block;border-radius:${s.radiusSmall}px;background:${c.sky};width:100%;max-width:${s.canvasMaxWidth}px;margin:0 auto}
.site-grid{display:grid;grid-template-columns:1fr 1fr;gap:${s.gapSmall}px}
.site-note{
  font-size:${f.small};padding:7px 9px;border-radius:${s.radiusSmall}px;
  background:${c.bg};border-left:3px solid ${c.warn};color:${c.textDim};
}
.site-note.blocking{border-left-color:${c.bad};color:${c.text}}
.site-note.info{border-left-color:${c.info}}
.empty-lot{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s.gapSmall}px;
  min-height:180px;border:1px dashed ${c.border};border-radius:${s.radius}px;color:${c.textFaint};
}

.btn{
  background:${c.panelRaised};border:1px solid ${c.border};border-radius:${s.radiusSmall}px;
  padding:9px 12px;min-height:${s.touchTarget}px;cursor:pointer;font-size:${f.small};
  transition:background .12s,border-color .12s;touch-action:manipulation;
}
.btn:hover:not(:disabled){background:${c.border}}
.btn:disabled{opacity:.42;cursor:not-allowed}
.btn.primary{background:${c.accent};color:${c.accentText};border-color:${c.accent};font-weight:600}
.btn.primary:hover:not(:disabled){filter:brightness(1.08)}
.btn.danger{border-color:${c.bad};color:${c.bad}}
.btn.small{min-height:34px;padding:6px 10px;font-size:${f.tiny}}
.btn-row{display:flex;gap:${s.gapSmall}px;flex-wrap:wrap}
.btn-row .btn{flex:1 1 auto}

.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:${s.gapSmall}px}
.tier{
  display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;
  min-height:${s.touchTarget}px;background:${c.panelRaised};border:1px solid ${c.border};
  border-radius:${s.radiusSmall}px;cursor:pointer;
}
.tier:hover:not(:disabled){background:${c.border}}
.tier:disabled{opacity:.42;cursor:not-allowed}
.tier-name{font-weight:600;font-size:${f.small}}
.tier-line{font-size:${f.tiny};color:${c.textDim};font-family:${f.mono}}
.tier-line.good{color:${c.good}} .tier-line.bad{color:${c.bad}}

.rfq{border:1px solid ${c.border};border-radius:${s.radius}px;padding:${s.pad}px;background:${c.panelRaised};position:relative}
.rfq + .rfq{margin-top:${s.gapSmall}px}
.rfq.lifeline{border-color:${c.info}}
.rfq.named{border-color:${c.accent}}
.rfq-head{display:flex;justify-content:space-between;align-items:baseline;gap:${s.gapSmall}px;margin-bottom:${s.gapSmall}px}
.rfq-tags{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:${s.gapSmall}px}
.tag{font-size:${f.tiny};padding:2px 7px;border-radius:99px;background:${c.bg};color:${c.textDim};border:1px solid ${c.border}}
.tag.accent{color:${c.accent};border-color:${c.accent}}
.tag.info{color:${c.info};border-color:${c.info}}
.rfq-result{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  border-radius:${s.radius}px;font-size:${f.big};font-weight:700;background:rgba(18,21,26,.93);
}
.rfq-result.won{color:${c.good}} .rfq-result.lost{color:${c.bad}}

.sub-row{display:flex;align-items:center;gap:${s.gapSmall}px;padding:7px 0;border-top:1px solid ${c.border}}
.sub-row:first-of-type{border-top:none}
.sub-name{flex:1 1 auto;min-width:0}
.sub-effect{font-size:${f.tiny};color:${c.textFaint};font-family:${f.mono}}

.log-list{display:flex;flex-direction:column;gap:3px;max-height:220px;overflow-y:auto}
.log-line{font-size:${f.small};color:${c.textDim};display:flex;gap:8px}
.log-line .t{color:${c.textFaint};font-family:${f.mono};flex:0 0 auto}
.log-line.good{color:${c.good}} .log-line.bad{color:${c.bad}}
details>summary{cursor:pointer;list-style:none;font-size:${f.title};font-weight:600}
details>summary::-webkit-details-marker{display:none}

.toasts{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:40;display:flex;flex-direction:column;gap:6px;width:min(420px,calc(100vw - 24px))}
.toast{
  background:${c.panelRaised};border:1px solid ${c.border};border-left:4px solid ${c.info};
  border-radius:${s.radiusSmall}px;padding:10px 12px;font-size:${f.small};
  animation:rise .2s ease-out;box-shadow:0 6px 18px rgba(0,0,0,.4);
}
.toast.good{border-left-color:${c.good}} .toast.bad{border-left-color:${c.bad}}
.toast-sub{display:block;color:${c.textDim};font-size:${f.tiny};margin-top:3px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.modal-back{position:fixed;inset:0;background:rgba(8,10,13,.72);display:flex;align-items:center;justify-content:center;padding:${s.gap}px;z-index:50}
.modal{background:${c.panel};border:1px solid ${c.border};border-radius:${s.radius}px;padding:20px;width:min(420px,100%);display:flex;flex-direction:column;gap:${s.gap}px}
.modal-title{font-size:${f.big};font-weight:600}
.modal-body{color:${c.textDim};font-size:${f.small};display:flex;flex-direction:column;gap:5px}

.hint{
  margin-top:${s.gapSmall}px;font-size:${f.small};color:${c.accent};
  background:rgba(240,160,32,.08);border:1px solid rgba(240,160,32,.3);
  border-radius:${s.radiusSmall}px;padding:8px 10px;
}
.legend{display:flex;flex-wrap:wrap;gap:8px;font-size:${f.tiny};color:${c.textFaint};margin-top:4px}
.legend span{display:flex;align-items:center;gap:4px}
.swatch{width:9px;height:9px;border-radius:2px;display:inline-block}
.footer-bar{display:flex;justify-content:space-between;align-items:center;gap:${s.gapSmall}px;margin-top:${s.gap}px}
`;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
}
