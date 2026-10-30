import {createAlpineEngine} from './alpine-engine.mjs?v=island-naval-aim-20261030-1';
import {createAlpineControls} from './alpine-controls.mjs?v=island-naval-aim-20261030-1';
import {createAlpineAudio} from './alpine-audio.mjs?v=island-naval-aim-20261030-1';
import {loadRecords,recordRun,formatRaceTime} from './alpine-records.mjs?v=island-naval-aim-20261030-1';
import {createQualityGovernor} from './alpine-quality.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BRAND = '<path d="M2 28 15 5l6 11 5-8 13 20H2Z"/><path d="m10 15 5-10 6 11-5-4-6 3Z" class="snow"/>';
const BOLT = '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>';
const CHEVRON = '<path d="m15 5-7 7 7 7"/>';
const COIN = '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>';
const STAR = '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7Z"/>';
const TRICK_ICONS = {
  grab: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5m0 0V4.5a1.5 1.5 0 0 1 3 0V11m0 0V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.6-3L4 12.5a1.5 1.5 0 0 1 2.6-1.4L8 13"/>',
  spin: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  flip: '<path d="M7 19V10a5 5 0 0 1 10 0v3m-3-2 3 3 3-3"/>',
  combo: STAR,
};
const TRICK_NAMES = {grab: 'GRAB', spin: 'SPIN 360', flip: 'BACKFLIP', combo: 'COMBO'};

/** Controller for one Alpine Rush session: owns the engine, the view, requestAnimationFrame,
 * input, audio and the HUD. The island engine owns rewards; this file only reports the
 * finished race once through ctx.finish. Without a canvas it runs headless (tests). */
