/** Before/after captures of a ramp jump (844x390): node workout/island/tools/alpine-air-shots.mjs  (needs ISLAND chromium like tests/island-alpine-ctrl-ski).
 * "before" = ?alpineAir=0, "after" = default. Runs the real session, fast-forwards the engine to the first ramp jump with a straight
 * line and captures a few frames. Output: verification/alpine-ramp-v10/<label>-<n>.png and air-shots.json */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium} from '../../../tests/helpers/island-browser.mjs';
const out = fileURLToPath(new URL('../verification/alpine-ramp-v10/', import.meta.url));
await mkdir(out, {recursive: true});
const server = await serveIsland(), chromium = await islandChromium(), report = {};
for (const [label, query] of [['before', '?dev=1&alpineAir=0'], ['after', '?dev=1']]) {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']});
  const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, deviceScaleFactor: 1, timezoneId: 'Asia/Jerusalem'});
  await context.route('**/data/featureFlags.json*', async route => { const response = await route.fetch(); await route.fulfill({response, json: {...await response.json(), events: false}}); });
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  await page.goto(server.url + query, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').tap();
  await page.evaluate(() => { const {engine: e} = window.__island; e.skipTutorial(); e.tick = () => ({ok: true}); });
  await page.evaluate(() => { const e = window.__island.engine; if (!e.state.instructionsSeen.includes('alpineRush')) e.state.instructionsSeen.push('alpineRush'); window.__island.ui.activityInterface.launch('alpineRush', undefined, 1); });
  await page.waitForFunction(() => { const b = document.querySelector('[data-action=alpine-start]'); return b && !b.disabled && document.querySelector('.game-screen')?.dataset.starting !== 'true'; });
  await page.locator('[data-action=alpine-start]').click();
  await page.waitForFunction(() => window.__island.ui.activityInterface.current.session.snapshot.phase === 'racing');
  // pause the real-time loop's effect by driving the engine ourselves: step to just before the first ramp, then step slowly
  const info = await page.evaluate(async () => {
    const s = window.__island.ui.activityInterface.current.session, dbg = s.debug; if (!dbg) return {error: 'no debug'};
    const e = dbg.engine, ramp = e.course.objects.find(o => o.type === 'ramp'); if (!ramp) return {error: 'no ramp'};
    // line the player up with the ramp, no obstacles in the way (the first ramp is preceded by calm start rows)
    const track = []; let air = 0;
    for (let i = 0; i < 60 * 120 && air < 3; i++) {
      const d = e.debug()[0]; e.command({type: 'steer', value: Math.max(-1, Math.min(1, (ramp.x - d.x) * 1.2))});
      dbg.step(1 / 60);
      const p = e.debug()[0]; if (p.airborne) { air++; track.push({speed: p.speed, s: p.s}); }
      if (p.airborne && air === 1) break;
    }
    return {ramp: {s: ramp.s, x: ramp.x}, player: e.debug()[0].s};
  });
  report[label] = info;
  for (let n = 1; n <= 3; n++) {
    await page.evaluate(() => { const s = window.__island.ui.activityInterface.current.session.debug; for (let k = 0; k < 14; k++) s.step(1 / 60); });
    await page.waitForTimeout(250);
    const d = await page.evaluate(() => window.__island.ui.activityInterface.current.session.snapshot.frame.player);
    report[label]['f' + n] = {airborne: d.airborne, airBoost: d.airBoost, height: d.height};
    await page.screenshot({path: `${out}${label}-${n}.png`});
  }
  await browser.close();
}
await writeFile(out + 'air-shots.json', JSON.stringify(report, null, 1)); console.log(JSON.stringify(report));
await server.close?.();
