/**
 * Canonical preview athlete, derived from the repository's fictional PG avatar.
 * This is a bind-space conversion, not a runtime retargeting layer: after this
 * bake the 18 joint TRS values and inverse binds are the exact motion2 contract.
 * Tool dependencies live outside the repository, in HOOPS_TOOLS_DIR (see README).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../../../..');
const toolsRoot = process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-motion-v8-tools';
const require = createRequire(path.join(toolsRoot, 'package.json'));
const { NodeIO, Accessor } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup, draco, weld } = require('@gltf-transform/functions');
const THREE = require('three');
const dm = require('draco3dgltf');
const sharp = require('sharp');

export async function createIO() {
  const { MeshoptDecoder } = require('meshoptimizer');
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await dm.createEncoderModule(),
    'draco3d.decoder': await dm.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
}

export async function canonicalSkeleton() {
  const motion2 = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'workout/island/design/motion2/hoops.json'), 'utf8'));
  return motion2.skeleton;
}

const plainMaterials = new Set(['team_primary', 'team_secondary', 'team_trim', 'compression']);
const V = a => new THREE.Vector3().fromArray(a);
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');

/** Remap existing skinned vertices once into the canonical, arms-down rest. */
export async function buildPreviewModel({ write = true, highQualityGarments = true } = {}) {
  const input = path.join(REPO_ROOT, 'workout/island/design/hoops-v7/characters/models/pg-lod1.glb');
  const rigPath = path.join(REPO_ROOT, 'workout/island/design/hoops-v7/characters/retarget-map.json');
  const [inputBytes, rigBytes, skeleton] = await Promise.all([fs.readFile(input), fs.readFile(rigPath), canonicalSkeleton()]);
  const map = JSON.parse(rigBytes).profiles.pg;
  const io = await createIO(), document = await io.readBinary(inputBytes), root = document.getRoot();
  let garmentSourceSha256 = null;
  if (highQualityGarments) {
    const garmentBytes = await fs.readFile(input.replace('pg-lod1.glb', 'pg.glb'));
    garmentSourceSha256 = fingerprint(garmentBytes);
    const full = await io.readBinary(garmentBytes);
    const byMaterial = Object.fromEntries(full.getRoot().listMeshes()[0].listPrimitives().map(p => [p.getMaterial().getName(), p]));
    for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) if (plainMaterials.has(primitive.getMaterial().getName())) {
      const source = byMaterial[primitive.getMaterial().getName()];
      function copy(accessor) {
        const array = accessor.getArray();
        return document.createAccessor().setBuffer(root.listBuffers()[0]).setType(accessor.getType())
          .setNormalized(accessor.getNormalized()).setArray(new array.constructor(array));
      }
      for (const semantic of primitive.listSemantics()) primitive.setAttribute(semantic, null);
      for (const semantic of source.listSemantics()) primitive.setAttribute(semantic, copy(source.getAttribute(semantic)));
      primitive.setIndices(copy(source.getIndices()));
    }
  }
  const skin = root.listSkins()[0], joints = skin.listJoints();
  if (joints.length !== 18 || joints.some((j, i) => j.getName() !== skeleton.bones[i].name)) throw Error('Source PG has an unexpected joint contract');
  const canonicalWorld = {}, oldByName = Object.fromEntries(map.bones.map(b => [b.name, b]));
  for (const bone of skeleton.bones) canonicalWorld[bone.name] = V(bone.restTranslationMeters).add(bone.parent ? canonicalWorld[bone.parent] : V([0, 0, 0]));

  const transforms = [], normalTransforms = [];
  for (const bone of skeleton.bones) {
    const old = oldByName[bone.name], q = new THREE.Quaternion().fromArray(old.targetBasisWorldQuaternion);
    let scale = new THREE.Vector3(.86, .88, .88);
    // Preserve facial/hand geometry and leave the foot flat. Long limb segments
    // receive the measured length conversion, while the torso stays anatomical.
    if (/Arm$/.test(bone.name)) {
      const child = bone.name.endsWith('ForeArm') ? bone.name.replace('ForeArm', 'Hand') : bone.name.replace('Arm', 'ForeArm');
      const targetLength = V(skeleton.bones.find(b => b.name === child).restTranslationMeters).length();
      scale.set(.86, targetLength / old.targetSegmentLengthMeters, .86);
    } else if (/UpLeg$|(?<!Up)Leg$/.test(bone.name)) {
      const child = bone.name.endsWith('UpLeg') ? bone.name.replace('UpLeg', 'Leg') : bone.name.replace('Leg', 'Foot');
      const targetLength = V(skeleton.bones.find(b => b.name === child).restTranslationMeters).length();
      scale.set(.86, targetLength / old.targetSegmentLengthMeters, .86);
    } else if (bone.name.endsWith('Hand')) scale.setScalar(.90);
    else if (bone.name.endsWith('Foot')) scale.setScalar(.08 / old.targetBindWorldPositionMeters[1]);
    else if (bone.name === 'Head') scale.setScalar(.86);
    else if (bone.name === 'Chest') scale.set(.82, .82, .88);
    else if (bone.name === 'Root') scale.setScalar(.88);
    const m = new THREE.Matrix4().makeTranslation(...canonicalWorld[bone.name].toArray())
      .multiply(new THREE.Matrix4().makeScale(...scale.toArray()))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(...old.targetBindWorldPositionMeters.map(x => -x)));
    transforms.push(m); normalTransforms.push(new THREE.Matrix3().getNormalMatrix(m));
  }

  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL');
    const joint = primitive.getAttribute('JOINTS_0'), weight = primitive.getAttribute('WEIGHTS_0');
    const outPosition = new Float32Array(position.getCount() * 3), outNormal = new Float32Array(position.getCount() * 3);
    for (let i = 0; i < position.getCount(); i++) {
      const p = V(position.getElement(i, [])), n = V(normal.getElement(i, []));
      const indices = joint.getElement(i, []), weights = weight.getElement(i, []), a = V([0, 0, 0]), b = V([0, 0, 0]);
      // Shorts follow the pelvis. The inherited waist borrowed abdomen weights;
      // those become a visible serrated overlap when canonical Hips→Spine is
      // longer than the donor's. Fold those torso influences into Hips here.
      if (highQualityGarments && primitive.getMaterial().getName() === 'team_secondary' && p.y < oldByName.Hips.targetBindWorldPositionMeters[1] + .20) {
        for (let k = 0; k < 4; k++) if (['Spine', 'Chest'].includes(skeleton.bones[indices[k]].name)) indices[k] = 1;
        const merged = new Map();
        indices.forEach((j, k) => merged.set(j, (merged.get(j) || 0) + weights[k]));
        const sorted = [...merged].sort((a, b) => b[1] - a[1]);
        for (let k = 0; k < 4; k++) { indices[k] = sorted[k]?.[0] || 0; weights[k] = sorted[k]?.[1] || 0; }
        joint.setElement(i, indices); weight.setElement(i, weights);
      }
      // The inherited shoe sole was partly weighted to the shin, which makes it
      // sink during knee flexion. Shoes below the ankle are a rigid foot shell;
      // fade back into the original calf weighting above the shoe collar.
      const side = p.x > 0 ? 'Left' : 'Right', foot = side + 'Foot', leg = side + 'Leg';
      const legWeight = indices.reduce((s, j, k) => s + ([foot, leg].includes(skeleton.bones[j].name) ? weights[k] : 0), 0);
      const ankleHeight = oldByName[foot].targetBindWorldPositionMeters[1];
      if (legWeight > .95 && p.y < ankleHeight + .12) {
        const rigid = Math.max(0, Math.min(1, (ankleHeight + .12 - p.y) / .06));
        const merged = new Map();
        indices.forEach((j, k) => merged.set(j, (merged.get(j) || 0) + weights[k] * (1 - rigid)));
        const footIndex = skeleton.bones.findIndex(b => b.name === foot);
        merged.set(footIndex, (merged.get(footIndex) || 0) + rigid);
        const sorted = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);
        for (let k = 0; k < 4; k++) { indices[k] = sorted[k]?.[0] || 0; weights[k] = sorted[k]?.[1] || 0; }
        joint.setElement(i, indices); weight.setElement(i, weights);
      }
      for (let k = 0; k < 4; k++) if (weights[k] > 0) {
        a.addScaledVector(p.clone().applyMatrix4(transforms[indices[k]]), weights[k]);
        b.addScaledVector(n.clone().applyMatrix3(normalTransforms[indices[k]]), weights[k]);
      }
      a.toArray(outPosition, i * 3); b.normalize().toArray(outNormal, i * 3);
    }
    position.setArray(outPosition); normal.setArray(outNormal);
    for (const target of primitive.listTargets()) primitive.removeTarget(target);
    primitive.setAttribute('TANGENT', null);
  }
  if (highQualityGarments) fitShoulderCloth(root);

  // All cloth gets a plain material. Atlas islands with the old jersey number
  // cannot enter the output through a normal, emissive or colour texture.
  for (const material of root.listMaterials()) {
    material.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    if (plainMaterials.has(material.getName())) {
      material.setBaseColorTexture(null).setMetallicRoughnessTexture(null);
      material.setRoughnessFactor(.88).setMetallicFactor(0);
    }
  }
  for (const texture of root.listTextures()) if (texture.getName() === 'pg-atlas') {
    const { width, height } = await sharp(texture.getImage()).metadata();
    const top = Math.round(height * .75);
    const blank = await sharp({ create: { width, height: height - top, channels: 4, background: '#808080' } }).png().toBuffer();
    texture.setImage(await sharp(texture.getImage()).composite([{ input: blank, top, left: 0 }]).webp({ quality: 90 }).toBuffer());
  }

  for (let i = 0; i < joints.length; i++) {
    joints[i].setTranslation(skeleton.bones[i].restTranslationMeters).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  const inverse = new Float32Array(18 * 16);
  skeleton.bones.forEach((b, i) => new THREE.Matrix4().makeTranslation(...canonicalWorld[b.name].toArray().map(x => -x)).toArray(inverse, i * 16));
  skin.setInverseBindMatrices(document.createAccessor('canonical18-inverse-bind').setType(Accessor.Type.MAT4).setArray(inverse).setBuffer(root.listBuffers()[0]));
  skin.setName('Canonical18');
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
  for (const node of root.listNodes()) if (node.getName() === 'MotionBallAnchor') node.dispose();
  for (const mesh of root.listMeshes()) mesh.setWeights([]);
  for (const node of root.listNodes()) if (node.getMesh()) node.setWeights([]).setName('PreviewAthlete');
  for (const extension of [...root.listExtensionsUsed()]) if (extension.extensionName !== 'EXT_texture_webp') extension.dispose();
  root.setExtras({
    purpose: 'Fictional plain-uniform preview athlete, canonical18 bind-space bake',
    source: 'hoops-v7/characters/models/pg-lod1.glb', sourceSha256: fingerprint(inputBytes),
    garmentLOD: highQualityGarments ? 'existing pg.glb full garment topology' : 'existing pg-lod1.glb garment topology',
    garmentSourceSha256,
    retargetMapSha256: fingerprint(rigBytes), front: '+Z', handAnatomicalPalmSurfaceLocalMeters: [0, -.035, .029],
    handFingerPadGuideLocalMeters: [0, -.08, .025], ballRadiusMeters: .12,
  });
  addBall(document);
  await document.transform(weld(), dedup(), prune({ keepAttributes: true }), draco({ method: 'edgebreaker', encodeSpeed: 4, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 16 }));
  const bytes = await io.writeBinary(document);
  if (write) await fs.writeFile(path.join(PACKAGE_ROOT, 'source/preview-model.glb'), bytes);
  return { document, bytes, io };
}

