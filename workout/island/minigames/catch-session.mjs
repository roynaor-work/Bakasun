import {createCatchEngine} from './catch-engine.mjs?v=island-v2-20261107-10';
import {createChaseEngine} from './catch-chase.mjs?v=island-v2-20261107-10';
import {createCatchAudio} from './catch-audio.mjs?v=island-v2-20261107-10';

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  narrow: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/>',
  wide: '<path d="M3 9c3-5 15-5 18 0M3 9l3 11M21 9l-3 11M3 9h18M7 9l2 11M17 9l-2 11M12 9v11M5 15h14"/>',
  rope: '<ellipse cx="14" cy="10" rx="7" ry="5"/><path d="M8 13c-3 1-5 4-6 8M2 21l5 0"/>',
  throw: '<path d="M4 17c3-9 9-12 16-12M20 5l-5-1M20 5l-2 5"/><circle cx="6" cy="18" r="2.2"/>',
  boost: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  brake: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',
  star: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7Z"/>',
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function svg(name, size = 28) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = ICONS[name] || ''; return s;
}
function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

/** Controller for one catch match: a car chase (v2), then the net throw. It owns the engines, the view,
 * the loop, the input and the HUD. The island engine owns the rewards; this reports the finished match
 * once through ctx.finish. Without a canvas it runs headless (tests) and plays only the throw.
 * ?catchV2=0 or a stage without a chase plays exactly as v1. */
