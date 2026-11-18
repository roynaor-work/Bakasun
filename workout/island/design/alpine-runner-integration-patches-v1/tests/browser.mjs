import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const defaultRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const root = path.resolve(process.env.ALPINE_TEST_ROOT || defaultRoot);
const helperAt = directory => import(pathToFileURL(path.join(directory, 'tests/helpers/island-browser.mjs')));
const helper = await helperAt(root);
const chromium = await helper.islandChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const runnerRecordKey = 'island.alpine.runner.best.v1';
const raceRecordKey = 'island.alpine.v1';
const snapshot = page => page.evaluate(() => window.__island.ui.activityInterface.current?.session?.snapshot);

async function open(server, helpers, viewport, flags = '') {
  const context = await browser.newContext({viewport, hasTouch: true, deviceScaleFactor: 1});
  try {
    const audit = await helpers.installIslandCspMonitor(context);
    await context.route('**/data/featureFlags.json*', async route => {
      const response = await route.fetch();
      await route.fulfill({response, json: {...await response.json(), events: false}});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    const pageErrors = [];
    const runnerRequests = [];
    const failedRunnerRequests = [];
    const isRunner = url => /alpine-runner|runner-course-generator/.test(new URL(url).pathname);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (isRunner(request.url())) runnerRequests.push(new URL(request.url()).pathname);
    });
    page.on('response', response => {
      if (isRunner(response.url()) && response.status() >= 400) {
        failedRunnerRequests.push([response.status(), response.url()]);
      }
    });
    await audit.attachPage(page);
    await page.goto(server.url + '?dev=1' + flags, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded, null, {timeout: 90_000})
      .catch(error => {
        throw new Error(`Island did not load at ${viewport.width}×${viewport.height} (${flags || 'default'}): ${pageErrors.join(', ')}`, {cause: error});
      });
    await page.evaluate(() => {
      const {ui, engine, view} = window.__island;
      document.querySelector('[data-action=avatar-start]').click();
      view.paused = true;
      engine.skipTutorial();
      engine.tick = () => ({ok: true});
      ui.activityInterface.requireDaily = () => false;
      if (!engine.state.instructionsSeen.includes('alpineRush')) {
        engine.state.instructionsSeen.push('alpineRush');
      }
    });
    return {page, context, audit, pageErrors, runnerRequests, failedRunnerRequests};
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function close(fixture) {
  try {
    await fixture.audit.assertClean();
    assert.deepEqual(fixture.pageErrors, []);
    assert.deepEqual(fixture.failedRunnerRequests, []);
  } finally {
    await fixture.audit.dispose();
    await fixture.context.close();
  }
}

async function stages(page) {
  await page.evaluate(() => {
    const {view, ui} = window.__island;
    view.paused = true;
    ui.activityInterface.menu();
  });
  await page.locator('[data-action=game-enter][data-game-id=alpineRush]').tap();
  await page.locator('[data-action=game-play]').tap();
}

async function ready(page) {
  await page.waitForFunction(() => {
    const session = window.__island.ui.activityInterface.current?.session;
    const start = document.querySelector('[data-action=alpine-start]');
    return session?.ready && start && !start.disabled;
  });
}

async function launchRunner(page) {
  await stages(page);
  await page.locator('[data-action=stage-play][data-stage="1"]').tap();
  await ready(page);
  assert.equal((await snapshot(page)).mode, 'runner');
  await page.locator('[data-action=alpine-start]').tap();
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.phase === 'racing');
}

async function swipe(page, cdp, dx, dy, end = 'touchEnd') {
  const rect = await page.locator('.minigame-canvas').boundingBox();
  assert.ok(rect, 'a visible game canvas receives touches');
  const x = Math.round(rect.x + rect.width / 2 - dx / 2);
  const y = Math.round(rect.y + rect.height / 2 - dy / 2);
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [x, y]);
  assert.equal(hit, 'minigame-canvas', `the swipe's first touch at ${x},${y} must reach the canvas`);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
  await touch('touchStart', [{x, y}]);
  for (const fraction of [0.3, 0.65, 1]) {
    await touch('touchMove', [{x: x + dx * fraction, y: y + dy * fraction}]);
  }
  await touch(end, []);
}

async function waitFrame(page, property, value) {
  await page.waitForFunction(([property, value]) => (
    window.__island.ui.activityInterface.current?.session?.snapshot.frame?.[property] === value
  ), [property, value], {timeout: 6_000});
}

