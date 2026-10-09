/** Reproducible browser evidence. Writes only inside this laboratory. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
const expressionNames = { happy: 'שמח', effort: 'מאמץ', surprised: 'מופתע', victory: 'ניצחון', tired: 'עייף ומרוצה', thinking: 'מחשבה' };
const phoneViewport = { width: 390, height: 844 };
const pictureViewport = { width: 480, height: 720 };
const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const errors = [], warnings = [], externalRequests = [];
const args = process.argv.slice(2);
const expressionBaselineOnly = args.includes('--expression-baseline');
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
const roundtripCriteria = { maximumRGBMeanDifference: .05, maximumAbove8PixelPercent: .1, maximumSampledVertexDelta: 1e-5, maximumBoneLocalChannelDelta: 1e-6 };
await mkdir(shots, { recursive: true });
await mkdir(work, { recursive: true });
const service = await startServer();
const origin = new URL(service.url).origin;
let browser;
let report = {};
if (benchmarkOnly || shotsOnly) {
  try { report = JSON.parse(await readFile(resolve(shots, 'metrics.json'), 'utf8')); } catch { /* first run */ }
}
const preservedImplementation = report.implementation;
delete report.failure;
report.capture = { viewport: pictureViewport, dpr: 1, views, poses };
report.environment = { chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', flags, browserVersion: null, playwrightVersion: JSON.parse(await readFile(new URL(import.meta.resolve('playwright-core/package.json')), 'utf8')).version };
report.stabilityCriteria = stabilityCriteria;
report.budgetCriteria = budgetCriteria;
report.implementation = {};
for (const file of ['rig.mjs', 'scene.mjs', 'expressions.mjs', 'facial-morphs.mjs', 'studio-bake.mjs', 'parts/body.mjs', 'parts/head.mjs', 'parts/hand.mjs', 'parts/shoe.mjs']) report.implementation[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
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
async function open(context, label, quality = 'balanced', capture = true, experiment = selectedExperiment) {
  const page = await context.newPage();
  watch(page, label);
  await page.goto(`${service.url}/?capture=${capture ? '1' : '0'}&quality=${quality}&view=front&pose=stand&resolution=${page.viewportSize().width === pictureViewport.width ? 'full' : 'auto'}${experiment ? `&experiment=${encodeURIComponent(experiment)}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.lab, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await Promise.resolve(window.labReady ?? window.lab.ready);
    if (typeof window.lab.stop === 'function') window.lab.stop();
  });
  await configure(page, { quality });
  return page;
}
async function configure(page, { quality, view = 'front', pose = 'stand', expression } = {}) {
  await page.evaluate(async ({ quality, view, pose, expression }) => {
    const lab = window.lab;
    if (quality && lab.metrics().detail !== quality) await lab.setQuality(quality);
    await lab.setPose(pose, true);
    if (expression !== undefined) await lab.setExpression(expression, true);
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
async function snapshot(page) {
  return page.evaluate(async () => {
    const { Vector3 } = await import('./vendor/three.module.js');
    const lab = window.lab;
    const active = lab.activeRoot ?? lab.model?.group ?? lab.model?.root ?? lab.model ?? lab.scene;
    active.updateMatrixWorld(true);
    const meshes = [];
    active.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
      const attribute = mesh.geometry.attributes.position;
      const points = [];
      // Sampling covers every mesh and evenly spaced vertices, plus both ends.
      const step = Math.max(1, Math.floor(attribute.count / 32));
      const indices = new Set([0, attribute.count - 1]);
      for (let i = 0; i < attribute.count; i += step) indices.add(i);
      mesh.skeleton?.update();
      for (const i of indices) {
        // Mesh/SkinnedMesh.getVertexPosition applies both morph targets and skin.
        const point = mesh.getVertexPosition(i, new Vector3());
        point.applyMatrix4(mesh.matrixWorld);
        points.push(...point.toArray());
      }
      meshes.push({ name: mesh.name, vertices: attribute.count, skinned: !!mesh.isSkinnedMesh, morphTargets: Object.keys(mesh.morphTargetDictionary || {}), points });
    });
    return meshes;
  });
}
async function boneSnapshot(page) {
  return page.evaluate(() => window.lab.model.bones.map(bone => ({ name: bone.name, position: bone.position.toArray(), quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray() })));
}
async function morphSnapshot(page) {
  return page.evaluate(() => {
    const result = [];
    window.lab.activeRoot.traverse(mesh => {
      if (mesh.isMesh && mesh.morphTargetInfluences?.length) result.push({ name: mesh.name, dictionary: { ...mesh.morphTargetDictionary }, weights: [...mesh.morphTargetInfluences] });
    });
    return result;
  });
}
function morphDifference(source, loaded) {
  const lookup = new Map(loaded.map(mesh => [mesh.name, mesh]));
  let maximumWeightDelta = 0;
  const missing = [], dictionaryDifferences = [];
  for (const mesh of source) {
    const other = lookup.get(mesh.name);
    if (!other) { missing.push(mesh.name); continue; }
    if (JSON.stringify(mesh.dictionary) !== JSON.stringify(other.dictionary)) dictionaryDifferences.push(mesh.name);
    for (const [name, index] of Object.entries(mesh.dictionary)) maximumWeightDelta = Math.max(maximumWeightDelta, Math.abs(mesh.weights[index] - other.weights[other.dictionary[name]]));
  }
  return { sourceMeshes: source.length, loadedMeshes: loaded.length, missingMeshes: missing, dictionaryDifferences, maximumWeightDelta };
}
async function saveHead(page, relative) {
  const path = resolve(shots, relative);
  await mkdir(dirname(path), { recursive: true });
  // Raster crop of the same body photograph, with no new camera/light setup.
  return page.screenshot({ path, clip: { x: 70, y: 20, width: 340, height: 280 }, animations: 'disabled' });
}
async function captureExpressionStates(page, { loaded = false, source = {} } = {}) {
  const states = loaded ? report.glb.expressions : report.expressions;
  for (const id of expressions) {
    states[id] = { views: {}, vertexChecks: {}, morphChecks: {} };
    for (const view of views) {
      const metrics = await configure(page, { pose: 'stand', view, expression: id });
      const relative = `${loaded ? 'roundtrip/expressions' : 'expressions'}/${id}-${view}`;
      const bytes = await saveImage(page, `${relative}.png`);
      await saveHead(page, `${relative}-head.png`);
      const key = `${id}-${view}`;
      if (loaded) {
        states[id].views[view] = imageDifference(await readFile(resolve(shots, `expressions/${key}.png`)), bytes);
        states[id].vertexChecks[view] = snapshotDifference(source[key].vertices, await snapshot(page));
        states[id].morphChecks[view] = morphDifference(source[key].morphs, await morphSnapshot(page));
      } else {
        states[id].views[view] = metrics;
        source[key] = { vertices: await snapshot(page), morphs: await morphSnapshot(page) };
      }
    }
  }
  return source;
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
    return { method: 'same mesh order and vertex indices', sampledPositions: a.length, maximumPositionDelta: Math.max(...deltas), meanPositionDelta: deltas.reduce((s, n) => s + n, 0) / deltas.length };
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
  return { method: 'bidirectional nearest sampled world-space positions; supports duplicate material primitives, sampling only', sourceMeshes: source.length, loadedMeshes: loaded.length, sourceSampledPositions: a.length, loadedSampledPositions: b.length, maximumPositionDelta: Math.max(...deltas), meanPositionDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length };
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
  const sourceAnimationSnapshots = {}, sourceAnimationBones = {}, sourceAnimationMorphs = {};
  report.animationSamples = [];
  const clipMetadata = await page.evaluate(() => window.lab.clips());
  for (const clip of clipMetadata) for (const fraction of [0, .25, .5, .75]) {
    const sample = { clip: clip.name, duration: clip.duration, time: clip.duration * fraction, fraction, view: 'threeQuarter', id: `${clip.name}-${String(fraction).replace('.', '_')}` };
    await page.evaluate(sample => { window.lab.setView(sample.view); window.lab.sampleClip(sample.clip, sample.time); window.lab.renderer.getContext().finish(); }, sample);
    await saveImage(page, `animation/source-${sample.id}.png`);
    sourceAnimationSnapshots[sample.id] = await snapshot(page);
    sourceAnimationBones[sample.id] = await boneSnapshot(page);
    sourceAnimationMorphs[sample.id] = await morphSnapshot(page);
    report.animationSamples.push(sample);
  }
  assert.deepEqual(await page.evaluate(() => window.lab.expressions()), expressions, 'Scene must expose all six expression IDs');
  report.expressions = {};
  const sourceExpressionStates = await captureExpressionStates(page);
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
  const morphMeshes = (glbJSON.meshes || []).filter(mesh => mesh.primitives.some(p => p.targets?.length));
  assert(morphMeshes.length > 0, 'GLB does not contain expression morph targets');
  for (const mesh of morphMeshes) {
    assert.deepEqual(mesh.extras?.targetNames, expressions, `GLB ${mesh.name}: named expression target order differs`);
    for (const primitive of mesh.primitives) assert.equal(primitive.targets?.length, 6, `GLB ${mesh.name}: expected six morph targets`);
  }
  for (const animation of glbJSON.animations) assert(animation.channels.some(channel => channel.target.path === 'weights'), `GLB ${animation.name}: expression weight animation is missing`);
  report.glb = { path: 'kid-full.glb', bytes: glbBytes.length, sha256: createHash('sha256').update(glbBytes).digest('hex'), scenes: glbJSON.scenes?.length, skins: glbJSON.skins?.length, bones: new Set((glbJSON.skins || []).flatMap(skin => skin.joints)).size, animationNames: glbJSON.animations?.map(a => a.name), imageCount: glbJSON.images?.length, imagesEmbedded: (glbJSON.images || []).every(i => i.bufferView !== undefined && !i.uri), externalBufferURIs: (glbJSON.buffers || []).filter(b => b.uri).map(b => b.uri), views: {}, vertexChecks: {}, boneChecks: {}, animationViews: {}, animationVertexChecks: {}, animationBoneChecks: {} };
  Object.assign(report.glb, { morphMeshNames: morphMeshes.map(m => m.name), morphTargetNames: expressions, expressions: {}, animationMorphChecks: {} });
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
    report.glb.animationMorphChecks[sample.id] = morphDifference(sourceAnimationMorphs[sample.id], await morphSnapshot(page));
  }
  await captureExpressionStates(page, { loaded: true, source: sourceExpressionStates });
  await page.evaluate(() => window.lab.useSource());
  const expressionResults = Object.values(report.glb.expressions);
  const allRoundtripPixels = [...Object.values(report.glb.views).flatMap(v => Object.values(v)), ...Object.values(report.glb.animationViews), ...expressionResults.flatMap(e => Object.values(e.views))];
  const allRoundtripVertices = [...Object.values(report.glb.vertexChecks), ...Object.values(report.glb.animationVertexChecks), ...expressionResults.flatMap(e => Object.values(e.vertexChecks))];
  const allRoundtripBones = [...Object.values(report.glb.boneChecks), ...Object.values(report.glb.animationBoneChecks)];
  report.glb.maximumRGBMeanDifference = Math.max(...allRoundtripPixels.map(v => v.rgbMeanAbsoluteDifference));
  report.glb.maximumChangedPixelsPercent = Math.max(...allRoundtripPixels.map(v => v.changedPixelPercent));
  report.glb.maximumAbove8PixelsPercent = Math.max(...allRoundtripPixels.map(v => v.above8PixelPercent));
  report.glb.criteria = roundtripCriteria;
  report.glb.pass = report.glb.maximumRGBMeanDifference <= roundtripCriteria.maximumRGBMeanDifference
    && report.glb.maximumAbove8PixelsPercent <= roundtripCriteria.maximumAbove8PixelPercent
    && allRoundtripVertices.every(v => v.maximumPositionDelta <= roundtripCriteria.maximumSampledVertexDelta)
    && allRoundtripBones.every(v => v.sourceBones === v.loadedBones && v.missingBoneNames.length === 0 && v.maximumLocalTransformChannelDelta <= roundtripCriteria.maximumBoneLocalChannelDelta)
    && expressionResults.flatMap(e => Object.values(e.morphChecks)).every(v => v.sourceMeshes > 0 && v.sourceMeshes === v.loadedMeshes && v.missingMeshes.length === 0 && v.dictionaryDifferences.length === 0 && v.maximumWeightDelta <= 1e-6);
  report.glb.pass &&= Object.values(report.glb.animationMorphChecks).every(v => v.sourceMeshes > 0 && v.sourceMeshes === v.loadedMeshes && v.missingMeshes.length === 0 && v.dictionaryDifferences.length === 0 && v.maximumWeightDelta <= 1e-6);
  // Keep producing all measurements/artifacts; the final process result still fails if roundtrip did not pass.
  // Transition samples make the intermediate surface state reviewable.
  for (const [from, to] of [['stand', 'run'], ['run', 'kick'], ['kick', 'stand']]) {
    for (const t of [0, .25, .5, .75, 1]) {
      await page.evaluate(({ from, to, t }) => { window.lab.setView('threeQuarter'); window.lab.setBlend(from, to, t); window.lab.render(); window.lab.renderer.getContext().finish(); }, { from, to, t });
      await saveImage(page, `transitions/${from}-${to}-${String(t).replace('.', '_')}.png`);
    }
  }
  for (const [from, to] of [['happy', 'surprised'], ['effort', 'victory'], ['tired', 'thinking']]) for (const t of [0, .25, .5, .75, 1]) {
    await configure(page, { view: 'front', pose: 'stand' });
    await page.evaluate(({ from, to, t }) => { window.lab.setExpressionBlend(from, to, t); window.lab.renderer.getContext().finish(); }, { from, to, t });
    const key = `${from}-${to}-${String(t).replace('.', '_')}`;
    await saveImage(page, `expression-transitions/${key}.png`);
    await saveHead(page, `expression-transitions/${key}-head.png`);
  }
  await captureBaseline(page);
  await buildComparison(page);
  await buildPoseGrid(page);
  await buildExpressionGrid(page);
  await context.close();
  await captureExperiments();
  await captureGallery();
  const phoneContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
  const phonePage = await open(phoneContext, 'phone-shot', 'mobile');
  await configure(phonePage, { view: 'threeQuarter', pose: 'kick' });
  await saveImage(phonePage, 'phone.png');
  await phoneContext.close();
}
async function captureGallery() {
  report.expressionGallery = {};
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', phoneViewport]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage(); watch(page, `expression-gallery-${name}`);
    await page.goto(`${service.url}/expressions.html?quality=mobile`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await window.labReady; window.lab.stop(); window.lab.setExpression('happy', true); window.lab.renderer.getContext().finish(); });
    const evidence = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth, canvases: document.querySelectorAll('canvas').length, images: [...document.querySelectorAll('table img')].map(img => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })) }));
    assert.equal(evidence.canvases, 1, 'Gallery must have one live renderer');
    assert(evidence.scrollWidth <= viewport.width, 'Expression gallery has horizontal overflow');
    assert.equal(evidence.images.length, 6, 'Expression gallery must contain six photos');
    assert(evidence.images.every(img => img.loaded), 'Expression gallery preview did not load');
    await page.screenshot({ path: resolve(shots, `expression-gallery-${name}.png`), fullPage: true, animations: 'disabled' });
    report.expressionGallery[name] = evidence;
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
  const baselinePath = resolve(shots, 'expression-baseline/kid-full.glb');
  let bytes;
  try { bytes = await readFile(baselinePath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; throw Error('Run node capture.mjs --expression-baseline before exporting the new model'); }
  await configure(page, { quality: 'mobile', pose: 'stand', view: 'front' });
  const settings = await studioSettings(page);
  report.beforeAfter = {
    before: { path: 'shots/expression-baseline/kid-full.glb', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, metrics: {}, crops: {} },
    after: { source: 'procedural mobile; exported and roundtrip checked', metrics: {}, crops: report.screenshotCrops },
    settings, settingsIdentical: true, pose: 'stand', views, fullModelPairResizing: 'one common crop and one uniform scale per before/after pair',
    headCropCSS: [70, 20, 340, 280], headCropMethod: 'fixed raster crop from the full-model camera; identical before and after',
    lightingNote: 'Both models share these live scene lights. Each model retains its own baked vertex colours and materials.',
  };
  await page.evaluate(async () => window.lab.loadGLB('./shots/expression-baseline/kid-full.glb'));
  for (const view of views) {
    report.beforeAfter.before.metrics[view] = await configure(page, { pose: 'stand', view });
    assert.deepEqual(await studioSettings(page), settings, `Before camera/light settings changed for ${view}`);
    await saveImage(page, `expression-baseline/${view}.png`);
    report.beforeAfter.before.crops[view] = await projectedCrop(page);
  }
  await page.evaluate(() => window.lab.useSource());
  for (const view of views) {
    report.beforeAfter.after.metrics[view] = await configure(page, { pose: 'stand', view });
    assert.deepEqual(await studioSettings(page), settings, `After camera/light settings changed for ${view}`);
    await saveImage(page, `after/${view}.png`);
  }
}
async function captureExpressionBaseline() {
  const path = resolve(shots, 'expression-baseline/kid-full.glb');
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await readFile(resolve(root, 'kid-full.glb'));
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  const context = await browser.newContext({ viewport: pictureViewport, deviceScaleFactor: 1 });
  const page = await open(context, 'expression-baseline', 'mobile');
  await page.evaluate(() => window.lab.loadGLB('./shots/expression-baseline/kid-full.glb'));
  const settings = await studioSettings(page), metrics = {}, crops = {};
  for (const view of views) {
    metrics[view] = await configure(page, { pose: 'stand', view });
    assert.deepEqual(await studioSettings(page), settings);
    await saveImage(page, `expression-baseline/${view}.png`);
    await saveHead(page, `expression-baseline/${view}-head.png`);
    crops[view] = await projectedCrop(page);
  }
  await writeFile(resolve(shots, 'expression-baseline/capture.json'), `${JSON.stringify({ recordedAt: new Date().toISOString(), path: 'shots/expression-baseline/kid-full.glb', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, settings, metrics, crops, historicalBeforeUnchanged: true }, null, 2)}\n`);
  await context.close();
  console.log(`Preserved this-turn expression baseline: ${metrics.front.modelTriangles} triangles`);
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
  const dataURL = await page.evaluate(async ({ origin, viewName, expressionName, crops, expressionCrop, comparison }) => {
    const getImage = url => new Promise((accept, reject) => { const image = new Image(); image.onload = () => accept(image); image.onerror = () => reject(Error(`Could not load image ${url}`)); image.src = url; });
    const [target, expressions] = await Promise.all([getImage(`${origin}/ref/${encodeURIComponent(viewName)}`), getImage(`${origin}/ref/${encodeURIComponent(expressionName)}`)]);
    const views = ['front', 'side', 'back'], names = ['חזית', 'צד', 'גב'];
    const before = await Promise.all(views.map(view => getImage(`${origin}/shots/expression-baseline/${view}.png`)));
    const after = await Promise.all(views.map(view => getImage(`${origin}/shots/after/${view}.png`)));
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
    const labels = ['יעד מקורי', 'לפני — GLB המקור', 'אחרי — mobile'];
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
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 29px sans-serif'; ctx.fillText('תקריב פנים ושיער — לפני לעומת עמידה רגועה', 720, 830);
    ctx.font = '23px sans-serif'; for (let c = 0; c < 3; c++) ctx.fillText(labels[c], 253 + c * 466, 869);
    fit(expressions, expressionCrop, 35, 892, 436, 324);
    fit(before[0], comparison.headCropCSS, 501, 892, 436, 324);
    fit(after[0], comparison.headCropCSS, 967, 892, 436, 324);
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('גיליון ההבעות המקורי', 1940, 830);
    fit(expressions, [0, 0, expressions.width, expressions.height], 1460, 849, 960, 622);
    ctx.font = '20px sans-serif'; ctx.fillText('גיליון המקור מוצג בשלמותו; שש ההבעות החדשות בגלריה נפרדת.', 1940, 1520);
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
  }, { origin, viewName: referenceName, expressionName, crops: report.reference.crops, expressionCrop: report.expressionReference.neutralHeadCrop, comparison: report.beforeAfter });
  const comparisonBytes = Buffer.from(dataURL.split(',')[1], 'base64');
  await writeFile(resolve(shots, 'comparison.png'), comparisonBytes);
  await writeFile(resolve(shots, 'before-after-target.png'), comparisonBytes);
  await writeFile(resolve(shots, 'expressions-before-after-target.png'), comparisonBytes);
  report.beforeAfter.comparisonPath = 'shots/comparison.png';
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
  const files = await readdir(resolve(root, '../ref'));
  const targetName = files.find(name => name.startsWith('גיליון הבעות'));
  const data = await page.evaluate(async ({ origin, expressions, names, targetName }) => {
    const getImage = url => new Promise((accept, reject) => { const image = new Image(); image.onload = () => accept(image); image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 2440; canvas.height = 1460;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f3f0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillStyle = '#27364a'; ctx.font = 'bold 34px sans-serif';
    ctx.fillText('שש הבעות בדמות המלאה — יעד המקור, לפני ואחרי', 1220, 52);
    ctx.font = '22px sans-serif'; ctx.fillText('כל תקריבי המודל מאותה מצלמת גוף מלא ואותה תאורה; גיליון היעד מוצג ללא שיוך מומצא להבעות המבוקשות.', 1220, 90);
    const fit = (image, x, y, w, h) => { const scale = Math.min(w / image.width, h / image.height); ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale); };
    const [target, before] = await Promise.all([getImage(`${origin}/ref/${encodeURIComponent(targetName)}`), getImage(`${origin}/shots/expression-baseline/front-head.png`)]);
    ctx.fillStyle = '#fff'; ctx.fillRect(20, 120, 650, 900); ctx.fillRect(20, 1040, 650, 385);
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 27px sans-serif'; ctx.fillText('גיליון יעד מקורי — כל הפיקסלים', 345, 165);
    fit(target, 35, 200, 620, 790); ctx.fillText('לפני הסבב — GLB שמור, חיוך קבוע', 345, 1082); fit(before, 105, 1110, 480, 280);
    for (let i = 0; i < expressions.length; i++) {
      const x = 700 + (i % 3) * 575, y = 120 + Math.floor(i / 3) * 650;
      const [head, body] = await Promise.all([getImage(`${origin}/shots/expressions/${expressions[i]}-front-head.png`), getImage(`${origin}/shots/expressions/${expressions[i]}-front.png`)]);
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 550, 625); ctx.fillStyle = '#27364a'; ctx.font = 'bold 29px sans-serif'; ctx.fillText(names[expressions[i]], x + 275, y + 43);
      fit(head, x + 15, y + 65, 520, 330); fit(body, x + 165, y + 397, 220, 220);
    }
    ctx.font = '21px sans-serif'; ctx.fillText('יעד: שינוי גודל אחיד בלבד. תקריבי המודל: חיתוך רסטר קבוע 340×280 מתוך צילום 480×720.', 1570, 1440);
    return canvas.toDataURL('image/png');
  }, { origin, expressions, names: expressionNames, targetName });
  await writeFile(resolve(shots, 'expression-comparison.png'), Buffer.from(data.split(',')[1], 'base64'));
  report.expressionComparison = { path: 'shots/expression-comparison.png', baseline: 'shots/expression-baseline/front-head.png', fullOriginalTargetSheet: true, targetCellMapping: 'none', cameraAndLights: 'identical full-body studio; fixed head raster crops', expressions };
}
async function benchmark({ baseline = false, delivered = false } = {}) {
  const fromGLB = baseline || delivered;
  let baselineRelative, baselineBytes;
  if (baseline) {
    try { baselineRelative = 'shots/expression-baseline/kid-full.glb'; baselineBytes = await readFile(resolve(root, baselineRelative)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; baselineRelative = 'work/baseline/kid-full.glb'; baselineBytes = await readFile(resolve(root, baselineRelative)); }
  } else if (delivered) {
    baselineRelative = 'kid-full.glb';
    baselineBytes = await readFile(resolve(root, baselineRelative));
  }
  const key = baseline ? 'phoneBaseline' : delivered ? 'phoneDelivered' : 'phone';
  const phone = report[key] = { experiment: selectedExperiment || 'final', viewport: phoneViewport, dpr: 1, requestedWarmupMs: 1000, requestedMeasureMs: 5000, freshContextsPerQuality: trialCount, view: 'threeQuarter', animation: 'stand → run → kick → stand body loop (1.2s per leg) and all six expressions (0.8s per leg); cosine eased; one completed draw per frame', glFinishEachFrame: true, quality: {} };
  if (fromGLB) Object.assign(phone, { experiment: baseline ? 'preserved-original-GLB' : 'delivered-GLB', modelSource: `${baseline ? 'preserved original' : 'delivered'} GLB loaded through the same lab scene`, path: baselineRelative, sha256: createHash('sha256').update(baselineBytes).digest('hex'), timingMethod: 'loadAndFirstDrawMs measures local GLB loading/parsing and first completed draw; embedded source procedural buildMs is deliberately omitted.' });
  for (const quality of fromGLB ? ['mobile'] : selectedQualities) {
    const trials = [];
    for (let trial = 0; trial < trialCount; trial++) {
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
      if (fromGLB) delete modelMetrics.buildMs;
      const result = await page.evaluate(async () => {
        const lab = window.lab, gl = lab.renderer.getContext();
        const gpuExtension = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = gpuExtension ? gl.getParameter(gpuExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const drawDurations = [];
        const draw = (elapsed, measure = false) => {
          const before = performance.now();
          const cycle = Math.max(0, elapsed) / 1200, step = Math.floor(cycle) % 3, fraction = cycle % 1;
          const names = ['stand', 'run', 'kick'];
          const t = .5 - .5 * Math.cos(Math.PI * fraction);
          lab.setBlend(names[step], names[(step + 1) % 3], t, false);
          const expressionNames = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'];
          const expressionCycle = Math.max(0, elapsed) / 800, expressionStep = Math.floor(expressionCycle) % expressionNames.length;
          const expressionT = .5 - .5 * Math.cos(Math.PI * (expressionCycle % 1));
          if (lab.model.expressionMeshes?.length) lab.setExpressionBlend(expressionNames[expressionStep], expressionNames[(expressionStep + 1) % 6], expressionT, false);
          lab.render();
          // Body and expression weights update together before exactly one draw.
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
        return { intervals, renderAndFinishMs: drawDurations, fps: intervals.length * 1000 / (last - first), intervalWindowMs: last - first, measureWallMs: performance.now() - elapsedStart, warmupWallMs: elapsedStart - warmupStart, gpu, glVersion: gl.getParameter(gl.VERSION), dpr: devicePixelRatio, rendererSize: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }, rendererCalls: lab.renderer.info.render.calls, rendererTriangles: lab.renderer.info.render.triangles };
      });
      trials.push({ trial: trial + 1, ...modelMetrics, ...(fromGLB ? { loadAndFirstDrawMs } : {}), ...result, frameMs: stats(result.intervals), renderAndFinishMsStats: stats(result.renderAndFinishMs), meetsFrameLimits: result.fps >= stabilityCriteria.minimumFPS && stats(result.intervals).p95 <= stabilityCriteria.maximumP95FrameMs });
      await context.close();
      console.log(`${baseline ? 'baseline GLB ' : delivered ? 'delivered GLB ' : ''}${quality} ${trial + 1}/${trialCount}: ${result.fps.toFixed(2)} FPS, p95 ${stats(result.intervals).p95.toFixed(1)} ms`);
    }
    const fps = stats(trials.map(t => t.fps));
    phone.quality[quality] = { trials, fps, ...(fromGLB ? { loadAndFirstDrawMs: stats(trials.map(t => t.loadAndFirstDrawMs)) } : { buildMs: stats(trials.map(t => t.buildMs ?? t.totalBuildMs ?? t.buildTimeMs ?? 0)) }), modelTriangles: trials[0].modelTriangles ?? trials[0].triangles, renderScale: trials[0].viewport?.renderScale ?? trials[0].rendererSize.width / phoneViewport.width, rendererSize: trials[0].rendererSize, stable: trials.every(t => t.meetsFrameLimits) && fps.max / fps.min <= stabilityCriteria.maximumTrialFPSRatio, trialFPSRatio: fps.max / fps.min };
    await writeReport();
  }
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
  await writeFile(resolve(work, 'capture-report.md'), `# צילום ומדידה\n\nתקציב mobile וה־GLB שנמסר: עד 20,000 משולשים. תנאי יציבות שנקבעו מראש: לפחות 40 FPS בכל ריצה, p95 לכל היותר 50ms, יחס מקסימום/מינימום בין הריצות לכל היותר 1.15.\n\n| איכות | משולשים במודל | בנייה חציונית ms | buffer וקנה מידה | FPS חציוני | p95 מקסימלי ms | יציבות |\n|---|---:|---:|---|---:|---:|---|\n${rows}${baselineSummary}\n\n390×844 CSS pixels, DPR1 של context. גודל ה־buffer וקנה המידה בפועל מפורטים בטבלה; דגימת הפריימים כוללת הגדלה למסך. חימום 1s ו־5s מדידה בכל context טרי; requestAnimationFrame ו־gl.finish לאחר כל ציור; מעבר תנוחות רציף. ${report.environment.browserVersion || ''}. הרינדור בענן ולא בטלפון פיזי.\n\nGLB: ${report.glb?.bytes ?? '?'} bytes; הפרש RGB ממוצע מקסימלי מתוך 255: ${report.glb?.maximumRGBMeanDifference ?? '?'}. ההשוואה ב־48 מצבי צילום: שלוש תנוחות וארבע זוויות, 12 דגימות של האנימציות המיוצאות במיקסר, ועוד שש הבעות בארבע זוויות; snapshots קודקודים נשמרים בדוח לכל תנוחה.\n\nגישה לפיקסלי תמונות היעד: ${report.reference?.sourcePixelAccess ? 'כן — קובץ המקור נקרא ישירות' : 'טרם נבדקה'}. גיליון ההבעות נגיש: ${report.expressionReference?.sourcePixelAccess ? 'כן' : 'טרם נבדק'}. צילום ההשוואה החדש כולל יעד/לפני/אחרי וחיתוכי פנים ושיער, באותה מצלמה ותאורה. המבט הרביעי ביעד הוא חזית חוזרת; אין יעד שלושה רבעים.\n`);
}
try {
  browser = await chromium.launch({ executablePath: report.environment.chromiumPath, headless: true, args: flags });
  report.environment.browserVersion = browser.version();
  if (expressionBaselineOnly) await captureExpressionBaseline();
  else {
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
  }
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (!expressionBaselineOnly) await writeReport();
  throw error;
} finally {
  await browser?.close();
  await service.close();
}
