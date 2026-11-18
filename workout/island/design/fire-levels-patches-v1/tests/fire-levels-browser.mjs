import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Run against a checkout with apply.sh already run. An explicit path lets the
// same script test a disposable checkout without changing the delivery branch.
const repo = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + '/')
  : new URL('../../../../../', import.meta.url);
const {islandChromium, installIslandCspMonitor, serveIsland} = await import(new URL('tests/helpers/island-browser.mjs', repo));
const {waitForGameStart, waitForGameNavigation} = await import(new URL('workout/island/tests/shell-ready.mjs', repo));
const chromium = await islandChromium();
const server = await serveIsland('/workout/island/');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function open(legacy = false) {
  const context = await browser.newContext({
    viewport: {width: 844, height: 390},
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(30_000);
  await context.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = undefined;
    Object.defineProperty(screen.orientation, 'lock', {configurable: true, value: async () => { throw Error('unsupported'); }});
  });
  const csp = await installIslandCspMonitor(context);
  const page = await context.newPage();
  await csp.attachPage(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  const cdp = await context.newCDPSession(page);
  const tick = ms => page.clock.runFor(ms);
  const snap = () => page.evaluate(() => window.__island.games.current?.session.snapshot ?? null);
  const tap = async selector => {
    const target = page.locator(selector).first();
    for (let i = 0; i < 20 && !await target.isVisible(); i++) await page.clock.fastForward(48);
    assert.ok(await target.isVisible(), `Control is hidden: ${selector}`);
    await target.tap();
    await tick(48);
  };
  const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: point ? [{x: Math.round(point.x), y: Math.round(point.y), id: 1}] : [],
  });
  const until = async (predicate, description, frames = 100, step = 80) => {
    let state;
    for (let i = 0; i < frames; i++) {
      state = await snap();
      if (predicate(state)) return state;
      await page.clock.fastForward(step);
    }
    const {time, navigation, v24} = state ?? {};
    throw Error(`${description}: ${JSON.stringify({time, navigation, entry: v24?.state, phase: v24?.interior?.phase})}`);
  };
  const url = new URL(server.url);
  url.searchParams.set('dev', '1');
  url.searchParams.set('cityModels', '0');
  url.searchParams.set('quality', 'low');
  if (legacy) url.searchParams.set('fireLevels', '0');
  await page.goto(url.href, {waitUntil: 'domcontentloaded'});
  try {
    await page.waitForFunction(() => window.__island?.games, undefined, {polling: 50});
  } catch (error) {
    await csp.assertClean();
    throw Error(`Island did not boot: ${errors.join(', ')}`, {cause: error});
  }
  await page.evaluate(() => {
    const {engine, data, ui, view} = window.__island;
    view.paused = true;
    if (!engine.state.avatar.created) engine.setAvatar({...engine.state.avatar, created: true});
    ui.closeModal();
    engine.skipTutorial();
    engine.tick = () => ({ok: true});
    data.featureFlags.events = false;
    engine.state.money = 5000;
    let placed = false;
    for (let z = 0; z < engine.state.world.size && !placed; z++) {
      for (let x = 0; x < engine.state.world.size && !placed; x++) placed = engine.place('fireStation', x, z).ok;
    }
    if (!placed) throw Error('Unable to prepare the fire station');
    engine.state.minigameProgress.fireRescue.stage = 3;
    engine.state.minigameProgress.fireRescue.stars.fill(1, 0, 2);
    data.config.minigames.fireRescue.render.fallbackFrameMs = 10_000;
  });
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  return {context, page, csp, errors, tick, snap, tap, touch, until};
}

async function launch(test, stage) {
  await test.page.evaluate(level => window.__island.games.start('fireRescue', undefined, level), stage);
  if (await test.page.locator('[data-action=game-understood]').isVisible()) await test.tap('[data-action=game-understood]');
  await test.tick(48);
}

async function verifyIdle(test, stars) {
  const before = await test.page.evaluate(() => {
    const {state} = window.__island.engine;
    return {progress: state.minigameProgress.fireRescue, money: state.money, certificates: state.fireCertificates};
  });
  // Feed empty input at the real maximum timestep to the running stage model.
  // Its enclosing shell consumes the original result on the next browser frame.
  await test.page.evaluate(() => {
    const {session} = window.__island.games.current;
    const model = session.debug.model;
    for (let i = 0; i < 10_000 && !model.result; i++) model.update(.05, {});
    if (!model.result) throw Error('The idle round did not settle');
  });
  await test.tick(96);
  const result = test.page.locator('[data-result=fireRescue]');
  assert.equal(await result.count(), 1);
  const displayedStars = await result.locator('.game-result .result-row bdi').nth(3).textContent();
  assert.equal(Number(displayedStars), stars);
  const after = await test.page.evaluate(() => {
    const {state} = window.__island.engine;
    return {progress: state.minigameProgress.fireRescue, money: state.money, certificates: state.fireCertificates};
  });
  assert.deepEqual(after.progress, before.progress);
  assert.equal(after.money, before.money);
  if (stars === 1) assert.deepEqual(after.certificates, before.certificates);
  else assert.deepEqual(after.certificates[2], {fast: false, rescue: false, careful: false, stars: 0});
}

