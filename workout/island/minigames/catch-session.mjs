import {createCatchEngine} from './catch-engine.mjs?v=island-v2-20261107-1';
import {createCatchAudio} from './catch-audio.mjs?v=island-v2-20261107-1';

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  narrow: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/>',
  wide: '<path d="M3 9c3-5 15-5 18 0M3 9l3 11M21 9l-3 11M3 9h18M7 9l2 11M17 9l-2 11M12 9v11M5 15h14"/>',
  rope: '<ellipse cx="14" cy="10" rx="7" ry="5"/><path d="M8 13c-3 1-5 4-6 8M2 21l5 0"/>',
  throw: '<path d="M4 17c3-9 9-12 16-12M20 5l-5-1M20 5l-2 5"/><circle cx="6" cy="18" r="2.2"/>',
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function svg(name, size = 28) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = ICONS[name] || ''; return s;
}
function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

/** Controller for one catch match: owns the engine, the view, the loop, the input and the HUD.
 * The island engine owns the rewards; this reports the finished match once through ctx.finish.
 * Without a canvas it runs headless (tests). */
export function runCatchSession(ctx) {
  const balance = ctx.balance, stage = ctx.level || 1, t = ctx.t || (key => key), P = balance.controls;
  const policeLevel = (ctx.state?.buildings || []).filter(b => b.typeId === 'police').reduce((n, b) => n + (b.level || 1), 0);
  const prisonLevel = (ctx.state?.buildings || []).filter(b => b.typeId === 'prison').reduce((n, b) => n + (b.level || 1), 0);
  const city = {police: Math.min(balance.city.policeMax, policeLevel * balance.city.policeRadiusPerLevel), prison: Math.min(balance.city.prisonMax, prisonLevel * balance.city.prisonCoinPerLevel)};
  const engine = createCatchEngine({balance, stage, seed: ctx.seed, equipment: ctx.equipment, city});
  let view = null, audio = null, hud = null, disposed = false, paused = false, finished = false, helpOpen = false, raf = 0, last = 0, acc = 0, slow = 0, error = null, loadFailed = false;
  const abort = new AbortController(), hudNodes = {};
  const session = {
    setPaused(value) { paused = Boolean(value); last = 0; audio?.setPaused?.(paused); },
    dispose() {
      if (disposed) return; disposed = true; if (raf) cancelAnimationFrame(raf); abort.abort();
      try { view?.dispose(); } catch { /* the page is going away anyway */ }
      audio?.dispose?.(); hud?.remove();
      ctx.controls?.removeAttribute('hidden');
    },
    get snapshot() { return {ready: Boolean(view) || !ctx.canvas, paused, disposed, error, phase: engine.state.phase, throwsLeft: engine.state.throwsLeft}; },
    engine, city,
  };
  const params = new URLSearchParams(globalThis.location?.search || '');
  if (params.get('dev') === '1' || ctx.debug) session.debug = {engine, view: () => view, release: () => release(), setAim: a => engine.setAim(a), step: dt => { engine.step(dt); handle(engine.drainEvents()); }};
  if (!ctx.canvas) return session;

  const {canvas, controls} = ctx, stageEl = canvas.parentElement, doc = canvas.ownerDocument;
  try { audio = createCatchAudio({muted: () => { try { return globalThis.localStorage?.getItem('island.sound') === 'off'; } catch { return false; } }}); } catch { audio = null; }
  controls?.setAttribute('hidden', '');
  const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./catch.css?v=island-v2-20261107-1', import.meta.url).href; stageEl.append(css);
  canvas.setAttribute('aria-label', t('catch.canvas'));

  // ----- HUD -----
  hud = node('div', 'catch-hud'); hud.dir = 'rtl'; stageEl.append(hud);
  const top = node('div', 'catch-top');
  const wind = node('div', 'catch-wind'); wind.setAttribute('role', 'img');
  const windArrow = document.createElementNS(SVG, 'svg'); windArrow.setAttribute('viewBox', '0 0 24 24'); windArrow.setAttribute('width', 22); windArrow.setAttribute('height', 22); windArrow.innerHTML = '<path d="M3 12h16M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  const windText = node('bdi', 'catch-wind-text'); wind.append(windArrow, windText); hudNodes.windArrow = windArrow; hudNodes.windText = windText; hudNodes.wind = wind;
  const pips = node('div', 'catch-pips'); pips.setAttribute('role', 'img'); const pipNodes = Array.from({length: balance.throws}, () => { const p = node('i'); pips.append(p); return p; });
  top.append(wind, pips); hud.append(top);
  const readout = node('div', 'catch-readout'); const angleText = node('bdi'), powerText = node('bdi'); readout.append(angleText, powerText); hud.append(readout);
  const power = node('div', 'catch-power'), powerFill = node('span'); power.append(powerFill); hud.append(power);
  const ring = node('div', 'catch-ring'); ring.hidden = true; const ringLine = node('i'); ring.append(ringLine); hud.append(ring);
  const dragHint = node('div', 'catch-drag-hint', t('catch.dragHint')); hud.append(dragHint);
  const toolBar = node('div', 'catch-tools'); toolBar.setAttribute('role', 'group'); toolBar.setAttribute('aria-label', t('catch.tools'));
  const toolButtons = engine.tools.map((tool, i) => {
    const b = node('button', 'catch-tool'); b.type = 'button'; b.dataset.tool = tool.id; b.setAttribute('aria-label', t(tool.title) + ': ' + t(tool.hint));
    b.append(svg(tool.icon || tool.id, 26), node('span', '', t(tool.title))); b.addEventListener('click', () => selectTool(tool.id)); toolBar.append(b); return b;
  });
  hud.append(toolBar);
  const throwButton = node('button', 'catch-throw'); throwButton.type = 'button'; throwButton.setAttribute('aria-label', t('catch.throwHint'));
  throwButton.append(svg('throw', 34), node('span', '', t('catch.throw'))); hud.append(throwButton);
  const popup = node('div', 'catch-popup'); popup.setAttribute('role', 'status'); popup.setAttribute('aria-live', 'polite'); hud.append(popup);
  const loading = node('div', 'catch-loading', t('catch.loading')); hud.append(loading);
  const help = node('div', 'catch-help'); help.hidden = true;
  { const card = node('div', 'catch-help-card'); for (const k of [1, 2, 3]) card.append(node('p', '', t('minigame.catchCriminal.help.' + k))); const ok = node('button', 'catch-help-ok', t('catch.help.dismiss')); ok.type = 'button'; ok.addEventListener('click', () => { help.hidden = true; helpOpen = false; try { localStorage.setItem('island.catch.help', '1'); } catch { /* private mode */ } }); card.append(ok); help.append(card); hud.append(help); }
  const seenHelp = (() => { try { return localStorage.getItem('island.catch.help') === '1'; } catch { return true; } })();

  function selectTool(id) { if (engine.setTool(id)) { audio?.cue('tool'); refreshTools(); } }
  function refreshTools() { for (const b of toolButtons) { const on = b.dataset.tool === engine.aim.tool; b.setAttribute('aria-pressed', String(on)); b.disabled = engine.state.phase !== 'aim'; } }
  function say(key, kind = '', vars) { popup.textContent = t(key, vars); popup.dataset.kind = kind; popup.classList.remove('show'); void popup.offsetWidth; popup.classList.add('show'); }
  function release() { if (engine.state.phase !== 'aim' || finished || helpOpen || !view) return; engine.release(); audio?.cue('swing'); hud.dataset.phase = 'throw'; }
  function handle(events) {
    view?.handle(events, {});
    for (const e of events) {
      if (e.type === 'launch') audio?.cue('whoosh');
      else if (e.type === 'catch') { audio?.cue(e.perfect ? 'perfect' : 'catch'); say(e.perfect ? 'catch.pop.perfect' : 'catch.pop.catch', e.perfect ? 'perfect' : 'good'); slow = .9; ctx.sound?.('win'); }
      else if (e.type === 'blocked') { audio?.cue('thud'); say('catch.pop.blocked', 'bad'); }
      else if (e.type === 'miss') { audio?.cue('miss'); say('catch.pop.miss', 'bad'); }
      else if (e.type === 'hidden') { audio?.cue('miss'); say('catch.pop.hidden', 'bad'); }
      else if (e.type === 'flee') say('catch.pop.flee', 'warn');
      else if (e.type === 'escape') { audio?.cue('engine'); say('catch.pop.escape', 'bad'); ctx.sound?.('lose'); }
      else if (e.type === 'turn') { hud.dataset.phase = 'aim'; }
      else if (e.type === 'done') finish();
    }
  }
  function finish() {
    if (finished) return; finished = true;
    const sum = engine.summary();
    let score = sum.score;
    if (sum.outcome === 'win' && city.prison) score = Math.min(balance.maximumScore, Math.round(score * (1 + city.prison)));
    const settled = ctx.finish({outcome: sum.outcome, score, performance: sum.performance, catchCriminal: {perfect: sum.perfect, throws: sum.throws, tools: sum.tools}});
    if (settled && settled.ok === false && !disposed) { ctx.onError?.(settled.reason); ctx.cancel(); }
  }

  // ----- input: drag to aim (left = power, down = angle), big button to throw -----
  let drag = null;
  const aimAdjust = (da, dp) => { if (engine.setAim({angle: engine.aim.angle + da, power: engine.aim.power + dp})) audio?.tick?.(); };
  stageEl.addEventListener('pointerdown', e => {
    if (paused || helpOpen || finished || engine.state.phase !== 'aim') return;
    if (e.target.closest('button,.catch-tools,.catch-help')) return;
    drag = {id: e.pointerId, x: e.clientX, y: e.clientY, angle: engine.aim.angle, power: engine.aim.power};
    stageEl.setPointerCapture?.(e.pointerId);
    const r = stageEl.getBoundingClientRect(); ring.hidden = false; ring.style.left = (e.clientX - r.left) + 'px'; ring.style.top = (e.clientY - r.top) + 'px'; ringLine.style.width = '0px'; dragHint.hidden = true;
  }, {signal: abort.signal});
  stageEl.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    engine.setAim({angle: drag.angle + dy * P.anglePerPx, power: drag.power - dx * P.powerPerPx});
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx); ringLine.style.width = len + 'px'; ringLine.style.transform = `rotate(${ang}rad)`;
  }, {signal: abort.signal});
  const endDrag = e => { if (drag && e.pointerId === drag.id) { drag = null; ring.hidden = true; } };
  stageEl.addEventListener('pointerup', endDrag, {signal: abort.signal}); stageEl.addEventListener('pointercancel', endDrag, {signal: abort.signal});
  throwButton.addEventListener('click', release, {signal: abort.signal});
  const keys = new Set();
  doc.addEventListener('keydown', e => {
    if (disposed || paused || helpOpen) return;
    if (e.key === ' ' || e.key === 'Enter') { if (e.target?.tagName !== 'BUTTON' || e.target === throwButton) { e.preventDefault(); release(); } return; }
    if (['1', '2', '3'].includes(e.key)) { const tool = engine.tools[Number(e.key) - 1]; if (tool) selectTool(tool.id); return; }
    if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); }
  }, {signal: abort.signal});
  doc.addEventListener('keyup', e => keys.delete(e.key), {signal: abort.signal});
  canvas.addEventListener('webglcontextlost', e => { if (disposed) return; e.preventDefault(); error = 'webgl-context-lost'; fail(t('catch.contextLost')); }, {signal: abort.signal});

  function fail(message) {
    loading.hidden = false; loading.textContent = message; loadFailed = true; ctx.warning && (ctx.warning.hidden = false, ctx.warning.textContent = message);
    if (!loading.querySelector('button')) { const back = node('button', 'catch-help-ok', t('rescue.back')); back.type = 'button'; back.onclick = () => ctx.cancel(); loading.append(back); }
  }

  // ----- HUD refresh -----
  function refreshHud() {
    const s = engine.state, w = engine.wind, a = engine.aim;
    const dir = w >= 0 ? 1 : -1;
    hudNodes.windArrow.style.transform = `scaleX(${dir}) rotate(0deg)`; hudNodes.wind.dataset.calm = String(Math.abs(w) < .01);
    hudNodes.windText.textContent = Math.abs(w) < .01 ? t('catch.windNone') : `${t('catch.wind')} ${Math.abs(w).toFixed(1)}`;
    hudNodes.wind.setAttribute('aria-label', Math.abs(w) < .01 ? t('catch.windNone') : t(dir > 0 ? 'catch.windRight' : 'catch.windLeft') + ' ' + Math.abs(w).toFixed(1));
    pipNodes.forEach((p, i) => { p.dataset.state = i < s.throwsLeft ? 'ready' : 'used'; });
    pips.setAttribute('aria-label', t('catch.throws', {count: s.throwsLeft}));
    angleText.textContent = t('catch.angle', {value: Math.round(a.angle)}); powerText.textContent = t('catch.power', {value: Math.round(a.power * 100)});
    powerFill.style.height = Math.round(a.power * 100) + '%';
    hud.dataset.phase = s.phase; throwButton.disabled = s.phase !== 'aim' || finished || !view; refreshTools();
    dragHint.hidden = !(s.phase === 'aim' && s.thrown === 0 && !drag);
  }

  // ----- loop -----
  const STEP = 1 / 60;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (disposed) return;
    if (!last) last = now;
    let dt = Math.min(.05, (now - last) / 1000); last = now;
    if (paused || !view || helpOpen) { if (view && !paused) view.update(0, {}); return; }
    if (slow > 0) { slow -= dt; dt *= .45; }
    const keyAngle = ((keys.has('ArrowUp') ? -1 : 0) + (keys.has('ArrowDown') ? 1 : 0)) * P.keyAngle * dt * 60, keyPower = ((keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0)) * P.keyPower * dt * 60;
    if (engine.state.phase === 'aim' && (keyAngle || keyPower)) engine.setAim({angle: engine.aim.angle - keyAngle, power: engine.aim.power + keyPower});
    acc += dt;
    while (acc >= STEP) { engine.step(STEP); acc -= STEP; const events = engine.drainEvents(); if (events.length) handle(events); }
    view.update(dt, {hidePreview: drag === null && false});
    refreshHud();
  }

  import('./catch-view.mjs?v=island-v2-20261107-1').then(async ({createCatchView}) => {
    const quality = params.get('quality') === 'low' || ctx.lite ? 'low' : 'high';
    view = await createCatchView({canvas, engine, balance, quality, maxDpr: balance.render.maxDpr, lowDpr: balance.render.lowDpr, signal: abort.signal, onProgress: p => { loading.dataset.progress = String(Math.round(p * 100)); }});
    if (disposed) { view.dispose(); view = null; return; }
    loading.hidden = true; refreshTools(); refreshHud();
    if (!seenHelp && stage === 1) { help.hidden = false; helpOpen = true; }
    ctx.onReady?.();
  }).catch(err => { if (disposed) return; error = String(err?.message || err); fail(t('catch.loadError')); ctx.onError?.('catch.loadError'); });
  raf = requestAnimationFrame(frame);
  return session;
}
