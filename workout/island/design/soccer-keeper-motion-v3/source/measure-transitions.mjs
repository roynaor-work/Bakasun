/** Actual serialized GLB bridge measurements. SPDX-License-Identifier: CC0-1.0. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unpack, readAccessor } from './glb.mjs';
import { makeClipBridge, interruptBridge, sampleMotion, poseVelocity } from '../runtime/player.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const catalog = JSON.parse(read('catalog.json'));
const rate = 240;
const sourceCommit = 'ec6c73949fb5820826b4c082972f5d4f1136641f';
const referenceHashes = {
  idle_relaxed: '81c4324076b0a6b1fde1abb3ab184280dd8e2d243e7cbc92ea23fc9b9ce3322c',
  run: '5c3cc67e5627fbd92281388821579625059847d3b2e0f311d7f8a48e41a18bc7',
};
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.max(0, Math.abs(dot(a, b)) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;
const thresholds = {
  endpointHipsMeters: 1e-9,
  endpointRotationDegrees: 1e-5,
  endpointHipsVelocityMetersPerSecond: 1e-4,
  endpointAngularVelocityRadiansPerSecond: .01,
  maximum240HzHipsStepMeters: .02,
  maximum240HzRotationStepDegrees: 10,
};

function decode(entry, path) {
  const bytes = read(path), glb = unpack(bytes), doc = glb.document;
  if (doc.animations.length !== 1) throw new Error(`${path}: expected one native animation`);
  const animation = doc.animations[0], tracks = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`${path}: expected native LINEAR channels`);
    tracks.push({
      name: doc.nodes[channel.target.node].name,
      path: channel.target.path,
      times: readAccessor(glb, sampler.input).values,
      values: readAccessor(glb, sampler.output).values,
    });
  }
  const rotations = tracks.filter(t => t.path === 'rotation');
  const hips = tracks.find(t => t.name === 'Hips' && t.path === 'translation');
  if (rotations.length !== 18 || !hips) throw new Error(`${path}: expected canonical18 and Hips translation`);
  for (const t of tracks) if (t.times.length !== hips.times.length || t.times.some((v, i) => v !== hips.times[i])) throw new Error(`${path}: mismatched channel times`);
  const rootNode = doc.nodes.find(n => n.name === 'Root');
  const rootTranslation = rootNode.translation ?? [0, 0, 0];
  const rootRotation = rootNode.rotation ?? [0, 0, 0, 1];
  if (rootTranslation.some(v => v !== 0) || rootRotation.some((v, i) => v !== [0, 0, 0, 1][i]) || tracks.some(t => t.name === 'Root' && t.path !== 'rotation')) throw new Error(`${path}: Root must remain fixed`);
  const frames = hips.times.map((time, i) => ({
    time,
    hips: hips.values.slice(i * 3, i * 3 + 3),
    rotations: Object.fromEntries(rotations.map(t => [t.name, t.values.slice(i * 4, i * 4 + 4)])),
  }));
  if (frames.some(f => f.rotations.Root.some((v, i) => v !== [0, 0, 0, 1][i]))) throw new Error(`${path}: animated Root rotation`);
  return { id: entry.id, loop: entry.loop, frames, duration: hips.times.at(-1), path, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function poseResidual(a, b) {
  return { hipsMeters: distance(a.hips, b.hips), rotationDegrees: Math.max(...Object.keys(a.rotations).map(name => angle(a.rotations[name], b.rotations[name]))) };
}

function velocityResidual(actual, expected, actualPose, expectedPose) {
  let maximum = 0;
  for (const name of Object.keys(actual.rotations)) {
    const q = actualPose.rotations[name], sign = dot(q, expectedPose.rotations[name]) < 0 ? -1 : 1;
    const difference = actual.rotations[name].map((v, i) => v - expected.rotations[name][i] * sign);
    const projection = dot(difference, q) / dot(q, q);
    maximum = Math.max(maximum, 2 * Math.hypot(...difference.map((v, i) => v - projection * q[i])));
  }
  return { hipsMetersPerSecond: distance(actual.hips, expected.hips), rotationRadiansPerSecond: maximum };
}

function measure(transition, from, to, fromTime, toTime) {
  const duration = transition.duration;
  const start = transition.sample(0), end = transition.sample(duration);
  const sourcePose = from(fromTime), targetPose = to(toTime);
  const outgoing = poseVelocity(from, fromTime, { side: 'left' });
  const incoming = poseVelocity(to, toTime, { side: 'right' });
  const c0 = { start: poseResidual(start, sourcePose), end: poseResidual(end, targetPose) };
  const c1 = {
    start: velocityResidual(poseVelocity(transition.sample, 0, { side: 'right', delta: 1e-7 }), outgoing, start, sourcePose),
    end: velocityResidual(poseVelocity(transition.sample, duration, { side: 'left', delta: 1e-7 }), incoming, end, targetPose),
  };
  let maxHipsStepMeters = 0, maxRotationStepDegrees = 0, maxUnitQuaternionError = 0;
  let previous = start, rootFixed = true, finite = true;
  const count = Math.ceil(duration * rate);
  for (let i = 0; i <= count; i++) {
    const current = transition.sample(Math.min(duration, i / rate));
    const change = poseResidual(previous, current);
    maxHipsStepMeters = Math.max(maxHipsStepMeters, change.hipsMeters);
    maxRotationStepDegrees = Math.max(maxRotationStepDegrees, change.rotationDegrees);
    for (const q of Object.values(current.rotations)) {
      finite &&= q.every(Number.isFinite);
      maxUnitQuaternionError = Math.max(maxUnitQuaternionError, Math.abs(Math.hypot(...q) - 1));
    }
    finite &&= current.hips.every(Number.isFinite);
    rootFixed &&= current.rotations.Root.every((v, j) => v === [0, 0, 0, 1][j]);
    previous = current;
  }
  const pass = Object.values(c0).every(r => r.hipsMeters < thresholds.endpointHipsMeters && r.rotationDegrees < thresholds.endpointRotationDegrees)
    && Object.values(c1).every(r => r.hipsMetersPerSecond < thresholds.endpointHipsVelocityMetersPerSecond && r.rotationRadiansPerSecond < thresholds.endpointAngularVelocityRadiansPerSecond)
    && maxHipsStepMeters < thresholds.maximum240HzHipsStepMeters && maxRotationStepDegrees < thresholds.maximum240HzRotationStepDegrees
    && maxUnitQuaternionError < 1e-12 && rootFixed && finite;
  return { durationSeconds: duration, sampleRate: rate, sampleCount: count + 1, c0, c1, maxHipsStepMeters, maxRotationStepDegrees, maxUnitQuaternionError, rootFixed, finite, pass };
}

const clips = catalog.clips.map(entry => decode(entry, entry.asset ?? `clips/${entry.id}.glb`));
if (clips.length !== 14) throw new Error(`Expected 14 clips; got ${clips.length}`);
const references = ['idle_relaxed', 'run'].map(id => decode({ id, loop: true }, `reference/${id}.glb`));
for (const reference of references) if (reference.sha256 !== referenceHashes[reference.id]) throw new Error(`${reference.path}: differs from pinned locomotion-v2 source`);
const phases = [
  { name: 'cycle-boundary', from: 0, to: 0 },
  { name: 'moving-interior', from: .371, to: .613 },
  { name: 'exit-to-moving', from: 1, to: .231 },
];
const results = [];
for (const clip of clips) for (const reference of references) for (const [a, b] of [[clip, reference], [reference, clip]]) {
  const from = t => sampleMotion(a, t), to = t => sampleMotion(b, t);
  for (const phase of phases) {
    const fromTime = a.duration * phase.from, toTime = b.duration * phase.to;
    const transition = makeClipBridge({ fromMotion: a, toMotion: b, fromTime, toTime, duration: .4 });
    results.push({ from: a.id, to: b.id, kind: phase.name, fromTime, toTime, ...measure(transition, from, to, fromTime, toTime) });
  }
  const active = makeClipBridge({ fromMotion: a, toMotion: b, fromTime: a.duration * .217, toTime: b.duration * .487, duration: .4 });
  const elapsed = .173, toTime = a.duration * .719;
  const interrupted = interruptBridge({ active, elapsed, toMotion: a, toTime, duration: .4 });
  results.push({ from: a.id, activeTarget: b.id, to: a.id, kind: 'interrupt-moving-bridge', fromTime: elapsed, toTime, ...measure(interrupted, active.sample, from, elapsed, toTime) });
}

const summary = {
  clips: clips.length,
  referenceClips: references.length,
  orderedClipPairs: clips.length * references.length * 2,
  nativeBridges: results.filter(r => r.kind !== 'interrupt-moving-bridge').length,
  interruptedBridges: results.filter(r => r.kind === 'interrupt-moving-bridge').length,
  bridges: results.length,
  passed: results.filter(r => r.pass).length,
  maxEndpointHipsMeters: Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.hipsMeters))),
  maxEndpointRotationDegrees: Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.rotationDegrees))),
  maxEndpointHipsVelocityMetersPerSecond: Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.hipsMetersPerSecond))),
  maxEndpointVelocityRadiansPerSecond: Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.rotationRadiansPerSecond))),
  maxHipsStepMeters: Math.max(...results.map(r => r.maxHipsStepMeters)),
  maxRotationStepDegrees: Math.max(...results.map(r => r.maxRotationStepDegrees)),
  allPassed: results.every(r => r.pass),
};
const evidence = {
  method: 'Actual GLB FLOAT accessors and native LINEAR translation/quaternion slerp. CC0 soccer-header-v1 normalized Hermite C1 math, with soccer-locomotion-v2 makeClipBridge/interruptBridge wrappers, copied without formula changes. Each of 14 clips bridges bidirectionally to pinned locomotion-v2 idle/run at boundary, moving-interior and exit-to-interior phases. Each ordered pair also interrupts an active bridge. Endpoint derivatives use sided native velocities; interiors sampled at 240Hz. The target phase is frozen during each bridge and resumes at toTime.',
  scope: 'Actor-local pose and derivative continuity. Actor world translation/heading, ball possession/release events, collisions and team choreography remain consumer-owned. Arbitrary bridges require world contact IK to carry planted sole anchors until release; a C1 bridge alone does not guarantee foot locking, ground clearance, or collision-free dive recovery. This package is a design asset delivery, not a gameplay integration.',
  thresholds,
  referenceSource: { repository: 'roynaor-work/Bakasun', commit: sourceCommit, path: 'workout/island/design/soccer-locomotion-v2/runtime/clips/', copiedByteForByte: true },
  sourceFiles: [...clips, ...references].map(({ id, path, sha256 }) => ({ id, path, sha256 })),
  summary,
  bridges: results,
};
mkdirSync(new URL('verification/', root), { recursive: true });
writeFileSync(new URL('verification/transitions.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (!summary.allPassed) process.exitCode = 1;
