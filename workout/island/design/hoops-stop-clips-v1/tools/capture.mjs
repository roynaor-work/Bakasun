// SPDX-License-Identifier: CC0-1.0
// Render actual GLB animation frames in Chromium (WASM blocked): 8 frames x 4 camera angles per clip, composed into verification/sheets/<id>.png.
// usage: node capture.mjs [clipId,clipId,...]   (env PLAYWRIGHT_MODULE, CHROMIUM_PATH, PYTHON, HOOPS_CLIPS_PREVIEW_URL)
import fs from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/node-tools/node_modules/playwright/index.mjs');
const base = new URL('../', import.meta.url), out = new URL('verification/', base);
const catalog = JSON.parse(await fs.readFile(new URL('runtime/catalog.json', base)));
const only = process.argv[2] ? process.argv[2].split(',') : null;
await fs.mkdir(new URL('sheets/', out), {recursive: true});
const temp = mkdtempSync(`${tmpdir()}/hoops-stop-clips-v1-frames-`);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors']});
const page = await browser.newPage({viewport: {width: 1400, height: 1000}}), errors = [], requests = [];
const capCss = 'header.page-head,aside.library,.transport,.clip-detail,.display-options,footer,.stage-top,.view-controls,.stage-bottom{display:none!important}main.layout{display:block!important;padding:0!important}.stage{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;border-radius:0!important;margin:0!important}#stage{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}';
await page.addInitScript(() => { for (const key of ['compile', 'compileStreaming', 'instantiate', 'instantiateStreaming']) WebAssembly[key] = () => { throw new Error('WASM disabled for asset verification'); }; });
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => requests.push(r.url()));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(process.env.HOOPS_CLIPS_PREVIEW_URL ?? 'http://127.0.0.1:8765/workout/island/design/hoops-stop-clips-v1/preview.html');
await page.waitForFunction(() => window.hoopsClips?.ready());
await page.setViewportSize({width: 560, height: 500});
await page.addStyleTag({content: capCss});
await page.evaluate(() => window.hoopsClips.zoom(.62));
const views = ['three', 'side', 'front', 'back'], captures = [];
for (const clip of catalog.clips.filter(c => c.asset && (!only || only.includes(c.id)))) {
  await page.evaluate(id => window.hoopsClips.select(id), clip.id);
  const n = Math.round(clip.duration * 30), times = Array.from({length: 8}, (_, i) => Math.round((clip.loop ? n * i / 8 : n * i / 7)) / 30);
  for (const v of views) {
    await page.evaluate(v => window.hoopsClips.view(v), v);
    for (let i = 0; i < times.length; i++) {
      await page.evaluate(t => { window.hoopsClips.seek(t); window.hoopsClips.render(); }, times[i]);
      await page.locator('#stage').screenshot({path: `${temp}/${clip.id}-${v}-${i}.png`});
    }
  }
  captures.push({id: clip.id, times, views, path: `sheets/${clip.id}.png`});
}
await fs.writeFile(`${temp}/captures.json`, JSON.stringify(captures));
const compose = spawnSync(process.env.PYTHON ?? 'python3', [fileURLToPath(new URL('compose-sheets.py', import.meta.url)), temp, fileURLToPath(new URL('sheets/', out))], {encoding: 'utf8'});
if (compose.status !== 0) throw new Error(`Sheet composition: ${compose.stderr}`);
if (!only) {
  await page.addStyleTag({content: '*{}'});
  await page.reload(); await page.waitForFunction(() => window.hoopsClips?.ready());
  await page.setViewportSize({width: 1400, height: 1000});
  await page.screenshot({path: fileURLToPath(new URL('preview-desktop.png', out)), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: fileURLToPath(new URL('preview-mobile.png', out)), fullPage: true});
}
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const wasmRequests = requests.filter(url => /\.wasm|draco/i.test(url));
const evidence = {clipsLoaded: captures.map(c => c.id), captures, viewports: [{width: 1400, height: 1000}, {width: 390, height: 844}], errors, mobileOverflow, webAssemblyBlocked: true, wasmRequests, networkOrigins: [...new Set(requests.map(url => new URL(url).origin))], passed: !errors.length && !mobileOverflow && !wasmRequests.length};
if (!only) await fs.writeFile(new URL('browser.json', out), JSON.stringify(evidence, null, 2) + '\n');
await browser.close();
await fs.rm(temp, {recursive: true, force: true});
console.log(JSON.stringify({passed: evidence.passed, clips: evidence.clipsLoaded, errors}, null, 1));
if (!evidence.passed) process.exitCode = 1;
