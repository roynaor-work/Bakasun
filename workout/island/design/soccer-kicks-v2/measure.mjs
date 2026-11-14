// SPDX-License-Identifier: CC0-1.0
// Reproduce the original motion-qa-v1 CLI; only its source loader is extended.
import {readFile, writeFile, mkdir, mkdtemp, symlink} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {renderKicksReport} from './qa-report.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../../..');
const pinned = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath = 'workout/island/design/motion-qa-v1';
const output = path.join(base, 'verification');
const workspace = await mkdtemp(path.join(tmpdir(), 'soccer-kicks-qa-'));
const qaRoot = path.join(workspace, qaPath);
await mkdir(qaRoot, {recursive: true});
try {execFileSync('git', ['cat-file', '-e', `${pinned}^{commit}`], {cwd: repo, stdio: 'pipe'});}
catch {execFileSync('git', ['fetch', '--depth=1', '--filter=blob:none', '--no-tags', 'origin', pinned], {cwd: repo, stdio: 'inherit'});}
const sourceFiles = ['run.mjs', 'sources.mjs', 'sources.json', 'metrics.mjs', 'glb.mjs', 'report.mjs', 'sheets.mjs', 'licenses.mjs'];
const provenance = [];
for (const file of sourceFiles) {
  const bytes = execFileSync('git', ['show', `${pinned}:${qaPath}/${file}`], {cwd: repo, maxBuffer: 4 * 1024 * 1024});
  await writeFile(path.join(qaRoot, file), bytes);
  provenance.push({path: `${qaPath}/${file}`, commit: pinned,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length});
}
// The unchanged QA parser imports three.module.js; no loader, decoder or WASM runs.
await mkdir(path.join(qaRoot, '../soccer-motion-v8/runtime/vendor'), {recursive: true});
await symlink(path.join(repo, 'workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js'),
  path.join(qaRoot, '../soccer-motion-v8/runtime/vendor/three.module.js'));
await mkdir(output, {recursive: true});
const env = {...process.env, SOCCER_KICKS_QA_ROOT: qaRoot,
  SOCCER_KICKS_BASE_COMMIT: execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {cwd: repo, encoding: 'utf8'}).trim()};
const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(base, 'qa-register.mjs')).href,
  path.join(qaRoot, 'run.mjs'), '--library', 'soccer-kicks-v2', '--fps', '120', '--out', path.join(output, 'qa')],
  {cwd: repo, env, stdio: 'inherit'});
