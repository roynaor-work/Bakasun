#!/usr/bin/env node
/** Read-only contact visibility audit. Writes Markdown evidence, never assets.
 * Projects the actual merged ball and skinned effector vertices into the real
 * viewport and compares them with actual HUD DOM rectangles. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const delivery = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node verification/visibility-browser.mjs [--out report.md]\nOptional: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium\n');
  process.exit(0);
}
if (args.some((arg, index) => arg !== '--out' && args[index - 1] !== '--out') || args.filter(arg => arg === '--out').length > 1 || args.at(-1) === '--out') {
  throw new Error('Only --out report.md is supported; use --help for usage.');
}
const output = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : fileURLToPath(new URL('./visibility-report.md', import.meta.url));
const started = new Date();
const issues = [], results = [], covered = new Set();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.replaceAll(String.fromCharCode(92), '/');
async function allFiles(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await allFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
async function inputHashes() {
  const files = [resolve(delivery, 'preview.html'), resolve(delivery, 'preview.css'), resolve(delivery, 'preview.mjs'), script, ...await allFiles(resolve(delivery, 'runtime'))].sort();
  return Promise.all(files.map(async path => { const bytes = await readFile(path); return { path: slash(relative(delivery, path)), bytes: bytes.length, sha: sha(bytes) }; }));
}
const before = await inputHashes();
const fingerprint = hashes => sha(hashes.map(file => `${file.path}\t${file.bytes}\t${file.sha}\n`).join(''));
async function playwright() {
  const choices = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE] : ['playwright', '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'];
  for (const choice of choices) {
    try { const module = await import(isAbsolute(choice) ? pathToFileURL(choice).href : choice); return module.chromium || module.default?.chromium; }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('Playwright is required for this optional browser audit. Set PLAYWRIGHT_MODULE to an installed module; the runtime itself needs no npm install.');
}
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/preview.html' : url.pathname);
    const path = resolve(delivery, '.' + pathname);
    if (!path.startsWith(delivery)) throw new Error('Path outside the delivery.');
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end(); }
});
let browser, browserVersion = 'unavailable', clipCount = 0;
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const chromium = await playwright();
  let executablePath = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (!executablePath) { try { await access('/usr/bin/chromium'); executablePath = '/usr/bin/chromium'; } catch { /* Use Playwright's installed browser. */ } }
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      issues.push(`External request blocked: ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => issues.push(`Page error: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') issues.push(`Console: ${message.text()}`); });
  await page.addInitScript(() => {
    window.visibilityAuditCSP = [];
    addEventListener('securitypolicyviolation', event => window.visibilityAuditCSP.push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.motionPreview?.ready, null, { timeout: 120000 });
  await page.evaluate(() => motionPreview.setPlaying(false));
  const ids = await page.evaluate(() => [...motionPreview.library.metadata.keys()]);
  clipCount = ids.length;
  if (clipCount < 14) issues.push(`Only ${clipCount} clips were available.`);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const id of ids) for (const camera of ['near', 'far']) {
      const rows = await page.evaluate(({ id, camera }) => {
        const preview = motionPreview;
        preview.select(id); preview.setCamera(camera);
        const meta = preview.controller.metadata;
        const events = meta.events.filter(event => ['contact', 'release'].includes(event.type));
        const controlledIds = new Set(['first_touch_moving', 'dribble', 'turn_with_ball', 'cut', 'receive_foot', 'receive_chest', 'shield']);
        const possessedAtStart = new Set(['dribble', 'turn_with_ball', 'cut', 'shield']);
        const controlledFrom = !controlledIds.has(id) ? null : possessedAtStart.has(id) ? 0 : Math.min(...events.filter(event => event.type === 'contact').map(event => event.time));
        const anchors = [...events.map(event => event.time), ...(controlledFrom === null ? [] : [controlledFrom, meta.duration])];
        const samples = [...anchors];
        if (controlledFrom !== null) {
          for (let frame = 0; controlledFrom + frame / 30 < meta.duration; frame++) samples.push(controlledFrom + frame / 30);
          samples.push(...(meta.ball?.keys || []).map(key => key.time).filter(time => time >= controlledFrom && time <= meta.duration));
          samples.push(...(meta.travel || []).map(key => key.time).filter(time => time >= controlledFrom && time <= meta.duration));
        }
        const times = [...new Set(samples.map(time => anchors.find(anchor => Math.abs(time - anchor) < 1e-8) ?? time))].sort((a, b) => a - b);
        const selectors = ['.camera-switch', '.stage-caption h2', '.stage-index', '.stage-caption div>span', '.view-hint', '.stage-kicker'];
        const overlays = selectors.map(selector => ({ selector, rect: document.querySelector(selector).getBoundingClientRect() })).filter(({ rect }) => rect.width && rect.height);
        const stage = document.querySelector('#stage').getBoundingClientRect();
        const rows = [];
        const vector = () => preview.camera.position.clone();
        const project = point => { point.project(preview.camera); return { x: stage.left + (point.x + 1) * stage.width / 2, y: stage.top + (1 - point.y) * stage.height / 2 }; };
        function record(mesh, points, time, cues) {
          if (!points.length) { rows.push({ time, cues, mesh, vertices: 0, box: null, hits: ['missing weighted contact geometry'], outside: false, clearance: 0, pass: false }); return; }
          const box = { left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)), top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)) };
          const hits = overlays.filter(({ rect }) => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top).map(({ selector }) => selector);
          const outside = box.left < stage.left - .5 || box.right > stage.right + .5 || box.top < stage.top - .5 || box.bottom > stage.bottom + .5;
          const clearance = Math.min(...overlays.map(({ rect }) => Math.hypot(Math.max(rect.left - box.right, box.left - rect.right, 0), Math.max(rect.top - box.bottom, box.top - rect.bottom, 0))));
          rows.push({ time, cues, mesh, vertices: points.length, box, hits, outside, clearance, pass: !hits.length && !outside });
        }
        const ballCandidates = preview.scene.children.filter(object => object.isGroup && object.children.length === 1 && object.children[0].isMesh && object.children[0].material.vertexColors);
        if (ballCandidates.length !== 1) return [{ time: 0, cues: '', mesh: 'ball', vertices: 0, box: null, hits: [`Expected one merged ball mesh; found ${ballCandidates.length}`], outside: false, clearance: 0, pass: false }];
        const ball = ballCandidates[0].children[0];
        for (const time of times) {
          preview.controller.seek(time); preview.render();
          const labels = events.filter(event => Math.abs(event.time - time) < 1e-6).map(event => event.type);
          if (controlledFrom !== null && time >= controlledFrom - 1e-7) labels.push('controlled');
          const cues = [...new Set(labels)].join('+');
          const positions = ball.geometry.attributes.position, ballPoints = [];
          for (let vertex = 0; vertex < positions.count; vertex++) ballPoints.push(project(vector().fromBufferAttribute(positions, vertex).applyMatrix4(ball.matrixWorld)));
          record('ball', ballPoints, time, cues);
          for (const bone of new Set(events.filter(event => Math.abs(event.time - time) < 1e-6).map(event => event.bone))) {
            const cue = events.find(event => event.bone === bone && Math.abs(event.time - time) < 1e-6);
            const surface = preview.controller.actor.localToWorld(vector().fromArray(cue.position));
            const points = [];
            preview.controller.actor.traverse(mesh => {
              if (!mesh.isSkinnedMesh) return;
              const boneIndex = mesh.skeleton.bones.findIndex(joint => joint.name === bone);
              if (boneIndex < 0) return;
              const attributes = mesh.geometry.attributes;
              for (let vertex = 0; vertex < attributes.position.count; vertex++) {
                let weight = 0;
                for (let component = 0; component < 4; component++) if (attributes.skinIndex.getComponent(vertex, component) === boneIndex) weight += attributes.skinWeight.getComponent(vertex, component);
                if (weight < .5) continue;
                const point = mesh.getVertexPosition(vertex, vector()).applyMatrix4(mesh.matrixWorld);
                if (['Chest', 'Head'].includes(bone) && point.distanceTo(surface) > .18) continue;
                points.push(project(point));
              }
            });
            record(bone, points, time, cues);
          }
        }
        return rows;
      }, { id, camera });
      covered.add(`${id}:${viewport.width}x${viewport.height}:${camera}`);
      results.push(...rows.map(row => ({ id, viewport: `${viewport.width}x${viewport.height}`, camera, ...row })));
    }
    process.stdout.write(`Checked ${viewport.width}×${viewport.height}: ${ids.length} clips, both cameras.\n`);
  }
  const violations = await page.evaluate(() => window.visibilityAuditCSP || []);
  issues.push(...violations.map(violation => `CSP violation: ${violation}`));
  if (!results.length) issues.push('No actual contact geometry was checked.');
} catch (error) { issues.push(error.stack || String(error)); }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const after = await inputHashes();
const stable = fingerprint(before) === fingerprint(after);
if (!stable) issues.push('Input files changed during this audit; results do not describe one coherent delivery.');
const failed = results.filter(result => !result.pass);
const pass = !issues.length && !failed.length && results.length > 0 && covered.size === clipCount * 4;
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const coordinates = box => box ? [box.left, box.top, box.right, box.bottom].map(value => value.toFixed(1)).join(', ') : '—';
const report = [
  '# Actual ball and effector geometry versus HUD', '',
  `Result: **${pass ? 'PASS' : 'FAIL'}**. ${results.length - failed.length}/${results.length} actual mesh checks clear; ${covered.size} clip/view/camera combinations; ${clipCount} native clips loaded.`, '',
  `Contact/release rows: ${results.filter(result=>/contact|release/.test(result.cues)).length}. Controlled-ball rows: ${results.filter(result=>result.mesh==='ball'&&result.cues.split('+').includes('controlled')).length}.`, '',
  `Started: ${started.toISOString()}. Finished: ${new Date().toISOString()}. Chromium ${browserVersion}.`,
  `Inputs unchanged during the run: ${stable ? 'yes' : 'NO'}. Input fingerprint: \`${fingerprint(before)}\`.`, '',
  'The audit samples every unique contact/release time at 390×844 and 844×390, near and far. It additionally checks controlled-ball phases at 30 Hz and every ball/travel key: dribble, shield, turn and cut from the start; moving first touch and foot/chest receive from first contact through the end. Incoming distant balls and outgoing free flight are excluded. It projects the real merged ball vertices and skinned vertices with at least 0.5 weight on the contacting bone. Chest/head checks use the actual weighted surface within 0.18 m of the cue; hand/foot checks use the whole weighted effector. It compares their projected bounds with the live camera switch, title, index, subtitle, orbit hint and stage label DOM rectangles. Coordinates and clearance are CSS pixels. Outgoing passes, shots and parries are excluded after their release cues. This is a software-rendered visibility check, not a phone FPS measurement.', '',
  'Re-run with `node verification/visibility-browser.mjs`; optionally set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`, or pass `--out report.md`.', '',
  '| Clip | View | Camera | Time s | Cues | Mesh | Vertices | Bounds x0,y0,x1,y1 | HUD clearance px | Result |',
  '| --- | --- | --- | ---: | --- | --- | ---: | --- | ---: | --- |',
  ...results.map(result => `| ${result.id} | ${result.viewport} | ${result.camera} | ${result.time.toFixed(6)} | ${result.cues} | ${result.mesh} | ${result.vertices} | ${coordinates(result.box)} | ${Number.isFinite(result.clearance) ? result.clearance.toFixed(2) : '—'} | ${result.pass ? 'PASS' : escape([...result.hits, ...(result.outside ? ['outside stage'] : [])].join(', '))} |`), '',
  '## Input SHA-256', '',
  '| File | Bytes | SHA-256 |', '| --- | ---: | --- |',
  ...before.map(file => `| ${escape(file.path)} | ${file.bytes} | \`${file.sha}\` |`), '',
  '## Runtime and audit errors', '',
  ...(issues.length ? issues.map(issue => `- ${escape(issue)}`) : ['None.']), ''
].join('\n');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, report);
process.stdout.write(`${pass ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} actual mesh visibility checks. Report: ${output}\n`);
if (!pass) process.exitCode = 1;
