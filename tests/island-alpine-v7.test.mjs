import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveIsland, islandChromium, installIslandCspMonitor} from './helpers/island-browser.mjs';
import {V7_FILES, V7_TRIANGLES, V7_DEFAULTS, v7Enabled, v7Config, wantedLod, pickAvailable, lodPlan, levelUseful, v7Path} from '../workout/island/minigames/alpine-v7.mjs';

/** Alpine Rush with the alpine-v7 rider (assets/alpine-v7, from the GPT/Codex package design/alpine-v7): the kill flag and the
 * config switch, the LOD policy (which level for whom, which level is fetched at all), the runtime bundle (only the files that
 * are loaded, same bytes as the package, on the offline list) and, in a browser, the silent fallback to skier3. */
const island = new URL('../workout/island/', import.meta.url);
const read = path => readFile(new URL(path, island), 'utf8');
const glbJson = buffer => { const n = buffer.readUInt32LE(12); assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'glTF magic'); return JSON.parse(buffer.subarray(20, 20 + n).toString('utf8')); };
const config = JSON.parse(await read('data/config.json')), cfg = config.minigames.alpineRush.assets.v7;
const offline = JSON.parse(await read('offline-manifest.json'));
const params = query => new URLSearchParams(query);

test('v7 switches: config default on, ?alpineV7=0 forces skier3, ?alpineV7=1 forces v7, no config block means off', () => {
  assert.equal(cfg.enabled, true);
  assert.equal(v7Enabled(cfg, params('')), true);
  assert.equal(v7Enabled(cfg, params('alpineV7=0')), false);
  assert.equal(v7Enabled({...cfg, enabled: false}, params('')), false);
  assert.equal(v7Enabled({...cfg, enabled: false}, params('alpineV7=1')), true);
  assert.equal(v7Enabled(null, params('')), false, 'a config without assets.v7 never asks for it');
  assert.equal(v7Enabled(null, params('alpineV7=1')), false);
  assert.equal(v7Enabled(cfg, undefined), true, 'no query string at all (node, workers)');
  // a partial block still has every field the loader needs
  const merged = v7Config({enabled: true});
  assert.equal(merged.base, V7_DEFAULTS.base); assert.equal(merged.lod.farDistance, 22); assert.equal(merged.lod.player.high, 0);
  assert.equal(v7Config({lod: {rival: {high: 2}}}).lod.rival.high, 2); assert.equal(v7Config({lod: {rival: {high: 2}}}).lod.rival.low, 2);
});

test('LOD policy: the player gets the best level the tier allows, rivals are capped lower and drop to LOD2 by distance', () => {
  const c = v7Config(cfg);
  assert.equal(wantedLod({role: 'player', quality: 'high', distance: 0, config: c}), 0);
  assert.equal(wantedLod({role: 'player', quality: 'high', distance: 80, config: c}), 0, 'the player never leaves its level by distance');
  assert.equal(wantedLod({role: 'player', quality: 'low', config: c}), 1);
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 5, config: c}), 1, 'a rival is never LOD0: that is the 20K-triangle level');
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 21.9, config: c}), 1);
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 22.1, config: c}), 2);
  assert.equal(wantedLod({role: 'rival', quality: 'low', distance: 3, config: c}), 2);
  // hysteresis: a rival hovering at the boundary does not flicker between levels
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 21, current: 2, config: c}), 2);
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 19.9, current: 2, config: c}), 1);
  assert.equal(wantedLod({role: 'rival', quality: 'high', distance: 21, current: 1, config: c}), 1);
  // levels that are not loaded: the nearest loaded level at the wanted detail or coarser, else the finest below
  assert.equal(pickAvailable(1, new Set([0, 1])), 1);
  assert.equal(pickAvailable(2, new Set([0, 1])), 1);
  assert.equal(pickAvailable(1, new Set([0])), 0);
  assert.equal(pickAvailable(0, new Set([1, 2])), 1);
  assert.equal(pickAvailable(1, new Set([0, 2])), 2);
  assert.equal(pickAvailable(0, new Set()), null);
});

