/** Actual serialized locomotion GLB bridge measurements. CC0-1.0. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unpack, readAccessor } from '../../soccer-header-v1/source/glb.mjs';
import { makeClipBridge, interruptBridge, sampleMotion, poseVelocity } from '../runtime/player.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const sourceCatalog = JSON.parse(read('runtime/catalog.json'));
const rate = 240;
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.max(0, Math.abs(dot(a, b)) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;
const thresholds = {
  endpointHipsMeters: 1e-9, endpointRotationDegrees: 1e-5,
  endpointHipsVelocityMetersPerSecond: 1e-4, endpointAngularVelocityRadiansPerSecond: .01,
  maximum240HzHipsStepMeters: .02, maximum240HzRotationStepDegrees: 10,
};

function decode(entry) {
  const path = `runtime/clips/${entry.id}.glb`, bytes = read(path);
  const glb = unpack(bytes), doc = glb.document;
  if (doc.animations.length !== 1) throw new Error(`${path}: expected one native animation`);
  const animation = doc.animations[0], tracks = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`${path}: expected native LINEAR channels`);
    const times = readAccessor(glb, sampler.input).values;
    const data = readAccessor(glb, sampler.output);
    tracks.push({ name: doc.nodes[channel.target.node].name, path: channel.target.path, times, values: data.values });
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
    time, hips: hips.values.slice(i * 3, i * 3 + 3),
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

const clips = sourceCatalog.clips.map(decode), results = [];
const phases = [
  { name: 'cycle-boundary', from: 0, to: 0 },
  { name: 'moving-interior', from: .371, to: .613 },
  { name: 'exit-to-moving', from: 1, to: .231 },
];
for (const a of clips) for (const b of clips) {
  const from = t => sampleMotion(a, t), to = t => sampleMotion(b, t);
  for (const phase of phases) {
    const fromTime = a.duration * phase.from, toTime = b.duration * phase.to;
    const transition = makeClipBridge({ fromMotion: a, toMotion: b, fromTime, toTime, duration: .4 });
    results.push({ from: a.id, to: b.id, kind: phase.name, fromTime, toTime, ...measure(transition, from, to, fromTime, toTime) });
  }
  // A→B starts, then is redirected at an interior displayed pose to A again.
  // Repeating this for every ordered A/B pair exercises interruptions of each
  // possible active pair, preserving the actual blended derivative.
  const active = makeClipBridge({ fromMotion: a, toMotion: b, fromTime: a.duration * .217, toTime: b.duration * .487, duration: .4 });
  const elapsed = .173, toTime = a.duration * .719;
  const interrupted = interruptBridge({ active, elapsed, toMotion: a, toTime, duration: .4 });
  results.push({ from: a.id, activeTarget: b.id, to: a.id, kind: 'interrupt-moving-bridge', fromTime: elapsed, toTime, ...measure(interrupted, active.sample, from, elapsed, toTime) });
}

const nativeHandoffs = [];
for (const [id, sourceId, targetId] of [
  ['idle_to_run', 'idle_relaxed', 'run'], ['run_to_idle', 'run', 'idle_relaxed'],
]) {
  const transition = clips.find(c => c.id === id);
  const source = clips.find(c => c.id === sourceId), target = clips.find(c => c.id === targetId);
  if (!transition || !source || !target) throw new Error(`Missing native start/stop handoff ${id}`);
  for (const [kind, a, aTime, b, bTime] of [
    ['entry', source, 0, transition, 0], ['exit', transition, transition.duration, target, 0],
  ]) {
    const from = t => sampleMotion(a, t), to = t => sampleMotion(b, t);
    const fromPose = from(aTime), toPose = to(bTime);
    const c0 = poseResidual(fromPose, toPose);
    const c1 = velocityResidual(
      poseVelocity(to, bTime, { side: 'right' }),
      poseVelocity(from, aTime, { side: 'left' }),
      toPose, fromPose,
    );
    nativeHandoffs.push({
      transition: id, kind, from: a.id, to: b.id, fromTime: aTime, toTime: bTime, c0, c1,
      pass: c0.hipsMeters < thresholds.endpointHipsMeters && c0.rotationDegrees < thresholds.endpointRotationDegrees
        && c1.hipsMetersPerSecond < thresholds.endpointHipsVelocityMetersPerSecond
        && c1.rotationRadiansPerSecond < thresholds.endpointAngularVelocityRadiansPerSecond,
    });
  }
}

const summary = {
  clips: clips.length, orderedClipPairs: clips.length ** 2,
  nativeBridges: results.filter(r => r.kind !== 'interrupt-moving-bridge').length,
  interruptedBridges: results.filter(r => r.kind === 'interrupt-moving-bridge').length,
  bridges: results.length, passed: results.filter(r => r.pass).length,
  maxEndpointHipsMeters: Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.hipsMeters))),
  maxEndpointRotationDegrees: Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.rotationDegrees))),
  maxEndpointHipsVelocityMetersPerSecond: Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.hipsMetersPerSecond))),
  maxEndpointVelocityRadiansPerSecond: Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.rotationRadiansPerSecond))),
  maxHipsStepMeters: Math.max(...results.map(r => r.maxHipsStepMeters)),
  maxRotationStepDegrees: Math.max(...results.map(r => r.maxRotationStepDegrees)),
  nativeHandoffs: nativeHandoffs.length,
  nativeHandoffsPassed: nativeHandoffs.filter(r => r.pass).length,
  maxNativeHandoffHipsVelocityMetersPerSecond: Math.max(...nativeHandoffs.map(r => r.c1.hipsMetersPerSecond)),
  maxNativeHandoffAngularVelocityRadiansPerSecond: Math.max(...nativeHandoffs.map(r => r.c1.rotationRadiansPerSecond)),
  allPassed: results.every(r => r.pass) && nativeHandoffs.every(r => r.pass),
};
const evidence = {
  method: 'Actual GLB FLOAT accessors, native LINEAR translation/quaternion slerp. Unmodified CC0 soccer-header-v1 normalized Hermite C1 math. Each ordered clip pair at boundary, moving interior and exit-to-interior phases; interruption of every ordered active pair. Endpoint derivatives use sided native velocities; interiors sampled at 240Hz. Four additional direct native idle/run start/stop handoffs verify source outgoing versus target incoming velocities without any bridge.',
  scope: 'Direct native C1 of the authored idle/run start/stop boundaries, plus continuity of supplied actor-local playback helpers on measured phases, including interruption of these helper bridges. Actor world translation/heading, referenceTravel application, collision avoidance and gameplay integration remain simulation-owned. A C1 pose bridge alone does not guarantee <=2cm planted-foot slip during an arbitrary transition; world-space contact IK must carry active support anchors until release.',
  thresholds, sourceFiles: clips.map(({ id, path, sha256 }) => ({ id, path, sha256 })),
  summary, nativeHandoffs, bridges: results,
};
mkdirSync(new URL('verification/', root), { recursive: true });
writeFileSync(new URL('verification/transitions.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (!summary.allPassed) process.exitCode = 1;
