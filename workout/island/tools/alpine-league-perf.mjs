/** Ski league v23 cost of the theme art: the regular ski stage 1 against one league stage of each theme, on the same autopilot
 * (tools/perf-alpine.html, league=n), one after another in one Chromium (844x390 phone landscape, WebGL on SwiftShader: the numbers are
 * relative, a phone's GPU is not measured). Per run: frame pacing, JS cost per frame, render share, triangles and draw calls at the end and
 * the triangle audit by category (2.5 s into the race).
 * Usage: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/google-chrome node workout/island/tools/alpine-league-perf.mjs [--seconds 20] [--quality low]
 * Writes verification/alpine-league-v23/perf.json. On a shared machine SwiftShader can take seconds a frame: the wait is generous. */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium} from '../../../tests/helpers/island-browser.mjs';

const OUT = fileURLToPath(new URL('../verification/alpine-league-v23/', import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const seconds = Number(arg('--seconds', 20)), quality = arg('--quality', null);
const RUNS = [{label: 'ski stage 1 (v22.1)', query: 'stage=1'}, ...[['pine', 2], ['ice', 7], ['lava', 13], ['aurora', 17], ['village', 22], ['peak', 28]].map(([theme, n]) => ({label: `league ${n} · ${theme}`, query: `league=${n}`, theme}))];
await mkdir(OUT, {recursive: true});
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, isMobile: true, deviceScaleFactor: 1});
const report = {when: new Date().toISOString(), viewport: [844, 390], renderer: 'SwiftShader (relative numbers)', seconds, quality: quality || 'auto', runs: []};
try {
  for (const run of RUNS) {
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.url + `tools/perf-alpine.html?${run.query}&seconds=${seconds}&seed=7&autostart=1${quality ? `&quality=${quality}` : ''}`, {waitUntil: 'load'});
    await page.waitForFunction(() => window.__perf?.done, null, {timeout: (seconds + 1500) * 1000});
    const r = await page.evaluate(() => window.__perf.result || {error: window.__perf.error});
    const pick = a => { if (!a?.categories) return null; const rows = Object.entries(a.categories); return {tris: rows.reduce((n, [, v]) => n + v.tris, 0), shadowTris: rows.reduce((n, [, v]) => n + v.shadowTris, 0), byTag: Object.fromEntries(rows.map(([k, v]) => [k, v.tris]).sort((x, y) => y[1] - x[1]))}; };
    report.runs.push({label: run.label, theme: run.theme ?? null, avgFps: r.avgFps, frameMs: r.frameMs, over33: r.over33, over50: r.over50, tickMs: r.tickMs, parts: r.parts, loadMs: r.loadMs,
      render: r.render, auditHigh: pick(r.auditHigh), themeMetrics: r.themeMetrics, error: r.error ?? null, errors});
    console.error(`· ${run.label}: ${r.avgFps} fps, frame p50 ${r.frameMs?.p50} p95 ${r.frameMs?.p95} ms, render ${r.parts?.render} ms, ${r.render?.triangles} triangles, ${r.render?.calls} calls`);
    await page.close();
  }
} finally { await writeFile(OUT + 'perf.json', JSON.stringify(report, null, 1) + '\n'); await browser.close(); await server.close(); }
