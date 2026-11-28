/** v7 "תפוס את הפושע": the HUD of the chase arsenal (catch-weapons.mjs). One tool button that cycles the tools (like the
 * boar game's weapon button: icon, short name, what is left), the round fire button with its reload arc, the pips of the
 * tool in hand, a target ring on the tool's ZONE of the getaway car (green = on target, yellow = close, grey = far off)
 * and a small dot where the police car's line meets it: steer the dot into the ring and fire. For the spikes the ring is
 * where he will be when he reaches the strip and the dot is where the strip lands. A "close time" chip while he slows.
 * Pure presentation: rules in catch-weapons.mjs, keys (f / x fire, q / c tool) in the session. The pure helpers
 * (zoneWorld, dotWorld, toolLabel, pipStates7) are exported for the tests. Strings fall back to this module. */
import {STRINGS as TOOL_STRINGS} from './catch-weapons.mjs?v=island-v2-20261107-25';

export const STRINGS = Object.freeze({...TOOL_STRINGS,
  'catch.fire': 'ירי', 'catch.fireHint7': 'ירי בכלי שנבחר', 'catch.ammo7': 'מלאי: {count}', 'catch.reticle7': 'אזור המטרה של הכלי',
  'catch.lockHint7': 'מכניסים את הנקודה לעיגול. כשהעיגול ירוק, לוחצים ירי', 'catch.hitChance': 'סיכוי לפגיעה {percent}%',
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
/** v8: how far (metres, across the road at the zone) the dot may sit from the zone's centre and still count: the spike window, else the
 * assist cone at the zone's distance, else (no lock yet, or no assist) the zone's own half-width. The ring is drawn this size, so
 * "the dot inside the ring" is "on target". */
export function acceptHalfWidth(aim, tools) {
  if (Number.isFinite(aim?.window)) return aim.window;
  if (aim?.allowed > 0 && Number.isFinite(aim.dist)) return aim.dist * Math.tan(aim.allowed * Math.PI / 180);
  return tools?.[aim?.weapon]?.zone?.w ?? 1.4;
}
/** v8: the ring's size in pixels from the zone centre and its edge on screen (an ellipse lying on the road for the spikes). */
export function ringSize(center, edge, weapon) {
  const w = Math.round(clamp(2 * Math.hypot(edge.x - center.x, edge.y - center.y), 34, 170));
  return {w, h: weapon === 'spikes' ? Math.max(18, Math.round(w * .42)) : w};
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
/** v8: a ring sized to the area that counts, the target named over it, the reason under a grey ring, the spike ring lying on the road,
 * and a chip when the thief is behind the police car. */
const CSS8 = `
.catch-reticle[data-v8]{transition:border-color .12s,color .12s}
.catch-reticle[data-v8] em{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-5px);font-style:normal;font-size:12px;font-weight:800;white-space:nowrap;padding:1px 8px;border-radius:9px;background:#0c1830c8;color:#fff;text-shadow:none;direction:rtl}
.catch-reticle[data-v8][data-q=off]{border-color:#ffffffaa;color:#ffffffcc;border-style:dashed;box-shadow:0 0 8px #000a}
.catch-reticle[data-v8][data-tool=spikes]{border-style:dashed;border-width:3px}
.catch-reticle[data-v8][data-tool=spikes][data-q=green]{border-color:#ffd21f;color:#ffe680;box-shadow:0 0 16px #ffd21faa,inset 0 0 10px #0008}
.catch-reticle[data-v8][data-tool=spikes] svg{display:none}
.catch-reticle[data-v8][data-tool=emp]{border-width:4px}
.catch-behind8{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 40px);transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:16px;background:#3a0f0fd8;border:2px solid #ffb0a0;color:#fff;font-size:14px;font-weight:800;white-space:nowrap;direction:rtl}
.catch-behind8[hidden]{display:none!important}
`;
/** v25.2 (QA of v25.1; Roy: text must not cover the game): the target's name ("תא המטען", "גג") and the reason under the ring ("רחוק מדי")
 * floated over the fleeing car for the whole chase, and the bend notice ("פנייה שמאלה") sat on the damage bar. Now the name and the reason show
 * only for a moment after the child picks a tool or presses fire in vain (the ring and the hit chance stay, smaller), the bend notice is a
 * small chip at the side under the top row, and the tool's name wraps inside its button instead of being cut. ?catchLabels=old keeps the
 * previous labels. */
export function catchLabelsCompact(search = globalThis.location?.search || '') { try { return new URLSearchParams(search).get('catchLabels') !== 'old'; } catch { return true; } }
export const CATCH_LABEL_SECONDS = 2.5;
/** Pure: are the ring's words on screen `now` ms, when the child last picked a tool or fired in vain at `raisedAt` ms (null = never)? */
export function catchLabelsShown(now, raisedAt, seconds = CATCH_LABEL_SECONDS) { return raisedAt !== null && raisedAt !== undefined && now - raisedAt >= 0 && now - raisedAt < seconds * 1000; }
const CSS_COMPACT = `
[data-catch-labels=compact] .catch-reticle[data-v8] em{font-size:10px;font-weight:700;padding:0 6px;transform:translate(-50%,-3px);background:#0c1830a8}
[data-catch-labels=compact] .catch-reticle[data-v8] b{font-size:10px;transform:translate(-50%,3px)}
[data-catch-labels=compact] .catch-reticle[data-v8][data-labels=false] em{display:none}
[data-catch-labels=compact] .catch-reticle[data-v8][data-labels=false][data-q=off] b{display:none}
[data-catch-labels=compact] .catch-reticle[data-v8][data-labels=false][data-q=off]{opacity:.6}
[data-catch-labels=compact] .catch-bend{left:max(14px,env(safe-area-inset-left));top:calc(max(8px,env(safe-area-inset-top)) + 48px);transform:none;gap:5px;padding:3px 10px;border-width:1px;border-radius:14px;font-size:13px;background:#0c1830a8}
[data-catch-labels=compact] .catch-bend svg{width:18px;height:18px}
[data-catch-labels=compact] .catch-weapon strong{max-width:62px;font-size:11px;line-height:1.05;white-space:normal;text-align:center;text-wrap:balance}
`;
function node(doc, tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function icon(doc, name, size) {
  const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = TOOL_ICONS[name] || TOOL_ICONS.tyres; return s;
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/** @param {{hud, stageEl, t, chase: () => object, project: (x, y, z) => {x, y, visible}, onFire, onCycle, active?: () => boolean}} opts */
export function installArsenalHud({hud, stageEl, t, chase, project, onFire, onCycle, active, fix8 = false}) {
  const doc = hud.ownerDocument, tt = (k, v) => resolveText(t, k, v);
  for (const old of hud.querySelectorAll('.catch-fire,.catch-ammo,.catch-reticle')) old.remove(); // the session's temporary controls
  const host = stageEl || hud;
  let style = host.querySelector(':scope > style[data-catch-arsenal-hud]');
  if (!style) { style = node(doc, 'style'); style.dataset.catchArsenalHud = '1'; style.textContent = CSS + (fix8 ? CSS8 : ''); host.append(style); }
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
  const label = node(doc, 'em'); if (fix8) { reticle.dataset.v8 = '1'; reticle.append(label); }
  const dot = node(doc, 'div', 'catch-aimdot'); dot.hidden = true;
  const close = node(doc, 'div', 'catch-close7', tt('catch.pop.close')); close.hidden = true;
  const hint = node(doc, 'div', 'catch-lock-hint7', tt('catch.lockHint7')); hint.hidden = true;
  const behind = node(doc, 'div', 'catch-behind8'); behind.hidden = true; behind.setAttribute('role', 'status');
  if (fix8) { const arrow = doc.createElementNS(SVG, 'svg'); arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('width', 20); arrow.setAttribute('height', 20); arrow.setAttribute('aria-hidden', 'true'); arrow.innerHTML = '<path d="M12 4v15M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'; behind.append(arrow, node(doc, 'span', '', tt('catch.range.behind'))); }
  hud.append(reticle, dot, button, weapon, ammo, close, hint, ...(fix8 ? [behind] : []));
  let disposed = false, shown = true, lastTool = null, hintShown = false, hintTimer = 0, lastQ = null;
  const compact = fix8 && catchLabelsCompact(); let labelsAt = null, compactStyle = null;
  if (compact) { hud.dataset.catchLabels = 'compact'; compactStyle = doc.createElement('style'); compactStyle.textContent = CSS_COMPACT; hud.append(compactStyle); reticle.dataset.labels = 'false'; }
  const raiseLabels = () => { labelsAt = performance.now(); };
  const tmpA = {}, tmpB = {}, tmpC = {};
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
    if (!on) { reticle.hidden = true; dot.hidden = true; close.hidden = true; behind.hidden = true; veil.dataset.on = 'false'; return; }
    const B = gun.balance || {};
    if (st.weapon !== lastTool) { raiseLabels(); lastTool = st.weapon; wIcon.replaceChildren(icon(doc, st.weapon, 22)); fireIcon.replaceChildren(icon(doc, st.weapon, 28)); reticleIcon.replaceChildren(icon(doc, st.weapon, 22)); weapon.setAttribute('aria-label', tt('catch.weapon.next', {name: tt('catch.weapon.' + st.weapon)})); }
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
    if (compact) { const on = String(catchLabelsShown(performance.now(), labelsAt)); if (reticle.dataset.labels !== on) reticle.dataset.labels = on; }
    if (fix8) { refresh8(ch, st, aim); return; }
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
  /** v8: the ring always shows where the tool in hand aims (grey with the reason when it cannot fire), sized to the area that counts and
   * named over it; behind the police car there is no ring but a chip that says he is behind. */
  function refresh8(ch, st, aim) {
    behind.hidden = !(aim && aim.reason === 'behind');
    if (!aim || !ch.track || aim.reason === 'behind') { reticle.hidden = true; dot.hidden = true; lastQ = null; return; }
    const zw = zoneWorld(ch.track, ch, aim, tmpA), z = project(...xyz(zw)), d = project(...xyz(dotWorld(ch.track, ch, aim, tmpB)));
    const lane = aim.weapon === 'spikes' ? aim.predD : aim.zoneD; ch.track.toWorld(ch.state.crim.s + aim.zoneS, lane + acceptHalfWidth(aim, ch.gun.tools), tmpC); tmpC.y = zw.y;
    const size = ringSize(z, project(...xyz(tmpC)), aim.weapon), q = st.locked ? st.quality : 'off';
    if (z.visible) {
      reticle.hidden = false; reticle.style.left = z.x + 'px'; reticle.style.top = z.y + 'px'; reticle.dataset.q = q; reticle.dataset.tool = aim.weapon;
      reticle.style.width = size.w + 'px'; reticle.style.height = size.h + 'px'; reticle.style.margin = `${-size.h / 2}px 0 0 ${-size.w / 2}px`;
      label.textContent = tt('catch.target.' + aim.weapon);
      if (st.locked) { const pct = Math.round(st.hitChance * 100); chance.textContent = pct + '%'; reticle.setAttribute('aria-label', tt('catch.target.' + aim.weapon) + ': ' + tt('catch.hitChance', {percent: pct})); }
      else { chance.textContent = tt('catch.range.' + (aim.reason || 'far')); reticle.setAttribute('aria-label', tt('catch.target.' + aim.weapon) + ': ' + chance.textContent); }
      if (lastQ !== 'green' && q === 'green') replay(reticle, 'lock'); lastQ = q;
    } else reticle.hidden = true;
    if (d.visible) { dot.hidden = false; dot.style.left = d.x + 'px'; dot.style.top = d.y + 'px'; dot.dataset.q = q; } else dot.hidden = true;
    if (st.locked) showHint();
  }
  function handle(events) {
    if (disposed) return;
    for (const e of events || []) {
      if (e.type === 'shot' || (e.type === 'wshot' && !e.late)) replay(reticle, e.hit ? 'hit' : 'miss');
      else if (e.type === 'noAmmo') replay(weapon, 'flip');
      else if (e.type === 'stopped') { reticle.hidden = true; dot.hidden = true; behind.hidden = true; }
      else if (e.type === 'dry') { raiseLabels(); replay(reticle, 'miss'); }
    }
  }
  return {
    refresh, handle,
    show(v) { shown = Boolean(v); refresh(); if (!shown) { reticle.hidden = true; dot.hidden = true; hint.hidden = true; behind.hidden = true; } },
    get button() { return button; }, get weaponButton() { return weapon; },
    dispose() { disposed = true; clearTimeout(hintTimer); for (const el of [button, weapon, ammo, reticle, dot, close, hint, veil, behind]) el.remove(); if (compact) { delete hud.dataset.catchLabels; compactStyle.remove(); } },
  };
}
