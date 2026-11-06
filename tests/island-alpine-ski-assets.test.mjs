import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

/** (These checks pin ?alpineV7=0: the skier3 asset is the fallback now that alpine-v7 is the default rider, see island-alpine-v7.test.mjs.)
 * Alpine Rush with the GPT/Codex assets (PR 238): design/skier3 (18-bone skier, five embedded clips) and
 * design/alpine-world (12 world pieces). Node part: file integrity. Browser part (ISLAND_CSP_BROWSER=1):
 * every GLB decodes under the shipped CSP, the clips exist and drive the game's state machine, the game
 * starts with the new assets without console errors or external requests, and each asset failing is silent. */
const root = new URL('../workout/island/design/', import.meta.url);
const glbJson = buffer => { const n = buffer.readUInt32LE(12); assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'glTF magic'); return JSON.parse(buffer.subarray(20, 20 + n).toString('utf8')); };
const WORLD = ['fir-a', 'fir-b', 'fir-c', 'rock-small', 'rock-large', 'snow-sign', 'slalom-gate', 'start-gate', 'finish-gate', 'mogul', 'ice-wall', 'snow-powder'];
const CLIPS = ['glide', 'crouch', 'boost', 'fall', 'get_up'];

test('skier3 GLB: 18 canonical bones, five embedded clips, Draco, matches its manifest', async () => {
  const buffer = await readFile(new URL('skier3/skier.glb', root)), manifest = JSON.parse(await readFile(new URL('skier3/manifest.json', root), 'utf8'));
  const json = glbJson(buffer);
  assert.deepEqual(json.animations.map(a => a.name).sort(), [...CLIPS].sort());
  assert.equal(json.skins[0].joints.length, 18);
  assert.ok(json.extensionsRequired?.includes('KHR_draco_mesh_compression'));
  assert.ok(buffer.length <= 1.5e6);
  const rig = JSON.parse(await readFile(new URL('skier3/rig.json', root), 'utf8'));
  assert.deepEqual(json.skins[0].joints.map(j => json.nodes[j].name), rig.joints.map(j => j.name), 'skin joint order is the rig contract');
  assert.ok(JSON.stringify(manifest).includes(createHash('sha256').update(buffer).digest('hex')), 'manifest sha256');
});

test('alpine-world: all 12 GLBs exist, are Draco, small, and match the manifest hashes', async () => {
  const manifest = JSON.parse(await readFile(new URL('alpine-world/manifest.json', root), 'utf8'));
  assert.deepEqual(manifest.models.map(m => m.id).sort(), [...WORLD].sort());
  for (const m of manifest.models) {
    const buffer = await readFile(new URL('alpine-world/' + m.file, root));
    assert.equal(createHash('sha256').update(buffer).digest('hex'), m.sha256, m.id);
    assert.ok(buffer.length <= 1.5e6, m.id);
    assert.ok(glbJson(buffer).extensionsRequired?.includes('KHR_draco_mesh_compression'), m.id);
  }
  assert.equal(glbJson(await readFile(new URL('alpine-world/models/snow-powder.glb', root))).animations[0].name, 'snow_puff');
});

test('the game wires the pack with silent fallbacks (source contract)', async () => {
  const world = await readFile(new URL('../workout/island/minigames/alpine-design-world.mjs', import.meta.url), 'utf8');
  for (const id of ['rock-small', 'rock-large', 'snow-sign', 'mogul', 'ice-wall', 'start-gate', 'finish-gate']) assert.ok(world.includes(`'${id}'`), id);
  assert.ok(world.includes('snow-powder.glb'));
  const character = await readFile(new URL('../workout/island/minigames/alpine-character.mjs', import.meta.url), 'utf8');
  assert.match(character, /design\/skier3\/skier\.glb/);
  assert.match(character, /LEGACY_URL/);
});

