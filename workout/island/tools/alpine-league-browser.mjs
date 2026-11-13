/** Ski league v23 proof in a real phone-like browser: Chromium with a touch screen (hasTouch, isMobile, 844x390 landscape, WebGL on
 * SwiftShader), the shipped island page under its CSP, and only real touches through CDP Input.dispatchTouchEvent. Nothing is written into
 * the game or its save: the bot only reads the race snapshot (?dev=1 exposes it read-only) and steers with a thumb on the floating stick,
 * a second finger on boost and the trick buttons.
 * 1. Fresh island: avatar, games menu, ski, the league card, the season and gear screens.
 * 2. League stage 1 (game stage 4) from the league button, through the instructions, a full race to the finish, the league result.
 * 3. Save and return: back to the league (stage 2 open), reload the page, the league is still there (and the island save never got a
 *    league field).
 * 4. The six themes at full size (tools/alpine-league-themes.html: the real session on a stage of each theme), opening and mid-race, with
 *    the Codex art: the files each theme fetched from assets/alpine-themes-v23, the gates and landmarks that loaded, triangles and calls.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/google-chrome node workout/island/tools/alpine-league-browser.mjs [--skip-themes] [--themes-only]
 * Writes screenshots and browser-proof.json to verification/alpine-league-v23/. SwiftShader on a busy machine can fall to a frame every
 * few seconds (the race clock then runs slower than the wall clock, as on a very slow phone), so the limits are generous: a full stage
 * may take tens of minutes. The stage time in the report is the race clock. */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium, installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {createKidBot} from './alpine-league-bot.mjs';
import {THEMES} from '../minigames/alpine-league-core.mjs';

const OUT = fileURLToPath(new URL('../verification/alpine-league-v23/', import.meta.url));
const W = 844, H = 390, args = new Set(process.argv.slice(2));
await mkdir(OUT, {recursive: true});
const report = {when: new Date().toISOString(), viewport: [W, H], touch: 'CDP Input.dispatchTouchEvent', steps: [], themes: [], errors: []};
const step = (name, data = {}) => { report.steps.push({name, ...data}); console.error(`· ${name}`, Object.keys(data).length ? JSON.stringify(data) : ''); };
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({viewport: {width: W, height: H}, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem'});
const csp = await installIslandCspMonitor(context);

/** Real touches on a page through CDP. */
async function touchKit(page) {
  const cdp = await context.newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([id, x, y]) => ({id, x: Math.round(x), y: Math.round(y), radiusX: 9, radiusY: 9, force: .6}))});
  const center = async selector => { const loc = page.locator(selector).first(); await loc.waitFor({state: 'visible', timeout: 120000}); await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  return {send, center,
    async tap(selector) { const [x, y] = await center(selector); await send('touchStart', [[1, x, y]]); await page.waitForTimeout(60); await send('touchEnd', []); await page.waitForTimeout(120); },
    async tapAt(x, y) { await send('touchStart', [[1, x, y]]); await page.waitForTimeout(60); await send('touchEnd', []); }};
}
/** The child-like bot, playing through touches: thumb 1 holds the floating stick in the left half of the slope, finger 2 taps boost or a trick.
 * CDP keeps a second finger down until a touchEnd, which lifts every finger: a tap of finger 2 is therefore "lift all, put the thumb back on
 * its landing point, press the button, slide the thumb to its steering offset", and the next frame lifts the button the same way. */
async function rideWithTouches(page, touch, readSnapshot, {seed = 11, maxSeconds = 260, shotAt = null, shotPath = null, shots = [], stopAt = null} = {}) {
  const pending = [...(shotAt ? [[shotAt, shotPath]] : []), ...shots].sort((a, b) => a[0] - b[0]), taken = [];
  const stick = await page.locator('.alpine-joystick').boundingBox(), reach = Math.max(10, (stick.width / 2 - 8) * .62);
  const boost = await touch.center('.alpine-boost'), grab = await touch.center('.alpine-trick[data-trick=grab]');
  const origin = [Math.round(W / 2 * .62), Math.round(H * .55)];   // on the slope, left half, clear of the stick (as tests/island-alpine-ctrl-ski)
  let snap = await readSnapshot(); const physics = snap.physics;
  const bot = createKidBot({seed, physics}); let down = false, extra = null, presses = {boost: 0, trick: 0}, polls = 0;
  const regrip = async (thumb, button) => { await touch.send('touchEnd', []); await touch.send('touchStart', [[1, ...origin]]); if (button) await touch.send('touchStart', [[1, ...origin], [2, ...button]]); await touch.send('touchMove', button ? [thumb, [2, ...button]] : [thumb]); };
  const t0 = Date.now();
  while (Date.now() - t0 < maxSeconds * 1000) {
    snap = await readSnapshot(); polls++;
    if (!snap || !snap.frame) break;
    const f = snap.frame;
    if (f.result || snap.phase === 'finished' || snap.disposed) break;
    if (f.phase !== 'racing') { await page.waitForTimeout(40); continue; }
    if (!down) { await touch.send('touchStart', [[1, ...origin]]); down = true; }
    const d = bot.decide(f), thumb = [1, origin[0] + d.steer * reach, origin[1]];
    if (extra) { await regrip(thumb, null); extra = null; }
    else if (d.boost) { await regrip(thumb, boost); extra = 'boost'; presses.boost++; }
    else if (d.trick) { await regrip(thumb, grab); extra = 'trick'; presses.trick++; }
    else await touch.send('touchMove', [thumb]);
    while (pending.length && f.timeMs > pending[0][0]) { const [, path] = pending.shift(); await page.screenshot({path}); taken.push({path: path.split('/').pop(), raceMs: f.timeMs}); }
    if (stopAt && f.timeMs > stopAt) break;
    await page.waitForTimeout(30);
  }
  if (down) await touch.send('touchEnd', []);
  return {presses, polls, shots: taken, wallSeconds: +((Date.now() - t0) / 1000).toFixed(1)};
}
/** Read-only: the race snapshot of the session the island is running (exposed by ?dev=1). */
const islandSnapshot = page => page.evaluate(() => { const s = window.__island?.ui?.activityInterface?.current?.session?.snapshot; return s ? {phase: s.phase, disposed: s.disposed, frame: s.frame, league: s.league} : null; });

