/** v11 captures (844x390): a ramp-wall fall in 4 frames and a warning sign + narrow passage on stage 3.
 * before = ?alpineFall=0&alpineObs=0, after = default. node workout/island/tools/alpine-fall-shots.mjs (ISLAND_CSP_BROWSER=1, ISLAND_PLAYWRIGHT=...) */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium} from '../../../tests/helpers/island-browser.mjs';
const out = fileURLToPath(new URL('../verification/alpine-fall-v11/', import.meta.url));
await mkdir(out, {recursive: true});
const server = await serveIsland(), chromium = await islandChromium(), report = {};
async function open(browser, query, stage) {
  const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, deviceScaleFactor: 1, timezoneId: 'Asia/Jerusalem'});
  await context.route('**/data/featureFlags.json*', async route => { const response = await route.fetch(); await route.fulfill({response, json: {...await response.json(), events: false}}); });
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  await page.goto(server.url + query, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').tap();
  await page.evaluate(() => { const {engine: e} = window.__island; e.skipTutorial(); e.tick = () => ({ok: true}); });
  await page.evaluate(st => { const e = window.__island.engine; if (!e.state.instructionsSeen.includes('alpineRush')) e.state.instructionsSeen.push('alpineRush'); window.__island.ui.activityInterface.launch('alpineRush', undefined, st); }, stage);
  await page.waitForFunction(() => { const b = document.querySelector('[data-action=alpine-start]'); return b && !b.disabled && document.querySelector('.game-screen')?.dataset.starting !== 'true'; });
  await page.locator('[data-action=alpine-start]').click();
  await page.waitForFunction(() => window.__island.ui.activityInterface.current.session.snapshot.phase === 'racing');
  return page;
}
for (const [label, query] of [['before', '?dev=1&alpineFall=0&alpineObs=0'], ['after', '?dev=1']]) {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']});
  // 1. ramp wall fall on stage 1's first ramp: ride at ramp.x+2.2
  let page = await open(browser, query, 1);
  const info = await page.evaluate(() => {
    const dbg = window.__island.ui.activityInterface.current.session.debug, e = dbg.engine, ramp = e.course.objects.find(o => o.type === 'ramp');
    for (let i = 0; i < 60 * 200; i++) {
      const d = e.debug()[0], tx = d.s > ramp.s - 40 ? ramp.x + 2.25 : d.x; e.command({type: 'steer', value: Math.max(-1, Math.min(1, (tx - d.x) * 1.5))});
      dbg.step(1 / 60); if (e.snapshot().player.crashed || e.debug()[0].hitTime > 0 || d.s > ramp.s + 8) break;
    }
    const p = e.debug()[0]; return {ramp: {s: ramp.s, x: ramp.x}, s: p.s, x: p.x, crashes: p.crashes, hitTime: p.hitTime};
  });
  report[label] = {ramp: info};
  for (let n = 1; n <= 4; n++) {
    await page.evaluate(() => { const s = window.__island.ui.activityInterface.current.session.debug; for (let k = 0; k < 14; k++) s.step(1 / 60); });
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => window.__island.ui.activityInterface.current.session.snapshot.frame.player);
    report[label]['fall' + n] = {crashed: f.crashed, airborne: f.airborne};
    await page.screenshot({path: `${out}${label}-fall-${n}.png`});
  }
  await page.context().close();
  // 2. stage 3 warning sign: move player to 30 m before the first warn object
  page = await open(browser, query, 3);
  const w = await page.evaluate(() => {
    const dbg = window.__island.ui.activityInterface.current.session.debug, e = dbg.engine, warn = e.course.objects.find(o => o.type === 'warn');
    const target = warn ? warn.s - 24 : e.course.objects.find(o => o.type === 'rock').s - 40;
    for (let i = 0; i < 60 * 200; i++) {
      const d = e.debug()[0]; if (d.s > target) break; e.command({type: 'steer', value: 0}); dbg.step(1 / 60); if (d.crashes) { break; }
    }
    return {warn: warn ? warn.s : null, s: e.debug()[0].s};
  });
  report[label].warn = w;
  await page.waitForTimeout(400); await page.screenshot({path: `${out}${label}-warn.png`});
  await browser.close();
}
await writeFile(out + 'shots.json', JSON.stringify(report, null, 1)); console.log(JSON.stringify(report));
await server.close?.();
