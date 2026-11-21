import assert from 'node:assert/strict';
import test from 'node:test';
import { islandChromium, serveIsland } from './helpers/island-browser.mjs';
import { BUILDINGS } from '../workout/island/assets/city-progression-v1/catalog.mjs';

const enabled = process.env.ISLAND_CITY_PROGRESS_BROWSER === '1';
const browserOptions = {
  skip: enabled ? false : 'real browser: set ISLAND_CITY_PROGRESS_BROWSER=1',
  timeout: 180_000,
};

const storageKey = 'island.v1';
const buildButton = '[data-action="ready-plot-build"]';

test('browser uses the real island, plays all three building phases, and rolls back through the URL', browserOptions, async () => {
  const chromium = await islandChromium();
  const server = await serveIsland();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const progressionRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.includes('/city-progression-v1/') || path.includes('/city-buildings-v2/')) progressionRequests.push(path);
    });
    const open = async query => {
      // The software renderer keeps the page busy: stop drawing before leaving it.
      await page.evaluate(() => { if (window.__island?.view) window.__island.view.paused = true; }).catch(() => {});
      await page.goto(`${server.url}?dev=1&quality=low&${query}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForFunction(() => window.__island?.view?.renderer);
    };
    const phaseAsset = stage => page.waitForResponse(response =>
      response.ok() && new URL(response.url()).pathname.match(new RegExp(`/city-buildings-v2/park-${stage}\\.glb$`)));
    const renderedPhase = (id, stage) => page.waitForFunction(({ id, stage }) => {
      let seen = false;
      window.__island.view.groups.get(id)?.group.traverse(node => {
        seen ||= Boolean(node.userData.modelPath?.endsWith(`-${stage}.glb`));
      });
      return seen;
    }, { id, stage });

    await open('cityProgression=0');
    const legacyHome = await page.evaluate(() => {
      const { engine } = window.__island;
      engine.setAvatar({ created: true });
      engine.skipTutorial();
      const result = engine.place('house', 4, 5);
      return { ok: result.ok, id: result.id, progression: Boolean(engine.cityProgress?.()) };
    });
    assert.equal(legacyHome.ok, true);
    assert.equal(legacyHome.progression, false);
    assert.deepEqual(progressionRequests, []);

    await open('');
    const before = await page.evaluate(key => {
      const { engine, ui } = window.__island;
      ui.closeModal();
      ui.selectBuilding('park');
      return {
        legacy: localStorage.getItem(key),
        hasLegacyHome: engine.state.buildings.some(row => row.typeId === 'house'),
        active: Boolean(engine.cityProgress?.()),
        readyPlots: ui.readyPlots.active,
      };
    }, storageKey);
    assert.equal(before.active, true);
    assert.equal(before.hasLegacyHome, true);
    assert.equal(before.readyPlots, true);
    assert.match(await page.locator('.city-progress-status').textContent(), /יום/);
    const foundation = phaseAsset('foundation');
    await page.locator(buildButton).click();
    await foundation;
    const built = await page.evaluate(() => {
      const { engine } = window.__island;
      return engine.state.buildings.find(row => row.typeId === 'park');
    });
    assert.ok(built, 'the ordinary placement confirmation creates the park');
    await renderedPhase(built.id, 'foundation');

    const halfBuilt = phaseAsset('half-built');
    await page.evaluate(seconds => window.__island.engine.tick(seconds), Math.ceil(BUILDINGS.park.stageSeconds / 3));
    await halfBuilt;
    await renderedPhase(built.id, 'half-built');
    const complete = phaseAsset('complete');
    await page.evaluate(seconds => window.__island.engine.tick(seconds), BUILDINGS.park.stageSeconds);
    await complete;
    await renderedPhase(built.id, 'complete');
    const newTypePlacement = await page.evaluate(() => {
      const { ui } = window.__island;
      ui.selectBuilding('grocery');
      return { manual: ui.selected === 'grocery', prepared: Boolean(ui.readyPlots.focusedId) };
    });
    assert.ok(newTypePlacement.manual || newTypePlacement.prepared, 'new catalog items can be built from a prepared city');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), before.legacy);

    progressionRequests.length = 0;
    await open('cityProgression=0');
    const rollback = await page.evaluate(id => {
      const { engine } = window.__island;
      return {
        active: Boolean(engine.cityProgress?.()),
        legacyHome: engine.state.buildings.some(row => row.id === id),
        newPark: engine.state.buildings.some(row => row.typeId === 'park'),
      };
    }, legacyHome.id);
    assert.deepEqual(rollback, { active: false, legacyHome: true, newPark: false });
    assert.deepEqual(progressionRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