export function runAlpineSession(ctx) {
  const balance = ctx.balance, stageNumber = ctx.level || 1, t = ctx.t || (key => key);
  const engine = createAlpineEngine({balance, stage: stageNumber, seed: ctx.seed, equipment: ctx.equipment, power: ctx.power});
  const level = engine.level, track = engine.track;
  let storage = null; try { storage = ctx.storage === undefined ? globalThis.localStorage : ctx.storage; } catch {}
  const records = loadRecords(storage, balance.records);
  let audio; try { audio = createAlpineAudio({storage}); } catch { audio = createAlpineAudio({storage: null, AudioContext: null}); }
  let view = null, input = null, frame, last = 0, paused = false, disposed = false, finished = false, renderError = null, loadTimer, quality = 'high';
  let governor = null, lastSnapshot = engine.snapshot(), recordOutcome = null, calloutUntil = 0, dom = null;
  const abort = new AbortController();
  const session = {
    setPaused(value) {
      paused = !!value; last = 0; input?.setEnabled(!paused); audio.setPaused(paused);
      engine.command({type: paused ? 'pause' : 'resume'});
    },
    /** Same action as the opening button; also used by tests. */
    start() { if (disposed || !ready() || engine.phase !== 'menu') return false; audio.unlock(); engine.command({type: 'start'}); last = 0; return true; },
    dispose() {
      if (disposed) return; disposed = true; clearTimeout(loadTimer);
      if (frame !== undefined) cancelAnimationFrame(frame); abort.abort(); input?.dispose(); audio.dispose(); view?.dispose(); engine.dispose();
      dom?.nodes.forEach(n => n.remove());
    },
    get snapshot() {
      return {phase: engine.phase, paused, disposed, loaded: Boolean(view), error: renderError, quality, stage: stageNumber, trackId: track.id,
        frame: disposed ? null : engine.snapshot(), records: {status: records.status, best: records.data.best[track.id] || null}, recordOutcome,
        renderMetrics: view?.metrics(), audioMetrics: audio.metrics(), qualityGovernor: governor?.metrics() ?? null, input: input ? {enabled: input.enabled, dragging: input.dragging} : null};
    },
  };
  const ready = () => !ctx.canvas || Boolean(view);
  if (new URLSearchParams(globalThis.location?.search || '').get('dev') === '1' || ctx.debug) session.debug = {engine, step: dt => engine.step(dt), view: () => view, input: () => input};
  if (!ctx.canvas) return session;

  // ---------- DOM (design package markup, scoped to the island game screen) ----------
  const {canvas, controls, status} = ctx, doc = canvas.ownerDocument, stage = canvas.parentElement, screen = canvas.closest('.game-screen');
  const el = (tag, cls = '', text = '') => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const svg = (paths, viewBox = '0 0 24 24') => { const s = doc.createElementNS(SVG_NS, 'svg'); s.setAttribute('viewBox', viewBox); s.setAttribute('aria-hidden', 'true'); s.innerHTML = paths; return s; };
  const ltr = text => { const b = el('bdi', 'alpine-ltr', text); b.dir = 'ltr'; return b; };
  const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('./alpine.css?v=island-naval-aim-20261030-1', import.meta.url).href;
  const polish = el('link'); polish.rel = 'stylesheet'; polish.href = new URL('./alpine-polish.css?v=island-naval-aim-20261030-1', import.meta.url).href;
  const app = el('div', 'alpine-app'); app.dataset.phase = 'menu';
  const vignette = el('div', 'alpine-vignette');
  const brand = el('div', 'alpine-brand'); brand.setAttribute('aria-hidden', 'true'); brand.append(svg(BRAND, '0 0 40 32'), ltr('ALPINE')); brand.lastChild.append(el('span', 'alpine-brand-light', 'RUSH'));
  const trackName = t(track.name), trackNumber = String(track.number).padStart(2, '0'), km = (track.length / 1000).toLocaleString('he-IL', {maximumFractionDigits: 2});
  // HUD
  const hud = el('section', 'alpine-hud'); hud.setAttribute('aria-label', t('alpine.hud'));
  const rank = el('strong', 'alpine-rank', '06'), position = el('div', 'alpine-position'), of = el('span', 'alpine-of'); of.append(ltr('/ 06'), el('small', '', t('alpine.position')));
  position.append(rank, of);
  const info = el('div', 'alpine-race-info'), trackLine = el('span', 'alpine-track-line'); trackLine.append(t('alpine.trackLabel', {number: trackNumber}), el('i'), trackName);
  const distance = el('b', 'alpine-distance'), distanceValue = ltr('0'); distance.append(distanceValue, ' ', el('small', '', t('alpine.toFinish')));
  const progress = el('div', 'alpine-progress'), progressFill = el('span'); progress.append(progressFill); info.append(trackLine, distance, progress);
  const time = el('div', 'alpine-time'), timer = ltr('00:00.00'); time.append(el('small', '', t('alpine.raceTime')), timer);
  // Trick score and coins collected.
  const tally = el('div', 'alpine-tally'), scoreBox = el('span', 'alpine-score'), scoreValue = ltr('0'), coinBox = el('span', 'alpine-coins'), coinValue = ltr('0');
  scoreBox.append(svg(STAR), scoreValue); scoreBox.setAttribute('aria-label', t('alpine.score')); coinBox.append(svg(COIN), coinValue); coinBox.setAttribute('aria-label', t('alpine.coins'));
  tally.append(scoreBox, coinBox);
  hud.append(position, info, time, tally);
  // Opening card
  const intro = el('section', 'alpine-intro'); intro.setAttribute('aria-label', t('alpine.opening'));
  const title = el('h1', 'alpine-title'); title.dir = 'ltr'; title.append('ALPINE', el('br'), el('em', '', 'RUSH.'));
  const startButton = el('button', 'alpine-primary'); startButton.type = 'button'; startButton.dataset.action = 'alpine-start'; startButton.disabled = true;
  startButton.append(el('span', '', t('alpine.start')), svg(CHEVRON));
  const card = el('div', 'alpine-track-card'), cardText = el('div');
  cardText.append(el('b', '', trackName), el('small', '', t('alpine.trackMeta', {riders: balance.riders, km})));
  const dots = el('span', 'alpine-difficulty', '●'.repeat(track.difficulty) + '○'.repeat(3 - track.difficulty)); dots.setAttribute('aria-label', t('alpine.difficulty', {level: track.difficulty}));
  card.append(el('span', 'alpine-track-number', trackNumber), cardText, dots);
  const best = records.data.best[track.id], bestLine = el('p', 'alpine-best');
  if (best) bestLine.append(t('alpine.best') + ' ', ltr(formatRaceTime(best.ms))); else bestLine.textContent = t('alpine.goal', {rank: level.targetRank});
  // Colour choice on the opening card: the design's classic colours or Codex's graphics 5 colours.
  const THEME_KEY = 'island.alpine.theme', themes = el('div', 'alpine-themes'); themes.setAttribute('role', 'radiogroup'); themes.setAttribute('aria-label', t('alpine.theme'));
  let theme = 'classic'; try { theme = storage?.getItem(THEME_KEY) === 'codex' ? 'codex' : 'classic'; } catch {}
  const themeButtons = ['classic', 'codex'].map(id => { const b = el('button', 'alpine-theme'); b.type = 'button'; b.dataset.theme = id; b.dataset.action = 'alpine-theme'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', t(`alpine.theme.${id}`)); b.title = t(`alpine.theme.${id}`); b.append(el('i'), el('i')); themes.append(b); return b; });
  const setTheme = id => { theme = id; screen.dataset.alpineTheme = id; for (const b of themeButtons) b.setAttribute('aria-checked', String(b.dataset.theme === id)); };
  for (const b of themeButtons) b.addEventListener('click', () => { setTheme(b.dataset.theme); try { storage?.setItem(THEME_KEY, theme); } catch {} }, {signal: abort.signal});
  intro.append(el('span', 'alpine-eyebrow', 'THE MOUNTAIN IS YOURS'), title, el('p', 'alpine-tagline', t('alpine.tagline')), startButton, el('span', 'alpine-start-note', t('alpine.startNote')), card, bestLine, themes);
  const worldLabel = el('div', 'alpine-world-label'); worldLabel.setAttribute('aria-hidden', 'true'); worldLabel.append(el('span', '', '46°35′ N   08°02′ E'), el('b', '', 'ABOVE THE ORDINARY.'), el('span', '', '2,840 M / ALPINE CIRCUIT'));
  const countdown = el('div', 'alpine-countdown'); countdown.setAttribute('aria-live', 'assertive');
  const callout = el('div', 'alpine-callout'), calloutKicker = el('span'), calloutLine = el('b'); callout.append(calloutKicker, calloutLine); callout.hidden = true;
  const loading = el('div', 'alpine-loading'), loadingText = el('p', '', t('alpine.loading')); loading.append(el('span', 'alpine-spinner'), loadingText);
  // Footer controls (inside the island controls region)
  const footer = el('div', 'alpine-footer');
  const speed = el('div', 'alpine-speed'), speedValue = el('b', '', '0'), bars = el('div', 'alpine-speed-bars'); bars.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 6; i++) bars.append(el('i'));
  speed.append(speedValue, el('span', '', t('alpine.kmh')), bars);
  const hint = el('div', 'alpine-steer-hint'); hint.append(el('span', '', '‹'), el('span', '', t('alpine.dragHint')), el('span', '', '›')); hint.setAttribute('aria-hidden', 'true');
  const boostButton = el('button', 'alpine-boost'); boostButton.type = 'button'; boostButton.dataset.gameControl = 'boost'; boostButton.dataset.action = 'alpine-boost';
  boostButton.setAttribute('aria-label', t('alpine.boost')); boostButton.setAttribute('aria-keyshortcuts', 'Space');
  boostButton.append(svg(BOLT), el('b', '', t('alpine.boost')), el('small', '', 'SPACE'));
  // Joystick (left) and the action cluster: boost with four trick buttons around it (right).
  const joystick = el('div', 'alpine-joystick'); joystick.dataset.gameControl = 'joystick'; joystick.setAttribute('role', 'slider'); joystick.setAttribute('aria-label', t('alpine.joystick')); joystick.setAttribute('aria-valuemin', '-1'); joystick.setAttribute('aria-valuemax', '1'); joystick.setAttribute('aria-valuenow', '0');
  const knob = el('span', 'alpine-knob'); knob.dataset.joystickKnob = ''; joystick.append(el('i', 'alpine-joy-arrow left'), el('i', 'alpine-joy-arrow right'), knob);
  const actions = el('div', 'alpine-actions'), trickButtons = [];
  ['grab', 'spin', 'flip', 'combo'].forEach((id, i) => {
    const b = el('button', 'alpine-trick'); b.type = 'button'; b.dataset.trick = id; b.dataset.action = 'alpine-trick'; b.dataset.slot = String(3 - i); b.dataset.ready = 'false';
    b.setAttribute('aria-label', t(`alpine.trick.${id}`)); b.setAttribute('aria-keyshortcuts', String(i + 1)); b.title = t(`alpine.trick.${id}`);
    b.append(svg(TRICK_ICONS[id])); trickButtons.push(b); actions.append(b);
  });
  actions.append(boostButton);
  const center = el('div', 'alpine-center'); center.append(speed, hint);
  footer.append(joystick, center, actions);
  stage.append(vignette, brand, hud, intro, worldLabel, countdown, callout, loading);
  controls.classList.add('alpine-controls'); controls.append(footer); screen.append(css, polish); stage.append(app); setTheme(theme);
  dom = {app, nodes: [vignette, brand, hud, intro, worldLabel, countdown, callout, loading, footer, css, polish, app]};
  screen.dataset.alpineDusk = String(!!track.visual?.dusk);
  const setPhase = phase => { app.dataset.phase = phase; screen.dataset.alpinePhase = phase; };
  setPhase('menu');
  canvas.setAttribute('aria-label', t('alpine.canvas'));

  input = createAlpineControls({canvas, boostButton, joystick, trickButtons, config: {...balance.controls, trackHalfWidth: engine.pipe.lip - .3}});
  input.setEnabled(!paused);
  startButton.addEventListener('click', () => { if (session.start()) { setPhase('countdown'); canvas.focus({preventScroll: true}); } }, {signal: abort.signal});
  screen.addEventListener('pointerdown', () => audio.unlock(), {capture: true, signal: abort.signal});
  doc.addEventListener('keydown', () => audio.unlock(), {signal: abort.signal});
  canvas.addEventListener('webglcontextlost', event => { if (disposed) return; event.preventDefault(); renderError = 'webgl-context-lost'; fail(t('alpine.contextLost')); }, {signal: abort.signal});

  function fail(message) {
    session.setPaused(true); loading.hidden = false; loading.dataset.error = 'true'; loadingText.textContent = message;
    if (!loading.querySelector('button')) { const back = el('button', 'alpine-primary alpine-back', t('alpine.backIsland')); back.type = 'button'; back.dataset.action = 'alpine-back'; back.onclick = () => ctx.cancel(); loading.append(back); back.focus(); }
  }
  const params = new URLSearchParams(globalThis.location?.search || '');
  if (params.get('quality') === 'low') quality = 'low';
  governor = createQualityGovernor(balance.render, quality);
  const modelUrl = params.get('alpineModel') === 'missing' ? new URL('../assets/missing-alpine-rider.glb', import.meta.url).href : undefined;
  loadTimer = setTimeout(() => { if (!view && !disposed) { renderError = 'timeout'; fail(t('alpine.loadSlow')); } }, 25000);
  import('./alpine-view.mjs?v=island-naval-aim-20261030-1').then(({createSkiView}) => createSkiView(stage, {canvas, quality, course: engine.course, physics: balance.physics, visual: track.visual, maxDpr: balance.render.maxDpr, lowDpr: balance.render.lowDpr, isDisposed: () => disposed, ...(modelUrl ? {modelUrl} : {})})).then(loaded => {
    // A view that arrives after exit is released at once and never attached.
    if (disposed || renderError) { loaded.dispose(); return; }
    clearTimeout(loadTimer); view = loaded; loading.hidden = true; startButton.disabled = false; app.dataset.render = loaded.mode;
    if (!paused) startButton.focus({preventScroll: true});
    last = 0; frame = requestAnimationFrame(tick);
  }).catch(error => {
    if (disposed || error?.disposed) return;
    clearTimeout(loadTimer); renderError = String(error?.message || error); fail(t('alpine.unavailable')); ctx.onError?.('alpine.unavailable');
  });

  const CALLOUTS = {takeoff: 'air', collision: 'hit', boost: 'boost', pad: 'pad', overtake: 'overtake', gate: 'gate'};
  function showCallout(kind, now, kicker, line) { calloutKicker.textContent = kicker ?? t(`alpine.callout.${kind}.kicker`); calloutLine.textContent = line ?? t(`alpine.callout.${kind}`); callout.hidden = false; callout.dataset.kind = kind; calloutUntil = now + (kind === 'gate' ? .8 : 1.3); }
  let coinPulse = 0;
  function handleEvents(snap, now) {
    for (const e of engine.drainEvents()) {
      if (e.type === 'countdown') { audio.cue(e.value > 0 ? 'countdown' : 'go'); if (e.value > 0) ctx.sound?.('button'); continue; }
      if (e.riderId !== 'player') { if (e.type === 'overtake' && e.objectId === 'player') status.textContent = t('alpine.status.overtaken', {rank: snap.rank}); continue; }
      if (e.type === 'boost-start') { audio.cue('boost'); showCallout(e.objectId ? CALLOUTS.pad : CALLOUTS.boost, now); }
      else if (e.type === 'collision') { audio.cue('hit'); showCallout(CALLOUTS.collision, now); }
      else if (e.type === 'takeoff') { audio.cue('takeoff'); showCallout(CALLOUTS.takeoff, now); }
      else if (e.type === 'land') audio.cue('land');
      else if (e.type === 'trick-start') audio.cue('trickStart');
      else if (e.type === 'trick') { audio.cue('trick'); showCallout('trick', now, TRICK_NAMES[e.objectId] + (e.count > 1 ? ` ×${e.count}` : ''), t('alpine.callout.trick', {points: e.value})); status.textContent = t('alpine.status.trick', {points: e.value}); }
      else if (e.type === 'crash') { audio.cue('crash'); showCallout('crash', now); status.textContent = t('alpine.callout.crash'); }
      else if (e.type === 'coin') { audio.cue('coin'); coinPulse = now + .25; }
      else if (e.type === 'gate') { audio.cue('gate'); if (now > calloutUntil) showCallout(CALLOUTS.gate, now); }
      else if (e.type === 'overtake') { audio.cue('overtake'); if (now > calloutUntil) showCallout(CALLOUTS.overtake, now); status.textContent = t('alpine.status.rank', {rank: snap.rank}); }
      else if (e.type === 'finish') audio.cue('finish');
    }
  }
  let shownRank = '', shownSpeed = '', shownTime = '', shownCount = '', shownScore = '', shownCoins = '', shownDistance = '', shownProgress = '', shownTank = '';
  const barList = [...bars.children], setData = (key, value) => { if (screen.dataset[key] !== value) screen.dataset[key] = value; };
  function updateHud(snap) {
    const r = String(snap.rank).padStart(2, '0'); if (r !== shownRank) { shownRank = r; rank.textContent = r; }
    const remaining = Math.round(snap.remainingM); if (remaining !== shownDistance) { shownDistance = remaining; distanceValue.textContent = remaining.toLocaleString('en-US'); }
    const progressText = `${Math.min(100, snap.distanceM / snap.trackLength * 100).toFixed(1)}%`; if (progressText !== shownProgress) { shownProgress = progressText; progressFill.style.width = progressText; }
    const clock = formatRaceTime(snap.timeMs); if (clock !== shownTime) { shownTime = clock; timer.textContent = clock; }
    const kmh = String(snap.speedKmh); if (kmh !== shownSpeed) { shownSpeed = kmh; speedValue.textContent = kmh; }
    const fraction = Math.min(1, snap.speedKmh / (balance.physics.boostSpeed * 3.6));
    barList.forEach((bar, i) => bar.classList.toggle('on', fraction > i / 6 + .02));
    boostButton.classList.toggle('active', !!snap.player.boosting); const boostReady = String(!!snap.boostReady); if (boostButton.dataset.ready !== boostReady) boostButton.dataset.ready = boostReady;
    const tank = (snap.boostFraction ?? 0).toFixed(3); if (tank !== shownTank) { shownTank = tank; boostButton.style.setProperty('--tank', tank); }
    const count = snap.phase === 'countdown' ? String(snap.countdown) : ''; if (count !== shownCount) { shownCount = count; countdown.textContent = count; countdown.hidden = !count; }
    setData('boosting', String(!!snap.player.boosting)); setData('hit', String(!!snap.player.hit));
    hint.hidden = snap.timeMs > 6000;
    const score = (snap.score ?? 0).toLocaleString('en-US'); if (score !== shownScore) { shownScore = score; scoreValue.textContent = score; }
    const coinText = String(snap.coins ?? 0); if (coinText !== shownCoins) { shownCoins = coinText; coinValue.textContent = coinText; }
    coinBox.classList.toggle('pulse', snap.timeMs / 1000 < coinPulse);
    const ready = String(!!snap.trickReady); for (const b of trickButtons) if (b.dataset.ready !== ready) b.dataset.ready = ready;
    setData('crashed', String(!!snap.player.crashed));
  }

  function tick(at) {
    if (disposed) return;
    const dt = last ? Math.min(balance.physics.maxCatchUpSeconds, (at - last) / 1000) : 0, ms = last ? at - last : 0; last = at;
    const blocked = paused || doc.hidden;
    if (!blocked && view) {
      const sample = input.sample(lastSnapshot.player);
      engine.command({type: 'steer', value: sample.steer});
      if (sample.boost) engine.command({type: 'boost'});
      if (sample.trick) engine.command({type: 'trick', id: sample.trick});
      engine.step(dt);
      if (ms > 0 && engine.phase === 'racing' && governor.observe(ms) === 'low') { quality = 'low'; view.setQuality('low'); }
    }
    const snap = lastSnapshot = engine.snapshot(), now = snap.timeMs / 1000;
    if (snap.phase !== app.dataset.phase && snap.phase !== 'paused') setPhase(snap.phase);
    handleEvents(snap, now);
    if (now > calloutUntil) callout.hidden = true;
    audio.sync(blocked ? 0 : snap.speedKmh, {boosting: snap.player.boosting, carving: Math.abs(snap.player.lean || 0), airborne: snap.player.airborne});
    view.render(snap, engine.presentation()); updateHud(snap);
    if (snap.result && !finished) {
      finished = true;
      const r = snap.result;
      recordOutcome = recordRun(storage, balance.records, records, r);
      const summary = {...r, trackName, coinTotal: engine.course.coins, bestMs: recordOutcome.best?.ms ?? null, newBest: recordOutcome.newBest};
      ctx.onAlpineSummary?.(summary);
      const settled = ctx.finish({outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}});
      if (settled && settled.ok === false && !disposed) { ctx.onError?.(settled.reason); ctx.cancel(); }
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  return session;
}
