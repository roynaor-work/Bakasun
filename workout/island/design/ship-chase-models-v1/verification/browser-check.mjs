// Original browser verification, CC0-1.0; dependencies stay outside this package.
// node verification/browser-check.mjs --modules /absolute/path/to/tooling
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, '..');
const repo = resolve(packageDir, '../../../..');
const modules = process.argv[process.argv.indexOf('--modules') + 1];
assert(process.argv.includes('--modules') && modules, 'pass --modules /absolute/tooling');
const requireTool = createRequire(resolve(modules, 'package.json'));
const { chromium } = requireTool('playwright');
const expected = ['armored-boss', 'cone', 'pickup', 'player-ship', 'police-car', 'roadblock', 'sports-car'];
const measured = JSON.parse(await readFile(resolve(here, 'asset-results.json'), 'utf8'));
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webp': 'image/webp' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; worker-src 'none'; base-uri 'none'";
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(repo, '.' + pathname);
    assert(file.startsWith(repo + sep), 'local file traversal');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Security-Policy': csp });
    response.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/workout/island/design/ship-chase-models-v1/preview.html`;
const errors = [], requests = [], httpFailures = [];
let browser;
const report = { allPassed: false, csp, results: [], errors, httpFailures };

function webp(png, output) {
  const result = spawnSync('python3', ['-c', 'import sys,io;from PIL import Image;Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB").save(sys.argv[1],"WEBP",quality=86,method=6)', output], { input: png });
  assert.equal(result.status, 0, result.stderr.toString());
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  report.renderer = 'Chromium WebGL / SwiftShader; no physical-device performance claim';
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) httpFailures.push({ url: response.url(), status: response.status() }); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.shipChasePreview?.ready || window.shipChasePreview?.errors?.length, { timeout: 30_000 });
  const initial = await page.evaluate(() => {
    const api = window.shipChasePreview;
    return { ready: api.ready, errors: api.errors, assets: api.assets.map(a => ({ id: a.id, triangles: a.triangles, bytes: a.bytes, dimensions: a.dimensions })), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(initial.ready, JSON.stringify(initial));
  assert.deepEqual(initial.errors, []);
  assert.equal(initial.overflow, false, 'desktop has no horizontal page overflow');
  assert.deepEqual(initial.assets.map(a => a.id).sort(), expected);
  for (const asset of initial.assets) {
    const actual = measured.assets.find(a => a.id === asset.id);
    assert.equal(asset.triangles, actual.triangles, asset.id + ' loaded triangle count');
    assert.equal(asset.bytes, actual.bytes, asset.id + ' loaded byte count');
    for (let axis = 0; axis < 3; axis++) assert(Math.abs(asset.dimensions[axis] - actual.dimensionsM[axis]) < .001, asset.id + ' decoded dimensions');
  }
  report.results.push({ check: 'all-seven-load', viewport: [1440, 1100], ...initial });

  const wasm = await page.evaluate(async () => {
    try {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return { blocked: false };
    } catch (error) {
      return { blocked: true, error: String(error) };
    }
  });
  assert(wasm.blocked && /content security|unsafe-eval|Wasm code generation disallowed/i.test(wasm.error), 'CSP actually blocks a valid minimal WebAssembly module');
  report.results.push({ check: 'wasm-denied', ...wasm });

  // Read real scene nodes and their rendered geometry, not parallel bookkeeping.
  const animation = await page.evaluate(() => {
    const api = window.shipChasePreview;
    api.setTime(0);
    const scene = api.scene;
    if (!scene) throw new Error('scene inspection API missing');
    const groups = api.assets.map(a => ({ id: a.id, object: a.object || a.root || a.scene || a.model }));
    function find(id) {
      if (api.models?.get(id)?.model) return api.models.get(id).model;
      const group = groups.find(a => a.id === id);
      if (group?.object) return group.object;
      const exact = scene.getObjectByName(id);
      if (exact) return exact;
      throw new Error('model inspection API missing: ' + id);
    }
    function state() {
      scene.updateMatrixWorld(true);
      const nodes = [];
      for (const { id } of groups) {
        const model = find(id);
        const names = id === 'player-ship' ? ['Barrel_L', 'Barrel_R', 'Muzzle_L', 'Muzzle_R'] : ['armored-boss', 'pickup', 'police-car', 'sports-car'].includes(id) ? ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] : [];
        for (const name of names) {
          const node = model.getObjectByName(name);
          if (!node) throw new Error(id + ': missing ' + name);
          let sample = null, radius = -1;
          node.traverse(child => {
            const positions = child.geometry?.attributes?.position;
            if (!positions) return;
            for (let i = 0; i < positions.count; i++) {
              const local = node.position.clone().set(positions.getX(i), positions.getY(i), positions.getZ(i));
              child.localToWorld(local);
              const parentPoint = node.worldToLocal(local.clone());
              const r = name.startsWith('Wheel') ? parentPoint.y ** 2 + parentPoint.z ** 2 : parentPoint.x ** 2 + parentPoint.y ** 2;
              if (r > radius) { radius = r; sample = local.toArray(); }
            }
          });
          nodes.push({ id, name, rotation: node.rotation.toArray().slice(0, 3), quaternion: node.quaternion.toArray(), position: node.getWorldPosition(node.position.clone()).toArray(), sample, radius });
        }
      }
      return nodes;
    }
    const before = state();
    api.setTime(.137);
    const after = state();
    api.setTime(0);
    const lights = [];
    scene.traverse(node => { if (node.isLight) lights.push({ type: node.type, parent: node.parent?.type }); });
    return { before, after, lights, render: api.renderer ? { calls: api.renderer.info.render.calls, triangles: api.renderer.info.render.triangles } : null };
  });
  const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
  assert(animation.lights.length > 0, 'one shared scene light rig exists');
  for (const before of animation.before) {
    const after = animation.after.find(a => a.id === before.id && a.name === before.name);
    if (before.name.startsWith('Muzzle')) assert(distance(before.position, after.position) < .00001, before.name + ' firing axis stays fixed');
    else {
      assert(before.sample && distance(before.sample, after.sample) > .0001, `${before.id}/${before.name}: visible mesh rotates`);
      const index = before.name.startsWith('Wheel') ? 0 : 2;
      assert(Math.abs(before.rotation[index] - after.rotation[index]) > .01, `${before.name}: correct rotation axis`);
      for (const other of [0, 1, 2].filter(i => i !== index)) assert(Math.abs(before.rotation[other] - after.rotation[other]) < .00001, `${before.name}: other axes stable`);
    }
  }
  report.results.push({ check: 'real-node-animation', ...animation });

  // Each individual asset receives a focused, rendered view as well as the full gallery.
  for (const id of expected) {
    const state = await page.evaluate(id => {
      const api = window.shipChasePreview;
      api.select(id);
      api.setTime(0);
      return { id, ready: api.ready, errors: api.errors, selected: api.selection, render: api.renderer ? { calls: api.renderer.info.render.calls, triangles: api.renderer.info.render.triangles } : null };
    }, id);
    assert(state.ready && state.errors.length === 0, id + ' renders in focus');
    assert.equal(state.selected, id, id + ' focus selected');
    assert(state.render?.triangles > 0 && state.render?.calls > 0, id + ' render submitted');
    const modelTriangles = measured.assets.find(asset => asset.id === id).triangles;
    assert(state.render.triangles >= modelTriangles && state.render.triangles < modelTriangles + 500, id + ' selected model geometry reaches renderer');
    report.results.push({ check: 'individual-render', ...state });
    if (['player-ship', 'police-car'].includes(id)) webp(await page.locator('canvas').screenshot(), resolve(here, `detail-${id}.webp`));
  }
  await page.evaluate(() => { window.shipChasePreview.select(null); window.shipChasePreview.setTime(0); });
  await mkdir(here, { recursive: true });
  webp(await page.screenshot({ fullPage: true, animations: 'disabled' }), resolve(here, 'overview.webp'));

  // Selector names are part of the preview's small review interface.
  await page.locator('#animate').click();
  const pause = await page.evaluate(() => window.shipChasePreview.animationsEnabled);
  assert.equal(pause, false, 'pause button');
  const pauseClock = await page.evaluate(async () => {
    const before = window.shipChasePreview.time;
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    return { before, after: window.shipChasePreview.time };
  });
  assert.equal(pauseClock.after, pauseClock.before, 'paused model time remains fixed across frames');
  await page.locator('#animate').click();
  const play = await page.evaluate(() => window.shipChasePreview.animationsEnabled);
  assert.equal(play, true, 'resume button');
  const playClock = await page.evaluate(async () => {
    const before = window.shipChasePreview.time;
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    return { before, after: window.shipChasePreview.time };
  });
  assert(playClock.after > playClock.before, 'resume advances real model time across frames');
  report.results.push({ check: 'pause-resume', pause, play, pauseClock, playClock });

  await page.locator('#files .inspect').nth(2).click();
  assert.equal(await page.evaluate(() => window.shipChasePreview.selection), 'sports-car', 'file-table focus button');
  await page.locator('#overview').click();
  assert.equal(await page.evaluate(() => window.shipChasePreview.selection), null, 'overview button');
  report.results.push({ check: 'focus-controls', focused: 'sports-car', overview: true });

  await page.evaluate(() => window.shipChasePreview.setTime(0));
  const canvas = page.locator('canvas');
  const beforeOrbit = await canvas.screenshot();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * .45, rect.y + rect.height * .45);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .64, rect.y + rect.height * .52, { steps: 10 });
  await page.mouse.up();
  const afterOrbit = await canvas.screenshot();
  assert(!beforeOrbit.equals(afterOrbit), 'pointer orbit changes the view');
  await page.locator('#reset').click();
  await page.evaluate(() => window.shipChasePreview.setTime(0));
  const afterReset = await canvas.screenshot();
  assert(beforeOrbit.equals(afterReset), 'reset restores the default view exactly');
  report.results.push({ check: 'orbit-reset', orbitChanged: true, resetRestored: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.shipChasePreview.select(null); window.shipChasePreview.setTime(0); });
  const mobile = await page.evaluate(() => ({ ready: window.shipChasePreview.ready, overflow: document.documentElement.scrollWidth > innerWidth, assets: window.shipChasePreview.assets.length, width: innerWidth, height: innerHeight }));
  assert(mobile.ready && mobile.assets === 7 && !mobile.overflow, 'mobile fits without horizontal overflow');
  webp(await page.screenshot({ fullPage: true, animations: 'disabled' }), resolve(here, 'mobile.webp'));
  report.results.push({ check: 'mobile', ...mobile });

  for (const id of expected) assert(requests.some(request => request.endsWith(`/runtime/${id}.glb`)), id + ' fetched');
  report.externalRequests = [...new Set(requests.filter(request => !request.startsWith(origin + '/') && !request.startsWith('data:') && !request.startsWith('blob:')))];
  report.decoderRequests = [...new Set(requests.filter(request => /draco|meshopt|\.wasm(?:\?|$)/i.test(request)))];
  report.loadedGLBs = [...new Set(requests.filter(request => request.endsWith('.glb')).map(request => request.replace(origin, '')))];
  assert.deepEqual(report.externalRequests, [], 'no external dependencies');
  assert.deepEqual(report.decoderRequests, [], 'no decoder or wasm requests');
  assert.deepEqual(errors, [], 'no browser exceptions or failed requests');
  assert.deepEqual(httpFailures, [], 'no HTTP failures');
  report.allPassed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(here, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
console.log(`PASS: seven GLBs, scene animation, no-WASM CSP, orbit/reset, desktop/mobile; Chromium ${report.browser}`);