try {
  const game = await open();
  let releaseTruck;
  const truckGate = new Promise(resolveGate => { releaseTruck = resolveGate; });
  let truckRequests = 0;
  await game.page.route('**/fire-truck-512.glb*', async route => {
    truckRequests++;
    await truckGate;
    await route.continue();
  });
  let waiting;
  try {
    await launch(game, 3);
    waiting = await game.until(state => state?.renderMetrics?.truck?.pending, 'final truck did not enter loading');
    assert.equal(waiting.time, 0);
    assert.equal(waiting.renderMetrics.rendererDrawCalls, 0);
    assert.equal(await game.page.evaluate(() => window.__island.games.current.session.ready), false);
    assert.equal(waiting.range, 210);
    assert.equal(waiting.v24.plan.floorCount, 3);
  } finally {
    releaseTruck();
  }
  const playable = await game.until(state => state?.renderMetrics?.truck?.loaded, 'final truck did not load');
  assert.equal(playable.renderMode, 'three');
  assert.equal(playable.renderMetrics.truck.kind, 'meshy');
  assert.equal(await game.page.evaluate(() => window.__island.games.current.session.debug.view.world.truckBase.visible), false);
  await waitForGameStart(game.page);
  await waitForGameNavigation(game.page);
  assert.equal(await game.page.locator('#fire-enter').isVisible(), true);
  await game.tap('#fire-enter');
  const driving = await game.until(state => state?.navigation?.kind === 'building' && state.navigation.active, 'door button did not start navigation');
  assert.equal(driving.v24.inside, false);
  const arrived = await game.until(state => state?.v24?.state === 'ready', 'truck did not park at the building', 120, 100);
  assert.equal(arrived.truck.driving, false);
  assert.equal(arrived.renderMetrics.truck.kind, playable.renderMetrics.truck.kind);
  assert.equal(truckRequests, 1);
  await game.tap('#fire-enter');
  await game.until(state => state?.v24?.interior?.ready && state.v24.interior.tutorialOpen, 'interior did not show its lesson', 120);
  await game.tap('.fv24-card[data-card=tutorial] button');
  await game.until(state => state?.v24?.interior?.phase === 'intro', 'room introduction did not start');
  await game.tap('.fv24-card[data-card=room] button');
  let state = await game.until(value => value?.v24?.interior?.phase === 'play' && value.v24.interior.renderMetrics.rescueAnimation,
    'room or rescue animation did not load');
  assert.equal(state.v24.interior.floor, 1);
  assert.equal(state.v24.interior.floorCount, 3);
  assert.equal(state.v24.interior.renderMetrics.rescueAnimation, true);
  assert.ok(Math.abs(state.remaining - arrived.remaining) < .5, 'street clock should freeze inside');
  assert.equal(await game.page.locator('.fv24-rescue').isVisible(), false);
  const spotCount = state.v24.interior.screen.spots.length;
  for (let i = 0; i < spotCount; i++) {
    const spot = state.v24.interior.screen.spots.find(candidate => !candidate.done);
    if (!spot) break;
    await game.touch('touchStart', spot);
    try {
      state = await game.until(value => value?.v24?.interior?.screen?.spots.find(candidate => candidate.id === spot.id)?.done,
        `aimed spray did not clear ${spot.id}`, 40, 100);
    } finally {
      await game.touch('touchEnd');
      await game.tick(48);
    }
  }
  state = await game.until(value => Boolean(value?.v24?.interior?.rescueAction), 'rescue button did not become actionable');
  const friend = state.v24.interior.screen.friend;
  await game.touch('touchStart', friend);
  await game.tick(64);
  await game.touch('touchEnd');
  await game.tick(64);
  assert.equal((await game.snap()).v24.interior.room.friend.state, 'waiting');
  const rescue = await game.snap();
  const action = rescue.v24.interior.rescueAction.id;
  await game.tap(`[data-rescue-action="${action}"]`);
  const rescuing = await game.until(value => value?.v24?.interior?.rescueAction?.active, 'rescue action did not begin');
  assert.equal(rescuing.v24.interior.spraying, false);
  assert.ok(rescuing.v24.interior.tanks.water >= rescue.v24.interior.tanks.water);
  await game.until(value => value?.v24?.interior?.floor === 2 && value.v24.interior.rooms[0].friend === 'out',
    'rescue did not finish and advance to the second floor', 100);
  await game.csp.assertClean();
  assert.deepEqual(game.errors, []);
  await game.context.close();
  console.log(JSON.stringify({stage: 3, range: waiting.range, truck: playable.renderMetrics.truck.kind, truckRequests, floors: waiting.v24.plan.floorCount, rescueAction: action, reachedFloor: 2}));

  for (const legacy of [false, true]) {
    const test = await open(legacy);
    try {
      await launch(test, 3);
      const expected = legacy ? 270 : 210;
      const snapshot = await test.until(state => state?.renderMetrics?.truck?.loaded, 'truck did not load in idle check');
      assert.equal(snapshot.range, expected);
      assert.equal(snapshot.v24.plan.rooms.length, legacy ? 1 : 3);
      await waitForGameStart(test.page);
      await verifyIdle(test, legacy ? 0 : 1);
      await test.csp.assertClean();
      assert.deepEqual(test.errors, []);
      console.log(JSON.stringify({stage: 3, legacy, range: snapshot.range, idleStars: legacy ? 0 : 1}));
    } finally {
      await test.context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
