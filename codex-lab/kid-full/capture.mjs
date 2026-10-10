/** Reproducible browser evidence. Writes only inside this laboratory. */
import { mkdir, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { startServer } from './serve.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const shots = resolve(root, 'shots');
const work = resolve(root, 'work');
const views = ['front', 'side', 'back', 'threeQuarter'];
const poses = ['stand', 'run', 'kick'];
const expressions = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'];
const expressionNames = ['שמח', 'מאמץ', 'מופתע', 'ניצחון', 'עייף ומרוצה', 'מחשבה'];
const expressionBefore = 'expressions-before';
const expressionAfter = 'expressions-after';
const phoneViewport = { width: 390, height: 844 };
const pictureViewport = { width: 480, height: 720 };
const flags = ['--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox',
  '--num-raster-threads=1', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const errors = [], warnings = [], externalRequests = [];
const observedBrowsers = new WeakSet();
const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots-only');
const baselineBenchmark = args.includes('--baseline-benchmark');
const deliveredBenchmark = args.includes('--delivered-benchmark');
const benchmarkOnly = args.includes('--benchmark-only') || baselineBenchmark || deliveredBenchmark;
const selectedExperiment = args.find(a => a.startsWith('--experiment='))?.split('=')[1] || '';
const selectedQualities = (args.find(a => a.startsWith('--qualities='))?.split('=')[1] || 'dense,balanced,mobile').split(',');
const trialCount = Number(args.find(a => a.startsWith('--trials='))?.split('=')[1] || 3);
// Defined before measuring. The same limits apply to every quality and trial.
const stabilityCriteria = { minimumFPS: 40, maximumP95FrameMs: 50, maximumTrialFPSRatio: 1.15 };
const budgetCriteria = { profile: 'mobile and delivered GLB', maximumModelTriangles: 20000, minimumMobileFPS: 40 };
const roundtripCriteria = { maximumRGBMeanDifference: .05, maximumAbove8PixelPercent: .1, maximumSampledVertexDelta: 1e-5, maximumBoneLocalChannelDelta: 1e-6, maximumSampledNormalDelta: 1e-5 };
await mkdir(shots, { recursive: true });
await mkdir(work, { recursive: true });
// SwiftShader otherwise starts three workers in this two-CPU-quota cloud.
// Keep the default three supported workers explicitly configured for reproducible software rendering; do not alter
// RAF pacing, viewport, buffer resolution or the acceptance thresholds.
const softwareRuntime=resolve(work,'swiftshader-runtime');
await mkdir(softwareRuntime,{recursive:true});
await writeFile(resolve(softwareRuntime,'SwiftShader.ini'),'[Processor]\nThreadCount=3\n');
const gpuLauncher=resolve(softwareRuntime,'launch-gpu.sh');
const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
await writeFile(gpuLauncher,'#!/bin/sh\ncd -- '+shellQuote(softwareRuntime)+'\nexec "$@"\n');
await chmod(gpuLauncher,0o755);
flags.push('--gpu-launcher='+gpuLauncher);
const swiftShaderICD=process.env.SWIFTSHADER_ICD_PATH||'/usr/lib/chromium/vk_swiftshader_icd.json';
await readFile(swiftShaderICD); // Explicit software ICD; never select a physical GPU silently.
const launchBrowser=()=>chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:flags,env:{...process.env,VK_ICD_FILENAMES:swiftShaderICD}});
const service = await startServer();
const origin = new URL(service.url).origin;
let browser;
let report = {};
if (benchmarkOnly || shotsOnly) {
  try { report = JSON.parse(await readFile(resolve(shots, 'metrics.json'), 'utf8')); } catch { /* first run */ }
}
const preservedImplementation = report.implementation;
delete report.failure;
report.capture = { viewport: pictureViewport, dpr: 1, views, poses, expressions };
report.environment = { chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', flags, browserVersion: null, softwareICD: swiftShaderICD, configReadEvidence: 'Live GPU-process worker observation for each launched browser: shots/software-runtime.json', rasterThreads: 1, swiftShaderConfiguration: 'work/swiftshader-runtime/SwiftShader.ini', runtimeObservation: { method: 'Browser CDP SystemInfo.getProcessInfo; GPU /proc/task/comm worker names after labReady; no process arguments or environment values', requiredWorkerThreads: 3, observations: [] }, playwrightVersion: JSON.parse(await readFile(new URL(import.meta.resolve('playwright-core/package.json')), 'utf8')).version };
report.environment.cpuAffinity=(await readFile('/proc/self/status','utf8')).match(/Cpus_allowed_list:\s+([^\n]+)/)?.[1].trim();
report.environment.cpuQuota=(await readFile('/sys/fs/cgroup/cpu.max','utf8')).trim();
report.stabilityCriteria = stabilityCriteria;
report.budgetCriteria = budgetCriteria;
report.implementation = {};
for (const file of ['rig.mjs', 'scene.mjs', 'studio-bake.mjs', 'parts/body.mjs', 'parts/head.mjs', 'parts/hand.mjs', 'parts/shoe.mjs', 'parts/expressions.mjs', 'geometry-morphs.mjs', 'deformed-geometry.mjs']) report.implementation[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
// Refreshing pictures must not relabel an older benchmark as the current model.
if ((shotsOnly || deliveredBenchmark) && report.phone) assert.deepEqual(preservedImplementation, report.implementation, 'Source changed since the saved phone benchmark; measure it again before refreshing evidence');
report.stabilityScope = 'Chromium in the cloud at phone viewport; this is not a physical phone GPU measurement.';
report.buildTimingMethod = 'Initial source geometry/material/texture construction in each fresh browser context; excludes shader compile/GPU upload and asset download. Captures that switch quality record rebuilding; phone trials preserve the first startup build.';
try { report.pbrBaseline = JSON.parse(await readFile(resolve(work, 'pbr-baseline.json'), 'utf8')).phone; } catch { /* no earlier baseline */ }
try { report.phoneBeforeBallMerge = JSON.parse(await readFile(resolve(work, 'capture-before-ball-merge.json'), 'utf8')).phone; } catch { /* no pre-merge run */ }
try { report.doubleSideBaseline = JSON.parse(await readFile(resolve(work, 'final-pre-cull.json'), 'utf8')).phone; } catch { /* no earlier double-sided run */ }
try { report.pbrAtFinalResolution = JSON.parse(await readFile(resolve(work, 'pbr-scaled.json'), 'utf8')).phone; } catch { /* no matched-resolution baseline */ }

function watch(page, label) {
  page.on('console', m => {
    if (m.type() === 'error') errors.push({ page: label, text: m.text() });
    if (m.type() === 'warning') warnings.push({ page: label, text: m.text() });
  });
  page.on('pageerror', error => errors.push({ page: label, text: error.message }));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push({ page: label, text: `HTTP ${response.status()} ${response.url()}` });
  });
}
async function observeRuntime(page, label) {
  const instance = page.context().browser();
  if (observedBrowsers.has(instance)) return;
  const configuration = await readFile(resolve(softwareRuntime, 'SwiftShader.ini'), 'utf8');
  assert.equal(configuration, '[Processor]\nThreadCount=3\n', 'SwiftShader configuration must contain two real lines and a final newline');
  const session = await instance.newBrowserCDPSession();
  let processInfo;
  try { ({ processInfo } = await session.send('SystemInfo.getProcessInfo')); }
  finally { await session.detach(); }
  const gpu = processInfo.filter(process => process.type.toLowerCase() === 'gpu');
  assert.equal(gpu.length, 1, 'Expected exactly one GPU process owned by this browser');
  const gpuPid = gpu[0].id;
  assert(Number.isInteger(gpuPid) && gpuPid > 0, 'CDP returned an invalid GPU process ID');
  const taskRoot = `/proc/${gpuPid}/task`, tasks = (await readdir(taskRoot)).filter(name => /^\d+$/.test(name));
  const names = await Promise.all(tasks.map(async id => {
    try { return (await readFile(`${taskRoot}/${id}/comm`, 'utf8')).trim(); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  }));
  const workers = names.filter(name => /^Thread</.test(name));
  const renderer = await page.evaluate(() => {
    const gl = window.lab.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), glVersion: gl.getParameter(gl.VERSION), buffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } };
  });
  const observation = { label, recordedAtUTC: new Date().toISOString(), gpuPid, softwareWorkerThreads: workers.length, softwareWorkerNames: workers, ...renderer };
  const runtime = report.environment.runtimeObservation;
  runtime.configuration = { path: 'work/swiftshader-runtime/SwiftShader.ini', content: configuration, lines: configuration.trimEnd().split('\n'), threadCount: 3, actualNewlines: [...configuration].filter(character => character === '\n').length };
  runtime.observations.push(observation);
  report.environment.swiftShaderWorkerThreads = workers.length;
  await writeFile(resolve(shots, 'software-runtime.json'), `${JSON.stringify({ method: runtime.method, configuration: runtime.configuration, requiredWorkerThreads: runtime.requiredWorkerThreads, cpuQuota: report.environment.cpuQuota, cpuAffinity: report.environment.cpuAffinity, observations: runtime.observations }, null, 2)}\n`);
  assert(/SwiftShader/i.test(renderer.renderer), 'Capture must use the configured software GPU');
  assert.equal(workers.length, 3, `GPU process ${gpuPid} has ${workers.length} SwiftShader workers; require the configured three workers`);
  observedBrowsers.add(instance);
}
async function open(context, label, quality = 'balanced', capture = true, experiment = selectedExperiment) {
  const page = await context.newPage();
  watch(page, label);
  await page.goto(`${service.url}/?capture=${capture ? '1' : '0'}&quality=${quality}&view=front&pose=stand&resolution=${page.viewportSize().width === pictureViewport.width ? 'full' : 'auto'}${experiment ? `&experiment=${encodeURIComponent(experiment)}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.lab, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await Promise.resolve(window.labReady ?? window.lab.ready);
    if (typeof window.lab.stop === 'function') window.lab.stop();
  });
  await observeRuntime(page, label);
  await configure(page, { quality });
  return page;
}
async function configure(page, { quality, view = 'front', pose = 'stand', expression } = {}) {
  await page.evaluate(async ({ quality, view, pose, expression }) => {
    const lab = window.lab;
    if (quality && lab.metrics().detail !== quality) await lab.setQuality(quality);
    await lab.setPose(pose, true);
    if (expression) lab.setExpression(expression, true);
    lab.setView(view);
    lab.render();
    lab.renderer.getContext().finish();
  }, { quality, view, pose, expression });
  return page.evaluate(() => window.lab.metrics());
}
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = q => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  const mean = values.reduce((s, n) => s + n, 0) / values.length;
  return { samples: values.length, min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, p95: quantile(.95), max: sorted.at(-1), mean, standardDeviation: Math.sqrt(values.reduce((s, n) => s + (n - mean) ** 2, 0) / values.length), values };
};
function imageDifference(first, second) {
  const a = PNG.sync.read(first), b = PNG.sync.read(second);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let difference = 0, any = 0, above8 = 0, maximum = 0;
  for (let p = 0; p < a.width * a.height; p++) {
    let changed = false, over = false;
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs(a.data[p * 4 + c] - b.data[p * 4 + c]);
      difference += delta; maximum = Math.max(maximum, delta);
      changed ||= delta !== 0; over ||= delta > 8;
    }
    any += Number(changed); above8 += Number(over);
  }
  return { width: a.width, height: a.height, rgbMeanAbsoluteDifference: difference / (a.width * a.height * 3), maximumChannelDifference: maximum, changedPixels: any, changedPixelPercent: 100 * any / (a.width * a.height), above8PixelPercent: 100 * above8 / (a.width * a.height), exact: any === 0 };
}
function rasterCrop(bytes, [x, y, width, height]) {
  const source = PNG.sync.read(bytes), crop = new PNG({ width, height });
  assert(x >= 0 && y >= 0 && x + width <= source.width && y + height <= source.height, 'Head raster crop is outside source screenshot');
  for (let row = 0; row < height; row++) source.data.copy(crop.data, row * width * 4, ((y + row) * source.width + x) * 4, ((y + row) * source.width + x + width) * 4);
  return PNG.sync.write(crop);
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const { Vector3 } = await import('./vendor/three.module.js');
    const { deformedVertex, deformedNormal } = await import('./deformed-geometry.mjs');
    const lab = window.lab;
    const active = lab.activeRoot ?? lab.model?.group ?? lab.model?.root ?? lab.model ?? lab.scene;
    active.updateMatrixWorld(true);
    const meshes = [];
    active.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
      const attribute = mesh.geometry.attributes.position;
      const points = [], normals = [];
      // Sampling covers every mesh and evenly spaced vertices, plus both ends.
      const step = Math.max(1, Math.floor(attribute.count / 32));
      const indices = new Set([0, attribute.count - 1]);
      for (let i = 0; i < attribute.count; i += step) indices.add(i);
      mesh.skeleton?.update();
      for (const i of indices) {
        points.push(...deformedVertex(mesh, i).toArray());
        normals.push(...deformedNormal(mesh, i).toArray());
      }
      meshes.push({ name: mesh.name, vertices: attribute.count, skinned: !!mesh.isSkinnedMesh, points, normals, morphTargets: Object.keys(mesh.morphTargetDictionary || {}), morphWeights: [...(mesh.morphTargetInfluences || [])] });
    });
    return meshes;
  });
}
async function boneSnapshot(page) {
  return page.evaluate(() => window.lab.model.bones.map(bone => ({ name: bone.name, position: bone.position.toArray(), quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray() })));
}
function boneDifference(source, loaded) {
  const lookup = new Map(loaded.map(bone => [bone.name, bone]));
  let maximumChannelDelta = 0;
  const missing = [];
  for (const bone of source) {
    const other = lookup.get(bone.name);
    if (!other) { missing.push(bone.name); continue; }
    for (const attribute of ['position', 'quaternion', 'scale']) for (let i = 0; i < bone[attribute].length; i++) maximumChannelDelta = Math.max(maximumChannelDelta, Math.abs(bone[attribute][i] - other[attribute][i]));
  }
  return { sourceBones: source.length, loadedBones: loaded.length, missingBoneNames: missing, maximumLocalTransformChannelDelta: maximumChannelDelta };
}
function snapshotDifference(source, loaded) {
  // glTF splits multi-material meshes into primitives. When topology counts
  // change, compare world-space sampled point clouds with duplicate tolerance.
  const a = source.flatMap(m => Array.from({ length: m.points.length / 3 }, (_, i) => m.points.slice(i * 3, i * 3 + 3)));
  const b = loaded.flatMap(m => Array.from({ length: m.points.length / 3 }, (_, i) => m.points.slice(i * 3, i * 3 + 3)));
  if (source.length === loaded.length && source.every((m, i) => m.vertices === loaded[i].vertices && m.points.length === loaded[i].points.length)) {
    const deltas = a.map((p, i) => Math.hypot(...p.map((n, c) => n - b[i][c])));
    const normalDeltas = source.flatMap((mesh, j) => Array.from({ length: mesh.normals.length / 3 }, (_, i) => Math.hypot(...mesh.normals.slice(i * 3, i * 3 + 3).map((n, c) => n - loaded[j].normals[i * 3 + c]))));
    return { method: 'same mesh order and vertex indices, morphs then skinning then world transforms', sampledPositions: a.length, maximumPositionDelta: Math.max(...deltas), meanPositionDelta: deltas.reduce((s, n) => s + n, 0) / deltas.length, maximumNormalDelta: Math.max(0, ...normalDeltas) };
  }
  // Multi-material meshes become several primitives. Their position accessors
  // commonly remain shared; set matching tolerates duplicate sampled positions.
  const nearest = (points, candidates) => points.map(point => {
    let best = Infinity;
    for (const candidate of candidates) {
      const distance = (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2 + (point[2] - candidate[2]) ** 2;
      if (distance < best) best = distance;
      if (best < 1e-24) break;
    }
    return Math.sqrt(best);
  });
  const deltas = [...nearest(a, b), ...nearest(b, a)];
  const an = source.flatMap(m => Array.from({ length: m.normals.length / 3 }, (_, i) => m.normals.slice(i * 3, i * 3 + 3)));
  const bn = loaded.flatMap(m => Array.from({ length: m.normals.length / 3 }, (_, i) => m.normals.slice(i * 3, i * 3 + 3)));
  const nearestNormal = (points, normals, candidates, candidateNormals) => points.map((point, i) => {
    let positionBest = Infinity, normalBest = Infinity;
    for (let j = 0; j < candidates.length; j++) {
      const distance = Math.hypot(...point.map((v, c) => v - candidates[j][c]));
      const normalDistance = Math.hypot(...normals[i].map((v, c) => v - candidateNormals[j][c]));
      if (distance < positionBest - 1e-9) { positionBest = distance; normalBest = normalDistance; }
      else if (Math.abs(distance - positionBest) <= 1e-9) normalBest = Math.min(normalBest, normalDistance);
    } return normalBest;
  });
  const normalDeltas = [...nearestNormal(a, an, b, bn), ...nearestNormal(b, bn, a, an)];
  return { method: 'bidirectional nearest sampled world-space positions; supports duplicate material primitives, sampling only', sourceMeshes: source.length, loadedMeshes: loaded.length, sourceSampledPositions: a.length, loadedSampledPositions: b.length, maximumPositionDelta: Math.max(...deltas), meanPositionDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length, maximumNormalDelta: Math.max(0, ...normalDeltas) };
}
function morphDifference(source, loaded) {
  const first = source.filter(mesh => mesh.morphTargets.length), second = loaded.filter(mesh => mesh.morphTargets.length), byName = new Map(second.map(mesh => [mesh.name, mesh]));
  const missingMeshes = [], dictionaryDifferences = []; let maximumWeightDelta = 0;
  for (const mesh of first) {
    const other = byName.get(mesh.name);
    if (!other) { missingMeshes.push(mesh.name); continue; }
    if (mesh.morphTargets.join(',') !== other.morphTargets.join(',')) dictionaryDifferences.push(mesh.name);
    for (let i = 0; i < mesh.morphWeights.length; i++) maximumWeightDelta = Math.max(maximumWeightDelta, Math.abs(mesh.morphWeights[i] - other.morphWeights[i]));
  }
  return { sourceMeshes: first.length, loadedMeshes: second.length, missingMeshes, dictionaryDifferences, maximumWeightDelta };
}
async function projectedCrop(page) {
  return page.evaluate(async () => {
    const { Box3, Vector3 } = await import('./vendor/three.module.js');
    const lab = window.lab, box = new Box3().setFromObject(lab.activeRoot, true);
    const screen = lab.renderer.domElement.getBoundingClientRect();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new Vector3(x, y, z).project(lab.camera);
      const sx = screen.left + (point.x + 1) * screen.width / 2, sy = screen.top + (1 - point.y) * screen.height / 2;
      left = Math.min(left, sx); right = Math.max(right, sx); top = Math.min(top, sy); bottom = Math.max(bottom, sy);
    }
    left = Math.max(0, Math.floor(left - 8)); top = Math.max(0, Math.floor(top - 8));
    right = Math.min(innerWidth, Math.ceil(right + 8)); bottom = Math.min(innerHeight, Math.ceil(bottom + 8));
    return [left, top, right - left, bottom - top];
  });
}
async function saveImage(page, relative) {
  const path = resolve(shots, relative);
  await mkdir(dirname(path), { recursive: true });
  const bytes = await page.screenshot({ path, animations: 'disabled' });
  return bytes;
}
async function captureModels() {
  const context = await browser.newContext({ viewport: pictureViewport, deviceScaleFactor: 1 });
  const page = await open(context, 'screenshots');
  report.appearance = {};
  for (const quality of ['dense', 'balanced', 'mobile']) {
    report.appearance[quality] = {};
    for (const view of views) {
      report.appearance[quality][view] = await configure(page, { quality, view });
      await saveImage(page, `quality/${quality}-${view}.png`);
    }
  }
  assert(report.appearance.mobile.front.modelTriangles <= budgetCriteria.maximumModelTriangles, `Mobile triangle budget exceeded: ${report.appearance.mobile.front.modelTriangles}`);
  report.optimizationImageDifference = {};
  for (const view of views) {
    report.optimizationImageDifference[view] = imageDifference(await readFile(resolve(shots, `quality/dense-${view}.png`)), await readFile(resolve(shots, `quality/mobile-${view}.png`)));
  }
  const sourceSnapshots = {}, sourceBones = {};
  report.screenshotCrops = {};
  for (const pose of poses) {
    for (const view of views) {
      await configure(page, { quality: pose === 'stand' && view === 'front' ? 'mobile' : undefined, pose, view });
      await saveImage(page, `poses/${pose}-${view}.png`);
      if (pose === 'stand') { await saveImage(page, `${view}.png`); report.screenshotCrops[view] = await projectedCrop(page); }
      if (view === 'front') { sourceSnapshots[pose] = await snapshot(page); sourceBones[pose] = await boneSnapshot(page); }
    }
  }
  const sourceAnimationSnapshots = {}, sourceAnimationBones = {};
  report.animationSamples = [];
  const clipMetadata = await page.evaluate(() => window.lab.clips());
  for (const clip of clipMetadata) for (const fraction of [0, .25, .5, .75]) {
    const sample = { clip: clip.name, duration: clip.duration, time: clip.duration * fraction, fraction, view: 'threeQuarter', id: `${clip.name}-${String(fraction).replace('.', '_')}` };
    await page.evaluate(sample => { window.lab.setView(sample.view); window.lab.sampleClip(sample.clip, sample.time); window.lab.renderer.getContext().finish(); }, sample);
    await saveImage(page, `animation/source-${sample.id}.png`);
    sourceAnimationSnapshots[sample.id] = await snapshot(page);
    sourceAnimationBones[sample.id] = await boneSnapshot(page);
    report.animationSamples.push(sample);
  }
  const sourceExpressionSnapshots = {}, sourceExpressionBones = {};
  report.expressionSamples = [];
  report.expressionCapture = { expressions, names: expressionNames, views, transitionSamples: [0, .25, .5, .75, 1], fixedHeadCropCSS: [70, 20, 340, 280], imagePaths: {} };
  for (const expression of expressions) for (const view of views) {
    const sample = { expression, pose: 'stand', view, id: `${expression}-${view}` };
    await configure(page, sample);
    const sourceImage = await saveImage(page, `expressions/source/${sample.id}.png`);
    if (view === 'front') await writeFile(resolve(shots, `expressions/${expression}-front-head.png`), rasterCrop(sourceImage, report.expressionCapture.fixedHeadCropCSS));
    sourceExpressionSnapshots[sample.id] = await snapshot(page);
    sourceExpressionBones[sample.id] = await boneSnapshot(page);
    report.expressionSamples.push(sample);
    if (view === 'front') report.expressionCapture.imagePaths[expression] = `shots/expressions/source/${sample.id}.png`;
  }
  for (const [from, to] of [['happy', 'surprised'], ['effort', 'victory'], ['tired', 'thinking']]) for (const t of [0, .25, .5, .75, 1]) {
    const sample = { from, to, t, pose: 'stand', view: 'front', id: `${from}-${to}-${String(t).replace('.', '_')}` };
    await configure(page, sample);
    await page.evaluate(({ from, to, t }) => { const lab = window.lab; lab.setExpressionBlend(from, to, t); lab.render(); lab.renderer.getContext().finish(); }, sample);
    await saveImage(page, `expressions/source/${sample.id}.png`);
    sourceExpressionSnapshots[sample.id] = await snapshot(page);
    sourceExpressionBones[sample.id] = await boneSnapshot(page);
    report.expressionSamples.push(sample);
  }
  // Export standing bind-pose animation set once, then load the exact disk file.
  await configure(page, { view: 'front', pose: 'stand' });
  const base64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await window.lab.exportGLB());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(binary);
  });
  const glbBytes = Buffer.from(base64, 'base64');
  const glbPath = resolve(root, 'kid-full.glb');
  await writeFile(glbPath, glbBytes);
  assert.equal(glbBytes.subarray(0, 4).toString(), 'glTF');
  assert.equal(glbBytes.readUInt32LE(4), 2);
  assert.equal(glbBytes.readUInt32LE(8), glbBytes.length);
  const jsonLength = glbBytes.readUInt32LE(12);
  const glbJSON = JSON.parse(glbBytes.subarray(20, 20 + jsonLength).toString().trim());
  assert(glbJSON.skins?.length > 0, 'GLB does not contain a skeleton skin');
  assert.deepEqual((glbJSON.animations || []).map(a => a.name).sort(), [...poses].sort(), 'GLB must contain exactly the three named animation clips');
  assert(glbJSON.animations.every(animation => animation.channels?.length > 0 && animation.samplers?.length > 0), 'GLB animation contains no channels or samplers');
  report.glb = { path: 'kid-full.glb', bytes: glbBytes.length, sha256: createHash('sha256').update(glbBytes).digest('hex'), scenes: glbJSON.scenes?.length, skins: glbJSON.skins?.length, bones: new Set((glbJSON.skins || []).flatMap(skin => skin.joints)).size, animationNames: glbJSON.animations?.map(a => a.name), imageCount: glbJSON.images?.length, imagesEmbedded: (glbJSON.images || []).every(i => i.bufferView !== undefined && !i.uri), externalBufferURIs: (glbJSON.buffers || []).filter(b => b.uri).map(b => b.uri), views: {}, vertexChecks: {}, boneChecks: {}, animationViews: {}, animationVertexChecks: {}, animationBoneChecks: {}, expressionViews: {}, expressionVertexChecks: {}, expressionBoneChecks: {}, expressionMorphChecks: {} };
  report.glb.morphMeshes = (glbJSON.meshes || []).filter(mesh => mesh.primitives.some(p => p.targets?.length)).map(mesh => ({ name: mesh.name, targetNames: mesh.extras?.targetNames, primitives: mesh.primitives.map(p => ({ targetCount: p.targets?.length || 0, allTargetsHavePositionAndNormal: (p.targets || []).every(t => t.POSITION !== undefined && t.NORMAL !== undefined) })) }));
  assert(report.glb.morphMeshes.length > 0, 'GLB must contain facial morph targets');
  for (const mesh of report.glb.morphMeshes) {
    assert.deepEqual(mesh.targetNames, expressions, `${mesh.name}: six named expression targets are required`);
    assert(mesh.primitives.every(p => p.targetCount === expressions.length && p.allTargetsHavePositionAndNormal), `${mesh.name}: facial POSITION and NORMAL morphs are required`);
  }
  for (const animation of glbJSON.animations) assert(animation.channels.some(channel => channel.target.path === 'weights'), `GLB ${animation.name}: expression weight animation is missing`);
  assert.equal(report.glb.externalBufferURIs.length, 0, 'GLB references external buffers');
  assert(report.glb.imagesEmbedded, 'GLB references external images');
  await page.evaluate(async url => window.lab.loadGLB(url), `${service.url}/kid-full.glb`);
  report.glb.loadedMetrics = await configure(page, { pose: 'stand', view: 'front' });
  assert(report.glb.loadedMetrics.modelTriangles <= budgetCriteria.maximumModelTriangles, `Delivered GLB triangle budget exceeded: ${report.glb.loadedMetrics.modelTriangles}`);
  for (const pose of poses) {
    report.glb.views[pose] = {};
    for (const view of views) {
      await configure(page, { pose, view });
      const loaded = await saveImage(page, `roundtrip/${pose}-${view}.png`);
      report.glb.views[pose][view] = imageDifference(await readFile(resolve(shots, `poses/${pose}-${view}.png`)), loaded);
      if (view === 'front') { report.glb.vertexChecks[pose] = snapshotDifference(sourceSnapshots[pose], await snapshot(page)); report.glb.boneChecks[pose] = boneDifference(sourceBones[pose], await boneSnapshot(page)); }
    }
  }
  report.glb.loadedAnimationMetadata = await page.evaluate(() => window.lab.clips());
  for (const sample of report.animationSamples) {
    await page.evaluate(sample => { window.lab.setView(sample.view); window.lab.sampleClip(sample.clip, sample.time); window.lab.renderer.getContext().finish(); }, sample);
    const loaded = await saveImage(page, `animation/loaded-${sample.id}.png`);
    report.glb.animationViews[sample.id] = imageDifference(await readFile(resolve(shots, `animation/source-${sample.id}.png`)), loaded);
    report.glb.animationVertexChecks[sample.id] = snapshotDifference(sourceAnimationSnapshots[sample.id], await snapshot(page));
    report.glb.animationBoneChecks[sample.id] = boneDifference(sourceAnimationBones[sample.id], await boneSnapshot(page));
  }
  for (const sample of report.expressionSamples) {
    await configure(page, sample);
    if (sample.from) await page.evaluate(({ from, to, t }) => { const lab = window.lab; lab.setExpressionBlend(from, to, t); lab.render(); lab.renderer.getContext().finish(); }, sample);
    const loaded = await saveImage(page, `expressions/loaded/${sample.id}.png`);
    report.glb.expressionViews[sample.id] = imageDifference(await readFile(resolve(shots, `expressions/source/${sample.id}.png`)), loaded);
    const loadedSnapshot = await snapshot(page);
    report.glb.expressionVertexChecks[sample.id] = snapshotDifference(sourceExpressionSnapshots[sample.id], loadedSnapshot);
    report.glb.expressionMorphChecks[sample.id] = morphDifference(sourceExpressionSnapshots[sample.id], loadedSnapshot);
    report.glb.expressionBoneChecks[sample.id] = boneDifference(sourceExpressionBones[sample.id], await boneSnapshot(page));
  }
  await page.evaluate(() => window.lab.useSource());
  const allRoundtripPixels = [...Object.values(report.glb.views).flatMap(v => Object.values(v)), ...Object.values(report.glb.animationViews), ...Object.values(report.glb.expressionViews)];
  const allRoundtripVertices = [...Object.values(report.glb.vertexChecks), ...Object.values(report.glb.animationVertexChecks), ...Object.values(report.glb.expressionVertexChecks)];
  const allRoundtripBones = [...Object.values(report.glb.boneChecks), ...Object.values(report.glb.animationBoneChecks), ...Object.values(report.glb.expressionBoneChecks)];
  report.glb.maximumRGBMeanDifference = Math.max(...allRoundtripPixels.map(v => v.rgbMeanAbsoluteDifference));
  report.glb.maximumChangedPixelsPercent = Math.max(...allRoundtripPixels.map(v => v.changedPixelPercent));
  report.glb.maximumAbove8PixelsPercent = Math.max(...allRoundtripPixels.map(v => v.above8PixelPercent));
  report.glb.maximumSampledVertexDelta = Math.max(...allRoundtripVertices.map(v => v.maximumPositionDelta));
  report.glb.maximumSampledNormalDelta = Math.max(...allRoundtripVertices.map(v => v.maximumNormalDelta));
  report.glb.roundtripImageCount = allRoundtripPixels.length;
  report.glb.criteria = roundtripCriteria;
  report.glb.pass = report.glb.maximumRGBMeanDifference <= roundtripCriteria.maximumRGBMeanDifference
    && report.glb.maximumAbove8PixelsPercent <= roundtripCriteria.maximumAbove8PixelPercent
    && allRoundtripVertices.every(v => v.maximumPositionDelta <= roundtripCriteria.maximumSampledVertexDelta && v.maximumNormalDelta <= roundtripCriteria.maximumSampledNormalDelta)
    && Object.values(report.glb.expressionMorphChecks).every(v => v.sourceMeshes > 0 && v.sourceMeshes === v.loadedMeshes && v.missingMeshes.length === 0 && v.dictionaryDifferences.length === 0 && v.maximumWeightDelta <= 1e-6)
    && allRoundtripBones.every(v => v.sourceBones === v.loadedBones && v.missingBoneNames.length === 0 && v.maximumLocalTransformChannelDelta <= roundtripCriteria.maximumBoneLocalChannelDelta);
  // Keep producing all measurements/artifacts; the final process result still fails if roundtrip did not pass.
  // Transition samples make the intermediate surface state reviewable.
  for (const [from, to] of [['stand', 'run'], ['run', 'kick'], ['kick', 'stand']]) {
    for (const t of [0, .25, .5, .75, 1]) {
      await page.evaluate(({ from, to, t }) => { window.lab.setView('threeQuarter'); window.lab.setBlend(from, to, t); window.lab.render(); window.lab.renderer.getContext().finish(); }, { from, to, t });
      await saveImage(page, `transitions/${from}-${to}-${String(t).replace('.', '_')}.png`);
    }
  }
  await captureBaseline(page);
  await buildComparison(page);
  await buildExpressionGrid(page);
  await buildPoseGrid(page);
  await context.close();
  await captureExpressionPage();
  await captureExperiments();
  const phoneContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
  const phonePage = await open(phoneContext, 'phone-shot', 'mobile');
  await configure(phonePage, { view: 'threeQuarter', pose: 'kick' });
  await saveImage(phonePage, 'phone.png');
  await phoneContext.close();
}
async function captureExpressionPage() {
  report.expressionCapture.gallery = {};
  for (const [name, viewport] of [['desktop', { width: 1200, height: 1000 }], ['phone', phoneViewport]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage(); watch(page, `expression-page-${name}`);
    await page.goto(`${service.url}/expressions.html?quality=mobile`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.labReady);
    await page.evaluate(() => { window.lab.stop(); window.lab.setExpression('happy'); });
    const state = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, rows: document.querySelectorAll('[data-expression-row]').length, images: [...document.querySelectorAll('[data-expression-row] img')].map(i => ({ loaded: i.complete && i.naturalWidth > 0, width: i.naturalWidth, height: i.naturalHeight })) }));
    assert(state.canvases === 1 && state.rows === 6 && state.scrollWidth <= state.viewportWidth && state.images.every(i => i.loaded), 'Six-expression gallery must load its six thumbnails and one renderer without horizontal overflow');
    await saveImage(page, `expressions/gallery-${name}.png`);
    report.expressionCapture.gallery[name] = { viewport, ...state, path: `shots/expressions/gallery-${name}.png` };
    await context.close();
  }
}
async function captureExperiments() {
  const context = await browser.newContext({ viewport: pictureViewport, deviceScaleFactor: 1 });
  const page = await open(context, 'rigid-experiment', 'mobile', true, 'rigid');
  for (const pose of poses) for (const view of ['front', 'threeQuarter']) {
    await configure(page, { pose, view });
    await saveImage(page, `experiments/rigid-${pose}-${view}.png`);
  }
  report.experiments = { rigid: { onlyDifference: 'skin weights rounded to their dominant bone; source geometry, camera, materials and lights unchanged', poses, views: ['front', 'threeQuarter'] } };
  const data = await page.evaluate(async origin => {
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 840;
    const context = canvas.getContext('2d'); context.fillStyle = '#f3f0e9'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center'; context.direction = 'rtl'; context.fillStyle = '#27364a'; context.font = 'bold 28px sans-serif';
    context.fillText('משקלים קשיחים מול מעברים רכים — אותה גיאומטריה, תאורה ומצלמה', 720, 43);
    const names = ['עמידה', 'ריצה', 'בעיטה בכדור'], poses = ['stand', 'run', 'kick'];
    for (let i = 0; i < 3; i++) {
      const image = url => new Promise((accept, reject) => { const image = new Image(); image.onload = () => accept(image); image.onerror = reject; image.src = url; });
      const [before, after] = await Promise.all([image(`${origin}/shots/experiments/rigid-${poses[i]}-threeQuarter.png`), image(`${origin}/shots/poses/${poses[i]}-threeQuarter.png`)]);
      context.drawImage(before, i * 480, 104, 240, 360); context.drawImage(after, i * 480 + 240, 104, 240, 360);
      context.fillStyle = '#27364a'; context.font = 'bold 23px sans-serif'; context.fillText(names[i], i * 480 + 240, 85);
      context.font = '18px sans-serif'; context.fillText('עצם אחת לקודקוד', i * 480 + 120, 493); context.fillText('משקלים רכים', i * 480 + 360, 493);
      // A closer crop shows the same raster pixels around shoulders/hips.
      context.drawImage(before, 130, 225, 220, 235, i * 480 + 10, 530, 220, 235);
      context.drawImage(after, 130, 225, 220, 235, i * 480 + 250, 530, 220, 235);
    }
    context.font = '17px sans-serif'; context.fillText('למעלה: כל הדמות. למטה: אותו חיתוך של אזור הגוף; ללא שינוי גודל לא־אחיד או עריכת צבע.', 720, 812);
    return canvas.toDataURL('image/png');
  }, origin);
  await writeFile(resolve(shots, 'soft-joints.png'), Buffer.from(data.split(',')[1], 'base64'));
  await page.close();
  const pbrPage = await open(context, 'pbr-experiment', 'mobile', true, 'pbr');
  report.experiments.pbr = { description: 'source materials retained; same source geometry and studio camera/light presets as final', views: {} };
  for (const view of ['front', 'side', 'threeQuarter']) {
    report.experiments.pbr.views[view] = await configure(pbrPage, { pose: 'stand', view });
    await saveImage(pbrPage, `experiments/pbr-stand-${view}.png`);
  }
  const shadingData = await pbrPage.evaluate(async origin => {
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 655;
    const context = canvas.getContext('2d'); context.fillStyle = '#f3f0e9'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center'; context.direction = 'rtl'; context.fillStyle = '#27364a'; context.font = 'bold 27px sans-serif';
    context.fillText('חומר מקור מול תאורת אולפן אפויה — אותה גיאומטריה ומצלמה', 720, 43);
    const views = ['front', 'side', 'threeQuarter'], names = ['חזית', 'צד', 'שלושה רבעים'];
    for (let i = 0; i < 3; i++) {
      const image = url => new Promise((accept, reject) => { const image = new Image(); image.onload = () => accept(image); image.onerror = reject; image.src = url; });
      const [before, after] = await Promise.all([image(`${origin}/shots/experiments/pbr-stand-${views[i]}.png`), image(`${origin}/shots/poses/stand-${views[i]}.png`)]);
      context.drawImage(before, i * 480, 104, 240, 360); context.drawImage(after, i * 480 + 240, 104, 240, 360);
      context.fillStyle = '#27364a'; context.font = 'bold 23px sans-serif'; context.fillText(names[i], i * 480 + 240, 85);
      context.font = '18px sans-serif'; context.fillText('חומר מקור', i * 480 + 120, 493); context.fillText('תאורה אפויה', i * 480 + 360, 493);
    }
    context.font = '18px sans-serif'; context.fillText('האפייה מפחיתה את עלות ההצללה ומספקת מראה יציב ב־GLB; ההבדל המצולם כולל חומר, לא שינוי צורה.', 720, 568);
    context.fillText('תאורת המקור מחושבת בזמן הרינדור; תאורה אפויה נשמרת בצבעי הקודקודים ומתלווה למשטח.', 720, 605);
    return canvas.toDataURL('image/png');
  }, origin);
  await writeFile(resolve(shots, 'studio-bake.png'), Buffer.from(shadingData.split(',')[1], 'base64'));
  await context.close();
}
async function studioSettings(page) {
  return page.evaluate(() => {
    const { scene, renderer, camera } = window.lab, lights = [];
    scene.traverse(o => {
      if (!o.isLight) return;
      lights.push({ type: o.type, position: o.position.toArray(), colour: o.color.getHexString(), intensity: o.intensity, groundColour: o.groundColor?.getHexString() });
    });
    return { camera: { type: camera.type, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, near: camera.near, far: camera.far }, lights, background: scene.background.getHexString(), outputColorSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, width: renderer.domElement.width, height: renderer.domElement.height, renderScale: renderer.getPixelRatio() };
  });
}
async function captureBaseline(page) {
  // The preserved disk GLB is loaded into this exact scene. It never imports
  // old source modules or inherits a different camera/light screenshot preset.
  const baselinePath = resolve(shots, `${expressionBefore}/kid-full.glb`);
  let bytes;
  bytes = await readFile(baselinePath);
  await configure(page, { quality: 'mobile', pose: 'stand', view: 'front' });
  const settings = await studioSettings(page);
  report.beforeAfter = {
    before: { path: `shots/${expressionBefore}/kid-full.glb`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, metrics: {}, expressionMetrics: {}, crops: {} },
    after: { source: 'procedural mobile; exported and roundtrip checked', metrics: {}, crops: report.screenshotCrops },
    settings, settingsIdentical: true, pose: 'stand', views, fullModelPairResizing: 'one common crop and one uniform scale per before/after pair',
    headCropCSS: [70, 20, 340, 280], headCropMethod: 'fixed raster crop from the full-model camera; identical before and after',
    lightingNote: 'Both models share these live scene lights. Each model retains its own baked vertex colours and materials.',
  };
  await page.evaluate(async directory => window.lab.loadGLB(`./shots/${directory}/kid-full.glb`), expressionBefore);
  for (const view of views) {
    report.beforeAfter.before.metrics[view] = await configure(page, { pose: 'stand', view });
    assert.deepEqual(await studioSettings(page), settings, `Before camera/light settings changed for ${view}`);
    await saveImage(page, `${expressionBefore}/${view}.png`);
    report.beforeAfter.before.crops[view] = await projectedCrop(page);
  }
  report.expressionCapture.baselineImagePaths = {};
  for (const expression of expressions) {
    report.beforeAfter.before.expressionMetrics[expression] = await configure(page, { pose: 'stand', view: 'front', expression });
    assert.deepEqual(await studioSettings(page), settings, `Baseline expression camera/light settings changed for ${expression}`);
    await saveImage(page, `${expressionBefore}/${expression}-front.png`);
    report.expressionCapture.baselineImagePaths[expression] = `shots/${expressionBefore}/${expression}-front.png`;
  }
  await page.evaluate(() => window.lab.useSource());
  for (const view of views) {
    report.beforeAfter.after.metrics[view] = await configure(page, { pose: 'stand', view });
    assert.deepEqual(await studioSettings(page), settings, `After camera/light settings changed for ${view}`);
    await saveImage(page, `${expressionAfter}/${view}.png`);
  }
}
async function buildComparison(page) {
  const files = await readdir(resolve(root, '../ref'));
  const referenceName = files.find(name => name.startsWith('מבטים'));
  const expressionName = files.find(name => name.startsWith('גיליון הבעות'));
  assert(referenceName && expressionName, 'Original view and expression reference sheets are required');
  const referenceBytes = await readFile(resolve(root, '../ref', referenceName));
  const expressionBytes = await readFile(resolve(root, '../ref', expressionName));
  report.reference = { path: `../ref/${referenceName}`, sha256: createHash('sha256').update(referenceBytes).digest('hex'), sourcePixelAccess: true, crops: [[15, 246, 295, 720], [330, 246, 280, 720], [620, 246, 295, 720], [935, 246, 305, 720]], fourthView: 'frontRepeat', threeQuarterTarget: false, cropOnly: false, uniformResizing: true, heightNormalized: true, modelCropMethod: 'common precise projected before/after skinned bounds plus 8 CSS pixels', colourEdits: false, perspectiveOrShapeWarp: false };
  report.expressionReference = { path: `../ref/${expressionName}`, sha256: createHash('sha256').update(expressionBytes).digest('hex'), sourcePixelAccess: true, neutralHeadCrop: [8, 0, 495, 454], fullSheetShown: true, expressionSystemAdded: true, colourEdits: false, uniformResizing: true };
  const dataURL = await page.evaluate(async ({ origin, viewName, expressionName, crops, expressionCrop, comparison, beforeDirectory, afterDirectory }) => {
    const getImage = url => new Promise((accept, reject) => { const image = new Image(); image.onload = () => accept(image); image.onerror = () => reject(Error(`Could not load image ${url}`)); image.src = url; });
    const [target, expressions] = await Promise.all([getImage(`${origin}/ref/${encodeURIComponent(viewName)}`), getImage(`${origin}/ref/${encodeURIComponent(expressionName)}`)]);
    const views = ['front', 'side', 'back'], names = ['חזית', 'צד', 'גב'];
    const before = await Promise.all(views.map(view => getImage(`${origin}/shots/${beforeDirectory}/${view}.png`)));
    const after = await Promise.all(views.map(view => getImage(`${origin}/shots/${afterDirectory}/${view}.png`)));
    const canvas = document.createElement('canvas'); canvas.width = 2460; canvas.height = 1830;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f3f0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillStyle = '#27364a'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText('שיפור הדמות — יעד מקורי, לפני ואחרי', 1230, 50);
    ctx.font = '23px sans-serif'; ctx.fillText('לפני ואחרי: אותה מצלמה, תאורה, תנוחה ורזולוציה; אותו חיתוך וקנה מידה לכל זוג.', 1230, 91);
    const fit = (image, crop, x, y, width, height, bottom = false) => {
      const scale = Math.min(width / crop[2], height / crop[3]), w = crop[2] * scale, h = crop[3] * scale;
      ctx.drawImage(image, ...crop, x + (width - w) / 2, y + (bottom ? height - h : (height - h) / 2), w, h);
    };
    const commonCrop = view => {
      const a = comparison.before.crops[view], b = comparison.after.crops[view];
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
      return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
    };
    const labels = ['יעד מקורי', 'לפני — GLB מ־main', 'אחרי — mobile'];
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 810;
      ctx.fillStyle = '#fff'; ctx.fillRect(x, 120, 800, 605);
      ctx.fillStyle = '#27364a'; ctx.font = 'bold 29px sans-serif'; ctx.fillText(names[i], x + 400, 159);
      ctx.font = '21px sans-serif'; for (let c = 0; c < 3; c++) ctx.fillText(labels[c], x + 140 + c * 260, 196);
      const pairCrop = commonCrop(views[i]);
      fit(target, crops[i], x + 10, 216, 260, 470, true);
      fit(before[i], pairCrop, x + 270, 216, 260, 470, true);
      fit(after[i], pairCrop, x + 530, 216, 260, 470, true);
    }
    ctx.fillStyle = '#27364a'; ctx.font = '21px sans-serif';
    ctx.fillText('היעד מוצג בשינוי גודל אחיד לגובה; זוגות לפני/אחרי שומרים על אותו קנה מידה, בלי תיקון פרופורציות.', 1230, 756);
    ctx.fillStyle = '#fff'; ctx.fillRect(20, 790, 1400, 455); ctx.fillRect(1440, 790, 1000, 700);
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 29px sans-serif'; ctx.fillText('תקריב פנים ושיער — חיוך קטן', 720, 830);
    ctx.font = '23px sans-serif'; for (let c = 0; c < 3; c++) ctx.fillText(labels[c], 253 + c * 466, 869);
    fit(expressions, expressionCrop, 35, 892, 436, 324);
    fit(before[0], comparison.headCropCSS, 501, 892, 436, 324);
    fit(after[0], comparison.headCropCSS, 967, 892, 436, 324);
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('גיליון ההבעות המקורי', 1940, 830);
    fit(expressions, [0, 0, expressions.width, expressions.height], 1460, 849, 960, 622);
    ctx.font = '20px sans-serif'; ctx.fillText('נוספו שש הבעות במודל; ההשוואה החזותית אינה ציון התאמה מספרי.', 1940, 1520);
    const sideHeadCrops = [[330, 246, 280, 285], [620, 246, 295, 285]];
    for (let i = 0; i < 2; i++) {
      const x = 20 + i * 710, view = views[i + 1];
      ctx.fillStyle = '#fff'; ctx.fillRect(x, 1270, 700, 445);
      ctx.fillStyle = '#27364a'; ctx.font = 'bold 27px sans-serif'; ctx.fillText(`תקריב שיער — ${names[i + 1]}`, x + 350, 1310);
      ctx.font = '20px sans-serif'; for (let c = 0; c < 3; c++) ctx.fillText(labels[c], x + 116 + c * 233, 1347);
      fit(target, sideHeadCrops[i], x + 5, 1370, 223, 310);
      fit(before[i + 1], comparison.headCropCSS, x + 238, 1370, 223, 310);
      fit(after[i + 1], comparison.headCropCSS, x + 471, 1370, 223, 310);
    }
    ctx.fillStyle = '#27364a'; ctx.font = '22px sans-serif';
    ctx.fillText('כל תמונות היעד נטענו ישירות מ־codex-lab/ref/; חיתוך ושינוי גודל אחיד בלבד, ללא עריכת צבע או עיוות.', 1230, 1760);
    ctx.fillText('תקריבי המודל נחתכו מאותו צילום גוף מלא; צבעי הקודקודים האפויים והחומרים נשמרים בכל גרסה.', 1230, 1794);
    return canvas.toDataURL('image/png');
  }, { origin, viewName: referenceName, expressionName, crops: report.reference.crops, expressionCrop: report.expressionReference.neutralHeadCrop, comparison: report.beforeAfter, beforeDirectory: expressionBefore, afterDirectory: expressionAfter });
  const comparisonBytes = Buffer.from(dataURL.split(',')[1], 'base64');
  await writeFile(resolve(shots, 'expressions-before-after-target.png'), comparisonBytes);
  report.beforeAfter.comparisonPath = 'shots/expressions-before-after-target.png';
}
async function buildPoseGrid(page) {
  const data = await page.evaluate(async origin => {
    const poses = ['stand', 'run', 'kick'], views = ['front', 'side', 'back', 'threeQuarter'];
    const poseNames = ['עמידה', 'ריצה', 'בעיטה בכדור'], viewNames = ['חזית', 'צד', 'גב', 'שלושה רבעים'];
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 1640;
    const context = canvas.getContext('2d'); context.fillStyle = '#f3f0e9'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center'; context.direction = 'rtl'; context.fillStyle = '#27364a'; context.font = 'bold 32px sans-serif';
    context.fillText('שלוש תנוחות, ארבעה מבטים — מצלמה ותאורה קבועות', 720, 50);
    for (let p = 0; p < 3; p++) for (let v = 0; v < 4; v++) {
      const image = await new Promise((resolveImage, reject) => { const image = new Image(); image.onload = () => resolveImage(image); image.onerror = reject; image.src = `${origin}/shots/poses/${poses[p]}-${views[v]}.png`; });
      context.drawImage(image, 12 + v * 360, 110 + p * 510, 336, 504);
      context.fillStyle = '#27364a'; context.font = 'bold 22px sans-serif'; context.fillText(`${poseNames[p]} · ${viewNames[v]}`, 180 + v * 360, 95 + p * 510);
    }
    return canvas.toDataURL('image/png');
  }, origin);
  await writeFile(resolve(shots, 'poses.png'), Buffer.from(data.split(',')[1], 'base64'));
}
async function buildExpressionGrid(page) {
  const data = await page.evaluate(async ({ origin, expressions, names, reference, beforeDirectory, crop }) => {
    const image = url => new Promise((accept, reject) => {
      const value = new Image(); value.onload = () => accept(value);
      value.onerror = () => reject(Error(`Cannot read original pixels: ${url}`)); value.src = url;
    });
    const [target, ...pictures] = await Promise.all([
      image(`${origin}/ref/${encodeURIComponent(reference)}`),
      ...expressions.map(id => image(`${origin}/shots/${beforeDirectory}/${id}-front.png`)),
      ...expressions.map(id => image(`${origin}/shots/expressions/source/${id}-front.png`)),
    ]);
    const before = pictures.slice(0, expressions.length), after = pictures.slice(expressions.length);
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1700;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f3f0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#27364a'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText('שש הבעות בדמות המלאה — לפני, אחרי ופיקסלי היעד', 960, 54);
    ctx.font = '22px sans-serif'; ctx.fillText('לכל זוג: צילום גוף מלא באותה מצלמה ותאורה, חיתוך ראש זהה, שינוי גודל אחיד.', 960, 94);
    const fit = (value, rect, x, y, width, height) => {
      const scale = Math.min(width / rect[2], height / rect[3]), w = rect[2] * scale, h = rect[3] * scale;
      ctx.drawImage(value, ...rect, x + (width - w) / 2, y + (height - h) / 2, w, h);
    };
    for (let i = 0; i < 6; i++) {
      const x = 15 + (i % 3) * 635, y = 130 + Math.floor(i / 3) * 355;
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 620, 340);
      ctx.fillStyle = '#27364a'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(names[i], x + 310, y + 37);
      ctx.font = '20px sans-serif'; ctx.fillText('לפני — GLB מ־main', x + 155, y + 72); ctx.fillText('אחרי — אותה הבעה', x + 465, y + 72);
      fit(before[i], crop, x + 10, y + 88, 290, 240); fit(after[i], crop, x + 320, y + 88, 290, 240);
    }
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('גיליון היעד המקורי — שפת ההבעות היא רפרנס חזותי', 960, 895);
    fit(target, [0, 0, target.width, target.height], 375, 920, 1170, 700);
    ctx.font = '21px sans-serif'; ctx.fillText('הגיליון מוצג מפיקסלי קובץ המקור; אין התאמה חד־חד־ערכית של תוויות ההבעות ואין ציון התאמה מספרי.', 960, 1660);
    return canvas.toDataURL('image/png');
  }, { origin, expressions, names: expressionNames, reference: report.expressionReference.path.split('/').at(-1), beforeDirectory: expressionBefore, crop: report.expressionCapture.fixedHeadCropCSS });
  await writeFile(resolve(shots, 'expressions-comparison.png'), Buffer.from(data.split(',')[1], 'base64'));
  report.expressionCapture.comparisonPath = 'shots/expressions-comparison.png';
  report.expressionComparison = { path: report.expressionCapture.comparisonPath, baseline: report.expressionCapture.baselineImagePaths, matchingBaselineExpressions: true, fullOriginalTargetSheet: true, targetCellMapping: 'none', cameraAndLights: 'identical full-body studio; fixed head raster crops', expressions };
}
async function benchmark({ baseline = false, delivered = false } = {}) {
  const fromGLB = baseline || delivered;
  let baselineRelative, baselineBytes;
  if (baseline) {
    try { baselineRelative = `shots/${expressionBefore}/kid-full.glb`; baselineBytes = await readFile(resolve(root, baselineRelative)); }
    catch (error) { throw new Error(`Expression-round baseline is required: ${error.message}`); }
  } else if (delivered) {
    baselineRelative = 'kid-full.glb';
    baselineBytes = await readFile(resolve(root, baselineRelative));
  }
  const key = baseline ? 'phoneBaseline' : delivered ? 'phoneDelivered' : 'phone';
  const observationStart = report.environment.runtimeObservation.observations.length;
  const phone = report[key] = { experiment: selectedExperiment || 'final', viewport: phoneViewport, dpr: 1, requestedWarmupMs: 1000, requestedMeasureMs: 5000, freshContextsPerQuality: trialCount, freshBrowsersPerQuality: trialCount, view: 'threeQuarter', animation: 'stand → run → kick → stand; 1.2 s per leg; cosine eased', expressions: baseline ? [] : expressions, expressionAnimation: baseline ? 'baseline has fixed facial geometry' : 'happy → effort → surprised → victory → tired → thinking → happy; 0.6 s per leg; cosine eased', glFinishEachFrame: true, quality: {} };
  if (fromGLB) Object.assign(phone, { experiment: baseline ? 'preserved-original-GLB' : 'delivered-GLB', modelSource: `${baseline ? 'preserved original' : 'delivered'} GLB loaded through the same lab scene`, path: baselineRelative, sha256: createHash('sha256').update(baselineBytes).digest('hex'), timingMethod: 'loadAndFirstDrawMs measures local GLB loading/parsing and first completed draw; embedded source procedural buildMs is deliberately omitted.' });
  for (const quality of fromGLB ? ['mobile'] : selectedQualities) {
    const trials = [];
    for (let trial = 0; trial < trialCount; trial++) {
      // A fresh GPU process also releases shader/texture state from prior trials.
      await browser.close();
      browser=await launchBrowser();
      const context = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
      const page = await open(context, `benchmark-${quality}-${trial}`, quality);
      await configure(page, { view: 'threeQuarter', pose: 'stand' });
      let loadAndFirstDrawMs;
      if (fromGLB) {
        loadAndFirstDrawMs = await page.evaluate(async url => {
          const started = performance.now(); await window.lab.loadGLB(url);
          window.lab.setView('threeQuarter'); window.lab.setPose('stand', true); window.lab.renderer.getContext().finish();
          return performance.now() - started;
        }, `${service.url}/${baselineRelative}`);
      }
      const modelMetrics = await page.evaluate(() => window.lab.metrics());
      const hasExpressions = await page.evaluate(() => {
        let found = false;
        window.lab.activeRoot.traverse(mesh => { if (mesh.morphTargetDictionary?.happy !== undefined && mesh.morphTargetDictionary?.thinking !== undefined) found = true; });
        return found;
      });
      phone.expressions = hasExpressions ? expressions : [];
      phone.expressionAnimation = hasExpressions ? 'happy → effort → surprised → victory → tired → thinking → happy; 0.6 s per leg; cosine eased' : 'baseline has fixed facial geometry';
      if (fromGLB) delete modelMetrics.buildMs;
      const result = await page.evaluate(async withExpressions => {
        const lab = window.lab, gl = lab.renderer.getContext();
        const gpuExtension = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = gpuExtension ? gl.getParameter(gpuExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const drawDurations = [];
        const draw = (elapsed, measure = false) => {
          const before = performance.now();
          const cycle = Math.max(0, elapsed) / 1200, step = Math.floor(cycle) % 3, fraction = cycle % 1;
          const names = ['stand', 'run', 'kick'];
          lab.setBlend(names[step], names[(step + 1) % 3], .5 - .5 * Math.cos(Math.PI * fraction), false);
          if (withExpressions) {
            const faces = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'], faceCycle = Math.max(0, elapsed) / 600, faceStep = Math.floor(faceCycle) % faces.length;
            lab.model.setExpressionBlend(faces[faceStep], faces[(faceStep + 1) % faces.length], .5 - .5 * Math.cos(Math.PI * (faceCycle % 1)));
          }
          lab.render();
          // Pose and face update once before the one completed draw.
          gl.finish();
          if (measure) drawDurations.push(performance.now() - before);
        };
        let first = null, last = null;
        const warmupStart = performance.now();
        await new Promise(done => {
          const frame = timestamp => { draw(timestamp - warmupStart); if (performance.now() - warmupStart < 1000) requestAnimationFrame(frame); else done(); };
          requestAnimationFrame(frame);
        });
        const intervals = [], elapsedStart = performance.now();
        await new Promise(done => {
          const frame = timestamp => {
            if (first === null) first = timestamp;
            if (last !== null) intervals.push(timestamp - last);
            last = timestamp;
            draw(timestamp - elapsedStart, true);
            if (performance.now() - elapsedStart < 5000 || intervals.length < 3) requestAnimationFrame(frame); else done();
          };
          requestAnimationFrame(frame);
        });
        return { intervals, renderAndFinishMs: drawDurations, fps: intervals.length * 1000 / (last - first), intervalWindowMs: last - first, measureWallMs: performance.now() - elapsedStart, warmupWallMs: elapsedStart - warmupStart, gpu, glVersion: gl.getParameter(gl.VERSION), dpr: devicePixelRatio, rendererSize: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }, rendererCalls: lab.renderer.info.render.calls, rendererTriangles: lab.renderer.info.render.triangles, expressionTransitionsIncluded: withExpressions };
      }, hasExpressions);
      trials.push({ trial: trial + 1, softwareWorkerThreads: report.environment.swiftShaderWorkerThreads, ...modelMetrics, ...(fromGLB ? { loadAndFirstDrawMs } : {}), ...result, frameMs: stats(result.intervals), renderAndFinishMsStats: stats(result.renderAndFinishMs), meetsFrameLimits: result.fps >= stabilityCriteria.minimumFPS && stats(result.intervals).p95 <= stabilityCriteria.maximumP95FrameMs });
      await context.close();
      console.log(`${baseline ? 'baseline GLB ' : delivered ? 'delivered GLB ' : ''}${quality} ${trial + 1}/${trialCount}: ${result.fps.toFixed(2)} FPS, p95 ${stats(result.intervals).p95.toFixed(1)} ms`);
    }
    const fps = stats(trials.map(t => t.fps));
    phone.quality[quality] = { trials, fps, ...(fromGLB ? { loadAndFirstDrawMs: stats(trials.map(t => t.loadAndFirstDrawMs)) } : { buildMs: stats(trials.map(t => t.buildMs ?? t.totalBuildMs ?? t.buildTimeMs ?? 0)) }), modelTriangles: trials[0].modelTriangles ?? trials[0].triangles, renderScale: trials[0].viewport?.renderScale ?? trials[0].rendererSize.width / phoneViewport.width, rendererSize: trials[0].rendererSize, stable: trials.every(t => t.meetsFrameLimits) && fps.max / fps.min <= stabilityCriteria.maximumTrialFPSRatio, trialFPSRatio: fps.max / fps.min };
    await writeReport();
  }
  phone.runtimeObservations = report.environment.runtimeObservation.observations.slice(observationStart);
}
async function writeReport() {
  report.recordedAtUTC = new Date().toISOString();
  report.recordedAtJerusalem = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  report.browserChecks = { errors, warnings, externalRequests: [...new Set(externalRequests)] };
  await writeFile(resolve(shots, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  const qualities = report.phone?.quality || {};
  const rows = Object.entries(qualities).map(([name, q]) => `| ${name} | ${q.modelTriangles ?? '?'} | ${q.buildMs.median.toFixed(2)} | ${q.rendererSize?.width ?? '?'}×${q.rendererSize?.height ?? '?'} (${q.renderScale ?? '?'}) | ${q.fps.median.toFixed(2)} | ${Math.max(...q.trials.map(t => t.frameMs.p95)).toFixed(1)} | ${q.stable ? 'עבר' : 'לא עבר'} |`).join('\n');
  const baseline = report.phoneBaseline?.quality?.mobile;
  const baselineSummary = baseline ? `\n\nבסיס המקור נמדד מחדש באותה סביבת דפדפן וב־${baseline.trials.length} contexts טריים: ${baseline.modelTriangles} משולשים; FPS חציוני ${baseline.fps.median.toFixed(2)}, טווח ${baseline.fps.min.toFixed(2)}–${baseline.fps.max.toFixed(2)}, p95 מרבי ${Math.max(...baseline.trials.map(t => t.frameMs.p95)).toFixed(1)}ms. טעינת GLB וציור ראשון חציוניים: ${baseline.loadAndFirstDrawMs.median.toFixed(2)}ms. אין כאן זמן בנייה פרוצדורלי של גרסת המקור. ` : '';
  await writeFile(resolve(work, 'capture-report.md'), `# צילום ומדידה\n\nתקציב mobile וה־GLB שנמסר: עד 20,000 משולשים. תנאי יציבות שנקבעו מראש: לפחות 40 FPS בכל ריצה, p95 לכל היותר 50ms, יחס מקסימום/מינימום בין הריצות לכל היותר 1.15.\n\n| איכות | משולשים במודל | בנייה חציונית ms | buffer וקנה מידה | FPS חציוני | p95 מקסימלי ms | יציבות |\n|---|---:|---:|---|---:|---:|---|\n${rows}${baselineSummary}\n\n390×844 CSS pixels, DPR1 של context. גודל ה־buffer וקנה המידה בפועל מפורטים בטבלה; דגימת הפריימים כוללת הגדלה למסך. חימום 1s ו־5s מדידה בכל context טרי; requestAnimationFrame ו־gl.finish לאחר כל ציור; מעבר רציף בין תנוחות ושש הבעות כאשר הן קיימות בנכס. ${report.environment.browserVersion || ''}. הרינדור בענן ולא בטלפון פיזי.\n\nGLB: ${report.glb?.bytes ?? '?'} bytes; הפרש RGB ממוצע מקסימלי מתוך 255: ${report.glb?.maximumRGBMeanDifference ?? '?'}. ההשוואה ב־${report.glb?.roundtripImageCount ?? '?'} צילומים: שלוש תנוחות וארבע זוויות, ועוד 12 דגימות של האנימציות המיוצאות במיקסר; snapshots קודקודים נשמרים בדוח לכל תנוחה.\n\nגישה לפיקסלי תמונות היעד: ${report.reference?.sourcePixelAccess ? 'כן — קובץ המקור נקרא ישירות' : 'טרם נבדקה'}. גיליון ההבעות נגיש: ${report.expressionReference?.sourcePixelAccess ? 'כן' : 'טרם נבדק'}. צילום ההשוואה החדש כולל יעד/לפני/אחרי וחיתוכי פנים ושיער, באותה מצלמה ותאורה. המבט הרביעי ביעד הוא חזית חוזרת; אין יעד שלושה רבעים.\n`);
}
try {
  browser = await launchBrowser();
  report.environment.browserVersion = browser.version();
  if (!benchmarkOnly) await captureModels();
  if (baselineBenchmark) await benchmark({ baseline: true });
  else if (deliveredBenchmark) await benchmark({ delivered: true });
  else if (!shotsOnly) { await benchmark(); if (!benchmarkOnly) { await benchmark({ baseline: true }); await benchmark({ delivered: true }); } }
  if (!shotsOnly && !baselineBenchmark && !deliveredBenchmark && selectedQualities.includes('mobile')) assert(report.phone.quality.mobile.stable, 'Mobile did not meet >=40 FPS, p95<=50ms and maximum trial ratio 1.15');
  if (deliveredBenchmark || (!benchmarkOnly && !shotsOnly)) assert(report.phoneDelivered.quality.mobile.stable, 'Delivered GLB did not meet >=40 FPS, p95<=50ms and maximum trial ratio 1.15');
  await writeReport();
  if (!benchmarkOnly) assert(report.glb.pass, `GLB roundtrip exceeded predefined tolerances: meanRGB ${report.glb.maximumRGBMeanDifference}, pixels>8 ${report.glb.maximumAbove8PixelsPercent}%`);
  assert.equal(errors.length, 0, `Browser errors: ${JSON.stringify(errors)}`);
  assert.equal(externalRequests.length, 0, 'External runtime requests');
  console.log(`Captured evidence in ${shots}; report in shots/metrics.json`);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await writeReport();
  throw error;
} finally {
  await browser?.close();
  await service.close();
}
