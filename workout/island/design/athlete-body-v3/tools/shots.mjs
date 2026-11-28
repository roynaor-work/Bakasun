// CC0-1.0. Stills of design/athlete-body-v3/preview.html in Chromium (software WebGL).
// Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/design/athlete-body-v3/tools/shots.mjs <outDir> [body=soccer] [clip=soccer-v9/idle] [t=0.2] [extra query]
//        Needs a static server on the repository root: python3 -m http.server 8791
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT || 'playwright');
const out = path.resolve(process.argv[2] || '/tmp/v3shots');
const args = Object.fromEntries(process.argv.slice(3).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; }));
await mkdir(out, {recursive: true});
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:8791';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1500, height: 1000}, deviceScaleFactor: 1});
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const q = new URLSearchParams({body: args.body || 'soccer', clip: args.clip || 'soccer-v9/idle', ...Object.fromEntries(Object.entries(args).filter(([k]) => !['body', 'clip', 't', 'tag'].includes(k)))});
await page.goto(`${origin}/workout/island/design/athlete-body-v3/preview.html?${q}`);
await page.waitForFunction(() => window.previewReady || document.getElementById('status')?.textContent.startsWith('התצוגה'), null, {timeout: 120000});
const status = await page.evaluate(() => document.getElementById('status').textContent);
console.log(status);
await page.evaluate(t => window.v3Preview.setTime(t), Number(args.t || 0.2));
await page.waitForTimeout(300);
const tag = args.tag || (args.body || 'soccer');
await page.screenshot({path: path.join(out, tag + '-grid.png'), fullPage: false});
for (const id of ['front', 'three', 'side', 'back', 'face', 'hands', 'feet', 'torso']) {
  const el = page.locator(`.view[data-view="${id}"]`); await el.scrollIntoViewIfNeeded(); await page.evaluate(() => window.v3Preview.render()); await page.waitForTimeout(80);
  await el.screenshot({path: path.join(out, `${tag}-${id}.png`)});
}
console.log(JSON.stringify({errors}));
await browser.close();
