import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, mkdir, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {serveIsland, islandChromium, installIslandCspMonitor} from './helpers/island-browser.mjs';

/** Alpine Rush environments (design/alpine-v5: sunset, fog, floodlit night) and the island UI kit (design/ui-kit-v2).
 * Node part: config -> environment per stage, every file the code can request is in the offline list, size budget,
 * silent-fallback contract. Browser part (ISLAND_CSP_BROWSER=1): the game under the shipped CSP in both phone
 * orientations, one environment per stage, rotate swaps the background, every request is listed for download,
 * missing assets fall back silently, and the island menu / opening / stage / result screens use the kit.
 * ALPINE_ENV_SHOTS=<dir> writes screenshots (CI leaves it unset). */
const island = path.resolve(fileURLToPath(new URL('../workout/island/', import.meta.url)));
const read = file => readFile(path.join(island, file), 'utf8');
const manifest = JSON.parse(await read('offline-manifest.json')), config = JSON.parse(await read('data/config.json'));
const tracks = config.minigames.alpineRush.tracks, levels = config.minigames.alpineRush.levels;
const ENV_BY_STAGE = {1: 'sunset', 2: 'fog', 3: 'night-floodlit'};
const V5 = 'design/alpine-v5/', KIT = 'design/ui-kit-v2/';
const GAMES = ['soccer', 'tennis', 'streetSlam', 'alpineRush', 'islandRacing', 'navalDuel', 'fireRescue', 'alienDefense', 'boarDefense'];

test('three stages use three different environments, set in the track config', () => {
  const byStage = Object.fromEntries(levels.map(l => [l.stage, tracks[l.trackId].visual.environment]));
  assert.deepEqual(byStage, ENV_BY_STAGE);
});

test('alpine-v5: every file an environment can request exists, is in games.alpine, and the pack stays inside the size budget', async () => {
  const listed = new Set(manifest.games.alpine);
  const need = new Set();
  for (const env of Object.values(ENV_BY_STAGE)) {
    const json = JSON.parse(await read(`${V5}environments/${env}.json`)); need.add(`${V5}environments/${env}.json`);
    const pack = JSON.parse(await read(`${V5}manifest.json`)), byId = new Map(pack.assets.map(a => [a.id, a]));
    for (const id of json.assets) { const asset = byId.get(id); assert.ok(asset, id); if (!['snow-albedo'].includes(id)) need.add(V5 + asset.path); }
    for (const kind of ['landscape', 'portrait']) need.add(`${V5}backgrounds/${env}-${kind}.webp`);
  }
  // The code reads each atlas description next to its image; the snow albedo is not used (the game keeps its own snow colour).
  for (const name of ['powder-spray', 'landing-cloud', 'snow-flecks']) { need.add(`${V5}atlases/${name}.json`); need.add(`${V5}atlases/${name}.png`); }
  need.add(`${V5}decals/route-and-snow.json`); need.add(`${V5}decals/route-and-snow.png`);
  let bytes = 0; for (const file of need) { assert.ok(listed.has(file), `${file} is missing from offline-manifest games.alpine`); bytes += (await stat(path.join(island, file))).size; }
  for (const file of listed) if (file.startsWith(V5)) { assert.ok(need.has(file), `${file} is listed but the game never requests it`); }
  assert.ok(bytes < 1_100_000, `alpine-v5 pack ${bytes} bytes`);
  const alpineTotal = await Promise.all(manifest.games.alpine.map(async f => (await stat(path.join(island, f))).size));
  assert.ok(alpineTotal.reduce((a, b) => a + b, 0) < 6_500_000, 'games.alpine stays within the download budget');
});

test('ui-kit-v2: files the island UI requests are in core; game coverage matches the kit manifest', async () => {
  const core = new Set(manifest.core), kit = JSON.parse(await read(`${KIT}manifest.json`));
  assert.deepEqual(kit.games.map(g => g.id).sort(), [...GAMES].sort(), 'kit covers the nine games');
  for (const id of GAMES) for (const dir of ['intro', 'icons/games']) assert.ok(core.has(`${KIT}${dir}/${id}.svg`), `${dir}/${id}.svg`);
  for (const file of ['icons/menu/lock.svg', 'icons/menu/check.svg', 'rewards/trophy.svg', 'rewards/star-filled.svg', 'rewards/star-empty.svg', 'surfaces/result-panel.svg']) assert.ok(core.has(KIT + file), file);
  const css = await read(`${KIT}ui-kit.css`);
  for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g)) assert.ok(core.has(KIT + url), `${url} is used by ui-kit.css and must be in core`);
  const html = await read('index.html'); assert.match(html, /design\/ui-kit-v2\/ui-kit\.css/); assert.match(html, /ui\/ui-kit-bridge\.css/);
});

