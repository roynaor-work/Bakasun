// Real-browser check of the three-lane ski runner and its theme packs (v24.8) on a phone-sized touch screen:
// 844x390, hasTouch, isMobile, WebGL through SwiftShader. Touch is sent as real touch events (CDP), never synthetic clicks.
// It proves: the packs load and draw (two themes at least, screenshots), swipes change lane and stance, the result
// card shows, ?alpineThemes=0 loads no pack file, ?alpineRunnerPatch=0 opens the ski race with no runner file, and
// the shipped CSP stays clean. Run: node workout/island/tools/alpine-runner-v248-browser.mjs [output folder]
// CHROMIUM_PATH picks the browser; ISLAND_PLAYWRIGHT the Playwright module when it is not installed in the repository.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as helper from '../../../tests/helpers/island-browser.mjs';

const out = path.resolve(process.argv[2] || fileURLToPath(new URL('../verification/alpine-runner-v24-8/', import.meta.url)));
await mkdir(out, {recursive: true});
const chromium = await helper.islandChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const VIEWPORT = {width: 844, height: 390};
const THEMES = (process.env.RUNNER_THEMES || 'pine,aurora,ice').split(',');
// Courses on which the touch sequence below cannot hit anything whatever its timing (searched headless: right, left,
// jump, slide with gaps of 0.4 to 3.2 seconds, 20 seconds each). The theme is part of the course, so a seed per theme.
const SEEDS = {pine: 'v248-113', ice: 'v248-46', lava: 'v248-103', aurora: 'v248-130', village: 'v248-102', peak: 'v248-99'};
const PACK_OF = {pine: 'forest', ice: 'ice', lava: 'frozen-lava', aurora: 'aurora', village: 'village', peak: 'summit'};
const snapshot = page => page.evaluate(() => window.__island.ui.activityInterface.current?.session?.snapshot);
const report = {viewport: VIEWPORT, browser: browser.version(), renderer: 'SwiftShader', themes: {}, flags: {}};

async function open(server, flags = '', {expectFailed = null} = {}) {
  const context = await browser.newContext({viewport: VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2});
  const audit = await helper.installIslandCspMonitor(context);
  await context.route('**/data/featureFlags.json*', async route => {
    const response = await route.fetch();
    await route.fulfill({response, json: {...await response.json(), events: false}});
  });
  const page = await context.newPage(), errors = [], requests = [], failed = [];
  page.setDefaultTimeout(120_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (!/^127\.0\.0\.1$/.test(url.hostname)) failed.push('outside: ' + url.href); requests.push(url.pathname); });
  page.on('response', response => { if (response.status() >= 400 && /alpine/.test(response.url()) && !expectFailed?.test(response.url())) failed.push(response.status() + ' ' + response.url()); });
  await audit.attachPage(page);
  await page.goto(server.url + '?dev=1' + flags, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
  await page.evaluate(() => {
    const {ui, engine, view} = window.__island;
    document.querySelector('[data-action=avatar-start]')?.click();
    view.paused = true;
    engine.skipTutorial();
    engine.tick = () => ({ok: true});
    ui.activityInterface.requireDaily = () => false;
    if (!engine.state.instructionsSeen.includes('alpineRush')) engine.state.instructionsSeen.push('alpineRush');
  });
  const close = async () => {
    try { await audit.assertClean(); assert.deepEqual(errors, []); assert.deepEqual(failed, []); }
    finally { await audit.dispose(); await context.close(); }
  };
  return {page, context, requests, close};
}

async function openStage(page) {
  await page.evaluate(() => { const {view, ui} = window.__island; view.paused = true; ui.activityInterface.menu(); });
  await page.locator('[data-action=game-enter][data-game-id=alpineRush]').tap();
  await page.locator('[data-action=game-play]').tap();
  await page.locator('[data-action=stage-play][data-stage="1"]').tap();
  await page.waitForFunction(() => {
    const session = window.__island.ui.activityInterface.current?.session, start = document.querySelector('[data-action=alpine-start]');
    return session?.ready && (session.snapshot.mode !== 'runner' || (start && !start.disabled));
  });
}

