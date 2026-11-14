// Usage: PLAYWRIGHT_MODULE=/path/to/playwright SHARP_MODULE=/path/to/sharp
//        CHROMIUM_PATH=/usr/bin/chromium node tools/check-preview.mjs
// Serves this package only. Requires no repository dependency installation.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json')));
const output = path.join(root, 'verification');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
const hash = b => createHash('sha256').update(b).digest('hex');
const checks = [];
const errors = [], externalRequests = [], badResponses = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(origin + '/') && !r.url().startsWith('data:')) externalRequests.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  await page.goto(origin + '/preview.html?clean=1');
  await page.evaluate(() => window.alienSpacePreview.ready);
  assert.deepEqual(await page.evaluate(() => [space.width, space.height]), [844, 390]);
  assert.equal(await page.locator('#error').isVisible(), false);
  const levelResults = [], sceneBuffers = [];
  for (const l of manifest.levels) {
    await page.evaluate(level => { window.alienSpacePreview.setLevel(level); window.alienSpacePreview.renderAt(0); }, l.level);
    const buffer = await page.locator('canvas').screenshot();
    levelResults.push({ level: l.level, theme: l.theme, sha256: hash(buffer) });
    if (l.variant === 1) sceneBuffers.push(buffer);
  }
  assert.equal(new Set(levelResults.map(r => r.sha256)).size, 30, '30 distinct rendered level configurations');
  checks.push('30 levels rendered at 844×390; 30 distinct pixel hashes');
  await sharp({ create: { width: 1688, height: 1170, channels: 3, background: '#02040c' } }).composite(sceneBuffers.map((input, i) => ({ input, left: i % 2 * 844, top: Math.floor(i / 2) * 390 }))).webp({ quality: 88 }).toFile(path.join(output, 'overview.webp'));
  await page.evaluate(() => { window.alienSpacePreview.setLevel(1); window.alienSpacePreview.renderAt(0); });
  const beforeMotion = hash(await page.locator('canvas').screenshot());
  await page.evaluate(() => window.alienSpacePreview.renderAt(20));
  assert.notEqual(hash(await page.locator('canvas').screenshot()), beforeMotion, 'animated parallax produces a different frame');
  checks.push('temporal parallax changes rendered pixels');
  await page.keyboard.press('h');
  assert.equal(await page.locator('#tools').isVisible(), true);
  await page.locator('#tools').click();
  await page.locator('#level').selectOption('16');
  assert.equal(await page.evaluate(() => window.alienSpacePreview.state.level), 16);
  for (const layer of ['far', 'mid', 'near']) {
    await page.locator(`[data-layer="${layer}"]`).uncheck();
    assert.equal(await page.evaluate(id => window.alienSpacePreview.state.layers[id], layer), false);
    await page.locator(`[data-layer="${layer}"]`).check();
  }
  await page.locator('#effects').uncheck();
  assert.equal(await page.evaluate(() => window.alienSpacePreview.state.effects), false);
  await page.locator('#effects').check();
  await page.locator('#shooting-star').click();
  assert.equal(await page.locator('#shooting-star').getAttribute('aria-pressed'), 'true');
  await page.locator('#shooting-star').click();
  await page.locator('#close').click();
  // Show the actual studio UI at the requested viewport size.
  await sharp(await page.screenshot()).webp({ quality: 87 }).toFile(path.join(output, 'preview-ui.webp'));
  checks.push('theme/stage picker, all layer toggles, effects toggle and shooting-star inspection operate');
  const frames = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('#tools').click();
    await page.locator('#explosion-frame').selectOption(String(i));
    await page.locator('#close').click();
    await page.keyboard.press('h');
    frames.push(await page.locator('canvas').screenshot());
    await page.keyboard.press('h');
  }
  assert.equal(new Set(frames.map(hash)).size, 4, 'four different explosion images are visible');
  const crops = await Promise.all(frames.map(b => sharp(b).extract({ left: 162, top: 40, width: 116, height: 116 }).png().toBuffer()));
  await sharp({ create: { width: 464, height: 116, channels: 3, background: '#02040c' } }).composite(crops.map((input, i) => ({ input, left: i * 116, top: 0 }))).webp({ quality: 92 }).toFile(path.join(output, 'explosion-frames.webp'));
  await page.locator('#tools').click();
  await page.locator('#explosion-frame').selectOption('auto');
  await page.locator('#close').click();
  const boundaries = await page.evaluate(() => [0, .099, .100, .239, .240, .439, .440, .719].map(window.alienSpacePreview.explosionFrameAt));
  assert.deepEqual(boundaries, [0, 0, 1, 1, 2, 2, 3, 3]);
  checks.push('all four explosion frames inspected through UI; exact 100/140/200/280ms playback boundaries');
  await page.locator('#tools').click();
  await page.locator('#pause').click(); // renderAt left the scene paused; resume it.
  await page.locator('#close').click();
  const t1 = await page.evaluate(() => window.alienSpacePreview.state.time);
  await page.waitForTimeout(220);
  assert(await page.evaluate(t => window.alienSpacePreview.state.time > t, t1));
  await page.locator('#tools').click();
  await page.locator('#pause').click();
  await page.locator('#close').click();
  const paused = await page.evaluate(() => window.alienSpacePreview.state.time);
  await page.mouse.move(800, 300);
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => window.alienSpacePreview.state.time), paused);
  checks.push('pause freezes the full timeline; resume advances it');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.alienSpacePreview.state.paused = false; window.alienSpacePreview.renderAt(3.3); });
  const reducedBefore = hash(await page.locator('canvas').screenshot());
  await page.waitForTimeout(240);
  await page.mouse.move(30, 30);
  assert.equal(hash(await page.locator('canvas').screenshot()), reducedBefore);
  // Omission of automatic effects is verified against the explicitly disabled scene.
  await page.evaluate(() => { window.alienSpacePreview.state.effects = false; window.alienSpacePreview.draw(); });
  assert.equal(hash(await page.locator('canvas').screenshot()), reducedBefore);
  checks.push('reduced motion freezes pixels and omits automatic explosions and shooting stars');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#tools').click();
  await page.locator('#close').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector').isVisible(), false);
  checks.push('390×844 layout has no horizontal overflow; dialog supports keyboard Escape');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(badResponses, []);
  checks.push('no JavaScript errors, external requests or failed HTTP responses');
  const broken = await context.newPage();
  await broken.route('**/themes/purple-nebula/mid.png', route => route.abort());
  await broken.goto(origin + '/preview.html');
  await broken.locator('#error').waitFor({ state: 'visible' });
  assert.match(await broken.locator('#error').textContent(), /purple-nebula\/mid\.png/);
  assert.equal(await broken.evaluate(() => window.alienSpacePreview.state.ready), false);
  await broken.close();
  checks.push('missing PNG produces a visible asset-specific error');
  const result = { passed: true, browser: await browser.version(), viewport: [844, 390], checks, consoleErrors: errors, externalRequests, badResponses, levelRenders: levelResults, fileUrl: 'Direct file URL was blocked by environment browser policy; verified via a local HTTP server.' };
  await writeFile(path.join(output, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks, levelRenders: levelResults.length, browser: result.browser }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
