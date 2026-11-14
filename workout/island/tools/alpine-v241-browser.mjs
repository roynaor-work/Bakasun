/** Ski v24.1 proof in a phone-like browser: Chromium with a touch screen (hasTouch, isMobile, 844x390 landscape, WebGL on SwiftShader),
 * the shipped island page under its CSP, real touches only (CDP Input.dispatchTouchEvent). Nothing is written into the game: the script
 * reads the race snapshot (?dev=1 exposes it read-only) and plays with a thumb on the floating stick and a second finger on the buttons.
 * 1. v24.1, ski stage 1 from the games menu: control probes by touch (first visible move, a lane change, the stick pulled down to brake, a
 *    centred stick through a turn), then the child-like bot rides to the finish while the new content is photographed (snowman, shield,
 *    stars, the section pill and arch, magnet, movers); the island accepts the result.
 * 2. ?alpineV241=0, the same stage and probes: v24 (the stick pulled down does nothing, the turn pushes the board out, no new content).
 * 3. League stages in the theme page (the real session, steered by touch): big kickers and air rings, penguins, deep snow, ice, a star snake.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node workout/island/tools/alpine-v241-browser.mjs [--only island|off|themes] [--frame 100]
 * Writes screenshots and browser-proof.json to verification/alpine-v24-1/. SwiftShader on a busy machine draws a frame every second or
 * so, so the page runs on a lock-step frame clock (each frame waits for the thumb and advances `--frame` ms of game time). */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium, installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {createKidBot} from './alpine-league-bot.mjs';

const OUT = fileURLToPath(new URL('../verification/alpine-v24-1/', import.meta.url));
const W = 844, H = 390, argv = process.argv.slice(2), opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const only = opt('--only'), FRAME = Number(opt('--frame') || 100);
await mkdir(OUT, {recursive: true});
const report = {when: new Date().toISOString(), viewport: [W, H], touch: 'CDP Input.dispatchTouchEvent', frameMs: FRAME, runs: []};
const log = (...a) => console.error('·', ...a);
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({viewport: {width: W, height: H}, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem'});
const csp = await installIslandCspMonitor(context);

const LOCKSTEP_INIT = step => {
  const raf = window.requestAnimationFrame.bind(window), gate = window.__frameGate = {locked: false, allow: 0, frames: 0, step};
  let t = null, frameNow = null;
  window.requestAnimationFrame = cb => raf(function run(now) {
    if (now !== frameNow) {
      if (gate.locked && gate.allow <= 0) { raf(run); return; }
      if (gate.locked) gate.allow--;
      t = t === null ? now : t + (gate.locked ? gate.step : Math.min(now - frameNow, gate.step)); frameNow = now; gate.frames++;
    }
    cb(t);
  });
};
const nextFrame = page => page.evaluate(() => new Promise(resolve => { const g = window.__frameGate, before = g.frames; g.allow = 1; const check = () => g.frames > before ? resolve() : setTimeout(check, 8); check(); }));
const setStep = (page, ms) => page.evaluate(ms => { window.__frameGate.step = ms; }, ms);
async function touchKit(page) {
  const cdp = await context.newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([id, x, y]) => ({id, x: Math.round(x), y: Math.round(y), radiusX: 9, radiusY: 9, force: .6}))});
  const center = async selector => { const loc = page.locator(selector).first(); await loc.waitFor({state: 'visible', timeout: 180000}); const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  return {send, center, async tap(selector) { const [x, y] = await center(selector); await send('touchStart', [[1, x, y]]); await page.waitForTimeout(60); await send('touchEnd', []); await page.waitForTimeout(150); }};
}
/** Read-only race snapshot of the island session (?dev=1) or of the theme page. */
const reader = (page, theme) => () => page.evaluate(theme => {
  const s = theme ? window.__theme?.session?.snapshot : window.__island?.ui?.activityInterface?.current?.session?.snapshot; if (!s) return null;
  return {phase: s.phase, disposed: s.disposed, v241: s.v241, frame: s.frame, joystick: {brake: document.querySelector('.alpine-joystick')?.dataset.brake ?? null, value: Number(document.querySelector('.alpine-joystick')?.getAttribute('aria-valuenow'))},
    hud: {section: document.querySelector('.alpine-section-cue:not([hidden])')?.textContent || '', powers: [...document.querySelectorAll('.alpine-power:not([hidden])')].map(n => n.textContent), callout: document.querySelector('.alpine-callout:not([hidden])')?.textContent || '', braking: document.querySelector('.game-screen')?.dataset.braking || null}};
}, theme);
const pathOf = (page, theme) => page.evaluate(theme => { const s = theme ? window.__theme?.session : window.__island?.ui?.activityInterface?.current?.session; const p = s?.debug?.engine?.course?.path; return p ? Array.from(p.kappa) : null; }, theme);

