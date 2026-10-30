#!/usr/bin/env node
// No bundler or test server dependency. Run from any working directory.
import { createServer } from 'node:http';
import { readFile, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[i + 1];
}
if (args.includes('--help')) {
  console.log('node test-viewer.mjs --serve');
  console.log('node test-viewer.mjs [--out directory] [--channel chrome] [--executable browser] [--character id] [--game id]');
  console.log('--serve opens a local static server only; no Playwright installation or build is needed.');
  console.log('PLAYWRIGHT_MODULE may point to the installed playwright package or its index.mjs.');
  process.exit(0);
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    let modulePath = resolve(process.env.PLAYWRIGHT_MODULE);
    if ((await stat(modulePath)).isDirectory()) modulePath = resolve(modulePath, 'index.mjs');
    return import(pathToFileURL(modulePath).href);
  }
  try { return await import('playwright'); }
  catch (original) {
    // The desktop runtime keeps its packages next to node/bin; this also works
    // when this script has no node_modules or package.json of its own.
    const runtimePackage = resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs');
    try { return await import(pathToFileURL(runtimePackage).href); }
    catch { throw new Error('Install playwright or set PLAYWRIGHT_MODULE to its package path.', { cause: original }); }
  }
}

const allCharacters = ['soccer-player', 'goalkeeper', 'basketball-player', 'skier'];
const allGames = ['soccer', 'hoops', 'alpine'];
const selectedCharacter = option('--character', null);
const selectedGame = option('--game', null);
if (selectedCharacter && !allCharacters.includes(selectedCharacter)) throw new Error(`Unknown character ${selectedCharacter}`);
if (selectedGame && !allGames.includes(selectedGame)) throw new Error(`Unknown game ${selectedGame}`);
const characters = selectedCharacter ? [selectedCharacter] : allCharacters;
const games = selectedGame ? [selectedGame] : allGames;
const viewports = [{ width: 844, height: 390 }, { width: 390, height: 844 }];
const output = resolve(option('--out', resolve(here, 'verification')));
await mkdir(output, { recursive: true });
const islandRoot = await realpath(resolve(here, '../..'));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405); response.end(); return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = await realpath(resolve(islandRoot, `.${pathname}`));
    const inside = relative(islandRoot, target);
    if (inside.startsWith('..') || isAbsolute(inside) || !(await stat(target)).isFile()) {
      response.writeHead(403); response.end(); return;
    }
    response.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(target));
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400);
    response.end();
  }
});
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const origin = `http://127.0.0.1:${server.address().port}`;
if (args.includes('--serve')) {
  console.log(`Viewer: ${origin}/design/viewer/viewer.html`);
  console.log('Local files only. Press Ctrl+C to stop the server.');
  await new Promise(accept => {
    const stop = () => server.close(accept);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  process.exit(0);
}
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  launchFlags: ['--use-gl=angle', '--use-angle=swiftshader'],
  scope: { characters, games, viewports, cpuFramesPerCase: 100 },
  measurements: 'Browser JavaScript CPU work per frame, not GPU time or native mobile performance.',
  cases: [], infrastructureErrors: [], pass: false,
};
const evidenceFiles = [
  'design/viewer/viewer.html', 'design/viewer/viewer.js', 'design/viewer/animation.js',
  'design/viewer/retarget.js', 'design/viewer/retarget-map.json', 'design/viewer/checks.js',
  'design/viewer/test-viewer.mjs', 'design/viewer/draco/DRACOLoader.js',
  'design/viewer/draco/draco_wasm_wrapper.js', 'design/viewer/draco/draco_decoder.wasm',
  'design/characters/rig.json', ...allCharacters.map(id => `design/characters/${id}.glb`),
  ...allGames.map(id => `design/motion/${id}.json`),
];
async function evidenceHashes() {
  return Object.fromEntries(await Promise.all(evidenceFiles.map(async name => [name,
    createHash('sha256').update(await readFile(resolve(islandRoot, name))).digest('hex')])));
}
let browser;
let context;
let page;
try {
  report.sourceSha256 = await evidenceHashes();
  const { chromium } = await loadPlaywright();
  const executablePath = option('--executable', process.env.PLAYWRIGHT_EXECUTABLE_PATH);
  const channel = option('--channel', process.env.PLAYWRIGHT_CHANNEL);
  const launch = { headless: true, args: report.launchFlags };
  if (executablePath) launch.executablePath = executablePath;
  else if (channel) launch.channel = channel;
  try { browser = await chromium.launch(launch); }
  catch (error) {
    // Chrome may be installed even when Playwright's optional browser download is absent.
    if (executablePath || channel || !/Executable doesn't exist/.test(error.message)) throw error;
    launch.channel = 'chrome';
    browser = await chromium.launch(launch);
  }
  report.browser = { version: browser.version(), channel: launch.channel || 'bundled-chromium', executable: executablePath || null };
  for (const viewport of viewports) {
    context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const diagnostics = { pageErrors: [], consoleErrors: [], nonLocalRequests: [], failedRequests: [], httpErrors: [] };
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (!url.startsWith('blob:') && !url.startsWith('data:') && new URL(url).origin !== origin) {
        diagnostics.nonLocalRequests.push(url);
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
    page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }); });
    await page.goto(`${origin}/design/viewer/viewer.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.viewerTest));
    await page.evaluate(async () => { await window.viewerTest.ready; });
    for (const character of characters) for (const game of games) {
      const key = `${character}-${game}-${viewport.width}x${viewport.height}`;
      console.log(`Checking ${key}`);
      const result = { character, game, viewport, screenshot: `${key}.png`, pass: false };
      report.cases.push(result);
      const before = Object.fromEntries(Object.entries(diagnostics).map(([name, values]) => [name, values.length]));
      try {
        result.report = await page.evaluate(async options => window.viewerTest.runAllChecks(options), { character, game });
        const missing = ['retarget', 'support', 'loop', 'transition', 'floor', 'cpu']
          .filter(name => typeof result.report?.checks?.[name]?.pass !== 'boolean');
        result.contractErrors = [];
        if (missing.length) result.contractErrors.push(`Missing explicit check results: ${missing.join(', ')}`);
        if (result.report?.checks?.cpu?.frames !== 100) result.contractErrors.push('CPU measurement must contain exactly 100 frames');
        if (result.report?.viewport?.width !== viewport.width || result.report?.viewport?.height !== viewport.height) {
          result.contractErrors.push('Measured viewport differs from requested viewport');
        }
        if (result.report?.character !== character || result.report?.game !== game) result.contractErrors.push('Measured assets differ from requested assets');
        await page.evaluate(async ({ game }) => {
          window.viewerTest.pause();
          await window.viewerTest.selectClip({ soccer: 'kick', hoops: 'shoot', alpine: 'pole_push' }[game]);
          window.viewerTest.seek({ soccer: 0.24, hoops: 0.42, alpine: 0.30 }[game]);
          if (window.viewerTest.render) await window.viewerTest.render();
        }, { game });
        await page.screenshot({ path: resolve(output, result.screenshot) });
        result.diagnostics = Object.fromEntries(Object.entries(diagnostics).map(([name, values]) => [name, values.slice(before[name])]));
        result.pass = result.report?.pass === true && result.contractErrors.length === 0
          && Object.values(result.diagnostics).every(values => values.length === 0);
      } catch (error) {
        result.error = error.stack || String(error);
        result.diagnostics = Object.fromEntries(Object.entries(diagnostics).map(([name, values]) => [name, values.slice(before[name])]));
        try { await page.screenshot({ path: resolve(output, result.screenshot) }); } catch { /* report retains the original failure */ }
      }
      await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${key}`);
    }
    if (Object.values(diagnostics).some(values => values.length)) {
      report.infrastructureErrors.push({ viewport, ...diagnostics });
    }
    await context.close(); context = null; page = null;
  }
  report.pass = report.cases.length === characters.length * games.length * viewports.length
    && report.cases.every(result => result.pass) && report.infrastructureErrors.length === 0;
  const finalHashes = await evidenceHashes();
  const changed = evidenceFiles.filter(name => finalHashes[name] !== report.sourceSha256[name]);
  if (changed.length) {
    report.infrastructureErrors.push({ changedDuringRun: changed });
    report.pass = false;
  }
} catch (error) {
  report.infrastructureErrors.push({ fatal: error.stack || String(error) });
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise(accept => server.close(accept));
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`${report.pass ? 'PASS' : 'FAIL'}: ${report.cases.filter(result => result.pass).length}/${report.cases.length} cases; ${resolve(output, 'report.json')}`);
process.exitCode = report.pass ? 0 : 1;
