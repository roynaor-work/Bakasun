/**
 * Portable canonical18 sampler and two-link contact IK for the v7 viewer.
 * Three.js is supplied by the caller; this module performs no network access.
 * Motion is authored, not captured. Simulation owns position and decisions.
 */

const REST_HIPS = [0, .86, 0];
const asBone = (bones, name) => bones instanceof Map ? bones.get(name) : bones[name];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function clock(clip, timeSeconds) {
  const time = Math.max(0, timeSeconds);
  const cycle = clip.loop ? Math.floor(time / clip.duration) : 0;
  const local = clip.loop ? time - cycle * clip.duration : Math.min(time, clip.duration);
  return { cycle, local };
}

/** Samples a clip at unwrapped time, including its unwrapped reference path. */
export function sampleClip(THREE, clip, timeSeconds) {
  const { cycle, local } = clock(clip, timeSeconds);
  const i = Math.min(clip.frames.length - 2, Math.max(0, Math.floor(local * clip.fps)));
  const a = clip.frames[i];
  const b = clip.frames[i + 1];
  const alpha = clamp((local - a.timeSeconds) / Math.max(1e-12, b.timeSeconds - a.timeSeconds), 0, 1);
  const pose = { timeSeconds, localTimeSeconds: local, cycle, rotations: {}, hipsOffsetMeters: [], referenceRootTranslationMeters: [] };
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  for (const name of Object.keys(a.rotations)) {
    qa.fromArray(a.rotations[name]); qb.fromArray(b.rotations[name]);
    pose.rotations[name] = qa.slerp(qb, alpha).normalize().toArray();
  }
  const first = clip.frames[0].referenceRootTranslationMeters;
  const last = clip.frames[clip.frames.length - 1].referenceRootTranslationMeters;
  for (let k = 0; k < 3; k++) {
    pose.hipsOffsetMeters[k] = a.hipsOffsetMeters[k] + alpha * (b.hipsOffsetMeters[k] - a.hipsOffsetMeters[k]);
    pose.referenceRootTranslationMeters[k] = a.referenceRootTranslationMeters[k] + alpha * (b.referenceRootTranslationMeters[k] - a.referenceRootTranslationMeters[k]) + cycle * (last[k] - first[k]);
  }
  return pose;
}

/** Active full-weight contacts; their anchors include whole-loop displacement. */
export function contactsAt(clip, timeSeconds) {
  const { cycle, local } = clock(clip, timeSeconds);
  const first = clip.frames[0].referenceRootTranslationMeters;
  const last = clip.frames[clip.frames.length - 1].referenceRootTranslationMeters;
  return clip.contacts.filter(c => c.start - 1e-8 <= local && local <= c.end + 1e-8).map(c => ({
    ...c,
    anchor: c.anchor.map((v, k) => v + cycle * (last[k] - first[k])),
    key: `${clip.id}/${c.bone}/${cycle}/${c.start}`,
    startTimeSeconds: c.start + cycle * clip.duration,
    endTimeSeconds: c.end + cycle * clip.duration,
    localTimeSeconds: local,
  }));
}

/** Apply absolute canonical local rotations; target bones must share the rig. */
export function applyPose(bones, pose) {
  for (const [name, q] of Object.entries(pose.rotations)) {
    const bone = asBone(bones, name);
    if (bone) bone.quaternion.fromArray(q).normalize();
  }
  const hips = asBone(bones, 'Hips');
  if (hips) hips.position.fromArray(REST_HIPS).add({
    x: pose.hipsOffsetMeters[0], y: pose.hipsOffsetMeters[1], z: pose.hipsOffsetMeters[2],
  });
  const root = asBone(bones, 'Root');
  if (root) root.updateWorldMatrix(true, true);
}

/** Mix *currently displayed* poses while each source continues to advance. */
export function blendPoses(THREE, source, target, mix) {
  const w = clamp(mix, 0, 1);
  const t = w * w * (3 - 2 * w);
  const pose = { rotations: {}, hipsOffsetMeters: [], referenceRootTranslationMeters: [] };
  const qa = new THREE.Quaternion(); const qb = new THREE.Quaternion();
  for (const name of Object.keys(target.rotations)) {
    qa.fromArray(source.rotations[name] || target.rotations[name]);
    qb.fromArray(target.rotations[name]);
    pose.rotations[name] = qa.slerp(qb, t).normalize().toArray();
  }
  for (let k = 0; k < 3; k++) {
    pose.hipsOffsetMeters[k] = source.hipsOffsetMeters[k] + t * (target.hipsOffsetMeters[k] - source.hipsOffsetMeters[k]);
    pose.referenceRootTranslationMeters[k] = source.referenceRootTranslationMeters[k] + t * (target.referenceRootTranslationMeters[k] - source.referenceRootTranslationMeters[k]);
  }
  return pose;
}

