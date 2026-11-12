// The off switch: ?catchV6=0 in the real island loads v5 (no fire button, session.v6 undefined); default loads v6.
import {serveIsland, islandChromium} from '../../../../../../tests/helpers/island-browser.mjs';
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true});
await context.addInitScript(() => { localStorage.setItem('island.sound', 'off'); localStorage.setItem('island.catch.help2', '1'); localStorage.setItem('island.catch.help6', '1'); });
const out = {};
try {
  for (const [name, q] of [['v5', '&catchV6=0'], ['v6', '']]) {
    const page = await context.newPage(); page.setDefaultTimeout(240000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(server.url + '?dev=1&games=1' + q, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
    if (await page.locator('[data-action=avatar-start]').count()) await page.locator('[data-action=avatar-start]').click();
    await page.evaluate(() => { const e = window.__island.engine; e.skipTutorial(); e.tick = () => ({ok: true}); window.__island.ui.activityInterface.requireDaily = () => false; });
    await page.evaluate(s => window.__island.ui.activityInterface.launch('catchCriminal', undefined, s), 1);
    await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.ready);
    await page.waitForFunction(() => window.__island.ui.activityInterface.current.session.snapshot.mode === 'chase');
    await page.waitForTimeout(1500);
    out[name] = {...(await page.evaluate(() => { const s = window.__island.ui.activityInterface.current.session; return {mode: s.snapshot.mode, v6: s.v6, v2: s.v2, fireButtons: document.querySelectorAll('.catch-fire').length, boost: document.querySelectorAll('.catch-boost').length, arcs: s.chase?.track?.segments?.filter(x => x.kind === 'arc').length ?? null}; })), ms: Date.now() - t0, errors};
    await page.screenshot({path: new URL(`../shots/09-island-${name}-chase.png`, import.meta.url).pathname});
    console.log(name, JSON.stringify(out[name]));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
