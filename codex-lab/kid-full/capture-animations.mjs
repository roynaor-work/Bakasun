/** Reproducible animation screenshots, UI checks and completed-draw timings.
 * Run: node capture-animations.mjs
 * Uses only the local lab server and writes only inside kid-full/.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const destination = resolve(root, 'shots/animations');
const reportPath = resolve(root, 'shots/animation-verification.json');
const work = resolve(root, 'work/animation-swiftshader-runtime');
const exerciseIds = ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge'];
const views = ['front', 'side'];
const stages = ['start', 'middle', 'end'];
const captureViewport = { width: 480, height: 720 };
const phoneViewport = { width: 390, height: 844 };
const minimumFPS = 40;
const maximumTriangles = 20000;
const trialCount = 3;
const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots-only');
const benchmarkOnly = args.includes('--benchmark-only');
assert(!(shotsOnly && benchmarkOnly), 'Choose either --shots-only or --benchmark-only');
await mkdir(destination, { recursive: true });
await mkdir(work, { recursive: true });

// Match the explicit SwiftShader runtime already used by capture.mjs. Actual
// GPU worker names and the renderer are observed in every fresh browser.
await writeFile(resolve(work, 'SwiftShader.ini'), '[Processor]\nThreadCount=3\n');
const launcher = resolve(work, 'launch-gpu.sh');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
await writeFile(launcher, '#!/bin/sh\ncd -- ' + shellQuote(work) + '\nexec "$@"\n');
await chmod(launcher, 0o755);
const softwareICD = process.env.SWIFTSHADER_ICD_PATH || '/usr/lib/chromium/vk_swiftshader_icd.json';
await readFile(softwareICD);
const flags = ['--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox',
  '--num-raster-threads=1', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--gpu-launcher=' + launcher];
const launchBrowser = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: flags, env: { ...process.env, VK_ICD_FILENAMES: softwareICD } });
const service = await startServer();
const origin = new URL(service.url).origin;
const asset = await readFile(resolve(root, 'kid-full.glb'));
let browser, report = {}, previous;
try { previous = JSON.parse(await readFile(reportPath, 'utf8')); } catch { /* first capture */ }
if (shotsOnly || benchmarkOnly) {
  report = previous || {};
  if (report.asset && report.asset.sha256 !== createHash('sha256').update(asset).digest('hex')) {
    if (benchmarkOnly) throw new Error('Saved screenshots belong to a different GLB; capture the frozen GLB before benchmarking');
    report = {}; // A new screenshot review must not inherit the older asset's timings.
  }
}
// Keep every previous timing attempt, including failures, in the delivered
// report. Rerunning after a fix never silently selects the fastest trial.
report.previousRuns = [...(previous?.previousRuns || []), ...(previous ? [{ recordedAtUTC: previous.recordedAtUTC,
  asset: previous.asset, implementation: previous.implementation, pass: previous.pass, failure: previous.failure,
  capture: previous.capture ? { viewport: previous.capture.viewport, frameCount: previous.capture.frames.length,
    actualCanvasViewport: previous.capture.frames[0]?.viewport, loopsPass: previous.capture.loops.every(loop => loop.pass) } : null,
  phone: previous.phone, browserChecks: previous.browserChecks }] : [])];
