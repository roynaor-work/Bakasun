import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EXERCISES as catalog } from '../workout/js/exercises.js';
import { EXERCISES as cameraExercises } from '../workout/cam-lab/counter.mjs';
import * as T from '../codex-lab/kid-full/vendor/three.module.js';
import { GLTFLoader } from '../codex-lab/kid-full/vendor/GLTFLoader.js';

// Read the exported delivery, rather than rebuilding clips with their authoring code.
const bytes = await readFile(new URL('../codex-lab/kid-full/kid-full.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
assert.equal(bytes.readUInt32LE(4), 2, 'glTF 2.0');
assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared byte length');
const chunks = new Map();
for (let offset = 12; offset < bytes.length;) {
  assert.ok(offset + 8 <= bytes.length, 'complete chunk header');
  const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
  assert.equal(length % 4, 0, 'chunk is four-byte aligned');
  assert.ok(offset + 8 + length <= bytes.length, 'chunk fits the GLB');
  assert.ok(!chunks.has(type), 'no duplicated JSON/BIN chunks');
  chunks.set(type, bytes.subarray(offset + 8, offset + 8 + length));
  offset += 8 + length;
}
assert.ok(chunks.has(0x4e4f534a) && chunks.has(0x004e4942), 'embedded JSON and BIN');
const gltf = JSON.parse(chunks.get(0x4e4f534a).toString('utf8'));
const bin = chunks.get(0x004e4942);
const expected = ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge'];
const expressionNames = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'];
const animations = new Map((gltf.animations || []).map(clip => [clip.name, clip]));
const arity = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function accessor(index) {
  const definition = gltf.accessors[index];
  assert.ok(definition, `accessor ${index} exists`);
  assert.equal(definition.componentType, 5126, 'animation accessor uses FLOAT');
  assert.ok(!definition.sparse, 'exported animation accessor is densely stored');
  assert.ok(!definition.normalized, 'animation floats are not normalized integers');
  const width = arity[definition.type];
  assert.ok(width, `supported animation accessor type ${definition.type}`);
  const view = gltf.bufferViews[definition.bufferView];
  assert.ok(view && view.buffer === 0, 'animation accessor uses embedded buffer');
  const stride = view.byteStride || width * 4;
  assert.ok(stride >= width * 4 && stride % 4 === 0, 'valid float stride');
  const start = (view.byteOffset || 0) + (definition.byteOffset || 0);
  const end = start + (definition.count - 1) * stride + width * 4;
  assert.ok(definition.count >= 2 && end <= (view.byteOffset || 0) + view.byteLength && end <= bin.length,
    'animation accessor fits its buffer view');
  const values = Array.from({ length: definition.count }, (_, row) =>
    Array.from({ length: width }, (_, component) => bin.readFloatLE(start + row * stride + component * 4)));
  assert.ok(values.flat().every(Number.isFinite), 'all animation values are finite');
  return { definition, values };
}

function requireClip(name) {
  assert.ok(animations.has(name), `GLB contains ${name}`);
  return animations.get(name);
}

function tracks(clip) {
  assert.ok(clip.channels?.length > 0 && clip.samplers?.length > 0, `${clip.name} has animated channels`);
  const bindings = new Set();
  return clip.channels.map(channel => {
    const { node, path } = channel.target;
    assert.ok(gltf.nodes[node], `${clip.name}: animated node exists`);
    assert.ok(['translation', 'rotation', 'scale', 'weights'].includes(path), 'valid animation target');
    const binding = `${node}/${path}`;
    assert.ok(!bindings.has(binding), `${clip.name}: no duplicate animated binding ${binding}`);
    bindings.add(binding);
    const sampler = clip.samplers[channel.sampler];
    assert.ok(sampler, `${clip.name}: sampler exists`);
    const interpolation = sampler.interpolation || 'LINEAR';
    assert.ok(['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation), 'valid glTF interpolation');
    const input = accessor(sampler.input), output = accessor(sampler.output);
    assert.equal(input.definition.type, 'SCALAR', 'key times use SCALAR');
    const times = input.values.flat();
    assert.ok(times.every((time, i) => time >= 0 && (i === 0 || time > times[i - 1])),
      `${clip.name}: key times are nonnegative and strictly increasing`);
    assert.ok(Math.abs(times[0]) <= 1e-6, `${clip.name}: track starts at zero`);
    const width = path === 'rotation' ? 4 : path === 'weights'
      ? gltf.meshes[gltf.nodes[node].mesh].primitives[0].targets.length : 3;
    assert.equal(output.definition.type, path === 'rotation' ? 'VEC4' : path === 'weights' ? 'SCALAR' : 'VEC3');
    const multiplier = interpolation === 'CUBICSPLINE' ? 3 : 1;
    const flat = output.values.flat();
    assert.equal(flat.length, times.length * width * multiplier, `${clip.name}: output matches the key times`);
    const keys = times.map((_, i) => flat.slice((i * multiplier + (multiplier === 3 ? 1 : 0)) * width,
      (i * multiplier + (multiplier === 3 ? 1 : 0) + 1) * width));
    if (path === 'rotation') for (const key of keys) {
      assert.ok(Math.abs(Math.hypot(...key) - 1) <= 2e-5, `${clip.name}: rotation quaternion is unit length`);
    }
    return { node, path, times, keys, interpolation };
  });
}

function delta(a, b, path) {
  const same = Math.max(...a.map((value, i) => Math.abs(value - b[i])));
  // q and -q represent the same orientation.
  return path === 'rotation' ? Math.min(same, Math.max(...a.map((value, i) => Math.abs(value + b[i])))) : same;
}

test('camera exercise contract matches the seven catalog identifiers and exported clip names', () => {
  assert.deepEqual([...cameraExercises].sort(), [...expected].sort());
  assert.ok(expected.every(id => catalog.some(exercise => exercise.id === id)), 'all camera IDs are catalog IDs');
  assert.equal(animations.size, gltf.animations.length, 'clip names are unique');
  for (const id of expected) requireClip(id);
  for (const id of ['stand', 'run', 'kick']) requireClip(id);
});

test('single GLB preserves the 31-joint rig, six expressions and the 20,000-triangle budget', () => {
  assert.equal(gltf.buffers.length, 1, 'one embedded buffer');
  assert.ok(!gltf.buffers[0].uri, 'GLB needs no external buffer');
  assert.ok((gltf.images || []).every(image => !image.uri && Number.isInteger(image.bufferView)), 'images are embedded');
  assert.ok(gltf.skins.length > 0, 'skinned character is present');
  const boneNames = new Set();
  for (const skin of gltf.skins) {
    assert.equal(skin.joints.length, 31, '31 joints in each exported skin');
    for (const node of skin.joints) boneNames.add(gltf.nodes[node].name);
  }
  assert.equal(boneNames.size, 31, 'both skins share the same named rig');
  for (const name of ['Hips', 'Spine', 'Chest', 'Neck', 'Head']) assert.ok(boneNames.has(name));
  for (const side of ['L', 'R']) for (const name of ['UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toe']) {
    assert.ok(boneNames.has(`${name}_${side}`), `preserved joint ${name}_${side}`);
  }
  let triangles = 0, expressionMeshes = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, 'character primitive is TRIANGLES');
    const count = gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
    assert.equal(count % 3, 0, 'complete triangles');
    triangles += count / 3;
    if (!primitive.targets?.length) continue;
    expressionMeshes++;
    assert.deepEqual(mesh.extras?.targetNames, expressionNames, 'six named expression morphs survive export');
    assert.equal(primitive.targets.length, 6);
    for (const target of primitive.targets) for (const semantic of ['POSITION', 'NORMAL']) {
      assert.equal(gltf.accessors[target[semantic]].count, gltf.accessors[primitive.attributes.POSITION].count,
        `expression ${semantic} retains mesh topology`);
    }
  }
  assert.ok(expressionMeshes > 0, 'expression-bearing mesh is present');
  assert.ok(triangles > 0 && triangles <= 20000, `GLB has ${triangles} triangles, budget is 20000`);
});

test('augmentation preserves the captured base binary and its original animation accessors', async () => {
  const base = gltf.asset.extras?.exerciseAnimationBase;
  assert.ok(base, 'export records its preserved animation base');
  assert.equal(base.animations, 3, 'base contains stand/run/kick');
  assert.ok(Number.isInteger(base.byteLength) && base.byteLength > 0 && base.byteLength <= bin.length);
  assert.equal(createHash('sha256').update(bin.subarray(0, base.byteLength)).digest('hex'), base.binarySHA256,
    'original geometry, expressions, textures and animation binary is unchanged');
  const historicalCapture = JSON.parse(await readFile(new URL('../codex-lab/kid-full/shots/metrics.json', import.meta.url), 'utf8'));
  assert.equal(base.sourceSHA256, historicalCapture.glb.sha256, 'preserved base is the previously captured character');
  assert.deepEqual(gltf.animations.slice(0, base.animations).map(clip => clip.name), ['stand', 'run', 'kick']);
  for (const clip of gltf.animations.slice(0, base.animations)) for (const sampler of clip.samplers) {
    for (const index of [sampler.input, sampler.output]) {
      assert.ok(index < base.accessors, 'original clip still uses its base accessor');
      const viewIndex = gltf.accessors[index].bufferView, view = gltf.bufferViews[viewIndex];
      assert.ok(viewIndex < base.bufferViews && (view.byteOffset || 0) + view.byteLength <= base.byteLength,
        'original animation data remains in the preserved buffer prefix');
    }
  }
});

for (const id of expected) {
  test(`${id}: every track spans one 1.5–2.5 second clip with valid finite keys`, () => {
    const all = tracks(requireClip(id));
    const duration = Math.max(...all.map(track => track.times.at(-1)));
    assert.ok(duration >= 1.5 && duration <= 2.5, `${id}: duration ${duration} seconds`);
    for (const track of all) assert.ok(Math.abs(track.times.at(-1) - duration) <= 1e-6,
      `${id}: every track reaches the clip end`);
    assert.ok(all.some(track => track.path !== 'weights' && track.keys.some(key =>
      delta(key, track.keys[0], track.path) > .03)), `${id}: character moves through a meaningful repetition`);
  });

  test(`${id}: raw exported first and last keys close the loop`, () => {
    for (const track of tracks(requireClip(id))) assert.ok(delta(track.keys[0], track.keys.at(-1), track.path) <= 2e-6,
      `${id}: ${gltf.nodes[track.node].name}/${track.path} closes without a jump`);
  });
}

for (const id of expected) {
  test(`${id}: actual exported skinned vertices stay above the floor throughout interpolation`, async () => {
    const { scene, animations: clips } = await loadExport();
    const clip = clips.find(candidate => candidate.name === id);
    assert.ok(clip, `local GLTFLoader loaded ${id}`);
    const surfaces = [], skeletons = new Set();
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      // The retained football is hidden by these clips; it is not a body contact surface.
      for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) if (ancestor.name === 'Ball') return;
      surfaces.push(mesh);
      if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
    });
    assert.ok(surfaces.length > 0 && skeletons.size > 0, 'real exported geometry and skin are sampled');
    const mixer = new T.AnimationMixer(scene), action = mixer.clipAction(clip);
    action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const point = new T.Vector3(), hip = new T.Vector3(), spine = new T.Vector3(), chest = new T.Vector3();
    const straightBack = ['squats', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge'].includes(id);
    try {
      // 81 samples include positions between the baked keys. Use the loader's
      // actual inverse bind matrices, morph weights and skinning implementation.
      for (let i = 0; i <= 80; i++) {
        const seconds = clip.duration * i / 80;
        mixer.setTime(seconds); scene.updateMatrixWorld(true);
        for (const skeleton of skeletons) skeleton.update();
        let minimumY = Infinity, finite = true;
        for (const mesh of surfaces) for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          finite &&= Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
          minimumY = Math.min(minimumY, point.y);
        }
        assert.ok(finite && Number.isFinite(minimumY), `${id}: finite deformed geometry at ${seconds}s`);
        assert.ok(minimumY >= -.015, `${id}: lowest exported vertex ${minimumY}m penetrates the floor at ${seconds}s`);
        if (straightBack) {
          scene.getObjectByName('Hips').getWorldPosition(hip);
          scene.getObjectByName('Spine').getWorldPosition(spine);
          scene.getObjectByName('Chest').getWorldPosition(chest);
          const error = spine.sub(hip).cross(chest.sub(hip).normalize()).length();
          assert.ok(error <= 2e-4, `${id}: back bends ${error}m away from the hip–chest line at ${seconds}s`);
        }
      }
    } finally {
      mixer.stopAllAction(); mixer.uncacheRoot(scene);
    }
  });
}

