#!/usr/bin/env node
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM=/usr/bin/chromium node scripts/verify_preview.mjs
// Serves only this package; tests use the same simulation transitions as the UI.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'verification');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'preview.html';
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root)) throw Error('Outside package');
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [], errors = [], external = [], failedRequests = [], screenshots = [];
const record = (name, details = {}) => { checks.push({ name, passed: true, ...details }); };
const state = page => page.evaluate(() => window.fireChasePreview.getState());
const advance = (page, seconds) => page.evaluate(s => window.fireChasePreview.advance(s), seconds);
async function shot(page, name) {
  const file = `${name}.png`; await page.screenshot({ path: path.join(output, file) }); screenshots.push(file);
}
async function open(options = {}, monitor = true) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, ...options });
  await context.addInitScript(() => {
    const Native = window.AudioContext || window.webkitAudioContext;
    if (!Native) return;
    window.__fireChaseAudioContexts = [];
    window.AudioContext = new Proxy(Native, { construct(Target, args) {
      const audio = Reflect.construct(Target, args), decode = audio.decodeAudioData.bind(audio);
      audio.__qaDecoded = 0;
      audio.decodeAudioData = (...input) => decode(...input).then(buffer => { audio.__qaDecoded++; return buffer; });
      window.__fireChaseAudioContexts.push(audio); return audio;
    } });
  });
  await context.route('**/*', async route => {
    if (/^https?:/.test(route.request().url()) && !route.request().url().startsWith(base + '/')) {
      external.push(route.request().url()); await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  if (monitor) {
    page.on('pageerror', e => errors.push(String(e)));
    page.on('requestfailed', r => failedRequests.push({ url: r.url().replace(base, ''), failure: r.failure()?.errorText }));
  }
  await page.goto(base + '/preview.html');
  await page.waitForFunction(() => window.fireChasePreview?.getState().loaded, { timeout: 30000 });
  return { context, page };
}
async function advanceTo(page, phase) {
  for (let i = 0; i < 160; i++) {
    if ((await state(page)).phase === phase) return state(page);
    await advance(page, .25);
  }
  throw Error(`Phase ${phase} not reached; got ${(await state(page)).phase}`);
}

let result;
try {
  await mkdir(output, { recursive: true });
  const { context, page } = await open();
  assert.equal((await state(page)).phase, 'intro');
  assert.equal((await state(page)).muted, true);
  assert.equal(await page.locator('#asset-select option').count(), 14);
  await shot(page, '844x390-intro'); record('Loaded all 14 GLBs at 844x390, muted until user gesture');

  await page.click('#sound');
  await page.waitForFunction(() => window.__fireChaseAudioContexts?.[0]?.__qaDecoded === 9);
  assert.equal(await page.evaluate(() => window.__fireChaseAudioContexts[0].state), 'running');
  record('User gesture enables sound and all nine local WAVs decode successfully');

  await page.click('#start');
  const x0 = (await state(page)).x;
  await page.keyboard.down('ArrowLeft'); await advance(page, .8); await page.keyboard.up('ArrowLeft');
  assert.ok((await state(page)).x < x0 - .5); record('Keyboard steering changes truck position');
  await page.click('#pause');
  await page.waitForFunction(() => window.__fireChaseAudioContexts[0].state === 'suspended');
  const paused = await state(page); await advance(page, 4);
  assert.equal((await state(page)).time, paused.time); assert.equal((await state(page)).z, paused.z);
  await shot(page, '844x390-paused'); record('Pause freezes mission timer and vehicle and suspends the AudioContext');
  await page.click('#resume');
  await page.waitForFunction(() => window.__fireChaseAudioContexts[0].state === 'running');
  await advance(page, 6); await shot(page, '844x390-chase');
  const arrival = await advanceTo(page, 'arrival'); await shot(page, '844x390-arrival');
  const entry = await advanceTo(page, 'entry'); await advance(page, 1.3); await shot(page, '844x390-entry');
  const extinguish = await advanceTo(page, 'extinguish'); await shot(page, '844x390-extinguish');
  assert.ok(arrival.time < 75 && entry.time < arrival.time && extinguish.time < entry.time);
  record('Continuous chase → arrival → doorway entry → firefighting with one decreasing clock',
    { arrivalTime: arrival.time, entryTime: entry.time, firefightingTime: extinguish.time, hits: extinguish.hits });
  const target = (await state(page)).targets[0];
  await page.mouse.move(target.x, target.y); await page.mouse.down(); await advance(page, 2.2); await page.mouse.up();
  assert.ok((await state(page)).heat[0] <= .02); record('Pointer aim and held water extinguish the selected fire');
  await page.keyboard.down('Space'); await advance(page, 8); await page.keyboard.up('Space');
  assert.equal((await state(page)).phase, 'success'); await shot(page, '844x390-success'); record('All three fires extinguish and produce success');
  await page.click('#retry'); await advance(page, 80);
  assert.equal((await state(page)).phase, 'failed'); assert.equal((await state(page)).time, 0);
  await shot(page, '844x390-timeout'); record('Timeout and retry follow real mission transitions');

  await page.reload(); await page.waitForFunction(() => window.fireChasePreview?.getState().loaded);
  await page.click('#catalogue-open');
  const ids = await page.evaluate(() => window.fireChasePreview.assetIds);
  for (const id of ids) {
    await page.selectOption('#asset-select', id);
    await page.waitForTimeout(80);
    assert.ok((await state(page)).render.triangles > 0, id);
    await page.screenshot({ path: path.join(output, `asset-${id}.jpg`), type: 'jpeg', quality: 85 });
    screenshots.push(`asset-${id}.jpg`);
    if (id === 'fire-truck') {
      assert.equal(await page.locator('#clip-select option').count(), 4);
      for (const clip of ['LadderDeploy', 'WheelRoll', 'HoseAim', 'BeaconFlash']) {
        await page.selectOption('#clip-select', clip); await page.click('#animate-asset');
        await page.waitForTimeout(80);
      }
    } else if (id === 'car-hatch') await page.click('#animate-asset');
    if (id === 'house-burning') {
      for (const level of ['Low', 'Medium', 'High']) {
        await page.selectOption('#flame-select', level);
        await shot(page, `844x390-flames-${level.toLowerCase()}`);
      }
    }
  }
  await page.check('#overhead'); await shot(page, '844x390-overhead');
  record('Catalogue renders all 14 assets, truck/car animation controls and three flame states');
  await page.click('#catalogue-close');
  assert.equal((await state(page)).catalogue, false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  assert.equal(overflow, false); record('No viewport overflow at requested 844x390');
  await context.close();

  const touch = await open({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await touch.page.locator('#start').tap();
  const beforeTouch = (await state(touch.page)).x;
  const left = await touch.page.locator('#left').boundingBox();
  const cdp = await touch.context.newCDPSession(touch.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x + left.width / 2, y: left.y + left.height / 2 }] });
  await advance(touch.page, .8);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(touch.page)).x < beforeTouch - .5);
  await advanceTo(touch.page, 'extinguish');
  const fire = (await state(touch.page)).targets[1];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x, y: fire.y }] });
  await advance(touch.page, 2.25);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(touch.page)).heat[1] <= .02);
  await shot(touch.page, '844x390-touch-dpr2');
  record('Real touch dispatch: steering, aimed water and release at DPR2');
  await touch.context.close();

  const reduced = await open({ reducedMotion: 'reduce' });
  assert.ok(await reduced.page.locator('body').evaluate(el => el.classList.contains('low-motion')));
  await reduced.page.click('#start'); await advanceTo(reduced.page, 'extinguish');
  await shot(reduced.page, '844x390-reduced-motion'); record('Reduced-motion mode loads and completes the same entry transitions');
  await reduced.context.close();

  const fallbackContext = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.route('**/models/fire-truck.glb', route => route.abort());
  await fallbackPage.goto(base + '/preview.html');
  await fallbackPage.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await fallbackPage.locator('#start').isEnabled(), false);
  await shot(fallbackPage, '844x390-load-error'); record('Missing GLB shows recoverable load error and disables mission start');
  await fallbackContext.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(failedRequests, []);
  record('No JavaScript errors, failed normal-load requests or external requests');
  const sourceHashes = {};
  for (const file of ['preview.html', 'preview.css', 'preview.mjs', ...ids.map(id => `models/${id}.glb`)]) {
    sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  }
  result = { passed: true, generatedAtUTC: new Date().toISOString(), viewport: [844, 390],
    browser: await browser.version(), renderer: 'Chromium/SwiftShader on CPU; not a physical-phone performance measurement',
    checks, errors, externalRequests: external, failedRequests, screenshots, sourceHashes };
} catch (error) {
  result = { passed: false, generatedAtUTC: new Date().toISOString(), checks, error: String(error.stack), errors, externalRequests: external, failedRequests, screenshots };
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ passed: result.passed, checks: checks.length, error: result.error }));
