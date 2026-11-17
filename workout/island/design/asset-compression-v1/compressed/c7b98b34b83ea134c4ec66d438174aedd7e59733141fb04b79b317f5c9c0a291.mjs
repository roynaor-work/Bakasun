/** v6 "תפוס את הפושע": the HUD of the tyre gun. A round fire button above the boost button, a row of ammo pips with a
 * reload arc, and a reticle projected onto the getaway car while the gun is locked (green when a shot is likely,
 * yellow when it is a gamble, grey when it is a long shot). Pure presentation: the rules live in catch-tyres.mjs and
 * the session owns the keys (f / x) and the gun, so this module adds no document key listener.
 * The pure helpers (reticleQuality, reloadProgress, pipStates, resolveText) are exported for the tests. */

export const STRINGS = Object.freeze({
  'catch.fire': 'ירי', 'catch.fireHint': 'ירי לגלגל של הרכב הנמלט', 'catch.ammo': 'כדורים: {count}',
  'catch.lockHint': 'כשהכוונת ירוקה לוחצים ירי', 'catch.reloading': 'טוען', 'catch.reticle': 'כוונת על הרכב הנמלט',
  'catch.hitChance': 'סיכוי לפגיעה {percent}%',
});
const SVG = 'http://www.w3.org/2000/svg';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The colour band of the reticle for a hit chance: the thresholds the contract fixes. */
export function reticleQuality(hitChance) { return hitChance > .6 ? 'green' : hitChance > .3 ? 'yellow' : 'grey'; }
/** 0..1 of the reload that has passed (1 = ready). */
export function reloadProgress(state, balance) { const total = balance?.reloadSeconds || 1; return state.reload > 0 ? clamp(1 - state.reload / total, 0, 1) : 1; }
/** One entry per pip: 'full', 'next' (the first empty one, filling with the trickle) or 'used'. `trickle` is 0..1 of the refill done. */
export function pipStates(state, balance) {
  const total = balance?.trickleSeconds || 1, out = [];
  for (let i = 0; i < state.ammoMax; i++) out.push(i < state.ammo ? 'full' : i === state.ammo ? 'next' : 'used');
  return {pips: out, trickle: state.ammo < state.ammoMax ? clamp(1 - (state.trickle ?? total) / total, 0, 1) : 0};
}
/** t(key) with a fallback to this module's strings, so a missing line in strings.he.json still shows Hebrew. */
export function resolveText(t, key, vars) {
  let v; try { v = t?.(key, vars); } catch { v = undefined; }
  if (v === undefined || v === null || v === key || v === '') v = STRINGS[key] || key;
  return String(v).replace(/{(\w+)}/g, (_, x) => vars?.[x] ?? `{${x}}`);
}