test('browser: GLBs load under CSP, clips drive the state machine, game starts, every asset fails silently',
  {skip: process.env.ISLAND_CSP_BROWSER !== '1', timeout: 600000}, async () => {
  const server = await serveIsland(), chromium = await islandChromium();
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  async function page(viewport, {abort = [], query = 'autostart=1&seconds=12&alpineV7=0', start = true} = {}) {
    const context = await browser.newContext({viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1});
    const csp = await installIslandCspMonitor(context), p = await context.newPage(), errors = [], outside = [];
    p.setDefaultTimeout(180000); await csp.attachPage(p);
    for (const pattern of abort) await p.route(pattern, route => route.abort());
    p.on('pageerror', e => errors.push(e.message));
    // Console errors for requests this test aborts on purpose are expected; anything else fails.
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.origin !== new URL(server.url).origin) outside.push(u.href); });
    if (start) {
      await p.goto(server.url + 'tools/perf-alpine.html?' + query, {waitUntil: 'load'});
      await p.waitForFunction(() => window.__perfSession?.snapshot.loaded || window.__perfSession?.snapshot.error, null, {timeout: 120000});
    } else await p.goto(server.url + 'tools/csp-fixture-skier.html').catch(() => {});
    return {p, csp, errors, outside, context, async close() { await csp.assertClean(); await context.close(); await csp.dispose(); }};
  }
  try {
    // 1. Every asset decodes through the static CSP worker; clips drive the real state machine.
    const a = await page({width: 844, height: 390});
    try {
      const out = await a.p.evaluate(async () => {
        const [{AlpineDracoLoader}, {GLTFLoader}, {bakeEmbeddedSkier, createAlpineMotionPlayer}] = await Promise.all([import('../minigames/alpine-draco.mjs'), import('../vendor/GLTFLoader.js'), import('../minigames/alpine-character.mjs')]);
        const draco = new AlpineDracoLoader().setDecoderPath(new URL('../vendor/draco/', location.href).href).setDecoderConfig({type: 'wasm'}).setWorkerLimit(1);
        const loader = new GLTFLoader().setDRACOLoader(draco), report = {models: {}};
        const ids = ['fir-a', 'fir-b', 'fir-c', 'rock-small', 'rock-large', 'snow-sign', 'slalom-gate', 'start-gate', 'finish-gate', 'mogul', 'ice-wall', 'snow-powder'];
        for (const id of ids) { const g = await loader.loadAsync(new URL(`../design/alpine-world/models/${id}.glb`, location.href).href); let tris = 0; g.scene.traverse(n => { if (n.isMesh) tris += (n.geometry.index?.count || n.geometry.attributes.position.count) / 3; }); report.models[id] = {tris, anims: g.animations.map(x => x.name)}; }
        const gltf = await loader.loadAsync(new URL('../design/skier3/skier.glb', location.href).href);
        report.clips = gltf.animations.map(x => x.name).sort();
        const baked = bakeEmbeddedSkier(gltf); report.baked = Object.keys(baked.clips).sort(); report.names = baked.names;
        const bones = baked.names.map(n => gltf.scene.getObjectByName(n)), player = createAlpineMotionPlayer(baked, bones), seen = [];
        const step = (frame, ctx, n = 1) => { for (let i = 0; i < n; i++) { time += 1 / 60; player.update(frame, {time, dt: 1 / 60, phase: 'racing', speedKmh: 30, ...ctx}); } seen.push(player.metrics().state); };
        let time = 0;
        step({s: 0, lean: 0}, {}, 20); step({s: 1, lean: .6, boosting: true}, {}, 20);
        step({s: 2, lean: 0, boosting: false}, {}, 80);
        step({s: 3, airborne: true}, {}, 20); step({s: 4, airborne: false, landing: true}, {}, 5); step({s: 5}, {}, 60);
        step({s: 6, crashed: true}, {}, 5); step({s: 6, crashed: true}, {}, 60); step({s: 6, crashed: false}, {}, 20); step({s: 6}, {}, 200);
        report.states = seen;
        let bad = 0; for (const b of bones) if (!isFinite(b.position.x + b.quaternion.w)) bad++; report.badBones = bad;
        draco.dispose(); return report;
      });
      assert.deepEqual(out.clips, CLIPS.slice().sort());
      assert.equal(out.names.length, 18);
      for (const state of ['fall', 'recover', 'pole_push', 'tuck', 'air', 'land', 'glide']) assert.ok(out.baked.includes(state) || state === 'tuck', state);
      assert.ok(out.baked.includes('tuck') && out.baked.includes('celebrate') && out.baked.includes('getup'));
      assert.equal(out.states[1], 'pole_push', 'boost starts the pole push');
      assert.equal(out.states[3], 'air', 'takeoff'); assert.equal(out.states[5], 'glide', 'back to gliding after landing');
      assert.equal(out.states[6], 'fall', 'a crash plays the fall'); assert.equal(out.states[7], 'recover', 'then the get-up');
      assert.notEqual(out.states[9], 'fall'); assert.equal(out.badBones, 0);
      assert.equal(out.models['snow-powder'].anims[0], 'snow_puff');
      for (const [id, m] of Object.entries(out.models)) assert.ok(m.tris > 0 && m.tris < 5000, id);
      await a.csp.assertClean();
    } finally { await a.close(); }
    // 2. The real game, both phone orientations: new skier + new world, clean console, no outside requests.
    for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
      const g = await page(viewport);
      try {
        const info = await g.p.evaluate(() => window.__perfSession.snapshot.renderMetrics);
        assert.equal(info.character.mode, 'skier3', 'new skier is used'); assert.equal(info.character.fallbackReason, null);
        assert.equal(info.designWorld, true);
        assert.ok(info.pack.rockVariants === 2, JSON.stringify(info.pack));
        assert.ok(info.designAssets.pack.length === 7 && info.designAssets.powder, 'every pack model loaded');
        assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
        await g.p.waitForFunction(() => ['countdown', 'racing'].includes(window.__perfSession?.snapshot.phase), null, {timeout: 30000});
      } finally { await g.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await g.close(); }
    }
    // 3. Silent fallbacks: skier3 missing -> earlier skier; one world piece missing -> game still starts.
    const noSkier = await page({width: 844, height: 390}, {abort: ['**/design/skier3/skier.glb']});
    try {
      const info = await noSkier.p.evaluate(() => window.__perfSession.snapshot.renderMetrics);
      assert.equal(info.character.mode, 'design-skier'); assert.match(info.character.fallbackReason, /./); assert.deepEqual(noSkier.errors, []);
    } finally { await noSkier.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await noSkier.close(); }
    const noWorld = await page({width: 844, height: 390}, {abort: ['**/alpine-world/models/rock-large.glb', '**/alpine-world/models/snow-powder.glb', '**/alpine-world/models/ice-wall.glb']});
    try {
      const info = await noWorld.p.evaluate(() => window.__perfSession.snapshot.renderMetrics);
      assert.equal(info.designWorld, true); assert.equal(info.pack.rockVariants, 1); assert.equal(info.designAssets.powder, false);
      assert.deepEqual(noWorld.errors, []);
    } finally { await noWorld.p.evaluate(() => window.__perfSession?.dispose()).catch(() => {}); await noWorld.close(); }
  } finally { await browser.close(); await server.close(); }
});
