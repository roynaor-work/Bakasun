const hypot2=(x,z)=>Math.sqrt(x*x+z*z); // Math.hypot is a non-inlined builtin that boxes its result on every call
/** Body layer for the realistic athlete, applied around the mocap mixer.
 * - orientation: a critically damped yaw spring (no snaps, no spinning tops);
 * - lean: into turns (centripetal) and with acceleration (push-off / braking);
 * - foot planting: a planted foot stays where it touched the turf and the leg is
 *   solved with two-bone IK, so feet do not skate when the simulation's speed or
 *   direction differs from the clip;
 * - dribble: touches of the ball timed to the right foot, as a visual offset only.
 * Presentation only: never changes the simulation. */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Critically damped spring toward an angle. Pure (unit-tested). */
export function yawSpring(state, wanted, dt, stiffness) {
  const err = wrap(wanted - state.yaw), w = stiffness;
  // exact step of a critically damped oscillator for this dt
  const e = Math.exp(-w * dt), x0 = -err, v0 = state.rate;
  const x = (x0 + (v0 + w * x0) * dt) * e;
  const v = (v0 - w * (v0 + w * x0) * dt) * e;
  state.yaw = wrap(wanted + x);
  state.rate = v;
  return state;
}

/** Lean angles (radians) from speed, turn rate and forward acceleration. Pure (unit-tested). */
export function bodyLean(speed, yawRate, accel, m) {
  const roll = -clamp(Math.atan(speed * yawRate / 9.81) * m.turnLean, -m.maxRoll, m.maxRoll);
  const pitch = clamp(accel * m.accelLean, -m.maxBrakePitch, m.maxPushPitch);
  return {roll, pitch};
}

/** Ball distance ahead of the body during a running dribble, from the time since the last
 * touch: it leaves the toe, rolls ahead, and the player catches up for the next touch. Pure. */
export function dribbleOffset(since, period, speed, touchAlong, m) {
  const u = clamp(since / Math.max(0.2, period), 0, 1), reach = m.dribbleReach * clamp(speed / m.dribbleFullSpeed, 0, 1);
  return touchAlong + m.dribbleGap + reach * Math.sin(Math.PI * u);
}

const LEGS = [['UpperLeg_L', 'LowerLeg_L', 'Foot_L'], ['UpperLeg_R', 'LowerLeg_R', 'Foot_R']];