/** Plays one race by touch. Probes (v24.1 and v24 alike): first visible move, lane change, brake, a centred stick in a turn. Then the bot
 * rides until `until(frame)`, and `shots` (name -> test(snapshot)) are photographed the first time they hold. */
async function ride(page, touch, read, {label, probes = true, kappa = null, until = () => false, shots = {}, maxFrames = 4000, seed = 7}) {
  const out = {label, probes: {}, shots: {}, frames: 0}, stick = await page.locator('.alpine-joystick').boundingBox(), reach = Math.max(10, (stick.width / 2 - 8) * .62);
  const boostAt = await touch.center('.alpine-boost'), grabAt = await touch.center('.alpine-trick[data-trick=grab]'), origin = [Math.round(W / 2 * .62), Math.round(H * .55)];
  let snap = await read(); const physics = await page.evaluate(async () => (await (await fetch(new URL('data/config.json', document.baseURI.includes('/tools/') ? new URL('../', document.baseURI) : document.baseURI))).json()).minigames.alpineRush.physics);
  const bot = createKidBot({seed, physics}); let down = false, extra = null;
  const step = async () => { await nextFrame(page); out.frames++; snap = await read(); return snap; };
  const thumb = async (dx, dy = 0) => { if (!down) { await touch.send('touchStart', [[1, ...origin]]); down = true; } await touch.send('touchMove', [[1, origin[0] + dx, origin[1] + dy]]); };
  const lift = async () => { if (down) { await touch.send('touchEnd', []); down = false; } };
  const regrip = async (t, button) => { await touch.send('touchEnd', []); await touch.send('touchStart', [[1, ...origin]]); if (button) await touch.send('touchStart', [[1, ...origin], [2, ...button]]); await touch.send('touchMove', button ? [t, [2, ...button]] : [t]); down = true; };
  const shoot = async name => { if (out.shots[name]) return; const f = snap.frame, file = `${label}-${name}.png`; await page.screenshot({path: OUT + file}); out.shots[name] = {file, raceMs: f?.timeMs, s: Math.round(f?.distanceM ?? 0), hud: snap.hud}; log(label, 'shot', name, f?.timeMs); };
  await page.evaluate(() => { window.__frameGate.locked = true; });
  while (snap?.frame?.phase !== 'racing' && out.frames < 400) { if (snap?.frame?.phase === 'countdown' && shots.countdown && snap.frame.countdownMs < 1800) await shoot('countdown'); await step(); }
  const P = () => snap.frame.player, ms = () => snap.frame.timeMs;
  if (probes) {
    // a. first visible move: thumb from the centre to a full deflection; frames until the board is 0.15 m across (50 ms frames)
    await setStep(page, 50); await thumb(0); for (let i = 0; i < 30; i++) await step();
    const x0 = P().x, t0 = ms(); await thumb(reach); let moved = null;
    for (let i = 0; i < 20 && moved === null; i++) { await step(); if (Math.abs(P().x - x0) >= .15) moved = ms() - t0; }
    out.probes.firstMoveMs = moved;
    // b. lane change: hold right until the board is 3 m across, lift the thumb; overshoot past the lane and time until it stops sliding
    const lx0 = x0; while (P().x < lx0 + 3) await step();
    await lift(); const tl = ms(); let peak = P().x, stopped = null;
    for (let i = 0; i < 40; i++) { await step(); peak = Math.max(peak, P().x); if (stopped === null && i > 0 && Math.abs(P().x - (out.lastX ?? P().x)) < .03) stopped = ms() - tl; out.lastX = P().x; }
    out.probes.laneOvershootM = +(peak - lx0 - 3).toFixed(2); out.probes.laneStopMs = stopped; delete out.lastX;
    // back to the middle
    for (let i = 0; i < 40; i++) { await thumb(Math.max(-1, Math.min(1, -P().x * .5)) * reach); await step(); }
    // c. brake: the thumb pulled straight down a full reach for 1 s of race time
    await thumb(0); for (let i = 0; i < 6; i++) await step();
    const v0 = snap.frame.speedKmh, tb = ms(); await thumb(0, reach); let mid = null;
    while (ms() - tb < 1000) { await step(); if (!mid && ms() - tb >= 550) { mid = {kmh: snap.frame.speedKmh, braking: P().braking ?? null, joystick: snap.joystick.brake, hud: snap.hud.braking}; await shoot('brake'); } }
    out.probes.brake = {kmhBefore: v0, kmhAfter1s: snap.frame.speedKmh, mid};
    await thumb(0); const tr = ms(); while (ms() - tr < 2500) await step(); out.probes.brake.kmhAfterRelease = snap.frame.speedKmh;
    // d. a centred stick through the first turn: ride to the turn on the bot, lift the thumb, lateral drift over 1.5 s
    if (kappa) {
      const s = snap.frame.distanceM; let turn = null; for (let i = Math.ceil(s + 20); i < kappa.length - 60; i++) if (Math.abs(kappa[i]) > 1 / 160 && kappa.slice(i, i + 40).every(k => Math.abs(k) > 1 / 200)) { turn = i; break; }
      if (turn) {
        await setStep(page, FRAME);
        while (snap.frame.distanceM < turn) { const d = bot.decide(snap.frame); await thumb(Math.max(-1, Math.min(1, (0 - P().x) * .5)) * reach); await step(); void d; }
        await lift(); const dx0 = P().x, td = ms(); let wall = false, lip = false;
        while (ms() - td < 1500) { await step(); wall ||= Math.abs(P().x) > physics.pipe.flatHalf; lip ||= P().airKind === 'pipe'; }
        out.probes.turnDrift = {atS: turn, curvature: +kappa[turn].toFixed(4), driftM: +Math.abs(P().x - dx0).toFixed(2), wall, lip, kmh: snap.frame.speedKmh};
      }
    }
    await setStep(page, FRAME);
  }
  // ride on with the child-like bot, photographing what the course brings
  while (out.frames < maxFrames && snap?.frame && !snap.frame.result && snap.phase !== 'finished' && !snap.disposed && !until(snap.frame, out)) {
    for (const [name, test] of Object.entries(shots)) if (name !== 'countdown' && !out.shots[name] && test(snap)) await shoot(name);
    const d = bot.decide(snap.frame), t = [1, origin[0] + d.steer * reach, origin[1]];
    if (extra) { await regrip(t, null); extra = null; }
    else if (d.boost) { await regrip(t, boostAt); extra = 'boost'; }
    else if (d.trick) { await regrip(t, grabAt); extra = 'trick'; }
    else await thumb(d.steer * reach);
    await step();
  }
  await lift(); await page.evaluate(() => { window.__frameGate.locked = false; });
  out.final = snap?.frame ? {timeMs: snap.frame.timeMs, distanceM: Math.round(snap.frame.distanceM), rank: snap.frame.rank, score: snap.frame.score, coins: snap.frame.coins, result: snap.frame.result || null} : null;
  return out;
}
const ahead = (types, near = -30, far = -8) => s => (s.frame?.obstacles || []).some(o => types.includes(o.type === 'ramp' && o.big ? 'bigramp' : o.type === 'mover' ? `mover-${o.kind}` : o.type) && o.z >= near && o.z <= far);

