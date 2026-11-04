import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium, installIslandCspMonitor} from './helpers/island-browser.mjs';

/** Alpine Rush control layout and multi-touch in the real island page (ISLAND_CSP_BROWSER=1), both phone orientations.
 * - The steering stick sits in the left half of the screen, boost and every trick button in the right half.
 * - Real touches (CDP Input.dispatchTouchEvent): a thumb landing on the left half of the slope floats the stick under it,
 *   a second finger presses boost at the same time, steering keeps going, release clears everything.
 * Screenshots land in workout/island/verification/ctrl-ski/. */
const out = fileURLToPath(new URL('../workout/island/verification/ctrl-ski/', import.meta.url));

test('browser: stick left / actions right in both orientations, floating stick with boost under a second finger',
  {skip: process.env.ISLAND_CSP_BROWSER !== '1', timeout: 600000}, async () => {
  await mkdir(out, {recursive: true});
  const server = await serveIsland(), chromium = await islandChromium();
  try {
    for (const [width, height] of [[844, 390], [390, 844]]) {
      const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']});
      const context = await browser.newContext({viewport: {width, height}, hasTouch: true, deviceScaleFactor: 1, timezoneId: 'Asia/Jerusalem'});
      const csp = await installIslandCspMonitor(context);
      await context.route('**/data/featureFlags.json*', async route => { const response = await route.fetch(); await route.fulfill({response, json: {...await response.json(), events: false}}); });
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(180000); await csp.attachPage(page);
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/missing-alpine-rider|404/.test(m.text())) errors.push(m.text()); });
      try {
        await page.goto(server.url + '?dev=1', {waitUntil: 'networkidle'});
        await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
        await page.locator('[data-action=avatar-start]').tap();
        await page.evaluate(() => { const {engine: e} = window.__island; e.skipTutorial(); e.tick = () => ({ok: true}); });
        await page.evaluate(() => { const e = window.__island.engine; if (!e.state.instructionsSeen.includes('alpineRush')) e.state.instructionsSeen.push('alpineRush'); window.__island.ui.activityInterface.launch('alpineRush', undefined, 1); });
        await page.waitForFunction(() => { const b = document.querySelector('[data-action=alpine-start]'); return b && !b.disabled && document.querySelector('.game-screen')?.dataset.starting !== 'true'; });
        await page.locator('[data-action=alpine-start]').click();
        const snap = () => page.evaluate(() => window.__island.ui.activityInterface.current.session.snapshot);
        await page.waitForFunction(() => window.__island.ui.activityInterface.current.session.snapshot.phase === 'racing');

        // 1. Layout: centres of the stick and of every action button, against the middle of the screen.
        const layout = await page.evaluate(() => {
          const c = s => { const r = document.querySelector(s).getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, width: r.width, height: r.height}; };
          return {width: innerWidth, stick: c('.alpine-joystick'), boost: c('.alpine-boost'), tricks: [...document.querySelectorAll('.alpine-trick')].map(n => { const r = n.getBoundingClientRect(); return {x: r.left + r.width / 2, left: r.left, right: r.right, width: r.width, height: r.height}; })};
        });
        const mid = layout.width / 2;
        assert.ok(layout.stick.x < mid && layout.stick.right <= mid, `${width}x${height}: stick is in the left half (${layout.stick.x} / ${layout.width})`);
        assert.ok(layout.boost.x > mid && layout.boost.left >= mid, `${width}x${height}: boost is in the right half`);
        assert.equal(layout.tricks.length, 4); for (const t of layout.tricks) assert.ok(t.x > mid && t.left >= mid && t.right <= layout.width, 'every trick button is in the right half and on screen');
        assert.ok(layout.boost.width >= 92 && layout.stick.width >= 100, 'targets are large');
        for (const t of layout.tricks) assert.ok(t.width >= 48 && t.height >= 48, 'trick buttons are at least 48 px');
        await page.screenshot({path: `${out}layout-${width}x${height}.png`});

        // 2. Real touches: the thumb lands in the left half of the slope (not on the stick) and slides right; a second finger
        // presses the boost button while the first is still down.
        const cdp = await context.newCDPSession(page);
        const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([id, x, y]) => ({id, x, y, radiusX: 8, radiusY: 8, force: .5}))});
        const landing = [Math.round(mid * .62), Math.round(height * (height > width ? .5 : .55))], x0 = (await snap()).frame.player.x;
        await touch('touchStart', [[1, ...landing]]);
        await page.waitForFunction(() => document.querySelector('.alpine-joystick')?.dataset.floating === 'true');
        const moved = await page.evaluate(() => document.querySelector('.alpine-joystick').getBoundingClientRect());
        assert.ok(Math.abs(moved.left + moved.width / 2 - landing[0]) <= 3 && Math.abs(moved.top + moved.height / 2 - landing[1]) <= 3, `the stick is under the thumb: ${JSON.stringify(moved)} vs ${landing}`);
        assert.ok(moved.left + moved.width / 2 < mid, 'and still in the left half');
        await touch('touchMove', [[1, landing[0] + 45, landing[1]]]);
        await touch('touchStart', [[1, landing[0] + 45, landing[1]], [2, layout.boost.x, layout.boost.y]]);
        await page.waitForFunction(() => { const s = window.__island.ui.activityInterface.current.session.snapshot; return s.input.dragging && s.frame.player.boosting; }, null, {timeout: 60000});
        await page.screenshot({path: `${out}floating-boost-${width}x${height}.png`});
        await page.waitForFunction(x => window.__island.ui.activityInterface.current.session.snapshot.frame.player.x > x + 1, x0, {timeout: 60000});
        const during = await snap(); assert.equal(during.input.dragging, true, 'steering continues while the boost finger is down');
        await touch('touchEnd', []);
        await page.waitForFunction(() => !window.__island.ui.activityInterface.current.session.snapshot.input.dragging);
        assert.equal(await page.evaluate(() => document.querySelector('.alpine-joystick').dataset.floating), undefined);
        assert.equal(await page.evaluate(() => document.querySelector('.alpine-joystick').style.transform), '', 'the stick goes home');
        assert.deepEqual(errors, []);
      } finally { await csp.assertClean().catch(() => {}); await browser.close(); await csp.dispose(); }
    }
  } finally { await server.close(); }
});
