#!/usr/bin/env node
/** Cold-context decoder regression. Development-only Playwright stays in /tmp.
 * Every failed request fails the check; no URL or cancellation is exempted.
 * --root may point to a frozen capture. Default: this delivered package.
 */
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {extname, resolve, dirname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = resolve(option('--root', packageRoot));
const rounds = Number(option('--rounds', '8'));
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 30) throw new Error('--rounds must be 1..30');
const output = resolve(option('--output', resolve(packageRoot, 'verification/DECODER-CURRENT.md')));
const {chromium} = await import(pathToFileURL(process.env.HOOPS_PLAYWRIGHT_PATH || '/tmp/hoops-motion-v8-browser/node_modules/playwright/index.mjs'));
const mime = {'.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gz': 'application/gzip'};
const trace = [], results = [], errors = [];
const runtimeSha256 = createHash('sha256').update(await readFile(resolve(root, 'runtime/library.mjs'))).digest('hex');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {response.writeHead(204); response.end(); return;}
    const path = resolve(root, '.' + pathname);
    if (!path.startsWith(root + sep)) throw new Error('Outside package');
    const bytes = await readFile(path);
    // Retain the original capture's chunked framing and routing so this check
    // exercises the cancellation regression instead of changing the server.
    response.writeHead(200, {'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    response.end(bytes);
  } catch {response.writeHead(404); response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({executablePath: process.env.HOOPS_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (let round = 0; round < rounds; round++) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const requests = new Map(), decoderRequests = new Map(), finished = new Set(), failed = [];
    const workerRequests = new Set(), workerFinished = new Set(), workers = [];
    cdp.on('Network.requestWillBeSent', event => {
      requests.set(event.requestId, event);
      if (event.request.url.includes('/runtime/vendor/draco/')) {decoderRequests.set(event.requestId, event); trace.push({round, event: 'request', ...event});}
    });
    cdp.on('Network.responseReceived', event => {if (decoderRequests.has(event.requestId)) trace.push({round, event: 'response', ...event});});
    cdp.on('Network.loadingFinished', event => {if (decoderRequests.has(event.requestId)) {finished.add(event.requestId); trace.push({round, event: 'finished', ...event});}});
    cdp.on('Network.loadingFailed', event => {const failure = {round, event: 'failed', request: requests.get(event.requestId), ...event}; failed.push(failure); trace.push(failure);});
    // Worker script/importScripts requests belong to worker CDP targets, so the
    // page's Network.loadingFinished stream alone cannot observe completion.
    // Playwright forwards those target events to the page request lifecycle.
    page.on('request', request => {if (request.url().includes('/runtime/vendor/draco/')) workerRequests.add(request);});
    page.on('requestfinished', request => {if (workerRequests.has(request)) {workerFinished.add(request); trace.push({round, event: 'request-finished', url: request.url(), type: request.resourceType()});}});
    page.on('requestfailed', request => {errors.push(`Context ${round}: ${request.url()}: ${request.failure()?.errorText}`);});
    page.on('worker', worker => workers.push(worker.url()));
    page.on('pageerror', error => errors.push(`Context ${round}: ${error.message}`));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/') || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
      errors.push(`External request: ${url}`); return route.abort();
    });
    await page.goto(origin + '/index.html?capture=1', {waitUntil: 'load'});
    await page.waitForFunction(() => window.__hoops);
    await page.evaluate(() => window.__hoops.ready);
    const clips = await page.evaluate(async () => {for (const clip of window.__hoops.clips) await window.__hoops.select(clip.id); return window.__hoops.clips.length;});
    await page.waitForLoadState('networkidle');
    const paths = [...workerRequests].map(request => new URL(request.url()).pathname);
    const wasmRequests = [...decoderRequests].filter(([, event]) => event.request.url.endsWith('/draco_decoder.wasm'));
    const wasmCompleted = wasmRequests.every(([id]) => finished.has(id));
    const pass = clips >= 15 && failed.length === 0 && paths.length === 5 && workerFinished.size === 5 && wasmCompleted &&
      paths.filter(path => path.endsWith('/draco_wasm_wrapper.js')).length === 2 && paths.filter(path => path.endsWith('/draco_decoder.wasm')).length === 1 &&
      paths.filter(path => path.endsWith('/draco-worker.js')).length === 2 && workers.length === 2 && workers.every(url => url.endsWith('/runtime/vendor/draco/draco-worker.js'));
    results.push({round, clips, requests: paths.length, completed: workerFinished.size, wasmCompleted, workers, failed: failed.length, pass});
    console.log(`${pass ? 'PASS' : 'FAIL'} cold context ${round + 1}: ${clips} clips, ${workerFinished.size}/${paths.length} decoder requests completed, ${failed.length} failed requests`);
    await context.close();
  }
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
const pass = errors.length === 0 && results.every(result => result.pass), testedAtUTC = new Date().toISOString();
const report = `# בדיקת טעינה קרה של מפענח Draco\n\n${pass ? 'PASS' : 'FAIL'} · ${testedAtUTC}\n\n` +
  `${rounds} הקשרי Chromium חדשים; כל הקשר טען בפועל את כל 15 הקליפים דרך GLTFLoader. HTTP מקומי עם chunked transfer, ללא cache, ועם אותו יירוט בקשות ששימש בצילום. כל כשל בקשה מכשיל את הבדיקה; אין סינון שגיאות לפי כתובת.\n\n` +
  `SHA-256 של runtime/library.mjs: \`${runtimeSha256}\`.\n\n` +
  `| הקשר | קליפים | בקשות מפענח | הושלמו ב־CDP | כשלים | תוצאה |\n|---:|---:|---:|---:|---:|---|\n` +
  results.map(result => `| ${result.round + 1} | ${result.clips} | ${result.requests} | ${result.completed} | ${result.failed} | ${result.pass ? 'PASS' : 'FAIL'} |`).join('\n') + '\n' +
  (errors.length ? `\n${errors.map(error => `- ${error}`).join('\n')}\n` : '');
await mkdir(dirname(output), {recursive: true});
await writeFile(output, report);
await writeFile(output.replace(/\.md$/i, '') + '.json.gz', gzipSync(JSON.stringify({testedAtUTC, runtimeSha256, root, rounds, results, errors, trace}), {level: 9}));
if (!pass) process.exitCode = 1;
