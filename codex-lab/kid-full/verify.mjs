/** Numerical validation of the lab, without launching a competing renderer. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './vendor/three.module.js';
import { deformedVertex, deformedNormal } from './deformed-geometry.mjs';
import { buildCharacter, applyPose, applyBlend, animationClips, countModel } from './rig.mjs';

const expressions = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'];
const root = dirname(fileURLToPath(import.meta.url));
const runFile = promisify(execFile);
const failures = [];
const report = {
  recordedAt: new Date().toISOString(),
  method: 'All deformed vertices and shoe triangles, in world space; no renderer or physical-phone claim.',
  limits: { weightSumError: 2e-6, standingHeadRatio: [2.5, 2.7], groundPenetration: .01, kickContactSurfaceGap: .025, clipLoopDelta: 2e-6, mobileModelTriangles: 20000, minimumMobileFPS: 40, maximumP95FrameMs: 50, maximumTrialFPSRatio: 1.15 },
  qualities: {}, originals: [],
};
const check = (condition, message) => { if (!condition) failures.push(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { return await readFile(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

// canvasNumber only draws a jersey decal. Numeric geometry verification does
// not inspect its pixels; the browser capture separately verifies the decal.
globalThis.document ??= { createElement(tag) {
  assert.equal(tag, 'canvas');
  return { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return { fillText() {} }; } };
} };

// Known coordinates independently check the shared CPU shader-stage helper.
// Otherwise source/loaded agreement alone could hide the same helper mistake.
function verifyDeformationHelper() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([1, 2, 3], 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute([1, 0, 0], 3));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new T.Float32BufferAttribute([.25, -.5, .75], 3)];
  geometry.morphAttributes.normal = [new T.Float32BufferAttribute([0, 1, 0], 3)];
  const mesh = new T.Mesh(geometry); mesh.morphTargetInfluences[0] = .4;
  mesh.scale.set(2, 3, 1); mesh.position.set(4, -2, 1); mesh.updateMatrixWorld(true);
  const positionDelta = deformedVertex(mesh, 0).distanceTo(new T.Vector3(6.2, 3.4, 4.3));
  const normalDelta = deformedNormal(mesh, 0).distanceTo(new T.Vector3(.5, .4 / 3, 0).normalize());
  check(positionDelta <= 1e-12 && normalDelta <= 1e-12, 'CPU deformation helper does not apply relative morph then nonuniform world position/normal transforms');
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute([1, 0, 0, 0], 4));
  const skinMesh = new T.SkinnedMesh(geometry), bone = new T.Bone(), skeleton = new T.Skeleton([bone]);
  skinMesh.add(bone); skinMesh.bind(skeleton); skinMesh.morphTargetInfluences[0] = .5;
  bone.rotation.z = Math.PI / 2; skinMesh.updateMatrixWorld(true); skeleton.update();
  const skinNormalDelta = deformedNormal(skinMesh, 0).distanceTo(new T.Vector3(-1, 2, 0).normalize());
  check(skinNormalDelta <= 1e-6, 'CPU deformation helper does not apply morph normal before bone rotation');
  geometry.dispose(); mesh.material.dispose(); skinMesh.material.dispose(); skeleton.dispose();
  return { positionDelta, normalDelta, skinNormalDelta };
}
report.deformationHelper = verifyDeformationHelper();

function skinnedMeshes(model) {
  const result = [];
  model.root.traverse(mesh => { if (mesh.isSkinnedMesh) result.push(mesh); });
  return result;
}
function deformedBounds(model) {
  model.root.updateMatrixWorld(true); model.skeleton.update();
  const bounds = new T.Box3(), headBounds = new T.Box3();
  const p = new T.Vector3(), headIndex = model.bones.indexOf(model.byName.Head);
  let vertices = 0;
  const surfaces=[];model.root.traverse(m=>{if(m.isSkinnedMesh||m.userData.rigidBone)surfaces.push(m);});
  for (const mesh of surfaces) {
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      deformedVertex(mesh, i, p);
      check(Number.isFinite(p.x + p.y + p.z), `Nonfinite deformed vertex ${mesh.name}:${i}`);
      bounds.expandByPoint(p); vertices++;
      let headWeight = mesh.userData.rigidBone==='Head'?1:0;
      if(mesh.isSkinnedMesh)for (let slot=0;slot<4;slot++)if(skinIndex.array[i*4+slot]===headIndex)headWeight+=skinWeight.array[i*4+slot];
      if(headWeight>.99999)headBounds.expandByPoint(p);
    }
  }
  const height = bounds.max.y - bounds.min.y, headHeight = headBounds.max.y - headBounds.min.y;
  return { vertices, minimumY: bounds.min.y, maximumY: bounds.max.y, height, headHeight, heightInHeads: height / headHeight };
}
function validateSkin(model) {
  let vertices = 0, mixedVertices = 0, maximumWeightSumError = 0, zeroNormals = 0, maximumVertexColor = 0;
  const usedBones = new Set(), expected = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'];
  for (const side of ['L', 'R']) {
    expected.push(...['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toe'].map(name => `${name}_${side}`));
    expected.push(...Array.from({ length: 5 }, (_, i) => `Finger${i}_${side}`));
  }
  check(model.bones.length === expected.length, `Bone count ${model.bones.length}, expected ${expected.length}`);
  for (const name of expected) check(model.byName[name]?.isBone, `Missing bone ${name}`);
  const surfaces = [];
  model.root.traverse(mesh => { if (mesh.isSkinnedMesh || (mesh.isMesh && mesh.userData.rigidBone)) surfaces.push(mesh); });
  for (const mesh of surfaces) {
    const { position, normal, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (mesh.geometry.attributes.color) for (const value of mesh.geometry.attributes.color.array) {
      maximumVertexColor = Math.max(maximumVertexColor, value);
      check(Number.isFinite(value) && value >= 0 && value <= 1, 'Source baked vertex color outside glTF COLOR_0 range [0,1]');
    }
    if (mesh.isSkinnedMesh) {
      check(position.count === skinIndex.count && position.count === skinWeight.count, `${mesh.name}: skin attribute count differs`);
      check(skinIndex.itemSize === 4 && skinWeight.itemSize === 4, `${mesh.name}: must have four skin influence slots`);
    } else if (position.count > 0) usedBones.add(mesh.userData.rigidBone);
    const morphPositions = mesh.geometry.morphAttributes.position || [], morphNormals = mesh.geometry.morphAttributes.normal || [];
    if (morphPositions.length) {
      check(Object.keys(mesh.morphTargetDictionary || {}).join(',') === expressions.join(','), `${mesh.name}: expression morph names/order differ`);
      check(morphPositions.length === 6 && morphNormals.length === 6, `${mesh.name}: six POSITION and NORMAL morph targets are required`);
      for (const [j, attribute] of [...morphPositions, ...morphNormals].entries()) {
        check(attribute.count === position.count && attribute.itemSize === 3, `${mesh.name}: morph attribute ${j} topology differs`);
        check(attribute.array.every(Number.isFinite), `${mesh.name}: morph attribute ${j} contains nonfinite values`);
      }
    }
    const indices = mesh.geometry.index?.array;
    if (indices) for (const index of indices) check(Number.isInteger(index) && index >= 0 && index < position.count, `${mesh.name}: out of range triangle index`);
    for (let i = 0; i < position.count; i++) {
      for (let c = 0; c < 3; c++) check(Number.isFinite(position.array[i * 3 + c]), `${mesh.name}: nonfinite source position`);
      if (normal) {
        const length = Math.hypot(...normal.array.subarray(i * 3, i * 3 + 3));
        check(Number.isFinite(length) && length <= 1.2, `${mesh.name}: nonfinite or excessive normal length at ${i}: ${length}`);
        zeroNormals += Number(length < 1e-8);
      }
      vertices++;
      if (!mesh.isSkinnedMesh) continue;
      let sum = 0, positive = 0;
      for (let slot = 0; slot < 4; slot++) {
        const index = skinIndex.array[i * 4 + slot], weight = skinWeight.array[i * 4 + slot];
        check(Number.isInteger(index) && index >= 0 && index < model.bones.length, `${mesh.name}: invalid joint index`);
        check(Number.isFinite(weight) && weight >= 0 && weight <= 1, `${mesh.name}: invalid weight`);
        sum += weight;
        if (weight > 1e-6) { positive++; usedBones.add(model.bones[index].name); }
      }
      maximumWeightSumError = Math.max(maximumWeightSumError, Math.abs(sum - 1));
      mixedVertices += Number(positive > 1);
    }
  }
  check(maximumWeightSumError <= report.limits.weightSumError, `Skin weight sum error ${maximumWeightSumError}`);
  for (const name of expected.filter(n => !n.startsWith('Shoulder') && !n.startsWith('Toe'))) check(usedBones.has(name), `No skin vertex influenced by ${name}`);
  check(mixedVertices > 0, 'All vertices have rigid single-bone weighting');
  return { vertices, mixedVertices, maximumWeightSumError, zeroNormals, maximumVertexColor, normalLimitation: 'Collapsed original loft poles can have zero normals; recorded separately. Final baked materials do not use normals for lighting.', usedBones: [...usedBones].sort() };
}
function kickContact(model) {
  applyPose(model, 'kick');
  const center = model.ball.getWorldPosition(new T.Vector3());
  model.ball.geometry.computeBoundingSphere();
  const radius = model.ball.geometry.boundingSphere.radius * model.ball.getWorldScale(new T.Vector3()).x;
  const footIndex = model.bones.indexOf(model.byName.Foot_R);
  let minimum = Infinity, checkedTriangles = 0;
  const triangle = new T.Triangle(), closest = new T.Vector3();
  const contactSurfaces=skinnedMeshes(model);
  model.root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.rigidBone==='Foot_R')contactSurfaces.push(mesh);});
  for (const mesh of contactSurfaces) {
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const index = mesh.geometry.index;
    const count = index?.count ?? position.count;
    const footWeight = i => {
      if(mesh.userData.rigidBone==='Foot_R')return 1;
      let total = 0;
      for (let slot = 0; slot < 4; slot++) if (skinIndex.array[i * 4 + slot] === footIndex) total += skinWeight.array[i * 4 + slot];
      return total;
    };
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(s => index ? index.getX(i + s) : i + s);
      if (!ids.every(id => footWeight(id) > .99999)) continue;
      for (const [slot, point] of [triangle.a, triangle.b, triangle.c].entries()) {
        point.fromBufferAttribute(position, ids[slot]); if(mesh.isSkinnedMesh)mesh.applyBoneTransform(ids[slot], point); point.applyMatrix4(mesh.matrixWorld);
      }
      if (triangle.getArea() <= 1e-20) continue;
      triangle.closestPointToPoint(center, closest);
      minimum = Math.min(minimum, closest.distanceTo(center)); checkedTriangles++;
    }
  }
  const surfaceGap = minimum - radius;
  check(checkedTriangles > 0, 'No right shoe triangles found for kick contact');
  check(Math.abs(surfaceGap) <= report.limits.kickContactSurfaceGap, `Kick ball/shoe surface gap ${surfaceGap}; require near contact without deep penetration`);
  return { ballCenter: center.toArray(), ballRadius: radius, checkedTriangles, minimumCenterToShoeSurface: minimum, surfaceGap, limitation: 'Unsigned point-to-triangle distance tests contact; this is not complete mesh collision detection.' };
}
function validateClips(model) {
  const clips = animationClips(model), result = [];
  check(clips.map(c => c.name).join(',') === 'stand,run,kick', 'Unexpected animation names');
  for (const clip of clips) {
    const meshes = []; model.root.traverse(mesh => { if (mesh.morphTargetInfluences?.length) meshes.push(mesh); });
    const morphTracks = clip.tracks.filter(track => track.name.endsWith('.morphTargetInfluences'));
    check(morphTracks.length === meshes.length && morphTracks.every(track => track.getValueSize() === 6), `${clip.name}: all facial meshes need six animated weights`);
    for (const mesh of meshes) {
      const track = morphTracks.find(t => t.name === mesh.name + '.morphTargetInfluences');
      check(!!track, `${clip.name}: facial weight track missing for ${mesh.name}`);
      if (!track) continue;
      if (clip.name === 'run' || clip.name === 'kick') {
        const expected = clip.name === 'run' ? 'effort' : 'victory', index = mesh.morphTargetDictionary[expected];
        const peak = Math.max(...Array.from({ length: track.times.length }, (_, i) => track.values[i * 6 + index]));
        check(peak >= .99, `${clip.name}: ${expected} does not reach its intended weight`);
      } else check(track.values.every(v => v === 0), 'Stand clip should retain the existing quiet neutral expression');
    }
    let maximumLoopDelta = 0;
    for (const track of clip.tracks) {
      check(track.validate(), `${clip.name}: invalid track ${track.name}`);
      const stride = track.getValueSize(), values = track.values;
      let delta;
      if (stride === 4 && track.ValueTypeName === 'quaternion') {
        const a = new T.Quaternion().fromArray(values, 0), b = new T.Quaternion().fromArray(values, values.length - 4);
        delta = Math.min(Math.hypot(...a.toArray().map((v, i) => v - b.toArray()[i])), Math.hypot(...a.toArray().map((v, i) => v + b.toArray()[i])));
      } else delta = Math.max(...Array.from({ length: stride }, (_, i) => Math.abs(values[i] - values[values.length - stride + i])));
      maximumLoopDelta = Math.max(maximumLoopDelta, delta);
    }
    check(maximumLoopDelta <= report.limits.clipLoopDelta, `${clip.name}: loop endpoint discontinuity ${maximumLoopDelta}`);
    const mixer = new T.AnimationMixer(model.root), action = mixer.clipAction(clip);
    action.reset().setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const samples = [];
    // Half-frame samples also test interpolation between the 60 Hz keys.
    for (let i = 0; i <= 120; i++) {
      mixer.setTime(clip.duration * i / 120);
      const bounds = deformedBounds(model);
      samples.push({ time: clip.duration * i / 120, minimumY: bounds.minimumY });
      check(bounds.minimumY >= -report.limits.groundPenetration, `${clip.name} clip at ${clip.duration * i / 120}s penetrates ground: ${bounds.minimumY}`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(model.root);
    result.push({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length, morphTracks: morphTracks.length, maximumLoopDelta, groundSamples: samples });
  }
  applyPose(model, 'stand'); return result;
}
function validateExpressions(model) {
  check(typeof model.setExpression === 'function' && typeof model.setExpressionBlend === 'function', 'Character expression API is missing');
  if (typeof model.setExpression !== 'function' || typeof model.setExpressionBlend !== 'function') return { failed: 'missing API' };
  const meshes = []; model.root.traverse(mesh => { if (mesh.geometry?.morphAttributes.position?.length) meshes.push(mesh); });
  check(meshes.length > 0, 'Character contains no facial morph meshes');
  const topology = meshes.map(mesh => ({ geometry: mesh.geometry, position: mesh.geometry.attributes.position.array, normal: mesh.geometry.attributes.normal.array, morphPositions: mesh.geometry.morphAttributes.position.map(a => a.array), morphNormals: mesh.geometry.morphAttributes.normal.map(a => a.array) }));
  for (const mesh of meshes) check(mesh.geometry.morphTargetsRelative === true, `${mesh.name}: facial morph targets must remain relative`);
  const values = () => {
    model.root.updateMatrixWorld(true); model.skeleton.update();
    const positions = [], normals = [];
    for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      positions.push(...deformedVertex(mesh, i).toArray()); normals.push(...deformedNormal(mesh, i).toArray());
    }
    check(positions.every(Number.isFinite) && normals.every(Number.isFinite), 'Expression has nonfinite deformed positions/normals');
    for (const mesh of meshes) check(mesh.morphTargetInfluences.every(w => Number.isFinite(w) && w >= 0 && w <= 1), 'Expression has invalid morph weights');
    return { positions, normals };
  };
  const maximumDelta = (first, second) => {
    let maximum = 0;
    for (let i = 0; i < first.length; i += 3) maximum = Math.max(maximum, Math.hypot(first[i] - second[i], first[i + 1] - second[i + 1], first[i + 2] - second[i + 2]));
    return maximum;
  };
  applyPose(model, 'stand');
  meshes.forEach(mesh => mesh.morphTargetInfluences.fill(0));
  const neutral = values();
  let neutralMinimumY = Infinity;
  for (let i = 1; i < neutral.positions.length; i += 3) neutralMinimumY = Math.min(neutralMinimumY, neutral.positions[i]);
  const expectedNeutralMinimumY = 1.60 * .93 + model.byName.Hips.position.y - .88 * .93;
  check(Math.abs(neutralMinimumY - expectedNeutralMinimumY) <= 3e-5, `Neutral facial skin no longer meets its neck anchor: ${neutralMinimumY} versus ${expectedNeutralMinimumY}`);
  const presets = {};
  for (const id of expressions) {
    model.setExpression(id); presets[id] = values();
    check(maximumDelta(neutral.positions, presets[id].positions) > 1e-4, `${id}: expression does not deform facial vertices`);
    for (const mesh of meshes) for (const target of expressions) check(mesh.morphTargetInfluences[mesh.morphTargetDictionary[target]] === Number(target === id), `${id}: expression weights are not one-hot`);
  }
  const states = [];
  for (const from of expressions) for (const to of expressions.filter(id => id !== from)) for (const t of [0, .25, .5, .75, 1]) {
    model.setExpressionBlend(from, to, t); const forward = values();
    for (const mesh of meshes) check(Math.abs(mesh.morphTargetInfluences.reduce((sum, value) => sum + value, 0) - 1) <= 1e-6, `${from}→${to} at ${t}: facial weight sum differs from one`);
    model.setExpressionBlend(to, from, 1 - t); const reverse = values();
    const expected = presets[from].positions.map((value, i) => value + (presets[to].positions[i] - value) * t);
    const linearPositionDelta = maximumDelta(forward.positions, expected), reversePositionDelta = maximumDelta(forward.positions, reverse.positions), reverseNormalDelta = maximumDelta(forward.normals, reverse.normals);
    check(linearPositionDelta <= 1e-6 && reversePositionDelta <= 1e-6 && reverseNormalDelta <= 1e-6, `Expression ${from}→${to} at ${t}: noncontinuous or asymmetric morph blend`);
    states.push({ from, to, t, linearPositionDelta, reversePositionDelta, reverseNormalDelta });
  }
  model.setExpressionBlend('happy', 'surprised', -1); check(maximumDelta(presets.happy.positions, values().positions) <= 2e-6, 'Negative expression blend factor does not clamp');
  model.setExpressionBlend('happy', 'surprised', 2); check(maximumDelta(presets.surprised.positions, values().positions) <= 2e-6, 'Expression blend factor above one does not clamp');
  const pairDistances = [];
  for (let i = 0; i < expressions.length; i++) for (let j = i + 1; j < expressions.length; j++) {
    const delta = maximumDelta(presets[expressions[i]].positions, presets[expressions[j]].positions);
    check(delta > .005, `Expressions ${expressions[i]} and ${expressions[j]} produce indistinguishable geometry`);
    pairDistances.push({ from: expressions[i], to: expressions[j], maximumVertexDelta: delta });
  }
  let reusedBuffers = true;
  meshes.forEach((mesh, i) => {
    const original = topology[i];
    reusedBuffers &&= mesh.geometry === original.geometry && mesh.geometry.attributes.position.array === original.position && mesh.geometry.attributes.normal.array === original.normal;
    reusedBuffers &&= mesh.geometry.morphAttributes.position.every((a, j) => a.array === original.morphPositions[j]) && mesh.geometry.morphAttributes.normal.every((a, j) => a.array === original.morphNormals[j]);
  });
  check(reusedBuffers, 'Expression transitions replace geometry/buffers');
  const poseLinks = [];
  for (const [pose, expression] of [['stand', 'neutral'], ['run', 'effort'], ['kick', 'victory']]) {
    applyPose(model, pose); const linked = values(); model.setExpression(expression); const explicit = values();
    const maximumPositionDelta = maximumDelta(linked.positions, explicit.positions);
    check(maximumPositionDelta <= 1e-8, `Pose ${pose} does not select expression ${expression}`);
    poseLinks.push({ pose, expression, maximumPositionDelta });
  }
  applyPose(model, 'stand');
  return { expressionIds: expressions, morphMeshes: meshes.length, deformedFacialVertices: presets.happy.positions.length / 3, neutralNeckAnchor: { actualMinimumY: neutralMinimumY, expectedMinimumY: expectedNeutralMinimumY, tolerance: 3e-5 }, directedPairs: 30, blendStates: states, pairDistances, reusedBuffers, poseLinks };
}
function dispose(model) {
  const geometries = new Set(), materials = new Set();
  model.root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => { m.map?.dispose(); m.dispose(); });
  model.skeleton.dispose();
}

const sourcePaths = [
  'kid-head/NOTES.md', 'kid-head/model.mjs', 'kid-head/expression-model.mjs', 'kid-head/three.module.js',
  'kid-hands-shoes/NOTES.md', 'kid-hands-shoes/hand.js', 'kid-hands-shoes/shoe.js', 'kid-hands-shoes/vendor/three.module.js',
  'kid-body/NOTES.md', 'kid-body/model.mjs', 'kid-body/vendor/three.module.js',
];
for (const relative of sourcePaths) {
  const repositoryPath = `codex-lab/${relative}`;
  const current = await readFile(resolve(root, '..', relative));
  const { stdout: committed } = await runFile('git', ['show', `HEAD:${repositoryPath}`], { cwd: root, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
  const row = { path: repositoryPath, bytes: current.length, currentSHA256: sha256(current), headSHA256: sha256(committed), unchangedFromHEAD: current.equals(committed) };
  report.originals.push(row); check(row.unchangedFromHEAD, `Original source changed: ${repositoryPath}`);
}
report.implementation = {};
for (const file of ['rig.mjs', 'scene.mjs', 'studio-bake.mjs', 'parts/body.mjs', 'parts/head.mjs', 'parts/hand.mjs', 'parts/shoe.mjs', 'parts/expressions.mjs', 'geometry-morphs.mjs', 'deformed-geometry.mjs']) report.implementation[file] = sha256(await readFile(resolve(root, file)));

for (const detail of ['dense', 'balanced', 'mobile']) {
  const model = buildCharacter({ detail }), result = { ...countModel(model.root), skin: validateSkin(model), poses: {}, transitions: [] };
  for (const pose of ['stand', 'run', 'kick']) {
    applyPose(model, pose); result.poses[pose] = deformedBounds(model);
    check(result.poses[pose].minimumY >= -report.limits.groundPenetration, `${detail}/${pose} ground penetration`);
  }
  if (detail === 'mobile') check(result.modelTriangles <= report.limits.mobileModelTriangles, `Mobile model has ${result.modelTriangles} triangles, above the 20,000 limit`);
  const ratio = result.poses.stand.heightInHeads;
  check(ratio >= 2.5 && ratio <= 2.7, `${detail}: standing height ${ratio} heads, expected 2.5–2.7`);
  for (const [from, to] of [['stand', 'run'], ['run', 'kick'], ['kick', 'stand']]) for (const t of [0, .25, .5, .75, 1]) {
    applyBlend(model, from, to, t); const bounds = deformedBounds(model);
    result.transitions.push({ from, to, t, minimumY: bounds.minimumY });
    check(bounds.minimumY >= -report.limits.groundPenetration, `${detail}/${from}→${to}/${t} ground penetration: ${bounds.minimumY}`);
  }
  result.contact = kickContact(model); result.animations = validateClips(model);
  result.expressions = validateExpressions(model);
  report.qualities[detail] = result; dispose(model);
}
check(report.qualities.mobile.modelTriangles < report.qualities.balanced.modelTriangles && report.qualities.balanced.modelTriangles < report.qualities.dense.modelTriangles, 'Triangle budgets do not decrease dense → balanced → mobile');

const glbBytes = await exists(resolve(root, 'kid-full.glb'));
if (glbBytes) {
  assert.equal(glbBytes.readUInt32LE(0), 0x46546c67); assert.equal(glbBytes.readUInt32LE(4), 2); assert.equal(glbBytes.readUInt32LE(8), glbBytes.length);
  const chunks = []; for (let offset = 12; offset < glbBytes.length;) { const length = glbBytes.readUInt32LE(offset), type = glbBytes.readUInt32LE(offset + 4); chunks.push({ type, data: glbBytes.subarray(offset + 8, offset + 8 + length) }); offset += length + 8; }
  const json = JSON.parse(chunks.find(c => c.type === 0x4e4f534a).data.toString().trim()), binary = chunks.find(c => c.type === 0x004e4942)?.data;
  const component = { 5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] }, dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const accessor = id => {
    const a = json.accessors[id], view = json.bufferViews[a.bufferView], [method, size] = component[a.componentType], width = dimensions[a.type], stride = view.byteStride || size * width;
    check(!a.sparse, 'Sparse GLB accessor requires a separate validation path');
    const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength), offset = (view.byteOffset || 0) + (a.byteOffset || 0);
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) => data[method](offset + i * stride + c * size, true)));
  };
  check((json.buffers || []).every(b => !b.uri), 'GLB contains external buffer URI');
  check((json.images || []).every(image => image.bufferView !== undefined && !image.uri), 'GLB contains external texture URI');
  check(json.skins?.length > 0, 'GLB is missing a skeleton');
  const names = new Set(json.nodes?.map(n => n.name));
  for (const bone of ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Hand_L', 'Hand_R', 'Foot_L', 'Foot_R']) check(names.has(bone), `GLB missing bone ${bone}`);
  for (const skin of json.skins || []) {
    check(new Set(skin.joints).size === skin.joints.length, 'GLB skin has duplicate joints');
    check(skin.joints.every(j => json.nodes[j]), 'GLB skin references missing nodes');
    if (skin.inverseBindMatrices !== undefined) check(accessor(skin.inverseBindMatrices).flat().every(Number.isFinite), 'GLB inverse bind matrix is nonfinite');
  }
  let exportedModelTriangles = 0;
  for (const node of json.nodes || []) if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
    check(primitive.mode === undefined || primitive.mode === 4, 'Delivered GLB has a non-triangle primitive');
    exportedModelTriangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  check(exportedModelTriangles <= report.limits.mobileModelTriangles, `Delivered GLB has ${exportedModelTriangles} triangles, above the 20,000 limit`);
  check(exportedModelTriangles === report.qualities.mobile.modelTriangles, 'Delivered GLB triangle topology does not match current mobile source');
  let exportedMaximumVertexColor = 0;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) if (primitive.attributes.COLOR_0 !== undefined) {
    for (const value of accessor(primitive.attributes.COLOR_0).flat()) {
      exportedMaximumVertexColor = Math.max(exportedMaximumVertexColor, value);
      check(Number.isFinite(value) && value >= 0 && value <= 1, 'GLB COLOR_0 component outside required range [0,1]');
    }
  }
  const exportedMorphs = [], exportedMorphChanges = Object.fromEntries(expressions.map(id => [id, 0]));
  for (const mesh of json.meshes || []) if (mesh.primitives.some(p => p.targets?.length)) {
    check(mesh.extras?.targetNames?.join(',') === expressions.join(','), `${mesh.name}: GLB expression morph names/order differ`);
    for (const primitive of mesh.primitives) {
      const vertexCount = json.accessors[primitive.attributes.POSITION].count;
      check(primitive.targets?.length === 6, `${mesh.name}: GLB requires six facial morph targets`);
      for (const [j, target] of (primitive.targets || []).entries()) for (const semantic of ['POSITION', 'NORMAL']) {
        const id = target[semantic];
        check(id !== undefined, `${mesh.name}: GLB morph ${j} is missing ${semantic}`);
        if (id !== undefined) {
          check(json.accessors[id].count === vertexCount && json.accessors[id].type === 'VEC3', `${mesh.name}: GLB morph ${j} topology differs`);
          check(accessor(id).flat().every(Number.isFinite), `${mesh.name}: GLB morph ${j} has nonfinite ${semantic}`);
          if (semantic === 'POSITION') for (const value of accessor(id).flat()) exportedMorphChanges[expressions[j]] = Math.max(exportedMorphChanges[expressions[j]], Math.abs(value));
        }
      }
      exportedMorphs.push({ name: mesh.name, vertices: vertexCount, targetCount: primitive.targets?.length });
    }
  }
  check(exportedMorphs.length > 0, 'Delivered GLB contains no facial morph targets');
  for (const [id, delta] of Object.entries(exportedMorphChanges)) check(delta > 1e-4, `GLB ${id}: target does not contain facial deformation`);
  const morphNodeCount = (json.nodes || []).filter(node => node.mesh !== undefined && json.meshes[node.mesh].primitives.some(p => p.targets?.length)).length;
  let exportedSkinVertices = 0, exportedMaximumWeightSumError = 0;
  for (const node of json.nodes.filter(n => n.skin !== undefined)) {
    const jointCount = json.skins[node.skin]?.joints.length;
    for (const primitive of json.meshes[node.mesh].primitives) {
      check(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined, 'GLB skinned primitive missing joint/weight attributes');
      const joints = accessor(primitive.attributes.JOINTS_0), weights = accessor(primitive.attributes.WEIGHTS_0);
      check(joints.length === weights.length && joints.length === json.accessors[primitive.attributes.POSITION].count, 'GLB skin attribute counts differ');
      for (let i = 0; i < joints.length; i++) {
        check(joints[i].every(j => Number.isInteger(j) && j >= 0 && j < jointCount), 'GLB vertex references out of range skin joint');
        check(weights[i].every(w => Number.isFinite(w) && w >= 0 && w <= 1), 'GLB skin contains invalid weight');
        exportedMaximumWeightSumError = Math.max(exportedMaximumWeightSumError, Math.abs(weights[i].reduce((sum, value) => sum + value, 0) - 1));
      }
      exportedSkinVertices += joints.length;
    }
  }
  check(exportedMaximumWeightSumError <= report.limits.weightSumError, `GLB skin weight sum error ${exportedMaximumWeightSumError}`);
  const animationResults = [];
  for (const animation of json.animations || []) {
    let maximumLoopDelta = 0, facialWeightChannels = 0;
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler], input = accessor(sampler.input).flat(), output = accessor(sampler.output);
      check(input.every((time, i) => Number.isFinite(time) && (i === 0 || time > input[i - 1])), `GLB ${animation.name}: invalid keyframe times`);
      check(output.flat().every(Number.isFinite), `GLB ${animation.name}: nonfinite keyframe output`);
      let a = output[0], b = output.at(-1);
      if (channel.target.path === 'weights') {
        facialWeightChannels++;
        const node = json.nodes[channel.target.node], mesh = json.meshes[node.mesh], count = mesh.primitives[0].targets?.length || 0, flat = output.flat();
        check(count === 6 && flat.length === input.length * count, `GLB ${animation.name}: facial keyframe weight count differs`);
        check(mesh.extras?.targetNames?.join(',') === expressions.join(','), `GLB ${animation.name}: weight channel names differ`);
        check(flat.every(weight => weight >= 0 && weight <= 1), `GLB ${animation.name}: facial weight outside [0,1]`);
        if (animation.name === 'run' || animation.name === 'kick') {
          const expected = animation.name === 'run' ? 'effort' : 'victory', index = expressions.indexOf(expected);
          check(Math.max(...Array.from({ length: input.length }, (_, i) => flat[i * count + index])) >= .99, `GLB ${animation.name}: ${expected} weight is missing`);
        } else check(flat.every(weight => weight === 0), 'GLB stand clip should retain the existing quiet neutral expression');
        a = flat.slice(0, count); b = flat.slice(-count);
      }
      const delta = channel.target.path === 'rotation' ? Math.min(Math.hypot(...a.map((v, i) => v - b[i])), Math.hypot(...a.map((v, i) => v + b[i]))) : Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      maximumLoopDelta = Math.max(maximumLoopDelta, delta);
    }
    check(maximumLoopDelta <= report.limits.clipLoopDelta, `GLB ${animation.name}: loop endpoints differ`);
    check(facialWeightChannels === morphNodeCount, `GLB ${animation.name}: expression animation channel missing for one or more facial meshes`);
    animationResults.push({ name: animation.name, channels: animation.channels.length, facialWeightChannels, maximumLoopDelta });
  }
  check(animationResults.map(a => a.name).join(',') === 'stand,run,kick', 'GLB must contain stand, run and kick clips');
  report.glb = { bytes: glbBytes.length, sha256: sha256(glbBytes), modelTriangles: exportedModelTriangles, skins: json.skins.length, exportedSkinVertices, exportedMaximumWeightSumError, exportedMaximumVertexColor, morphs: exportedMorphs, morphChanges: exportedMorphChanges, animations: animationResults };
} else { report.glb = { skipped: 'kid-full.glb has not been captured yet' }; }

const metricBytes = await exists(resolve(root, 'shots/metrics.json'));
if (metricBytes) {
  const metrics = JSON.parse(metricBytes);
  if (metrics.glb?.sha256 && report.glb.sha256) check(metrics.glb.sha256 === report.glb.sha256, 'Capture metrics refer to a different GLB');
  if (metrics.glb?.maximumRGBMeanDifference !== undefined) check(metrics.glb.maximumRGBMeanDifference <= .05, `GLB maximum roundtrip mean RGB difference ${metrics.glb.maximumRGBMeanDifference}`);
  for (const [file, hash] of Object.entries(report.implementation)) check(metrics.implementation?.[file] === hash, `Capture implementation hash is stale: ${file}`);
  if (metrics.glb?.maximumAbove8PixelsPercent !== undefined) check(metrics.glb.maximumAbove8PixelsPercent <= .1, 'GLB roundtrip exceeded pixel tolerance');
  for (const [pose, sample] of Object.entries(metrics.glb?.vertexChecks || {})) check(sample.maximumPositionDelta <= 1e-5, `${pose}: GLB sampled vertex mismatch ${sample.maximumPositionDelta}`);
  check(metrics.expressionCapture?.expressions?.join(',') === expressions.join(','), 'Six-expression source screenshot evidence is missing');
  check(metrics.expressionSamples?.length === 39 && Object.keys(metrics.glb?.expressionViews || {}).length === 39, 'Expression roundtrip requires 24 preset views and 15 transition samples');
  for (const [id, sample] of Object.entries(metrics.glb?.expressionVertexChecks || {})) check(sample.maximumPositionDelta <= 1e-5 && sample.maximumNormalDelta <= 1e-5, `${id}: morphed world positions/normals changed through GLB`);
  for (const [id, sample] of Object.entries(metrics.glb?.expressionMorphChecks || {})) check(sample.sourceMeshes > 0 && sample.sourceMeshes === sample.loadedMeshes && sample.missingMeshes.length === 0 && sample.dictionaryDifferences.length === 0 && sample.maximumWeightDelta <= 1e-6, `${id}: named GLB morph targets/weights changed`);
  check(metrics.glb?.maximumSampledNormalDelta <= 1e-5, 'GLB transformed morph normals exceeded tolerance');
  check(metrics.expressionComparison?.fullOriginalTargetSheet === true && metrics.expressionComparison.targetCellMapping === 'none', 'Expression comparison must preserve the complete original sheet without inventing target labels');
  check(metrics.expressionComparison?.matchingBaselineExpressions === true && Object.keys(metrics.expressionCapture?.baselineImagePaths || {}).join(',') === expressions.join(','), 'Latest main before/after expression grid must compare the same six named expressions');
  for (const quality of Object.keys(metrics.phone?.quality || {})) {
    const captured = metrics.phone.quality[quality];
    if (report.qualities[quality]) check(captured.modelTriangles === report.qualities[quality].modelTriangles, `${quality}: benchmark triangle count is stale`);
  }
  const mobile = metrics.phone?.quality?.mobile;
  check(!!mobile && mobile.trials?.length >= 3, 'Mobile requires at least three fresh phone-size benchmark trials');
  if (mobile) {
    check(mobile.stable === true, 'Mobile quality did not pass the declared FPS stability limits');
    check(metrics.phone.viewport?.width === 390 && metrics.phone.viewport?.height === 844 && metrics.phone.dpr === 1, 'Mobile benchmark viewport or DPR differs from the declared phone preset');
    check(metrics.stabilityCriteria?.minimumFPS >= report.limits.minimumMobileFPS && metrics.stabilityCriteria?.maximumP95FrameMs <= report.limits.maximumP95FrameMs && metrics.stabilityCriteria?.maximumTrialFPSRatio <= report.limits.maximumTrialFPSRatio, 'Capture uses weaker performance limits than the acceptance criteria');
    for (const trial of mobile.trials || []) {
      check(Number.isFinite(trial.fps) && trial.fps >= report.limits.minimumMobileFPS, `Mobile trial ${trial.trial}: ${trial.fps} FPS, require at least 40`);
      check(Number.isFinite(trial.frameMs?.p95) && trial.frameMs.p95 <= report.limits.maximumP95FrameMs, `Mobile trial ${trial.trial}: p95 frame time exceeds 50ms`);
      check(trial.modelTriangles <= report.limits.mobileModelTriangles, `Mobile trial ${trial.trial}: triangle budget exceeded`);
      check(trial.rendererSize?.width === 234 && trial.rendererSize?.height === 506, 'Mobile buffer must retain the original 234×506 acceptance resolution');
      check(trial.expressionTransitionsIncluded === true, 'Mobile benchmark must exercise all six facial expression transitions');
    }
    const fps = (mobile.trials || []).map(trial => trial.fps);
    check(fps.length > 0 && Math.max(...fps) / Math.min(...fps) <= report.limits.maximumTrialFPSRatio, 'Mobile trial FPS ratio exceeds 1.15');
  }
  const comparison = metrics.beforeAfter;
  check(comparison?.settingsIdentical === true && comparison.before?.path && comparison.after?.source, 'Before/after comparison with identical camera/light settings is missing');
  if (comparison?.before?.path) {
    const baseline = await exists(resolve(root, comparison.before.path));
    check(!!baseline && sha256(baseline) === comparison.before.sha256, 'Before model is missing or its hash differs from comparison metadata');
  }
  const baseline = metrics.phoneBaseline;
  check(!!baseline && baseline.quality?.mobile?.trials?.length >= 3, 'Original GLB requires three fresh baseline phone benchmark trials');
  if (baseline) {
    check(baseline.sha256 === comparison?.before?.sha256, 'Measured original GLB differs from the before/after source');
    check(baseline.viewport?.width === metrics.phone?.viewport?.width && baseline.viewport?.height === metrics.phone?.viewport?.height && baseline.dpr === metrics.phone?.dpr, 'Original and current phone benchmark viewports differ');
    for (const trial of baseline.quality?.mobile?.trials || []) {
      check(trial.source === 'GLB' && trial.buildMs === undefined, 'Original baseline should record GLB loading rather than an embedded source build time');
      check(Number.isFinite(trial.fps) && Number.isFinite(trial.loadAndFirstDrawMs), 'Original GLB baseline timing is missing');
      check(trial.rendererSize?.width === mobile?.rendererSize?.width && trial.rendererSize?.height === mobile?.rendererSize?.height, 'Original and current phone rendering buffer sizes differ');
    }
  }
  const delivered = metrics.phoneDelivered;
  const deliveredMobile = delivered?.quality?.mobile;
  check(!!deliveredMobile && deliveredMobile.trials?.length >= 3, 'Delivered GLB requires three fresh phone-size benchmark trials');
  if (deliveredMobile) {
    check(delivered.sha256 === report.glb.sha256, 'Phone benchmark used a different delivered GLB');
    check(deliveredMobile.stable === true, 'Delivered GLB did not pass the declared FPS stability limits');
    check(delivered.viewport?.width === 390 && delivered.viewport?.height === 844 && delivered.dpr === 1, 'Delivered GLB phone benchmark viewport or DPR differs');
    for (const trial of deliveredMobile.trials || []) {
      check(trial.source === 'GLB' && trial.buildMs === undefined && Number.isFinite(trial.loadAndFirstDrawMs), 'Delivered GLB should record loading and first draw rather than procedural build time');
      check(Number.isFinite(trial.fps) && trial.fps >= report.limits.minimumMobileFPS, `Delivered GLB trial ${trial.trial}: ${trial.fps} FPS, require at least 40`);
      check(Number.isFinite(trial.frameMs?.p95) && trial.frameMs.p95 <= report.limits.maximumP95FrameMs, `Delivered GLB trial ${trial.trial}: p95 frame time exceeds 50ms`);
      check(trial.modelTriangles === report.qualities.mobile.modelTriangles && trial.modelTriangles <= report.limits.mobileModelTriangles, 'Delivered GLB benchmark triangle count differs or exceeds budget');
      check(trial.rendererSize?.width === mobile?.rendererSize?.width && trial.rendererSize?.height === mobile?.rendererSize?.height, 'Delivered GLB and procedural source phone rendering buffer sizes differ');
      check(trial.expressionTransitionsIncluded === true, 'Delivered GLB benchmark must exercise all six facial expression transitions');
    }
    const fps = (deliveredMobile.trials || []).map(trial => trial.fps);
    check(fps.length > 0 && Math.max(...fps) / Math.min(...fps) <= report.limits.maximumTrialFPSRatio, 'Delivered GLB trial FPS ratio exceeds 1.15');
  }
  for (const reference of [metrics.reference, metrics.expressionReference]) {
    check(reference?.sourcePixelAccess === true && !!reference?.path, 'Original reference pixel access is missing from comparison metadata');
    if (reference?.path) {
      const bytes = await exists(resolve(root, reference.path));
      check(!!bytes && sha256(bytes) === reference.sha256, `Reference sheet hash mismatch: ${reference.path}`);
    }
  }
  check((metrics.browserChecks?.errors || []).length === 0, 'Capture report contains browser errors');
  check((metrics.browserChecks?.externalRequests || []).length === 0, 'Capture made external runtime requests');
  report.capture = { path: 'shots/metrics.json', sha256: sha256(metricBytes), roundtripMaximumRGBMeanDifference: metrics.glb?.maximumRGBMeanDifference, mobileStable: mobile?.stable ?? null, minimumMobileFPS: mobile?.trials?.length ? Math.min(...mobile.trials.map(t => t.fps)) : null, comparison: comparison?.comparisonPath };
}
if (process.argv.includes('--browser')) {
  const { chromium } = await import('playwright-core');
  const { startServer } = await import('./serve.mjs');
  const service = await startServer();
  const browserErrors = [], externalRequests = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => browserErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') browserErrors.push(m.text()); });
    page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(service.url).origin) externalRequests.push(r.url()); });
    page.on('response', r => { if (r.status() >= 400) browserErrors.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.goto(`${service.url}/?quality=mobile`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.labReady);
    const controls = [];
    for (const pose of ['stand', 'run', 'kick']) {
      await page.locator(`[data-pose="${pose}"]`).click();
      check(await page.locator(`[data-pose="${pose}"]`).getAttribute('aria-pressed') === 'true', `Pose control ${pose} did not activate`);
      controls.push(`pose:${pose}`);
    }
    for (const view of ['front', 'side', 'back', 'threeQuarter']) {
      await page.locator(`[data-view="${view}"]`).click();
      check(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed') === 'true', `View control ${view} did not activate`);
      controls.push(`view:${view}`);
    }
    for (const expression of expressions) {
      await page.locator('#expression').selectOption(expression);
      check(await page.evaluate(id => window.lab.metrics().expressionWeights[id] === 1, expression), `Expression control ${expression} did not select its morph target`);
      controls.push(`expression:${expression}`);
    }
    await page.locator('#expression-from').selectOption('tired');
    await page.locator('#expression-to').selectOption('thinking');
    await page.locator('#expression-blend').focus(); await page.keyboard.press('End');
    check(await page.evaluate(() => window.lab.metrics().expressionWeights.thinking === 1), 'Expression blend keyboard End did not select its target');
    controls.push('expression-blend-keyboard');
    await page.locator('#blend').focus(); await page.keyboard.press('End');
    check(await page.locator('#blend').inputValue() === '100', 'Blend keyboard End did not reach endpoint');
    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('#play').textContent === 'עצירה');
    await page.locator('#play').click();
    check(await page.locator('#play').textContent() === 'ניגון התנוחה', 'Animation stop control did not stop');
    controls.push('blend-keyboard', 'play-stop');
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, canvases: document.querySelectorAll('canvas').length }));
    check(dimensions.scrollWidth <= dimensions.viewport, 'Horizontal overflow at phone viewport');
    check(dimensions.canvases === 1, 'Expected one live canvas');
    await page.locator('#load').click();
    await page.waitForFunction(() => document.querySelector('#source-label').textContent === 'GLB שנטען מחדש', null, { timeout: 30000 });
    check(await page.evaluate(() => window.lab.metrics().source) === 'GLB', 'Delivered GLB load control did not switch models');
    controls.push('load-delivered-glb');
    await page.locator('#original').click();
    check(await page.evaluate(() => window.lab.metrics().source) === 'procedural', 'Original model control did not restore source');
    controls.push('restore-source');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#pose-expression').check();
    const startContinuity = await page.evaluate(() => {
      const lab = window.lab;
      const state = () => [...lab.model.bones.flatMap(b => [...b.quaternion.toArray(), ...b.position.toArray()]), ...lab.model.ball.scale.toArray(), ...lab.model.ball.position.toArray(), ...Object.values(lab.metrics().expressionWeights)];
      lab.setBlend('stand', 'run', .43);
      const before = state(); lab.setPose('kick', false); const after = state();
      return Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    });
    await page.waitForTimeout(180);
    const interruptContinuity = await page.evaluate(() => {
      const lab = window.lab;
      const state = () => [...lab.model.bones.flatMap(b => [...b.quaternion.toArray(), ...b.position.toArray()]), ...lab.model.ball.scale.toArray(), ...lab.model.ball.position.toArray(), ...Object.values(lab.metrics().expressionWeights)];
      const before = state(); lab.setPose('stand', false); const after = state();
      return Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    });
    await page.waitForTimeout(1000);
    const transitionEndDelta = await page.evaluate(() => {
      const lab = window.lab, before = lab.model.bones.flatMap(b => b.quaternion.toArray());
      lab.setPose('stand', true);
      return Math.max(...before.map((v, i) => Math.abs(v - lab.model.bones[Math.floor(i / 4)].quaternion.toArray()[i % 4])));
    });
    check(Math.max(startContinuity, interruptContinuity) <= 1e-8, 'Interrupted pose transition jumps at its start');
    check(transitionEndDelta <= 1e-8, 'Pose transition does not reach its target');
    controls.push('manual-blend-transition', 'interrupted-transition', 'transition-endpoint');
    const expressionStartContinuity = await page.evaluate(() => {
      const lab = window.lab, state = () => Object.values(lab.metrics().expressionWeights);
      lab.sampleClip('run', .3);
      const before = state(); lab.setExpression('happy', false); const after = state();
      return Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    });
    await page.waitForTimeout(180);
    const expressionInterruptContinuity = await page.evaluate(() => {
      const lab = window.lab, before = Object.values(lab.metrics().expressionWeights);
      lab.setExpression('victory', false); const after = Object.values(lab.metrics().expressionWeights);
      return Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    });
    await page.waitForTimeout(900);
    const expressionEndpointDelta = await page.evaluate(() => {
      const lab = window.lab, before = Object.values(lab.metrics().expressionWeights);
      lab.setExpression('victory', true); const after = Object.values(lab.metrics().expressionWeights);
      return Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    });
    check(Math.max(expressionStartContinuity, expressionInterruptContinuity) <= 1e-8, 'Expression transition after animation or interruption jumps at its start');
    check(expressionEndpointDelta <= 1e-8, 'Expression transition does not reach its target');
    controls.push('expression-transition-after-clip', 'expression-interrupted-transition', 'expression-transition-endpoint');
    const geometryRoundtrip = await page.evaluate(async () => {
      const T = await import('./vendor/three.module.js');
      const { GLTFLoader } = await import('./vendor/GLTFLoader.js');
      const { animationClips, applyPose } = await import('./rig.mjs');
      const { deformedVertex, deformedNormal } = await import('./deformed-geometry.mjs');
      const { EXPRESSION_IDS, applyExpression, blendExpression } = await import('./parts/expressions.mjs');
      const lab = window.lab, source = lab.model, data = await new GLTFLoader().loadAsync('./kid-full.glb');
      const sourceClips = animationClips(source), result = [];
      const sample = root => {
        root.updateMatrixWorld(true);
        const positions = [], normals = [], p = new T.Vector3(), inverseRoot = root.matrixWorld.clone().invert(), normalToRoot = new T.Matrix3().getNormalMatrix(inverseRoot);
        root.traverse(mesh => {
          if (!mesh.isSkinnedMesh && !mesh.userData.rigidBone && !mesh.geometry?.morphAttributes.position?.length) return;
          if (mesh.isSkinnedMesh) mesh.skeleton.update();
          const a = mesh.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            deformedVertex(mesh, i, p).applyMatrix4(inverseRoot);
            // Both roots are sampled in model coordinates. Source's holder
            // supplies the UI view rotation; GLB is intentionally unattached.
            positions.push(p.x, p.y, p.z);
            deformedNormal(mesh, i, p).applyMatrix3(normalToRoot).normalize(); normals.push(p.x, p.y, p.z);
          }
        }); return { positions, normals };
      };
      const compare = (first, second) => {
        if (first.positions.length !== second.positions.length || first.normals.length !== second.normals.length) throw Error(`Vertex topology changed through GLB: ${first.positions.length} vs ${second.positions.length}`);
        let maximumPositionDelta = 0, maximumNormalDelta = 0;
        for (let i = 0; i < first.positions.length; i += 3) {
          maximumPositionDelta = Math.max(maximumPositionDelta, Math.hypot(...[0, 1, 2].map(c => first.positions[i + c] - second.positions[i + c])));
          maximumNormalDelta = Math.max(maximumNormalDelta, Math.hypot(...[0, 1, 2].map(c => first.normals[i + c] - second.normals[i + c])));
        }
        return { deformedVertices: first.positions.length / 3, maximumPositionDelta, maximumNormalDelta };
      };
      for (const clip of sourceClips) {
        const loadedClip = data.animations.find(c => c.name === clip.name);
        if (!loadedClip) throw Error(`Loaded GLB is missing clip ${clip.name}`);
        const a = new T.AnimationMixer(source.root), b = new T.AnimationMixer(data.scene);
        for (const [mixer, animation] of [[a, clip], [b, loadedClip]]) {
          const action = mixer.clipAction(animation); action.reset().setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
        }
        for (const fraction of [0, .125, .25, .5, .75, .875, 1]) {
          const time = clip.duration * fraction; a.setTime(time); b.setTime(time);
          result.push({ clip: clip.name, time, ...compare(sample(source.root), sample(data.scene)) });
        }
        a.stopAllAction(); b.stopAllAction(); a.uncacheRoot(source.root); b.uncacheRoot(data.scene);
      }
      const byName = {}, bones = []; data.scene.traverse(o => { if (o.isBone) { byName[o.name] = o; bones.push(o); } });
      const loaded = { root: data.scene, byName, bones, skeleton: data.scene.getObjectByProperty('isSkinnedMesh', true).skeleton, ball: data.scene.getObjectByName('Ball') };
      const expressionChecks = [];
      for (const pose of ['stand', 'run', 'kick']) {
        applyPose(source, pose); applyPose(loaded, pose);
        for (const expression of EXPRESSION_IDS) {
          applyExpression(source.root, expression); applyExpression(data.scene, expression);
          expressionChecks.push({ pose, expression, ...compare(sample(source.root), sample(data.scene)) });
        }
      }
      applyPose(source, 'stand'); applyPose(loaded, 'stand');
      for (const from of EXPRESSION_IDS) for (const to of EXPRESSION_IDS.filter(id => id !== from)) for (const t of [0, .25, .5, .75, 1]) {
        blendExpression(source.root, from, to, t); blendExpression(data.scene, from, to, t);
        expressionChecks.push({ pose: 'stand', from, to, t, ...compare(sample(source.root), sample(data.scene)) });
      }
      data.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const material of Array.isArray(o.material) ? o.material : [o.material]) { material.map?.dispose(); material.dispose(); } } });
      lab.setPose('stand'); return { clipChecks: result, expressionChecks };
    });
    const { clipChecks, expressionChecks } = geometryRoundtrip;
    for (const sample of clipChecks) check(sample.maximumPositionDelta <= 1e-5 && sample.maximumNormalDelta <= 1e-5, `Browser GLB clip ${sample.clip} at ${sample.time}s differs by ${sample.maximumPositionDelta}`);
    for (const sample of expressionChecks) check(sample.maximumPositionDelta <= 1e-5 && sample.maximumNormalDelta <= 1e-5, `Browser GLB expression ${sample.expression || `${sample.from}→${sample.to}`} at ${sample.t ?? 'preset'} changed deformed positions/normals`);
    const gallery = await context.newPage();
    gallery.on('pageerror', e => browserErrors.push(e.message));
    gallery.on('console', m => { if (m.type() === 'error') browserErrors.push(m.text()); });
    gallery.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(service.url).origin) externalRequests.push(r.url()); });
    gallery.on('response', r => { if (r.status() >= 400) browserErrors.push(`HTTP ${r.status()} ${r.url()}`); });
    await gallery.goto(`${service.url}/expressions.html?quality=mobile`, { waitUntil: 'networkidle' });
    await gallery.evaluate(() => window.labReady);
    const galleryDimensions = await gallery.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, canvases: document.querySelectorAll('canvas').length, images: [...document.querySelectorAll('table img')].map(img => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })) }));
    check(galleryDimensions.scrollWidth <= galleryDimensions.viewport && galleryDimensions.canvases === 1, 'Expression gallery overflows phone or has multiple live canvases');
    check(galleryDimensions.images.length === 6 && galleryDimensions.images.every(img => img.loaded), 'Expression gallery must load six preview images');
    await gallery.close();
    check(browserErrors.length === 0, `Browser errors: ${browserErrors.join('; ')}`);
    check(externalRequests.length === 0, 'Browser verification requested external runtime assets');
    report.browser = { version: browser.version(), viewport: { width: 390, height: 844 }, controls, dimensions, galleryDimensions, transitionChecks: { startContinuity, interruptContinuity, transitionEndDelta, expressionStartContinuity, expressionInterruptContinuity, expressionEndpointDelta }, clipChecks, expressionChecks, errors: browserErrors, externalRequests };
    await context.close();
  } catch (error) {
    failures.push(`Browser verification: ${error.message}`);
    report.browser = { errors: browserErrors, externalRequests, failure: error.message };
  } finally { await browser.close(); await service.close(); }
}
report.failures = [...new Set(failures)]; report.passed = report.failures.length === 0;
await mkdir(resolve(root, 'work'), { recursive: true });
await writeFile(resolve(root, 'work/review-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
await mkdir(resolve(root, 'shots'), { recursive: true });
await writeFile(resolve(root, 'shots/verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, qualities: Object.fromEntries(Object.entries(report.qualities).map(([key, value]) => [key, { triangles: value.modelTriangles, standingHeadRatio: value.poses.stand.heightInHeads, kickSurfaceGap: value.contact.surfaceGap, minimumClipY: Math.min(...value.animations.flatMap(c => c.groundSamples.map(s => s.minimumY))) }])), failures: report.failures }, null, 2));
if (!report.passed) process.exitCode = 1;
