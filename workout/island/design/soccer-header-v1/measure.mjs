// SPDX-License-Identifier: CC0-1.0
// Original reproducible runner. The QA CLI and its mathematics are fetched byte-for-byte.
import {readFile, writeFile, mkdir, mkdtemp, symlink} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {renderHeaderReport} from './qa-report.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../../..');
const pinned = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath = 'workout/island/design/motion-qa-v1';
const output = path.join(base, 'verification');
const workspace = await mkdtemp(path.join(tmpdir(), 'soccer-header-qa-'));
const qaRoot = path.join(workspace, qaPath);
await mkdir(qaRoot, {recursive: true});
try { execFileSync('git', ['cat-file', '-e', `${pinned}^{commit}`], {cwd: repo, stdio: 'pipe'}); }
catch { execFileSync('git', ['fetch', '--depth=1', '--filter=blob:none', '--no-tags', 'origin', pinned], {cwd: repo, stdio: 'inherit'}); }
const sourceFiles = ['run.mjs', 'sources.mjs', 'sources.json', 'metrics.mjs', 'glb.mjs', 'report.mjs', 'sheets.mjs', 'licenses.mjs'];
const provenance = [];
for (const file of sourceFiles) {
  const bytes = execFileSync('git', ['show', `${pinned}:${qaPath}/${file}`], {cwd: repo, maxBuffer: 4 * 1024 * 1024});
  await writeFile(path.join(qaRoot, file), bytes);
  provenance.push({path: `${qaPath}/${file}`, commit: pinned,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length});
}
// The unchanged sampler imports the repository's existing MIT dependency.
await mkdir(path.join(qaRoot, '../soccer-motion-v8/runtime'), {recursive: true});
await symlink(path.join(repo, 'workout/island/design/soccer-motion-v8/runtime/vendor'),
  path.join(qaRoot, '../soccer-motion-v8/runtime/vendor'), 'dir');
await mkdir(output, {recursive: true});
const env = {...process.env, SOCCER_HEADER_QA_ROOT: qaRoot,
  SOCCER_HEADER_SOURCE_COMMIT: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim()};
const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(base, 'qa-register.mjs')).href,
  path.join(qaRoot, 'run.mjs'), '--library', 'soccer-header-v1', '--fps', '120', '--out', path.join(output, 'qa')],
  {cwd: repo, env, stdio: 'inherit'});
if (result.status !== 0) throw new Error(`Pinned QA CLI failed with exit ${result.status}`);
process.env.SOCCER_HEADER_QA_ROOT = qaRoot;
const {loadHeaderAssets} = await import('./qa-sources.mjs');
const {analyzeClip} = await import(pathToFileURL(path.join(qaRoot, 'metrics.mjs')).href);
const {parseGLB, readAccessor} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);
const {catalog, clips, idle, run} = await loadHeaderAssets({fps: 120});
const motionBytes = await readFile(path.join(base, 'runtime/motions.json'));
const motions = JSON.parse(motionBytes);
const sourceHashMatches = createHash('sha256').update(motionBytes).digest('hex') === catalog.sourceMotionSha256;
const report = JSON.parse(await readFile(path.join(output, 'qa/report.json'), 'utf8'));
const headerResults = report.libraries[0].clips.filter(c => c.id.startsWith('header_'));
const vectorDistance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function rotate(v, q) {
  const [x,y,z,w] = q, [a,b,c] = v;
  const tx = 2*(y*c-z*b), ty = 2*(z*a-x*c), tz = 2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty, b+w*ty+z*tx-x*tz, c+w*tz+x*ty-y*tx];
}
const point = (frame, bone, local) => frame.joints[bone].map((v,i) => v + rotate(local, frame.rotations[bone])[i]);
const nearest = (frames, t) => frames.reduce((a,b) => Math.abs(b.t-t) < Math.abs(a.t-t) ? b : a);
const checks = [];
const canonical = catalog.skeleton.map(b => b.name);
const originalRig = JSON.parse(await readFile(path.join(repo,
  'workout/island/design/motion/soccer.json'), 'utf8')).skeleton.bones;
