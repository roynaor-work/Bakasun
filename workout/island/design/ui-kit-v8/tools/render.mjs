import assert from 'node:assert/strict';
import { mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { startBrowserSession } from './browser-runtime.mjs';
import { root } from './server.mjs';
import { SIZES, intersects } from '../runtime/layout.mjs';

const round = process.argv[2];
if (!/^\d{2}$/.test(round || '')) throw new Error('Usage: node tools/render.mjs 01');
const iterations = resolve(root, 'iterations');
const output = resolve(iterations, round);
const { server, url, browser } = await startBrowserSession();
const rows = [];
const errors = [];
const started = new Date().toISOString();
try {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({ deviceScaleFactor: 1, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const touch = async (type, touchPoints) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => Boolean(window.islandPreview?.controls.map));
    await page.evaluate(() => document.fonts.ready);
    const targets = await page.locator('[data-iu-target]').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { id: element.dataset.iuTarget, x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    const map = await page.evaluate(() => window.islandPreview.controls.map);
    for (const target of targets) {
      const expected = map.targets.find(value => value.id === target.id);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(expected[key] - target[key]) < 1.1, `${width}×${height} ${target.id}.${key} disagrees with model`);
      for (const other of targets.filter(value => value.id !== target.id)) assert.equal(intersects(target, other), false, `${target.id} overlaps ${other.id}`);
      assert.ok(target.width >= 48 && target.height >= 48, '48px minimum touch target');
    }
    const shot = name => page.screenshot({ path: resolve(output, `${width}x${height}-${name}.png`), type: 'png', animations: 'disabled' });
    await shot('play');
    await page.evaluate(() => window.islandPreview.setMap(true));
    await shot('map');
    await page.evaluate(() => window.islandPreview.setMap(false));
    const finger = { id: 1, x: map.joystick.x + map.joystick.width - 14, y: map.joystick.y + map.joystick.height - 14 };
    const primary = map.actions.find(target => target.id === 'primary');
    const actionFinger = { id: 2, x: primary.x + primary.width / 2, y: primary.y + primary.height / 2 };
    await touch('touchStart', [finger]);
    await touch('touchStart', [finger, actionFinger]);
    assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 1, 'active capture requires an active joystick');
    assert.equal(await page.locator('[data-iu-target="primary"][data-held]').count(), 1, 'active capture requires a held action');
    const rim = await page.locator('.iu-stick').boundingBox();
    const knob = await page.locator('.iu-stick__knob').boundingBox();
    assert.ok(rim.x + rim.width <= map.joystick.x + map.joystick.width + .05 && rim.y + rim.height <= map.joystick.y + map.joystick.height + .05, 'active floating rim escapes');
    assert.ok(knob.x + knob.width < width / 2, 'active knob crosses midpoint');
    await shot('active');
    await touch('touchEnd', [actionFinger]); await touch('touchEnd', []);
    await page.locator('[data-toast]:not([hidden])').waitFor();
    await shot('toast');
    await page.evaluate(() => {
      const stage = document.querySelector('.iu-stage');
      const landscape = stage.clientWidth > stage.clientHeight;
      stage.style.setProperty('--iu-safe-left', landscape ? '44px' : '0px');
      stage.style.setProperty('--iu-safe-right', landscape ? '0px' : '44px');
      stage.style.setProperty('--iu-safe-bottom', '21px');
      window.islandPreview.controls.refresh();
      document.querySelector('[data-toast]').hidden = true;
      window.islandPreview.setMap(true);
    });
    if (await page.evaluate(() => window.islandPreview.controls.map.stacked)) {
      assert.equal(await page.locator('.demo-location').isVisible(), false, 'stacked controls must not crowd decorative copy');
    }
    await shot('notch');
    await page.evaluate(() => {
      const stage = document.querySelector('.iu-stage');
      for (const side of ['left', 'right', 'bottom']) stage.style.setProperty(`--iu-safe-${side}`, '0px');
      window.islandPreview.controls.refresh(); window.islandPreview.setMap(false);
    });
    rows.push(`| ${width}×${height} | active + toast + notch | trusted multi-touch, rim contained, knob left | pass |`);
    for (const screen of ['start', 'end', 'pause']) {
      await page.evaluate(name => window.islandPreview.openScreen(name), screen);
      const dialog = page.locator('dialog[open]');
      const overflow = await dialog.evaluate(el => ({ width: el.scrollWidth > el.clientWidth + 1, height: el.scrollHeight > el.clientHeight + 1 }));
      assert.equal(overflow.width, false, 'modal has horizontal overflow');
      rows.push(`| ${width}×${height} | ${screen} | ${overflow.height ? 'vertical scroll' : 'fits'} | pass |`);
      await shot(screen);
      await dialog.locator('[data-close]').first().click();
    }
    rows.push(`| ${width}×${height} | play + map | ${targets.length} targets, no overlaps | pass |`);
    // The normal preview, including its navigation, is a separate responsive surface.
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.islandPreview?.controls.map));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'preview overflows horizontally');
    await shot('showcase');
    console.log(`Round ${round}: ${width}×${height}, 9 states rendered`);
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${url}/?screen=library`);
  await page.locator('#library-dialog[open]').waitFor();
  await page.screenshot({ path: resolve(output, 'components.png'), type: 'png' });
  // A compact overview for visual review, rendered by the browser from the
  // untouched captures. The temporary contact-sheet HTML is never written.
  await page.setViewportSize({ width: 1440, height: 900 });
  const overview = async (names, filename, viewportWidth) => {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    const sheets = SIZES.map(([w, h]) => `<section><h2>${w} × ${h}</h2><div>${names.map(name => `<figure><figcaption>${name}</figcaption><img src="${url}/iterations/${round}/${w}x${h}-${name}.png" width="220" height="${Math.round(220 * h / w)}"></figure>`).join('')}</div></section>`).join('');
    await page.setContent(`<html lang="en"><style>body{margin:0;padding:20px;background:#fffcf3;color:#173d45;font:14px sans-serif}h1{font-size:22px}h2{font-size:14px;margin:16px 0 6px}section>div{display:flex;gap:12px}figure{margin:0;width:220px}figcaption{font-size:11px;margin:0 0 4px}img{display:block;border:1px solid #b3c9be;border-radius:8px;width:220px;height:auto}</style><h1>Island interface · review ${round}</h1>${sheets}</html>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({ path: resolve(output, filename), type: 'png', fullPage: true });
  };
  await overview(['play', 'map', 'start', 'end', 'pause', 'showcase'], 'overview.png', 1440);
  await overview(['active', 'toast', 'notch'], 'behaviour-overview.png', 744);
  assert.deepEqual(errors, [], 'browser errors');
  const hash = createHash('sha256').update(await readFile(resolve(root, 'runtime/island-ui.css'))).digest('hex');
  const captureCount = (await readdir(output)).filter(name => name.endsWith('.png')).length;
  const report = `# Render round ${round}\n\nStarted: ${started}\nCompleted: ${new Date().toISOString()}\n\nCSS SHA-256: \`${hash}\`\n\nChromium: ${browser.version()}. Local resources only; DPR 1; touch enabled; reduced motion.\n\n| Viewport | Screen | Fit / geometry | Result |\n|---|---|---|---|\n${rows.join('\n')}\n\n${captureCount} PNG files: 46 direct captures and two compact overviews. Browser errors: 0.\n\nManual inspection and corrections are recorded in REVIEW.md and the root ITERATIONS.md.\n`;
  await writeFile(resolve(output, 'BROWSER.md'), report);
  // Only this task's numeric iteration directories are retained; never touch other files.
  const rounds = (await readdir(iterations)).filter(name => /^\d{2}$/.test(name)).sort();
  for (const old of rounds.slice(0, -2)) await rm(resolve(iterations, old), { recursive: true });
} finally { await browser.close(); await new Promise(done => server.close(done)); }
