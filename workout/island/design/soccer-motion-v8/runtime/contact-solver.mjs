import * as THREE from './vendor/three.module.js';

const sole = new THREE.Vector3(0, -.08, 0);
const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const feet = ['LeftFoot', 'RightFoot'];

function phaseAt(info, time) {
  return info.loop ? time % info.duration : Math.min(time, info.duration);
}
function supportsAt(info, time) {
  const phase = phaseAt(info, time), cycle = info.loop ? Math.floor(time / info.duration) : 0;
  return info.supports.flatMap((support, index) => phase >= support.start - 1e-8 && phase <= support.end + 1e-8
    ? [{ ...support, index, cycle, key: `${info.id}:${cycle}:${index}` }] : []);
}
function pathAt(info, time, out = new THREE.Vector3()) {
  const keys = info.travel;
  if (!keys?.length) return out.set(0, 0, 0);
  const phase = phaseAt(info, time), cycle = info.loop ? Math.floor(time / info.duration) : 0;
  let hi = keys.findIndex(key => key.time >= phase);
  if (hi < 0) hi = keys.length - 1;
  if (!hi) out.fromArray(keys[0].position);
  else {
    const a = keys[hi - 1], b = keys[hi];
    out.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), (phase - a.time) / (b.time - a.time));
  }
  if (cycle) out.addScaledVector(new THREE.Vector3().fromArray(keys.at(-1).position), cycle);
  return out;
}

/** Post-mix canonical leg constraints. Reset/seek leave native tracks exact.
 * Anchors are real displayed world points, so root placement and yaw remain
 * game-owned while an acquired sole stays on its world anchor until release.
 * Foot-floor checks inspect only actual vertices influenced by that Foot bone;
 * they do not scan the whole athlete skin on each animation frame.
 */
