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
const phoneViewport = { width: 390, height: 844 };
const pictureViewport = { width: 480, height: 720 };
const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const errors = [], warnings = [], externalRequests = [];
const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots-only');
const benchmarkOnly = args.includes('--benchmark-only');
const selectedExperiment = args.find(a => a.startsWith('--experiment='))?.split('=')[1] || '';
const selectedQualities = (args.find(a => a.startsWith('--qualities='))?.split('=')[1] || 'dense,balanced,mobile').split(',');
const trialCount = Number(args.find(a => a.startsWith('--trials='))?.split('=')[1] || 3);
// Defined before measuring. The same limits apply to every quality and trial.
const stabilityCriteria = { minimumFPS: 30, maximumP95FrameMs: 50, maximumTrialFPSRatio: 1.15 };
const roundtripCriteria = { maximumRGBMeanDifference: .05, maximumAbove8PixelPercent: .1, maximumSampledVertexDelta: 1e-5, maximumBoneLocalChannelDelta: 1e-6 };
await mkdir(shots, { recursive: true });
await mkdir(work, { recursive: true });
const service = await startServer();
const origin = new URL(service.url).origin;
let browser;
let report = {};
if (benchmarkOnly) {
  try { report = JSON.parse(await readFile(resolve(shots, 'metrics.json'), 'utf8')); } catch { /* first run */ }
}
delete report.failure;
report.capture = { viewport: pictureViewport, dpr: 1, views, poses };
report.environment = { chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', flags, browserVersion: null, playwrightVersion: JSON.parse(await readFile(new URL(import.meta.resolve('playwright-core/package.json')), 'utf8')).version };
report.stabilityCriteria = stabilityCriteria;
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
async function configure(page, { quality, view = 'front', pose = 'stand' } = {}) {
  await page.evaluate(async ({ quality, view, pose }) => {
    const lab = window.lab;
    if (quality && lab.metrics().detail !== quality) await lab.setQuality(quality);
    await lab.setPose(pose, true);
    lab.setView(view);
    lab.render();
    lab.renderer.getContext().finish();
  }, { quality, view, pose });
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
        const point = new Vector3().fromBufferAttribute(attribute, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
        point.applyMatrix4(mesh.matrixWorld);
        points.push(...point.toArray());
      }
      meshes.push({ name: mesh.name, vertices: attribute.count, skinned: !!mesh.isSkinnedMesh, points });
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
  report.glb = { path: 'kid-full.glb', bytes: glbBytes.length, sha256: createHash('sha256').update(glbBytes).digest('hex'), scenes: glbJSON.scenes?.length, skins: glbJSON.skins?.length, bones: new Set((glbJSON.skins || []).flatMap(skin => skin.joints)).size, animationNames: glbJSON.animations?.map(a => a.name), imageCount: glbJSON.images?.length, imagesEmbedded: (glbJSON.images || []).every(i => i.bufferView !== undefined && !i.uri), externalBufferURIs: (glbJSON.buffers || []).filter(b => b.uri).map(b => b.uri), views: {}, vertexChecks: {}, boneChecks: {}, animationViews: {}, animationVertexChecks: {}, animationBoneChecks: {} };
  assert.equal(report.glb.externalBufferURIs.length, 0, 'GLB references external buffers');
  assert(report.glb.imagesEmbedded, 'GLB references external images');
  await page.evaluate(async url => window.lab.loadGLB(url), `${service.url}/kid-full.glb`);
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
  await page.evaluate(() => window.lab.useSource());
  const allRoundtripPixels = [...Object.values(report.glb.views).flatMap(v => Object.values(v)), ...Object.values(report.glb.animationViews)];
  const allRoundtripVertices = [...Object.values(report.glb.vertexChecks), ...Object.values(report.glb.animationVertexChecks)];
  const allRoundtripBones = [...Object.values(report.glb.boneChecks), ...Object.values(report.glb.animationBoneChecks)];
  report.glb.maximumRGBMeanDifference = Math.max(...allRoundtripPixels.map(v => v.rgbMeanAbsoluteDifference));
  report.glb.maximumChangedPixelsPercent = Math.max(...allRoundtripPixels.map(v => v.changedPixelPercent));
  report.glb.maximumAbove8PixelsPercent = Math.max(...allRoundtripPixels.map(v => v.above8PixelPercent));
  report.glb.criteria = roundtripCriteria;
  report.glb.pass = report.glb.maximumRGBMeanDifference <= roundtripCriteria.maximumRGBMeanDifference
    && report.glb.maximumAbove8PixelsPercent <= roundtripCriteria.maximumAbove8PixelPercent
    && allRoundtripVertices.every(v => v.maximumPositionDelta <= roundtripCriteria.maximumSampledVertexDelta)
    && allRoundtripBones.every(v => v.sourceBones === v.loadedBones && v.missingBoneNames.length === 0 && v.maximumLocalTransformChannelDelta <= roundtripCriteria.maximumBoneLocalChannelDelta);
  // Keep producing all measurements/artifacts; the final process result still fails if roundtrip did not pass.
  // Transition samples make the intermediate surface state reviewable.
  for (const [from, to] of [['stand', 'run'], ['run', 'kick'], ['kick', 'stand']]) {
    for (const t of [0, .25, .5, .75, 1]) {
      await page.evaluate(({ from, to, t }) => { window.lab.setView('threeQuarter'); window.lab.setBlend(from, to, t); window.lab.render(); window.lab.renderer.getContext().finish(); }, { from, to, t });
      await saveImage(page, `transitions/${from}-${to}-${String(t).replace('.', '_')}.png`);
    }
  }
  await buildComparison(page);
  await buildPoseGrid(page);
  await context.close();
  await captureExperiments();
  const phoneContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
  const phonePage = await open(phoneContext, 'phone-shot', 'mobile');
  await configure(phonePage, { view: 'threeQuarter', pose: 'kick' });
  await saveImage(phonePage, 'phone.png');
  await phoneContext.close();
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
async function buildComparison(page) {
  const referenceName = (await readdir(resolve(root, '../ref'))).find(name => name.startsWith('מבטים'));
  assert(referenceName, 'No source reference view sheet found');
  const referenceBytes = await readFile(resolve(root, '../ref', referenceName));
  report.reference = { path: `../ref/${referenceName}`, sha256: createHash('sha256').update(referenceBytes).digest('hex'), sourcePixelAccess: true, crops: [[15, 246, 295, 720], [330, 246, 280, 720], [620, 246, 295, 720], [935, 246, 305, 720]], fourthView: 'frontRepeat', threeQuarterTarget: false, cropOnly: false, uniformResizing: true, heightNormalized: true, modelCropMethod: 'precise projected skinned bounds plus 8 CSS pixels', colourEdits: false, perspectiveOrShapeWarp: false };
  const dataURL = await page.evaluate(async ({ origin, name, crops, modelCrops }) => {
    const getImage = url => new Promise((resolveImage, reject) => { const image = new Image(); image.onload = () => resolveImage(image); image.onerror = reject; image.src = url; });
    const target = await getImage(`${origin}/ref/${encodeURIComponent(name)}`);
    const modelViews = ['front', 'side', 'back', 'front'];
    const models = await Promise.all(modelViews.map(view => getImage(`${origin}/shots/${view}.png`)));
    const threeQuarter = await getImage(`${origin}/shots/threeQuarter.png`);
    const canvas = document.createElement('canvas');
    canvas.width = 2740; canvas.height = 890;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 32px sans-serif';
    ctx.fillText('דמות מלאה — פיקסלי היעד לצד המודל', canvas.width / 2, 52);
    ctx.font = '19px sans-serif'; ctx.fillText('חיתוך שוליים ושינוי גודל אחיד; היחס נשמר. צילום המודל באותה מצלמה ותאורה בכל מבט.', canvas.width / 2, 86);
    const names = ['חזית', 'צד', 'גב', 'חזית חוזרת'];
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 560;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 117, 544, 685);
      ctx.fillStyle = '#27364a'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(names[i], x + 272, 150);
      ctx.font = '17px sans-serif'; ctx.fillText('יעד מקורי', x + 136, 185); ctx.fillText('מודל', x + 408, 185);
      const crop = crops[i], h = 550, scale = h / crop[3], w = crop[2] * scale;
      ctx.drawImage(target, ...crop, x + 136 - w / 2, 210, w, h);
      const modelBounds = modelCrops[modelViews[i]];
      const modelScale = Math.min(550 / modelBounds[3], 262 / modelBounds[2]);
      const mw = modelBounds[2] * modelScale, mh = modelBounds[3] * modelScale;
      ctx.drawImage(models[i], ...modelBounds, x + 408 - mw / 2, 210 + 550 - mh, mw, mh);
      ctx.fillStyle = '#27364a'; ctx.font = '15px sans-serif'; ctx.fillText(i === 3 ? 'העמודה הרביעית במקור היא חזית נוספת' : 'ללא שינוי צורה או צביעה של היעד', x + 272, 784);
    }
    const x = 2260;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 117, 460, 685);
    ctx.fillStyle = '#27364a'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('שלושה רבעים', x + 230, 150);
    ctx.font = '17px sans-serif'; ctx.fillText('אין מבט יעד מקביל בגליון המקורי', x + 230, 185);
    const threeCrop = modelCrops.threeQuarter;
    const threeScale = Math.min(550 / threeCrop[3], 430 / threeCrop[2]);
    ctx.drawImage(threeQuarter, ...threeCrop, x + 230 - threeCrop[2] * threeScale / 2, 210 + 550 - threeCrop[3] * threeScale, threeCrop[2] * threeScale, threeCrop[3] * threeScale);
    ctx.font = '15px sans-serif'; ctx.fillText('מוצג לבדיקת הנפח והחיבורים', x + 230, 784);
    ctx.font = '18px sans-serif'; ctx.fillText('היעד: גיליון המבטים המקורי מתוך codex-lab/ref/; הצבעים במודל חופשיים.', canvas.width / 2, 849);
    return canvas.toDataURL('image/png');
  }, { origin, name: referenceName, crops: report.reference.crops, modelCrops: report.screenshotCrops });
  await writeFile(resolve(shots, 'comparison.png'), Buffer.from(dataURL.split(',')[1], 'base64'));
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
async function benchmark() {
  report.phone = { experiment: selectedExperiment || 'final', viewport: phoneViewport, dpr: 1, requestedWarmupMs: 1000, requestedMeasureMs: 5000, freshContextsPerQuality: trialCount, view: 'threeQuarter', animation: 'stand → run → kick → stand; 1.2 s per leg; cosine eased', glFinishEachFrame: true, quality: {} };
  for (const quality of selectedQualities) {
    const trials = [];
    for (let trial = 0; trial < trialCount; trial++) {
      const context = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 1 });
      const page = await open(context, `benchmark-${quality}-${trial}`, quality);
      await configure(page, { view: 'threeQuarter', pose: 'stand' });
      const modelMetrics = await page.evaluate(() => window.lab.metrics());
      const result = await page.evaluate(async () => {
        const lab = window.lab, gl = lab.renderer.getContext();
        const gpuExtension = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = gpuExtension ? gl.getParameter(gpuExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const drawDurations = [];
        const draw = (elapsed, measure = false) => {
          const before = performance.now();
          const cycle = Math.max(0, elapsed) / 1200, step = Math.floor(cycle) % 3, fraction = cycle % 1;
          const names = ['stand', 'run', 'kick'];
          lab.setBlend(names[step], names[(step + 1) % 3], .5 - .5 * Math.cos(Math.PI * fraction));
          // setBlend performs exactly one render; finish measures its GPU completion.
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
      trials.push({ trial: trial + 1, ...modelMetrics, ...result, frameMs: stats(result.intervals), renderAndFinishMsStats: stats(result.renderAndFinishMs), meetsFrameLimits: result.fps >= stabilityCriteria.minimumFPS && stats(result.intervals).p95 <= stabilityCriteria.maximumP95FrameMs });
      await context.close();
      console.log(`${quality} ${trial + 1}/${trialCount}: ${result.fps.toFixed(2)} FPS, p95 ${stats(result.intervals).p95.toFixed(1)} ms`);
    }
    const fps = stats(trials.map(t => t.fps));
    report.phone.quality[quality] = { trials, fps, buildMs: stats(trials.map(t => t.buildMs ?? t.totalBuildMs ?? t.buildTimeMs ?? 0)), modelTriangles: trials[0].modelTriangles ?? trials[0].triangles, renderScale: trials[0].viewport?.renderScale ?? trials[0].rendererSize.width / phoneViewport.width, rendererSize: trials[0].rendererSize, stable: trials.every(t => t.meetsFrameLimits) && fps.max / fps.min <= stabilityCriteria.maximumTrialFPSRatio, trialFPSRatio: fps.max / fps.min };
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
  await writeFile(resolve(work, 'capture-report.md'), `# צילום ומדידה\n\nתנאי יציבות שנקבעו מראש: לפחות 30 FPS בכל ריצה, p95 לכל היותר 50ms, יחס מקסימום/מינימום בין הריצות לכל היותר 1.15.\n\n| איכות | משולשים במודל | בנייה חציונית ms | buffer וקנה מידה | FPS חציוני | p95 מקסימלי ms | יציבות |\n|---|---:|---:|---|---:|---:|---|\n${rows}\n\n390×844 CSS pixels, DPR1 של context. גודל ה־buffer וקנה המידה בפועל מפורטים בטבלה; דגימת הפריימים כוללת הגדלה למסך. חימום 1s ו־5s מדידה בכל context טרי; requestAnimationFrame ו־gl.finish לאחר כל ציור; מעבר תנוחות רציף. ${report.environment.browserVersion || ''}. הרינדור בענן ולא בטלפון פיזי.\n\nGLB: ${report.glb?.bytes ?? '?'} bytes; הפרש RGB ממוצע מקסימלי מתוך 255: ${report.glb?.maximumRGBMeanDifference ?? '?'}. ההשוואה ב־24 צילומים: שלוש תנוחות וארבע זוויות, ועוד 12 דגימות של האנימציות המיוצאות במיקסר; snapshots קודקודים נשמרים בדוח לכל תנוחה.\n\nגישה לפיקסלי תמונות היעד: ${report.reference?.sourcePixelAccess ? 'כן — קובץ המקור נקרא ישירות' : 'טרם נבדקה'}. המבט הרביעי הוא חזית חוזרת. שלושה רבעים מוצג ללא יעד מקביל.\n`);
}
try {
  browser = await chromium.launch({ executablePath: report.environment.chromiumPath, headless: true, args: flags });
  report.environment.browserVersion = browser.version();
  if (!benchmarkOnly) await captureModels();
  if (!shotsOnly) await benchmark();
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
