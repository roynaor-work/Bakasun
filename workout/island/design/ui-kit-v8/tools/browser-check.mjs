import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startBrowserSession } from './browser-runtime.mjs';
import { root } from './server.mjs';
import { SIZES, intersects } from '../runtime/layout.mjs';
import { integrationFixture } from './integration-fixture.mjs';

export async function runBrowserChecks({ save = true } = {}) {
  const { server, url, browser } = await startBrowserSession();
  const checks = [];
  const errors = [];
  const blocked = [];
  const passed = message => { checks.push(message); console.log(`PASS ${message}`); };
  try {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === url) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const load = async (width = 390, height = 844, suffix = '?capture=1') => {
      await page.setViewportSize({ width, height });
      await page.goto(url + '/' + suffix);
      await page.waitForFunction(() => Boolean(window.islandPreview?.controls.map));
      await page.evaluate(() => new Promise(requestAnimationFrame));
    };
    const targets = () => page.locator('[data-iu-target]').evaluateAll(els => els.map(el => {
      const box = el.getBoundingClientRect();
      const stage = el.closest('.iu-stage');
      const host = stage.getBoundingClientRect();
      return { id: el.dataset.iuTarget, x: box.x - host.x - stage.clientLeft,
        y: box.y - host.y - stage.clientTop, width: box.width, height: box.height };
    }));
    for (const [width, height] of SIZES) {
      await load(width, height);
      for (const direction of ['rtl', 'ltr']) {
        for (const safe of [
          { top: 0, right: 0, bottom: 0, left: 0 },
          { top: 44, right: 0, bottom: 34, left: 0 },
          { top: 0, right: 0, bottom: 21, left: 44 },
          { top: 0, right: 44, bottom: 21, left: 0 },
        ]) {
          await page.evaluate(({ direction, safe }) => {
            const stage = document.querySelector('.iu-stage'); stage.style.direction = direction;
            for (const [key, value] of Object.entries(safe)) stage.style.setProperty(`--iu-safe-${key}`, `${value}px`);
            window.islandPreview.controls.refresh();
          }, { direction, safe });
          const map = await page.evaluate(() => window.islandPreview.controls.map);
          const actual = await targets();
          for (const [index, target] of actual.entries()) {
            const model = map.targets.find(value => value.id === target.id);
            for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(model[key] - target[key]) < .05, `${width}×${height} ${target.id}.${key}: rendered geometry drift`);
            for (const other of actual.slice(index + 1)) assert.equal(intersects(target, other), false);
            assert.ok(target.width >= 48 && target.height >= 48, 'safe area must retain a child-sized touch target');
          }
          assert.ok(actual.find(t => t.id === 'joystick').x + actual.find(t => t.id === 'joystick').width < width / 2);
          assert.ok(actual.filter(t => ['primary', 'secondary', 'tertiary'].includes(t.id)).every(t => t.x > width / 2));
        }
      }
      passed(`${width}×${height}: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps`);
      // Real keyboard focus and native dialogs, including sequential focus trapping.
      await load(width, height, '?screen=start');
      assert.equal(await page.locator('#start-dialog[open]').count(), 1);
      for (let count = 0; count < 4; count++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#start-dialog'))), true, 'focus leaves modal');
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      await page.waitForFunction(() => !document.querySelector('.iu-stage[data-iu-suspended]'));
      assert.equal(await page.locator('.iu-stage[data-iu-suspended]').count(), 0);
      passed(`${width}×${height}: modal focus trap, Escape and input restoration`);
      await load(width, height);
      await page.evaluate(async () => {
        const { presentScore } = await import('./runtime/format.mjs');
        const score = presentScore(Number.MAX_SAFE_INTEGER);
        document.querySelector('.iu-stat--score .iu-stat__value').textContent = score.text;
        document.querySelector('.iu-stat--score').setAttribute('aria-label', score.label);
        document.querySelector('.iu-stat:not(.iu-stat--score) .iu-stat__value').textContent = '23:59:59';
        document.querySelector('[data-iu-target="secondary"] .iu-action__face > span').textContent = 'החלפת שחקן';
      });
      const hudFit = await page.evaluate(() => {
        const hud = document.querySelector('.iu-hud').getBoundingClientRect();
        const pause = document.querySelector('[data-iu-target="pause"]').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.iu-hud .iu-stat')].map(el => {
          const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, overflow: el.scrollWidth > el.clientWidth + 1 };
        });
        const secondary = document.querySelector('[data-iu-target="secondary"]');
        return { cards, left: hud.left, right: hud.right, pauseRight: pause.right, controlOverflow: secondary.scrollHeight > secondary.clientHeight + 1 };
      });
      assert.ok(hudFit.cards.every(card => !card.overflow && card.left >= hudFit.left - 1 && card.right <= hudFit.right + 1), 'long HUD values overflow');
      assert.ok(hudFit.cards.every(card => card.left > hudFit.pauseRight), 'HUD covers pause');
      assert.equal(hudFit.controlOverflow, false, 'two-word action label overflows');
      passed(`${width}×${height}: maximum safe score, 24-hour clock and two-word action fit`);
    }

    await load();
    await page.evaluate(() => { window.islandPreview.openScreen('start'); window.islandPreview.openScreen('end'); });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('#end-dialog[open]').count(), 1);
    assert.equal(await page.locator('.iu-stage[data-iu-suspended]').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.iu-stage[data-iu-suspended]'));
    passed('rapid dialog replacement keeps input suspended until the active modal closes');
    const destroyedDialog = await page.evaluate(async () => {
      const { connectDialog } = await import('./runtime/dialog.mjs');
      const dialog = document.createElement('dialog');
      const button = document.createElement('button'); button.textContent = 'ממשיכים'; dialog.append(button); document.body.append(dialog);
      const binding = connectDialog(dialog, { controls: window.islandPreview.controls });
      binding.open(); const suspended = document.querySelector('.iu-stage').hasAttribute('data-iu-suspended');
      binding.destroy(); const restored = !document.querySelector('.iu-stage').hasAttribute('data-iu-suspended');
      dialog.remove(); return { suspended, restored };
    });
    assert.deepEqual(destroyedDialog, { suspended: true, restored: true });
    passed('destroying an open dialog restores input synchronously');

    await load();
    const pauseSession = await context.newCDPSession(page);
    const pausePoint = async id => {
      const box = await page.locator(`[data-iu-target="${id}"]`).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const joystickPoint = await pausePoint('joystick'); const pauseButtonPoint = await pausePoint('pause');
    await pauseSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...joystickPoint }] });
    await page.waitForFunction(() => document.querySelector('.iu-stage').hasAttribute('data-moving'));
    await pauseSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...joystickPoint }, { id: 2, ...pauseButtonPoint }] });
    await pauseSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 2, ...pauseButtonPoint }] });
    await page.locator('#pause-dialog[open]').waitFor();
    assert.equal(await page.locator('.iu-stage[data-moving]').count(), 0);
    assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 0);
    await pauseSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.iu-stage[data-iu-suspended]'));
    await pauseSession.detach();
    passed('trusted second-finger pause tap stops an already active joystick');

    for (const [width, height] of SIZES) {
      await load(width, height);
      const fit = await page.evaluate(() => {
        const stage = document.querySelector('.iu-stage');
        stage.style.setProperty('--iu-safe-left', '44px'); stage.style.setProperty('--iu-safe-right', '21px');
        window.islandPreview.controls.refresh();
        window.islandPreview.notify('ההרפתקהממשיכהבמסלולחדשומחכהלךהפתעהקטנהבהמשךהדרך'.repeat(3));
        const toast = document.querySelector('[data-toast]'); const box = toast.getBoundingClientRect();
        return { left: box.left, right: box.right, overflow: toast.scrollWidth > toast.clientWidth + 1, pointer: getComputedStyle(toast).pointerEvents };
      });
      assert.ok(fit.left >= 44 && fit.right <= width - 21, 'toast escapes safe area');
      assert.equal(fit.overflow, false, 'unbroken message overflows'); assert.equal(fit.pointer, 'none');
    }
    passed('long unbroken toast text wraps inside asymmetric safe areas in five sizes and never takes touch input');
    await load(360, 640, '');
    assert.equal(await page.locator('.demo-location').isVisible(), false);
    passed('short showcase container removes decorative location copy before it crowds the play marker');

    for (const [width, height] of SIZES) {
      for (const insetRight of [0, 44]) {
        await load(width, height);
        await page.evaluate(value => {
          document.querySelector('.iu-stage').style.setProperty('--iu-safe-right', `${value}px`);
          window.islandPreview.controls.refresh();
        }, insetRight);
        const zone = await page.locator('.iu-stick-zone').boundingBox();
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, .5], [1, .5], [.5, 0], [.5, 1]]) {
          // Stay inside the rounded hit shape, while still clamping the base
          // against every edge. Rectangle corners themselves are outside it.
          await page.mouse.move(zone.x + 14 + (zone.width - 28) * u, zone.y + 14 + (zone.height - 28) * v);
          await page.mouse.down();
          assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 1, 'rim check requires an active joystick');
          const base = await page.locator('.iu-stick').boundingBox();
          const knob = await page.locator('.iu-stick__knob').boundingBox();
          assert.ok(base.x >= zone.x - .05 && base.y >= zone.y - .05, 'floating rim crosses zone origin');
          assert.ok(base.x + base.width <= zone.x + zone.width + .05 && base.y + base.height <= zone.y + zone.height + .05,
            `${width}×${height}: floating rim escapes its measured zone at ${u},${v}`);
          assert.ok(knob.x + knob.width < width / 2, 'the visible knob crosses the physical midpoint');
          await page.mouse.up();
        }
      }
    }
    passed('floating base at four corners and four edge centres: actual rim contained, knob remains left, with and without a side notch');

    await load();
    await page.evaluate(async () => {
      window.islandPreview.controls.destroy();
      const { mountControls } = await import('./runtime/controls.mjs');
      window.inputLog = [];
      window.testControls = mountControls(document.querySelector('.iu-stage'), {
        onMove: value => window.inputLog.push({ type: 'move', ...value }),
        onAction: value => window.inputLog.push({ type: 'action', ...value }),
      });
    });
    const centerOf = async id => {
      const box = await page.locator(`[data-iu-target="${id}"]`).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const clear = () => page.evaluate(() => { window.inputLog.length = 0; });
    const events = () => page.evaluate(() => window.inputLog);
    let left = await centerOf('joystick');
    let right = await centerOf('primary');
    await page.mouse.move(left.x, left.y); await page.mouse.down();
    await page.mouse.move(left.x + 100, left.y - 50);
    assert.ok((await events()).some(e => e.type === 'move' && e.active && e.x > .5));
    await page.mouse.up();
    assert.deepEqual((await events()).at(-1), { type: 'move', x: 0, y: 0, active: false });
    passed('mouse drag leaves zone, pointer capture follows, release returns neutral');

    await clear();
    await page.locator('[data-iu-target="joystick"]').focus();
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp');
    const diagonal = (await events()).at(-1);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
    assert.equal((await events()).at(-1).active, false);
    await page.locator('[data-iu-target="primary"]').focus();
    await clear(); await page.keyboard.press('Space');
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => e.phase), ['start', 'release']);
    passed('keyboard diagonal is normalized; Space emits exactly one action');

    // CDP creates trusted multi-touch Pointer Events, including pointercancel.
    const cdp = await context.newCDPSession(page);
    const finger = (id, point) => ({ id, ...point, radiusX: 4, radiusY: 4 });
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    };
    await clear();
    await touch('touchStart', [finger(1, left)]);
    await touch('touchMove', [finger(1, { x: left.x + 35, y: left.y })]);
    await touch('touchStart', [finger(1, { x: left.x + 35, y: left.y }), finger(2, right)]);
    assert.equal(await page.locator('[data-iu-action="jump"][data-held]').count(), 1);
    await touch('touchEnd', [finger(2, right)]);
    assert.equal(await page.locator('.iu-stick-zone[data-active]').count(), 1);
    await touch('touchEnd', []);
    const multi = await events();
    assert.deepEqual(multi.filter(e => e.type === 'action').map(e => e.phase), ['start', 'release']);
    assert.equal(multi.at(-1).active, false);
    passed('trusted simultaneous joystick + action: independent fingers, no duplicate click');

    await clear();
    await touch('touchStart', [finger(1, right)]); await touch('touchCancel', []);
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => e.phase), ['start', 'cancel']);
    passed('pointercancel never commits a held action');

    await clear();
    await page.mouse.move(right.x, right.y); await page.mouse.down();
    await page.mouse.move(0, 0); await page.mouse.up();
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => e.phase), ['start', 'cancel']);
    passed('release outside target cancels the action');

    await clear();
    await page.mouse.move(right.x, right.y); await page.mouse.down();
    await page.locator('[data-iu-target="primary"]').evaluate(el => { el.disabled = true; });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.mouse.up();
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => e.phase), ['start', 'cancel']);
    await page.locator('[data-iu-target="primary"]').evaluate(el => { el.disabled = false; });
    passed('disabling a held button immediately cancels it');

    await clear();
    await page.mouse.move(right.x, right.y); await page.mouse.down();
    await page.locator('[data-iu-target="primary"]').evaluate(el => { el.dataset.iuAction = 'pass'; });
    await page.evaluate(() => new Promise(requestAnimationFrame)); await page.mouse.up();
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => [e.id, e.phase]), [['jump', 'start'], ['jump', 'cancel']]);
    await clear(); await page.mouse.click(right.x, right.y);
    assert.deepEqual((await events()).filter(e => e.type === 'action').map(e => [e.id, e.phase]), [['pass', 'start'], ['pass', 'release']]);
    passed('changing action identity cancels the old hold; the next touch uses the new identity');

    for (const reason of ['resize', 'suspend', 'blur', 'hidden']) {
      await clear(); left = await centerOf('joystick'); right = await centerOf('primary');
      await touch('touchStart', [finger(1, left), finger(2, right)]);
      await touch('touchMove', [finger(1, { x: left.x + 30, y: left.y }), finger(2, right)]);
      if (reason === 'resize') await page.setViewportSize({ width: 844, height: 390 });
      if (reason === 'suspend') await page.evaluate(() => window.testControls.setEnabled(false));
      if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      if (reason === 'hidden') await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await touch('touchEnd', []);
      const log = await events();
      assert.ok(log.some(e => e.type === 'move' && !e.active && e.x === 0 && e.y === 0), `${reason}: no neutral`);
      assert.ok(log.some(e => e.type === 'action' && e.phase === 'cancel'), `${reason}: action was not cancelled`);
      assert.ok(!log.some(e => e.type === 'action' && e.phase === 'release'), `${reason}: accidental commit`);
      await page.evaluate(() => window.testControls.setEnabled(true));
      passed(`${reason}: movement zeroed, held action cancelled, no accidental release`);
    }
    await page.evaluate(() => window.testControls.destroy());
    await clear();
    await page.mouse.click((await centerOf('primary')).x, (await centerOf('primary')).y);
    assert.deepEqual(await events(), []);
    passed('destroy removes input listeners; a detached adapter cannot emit');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(360, 640, '?screen=library');
    const duration = await page.locator('.iu-action__face').first().evaluate(el => getComputedStyle(el).transitionDuration);
    assert.equal(duration, '0s');
    passed('reduced motion disables control transitions');
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    for (const [width, height] of SIZES) {
      await staticPage.setViewportSize({ width, height }); await staticPage.goto(url);
      const boxes = await staticPage.locator('[data-iu-target]').evaluateAll(els => els.map(el => {
        const b = el.getBoundingClientRect(); return { id: el.dataset.iuTarget, x: b.x, y: b.y, width: b.width, height: b.height };
      }));
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) assert.equal(intersects(boxes[a], boxes[b]), false, `CSS-only ${width}: overlapping targets`);
      const joystick = boxes.find(box => box.id === 'joystick');
      assert.ok(joystick.x + joystick.width < width / 2);
      assert.ok(boxes.filter(box => ['primary', 'secondary', 'tertiary'].includes(box.id)).every(box => box.x > width / 2));
    }
    await staticContext.close();
    passed('CSS/SVG-only fallback: five sizes, physical left/right, no overlapping targets');
    const fixture = await integrationFixture();
    await page.route('**/__integration', route => route.fulfill({ body: fixture, contentType: 'text/html; charset=utf-8' }));
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height }); await page.goto(url + '/__integration');
      await page.waitForFunction(() => !!window.integrationExample?.controls.map);
      const boxes = await targets();
      assert.equal(boxes.length, 5, 'integration examples do not provide all five targets');
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) assert.equal(intersects(boxes[a], boxes[b]), false);
      for (const name of ['intro', 'result', 'pause']) {
        await page.evaluate(id => window.integrationExample[id].open(), name);
        assert.equal(await page.locator(`#${name}[open]`).count(), 1);
        assert.equal(await page.locator('.iu-stage[data-iu-suspended]').count(), 1);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.iu-stage[data-iu-suspended]'));
      }
    }
    passed('published INTEGRATION HTML + JS assembled directly: all five sizes, controls and three dialogs work');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    passed('no JavaScript errors or external resource requests');
    if (save) await writeFile(resolve(root, 'BROWSER-CHECKS.md'), `# Browser verification\n\n${new Date().toISOString()} · Chromium ${browser.version()}\n\n${checks.map(value => `- PASS: ${value}`).join('\n')}\n\nTrusted CDP touches; actual mouse and keyboard. Blur and visibility state changes exercise the cancellation handlers via DOM events. Safe-area values are emulated CSS insets, not a physical notch.\n`);
    return checks;
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
}

if (process.argv[1]?.endsWith('browser-check.mjs')) await runBrowserChecks();
