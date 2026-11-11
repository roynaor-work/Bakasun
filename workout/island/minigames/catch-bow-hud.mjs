/** v6 "תפוס את הפושע": the archery controls, like Archery Master. Touch and hold anywhere = the string is drawn (full power);
 * drag = move the sight (yaw from the horizontal movement, pitch from the vertical, dragging up raises the aim);
 * the sight sways a little while you hold, more the longer you hold; lift the finger = the net flies. A tap that is too short cancels.
 * Keyboard: arrows move the sight, space or enter releases the net. Pure helpers (dragToAim, holdSway) are exported for tests. */
export const BOW_CONTROLS = Object.freeze({yawPerPx: .11, anglePerPx: .11, minHoldSeconds: .15, cancelPx: 4, swayAfter: 1.2, swayMax: 1.6, swayAngleK: .7});
export const STRINGS = Object.freeze({
  'catch.bow.hint': 'נוגעים ומחזיקים כדי למתוח, גוררים כדי לכוון, ומשחררים כדי לזרוק',
  'catch.bow.distance': 'מרחק {m} מ׳', 'catch.bow.drawn': 'מתוח', 'catch.bow.ready': 'מוכן',
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The angle at full draw whose wind-free arc passes the thief's chest at his distance: the sight starts on the target,
 * and the player adjusts for wind and movement like an archer. Binary search on the engine's own trajectory. */
export function autoAngle(engine, targetY = 1.0) {
  const c = engine.criminalAt(engine.clock), P = engine.balance.physics;
  const heightAt = angle => { const f = engine.trajectory(angle, 1, engine.aim.tool, {withWind: false, yaw: 0, stopAtObstacle: false}); const at = f.path.find(p => p.x >= c.x); return at ? at.y : -99; };
  let lo = P.angle.min, hi = Math.min(P.angle.max, 45);
  if (heightAt(lo) > targetY) return lo;
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (heightAt(mid) < targetY) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** Finger movement (px) to the aim: yaw grows to the right, the angle grows when the finger moves up. */
export function dragToAim(dx, dy, start, C = BOW_CONTROLS) { return {yaw: start.yaw + dx * C.yawPerPx, angle: start.angle - dy * C.anglePerPx}; }
/** Sway of the sight (degrees) after holding the string for `held` seconds: nothing for the first swayAfter seconds, then it grows to swayMax over three seconds. */
export function holdSway(held, t, stage = 1, C = BOW_CONTROLS) {
  const k = clamp((held - C.swayAfter) / 3, 0, 1) * (.6 + stage * .04);
  const amp = C.swayMax * k;
  return {yaw: amp * Math.sin(t * 2.1), angle: amp * C.swayAngleK * Math.sin(t * 2.7 + 1.3)};
}

const STYLE = `
.catch-bow-sight{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #000a,inset 0 0 8px #0006;pointer-events:none;transition:border-color .15s,transform .15s}
.catch-bow-sight::after{content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;box-shadow:0 0 6px #000a}
.catch-bow-sight::before{content:"";position:absolute;inset:-11px;border-radius:50%;background:conic-gradient(from -2deg,#fff 0 4deg,transparent 4deg 86deg,#fff 86deg 94deg,transparent 94deg 176deg,#fff 176deg 184deg,transparent 184deg 266deg,#fff 266deg 274deg,transparent 274deg 356deg,#fff 356deg);-webkit-mask:radial-gradient(circle,transparent 25px,#000 26px,#000 31px,transparent 32px);mask:radial-gradient(circle,transparent 25px,#000 26px,#000 31px,transparent 32px);opacity:.9}
.catch-bow-sight[data-drawn=true]{border-color:#ffe08a;box-shadow:0 0 14px #ffd25e99,inset 0 0 8px #0006;transform:scale(.9)}
.catch-bow-sight[data-drawn=true]::after,.catch-bow-sight[data-drawn=true]::before{background:#ffe08a}
.catch-bow-sight[data-drawn=true]::before{background:conic-gradient(from -2deg,#ffe08a 0 4deg,transparent 4deg 86deg,#ffe08a 86deg 94deg,transparent 94deg 176deg,#ffe08a 176deg 184deg,transparent 184deg 266deg,#ffe08a 266deg 274deg,transparent 274deg 356deg,#ffe08a 356deg)}
.catch-bow-sight[data-hit=true]{border-color:#7dffb0;box-shadow:0 0 16px #7dffb0aa,inset 0 0 8px #0006}
.catch-bow-sight[data-hit=true]::after{background:#7dffb0}
.catch-bow-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%,transparent 48%,#061020 100%);transition:opacity .12s linear}
.catch-bow-pulse{animation:catch-bow-pulse .55s cubic-bezier(.2,1.6,.4,1)}
@keyframes catch-bow-pulse{0%{transform:scale(1)}35%{transform:scale(1.28);box-shadow:0 0 18px #7dffb0cc}100%{transform:scale(1)}}
.catch-bow-sight[hidden],.catch-bow-draw[hidden],.catch-bow-hint[hidden]{display:none}
.catch-bow-draw{position:absolute;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);width:140px;height:10px;border-radius:6px;background:#0c1830b8;border:1px solid #ffffff40;overflow:hidden;pointer-events:none}
.catch-bow-draw i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8fdcff,#ffe08a)}
.catch-bow-dist{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));padding:6px 12px;border-radius:14px;background:#0c1830b8;border:1px solid #ffffff30;font-size:14px;font-weight:700;color:#ffe08a}
.catch-bow-hint{position:absolute;left:50%;top:60%;transform:translateX(-50%);padding:6px 14px;border-radius:16px;background:#0c1830c4;border:1px dashed #8fdcffaa;font-size:13px;font-weight:700;white-space:nowrap}
.catch-hud[data-v6] .catch-tools{bottom:max(60px,calc(env(safe-area-inset-bottom) + 46px))}
`;

export function installBowHud({hud, stageEl, doc = document, t: tOuter, engine, balance, onRelease, audio, stage: getStage = () => null, project = null, level = 1}) {
  const C = {...BOW_CONTROLS, ...(balance?.bow || {})};
  const t = (key, vars) => { let v = tOuter ? tOuter(key, vars) : undefined; if (v == null || v === key) { const str = STRINGS[key]; if (str) v = str.replace(/{(\w+)}/g, (_, x) => vars?.[x] ?? `{${x}}`); } return v ?? key; };
  const node = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const style = doc.createElement('style'); style.textContent = STYLE; stageEl.append(style);
  const vignette = node('div', 'catch-bow-vignette'); hud.prepend(vignette);
  const sight = node('div', 'catch-bow-sight'); sight.hidden = true; hud.append(sight);
  const draw = node('div', 'catch-bow-draw'), drawFill = node('i'); draw.append(drawFill); draw.hidden = true; hud.append(draw);
  const dist = node('div', 'catch-bow-dist'); hud.append(dist);
  const hint = node('div', 'catch-bow-hint', t('catch.bow.hint')); hud.append(hint);
  const abort = new AbortController();
  let drag = null, held = 0, shown = true, enabled = true, sway = {yaw: 0, angle: 0}, lastT = 0;
  const aiming = () => { const e = engine(); return e && e.state.phase === 'aim' && enabled && shown; };
  const settle = () => { const e = engine(); if (e && e.state.phase === 'aim') e.setAim({power: 1, yaw: 0, angle: autoAngle(e)}); };
  settle();
  stageEl.addEventListener('pointerdown', ev => {
    if (!aiming() || ev.target.closest('button,.catch-tools,.catch-help')) return;
    const e = engine(); e.setAim({power: 1});
    drag = {id: ev.pointerId, x: ev.clientX, y: ev.clientY, yaw: e.aim.yaw || 0, angle: e.aim.angle, moved: 0}; held = 0; lastT = 0;
    stageEl.setPointerCapture?.(ev.pointerId); hint.hidden = true; sight.dataset.drawn = 'true'; draw.hidden = false; audio?.cue?.('draw', 0);
  }, {signal: abort.signal});
  stageEl.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    const e = engine(); if (!e) return; const a = dragToAim(dx, dy, drag, C); drag.base = a; e.setAim({yaw: a.yaw - sway.yaw, angle: a.angle - sway.angle});
  }, {signal: abort.signal});
  const end = ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const fire = held >= C.minHoldSeconds || drag.moved > C.cancelPx; drag = null; sight.dataset.drawn = 'false'; draw.hidden = true;
    if (fire && aiming()) onRelease(); else audio?.cue?.('tool');
  };
  stageEl.addEventListener('pointerup', end, {signal: abort.signal}); stageEl.addEventListener('pointercancel', end, {signal: abort.signal});
  doc.addEventListener('keydown', ev => {
    if (!aiming()) return;
    const e = engine();
    if (ev.key === 'ArrowLeft') { e.setAim({yaw: (e.aim.yaw || 0) - 1}); ev.preventDefault(); }
    else if (ev.key === 'ArrowRight') { e.setAim({yaw: (e.aim.yaw || 0) + 1}); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { e.setAim({angle: e.aim.angle + 1}); ev.preventDefault(); }
    else if (ev.key === 'ArrowDown') { e.setAim({angle: e.aim.angle - 1}); ev.preventDefault(); }
  }, {signal: abort.signal});
  const api = {
    show(v) { shown = Boolean(v); for (const el of [sight, draw, dist, hint]) if (!v) el.hidden = true; if (v) { dist.hidden = false; hint.hidden = false; } },
    setEnabled(v) { enabled = Boolean(v); },
    /** Called by the session loop with the frame time: the hold sway and the drawn string. */
    tick(dt) {
      const e = engine(); if (!e) return;
      const st = getStage();
      if (drag && e.state.phase === 'aim') { held += dt; lastT += dt; const s = holdSway(held, lastT, level, C); sway = s; const base = drag.base || drag; e.setAim({yaw: base.yaw - s.yaw, angle: base.angle - s.angle}); drawFill.style.width = Math.round(clamp(held / .6, 0, 1) * 100) + '%'; if (audio?.cue && Math.floor(held * 10) !== Math.floor((held - dt) * 10)) audio.cue('draw', clamp(held / .6, 0, 1)); }
      const k = drag && e.state.phase === 'aim' ? clamp(held / .6, 0, 1) : 0;
      vignette.style.opacity = String(k * .6);
      st?.setDraw?.(k, sway);
    },
    refresh() {
      const e = engine(); if (!e || !shown) return;
      const st = getStage(), c = e.criminalAt(e.clock);
      dist.textContent = t('catch.bow.distance', {m: Math.round(Math.hypot(c.x, c.z))});
      const sp = st?.sightWorld?.();
      if (sp && project && e.state.phase === 'aim') { const p = project(sp.x, sp.y, sp.z); sight.hidden = !p.visible; sight.style.left = p.x + 'px'; sight.style.top = p.y + 'px'; sight.dataset.hit = String(Boolean(e.preview().hit)); }
      else sight.hidden = true;
      hint.hidden = Boolean(drag) || e.state.phase !== 'aim' || e.state.thrown > 0;
    },
    handle(events) {
      for (const e of events) {
        if (e.type === 'turn') settle();
        else if (e.type === 'catch' || e.type === 'bossHit') { const chip = hud.querySelector('.catch-chip'); if (chip) { chip.classList.remove('catch-bow-pulse'); void chip.offsetWidth; chip.classList.add('catch-bow-pulse'); } vignette.style.opacity = '0'; }
      }
    },
    dispose() { abort.abort(); for (const el of [sight, draw, dist, hint, vignette, style]) el.remove(); },
  };
  return api;
}
