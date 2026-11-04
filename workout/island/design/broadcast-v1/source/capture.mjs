// Review evidence generator, not part of the runtime or repository test suite.
// Start the repository HTTP server first. Uses the installed Playwright/Chromium.
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium} = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'verification'), {recursive: true});
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const report = {date: '2026-11-04', renderer: 'Chromium / ANGLE / SwiftShader; desktop software renderer, not phone performance', captures: [], budgets: [], behavior: {}, consoleErrors: [], requestFailures: [], externalRequests: []};
const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
const page = await context.newPage(); page.setDefaultTimeout(60000);
page.on('pageerror', e => report.consoleErrors.push(e.message));
page.on('console', m => {if (m.type() === 'error') report.consoleErrors.push(m.text());});
page.on('requestfailed', r => report.requestFailures.push({url: r.url(), error: r.failure()?.errorText}));
page.on('request', r => {const url = new URL(r.url()); if (/^https?:/.test(url.protocol) && url.hostname !== '127.0.0.1') report.externalRequests.push(url.href);});
page.on('response', r => {if (r.status() >= 400) report.requestFailures.push({url: r.url(), status: r.status()});});
try {
  await page.goto('http://127.0.0.1:8765/workout/island/design/broadcast-v1/preview.html?still&quality=balanced');
  await page.waitForFunction(() => !!window.broadcastPreview); await page.evaluate(() => broadcastPreview.ready);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({width, height});
    for (const sport of ['soccer', 'basketball']) {
      await page.locator(`[data-sport="${sport}"]`).click();
      await page.evaluate(() => {broadcastPreview.setQuality('balanced'); broadcastPreview.seek(12); broadcastPreview.settle(2);});
      for (const mode of ['broadcast', 'side', 'shoulder', 'replay']) {
        await page.locator(`[data-camera="${mode}"]`).click();
        if (mode === 'replay') await page.locator('#replay-time').evaluate(el => {el.value = '.5'; el.dispatchEvent(new Event('input', {bubbles: true}));});
        await page.evaluate(() => broadcastPreview.settle(2));
        const snapshot = await page.evaluate(() => {
          const app = broadcastPreview, s = app.snapshot();
          const projected = app.actors.map(a => {const p = a.group.position.clone(); p.y += .9; p.project(app.camera); return {id: a.index, x: p.x, y: p.y, z: p.z};});
          return {...s, projected, overflow: document.documentElement.scrollWidth > innerWidth, pageHeight: document.documentElement.scrollHeight};
        });
        assert.equal(snapshot.population, 12); assert.equal(snapshot.mode, mode); assert.equal(snapshot.sport, sport); assert.equal(snapshot.camera.transitioning, false);
        assert.equal(snapshot.overflow, false); assert.equal(snapshot.pageHeight, height); assert.equal(snapshot.errors.length, 0);
        assert.ok(snapshot.sceneTriangles <= 110000); assert.ok(snapshot.calls <= 60);
        if (mode === 'broadcast') assert.equal(snapshot.projected.filter(p => Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1).length, 12, `${sport} ${width}: keep all twelve in the broadcast frame`);
        const filename = `${sport}-${mode}-${width}x${height}.png`;
        await page.screenshot({path: resolve(root, 'previews', filename), fullPage: true});
        report.captures.push({filename, viewport: [width, height], ...snapshot});
        console.log('CAPTURE', filename, snapshot.sceneTriangles, snapshot.calls);
      }
      await page.locator('#return-live').click(); await page.evaluate(() => broadcastPreview.settle(2));
      assert.equal((await page.evaluate(() => broadcastPreview.snapshot())).replay, null);
      // Exact same frozen frame with and without the aesthetic post effects.
      await page.locator('#fx').click(); await page.evaluate(() => broadcastPreview.settle(.05));
      await page.screenshot({path: resolve(root, 'previews', `${sport}-effects-off-${width}x${height}.png`), fullPage: true});
      assert.equal((await page.evaluate(() => broadcastPreview.snapshot())).postEnabled, false);
      await page.locator('#fx').click();
      for (const tier of ['economy', 'balanced', 'high']) {
        await page.selectOption('#quality', tier); await page.evaluate(() => broadcastPreview.settle(.1));
        const snapshot = await page.evaluate(() => broadcastPreview.snapshot());
        assert.equal(snapshot.quality, tier); assert.equal(snapshot.adaptive.auto, false);
        const limit = {economy: [80000, 55], balanced: [110000, 60], high: [150000, 65]}[tier];
        assert.ok(snapshot.sceneTriangles <= limit[0]); assert.ok(snapshot.calls <= limit[1]);
        report.budgets.push({viewport: [width, height], sport, tier, ...snapshot});
      }
      await page.selectOption('#quality', 'balanced');
    }
  }
  report.behavior.transitionInterrupt = await page.evaluate(() => {
    const app = broadcastPreview; app.setCamera('side'); app.settle(.35);
    const before = app.camera.position.clone(), beforeQ = app.camera.quaternion.clone(); app.setCamera('shoulder');
    const jump = before.distanceTo(app.camera.position), angle = beforeQ.angleTo(app.camera.quaternion); app.settle(2);
    return {instantPositionJump: jump, instantOrientationJump: angle, finished: !app.snapshot().camera.transitioning};
  });
  assert.equal(report.behavior.transitionInterrupt.instantPositionJump, 0); assert.ok(report.behavior.transitionInterrupt.instantOrientationJump < 1e-6); assert.equal(report.behavior.transitionInterrupt.finished, true);
  report.behavior.adaptive = await page.evaluate(() => {
    const a = broadcastPreview; a.setQuality('high', true);
    for (let i = 0; i < 1200; i++) a.quality.sample(50, 35, 1 / 30);
    const overloaded = a.quality.tier;
    for (let i = 0; i < 3600; i++) a.quality.sample(33.33, 8, 1 / 30);
    const recovered = a.quality.tier;
    a.setQuality('balanced'); for (let i = 0; i < 1200; i++) a.quality.sample(80, 70, 1 / 30);
    return {overloaded, recovered, manualLocked: a.quality.tier, changes: a.quality.changes};
  });
  assert.equal(report.behavior.adaptive.overloaded, 'economy'); assert.equal(report.behavior.adaptive.recovered, 'high'); assert.equal(report.behavior.adaptive.manualLocked, 'balanced');
  await page.emulateMedia({reducedMotion: 'reduce'}); await page.evaluate(() => broadcastPreview.settle(.1));
  report.behavior.reducedMotion = await page.evaluate(() => ({enabled: broadcastPreview.state.reducedMotion, blurUniform: broadcastPreview.post.uniforms.motionEnabled.value}));
  assert.equal(report.behavior.reducedMotion.enabled, true); assert.equal(report.behavior.reducedMotion.blurUniform, 0);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  report.behavior.depthFallback = await page.evaluate(() => {const p = broadcastPreview.post; p.depthSupported = false; broadcastPreview.settle(.1); const result = p.uniforms.depthEnabled.value; p.depthSupported = true; return result;});
  assert.equal(report.behavior.depthFallback, 0);
  // Real replay playback continues the live clock, while the captured history is isolated.
  await page.locator('[data-camera="replay"]').click(); await page.locator('#play').click();
  const beforeReplay = await page.evaluate(() => ({live: broadcastPreview.state.elapsed, replay: broadcastPreview.snapshot().replay}));
  await page.waitForFunction(t => broadcastPreview.state.elapsed > t + .2, beforeReplay.live, {timeout: 20000});
  const afterReplay = await page.evaluate(() => ({live: broadcastPreview.state.elapsed, replay: broadcastPreview.snapshot().replay}));
  assert.ok(afterReplay.replay.progress > beforeReplay.replay.progress); assert.equal(afterReplay.replay.end, beforeReplay.replay.end);
  report.behavior.replay = {before: beforeReplay, after: afterReplay};
  await page.locator('#play').click(); await page.locator('#return-live').click(); await page.evaluate(() => broadcastPreview.settle(2));
  await page.locator('#details').click(); assert.equal(await page.locator('#metrics').isVisible(), true); await page.locator('#close-metrics').click();
  report.behavior.detailsPanel = true;
  // DPR-2 budget check after orientation changes, without supersized screenshots.
  const dprContext = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true});
  const dprPage = await dprContext.newPage(); await dprPage.goto(page.url()); await dprPage.waitForFunction(() => !!window.broadcastPreview); await dprPage.evaluate(() => broadcastPreview.ready);
  report.behavior.dpr2 = [];
  for (const tier of ['economy', 'balanced', 'high']) {
    report.behavior.dpr2.push(await dprPage.evaluate(t => {broadcastPreview.setQuality(t); broadcastPreview.seek(12); broadcastPreview.settle(2); return broadcastPreview.snapshot();}, tier));
  }
  await dprContext.close();
  report.behavior.contextRestore = {supported: await page.evaluate(() => {window.__broadcastLossExt = broadcastPreview.renderer.getContext().getExtension('WEBGL_lose_context'); return !!window.__broadcastLossExt;})};
  if (report.behavior.contextRestore.supported) {
    await page.evaluate(() => window.__broadcastLossExt.loseContext());
    await page.waitForFunction(() => broadcastPreview.state.contextLost);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__broadcastLossExt.restoreContext());
    await page.waitForFunction(() => !broadcastPreview.state.contextLost);
    await page.evaluate(() => broadcastPreview.settle(2));
    assert.equal(await page.locator('#error').isVisible(), false);
    report.behavior.contextRestore.after = await page.evaluate(() => broadcastPreview.snapshot());
    assert.ok(report.behavior.contextRestore.after.sceneTriangles > 50000);
    await page.screenshot({path: resolve(root, 'previews', 'context-restored-844x390.png'), fullPage: true});
  }
  assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.requestFailures, []); assert.deepEqual(report.externalRequests, []);
  report.passed = true;
} catch (error) {report.passed = false; report.failure = error.stack; throw error;}
finally {await writeFile(resolve(root, 'verification/browser.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close();}
