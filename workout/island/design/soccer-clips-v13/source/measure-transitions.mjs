/** Original C0/C1 endpoint and 240 Hz bridge measurements. CC0-1.0. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unpack, readAccessor } from './glb.mjs';
import { makeBridge, sampleMotion, poseVelocity } from '../runtime/player.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const ids = JSON.parse(read('runtime/catalog.json')).clips.map(c => c.id);
const rate = 240;
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angularDistance = (a, b) => 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(dot(a, b)) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;

/** Decode actual serialized FLOAT tracks; reject non-native channels. */
function decode(path) {
  const bytes = read(path), glb = unpack(bytes), doc = glb.document;
  const animation = doc.animations[0], tracks = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`${path}: expected native LINEAR sampler`);
    const times = readAccessor(glb, sampler.input).values;
    const data = readAccessor(glb, sampler.output);
    tracks.push({ name: doc.nodes[channel.target.node].name, path: channel.target.path, times, width: data.width, values: data.values });
  }
  const rotations = tracks.filter(t => t.path === 'rotation');
  if (rotations.length !== 18) throw new Error(`${path}: expected canonical18 rotations`);
  const translation = tracks.find(t => t.name === 'Hips' && t.path === 'translation');
  if (!translation) throw new Error(`${path}: missing Hips translation`);
  const times = translation.times;
  for (const t of tracks) if (t.times.length !== times.length || t.times.some((v, i) => v !== times[i])) throw new Error(`${path}: mismatched native channel times`);
  const frames = times.map((time, i) => ({
    time,
    hips: translation.values.slice(i * 3, i * 3 + 3),
    rotations: Object.fromEntries(rotations.map(t => [t.name, t.values.slice(i * 4, i * 4 + 4)])),
  }));
  return { id: animation.name, path, sha256: createHash('sha256').update(bytes).digest('hex'), duration: times.at(-1), frames };
}

function poseResidual(a, b) {
  return { hipsMeters: distance(a.hips, b.hips), rotationDegrees: Math.max(...Object.keys(a.rotations).map(name => angularDistance(a.rotations[name], b.rotations[name]))) };
}
function velocityResidual(a, b, pose) {
  let radiansPerSecond = 0;
  for (const name of Object.keys(a.rotations)) {
    // Component derivatives live in the tangent plane of this same endpoint.
    // Quaternion angular speed is twice the tangent-component norm.
    const q = pose.rotations[name], av = a.rotations[name], bv = b.rotations[name];
    const tangentDifference = av.map((v, i) => v - bv[i]);
    const projection = dot(tangentDifference, q) / dot(q, q);
    radiansPerSecond = Math.max(radiansPerSecond, 2 * Math.hypot(...tangentDifference.map((v, i) => v - projection * q[i])));
  }
  return { hipsMetersPerSecond: distance(a.hips, b.hips), rotationRadiansPerSecond: radiansPerSecond };
}