const canonicalDefinition = catalog.skeleton.length === originalRig.length && originalRig.every(reference => {
  const bone = catalog.skeleton.find(b => b.name === reference.name);
  return bone && bone.parent === reference.parent &&
    vectorDistance(bone.rest ?? bone.restTranslationMeters, reference.restTranslationMeters) < 1e-8;
});
for (const clip of clips) {
  const entry = catalog.clips.find(c => c.id === clip.id);
  const authored = motions.clips.find(c => c.id === clip.id);
  const qa = headerResults.find(c => c.id === clip.id);
  const assetBytes = await readFile(path.join(base, 'runtime', entry.asset));
  const native = parseGLB(assetBytes);
  const timeArrays = native.json.animations.flatMap(a => a.samplers.map(s =>
    Array.from(readAccessor(native, s.input))));
  const actual30Hz = timeArrays.every(times => times.length === entry.frameCount &&
    times.every((t, i) => Math.abs(t - i / 30) < 1e-6));
  let maxQuaternionError = 0, maxHipsError = 0;
  for (const frame of authored.frames) {
    const actual = nearest(clip.frames, frame.time);
    maxHipsError = Math.max(maxHipsError, vectorDistance(actual.joints.Hips, frame.hips));
    for (const bone of canonical) {
      const q = frame.rotations[bone], length = Math.hypot(...q), expected = q.map(v => v / length);
      maxQuaternionError = Math.max(maxQuaternionError, Math.min(
        vectorDistance(actual.localRotations[bone], expected),
        vectorDistance(actual.localRotations[bone], expected.map(v => -v))));
    }
  }
  const contact = clip.metadata.events.find(e => e.type === 'contact');
  if (!contact) throw new Error(`${clip.id}: missing contact event`);
  const contactPose = nearest(clip.frames, contact.time);
  const contactPoint = point(contactPose, contact.bone, contact.local ?? [0,0,0]);
  const ball = contactPose.ball;
  const shoulderY = Math.max(contactPose.joints.LeftArm[1], contactPose.joints.RightArm[1]);
  const landing = clip.metadata.events.find(e => e.type === 'land');
  const landingWindows = landing ? clip.metadata.supports.filter(w => w.bone.endsWith('Foot') && w.start >= landing.time - 1e-5) : [];
  const landings = landingWindows.map(w => {
    const frames = clip.frames.filter(f => f.t >= w.start - 1e-6 && f.t <= w.end + 1e-6);
    const anchor = point(nearest(clip.frames, w.start), w.bone, w.local);
    return {bone: w.bone, start: w.start, end: w.end,
      maxDriftMeters: Math.max(0, ...frames.map(f => vectorDistance(point(f, w.bone, w.local), anchor))),
      maxFloorDistanceMeters: Math.max(0, ...frames.map(f => Math.abs(point(f, w.bone, w.local)[1])))};
  });
  const handWindows = landing ? clip.metadata.supports.filter(w => w.bone.endsWith('Hand') &&
    w.start >= landing.time - 1e-5) : [];
  const palms = handWindows.map(w => {
    const frames = clip.frames.filter(f => f.t >= w.start - 1e-6 && f.t <= w.end + 1e-6);
    const anchor = point(nearest(clip.frames, w.start), w.bone, w.local);
    return {bone: w.bone, start: w.start, end: w.end,
      maxDriftMeters: Math.max(0, ...frames.map(f => vectorDistance(point(f, w.bone, w.local), anchor))),
      maxFloorDistanceMeters: Math.max(0, ...frames.map(f => Math.abs(point(f, w.bone, w.local)[1])))};
  });
  const stillRoot = clip.frames.every(f => vectorDistance(f.root, [0,0,0]) < 1e-6 &&
    vectorDistance(f.localRotations.Root, [0,0,0,1]) < 1e-6);
  const transition = analyzeClip({frames: clip.frames, duration: clip.duration, height: clip.height,
    metadata: clip.metadata, idleFrames: run.frames, clipId: clip.id, sport: 'soccer'}).metrics.continuity;
  const names = Object.keys(contactPose.joints);
  const eventsRequired = clip.id === 'header_stand_goal' || clip.id === 'header_clear' ? ['contact'] : ['takeoff','contact','land'];
  const eventOrder = eventsRequired.map(name => clip.metadata.events.find(e => e.type === name)?.time);
  const jump = clip.id.includes('jump') || clip.id === 'header_dive';
  const coreDuration = entry.coreRange?.duration ?? entry.coreRange?.end - entry.coreRange?.start;
  const range = entry.coreRange;
  const coreEndpointsValid = !!range && range.start >= 0 && range.end <= clip.nativeDuration + 1e-6 &&
    Math.abs(coreDuration - (range.end - range.start)) < 1e-6 &&
    Math.abs(range.start * 30 - Math.round(range.start * 30)) < 1e-6 &&
    Math.abs(range.end * 30 - Math.round(range.end * 30)) < 1e-6;
  const assertions = {
    assetHashAndBytes: entry.bytes === assetBytes.length && createHash('sha256').update(assetBytes).digest('hex') === entry.sha256,
    sourceMotionHash: sourceHashMatches,
    nativePoseMatchesSource: maxQuaternionError < 1e-6 && maxHipsError < 1e-6,
    score: qa?.score >= 88,
    noRedMetric: !!qa && Object.values(qa.metrics).every(m => m.status !== 'red'),
    completeApplicableMetrics: qa?.coverage === 1,
    canonical18: canonicalDefinition && canonical.length === 18 && names.length === 18 && canonical.every(n => names.includes(n)),
    native30Hz: actual30Hz && entry.nativeRate === 30 && entry.frameCount === Math.round(clip.duration * 30) + 1,
    requiredEvents: eventOrder.every(Number.isFinite) && eventOrder.every((t,i) => i === 0 || t > eventOrder[i-1]),
    rootStationary: stillRoot && entry.rootMotion === false,
    noCompression: !JSON.stringify(native.json).includes('KHR_draco_mesh_compression') && !JSON.stringify(native.json).includes('EXT_meshopt_compression'),
    ballContactHeight: !!ball && ball[1] >= 1.2 && ball[1] <= 2,
    ballAboveShoulders: !!ball && ball[1] > shoulderY && contactPoint[1] > shoulderY,
    jumpingCoreDuration: !jump || coreDuration >= .5 - 1e-6 && coreDuration <= .9 + 1e-6,
    coreRangeValid: coreEndpointsValid,
    landingSupportDeclared: !landing || ['LeftFoot','RightFoot'].every(bone => landings.some(w => w.bone === bone)),
    landingSlide: landings.every(w => w.maxDriftMeters <= .02 + 1e-6),
    landingOnFloor: landings.every(w => w.maxFloorDistanceMeters <= .02 + 1e-6),
    palmsStableOnFloor: palms.every(w => w.maxDriftMeters <= .02 + 1e-6 && w.maxFloorDistanceMeters <= .02 + 1e-6),
  };
  checks.push({id: clip.id, score: qa?.score, assertions, coreDuration,
    nativePoseError: {maxQuaternionError, maxHipsErrorMeters: maxHipsError},
    contact: {time: contact.time, ballCenter: ball, forehead: contactPoint, shoulderHeightMeters: shoulderY,
      shoulderMarginMeters: ball ? ball[1] - shoulderY : null},
    landing: landings, palms, continuityToIdle: qa?.metrics.continuity, continuityToRun: transition});
}
const failures = checks.flatMap(c => Object.entries(c.assertions).filter(([,ok]) => !ok).map(([check]) => `${c.id}: ${check}`));
const evidence = {schemaVersion: 1, qaCommit: pinned, qaFiles: provenance,
  qaInvocation: 'Unmodified motion-qa-v1/run.mjs --library soccer-header-v1 --fps 120; Node hook replaces only sources.mjs',
  qaReferenceRows: ['idle_relaxed'], headers: headerResults.length,
  minimumScore: Math.min(...headerResults.map(c => c.score)),
  redMetrics: headerResults.reduce((sum,c) => sum + Object.values(c.metrics).filter(m => m.status === 'red').length, 0),
  checks, failures, passed: headerResults.length === 6 && failures.length === 0};
await writeFile(path.join(output, 'requirements.json'), JSON.stringify(evidence, null, 2) + '\n');
await renderHeaderReport(report, path.join(output, 'qa'));
console.log(JSON.stringify({headers: evidence.headers, minScore: evidence.minimumScore, redMetrics: evidence.redMetrics,
  passed: evidence.passed, failures}, null, 2));
if (!evidence.passed) process.exitCode = 1;
