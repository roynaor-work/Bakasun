/**
 * Original canonical-pose sampler and C1 transition bridge. CC0-1.0.
 * No renderer, platform API or game dependency. Metres, seconds, xyzw quaternions.
 *
 * A bridge starts at the currently displayed source pose and its outgoing
 * velocity. Its destination is a chosen target phase and that phase's incoming
 * velocity. Hold the target phase during the bridge; after duration seconds,
 * continue target playback from toTime. Advancing target time during the bridge
 * would require a moving-endpoint construction and is not this API's contract.
 * Physics, actor translation and events remain the consumer's responsibility.
 */
const I = [0, 0, 0, 1];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const scale = (a, s) => a.map(v => v * s);
const norm = q => {
  const n = Math.hypot(...q);
  if (!(n > 1e-12)) throw new Error('A rotation cannot have zero length.');
  return scale(q, 1 / n);
};
const align = (q, reference) => dot(q, reference) < 0 ? scale(q, -1) : q;
const tangent = (q, velocity) => velocity.map((v, i) => v - q[i] * dot(q, velocity));
const clonePose = p => ({ hips: [...p.hips], rotations: Object.fromEntries(Object.entries(p.rotations).map(([name, q]) => [name, [...q]])) });

/** glTF LINEAR rotation interpolation is shortest-arc quaternion slerp. */
export function slerp(a, b, u) {
  a = norm(a); b = align(norm(b), a);
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  if (d > .9999995) return norm(a.map((v, i) => v + (b[i] - v) * u));
  const angle = Math.acos(d), denominator = Math.sin(angle);
  return norm(a.map((v, i) => (v * Math.sin((1 - u) * angle) + b[i] * Math.sin(u * angle)) / denominator));
}

/** Sample baked canonical frames using their native LINEAR translation/slerp. */
export function sampleMotion(motion, time, { loop = motion.loop ?? false } = {}) {
  const frames = motion.frames;
  if (!Array.isArray(frames) || !frames.length) throw new Error('Motion needs canonical frames.');
  const start = frames[0].time, end = frames.at(-1).time;
  if (loop && end > start) time = start + ((time - start) % (end - start) + end - start) % (end - start);
  time = Math.min(end, Math.max(start, time));
  let lo = 0, hi = frames.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].time > time) hi = mid; else lo = mid; }
  const a = frames[lo], b = frames[hi], span = b.time - a.time, u = span > 0 ? (time - a.time) / span : 0;
  return {
    hips: a.hips.map((v, i) => v + (b.hips[i] - v) * u),
    rotations: Object.fromEntries(Object.keys(a.rotations).map(name => [name, name === 'Root' ? [...I] : slerp(a.rotations[name], b.rotations[name], u)])),
  };
}

/**
 * Quaternion-component derivatives in the local tangent plane, per second.
 * 'left' is the outgoing source derivative, 'right' the incoming target
 * derivative. Sided differences also preserve endpoint velocities of GLBs
 * whose own LINEAR tracks can have velocity changes at frame boundaries.
 */
export function poseVelocity(sample, time, { side = 'central', delta = 1e-5 } = {}) {
  if (!(delta > 0)) throw new Error('Velocity delta must be positive.');
  const center = sample(time);
  const before = sample(side === 'right' ? time : time - delta);
  const after = sample(side === 'left' ? time : time + delta);
  const denominator = side === 'central' ? 2 * delta : delta;
  const rotations = {};
  for (const name of Object.keys(center.rotations)) {
    const q = norm(center.rotations[name]);
    const a = align(norm(before.rotations[name]), q), b = align(norm(after.rotations[name]), q);
    rotations[name] = name === 'Root' ? [0, 0, 0, 0] : tangent(q, b.map((v, i) => (v - a[i]) / denominator));
  }
  return { hips: after.hips.map((v, i) => (v - before.hips[i]) / denominator), rotations };
}

function hermite(a, av, b, bv, u, duration) {
  const u2 = u * u, u3 = u2 * u;
  return a.map((v, i) => (2 * u3 - 3 * u2 + 1) * v + (u3 - 2 * u2 + u) * duration * av[i] + (-2 * u3 + 3 * u2) * b[i] + (u3 - u2) * duration * bv[i]);
}

/**
 * Cubic Hermite translation and normalized quaternion-component Hermite.
 * Endpoint derivatives are projected onto the unit quaternion tangent plane;
 * normalizing the curve therefore preserves each endpoint derivative (C1).
 * Antipodal destination quaternions and their derivatives change sign together.
 */
export function bridge(fromPose, fromVelocity, toPose, toVelocity, time, duration) {
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('Bridge duration must be finite and positive.');
  const u = Math.min(1, Math.max(0, time / duration));
  const rotations = {};
  for (const name of Object.keys(fromPose.rotations)) {
    if (name === 'Root') { rotations.Root = [...I]; continue; }
    const a = norm(fromPose.rotations[name]), rawB = norm(toPose.rotations[name]);
    const sign = dot(a, rawB) < 0 ? -1 : 1, b = scale(rawB, sign);
    const av = tangent(a, fromVelocity.rotations[name]);
    const bv = tangent(b, scale(toVelocity.rotations[name], sign));
    rotations[name] = norm(hermite(a, av, b, bv, u, duration));
  }
  return { hips: hermite(fromPose.hips, fromVelocity.hips, toPose.hips, toVelocity.hips, u, duration), rotations };
}

/**
 * from/to are callbacks sample(seconds)->{hips:[x,y,z],rotations:{bone:[x,y,z,w]}}.
 * Supply explicit velocities when interrupting an already blended display;
 * otherwise sided derivatives are measured from the supplied samplers.
 * Sampling this bridge does not dispatch contact/takeoff/land events.
 */
export function makeBridge({ from, to, fromTime = 0, toTime = 0, duration = .3, fromVelocity, toVelocity }) {
  if (typeof from !== 'function' || typeof to !== 'function') throw new Error('Bridge endpoints need sampling callbacks.');
  const start = clonePose(from(fromTime)), end = clonePose(to(toTime));
  const outgoing = fromVelocity ?? poseVelocity(from, fromTime, { side: 'left' });
  const incoming = toVelocity ?? poseVelocity(to, toTime, { side: 'right' });
  // Validate eagerly, even before a caller requests its first sample.
  bridge(start, outgoing, end, incoming, 0, duration);
  return {
    duration, fromTime, toTime, resumeTargetTime: toTime,
    startPose: clonePose(start), endPose: clonePose(end),
    fromVelocity: outgoing, toVelocity: incoming,
    sample: time => bridge(start, outgoing, end, incoming, time, duration),
  };
}