const priorErrors = report.browserChecks?.errors || [];
const errors = [], warnings = [], requests = new Map(), externalRequests = [];
delete report.failure;
report.asset = { path: 'kid-full.glb', bytes: asset.length, sha256: createHash('sha256').update(asset).digest('hex') };
report.implementation = {};
for (const name of ['anim.html', 'anim.css', 'anim.mjs', 'capture-animations.mjs']) report.implementation[name] = createHash('sha256').update(await readFile(resolve(root, name))).digest('hex');
report.environment = { chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', browserVersion: null,
  playwrightVersion: JSON.parse(await readFile(new URL(import.meta.resolve('playwright-core/package.json')), 'utf8')).version,
  flags, softwareICD, swiftShaderConfiguration: { path: 'work/animation-swiftshader-runtime/SwiftShader.ini', content: '[Processor]\nThreadCount=3\n', requiredWorkerThreads: 3 },
  runtimeObservations: [], cpuQuota: (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(),
  cpuAffinity: (await readFile('/proc/self/status', 'utf8')).match(/Cpus_allowed_list:\s+([^\n]+)/)?.[1].trim() };
report.criteria = { maximumModelTriangles: maximumTriangles, minimumFPSInEveryExerciseAndTrial: minimumFPS,
  warmupMs: 1000, measureMs: 5000, freshBrowsers: trialCount, p95FrameMsInformational: 50 };
report.scope = 'Local Chromium software GPU in the managed cloud, phone viewport 390×844 CSS pixels, DPR1. The normal viewer chooses its existing .6 render scale. Not a physical phone measurement.';

function watch(page, label) {
  page.on('pageerror', error => errors.push({ page: label, text: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ page: label, text: message.text() });
    if (message.type() === 'warning') warnings.push({ page: label, text: message.text() });
  });
  page.on('request', request => {
    const url = request.url();
    if (!/^https?:/.test(url)) return;
    if (new URL(url).origin !== origin) externalRequests.push(url);
    else {
      const path = new URL(url).pathname;
      const row = requests.get(path) || { path, count: 0, statuses: [] };
      row.count++; requests.set(path, row);
    }
  });
  page.on('response', response => {
    const url = response.url();
    if (/^https?:/.test(url) && new URL(url).origin === origin) {
      const row = requests.get(new URL(url).pathname);
      if (row && !row.statuses.includes(response.status())) row.statuses.push(response.status());
    }
    if (response.status() >= 400) errors.push({ page: label, text: `HTTP ${response.status()} ${url}` });
  });
  page.on('requestfailed', request => errors.push({ page: label, text: `Request failed ${request.url()}: ${request.failure()?.errorText}` }));
}
async function open(context, label, capture = false) {
  const page = await context.newPage();
  watch(page, label);
  await page.goto(`${service.url}/anim.html${capture ? '?capture=1' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.animLab, null, { timeout: 60000 });
  await page.evaluate(async () => { await window.animLab.ready; });
  return page;
}
async function observeRuntime(page, label) {
  const session = await browser.newBrowserCDPSession();
  let processInfo;
  try { ({ processInfo } = await session.send('SystemInfo.getProcessInfo')); } finally { await session.detach(); }
  const gpu = processInfo.filter(item => item.type.toLowerCase() === 'gpu');
  assert.equal(gpu.length, 1, 'One GPU process is required per browser');
  const names = await Promise.all((await readdir(`/proc/${gpu[0].id}/task`)).filter(id => /^\d+$/.test(id)).map(async id => {
    try { return (await readFile(`/proc/${gpu[0].id}/task/${id}/comm`, 'utf8')).trim(); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  }));
  const workers = names.filter(name => /^Thread</.test(name));
  const renderer = await page.evaluate(() => {
    const gl = window.animLab.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), glVersion: gl.getParameter(gl.VERSION) };
  });
  const observation = { label, gpuPid: gpu[0].id, softwareWorkerThreads: workers.length, softwareWorkerNames: workers, ...renderer };
  report.environment.runtimeObservations.push(observation);
  assert.match(renderer.renderer, /SwiftShader/i, 'The benchmark must use the configured software GPU');
  assert.equal(workers.length, 3, 'The SwiftShader configuration must actually select three workers');
  return observation;
}
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor((sorted.length - 1) * .95)], max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
};
async function frameSnapshot(page) {
  return page.evaluate(async () => {
    const { Vector3 } = await import('./vendor/three.module.js');
    const lab = window.animLab, point = new Vector3();
    const projected = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, outside: 0, vertices: 0 };
    const bones = [];
    lab.root.updateMatrixWorld(true);lab.camera.updateMatrixWorld(true);
    lab.root.traverse(object => {
      if (object.isBone) bones.push({ name: object.name, position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray() });
      if (!object.isMesh) return;
      object.skeleton?.update();
      for (let index = 0; index < object.geometry.attributes.position.count; index++) {
        object.getVertexPosition(index, point).applyMatrix4(object.matrixWorld).project(lab.camera);
        projected.minX = Math.min(projected.minX, point.x);projected.maxX = Math.max(projected.maxX, point.x);
        projected.minY = Math.min(projected.minY, point.y);projected.maxY = Math.max(projected.maxY, point.y);
        projected.minZ = Math.min(projected.minZ, point.z);projected.maxZ = Math.max(projected.maxZ, point.z);
        projected.outside += Number(Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1);
        projected.vertices++;
      }
    });
    return { ...lab.metrics(), projectedBoundsNDC: projected, bones, camera: { position: lab.camera.position.toArray(), quaternion: lab.camera.quaternion.toArray(), left: lab.camera.left, right: lab.camera.right, top: lab.camera.top, bottom: lab.camera.bottom } };
  });
}
function loopDifference(first, last) {
  const lookup = new Map(last.bones.map(bone => [bone.name, bone]));
  let maximumBoneChannelDelta = 0;
  for (const bone of first.bones) {
    const other = lookup.get(bone.name);assert(other, `Loop is missing bone ${bone.name}`);
    for (const channel of ['position', 'quaternion', 'scale']) for (let i = 0; i < bone[channel].length; i++) maximumBoneChannelDelta = Math.max(maximumBoneChannelDelta, Math.abs(bone[channel][i] - other[channel][i]));
  }
  return { maximumBoneChannelDelta, pass: maximumBoneChannelDelta <= 1e-6 };
}
async function buildSheets(page, clips) {
  const data = await page.evaluate(async ({ origin, clips, views, stages }) => {
    const load = path => new Promise((done, fail) => { const image = new Image();image.onload = () => done(image);image.onerror = () => fail(Error('Cannot load ' + path));image.src = origin + '/shots/animations/' + path; });
    const sheets = [];
    const overview = document.createElement('canvas');overview.width = 1440;overview.height = 80 + clips.length * 410;
    const overviewContext = overview.getContext('2d');overviewContext.fillStyle = '#f6f5f1';overviewContext.fillRect(0, 0, overview.width, overview.height);
    overviewContext.fillStyle = '#203830';overviewContext.font = 'bold 30px Arial';overviewContext.textAlign = 'center';
    overviewContext.fillText('Exercise loops · start / middle / end · front + side', 720, 48);
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex], images = await Promise.all(views.flatMap(view => stages.map(stage => load(`${clip.name}-${stage}-${view}.png`))));
      const canvas = document.createElement('canvas');canvas.width = 1440;canvas.height = 1570;
      const ctx = canvas.getContext('2d');ctx.fillStyle = '#f6f5f1';ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#203830';ctx.textAlign = 'center';ctx.font = 'bold 29px Arial';ctx.fillText(`${clip.name} · ${clip.duration.toFixed(2)} seconds · one loop`, 720, 45);
      for (let i = 0; i < images.length; i++) {
        const x = (i % 3) * 480, y = 100 + Math.floor(i / 3) * 760;
        ctx.fillStyle = '#203830';ctx.font = '20px Arial';ctx.fillText(`${views[Math.floor(i / 3)]} · ${stages[i % 3]} · ${(clip.duration * [0, .5, 1][i % 3]).toFixed(2)} s`, x + 240, y - 15);
        ctx.drawImage(images[i], x, y, 480, 720);
        overviewContext.drawImage(images[i], i * 240, 125 + clipIndex * 410, 240, 360);
      }
      overviewContext.fillStyle = '#203830';overviewContext.font = 'bold 22px Arial';overviewContext.fillText(`${clip.name} · ${clip.duration.toFixed(2)} s`, 720, 105 + clipIndex * 410);
      sheets.push({ name: clip.name + '-comparison.png', dataURL: canvas.toDataURL('image/png') });
    }
    return { sheets, overview: overview.toDataURL('image/png') };
  }, { origin, clips, views, stages });
  for (const item of data.sheets) await writeFile(resolve(destination, item.name), Buffer.from(item.dataURL.split(',')[1], 'base64'));
  await writeFile(resolve(destination, 'overview.png'), Buffer.from(data.overview.split(',')[1], 'base64'));
}
async function captureFrames() {
  const context = await browser.newContext({ viewport: captureViewport, deviceScaleFactor: 1 });
  const page = await open(context, 'animation-capture', true);
  await observeRuntime(page, 'capture');
  const clips = await page.evaluate(ids => ids.map(id => { const clip = window.animLab.clips.find(value => value.name === id);return { name: clip.name, duration: clip.duration, tracks: clip.tracks.length }; }), exerciseIds);
  report.capture = { viewport: captureViewport, dpr: 1, framesPerClip: 6, sampling: [0, .5, 1], viewNames: views,
    pixels: 'Original completed local WebGL canvas screenshots. Comparison PNGs use only uniform scale and labels.', clips, frames: [], loops: [] };
  report.loadedModel = await page.evaluate(() => {
    const lab = window.animLab, expressions = new Set();
    lab.root.traverse(object => { for (const name of Object.keys(object.morphTargetDictionary || {})) expressions.add(name); });
    return { ...lab.metrics(), animationNames: lab.clips.map(clip => clip.name), expressionNames: [...expressions] };
  });
  for (const clip of clips) {
    for (const view of views) {
      const samples = [];
      for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
        const seconds = clip.duration * [0, .5, 1][stageIndex];
        await page.evaluate(({ id, seconds, view }) => { const lab = window.animLab;lab.setView(view);lab.sample(id, seconds);lab.renderer.getContext().finish(); }, { id: clip.name, seconds, view });
        const snapshot = await frameSnapshot(page);
        assert.equal(snapshot.viewport.cssWidth, captureViewport.width, 'Capture canvas must fill the requested viewport width');
        assert.equal(snapshot.viewport.cssHeight, captureViewport.height, 'Capture canvas must fill the requested viewport height without mobile CSS clipping');
        const path = `shots/animations/${clip.name}-${stages[stageIndex]}-${view}.png`;
        const screenshot = await page.locator('#stage').screenshot({ path: resolve(root, path) });
        report.capture.frames.push({ path, bytes: screenshot.length, sha256: createHash('sha256').update(screenshot).digest('hex'), exercise: clip.name, stage: stages[stageIndex], seconds, view, ...snapshot });
        assert.equal(snapshot.projectedBoundsNDC.outside, 0, `${clip.name} ${view} ${stages[stageIndex]} is clipped`);
        assert(snapshot.modelTriangles <= maximumTriangles, 'The delivered GLB exceeds the triangle budget');
        samples.push(snapshot);
      }
      report.capture.loops.push({ exercise: clip.name, view, ...loopDifference(samples[0], samples[2]) });
    }
    console.log(`Captured ${clip.name}: six original frames`);
    await writeReport();
  }
  await buildSheets(page, clips);
  report.capture.sheets = clips.map(clip => `shots/animations/${clip.name}-comparison.png`);
  report.capture.overview = 'shots/animations/overview.png';
  assert(report.capture.loops.every(loop => loop.pass), 'Loop endpoints must have identical bone transforms');
  await context.close();
}
async function uiChecks() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await open(context, 'animation-ui');
  const actualOptions = await page.locator('#exercise option').evaluateAll(options => options.map(option => option.value));
  assert.deepEqual(actualOptions, exerciseIds, 'Exercise control must expose every camera exercise');
  for (const id of exerciseIds) {
    await page.selectOption('#exercise', id);
    assert.equal(await page.evaluate(() => window.animLab.metrics().exercise), id);
  }
  await page.locator('[data-view="side"]').click();
  assert.equal(await page.evaluate(() => window.animLab.metrics().view), 'side');
  await page.locator('[data-view="front"]').click();
  assert.equal(await page.evaluate(() => window.animLab.metrics().view), 'front');
  await page.evaluate(() => { window.animLab.sample('squats', 0);const control = document.querySelector('#time');control.value = '.6';control.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(Number(await page.locator('#time').inputValue()), .6);
  assert.equal(await page.evaluate(() => window.animLab.metrics().time), .6);
  async function playback(speed) {
    await page.locator(`[data-speed="${speed}"]`).click();
    return page.evaluate(async () => {
      const lab = window.animLab;lab.sample('squats', 0);lab.play();
      const started = performance.now();
      await new Promise(done => { const step = () => performance.now() - started >= 800 ? done() : requestAnimationFrame(step);requestAnimationFrame(step); });
      const result = { elapsedMs: performance.now() - started, time: lab.metrics().time, speed: lab.metrics().speed, fpsLabel: document.querySelector('#fps').textContent };
      lab.stop();return result;
    });
  }
  const normal = await playback(1), slow = await playback(.25);
  const normalizedSpeedRatio = (slow.time / slow.elapsedMs) / (normal.time / normal.elapsedMs);
  assert(normalizedSpeedRatio > .18 && normalizedSpeedRatio < .32, `Slow playback ratio was ${normalizedSpeedRatio}`);
  await page.locator('#play').click();
  assert.equal(await page.evaluate(() => window.animLab.metrics().playing), true);
  await page.locator('#play').click();
  assert.equal(await page.evaluate(() => window.animLab.metrics().playing), false);
  const triangleLabel = await page.locator('#triangles').textContent();
  assert.equal(Number(triangleLabel.replace(/[^0-9]/g, '')), await page.evaluate(() => window.animLab.metrics().modelTriangles));
  await page.setViewportSize(phoneViewport);
  const phone = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, metrics: window.animLab.metrics() }));
  assert(phone.scrollWidth <= phone.viewportWidth, 'Phone controls must not cause horizontal scrolling');
  report.ui = { pass: true, exerciseOptions: actualOptions, frontAndSideControls: true, playPauseControl: true, seekControl: true,
    triangleLabel, normalPlayback: normal, slowPlayback: slow, normalizedSpeedRatio, phone };
  await context.close();
  const reducedContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const reducedPage = await open(reducedContext, 'animation-reduced-motion');
  const reducedMetrics = await reducedPage.evaluate(() => window.animLab.metrics());
  assert.equal(reducedMetrics.playing, false, 'Reduced-motion preference must pause initial playback');
  report.ui.reducedMotionInitiallyPaused = true;
  await reducedContext.close();
}
async function benchmark() {
  report.phone = { viewport: phoneViewport, dpr: 1, freshBrowserTrials: trialCount, perExerciseWarmupMs: 1000, perExerciseMeasureMs: 5000,
    method: 'Unmodified normal anim.html playback at speed 1. A second RAF callback waits for gl.finish on the viewer draw and records real RAF intervals and wall time; it does not draw an extra scene or replace the viewer loop.', trials: [] };
  for (let trial = 0; trial < trialCount; trial++) {
    await browser.close();browser = await launchBrowser();
    const context = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
    const page = await open(context, `animation-phone-${trial + 1}`);
    const runtime = await observeRuntime(page, `phone-trial-${trial + 1}`);
    const measurements = [];
    // Rotate the order across fresh trials so every exercise is not measured at
    // the exact same startup/thermal point. Every result is retained.
    const order = [...exerciseIds.slice(trial), ...exerciseIds.slice(0, trial)];
    for (const id of order) {
      const result = await page.evaluate(async id => {
        const lab = window.animLab, gl = lab.renderer.getContext();
        lab.stop();lab.selectExercise(id);lab.setView('side');lab.setSpeed(1);lab.play();
        const warmupStart = performance.now();
        await new Promise(done => { const step = () => { gl.finish();performance.now() - warmupStart >= 1000 ? done() : requestAnimationFrame(step); };requestAnimationFrame(step); });
        const measureStart = performance.now(), intervals = [], finishMs = [], viewerTimes = [];
        let first = null, last = null;
        await new Promise(done => {
          const step = timestamp => {
            if (first === null) first = timestamp;
            if (last !== null) intervals.push(timestamp - last);
            last = timestamp;
            const before = performance.now();gl.finish();finishMs.push(performance.now() - before);
            viewerTimes.push(lab.metrics().time);
            if (performance.now() - measureStart < 5000 || intervals.length < 3) requestAnimationFrame(step);else done();
          };
          requestAnimationFrame(step);
        });
        const metrics = lab.metrics();lab.stop();
        return { ...metrics, intervals, finishMs, viewerTimes, fps: intervals.length * 1000 / (last - first),
          intervalWindowMs: last - first, measureWallMs: performance.now() - measureStart, warmupWallMs: measureStart - warmupStart };
      }, id);
      measurements.push({ id, ...result, frameMs: summary(result.intervals), completedDrawWaitMs: summary(result.finishMs),
        pass: result.fps >= minimumFPS && result.modelTriangles <= maximumTriangles,
        meetsInformationalP95: summary(result.intervals).p95 <= 50 });
      console.log(`Phone trial ${trial + 1}/${trialCount} ${id}: ${result.fps.toFixed(2)} FPS, p95 ${summary(result.intervals).p95.toFixed(2)} ms`);
    }
    report.phone.trials.push({ trial: trial + 1, order, runtime, measurements });
    await writeReport();
    await context.close();
  }
  report.phone.exercises = exerciseIds.map(id => {
    const trials = report.phone.trials.map(trial => trial.measurements.find(measurement => measurement.id === id));
    return { id, fps: summary(trials.map(trial => trial.fps)), maximumP95FrameMs: Math.max(...trials.map(trial => trial.frameMs.p95)), modelTriangles: trials[0].modelTriangles,
      viewport: trials[0].viewport, pass: trials.every(trial => trial.pass) };
  });
  report.phone.pass = report.phone.exercises.every(exercise => exercise.pass);
  assert(report.phone.pass, 'Every measured exercise in all three fresh-browser trials must meet >=40 FPS and <=20000 triangles');
}
async function writeReport() {
  report.recordedAtUTC = new Date().toISOString();
  report.recordedAtJerusalem = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  report.browserChecks = { errors: [...priorErrors, ...errors], warnings, externalRequests: [...new Set(externalRequests)],
    localRequests: [...requests.values()].sort((a, b) => a.path.localeCompare(b.path)) };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
try {
  browser = await launchBrowser();report.environment.browserVersion = browser.version();
  if (!benchmarkOnly) { await captureFrames();await uiChecks(); }
  if (!shotsOnly) await benchmark();
  assert.equal(errors.length, 0, 'Browser error(s): ' + JSON.stringify(errors));
  assert.equal(externalRequests.length, 0, 'Viewer must use local requests only');
  report.pass = !!report.capture?.loops.every(loop => loop.pass) && !!report.ui?.pass && !!report.phone?.pass;
  await writeReport();
  console.log('Animation evidence saved in shots/animations; report: shots/animation-verification.json');
} catch (error) {
  report.pass = false;report.failure = { message: error.message, stack: error.stack };
  await writeReport();throw error;
} finally {
  await browser?.close();await service.close();
}
