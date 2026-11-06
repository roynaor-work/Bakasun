/* Continuous real-browser gesture/orientation soak. No idle waits or external IO. */
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { startBrowserSession } from './browser-runtime.mjs';
import { root } from './server.mjs';
import { SIZES, intersects } from '../runtime/layout.mjs';

const seconds = Number(process.argv[2] || 120);
if (!Number.isFinite(seconds) || seconds < 1) throw new Error('Duration must be a positive number of seconds');
const notchProfile = process.argv.includes('--notch');
const sizes = notchProfile ? [[320, 568], [360, 640], [390, 844], [412, 915], [844, 390]] : SIZES;
const reportName = notchProfile ? 'ENDURANCE-NOTCH.md' : 'ENDURANCE.md';
const started = Date.now();
const { server, url, browser } = await startBrowserSession();
const counts = { gestures: 0, cancel: 0, rotate: 0, dialogs: 0, keyboard: 0, geometry: 0, loads: 0 };
let lastReport = 0;
let cycle = 0;
let outcome = 'RUNNING';
let failure = '';
const sourceHash = async () => {
  const hash = createHash('sha256');
  for (const name of ['runtime/island-ui.css', 'runtime/layout.mjs', 'runtime/controls.mjs', 'runtime/dialog.mjs']) hash.update(await readFile(resolve(root, name)));
  return hash.digest('hex');
};
const initialHash = await sourceHash();
async function report() {
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const currentHash = await sourceHash();
  await writeFile(resolve(root, reportName), `# Continuous browser endurance\n\nStatus: **${outcome}**\n\nProfile: ${notchProfile ? 'narrow screens, asymmetric safe areas before every gesture, DPR 3' : 'five required sizes, DPR 1'}\nStarted: ${new Date(started).toISOString()}\nLast checkpoint: ${new Date().toISOString()}\nElapsed: ${elapsed} seconds; requested: ${seconds} seconds.\n\nChromium ${browser.version()}; trusted CDP multi-touch, actual keyboard, DOM geometry assertions; no external requests.\n\n| Scenario | Completed |\n|---|---:|\n${Object.entries(counts).map(([name, value]) => `| ${name} | ${value} |`).join('\n')}\n\nCompleted cycles: ${cycle}.\n\nInitial runtime SHA-256: \`${initialHash}\`\nCurrent runtime SHA-256: \`${currentHash}\`\n\nEach cycle performs a fresh gesture/cancellation/orientation/dialog/keyboard scenario and verifies the current DOM bounds. The page reloads every 30 cycles to exercise lifecycle cleanup and load current runtime files. Changes during the soak are covered after the next reload; final acceptance checks run separately.\n${failure ? `\nFailure: ${failure}\n` : ''}`);
  console.log(`ENDURANCE ${outcome}: ${elapsed}s; ${cycle} cycles; ${counts.gestures} gestures; ${counts.rotate} rotations; ${counts.dialogs} dialogs; ${counts.geometry} maps`);
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: notchProfile ? 3 : 1 });
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const point = async id => {
    const box = await page.locator(`[data-iu-target="${id}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const finger = (id, p) => ({ id, ...p, radiusX: 4, radiusY: 4 });
  while (Date.now() - started < seconds * 1000) {
    const size = sizes[Math.floor(cycle / 6) % sizes.length];
    if (cycle % 30 === 0) {
      await page.goto(url + '/?capture=1');
      await page.waitForFunction(() => Boolean(window.islandPreview?.controls.map));
      await page.evaluate(async () => {
        window.islandPreview.controls.destroy();
        const { mountControls } = await import('./runtime/controls.mjs');
        window.soakLog = [];
        const remember = value => { window.soakLog.push(value); if (window.soakLog.length > 100) window.soakLog.shift(); };
        window.soakControls = mountControls(document.querySelector('.iu-stage'), {
          onMove: value => remember({ type: 'move', ...value }),
          onAction: value => remember({ type: 'action', ...value }),
        });
      });
      counts.loads++;
    }
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    if (notchProfile) {
      await page.evaluate(n => {
        const stage = document.querySelector('.iu-stage');
        stage.style.direction = n % 2 ? 'rtl' : 'ltr';
        stage.style.setProperty('--iu-safe-left', n % 2 ? '0px' : '44px');
        stage.style.setProperty('--iu-safe-right', n % 2 ? '44px' : '0px');
        stage.style.setProperty('--iu-safe-top', n % 3 ? '0px' : '44px');
        stage.style.setProperty('--iu-safe-bottom', '21px');
        window.soakControls.refresh();
      }, cycle);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await page.evaluate(() => { window.soakLog.length = 0; });
    const left = await point('joystick'); const right = await point('primary');
    const shifted = { x: left.x + 30, y: left.y - 10 };
    const mode = cycle % 6;
    if (mode < 3) {
      await touch('touchStart', [finger(1, left), finger(2, right)]);
      await touch('touchMove', [finger(1, shifted), finger(2, right)]);
      // Hold long enough to cover multiple rendering frames, as a child might.
      await page.waitForTimeout(180 + (cycle % 7) * 35);
      assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 1);
      assert.equal(await page.locator('[data-iu-target="primary"][data-held]').count(), 1);
      if (mode === 0) {
        await touch('touchEnd', [finger(2, right)]);
        assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 1);
        await touch('touchEnd', []);
        const phases = await page.evaluate(() => window.soakLog.filter(e => e.type === 'action').map(e => e.phase));
        assert.deepEqual(phases, ['start', 'release']);
      } else if (mode === 1) {
        await touch('touchCancel', []);
        const phases = await page.evaluate(() => window.soakLog.filter(e => e.type === 'action').map(e => e.phase));
        assert.deepEqual(phases, ['start', 'cancel']); counts.cancel++;
      } else {
        await page.setViewportSize({ width: size[1], height: size[0] });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await touch('touchEnd', []);
        const phases = await page.evaluate(() => window.soakLog.filter(e => e.type === 'action').map(e => e.phase));
        assert.deepEqual(phases, ['start', 'cancel']); counts.rotate++;
      }
      assert.equal(await page.locator('[data-held], .iu-stick-zone[data-active]').count(), 0);
      counts.gestures++;
    } else if (mode === 3) {
      await page.evaluate(() => {
        window.soakControls.setEnabled(false); window.islandPreview.openScreen('start');
      });
      for (let tab = 0; tab < 3; tab++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog[open]')), true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      await page.evaluate(() => window.soakControls.setEnabled(true)); counts.dialogs++;
    } else if (mode === 4) {
      await page.locator('[data-iu-target="joystick"]').focus();
      await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowDown');
      const vector = await page.evaluate(() => window.soakLog.at(-1));
      assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-9);
      await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowDown');
      await page.locator('[data-iu-target="primary"]').focus();
      await page.keyboard.press('Enter');
      const phases = await page.evaluate(() => window.soakLog.filter(e => e.type === 'action').map(e => e.phase));
      assert.deepEqual(phases, ['start', 'release']); counts.keyboard++;
    } else {
      await page.evaluate(n => {
        const stage = document.querySelector('.iu-stage'); stage.style.direction = n % 2 ? 'rtl' : 'ltr';
        stage.style.setProperty('--iu-safe-left', n % 2 ? '44px' : '0px');
        stage.style.setProperty('--iu-safe-right', n % 2 ? '0px' : '44px');
        stage.style.setProperty('--iu-safe-bottom', '21px'); window.soakControls.refresh();
      }, Math.floor(cycle / 6));
    }
    const targets = await page.locator('[data-iu-target]').evaluateAll(els => els.map(el => {
      const b = el.getBoundingClientRect(); return { id: el.dataset.iuTarget, x: b.x, y: b.y, width: b.width, height: b.height };
    }));
    for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) {
      assert.equal(intersects(targets[a], targets[b]), false, `cycle ${cycle}: ${targets[a].id}/${targets[b].id} overlap`);
    }
    assert.deepEqual(errors, []); counts.geometry++; cycle++;
    if (Date.now() - lastReport > 30000) { await report(); lastReport = Date.now(); }
  }
  outcome = 'PASS'; await report();
} catch (error) {
  outcome = 'FAIL'; failure = error.stack; await report(); throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