async function islandRun(label, query, {toFinish}) {
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(600000); await csp.attachPage(page); await page.addInitScript(LOCKSTEP_INIT, FRAME);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const touch = await touchKit(page);
  await page.goto(server.url + '?dev=1&games=1' + query, {waitUntil: 'load'});
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded, null, {timeout: 240000});
  await touch.tap('[data-action=avatar-start]'); await page.waitForSelector('[data-game-library]');
  await touch.tap('[data-action=game-enter][data-game-id=alpineRush]'); await page.waitForSelector('[data-game-home=alpineRush]');
  await touch.tap('[data-action=game-play]'); await page.waitForSelector('[data-action=stage-play]');
  await touch.tap('[data-action=stage-play]');
  if (await page.locator('[data-action=game-understood]').count()) await touch.tap('[data-action=game-understood]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-action=alpine-start]'); return b && !b.disabled; }, null, {timeout: 300000});
  await page.screenshot({path: OUT + `${label}-opening.png`});
  const kappa = await pathOf(page, false);
  await touch.tap('[data-action=alpine-start]');
  const read = reader(page, false);
  const shots = {countdown: () => true, 'snowman-ahead': ahead(['snowman'], -26, -9), 'shield-ahead': ahead(['shield'], -22, -7), 'shield-chip': s => s.hud.powers.some(p => p.includes('מגן')),
    'star-ahead': ahead(['star'], -22, -7), 'section-cue': s => !!s.frame.section && !s.frame.section.active, 'section-active': s => !!s.frame.section?.active, 'magnet-chip': s => s.hud.powers.length > 0 && !s.hud.powers.some(p => p.includes('מגן')),
    'mover-ahead': ahead(['mover-snowball', 'mover-penguin', 'mover-boulder'], -24, -8), 'trick': s => !!s.frame.player.trick};
  const result = await ride(page, touch, read, {label, kappa, shots: query.includes('alpineV241=0') ? {countdown: shots.countdown} : shots, until: toFinish ? () => false : f => f.timeMs > 26000, maxFrames: toFinish ? 6000 : 900});
  const sess = await read(); result.v241 = sess?.v241 ?? null;
  if (toFinish) {
    await page.waitForFunction(() => document.querySelector('.result-row, [data-alpine-result], .modal [data-action=result-close], .minigame-result') || !window.__island.ui.activityInterface.current, null, {timeout: 300000}).catch(() => {});
    await page.waitForTimeout(800); await page.screenshot({path: OUT + `${label}-result.png`});
    result.islandResult = await page.evaluate(() => ({text: (document.querySelector('dialog[open], .modal[open], .result-dialog') || document.body).innerText.slice(0, 400), stillRunning: !!window.__island.ui.activityInterface.current}));
  }
  result.renderMetrics = await page.evaluate(() => { const m = window.__island?.ui?.activityInterface?.current?.session?.snapshot?.renderMetrics; return m ? {triangles: m.triangles, calls: m.calls, quality: m.quality, props: m.props} : null; }).catch(() => null);
  result.errors = errors; report.runs.push(result); log(label, JSON.stringify({probes: result.probes, shots: Object.keys(result.shots), final: result.final, errors}));
  await page.close();
}
async function themeRun(label, stage, wanted, maxMs) {
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(600000); await csp.attachPage(page); await page.addInitScript(LOCKSTEP_INIT, FRAME);
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const touch = await touchKit(page);
  await page.goto(server.url + `tools/alpine-league-themes.html?stage=${stage}&seed=5`, {waitUntil: 'load'});
  await page.waitForFunction(() => window.__theme?.ready || window.__theme?.error, null, {timeout: 600000});
  await touch.tap('[data-action=alpine-start]');
  const result = await ride(page, touch, reader(page, true), {label, probes: false, shots: wanted, until: (f, o) => f.timeMs > maxMs || Object.keys(wanted).every(k => o.shots[k]), maxFrames: Math.ceil(maxMs / FRAME) + 120, seed: stage});
  result.errors = errors; result.stage = stage; report.runs.push(result); log(label, JSON.stringify({shots: Object.keys(result.shots), final: result.final, errors}));
  await page.close();
}
try {
  if (!only || only === 'island') await islandRun('v241-stage1', '', {toFinish: true});
  if (!only || only === 'off') await islandRun('v24-stage1', '&alpineV241=0', {toFinish: false});
  if (!only || only === 'themes') {
    for (const [label, stage, wanted, maxMs] of [
      ['league5-jumps', 5, {'bigramp-ahead': ahead(['bigramp'], -28, -10), 'ring-ahead': ahead(['ring'], -20, -4), 'air-trick': s => !!s.frame.player.trick, 'section-active': s => !!s.frame.section?.active}, 26000],
      ['league7-penguins', 7, {'penguins-ahead': ahead(['mover-penguin'], -26, -8), 'section-active': s => s.frame.section?.active && s.frame.section.kind === 'movers'}, 26000],
      ['league24-powder', 24, {'powder-ahead': ahead(['powder'], -30, -6), 'in-powder': s => s.frame.player.surface === 'powder'}, 22000],
      ['league10-ice', 10, {'ice-ahead': ahead(['ice'], -30, -6), 'on-ice': s => s.frame.player.surface === 'ice'}, 34000],
      ['league6-stars', 6, {'stars-ahead': ahead(['star'], -26, -6), 'magnet-chip': s => s.hud.powers.length > 0, 'section-active': s => s.frame.section?.active && s.frame.section.kind === 'stars'}, 24000]]) {
      await themeRun(label, stage, wanted, maxMs);
    }
  }
} finally {
  report.csp = await csp.assertClean().then(() => 'clean').catch(e => String(e.message || e));
  await writeFile(OUT + (only ? `browser-proof-${only}.json` : 'browser-proof.json'), JSON.stringify(report, null, 1) + '\n');
  await browser.close(); await csp.dispose(); await server.close();
}