/** Reuse the human shoulder surface and weights for the garment's arm holes. */
function fitShoulderCloth(root) {
  const primitives = root.listMeshes().flatMap(m => m.listPrimitives());
  const surfaces = [];
  for (const p of primitives.filter(p => p.getMaterial().getName() === 'human_surface')) {
    const position = p.getAttribute('POSITION'), index = p.getIndices().getArray();
    for (let i = 0; i < index.length; i += 3) {
      const ids = [index[i], index[i + 1], index[i + 2]], points = ids.map(id => V(position.getElement(id, [])));
      if (points.some(p => p.y < 1.14)) continue;
      surfaces.push({ primitive: p, ids, triangle: new THREE.Triangle(...points) });
    }
  }
  const nearest = new THREE.Vector3(), bary = new THREE.Vector3();
  for (const p of primitives.filter(p => p.getMaterial().getName() === 'team_primary')) {
    const pos = p.getAttribute('POSITION'), normal = p.getAttribute('NORMAL'), joints = p.getAttribute('JOINTS_0'), weights = p.getAttribute('WEIGHTS_0');
    for (let i = 0; i < pos.getCount(); i++) {
      const point = V(pos.getElement(i, []));
      if (point.y < 1.265 || Math.abs(point.x) < .105) continue;
      let best = null, distance = .08 * .08, closest;
      for (const surface of surfaces) {
        surface.triangle.closestPointToPoint(point, nearest);
        const d = nearest.distanceToSquared(point);
        if (d < distance) { distance = d; best = surface; closest = nearest.clone(); }
      }
      if (!best) continue;
      best.triangle.getBarycoord(closest, bary);
      const ns = best.primitive.getAttribute('NORMAL'), js = best.primitive.getAttribute('JOINTS_0'), ws = best.primitive.getAttribute('WEIGHTS_0');
      const n = new THREE.Vector3(), influences = new Map();
      best.ids.forEach((id, k) => {
        const fraction = bary.getComponent(k);
        n.addScaledVector(V(ns.getElement(id, [])), fraction);
        const ids = js.getElement(id, []), values = ws.getElement(id, []);
        ids.forEach((joint, slot) => influences.set(joint, (influences.get(joint) || 0) + values[slot] * fraction));
      });
      n.normalize(); closest.addScaledVector(n, .005);
      pos.setElement(i, closest.toArray()); normal.setElement(i, n.toArray());
      const chosen = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4), total = chosen.reduce((s, p) => s + p[1], 0);
      joints.setElement(i, [0, 1, 2, 3].map(k => chosen[k]?.[0] || 0));
      weights.setElement(i, [0, 1, 2, 3].map(k => (chosen[k]?.[1] || 0) / total));
    }
  }
}

