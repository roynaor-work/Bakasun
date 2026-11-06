/** Sustained real-time rendering and transition-cache audit.
 * node verification/soak-browser.mjs --seconds 2700
 * This is a continuous workload, not a timer masquerading as verification.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const delivery = fileURLToPath(new URL('../', import.meta.url));
const flag = process.argv.indexOf('--seconds');
const seconds = flag >= 0 ? Number(process.argv[flag + 1]) : 2700;
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 7200) throw new Error('Duration must be 10–7200 seconds');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
async function runtimeHashes() {
  const result = [];
  async function walk(directory) {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else { const bytes = await fs.readFile(target); result.push([path.relative(delivery, target), createHash('sha256').update(bytes).digest('hex'), bytes.length]); }
    }
  }
  await walk(path.join(delivery, 'runtime'));
  return result;
}
const initial = await runtimeHashes();
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const target = path.resolve(delivery, `.${pathname}`);
    if (!target.startsWith(delivery)) return response.writeHead(403).end();
    const bytes = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Content-Length': bytes.length });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const rows = [], errors = [], started = new Date();
let browser, summary;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  context.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') errors.push(`External request: ${url.href}`);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`);
  await page.waitForFunction(() => window.motionPreview?.ready, { timeout: 90_000 });
  await page.evaluate(() => window.motionPreview.setPlaying(false));
  await page.evaluate(async duration => {
    const api = window.motionPreview;
    const { createController } = await import('./runtime/controller.mjs');
    const { clips, transitions } = await import('./runtime/catalog.mjs');
    for (const child of api.scene.children) if (child.name.startsWith('soccer-motion-v8')) child.visible = false;
    const state = window.soak = { started: performance.now(), last: 0, cpu: [], intervals: [], frames: 0, events: 0, switches: 0, rejected: 0, visited: {}, edges: {}, done: false };
    const actors = Array.from({ length: 12 }, (_, index) => {
      const role = index < 10 ? 'field' : 'keeper';
      const actor = createController(api.library, { role, autoReturn: true, onEvent: () => state.events++ });
      actor.root.position.set((index % 6 - 2.5) * 1.45, 0, Math.floor(index / 6) * 2 - 1);
      api.scene.add(actor.root);
      return { actor, role, next: index, actions: clips.filter(clip => clip.role === role && !['idle', 'keeper_ready'].includes(clip.id)).map(clip => clip.id) };
    });
    state.actors = actors;
    api.camera.position.set(4.5, 6.5, 15); api.camera.lookAt(0, .8, 0); api.camera.updateMatrixWorld();
    function frame(now) {
      if (state.done) return;
      const interval = state.last ? now - state.last : 0;
      const dt = state.last ? Math.min(interval / 1000, .1) : 1 / 60;
      state.last = now;
      const begin = performance.now();
      for (const item of actors) {
        const actor = item.actor, home = item.role === 'field' ? 'idle' : 'keeper_ready';
        const before = actor.id;
        state.visited[before] = true;
        if (actor.id === home && actor.time > .25) {
          const next = item.actions[item.next++ % item.actions.length];
          if (actor.play(next)) state.switches++; else state.rejected++;
        } else if (actor.metadata.loop && actor.id !== home && actor.time > actor.metadata.duration * 1.7) {
          if (actor.request('stop')) state.switches++; else state.rejected++;
        }
        const afterRequest = actor.id;
        if (before !== afterRequest) state.edges[`${before}->${afterRequest}`] = true;
        actor.update(dt);
        if (afterRequest !== actor.id) state.edges[`${afterRequest}->${actor.id}`] = true;
        state.visited[actor.id] = true;
      }
      api.renderer.render(api.scene, api.camera);
      const cost = performance.now() - begin;
      if (state.frames++ > 90) { state.cpu.push(cost); if (interval) state.intervals.push(interval); }
      if (now - state.started >= duration * 1000) { state.done = true; return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, seconds);
  const session = await context.newCDPSession(page);
  // GC snapshots reveal retained heap/cache growth. The render workload runs
  // continuously between snapshots, cycling every authored action through its
  // home-to-action and automatic-return/stop edges. The separate graph audit
  // tests every legal edge, including action-to-action interrupts.
  for (;;) {
    await page.waitForTimeout(Math.min(30_000, seconds * 1000));
    await session.send('HeapProfiler.collectGarbage');
    const snapshot = await page.evaluate(() => {
      const state = window.soak, api = window.motionPreview;
      const quantile = (array, p) => array.toSorted((a, b) => a - b)[Math.floor((array.length - 1) * p)] ?? 0;
      const result = { elapsed: (performance.now() - state.started) / 1000, frames: state.frames, events: state.events, switches: state.switches, rejected: state.rejected, visited: Object.keys(state.visited).sort(), edges: Object.keys(state.edges).sort(),
        cpu50: quantile(state.cpu, .5), cpu95: quantile(state.cpu, .95), interval50: quantile(state.intervals, .5), interval95: quantile(state.intervals, .95),
        heap: performance.memory?.usedJSHeapSize ?? null, actions: state.actors.map(item => item.actor.mixer._actions.length), bindings: state.actors.map(item => item.actor.mixer._bindings.length),
        geometries: api.renderer.info.memory.geometries, textures: api.renderer.info.memory.textures, triangles: api.renderer.info.render.triangles, calls: api.renderer.info.render.calls, done: state.done };
      state.cpu.length = 0; state.intervals.length = 0;
      return result;
    });
    rows.push(snapshot);
    console.log(`${snapshot.elapsed.toFixed(0)}s: ${snapshot.frames} frames, ${snapshot.switches} switches, ${snapshot.events} cues; clips ${snapshot.visited.length}/25, edges ${snapshot.edges.length}; CPU95 ${snapshot.cpu95.toFixed(2)}ms, rAF95 ${snapshot.interval95.toFixed(2)}ms; heap ${(snapshot.heap / 1e6).toFixed(2)}MB; actions ${Math.max(...snapshot.actions)}, textures ${snapshot.textures}`);
    if (snapshot.done) { summary = snapshot; break; }
  }
  await session.detach(); await context.close();
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
const sameInputs = JSON.stringify(initial) === JSON.stringify(await runtimeHashes());
const ended = new Date();
await fs.writeFile(new URL('./soak.md', import.meta.url), [
  '# Sustained browser rendering audit', '', `Started UTC: ${started.toISOString()}. Ended UTC: ${ended.toISOString()}. Requested workload: ${seconds} seconds.`,
  '12 independent native animation controllers (10 field, 2 keepers), all actions selected repeatedly through the legal graph; continuously update and draw. 390×844 CSS pixels, DPR=1.5, Chromium/ANGLE SwiftShader. No real-time shadow-map pass.',
  'Each row covers the previous 30 seconds; retained heap is measured after explicit browser GC. Heap collection briefly interrupts work and is not a phone thermal test. Cloud CPU/GPU timings do not establish physical midrange-phone performance.',
  `Runtime inputs unchanged: ${sameInputs}. Page errors: ${errors.length}.`, ...errors.map(error => `- ${error}`), '',
  `Distinct clips visited: ${summary?.visited.length}/25. Distinct home/action/return edges exercised: ${summary?.edges.length}. The separate transition audit covers all 80 legal edges.`, '',
  '| Workload seconds | Frames | Legal switches | Cues | Rejections | CPU p50/p95 ms | rAF p50/p95 ms | Retained heap MB | Max cached actions / bindings | Geometry / texture objects | Draws / triangles |',
  '| ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | --- | --- |',
  ...rows.map(row => `| ${row.elapsed.toFixed(1)} | ${row.frames} | ${row.switches} | ${row.events} | ${row.rejected} | ${row.cpu50.toFixed(2)}/${row.cpu95.toFixed(2)} | ${row.interval50.toFixed(2)}/${row.interval95.toFixed(2)} | ${(row.heap / 1e6).toFixed(3)} | ${Math.max(...row.actions)}/${Math.max(...row.bindings)} | ${row.geometries}/${row.textures} | ${row.calls}/${row.triangles} |`),
  '', '## Exact runtime inputs', '', ...initial.map(([name, hash, size]) => `- ${name}: ${hash} (${size} bytes)`), ''
].join('\n'));
if (!sameInputs || errors.length || !summary?.done || summary.switches < 10 || summary.rejected || (seconds >= 300 && summary.visited.length !== 25)) process.exitCode = 1;
