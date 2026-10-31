// Actual file:// smoke test. It deliberately does not enable file-access bypasses.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : null;
assert(option('--modules'), '--modules must name an external tools directory');
assert(option('--outputs'), '--outputs must name a screenshots directory outside this package');
const require = createRequire(path.resolve(option('--modules'), 'package.json'));
const {chromium} = require('playwright'), sharp = require('sharp');
const outputs = path.resolve(option('--outputs'));
await fs.mkdir(outputs, {recursive: true}); await fs.mkdir(path.join(root, 'previews'), {recursive: true});
const models = JSON.parse(await fs.readFile(path.join(root, 'models.json'), 'utf8')).models;
const url = pathToFileURL(path.join(root, 'preview.html')).href;
const html = await fs.readFile(path.join(root, 'preview.html'), 'utf8');
const previewSha256 = createHash('sha256').update(html).digest('hex');
const scriptSha256 = createHash('sha256').update(html.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('hex');
const chrome = option('--browser') || process.env.CHROMIUM_PATH;
const browser = await chromium.launch({headless: true, ...(chrome ? {executablePath: chrome} : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']});
const records = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const drain = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let failure = null;
try {
  for (const [width, height] of [[844, 390], [390, 844]]) {
    const record = {viewport: {width, height}, fileProtocol: true, offlineContext: true, httpRequests: [],
      pageErrors: [], consoleErrors: [], cspViolations: [], webglErrors: [], modes: [], browserClosed: false};
    records.push(record);
    const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, isMobile: true, hasTouch: true, offline: true});
    let page;
    try {
      await context.route(/^https?:\/\//, async route => { record.httpRequests.push(route.request().url()); await route.abort(); });
      await context.exposeBinding('__trackCspReport', (_, value) => record.cspViolations.push(value));
      await context.addInitScript(() => {
        addEventListener('securitypolicyviolation', event => window.__trackCspReport({directive: event.effectiveDirective,
          blockedURI: event.blockedURI, disposition: event.disposition, line: event.lineNumber}));
      });
      page = await context.newPage(); page.setDefaultTimeout(30000);
      page.on('pageerror', error => record.pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
      page.on('request', request => {
        if (/^https?:/.test(request.url()) && !record.httpRequests.includes(request.url())) record.httpRequests.push(request.url());
      });
      await page.goto(url, {waitUntil: 'load', timeout: 60000});
      await page.waitForFunction(() => window.__trackPreview?.ready, null, {timeout: 60000});
      await drain(page);
      assert.equal(hash(Buffer.from(await page.locator('script').textContent())), scriptSha256, 'Browser loaded a different preview script');
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
      assert.equal(new URL(page.url()).protocol, 'file:');
      const canvas = page.locator('#world');
      record.embeddedColors = await page.evaluate(() => Object.fromEntries(Object.entries(ASSETS).map(([name, asset]) => {
        let minimum = 255, maximum = 0;
        for (const primitive of asset.primitives) for (const value of atob(primitive.colors)) {
          const n = value.charCodeAt(0); minimum = Math.min(minimum, n); maximum = Math.max(maximum, n);
        }
        return [name, {minimum, maximum}];
      })));
      for (const [name, colors] of Object.entries(record.embeddedColors))
        assert(colors.maximum > 100 && colors.maximum > colors.minimum, `${name}: black or invariant decoded palette`);
      const firstPng = await page.screenshot({path: path.join(outputs, `track-${width}x${height}.png`)});
      await sharp(firstPng).webp({quality: 80}).toFile(path.join(root, 'previews', `track-${width}x${height}.webp`));
      console.log(`FIRST_SCREENSHOT ${path.join(outputs, `track-${width}x${height}.png`)}`);
      const stats = await sharp(await canvas.screenshot()).stats();
      assert(stats.channels.slice(0, 3).some(channel => channel.stdev > 12), 'Canvas lacks rendered detail');
      await page.locator('#pause').click();
      assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true');
      await drain(page);
      const paused = hash(await canvas.screenshot());
      await page.waitForTimeout(350); await drain(page);
      assert.equal(hash(await canvas.screenshot()), paused, 'Pause did not freeze the visual animation');
      record.pauseFreezesCanvas = true;

      const bounds = await canvas.boundingBox();
      const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: cx, y: cy, id: 1}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: cx + 70, y: cy, id: 1}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await drain(page);
      const rotated = hash(await canvas.screenshot());
      assert.notEqual(rotated, paused, 'Trusted touch drag did not rotate the scene');
      record.trustedTouchDragChangesCanvas = true;
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: cx - 30, y: cy, id: 1}, {x: cx + 30, y: cy, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: cx - 65, y: cy, id: 1}, {x: cx + 65, y: cy, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await drain(page);
      assert.notEqual(hash(await canvas.screenshot()), rotated, 'Trusted touch pinch did not zoom the scene');
      record.trustedTouchPinchChangesCanvas = true;
      await cdp.detach();

      for (const mode of ['route', 'pipe', 'props', 'materials']) {
        await page.locator(`[data-mode="${mode}"]`).click(); await drain(page);
        const evidence = await page.evaluate(() => {
          const gl = document.querySelector('#world').getContext('webgl'), errors = [];
          for (let i = 0; i < 16; i++) { const error = gl.getError(); if (!error) break; errors.push(error); }
          return {metadata: window.__trackPreview, errors, overflow: document.documentElement.scrollWidth > innerWidth + 1,
            swatches: [...document.querySelectorAll('.tile')].map(tile => ({background: getComputedStyle(tile).backgroundImage, repeat: getComputedStyle(tile).backgroundRepeat, size: getComputedStyle(tile).backgroundSize}))};
        });
        assert.equal(evidence.metadata.mode, mode); assert.equal(evidence.metadata.networkRequired, false);
        assert(evidence.metadata.triangles > 0, `${mode}: no rendered triangles`);
        assert.equal(evidence.overflow, false, `${mode}: horizontal page overflow`);
        record.webglErrors.push(...evidence.errors);
        assert.equal(evidence.errors.length, 0, `${mode}: WebGL errors ${evidence.errors}`);
        for (const model of models) assert.equal(evidence.metadata.sourceHashes[model.id], model.sha256, `${model.id}: embedded source is stale`);
        assert.equal(evidence.metadata.textureNames.filter(name => /normal/.test(name)).length, 0, 'Preview claims optional normal rendering');
        if (mode === 'materials') {
          assert.equal(await page.locator('#materials').isVisible(), true); assert.equal(evidence.swatches.length, 8);
          assert.equal(evidence.swatches.filter(swatch => swatch.background.startsWith('url("data:image/webp;base64,') && swatch.size === '50% 50%' && swatch.repeat === 'repeat').length, 4);
          assert.equal(evidence.swatches.filter(swatch => swatch.background.startsWith('url("data:image/png;base64,')).length, 4);
          assert.equal(evidence.swatches.filter(swatch => swatch.size === '100% 100%').length, 2);
          record.materialCards = {surfaceRepeats: 4, transparentDecalsAndAtlases: 4};
        }
        record.modes.push({mode, triangles: evidence.metadata.triangles, sourceHashesMatch: true, noHorizontalOverflow: true, webglErrors: evidence.errors});
        const modePng = await page.screenshot({path: path.join(outputs, `${mode}-${width}x${height}.png`), fullPage: mode === 'materials'});
        if (mode === 'pipe') await sharp(modePng).webp({quality: 80}).toFile(path.join(root, 'previews', `pipe-${width}x${height}.webp`));
      }
      await page.locator('[data-mode="route"]').click(); await drain(page);
      const frozen = hash(await canvas.screenshot());
      await page.locator('#pause').click();
      assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'false');
      let resumed = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        await page.waitForTimeout(300); await drain(page);
        if (hash(await canvas.screenshot()) !== frozen) { resumed = true; break; }
      }
      assert(resumed, 'Resume did not restart visual animation');
      record.resumeChangesCanvas = true;
      record.screenshots = [`previews/track-${width}x${height}.webp`, `previews/pipe-${width}x${height}.webp`];
      record.allPassed = true;
    } catch (error) {
      record.failure = error.message; record.allPassed = false;
      if (page && !page.isClosed()) await page.screenshot({path: path.join(outputs, `failure-${width}x${height}.png`)}).catch(() => {});
      throw error;
    } finally {
      if (page && !page.isClosed()) await page.evaluate(() => Promise.resolve()).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 25));
      await context.close();
      for (const key of ['httpRequests', 'pageErrors', 'consoleErrors', 'cspViolations', 'webglErrors'])
        assert.equal(record[key].length, 0, `${width}x${height}: ${key} not empty`);
      record.contextClosed = true;
    }
  }
} catch (error) { failure = error; }
finally {
  await browser.close();
  for (const record of records) record.browserClosed = true;
  const sourceChanged = hash(await fs.readFile(path.join(root, 'preview.html'))) !== previewSha256;
  if (sourceChanged && !failure) failure = Error('Preview changed during validation; rerun required');
  const result = {allPassed: !failure && records.length === 2 && records.every(record => record.allPassed),
    protocol: 'file://', offline: true, externalRequestsAllowed: false, fileAccessBypassFlags: false, previewSha256, embeddedScriptSha256: scriptSha256, sourceChangedDuringValidation: sourceChanged,
    browser: 'Chromium/SwiftShader, phone viewport and touch emulation', physicalPhone: false,
    limitations: 'Offline asset preview only; no production game loading/CSP or FPS claim.', records};
  if (failure) result.failure = failure.message;
  await fs.writeFile(path.join(root, 'browser-validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({allPassed: result.allPassed, cases: records.length, failure: failure?.message}));
}
if (failure) throw failure;
