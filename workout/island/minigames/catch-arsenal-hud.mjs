/** v7 "תפוס את הפושע": the HUD of the chase arsenal (catch-weapons.mjs). One tool button that cycles the tools (like the
 * boar game's weapon button: icon, short name, what is left), the round fire button with its reload arc, the pips of the
 * tool in hand, a target ring on the tool's ZONE of the getaway car (green = on target, yellow = close, grey = far off)
 * and a small dot where the police car's line meets it: steer the dot into the ring and fire. For the spikes the ring is
 * where he will be when he reaches the strip and the dot is where the strip lands. A "close time" chip while he slows.
 * Pure presentation: rules in catch-weapons.mjs, keys (f / x fire, q / c tool) in the session. The pure helpers
 * (zoneWorld, dotWorld, toolLabel, pipStates7) are exported for the tests. Strings fall back to this module. */
import {STRINGS as TOOL_STRINGS} from './catch-weapons.mjs?v=island-v2-20261107-12';

export const STRINGS = Object.freeze({...TOOL_STRINGS,
  'catch.fire': 'ירי', 'catch.fireHint7': 'ירי בכלי שנבחר', 'catch.ammo7': 'נשאר: {count}', 'catch.reticle7': 'אזור המטרה של הכלי',
  'catch.lockHint7': 'מכניסים את הנקודה לעיגול, וכשהוא ירוק לוחצים ירי', 'catch.hitChance': 'סיכוי לפגיעה {percent}%',
});
const SVG = 'http://www.w3.org/2000/svg';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const TOOL_ICONS = Object.freeze({
  tyres: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  net: '<path d="M4 8c3-4 13-4 16 0M4 8l2 11M20 8l-2 11M4 8h16M8 8l1.5 11M16 8l-1.5 11M12 8v11M5 13.5h14"/>',
  spikes: '<path d="M2 18h20M4 18l2-6 2 6M9 18l2-7 2 7M14 18l2-6 2 6"/>',
  emp: '<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8Z"/>',
  mark: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
});

/** World point of the zone of the tool in hand: on the getaway car, or for the spikes on the road where he will be. */
export function zoneWorld(track, chase, aim, out = {}) {
  const c = chase.state.crim, d = aim.weapon === 'spikes' ? aim.predD : aim.zoneD;
  track.toWorld(c.s + aim.zoneS, d, out); out.y = aim.zoneY; return out;
}
/** World point of the police car's line at the zone's distance (for the spikes: where the strip lands). */
export function dotWorld(track, chase, aim, out = {}) {
  const st = chase.state, c = st.crim; track.toWorld(c.s + aim.zoneS, st.d, out); out.y = aim.zoneY; return out;
}
export function toolLabel(state, t) { const w = state.perTool?.[state.weapon] || state; return {name: t('catch.weapon.' + state.weapon), left: `${w.ammo}/${w.ammoMax}`}; }
export function pipStates7(state, balance) {
  const total = balance?.trickleSeconds || 1, out = [];
  for (let i = 0; i < state.ammoMax; i++) out.push(i < state.ammo ? 'full' : i === state.ammo ? 'next' : 'used');
  return {pips: out, trickle: state.ammo < state.ammoMax ? clamp(1 - (state.trickle ?? total) / total, 0, 1) : 0};
}
export function resolveText(t, key, vars) {
  let v; try { v = t?.(key, vars); } catch { v = undefined; }
  if (v === undefined || v === null || v === key || v === '') v = STRINGS[key] || key;
  return String(v).replace(/{(\w+)}/g, (_, x) => vars?.[x] ?? `{${x}}`);
}