async function runnerSmoke(server, viewport) {
  console.error(`Test runner touch and settlement at ${viewport.width}×${viewport.height}`);
  const fixture = await open(server, helper, viewport, '&quality=low&alpineRunnerSeed=browser-qa-415');
  const {page, context} = fixture;
  try {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({version: 1, best: {}, runs: []})), raceRecordKey);
    const legacyRecord = await page.evaluate(key => localStorage.getItem(key), raceRecordKey);
    await launchRunner(page);
    const cdp = await context.newCDPSession(page);
    const initialLane = (await snapshot(page)).frame.lane;
    assert.equal(initialLane, 1);
    await swipe(page, cdp, 105, 0);
    await waitFrame(page, 'lane', 2);
    await swipe(page, cdp, -105, 0);
    await waitFrame(page, 'lane', 1);
    await swipe(page, cdp, -10, 0, 'touchCancel');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await snapshot(page)).frame.lane, 1, 'cancelling a gesture clears it');
    await swipe(page, cdp, 0, -95);
    await waitFrame(page, 'stance', 'jump');
    await waitFrame(page, 'stance', 'stand');
    await swipe(page, cdp, 0, 95);
    await waitFrame(page, 'stance', 'slide');
    await cdp.detach();
    await page.locator('.game-pause').tap();
    const paused = await snapshot(page);
    assert.equal(paused.paused, true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await snapshot(page)).frame.distance, paused.frame.distance);
    await page.locator('[data-action=game-resume]').tap();
    await page.waitForFunction(distance => (
      window.__island.ui.activityInterface.current?.session?.snapshot.frame?.distance > distance
    ), paused.frame.distance);
    const {triangles, triangleBudget} = (await snapshot(page)).renderMetrics;
    assert.ok(triangles > 0 && triangles <= triangleBudget, `${triangles} / ${triangleBudget} triangles`);
    await page.evaluate(() => {
      const engine = window.__island.ui.activityInterface.current.session.debug.engine;
      for (let tick = 0; tick < 18_000 && engine.snapshot().distance < 300; tick += 1) {
        const frame = engine.snapshot();
        const segment = frame.segments.find(segment => segment.startM <= frame.distance && frame.distance < segment.endM);
        const target = segment && (frame.distance < segment.moveStartM ? segment.entryLane : segment.exitLane);
        if (target !== undefined && target !== frame.lane) engine.command(target > frame.lane ? 'right' : 'left');
        engine.step(1 / 60);
      }
      if (engine.snapshot().distance < 300) throw Error('could not reach the runner stage goal');
      for (let tick = 0; tick < 18_000 && engine.snapshot().status === 'running'; tick += 1) {
        engine.step(1 / 60);
      }
      if (engine.snapshot().status !== 'crashed') throw Error('standing in one lane never crashed');
    });
    await page.waitForFunction(() => !window.__island.engine.isMinigameActive());
    await page.locator('[data-alpine-summary=distance]').waitFor({state: 'visible'});
    assert.equal(await page.locator('[data-alpine-summary=time]').count(), 1);
    assert.equal(await page.locator('[data-alpine-summary=coins]').count(), 1);
    assert.equal(await page.locator('[data-alpine-summary=newBest]').count(), 1);
    const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), runnerRecordKey);
    assert.ok(record?.distance >= 300, 'a completed runner attempt writes a personal record');
    assert.equal(record.score, record.distance + 5 * record.coins);
    assert.equal(await page.evaluate(() => window.__island.engine.state.minigameProgress.alpineRush.stars[0]), 3);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), raceRecordKey), legacyRecord);
    assert.equal(await page.locator('.minigame-canvas').count(), 0, 'settlement disposes the canvas');
    await stages(page);
    await page.locator('[data-action=stage-play][data-stage="1"]').tap();
    await ready(page);
    assert.ok((await snapshot(page)).records.best, 'the next runner session loads the record');
    const ice = page.locator('[data-action=alpine-runner-theme][data-theme=ice]');
    await ice.scrollIntoViewIfNeeded();
    await ice.tap();
    assert.equal(await ice.getAttribute('aria-pressed'), 'true');
    assert.equal((await snapshot(page)).frame.theme, 'ice');
    await page.evaluate(() => window.__island.ui.closeModal());
    assert.equal(await page.locator('.minigame-canvas').count(), 0);
    assert.ok(fixture.runnerRequests.length > 0);
    return {viewport, triangles, triangleBudget};
  } finally {
    await close(fixture);
  }
}

async function leagueAndRace(server, helpers, flags, {checkRace = true} = {}) {
  console.error(`Test ${checkRace ? 'league and race' : 'league'} (${flags || 'default'})`);
  const fixture = await open(server, helpers, {width: 390, height: 844}, '&quality=low' + flags);
  const {page} = fixture;
  try {
    await stages(page);
    await page.locator('[data-action=alpine-league-go]').tap();
    await ready(page);
    const league = await snapshot(page);
    assert.notEqual(league.mode, 'runner', 'the ski league still uses its race');
    assert.equal(league.league.n, 1);
    assert.ok(league.league.goals.length > 0);
    assert.equal(await page.locator('.alpine-joystick').count(), 1);
    await page.evaluate(() => window.__island.ui.closeModal());
    if (!checkRace) return;
    await stages(page);
    await page.locator('[data-action=stage-play][data-stage="1"]').tap();
    await ready(page);
    const race = await snapshot(page);
    assert.notEqual(race.mode, 'runner');
    assert.equal(race.trackId, 'ice-peak');
    assert.equal(await page.locator('.alpine-joystick').count(), 1);
    assert.equal(await page.locator('.alpine-trick').count(), 4);
    assert.deepEqual(fixture.runnerRequests.filter(url => url.includes('/assets/')), [], 'the legacy flag loads no runner art');
    return {
      league: league.league, stage: race.stage, trackId: race.trackId,
      trackLength: race.frame.trackLength, rank: race.frame.rank,
      rivals: race.frame.rivals.length, renderMode: race.renderMetrics.mode,
    };
  } finally {
    await close(fixture);
  }
}

let patched;
let baseline;
try {
  patched = await helper.serveIsland();
  const results = [];
  for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
    results.push(await runnerSmoke(patched, viewport));
  }
  await leagueAndRace(patched, helper, '', {checkRace: false});
  const legacy = await leagueAndRace(patched, helper, '&alpineRunner=0');
  let comparedWithBase = false;
  if (process.env.ALPINE_LEGACY_ROOT) {
    const baselineHelper = await helperAt(path.resolve(process.env.ALPINE_LEGACY_ROOT));
    baseline = await baselineHelper.serveIsland();
    assert.deepEqual(legacy, await leagueAndRace(baseline, baselineHelper, ''));
    comparedWithBase = true;
  }
  console.log(JSON.stringify({browser: browser.version(), renderer: 'Chromium/SwiftShader', comparedWithBase, results}, null, 2));
} finally {
  await Promise.allSettled([browser.close(), patched?.close(), baseline?.close()]);
}
