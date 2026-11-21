import {createAlpineRunner} from './alpine-runner-engine.mjs?v=island-v2-20261107-21';
import {alpineRunnerGoals, alpineRunnerProgress, alpineRunnerScore, alpineThemesEnabled} from './alpine-runner-rules.mjs?v=island-v2-20261107-21';
import {createAlpineAudio} from './alpine-audio.mjs?v=island-v2-20261107-21';
import {createQualityGovernor} from './alpine-quality.mjs';
import {saveGameReport} from '../ui/load-report.mjs?v=island-v2-20261107-21';

const BEST_KEY = 'island.alpine.runner.best.v1';
const THEME_KEY = 'island.alpine.runner.theme.v1';
// Third name: the title of the theme pack (alpine-runner-themes.mjs), shown while the packs are on.
const THEMES = {
  pine: ['01-pine', 'יער אורנים', 'יער המחטים'], ice: ['02-ice', 'קניון קרח', 'בקיע הקרח'], lava: ['03-volcano', 'מורדות געשיים', 'רכס הבזלת'],
  aurora: ['04-aurora', 'זוהר צפוני', 'עמק הזוהר'], village: ['05-village', 'כפר בשלג', 'כפר הגגות'], peak: ['06-summit', 'פסגה גבוהה', 'קו הפסגה']
};
const KEYS = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'slide', ' ': 'jump'};
const ACTIONS = [
  ['left', '‹', 'נתיב שמאלי', 'ArrowLeft'], ['right', '›', 'נתיב ימני', 'ArrowRight'],
  ['jump', '↑', 'קפיצה', 'ArrowUp Space'], ['slide', '↓', 'החלקה מתחת למכשול', 'ArrowDown']
];
const formatter = new Intl.NumberFormat('he-IL');
const format = value => formatter.format(Math.floor(value));

function readBest(storage) {
  try {
    const best = JSON.parse(storage?.getItem(BEST_KEY));
    if (best && Object.hasOwn(THEMES, best.theme) && [1, 2, 3].includes(best.difficulty) &&
        ['score', 'distance', 'coins', 'elapsed'].every(key => Number.isSafeInteger(best[key]) && best[key] >= 0) &&
        best.score === alpineRunnerScore(best.distance, best.coins)) return best;
  } catch {}
  return null;
}

function seedFor(ctx, params) {
  const requested = params.get('alpineRunnerSeed');
  if (requested?.trim()) return requested.slice(0, 128);
  const fallback = String(ctx.seed ?? 'alpine-runner');
  return fallback.trim() ? fallback.slice(0, 128) : 'alpine-runner';
}