export class ContactSolver {
  constructor(root, actor, travel, joints, applyTravel) {
    this.root = root; this.actor = actor; this.travel = travel; this.joints = joints;
    this.applyTravel = applyTravel;
    this.pins = new Map(); this.enabled = false; this.entryBlend = 0;
    this.probes = Object.fromEntries(feet.map(name => [name, []]));
    this.meshes = [];
    actor.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      this.meshes.push(mesh);
      const attributes = mesh.geometry.attributes;
      for (const name of feet) {
        const bone = mesh.skeleton.bones.findIndex(bone => bone.name === name);
        if (bone < 0) continue;
        for (let vertex = 0; vertex < attributes.position.count; vertex++) {
          let weight = 0;
          for (let i = 0; i < 4; i++) if (attributes.skinIndex.getComponent(vertex, i) === bone) weight += attributes.skinWeight.getComponent(vertex, i);
          if (weight > .05) this.probes[name].push({ mesh, vertex });
        }
      }
    });
    this.diagnostics = { floorCorrection: { LeftFoot: 0, RightFoot: 0 }, pelvisCorrection: 0, contacts: [] };
  }
  reset() {
    this.enabled = false; this.pins.clear(); this.entryBlend = 0;
    this.diagnostics = { floorCorrection: { LeftFoot: 0, RightFoot: 0 }, pelvisCorrection: 0, contacts: [] };
  }
  updateMatrices() {
    this.root.updateMatrixWorld(true);
    for (const mesh of this.meshes) mesh.skeleton.update();
  }
  solePoint(name) { return this.joints.get(name).localToWorld(sole.clone()); }
  begin(sourceInfo, sourceTime, destinationInfo, duration) {
    this.updateMatrices();
    const outgoing = supportsAt(sourceInfo, sourceTime);
    const incoming = supportsAt(destinationInfo, 0);
    const pins = new Map();
    for (const support of outgoing) {
      const matching = incoming.find(candidate => candidate.bone === support.bone);
      const foot = this.joints.get(support.bone);
      pins.set(support.bone, {
        bone: support.bone, anchor: this.solePoint(support.bone), orientation: foot.getWorldQuaternion(new THREE.Quaternion()),
        key: matching?.key ?? `outgoing:${support.bone}`, end: matching?.end ?? 0,
        held: Boolean(matching), acquireTime: 0, acquireDuration: 0, releaseDuration: matching ? .06 : duration,
      });
    }
    this.pins = pins; this.enabled = true; this.entryBlend = duration;
  }
  setWorldQuaternion(bone, quaternion) {
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion)).normalize();
    this.root.updateMatrixWorld(true);
  }
  solveLeg(name, target, orientation) {
    const side = name.startsWith('Left') ? 'Left' : 'Right';
    const upper = this.joints.get(`${side}UpLeg`), lower = this.joints.get(`${side}Leg`), foot = this.joints.get(name);
    const hip = upper.getWorldPosition(new THREE.Vector3()), knee = lower.getWorldPosition(new THREE.Vector3()), ankle = foot.getWorldPosition(new THREE.Vector3());
    const l1 = hip.distanceTo(knee), l2 = knee.distanceTo(ankle);
    const delta = target.clone().sub(hip), length = delta.length();
    if (length < 1e-9) return;
    const direction = delta.multiplyScalar(1 / length), distance = THREE.MathUtils.clamp(length, Math.abs(l1 - l2) + 1e-5, l1 + l2 - 1e-6);
    let pole = knee.clone().sub(hip).addScaledVector(direction, -knee.clone().sub(hip).dot(direction));
    if (pole.lengthSq() < 1e-10) {
      pole = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
      pole.addScaledVector(direction, -pole.dot(direction));
    }
    pole.normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const newKnee = hip.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    const upperQuaternion = upper.getWorldQuaternion(new THREE.Quaternion());
    const upperSwing = new THREE.Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(), newKnee.clone().sub(hip).normalize());
    this.setWorldQuaternion(upper, upperSwing.multiply(upperQuaternion));
    const currentKnee = lower.getWorldPosition(new THREE.Vector3()), currentAnkle = foot.getWorldPosition(new THREE.Vector3());
    const lowerSwing = new THREE.Quaternion().setFromUnitVectors(currentAnkle.sub(currentKnee).normalize(), hip.clone().addScaledVector(direction, distance).sub(currentKnee).normalize());
    this.setWorldQuaternion(lower, lowerSwing.multiply(lower.getWorldQuaternion(new THREE.Quaternion())));
    this.setWorldQuaternion(foot, orientation);
  }
  movePelvis(worldDelta) {
    const hips = this.joints.get('Hips');
    hips.position.copy(hips.parent.worldToLocal(hips.getWorldPosition(new THREE.Vector3()).add(worldDelta)));
    this.root.updateMatrixWorld(true);
  }
  footMinRootY(name) {
    let minimum = Infinity;
    const point = new THREE.Vector3(), inverse = this.root.matrixWorld.clone().invert();
    for (const { mesh, vertex } of this.probes[name]) {
      mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      minimum = Math.min(minimum, point.y);
    }
    return minimum;
  }
  apply(info, time) {
    if (!this.enabled) return;
    this.updateMatrices();
    const contacts = supportsAt(info, time);
    for (const support of contacts) {
      const old = this.pins.get(support.bone);
      if (old?.key === support.key) continue;
      // Metadata anchors include optional reference locomotion. Remove it from
      // the native in-place foot and add the actual demonstration travel. A
      // simulation moving root instead still acquires the displayed world pin.
      const reference = pathAt(info, support.cycle * info.duration + support.start);
      const location = new THREE.Vector3().fromArray(support.anchor);
      if (support.cycle && info.travel?.length) location.addScaledVector(new THREE.Vector3().fromArray(info.travel.at(-1).position), support.cycle);
      const actualTravel = this.travel.position.clone();
      if (this.applyTravel) {
        // The controller passes the true travel position; referenceAtNow is
        // subtracted so both actor-driven and game-driven placement agree.
        location.sub(pathAt(info, time)).add(actualTravel);
      } else location.sub(reference).add(actualTravel);
      const orientation = this.joints.get(support.bone).getWorldQuaternion(new THREE.Quaternion());
      const acquireTime = support.cycle * info.duration + support.start;
      this.pins.set(support.bone, { bone: support.bone, key: support.key, anchor: this.root.localToWorld(location), orientation,
        end: support.cycle * info.duration + support.end, held: false, acquireTime,
        acquireDuration: Math.max(.06, this.entryBlend - acquireTime), releaseDuration: .06 });
    }
    const goals = [];
    for (const [name, pin] of this.pins) {
      let weight = 1;
      if (time > pin.end) weight *= 1 - smooth((time - pin.end) / pin.releaseDuration);
      if (pin.acquireDuration) weight *= smooth((time - pin.acquireTime) / pin.acquireDuration);
      if (weight <= 1e-8) { this.pins.delete(name); continue; }
      const foot = this.joints.get(name), currentOrientation = foot.getWorldQuaternion(new THREE.Quaternion());
      const orientation = currentOrientation.slerp(pin.orientation, weight);
      const currentSole = this.solePoint(name), targetSole = currentSole.lerp(pin.anchor, weight);
      const ankle = targetSole.clone().sub(sole.clone().applyQuaternion(orientation).multiplyScalar(foot.getWorldScale(new THREE.Vector3()).x));
      goals.push({ name, weight, pin, orientation, targetSole, ankle, unlocked: 1 - weight });
    }
    const pelvisShift = new THREE.Vector3();
    for (let iteration = 0; iteration < 6; iteration++) for (const goal of goals) {
      const side = goal.name.startsWith('Left') ? 'Left' : 'Right';
      const upper = this.joints.get(`${side}UpLeg`), lower = this.joints.get(`${side}Leg`), foot = this.joints.get(goal.name);
      const hip = upper.getWorldPosition(new THREE.Vector3()), knee = lower.getWorldPosition(new THREE.Vector3()), ankle = foot.getWorldPosition(new THREE.Vector3());
      const target = goal.ankle.clone().addScaledVector(pelvisShift, goal.unlocked), delta = target.sub(hip), distance = delta.length();
      const reach = hip.distanceTo(knee) + knee.distanceTo(ankle) - 1e-6;
      if (distance > reach) {
        delta.multiplyScalar((distance - reach) / distance);
        this.movePelvis(delta); pelvisShift.add(delta);
      }
    }
    for (const goal of goals) this.solveLeg(goal.name, goal.ankle.clone().addScaledVector(pelvisShift, goal.unlocked), goal.orientation);
    this.updateMatrices();
    const corrections = { LeftFoot: 0, RightFoot: 0 };
    for (let iteration = 0; iteration < 2; iteration++) for (const name of feet) {
      const correction = Math.max(0, .0015 - this.footMinRootY(name));
      if (correction < 1e-7) continue;
      const foot = this.joints.get(name), goal = foot.getWorldPosition(new THREE.Vector3());
      const up = new THREE.Vector3(0, correction, 0).transformDirection(this.root.matrixWorld).multiplyScalar(this.root.getWorldScale(new THREE.Vector3()).x * correction);
      // transformDirection normalizes; multiplying by the physical distance
      // restores the world displacement after root yaw and uniform scale.
      this.solveLeg(name, goal.add(up), foot.getWorldQuaternion(new THREE.Quaternion()));
      this.updateMatrices(); corrections[name] += correction;
    }
    this.diagnostics = {
      floorCorrection: corrections, pelvisCorrection: pelvisShift.length(),
      contacts: goals.map(goal => ({ bone: goal.name, weight: goal.weight, anchor: goal.pin.anchor.toArray(), key: goal.pin.key,
        held: goal.pin.held && time <= goal.pin.end, releaseTime: goal.pin.end, releaseDuration: goal.pin.releaseDuration,
        releaseReason: time > goal.pin.end ? 'authored-support-window-ended' : null })),
    };
    // Once the blend and its acquired contacts have settled, native tracks are
    // already floor-safe. Leave subsequent native poses exact until the next
    // transition instead of running constraints through unrelated gait cycles.
    if (!this.pins.size && time >= this.entryBlend) this.enabled = false;
  }
}