const references = ['idle_relaxed', 'run'].map(id => decode(`runtime/reference/${id}.glb`));
const actions = ids.map(id => decode(`runtime/clips/${id}.glb`));
const results = [];
for (const action of actions) for (const reference of references) for (const phaseKind of ['catalog-zero', 'interior']) for (const direction of ['entry', 'exit']) {
  // Phase zero verifies the catalog handoff, including the outgoing velocity
  // from the previous cycle. Interior phases verify a moving arbitrary phase.
  const phase = phaseKind === 'catalog-zero' ? 0 : reference.duration * (reference.id === 'run' ? .371 : .231);
  const duration = reference.id === 'run' ? .3 : .2;
  const hs = t => sampleMotion(action, t, { loop: false });
  const rs = t => sampleMotion(reference, t, { loop: true });
  const from = direction === 'entry' ? rs : hs, to = direction === 'entry' ? hs : rs;
  const fromTime = direction === 'entry' ? phase : action.duration, toTime = direction === 'entry' ? 0 : phase;
  const transition = makeBridge({ from, to, fromTime, toTime, duration });
  const start = transition.sample(0), end = transition.sample(duration);
  const c0 = { start: poseResidual(start, from(fromTime)), end: poseResidual(end, to(toTime)) };
  const step = 1e-7;
  const startVelocity = poseVelocity(transition.sample, 0, { side: 'right', delta: step });
  const endVelocity = poseVelocity(transition.sample, duration, { side: 'left', delta: step });
  const expectedStartVelocity = poseVelocity(from, fromTime, { side: 'left' });
  const expectedEndVelocity = poseVelocity(to, toTime, { side: 'right' });
  const c1 = { start: velocityResidual(startVelocity, expectedStartVelocity, start), end: velocityResidual(endVelocity, expectedEndVelocity, end) };
  let maxHipsStepMeters = 0, maxRotationStepDegrees = 0, maxUnitQuaternionError = 0, rootFixed = true;
  let previous = transition.sample(0);
  const count = Math.ceil(duration * rate);
  for (let i = 0; i <= count; i++) {
    const current = transition.sample(Math.min(duration, i / rate));
    const diff = poseResidual(previous, current);
    maxHipsStepMeters = Math.max(maxHipsStepMeters, diff.hipsMeters);
    maxRotationStepDegrees = Math.max(maxRotationStepDegrees, diff.rotationDegrees);
    for (const q of Object.values(current.rotations)) maxUnitQuaternionError = Math.max(maxUnitQuaternionError, Math.abs(Math.hypot(...q) - 1));
    rootFixed &&= current.rotations.Root.every((v, j) => v === [0, 0, 0, 1][j]);
    previous = current;
  }
  const pass = Object.values(c0).every(r => r.hipsMeters < 1e-9 && r.rotationDegrees < 1e-5)
    && Object.values(c1).every(r => r.hipsMetersPerSecond < 1e-4 && r.rotationRadiansPerSecond < .01)
    && maxHipsStepMeters < .02 && maxRotationStepDegrees < 10 && maxUnitQuaternionError < 1e-12 && rootFixed;
  results.push({ action: action.id, reference: reference.id, direction, phaseKind, referencePhaseSeconds: phase, fromTime, toTime, durationSeconds: duration, sampleRate: rate, sampleCount: count + 1, sourceHipsSpeedMetersPerSecond: Math.hypot(...expectedStartVelocity.hips), targetHipsSpeedMetersPerSecond: Math.hypot(...expectedEndVelocity.hips), sourceMaximumAngularSpeedRadiansPerSecond: Math.max(...Object.values(expectedStartVelocity.rotations).map(q => 2 * Math.hypot(...q))), targetMaximumAngularSpeedRadiansPerSecond: Math.max(...Object.values(expectedEndVelocity.rotations).map(q => 2 * Math.hypot(...q))), c0, c1, maxHipsStepMeters, maxRotationStepDegrees, maxUnitQuaternionError, rootFixed, pass });
}
const evidence = {
  method: 'Actual GLB FLOAT accessors, native LINEAR/slerp; Hermite bridge endpoint residuals and 240 Hz interior samples. Source outgoing and target incoming velocities measured from their native tracks; target phase resumes after bridge.',
  scope: '64 bridges: eight soccer actions × idle_relaxed/run × entry/exit × catalog phase zero/interior phase. Idle bridges take .2s and run bridges .3s. Reference samplers loop, including negative times for outgoing phase-zero derivatives; action samplers clamp without looping. This verifies the supplied helper, not game integration, foot locking during transitions, arbitrary interruption of an existing game blend, or the original motion-qa continuity metric.',
  thresholds: { endpointHipsMeters: 1e-9, endpointRotationDegrees: 1e-5, endpointVelocityHipsMetersPerSecond: 1e-4, endpointVelocityRotationRadiansPerSecond: .01, maximum240HzHipsStepMeters: .02, maximum240HzRotationStepDegrees: 10 },
  sourceFiles: [...references, ...actions].map(({ path, sha256 }) => ({ path, sha256 })),
  summary: { bridges: results.length, passed: results.filter(r => r.pass).length, maxEndpointRotationDegrees: Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.rotationDegrees))), maxEndpointVelocityRadiansPerSecond: Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.rotationRadiansPerSecond))), maxHipsStepMeters: Math.max(...results.map(r => r.maxHipsStepMeters)), maxRotationStepDegrees: Math.max(...results.map(r => r.maxRotationStepDegrees)), allPassed: results.every(r => r.pass) },
  bridges: results,
};
mkdirSync(new URL('verification/', root), { recursive: true });
writeFileSync(new URL('verification/transitions.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence.summary, null, 2));
if (!evidence.summary.allPassed) process.exitCode = 1;