async function swipe(page, cdp, dx, dy) {
  const rect = await page.locator('.minigame-canvas').boundingBox();
  const x = Math.round(rect.x + rect.width / 2 - dx / 2), y = Math.round(rect.y + rect.height * .45 - dy / 2);
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [x, y]), 'minigame-canvas', 'the touch reaches the canvas, the weather layer does not take it');
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
  await touch('touchStart', [{x, y}]);
  for (const f of [.3, .65, 1]) await touch('touchMove', [{x: x + dx * f, y: y + dy * f}]);
  await touch('touchEnd', []);
}
const frameIs = (page, key, value) => page.waitForFunction(([key, value]) => window.__island.ui.activityInterface.current?.session?.snapshot.frame?.[key] === value, [key, value], {timeout: 15_000})
  .catch(async cause => { const s = await snapshot(page).catch(() => null), f = s?.frame; throw new Error(`waiting for ${key}=${value}: phase ${s?.phase}, ${f && JSON.stringify({status: f.status, lane: f.lane, stance: f.stance, distance: f.distance, elapsed: f.elapsed})}`, {cause}); });
const shot = async (page, name) => { await page.screenshot({path: path.join(out, name + '.png')}); };
/** Share of canvas pixels that differ from the frame's most common colour: a blank or one-colour canvas fails. */
const drawn = page => page.evaluate(async () => {
  const session = window.__island.ui.activityInterface.current.session;
  session.debug.view().render(session.snapshot.frame);
  const source = document.querySelector('.minigame-canvas'), copy = document.createElement('canvas');
  copy.width = 211; copy.height = 97;
  const ctx = copy.getContext('2d');
  ctx.drawImage(source, 0, 0, copy.width, copy.height);
  const data = ctx.getImageData(0, 0, copy.width, copy.height).data, seen = new Map();
  for (let i = 0; i < data.length; i += 4) { const key = (data[i] >> 3) + ',' + (data[i + 1] >> 3) + ',' + (data[i + 2] >> 3); seen.set(key, (seen.get(key) || 0) + 1); }
  return {colours: seen.size, largestShare: Math.max(...seen.values()) / (copy.width * copy.height)};
});