/**
 * Solve a canonical leg for a WORLD-space sole contact. The knee pole follows
 * the actor's forward direction and the flat foot follows its yaw. Returns
 * target reach residual in world units; callers must report, not hide, errors.
 * `side` is Left/Right or LeftFoot/RightFoot. No temporary bones are introduced.
 */
export function solveFootIK(THREE, bones, side, targetWorld, soleOffset = .08, yawRadians = 0, poleWorld = null) {
  side = side.replace(/Foot$/, '');
  const upper = asBone(bones, `${side}UpLeg`);
  const lower = asBone(bones, `${side}Leg`);
  const foot = asBone(bones, `${side}Foot`);
  const root = asBone(bones, 'Root');
  if (!upper || !lower || !foot || !root) return Infinity;
  root.updateWorldMatrix(true, true);
  const scale = root.getWorldScale(new THREE.Vector3());
  const footWorldQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  if (yawRadians) footWorldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRadians));
  const pole = poleWorld ? new THREE.Vector3().copy(poleWorld) : new THREE.Vector3(0, 0, 1).applyQuaternion(footWorldQuaternion);
  const origin = upper.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Vector3().copy(targetWorld);
  target.add(new THREE.Vector3(0, soleOffset * scale.y, 0).applyQuaternion(footWorldQuaternion));
  const parentQuaternion = upper.parent.getWorldQuaternion(new THREE.Quaternion());
  const a = lower.position.length() * scale.y;
  const b = foot.position.length() * scale.y;
  const delta = target.clone().sub(origin);
  const actualDistance = delta.length();
  const distance = clamp(actualDistance, Math.abs(a - b) + 1e-8, a + b - 1e-8);
  const direction = delta.normalize();
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-10) pole.crossVectors(direction, new THREE.Vector3(1, 0, 0));
  pole.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const knee = origin.clone().addScaledVector(direction, along).addScaledVector(pole, height);
  const ankle = origin.clone().addScaledVector(direction, distance);
  // Steer the authored world axes rather than rebuilding them from a global
  // rest direction. A global minimum-twist quaternion loses axial heading:
  // joint endpoints still match at yaw PI while the skinned thighs turn 180°.
  // Rotation deltas preserve authored twist, commute with world heading and
  // retain the displayed limb orientation during interrupted transitions.
  const upperBefore = upper.getWorldQuaternion(new THREE.Quaternion());
  const lowerBefore = lower.getWorldQuaternion(new THREE.Quaternion());
  const upperWorldQ = new THREE.Quaternion().setFromUnitVectors(lower.position.clone().normalize().applyQuaternion(upperBefore), knee.clone().sub(origin).normalize()).multiply(upperBefore);
  const lowerWorldQ = new THREE.Quaternion().setFromUnitVectors(foot.position.clone().normalize().applyQuaternion(lowerBefore), ankle.clone().sub(knee).normalize()).multiply(lowerBefore);
  upper.quaternion.copy(parentQuaternion.invert()).multiply(upperWorldQ).normalize();
  lower.quaternion.copy(upperWorldQ.clone().invert()).multiply(lowerWorldQ).normalize();
  foot.quaternion.copy(lowerWorldQ.clone().invert()).multiply(footWorldQuaternion).normalize();
  root.updateWorldMatrix(true, true);
  return Math.max(0, actualDistance - distance);
}

/** Apply reference-world contacts after blending. Offset does not rotate them. */
export function enforceContacts(THREE, bones, contacts, worldOffset = { x: 0, y: 0, z: 0 }) {
  let residual = 0;
  for (const contact of contacts) {
    if (contact.mode !== 'plant' || !/Foot$/.test(contact.bone)) continue;
    const target = new THREE.Vector3().fromArray(contact.anchor).add(worldOffset);
    residual = Math.max(residual, solveFootIK(THREE, bones, contact.bone, target, .08, contact.yawRadians || 0));
  }
  return residual;
}

/** Preserve anchors through interrupted transitions. Clear on actor teleport. */
export function createContactLockState() {
  const locks = new Map();
  return {
    clear() { locks.clear(); },
    /**
     * Capture/retain source contacts until their release times, while admitting
     * destination contacts. timeSeconds is one continuous playback clock. Each
     * contact may override releaseAtSeconds for cross-clip release scheduling.
     */
    update(contacts, timeSeconds) {
      for (const [bone, lock] of locks) if (timeSeconds > lock.releaseAtSeconds + 1e-8) locks.delete(bone);
      for (const c of contacts) {
        const release = c.releaseAtSeconds ?? c.endTimeSeconds;
        const old = locks.get(c.bone);
        if (!old) locks.set(c.bone, { ...c, anchor: c.anchor.slice(), releaseAtSeconds: release });
        else if (old.key === c.key) old.releaseAtSeconds = release;
        else old.releaseAtSeconds = Math.min(old.releaseAtSeconds, release);
      }
      return Array.from(locks.values());
    },
    snapshot() { return Array.from(locks.values()).map(c => ({ ...c, anchor: c.anchor.slice() })); },
    release(bone) { locks.delete(bone); },
  };
}