export function runAlpineRunnerSession(ctx) {
  const params = new URLSearchParams(globalThis.location?.search || '');
  const seed = seedFor(ctx, params), difficulty = ctx.level || 1, goals = alpineRunnerGoals(difficulty);
  const {canvas, controls, status} = ctx;
  const doc = canvas?.ownerDocument, win = doc?.defaultView;
  const screen = canvas?.closest('.game-screen'), stage = canvas?.parentElement;
  let storage;
  try { storage = ctx.storage === undefined ? globalThis.localStorage : ctx.storage; } catch {}
  let theme = 'pine', best = readBest(storage);
  try {
    const savedTheme = storage?.getItem(THEME_KEY);
    if (Object.hasOwn(THEMES, savedTheme)) theme = savedTheme;
  } catch {}
  let engine = createAlpineRunner({seed, difficulty, theme});
  let phase = 'menu', paused = false, disposed = false, error = null;
  let view, audio, frame, loadingTimer, lastFrame, dom, pointer;
  let quality = params.get('quality') === 'low' || ctx.lite ? 'low' : 'high';
  const governor = ctx.balance?.render ? createQualityGovernor(ctx.balance.render, quality) : null;
  const abort = new AbortController();

  function requestFrame() {
    if (view && !disposed && !paused && !error && phase !== 'finished' && frame === undefined) frame = win.requestAnimationFrame(tick);
  }

  const session = {
    get ready() { return (!canvas || Boolean(view)) && !error; },
    get loadFailed() { return error; },
    get snapshot() {
      return {mode: 'runner', phase, paused, disposed, loaded: Boolean(view), error, quality, stage: difficulty,
        frame: disposed ? null : engine.snapshot(), records: {best: best && {...best}},
        renderMetrics: view?.metrics(), audioMetrics: audio?.metrics()};
    },
    start() {
      if (disposed || paused || !session.ready || phase !== 'menu') return false;
      phase = 'racing';
      lastFrame = undefined;
      if (screen) screen.dataset.alpinePhase = phase;
      if (dom) { dom.menu.hidden = true; dom.hud.hidden = false; dom.buttons.hidden = false; }
      audio?.unlock();
      audio?.cue('go');
      canvas?.focus({preventScroll: true});
      requestFrame();
      return true;
    },
    setPaused(value) {
      if (disposed) return;
      paused = Boolean(value);
      lastFrame = pointer = undefined;
      engine.clearCommands();
      audio?.setPaused(paused);
      if (paused && frame !== undefined) {
        win.cancelAnimationFrame(frame);
        frame = undefined;
      }
      if (!paused) requestFrame();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(loadingTimer);
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      abort.abort();
      audio?.dispose();
      view?.dispose();
      dom?.nodes.forEach(node => node.remove());
      if (screen) {
        delete screen.dataset.alpineMode;
        delete screen.dataset.alpinePhase;
      }
    }
  };

  if (params.get('dev') === '1' || ctx.debug) {
    session.debug = {get engine() { return engine; }, view: () => view, step: seconds => engine.step(seconds)};
  }
  if (!canvas) return session;

  try { audio = createAlpineAudio({storage: storage ?? null}); }
  catch { audio = createAlpineAudio({storage: null, AudioContext: null}); }

  const signal = abort.signal;
  const el = (tag, className = '', text = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (action, text, className = '') => {
    const node = el('button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    return node;
  };

  screen.dataset.alpineMode = 'runner';
  screen.dataset.alpinePhase = phase;
  canvas.setAttribute('aria-label', 'מסלול סקי אינסופי בשלושה נתיבים');
  const css = el('link');
  css.rel = 'stylesheet';
  css.href = new URL('./alpine-runner.css', import.meta.url).href;

  const menu = el('section', 'alpine-runner-menu');
  const heading = el('h1', '', 'גלישה אינסופית');
  const goal = el('p', 'alpine-runner-goal', `יעד שלב ${difficulty} · ${format(goals[0])} מטר לכוכב הראשון`);
  const bestLine = el('p', 'alpine-runner-best', best ? `שיא אישי · ${format(best.score)} נקודות` : 'השיא האישי יישמר בסיום הגלישה');
  const help = el('p', 'alpine-runner-help', 'החליקו ימינה או שמאלה למעבר נתיב, למעלה לקפיצה ולמטה להתכופפות.');
  const loading = el('p', 'alpine-runner-loading', 'טוען את המסלול…');
  loading.setAttribute('role', 'status');
  const start = button('alpine-start', 'גלישה', 'primary-button alpine-runner-start');
  start.disabled = true;
  start.addEventListener('click', () => session.start(), {signal});

  const themePicker = el('fieldset', 'alpine-runner-themes');
  themePicker.append(el('legend', '', 'סביבת גלישה'));
  function selectTheme(id) {
    if (phase !== 'menu' || id === theme) return;
    theme = id;
    engine = createAlpineRunner({seed, difficulty, theme});
    view?.setTheme(THEMES[theme][0]);
    for (const item of themePicker.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.theme === theme));
    try { storage?.setItem(THEME_KEY, theme); } catch {}
  }
  // Light mode (a phone measured as slow, or the load rescue) keeps the base look: fewer files and a cheaper sky.
  // ?alpineThemes=1 asks for the packs there too.
  const packs = alpineThemesEnabled(params) && (!ctx.lite || params.get('alpineThemes') === '1');
  for (const [id, [, name, packName]] of Object.entries(THEMES)) {
    const item = button('alpine-runner-theme', packs ? packName : name);
    item.dataset.theme = id;
    item.setAttribute('aria-pressed', String(id === theme));
    item.addEventListener('click', () => selectTheme(id), {signal});
    themePicker.append(item);
  }

  menu.append(heading, goal, bestLine, help, themePicker, loading, start);
  const hud = el('section', 'alpine-runner-hud');
  hud.setAttribute('aria-label', 'מצב הגלישה');
  hud.hidden = true;
  const fields = {};
  for (const [key, title] of [['distance', 'מרחק'], ['coins', 'מטבעות'], ['score', 'ניקוד']]) {
    const field = el('div');
    const value = el('bdi', '', '0');
    value.dataset.runnerHud = key;
    field.append(el('span', '', title), value);
    hud.append(field);
    fields[key] = value;
  }
  const powers = el('p', 'alpine-runner-power');
  powers.hidden = true;
  const buttons = el('div', 'alpine-runner-input');
  buttons.dir = 'ltr';
  buttons.hidden = true;
  const dispatch = action => !disposed && !paused && phase === 'racing' && engine.command(action);
  for (const [action, icon, label, shortcut] of ACTIONS) {
    const item = button('alpine-runner-' + action, icon);
    item.setAttribute('aria-label', label);
    item.setAttribute('aria-keyshortcuts', shortcut);
    item.addEventListener('click', () => dispatch(action), {signal});
    buttons.append(item);
  }
  stage.append(menu, hud, powers);
  controls.append(buttons);
  screen.append(css);
  dom = {menu, hud, buttons, nodes: [menu, hud, powers, buttons, css]};

  screen.addEventListener('keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.key === ' ' && event.target.closest?.('button'))) return;
    if (KEYS[event.key] && dispatch(KEYS[event.key])) event.preventDefault();
  }, {signal});
  canvas.addEventListener('pointerdown', event => {
    if (paused || phase !== 'racing' || !event.isPrimary || event.button !== 0) return;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    canvas.setPointerCapture?.(event.pointerId);
  }, {signal});
  function swipe(event, ended) {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 25) {
      dispatch(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'jump' : 'slide'));
      pointer = undefined;
    }
    if (ended) pointer = undefined;
  }
  canvas.addEventListener('pointermove', event => swipe(event, false), {signal});
  canvas.addEventListener('pointerup', event => swipe(event, true), {signal});
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => { if (pointer?.id === event.pointerId) pointer = undefined; }, {signal});
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fail('webgl-context-lost');
  }, {signal});

  function fail(reason) {
    if (disposed || error) return;
    error = reason;
    session.setPaused(true);
    loading.textContent = 'טעינת המסלול נכשלה';
    loading.hidden = false;
    status.textContent = loading.textContent;
    saveGameReport('alpineRunner', {status: 'failed', lines: ['runner: ' + reason]});
  }

  function complete(snap) {
    phase = 'finished';
    screen.dataset.alpinePhase = phase;
    const {score, coins} = snap;
    const result = {distance: Math.floor(snap.distance), elapsed: Math.round(snap.elapsed * 1000),
      coins, score, theme, difficulty, crashed: true};
    const latest = readBest(storage);
    if (latest && (!best || latest.score > best.score)) best = latest;
    const newBest = !best || score > best.score;
    if (newBest) {
      best = {...result};
      try { storage?.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
    }
    ctx.onAlpineSummary?.({mode: 'runner', ...result, best: best && {...best}, newBest});
    const {outcome} = alpineRunnerProgress(result.distance, difficulty);
    const settled = ctx.finish({outcome, score, runner: result});
    if (settled?.ok === false && !disposed) {
      ctx.onError?.(settled.reason);
      ctx.cancel();
    }
  }

  let lastHud = -Infinity;
  function tick(at) {
    frame = undefined;
    if (disposed || paused || error || doc.hidden) return;
    const delta = lastFrame === undefined ? 0 : at - lastFrame;
    lastFrame = at;
    if (phase === 'racing') {
      engine.step(delta / 1000);
      if (delta > 0 && governor?.observe(delta) === 'low' && quality !== 'low') {
        quality = 'low';
        view.setQuality(quality);
      }
    }
    const snap = engine.snapshot();
    view.render(snap);
    if (phase === 'racing') {
      for (const event of engine.drainEvents()) {
        audio.cue({coin: 'coin', powerup: 'gate', shield: 'hit', crash: 'crash'}[event.type]);
      }
      audio.sync(snap.speed * 3.6, {airborne: snap.stance === 'jump', crashed: snap.status === 'crashed'});
      if (snap.elapsed - lastHud >= .1 || snap.status === 'crashed') {
        lastHud = snap.elapsed;
        fields.distance.textContent = format(snap.distance) + ' מ׳';
        fields.coins.textContent = format(snap.coins);
        fields.score.textContent = format(snap.score);
        const active = [
          snap.powerups.shield ? 'מגן' : '',
          snap.powerups.magnet ? `מגנט ${Math.ceil(snap.powerups.magnet)} שנ׳` : '',
          snap.powerups.double ? `כפל מטבעות ${Math.ceil(snap.powerups.double)} שנ׳` : ''
        ].filter(Boolean);
        powers.hidden = !active.length;
        powers.textContent = active.join(' · ');
      }
      if (snap.status === 'crashed') { complete(snap); return; }
    }
    requestFrame();
  }

  const loadStart = performance.now();
  loadingTimer = setTimeout(() => fail('timeout'), 25000);
  import('./alpine-runner-view.mjs?v=island-v2-20261107-21').then(({createAlpineRunnerView}) =>
    createAlpineRunnerView(stage, {canvas, quality, theme: THEMES[theme][0], themes: packs, goal: goals[0], isDisposed: () => disposed || Boolean(error)})
  ).then(loaded => {
    clearTimeout(loadingTimer);
    if (disposed || error) { loaded.dispose(); return; }
    view = loaded;
    // A theme picked while the first one was loading.
    view.setTheme(THEMES[theme][0]);
    view.render(engine.snapshot());
    start.disabled = false;
    loading.hidden = true;
    saveGameReport('alpineRunner', {status: 'ready', ms: performance.now() - loadStart, lines: ['runner · ' + loaded.mode + ' · ' + quality + ' · themes ' + (loaded.metrics().themePack ?? 'base')]});
    if (!paused) start.focus({preventScroll: true});
    requestFrame();
  }).catch(cause => {
    clearTimeout(loadingTimer);
    fail(String(cause?.message || cause));
  });

  return session;
}