// The local loader consumes the actual GLB. Node does not decode canvas textures;
// only material loading is replaced. Geometry, morphs, rig and animation loading
// and AnimationMixer interpolation remain the production Three.js code.
let loaded;
function loadExport() {
  if (!loaded) {
    const loader = new GLTFLoader();
    loader.register(() => ({ name: 'NODE_TEST_MATERIAL', loadMaterial: () => Promise.resolve(new T.MeshBasicMaterial()) }));
    loaded = loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  }
  return loaded;
}

function pose(scene) {
  scene.updateMatrixWorld(true);
  const values = [];
  scene.traverse(node => values.push(...node.matrixWorld.elements, ...(node.morphTargetInfluences || [])));
  assert.ok(values.every(Number.isFinite), 'mixer produces finite transforms and morph weights');
  return values;
}

function poseDelta(a, b) {
  assert.equal(a.length, b.length, 'sampled scene topology is stable');
  return Math.max(...a.map((value, i) => Math.abs(value - b[i])));
}

for (const id of expected) {
  test(`${id}: local AnimationMixer reaches the end pose and crosses a repeat boundary continuously`, async () => {
    const { scene, animations: clips } = await loadExport();
    const clip = clips.find(candidate => candidate.name === id);
    assert.ok(clip, `local GLTFLoader loaded ${id}`);
    const mixer = new T.AnimationMixer(scene), action = mixer.clipAction(clip);
    action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    mixer.setTime(0); const start = pose(scene);
    for (let i = 1; i < 24; i++) { mixer.setTime(clip.duration * i / 24); pose(scene); }
    mixer.setTime(clip.duration); const end = pose(scene);
    assert.ok(poseDelta(start, end) <= 5e-6, `${id}: sampled non-wrapping endpoint closes the loop`);
    action.reset().setLoop(T.LoopRepeat, Infinity).play();
    mixer.setTime(clip.duration - 1e-5); const before = pose(scene);
    mixer.setTime(clip.duration + 1e-5); const after = pose(scene);
    assert.ok(poseDelta(before, after) <= 1e-3, `${id}: no jump when the actual player wraps the clip`);
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
  });
}