export function createAthleteBody(T, character, m) {
  const V = () => new T.Vector3(), Q = () => new T.Quaternion();
  const h = V(), k = V(), a = V(), t = V(), u = V(), v = V(), n = V(), right = V(), q = Q(), pq = Q(), fq = Q(), rq = Q();
  const legs = LEGS.map(([up, low, foot]) => ({up: character.bones[up]?.bone, low: character.bones[low]?.bone, foot: character.bones[foot]?.bone, planted: false, lock: V(), weight: 0, rest: null}));
  const state = {yaw: null, rate: 0, roll: 0, pitch: 0, speed: 0, accel: 0, dribble: {weight: 0, since: 9, last: 0, prev: 0, rising: false, offset: 0}};
  const rotateWorld = (bone, quat) => {
    // bone.world' = quat * bone.world  ->  local' = parentWorld^-1 * quat * parentWorld * local
    bone.parent.getWorldQuaternion(pq);
    bone.quaternion.premultiply(q.copy(pq).invert().multiply(quat).multiply(pq));
    bone.updateMatrixWorld(true);
  };
  function solveLeg(leg, target) {
    leg.up.getWorldPosition(h); leg.low.getWorldPosition(k); leg.foot.getWorldPosition(a);
    leg.foot.getWorldQuaternion(fq);
    const l1 = h.distanceTo(k), l2 = k.distanceTo(a), d = clamp(h.distanceTo(target), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    u.subVectors(h, k); v.subVectors(a, k);
    const cur = u.angleTo(v), want = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    n.crossVectors(u, v);
    if (n.lengthSq() < 1e-8) n.copy(right); else n.normalize();
    if (Math.abs(want - cur) > 1e-4) { rotateWorld(leg.low, rq.setFromAxisAngle(n, want - cur)); leg.foot.getWorldPosition(a); }
    u.subVectors(a, h).normalize(); v.subVectors(target, h).normalize();
    rotateWorld(leg.up, rq.setFromUnitVectors(u, v));
    // keep the animated foot orientation in world space
    leg.foot.parent.getWorldQuaternion(pq);
    leg.foot.quaternion.copy(pq.invert().multiply(fq));
    leg.foot.updateMatrixWorld(true);
  }
  return {
    state,
    /** Before the mixer: orientation and lean on the pivot. */
    orient(p, wanted, dt, quick) {
      if (state.yaw === null) { state.yaw = wanted; state.rate = 0; }
      yawSpring(state, wanted, dt, quick ? m.quickTurnStiffness : m.turnStiffness);
      const speed = hypot2(p.vx, p.vz), along = p.vx * Math.sin(state.yaw) + p.vz * Math.cos(state.yaw);
      const accel = dt > 0 ? (along - state.speed) / dt : 0;
      state.accel += (accel - state.accel) * (1 - Math.exp(-dt / m.accelEase));
      state.speed = along;
      const lean = bodyLean(speed, state.rate, state.accel, m), ease = 1 - Math.exp(-dt / m.leanEase);
      state.roll += (lean.roll - state.roll) * ease;
      state.pitch += (lean.pitch - state.pitch) * ease;
      return state;
    },
    /** After the mixer: plant feet that are on the turf. weight 0 disables (actions, slides). */
    plant(pivot, dt, weight, warp = 1) {
      pivot.updateMatrixWorld(true);
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw), stretch = (warp - 1) * weight;
      for (const leg of legs) {
        if (!leg.up || !leg.low || !leg.foot) continue;
        leg.foot.getWorldPosition(a);
        if (stretch > 1e-3) { const f = (a.x - pivot.position.x) * fx + (a.z - pivot.position.z) * fz; a.x += fx * f * stretch; a.z += fz * f * stretch; }
        if (leg.rest === null) leg.rest = m.plantHeight;
        const low = a.y < leg.rest, high = a.y > leg.rest + m.plantRelease;
        if (!leg.planted && low && weight > 0.5) { leg.planted = true; leg.lock.copy(a); }
        if (leg.planted) {
          const slip = hypot2(a.x - leg.lock.x, a.z - leg.lock.z);
          if (high || slip > m.maxSlip || weight <= 0.5) leg.planted = false;
        }
        const goal = leg.planted ? weight : 0;
        leg.weight += (goal - leg.weight) * (1 - Math.exp(-dt / (goal > leg.weight ? m.plantIn : m.plantOut)));
        if (!leg.planted && leg.weight > 0.01) {
          // released: let the lock follow the animated foot while blending out
          leg.lock.lerp(a, 1 - Math.exp(-dt / m.plantOut));
        }
        if (leg.weight < 0.01) { leg.weight = 0; if (stretch > 1e-3) solveLeg(leg, a); continue; }
        t.set(a.x + (leg.lock.x - a.x) * leg.weight, a.y, a.z + (leg.lock.z - a.z) * leg.weight);
        solveLeg(leg, t);
      }
    },
    /** Dribble touch timing from the right foot reaching forward. Returns the visual offset (m, along facing). */
    dribble(p, owns, dt, footAlong, period, active, ballAlong) {
      const d = state.dribble, speed = hypot2(p.vx, p.vz);
      if (!(dt > 0)) return d.offset; // paused: no touch, no change
      const rising = footAlong > d.prev + 1e-4;
      if (d.rising && !rising) { d.since = 0; d.touch = d.prev; } // right foot reached its forward-most point: touch
      d.rising = rising; d.prev = footAlong;
      d.since += dt;
      if (d.touch === undefined) d.touch = footAlong;
      const on = owns && active ? clamp((speed - m.dribbleMinSpeed) / m.dribbleRamp, 0, 1) : 0;
      d.weight += (on - d.weight) * (1 - Math.exp(-dt / m.dribbleEase));
      d.offset = d.weight * (dribbleOffset(d.since, period, speed, d.touch, m) - ballAlong);
      return d.offset;
    },
  };
}