test('LOD plan: only levels a tier can use are fetched, LOD2 on demand at high and LOD0 never at low', () => {
  const c = v7Config(cfg);
  const high = lodPlan('high', c), low = lodPlan('low', c);
  assert.deepEqual(high.now, [0, 1]); assert.deepEqual(high.later, [2]);
  assert.deepEqual(low.now, [1, 2]); assert.deepEqual(low.later, []);
  assert.ok(![...low.now, ...low.later].includes(0), 'the low tier never downloads the 20K level');
  assert.equal(levelUseful(0, 'player', 'high', c), true);
  assert.equal(levelUseful(1, 'player', 'high', c), false);
  assert.equal(levelUseful(1, 'rival', 'high', c), true); assert.equal(levelUseful(2, 'rival', 'high', c), true);
  assert.equal(levelUseful(0, 'rival', 'high', c), false, 'no rival ever shows LOD0');
  assert.equal(levelUseful(0, 'player', 'low', c), false);
});

test('v7 bundle: exactly the loaded files, same bytes as the package, Draco, 18 bones, 14 clips, under the cap, nothing from the preview', async () => {
  const dir = new URL('assets/alpine-v7/', island), files = [];
  const walk = async url => { for (const e of await readdir(url, {withFileTypes: true})) e.isDirectory() ? await walk(new URL(e.name + '/', url)) : files.push(new URL(e.name, url).pathname.replace(dir.pathname, '')); };
  await walk(dir);
  assert.deepEqual(files.sort(), Object.values(V7_FILES).map(f => 'characters/' + f).sort(), 'only the three LOD files of the one character the game loads');
  const manifest = JSON.parse(await read('design/alpine-v7/characters/manifest.json')), rig = JSON.parse(await read('design/alpine-v7/characters/rig.json'));
  let total = 0;
  for (const level of [0, 1, 2]) {
    const path = v7Path(level, v7Config(cfg)), buffer = await readFile(new URL(path, island)), source = await readFile(new URL('design/alpine-v7/characters/' + V7_FILES[level], island));
    assert.equal(createHash('sha256').update(buffer).digest('hex'), createHash('sha256').update(source).digest('hex'), path + ' is byte-identical to the package');
    const asset = manifest.assets.find(a => a.file === 'characters/' + V7_FILES[level]);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.sha256, path + ' matches the package manifest');
    assert.equal(asset.triangles, V7_TRIANGLES[level], 'triangle count used in metrics is the audited one');
    assert.ok(buffer.length <= 1.5e6, path); total += buffer.length;
    const json = glbJson(buffer);
    assert.ok(json.extensionsRequired?.includes('KHR_draco_mesh_compression'), path + ' Draco');
    assert.equal(json.animations.length, 14); assert.equal(json.skins[0].joints.length, 18);
    assert.deepEqual(json.skins[0].joints.map(j => json.nodes[j].name), rig.joints.map(j => j.name), 'canonical skin order');
    for (const clip of ['glide', 'crouch', 'accelerate', 'fall_roll', 'get_up', 'celebrate']) assert.ok(json.animations.some(a => a.name === clip), clip);
    assert.ok(json.images.every(i => i.bufferView !== undefined), 'atlas is embedded: no separate texture request');
  }
  assert.ok(total < 2.5e6, 'bundle weight ' + total);
});

