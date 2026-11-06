/** Reproducible browser evidence, deliberately separate from game runtime.
 * node source/render-review.mjs 01
 * node source/render-review.mjs 01 --clips shot,keeper_dive_high_left
 * --quick captures three representative clips; it never claims a full round.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const delivery = path.resolve(here, '..');
const repo = path.resolve(delivery, '../../../..');
const args = process.argv.slice(2);
const round = args.shift();
if (!/^\d{2}$/.test(round ?? '')) {
  throw new Error('Usage: node source/render-review.mjs NN [--clips id,id] [--quick]');
}
const argument = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
const quick = args.includes('--quick');
const requested = argument('--clips')?.split(',').filter(Boolean);
const { clips: allClips } = await import(pathToFileURL(path.join(delivery, 'runtime/catalog.mjs')));
const selection = requested ?? (quick ? ['shot', 'receive_chest', 'keeper_dive_high_left'] : allClips.map(clip => clip.id));
const clips = selection.map(id => {
  const info = allClips.find(clip => clip.id === id);
  if (!info) throw new Error(`Unknown clip ${id}`);
  return info;
});
if (new Set(selection).size !== selection.length) throw new Error('Duplicate clip selection');
const fullRound = clips.length === allClips.length && !quick;
const output = path.join(delivery, 'iterations', round);
try { if ((await fs.readdir(output)).length) throw new Error(`Evidence directory already exists: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.mkdir(path.join(output, 'frames'), { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `soccer-v8-${round}-`));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const requireTool = createRequire('/opt/codex/cua_node/lib/node_modules/tooling.cjs');
const sharp = requireTool(process.env.SHARP_MODULE ?? 'sharp');
const sha = buffer => createHash('sha256').update(buffer).digest('hex');

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name), absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(absolute, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unexpected non-regular input ${absolute}`);
  }
  return files;
}

async function provenance() {
  const names = (await filesIn(path.join(delivery, 'runtime'))).map(name => `runtime/${name}`);
  for (const name of ['preview.html', 'preview.css', 'preview.mjs']) names.push(name);
  for (const name of await filesIn(here)) names.push(`source/${name}`);
  const entries = [];
  for (const name of names.sort()) {
    const buffer = await fs.readFile(path.join(delivery, name));
    entries.push({ name, hash: sha(buffer), size: buffer.byteLength });
  }
  return { entries, hash: sha(Buffer.from(entries.map(entry => `${entry.hash}  ${entry.name}\n`).join(''))) };
}

function captureTimes(clip) {
  const mandatory = mandatoryTimes(clip);
  if (mandatory.length > 8) {
    throw new Error(`${clip.id}: ${mandatory.length} mandatory cue times exceed the eight-frame budget; split the review explicitly`);
  }
  // Seed exact event times first. Fill the largest remaining temporal gaps;
  // mandatory contact/release/landing samples can never overwrite one another.
  const times = [...mandatory];
  while (times.length < 8) {
    let gapIndex = 0;
    for (let index = 1; index < times.length - 1; index++) {
      if (times[index + 1] - times[index] > times[gapIndex + 1] - times[gapIndex]) gapIndex = index;
    }
    const midpoint = (times[gapIndex] + times[gapIndex + 1]) / 2;
    if (!(midpoint > times[gapIndex] && midpoint < times[gapIndex + 1])) {
      throw new Error(`${clip.id}: cannot produce eight distinct capture times`);
    }
    times.splice(gapIndex + 1, 0, midpoint);
  }
  if (times.length !== 8 || times.some((time, index) => index && time <= times[index - 1]) ||
      mandatory.some(time => !times.includes(time))) {
    throw new Error(`${clip.id}: mandatory cue capture assertion failed`);
  }
  return times;
}

function mandatoryTimes(clip) {
  const times = [...new Set(mandatoryCues(clip).map(cue => cue.time))].sort((a, b) => a - b);
  if (!(clip.duration > 0) || times.some(time => !Number.isFinite(time) || time < 0 || time > clip.duration)) {
    throw new Error(`${clip.id}: invalid mandatory capture time`);
  }
  return times;
}

function mandatoryCues(clip) {
  return [
    { type: 'start', time: 0 }, { type: 'end', time: clip.duration },
    ...clip.events.filter(event => ['contact', 'release', 'land', 'takeoff'].includes(event.type))
  ];
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const filename = path.resolve(repo, `.${pathname}`);
    if (filename !== repo && !filename.startsWith(`${repo}${path.sep}`)) { response.writeHead(403).end(); return; }
    const stat = await fs.stat(filename);
    if (!stat.isFile()) { response.writeHead(404).end(); return; }
    const data = await fs.readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream',
      'Content-Length': data.byteLength,
      'Cache-Control': 'no-store'
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const previewURL = `http://127.0.0.1:${address.port}/${path.relative(repo, delivery).split(path.sep).join('/')}/preview.html`;
const started = new Date();
const initial = await provenance();
const errors = [], networkEvents = [], pendingDiagnostics = [], observations = [], timings = [], frameRecords = [];
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
const cameras = ['near', 'far'];
let browser;

function readable(value) { return String(value).replaceAll('|', '\\|').replaceAll('\n', ' '); }
function number(value, digits = 2) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function csv(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function stamp(state, kind, detail, extra = {}) {
  return {
    utc: new Date().toISOString(), elapsedMs: Date.now() - started.getTime(),
    viewport: state.viewport, phase: state.phase, camera: state.camera ?? '', clip: state.clip ?? '',
    ready: state.ready, kind, detail, category: 'application-observation', ...extra
  };
}
async function atomicWrite(filename, content) {
  const staging = `${filename}.pending`;
  await fs.writeFile(staging, content);
  await fs.rename(staging, filename);
}

function contactVisibilityEvidence() {
  const contacts = [], overlays = [], overlayKeys = new Set();
  for (const record of frameRecords) {
    const clip = clips.find(clip => clip.id === record.id);
    for (let index = 0; index < record.times.length; index++) {
      const seconds = record.times[index], snapshot = record.snapshots[index];
      const cues = clip.events.filter(cue => ['contact', 'release'].includes(cue.type) && Math.abs(cue.time - seconds) < 1e-7);
      if (!cues.length) continue;
      if (!Array.isArray(snapshot.criticalContacts) || !Array.isArray(snapshot.overlayRects)) {
        throw new Error(`${clip.id}: preview snapshot omits criticalContacts/overlayRects at ${seconds}s`);
      }
      const common = { clip: clip.id, viewport: record.viewport, camera: record.camera, frame: index + 1, seconds };
      for (const point of snapshot.criticalContacts) {
        if (Math.abs(point.time - seconds) >= 1e-7) continue;
        const isBall = point.type === 'ball' || point.kind === 'ball';
        const type = point.type ?? point.kind?.split(':')[0];
        const bone = isBall ? '' : point.bone ?? point.kind?.slice(point.kind.indexOf(':') + 1) ?? '';
        const types = isBall ? [...new Set(cues.map(cue => cue.type))] : [type];
        if (!point.disk || !Array.isArray(point.occludedBy) || typeof point.outsideStage !== 'boolean') {
          throw new Error(`${clip.id}: incomplete measured visibility point at ${seconds}s`);
        }
        for (const eventType of types) {
          if (!cues.some(cue => cue.type === eventType && (isBall || cue.bone === bone))) continue;
          contacts.push({ ...common, type: eventType, bone, point: isBall ? 'ball' : 'effector',
            x: point.disk.x, y: point.disk.y, radiusPx: point.disk.r, radiusMeters: point.radius,
            occludedBy: [...point.occludedBy], outsideStage: point.outsideStage });
        }
      }
      for (const rect of snapshot.overlayRects) {
        // Keep each distinct measured rectangle once per clip/view/camera;
        // a rectangle that actually moves receives another row at that time.
        const key = [clip.id, record.viewport, record.camera, rect.name, rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].join('|');
        if (overlayKeys.has(key)) continue;
        overlayKeys.add(key);
        overlays.push({ ...common, name: rect.name, left: rect.left, top: rect.top, right: rect.right,
          bottom: rect.bottom, width: rect.width, height: rect.height });
      }
    }
  }
  const contactCSV = [
    ['clip', 'viewport', 'camera', 'frame', 'seconds', 'type', 'bone', 'point', 'center_x_px', 'center_y_px', 'radius_px', 'world_radius_m', 'occluded_by', 'outside_stage'],
    ...contacts.map(row => [row.clip, row.viewport, row.camera, row.frame, row.seconds, row.type, row.bone, row.point,
      row.x, row.y, row.radiusPx, row.radiusMeters, row.occludedBy.join(';'), row.outsideStage])
  ].map(row => row.map(csv).join(',')).join('\n') + '\n';
  const overlayCSV = [
    ['clip', 'viewport', 'camera', 'measured_at_seconds', 'name', 'left_px', 'top_px', 'right_px', 'bottom_px', 'width_px', 'height_px'],
    ...overlays.map(row => [row.clip, row.viewport, row.camera, row.seconds, row.name, row.left, row.top, row.right, row.bottom, row.width, row.height])
  ].map(row => row.map(csv).join(',')).join('\n') + '\n';
  return { contacts, overlays, contactCSV, overlayCSV };
}

async function montage(images, times, viewport, target, label) {
  const footer = 30, tileHeight = viewport.height + footer;
  const overlays = [];
  for (let index = 0; index < images.length; index++) {
    const left = (index % 4) * viewport.width, top = Math.floor(index / 4) * tileHeight;
    overlays.push({ input: images[index], left, top });
    const escaped = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${footer}"><rect width="100%" height="100%" fill="#101d2e"/><text x="10" y="20" fill="#d9ece9" font-family="sans-serif" font-size="12">${index + 1}/8 · ${times[index].toFixed(3)}s · ${escaped}</text></svg>`);
    overlays.push({ input: svg, left, top: top + viewport.height });
  }
  const canvas = sharp({ create: { width: viewport.width * 4, height: tileHeight * 2, channels: 3, background: '#101d2e' } }).composite(overlays);
  // A hard per-sheet budget keeps two complete evidence rounds comfortable
  // under the user's 60 MB cap without reducing the captured resolution.
  let buffer;
  for (const quality of [68, 58, 48, 38]) {
    buffer = await canvas.clone().webp({ quality, effort: 5, smartSubsample: true }).toBuffer();
    if (buffer.byteLength <= 245_000) break;
  }
  if (buffer.byteLength > 5_000_000) throw new Error(`Contact sheet exceeds file limit: ${target}`);
  await fs.writeFile(target, buffer);
  return { bytes: buffer.byteLength, hash: sha(buffer) };
}

async function inspectDOM(page, viewport, camera) {
  const dom = await page.evaluate(() => {
    const bounds = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    const visible = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden'; };
    const controls = [...document.querySelectorAll('button,input,select,a[role="button"]')].filter(visible).map(element => ({
      tag: element.tagName, id: element.id, label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 60) || element.id,
      bounds: bounds(element), named: Boolean(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.labels?.length || element.textContent?.trim())
    }));
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1, controls,
      smallControls: controls.filter(control => control.tag !== 'INPUT' && (control.bounds.width < 43.9 || control.bounds.height < 43.9)),
      unnamedControls: controls.filter(control => !control.named),
      offscreenControls: controls.filter(control => control.bounds.x < -1 || control.bounds.x + control.bounds.width > innerWidth + 1)
    };
  });
  observations.push({ viewport: `${viewport.width}x${viewport.height}`, camera, dom });
}

async function measure(page, viewport) {
  for (const rate of [1, 4]) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const result = await page.evaluate(async () => {
      const api = window.motionPreview, cpu = [], interval = [];
      api.setPlaying?.(false);
      api.controller?.resume();
      let previous;
      for (let index = 0; index < 91; index++) {
        const now = await new Promise(resolve => requestAnimationFrame(resolve));
        if (previous !== undefined) interval.push(now - previous);
        previous = now;
        const begin = performance.now();
        if (api.controller?.time >= api.controller?.metadata?.duration) {
          api.controller.reset('dribble');
          api.controller.resume();
        }
        api.controller?.update(1 / 30);
        api.render();
        cpu.push(performance.now() - begin);
      }
      api.controller?.pause();
      const stats = values => {
        const ordered = values.slice(5).sort((a, b) => a - b);
        return { p50: ordered[Math.floor(ordered.length * .5)], p95: ordered[Math.floor(ordered.length * .95)], max: ordered.at(-1) };
      };
      return { cpu: stats(cpu), interval: stats(interval), snapshot: await api.snapshot() };
    });
    timings.push({ viewport: `${viewport.width}x${viewport.height}`, rate, ...result });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
}

async function writeReport(status, failure = '') {
  await Promise.allSettled(pendingDiagnostics);
  const ended = new Date();
  const closingAborts = errors.filter(entry => entry.category === 'context-close-abort');
  const applicationIssues = errors.filter(entry => entry.category !== 'context-close-abort');
  const visibility = contactVisibilityEvidence();
  await atomicWrite(path.join(output, 'contact-visibility.csv'), visibility.contactCSV);
  await atomicWrite(path.join(output, 'overlay-rects.csv'), visibility.overlayCSV);
  const visibilityFiles = [
    { name: 'contact-visibility.csv', bytes: Buffer.byteLength(visibility.contactCSV), hash: sha(Buffer.from(visibility.contactCSV)) },
    { name: 'overlay-rects.csv', bytes: Buffer.byteLength(visibility.overlayCSV), hash: sha(Buffer.from(visibility.overlayCSV)) }
  ];
  const occludedRows = visibility.contacts.filter(point => point.occludedBy.length).length;
  const outsideRows = visibility.contacts.filter(point => point.outsideStage).length;
  const invalidDisks = visibility.contacts.filter(point => ![point.x, point.y, point.radiusPx, point.radiusMeters].every(Number.isFinite)).length;
  const report = [
    `# Browser capture ${round}`, '',
    `Status: ${status}. ${fullRound ? 'Complete clip matrix requested.' : 'Partial diagnostic capture; does not count as a complete round.'}`,
    `Started UTC: ${started.toISOString()}. Finished UTC: ${ended.toISOString()}. Elapsed: ${((ended - started) / 1000).toFixed(1)} s.`,
    `Input SHA-256: \`${initial.hash}\`.`,
    `Viewports: 390×844 and 844×390, deviceScaleFactor=1. Cameras: near and far. Eight actual native viewport captures per sheet.`,
    `Clips requested: ${clips.length}/${allClips.length}. Sheets completed: ${frameRecords.length}/${clips.length * 4}.`,
    '', 'These are Chromium/SwiftShader measurements on the cloud desktop. Fourfold CPU throttling is a stress probe; it does not establish physical phone GPU performance or 30 fps on a phone.',
    '', '## Console and loading', '', `Errors/warnings/failed requests: ${errors.length}.`,
    `Application loading/capture observations: ${applicationIssues.length}. Expected context-close aborts: ${closingAborts.length}. Both counts retain every observed record.`,
    'An abort is classified as context-close only when the preview was ready, the context is explicitly closing/closed, and the transport reports ERR_ABORTED. This describes teardown timing; it does not erase the request or claim that every aborted request was useful.',
    '', '| UTC timestamp | Elapsed ms | Viewport | Phase | Kind | Classification | Request began in | Detail |',
    '| --- | ---: | --- | --- | --- | --- | --- | --- |',
    ...errors.map(entry => `| ${entry.utc} | ${entry.elapsedMs} | ${entry.viewport} | ${entry.phase} | ${entry.kind} | ${entry.category} | ${entry.requestPhase ?? '—'} | ${readable(entry.detail)} |`),
    '', 'Runtime asset and decoder request lifecycle is retained in network.csv, including response status, resource type, start phase, and cancellation timestamps. HTTP failures also retain up to 240 characters of the actual response body.',
    'Local requests use the browser\'s ordinary transport without Playwright interception. The server sends exact Content-Length headers. A context request observer records and fails every non-local HTTP attempt; the page also carries the existing island CSP. All requestfailed records remain visible regardless of decode success.',
    ...(failure ? ['', `Failure: ${readable(failure)}`] : []),
    '', '## Viewport and controls', '',
    '| Viewport | Camera | Horizontal overflow | Controls <44 px | Unnamed | Offscreen horizontally | Document height |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...observations.map(entry => `| ${entry.viewport} | ${entry.camera} | ${entry.dom.overflow} | ${entry.dom.smallControls.length} | ${entry.dom.unnamedControls.length} | ${entry.dom.offscreenControls.length} | ${entry.dom.documentHeight} |`),
    '', ...observations.flatMap(entry => entry.dom.smallControls.map(control => `- ${entry.viewport}/${entry.camera}: small ${readable(control.label)} ${number(control.bounds.width)}×${number(control.bounds.height)} px.`)),
    ...observations.flatMap(entry => entry.dom.unnamedControls.map(control => `- ${entry.viewport}/${entry.camera}: unnamed ${control.tag} #${control.id}.`)),
    '', '## Render stress probe', '',
    '| Viewport | CPU multiplier | Animation + render CPU p50/p95 ms | rAF interval p50/p95 ms | Approx. rAF fps from p95 |',
    '| --- | ---: | --- | --- | ---: |',
    ...timings.map(entry => `| ${entry.viewport} | ${entry.rate} | ${number(entry.cpu.p50)}/${number(entry.cpu.p95)} | ${number(entry.interval.p50)}/${number(entry.interval.p95)} | ${number(1000 / entry.interval.p95, 1)} |`),
    '', '## Mandatory cue capture proof', '',
    'Every distinct start/end/contact/release/takeoff/landing time is seeded before filling the largest remaining gaps. A clip with more than eight mandatory times fails explicitly. No mandatory time is replaced by a nearby cue.',
    'cue-times.csv preserves this round\'s exact imported catalog cue contract, written before the browser starts. Historical rounds are compared with their own cue times even when later authoring changes durations or adds clips.',
    '', '| Clip | Exact mandatory seconds | Captured views containing every mandatory time |', '| --- | --- | ---: |',
    ...clips.map(clip => {
      const mandatory = mandatoryTimes(clip);
      const matching = frameRecords.filter(entry => entry.id === clip.id && mandatory.every(time => entry.times.includes(time))).length;
      return `| ${clip.id} | ${mandatory.map(time => String(time)).join(', ')} | ${matching}/4 |`;
    }),
    '', '## Contact and HUD visibility measurements', '',
    `Measured contact/release point rows: ${visibility.contacts.length}. Rows intersecting HUD rectangles: ${occludedRows}. Rows outside the stage: ${outsideRows}. Non-finite projected disk rows: ${invalidDisks}. Distinct measured HUD rectangles: ${visibility.overlays.length}.`,
    'Only exact contact/release cue frames are included. Ball measurements are listed once per cue type at that instant; contacting hand/foot measurements retain their bone. Disk centres and radii use absolute viewport CSS pixels. occluded_by and outside_stage are the preview\'s measured values; the capture tool assigns no visual score from them.',
    'overlay-rects.csv preserves each distinct actual HUD rectangle per clip/view/camera, including the first cue time at which it was measured.',
    '', '| Evidence file | Bytes | SHA-256 |', '| --- | ---: | --- |',
    ...visibilityFiles.map(file => `| ${file.name} | ${file.bytes} | ${file.hash} |`),
    '', '## Captured clip frames', '',
    '| Clip | Viewport | Camera | Seconds | Bytes | Sheet SHA-256 |', '| --- | --- | --- | --- | ---: | --- |',
    ...frameRecords.map(entry => `| ${entry.id} | ${entry.viewport} | ${entry.camera} | ${entry.times.map(time => time.toFixed(3)).join(', ')} | ${entry.bytes} | ${entry.hash} |`),
    '', '## Exact inputs', '', '| File | Bytes | SHA-256 |', '| --- | ---: | --- |',
    ...initial.entries.map(entry => `| ${entry.name} | ${entry.size} | ${entry.hash} |`), '',
    'Visual scores and corrective decisions belong in review.md after a human/model has inspected the actual images. This runner does not invent scores or visual verdicts.', ''
  ].join('\n');
  await atomicWrite(path.join(output, 'capture.md'), report);
  const measurements = [
    ['clip', 'viewport', 'camera', 'frame', 'seconds', 'draw_calls', 'triangles', 'textures', 'geometries', 'bbox_min_x', 'bbox_min_y', 'bbox_min_z', 'bbox_max_x', 'bbox_max_y', 'bbox_max_z', 'ndc_min_x', 'ndc_min_y', 'ndc_max_x', 'ndc_max_y', 'inside_camera'],
    ...frameRecords.flatMap(entry => entry.snapshots.map((snapshot, index) => {
      const projected = snapshot.bounds?.projected ?? [];
      const minX = Math.min(...projected.map(point => point[0])), minY = Math.min(...projected.map(point => point[1]));
      const maxX = Math.max(...projected.map(point => point[0])), maxY = Math.max(...projected.map(point => point[1]));
      return [entry.id, entry.viewport, entry.camera, index + 1, entry.times[index], snapshot.metrics?.drawCalls, snapshot.metrics?.triangles, snapshot.metrics?.textures, snapshot.metrics?.geometries,
        ...(snapshot.bounds?.min ?? ['', '', '']), ...(snapshot.bounds?.max ?? ['', '', '']),
        minX, minY, maxX, maxY, projected.length > 0 && minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1];
    }))
  ].map(row => row.map(csv).join(',')).join('\n') + '\n';
  await atomicWrite(path.join(output, 'measurements.csv'), measurements);
  const network = [
    ['utc', 'elapsed_ms', 'viewport', 'phase', 'camera', 'clip', 'kind', 'category', 'ready', 'request_began_utc', 'request_began_phase', 'resource_type', 'detail'],
    ...[...networkEvents, ...errors].sort((a, b) => a.elapsedMs - b.elapsedMs).map(entry => [entry.utc, entry.elapsedMs, entry.viewport,
      entry.phase, entry.camera, entry.clip, entry.kind, entry.category, entry.ready, entry.requestUTC, entry.requestPhase, entry.resourceType, entry.detail])
  ].map(row => row.map(csv).join(',')).join('\n') + '\n';
  await atomicWrite(path.join(output, 'network.csv'), network);
}

async function pruneOldEvidence() {
  const iterations = path.join(delivery, 'iterations');
  const directories = (await fs.readdir(iterations, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^\d{2}$/.test(entry.name)).map(entry => entry.name).sort();
  const retired = directories.slice(0, -2);
  if (!retired.length) return;
  const historyPath = path.join(iterations, 'history.md');
  let history;
  try { history = await fs.readFile(historyPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; history = '# Archived iterations\n\nOne line per retired round; only the latest two rounds retain images.\n\n'; }
  for (const old of retired) {
    const directory = path.join(iterations, old);
    let capture = '', review = '';
    try { capture = await fs.readFile(path.join(directory, 'capture.md'), 'utf8'); } catch {}
    try { review = await fs.readFile(path.join(directory, 'review.md'), 'utf8'); } catch {}
    const hash = capture.match(/Input SHA-256: `([^`]+)`/)?.[1] ?? 'not recorded';
    const brief = review.split('\n').filter(line => line.trim() && !line.startsWith('#')).slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 650) || 'Review was not yet recorded; do not infer a passing score.';
    const line = `- ${old} · SHA-256 ${hash} · ${brief}\n`;
    if (!history.includes(`- ${old} · SHA-256 `)) history += line;
    await fs.writeFile(historyPath, history);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

try {
  // Save the catalog's cue contract before the first browser capture. Older
  // retained rounds must be checked against their own timing, not a later edit.
  const cueRows = [
    ['clip', 'type', 'seconds'],
    ...clips.flatMap(clip => mandatoryCues(clip).map(cue => [clip.id, cue.type, cue.time]))
  ];
  for (const clip of clips) captureTimes(clip);
  await atomicWrite(path.join(output, 'cue-times.csv'), cueRows.map(row => row.map(csv).join(',')).join('\n') + '\n');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  for (const viewport of viewports) {
    const captureState = { viewport: `${viewport.width}x${viewport.height}`, phase: 'loading', ready: false, camera: '', clip: '' };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const externalRequests = [];
    const assertLocalRequests = () => {
      if (externalRequests.length) throw new Error(`Capture attempted ${externalRequests.length} non-local HTTP request(s); see network.csv`);
    };
    const page = await context.newPage();
    const requestStarts = new WeakMap();
    const requestExtra = request => ({
      requestUTC: requestStarts.get(request)?.utc ?? '', requestPhase: requestStarts.get(request)?.phase ?? '', resourceType: request.resourceType()
    });
    const runtimeRequest = request => new URL(request.url()).pathname.includes('/soccer-motion-v8/runtime/');
    context.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        const observation = stamp(captureState, 'external-request', `Non-local HTTP request: ${url.origin}${url.pathname}`);
        externalRequests.push(observation);
        errors.push(observation);
      }
      const entry = stamp(captureState, 'request-start', request.url(), { resourceType: request.resourceType() });
      requestStarts.set(request, entry);
      if (runtimeRequest(request)) networkEvents.push(entry);
    });
    context.on('requestfinished', request => {
      if (runtimeRequest(request)) networkEvents.push(stamp(captureState, 'request-finished', request.url(), requestExtra(request)));
    });
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) errors.push(stamp(captureState, `console-${message.type()}`, message.text()));
    });
    page.on('pageerror', error => errors.push(stamp(captureState, 'pageerror', error.message)));
    context.on('requestfailed', request => {
      const failure = request.failure()?.errorText ?? 'unknown transport failure';
      const isClosingAbort = captureState.ready && ['closing', 'closed'].includes(captureState.phase) && /ERR_ABORTED/.test(failure);
      errors.push(stamp(captureState, 'requestfailed', `${request.url()}: ${failure}`, {
        ...requestExtra(request), category: isClosingAbort ? 'context-close-abort' : 'application-observation'
      }));
    });
    context.on('response', response => {
      const request = response.request();
      if (runtimeRequest(request)) networkEvents.push(stamp(captureState, 'response', `HTTP ${response.status()}: ${response.url()}`, requestExtra(request)));
      if (response.status() >= 400) {
        const entry = stamp(captureState, 'http-error', `HTTP ${response.status()}: ${response.url()}`, requestExtra(request));
        errors.push(entry);
        pendingDiagnostics.push((async () => {
          try { entry.detail += `; Content-Type=${response.headers()['content-type'] ?? 'unspecified'}; body=${(await response.text()).slice(0, 240) || '(empty body)'}`; }
          catch (error) { entry.detail += `; response body unavailable: ${error.message}`; }
        })());
      }
    });
    await page.goto(previewURL, { waitUntil: 'networkidle' });
    assertLocalRequests();
    await page.waitForFunction(() => window.motionPreview?.ready === true, { timeout: 120_000 });
    await page.evaluate(() => window.motionPreview.setPlaying(false));
    assertLocalRequests();
    captureState.ready = true;
    captureState.phase = 'capturing';
    for (const camera of cameras) {
      captureState.camera = camera;
      await page.evaluate(camera => window.motionPreview.setCamera(camera), camera);
      await inspectDOM(page, viewport, camera);
      for (const clip of clips) {
        captureState.clip = clip.id;
        const times = captureTimes(clip), images = [], snapshots = [];
        await page.evaluate(async id => {
          const api = window.motionPreview;
          api.setPlaying?.(false); await api.select(id); api.controller?.pause();
        }, clip.id);
        for (let index = 0; index < times.length; index++) {
          await page.evaluate(async ({ seconds, camera }) => {
            const api = window.motionPreview;
            api.controller?.pause(); await api.seek(seconds); await api.setCamera(camera); await api.render();
            await new Promise(resolve => requestAnimationFrame(resolve));
            await api.render();
          }, { seconds: times[index], camera });
          snapshots.push(await page.evaluate(() => window.motionPreview.snapshot()));
          const filename = path.join(temporary, `${viewport.width}x${viewport.height}-${camera}-${clip.id}-${index}.png`);
          await page.screenshot({ path: filename, animations: 'disabled', caret: 'hide' });
          images.push(filename);
        }
        const name = `${clip.id}-${viewport.width}x${viewport.height}-${camera}.webp`;
        const result = await montage(images, times, viewport, path.join(output, 'frames', name), `${clip.id} / ${camera}`);
        frameRecords.push({ id: clip.id, viewport: `${viewport.width}x${viewport.height}`, camera, times, ...result, snapshots });
        if (clip.id === 'shot' || clip.id === 'keeper_dive_high_left') {
          const heroName = `${viewport.width}x${viewport.height}-${camera}-${clip.id}.webp`;
          // Four representative hero files total, not a duplicate of all frames.
          if ((clip.id === 'shot' && camera === 'near') || (clip.id === 'keeper_dive_high_left' && camera === 'far')) {
            await sharp(images[3]).webp({ quality: 78, effort: 4 }).toFile(path.join(output, heroName));
          }
        }
        for (const filename of images) await fs.unlink(filename);
        assertLocalRequests();
        process.stdout.write(`${round}: ${frameRecords.length}/${clips.length * 4} ${name} ${result.bytes} bytes\n`);
      }
    }
    captureState.phase = 'stress';
    captureState.clip = 'dribble';
    await page.evaluate(async () => { await window.motionPreview.select('dribble'); window.motionPreview.controller?.pause(); });
    await measure(page, viewport);
    assertLocalRequests();
    await Promise.allSettled(pendingDiagnostics);
    captureState.phase = 'closing';
    await context.close();
    captureState.phase = 'closed';
  }
  const final = await provenance();
  if (final.hash !== initial.hash) throw new Error('Inputs changed during capture; evidence is not a consistent build');
  await writeReport('captured');
  if (fullRound) await pruneOldEvidence();
  const totalBytes = (await filesIn(delivery)).reduce(async (previous, name) => (await previous) + (await fs.stat(path.join(delivery, name))).size, Promise.resolve(0));
  const size = await totalBytes;
  process.stdout.write(`Captured ${frameRecords.length} contact sheets / ${frameRecords.length * 8} native frames. Package ${size} bytes. Observations ${errors.filter(entry => entry.category !== 'context-close-abort').length}; context-close aborts ${errors.filter(entry => entry.category === 'context-close-abort').length}.\n`);
  if (size > 60_000_000) throw new Error('Delivery exceeds 60 MB; reduce evidence compression before accepting');
} catch (error) {
  await writeReport('failed', error.stack ?? String(error));
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(temporary, { recursive: true, force: true });
}
