/** Real browser regression for the shipped island CSP; QA only.
 * node verification/csp-browser.mjs [/tmp/csp-report.md]
 * Runtime assets remain self-contained; only this QA reads island/index.html.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const delivery = process.env.SOCCER_DELIVERY_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const islandHTML = await fs.readFile(path.resolve(delivery, '../../index.html'), 'utf8');
const policies = [...islandHTML.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/gi)];
assert.equal(policies.length, 1, 'The actual island index must declare exactly one CSP');
const policy = policies[0][1];
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const fixture = `
const workerURLs = [], workerInstances = [];
const OriginalWorker = globalThis.Worker;
globalThis.Worker = class extends OriginalWorker {
  constructor(url, options) { workerURLs.push(String(url)); super(url, options); this.__terminated = false; workerInstances.push(this); }
  terminate() { this.__terminated = true; return super.terminate(); }
};
const mode = new URL(import.meta.url).searchParams.get('mode'), begun = performance.now();
let library, draco, timer;
try {
  if (mode === 'blob') {
    const [{ DRACOLoader }, { GLTFLoader }] = await Promise.all([
      import('/runtime/vendor/DRACOLoader.js'), import('/runtime/vendor/GLTFLoader.js')
    ]);
    draco = new DRACOLoader().setDecoderPath('/runtime/vendor/draco/').setDecoderConfig({ type: 'wasm' }).setWorkerLimit(1);
    await Promise.race([
      new GLTFLoader().setDRACOLoader(draco).loadAsync('/runtime/player.glb'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Blob decoder did not finish')), 4000); })
    ]);
    window.__result = { ok: true, workers: workerURLs };
  } else if (mode.startsWith('missing-wasm')) {
    if (mode === 'missing-wasm-preload') {
      const [{ LocalDRACOLoader }, { GLTFLoader }] = await Promise.all([
        import('/runtime/LocalDRACOLoader.mjs'), import('/runtime/vendor/GLTFLoader.js')
      ]);
      draco = new LocalDRACOLoader().setDecoderPath('/runtime/vendor/draco/').setDecoderConfig({ type: 'wasm' }).setWorkerLimit(1);
      draco.preload();
      await new Promise(resolve => setTimeout(resolve, 10));
      await new GLTFLoader().setDRACOLoader(draco).loadAsync('/runtime/player.glb');
    } else {
      const { loadLibrary } = await import('/runtime/controller.mjs');
      library = await loadLibrary();
    }
    window.__result = { ok: true, workers: workerURLs };
  } else {
    const [{ loadLibrary, createController }, { clips }] = await Promise.all([
      import('/runtime/controller.mjs'), import('/runtime/catalog.mjs')
    ]);
    library = await loadLibrary();
    const played = [];
    for (const role of ['field', 'keeper']) {
      const controller = createController(library, { role, autoReturn: false });
      try {
        for (const clip of clips.filter(clip => clip.role === role)) {
          controller.reset(clip.id).update(Math.min(.3, clip.duration / 2));
          if (controller.id !== clip.id || !library.animations.get(clip.id)?.tracks.length) throw Error('Native clip missing: ' + clip.id);
          controller.root.traverse(node => {
            if (node.isBone && ![...node.position.toArray(), ...node.quaternion.toArray()].every(Number.isFinite)) throw Error('Non-finite clip: ' + clip.id);
          });
          played.push(clip.id);
        }
      } finally { controller.dispose(); }
    }
    window.__result = { ok: true, expected: clips.map(clip => clip.id), loaded: [...library.animations.keys()], played, workers: workerURLs };
  }
} catch (error) {
  window.__result = { ok: false, error: error.message, workers: workerURLs };
} finally {
  clearTimeout(timer); library?.dispose(); draco?.dispose();
  window.__result.ms = performance.now() - begun;
  window.__result.liveWorkers = workerInstances.filter(worker => !worker.__terminated).length;
  for (const worker of workerInstances) worker.terminate();
}
`;

test('the exact runtime loads every clip with a static worker under the actual island CSP', { timeout: 120_000 }, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
  const requests = [];
  const inputs = [];
  for (const name of ['controller.mjs', 'LocalDRACOLoader.mjs', 'draco-worker.js', 'catalog.mjs', 'player.glb', 'keeper.glb']) {
    const bytes = await fs.readFile(path.join(delivery, 'runtime', name));
    inputs.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  let activeMode;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      requests.push(url.pathname);
      const headers = { 'Cache-Control': 'no-store' };
      const send = (contentType, body, extra = {}) => {
        response.writeHead(200, { ...headers, 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body), ...extra });
        response.end(body);
      };
      if (url.pathname === '/fixture.html') {
        return send('text/html', `<!doctype html><meta charset="utf-8"><title>CSP loading regression</title><script type="module" src="/fixture.mjs?mode=${url.searchParams.get('mode') ?? 'static'}"></script>`, { 'Content-Security-Policy': policy });
      }
      if (url.pathname === '/fixture.mjs') {
        return send('text/javascript', fixture);
      }
      if (activeMode?.startsWith('missing-wasm') && url.pathname === '/runtime/vendor/draco/draco_decoder.wasm') {
        const body = 'Missing WASM regression fixture';
        response.writeHead(404, { ...headers, 'Content-Type': 'application/wasm', 'Content-Length': Buffer.byteLength(body) });
        return response.end(body);
      }
      if (url.pathname === '/favicon.ico') return response.writeHead(204).end();
      const file = path.resolve(delivery, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(path.resolve(delivery) + path.sep)) return response.writeHead(403).end();
      const body = await fs.readFile(file);
      send(mime[path.extname(file)] ?? 'application/octet-stream', body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const observations = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const mode of ['static', 'blob', 'missing-wasm', 'missing-wasm-preload']) {
      activeMode = mode;
      const context = await browser.newContext(), violations = [], errors = [], external = [], headers = [], failed = [], unhandled = [];
      await context.exposeBinding('__recordUnhandled', (_, value) => unhandled.push(value));
      await context.exposeBinding('__recordCSP', (_, value) => violations.push(value));
      await context.addInitScript(() => {
        addEventListener('unhandledrejection', event => {
          window.__recordUnhandled(String(event.reason?.message ?? event.reason)).catch(() => {});
        });
        addEventListener('securitypolicyviolation', event => {
          window.__recordCSP({ directive: event.effectiveDirective, blockedURI: event.blockedURI, policy: event.originalPolicy }).catch(() => {});
        });
      });
      context.on('console', message => {
        if (/content[- ]security[- ]policy|violates.*directive|refused.*(?:script|worker)|\bCSP\b/i.test(message.text())) violations.push({ console: message.text() });
      });
      context.on('pageerror', error => errors.push(error.message));
      context.on('requestfailed', request => failed.push({ url: request.url(), reason: request.failure()?.errorText }));
      context.on('response', response => headers.push({ url: response.url(), type: response.headers()['content-type'], csp: response.headers()['content-security-policy'] }));
      context.on('request', request => {
        const url = new URL(request.url());
        if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url());
      });
      const page = await context.newPage(), start = requests.length;
      try {
        await page.goto(`${origin}/fixture.html?mode=${mode}`);
        await page.waitForFunction(() => window.__result, null, { timeout: mode.startsWith('missing-wasm') ? 5_000 : 90_000 });
        await page.evaluate(() => Promise.resolve());
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = await page.evaluate(() => window.__result), fetched = requests.slice(start);
        assert.equal(external.length, 0, 'Loading attempted an external request');
        assert.ok(headers.filter(row => row.type?.includes('text/html')).every(row => row.csp === policy), 'Fixture HTML changed or omitted the island CSP');
        assert.ok(headers.filter(row => !row.type?.includes('text/html')).every(row => row.csp === undefined), 'JS/worker responses must reproduce the existing server without inherited HTML CSP');
        if (mode === 'static') {
          assert.equal(result.ok, true, result.error);
          assert.deepEqual(result.loaded.toSorted(), result.expected.toSorted());
          assert.deepEqual(result.played.toSorted(), result.expected.toSorted());
          assert.deepEqual(errors, []); assert.deepEqual(violations, []); assert.deepEqual(unhandled, []);
          assert.deepEqual(result.workers, [`${origin}/runtime/draco-worker.js`]);
          for (const resource of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) assert.equal(fetched.filter(url => url.endsWith('/' + resource)).length, 1, resource + ' must load once for both roles');
        } else if (mode === 'blob') {
          assert.equal(result.ok, false, 'The old Blob worker unexpectedly loaded under the strict policy');
          assert.ok(result.workers.some(url => url.startsWith('blob:')), 'Positive control never constructed its Blob worker');
          assert.ok(violations.some(value => value.blockedURI?.startsWith('blob:') || /worker|blob:/i.test(value.console ?? '')), 'Positive control failed without an observed CSP violation');
        } else {
          assert.equal(result.ok, false, mode + ': missing decoder unexpectedly loaded');
          assert.match(result.error, /HTTP 404/, mode + ': the missing packaged decoder error was lost');
          assert.ok(result.ms < 4000, mode + ': load rejection was not prompt');
          assert.deepEqual(errors, [], mode + ': an uncaught page error escaped');
          assert.deepEqual(unhandled, [], mode + ': an unhandled rejection escaped');
          assert.deepEqual(violations, [], mode + ': missing bytes caused a CSP violation');
          assert.deepEqual(result.workers, [], mode + ': a worker started without decoder bytes');
          assert.equal(result.liveWorkers, 0, mode + ': a worker survived the failed load');
          assert.equal(fetched.filter(url => url.endsWith('/draco_decoder.wasm')).length, 1, mode + ': missing decoder fixture was not requested exactly once');
        }
        observations.push({ mode, result, fetched, violations, errors, unhandled, failed: [...failed] });
      } finally { await context.close(); }
    }
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  for (const input of inputs) {
    const bytes = await fs.readFile(path.join(delivery, 'runtime', input.name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), input.sha256, 'CSP audit input changed while running: ' + input.name);
  }
  const positive = observations[0], control = observations[1];
  const report = ['# Existing island CSP loading check', '', `Measured UTC: ${new Date().toISOString()}. Real headless Chromium, local HTTP responses.`, '',
    'The HTML response carries the exact policy read from island/index.html. JavaScript, the classic static worker and WASM receive no CSP header, matching the repository server. No policy was relaxed.', '',
    `- Native clips loaded and played: ${positive.result.played.length}/${positive.result.expected.length}.`,
    '- Static worker instances: 1. Decoder wrapper requests: 1. WASM requests: 1.',
    `- Runtime CSP violations: ${positive.violations.length}. Runtime page errors: ${positive.errors.length}. External requests: 0. Failed requests before teardown: ${positive.failed.length}.`,
    `- Old Blob worker positive control: blocked; ${control.violations.length} observed CSP records.`,
    ...observations.slice(2).map(row => `- ${row.mode}: rejected HTTP404 in ${row.result.ms.toFixed(2)}ms; unhandled rejections ${row.unhandled.length}; page errors ${row.errors.length}; workers ${row.result.workers.length}; live workers ${row.result.liveWorkers}.`), '',
    '## Transport observations before teardown', '',
    ...(positive.failed.length ? positive.failed.map(value => `- ${value.reason}: ${new URL(value.url).pathname}`) : ['No failed requests observed.']), '',
    'These observations were captured after decode settled and before context closure; they are not attributed to teardown.', '', '## Exact HTML policy', '', '```', policy, '```', '',
    '## Positive-control evidence', '', ...control.violations.map(value => `- ${value.console ?? `${value.directive}: ${value.blockedURI}`}`), '',
    '## Exact runtime inputs', '', '| File | Bytes | SHA-256 |', '| --- | ---: | --- |',
    ...inputs.map(input => `| runtime/${input.name} | ${input.bytes} | ${input.sha256} |`), ''].join('\n');
  const output = process.argv[2] ?? path.join(tmpdir(), 'soccer-v8-csp-report.md');
  await fs.writeFile(output, report);
  // Write the evidence before asserting so an actual transport failure keeps
  // its pre-teardown diagnostic instead of leaving a stale passing report.
  assert.deepEqual(positive.failed, [], 'A runtime request failed before teardown; see ' + output);
  console.log(`CSP: all ${positive.result.played.length} clips loaded, static worker clean, Blob control blocked. Report: ${output}`);
});