const server = await helper.serveIsland();
try {
  // 1. Theme packs on (default): each theme is picked by touch in the menu, then a run by touch.
  for (const theme of THEMES) {
    const fixture = await open(server, '&alpineRunnerSeed=' + SEEDS[theme]);
    const {page, context} = fixture;
    try {
      await openStage(page);
      assert.equal((await snapshot(page)).mode, 'runner');
      const choice = page.locator(`[data-action=alpine-runner-theme][data-theme=${theme}]`);
      await choice.scrollIntoViewIfNeeded();
      await choice.tap();
      await page.waitForFunction(pack => window.__island.ui.activityInterface.current.session.snapshot.renderMetrics?.themePack === pack, PACK_OF[theme]);
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      await shot(page, `menu-${theme}`);
      await page.locator('[data-action=alpine-start]').tap();
      await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.phase === 'racing');
      // What the engine accepted, and how many frames the page drew: a stance can begin and end inside one slow software-GL frame,
      // so the proof of a jump or a slide is the command the touch produced, next to the state when a frame shows it.
      await page.evaluate(() => {
        const engine = window.__island.ui.activityInterface.current.session.debug.engine, command = engine.command;
        const log = window.__runnerLog = {commands: [], frames: 0, since: performance.now()};
        engine.command = action => { const accepted = command(action); log.commands.push([action, accepted]); return accepted; };
        const count = () => { log.frames++; log.raf = requestAnimationFrame(count); };
        count();
      });
      const accepted = async action => {
        await page.waitForFunction(action => window.__runnerLog.commands.some(([name, ok]) => name === action && ok), action, {timeout: 15_000})
          .catch(async cause => { throw new Error(`the touch for "${action}" did not reach the engine: ${JSON.stringify(await page.evaluate(() => window.__runnerLog.commands))}`, {cause}); });
      };
      const cdp = await context.newCDPSession(page);
      await swipe(page, cdp, 110, 0);
      await accepted('right');
      await frameIs(page, 'lane', 2);
      await swipe(page, cdp, -110, 0);
      await accepted('left');
      await frameIs(page, 'lane', 1);
      await swipe(page, cdp, 0, -100);
      await accepted('jump');
      await page.waitForFunction(() => window.__island.ui.activityInterface.current.session.snapshot.frame.stance === 'stand');
      await swipe(page, cdp, 0, 100);
      await accepted('slide');
      const touchLog = await page.evaluate(() => { const log = window.__runnerLog; cancelAnimationFrame(log.raf); return {commands: log.commands, fps: Math.round(log.frames / ((performance.now() - log.since) / 1000) * 10) / 10}; });
      assert.deepEqual(touchLog.commands, [['right', true], ['left', true], ['jump', true], ['slide', true]], 'four swipes, four commands, nothing else');
      await cdp.detach();
      // Freeze the run for stable pictures along the course (the pause button is the game's own).
      await page.locator('.game-pause').tap();
      const paused = await snapshot(page);
      assert.equal(paused.paused, true);
      const picture = await drawn(page);
      assert.ok(picture.colours > 40 && picture.largestShare < .6, `the course is drawn: ${JSON.stringify(picture)}`);
      const metrics = paused.renderMetrics;
      assert.equal(metrics.themePack, PACK_OF[theme]);
      assert.equal(metrics.themePackFailures, 0);
      assert.ok(metrics.triangles > 0 && metrics.triangles <= metrics.triangleBudget, `${metrics.triangles} / ${metrics.triangleBudget} triangles`);
      const packFiles = fixture.requests.filter(p => p.includes('/assets/alpine-runner-themes-v2/'));
      assert.ok(packFiles.some(p => p.endsWith(`/${PACK_OF[theme]}/parallax/sky.webp`)), 'the backdrop of the chosen theme was fetched');
      report.themes[theme] = {touch: touchLog, pack: metrics.themePack, weather: metrics.themeStage.weather, weatherFrames: metrics.themeStage.weatherFrames, triangles: metrics.triangles, calls: metrics.calls,
        budget: metrics.triangleBudget, quality: metrics.quality, packFiles: packFiles.length, picture, distance: Math.round(paused.frame.distance)};
      // The touch part is proven above. For pictures further down the course the pack's own "hard" bot (sim/bots.mjs,
      // the same snapshots and commands a player has) keeps the skier going, so the run lasts long enough to photograph.
      await page.evaluate(async () => {
        const {createRunnerBot} = await import(new URL('design/alpine-runner-integration-patches-v1/sim/bots.mjs', document.baseURI).href);
        const bot = createRunnerBot('hard');
        window.__runnerPilot = setInterval(() => {
          const session = window.__island.ui.activityInterface.current?.session, engine = session?.debug?.engine;
          if (!engine || session.snapshot.phase !== 'racing' || session.snapshot.paused) return;
          const action = bot(engine.snapshot());
          if (action) engine.command(action);
        }, 16);
      });
      await page.locator('[data-action=game-resume]').tap();
            // A picture at a known place: the session is held (its own setPaused, without the pause dialog) the moment the distance is reached.
      const shotAt = async (metres, name) => {
        await page.waitForFunction(d => { const session = window.__island.ui.activityInterface.current?.session; if (!(session?.snapshot.frame?.distance >= d)) return false; session.setPaused(true); return true; }, metres, {timeout: 60_000});
        const frame = (await snapshot(page)).frame;
        assert.equal(frame.status, 'running', `still skiing at ${metres} m`);
        await drawn(page);
        await shot(page, name);
        await page.evaluate(() => window.__island.ui.activityInterface.current.session.setPaused(false));
        return Math.round(frame.distance);
      };
      const pictures = report.themes[theme].pictures = {};
      pictures[`run-${theme}`] = await shotAt(paused.frame.distance + 25, `run-${theme}`);
      pictures[`run-${theme}-far`] = await shotAt(pictures[`run-${theme}`] + 70, `run-${theme}-far`);
      if (theme === THEMES[0]) {
        await page.evaluate(() => {
          clearInterval(window.__runnerPilot);
          const engine = window.__island.ui.activityInterface.current.session.debug.engine;
          for (let tick = 0; tick < 36_000 && engine.snapshot().status === 'running'; tick++) engine.step(1 / 60);
        });
        await page.waitForFunction(() => !window.__island.engine.isMinigameActive());
        await page.locator('[data-alpine-summary=distance]').waitFor({state: 'attached'});
        await page.waitForTimeout(600);
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-alpine-summary]')].map(row => { const box = row.getBoundingClientRect(); return {key: row.dataset.alpineSummary, text: row.textContent, visible: box.width > 0 && box.height > 0 && getComputedStyle(row).visibility !== 'hidden'}; }));
        report.result = rows;
        // The island folds score rows under "score and prizes" (kid UX); open it by touch for the picture.
        const fold = page.locator('.modal details summary').first();
        if (await fold.count()) { await fold.tap(); await page.waitForTimeout(300); }
        report.resultVisibleAfterOpen = await page.locator('[data-alpine-summary=distance]').isVisible();
        await shot(page, 'result');
        assert.equal(await page.locator('.minigame-canvas').count(), 0, 'the canvas is released after the run');
        assert.equal(await page.locator('.alpine-runner-weather').count(), 0, 'the weather canvas is released after the run');
      } else {
        await page.evaluate(() => { clearInterval(window.__runnerPilot); window.__island.ui.closeModal(); });
        assert.equal(await page.locator('.alpine-runner-weather').count(), 0, 'the weather canvas is released on exit');
      }
    } finally { await fixture.close(); }
    console.error('theme ok:', theme);
  }
  // 2. ?alpineThemes=0: the runner with the look it shipped with, and not one pack file.
  {
    const fixture = await open(server, '&alpineThemes=0&alpineRunnerSeed=v248-base');
    const {page} = fixture;
    try {
      await openStage(page);
      const menu = await snapshot(page);
      assert.equal(menu.mode, 'runner');
      assert.equal(menu.renderMetrics.themePack, null);
      assert.equal(menu.renderMetrics.themeStage, undefined);
      assert.deepEqual(fixture.requests.filter(p => p.includes('/assets/alpine-runner-themes-v2/')), [], 'no pack file with the packs off');
      assert.equal(await page.locator('.alpine-runner-weather').count(), 0);
      await page.locator('[data-action=alpine-start]').tap();
      await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.frame?.distance > 25);
      await shot(page, 'flag-alpineThemes-0');
      const fps = await page.evaluate(() => new Promise(resolve => { let frames = 0; const since = performance.now(), count = () => { frames++; if (performance.now() - since < 4000) requestAnimationFrame(count); else resolve(Math.round(frames / ((performance.now() - since) / 1000) * 10) / 10); }; count(); }));
      report.flags.alpineThemes0 = {mode: menu.mode, themePack: menu.renderMetrics.themePack, triangles: (await snapshot(page)).renderMetrics.triangles, fps};
      await page.evaluate(() => window.__island.ui.closeModal());
    } finally { await fixture.close(); }
    console.error('flag ok: alpineThemes=0');
  }
  // 3. ?alpineRunnerPatch=0 (and the pack's own ?alpineRunner=0): the ski race, and not one runner file.
  for (const flag of ['alpineRunnerPatch', 'alpineRunner']) {
    const fixture = await open(server, `&${flag}=0&quality=low`);
    const {page} = fixture;
    try {
      await openStage(page);
      const race = await snapshot(page);
      assert.notEqual(race.mode, 'runner');
      assert.equal(race.trackId, 'ice-peak');
      assert.equal(await page.locator('.alpine-joystick').count(), 1);
      assert.deepEqual(fixture.requests.filter(p => /\/assets\/alpine-runner|alpine-runner-(view|themes|weather)/.test(p)), [], 'the flag loads no runner art and no runner view');
      if (flag === 'alpineRunnerPatch') await shot(page, 'flag-alpineRunnerPatch-0');
      report.flags[flag + '0'] = {mode: race.mode ?? 'race', trackId: race.trackId};
      await page.evaluate(() => window.__island.ui.closeModal());
    } finally { await fixture.close(); }
    console.error('flag ok:', flag + '=0');
  }
  // 4. A pack with a missing file: the base look takes over and the run starts all the same.
  {
    const fixture = await open(server, '&alpineRunnerSeed=v248-113', {expectFailed: /forest\/tiles\/04-bridge\.glb/});
    const {page, context} = fixture;
    try {
      await context.route('**/assets/alpine-runner-themes-v2/forest/tiles/04-bridge.glb*', route => route.fulfill({status: 404, body: ''}));
      await openStage(page);
      const menu = await snapshot(page);
      assert.equal(menu.mode, 'runner');
      assert.equal(menu.renderMetrics.themePack, null, 'half a theme is never shown');
      assert.equal(menu.renderMetrics.themePackFailures, 1);
      await page.locator('[data-action=alpine-start]').tap();
      await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.frame?.distance > 10);
      assert.equal(await page.locator('.alpine-runner-weather:not([hidden])').count(), 0);
      report.flags.missingPackFile = {mode: menu.mode, themePack: menu.renderMetrics.themePack, failures: menu.renderMetrics.themePackFailures, started: true};
      await page.evaluate(() => window.__island.ui.closeModal());
    } finally { await fixture.close(); }
    console.error('fallback ok: a missing pack file');
  }
  await writeFile(path.join(out, 'browser.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report, null, 1));
} finally {
  await Promise.allSettled([browser.close(), server.close()]);
}