const CSS = `
.catch-fire{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(126px,calc(env(safe-area-inset-bottom) + 126px));width:84px;height:84px;border-radius:50%;border:3px solid #ffd6c8;background:radial-gradient(circle at 35% 28%,#ff9d7a,#d8401f 72%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:14px;font-weight:800;box-shadow:0 5px 0 #7a1f0a,0 8px 22px #0008;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .08s,box-shadow .08s,opacity .2s,filter .2s;font-family:inherit}
.catch-fire:active,.catch-fire.kick{transform:translateY(4px);box-shadow:0 1px 0 #7a1f0a,0 4px 12px #0008}
.catch-fire[data-locked=false]{opacity:.55;filter:grayscale(.6)}
.catch-fire[data-empty=true]{opacity:.45;filter:grayscale(.8)}
.catch-fire[data-q=green][data-reload=false][data-empty=false]{border-color:#c9ffe0;box-shadow:0 5px 0 #7a1f0a,0 8px 22px #0008,0 0 22px #7dffb0cc;animation:catch-fire7-ready .9s ease-in-out infinite}
.catch-fire svg.arc{position:absolute;inset:-9px;width:calc(100% + 18px);height:calc(100% + 18px);transform:rotate(-90deg);pointer-events:none}
.catch-fire svg.arc circle{fill:none;stroke:#fff2b8;stroke-width:4;stroke-linecap:round;opacity:0;transition:opacity .15s}
.catch-fire[data-reload=true] svg.arc circle{opacity:.95}
.catch-fire:focus-visible,.catch-weapon:focus-visible{outline:3px solid #fff4bd;outline-offset:3px}
.catch-weapon{position:absolute;right:max(136px,calc(env(safe-area-inset-right) + 136px));bottom:max(200px,calc(env(safe-area-inset-bottom) + 200px));width:70px;height:70px;border-radius:16px;border:2px solid #ffd06b99;background:#12273ae0;color:#f4f3e9;display:grid;place-items:center;align-content:center;gap:1px;padding:3px;overflow:hidden;box-shadow:0 3px 10px #0007;cursor:pointer;pointer-events:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none;font-family:inherit}
.catch-weapon b{display:block;color:#ffd06b;line-height:0}
.catch-weapon strong{font-size:12px;line-height:1.1;white-space:nowrap}
.catch-weapon small{font-size:10px;color:#b9dde6;line-height:1.1;direction:ltr}
.catch-weapon i{position:absolute;bottom:0;left:0;height:3px;width:100%;background:#9ad9c0;transition:width .15s}
.catch-weapon.flip{animation:catch-weapon-flip .35s cubic-bezier(.2,1.6,.4,1)}
.catch-weapon[data-empty=true] small{color:#ffb067}
.catch-ammo{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(218px,calc(env(safe-area-inset-bottom) + 218px));display:flex;gap:5px;direction:ltr;align-items:flex-end;padding:6px 8px;border-radius:14px;background:#0c1830b8;border:1px solid #ffffff30}
.catch-ammo i{position:relative;display:block;width:10px;height:20px;border-radius:5px 5px 4px 4px;background:linear-gradient(#fff3c4,#ffc84a 55%,#e08a1c);box-shadow:0 0 6px #ffd25e99}
.catch-ammo i[data-state=used]{background:#ffffff22;box-shadow:none;opacity:.6;transform:scale(.85)}
.catch-ammo i[data-state=next]{background:#ffffff22;box-shadow:none;overflow:hidden}
.catch-ammo i[data-state=next]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--fill,0%);background:linear-gradient(#ffe9a8,#ffc84a);opacity:.85}
.catch-reticle{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:3px solid #fff;color:#fff;box-shadow:0 0 12px #000a,inset 0 0 12px #0006;pointer-events:none;transition:border-color .12s,color .12s,width .12s,height .12s,margin .12s}
.catch-reticle b{position:absolute;left:50%;top:100%;transform:translate(-50%,6px);font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 3px #000c;direction:rtl}
.catch-reticle svg{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;opacity:.85}
.catch-reticle[data-q=green]{border-color:#7dffb0;color:#7dffb0;box-shadow:0 0 18px #7dffb0aa,inset 0 0 12px #0006}
.catch-reticle[data-q=yellow]{border-color:#ffe08a;color:#ffe08a}
.catch-reticle[data-q=grey]{border-color:#ffffff99;color:#ffffffaa;border-style:dashed}
.catch-reticle.lock{animation:catch-lock7 .38s cubic-bezier(.2,1.4,.4,1)}
.catch-reticle.hit{animation:catch-hit7 .45s ease-out}
.catch-reticle.miss{animation:catch-miss7 .4s ease-in-out}
.catch-aimdot{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;border:2px solid #12294d;box-shadow:0 0 8px #000c;pointer-events:none}
.catch-aimdot[data-q=green]{background:#7dffb0}
.catch-close7{position:absolute;left:max(14px,env(safe-area-inset-left));top:calc(max(8px,env(safe-area-inset-top)) + 6px);padding:4px 14px;border-radius:14px;background:#0b2a4ad8;border:2px solid #8fdcff;color:#d8f3ff;font-size:14px;font-weight:800;white-space:nowrap}
.catch-close7-veil{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 55%,transparent 55%,#4fb6ff40 100%);opacity:0;transition:opacity .2s}
.catch-close7-veil[data-on=true]{opacity:1}
.catch-lock-hint7{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:6px 14px;border-radius:16px;background:#0c1830c4;border:1px dashed #7dffb0aa;color:#e7fff0;font-size:13px;font-weight:700;white-space:nowrap;direction:rtl;transition:opacity .4s}
.catch-lock-hint7.fade{opacity:0}
.catch-fire[hidden],.catch-weapon[hidden],.catch-ammo[hidden],.catch-reticle[hidden],.catch-aimdot[hidden],.catch-close7[hidden],.catch-lock-hint7[hidden]{display:none!important}
@keyframes catch-fire7-ready{0%,100%{border-color:#c9ffe0}50%{border-color:#ffffff}}
@keyframes catch-weapon-flip{0%{transform:scale(.8) rotate(-8deg)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes catch-lock7{0%{transform:scale(1.8);opacity:0}60%{transform:scale(.92);opacity:1}100%{transform:scale(1)}}
@keyframes catch-hit7{0%{transform:scale(1);box-shadow:0 0 30px #fff}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes catch-miss7{0%,100%{transform:translateX(0)}30%{transform:translateX(-5px)}70%{transform:translateX(5px)}}
@media(max-height:360px){.catch-fire{width:72px;height:72px;font-size:13px;bottom:max(112px,calc(env(safe-area-inset-bottom) + 112px))}.catch-ammo{bottom:max(192px,calc(env(safe-area-inset-bottom) + 192px))}.catch-weapon{bottom:max(186px,calc(env(safe-area-inset-bottom) + 186px));width:62px;height:62px}}
@media(prefers-reduced-motion:reduce){.catch-fire,.catch-reticle,.catch-weapon{animation:none!important}}
`;
function node(doc, tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function icon(doc, name, size) {
  const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = TOOL_ICONS[name] || TOOL_ICONS.tyres; return s;
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/** @param {{hud, stageEl, t, chase: () => object, project: (x, y, z) => {x, y, visible}, onFire, onCycle, active?: () => boolean}} opts */
export function installArsenalHud({hud, stageEl, t, chase, project, onFire, onCycle, active}) {
  const doc = hud.ownerDocument, tt = (k, v) => resolveText(t, k, v);
  for (const old of hud.querySelectorAll('.catch-fire,.catch-ammo,.catch-reticle')) old.remove(); // the session's temporary controls
  const host = stageEl || hud;
  let style = host.querySelector(':scope > style[data-catch-arsenal-hud]');
  if (!style) { style = node(doc, 'style'); style.dataset.catchArsenalHud = '1'; style.textContent = CSS; host.append(style); }
  const veil = node(doc, 'div', 'catch-close7-veil'); hud.prepend(veil);
  const button = node(doc, 'button', 'catch-fire'); button.type = 'button'; button.setAttribute('aria-label', tt('catch.fireHint7'));
  button.dataset.locked = 'false'; button.dataset.reload = 'false'; button.dataset.empty = 'false';
  const arc = doc.createElementNS(SVG, 'svg'); arc.setAttribute('class', 'arc'); arc.setAttribute('viewBox', '0 0 100 100'); arc.setAttribute('aria-hidden', 'true');
  const arcCircle = doc.createElementNS(SVG, 'circle'); arcCircle.setAttribute('cx', '50'); arcCircle.setAttribute('cy', '50'); arcCircle.setAttribute('r', '46');
  const ARC = 2 * Math.PI * 46; arcCircle.setAttribute('stroke-dasharray', String(ARC)); arcCircle.setAttribute('stroke-dashoffset', String(ARC)); arc.append(arcCircle);
  const fireIcon = node(doc, 'span'); fireIcon.append(icon(doc, 'tyres', 30));
  button.append(arc, fireIcon, node(doc, 'span', '', tt('catch.fire')));
  const weapon = node(doc, 'button', 'catch-weapon'); weapon.type = 'button';
  const wIcon = node(doc, 'b'), wName = node(doc, 'strong'), wLeft = node(doc, 'small'), wBar = node(doc, 'i'); weapon.append(wIcon, wName, wLeft, wBar);
  const ammo = node(doc, 'div', 'catch-ammo'); ammo.setAttribute('role', 'img'); let pipNodes = [];
  const reticle = node(doc, 'div', 'catch-reticle'); reticle.hidden = true; reticle.setAttribute('role', 'img'); reticle.setAttribute('aria-label', tt('catch.reticle7'));
  const reticleIcon = node(doc, 'span'); const chance = node(doc, 'b'); reticle.append(reticleIcon, chance);
  const dot = node(doc, 'div', 'catch-aimdot'); dot.hidden = true;
  const close = node(doc, 'div', 'catch-close7', tt('catch.pop.close')); close.hidden = true;
  const hint = node(doc, 'div', 'catch-lock-hint7', tt('catch.lockHint7')); hint.hidden = true;
  hud.append(reticle, dot, button, weapon, ammo, close, hint);
  let disposed = false, shown = true, lastTool = null, hintShown = false, hintTimer = 0, lastQ = null;
  const tmpA = {}, tmpB = {};
  const fire = e => { if (e) e.preventDefault(); if (disposed) return; replay(button, 'kick'); setTimeout(() => button.classList.remove('kick'), 90); onFire?.(); };
  const cycle = e => { if (e) e.preventDefault(); if (disposed) return; onCycle?.(); replay(weapon, 'flip'); };
  button.addEventListener('pointerdown', fire); button.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') fire(e); });
  weapon.addEventListener('pointerdown', cycle); weapon.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') cycle(e); });
  function showHint() {
    if (hintShown) return; hintShown = true;
    try { const n = Number(globalThis.localStorage?.getItem('island.catch.lockHint7') || 0); if (n >= 2) return; globalThis.localStorage?.setItem('island.catch.lockHint7', String(n + 1)); } catch { /* private mode */ }
    hint.hidden = false; hint.classList.remove('fade'); clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.classList.add('fade'); hintTimer = setTimeout(() => { hint.hidden = true; }, 450); }, 3600);
  }
  function refresh() {
    if (disposed) return;
    let ch; try { ch = chase?.(); } catch { ch = null; }
    const gun = ch?.gun, st = gun?.state, on = shown && Boolean(st) && !st.stopped && (active ? active() : true);
    for (const el of [button, weapon, ammo]) el.hidden = !on;
    if (!on) { reticle.hidden = true; dot.hidden = true; close.hidden = true; veil.dataset.on = 'false'; return; }
    const B = gun.balance || {};
    if (st.weapon !== lastTool) { lastTool = st.weapon; wIcon.replaceChildren(icon(doc, st.weapon, 22)); fireIcon.replaceChildren(icon(doc, st.weapon, 28)); reticleIcon.replaceChildren(icon(doc, st.weapon, 22)); weapon.setAttribute('aria-label', tt('catch.weapon.next', {name: tt('catch.weapon.' + st.weapon)})); }
    const lab = toolLabel(st, tt); wName.textContent = lab.name; wLeft.textContent = lab.left; weapon.dataset.empty = String(st.ammo <= 0);
    wBar.style.width = Math.round(st.reload > 0 ? (1 - st.reload / (B.reloadSeconds || 1)) * 100 : st.ammo / Math.max(1, st.ammoMax) * 100) + '%';
    button.dataset.locked = String(Boolean(st.locked)); button.dataset.reload = String(st.reload > 0); button.dataset.empty = String(st.ammo <= 0); button.dataset.q = st.locked ? st.quality : 'grey';
    arcCircle.setAttribute('stroke-dashoffset', String(ARC * (st.reload > 0 ? st.reload / (B.reloadSeconds || 1) : 0)));
    const {pips, trickle} = pipStates7(st, B);
    if (pipNodes.length !== pips.length) { ammo.replaceChildren(); pipNodes = pips.map(() => { const i = node(doc, 'i'); ammo.append(i); return i; }); }
    pips.forEach((p, i) => { const n = pipNodes[i]; n.dataset.state = p; if (p === 'next') n.style.setProperty('--fill', Math.round(trickle * 100) + '%'); else n.style.removeProperty('--fill'); });
    ammo.setAttribute('aria-label', tt('catch.ammo7', {count: st.ammo}));
    close.hidden = !(st.closeT > 0); veil.dataset.on = String(st.closeT > 0);
    const aim = gun.aimInfo?.();
    if (st.locked && aim && ch.track) {
      const z = project(...xyz(zoneWorld(ch.track, ch, aim, tmpA))), d = project(...xyz(dotWorld(ch.track, ch, aim, tmpB)));
      if (z.visible) {
        reticle.hidden = false; reticle.style.left = z.x + 'px'; reticle.style.top = z.y + 'px'; reticle.dataset.q = st.quality;
        const pct = Math.round(st.hitChance * 100); chance.textContent = pct + '%'; reticle.setAttribute('aria-label', tt('catch.hitChance', {percent: pct}));
        if (lastQ !== 'green' && st.quality === 'green') replay(reticle, 'lock'); lastQ = st.quality;
      } else reticle.hidden = true;
      if (d.visible) { dot.hidden = false; dot.style.left = d.x + 'px'; dot.style.top = d.y + 'px'; dot.dataset.q = st.quality; } else dot.hidden = true;
      showHint();
    } else { reticle.hidden = true; dot.hidden = true; lastQ = null; }
  }
  const xyz = p => [p.x, p.y, p.z];
  function handle(events) {
    if (disposed) return;
    for (const e of events || []) {
      if (e.type === 'shot' || (e.type === 'wshot' && !e.late)) replay(reticle, e.hit ? 'hit' : 'miss');
      else if (e.type === 'noAmmo') replay(weapon, 'flip');
      else if (e.type === 'stopped') { reticle.hidden = true; dot.hidden = true; }
    }
  }
  return {
    refresh, handle,
    show(v) { shown = Boolean(v); refresh(); if (!shown) { reticle.hidden = true; dot.hidden = true; hint.hidden = true; } },
    get button() { return button; }, get weaponButton() { return weapon; },
    dispose() { disposed = true; clearTimeout(hintTimer); for (const el of [button, weapon, ammo, reticle, dot, close, hint, veil]) el.remove(); },
  };
}