export function runCatchSession(ctx) {
  const balance = ctx.balance, stage = ctx.level || 1, t = ctx.t || (key => key), P = balance.controls;
  const params = new URLSearchParams(globalThis.location?.search || '');
  const v2 = ctx.v2 !== false && params.get('catchV2') !== '0' && balance.version >= 2 && Boolean(balance.levels[stage - 1]?.chase);
  const policeLevel = (ctx.state?.buildings || []).filter(b => b.typeId === 'police').reduce((n, b) => n + (b.level || 1), 0);
  const prisonLevel = (ctx.state?.buildings || []).filter(b => b.typeId === 'prison').reduce((n, b) => n + (b.level || 1), 0);
  const city = {police: Math.min(balance.city.policeMax, policeLevel * balance.city.policeRadiusPerLevel), prison: Math.min(balance.city.prisonMax, prisonLevel * balance.city.prisonCoinPerLevel)};
  const arch5 = v2 && params.get('catchV5') !== '0' && Boolean(balance.levels[stage - 1]?.zmove); // ?catchV5=0: the v4 side-view throw
  const feel = params.get('catchV4') !== '0'; // ?catchV4=0 brings back the v3 aiming (no help ring, no drag easing, v3 balance)
  const makeThrow = mods => createCatchEngine({balance, stage, seed: ctx.seed, equipment: ctx.equipment, city, v2, mods, feel, arch: arch5});
  const withChase = v2 && Boolean(ctx.canvas);
  const chase = withChase ? createChaseEngine({balance, stage, seed: ctx.seed, equipment: ctx.equipment, bends: arch5}) : null;
  let engine = withChase ? null : makeThrow({});
  let mode = withChase ? 'loading' : 'throw';
  let scrapeSaid = false, ramSaid = false, view = null, audio = null, hud = null, disposed = false, paused = false, finished = false, helpOpen = false, raf = 0, last = 0, acc = 0, slow = 0, error = null, finishTimer = 0, bailTimer = 0, sirenAt = 0;
  const abort = new AbortController(), hudNodes = {};
  const session = {
    setPaused(value) { paused = Boolean(value); last = 0; audio?.setPaused?.(paused); },
    dispose() {
      if (disposed) return; disposed = true; if (raf) cancelAnimationFrame(raf); clearTimeout(finishTimer); clearTimeout(bailTimer); abort.abort();
      try { view?.dispose(); } catch { /* the page is going away anyway */ }
      audio?.dispose?.(); hud?.remove();
      ctx.controls?.removeAttribute('hidden');
    },
    get snapshot() { return {ready: Boolean(view) || !ctx.canvas, paused, disposed, error, mode, v2, phase: engine?.state.phase || mode, throwsLeft: engine?.state.throwsLeft ?? null}; },
    get engine() { return engine; }, get chase() { return chase; }, city, v2,
  };
  if (params.get('dev') === '1' || ctx.debug) session.debug = {get engine() { return engine; }, chase, view: () => view, release: () => (ctx.canvas ? release() : (engine.release() && undefined)), setAim: a => engine?.setAim(a), step: dt => stepThrow(dt), stepChase: dt => stepChase(dt), skipChase: () => { if (mode === 'chase') endChase(); }};
  if (!ctx.canvas) return session;

  const {canvas, controls} = ctx, stageEl = canvas.parentElement, doc = canvas.ownerDocument;
  try { audio = createCatchAudio({muted: () => { try { return globalThis.localStorage?.getItem('island.sound') === 'off'; } catch { return false; } }}); } catch { audio = null; }
  controls?.setAttribute('hidden', '');
  const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./catch.css?v=island-v2-20261107-10', import.meta.url).href; stageEl.append(css);
  canvas.setAttribute('aria-label', t('catch.canvas'));

  // ----- HUD shared by both parts -----
  hud = node('div', 'catch-hud'); hud.dir = 'rtl'; hud.dataset.mode = mode; if (arch5) hud.dataset.arch = '1'; stageEl.append(hud);
  const top = node('div', 'catch-top');
  const wind = node('div', 'catch-wind'); wind.setAttribute('role', 'img');
  const windArrow = document.createElementNS(SVG, 'svg'); windArrow.setAttribute('viewBox', '0 0 24 24'); windArrow.setAttribute('width', 22); windArrow.setAttribute('height', 22); windArrow.innerHTML = '<path d="M3 12h16M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  const windText = node('bdi', 'catch-wind-text'); wind.append(windArrow, windText); hudNodes.windArrow = windArrow; hudNodes.windText = windText; hudNodes.wind = wind;
  const totalThrows = () => engine?.throwsTotal ?? balance.throws;
  const pips = node('div', 'catch-pips'); pips.setAttribute('role', 'img'); let pipNodes = [];
  const crewChip = node('div', 'catch-chip'); crewChip.hidden = true;
  top.append(wind, pips, crewChip); hud.append(top);
  const readout = node('div', 'catch-readout'); const angleText = node('bdi'), powerText = node('bdi'); readout.append(angleText, powerText); hud.append(readout);
  const power = node('div', 'catch-power'), powerFill = node('span'); power.append(powerFill); hud.append(power);
  // arch: the power meter is a bow-string you pull: drag it up and down with the other hand
  const setPowerAt = e => { const r = power.getBoundingClientRect(); engine?.setAim({power: 1 - (e.clientY - r.top) / Math.max(1, r.height)}); };
  power.addEventListener('pointerdown', e => { if (!arch5) return; e.stopPropagation(); e.preventDefault(); power.setPointerCapture?.(e.pointerId); power.dataset.drag = '1'; setPowerAt(e); });
  power.addEventListener('pointermove', e => { if (power.dataset.drag) { e.stopPropagation(); setPowerAt(e); } });
  for (const type of ['pointerup', 'pointercancel']) power.addEventListener(type, e => { delete power.dataset.drag; e.stopPropagation(); });
  const ring = node('div', 'catch-ring'); ring.hidden = true; const ringLine = node('i'); ring.append(ringLine); hud.append(ring);
  const dragHint = node('div', 'catch-drag-hint', t(arch5 ? 'catch.dragHintArch' : 'catch.dragHint')); hud.append(dragHint);
  const toolBar = node('div', 'catch-tools'); toolBar.setAttribute('role', 'group'); toolBar.setAttribute('aria-label', t('catch.tools')); let toolButtons = [];
  hud.append(toolBar);
  const throwButton = node('button', 'catch-throw'); throwButton.type = 'button'; throwButton.setAttribute('aria-label', t('catch.throwHint'));
  throwButton.append(svg('throw', 34), node('span', '', t('catch.throw'))); hud.append(throwButton);
  const popup = node('div', 'catch-popup'); popup.setAttribute('role', 'status'); popup.setAttribute('aria-live', 'polite'); hud.append(popup);
  const loading = node('div', 'catch-loading', t('catch.loading')); hud.append(loading);
  const help = node('div', 'catch-help'); help.hidden = true;
  { const card = node('div', 'catch-help-card'); for (const k of [1, 2, 3, 4]) card.append(node('p', '', t(arch5 && k > 1 ? 'catch.arch.help.' + k : 'minigame.catchCriminal.help.' + k))); const ok = node('button', 'catch-help-ok', t('catch.help.dismiss')); ok.type = 'button'; ok.addEventListener('click', () => { help.hidden = true; helpOpen = false; try { localStorage.setItem('island.catch.help2', '1'); } catch { /* private mode */ } }); card.append(ok); help.append(card); hud.append(help); }
  const seenHelp = (() => { try { return localStorage.getItem('island.catch.help2') === '1'; } catch { return true; } })();
  const stars = node('div', 'catch-stars'); stars.hidden = true; hud.append(stars);

  // ----- chase HUD -----
  const chaseBox = node('div', 'catch-chase'); chaseBox.hidden = true; hud.append(chaseBox);
  const gapText = node('bdi', 'catch-gap'), timeBar = node('span', 'catch-time'), timeFill = node('i'); timeBar.append(timeFill);
  const chaseTop = node('div', 'catch-chase-top'); chaseTop.append(gapText, timeBar); chaseBox.append(chaseTop);
  const damageBox = node('div', 'catch-damage'), damageFill = node('span'); damageBox.setAttribute('role', 'meter'); damageBox.setAttribute('aria-label', t('catch.damage')); damageBox.append(node('small', '', t('catch.damage')), node('i')); damageBox.lastChild.append(damageFill); chaseBox.append(damageBox);
  const tankBar = node('div', 'catch-tank'), tankFill = node('span'); tankBar.append(tankFill); chaseBox.append(tankBar);
  const boostButton = node('button', 'catch-boost'); boostButton.type = 'button'; boostButton.setAttribute('aria-label', t('catch.boost')); boostButton.append(svg('boost', 34), node('span', '', t('catch.boost')));
  const brakeButton = node('button', 'catch-brake'); brakeButton.type = 'button'; brakeButton.setAttribute('aria-label', t('catch.brake')); brakeButton.append(svg('brake', 26), node('span', '', t('catch.brake')));
  chaseBox.append(boostButton, brakeButton);
  const count = node('div', 'catch-count'); count.hidden = true; hud.append(count);
  const steerHint = node('div', 'catch-drag-hint catch-steer-hint', t('catch.steerHint')); chaseBox.append(steerHint);

  function buildThrowHud() {
    pips.replaceChildren(); pipNodes = Array.from({length: totalThrows()}, () => { const p = node('i'); pips.append(p); return p; });
    toolBar.replaceChildren();
    toolButtons = engine.tools.map(tool => {
      const b = node('button', 'catch-tool'); b.type = 'button'; b.dataset.tool = tool.id; b.setAttribute('aria-label', t(tool.title) + ': ' + t(tool.hint));
      b.append(svg(tool.icon || tool.id, 26), node('span', '', t(tool.title))); b.addEventListener('click', () => selectTool(tool.id)); toolBar.append(b); return b;
    });
  }
  function selectTool(id) { if (engine?.setTool(id)) { audio?.cue('tool'); refreshTools(); } }
  function refreshTools() { for (const b of toolButtons) { const on = b.dataset.tool === engine.aim.tool; b.setAttribute('aria-pressed', String(on)); b.disabled = engine.state.phase !== 'aim'; } }
  function say(key, kind = '', vars) { popup.textContent = t(key, vars); popup.dataset.kind = kind; popup.classList.remove('show'); void popup.offsetWidth; popup.classList.add('show'); }
  function release() { if (mode !== 'throw' || engine.state.phase !== 'aim' || finished || helpOpen || !view) return; engine.release(); audio?.cue('swing'); hud.dataset.phase = 'throw'; }

  // ----- chase -----
  function setMode(next) { mode = next; hud.dataset.mode = next; chaseBox.hidden = next !== 'chase' && next !== 'bail'; for (const el of [top, readout, power, toolBar, throwButton, dragHint]) el.hidden = next === 'loading' || next === 'chase' || next === 'bail'; top.hidden = next === 'loading' || next === 'chase' || next === 'bail'; }
  function startChase() {
    setMode('chase'); view.enterChase(chase); count.hidden = false; count.textContent = '3'; audio?.cue('engine');
    if (!seenHelp && stage === 1) { help.hidden = false; helpOpen = true; }
  }
  function stepChase(dt) {
    chase.step(dt); const events = chase.drainEvents();
    if (events.length) handleChase(events);
    if (mode === 'chase' && chase.state.phase === 'run' && performance.now() - sirenAt > 800) { sirenAt = performance.now(); audio?.cue('siren', {approach: clamp((chase.state.v - chase.state.crim.v) / 8, -1, 1)}); }
  }
  function handleChase(events) {
    view?.handleChase(events);
    for (const e of events) {
      if (e.type === 'count') { count.textContent = String(e.value); count.dataset.k = String(e.value); audio?.cue('count'); }
      else if (e.type === 'go') { count.textContent = t('catch.go'); audio?.cue('go'); setTimeout(() => { count.hidden = true; }, 700); }
      else if (e.type === 'crash') { audio?.cue('crash'); say(e.kind === 'cone' ? 'catch.pop.cone' : 'catch.pop.crash', 'bad'); }
      else if (e.type === 'crimCrash') { audio?.cue('crimCrash'); say('catch.pop.crimCrash', 'good'); }
      else if (e.type === 'pad') { audio?.cue('pad'); }
      else if (e.type === 'scrape') { audio?.cue('scrape'); if (!scrapeSaid) { scrapeSaid = true; say('catch.pop.scrape', 'warn'); } }
      else if (e.type === 'ram') { audio?.cue('ram'); if (!ramSaid) { ramSaid = true; say('catch.pop.ram', 'good'); } }
      else if (e.type === 'crimBoost') { audio?.cue('nitro'); say('catch.pop.crimBoost', 'warn'); }
      else if (e.type === 'end') endChase();
    }
  }
  function endChase() {
    if (mode !== 'chase') return;
    const res = chase.result(); mode = 'bail'; chase.setBoost(false); chase.setSteer(0); keys.clear(); boostHeld = brakeHeld = false;
    const key = res.caught ? 'catch.chase.caught' : res.closeness >= .66 ? 'catch.chase.close' : res.closeness >= .33 ? 'catch.chase.mid' : 'catch.chase.far';
    say(key, res.caught || res.closeness >= .66 ? 'good' : res.closeness >= .33 ? 'warn' : 'bad', {gap: Math.round(res.gap), throws: balance.throws + (res.mods.extraThrows || 0)});
    audio?.cue('brake');
    bailTimer = setTimeout(() => {
      if (disposed) return;
      engine = makeThrow(res.mods); view.bindThrow(engine); buildThrowHud(); setMode('throw'); refreshHud();
      audio?.cue('swing'); ctx.onChaseDone?.(res);
    }, 2000);
  }

  function handle(events) {
    view?.handle(events, {});
    for (const e of events) {
      if (e.type === 'launch') audio?.cue('whoosh');
      else if (e.type === 'catch') { audio?.cue(e.perfect ? 'perfect' : 'catch'); say(e.perfect ? 'catch.pop.perfect' : 'catch.pop.catch', e.perfect ? 'perfect' : 'good'); slow = .9; }
      else if (e.type === 'bossHit') { audio?.cue('bossHit'); say(engine.isArch ? 'catch.pop.hit' : 'catch.pop.bossHit', 'good', {hp: e.hp}); slow = .6; }
      else if (e.type === 'crew') { audio?.cue('siren', {crew: true}); say('catch.pop.crew', 'warn', {left: engine.state.crewLeft + 1}); }
      else if (e.type === 'blocked') { audio?.cue('thud'); say('catch.pop.blocked', 'bad'); }
      else if (e.type === 'miss') { if (e.near) { audio?.cue('near'); say('catch.pop.near', 'warn'); slow = .5; } else { audio?.cue('miss'); say('catch.pop.miss', 'bad'); } }
      else if (e.type === 'hidden') { audio?.cue('miss'); say('catch.pop.hidden', 'bad'); }
      else if (e.type === 'flee') { if (!e.boss) say('catch.pop.flee', 'warn'); }
      else if (e.type === 'escape') { audio?.cue('engine'); say('catch.pop.escape', 'bad'); }
      else if (e.type === 'turn') { hud.dataset.phase = 'aim'; }
      else if (e.type === 'done') finish();
    }
  }
  function stepThrow(dt) {
    engine.step(dt); const events = engine.drainEvents();
    if (ctx.canvas) handle(events); else if (events.some(e => e.type === 'done')) finish();
  }
  function showStars(count) {
    stars.replaceChildren(); stars.hidden = false;
    for (let i = 0; i < 3; i++) { const s = node('span', i < count ? 'on' : 'off'); s.style.animationDelay = (i * .22) + 's'; s.append(svg('star', 54)); stars.append(s); }
    stars.setAttribute('role', 'img'); stars.setAttribute('aria-label', t('catch.stars', {count})); audio?.cue('stars');
  }
  function finish() {
    if (finished) return; finished = true;
    const sum = engine.summary();
    let score = sum.score;
    if (sum.outcome === 'win' && city.prison) score = Math.min(balance.maximumScore, Math.round(score * (1 + city.prison)));
    const report = () => {
      if (disposed) return;
      const settled = ctx.finish({outcome: sum.outcome, score, performance: sum.performance, catchCriminal: {perfect: sum.perfect, throws: sum.throws, tools: sum.tools, v2, catches: sum.catches, crew: sum.crew, boss: sum.boss, closeness: chase ? chase.result().closeness : null}});
      if (settled && settled.ok === false && !disposed) { ctx.onError?.(settled.reason); ctx.cancel(); }
    };
    if (ctx.canvas && sum.outcome === 'win') { const th = balance.scoring; showStars(1 + (sum.performance >= .45) + (sum.performance >= .8)); finishTimer = setTimeout(report, 1500); } else report();
  }

  // ----- input -----
  let drag = null, steerDrag = null, boostHeld = false, brakeHeld = false;
  stageEl.addEventListener('pointerdown', e => {
    if (paused || helpOpen || finished) return;
    if (e.target.closest('button,.catch-tools,.catch-help')) return;
    const r = stageEl.getBoundingClientRect();
    if (mode === 'chase') {
      if (e.clientX - r.left > r.width * .62) return;
      steerDrag = {id: e.pointerId, y: e.clientY}; stageEl.setPointerCapture?.(e.pointerId); steerHint.hidden = true;
      ring.hidden = false; ring.style.left = (e.clientX - r.left) + 'px'; ring.style.top = (e.clientY - r.top) + 'px'; ringLine.style.width = '0px'; return;
    }
    if (mode !== 'throw' || engine.state.phase !== 'aim') return;
    drag = {id: e.pointerId, x: e.clientX, y: e.clientY, angle: engine.aim.angle, power: engine.aim.power, yaw: engine.aim.yaw || 0};
    stageEl.setPointerCapture?.(e.pointerId);
    ring.hidden = false; ring.style.left = (e.clientX - r.left) + 'px'; ring.style.top = (e.clientY - r.top) + 'px'; ringLine.style.width = '0px'; dragHint.hidden = true;
  }, {signal: abort.signal});
  stageEl.addEventListener('pointermove', e => {
    if (steerDrag && e.pointerId === steerDrag.id) { const dy = e.clientY - steerDrag.y; chase.setSteer(clamp(dy / 46, -1, 1)); ringLine.style.width = Math.abs(dy) + 'px'; ringLine.style.transform = `rotate(${dy >= 0 ? Math.PI / 2 : -Math.PI / 2}rad)`; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.to = engine.isArch ? {angle: drag.angle + dy * P.anglePerPx, yaw: drag.yaw + dx * (P.yawPerPx || .1)} : {angle: drag.angle + dy * P.anglePerPx, power: drag.power - dx * P.powerPerPx}; if (!feel) engine.setAim(drag.to); // with the feel on, the frame loop eases the line after the finger
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx); ringLine.style.width = len + 'px'; ringLine.style.transform = `rotate(${ang}rad)`;
  }, {signal: abort.signal});
  const endDrag = e => {
    if (steerDrag && e.pointerId === steerDrag.id) { steerDrag = null; chase?.setSteer(0); ring.hidden = true; }
    if (drag && e.pointerId === drag.id) { if (drag.to) engine?.setAim(drag.to); drag = null; ring.hidden = true; }
  };
  stageEl.addEventListener('pointerup', endDrag, {signal: abort.signal}); stageEl.addEventListener('pointercancel', endDrag, {signal: abort.signal});
  throwButton.addEventListener('click', release, {signal: abort.signal});
  const hold = (button, set) => {
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); set(true); }, {signal: abort.signal});
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => set(false), {signal: abort.signal});
  };
  hold(boostButton, v => { boostHeld = v; }); hold(brakeButton, v => { brakeHeld = v; });
  const keys = new Set();
  doc.addEventListener('keydown', e => {
    if (disposed || paused || helpOpen) return;
    if (mode === 'chase') {
      if (e.key === ' ' || e.key === 'Enter') { boostHeld = true; e.preventDefault(); }
      else if (e.key === 'Shift' || e.key === 'b' || e.key === 'B') brakeHeld = true;
      else if (['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') { if (e.target?.tagName !== 'BUTTON' || e.target === throwButton) { e.preventDefault(); release(); } return; }
    if (['1', '2', '3'].includes(e.key)) { const tool = engine?.tools[Number(e.key) - 1]; if (tool) selectTool(tool.id); return; }
    if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); }
  }, {signal: abort.signal});
  doc.addEventListener('keyup', e => { keys.delete(e.key); if (e.key === ' ' || e.key === 'Enter') boostHeld = false; if (e.key === 'Shift' || e.key === 'b' || e.key === 'B') brakeHeld = false; }, {signal: abort.signal});
  canvas.addEventListener('webglcontextlost', e => { if (disposed) return; e.preventDefault(); error = 'webgl-context-lost'; fail(t('catch.contextLost')); }, {signal: abort.signal});

  function fail(message) {
    loading.hidden = false; loading.textContent = message; ctx.warning && (ctx.warning.hidden = false, ctx.warning.textContent = message);
    if (!loading.querySelector('button')) { const back = node('button', 'catch-help-ok', t('rescue.back')); back.type = 'button'; back.onclick = () => ctx.cancel(); loading.append(back); }
  }

  // ----- HUD refresh -----
  function refreshChaseHud() {
    const st = chase.state, spec = chase.spec;
    gapText.textContent = t('catch.gap', {gap: Math.max(0, Math.round(st.gap))});
    damageFill.style.width = Math.round(st.damage * 100) + '%'; damageBox.dataset.hot = String(st.damage > .6);
    timeFill.style.width = clamp(100 - st.t / spec.seconds * 100, 0, 100) + '%'; tankFill.style.height = Math.round(st.tank / Math.max(1, st.tank > 1 ? st.tank : 1) * 100) + '%';
    boostButton.dataset.ready = String(st.tank > .12); tankBar.dataset.low = String(st.tank < .2);
    steerHint.hidden = !(st.phase === 'run' && st.t < 4 && !steerDrag);
  }
  function refreshHud() {
    if (mode === 'chase' || mode === 'bail') { refreshChaseHud(); return; }
    if (!engine) return;
    const s = engine.state, w = engine.wind, a = engine.aim;
    const dir = w >= 0 ? 1 : -1;
    hudNodes.windArrow.style.transform = `scaleX(${dir})`; hudNodes.wind.dataset.calm = String(Math.abs(w) < .01);
    hudNodes.windText.textContent = Math.abs(w) < .01 ? t('catch.windNone') : `${t('catch.wind')} ${Math.abs(w).toFixed(1)}`;
    hudNodes.wind.setAttribute('aria-label', Math.abs(w) < .01 ? t('catch.windNone') : t(dir > 0 ? 'catch.windRight' : 'catch.windLeft') + ' ' + Math.abs(w).toFixed(1));
    pipNodes.forEach((p, i) => { p.dataset.state = i < s.throwsLeft ? 'ready' : 'used'; });
    pips.setAttribute('aria-label', t('catch.throws', {count: s.throwsLeft}));
    const crew = engine.level.crew || 1, boss = engine.v2 && engine.level.boss;
    const need = engine.hitsNeeded || 1;
    crewChip.hidden = !(crew > 1 || boss || need > 1);
    if (engine.isArch) crewChip.textContent = [need > 1 ? t('catch.hits', {hit: need - s.bossHp, need}) : '', crew > 1 ? t('catch.crew', {caught: s.caught.length, total: crew}) : ''].filter(Boolean).join(' · ');
    else if (crew > 1) crewChip.textContent = t('catch.crew', {caught: s.caught.length, total: crew});
    else if (boss) crewChip.textContent = t('catch.boss', {hp: s.bossHp});
    angleText.textContent = engine.isArch ? t('catch.yaw', {value: Math.round(a.yaw || 0)}) + ' · ' + t('catch.angle', {value: Math.round(a.angle)}) : t('catch.angle', {value: Math.round(a.angle)}); powerText.textContent = t('catch.power', {value: Math.round(a.power * 100)});
    powerFill.style.height = Math.round(a.power * 100) + '%';
    hud.dataset.phase = s.phase; throwButton.disabled = s.phase !== 'aim' || finished || !view; refreshTools();
    dragHint.hidden = !(s.phase === 'aim' && s.thrown === 0 && !drag && !(crew > 1 && s.crimIndex > 0));
  }

  // ----- loop -----
  const STEP = 1 / 60;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (disposed) return;
    if (!last) last = now;
    let dt = Math.min(.05, (now - last) / 1000); last = now;
    if (paused || !view || helpOpen) { if (view && !paused) view.update(0, {}); return; }
    if (mode === 'chase' || mode === 'bail') {
      let steer = ((keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? -1 : 0) + (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0));
      if (steer && !steerDrag) chase.setSteer(steer); else if (!steerDrag) chase.setSteer(0);
      chase.setBoost(boostHeld && mode === 'chase'); chase.setBrake(brakeHeld && mode === 'chase');
      acc += dt; while (acc >= STEP) { acc -= STEP; if (mode === 'chase' || chase.state.phase !== 'end') stepChase(STEP); else chase.drainEvents(); }
      view.update(dt, {}); refreshHud(); return;
    }
    if (!engine) return;
    // slow motion: a short beat after a hit, and the last stretch of the flight when the net closes on the thief
    const fn = engine.flightNow(); let scale = 1;
    if (fn && engine.v2 && fn.share > .45 && fn.dist < 4.5) scale = .3 + .7 * clamp((fn.dist - 1.2) / 3.3, 0, 1);
    if (slow > 0) { slow -= dt; scale = Math.min(scale, .45); }
    dt *= scale;
    const keyAngle = ((keys.has('ArrowUp') ? -1 : 0) + (keys.has('ArrowDown') ? 1 : 0)) * P.keyAngle * dt * 60, keyPower = ((keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0)) * P.keyPower * dt * 60;
    if (engine.state.phase === 'aim' && (keyAngle || keyPower)) { if (engine.isArch) engine.setAim({angle: engine.aim.angle - keyAngle, yaw: engine.aim.yaw - keyPower * 20}); else engine.setAim({angle: engine.aim.angle - keyAngle, power: engine.aim.power + keyPower}); }
    if (feel && drag?.to && engine.state.phase === 'aim') { const k = 1 - Math.exp(-dt * 26); engine.setAim({angle: engine.aim.angle + (drag.to.angle - engine.aim.angle) * k, power: drag.to.power === undefined ? engine.aim.power : engine.aim.power + (drag.to.power - engine.aim.power) * k, yaw: drag.to.yaw === undefined ? undefined : engine.aim.yaw + (drag.to.yaw - engine.aim.yaw) * k}); }
    acc += dt;
    while (acc >= STEP) { acc -= STEP; stepThrow(STEP); }
    view.update(dt, {});
    refreshHud();
  }

  import('./catch-view.mjs?v=island-v2-20261107-10').then(async ({createCatchView}) => {
    const quality = params.get('quality') === 'low' || ctx.lite ? 'low' : 'high';
    view = await createCatchView({canvas, arch: arch5, engine, balance, stage, v2, quality, maxDpr: balance.render.maxDpr, lowDpr: balance.render.lowDpr, signal: abort.signal, onProgress: p => { loading.dataset.progress = String(Math.round(p * 100)); }});
    if (disposed) { view.dispose(); view = null; return; }
    loading.hidden = true;
    if (withChase) startChase();
    else { buildThrowHud(); setMode('throw'); refreshTools(); refreshHud(); if (!seenHelp && stage === 1) { help.hidden = false; helpOpen = true; } }
    ctx.onReady?.();
  }).catch(err => { if (disposed) return; error = String(err?.message || err); fail(t('catch.loadError')); ctx.onError?.('catch.loadError'); });
  if (withChase) setMode('loading'); else { buildThrowHud(); }
  raf = requestAnimationFrame(frame);
  return session;
}
