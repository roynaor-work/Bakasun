// CC0-1.0. Real-page screenshot of the basketball game (844x390, hasTouch) with or without v3.
// Usage: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node hoops-shot.mjs <out.png> [query]
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {serveIsland} = await import('../../../../../tests/helpers/island-browser.mjs');
const out = process.argv[2], query = process.argv[3] || '';
const server = await serveIsland('/workout/island/'), browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, isMobile: true, deviceScaleFactor: 1}); context.setDefaultTimeout(240000);
const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.addInitScript(() => { HTMLElement.prototype.requestFullscreen = undefined; });
await page.goto(server.url + '?dev=1' + (query ? '&' + query : ''), {waitUntil: 'networkidle'});
await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded, null, {timeout: 240000});
await page.locator('[data-action=avatar-start]').click();
await page.evaluate(() => { const {engine: e, data} = window.__island; e.skipTutorial(); data.featureFlags.events = false; e.state.money = 50000; e.learningStatus = () => ({locked: false}); for (let z = 0; z < e.state.world.size; z++) for (let x = 0; x < e.state.world.size; x++) if (e.place('basketball', x, z).ok) return true; });
await page.evaluate(() => window.__island.games.stages('streetSlam')); await page.locator('[data-action=hoops-play-next]').click(); if (await page.locator('[data-action=game-understood]').count()) await page.locator('[data-action=game-understood]').click();
await page.waitForFunction(() => { const s = window.__island.games.current?.session?.snapshot; return s?.error || s?.renderMetrics?.calls > 0 && s.renderMetrics.players === 10; }, null, {timeout: 240000});
await page.waitForTimeout(3000); await page.screenshot({path: out}); console.log(JSON.stringify({errors})); await browser.close(); process.exit(0);
