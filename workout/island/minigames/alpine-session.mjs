import {kidUx, kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-21';
import {createAlpineHud} from './alpine-hud.mjs';
import {enhanceAlpineOpening} from './alpine-screen.mjs';
import {createAlpineEngine} from './alpine-engine.mjs?v=island-v2-20261107-21';
import {createAlpineControls} from './alpine-controls.mjs?v=island-v2-20261107-21';
import {createAlpineAudio} from './alpine-audio.mjs?v=island-v2-20261107-21';
import {loadRecords,recordRun,formatRaceTime,alpineRunBalance,alpineHistoryStorage} from './alpine-records.mjs?v=island-v2-20261107-21';
import {createQualityGovernor} from './alpine-quality.mjs';
import {saveGameReport} from '../ui/load-report.mjs?v=island-v2-20261107-21';
import {leagueBalance} from './alpine-league-stages.mjs?v=island-v2-20261107-21';
import {createGhostRecorder,loadGhost,saveGhost,ghostTimeAt} from './alpine-league-ghost.mjs?v=island-v2-20261107-21';
import {THEME_LOOKS} from './alpine-league-theme.mjs?v=island-v2-20261107-21';
import {THEMES} from './alpine-league-core.mjs?v=island-v2-20261107-21';
import {createStartLights,startLightsEnabled} from './alpine-start-lights.mjs?v=island-v2-20261107-21';
import {balanceForPage,SECTION_NAMES,SECTION_HINTS} from './alpine-v241.mjs?v=island-v2-20261107-21';
import {alpineRunnerEnabled} from './alpine-runner-rules.mjs?v=island-v2-20261107-21';
import {runAlpineRunnerSession} from './alpine-runner-session.mjs?v=island-v2-20261107-21';

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
/** League goal icons: finish flag (place), clock (time), slalom gate (gates), shield (no fall). */
const GOAL_ICONS = {
  place: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  time: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  gates: '<path d="M6 21V5m12 16V5M6 7h12"/><path d="M6 11h3m6 0h3"/>',
  clean: '<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
};
const WIND_ICON = '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8"/>';
/** v24.1 power-up icons: a horseshoe magnet and a shield. */
const MAGNET_ICON = '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3H6Z"/><path d="M6 7h4m4 0h4"/>';
const SHIELD_ICON = '<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"/>';
/** Goal time as a child reads it: 1:05 or 1:05.5 (goal times are whole half seconds). */
export const goalClock = ms => { const s = Math.ceil(ms / 500) / 2, m = Math.floor(s / 60), r = s - m * 60; return `${m}:${String(Math.floor(r)).padStart(2, '0')}${r % 1 ? '.5' : ''}`; };
export function goalText(g) {
  if (g.kind === 'place') return g.target === 1 ? 'לסיים ראשונים (חובה)' : `לסיים במקום ${g.target} ומעלה (חובה)`;
  if (g.kind === 'time') return `לסיים עד ${goalClock(g.ms)}`;
  if (g.kind === 'gates') return `לעבור ${g.count} שערים מתוך ${g.total}`;
  return 'לגלוש בלי ליפול';
}

export function runAlpineSession(ctx) {
  if (ctx.canvas && !ctx.alpineLeague && alpineRunnerEnabled()) return runAlpineRunnerSession(ctx);
  return runAlpineRaceSession(ctx);
}

/** Controller for one Alpine Rush session: owns the engine, the view, requestAnimationFrame,
 * input, audio and the HUD. The island engine owns rewards; this file only reports the
 * finished race once through ctx.finish. Without a canvas it runs headless (tests). */
export function runAlpineRaceSession(ctx) {
  // Ski league v23: the island engine hands a league run its setup (ctx.alpineLeague: stage, theme, goals, gear); the course, rivals and
  // speed come from the league balance of that stage. Without it this is the regular game, unchanged.
  const league = ctx.alpineLeague || null, leagueTheme = league ? THEME_LOOKS[league.theme] : null;
  // v24.1: ?alpineV241=0 runs v24 (the island strips the balance too, so the result check sees the same courses; stripping is idempotent).
  const pageBalance = balanceForPage(ctx.balance);
  const balance = alpineRunBalance(pageBalance, league?.n), stageNumber = ctx.level || 1, t = ctx.t || (key => key);
  const engine = createAlpineEngine({balance, stage: stageNumber, seed: ctx.seed, equipment: ctx.equipment, power: ctx.power});
  const level = engine.level, track = engine.track, v241 = !!balance.physics.v241;
  let storage = null; try { storage = ctx.storage === undefined ? globalThis.localStorage : ctx.storage; } catch {}
  const historyStorage = alpineHistoryStorage(storage, balance, engine.course);
  const records = loadRecords(historyStorage, balance.records);
  // League: the record run of this stage rides along as a ghost, and this run is recorded to become the next ghost if it is faster.
  const ghostTrack = league ? loadGhost(historyStorage, league.n) : null, ghostRecorder = league ? createGhostRecorder() : null;
  let ghostOutcome = null;
  let audio; try { audio = createAlpineAudio({storage}); } catch { audio = createAlpineAudio({storage: null, AudioContext: null}); }
  let kitHud=null;
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
    /** Shared loading contract (ui/load-rescue.mjs): ready once the view is attached; loadFailed is the reason string. */
    get ready() { return Boolean(view) && !renderError; },
    get loadFailed() { return renderError; },
    dispose() {
      if (disposed) return; disposed = true; clearTimeout(loadTimer);
      if (frame !== undefined) cancelAnimationFrame(frame); abort.abort(); input?.dispose(); kitHud?.destroy(); audio.dispose(); view?.dispose(); engine.dispose();
      dom?.nodes.forEach(n => n.remove());
    },
    get snapshot() {
      return {phase: engine.phase, paused, disposed, loaded: Boolean(view), error: renderError, quality, stage: stageNumber, trackId: track.id,
        frame: disposed ? null : engine.snapshot(), records: {status: records.status, best: records.data.best[track.id] || null}, recordOutcome,
        renderMetrics: view?.metrics(), audioMetrics: audio.metrics(), qualityGovernor: governor?.metrics() ?? null, input: input ? {enabled: input.enabled, dragging: input.dragging} : null, v241,
        ...(league ? {league: {n: league.n, theme: league.theme, boss: league.boss, goals: league.goals, ghost: ghostTrack ? {ms: ghostTrack.ms} : null, ghostOutcome, speed: balance.league?.speed ?? 1}} : {})};
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
  const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('./alpine.css?v=island-v2-20261107-21', import.meta.url).href;
  const polish = el('link'); polish.rel = 'stylesheet'; polish.href = new URL('./alpine-polish.css?v=island-v2-20261107-21', import.meta.url).href;
  const screenCss=el('link');screenCss.rel='stylesheet';screenCss.href=new URL('./alpine-screen.css',import.meta.url).href;
  const kitCss=el('link');kitCss.rel='stylesheet';kitCss.href=new URL('../design/hud-kit/hud.css',import.meta.url).href;
  const feelCss=el('link');feelCss.rel='stylesheet';feelCss.href=new URL('./alpine-feel.css',import.meta.url).href;
  const cleanCss=el('link');cleanCss.rel='stylesheet';cleanCss.href=new URL('./alpine-clean.css?v=island-v2-20261107-21',import.meta.url).href;
  const app = el('div', 'alpine-app'); app.dataset.phase = 'menu';
  const vignette = el('div', 'alpine-vignette');
  const brand = el('div', 'alpine-brand'); brand.setAttribute('aria-hidden', 'true'); brand.append(svg(BRAND, '0 0 40 32'), ltr('ALPINE')); brand.lastChild.append(el('span', 'alpine-brand-light', 'RUSH'));
  const trackName = league ? league.name : t(track.name), trackNumber = String(track.number).padStart(2, '0'), km = (track.length / 1000).toLocaleString('he-IL', {maximumFractionDigits: 2});
  // HUD
  const hud = el('section', 'alpine-hud'); hud.setAttribute('aria-label', t('alpine.hud'));
  const kidGoal=Boolean(league)&&kidUx('030');
  if(kidGoal)screen.dataset.kidAlpineGoal='true';
  if(kidGoal)kidUxStyle('030',
    '.game-screen[data-game=alpineRush][data-kid-alpine-goal] .alpine-goal[data-goal=place]{font-size:14px;background:#f5fbfd;color:#173748}' +
    '.game-screen[data-game=alpineRush][data-kid-alpine-goal] .alpine-goal[data-goal=place] b{display:grid;gap:1px;white-space:nowrap}' +
    '.game-screen[data-game=alpineRush][data-kid-alpine-goal] .alpine-flight-cue:empty{display:none}' +
    '@media(max-height:500px){.game-screen[data-game=alpineRush][data-kid-alpine-goal] .alpine-kit-speed>.alpine-flight-cue{top:auto;bottom:0;left:calc(100% + 8px)}}'
  );
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
  // League HUD: the three goals live (place, time, gates or a clean run), the gap to the record ghost and the side wind.
  let goalNodes = null, ghostGap = null, windCue = null;
  if (league) {
    const goalBar = el('div', 'alpine-league-goals'); goalBar.setAttribute('aria-label', 'יעדי השלב'); goalNodes = {};
    for (const g of league.goals) { const node = el('span', 'alpine-goal'); node.dataset.goal = g.kind; node.append(svg(GOAL_ICONS[g.kind]), el('b')); goalNodes[g.kind] = {node, value: node.lastChild, goal: g, shown: ''}; goalBar.append(node); }
    ghostGap = el('span', 'alpine-ghost-gap'); ghostGap.hidden = true; time.append(ghostGap);
    windCue = el('div', 'alpine-wind'); windCue.setAttribute('role', 'status'); windCue.hidden = true;
    hud.append(goalBar, windCue);
    screen.dataset.alpineLeague = league.theme; screen.style.setProperty('--league-accent', leagueTheme?.accent || '#3f8f5a');
  }
  // v24.1 HUD: the section ahead or underway (a pill in the middle of the top edge) and the power-ups held (magnet seconds, shield).
  let sectionCue = null, magnetChip = null, shieldChip = null;
  if (v241) {
    sectionCue = el('div', 'alpine-section-cue'); sectionCue.setAttribute('role', 'status'); sectionCue.dir = 'rtl'; sectionCue.hidden = true;
    // the chips sit in the score/coin row, which grows toward the free middle (a row of their own ran into the trick buttons)
    magnetChip = el('span', 'alpine-power'); magnetChip.dataset.power = 'magnet'; magnetChip.append(svg(MAGNET_ICON), el('b')); magnetChip.setAttribute('aria-label', 'מגנט');
    shieldChip = el('span', 'alpine-power'); shieldChip.dataset.power = 'shield'; shieldChip.append(svg(SHIELD_ICON), el('b', '', 'מגן'));
    magnetChip.hidden = shieldChip.hidden = true; tally.append(magnetChip, shieldChip); hud.append(sectionCue);
  }
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
  if (league) {
    // League opening: the theme and the place in it, the three goals (a star each), the record of this stage.
    cardText.replaceChildren(el('b', '', trackName), el('small', '', `ליגת הסקי · שלב ${league.number} · ${km} ק״מ${league.boss ? ' · מסלול ארוך' : ''}`));
    bestLine.replaceChildren(); if (best) bestLine.append('השיא שלך בשלב: ', ltr(formatRaceTime(best.ms)), ghostTrack ? ' · רוח הרפאים של השיא גולשת איתך' : ''); else bestLine.textContent = 'עוד אין שיא בשלב הזה';
  }
  const eyebrow = league ? `${league.themeName} · ${league.boss ? 'שלב בוס' : `שלב ${league.index} מתוך 5`}` : 'THE MOUNTAIN IS YOURS';
  intro.append(el('span', 'alpine-eyebrow', eyebrow), title, el('p', 'alpine-tagline', league ? (THEMES.find(x => x.id === league.theme)?.line || '') + (league.boss ? ' · מסלול ארוך ונקודות כפולות' : '') : t('alpine.tagline')), startButton, el('span', 'alpine-start-note', t('alpine.startNote') + (v241 ? ' · משיכה למטה מאטה' : '')), card, bestLine, themes);
  // v24.1: what this course holds, in its order (every stage has its own mix), under the course card.
  if (v241 && engine.course.sections?.length) { const line = el('p', 'alpine-sections-line', 'במסלול: ' + engine.course.sections.map(z => SECTION_NAMES[z.kind]).join(' · ')); line.dir = 'rtl'; intro.append(line); }
  enhanceAlpineOpening({intro,doc});
  if (league) {
    const list = el('ol', 'alpine-league-goal-list'); list.setAttribute('aria-label', 'שלושה יעדים, כוכב לכל יעד');
    for (const g of league.goals) { const li = el('li'); li.dataset.goal = g.kind; li.append(svg(GOAL_ICONS[g.kind]), el('span', '', goalText(g))); list.append(li); }
    (intro.querySelector('.alpine-screen-meta') || intro).prepend(list);
  }
  const worldLabel = el('div', 'alpine-world-label'); worldLabel.setAttribute('aria-hidden', 'true'); worldLabel.append(el('span', '', '46°35′ N   08°02′ E'), el('b', '', 'ABOVE THE ORDINARY.'), el('span', '', '2,840 M / ALPINE CIRCUIT'));
  const countdown = el('div', 'alpine-countdown'); countdown.setAttribute('aria-live', 'assertive');
  // Start lights (Formula 1 style) instead of the big number; ?alpineStartLights=0 keeps the number. A beep for every lamp and the start
  // cue at green replace the per-second countdown cues.
  const lightsOn = startLightsEnabled(), lights = lightsOn ? createStartLights(doc, {totalMs: balance.physics.countdownSeconds * 1000, onLamp: () => { audio.cue('countdown'); ctx.sound?.('button'); }}) : null;
  const lightsCss = lightsOn ? el('link') : null; if (lightsCss) { lightsCss.rel = 'stylesheet'; lightsCss.href = new URL('./alpine-start-lights.css?v=island-v2-20261107-21', import.meta.url).href; }
  const callout = el('div', 'alpine-callout'), calloutKicker = el('span'), calloutLine = el('b'); callout.append(calloutKicker, calloutLine); callout.hidden = true;
  const loading = el('div', 'alpine-loading'), loadingText = el('p', '', t('alpine.loading')); loading.append(el('span', 'alpine-spinner'), loadingText);
  // Footer controls (inside the island controls region)
  const footer = el('div', 'alpine-footer');
  const speed=el('div','alpine-speed');
  const maxPlayerSpeedKmh=balance.physics.boostSpeed*3.6*Math.max(1,Math.min(1.1,Number(ctx.equipment?.wax)||1));
  kitHud=createAlpineHud({speed,callout,kicker:calloutKicker,line:calloutLine,maxSpeedKmh:maxPlayerSpeedKmh});
  const hint = el('div', 'alpine-steer-hint'); hint.append(el('span', '', '‹'), el('span', '', t('alpine.dragHint')), el('span', '', '›')); hint.setAttribute('aria-hidden', 'true');
  // v24.1: a second line under the steering hint (its own element: the hint's first and last spans are its big arrows)
  const brakeHint = v241 ? el('div', 'alpine-brake-hint', '↓ למטה מאטים') : null; if (brakeHint) brakeHint.setAttribute('aria-hidden', 'true');
  const boostButton = el('button', 'alpine-boost'); boostButton.type = 'button'; boostButton.dataset.gameControl = 'boost'; boostButton.dataset.action = 'alpine-boost';
  boostButton.setAttribute('aria-label', t('alpine.boost')); boostButton.setAttribute('aria-keyshortcuts', 'Space');
  boostButton.append(svg(BOLT), el('b', '', t('alpine.boost')), el('small', '', 'SPACE'));
  // Joystick (left) and the action cluster: boost with four trick buttons around it (right).
  const joystick = el('div', 'alpine-joystick'); joystick.dataset.gameControl = 'joystick'; joystick.setAttribute('role', 'slider'); joystick.setAttribute('aria-label', t('alpine.joystick')); joystick.setAttribute('aria-valuemin', '-1'); joystick.setAttribute('aria-valuemax', '1'); joystick.setAttribute('aria-valuenow', '0');
  const knob = el('span', 'alpine-knob'); knob.dataset.joystickKnob = ''; joystick.append(el('i', 'alpine-joy-arrow left'), el('i', 'alpine-joy-arrow right'), ...(v241 ? [el('i', 'alpine-joy-arrow down')] : []), knob);
  const actions = el('div', 'alpine-actions'), trickButtons = [];
  ['grab', 'spin', 'flip', 'combo'].forEach((id, i) => {
    const b = el('button', 'alpine-trick'); b.type = 'button'; b.dataset.trick = id; b.dataset.action = 'alpine-trick'; b.dataset.slot = String(3 - i); b.dataset.ready = 'false';
    b.setAttribute('aria-label', t(`alpine.trick.${id}`)); b.setAttribute('aria-keyshortcuts', String(i + 1)); b.title = t(`alpine.trick.${id}`);
    b.append(svg(TRICK_ICONS[id]), el('span', 'alpine-trick-label', t(`alpine.trick.${id}`))); trickButtons.push(b); actions.append(b);
  });
  actions.append(boostButton);
  // Blinking arrow beside the boost button while the tank is full and the boost is ready to press.
  const boostArrow = el('span', 'alpine-boost-arrow'); boostArrow.setAttribute('aria-hidden', 'true'); boostArrow.hidden = true;
  boostArrow.append(svg('<path d="M4 6l8 6-8 6M12 6l8 6-8 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'));
  const boostCaption = el('span', 'alpine-boost-caption', t('alpine.boostReady')); boostCaption.setAttribute('aria-hidden', 'true'); boostCaption.hidden = true;
  actions.append(boostArrow, boostCaption);
  const trickCaption = el('span', 'alpine-trick-caption', t('alpine.tricks')); trickCaption.setAttribute('aria-hidden', 'true'); actions.append(trickCaption);
  const kidTricks=kidUx('029');
  let trickPreview, trickAnimation;
  if(kidTricks){
    screen.dataset.kidAlpineTricks='true';
    kidUxStyle('029',
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .alpine-trick .alpine-trick-label{font-size:14px;color:#103349;opacity:1}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .alpine-trick[data-ready=false]{opacity:1;background:#edf8fc}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .alpine-trick[data-ready=true]{background:#ffae73;color:#102536}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .alpine-trick-caption{font-size:14px;color:#fff;background:#103349;opacity:1}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .alpine-trick-caption[data-ready=true]{color:#102536;background:#ffae73}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .kid-alpine-preview{position:absolute;right:100%;bottom:36px;margin-inline-start:12px;display:grid;justify-items:center;min-width:96px;padding:6px 12px;border-radius:10px;background:#103349;color:#fff;font-size:14px;line-height:1.2;pointer-events:none;white-space:nowrap}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .kid-alpine-preview[hidden]{display:none}' +
      '.game-screen[data-game=alpineRush][data-kid-alpine-tricks] .kid-alpine-preview .rider{font-size:29px;line-height:1.1}'
    );
    trickPreview=el('div','kid-alpine-preview');
    const rider=el('span','rider','🏂'),move=el('b');
    rider.setAttribute('aria-hidden','true');trickPreview.append(rider,move);trickPreview.hidden=true;actions.append(trickPreview);
    const poses={grab:'translateY(-7px) rotate(-24deg) scale(.77)',spin:'rotateY(360deg)',flip:'rotate(-360deg)',combo:'rotateY(360deg) rotate(-360deg)'};
    const diagrams={grab:'↑ 🏂',spin:'⟳ 🏂',flip:'↶ 🏂',combo:'⟳ ↶ 🏂'};
    actions.addEventListener('pointerdown',event=>{
      const button=event.target.closest?.('button[data-trick]');
      if(!button||button.dataset.ready==='true')return;
      const id=button.dataset.trick;
      trickAnimation?.cancel();
      if(!trickPreview.hidden&&trickPreview.dataset.trick===id){trickPreview.hidden=true;return;}
      move.textContent=t('alpine.trick.'+id);
      trickPreview.dataset.trick=id;trickPreview.hidden=false;
      if(!rider.animate||doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches)rider.textContent=diagrams[id];
      else{
        rider.textContent='🏂';
        const frames=id==='grab'?['none',poses[id],'none']:['none',poses[id]];
        trickAnimation=rider.animate(frames.map(transform=>({transform})),{duration:1000,iterations:Infinity});
      }
    },{capture:true,signal:abort.signal});
    abort.signal.addEventListener('abort',()=>trickAnimation?.cancel(),{once:true});
  }
  const center = el('div', 'alpine-center'); center.append(speed, hint, ...(brakeHint ? [brakeHint] : []));
  footer.append(joystick, center, actions);
  stage.append(vignette, brand, hud, intro, worldLabel, countdown, callout, loading); if (lights) stage.append(lights.node);
  controls.classList.add('alpine-controls'); controls.append(footer); screen.append(css, polish, screenCss, kitCss, feelCss, cleanCss); stage.append(app); setTheme(theme);
  dom = {app, nodes: [vignette, brand, hud, intro, worldLabel, countdown, callout, loading, footer, css, polish, screenCss, kitCss, feelCss, cleanCss, app]};
  if (lights) { screen.append(lightsCss); dom.nodes.push(lights.node, lightsCss); app.dataset.startLights = 'true'; }
  if (league) { const leagueCss = el('link'); leagueCss.rel = 'stylesheet'; leagueCss.href = new URL('./alpine-league.css?v=island-v2-20261107-21', import.meta.url).href; screen.append(leagueCss); dom.nodes.push(leagueCss); }
  if (v241) { const v241Css = el('link'); v241Css.rel = 'stylesheet'; v241Css.href = new URL('./alpine-v241.css?v=island-v2-20261107-21', import.meta.url).href; screen.append(v241Css); dom.nodes.push(v241Css); screen.dataset.alpineV241 = 'true'; }
  screen.dataset.alpineDusk = String(!!track.visual?.dusk);
  const setPhase = phase => { app.dataset.phase = phase; screen.dataset.alpinePhase = phase; };
  setPhase('menu');
  canvas.setAttribute('aria-label', t('alpine.canvas'));

  input = createAlpineControls({canvas, boostButton, joystick, trickButtons, config: {...balance.controls, trackHalfWidth: engine.pipe.lip - .3, ...(v241 ? {brake: {deadzone: balance.physics.v241.brake?.deadzone ?? .35}} : {})}});
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
  if (params.get('quality') === 'low' || ctx.lite) quality = 'low';
  governor = createQualityGovernor(balance.render, quality);
  const modelUrl = params.get('alpineModel') === 'missing' ? new URL('../assets/missing-alpine-rider.glb', import.meta.url).href : undefined;
  const loadStart = performance.now();
  loadTimer = setTimeout(() => { if (!view && !disposed) { renderError = 'timeout'; saveGameReport('alpine', {status: 'failed', ms: performance.now() - loadStart, lines: ['failed: timeout 25 s']}); fail(t('alpine.loadSlow')); } }, 25000);
  import('./alpine-view.mjs?v=island-v2-20261107-21').then(({createSkiView}) => createSkiView(stage, {canvas, quality, maxPlayerSpeedKmh, course: engine.course, physics: balance.physics, visual: track.visual, maxDpr: balance.render.maxDpr, lowDpr: balance.render.lowDpr, isDisposed: () => disposed, v7: balance.assets?.v7, ...(modelUrl ? {modelUrl} : {}), ...(ghostTrack ? {ghost: ghostTrack} : {})})).then(async loaded => {
    await audio.ready;
    // A view that arrives after exit is released at once and never attached.
    if (disposed || renderError) { loaded.dispose(); return; }
    clearTimeout(loadTimer); saveGameReport('alpine', {status: 'ready', ms: performance.now() - loadStart, lines: ['render mode ' + loaded.mode + ' · quality ' + quality]}); view = loaded; loading.hidden = true; startButton.disabled = false; app.dataset.render = loaded.mode;
    if (!paused) startButton.focus({preventScroll: true});
    last = 0; frame = requestAnimationFrame(tick);
  }).catch(error => {
    if (disposed || error?.disposed) return;
    clearTimeout(loadTimer); renderError = String(error?.message || error); saveGameReport('alpine', {status: 'failed', ms: performance.now() - loadStart, lines: ['failed: ' + renderError]}); fail(t('alpine.unavailable')); ctx.onError?.('alpine.unavailable');
  });

  const CALLOUTS = {takeoff: 'air', collision: 'hit', boost: 'boost', pad: 'pad', overtake: 'overtake', gate: 'gate'};
  function showCallout(kind, now, kicker, line) { calloutKicker.textContent = kicker ?? t(`alpine.callout.${kind}.kicker`); calloutLine.textContent = line ?? t(`alpine.callout.${kind}`); callout.hidden = false; callout.dataset.kind = kind; kitHud.event(kind,calloutKicker.textContent,calloutLine.textContent); calloutUntil = now + (kind === 'gate' ? .8 : kind === 'section' ? 2.2 : 1.3); }
  /** v24.1 pickups: stars count quietly (a chime and the score), rings and power-ups get a call-out that says what they do. */
  function onPickup(e, now) {
    if (e.objectType === 'star') { audio.cue('star'); return; }
    if (e.objectType === 'ring') { audio.cue('ring'); showCallout('ring', now, 'טבעת', `+${e.value}`); return; }
    audio.cue('power');
    if (e.objectType === 'magnet') { showCallout('power', now, 'מגנט', 'מטבעות וכוכבים נמשכים אליכם'); status.textContent = 'מגנט: מטבעות וכוכבים נמשכים אליכם'; }
    else { showCallout('power', now, 'מגן', 'המגן מונע את הנפילה הבאה'); status.textContent = 'מגן: מונע את הנפילה הבאה'; }
  }
  let coinPulse = 0;
  function handleEvents(snap, now) {
    for (const e of engine.drainEvents()) {
      if (e.type === 'countdown') { if (lightsOn) { if (e.value === 0) audio.cue('go'); } else { audio.cue(e.value > 0 ? 'countdown' : 'go'); if (e.value > 0) ctx.sound?.('button'); } continue; }
      if (e.riderId !== 'player') { if (e.type === 'overtake' && e.objectId === 'player') status.textContent = t('alpine.status.overtaken', {rank: snap.rank}); continue; }
      if (e.type === 'boost-start') { audio.cue('boost'); showCallout(e.objectId ? CALLOUTS.pad : CALLOUTS.boost, now); }
      else if (e.type === 'collision') { audio.cue('hit'); /* the fall itself is the feedback: no banner text */ }
      else if (e.type === 'takeoff') { audio.cue('takeoff'); showCallout(CALLOUTS.takeoff, now); }
      else if (e.type === 'land') audio.cue('land');
      else if (e.type === 'trick-start') audio.cue('trickStart');
      else if (e.type === 'trick') { audio.cue('trick'); showCallout('trick', now, TRICK_NAMES[e.objectId] + (e.count > 1 ? ` ×${e.count}` : ''), t('alpine.callout.trick', {points: e.value})); status.textContent = t('alpine.status.trick', {points: e.value}); }
      else if (e.type === 'crash') { audio.cue('crash'); status.textContent = t('alpine.callout.crash'); }
      else if (e.type === 'coin') { audio.cue('coin'); coinPulse = now + .25; }
      else if (e.type === 'gate') { audio.cue('gate'); if (now > calloutUntil) showCallout(CALLOUTS.gate, now); }
      else if (e.type === 'overtake') { audio.cue('overtake'); if (now > calloutUntil) showCallout(CALLOUTS.overtake, now); status.textContent = t('alpine.status.rank', {rank: snap.rank}); }
      else if (e.type === 'finish') audio.cue('finish');
      else if (e.type === 'pickup') onPickup(e, now);
      else if (e.type === 'shield') { audio.cue('shield'); showCallout('shield', now, 'המגן הציל', 'ממשיכים לגלוש'); status.textContent = 'המגן הציל מנפילה'; }
      else if (e.type === 'section') { audio.cue('section'); showCallout('section', now, SECTION_NAMES[e.kind] || '', SECTION_HINTS[e.kind] || ''); status.textContent = SECTION_NAMES[e.kind] || ''; }
    }
  }
  let shownRank = '', shownSpeed = '', shownTime = '', shownCount = '', shownScore = '', shownCoins = '', shownDistance = '', shownProgress = '', shownTank = '';
  const setData = (key, value) => { if (screen.dataset[key] !== value) screen.dataset[key] = value; };
  function updateHud(snap) {
    const r = String(snap.rank).padStart(2, '0'); if (r !== shownRank) { shownRank = r; rank.textContent = r; }
    const remaining = Math.round(snap.remainingM); if (remaining !== shownDistance) { shownDistance = remaining; distanceValue.textContent = remaining.toLocaleString('en-US'); }
    const progressText = `${Math.min(100, snap.distanceM / snap.trackLength * 100).toFixed(1)}%`; if (progressText !== shownProgress) { shownProgress = progressText; progressFill.style.width = progressText; }
    const clock = formatRaceTime(snap.timeMs); if (clock !== shownTime) { shownTime = clock; timer.textContent = clock; }
    kitHud.update(snap);
    const boostFull = !!(snap.boostReady && snap.boostFraction >= .98 && !snap.player?.boosting);
    boostArrow.hidden = boostCaption.hidden = !boostFull; boostButton.dataset.full = String(boostFull);
    trickCaption.dataset.ready = String(!!snap.trickReady);
    if(snap.trickReady&&trickPreview&&!trickPreview.hidden){
      trickPreview.hidden=true;trickAnimation?.cancel();
    }
    boostButton.classList.toggle('active', !!snap.player.boosting); const boostReady = String(!!snap.boostReady); if (boostButton.dataset.ready !== boostReady) boostButton.dataset.ready = boostReady;
    const tank = (snap.boostFraction ?? 0).toFixed(3); if (tank !== shownTank) { shownTank = tank; boostButton.style.setProperty('--tank', tank); }
    const count = snap.phase === 'countdown' ? String(snap.countdown) : ''; if (count !== shownCount) { shownCount = count; countdown.textContent = count; countdown.hidden = !count || lightsOn; }
    lights?.update(snap);
    setData('boosting', String(!!snap.player.boosting)); setData('hit', String(!!snap.player.hit));
    hint.hidden = snap.timeMs > 6000;
    const score = (snap.score ?? 0).toLocaleString('en-US'); if (score !== shownScore) { shownScore = score; scoreValue.textContent = score; }
    const coinText = String(snap.coins ?? 0); if (coinText !== shownCoins) { shownCoins = coinText; coinValue.textContent = coinText; }
    coinBox.classList.toggle('pulse', snap.timeMs / 1000 < coinPulse);
    const ready = String(!!snap.trickReady); for (const b of trickButtons) if (b.dataset.ready !== ready) b.dataset.ready = ready;
    setData('crashed', String(!!snap.player.crashed));
    if (goalNodes) updateLeagueHud(snap);
    if (v241) updateV241Hud(snap);
  }
  /** v24.1: the section pill ("in 60 m: jumps", then the name while inside), the magnet's seconds left, the shield, braking. */
  let shownSection = '', shownMagnet = '', shownShield = false;
  function updateV241Hud(snap) {
    const z = snap.phase === 'racing' ? snap.section : null, name = z ? SECTION_NAMES[z.kind] || '' : '';
    const text = z ? (z.active ? `${name} · עוד ${z.leftM} מ׳` : `בעוד ${z.inM} מ׳: ${name}`) : '';
    if (text !== shownSection) { shownSection = text; sectionCue.textContent = text; sectionCue.hidden = !text; sectionCue.dataset.kind = z?.kind || ''; sectionCue.dataset.active = String(!!z?.active); }
    const magnet = (snap.player.magnet || 0) > 0 ? String(Math.ceil(snap.player.magnet)) : '';
    if (magnet !== shownMagnet) { shownMagnet = magnet; magnetChip.hidden = !magnet; magnetChip.lastChild.textContent = magnet; }
    const shield = (snap.player.shield || 0) > 0;
    if (shield !== shownShield) { shownShield = shield; shieldChip.hidden = !shield; }
    setData('braking', String((snap.player.braking || 0) > .05));
  }
  /** League goals while racing: ok (green), lost (red) or still open, from the same numbers the result check uses. */
  let crashesSeen = 0, gatesSeen = 0, shownGap = '', shownWind = '';
  function updateLeagueHud(snap) {
    const racing = snap.phase === 'racing' || snap.phase === 'finished', stats = racing ? engine.leagueStats() : null;
    if (stats) { gatesSeen = stats.gates; crashesSeen = stats.crashes; }
    for (const [kind, g] of Object.entries(goalNodes)) {
      let text = '', state = 'open';
      if (kind === 'place') { text = kidGoal ? 'עכשיו מקום '+snap.rank+'|למעבר: מקום '+g.goal.target+' או טוב יותר' : `מקום ${snap.rank}/${g.goal.target}`; state = racing ? (snap.rank <= g.goal.target ? 'ok' : 'behind') : 'open'; }
      else if (kind === 'time') { text = goalClock(g.goal.ms); state = snap.timeMs > g.goal.ms ? 'lost' : racing ? 'ok' : 'open'; }
      else if (kind === 'gates') { text = `${gatesSeen}/${g.goal.count}`; state = gatesSeen >= g.goal.count ? 'ok' : 'open'; }
      else { text = crashesSeen ? 'נפילה' : 'נקי'; state = crashesSeen ? 'lost' : racing ? 'ok' : 'open'; }
      const key = text + state; if (key !== g.shown) { g.shown = key; if(kidGoal&&kind==='place')g.value.replaceChildren(...text.split('|').map(line=>el('span','',line)));else g.value.textContent = text; g.node.dataset.state = state; }
    }
    if (ghostTrack && racing) {
      const at = ghostTimeAt(ghostTrack, snap.distanceM), gap = at === null ? '' : ((snap.timeMs - at) / 1000).toFixed(1);
      const text = gap === '' ? '' : `שיא ${Number(gap) > 0 ? '+' : ''}${gap}`;
      if (text !== shownGap) { shownGap = text; ghostGap.textContent = text; ghostGap.hidden = !text; ghostGap.dataset.ahead = String(Number(gap) <= 0); }
    }
    const w = snap.wind, now = w ? (Math.abs(w.v) > .25 ? `רוח ${w.v > 0 ? '→' : '←'}` : w.next ? `רוח בעוד ${w.next.inM} מ׳ ${w.next.dir > 0 ? '→' : '←'}` : '') : '';
    if (now !== shownWind) { shownWind = now; windCue.replaceChildren(); if (now) windCue.append(svg(WIND_ICON), el('b', '', now)); windCue.hidden = !now; windCue.dataset.active = String(!!w && Math.abs(w.v) > .25); }
  }

  function tick(at) {
    if (disposed) return;
    const dt = last ? Math.min(balance.physics.maxCatchUpSeconds, (at - last) / 1000) : 0, ms = last ? at - last : 0; last = at;
    const blocked = paused || doc.hidden;
    if (!blocked && view) {
      const sample = input.sample(lastSnapshot.player);
      engine.command({type: 'steer', value: sample.steer});
      if (v241) engine.command({type: 'brake', value: sample.brake || 0});
      if (sample.boost) engine.command({type: 'boost'});
      if (sample.trick) engine.command({type: 'trick', id: sample.trick});
      engine.step(dt);
      if (ms > 0 && engine.phase === 'racing' && governor.observe(ms) === 'low') { quality = 'low'; view.setQuality('low'); }
    }
    const snap = lastSnapshot = engine.snapshot(), now = snap.timeMs / 1000;
    if (snap.phase !== app.dataset.phase && snap.phase !== 'paused') setPhase(snap.phase);
    handleEvents(snap, now);
    if(now>calloutUntil){callout.hidden=true;kitHud.hide();}
    audio.sync(blocked ? 0 : snap.speedKmh, {boosting: snap.player.boosting, carving: Math.max(Math.abs(snap.player.lean || 0), snap.player.braking || 0), airborne: snap.player.airborne, crashed:snap.player.crashed});
    ghostRecorder?.record(snap);
    view.render(snap, engine.presentation()); updateHud(snap);
    if (snap.result && !finished) {
      finished = true;
      const r = snap.result;
      recordOutcome = recordRun(historyStorage, balance.records, records, r);
      // League: a finished run faster than the stored ghost becomes the new ghost of this stage.
      if (league && r.completed) ghostOutcome = saveGhost(historyStorage, league.n, ghostRecorder.encode(r.elapsedMs));
      const summary = {...r, trackName, coinTotal: engine.course.coins, bestMs: recordOutcome.best?.ms ?? null, newBest: recordOutcome.newBest, ...(league ? {ghost: {saved: !!ghostOutcome?.saved, previousMs: ghostTrack?.ms ?? null}} : {})};
      ctx.onAlpineSummary?.(summary);
      const stats = league ? engine.leagueStats() : null;
      const settled = ctx.finish({outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}, ...(stats ? {league: {order: stats.order, gates: stats.gates}} : {})});
      if (settled && settled.ok === false && !disposed) { ctx.onError?.(settled.reason); ctx.cancel(); }
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  return session;
}

export {alpineRunBalance,alpineHistoryStorage};