try {
  if (!args.has('--themes-only')) {
    // ---------- 1. Fresh island, games menu, the ski league card, season and gear ----------
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(600000); await csp.attachPage(page);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    const touch = await touchKit(page);
    await page.goto(server.url + '?dev=1&games=1', {waitUntil: 'load'});
    await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded, null, {timeout: 180000});
    await touch.tap('[data-action=avatar-start]');
    await page.waitForSelector('[data-game-library]'); await page.screenshot({path: OUT + '01-games-menu.png'}); step('games menu by touch');
    await touch.tap('[data-action=game-enter][data-game-id=alpineRush]'); await page.waitForSelector('[data-game-home=alpineRush]');
    await touch.tap('[data-action=game-play]'); await page.waitForSelector('.al-card [data-action=alpine-league-go]');
    const card = await page.evaluate(() => ({title: document.querySelector('.al-card h3')?.textContent, go: document.querySelector('[data-action=alpine-league-go]')?.textContent, stages: [...document.querySelectorAll('.al-stage')].map(n => n.dataset.state), themes: [...document.querySelectorAll('.al-theme')].map(n => n.textContent)}));
    await page.screenshot({path: OUT + '02-league-card.png'}); step('league card', card);
    await touch.tap('[data-action=alpine-league-season]'); await page.waitForSelector('[data-alpine-season]'); await page.screenshot({path: OUT + '03-season.png'}); step('season screen');
    await touch.tap('[data-action=alpine-league-back]'); await page.waitForSelector('.al-card [data-action=alpine-league-shop]');
    await touch.tap('[data-action=alpine-league-shop]'); await page.waitForSelector('[data-alpine-shop]'); await page.screenshot({path: OUT + '04-gear.png'}); step('gear screen', {buttons: await page.locator('[data-action=alpine-league-buy]').count()});
    await touch.tap('[data-action=alpine-league-back]'); await page.waitForSelector('.al-card [data-action=alpine-league-go]');

    // ---------- 2. League stage 1: instructions, a full race by touch, the result ----------
    let attempt = 0, result = null;
    while (attempt < 3 && !(result?.passed)) {
      attempt++;
      if (attempt === 1) { await touch.tap('[data-action=alpine-league-go]'); await touch.tap('[data-action=game-understood]'); }
      else await touch.tap('[data-action=alpine-league-again]');
      await page.waitForFunction(() => { const b = document.querySelector('[data-action=alpine-start]'); return b && !b.disabled; }, null, {timeout: 180000});
      const opening = await page.evaluate(() => ({heading: document.querySelector('.game-screen h2')?.textContent, eyebrow: document.querySelector('.alpine-eyebrow')?.textContent, goals: [...document.querySelectorAll('.alpine-league-goal-list li')].map(li => li.textContent), stage: document.querySelector('.game-screen')?.dataset.stage}));
      if (attempt === 1) { await page.screenshot({path: OUT + '05-stage-opening.png'}); step('stage opening (goals on the card)', opening); }
      const physics = await page.evaluate(async () => (await (await fetch('data/config.json')).json()).minigames.alpineRush.physics);
      const startWall = Date.now(); await touch.tap('[data-action=alpine-start]');
      const ride = await rideWithTouches(page, touch, async () => { const s = await islandSnapshot(page); return s && {...s, physics}; }, {seed: 40 + attempt, maxSeconds: 3600, shotAt: 20000, shotPath: OUT + `06-race-${attempt}.png`});
      await page.waitForSelector('[data-alpine-league-result]', {timeout: 600000});
      result = await page.evaluate(() => { const r = document.querySelector('[data-alpine-league-result]'); return {passed: r.dataset.passed === 'true', headline: r.querySelector('h4')?.textContent, stars: r.querySelectorAll('.al-result-top .al-stars i.on').length, goals: [...r.querySelectorAll('.al-goal-check li')].map(li => ({goal: li.dataset.goal, ok: li.dataset.ok === 'true', text: li.textContent})), rows: [...r.querySelectorAll('.result-row')].map(x => x.textContent)}; });
      const league = await page.evaluate(() => JSON.parse(localStorage.getItem('island.alpine.league.v1') || 'null'));
      const last = league?.history?.at(-1);
      await page.screenshot({path: OUT + `07-result-${attempt}.png`});
      step(`league stage 1, attempt ${attempt}`, {...result, stageMs: last?.ms, wallSeconds: +((Date.now() - startWall) / 1000).toFixed(1), place: last?.place, ride});
    }
    // ---------- 3. Save and return ----------
    await touch.tap('[data-action=alpine-league-back]'); await page.waitForSelector('.al-card');
    const after = await page.evaluate(() => ({stages: [...document.querySelectorAll('.al-stage')].map(n => n.dataset.state), go: document.querySelector('[data-action=alpine-league-go]')?.textContent, status: document.querySelector('.al-card .al-line')?.textContent}));
    await page.screenshot({path: OUT + '08-league-after-stage.png'}); step('back to the league', after);
    const storeBefore = await page.evaluate(() => ({league: localStorage.getItem('island.alpine.league.v1'), islandHasLeague: Object.hasOwn(JSON.parse(localStorage.getItem('island.v1') || '{}'), 'islandAlpineLeague'), ghost: (localStorage.getItem('island.alpine.ghosts.v1') || '').length}));
    await page.reload({waitUntil: 'load'});
    await page.waitForSelector('[data-game-library]', {timeout: 180000});
    await touch.tap('[data-action=game-enter][data-game-id=alpineRush]'); await page.waitForSelector('[data-game-home=alpineRush]');
    await touch.tap('[data-action=game-play]'); await page.waitForSelector('.al-card');
    const reloaded = await page.evaluate(() => ({stages: [...document.querySelectorAll('.al-stage')].map(n => n.dataset.state), go: document.querySelector('[data-action=alpine-league-go]')?.textContent, league: localStorage.getItem('island.alpine.league.v1')}));
    await page.screenshot({path: OUT + '09-after-reload.png'});
    step('reload: the league comes back from its own key', {stages: reloaded.stages, go: reloaded.go, same: reloaded.league === storeBefore.league, islandSaveHasLeagueField: storeBefore.islandHasLeague, ghostBytes: storeBefore.ghost});
    report.errors.push(...errors);
    await page.close();
  }
  // ---------- 4. Six themes ----------
  if (!args.has('--skip-themes')) {
    const picks = {pine: 2, ice: 7, lava: 13, aurora: 17, village: 22, peak: 28};
    const only = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : null;
    for (const theme of THEMES.filter(t => !only || t.id === only)) {
      const n = picks[theme.id], page = await context.newPage(), errors = [], codexFiles = new Set(); page.setDefaultTimeout(600000); await csp.attachPage(page);
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('response', r => { const p = new URL(r.url()).pathname; if (r.status() >= 400) errors.push(`${r.status()} ${p}`); else if (p.includes('/alpine-themes-v23/')) codexFiles.add(p.split('/alpine-themes-v23/')[1]); });
      const touch = await touchKit(page);
      await page.goto(server.url + `tools/alpine-league-themes.html?stage=${n}&seed=5`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__theme?.ready || window.__theme?.error, null, {timeout: 600000});
      await page.waitForTimeout(600); await page.screenshot({path: OUT + `theme-${theme.id}-opening.png`});
      const physics = await page.evaluate(async () => (await (await fetch('../data/config.json')).json()).minigames.alpineRush.physics);
      await touch.tap('[data-action=alpine-start]');
      const read = () => page.evaluate(() => { const s = window.__theme.session.snapshot; return {phase: s.phase, disposed: s.disposed, frame: s.frame}; });
      const ride = await rideWithTouches(page, touch, async () => ({...(await read()), physics}), {seed: 3, maxSeconds: 1200, shots: [[3500, OUT + `theme-${theme.id}.png`], [12000, OUT + `theme-${theme.id}-course.png`]], stopAt: 12500});
      const m = await page.evaluate(() => { const s = window.__theme.session.snapshot, r = s.renderMetrics || {}, d = r.designAssets || {}; return {league: r.league, triangles: r.triangles, calls: r.calls, quality: r.quality, environment: r.environment?.id ?? null, phase: s.phase, timeMs: s.frame?.timeMs,
        codex: {themeGates: d.themeGates, landmarks: d.landmarks, pack: d.pack, textures: d.textures}}; });
      report.themes.push({theme: theme.id, name: theme.name, stage: n, ...m, codexFiles: [...codexFiles].sort(), ride, errors});
      console.error(`· theme ${theme.id}`, JSON.stringify(m));
      await page.close();
    }
  }
  report.csp = await csp.assertClean().then(() => 'clean').catch(e => String(e.message || e));
} catch (error) { report.errors.push(String(error?.stack || error)); console.error(error); }
finally { await writeFile(OUT + 'browser-proof.json', JSON.stringify(report, null, 1) + '\n'); await browser.close(); await csp.dispose?.(); await server.close(); }
