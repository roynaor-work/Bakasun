/** Measured stress probe, not a claim about physical phone GPU performance.
 * Requires Playwright/Chromium only for QA, never for the shipped runtime.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const delivery = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(delivery, `.${pathname}`);
    if (!file.startsWith(delivery)) return response.writeHead(403).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
const rows = [], errors = [];
const inputNames = ['player.glb', 'keeper.glb', 'catalog.mjs', 'controller.mjs', 'contact-solver.mjs', 'LocalDRACOLoader.mjs', 'draco-worker.js'];
async function inputHashes() {
  const result = [];
  for (const name of inputNames) {
    const bytes = await fs.readFile(new URL(`../runtime/${name}`, import.meta.url));
    result.push([name, createHash('sha256').update(bytes).digest('hex'), bytes.length]);
  }
  return result;
}
const initial = await inputHashes();
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  context.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') errors.push(`External request: ${url.href}`);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`);
  await page.waitForFunction(() => window.motionPreview?.ready, { timeout: 90_000 });
  await page.evaluate(() => window.motionPreview.setPlaying(false));
  for (const count of [1, 12]) {
    await page.evaluate(async count => {
      const api = window.motionPreview;
      const { createController } = await import('./runtime/controller.mjs');
      for (const actor of window.benchmarkActors ?? []) actor.dispose();
      for (const child of api.scene.children) if (child.name.startsWith('soccer-motion-v8')) child.visible = false;
      window.benchmarkActors = Array.from({ length: count }, (_, i) => {
        const role = count === 12 && i >= 10 ? 'keeper' : 'field';
        const actor = createController(api.library, { role, autoReturn: true });
        actor.play(role === 'field' ? 'dribble' : 'keeper_throw');
        actor.root.position.set(count === 1 ? 0 : (i % 6 - 2.5) * 1.45, 0, count === 1 ? 0 : Math.floor(i / 6) * 2 - 1);
        api.scene.add(actor.root);
        return actor;
      });
      api.camera.position.set(count === 1 ? 1.8 : 4.5, count === 1 ? 2 : 6.5, count === 1 ? 5.5 : 15);
      api.camera.lookAt(0, .8, 0);
      api.camera.updateMatrixWorld();
      for (let i = 0; i < 45; i++) {
        for (const actor of window.benchmarkActors) actor.update(1 / 30);
        api.renderer.render(api.scene, api.camera);
      }
    }, count);
    for (const rate of [1, 4]) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate });
      const result = await page.evaluate(async () => {
        const api = window.motionPreview, cpu = [], intervals = [];
        let last;
        for (let i = 0; i < 135; i++) {
          const timestamp = await new Promise(resolve => requestAnimationFrame(resolve));
          if (last !== undefined && i > 15) intervals.push(timestamp - last);
          last = timestamp;
          const begin = performance.now();
          for (const actor of window.benchmarkActors) actor.update(1 / 30);
          api.renderer.render(api.scene, api.camera);
          if (i > 15) cpu.push(performance.now() - begin);
        }
        const quantile = (values, q) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) * q)];
        return { cpu50: quantile(cpu, .5), cpu95: quantile(cpu, .95), interval50: quantile(intervals, .5), interval95: quantile(intervals, .95),
          calls: api.renderer.info.render.calls, triangles: api.renderer.info.render.triangles,
          geometries: api.renderer.info.memory.geometries, textures: api.renderer.info.memory.textures,
          renderer: api.renderer.getContext().getParameter(api.renderer.getContext().RENDERER) };
      });
      rows.push({ count, rate, ...result });
      console.log(`${count} actors / CPU×${rate}: CPU p95=${result.cpu95.toFixed(2)}ms, rAF p95=${result.interval95.toFixed(2)}ms, ${result.triangles} triangles, ${result.calls} draws`);
      await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await session.detach();
    }
  }
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const hashes = initial.map(([name, hash, size]) => `- runtime/${name}: ${hash} (${size} bytes)`);
const unchanged = JSON.stringify(initial) === JSON.stringify(await inputHashes());
await fs.writeFile(new URL('./benchmark.md', import.meta.url), [
  '# Browser stress probe', '', `Measured UTC: ${new Date().toISOString()}. Chromium headless, ANGLE SwiftShader, 390×844 CSS pixels, DPR=1.5.`,
  'One actor demonstrates library cost; twelve actors test shared geometry/materials with ten field players and two keepers. All actors use independent skeletons and native animation mixers. Includes the preview floor, lights and ball. No real-time shadow-map pass.',
  'Cloud CPU throttling does not emulate phone GPU, thermals, browser driver or memory bandwidth. These numbers are bounded engineering evidence for the 30fps target; physical midrange-phone verification remains separate.', '',
  '| Actors | CPU multiplier | Animation + render CPU p50/p95 (ms) | rAF p50/p95 (ms) | Triangles | Draw calls | Geometry / texture objects |',
  '| ---: | ---: | --- | --- | ---: | ---: | --- |',
  ...rows.map(row => `| ${row.count} | ${row.rate} | ${row.cpu50.toFixed(2)}/${row.cpu95.toFixed(2)} | ${row.interval50.toFixed(2)}/${row.interval95.toFixed(2)} | ${row.triangles} | ${row.calls} | ${row.geometries}/${row.textures} |`),
  '', `Runtime inputs unchanged: ${unchanged}. Page errors: ${errors.length}.`, ...errors.map(error => `- ${error}`), '', '## Runtime inputs', '', ...hashes, ''
].join('\n'));
if (errors.length || !unchanged) process.exitCode = 1;