const CSS = `
.catch-fire{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(126px,calc(env(safe-area-inset-bottom) + 126px));width:84px;height:84px;border-radius:50%;border:3px solid #ffd6c8;background:radial-gradient(circle at 35% 28%,#ff9d7a,#d8401f 72%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;font-size:14px;font-weight:800;box-shadow:0 5px 0 #7a1f0a,0 8px 22px #0008;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .08s,box-shadow .08s,opacity .2s,filter .2s;font-family:inherit}
.catch-fire:active,.catch-fire.kick{transform:translateY(4px);box-shadow:0 1px 0 #7a1f0a,0 4px 12px #0008}
.catch-fire[data-locked=false]{opacity:.5;filter:grayscale(.65)}
.catch-fire[data-arming=true]{opacity:.35}
.catch-fire-arm{position:absolute;right:-4px;top:-4px;min-width:22px;height:22px;border-radius:11px;background:#0c1830;border:1px solid #ffffff55;color:#ffe08a;font-size:12px;font-weight:800;line-height:20px;text-align:center}
.catch-fire[data-reload=true]{filter:saturate(.6)}
.catch-fire[data-empty=true]{opacity:.45;filter:grayscale(.8)}
.catch-fire[data-locked=true][data-reload=false][data-empty=false]{box-shadow:0 5px 0 #7a1f0a,0 8px 22px #0008,0 0 18px #ff9d7acc;animation:catch-fire-ready 1.1s ease-in-out infinite}
.catch-fire:focus-visible{outline:3px solid #fff4bd;outline-offset:3px}
.catch-fire svg.catch-fire-arc{position:absolute;inset:-9px;width:calc(100% + 18px);height:calc(100% + 18px);transform:rotate(-90deg);pointer-events:none}
.catch-fire svg.catch-fire-arc circle{fill:none;stroke:#fff2b8;stroke-width:4;stroke-linecap:round;opacity:0;transition:opacity .15s}
.catch-fire[data-reload=true] svg.catch-fire-arc circle{opacity:.95}
.catch-ammo{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(218px,calc(env(safe-area-inset-bottom) + 218px));display:flex;gap:5px;direction:ltr;align-items:flex-end;padding:6px 8px;border-radius:14px;background:#0c1830b8;border:1px solid #ffffff30}
.catch-ammo i{position:relative;display:block;width:10px;height:20px;border-radius:5px 5px 4px 4px;background:linear-gradient(#fff3c4,#ffc84a 55%,#e08a1c);box-shadow:0 0 6px #ffd25e99;transition:transform .15s,opacity .15s}
.catch-ammo i[data-state=used]{background:#ffffff22;box-shadow:none;opacity:.6;transform:scale(.85)}
.catch-ammo i[data-state=next]{background:#ffffff22;box-shadow:none;overflow:hidden}
.catch-ammo i[data-state=next]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--fill,0%);background:linear-gradient(#ffe9a8,#ffc84a);opacity:.85}
.catch-ammo i.pop{animation:catch-pip-pop .4s cubic-bezier(.2,1.6,.4,1)}
.catch-ammo.shake{animation:catch-ammo-shake .35s ease-in-out}
.catch-reticle{position:absolute;width:66px;height:66px;margin:-33px 0 0 -33px;border-radius:50%;border:3px solid #fff;color:#fff;box-shadow:0 0 12px #000a,inset 0 0 12px #0006;pointer-events:none;transition:border-color .15s,color .15s}
.catch-reticle i{position:absolute;background:currentColor;border-radius:2px}
.catch-reticle i:nth-child(1){left:50%;top:-12px;width:3px;height:14px;margin-left:-1.5px}
.catch-reticle i:nth-child(2){left:50%;bottom:-12px;width:3px;height:14px;margin-left:-1.5px}
.catch-reticle i:nth-child(3){top:50%;left:-12px;height:3px;width:14px;margin-top:-1.5px}
.catch-reticle i:nth-child(4){top:50%;right:-12px;height:3px;width:14px;margin-top:-1.5px}
.catch-reticle i:nth-child(5){left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%}
.catch-reticle b{position:absolute;left:50%;top:100%;transform:translate(-50%,8px);font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 3px #000c;direction:rtl}
.catch-reticle[data-q=green]{border-color:#7dffb0;color:#7dffb0;box-shadow:0 0 14px #7dffb088,inset 0 0 12px #0006}
.catch-reticle[data-q=yellow]{border-color:#ffe08a;color:#ffe08a}
.catch-reticle[data-q=grey]{border-color:#ffffff88;color:#ffffff88;border-style:dashed}
.catch-reticle.lock{animation:catch-lock .38s cubic-bezier(.2,1.4,.4,1)}
.catch-reticle.hit{animation:catch-reticle-hit .45s ease-out}
.catch-reticle.miss{animation:catch-reticle-miss .4s ease-in-out}
.catch-lock-hint{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:6px 14px;border-radius:16px;background:#0c1830c4;border:1px dashed #7dffb0aa;color:#e7fff0;font-size:13px;font-weight:700;white-space:nowrap;direction:rtl;animation:catch-pulse 1.6s ease-in-out infinite;transition:opacity .4s}
.catch-lock-hint.fade{opacity:0}
.catch-fire[hidden],.catch-ammo[hidden],.catch-reticle[hidden],.catch-lock-hint[hidden]{display:none!important}
@keyframes catch-fire-ready{0%,100%{border-color:#ffd6c8}50%{border-color:#fff8e8}}
@keyframes catch-pip-pop{0%{transform:scale(.6) translateY(6px)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes catch-ammo-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes catch-lock{0%{transform:scale(1.9);opacity:0}60%{transform:scale(.92);opacity:1}100%{transform:scale(1)}}
@keyframes catch-reticle-hit{0%{transform:scale(1);border-color:#fff;box-shadow:0 0 30px #fff}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes catch-reticle-miss{0%,100%{transform:translateX(0)}30%{transform:translateX(-5px);border-color:#ff9b8c}70%{transform:translateX(5px);border-color:#ff9b8c}}
@media(max-height:360px){.catch-fire{width:72px;height:72px;font-size:13px;bottom:max(112px,calc(env(safe-area-inset-bottom) + 112px))}.catch-ammo{bottom:max(192px,calc(env(safe-area-inset-bottom) + 192px))}}
@media(prefers-reduced-motion:reduce){.catch-fire[data-locked=true]{animation:none}.catch-reticle.lock,.catch-reticle.hit,.catch-reticle.miss,.catch-ammo i.pop,.catch-ammo.shake,.catch-lock-hint{animation:none}}
`;

