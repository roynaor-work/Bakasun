/**
 * Explicit motion2 -> preserved human A-pose bind adapter.
 *
 * The 18 joint names match motion2, but the target's rest translations do not.
 * For each joint i, B_i maps its measured target bind frame to the canonical
 * rest frame. Target bind rotations are identity, so:
 *   T_world[i] = S_world[i] * B_i
 *   T_local[i] = inverse(B_parent) * S_local[i] * B_i.
 * Target translations, scales, inverse binds and mesh proportions stay intact.
 * Contact/floor IK belongs AFTER this adapter and after any pose blending.
 */
import * as THREE from '../vendor/three.module.js';

export const CANONICAL_SKELETON = Object.freeze([
  ['Root', null, [0, 0, 0]], ['Hips', 'Root', [0, .86, 0]],
  ['Spine', 'Hips', [0, .20, 0]], ['Chest', 'Spine', [0, .18, 0]],
  ['Neck', 'Chest', [0, .10, 0]], ['Head', 'Neck', [0, .13, 0]],
  ['LeftArm', 'Chest', [.16, .06, 0]], ['LeftForeArm', 'LeftArm', [0, -.27, 0]],
  ['LeftHand', 'LeftForeArm', [0, -.24, 0]], ['RightArm', 'Chest', [-.16, .06, 0]],
  ['RightForeArm', 'RightArm', [0, -.27, 0]], ['RightHand', 'RightForeArm', [0, -.24, 0]],
  ['LeftUpLeg', 'Hips', [.10, 0, 0]], ['LeftLeg', 'LeftUpLeg', [0, -.41, 0]],
  ['LeftFoot', 'LeftLeg', [0, -.37, 0]], ['RightUpLeg', 'Hips', [-.10, 0, 0]],
  ['RightLeg', 'RightUpLeg', [0, -.41, 0]], ['RightFoot', 'RightLeg', [0, -.37, 0]],
].map(([name, parent, restTranslationMeters]) => Object.freeze({
  name, parent, restTranslationMeters: Object.freeze(restTranslationMeters),
})));

const NAMES = CANONICAL_SKELETON.map(b => b.name);
const CHILDREN = {
  Hips: 'Spine', Spine: 'Chest', Chest: 'Neck', Neck: 'Head',
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
};
const V = a => new THREE.Vector3().fromArray(a);
const identity = () => new THREE.Quaternion();
const clean = a => a.map(v => Math.abs(v) < 1e-14 ? 0 : v);
function qArray(q) {
  q.normalize(); if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  return clean(q.toArray());
}
function finiteVector(a, n, label) {
  if (!Array.isArray(a) || a.length !== n || !a.every(Number.isFinite)) throw Error(`${label}: expected ${n} finite numbers`);
  return a;
}
function sourceBones(skeleton) {
  const bones = skeleton?.bones || skeleton || CANONICAL_SKELETON;
  if (!Array.isArray(bones) || bones.length !== 18) throw Error('Canonical source must have exactly 18 bones');
  for (let i = 0; i < NAMES.length; i++) {
    const actual = bones[i], expected = CANONICAL_SKELETON[i];
    if (actual.name !== expected.name || actual.parent !== expected.parent) throw Error('Canonical hierarchy/order differs from motion2');
    finiteVector(actual.restTranslationMeters, 3, `${actual.name} canonical rest translation`);
  }
  return bones;
}
function frame(primary, secondary) {
  const y = primary.clone().normalize();
  if (primary.lengthSq() < 1e-12) throw Error('Cannot calibrate a zero-length bone');
  const z = secondary.clone().addScaledVector(y, -secondary.dot(y));
  if (z.lengthSq() < 1e-10) {
    const fallback = Math.abs(y.z) < .8 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    z.copy(fallback).addScaledVector(y, -fallback.dot(y));
  }
  z.normalize(); const x = y.clone().cross(z).normalize(); z.copy(x).cross(y).normalize();
  return { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize(),
    primary: y.toArray(), secondary: z.toArray(), planeNormal: x.toArray() };
}
function inverseBind(position) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -position[0], -position[1], -position[2], 1];
}
function limbSecondary(upper, lower, preferredNormal) {
  const plane = upper.clone().cross(lower);
  let fallback = false;
  if (plane.lengthSq() < 1e-10) {
    plane.copy(preferredNormal).addScaledVector(upper, -preferredNormal.dot(upper) / upper.lengthSq());
    fallback = true;
  }
  plane.normalize();
  if (plane.dot(preferredNormal) < 0) plane.negate();
  return { plane, fallback };
}

