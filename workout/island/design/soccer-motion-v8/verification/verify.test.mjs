/** Independent package acceptance: node --test verification/verify.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import * as THREE from '../runtime/vendor/three.module.js';
import { parseGLB, readAccessor, loadNativeGLTF, walkFiles } from './glb-reader.mjs';
import { loadLibrary, createController } from '../runtime/controller.mjs';
import { auditBallContacts } from './audit-ball-contact.mjs';
import { auditBallPaths } from './audit-ball-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = new URL('../runtime/', import.meta.url);
const canonical = [
  ['Root', null, [0, 0, 0]], ['Hips', 'Root', [0, .86, 0]],
  ['Spine', 'Hips', [0, .2, 0]], ['Chest', 'Spine', [0, .18, 0]],
  ['Neck', 'Chest', [0, .1, 0]], ['Head', 'Neck', [0, .13, 0]],
  ['LeftArm', 'Chest', [.16, .06, 0]], ['LeftForeArm', 'LeftArm', [0, -.27, 0]],
  ['LeftHand', 'LeftForeArm', [0, -.24, 0]],
  ['RightArm', 'Chest', [-.16, .06, 0]], ['RightForeArm', 'RightArm', [0, -.27, 0]],
  ['RightHand', 'RightForeArm', [0, -.24, 0]],
  ['LeftUpLeg', 'Hips', [.1, 0, 0]], ['LeftLeg', 'LeftUpLeg', [0, -.41, 0]],
  ['LeftFoot', 'LeftLeg', [0, -.37, 0]], ['RightUpLeg', 'Hips', [-.1, 0, 0]],
  ['RightLeg', 'RightUpLeg', [0, -.41, 0]], ['RightFoot', 'RightLeg', [0, -.37, 0]],
];
const boneNames = canonical.map(record => record[0]);
const close = (actual, expected, tolerance = 1e-6, label = '') => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differs from ${expected} by more than ${tolerance}`);
};
const sha = input => createHash('sha256').update(input).digest('hex');
const runFile = promisify(execFile);
const catalog = await import('../runtime/catalog.mjs');
const clips = catalog.clips;
assert.ok(Array.isArray(clips), 'catalog.clips is an array');
const byID = new Map(clips.map(clip => [clip.id, clip]));
const loaded = new Map(), binaries = new Map();
const roleAsset = role => role === 'field' ? 'player.glb' : 'keeper.glb';
async function binaryFor(role) {
  if (!binaries.has(role)) binaries.set(role, parseGLB(await fs.readFile(new URL(roleAsset(role), runtime))));
  return binaries.get(role);
}
async function nativeFor(role) {
  if (!loaded.has(role)) loaded.set(role, await loadNativeGLTF(new URL(roleAsset(role), runtime)));
  return loaded.get(role);
}
function pathPosition(keys, time) {
  if (!keys?.length) return new THREE.Vector3();
  if (time <= keys[0].time) return new THREE.Vector3().fromArray(keys[0].position);
  for (let i = 1; i < keys.length; i++) if (time <= keys[i].time) {
    return new THREE.Vector3().fromArray(keys[i - 1].position)
      .lerp(new THREE.Vector3().fromArray(keys[i].position), (time - keys[i - 1].time) / (keys[i].time - keys[i - 1].time));
  }
  return new THREE.Vector3().fromArray(keys.at(-1).position);
}
function snapshotPose(root) {
  root.updateMatrixWorld(true);
  return boneNames.map(name => {
    const bone = root.getObjectByName(name);
    return { name, position: bone.getWorldPosition(new THREE.Vector3()), rotation: bone.getWorldQuaternion(new THREE.Quaternion()).normalize() };
  });
}
function assertSamePose(root, snapshot, label) {
  root.updateMatrixWorld(true);
  for (const record of snapshot) {
    const bone = root.getObjectByName(record.name);
    const translation = record.position.distanceTo(bone.getWorldPosition(new THREE.Vector3()));
    const angle = record.rotation.angleTo(bone.getWorldQuaternion(new THREE.Quaternion()).normalize());
    assert.ok(translation <= 1e-6, `${label}/${record.name}: position changed ${translation} m at zero elapsed time`);
    assert.ok(angle <= 1e-6, `${label}/${record.name}: rotation changed ${angle} rad at zero elapsed time`);
  }
}

test('delivery stays inside size, format and portability budgets', async () => {
  const files = await walkFiles(root);
  assert.ok(files.length > 10, 'Delivery is missing required files');
  assert.ok(files.reduce((sum, file) => sum + file.size, 0) <= 60_000_000, 'Package exceeds 60 MB');
  for (const file of files) {
    const name = path.relative(root, file.path);
    assert.ok(file.size <= (name.endsWith('.glb') ? 1_500_000 : 5_000_000), `${name} exceeds its size cap`);
    assert.ok(!/\.(?:json|json5|jsonl|mp4|webm|mov|avi|zip|tar|gz)$/i.test(name), `Forbidden delivery format: ${name}`);
    if (name.endsWith('.html')) assert.ok(file.size < 100_000, `${name}: heavy HTML`);
  }
  for (const required of ['INTEGRATION.md', 'runtime/player.glb', 'runtime/keeper.glb', 'runtime/catalog.mjs', 'runtime/controller.mjs']) {
    assert.ok(files.some(file => path.relative(root, file.path) === required), `Missing ${required}`);
  }
  const runtimeFiles = files.filter(file => file.path.startsWith(fileURLToPath(runtime)));
  for (const file of runtimeFiles.filter(file => /\.(?:mjs|js|html|css)$/.test(file.path) && !file.path.includes('/vendor/'))) {
    const source = await fs.readFile(file.path, 'utf8');
    assert.ok(!/(?:https?:)?\/\/(?:cdn|unpkg|jsdelivr)/i.test(source), `${file.path}: runtime CDN dependency`);
    assert.ok(!/\?v=/.test(source), `${file.path}: forbidden version tag`);
  }
  assert.equal(THREE.REVISION, '160', 'Local Three.js must be r160');
});

test('catalog has unique stable clip identifiers and complete role metadata', () => {
  assert.ok(clips.length >= 14, 'At least 14 clips are required');
  assert.equal(byID.size, clips.length, 'Duplicate clip IDs');
  for (const clip of clips) {
    assert.match(clip.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(['field', 'keeper'].includes(clip.role), `${clip.id}: unknown role`);
    assert.ok(clip.duration > 0 && clip.duration <= 10, `${clip.id}: invalid duration`);
    assert.equal(typeof clip.loop, 'boolean', `${clip.id}: loop must be explicit`);
    assert.equal(clip.rootMotion, false, `${clip.id}: game must retain ownership of actor placement`);
    assert.ok(clip.ball?.radius >= .105 && clip.ball.radius <= .115, `${clip.id}: ball radius is not in metres`);
    assert.ok(Array.isArray(clip.events), `${clip.id}: events array missing`);
  }
  assert.deepEqual(catalog.bones.map(bone => [bone.name, bone.parent, bone.rest]), canonical,
    'Catalog skeleton differs from the authoritative motion2 contract');
  assert.equal(catalog.initial, 'idle');
  for (const id of ['pass_short', 'pass_long', 'pass_loft', 'shot', 'receive_chest', 'receive_foot',
    'first_touch_moving', 'dribble', 'turn_with_ball', 'block', 'shield', 'cut', 'slide', 'keeper_throw']) {
    assert.ok(byID.has(id), `Requested soccer action is missing: ${id}`);
    if (id !== 'shield') assert.ok(byID.get(id).events.some(event => event.type === 'contact' || event.type === 'release'),
      `${id}: no contact or release cue`);
  }
});

for (const [role, filename] of [['field', 'player.glb'], ['keeper', 'keeper.glb']]) {
  test(`${role}: real GLTFLoader decodes the shipped Draco GLB and every native clip`, async () => {
    const url = new URL(filename, runtime), binary = parseGLB(await fs.readFile(url));
    binaries.set(role, binary);
    const json = binary.json;
    assert.ok(json.extensionsUsed?.includes('KHR_draco_mesh_compression'), 'Draco extension missing');
    assert.ok(json.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'Draco must be required');
    assert.ok(json.meshes?.length > 0 && json.skins?.length > 0, 'Missing mesh or skin');
    const parentOf = new Map();
    for (const [i, node] of json.nodes.entries()) for (const child of node.children ?? []) {
      assert.ok(!parentOf.has(child), `Node ${child} has multiple parents`);
      parentOf.set(child, i);
    }
    for (const skin of json.skins) {
      assert.equal(skin.joints.length, 18, 'Skin must have exactly 18 canonical joints');
      assert.deepEqual(skin.joints.map(index => json.nodes[index].name), boneNames);
      for (const [name, expectedParent, translation] of canonical) {
        const nodeIndex = skin.joints.find(index => json.nodes[index].name === name), node = json.nodes[nodeIndex];
        assert.equal(json.nodes[parentOf.get(nodeIndex)]?.name ?? null, expectedParent, `${name}: parent`);
        const values = node.translation ?? [0, 0, 0];
        values.forEach((value, i) => close(value, translation[i], 1e-7, `${name}: bind translation`));
        (node.rotation ?? [0, 0, 0, 1]).forEach((value, i) => close(value, [0, 0, 0, 1][i], 1e-7, `${name}: bind rotation`));
        assert.deepEqual(node.scale ?? [1, 1, 1], [1, 1, 1], `${name}: bind scale`);
      }
      const inverse = readAccessor(binary, skin.inverseBindMatrices);
      assert.equal(inverse.accessor.type, 'MAT4');
      assert.equal(inverse.accessor.count, 18);
      assert.ok(inverse.values.every(Number.isFinite));
    }
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      assert.ok(primitive.extensions?.KHR_draco_mesh_compression, 'Uncompressed primitive');
      assert.ok(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined,
        'Mesh must preserve skin attributes');
    }
    const native = await loadNativeGLTF(url);
    loaded.set(role, native);
    const meshList = []; native.scene.traverse(node => { if (node.isSkinnedMesh) meshList.push(node); });
    assert.ok(meshList.length > 0, 'GLTFLoader produced no skinned mesh');
    assert.ok(meshList.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) <= 8_000,
      'Phone LOD exceeds 8,000 decoded triangles');
    const expected = clips.filter(clip => clip.role === role);
    assert.deepEqual(native.animations.map(clip => clip.name).sort(), expected.map(clip => clip.id).sort(),
      'Native animation list differs from catalog');
    assert.deepEqual(json.animations.map(clip => clip.name).sort(), expected.map(clip => clip.id).sort());
    const mixer = new THREE.AnimationMixer(native.scene);
    for (const clip of native.animations) {
      assert.ok(clip instanceof THREE.AnimationClip && clip.validate(), `${clip.name}: invalid AnimationClip`);
      close(clip.duration, byID.get(clip.name).duration, 1e-5, `${clip.name}: duration`);
      assert.ok(clip.tracks.length >= 19, `${clip.name}: incomplete animation channels`);
      const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      for (const phase of [0, .125, .25, .5, .75, .875, 1]) {
        mixer.setTime(clip.duration * phase);
        native.scene.updateMatrixWorld(true);
        native.scene.traverse(node => assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${clip.name}: non-finite displayed matrix`));
        for (const mesh of meshList) {
          mesh.skeleton.update();
          for (const index of [0, Math.floor(mesh.geometry.attributes.position.count / 2), mesh.geometry.attributes.position.count - 1]) {
            const vertex = mesh.getVertexPosition(index, new THREE.Vector3());
            assert.ok(vertex.toArray().every(Number.isFinite), `${clip.name}: invalid skinned vertex`);
          }
        }
      }
      mixer.stopAllAction();
    }
    mixer.uncacheRoot(native.scene);
  });

  test(`${role}: animation accessors contain finite time-ordered canonical poses`, async () => {
    const binary = binaries.get(role) ?? parseGLB(await fs.readFile(new URL(filename, runtime)));
    for (const animation of binary.json.animations) {
      const channels = new Set();
      for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler], input = readAccessor(binary, sampler.input), output = readAccessor(binary, sampler.output);
        const node = binary.json.nodes[channel.target.node], key = `${node.name}/${channel.target.path}`;
        assert.ok(!channels.has(key), `${animation.name}: duplicate channel ${key}`); channels.add(key);
        assert.ok(boneNames.includes(node.name), `${animation.name}: noncanonical bone ${node.name}`);
        assert.equal(input.accessor.type, 'SCALAR'); assert.equal(input.accessor.componentType, 5126);
        assert.equal(output.accessor.componentType, 5126);
        assert.equal(output.accessor.count, input.accessor.count, `${animation.name}/${key}: input/output key count`);
        assert.ok(input.values.every((time, i) => Number.isFinite(time) && time >= 0 && (!i || time > input.values[i - 1])),
          `${animation.name}/${key}: non-increasing or invalid key times`);
        close(input.values[0], 0, 1e-6, `${animation.name}: first key`);
        close(input.values.at(-1), byID.get(animation.name).duration, 1e-5, `${animation.name}: last key`);
        assert.ok(output.values.every(Number.isFinite), `${animation.name}: non-finite values`);
        assert.ok(['LINEAR', 'STEP'].includes(sampler.interpolation ?? 'LINEAR'), `${animation.name}: unsupported interpolation`);
        if (channel.target.path === 'rotation') {
          assert.equal(output.accessor.type, 'VEC4');
          for (let i = 0; i < output.values.length; i += 4) {
            close(Math.hypot(...output.values.slice(i, i + 4)), 1, 2e-5, `${animation.name}/${key}: quaternion norm`);
            if (node.name === 'Root') {
              close(output.values[i], 0, 1e-7, `${animation.name}: root x rotation`);
              close(output.values[i + 1], 0, 1e-7, `${animation.name}: root y rotation`);
              close(output.values[i + 2], 0, 1e-7, `${animation.name}: root z rotation`);
              close(Math.abs(output.values[i + 3]), 1, 1e-7, `${animation.name}: root identity`);
            }
          }
        } else {
          assert.equal(node.name, 'Hips', `${animation.name}: only Hips may translate`);
          assert.equal(channel.target.path, 'translation'); assert.equal(output.accessor.type, 'VEC3');
        }
      }
      for (const name of boneNames) assert.ok(channels.has(`${name}/rotation`), `${animation.name}: missing ${name}`);
      assert.ok(channels.has('Hips/translation'), `${animation.name}: missing hips track`);
    }
  });
}

test('GLB reader rejects corrupt length and chunk bounds instead of accepting a partial asset', async () => {
  const original = await fs.readFile(new URL('player.glb', runtime));
  const truncated = Buffer.from(original); truncated.writeUInt32LE(original.length + 4, 8);
  assert.throws(() => parseGLB(truncated), /length mismatch/);
  const badChunk = Buffer.from(original); badChunk.writeUInt32LE(0xfffffffc, 12);
  assert.throws(() => parseGLB(badChunk), /chunk length/);
  assert.notEqual(sha(original), sha(truncated));
});

test('runtime GLBs contain only live accessors, live buffer views and alignment padding', async () => {
  for (const role of ['field', 'keeper']) {
    const { json } = await binaryFor(role), accessors = new Set(), views = new Set();
    const addAccessor = index => {
      if (index === undefined) return;
      assert.ok(Number.isInteger(index) && json.accessors[index], `${role}: invalid referenced accessor ${index}`);
      accessors.add(index);
    };
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      addAccessor(primitive.indices);
      Object.values(primitive.attributes).forEach(addAccessor);
      for (const target of primitive.targets ?? []) Object.values(target).forEach(addAccessor);
      const draco = primitive.extensions?.KHR_draco_mesh_compression;
      if (draco) views.add(draco.bufferView);
    }
    for (const skin of json.skins) addAccessor(skin.inverseBindMatrices);
    for (const animation of json.animations) for (const sampler of animation.samplers) {
      addAccessor(sampler.input); addAccessor(sampler.output);
    }
    for (const node of json.nodes) Object.values(node.extensions?.EXT_mesh_gpu_instancing?.attributes ?? {}).forEach(addAccessor);
    for (const index of accessors) {
      const accessor = json.accessors[index];
      if (accessor.bufferView !== undefined) views.add(accessor.bufferView);
      if (accessor.sparse) { views.add(accessor.sparse.indices.bufferView); views.add(accessor.sparse.values.bufferView); }
    }
    for (const image of json.images ?? []) if (image.bufferView !== undefined) views.add(image.bufferView);
    assert.equal(accessors.size, json.accessors.length, `${role}: unused accessors retain obsolete animation data`);
    assert.equal(views.size, json.bufferViews.length, `${role}: unreachable binary buffer views`);
    for (const index of views) assert.ok(Number.isInteger(index) && json.bufferViews[index], `${role}: invalid live view ${index}`);
    const ranges = json.bufferViews.map(view => ({ start: view.byteOffset ?? 0, end: (view.byteOffset ?? 0) + view.byteLength }))
      .sort((a, b) => a.start - b.start);
    let end = 0;
    for (const range of ranges) {
      assert.ok(range.start >= end && range.start - end < 4, `${role}: unreferenced BIN payload between live views`);
      end = range.end;
    }
    assert.ok(json.buffers[0].byteLength >= end && json.buffers[0].byteLength - end < 4,
      `${role}: obsolete binary payload remains after the last live view`);
  }
});

test('transition graph is deterministic, role-safe and connects every clip to its home', () => {
  assert.ok(Array.isArray(catalog.transitions) && catalog.transitions.length >= clips.length,
    'Transition map missing or incomplete');
  const edges = catalog.transitions, keys = new Set();
  for (const edge of edges) {
    const source = byID.get(edge.from), target = byID.get(edge.to);
    assert.ok(source && target, `Transition references missing clip: ${edge.from} → ${edge.to}`);
    assert.equal(source.role, target.role, `Transition crosses roles: ${edge.from} → ${edge.to}`);
    assert.ok(typeof edge.trigger === 'string' && edge.trigger.length, 'Empty transition trigger');
    const key = `${edge.from}/${edge.trigger}`;
    assert.ok(!keys.has(key), `Ambiguous transition trigger ${key}`); keys.add(key);
    assert.ok(Number.isFinite(edge.blend) && edge.blend > 0 && edge.blend <= .6,
      `${key}: invalid blend duration`);
    assert.ok(Number.isFinite(edge.earliest ?? 0) && (edge.earliest ?? 0) >= 0, `${key}: invalid earliest time`);
    assert.ok((edge.latest ?? Infinity) >= (edge.earliest ?? 0), `${key}: backwards transition window`);
    if (edge.latest !== undefined) assert.ok(Number.isFinite(edge.latest), `${key}: non-finite latest time`);
    if (!source.loop) assert.ok((edge.earliest ?? 0) <= source.duration + 1e-6, `${key}: unreachable transition window`);
  }
  const reachable = (start, reverse = false) => {
    const seen = new Set([start]), queue = [start];
    for (const current of queue) for (const edge of edges) {
      const source = reverse ? edge.to : edge.from, target = reverse ? edge.from : edge.to;
      if (source === current && !seen.has(target)) { seen.add(target); queue.push(target); }
    }
    return seen;
  };
  for (const [role, home] of [['field', 'idle'], ['keeper', 'keeper_ready']]) {
    assert.equal(byID.get(home)?.role, role, `${role}: missing home`);
    const fromHome = reachable(home), toHome = reachable(home, true);
    for (const clip of clips.filter(clip => clip.role === role)) {
      assert.ok(fromHome.has(clip.id), `${clip.id}: unreachable from ${home}`);
      assert.ok(toHome.has(clip.id), `${clip.id}: no recovery path to ${home}`);
      if (!clip.loop) assert.ok(edges.some(edge => edge.from === clip.id && edge.trigger === 'finished'),
        `${clip.id}: no completion transition`);
    }
  }
});

test('events and reference trajectories use finite seconds and valid effectors', () => {
  for (const clip of clips) {
    const eventKeys = new Set();
    for (const event of clip.events) {
      assert.ok(Number.isFinite(event.time) && event.time >= 0 && event.time <= clip.duration,
        `${clip.id}: event outside clip`);
      if (event.bone !== undefined) assert.ok(boneNames.includes(event.bone), `${clip.id}: unknown event bone ${event.bone}`);
      if (event.local !== undefined) assert.ok(event.local.length === 3 && event.local.every(Number.isFinite), `${clip.id}: invalid local event point`);
      const key = `${event.time}/${event.name ?? event.type}/${event.bone ?? ''}`;
      assert.ok(!eventKeys.has(key), `${clip.id}: duplicate event ${key}`); eventKeys.add(key);
    }
    for (const [name, keys] of [['travel', clip.travel], ['ball', clip.ball?.keys]]) if (keys?.length) {
      assert.ok(keys.length >= 2, `${clip.id}/${name}: incomplete trajectory`);
      close(keys[0].time, 0, 1e-6, `${clip.id}/${name}: start time`);
      close(keys.at(-1).time, clip.duration, 1e-5, `${clip.id}/${name}: end time`);
      for (const [i, key] of keys.entries()) {
        assert.ok(Number.isFinite(key.time) && (!i || key.time > keys[i - 1].time), `${clip.id}/${name}: unordered keys`);
        assert.ok(key.position.length === 3 && key.position.every(Number.isFinite), `${clip.id}/${name}: invalid position`);
        if (name === 'ball') assert.ok(key.position[1] >= clip.ball.radius - 1e-6,
          `${clip.id}: ball penetrates the floor by ${((clip.ball.radius - key.position[1]) * 1000).toFixed(3)} mm at ${key.time}s`);
      }
    }
  }
});

test('all nine keeper zones have distinct targets and distinct native animation data', async () => {
  const dives = clips.filter(clip => clip.zone), combinations = new Set(), targets = new Set(), hashes = new Set();
  const binary = await binaryFor('keeper');
  assert.equal(dives.length, 9, 'Goalkeeper must cover all nine goal zones');
  for (const clip of dives) {
    assert.equal(clip.role, 'keeper');
    assert.ok(['low', 'middle', 'high'].includes(clip.zone.row));
    assert.ok(['left', 'center', 'right'].includes(clip.zone.col));
    assert.ok(clip.zone.center.length === 3 && clip.zone.center.every(Number.isFinite));
    combinations.add(`${clip.zone.row}/${clip.zone.col}`); targets.add(clip.zone.center.join('/'));
    const animation = binary.json.animations.find(animation => animation.name === clip.id);
    const bytes = animation.channels.flatMap(channel => readAccessor(binary, animation.samplers[channel.sampler].output).values);
    hashes.add(sha(Buffer.from(new Float32Array(bytes).buffer)));
    assert.ok(clip.events.some(event => event.type === 'contact' && /Hand$/.test(event.bone)), `${clip.id}: no glove contact`);
    if (clip.zone.col === 'left') assert.ok(clip.zone.center[0] > 0, `${clip.id}: wrong anatomical left convention`);
    if (clip.zone.col === 'right') assert.ok(clip.zone.center[0] < 0, `${clip.id}: wrong anatomical right convention`);
  }
  assert.equal(combinations.size, 9); assert.equal(targets.size, 9); assert.equal(hashes.size, 9,
    'Nine labels cannot reuse one native animation');
  for (const column of ['left', 'center', 'right']) {
    const y = row => dives.find(clip => clip.zone.col === column && clip.zone.row === row).zone.center[1];
    assert.ok(y('low') < y('middle') && y('middle') < y('high'), `${column}: goal rows are inverted`);
  }
});

test('native FK reaches every event point and ball contact lies on the ball surface', async () => {
  for (const role of ['field', 'keeper']) {
    const native = await nativeFor(role);
    const mixer = new THREE.AnimationMixer(native.scene);
    for (const clip of clips.filter(clip => clip.role === role)) {
      mixer.stopAllAction();
      const action = mixer.clipAction(native.animations.find(animation => animation.name === clip.id))
        .reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      for (const event of clip.events) {
        assert.ok(event.position?.length === 3 && event.position.every(Number.isFinite), `${clip.id}: event world point missing`);
        action.paused = false; action.enabled = true;
        mixer.setTime(event.time); native.scene.updateMatrixWorld(true);
        const node = native.scene.getObjectByName(event.bone);
        assert.ok(node && event.local?.length === 3, `${clip.id}: event has no valid effector`);
        const actual = node.localToWorld(new THREE.Vector3().fromArray(event.local));
        const error = actual.distanceTo(new THREE.Vector3().fromArray(event.position));
        assert.ok(error < .00005, `${clip.id}/${event.type}@${event.time}: native FK misses event by ${error} m`);
        if (event.type === 'contact' || event.type === 'release') {
          const center = pathPosition(clip.ball.keys, event.time);
          close(actual.distanceTo(center), clip.ball.radius, .001, `${clip.id}/${event.type}: ball surface gap`);
        }
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(native.scene);
  }
});

test('native ball cues touch their actual effector skin without intersecting the whole body', async () => {
  const { rows } = await auditBallContacts();
  const expected = clips.flatMap(clip => clip.events.filter(event => ['contact', 'release'].includes(event.type)));
  assert.equal(rows.length, expected.length, 'Surface audit omits contact/release cues');
  for (const row of rows) {
    const label = `${row.id}/${row.event}/${row.bone}@${row.time}`;
    assert.ok(row.surface.distance <= .005, `${label}: authored contact is ${(row.surface.distance * 1000).toFixed(3)} mm from actual effector skin`);
    assert.ok(Math.abs(row.ball.distance - row.radius) <= .005, `${label}: ball/effector surface residual ${(Math.abs(row.ball.distance - row.radius) * 1000).toFixed(3)} mm`);
    assert.ok(row.globalPenetration <= .005, `${label}: sphere intersects actual ${row.globalBall.mesh} triangle ${row.globalBall.triangle} by ${(row.globalPenetration * 1000).toFixed(3)} mm`);
  }
});

test('native ball trajectories stay clear of every actual body surface between cues', { timeout: 120_000 }, async () => {
  const { rows } = await auditBallPaths();
  assert.deepEqual(rows.map(row => row.id).sort(), clips.map(clip => clip.id).sort(), 'Ball path audit omits delivered clips');
  const failures = rows.filter(row => row.worstOverlap > .005);
  assert.equal(failures.length, 0, failures.map(row => `${row.id}@${row.time.toFixed(6)}: ${(row.worstOverlap * 1000).toFixed(3)} mm overlap with ${row.mesh} triangle ${row.triangle}`).join('\n'));
});

test('declared foot plants remain within five millimetres of their fixed reference anchors', async () => {
  for (const role of ['field', 'keeper']) {
    const native = await nativeFor(role);
    const mixer = new THREE.AnimationMixer(native.scene);
    for (const clip of clips.filter(clip => clip.role === role)) {
      mixer.stopAllAction();
      const action = mixer.clipAction(native.animations.find(animation => animation.name === clip.id))
        .reset().setLoop(THREE.LoopOnce, 1).play(); action.clampWhenFinished = true;
      assert.ok(Array.isArray(clip.supports), `${clip.id}: support windows missing`);
      for (const support of clip.supports) {
        assert.ok(['LeftFoot', 'RightFoot'].includes(support.bone), `${clip.id}: invalid planted foot`);
        assert.ok(support.start >= 0 && support.end > support.start && support.end <= clip.duration,
          `${clip.id}: invalid support window`);
        assert.ok(support.anchor.length === 3 && support.anchor.every(Number.isFinite));
        const node = native.scene.getObjectByName(support.bone), anchor = new THREE.Vector3().fromArray(support.anchor);
        for (let i = 0; i <= 20; i++) {
          const time = support.start + (support.end - support.start) * i / 20;
          action.paused = false; action.enabled = true;
          mixer.setTime(time); native.scene.updateMatrixWorld(true);
          const actual = node.localToWorld(new THREE.Vector3(0, -.08, 0)).add(pathPosition(clip.travel, time));
          const error = actual.distanceTo(anchor);
          assert.ok(error <= .005, `${clip.id}/${support.bone}@${time}: plant moves ${error} m from anchor`);
        }
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(native.scene);
  }
});

test('every native clip keeps the actual skinned surface above the floor within five millimetres', async () => {
  const point = new THREE.Vector3();
  for (const role of ['field', 'keeper']) {
    const native = await nativeFor(role), meshes = [], mixer = new THREE.AnimationMixer(native.scene);
    native.scene.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
    for (const clip of clips.filter(clip => clip.role === role)) {
      mixer.stopAllAction();
      const nativeClip = native.animations.find(animation => animation.name === clip.id);
      const action = mixer.clipAction(nativeClip).reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      const times = [...new Set([0, clip.duration, ...clip.events.map(event => event.time),
        ...Array.from({ length: Math.ceil(clip.duration * 60) }, (_, i) => i / 60)])];
      let lowest = Infinity, at = 0, witness;
      for (const time of times) {
        action.paused = false; action.enabled = true; action.time = Math.min(time, nativeClip.duration);
        mixer.update(0); native.scene.updateMatrixWorld(true);
        for (const mesh of meshes) {
          mesh.skeleton.update();
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
            assert.ok(Number.isFinite(point.y), `${clip.id}: non-finite skin height`);
            if (point.y < lowest) { lowest = point.y; at = time; witness = `${mesh.name}/${i}`; }
          }
        }
      }
      assert.ok(lowest >= -.005, `${clip.id}: skin penetrates ${(-lowest * 1000).toFixed(3)} mm at ${at.toFixed(5)}s (${witness})`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(native.scene);
  }
});

test('looping skeleton tracks close without a visible pose discontinuity', async () => {
  for (const role of ['field', 'keeper']) {
    const binary = await binaryFor(role);
    for (const clip of clips.filter(clip => clip.role === role && clip.loop)) {
      const animation = binary.json.animations.find(animation => animation.name === clip.id);
      for (const channel of animation.channels) {
        const data = readAccessor(binary, animation.samplers[channel.sampler].output), first = data.values.slice(0, data.width), last = data.values.slice(-data.width);
        if (channel.target.path === 'rotation') {
          const angle = new THREE.Quaternion().fromArray(first).angleTo(new THREE.Quaternion().fromArray(last));
          assert.ok(angle < Math.PI / 180, `${clip.id}: loop orientation seam exceeds one degree`);
        } else assert.ok(new THREE.Vector3().fromArray(first).distanceTo(new THREE.Vector3().fromArray(last)) < .001,
          `${clip.id}: loop hips seam exceeds one millimetre`);
      }
    }
  }
});

let libraryPromise;
function getLibrary() {
  libraryPromise ??= loadLibrary({ loader: { loadAsync: url => loadNativeGLTF(new URL(url)) } });
  return libraryPromise;
}

test('runtime loader indexes the actual clips and independent controllers own separate bones', async () => {
  const library = await getLibrary();
  assert.equal(library.animations.size, clips.length);
  assert.equal(library.metadata.size, clips.length);
  const a = createController(library, { role: 'field' }), b = createController(library, { role: 'field' });
  try {
    const aHips = a.root.getObjectByName('Hips'), bHips = b.root.getObjectByName('Hips');
    assert.ok(aHips && bHips && aHips !== bHips, 'Clones share animated bones');
    const originalB = bHips.quaternion.toArray(), originalTemplate = library.scenes.field.getObjectByName('Hips').quaternion.toArray();
    const action = clips.find(clip => clip.role === 'field' && !clip.loop && clip.events.length);
    a.reset(action.id).seek(action.duration / 2);
    assert.deepEqual(bHips.quaternion.toArray(), originalB, 'Playing one controller changed its sibling');
    assert.deepEqual(library.scenes.field.getObjectByName('Hips').quaternion.toArray(), originalTemplate, 'Playing a clone changed its template');
    let aMesh, bMesh;
    a.root.traverse(node => { if (node.isSkinnedMesh) aMesh ??= node; });
    b.root.traverse(node => { if (node.isSkinnedMesh) bMesh ??= node; });
    assert.equal(aMesh.geometry, bMesh.geometry, 'Geometry must be shared between clones');
    assert.notEqual(aMesh.skeleton, bMesh.skeleton, 'Animated skeletons must be independent');
    assert.equal(aMesh.skeleton.bones[1], aHips, 'Clone skin still points at template bones');
    a.dispose(); b.update(.1);
    assert.equal(library.disposed, false, 'Controller disposed library resources');
  } finally { a.dispose(); b.dispose(); }
});

test('pause, repeated seek and zero delta are silent; invalid time cannot poison pose state', async () => {
  const library = await getLibrary(), clip = clips.find(clip => clip.role === 'field' && !clip.loop && clip.events.length);
  const emitted = [], controller = createController(library, { start: clip.id, autoReturn: false, onEvent: event => emitted.push(event) });
  try {
    controller.pause().update(clip.duration * 3);
    assert.equal(controller.time, 0); assert.equal(emitted.length, 0);
    controller.seek(clip.duration * .75).seek(clip.duration * .75).update(0);
    assert.equal(emitted.length, 0, 'Seek or zero delta emitted a cue');
    const time = controller.time;
    for (const invalid of [-1, NaN, Infinity]) {
      assert.throws(() => controller.update(invalid), RangeError);
      assert.throws(() => controller.seek(invalid), RangeError);
    }
    assert.equal(controller.time, time);
    controller.resume().seek(0);
    controller.update(clip.duration + .25);
    const expected = clip.events.filter(event => event.time > 0);
    assert.equal(emitted.length, expected.length, 'Resume after seek emitted skipped cues or lost later cues');
    assert.equal(controller.time, clip.duration, 'One-shot must clamp at its end');
    controller.update(clip.duration);
    assert.equal(emitted.length, expected.length, 'One-shot emitted a cue twice');
  } finally { controller.dispose(); }
});

test('loop cues fire once per marker per cycle, including a large delta and exact boundaries', async () => {
  const library = await getLibrary(), clip = clips.find(clip => clip.role === 'field' && clip.loop && clip.events.length);
  assert.ok(clip, 'Missing looping ball action');
  const emitted = [], controller = createController(library, { start: clip.id, autoReturn: false, onEvent: event => emitted.push(event) });
  try {
    controller.update(clip.duration * 2);
    controller.update(0);
    controller.update(clip.duration * .5);
    const horizon = clip.duration * 2.5, scheduled = [];
    for (let cycle = 0; cycle <= 3; cycle++) for (const event of clip.events) {
      const at = cycle * clip.duration + event.time;
      if (at <= horizon + 1e-8) scheduled.push({ at, cycle, event });
    }
    assert.equal(emitted.length, scheduled.length, 'Loop cue count mismatch');
    const signatures = emitted.map(event => `${event.cycle}/${event.time}/${event.name ?? event.type}/${event.bone ?? ''}`);
    assert.equal(new Set(signatures).size, signatures.length, 'Duplicate marker within one loop cycle');
    assert.ok(emitted.every((event, i) => !i || event.at >= emitted[i - 1].at), 'Cues arrived out of time order');
    controller.seek(clip.duration * 5);
    const count = emitted.length; controller.update(0);
    assert.equal(emitted.length, count, 'Seeking to a loop boundary emitted a marker');
  } finally { controller.dispose(); }
});

test('a callback resetting the same state cancels remaining cues from the interrupted playback', async () => {
  const library = await getLibrary(), clip = clips.find(clip => clip.role === 'field' && clip.events.length >= 2);
  assert.ok(clip, 'Need a clip with at least two events');
  const emitted = [];
  let controller;
  controller = createController(library, {
    start: clip.id, autoReturn: true,
    onEvent(event) { emitted.push(event); controller.reset(clip.id); },
  });
  try {
    controller.update(clip.duration + .1);
    assert.equal(emitted.length, 1, 'Interrupted playback leaked queued cues');
    assert.equal(controller.id, clip.id, 'Interrupted playback auto-returned after reset');
    assert.equal(controller.time, 0, 'Reset clock was overwritten by old playback');
  } finally { controller.dispose(); }
});

test('graph windows reject early transitions and finished edges execute automatically', async () => {
  const library = await getLibrary();
  for (const edge of catalog.transitions.filter(edge => edge.trigger === 'finished')) {
    const source = byID.get(edge.from), controller = createController(library, { role: source.role, start: source.id });
    try {
      if ((edge.earliest ?? 0) > 0) {
        assert.equal(controller.request(edge.trigger), false, `${edge.from}: early completion accepted`);
        assert.equal(controller.id, source.id);
      }
      controller.update(source.duration + .001);
      assert.equal(controller.id, edge.to, `${source.id}: wrong automatic recovery target`);
      assert.equal(controller.time, 0, `${source.id}: target starts at a stale time`);
    } finally { controller.dispose(); }
  }
  const controller = createController(library);
  try {
    assert.equal(controller.request('no_such_trigger'), false);
    assert.throws(() => controller.play('no_such_clip'), /unavailable/);
    assert.throws(() => controller.play('keeper_ready'), /unavailable/);
  } finally { controller.dispose(); }
});

test('legal transitions preserve the displayed pose at handoff and complete their blend', async () => {
  const library = await getLibrary();
  for (const edge of catalog.transitions) {
    const source = byID.get(edge.from), controller = createController(library, { role: source.role, start: source.id, autoReturn: false });
    try {
      const at = Math.min(source.duration - 1e-5, Math.max(edge.earliest ?? 0, source.duration * .5));
      controller.seek(at);
      const before = boneNames.map(name => {
        const bone = controller.root.getObjectByName(name);
        return { position: bone.getWorldPosition(new THREE.Vector3()), rotation: bone.getWorldQuaternion(new THREE.Quaternion()) };
      });
      assert.equal(controller.request(edge.trigger), true, `${edge.from}/${edge.trigger}: legal request rejected`);
      for (const [i, name] of boneNames.entries()) {
        const bone = controller.root.getObjectByName(name);
        assert.ok(before[i].position.distanceTo(bone.getWorldPosition(new THREE.Vector3())) < .0001,
          `${edge.from} → ${edge.to}: position pops at ${name}`);
        assert.ok(before[i].rotation.angleTo(bone.getWorldQuaternion(new THREE.Quaternion())) < .001,
          `${edge.from} → ${edge.to}: rotation pops at ${name}`);
      }
      controller.update(edge.blend + .01);
      assert.equal(controller.id, edge.to, 'Blend changed the chosen destination');
      const weights = controller.mixer._actions.filter(action => action.isRunning()).map(action => action.getEffectiveWeight());
      assert.ok(weights.every(weight => weight >= 0 && weight <= 1), 'Blend produced invalid action weights');
      close(weights.reduce((sum, weight) => sum + weight, 0), 1, 1e-5, 'Blend weights do not sum to one');
    } finally { controller.dispose(); }
  }
});

test('interrupting a legal blend preserves the actual displayed pose at zero elapsed time', async () => {
  const library = await getLibrary(), controller = createController(library, { autoReturn: false });
  try {
    assert.equal(controller.play('shield'), true);
    controller.update(.04);
    const displayed = snapshotPose(controller.root);
    assert.equal(controller.play('cut'), true, 'shield → cut must be a legal immediate interrupt');
    assertSamePose(controller.root, displayed, 'mid-blend interrupt');
    controller.update(0);
    assertSamePose(controller.root, displayed, 'zero-delta interrupt');
  } finally { controller.dispose(); }
});

test('rapid legal requests without a clock tick keep one continuous displayed pose', async () => {
  const library = await getLibrary(), controller = createController(library, { autoReturn: false });
  try {
    const displayed = snapshotPose(controller.root);
    for (const id of ['dribble', 'shield', 'dribble', 'shield', 'dribble', 'shield', 'pass_short']) {
      assert.equal(controller.play(id), true, `Legal immediate request rejected: ${controller.id} → ${id}`);
      assertSamePose(controller.root, displayed, `rapid request ${id}`);
      controller.update(0);
      assertSamePose(controller.root, displayed, `rapid zero delta ${id}`);
    }
    controller.update(.17);
    assert.equal(controller.id, 'pass_short');
    assert.ok(snapshotPose(controller.root).every(record => record.position.toArray().every(Number.isFinite)));
  } finally { controller.dispose(); }
});

test('every legal runtime blend preserves floor clearance and zero-time pose continuity', { timeout: 120_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'soccer-v8-transition-test-'));
  try {
    const reportPath = path.join(directory, 'audit.md');
    await runFile(process.execPath, [fileURLToPath(new URL('./audit-transitions.mjs', import.meta.url)), reportPath],
      { cwd: root, timeout: 110_000, maxBuffer: 2_000_000 });
    const report = await fs.readFile(reportPath, 'utf8');
    const summary = report.match(/Edges below −5 mm skin tolerance: (\d+)\/(\d+)\. Handoffs exceeding 1 µm or 1 µrad: (\d+)\/(\d+)\. Non-finite cases: (\d+)\./);
    assert.ok(summary, 'Independent transition audit did not produce a complete result');
    assert.equal(Number(summary[2]), catalog.transitions.length, 'Transition audit omitted legal edges');
    assert.equal(Number(summary[4]), catalog.transitions.length, 'Transition continuity audit omitted legal edges');
    assert.equal(Number(summary[5]), 0, 'Transition playback produced non-finite geometry or poses');
    const violations = report.split('\n').filter(line => {
      if (!line.startsWith('| ') || !line.includes(' → ')) return false;
      const fields = line.split('|').map(field => field.trim());
      return Number(fields[3]) < -5;
    });
    assert.equal(Number(summary[1]), 0, `Native/controller blends penetrate the floor:\n${violations.join('\n')}`);
    assert.equal(Number(summary[3]), 0, 'A legal handoff changes the displayed pose at zero elapsed time');
    const support = report.match(/Shared support drifts above 5 mm before the destination support release: (\d+)\/(\d+)\./);
    assert.ok(support, 'Transition audit omitted shared support carry');
    assert.equal(Number(support[2]), catalog.transitions.length);
    assert.equal(Number(support[1]), 0, 'A declared shared support foot slides before its authored release');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('optional demonstration travel never changes the game-owned root transform', async () => {
  const library = await getLibrary(), clip = clips.find(clip => clip.role === 'field' && clip.travel?.some(key => key.position.some(value => Math.abs(value) > .01)));
  assert.ok(clip, 'No traveling action found');
  const stationary = createController(library, { start: clip.id, autoReturn: false });
  const traveling = createController(library, { start: clip.id, autoReturn: false, applyTravel: true });
  try {
    for (const controller of [stationary, traveling]) {
      controller.root.position.set(3, .5, -2); controller.root.rotation.y = .73;
      controller.update(clip.duration * .75);
      assert.deepEqual(controller.root.position.toArray(), [3, .5, -2]);
      close(controller.root.rotation.y, .73, 1e-9);
    }
    assert.deepEqual(stationary.root.children[0].position.toArray(), [0, 0, 0], 'Default playback adds root travel twice');
    assert.ok(traveling.root.children[0].position.length() > .01, 'Demonstration travel is missing');
    assert.ok(stationary.ballPosition().toArray().every(Number.isFinite));
    assert.ok(traveling.ballPosition().toArray().every(Number.isFinite));
  } finally { stationary.dispose(); traveling.dispose(); }
});

test('contact carry works beneath translated, yawed and uniformly scaled game roots', async () => {
  const library = await getLibrary(), point = new THREE.Vector3();
  for (const scale of [.7, 1, 1.4]) {
    const controller = createController(library, { autoReturn: false, applyTravel: true });
    try {
      controller.root.position.set(3, 0, -2); controller.root.rotation.y = .73; controller.root.scale.setScalar(scale);
      controller.reset('idle');
      const rootPosition = controller.root.position.toArray(), rootRotation = controller.root.quaternion.toArray(), rootScale = controller.root.scale.toArray();
      const foot = controller.root.getObjectByName('LeftFoot'), anchor = foot.localToWorld(new THREE.Vector3(0, -.08, 0));
      const meshes = []; controller.root.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
      assert.equal(controller.play('dribble'), true);
      for (let i = 1; i <= 12; i++) {
        controller.update(1 / 60); controller.root.updateMatrixWorld(true);
        const actual = foot.localToWorld(new THREE.Vector3(0, -.08, 0));
        assert.ok(actual.distanceTo(anchor) <= .005, `Scale ${scale}: carried sole moved ${actual.distanceTo(anchor)} m`);
        assert.deepEqual(controller.root.position.toArray(), rootPosition, 'Solver moved the game-owned root');
        assert.deepEqual(controller.root.quaternion.toArray(), rootRotation, 'Solver rotated the game-owned root');
        assert.deepEqual(controller.root.scale.toArray(), rootScale, 'Solver rescaled the game-owned root');
        for (const mesh of meshes) {
          mesh.skeleton.update();
          for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
            mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
            assert.ok(point.y >= -.005, `Scale ${scale}: corrected world skin penetrates at ${controller.time}s`);
          }
        }
      }
    } finally { controller.dispose(); }
  }
});

test('carried support records its authored release and eventPosition follows the displayed rig', async () => {
  const library = await getLibrary(), controller = createController(library, { autoReturn: false, applyTravel: true });
  try {
    assert.equal(controller.play('dribble'), true);
    const end = byID.get('dribble').supports.find(support => support.bone === 'LeftFoot' && support.start === 0).end;
    controller.update(end - .001);
    const held = controller.contacts.contacts.find(contact => contact.bone === 'LeftFoot');
    assert.ok(held?.held && held.weight > .999, 'Shared support was silently released before its authored end');
    controller.update(.012);
    const released = controller.contacts.contacts.find(contact => contact.bone === 'LeftFoot');
    assert.ok(released && released.releaseReason, 'Authored support release was not recorded');
    assert.equal(released.releaseReason, 'authored-support-window-ended');
    assert.ok(released.releaseTime >= end - 1e-8, 'Support release starts before the authored window ends');
    close(released.releaseDuration, .06, 1e-9, 'Support release duration');
    assert.ok(released.weight >= 0 && released.weight < 1, 'Released support has no smooth outgoing weight');

    controller.root.position.set(-2, 0, 4); controller.root.rotation.y = -.61; controller.root.scale.setScalar(1.3);
    controller.reset('idle'); assert.equal(controller.play('shot'), true); controller.update(.04);
    const cue = byID.get('shot').events.find(event => event.type === 'contact');
    const actual = controller.root.getObjectByName(cue.bone).localToWorld(new THREE.Vector3().fromArray(cue.local));
    const resolved = controller.eventPosition(cue, new THREE.Vector3());
    assert.ok(actual.distanceTo(resolved) < 1e-6, 'eventPosition does not follow the displayed transformed effector');
  } finally { controller.dispose(); }
});

test('runtime rejects missing native clips and cleans up already decoded resources', async () => {
  let geometryDisposals = 0;
  await assert.rejects(loadLibrary({
    roles: ['field'],
    loader: { async loadAsync(url) {
      const result = await loadNativeGLTF(new URL(url));
      result.scene.traverse(node => { if (node.geometry) node.geometry.addEventListener('dispose', () => geometryDisposals++); });
      result.animations = [];
      return result;
    } },
  }), /Missing native clip/);
  assert.ok(geometryDisposals > 0, 'Failed load leaked decoded geometry');
  await assert.rejects(loadLibrary({ roles: ['field', 'field'] }), /roles/);
  await assert.rejects(loadLibrary({ roles: [] }), /roles/);
});

test('library disposal is idempotent and blocks creating a controller from freed resources', async () => {
  const library = await loadLibrary({ roles: ['field'], loader: { loadAsync: url => loadNativeGLTF(new URL(url)) } });
  let disposals = 0;
  library.scenes.field.traverse(node => { if (node.geometry) node.geometry.addEventListener('dispose', () => disposals++); });
  library.dispose(); const once = disposals; library.dispose();
  assert.ok(once > 0); assert.equal(disposals, once, 'Double disposal repeated resource destruction');
  assert.throws(() => createController(library), /unavailable/);
});

function webpDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'Not a WebP RIFF image');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', 'Not a WebP image');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP declared length mismatch');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), data = offset + 8;
    assert.ok(data + length <= bytes.length, 'Truncated WebP chunk');
    if (type === 'VP8X') return [bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1];
    if (type === 'VP8L') {
      assert.equal(bytes[data], 0x2f); const bits = bytes.readUInt32LE(data + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (type === 'VP8 ') {
      assert.equal(bytes.toString('hex', data + 3, data + 6), '9d012a', 'Invalid WebP frame');
      return [bytes.readUInt16LE(data + 6) & 0x3fff, bytes.readUInt16LE(data + 8) & 0x3fff];
    }
    offset = data + length + (length % 2);
  }
  throw new Error('WebP has no image dimensions');
}
function quotedCSV(text) {
  return text.trim().split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)]
    .map(match => match[1].replaceAll('""', '"')));
}

test('at least six rounds are documented; only the latest two keep all eight-frame sheets', async () => {
  const iterations = path.join(root, 'iterations'), entries = await fs.readdir(iterations, { withFileTypes: true });
  const rounds = entries.filter(entry => entry.isDirectory() && /^\d{2}$/.test(entry.name)).map(entry => entry.name).sort();
  assert.equal(rounds.length, 2, 'Keep exactly two numeric iteration directories');
  assert.equal(Number(rounds[0]) + 1, Number(rounds[1]), 'Retained rounds must be consecutive');
  const last = Number(rounds.at(-1)); assert.ok(last >= 6, 'At least six complete review rounds are required');
  const history = await fs.readFile(path.join(iterations, 'history.md'), 'utf8');
  const archived = [...history.matchAll(/^- (\d{2}) · SHA-256 ([a-f0-9]{64}) · (.+)$/gm)];
  assert.equal(archived.length, last - 2, 'Each older round needs exactly one text archive line');
  assert.equal(new Set(archived.map(match => match[1])).size, archived.length, 'Duplicate history round');
  for (let round = 1; round <= last - 2; round++) {
    assert.ok(archived.some(match => Number(match[1]) === round), `Missing archived round ${round}`);
  }
  for (const round of rounds) {
    const directory = path.join(iterations, round), frames = path.join(directory, 'frames');
    const cueRows = quotedCSV(await fs.readFile(path.join(directory, 'cue-times.csv'), 'utf8'));
    assert.deepEqual(cueRows.shift(), ['clip', 'type', 'seconds'], `${round}: cue provenance header`);
    const roundIDs = [...new Set(cueRows.map(row => row[0]))];
    assert.ok(roundIDs.length >= 14, `${round}: incomplete clip cue provenance`);
    const roundCues = cueRows.map(([id, type, seconds]) => ({ id, type, seconds: Number(seconds) }));
    for (const id of roundIDs) {
      assert.match(id, /^[a-z][a-z0-9_]*$/);
      const starts = roundCues.filter(cue => cue.id === id && cue.type === 'start'), ends = roundCues.filter(cue => cue.id === id && cue.type === 'end');
      assert.equal(starts.length, 1, `${round}/${id}: missing or duplicate start cue`);
      assert.equal(ends.length, 1, `${round}/${id}: missing or duplicate end cue`);
      close(starts[0].seconds, 0);
      assert.ok(ends[0].seconds > 0 && ends[0].seconds <= 10);
      assert.ok(roundCues.filter(cue => cue.id === id).every(cue => ['start', 'end', 'contact', 'release', 'takeoff', 'land'].includes(cue.type)
        && Number.isFinite(cue.seconds) && cue.seconds >= 0 && cue.seconds <= ends[0].seconds + 1e-8), `${round}/${id}: invalid required cue`);
    }
    if (round === rounds.at(-1)) {
      assert.deepEqual([...roundIDs].sort(), clips.map(clip => clip.id).sort(), 'Latest cue provenance omits delivered clips');
      const sortCues = cues => [...cues].sort((a, b) => `${a.id}/${a.type}`.localeCompare(`${b.id}/${b.type}`) || a.seconds - b.seconds);
      const expected = sortCues(clips.flatMap(clip => [{ id: clip.id, type: 'start', seconds: 0 }, { id: clip.id, type: 'end', seconds: clip.duration },
        ...clip.events.filter(event => ['contact', 'release', 'takeoff', 'land'].includes(event.type))
          .map(event => ({ id: clip.id, type: event.type, seconds: event.time }))]));
      const actual = sortCues(roundCues);
      assert.equal(actual.length, expected.length, 'Latest capture cue provenance omits required events');
      for (let i = 0; i < expected.length; i++) {
        assert.equal(actual[i].id, expected[i].id); assert.equal(actual[i].type, expected[i].type);
        close(actual[i].seconds, expected[i].seconds, 1e-6, `${actual[i].id}/${actual[i].type}: latest required cue`);
      }
    }
    const names = await fs.readdir(frames);
    assert.equal(names.filter(name => name.endsWith('.webp')).length, roundIDs.length * 4, `${round}: incomplete frame matrix`);
    const report = await fs.readFile(path.join(directory, 'capture.md'), 'utf8');
    assert.match(report, /Status: captured\. Complete clip matrix requested\./, `${round}: incomplete capture`);
    assert.ok(report.includes(`Clips requested: ${roundIDs.length}/${roundIDs.length}. Sheets completed: ${roundIDs.length * 4}/${roundIDs.length * 4}.`));
    const review = await fs.readFile(path.join(directory, 'review.md'), 'utf8');
    assert.ok(review.trim().length > 100, `${round}: review and corrective decision missing`);
    const rows = quotedCSV(await fs.readFile(path.join(directory, 'measurements.csv'), 'utf8'));
    const header = rows.shift(), columns = Object.fromEntries(header.map((name, i) => [name, i]));
    assert.equal(rows.length, roundIDs.length * 4 * 8, `${round}: eight measurements per clip/view are required`);
    for (const id of roundIDs) for (const viewport of ['390x844', '844x390']) for (const camera of ['near', 'far']) {
      const filename = `${id}-${viewport}-${camera}.webp`, bytes = await fs.readFile(path.join(frames, filename));
      assert.deepEqual(webpDimensions(bytes), viewport === '390x844' ? [1560, 1748] : [3376, 840],
        `${round}/${filename}: sheet must contain eight native-size viewport captures plus captions`);
      const records = rows.filter(row => row[columns.clip] === id && row[columns.viewport] === viewport && row[columns.camera] === camera);
      assert.equal(records.length, 8, `${round}/${filename}: expected eight captured frame records`);
      assert.deepEqual(records.map(row => Number(row[columns.frame])).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
      const times = records.map(row => Number(row[columns.seconds])).sort((a, b) => a - b);
      assert.ok(times.every((time, i) => Number.isFinite(time) && time >= 0 && (!i || time > times[i - 1])),
        `${round}/${filename}: frames need eight distinct valid cue times`);
      close(times[0], 0);
      for (const cue of roundCues.filter(cue => cue.id === id)) assert.ok(times.some(time => Math.abs(time - cue.seconds) <= 1e-6),
        `${round}/${filename}: required ${cue.type} at ${cue.seconds}s is missing from the eight captured frames`);
      close(times.at(-1), roundCues.find(cue => cue.id === id && cue.type === 'end').seconds, 1e-6);
      const reportLine = report.split('\n').find(line => line.startsWith(`| ${id} | ${viewport} | ${camera} |`));
      assert.ok(reportLine?.includes(sha(bytes)), `${round}/${filename}: image differs from the captured hash`);
      if (round === rounds.at(-1)) assert.ok(records.every(row => row[columns.inside_camera] === 'true'), `${filename}: displayed actor leaves the camera`);
    }
  }
});

test('retained captures show every contact and release clearly in all four views', async () => {
  const iterations = path.join(root, 'iterations');
  const rounds = (await fs.readdir(iterations, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d{2}$/.test(entry.name)).map(entry => entry.name).sort();
  assert.equal(rounds.length, 2, 'Contact visibility needs exactly the two retained rounds');
  const views = ['390x844', '844x390'], cameras = ['near', 'far'];
  for (const round of rounds) {
    const directory = path.join(iterations, round), report = await fs.readFile(path.join(directory, 'capture.md'), 'utf8');
    const parse = async (filename, expected) => {
      const bytes = await fs.readFile(path.join(directory, filename));
      const rows = quotedCSV(bytes.toString('utf8'));
      assert.deepEqual(rows.shift(), expected, `${round}/${filename}: measured CSV schema`);
      const recorded = report.split('\n').find(line => line.startsWith(`| ${filename} |`));
      assert.ok(recorded?.includes(sha(bytes)), `${round}/${filename}: capture hash differs`);
      assert.ok(rows.every(row => row.length === expected.length), `${round}/${filename}: truncated measured row`);
      return rows.map(row => Object.fromEntries(expected.map((name, i) => [name, row[i]])));
    };
    const contacts = await parse('contact-visibility.csv', ['clip', 'viewport', 'camera', 'frame', 'seconds', 'type', 'bone', 'point',
      'center_x_px', 'center_y_px', 'radius_px', 'world_radius_m', 'occluded_by', 'outside_stage']);
    const overlays = await parse('overlay-rects.csv', ['clip', 'viewport', 'camera', 'measured_at_seconds', 'name', 'left_px', 'top_px',
      'right_px', 'bottom_px', 'width_px', 'height_px']);
    const cueRows = quotedCSV(await fs.readFile(path.join(directory, 'cue-times.csv'), 'utf8'));
    assert.deepEqual(cueRows.shift(), ['clip', 'type', 'seconds']);
    const cues = cueRows.filter(row => ['contact', 'release'].includes(row[1])).map(([id, type, seconds]) => ({ id, type, seconds: Number(seconds) }));
    const cueGroups = [...new Set(cues.map(cue => `${cue.id}/${cue.type}/${cue.seconds}`))].map(key => cues.find(cue => `${cue.id}/${cue.type}/${cue.seconds}` === key));
    const measurements = quotedCSV(await fs.readFile(path.join(directory, 'measurements.csv'), 'utf8'));
    const measurementHeader = measurements.shift(), measurementColumns = Object.fromEntries(measurementHeader.map((name, i) => [name, i]));
    assert.equal(contacts.length, (cues.length + cueGroups.length) * 4, `${round}: missing or extra measured contact disks`);
    for (const rect of overlays) {
      assert.ok(views.includes(rect.viewport) && cameras.includes(rect.camera));
      for (const key of ['measured_at_seconds', 'left_px', 'top_px', 'right_px', 'bottom_px', 'width_px', 'height_px']) assert.ok(Number.isFinite(Number(rect[key])), `${round}: non-finite HUD ${key}`);
      assert.ok(Number(rect.width_px) > 0 && Number(rect.height_px) > 0);
      close(Number(rect.right_px) - Number(rect.left_px), Number(rect.width_px), 1e-5);
      close(Number(rect.bottom_px) - Number(rect.top_px), Number(rect.height_px), 1e-5);
    }
    for (const row of contacts) {
      const label = `${round}/${row.clip}/${row.viewport}/${row.camera}/${row.type}/${row.seconds}/${row.point}/${row.bone}`;
      assert.ok(views.includes(row.viewport) && cameras.includes(row.camera), `${label}: invalid view`);
      assert.ok(['contact', 'release'].includes(row.type) && ['ball', 'effector'].includes(row.point));
      assert.ok(cues.some(cue => cue.id === row.clip && cue.type === row.type && Math.abs(cue.seconds - Number(row.seconds)) <= 1e-7), `${label}: not an authored cue`);
      for (const key of ['frame', 'seconds', 'center_x_px', 'center_y_px', 'radius_px', 'world_radius_m']) assert.ok(Number.isFinite(Number(row[key])), `${label}: non-finite ${key}`);
      assert.ok(Number(row.radius_px) > 0 && Number(row.world_radius_m) > 0, `${label}: empty measured disk`);
      assert.equal(row.occluded_by, '', `${label}: measured HUD occlusion`);
      assert.equal(row.outside_stage, 'false', `${label}: measured point leaves the stage`);
      const [width, height] = row.viewport.split('x').map(Number), x = Number(row.center_x_px), y = Number(row.center_y_px), radius = Number(row.radius_px);
      assert.ok(x - radius >= 0 && y - radius >= 0 && x + radius <= width && y + radius <= height, `${label}: disk crosses viewport boundary`);
      assert.ok(row.point === 'ball' ? row.bone === '' : boneNames.includes(row.bone), `${label}: invalid effector bone`);
      const frame = measurements.find(record => record[measurementColumns.clip] === row.clip && record[measurementColumns.viewport] === row.viewport
        && record[measurementColumns.camera] === row.camera && Number(record[measurementColumns.frame]) === Number(row.frame));
      assert.ok(frame, `${label}: no captured frame for measured disk`);
      close(Number(frame[measurementColumns.seconds]), Number(row.seconds), 1e-7, `${label}: disk time differs from captured frame`);
      const geometry = overlays.filter(rect => rect.clip === row.clip && rect.viewport === row.viewport && rect.camera === row.camera);
      assert.ok(geometry.length > 0, `${label}: no measured HUD rectangles`);
      for (const rect of geometry) {
        // Recompute raw disk/rectangle separation from measured coordinates rather
        // than accepting the preview's boolean. Padding stays a viewer policy.
        const nearX = Math.max(Number(rect.left_px), Math.min(x, Number(rect.right_px)));
        const nearY = Math.max(Number(rect.top_px), Math.min(y, Number(rect.bottom_px)));
        assert.ok((x - nearX) ** 2 + (y - nearY) ** 2 > radius ** 2, `${label}: disk intersects measured HUD ${rect.name}`);
      }
    }
    for (const cue of cueGroups) for (const viewport of views) for (const camera of cameras) {
      const records = contacts.filter(row => row.clip === cue.id && row.type === cue.type && row.viewport === viewport && row.camera === camera && Math.abs(Number(row.seconds) - cue.seconds) <= 1e-7);
      assert.equal(records.filter(row => row.point === 'ball').length, 1, `${round}/${cue.id}: each cue type needs one ball disk in every view`);
      const effectors = records.filter(row => row.point === 'effector');
      const count = cues.filter(item => item.id === cue.id && item.type === cue.type && Math.abs(item.seconds - cue.seconds) <= 1e-7).length;
      assert.equal(effectors.length, count, `${round}/${cue.id}: each contacting bone needs a disk in every view`);
      assert.equal(new Set(effectors.map(row => row.bone)).size, effectors.length, `${round}/${cue.id}: duplicate bone masks a missing hand`);
      if (round === rounds.at(-1)) {
        const expectedBones = byID.get(cue.id).events.filter(event => event.type === cue.type && Math.abs(event.time - cue.seconds) <= 1e-7).map(event => event.bone).sort();
        assert.deepEqual(effectors.map(row => row.bone).sort(), expectedBones, `${cue.id}: delivered effector differs from latest capture`);
      }
    }
  }
});

test('latest browser capture matches every delivered runtime and preview byte', async () => {
  const iterations = path.join(root, 'iterations');
  const rounds = (await fs.readdir(iterations, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d{2}$/.test(entry.name)).map(entry => entry.name).sort();
  assert.ok(rounds.length, 'No browser capture evidence');
  const report = await fs.readFile(path.join(iterations, rounds.at(-1), 'capture.md'), 'utf8');
  const hashes = new Map([...report.matchAll(/^\| (runtime\/[^|]+|preview\.(?:html|css|mjs)) \| (\d+) \| ([a-f0-9]{64}) \|$/gm)]
    .map(match => [match[1], { bytes: Number(match[2]), hash: match[3] }]));
  const files = [...await walkFiles(fileURLToPath(runtime)), ...await Promise.all(['preview.html', 'preview.css', 'preview.mjs']
    .map(async name => ({ path: path.join(root, name), size: (await fs.stat(path.join(root, name))).size })))];
  assert.equal(hashes.size, files.length, 'Capture provenance omits runtime or preview files');
  for (const file of files) {
    const name = path.relative(root, file.path), recorded = hashes.get(name);
    assert.ok(recorded, `No capture provenance for ${name}`);
    assert.equal(recorded.bytes, file.size, `${name}: size changed after capture`);
    assert.equal(recorded.hash, sha(await fs.readFile(file.path)), `${name}: runtime changed after latest capture`);
  }
});

test.after(async () => {
  if (libraryPromise) (await libraryPromise).dispose();
});
