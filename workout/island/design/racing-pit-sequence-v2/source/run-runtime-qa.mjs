// SPDX-License-Identifier: CC0-1.0
// Score actual Three.js world poses with the unchanged pinned motion-qa-v1 math.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const upstream = path.join(here, 'qa-upstream');
const PIN = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const EPS = 1e-7;
const manifest = JSON.parse(await readFile(path.join(upstream, 'provenance.sha256.json'), 'utf8'));
if (manifest.commit !== PIN || manifest.files.length !== 6) throw new Error('Unexpected upstream QA provenance.');
async function verifyUpstream() {
  for (const item of manifest.files) {
    const bytes = await readFile(path.join(upstream, item.name));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error(`Upstream module changed: ${item.name}`);
  }
}
await verifyUpstream();
const { analyzeClip, METRICS } = await import(pathToFileURL(path.join(upstream, 'metrics.mjs')));
const browserFile = 'verification/browser.json';
const browserBytes = await readFile(path.join(root, browserFile));
const browserEvidence = JSON.parse(browserBytes);
const captureInputFiles = ['sequence.json', 'clips/pit-actions.glb', 'src/pit-sequence.mjs', 'src/preview.mjs', 'preview.html', 'preview.css'];
async function verifyCapturedInputs() {
  for (const file of captureInputFiles) {
    const expected = browserEvidence.inputs?.[file];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error(`Browser capture has no SHA-256 binding for ${file}; rerun verify-browser.mjs.`);
    }
    if (hash(await readFile(path.join(root, file))) !== expected) {
      throw new Error(`Runtime capture is stale: ${file} changed after browser verification.`);
    }
  }
}
await verifyCapturedInputs();
const sequenceBytes = await readFile(path.join(root, 'sequence.json'));
const sequence = JSON.parse(sequenceBytes);
const glbBytes = await readFile(path.join(root, 'clips/pit-actions.glb'));
if (glbBytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected an uncompressed local GLB.');
const glb = JSON.parse(glbBytes.subarray(20, 20 + glbBytes.readUInt32LE(12)).toString('utf8'));
const animations = new Map(glb.animations.map(animation => [animation.name, animation]));
const rig = JSON.parse(await readFile(path.join(root, sequence.rig), 'utf8'));
const names = rig.bones.map(bone => bone.name);
if (names.length !== 18) throw new Error('Runtime QA requires the canonical eighteen-bone rig.');
const inputFile = 'verification/runtime-frames.json';
const captureBytes = await readFile(path.join(root, inputFile));
const capture = JSON.parse(captureBytes);
const samples = Array.isArray(capture) ? capture : capture.frames;
if (!Array.isArray(samples) || samples.length < 2) throw new Error('Capture must contain time-ordered world poses.');
if (Math.abs(samples[0].t) > EPS || Math.abs(samples.at(-1).t - sequence.duration) > EPS) {
  throw new Error('Capture must span the complete sequence, including both exact endpoints.');
}
for (let index = 1; index < samples.length; index++) {
  const gap = samples[index].t - samples[index - 1].t;
  if (!(gap > 0) || gap > 1 / 60 + EPS) throw new Error(`Capture is not sampled at least at 60Hz: ${index}, gap ${gap}`);
}

function actorAt(sample, actorId) {
  const actors = sample.actors?.actors ?? sample.actors;
  const value = Array.isArray(actors) ? actors.find(actor => actor.id === actorId) : actors?.[actorId];
  if (!value) throw new Error(`Missing runtime actor ${actorId} at ${sample.t}`);
  return value;
}
function actorFrame(sample, actorId, timeOffset = 0) {
  const frame = actorAt(sample, actorId);
  if (!names.every(name => frame.joints?.[name]?.length === 3 && frame.rotations?.[name]?.length === 4)) {
    throw new Error(`Incomplete canonical world pose for ${actorId} at ${sample.t}`);
  }
  if (!Array.isArray(frame.floorPoints) || frame.floorPoints.length < 8) {
    throw new Error(`Missing actual transformed sole corners for ${actorId} at ${sample.t}`);
  }
  return {
    t: sample.t - timeOffset,
    joints: frame.joints,
    rotations: frame.rotations,
    root: frame.root ?? frame.joints.Root,
    floorPoints: frame.floorPoints,
    ...(frame.scales ? { scales: frame.scales } : {}),
  };
}

function supportsFor(actor, start, end) {
  const result = [];
  for (const track of actor.tracks) {
    if (track.end < start + EPS || track.start > end - EPS) continue;
    const animation = animations.get(track.clip);
    if (!animation) throw new Error(`No GLB support metadata for ${actor.id}/${track.clip}`);
    const supports = animation.extras?.supports;
    if (!Array.isArray(supports) || !supports.length) throw new Error(`Missing authored support windows: ${track.clip}`);
    for (const bone of ['LeftFoot', 'RightFoot']) {
      const windows = supports.filter(window => window.bone === bone);
      if (!windows.length) throw new Error(`No declared ${bone} support for ${track.clip}`);
      const clipStart = track.clipStart ?? 0;
      const clipEnd = track.clipEnd ?? clipStart;
      const clipSpan = clipEnd - clipStart;
      if (track.loop || Math.abs(clipSpan) < EPS) {
        // Every looping ready/idle is a genuinely stationary stance. Refuse to
        // guess repeated swing-foot supports for an unsupported looping gait.
        const covered = windows.some(window => window.start <= clipStart + EPS && window.end >= clipEnd - EPS);
        if (!covered) throw new Error(`Loop/hold support requires explicit continuous ${bone} contact: ${track.clip}`);
        result.push({ bone, start: Math.max(start, track.start) - start, end: Math.min(end, track.end) - start, local: [0, -.08, 0] });
      } else {
        for (const window of windows) {
          const localStart = Math.max(clipStart, window.start);
          const localEnd = Math.min(clipEnd, window.end);
          if (localEnd <= localStart + EPS) continue;
          const windowStart = track.start + (localStart - clipStart) / clipSpan * (track.end - track.start);
          const windowEnd = track.start + (localEnd - clipStart) / clipSpan * (track.end - track.start);
          const a = Math.max(start, windowStart);
          const b = Math.min(end, windowEnd);
          if (b > a + EPS) result.push({ bone, start: a - start, end: b - start, local: window.local ?? [0, -.08, 0] });
        }
      }
    }
  }
  // Merge adjacent windows so planted-foot drift at stage boundaries remains
  // measurable instead of being reset to zero at each clip switch.
  const merged = [];
  for (const bone of ['LeftFoot', 'RightFoot']) {
    const windows = result.filter(window => window.bone === bone).sort((a, b) => a.start - b.start);
    for (const window of windows) {
      const previous = merged.at(-1);
      if (previous?.bone === bone && window.start <= previous.end + EPS) previous.end = Math.max(previous.end, window.end);
      else merged.push({ ...window });
    }
  }
  if (!merged.length) throw new Error(`No measurable supports for ${actor.id}`);
  return merged;
}

const serviceStart = sequence.stages.find(stage => stage.id === 'jack_up').start;
const serviceEnd = sequence.stages.find(stage => stage.id === 'exit').start;
const ranges = [{ id: 'service', start: serviceStart, end: serviceEnd }, { id: 'full_sequence', start: 0, end: sequence.duration }];
const clips = [];
for (const actor of sequence.actors) {
  const entryIdle = samples.filter(sample => sample.t < serviceStart - EPS).map(sample => actorFrame(sample, actor.id));
  const exitIdle = samples.filter(sample => sample.t > serviceEnd + EPS).map(sample => actorFrame(sample, actor.id));
  if (entryIdle.length < 2 || exitIdle.length < 2) throw new Error(`No actual entry/exit idle captures for ${actor.id}`);
  for (const range of ranges) {
    const frames = samples.filter(sample => sample.t >= range.start - EPS && sample.t <= range.end + EPS).map(sample => actorFrame(sample, actor.id, range.start));
    if (Math.abs(frames[0].t) > EPS || Math.abs(frames.at(-1).t - (range.end - range.start)) > EPS) {
      throw new Error(`Missing exact range endpoints: ${actor.id}/${range.id}`);
    }
    const metadata = {
      role: actor.role,
      profile: 'canonical18',
      floorY: 0,
      soleLocal: [0, -.08, 0],
      supports: supportsFor(actor, range.start, range.end),
      ballVisible: false,
      locomotion: false,
      checkHingeDirection: true,
      symmetryMode: 'structural',
      coordinateSpace: 'captured actual Three.js world pose; station placement unchanged; horizontal root aligned by original metric',
      floorProbeKind: 'eight actual transformed shoe sole corners and eighteen skeletal joint centers',
      intent: 'Stationary pit work, including authored short stance adjustments; explicit support windows preserve swing-foot timing.',
    };
    const score = analyzeClip({ frames, duration: range.end - range.start, height: actorAt(samples[0], actor.id).height ?? 1.6675, metadata, idleFrames: { entry: entryIdle, exit: exitIdle }, clipId: `${actor.id}/${range.id}`, sport: 'racing-pit' });
    clips.push({ id: `${actor.id}/${range.id}`, actor: actor.id, range, samples: frames.length, metadata, ...score });
  }
}
await verifyUpstream();
await verifyCapturedInputs();
if (hash(await readFile(path.join(root, browserFile))) !== hash(browserBytes)) throw new Error('Browser evidence changed while runtime QA was running.');
if (hash(await readFile(path.join(root, inputFile))) !== hash(captureBytes)) throw new Error('Runtime capture changed while QA was running.');
const missing = clips.flatMap(clip => Object.values(clip.metrics)).filter(metric => metric.status === 'insufficient-data').length;
const minimum = Math.min(...clips.map(clip => clip.score));
const motionPassed = clips.length === sequence.actors.length * ranges.length && minimum > 88 && missing === 0 && clips.every(clip => clip.coverage === 1);
const browserPassed = browserEvidence.passed === true;
const passed = motionPassed && browserPassed;
const report = { schemaVersion: 1, source: 'actual browser scene world poses', upstreamCommit: PIN, metricDefinitions: METRICS, sampleRateHz: 60, totalCapturedFrames: samples.length, minimum, coverage: Math.min(...clips.map(clip => clip.coverage)), insufficientDataMetrics: missing, motionPassed, browserPassed, passed, clips };
const provenance = {
  schemaVersion: 1,
  upstreamCommit: PIN,
  upstreamFiles: manifest.files,
  upstreamUnmodified: true,
  immutableHashesCheckedBeforeAndAfter: true,
  runner: { file: 'source/run-runtime-qa.mjs', sha256: hash(await readFile(fileURLToPath(import.meta.url))) },
  source: { file: inputFile, sha256: hash(captureBytes), bytes: captureBytes.length },
  browserEvidence: { file: browserFile, sha256: hash(browserBytes), passed: browserPassed },
  capturedInputs: browserEvidence.inputs,
  capturedInputHashesCheckedBeforeAndAfter: true,
  sequence: { file: 'sequence.json', sha256: hash(sequenceBytes) },
  glbSupportMetadata: { file: 'clips/pit-actions.glb', sha256: hash(glbBytes) },
  transformations: 'Only frame timestamps are shifted to range-local seconds. Joints, rotations, root, scales, floor probes and actor world placement are unchanged.',
  idleReference: 'Captured actual pre-service and post-service stances; original analyzeClip receives distinct entry and exit idle samples.',
  footSupports: 'Authored GLB support windows mapped through exact actor tracks; adjacent planted windows merged across stage boundaries. No support inferred, omitted, or reset at each clip switch.',
  limitations: ['This is skeleton and sole-point QA; it does not replace mesh collision, prop contact or visual review.', 'Body-sliding gait metric is inapplicable to stationary pit work; foot sliding remains measured from explicit stance-adjustment supports.'],
  minimumRequiredExclusive: 88,
  minimumObserved: minimum,
  motionPassed,
  browserPassed,
  passed,
};
await mkdir(path.join(root, 'verification'), { recursive: true });
await writeFile(path.join(root, 'verification/runtime-motion-qa.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(root, 'verification/runtime-motion-qa-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ capturedFrames: samples.length, clips: clips.length, minimum, missing, motionPassed, browserPassed, passed, scores: clips.map(clip => ({ id: clip.id, score: clip.score, reasons: clip.reasons })) }, null, 2));
if (!passed) throw new Error(`Actual-runtime QA failed: motionPassed=${motionPassed}, browserPassed=${browserPassed}, minimum ${minimum}, missing metrics ${missing}.`);