test('source contract: silent fallbacks and no game logic in the kit helpers', async () => {
  const env = await read('minigames/alpine-env.mjs'), view = await read('minigames/alpine-view.mjs'), world = await read('minigames/alpine-design-world.mjs');
  assert.match(env, /catch \{ disposeOwned\(\); return null; \}/, 'a missing required asset resolves to null');
  assert.match(view, /env = await loadAlpineEnv/); assert.match(view, /catch \{ env = null; \}/);
  assert.match(view, /skipBackgrounds:!!env/, 'earlier backdrops are not downloaded while an environment is active');
  assert.match(world, /env \? env\.backgroundFor/);
  const kit = await read('ui/ui-kit.mjs'); assert.match(kit, /img\.onerror = \(\) => \{ img\.hidden = true/);
  assert.doesNotMatch(kit, /Math\.random|engine|state\./, 'the kit helpers display values, they never compute them');
  const {resolveEnvironmentId, ENV_IDS} = await import('../workout/island/minigames/alpine-env.mjs');
  assert.deepEqual([...ENV_IDS], ['sunset', 'fog', 'night-floodlit']);
  assert.equal(resolveEnvironmentId({environment: 'fog'}, ''), 'fog');
  assert.equal(resolveEnvironmentId({environment: 'fog'}, '?env=off'), null);
  assert.equal(resolveEnvironmentId({environment: 'fog'}, '?env=sunset'), 'sunset');
  assert.equal(resolveEnvironmentId({environment: 'nope'}, ''), null); assert.equal(resolveEnvironmentId({}, ''), null);
});

test('browser: environments per stage, rotate, offline list, silent fallbacks, kit screens',
  {skip: process.env.ISLAND_CSP_BROWSER !== '1', timeout: 1_500_000}, async () => {
  const shots = process.env.ALPINE_ENV_SHOTS ? path.resolve(process.env.ALPINE_ENV_SHOTS) : null; if (shots) await mkdir(shots, {recursive: true});
  const allowed = new Set([...manifest.core, ...manifest.shell, ...manifest.games.alpine, ...manifest.games.soccer, ...manifest.games.hoops]);
  const server = await serveIsland(), chromium = await islandChromium();
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const rel = url => { const u = new URL(url); const i = u.pathname.indexOf('/workout/island/'); return i < 0 ? null : decodeURIComponent(u.pathname.slice(i + '/workout/island/'.length)); };
  async function open(viewport, {query = '', abort = [], page: target = 'tools/perf-alpine.html'} = {}) {
    const context = await browser.newContext({viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1});
    const csp = await installIslandCspMonitor(context), p = await context.newPage(), errors = [], outside = [], requested = new Set();
    p.setDefaultTimeout(180000); await csp.attachPage(p);
    for (const pattern of abort) await p.route(pattern, route => route.fulfill({status: 404, body: 'missing'}));
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.origin !== new URL(server.url).origin) outside.push(u.href); const f = rel(r.url()); if (f) requested.add(f); });
    await p.goto(server.url + target + query, {waitUntil: 'load'});
    return {p, csp, errors, outside, requested, context, async close() { await csp.assertClean(); await context.close(); await csp.dispose(); }};
  }
  const loaded = p => p.waitForFunction(() => window.__perfSession?.snapshot.loaded || window.__perfSession?.snapshot.error, null, {timeout: 150000});
  const metrics = p => p.evaluate(() => window.__perfSession.snapshot.renderMetrics);
  const shot = async (p, name) => { if (shots) await p.screenshot({path: path.join(shots, name + '.png')}); };
  try {
    // 1. Each stage, both orientations: its own environment, no console errors, no outside requests, every file listed.
    for (const viewport of [{width: 844, height: 390}, {width: 390, height: 844}]) for (const stage of [1, 2, 3]) {
      const g = await open(viewport, {query: `?autostart=1&seconds=60&stage=${stage}`});
      try {
        await loaded(g.p); const m = await metrics(g.p), env = ENV_BY_STAGE[stage];
        assert.equal(m.environment?.id, env, `stage ${stage} uses ${env}`);
        assert.deepEqual(m.environment.backgrounds, [viewport.width > viewport.height ? 'landscape' : 'portrait'], 'only the current orientation is loaded');
        assert.equal(m.designAssets.environment ?? m.environment.id, env); assert.equal(m.background, viewport.width > viewport.height ? 'landscape' : 'portrait');
        assert.ok(m.environment.markers > 10 && m.environment.decalQuads > 0, JSON.stringify(m.environment));
        assert.equal(m.environment.towers > 0, env === 'night-floodlit'); assert.equal(m.environment.ribbons > 0, env === 'fog');
        await g.p.waitForFunction(() => window.__perfSession?.snapshot.phase === 'racing', null, {timeout: 60000}); await g.p.waitForTimeout(5000);
        await g.p.evaluate(() => document.querySelector('.perf-panel')?.classList.add('collapsed'));
        await shot(g.p, `stage${stage}-${env}-${viewport.width}x${viewport.height}`);
        assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
        for (const f of g.requested) if (/^(design|assets|vendor)\//.test(f)) assert.ok(allowed.has(f), `${f} was requested but is not in the download list`);
        for (const f of g.requested) if (f.startsWith(V5)) assert.ok(manifest.games.alpine.includes(f), f);
        const old = [...g.requested].filter(f => /environment\/backgrounds\/ski-mountains/.test(f)); assert.deepEqual(old, [], 'earlier backdrops are not downloaded with an environment');
      } finally { await g.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await g.close(); }
    }
    // 2. Rotating swaps the background (the old orientation is dropped).
    const rot = await open({width: 844, height: 390}, {query: '?autostart=1&seconds=60&stage=1'});
    try {
      await loaded(rot.p); await rot.p.waitForFunction(() => window.__perfSession?.snapshot.phase === 'racing', null, {timeout: 60000});
      await rot.p.setViewportSize({width: 390, height: 844});
      await rot.p.waitForFunction(() => window.__perfSession.snapshot.renderMetrics?.environment?.backgrounds.join() === 'portrait', null, {timeout: 60000});
      assert.deepEqual(rot.errors, []); assert.deepEqual(rot.outside, []);
    } finally { await rot.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await rot.close(); }
    // 3. env=off is the earlier look; a missing required asset falls back to it silently; a missing optional one only drops that layer.
    const off = await open({width: 844, height: 390}, {query: '?autostart=1&seconds=30&stage=2&env=off'});
    try { await loaded(off.p); const m = await metrics(off.p); assert.equal(m.environment ?? null, null); assert.equal(m.designAssets.loaded, true); assert.deepEqual(off.errors, []); await shot(off.p, 'stage2-before-844x390'); }
    finally { await off.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await off.close(); }
    const noFence = await open({width: 844, height: 390}, {query: '?autostart=1&seconds=30&stage=1', abort: ['**/alpine-v5/models/safety-fence-sunset.glb']});
    try { await loaded(noFence.p); const m = await metrics(noFence.p); assert.equal(m.environment ?? null, null, 'no environment without its fence'); assert.equal(m.designWorld, true); assert.deepEqual(noFence.errors, []); assert.deepEqual(noFence.outside, []); }
    finally { await noFence.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await noFence.close(); }
    const noJson = await open({width: 844, height: 390}, {query: '?autostart=1&seconds=30&stage=3', abort: ['**/alpine-v5/environments/night-floodlit.json']});
    try { await loaded(noJson.p); const m = await metrics(noJson.p); assert.equal(m.environment ?? null, null); assert.equal(m.designWorld, true); assert.deepEqual(noJson.errors, []); }
    finally { await noJson.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await noJson.close(); }
    const noFx = await open({width: 844, height: 390}, {query: '?autostart=1&seconds=30&stage=3', abort: ['**/alpine-v5/atlases/powder-spray.png', '**/alpine-v5/models/floodlight-tower.glb', '**/alpine-v5/decals/route-and-snow.png']});
    try {
      await loaded(noFx.p); const m = await metrics(noFx.p);
      assert.equal(m.environment.id, 'night-floodlit'); assert.ok(!m.environment.atlases.includes('powder-spray')); assert.equal(m.environment.towers, 0); assert.equal(m.environment.decalQuads, 0);
      assert.equal(m.designAssets.powder, true, 'the earlier powder remains the crash effect'); assert.deepEqual(noFx.errors, []);
    } finally { await noFx.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await noFx.close(); }
    // 4. Island menu, opening card, stage map and result screen use the kit (both orientations), under CSP, nothing external.
    for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
      const ui = await open(viewport, {query: '?dev=1', page: ''});
      try {
        await ui.p.waitForFunction(() => window.__island?.view.metrics().avatarLoaded, null, {timeout: 150000}); await ui.p.locator('[data-action=avatar-start]').tap();
        await ui.p.evaluate(() => { const e = window.__island.engine; e.skipTutorial(); e.tick = () => ({ok: true}); if (!e.state.instructionsSeen.includes('alpineRush')) e.state.instructionsSeen.push('alpineRush'); });
        const tag = `${viewport.width}x${viewport.height}`;
        await ui.p.evaluate(() => window.__island.ui.activityInterface.menu());
        await ui.p.waitForFunction(() => document.querySelectorAll('.adventure-game-card .ik-game-icon').length >= 9);
        await ui.p.waitForFunction(() => [...document.querySelectorAll('.adventure-game-card .ik-game-icon')].every(i => i.complete && i.naturalWidth > 0));
        assert.equal(await ui.p.locator('.adventure-game-card').count(), 9); await shot(ui.p, `menu-${tag}`);
        await ui.p.evaluate(() => window.__island.ui.activityInterface.gameHome('alpineRush'));
        await ui.p.waitForFunction(() => { const i = document.querySelector('.modal[data-game-home] .ik-intro'); return i?.complete && i.naturalWidth > 0; });
        assert.equal(await ui.p.locator('.modal[data-game-home] [data-action=game-play]').evaluate(n => n.classList.contains('ik-primary')), true); await shot(ui.p, `opening-${tag}`);
        await ui.p.evaluate(() => window.__island.ui.activityInterface.stages('alpineRush'));
        await ui.p.waitForSelector('.stage-map [data-action=stage-play] .ik-rating-inline');
        assert.equal(await ui.p.locator('.stage-map [data-action=stage-play]').first().getAttribute('aria-label') !== null, true);
        assert.equal(await ui.p.locator('.stage-map [data-action=stage-play] .ik-lock').count() >= 1, true, 'locked stages show the kit lock'); await shot(ui.p, `stages-${tag}`);
        await ui.p.evaluate(() => window.__island.ui.activityInterface.showResult('alpineRush', undefined, {outcome: 'win', stage: 1, score: 1200, money: 40, parts: 0, stars: 2}, undefined, undefined, {rank: 2, totalRiders: 6, elapsedMs: 83000, peakKmh: 91, trickScore: 600, coins: 12, coinTotal: 30}));
        await ui.p.waitForSelector('.ik-result .ik-rating'); assert.equal(await ui.p.locator('.ik-result .ik-rating').first().getAttribute('data-rating'), '2');
        assert.equal(await ui.p.locator('.ik-result .ik-rating').first().getAttribute('aria-label') !== null, true);
        await ui.p.waitForFunction(() => [...document.querySelectorAll('.ik-result img')].every(i => i.complete && i.naturalWidth > 0)); await shot(ui.p, `result-${tag}`);
        assert.ok(await ui.p.locator('[data-action=game-again]').isVisible()); assert.ok(await ui.p.locator('[data-action=game-exit]').isVisible());
        assert.deepEqual(ui.errors, []); assert.deepEqual(ui.outside, []);
        for (const f of ui.requested) if (f.startsWith(KIT) && !f.endsWith('ui-kit.css')) assert.ok(manifest.core.includes(f), `${f} is requested by the island UI but not in core`);
        assert.equal([...ui.requested].some(f => f.startsWith(KIT + 'verification/')), false);
      } finally { await ui.close(); }
    }
  } finally { await browser.close(); await server.close(); }
});
