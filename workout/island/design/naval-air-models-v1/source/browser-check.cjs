// Browser validation and actual Chromium screenshots. CC0-1.0.
// Serve repository on localhost:8765 before running. Development tooling only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(__dirname, '../verification');
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8765/workout/island/design/naval-air-models-v1/preview.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], remoteRequests = [], failedResponses = [], screenshots = [];
  const report = { browser: await browser.version(), renderer: 'Chromium / ANGLE SwiftShader (software)', errors, remoteRequests, failedResponses, screenshots };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  function watch(page) {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
  }
  watch(page);
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(url).origin) { remoteRequests.push(requestUrl.href); return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.navalPreview?.ready);
    report.models = await page.evaluate(() => {
      navalPreview.setSpin(false); navalPreview.renderAt('rest', 0);
      return navalPreview.models.map(v => ({ name: v.id, triangles: v.triangles, materials: v.materialCount, bounds: v.bounds,
        clips: v.gltf.animations.map(c => ({ name: c.name, duration: c.duration })), spinners: v.spinners.map(s => s.node.name) }));
    });
    assert.equal(report.models.length, 2);
    for (const m of report.models) { assert(m.triangles <= 1800); assert.equal(m.materials, 1); }
    async function capture(name, full = false) {
      const file = name + '.png';
      if (full) await page.screenshot({ path: path.join(output, file), fullPage: true });
      else await page.locator('.models').screenshot({ path: path.join(output, file) });
      screenshots.push(file);
    }
    await capture('desktop-three-quarter', true);
    for (const view of ['top', 'side', 'front']) {
      await page.evaluate(view => navalPreview.setView(view), view);
      await capture('rest-' + view);
    }
    await page.evaluate(() => navalPreview.setView('three-quarter'));
    report.animationSamples = [];
    for (const clip of ['fly', 'bank', 'down']) {
      for (const time of clip === 'down' ? [0, 0.4, 0.8, 1.2, 1.6] : [0, 0.6, 1.2, 1.8]) {
        const sample = await page.evaluate(({ clip, time }) => {
          navalPreview.renderAt(clip, time);
          return navalPreview.models.map(v => {
            const root = v.model.getObjectByName('motionRoot');
            // +Z transformed directly by quaternion, without borrowing authoring code.
            const [x, y, z, w] = root.quaternion.toArray();
            return { name: v.id, position: root.position.toArray(), quaternion: [x, y, z, w], nose: [2*(x*z+w*y), 2*(y*z-w*x), 1-2*(x*x+y*y)], time: v.action.time };
          });
        }, { clip, time });
        for (const m of sample) {
          assert(Math.abs(Math.hypot(...m.quaternion) - 1) < 1e-5);
          if (clip === 'down' && time === 1.6) { assert(m.nose[1] < -0.9); assert(Math.abs(m.time - 1.6) < 1e-5); }
        }
        report.animationSamples.push({ clip, time, models: sample });
        if (clip === 'down') await capture('down-' + time.toFixed(1).replace('.', '-'));
      }
    }
    report.reset = await page.evaluate(() => {
      navalPreview.renderAt('rest', 0);
      return navalPreview.models.every(v => {
        const root = v.model.getObjectByName('motionRoot');
        return root.position.lengthSq() === 0 && Math.abs(root.quaternion.w) === 1;
      });
    });
    assert(report.reset, 'rest must restore the bind pose after down');
    report.spinnerIsolation = await page.evaluate(() => {
      navalPreview.setSpin(true); navalPreview.renderAt('rest', .125);
      return navalPreview.models.map(v => ({ name: v.id,
        moved: v.spinners.every(s => s.node.quaternion.angleTo(s.bind) > .1),
        pivotsUnchanged: v.spinners.every(s => {
          const bind = v.bindPose.find(p => p.object === s.node);
          return s.node.position.distanceTo(bind.position) === 0;
        }), bodyUnchanged: v.model.getObjectByName('motionRoot').quaternion.w === 1 }));
    });
    for (const result of report.spinnerIsolation) assert(result.moved && result.pivotsUnchanged && result.bodyUnchanged);
    await page.locator('#wireframe').check();
    assert(await page.evaluate(() => navalPreview.models.every(v => [...v.materialObjects].every(m => m.wireframe))));
    await page.locator('#wireframe').uncheck();
    await page.locator('#axes').check();
    assert(await page.evaluate(() => navalPreview.models.every(v => v.axes.visible)));
    await page.locator('#axes').uncheck();
    await page.locator('[data-view="front"]').click();
    assert.equal(await page.evaluate(() => navalPreview.state.view), 'front');
    const canvas = page.locator('#plane-viewport canvas');
    const beforeYaw = await page.evaluate(() => navalPreview.models[0].orbit.yaw);
    await canvas.focus(); await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.evaluate(() => navalPreview.models[0].orbit.yaw), beforeYaw);
    await page.locator('[data-clip="bank"]').click();
    assert.equal(await page.evaluate(() => navalPreview.state.clip), 'bank');
    await page.locator('#pause').click();
    assert(await page.evaluate(() => navalPreview.state.paused));
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await mobile.route('**/*', route => {
      if (new URL(route.request().url()).origin !== new URL(url).origin) { remoteRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const phone = await mobile.newPage(); watch(phone);
    await phone.goto(url); await phone.waitForFunction(() => window.navalPreview?.ready);
    report.mobile = await phone.evaluate(() => ({ width: innerWidth, contentWidth: document.documentElement.scrollWidth,
      reducedMotionPaused: navalPreview.state.paused, reducedMotionSpin: navalPreview.state.spin }));
    assert(report.mobile.contentWidth <= report.mobile.width);
    assert(report.mobile.reducedMotionPaused && !report.mobile.reducedMotionSpin);
    await phone.screenshot({ path: path.join(output, 'mobile-reduced-motion.png'), fullPage: true });
    screenshots.push('mobile-reduced-motion.png');
    assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []); assert.deepEqual(failedResponses, []);
    report.passed = true;
    fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, screenshots, models: report.models, mobile: report.mobile }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