/** An independent, textured-by-geometry basketball, with three black seams. */
function addBall(document) {
  const buffer = document.getRoot().listBuffers()[0];
  const mesh = document.createMesh('Basketball');
  const orange = document.createMaterial('ball-orange').setBaseColorFactor([.94, .23, .035, 1]).setRoughnessFactor(.9);
  const black = document.createMaterial('ball-seams').setBaseColorFactor([.018, .012, .008, 1]).setRoughnessFactor(1);
  function geometry(geometry, material) {
    const p = document.createPrimitive().setMaterial(material);
    for (const [name, attr] of [['POSITION', geometry.getAttribute('position')], ['NORMAL', geometry.getAttribute('normal')]]) {
      p.setAttribute(name, document.createAccessor().setBuffer(buffer).setType(Accessor.Type.VEC3).setArray(new Float32Array(attr.array)));
    }
    p.setIndices(document.createAccessor().setBuffer(buffer).setType(Accessor.Type.SCALAR).setArray(new Uint16Array(geometry.index.array)));
    mesh.addPrimitive(p);
  }
  geometry(new THREE.SphereGeometry(.12, 24, 16), orange);
  for (const axis of [0, 1, 2]) {
    const seam = new THREE.TorusGeometry(.1195, .0017, 4, 64);
    if (axis === 1) seam.rotateX(Math.PI / 2);
    if (axis === 2) seam.rotateY(Math.PI / 2);
    geometry(seam, black);
  }
  document.getRoot().listScenes()[0].addChild(document.createNode('Ball').setMesh(mesh).setTranslation([-.4, 1, .45]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bytes } = await buildPreviewModel();
  console.log(`Canonical preview model: ${bytes.byteLength} bytes`);
}