test('the game never reads the package folder for v7 and keeps the earlier assets as the fallback', async () => {
  for (const file of ['alpine-v7.mjs', 'alpine-character.mjs', 'alpine-view.mjs', 'alpine-session.mjs']) {
    const code = (await read('minigames/' + file)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/design\/alpine-v7/.test(code), file + ' does not reference design/alpine-v7');
  }
  assert.ok(!/design\/alpine-v7/.test(JSON.stringify(cfg)), 'config does not point into the package');
  assert.ok(cfg.base.startsWith('assets/alpine-v7/'));
  const character = await read('minigames/alpine-character.mjs');
  assert.match(character, /design\/skier3\/skier\.glb/); assert.match(character, /LEGACY_URL/);
  assert.match(character, /loadV7Characters/); assert.match(character, /v7Enabled\(/);
  const view = await read('minigames/alpine-view.mjs');
  assert.match(view, /setDistance/); assert.match(view, /gltf\?\.setQuality/);
  assert.match(await read('minigames/alpine-session.mjs'), /v7: balance\.assets\?\.v7/);
});

test('offline: the three rider files are on the alpine list, the module is in the shell, nothing from the package folder is listed', () => {
  for (const level of [0, 1, 2]) assert.ok(offline.games.alpine.includes(v7Path(level, v7Config(cfg))), V7_FILES[level]);
  assert.ok(offline.shell.includes('minigames/alpine-v7.mjs'));
  for (const list of [offline.shell, ...Object.values(offline.games), offline.core]) assert.ok(!list.some(p => p.includes('design/alpine-v7/')), 'the package folder is not cached');
  assert.ok(offline.games.alpine.includes('design/skier3/skier.glb'), 'the fallback rider stays offline too');
  assert.ok(!offline.games.soccer.concat(offline.games.hoops).some(p => p.includes('assets/alpine-v7')), 'v7 files only under games.alpine');
});

test('browser: v7 is the default, the LODs follow the tier, the kill flag and every failure fall back silently',
  {skip: process.env.ISLAND_CSP_BROWSER !== '1', timeout: 900000}, async () => {
  const server = await serveIsland(), chromium = await islandChromium();
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  async function page(viewport, {abort = [], query = 'autostart=1&seconds=12'} = {}) {
    const context = await browser.newContext({viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1});
    const csp = await installIslandCspMonitor(context), p = await context.newPage(), errors = [], outside = [], requested = [];
    p.setDefaultTimeout(180000); await csp.attachPage(p);
    for (const pattern of abort) await p.route(pattern, route => route.abort());
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('request', r => { const u = new URL(r.url()); requested.push(u.pathname); if (u.protocol.startsWith('http') && u.origin !== new URL(server.url).origin) outside.push(u.href); });
    await p.goto(server.url + 'tools/perf-alpine.html?' + query, {waitUntil: 'load'});
    await p.waitForFunction(() => window.__perfSession?.snapshot.loaded || window.__perfSession?.snapshot.error, null, {timeout: 120000});
    const character = () => p.evaluate(() => window.__perfSession.debug.view().metrics().character);
    return {p, errors, outside, requested, character, async close() { await p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await csp.assertClean(); await context.close(); await csp.dispose(); }};
  }
  const lod = (requested, level) => requested.some(path => path.endsWith('/assets/alpine-v7/characters/' + V7_FILES[level]));
  try {
    for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
      // 1. Default: the player on LOD0, every rival on LOD1, LOD2 not downloaded before a rival needs it, skier3 not downloaded at all.
      const g = await page(viewport);
      try {
        const c = await g.character();
        assert.equal(c.mode, 'v7'); assert.equal(c.fallbackReason, null); assert.equal(c.bones, 18); assert.equal(c.clips, 10);
        assert.equal(c.lods.player, 0); for (let i = 1; i <= 5; i++) assert.equal(c.lods['rival-' + i], 1, 'rival-' + i);
        assert.deepEqual(c.loaded, [0, 1]); assert.equal(c.trianglesPerRider, 19916);
        assert.ok(lod(g.requested, 0) && lod(g.requested, 1)); assert.ok(!lod(g.requested, 2), 'LOD2 is not fetched while no rider needs it');
        assert.ok(!g.requested.some(p => p.endsWith('/design/skier3/skier.glb')), 'skier3 is not downloaded when v7 loads');
        assert.ok(!g.requested.some(p => p.includes('/design/alpine-v7/')), 'nothing is read from the package folder');
        const info = await g.p.evaluate(() => window.__perfSession.snapshot.renderMetrics);
        assert.ok(info.character.mode === 'v7');
        const riders = await g.p.evaluate(() => window.__perfSession.debug.view().audit().categories.riders);
        // player 2 body meshes + 2 poles + shadow, rival 1 + 2 poles + shadow = 25; the nine source primitives unmerged would be 66
        assert.ok(riders.objects <= 26, 'draw calls per rider are merged: ' + JSON.stringify(riders));
        assert.ok(riders.tris < 24918 * 3, 'six riders cost less than three skier3 riders: ' + riders.tris);
        assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
      } finally { await g.close(); }
    }
    // 2. A quality drop in the middle of a session: the player moves to LOD1, rivals to LOD2 (fetched then), the pose survives.
    const q = await page({width: 844, height: 390});
    try {
      const before = await q.p.evaluate(() => window.__perfSession.debug.view().metrics().motion);
      await q.p.evaluate(() => window.__perfSession.debug.view().setQuality('low'));
      await q.p.waitForFunction(() => window.__perfSession.debug.view().metrics().character.loaded.includes(2), null, {timeout: 60000});
      await q.p.waitForTimeout(1500);
      const c = await q.character();
      assert.equal(c.lods.player, 1); for (let i = 1; i <= 5; i++) assert.equal(c.lods['rival-' + i], 2);
      assert.ok(lod(q.requested, 2), 'LOD2 fetched on demand'); assert.deepEqual(c.pending, []);
      const after = await q.p.evaluate(() => window.__perfSession.debug.view().metrics().motion);
      assert.ok(after.sampledFrames >= before.sampledFrames, 'the motion player kept running on the new skeleton');
      assert.deepEqual(q.errors, []);
    } finally { await q.close(); }
    // 3. Started on the low tier: LOD1 for the player and LOD2 for the rivals, LOD0 never downloaded.
    const low = await page({width: 844, height: 390}, {query: 'autostart=1&seconds=12&quality=low'});
    try {
      const c = await low.character();
      assert.equal(c.mode, 'v7'); assert.deepEqual(c.loaded, [1, 2]); assert.equal(c.lods.player, 1); assert.equal(c.lods['rival-1'], 2);
      assert.ok(!lod(low.requested, 0), 'the 20K-triangle level is never downloaded on the low tier');
      assert.deepEqual(low.errors, []);
    } finally { await low.close(); }
    // 4. Kill flag: skier3 exactly as before, no v7 request.
    const off = await page({width: 844, height: 390}, {query: 'autostart=1&seconds=12&alpineV7=0'});
    try {
      const c = await off.character();
      assert.equal(c.mode, 'skier3'); assert.equal(c.fallbackReason, null); assert.equal(c.trianglesPerRider, 24918);
      assert.ok(!off.requested.some(p => p.includes('/assets/alpine-v7/')), 'the flag prevents every v7 request'); assert.deepEqual(off.errors, []);
    } finally { await off.close(); }
    // 5. Silent fallbacks: LOD1 missing (needed now) -> skier3 with a reason; all v7 missing -> skier3; skier3 also missing -> the earlier skier.
    const noLod1 = await page({width: 844, height: 390}, {abort: ['**/assets/alpine-v7/characters/ski-male-lod1.glb']});
    try {
      const c = await noLod1.character();
      assert.equal(c.mode, 'skier3'); assert.match(c.fallbackReason, /./); assert.deepEqual(noLod1.errors, []);
    } finally { await noLod1.close(); }
    const noV7 = await page({width: 844, height: 390}, {abort: ['**/assets/alpine-v7/**']});
    try { assert.equal((await noV7.character()).mode, 'skier3'); assert.deepEqual(noV7.errors, []); } finally { await noV7.close(); }
    const none = await page({width: 844, height: 390}, {abort: ['**/assets/alpine-v7/**', '**/design/skier3/skier.glb']});
    try { assert.equal((await none.character()).mode, 'design-skier'); assert.deepEqual(none.errors, []); } finally { await none.close(); }
    // 6. LOD2 (deferred) failing after the race started changes nothing visible: rivals keep LOD1, no error.
    const late = await page({width: 844, height: 390}, {abort: ['**/assets/alpine-v7/characters/ski-male-lod2.glb']});
    try {
      await late.p.evaluate(() => window.__perfSession.debug.view().setQuality('low'));
      await late.p.waitForFunction(() => window.__perfSession.debug.view().metrics().character.deferredFailure, null, {timeout: 60000});
      const c = await late.character();
      assert.equal(c.mode, 'v7'); assert.ok(c.lods['rival-1'] <= 1 || c.lods['rival-1'] === 1); assert.deepEqual(c.loaded, [0, 1]); assert.deepEqual(late.errors, []);
    } finally { await late.close(); }
  } finally { await browser.close(); await server.close(); }
});
