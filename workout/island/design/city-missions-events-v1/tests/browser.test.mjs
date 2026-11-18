import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { installIslandCspMonitor, islandChromium, serveIsland } from '../../../../../tests/helpers/island-browser.mjs';

const enabled = process.env.CITY_MISSIONS_BROWSER === '1';
const action = name => `[data-action="${name}"]`;
const board = '[data-city-missions]';
const activeSlot = '[data-mission-slot="active"]';
const nextSlot = '[data-mission-slot="next"]';

async function waitForIsland(page) {
  await page.waitForFunction(() => Boolean(window.__island?.engine), undefined, { polling: 100 });
}

async function pauseBackgroundMap(page) {
  await page.evaluate(() => { window.__island.view.paused = true; });
}

async function openCity(browser, server, viewport, settings = {}) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    deviceScaleFactor: 1,
    timezoneId: 'Asia/Jerusalem',
    serviceWorkers: 'block',
  });
  try {
    const audit = await installIslandCspMonitor(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.setDefaultTimeout(45_000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('island.sound', 'off'));
    const url = new URL(server.url);
    url.search = new URLSearchParams({ dev: '1', quality: 'low', ...settings }).toString();
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await waitForIsland(page);
    await page.locator(action('avatar-start')).click();
    await page.evaluate(() => window.__island.engine.skipTutorial());
    await pauseBackgroundMap(page);
    return { page, context, audit, pageErrors, url };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function openMissionsFromCity(page) {
  await pauseBackgroundMap(page);
  const toggle = page.locator(action('toggle-city'));
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') === 'false') {
    const toggleBox = await toggle.boundingBox();
    assert.ok(toggleBox);
    await page.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
  }
  await page.locator(action('city-missions-open')).click();
  await page.locator(board).waitFor({ state: 'visible' });
}

async function readMissionState(page) {
  return page.evaluate(() => window.__island.engine.state.cityMissions);
}

async function promoteEvent(page, id) {
  await page.waitForFunction(id => {
    const { active, next } = window.__island.engine.state.cityMissions;
    return active?.id === id || next?.id === id;
  }, id);
  if ((await readMissionState(page)).active.id !== id) {
    await openMissionsFromCity(page);
    await page.locator(`${board} ${action('city-mission-skip')}`).click();
    await page.waitForFunction(id => window.__island.engine.state.cityMissions.active?.id === id, id);
  }
  return (await readMissionState(page)).active;
}

async function startGameFromMission(page, id, stage) {
  await openMissionsFromCity(page);
  await page.locator(`${board} ${action('city-mission-go')}`).click();
  const intro = page.locator(action('game-understood'));
  const selector = `[data-game="${id}"][data-stage="${stage}"]`;
  const game = page.locator(selector);
  await intro.or(game).first().waitFor();
  if (await intro.isVisible()) await intro.click();
  await page.locator(`${selector}[data-starting="false"]`).waitFor();
}

test('patched island city missions browser flow', { skip: !enabled, timeout: 300_000 }, async t => {
  const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const chromium = await islandChromium();
  const systemChromium = existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || systemChromium,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());
  const server = await serveIsland();
  t.after(() => server.close());

  await t.test('portrait city has one playable assignment and one preview', async () => {
    const { page, context, audit, pageErrors } = await openCity(browser, server, { width: 390, height: 844 });
    try {
      await openMissionsFromCity(page);
      const panel = page.locator(board);
      assert.equal(await panel.locator(activeSlot).count(), 1);
      assert.equal(await panel.locator(nextSlot).count(), 1);
      const active = panel.locator(`${activeSlot} ${action('city-mission-go')}`);
      assert.equal(await active.isEnabled(), true);
      assert.equal(await panel.locator(`${nextSlot} button`).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const state = await readMissionState(page);
      assert.equal(state.active.id, 'build-house');
      assert.ok(state.next?.id);
      assert.notEqual(state.next.id, state.active.id);
      await active.click();
      await page.locator(action('ready-plot-build')).click();
      await page.waitForFunction(() => window.__island.engine.state.cityMissions.active?.id !== 'build-house');
      assert.equal(await page.evaluate(() => window.__island.engine.state.buildings.some(row => row.typeId === 'house')), true);
      assert.deepEqual(pageErrors, []);
      await audit.assertClean();
    } finally {
      await context.close();
    }
  });

  await t.test('native fire and crime stages, reward, learning lock and reload', async () => {
    const { page, context, audit, pageErrors, url } = await openCity(browser, server, { width: 844, height: 390 });
    try {
      await page.evaluate(firstEventAfter => {
        const { engine } = window.__island;
        const record = engine.state.minigameProgress.fireRescue;
        record.stars[0] = 1;
        record.stage = 2;
        for (const type of ['house', 'fireStation']) {
          const plot = engine.readyPlots().find(row => row.typeId === type && row.ok);
          if (!plot || !engine.buildReadyPlot(plot.id).ok) throw Error(`Missing ready plot for ${type}`);
        }
        const maximum = engine.data.config.maxTickSeconds;
        for (let seconds = firstEventAfter + 2; seconds > 0; seconds -= maximum) engine.tick(Math.min(seconds, maximum));
      }, catalog.pacing.firstEventAfter);
      const fire = await promoteEvent(page, 'event-fire');
      assert.deepEqual({ game: fire.gameId, stage: fire.stage }, { game: 'fireRescue', stage: 2 });
      assert.equal(await page.locator('[data-game="fireRescue"]').count(), 0);

      await page.evaluate(() => {
        const { engine } = window.__island;
        engine.state.learning.startDay = '2020-01-01';
        engine.setLearningRequired(true);
      });
      assert.equal(await page.evaluate(() => window.__island.engine.learningStatus().locked), true);
      await openMissionsFromCity(page);
      const locked = page.locator(`${board} ${action('city-mission-go')}`);
      if (await locked.isEnabled()) {
        await locked.click();
        await page.locator('[data-daily-mission]').waitFor({ state: 'visible' });
        await page.locator(action('close-modal')).click();
      }
      assert.equal(await page.evaluate(() => window.__island.engine.isMinigameActive()), false);
      assert.deepEqual((await readMissionState(page)).active, fire);
      await page.evaluate(() => window.__island.engine.setLearningRequired(false));

      await startGameFromMission(page, 'fireRescue', 2);
      await page.locator(action('game-pause')).click();
      await page.locator(`.game-pause-sheet ${action('game-exit')}`).click();
      await page.waitForFunction(() => !window.__island.engine.isMinigameActive());
      assert.deepEqual((await readMissionState(page)).active, fire);

      await startGameFromMission(page, 'fireRescue', 2);
      const expectedMissionCoins = catalog.missions.find(row => row.id === 'event-fire').reward.money;
      await page.evaluate(() => {
        const { engine } = window.__island;
        // Freeze only the incidental city income after the scheduled event has opened.
        engine.tick = () => ({ ok: true });
        window.__cityMissionsFireProof = { before: engine.state.money, results: [] };
        engine.subscribe((_, event) => {
          if (event.type === 'minigame' && event.id === 'fireRescue') {
            window.__cityMissionsFireProof.results.push(event.result);
          }
        });
      });
      const outcome = await page.evaluate(() => {
        // Put nearly extinguished flames within hose range for a deterministic finish.
        // The existing fire session reports the terminal result to the real island engine.
        const model = window.__island.games.current.session.debug.model;
        for (const flame of model.flames.filter(flame => flame.active)) {
          flame.x = model.nozzle.x + Math.min(model.range / 2, 12);
          flame.y = model.nozzle.y;
          flame.heat = 0.00001;
          model.update(0.02, { firing: true, x: flame.x, y: flame.y });
        }
        return model.result?.outcome;
      });
      assert.equal(outcome, 'win');
      await page.locator('[data-result="fireRescue"]').waitFor();
      const payment = await page.evaluate(() => {
        const { engine } = window.__island;
        const proof = window.__cityMissionsFireProof;
        return { increase: engine.state.money - proof.before, results: proof.results, stage: engine.state.minigameProgress.fireRescue.stage };
      });
      assert.equal(payment.results.length, 1);
      assert.equal(payment.results[0].outcome, 'win');
      assert.equal(payment.stage, 3);
      assert.ok(Math.abs(payment.increase - payment.results[0].money - expectedMissionCoins) < 1e-8);
      const after = await readMissionState(page);
      assert.notEqual(after.active?.token, fire.token);
      assert.equal(after.lastEvent, 'event-fire');

      const rollbackURL = new URL(url);
      rollbackURL.searchParams.set('cityMissions', '0');
      await page.goto(rollbackURL.href, { waitUntil: 'domcontentloaded' });
      await waitForIsland(page);
      assert.equal(await page.locator(action('city-missions-open')).count(), 0);
      assert.deepEqual(await readMissionState(page), after);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await waitForIsland(page);
      await pauseBackgroundMap(page);
      assert.deepEqual(await readMissionState(page), after);

      assert.equal(after.active.id, 'upgrade-house');
      await page.evaluate(eventCooldown => {
        const { engine } = window.__island;
        const house = engine.state.buildings.find(row => row.typeId === 'house');
        if (!engine.upgrade(house.id).ok) throw Error('Unable to complete the upgrade mission');
        const police = engine.readyPlots().find(row => row.typeId === 'police' && row.ok);
        if (!police || !engine.buildReadyPlot(police.id).ok) throw Error('Missing ready plot for police');
        const maximum = engine.data.config.maxTickSeconds;
        for (let seconds = eventCooldown + 2; seconds > 0; seconds -= maximum) engine.tick(Math.min(seconds, maximum));
      }, catalog.pacing.eventCooldown);
      const crime = await promoteEvent(page, 'event-crime');
      assert.deepEqual({ game: crime.gameId, stage: crime.stage }, { game: 'catchCriminal', stage: 1 });
      await startGameFromMission(page, 'catchCriminal', 1);
      await page.waitForFunction(() => window.__island.games.current?.session?.snapshot.mode === 'chase');
      assert.deepEqual(pageErrors, []);
      await audit.assertClean();
    } finally {
      await context.close();
    }
  });

  await t.test('rollback retains the existing mission and emergency flow', async () => {
    const { page, context, audit, pageErrors } = await openCity(browser, server, { width: 844, height: 390 }, { cityMissions: '0' });
    try {
      assert.equal(await page.locator(action('city-missions-open')).count(), 0);
      assert.equal(await page.locator(board).count(), 0);
      assert.equal(await readMissionState(page), undefined);
      await page.locator(action('toggle-tasks')).click();
      await page.locator('.mission-details').waitFor({ state: 'visible' });
      assert.equal(await page.locator(board).count(), 0);
      assert.equal(await page.evaluate(() => window.__island.data.featureFlags.events), true);
      assert.deepEqual(pageErrors, []);
      await audit.assertClean();
    } finally {
      await context.close();
    }
  });
});