/** Build one role's calibration from untouched rig metadata, never posed bones. */
export function calibrateMotion2Profile(profile, { skeleton = CANONICAL_SKELETON, profileId = profile?.id } = {}) {
  const source = sourceBones(skeleton), sourceByName = Object.fromEntries(source.map(b => [b.name, b]));
  if (!profileId || !Array.isArray(profile?.joints) || profile.joints.length !== 18) throw Error('Supply a role id and its exact 18-joint rig profile');
  const byName = Object.fromEntries(profile.joints.map(j => [j.name, j]));
  const positions = {};
  for (const b of source) {
    const j = byName[b.name];
    if (!j || j.parent !== b.parent) throw Error(`${profileId}/${b.name}: target hierarchy mismatch`);
    finiteVector(j.translation, 3, `${profileId}/${b.name} bind translation`);
    const q = new THREE.Quaternion().fromArray(finiteVector(j.rotation || [0, 0, 0, 1], 4, `${b.name} bind rotation`));
    if (Math.abs(q.length() - 1) > 1e-7 || q.angleTo(identity()) > 1e-7) throw Error('This adapter requires the delivered pure-translation, identity-rotation bind');
    if (V(finiteVector(j.scale || [1, 1, 1], 3, `${b.name} bind scale`)).distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-8) throw Error('Delivered joint bind scales must be identity');
    positions[b.name] = V(j.translation).add(b.parent ? positions[b.parent] : new THREE.Vector3());
    if (j.worldPosition && positions[b.name].distanceTo(V(j.worldPosition)) > 1e-7) throw Error(`${profileId}/${b.name}: local/world bind positions disagree`);
  }
  const planes = {};
  for (const side of ['Left', 'Right']) {
    for (const [kind, a, b, c, normal] of [
      ['arm', `${side}Arm`, `${side}ForeArm`, `${side}Hand`, [-1, 0, 0]],
      ['leg', `${side}UpLeg`, `${side}Leg`, `${side}Foot`, [1, 0, 0]],
    ]) {
      const upper = positions[b].clone().sub(positions[a]), lower = positions[c].clone().sub(positions[b]);
      planes[side + kind] = limbSecondary(upper, lower, V(normal));
    }
  }
  const bones = [];
  for (const b of source) {
    let correction = identity(), targetFrame = null, canonicalFrame = null, policy;
    const child = CHILDREN[b.name];
    if (child) {
      const primary = positions[child].clone().sub(positions[b.name]);
      const canonicalPrimary = V(sourceByName[child].restTranslationMeters);
      let secondary = new THREE.Vector3(0, 0, 1), canonicalSecondary = secondary.clone();
      if (/Arm$/.test(b.name)) {
        const side = b.name.startsWith('Left') ? 'Left' : 'Right';
        secondary = planes[side + 'arm'].plane.clone().cross(primary).normalize();
        policy = 'measured arm bend-plane frame';
      } else if (/UpLeg$|(?<!Up)Leg$/.test(b.name)) {
        const side = b.name.startsWith('Left') ? 'Left' : 'Right';
        secondary = planes[side + 'leg'].plane.clone().cross(primary).normalize();
        canonicalSecondary = new THREE.Vector3(0, 0, -1);
        policy = 'measured knee bend-plane frame';
      } else policy = 'spine primary axis with projected canonical forward';
      targetFrame = frame(primary, secondary); canonicalFrame = frame(canonicalPrimary, canonicalSecondary);
      correction.copy(canonicalFrame.q).multiply(targetFrame.q.clone().invert()).normalize();
    } else if (b.name.endsWith('Hand')) {
      const palm = profile.palms?.[b.name];
      if (!palm?.palmarSurfaceVerified) throw Error(`${profileId}/${b.name}: measured palmar frame is required`);
      targetFrame = frame(V(finiteVector(palm.fingerDirection, 3, `${b.name} finger direction`)),
        V(finiteVector(palm.palmNormal, 3, `${b.name} palm normal`)));
      // motion2 defines its palm contact point as [0,-.08,.025]: fingers -Y,
      // palmar surface +Z. The measured target frame resolves terminal twist.
      canonicalFrame = frame(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
      correction.copy(canonicalFrame.q).multiply(targetFrame.q.clone().invert()).normalize();
      policy = 'measured palmar normal and finger direction; canonical fingers -Y, palm +Z';
    } else if (b.name.endsWith('Foot')) policy = 'world-flat target bind sole, forward +Z; no toe helper bone';
    else if (b.name === 'Head') policy = 'upright head bind, face forward +Z';
    else policy = 'identity root basis; simulation owns root translation';
    let directionResidualRadians = 0, frameResidualRadians = 0;
    if (targetFrame) directionResidualRadians = V(targetFrame.primary).applyQuaternion(correction).angleTo(V(canonicalFrame.primary));
    if (targetFrame) frameResidualRadians = Math.max(directionResidualRadians,
      V(targetFrame.secondary).applyQuaternion(correction).angleTo(V(canonicalFrame.secondary)));
    bones.push({
      name: b.name, source: b.name, target: b.name, parent: b.parent, calibrationChild: child || null, policy,
      sourceRestTranslationMeters: [...b.restTranslationMeters],
      targetBindTranslationMeters: [...byName[b.name].translation],
      targetBindWorldPositionMeters: positions[b.name].toArray(),
      targetBindLocalQuaternion: [0, 0, 0, 1], targetBindWorldQuaternion: [0, 0, 0, 1],
      targetBindLocalScale: [1, 1, 1],
      targetBasisWorldQuaternion: qArray(correction),
      targetInverseBindMatrix: clean(inverseBind(positions[b.name].toArray())),
      targetSegmentLengthMeters: child ? positions[b.name].distanceTo(positions[child]) : null,
      targetFrame: targetFrame ? { primary: targetFrame.primary, secondary: targetFrame.secondary, planeNormal: targetFrame.planeNormal } : null,
      canonicalFrame: canonicalFrame ? { primary: canonicalFrame.primary, secondary: canonicalFrame.secondary, planeNormal: canonicalFrame.planeNormal } : null,
      calibrationDirectionResidualRadians: directionResidualRadians,
      calibrationFrameResidualRadians: frameResidualRadians,
    });
  }
  const length = (side, points) => points[`${side}UpLeg`].distanceTo(points[`${side}Leg`]) + points[`${side}Leg`].distanceTo(points[`${side}Foot`]);
  const targetLegLengths = ['Left', 'Right'].map(side => length(side, positions));
  const sourceLegLengths = ['Left', 'Right'].map(side => V(sourceByName[`${side}Leg`].restTranslationMeters).length() + V(sourceByName[`${side}Foot`].restTranslationMeters).length());
  const motionScale = (targetLegLengths[0] + targetLegLengths[1]) / (sourceLegLengths[0] + sourceLegLengths[1]);
  return {
    id: profileId, boneCount: 18, bones, motionScale,
    scaleDerivation: { method: 'mean target hip-knee-ankle length / mean canonical hip-knee-ankle length',
      targetLegLengthsMeters: targetLegLengths, canonicalLegLengthsMeters: sourceLegLengths,
      appliesTo: ['hipsOffsetMeters', 'referenceRootTranslationMeters only when explicitly requested'],
      segmentTranslationsPreserved: true },
    measuredPalms: profile.palms,
    bendPlaneFallbacks: Object.fromEntries(Object.entries(planes).map(([name, p]) => [name, p.fallback])),
  };
}

function bindActor(root, calibration) {
  const bones = {}, meshes = [];
  root.traverse(o => { if (o.isBone) { if (bones[o.name]) throw Error(`Duplicate bone ${o.name}`); bones[o.name] = o; } if (o.isSkinnedMesh) meshes.push(o); });
  const actual = Object.keys(bones);
  if (actual.length !== 18 || actual.some(n => !NAMES.includes(n))) throw Error('Target actor must contain exactly the 18 canonical bone names');
  for (const b of calibration.bones) {
    const bone = bones[b.name], actualParent = bone.parent?.isBone ? bone.parent.name : null;
    if (actualParent !== b.parent) throw Error(`${b.name}: target Bone hierarchy differs from calibration`);
  }
  return { bones, meshes };
}

/** Create once per actor. Use independently of the preview's procedural controller. */
export function createCanonicalRetargeter(root, profile, options = {}) {
  const id = typeof profile === 'string' ? profile : options.profileId || profile?.id;
  const provided = options.map?.profiles?.[id] || (options.map?.bones ? options.map : null);
  const calibration = provided || calibrateMotion2Profile(profile, { profileId: id, skeleton: options.skeleton });
  if (calibration.boneCount !== 18 || calibration.bones.length !== 18 ||
      NAMES.some((n, i) => calibration.bones[i]?.name !== n || calibration.bones[i]?.parent !== CANONICAL_SKELETON[i].parent)) throw Error('Invalid retarget calibration');
  for (const b of calibration.bones) {
    finiteVector(b.targetBindTranslationMeters, 3, `${b.name} mapped bind translation`);
    const q = new THREE.Quaternion().fromArray(finiteVector(b.targetBasisWorldQuaternion, 4, `${b.name} mapped basis`));
    if (Math.abs(q.length() - 1) > 1e-7) throw Error(`${b.name}: non-unit mapped basis`);
  }
  const { bones, meshes } = bindActor(root, calibration);
  const bases = Object.fromEntries(calibration.bones.map(b => [b.name, new THREE.Quaternion().fromArray(b.targetBasisWorldQuaternion).normalize()]));
  const localBind = Object.fromEntries(calibration.bones.map(b => [b.name, V(b.targetBindTranslationMeters)]));
  function update() { root.updateWorldMatrix(true, true); for (const mesh of meshes) mesh.skeleton.update(); }
  function resetBind() {
    for (const name of NAMES) { bones[name].position.copy(localBind[name]); bones[name].quaternion.identity(); bones[name].scale.set(1, 1, 1); }
    update();
  }
  function apply(canonicalFrame, overrides = {}) {
    const rotations = canonicalFrame?.rotations;
    if (!rotations || Object.keys(rotations).length !== 18 || NAMES.some(n => !rotations[n])) throw Error('A complete 18-bone canonicalFrame.rotations is required');
    const hipsOffset = finiteVector(canonicalFrame.hipsOffsetMeters || [0, 0, 0], 3, 'hipsOffsetMeters');
    const hipsScale = overrides.hipsOffsetScale ?? options.hipsOffsetScale ?? calibration.motionScale;
    if (!Number.isFinite(hipsScale) || hipsScale <= 0) throw Error('hipsOffsetScale must be a positive finite scalar');
    let maximumInputQuaternionNormError = 0;
    const prepared = {};
    for (const b of calibration.bones) {
      const q = new THREE.Quaternion().fromArray(finiteVector(rotations[b.name], 4, `${b.name} canonical quaternion`));
      const norm = q.length(); if (norm < 1e-12) throw Error(`${b.name}: zero canonical quaternion`);
      maximumInputQuaternionNormError = Math.max(maximumInputQuaternionNormError, Math.abs(norm - 1)); prepared[b.name] = q.normalize();
    }
    const applyReferenceRoot = overrides.applyReferenceRootTranslation ?? options.applyReferenceRootTranslation ?? false;
    const referenceRoot = applyReferenceRoot ? V(finiteVector(canonicalFrame.referenceRootTranslationMeters || [0, 0, 0], 3, 'referenceRootTranslationMeters')) : null;
    // Validate the complete input before mutating any target bone.
    for (const b of calibration.bones) {
      const parentBasis = b.parent ? bases[b.parent] : identity();
      bones[b.name].quaternion.copy(parentBasis.clone().invert().multiply(prepared[b.name]).multiply(bases[b.name]).normalize());
      bones[b.name].position.copy(localBind[b.name]); bones[b.name].scale.set(1, 1, 1);
    }
    bones.Hips.position.addScaledVector(V(hipsOffset), hipsScale);
    if (referenceRoot) bones.Root.position.addScaledVector(referenceRoot, hipsScale);
    update();
    const postIK = overrides.afterRetargetIK ?? options.afterRetargetIK;
    const ikResult = typeof postIK === 'function' ? postIK(root, { canonicalFrame, calibration, bones, motionScale: hipsScale }) : null;
    if (postIK) update();
    return { profileId: calibration.id, boneCount: 18, motionScale: hipsScale, maximumInputQuaternionNormError,
      referenceRootTranslationApplied: applyReferenceRoot, postRetargetIKApplied: typeof postIK === 'function', ikResult,
      contactsGuaranteed: false };
  }
  return { apply, resetBind, calibration, bones };
}

const adapters = new WeakMap();
/** Convenience wrapper; cache is per actor and immutable profile/map identity. */
export function applyCanonicalPose(root, canonicalFrame, profile, options = {}) {
  let entry = adapters.get(root);
  if (!entry || entry.profile !== profile || entry.map !== options.map || entry.profileId !== options.profileId || entry.skeleton !== options.skeleton) {
    entry = { profile, map: options.map, profileId: options.profileId, skeleton: options.skeleton,
      adapter: createCanonicalRetargeter(root, profile, options) }; adapters.set(root, entry);
  }
  return entry.adapter.apply(canonicalFrame, options);
}

/** Offline authoring command: generate evidence/map from actual current rig.json. */
async function runCLI() {
  const fs = await import('node:fs/promises'), path = await import('node:path'), url = await import('node:url'), crypto = await import('node:crypto');
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  const sourcePath = path.resolve(root, '../../motion2/hoops.json');
  const bytes = await fs.readFile(sourcePath), source = JSON.parse(bytes), rig = JSON.parse(await fs.readFile(path.join(root, 'rig.json'), 'utf8'));
  const reference = sourceBones(source.skeleton);
  for (let i = 0; i < reference.length; i++) if (V(reference[i].restTranslationMeters).distanceTo(V(CANONICAL_SKELETON[i].restTranslationMeters)) > 1e-12) throw Error('Embedded canonical rest changed: update adapter constants before generation');
  const profiles = Object.fromEntries(Object.entries(rig.profiles).map(([id, p]) => [id, calibrateMotion2Profile({ id, ...p }, { skeleton: source.skeleton })]));
  const map = {
    schemaVersion: 1, source: 'workout/island/design/motion2/hoops.json#skeleton',
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    target: 'rig.json', targetRigSha256: crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'rig.json'))).digest('hex'),
    units: 'meters', axes: { up: '+Y', forward: '+Z', anatomicalLeft: '+X' },
    sourceBoneCount: 18, targetBoneCount: 18, sourceSkeleton: source.skeleton,
    rotationRule: {
      sourceWorld: 'S_world[i] = S_world[parent] * S_local[i]',
      targetWorld: 'T_world[i] = S_world[i] * B_i (in actor space)',
      targetLocal: 'T_local[i] = inverse(B_parent) * S_local[i] * B_i; B_rootParent = identity',
      BMeaning: 'Full measured target bind frame -> canonical rest frame. Target bind local/world quaternions are identity.',
      absoluteRotations: true, preserveTargetTranslations: true, preserveTargetScale: true,
      handConvention: 'canonical fingers -Y, palm normal +Z, contact guide point [0,-.08,.025]m; target palmar frame is measured from skin geometry',
      rootMotion: false,
      limitations: 'Per-role proportions differ. Imported rotations alone do not preserve ball contacts, foot plants or sole height. Apply ball/foot IK and vertex ground checks after retargeting and blending.',
    }, profiles,
  };
  if (process.argv.includes('--write-map')) await fs.writeFile(path.join(root, 'retarget-map.json'), JSON.stringify(map, null, 2) + '\n');
  const reports = [];
  for (const [id, calibration] of Object.entries(profiles)) {
    const actor = new THREE.Group(), wrapper = new THREE.Group(), targetBones = {};
    wrapper.add(actor);
    actor.position.set(.4, 0, -.6); actor.rotation.y = .37;
    for (const entry of calibration.bones) {
      const bone = new THREE.Bone(); bone.name = entry.name; bone.position.fromArray(entry.targetBindTranslationMeters); targetBones[entry.name] = bone;
      (entry.parent ? targetBones[entry.parent] : actor).add(bone);
    }
    const adapter = createCanonicalRetargeter(actor, id, { map });
    // Move a previously unupdated ancestor after creating the adapter. The
    // caller must not need a scene.updateMatrixWorld() before applying a pose.
    wrapper.position.set(-.2, .3, .5); wrapper.rotation.y = .22;
    const identityFrame = { rotations: Object.fromEntries(NAMES.map(n => [n, [0, 0, 0, 1]])), hipsOffsetMeters: [0, 0, 0] };
    adapter.apply(identityFrame); let identityDirectionError = 0, handFrameError = 0;
    const actorWorld = actor.getWorldQuaternion(identity()), inverseActor = actorWorld.clone().invert();
    for (const b of calibration.bones) {
      if (b.calibrationChild) {
        const a = targetBones[b.name].getWorldPosition(new THREE.Vector3()), c = targetBones[b.calibrationChild].getWorldPosition(new THREE.Vector3());
        identityDirectionError = Math.max(identityDirectionError, c.sub(a).normalize().applyQuaternion(inverseActor).angleTo(V(reference.find(v => v.name === b.calibrationChild).restTranslationMeters).normalize()));
      }
      if (b.name.endsWith('Hand')) {
        const q = inverseActor.clone().multiply(targetBones[b.name].getWorldQuaternion(new THREE.Quaternion()));
        handFrameError = Math.max(handFrameError, V(b.targetFrame.primary).applyQuaternion(q).angleTo(V(b.canonicalFrame.primary)),
          V(b.targetFrame.secondary).applyQuaternion(q).angleTo(V(b.canonicalFrame.secondary)));
      }
    }
    let samples = 0, maxNormError = 0, finite = true, maxWorldRuleError = 0;
    for (const state of Object.values(source.states)) for (const frame of state.keyframes) {
      adapter.apply(frame); samples++;
      const sourceWorld = {};
      for (const b of reference) {
        sourceWorld[b.name] = (b.parent ? sourceWorld[b.parent].clone() : identity()).multiply(new THREE.Quaternion().fromArray(frame.rotations[b.name]).normalize());
        const bone = targetBones[b.name], q = bone.getWorldQuaternion(new THREE.Quaternion());
        maxNormError = Math.max(maxNormError, Math.abs(bone.quaternion.length() - 1));
        finite &&= bone.position.toArray().concat(bone.quaternion.toArray()).every(Number.isFinite);
        const expected = actorWorld.clone().multiply(sourceWorld[b.name]).multiply(new THREE.Quaternion().fromArray(calibration.bones.find(e => e.name === b.name).targetBasisWorldQuaternion));
        maxWorldRuleError = Math.max(maxWorldRuleError, q.angleTo(expected));
      }
    }
    const bindFiles = [];
    for (const suffix of ['', '-lod1']) {
      // Inverse binds and node transforms are ordinary GLB accessors, even when
      // mesh primitives use Draco. Inspect actual delivered bytes directly.
      const filename = `models/${id}${suffix}.glb`, binary = await fs.readFile(path.join(root, filename));
      const jsonLength = binary.readUInt32LE(12), document = JSON.parse(binary.subarray(20, 20 + jsonLength));
      const binStart = 28 + jsonLength, skin = document.skins?.[0], parentIndices = {};
      for (const [index, node] of document.nodes.entries()) for (const child of node.children || []) parentIndices[child] = index;
      if (!skin || skin.joints.length !== 18) throw Error(`${filename}: expected exactly 18 actual skin joints`);
      const accessor = document.accessors[skin.inverseBindMatrices], view = document.bufferViews[accessor.bufferView];
      if (accessor.componentType !== 5126 || accessor.type !== 'MAT4' || accessor.count !== 18) throw Error(`${filename}: unexpected inverse-bind accessor`);
      if (view.extensions?.EXT_meshopt_compression || accessor.sparse || (view.buffer || 0) !== 0) throw Error(`${filename}: inverse binds must remain a plain, nonsparse GLB buffer view; only animation views may use Meshopt`);
      if (binary.readUInt32LE(24 + jsonLength) !== 0x004e4942) throw Error(`${filename}: expected ordinary BIN chunk after JSON`);
      let maximumTranslationErrorMeters = 0, maximumRotationErrorRadians = 0, maximumScaleError = 0, maximumInverseBindElementError = 0;
      const jointNames = skin.joints.map(index => document.nodes[index].name);
      for (const [jointIndex, nodeIndex] of skin.joints.entries()) {
        const node = document.nodes[nodeIndex], expected = calibration.bones.find(b => b.name === node.name);
        if (!expected) throw Error(`${filename}: unmapped actual joint ${node.name}`);
        if (node.matrix) throw Error(`${filename}/${node.name}: matrix bind requires a different adapter`);
        const parentName = document.nodes[parentIndices[nodeIndex]]?.name;
        if ((jointNames.includes(parentName) ? parentName : null) !== expected.parent) throw Error(`${filename}/${node.name}: actual parent mismatch`);
        maximumTranslationErrorMeters = Math.max(maximumTranslationErrorMeters, V(node.translation || [0, 0, 0]).distanceTo(V(expected.targetBindTranslationMeters)));
        maximumRotationErrorRadians = Math.max(maximumRotationErrorRadians, new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]).angleTo(identity()));
        maximumScaleError = Math.max(maximumScaleError, V(node.scale || [1, 1, 1]).distanceTo(new THREE.Vector3(1, 1, 1)));
        const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0) + jointIndex * (view.byteStride || 64);
        for (let k = 0; k < 16; k++) maximumInverseBindElementError = Math.max(maximumInverseBindElementError, Math.abs(binary.readFloatLE(offset + k * 4) - expected.targetInverseBindMatrix[k]));
      }
      bindFiles.push({ file: filename, actualJointNames: jointNames, maximumTranslationErrorMeters, maximumRotationErrorRadians, maximumScaleError, maximumInverseBindElementError,
        pass: new Set(jointNames).size === 18 && maximumTranslationErrorMeters < 2e-6 && maximumRotationErrorRadians < 1e-7 && maximumScaleError < 1e-8 && maximumInverseBindElementError < 2e-6 });
    }
    const pass = finite && identityDirectionError < 1e-6 && handFrameError < 1e-6 && maxNormError < 1e-10 && maxWorldRuleError < 1e-6 && bindFiles.every(b => b.pass);
    reports.push({ id, boneCount: Object.keys(targetBones).length, extraBones: [], samples, finite, identityDirectionErrorRadians: identityDirectionError,
      identityPalmarFrameErrorRadians: handFrameError, maximumLocalQuaternionNormError: maxNormError, maximumWorldRuleErrorRadians: maxWorldRuleError,
      motionScale: calibration.motionScale, actorYawRadians: .37, externallyMovedAncestorYawRadians: .22,
      actualDeliveredBinds: bindFiles, contactAndFloorIKValidated: false, pass });
  }
  const result = { generatedAtUtc: new Date().toISOString(), scope: 'Exact per-role bind calibration, complete identity pose, and every supplied motion2 hoops keyframe; algebraic/FK validation, not skin collision or ball-contact validation.',
    sourceSha256: map.sourceSha256, targetRigSha256: map.targetRigSha256, profiles: reports, pass: reports.every(p => p.pass) };
  if (process.argv.includes('--validate')) await fs.writeFile(path.join(root, 'verification/retarget-motion2.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1;
}

if (typeof process !== 'undefined' && process.versions?.node && process.argv?.[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) await runCLI();
}