if (result.status !== 0) throw new Error(`Pinned QA CLI failed with exit ${result.status}`);
process.env.SOCCER_KICKS_QA_ROOT = qaRoot;
process.env.SOCCER_KICKS_BASE_COMMIT = env.SOCCER_KICKS_BASE_COMMIT;
const {loadKickAssets} = await import('./qa-sources.mjs');
const {analyzeClip} = await import(pathToFileURL(path.join(qaRoot, 'metrics.mjs')).href);
const {parseGLB, readAccessor} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);
const {catalog, clips, idle, run} = await loadKickAssets({fps: 120});
const motionBytes = await readFile(path.join(base, 'runtime/motions.json'));
const motions = JSON.parse(motionBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashMatches = hash(motionBytes) === catalog.sourceMotionSha256;
const report = JSON.parse(await readFile(path.join(output, 'qa/report.json'), 'utf8'));
const expected = ['power_landing', 'inside_curve', 'outside_kick', 'placed_kick', 'weak_foot', 'volley', 'scissors',
  'chip', 'running_kick', 'short_inside_pass', 'long_pass', 'through_pass', 'lift_pass', 'wing_cross'];
const results = report.libraries[0].clips.filter(c => expected.includes(c.id));
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((s, v, i) => s + v * b[i], 0) /
  (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;
function rotate(v, q) {
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
const point = (frame, bone, local = [0, 0, 0]) => frame.joints[bone].map((v, i) => v + rotate(local, frame.rotations[bone])[i]);
const nearest = (frames, t) => frames.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
const checks = [], signatures = [];
const canonical = catalog.skeleton.map(b => b.name);
const originalRig = JSON.parse(await readFile(path.join(repo, 'workout/island/design/motion/soccer.json'), 'utf8')).skeleton.bones;
const canonicalDefinition = catalog.skeleton.length === originalRig.length && originalRig.every(reference => {
  const bone = catalog.skeleton.find(b => b.name === reference.name);
  return bone && bone.parent === reference.parent && distance(bone.rest ?? bone.restTranslationMeters, reference.restTranslationMeters) < 1e-8;
});
for (const clip of clips) {
  const entry = catalog.clips.find(c => c.id === clip.id), authored = motions.clips.find(c => c.id === clip.id);
  const qa = results.find(c => c.id === clip.id);
  const assetBytes = await readFile(path.join(base, 'runtime', entry.asset));
  const native = parseGLB(assetBytes);
  const timeArrays = native.json.animations.flatMap(a => a.samplers.map(s => Array.from(readAccessor(native, s.input))));
  const actual30Hz = timeArrays.every(times => times.length === entry.frameCount && times.every((t, i) => Math.abs(t - i / 30) < 1e-6));
  let maxQuaternionError = 0, maxHipsError = 0;
  for (const frame of authored.frames) {
    const actual = nearest(clip.nativeFrames, frame.time);
    maxHipsError = Math.max(maxHipsError, distance(actual.joints.Hips, frame.hips));
    for (const bone of canonical) {
      const q = frame.rotations[bone], length = Math.hypot(...q), expectedQ = q.map(v => v / length);
      maxQuaternionError = Math.max(maxQuaternionError, Math.min(distance(actual.localRotations[bone], expectedQ),
        distance(actual.localRotations[bone], expectedQ.map(v => -v))));
    }
  }
  const contact = clip.metadata.events.find(e => e.type === 'contact'), back = clip.metadata.events.find(e => e.type === 'back');
  if (!contact || !back) throw new Error(`${clip.id}: missing contact/back event`);
  const contactPose = nearest(clip.frames, contact.time), contactPoint = point(contactPose, contact.bone, contact.local);
  const ball = contactPose.ball;
  const supports = clip.metadata.supports.map(w => {
    const frames = clip.frames.filter(f => f.t >= w.start - 1e-6 && f.t <= w.end + 1e-6);
    const anchor = point(nearest(clip.frames, w.start), w.bone, w.local);
    return {bone: w.bone, start: w.start, end: w.end, samples: frames.length,
      maxDriftMeters3D: Math.max(0, ...frames.map(f => distance(point(f, w.bone, w.local), anchor))),
      maxFloorDistanceMeters: Math.max(0, ...frames.map(f => Math.abs(point(f, w.bone, w.local)[1])))};
  });
  const stillRoot = clip.nativeFrames.every(f => distance(f.root, [0, 0, 0]) < 1e-6 && distance(f.localRotations.Root, [0, 0, 0, 1]) < 1e-6);
  const continuityToIdle = analyzeClip({frames: clip.frames, duration: clip.duration, height: clip.height,
    metadata: clip.metadata, idleFrames: idle.frames, clipId: clip.id, sport: 'soccer'}).metrics.continuity;
  const continuityToRun = analyzeClip({frames: clip.frames, duration: clip.duration, height: clip.height,
    metadata: clip.metadata, idleFrames: run.frames, clipId: clip.id, sport: 'soccer'}).metrics.continuity;
  const pelvis = clip.nativeFrames.map(f => f.rotations.Hips);
  const bodyRotationRangeDegrees = Math.max(...pelvis.map(q => qangle(q, pelvis[0])));
  const trace = Array.from({length: 31}, (_, i) => {
    const t = back.time + (Math.min(clip.duration, contact.time + .35) - back.time) * i / 30;
    const f = nearest(clip.nativeFrames, t), p = point(f, contact.bone, contact.local);
    return {foot: p.map((v, j) => v - f.joints.Hips[j]), body: f.rotations.Hips};
  });
  signatures.push({id: clip.id, trace});
  const runSpeeds = clip.frames.slice(1).map((f, i) => {
    const a = clip.frames[i]; return Math.hypot(f.referenceRoot[0] - a.referenceRoot[0], f.referenceRoot[2] - a.referenceRoot[2]) / (f.t - a.t);
  });
  const nativeNames = native.json.nodes.filter(n => canonical.includes(n.name)).map(n => n.name);
  const nativeSkeleton = originalRig.every(reference => {
    const node = native.json.nodes.find(n => n.name === reference.name);
    const parentIndex = native.json.nodes.findIndex(n => n.name === reference.parent);
    return node && distance(node.translation ?? [0, 0, 0], reference.restTranslationMeters) < 1e-6 &&
      (!reference.parent || native.json.nodes[parentIndex]?.children?.includes(native.json.nodes.indexOf(node)));
  });
  const assertions = {
    assetHashAndBytes: entry.bytes === assetBytes.length && hash(assetBytes) === entry.sha256,
    sourceMotionHash: sourceHashMatches,
    nativePoseMatchesSource: maxQuaternionError < 1e-6 && maxHipsError < 1e-6,
    score: qa?.score >= 88,
    noRedMetric: !!qa && Object.values(qa.metrics).every(m => m.status !== 'red'),
    completeApplicableMetrics: qa?.coverage === 1,
    canonical18: canonicalDefinition && canonical.length === 18 && nativeNames.length === 18 && nativeSkeleton,
    native30Hz: actual30Hz && entry.nativeRate === 30 && entry.frameCount === Math.round(clip.duration * 30) + 1,
    requiredEvents: Number.isFinite(back.time) && Number.isFinite(contact.time) && back.time > 0 && back.time < contact.time && contact.time < clip.duration &&
      [back, contact].every(e => Number.isInteger(e.frame) && Math.abs(e.time - e.frame / 30) < 1e-6),
    rootStationary: stillRoot && entry.rootMotion === false,
    noCompression: !JSON.stringify(native.json).includes('KHR_draco_mesh_compression') && !JSON.stringify(native.json).includes('EXT_meshopt_compression'),
    measuredFootSupport: supports.some(w => w.bone.endsWith('Foot') && w.end - w.start >= .06),
    supportSlide3D: supports.filter(w => w.bone.endsWith('Foot')).every(w => w.maxDriftMeters3D <= .02 + 1e-6),
    supportOnFloor: supports.filter(w => w.bone.endsWith('Foot')).every(w => w.maxFloorDistanceMeters <= .02 + 1e-6),
    ballContact: !!ball && Math.abs(distance(ball, contactPoint) - clip.metadata.ballRadius) <= .002,
    bodyRotation: bodyRotationRangeDegrees >= 2,
    runningDoesNotStop: clip.id !== 'running_kick' || (clip.metadata.locomotion === true && Math.min(...runSpeeds) > .05 &&
      Number.isFinite(qa?.metrics.bodySliding.value) && continuityToRun.status !== 'red'),
  };
  checks.push({id: clip.id, score: qa?.score, assertions,
    nativePoseError: {maxQuaternionError, maxHipsErrorMeters: maxHipsError},
    events: {back: back.time, contact: contact.time},
    contact: {bone: contact.bone, local: contact.local, point: contactPoint, ballCenter: ball},
    supportWindows: supports, bodyRotationRangeDegrees,
    minimumTravelSpeedMetersPerSecond: clip.id === 'running_kick' ? Math.min(...runSpeeds) : null,
    rawContinuityToIdle: continuityToIdle, rawContinuityToRun: continuityToRun,
    continuityNote: 'Raw endpoint comparison only; runtime C1 bridges separately measure transitions to the other reference.'});
}
const distinctPairs = [];
for (let i = 0; i < signatures.length; i++) for (let j = i + 1; j < signatures.length; j++) {
  const a = signatures[i], b = signatures[j];
  const footRmsMeters = Math.sqrt(a.trace.reduce((sum, f, k) => sum + distance(f.foot, b.trace[k].foot) ** 2, 0) / a.trace.length);
  const bodyRmsDegrees = Math.sqrt(a.trace.reduce((sum, f, k) => sum + qangle(f.body, b.trace[k].body) ** 2, 0) / a.trace.length);
  distinctPairs.push({a: a.id, b: b.id, footRmsMeters, bodyRmsDegrees,
    distinct: footRmsMeters > .005 && bodyRmsDegrees > .2});
}
const failures = checks.flatMap(c => Object.entries(c.assertions).filter(([, ok]) => !ok).map(([check]) => `${c.id}: ${check}`));
if (expected.some(id => !clips.some(c => c.id === id)) || clips.length !== 14) failures.push('exactly the 14 requested clip IDs required');
for (const pair of distinctPairs.filter(p => !p.distinct)) failures.push(`${pair.a}/${pair.b}: insufficiently distinct foot arc or body rotation`);
const evidence = {schemaVersion: 1, qaCommit: pinned, qaFiles: provenance,
  qaInvocation: 'Unmodified motion-qa-v1/run.mjs --library soccer-kicks-v2 --fps 120; Node hook replaces only sources.mjs',
  qaReferenceRows: [{id: 'idle_relaxed', asset: 'runtime/reference/idle_relaxed.glb'},
    {id: 'idle_run_reference', asset: 'runtime/reference/run.glb', note: 'Real run poses; id matches the unchanged CLI reference discovery convention.'}],
  clips: results.length, minimumScore: Math.min(...results.map(c => c.score)),
  redMetrics: results.reduce((sum, c) => sum + Object.values(c.metrics).filter(m => m.status === 'red').length, 0),
  maximumFootSlideMeters3D: Math.max(0, ...checks.flatMap(c => c.supportWindows.filter(w => w.bone.endsWith('Foot')).map(w => w.maxDriftMeters3D))),
  checks, distinctPairs, failures, passed: results.length === 14 && failures.length === 0};
await writeFile(path.join(output, 'requirements.json'), JSON.stringify(evidence, null, 2) + '\n');
await renderKicksReport(report, path.join(output, 'qa'));
console.log(JSON.stringify({clips: evidence.clips, minScore: evidence.minimumScore, redMetrics: evidence.redMetrics,
  maxFootSlideMeters3D: evidence.maximumFootSlideMeters3D, passed: evidence.passed, failures}, null, 2));
if (!evidence.passed) process.exitCode = 1;