function node(doc, tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function icon(doc, size) {
  const s = doc.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round');
  s.innerHTML = '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>';
  return s;
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/** @param {{hud: HTMLElement, stageEl: HTMLElement, t: Function, gun: () => object, project: (x, y, z) => {x, y, visible}, crimWorld: () => {x, y, z}, onFire: Function, active?: () => boolean}} opts */
export function installFireHud({hud, stageEl, t, gun, project, crimWorld, onFire, active}) {
  const doc = hud.ownerDocument, tt = (k, v) => resolveText(t, k, v);
  // the session's temporary fire controls (same class names) leave the DOM so one `.catch-fire` is on the page
  for (const old of hud.querySelectorAll('.catch-fire,.catch-ammo,.catch-reticle')) old.remove();
  const styleHost = stageEl || hud;
  let style = styleHost.querySelector(':scope > style[data-catch-fire-hud]');
  if (!style) { style = node(doc, 'style'); style.dataset.catchFireHud = '1'; style.textContent = CSS; styleHost.append(style); }

  const button = node(doc, 'button', 'catch-fire'); button.type = 'button'; button.setAttribute('aria-label', tt('catch.fireHint'));
  button.dataset.locked = 'false'; button.dataset.reload = 'false'; button.dataset.empty = 'false';
  const arc = doc.createElementNS(SVG, 'svg'); arc.setAttribute('class', 'catch-fire-arc'); arc.setAttribute('viewBox', '0 0 100 100'); arc.setAttribute('aria-hidden', 'true');
  const arcCircle = doc.createElementNS(SVG, 'circle'); arcCircle.setAttribute('cx', '50'); arcCircle.setAttribute('cy', '50'); arcCircle.setAttribute('r', '46');
  const ARC = 2 * Math.PI * 46; arcCircle.setAttribute('stroke-dasharray', String(ARC)); arcCircle.setAttribute('stroke-dashoffset', String(ARC)); arc.append(arcCircle);
  button.append(arc, icon(doc, 30), node(doc, 'span', '', tt('catch.fire')));
  const ammo = node(doc, 'div', 'catch-ammo'); ammo.setAttribute('role', 'img'); let pipNodes = [];
  const reticle = node(doc, 'div', 'catch-reticle'); reticle.hidden = true; reticle.setAttribute('role', 'img'); reticle.setAttribute('aria-label', tt('catch.reticle'));
  for (let i = 0; i < 5; i++) reticle.append(node(doc, 'i'));
  const chanceText = node(doc, 'b'); reticle.append(chanceText);
  const hint = node(doc, 'div', 'catch-lock-hint', tt('catch.lockHint')); hint.hidden = true;
  hud.append(button, ammo, reticle, hint);

  let shown = true, disposed = false, lastAmmo = -1, hintShown = false, hintTimer = 0, wasReloading = false;
  const fire = e => { if (e) e.preventDefault(); if (disposed) return; replay(button, 'kick'); setTimeout(() => button.classList.remove('kick'), 90); onFire?.(); };
  button.addEventListener('pointerdown', fire);
  button.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') fire(e); });
  // a tap on the reticle region is not a control: the fire button is the only control (the car is the target of the shot, nothing else)

  function showHint() {
    if (hintShown) return; hintShown = true;
    try { if (globalThis.localStorage?.getItem('island.catch.lockHint') === '2') return; const n = Number(globalThis.localStorage?.getItem('island.catch.lockHint') || 0); globalThis.localStorage?.setItem('island.catch.lockHint', String(n + 1)); } catch { /* private mode */ }
    hint.hidden = false; hint.classList.remove('fade');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.classList.add('fade'); hintTimer = setTimeout(() => { hint.hidden = true; }, 450); }, 3200);
  }
  function refresh() {
    if (disposed) return;
    let g; try { g = gun?.(); } catch { g = null; }
    const st = g?.state;
    const on = shown && Boolean(st) && !st.stopped && (active ? active() : true);
    button.hidden = !on; ammo.hidden = !on;
    if (!on) { reticle.hidden = true; return; }
    const B = g.balance || {};
    button.dataset.locked = String(Boolean(st.locked)); button.dataset.reload = String(st.reload > 0); button.dataset.empty = String(st.ammo <= 0);
    // the gun arms after the opening stretch of the chase: the button shows the seconds left until then
    button.dataset.arming = String(st.armed === false); if (st.armed === false) { if (!button.armLabel) { button.armLabel = document.createElement('small'); button.armLabel.className = 'catch-fire-arm'; button.append(button.armLabel); } button.armLabel.textContent = String(Math.ceil(st.armIn || 0)); } else if (button.armLabel) { button.armLabel.remove(); button.armLabel = null; }
    button.disabled = false;
    const prog = reloadProgress(st, B); arcCircle.setAttribute('stroke-dashoffset', String(ARC * (1 - prog)));
    if (st.reload > 0) wasReloading = true; else if (wasReloading) { wasReloading = false; }
    const {pips, trickle} = pipStates(st, B);
    if (pipNodes.length !== pips.length) { ammo.replaceChildren(); pipNodes = pips.map(() => { const i = node(doc, 'i'); ammo.append(i); return i; }); }
    pips.forEach((state, i) => { const n = pipNodes[i]; if (n.dataset.state !== state) { n.dataset.state = state; if (state === 'full' && lastAmmo >= 0 && i >= lastAmmo) replay(n, 'pop'); } if (state === 'next') n.style.setProperty('--fill', Math.round(trickle * 100) + '%'); else n.style.removeProperty('--fill'); });
    lastAmmo = st.ammo;
    ammo.setAttribute('aria-label', tt('catch.ammo', {count: st.ammo}));
    if (st.locked) {
      let p = null; try { const w = crimWorld(); p = project(w.x, (w.y ?? .5) + .25, w.z); } catch { p = null; }
      if (p && p.visible) {
        reticle.hidden = false; reticle.style.left = p.x + 'px'; reticle.style.top = p.y + 'px'; reticle.dataset.q = reticleQuality(st.hitChance);
        const pct = Math.round(st.hitChance * 100); chanceText.textContent = pct + '%'; reticle.setAttribute('aria-label', tt('catch.hitChance', {percent: pct}));
      } else reticle.hidden = true;
    } else reticle.hidden = true;
  }
  function handle(events) {
    if (disposed) return;
    for (const e of events || []) {
      if (e.type === 'lock' && e.on) { replay(reticle, 'lock'); showHint(); }
      else if (e.type === 'shot') { replay(reticle, e.hit ? 'hit' : 'miss'); }
      else if (e.type === 'noAmmo') { replay(ammo, 'shake'); }
      else if (e.type === 'stopped') { reticle.hidden = true; }
    }
  }
  return {
    refresh, handle,
    show(value) { shown = Boolean(value); refresh(); if (!shown) { reticle.hidden = true; hint.hidden = true; } },
    get button() { return button; },
    dispose() { disposed = true; clearTimeout(hintTimer); button.remove(); ammo.remove(); reticle.remove(); hint.remove(); },
  };
}
