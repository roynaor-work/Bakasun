import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadClip, sampleClip, disposeClip, disposeRuntime, createClipController, createMotionPlayer, CATALOG, CLIP_IDS, CANONICAL_BONE_NAMES} from '../runtime/library.mjs';
import {inspectPackage} from '../source/check-package.mjs';
import {auditClip} from '../source/audit-motion.mjs';

const cached = new Map();
const load = id => {if (!cached.has(id)) cached.set(id, loadClip(id, {format: 'glb'})); return cached.get(id);};
const add = (a, b) => a.map((value, index) => value + b[index]);
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const quaternionDot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const quaternionAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(quaternionDot(a, b)) / (Math.hypot(...a) * Math.hypot(...b))));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = JSON.parse(await readFile(new URL('../../motion2/hoops.json', import.meta.url))).skeleton;

test('package stays within every exact byte cap and contains matching self-contained clips', async () => {
  const report = await inspectPackage();
  assert.deepEqual(report.errors, []);
  assert.equal(report.glbs, CLIP_IDS.length);
  assert.equal(report.keyframes, CLIP_IDS.length);
  assert.equal(CLIP_IDS.length, 15);
});

for (const entry of CATALOG) test(`${entry.id}: real GLTFLoader + Draco WASM decodes meshes, skin, all18 animation tracks and WebP metadata`, async () => {
  const loaded = await load(entry.id), {data, animation, scene} = loaded;
  assert.equal(animation.name, entry.id);
  assert.ok(Math.abs(animation.duration - data.durationSeconds) < 1e-5);
  for (const key of ['durationSeconds', 'loop', 'startState', 'endState']) assert.equal(entry[key], data[key], `${entry.id}.${key}`);
  assert.deepEqual(data.skeleton.bones.map(bone => bone.name), CANONICAL_BONE_NAMES);
  assert.equal(data.rootMotion, false);
  const names = new Set(animation.tracks.filter(track => track.name.endsWith('.quaternion') && track.name !== 'Ball.quaternion').map(track => track.name.slice(0, -11)));
  assert.deepEqual([...names].sort(), [...CANONICAL_BONE_NAMES].sort());
  assert.ok(animation.tracks.some(track => track.name === 'Ball.quaternion'), `${entry.id} has a dedicated ball spin track`);
  let vertices = 0, skinned = 0, textures = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    vertices += object.geometry.attributes.position.count;
    assert.ok(object.geometry.index?.count > 0);
    assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
    if (object.isSkinnedMesh) {
      skinned++;
      assert.ok(object.geometry.attributes.skinIndex && object.geometry.attributes.skinWeight);
      const weights = object.geometry.attributes.skinWeight;
      for (let i = 0; i < weights.count; i++) {
        const total = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
        assert.ok(Math.abs(total - 1) < .002, `skin weight ${i}: ${total}`);
      }
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.map) {
      textures++;
      const image = material.map.userData.nodeImageMetadata;
      assert.ok(image.width > 0 && image.height > 0 && image.bytes > 20);
      assert.equal(image.mimeType, 'image/webp');
      assert.equal(image.pixelsDecoded, false); // pixel rendering is tested in Chromium
    }
  });
  assert.ok(vertices > 100 && skinned > 0 && textures > 0);
  const raw = await readFile(new URL(`../runtime/keyframes/${entry.id}.json.gz`, import.meta.url));
  assert.deepEqual([...raw.subarray(0, 2)], [0x1f, 0x8b]);
  const provenance = loaded.gltf.parser.json.extras;
  assert.match(provenance?.keyframeSha256 || '', /^[a-f0-9]{64}$/, `${entry.id} embeds its exact gzip input SHA-256`);
  assert.match(provenance?.previewModelSha256 || '', /^[a-f0-9]{64}$/, `${entry.id} embeds its base model SHA-256`);
  assert.equal(provenance.keyframeSha256, sha256(raw), `${entry.id} GLB was exported from a different gzip generation`);
  const model = await readFile(new URL('../source/preview-model.glb', import.meta.url));
  assert.equal(provenance.previewModelSha256, sha256(model), `${entry.id} GLB was exported from a different preview model generation`);
  assert.equal(data.keyframes[0].time, 0); assert.equal(data.keyframes.at(-1).time, 1);
  let previous = -1;
  for (const frame of data.keyframes) {
    assert.ok(frame.time > previous); previous = frame.time;
    assert.deepEqual(Object.keys(frame.rotations).sort(), [...CANONICAL_BONE_NAMES].sort());
    for (const q of Object.values(frame.rotations)) assert.ok(q.length === 4 && Math.abs(Math.hypot(...q) - 1) < 1e-6);
    assert.ok(frame.ballPositionMeters.every(Number.isFinite));
    assert.ok(frame.ballPositionMeters[1] >= data.ball.radiusMeters - .005);
  }
  for (const event of data.events) {
    assert.equal(event.domain, 'presentation');
    assert.ok(event.time >= 0 && event.time <= 1);
    assert.ok(Math.abs(event.atSeconds - event.time * data.durationSeconds) < 1e-6);
  }
});

test('independent full-window FK audit checks canonical skeleton, contacts, referenced plants, release velocity and floor bounds', async () => {
  for (const id of CLIP_IDS) {
    const {data} = await load(id);
    const audit = auditClip(data, canonical);
    assert.deepEqual(audit.errors, [], `${id}: ${audit.errors.join('; ')}`);
  }
});

test('quality checks reject changed canonical bind, shifted held ball and a non-unit joint quaternion', async () => {
  const {data} = await load('receive_two_hands');
  const changedBind = structuredClone(data);
  changedBind.skeleton.bones.find(bone => bone.name === 'Hips').restTranslationMeters[1] += .01;
  assert.equal(auditClip(changedBind, canonical).pass, false);
  const shifted = structuredClone(data);
  for (const frame of shifted.keyframes) frame.ballPositionMeters[0] += .2;
  assert.ok(auditClip(shifted, canonical).errors.some(error => error.includes('surface error')));
  const badQuaternion = structuredClone(data);
  badQuaternion.keyframes[5].rotations.LeftArm = [0, 0, 0, 2];
  assert.equal(auditClip(badQuaternion, canonical).pass, false);
  const translatedJointSpike = structuredClone(data);
  translatedJointSpike.keyframes[Math.floor(translatedJointSpike.keyframes.length / 2)].hipsOffsetMeters[0] += .25;
  assert.ok(auditClip(translatedJointSpike, canonical).errors.some(error => /(?:linear.speed|speed limit|12 m\/s)/i.test(error)),
    'A 25 cm single-key translation spike must fail the joint linear-speed gate even when all joint quaternions remain normalized');
});

test('GLB and gzip JSON match at off-key sample times for all18 bone rotations, hips and ball', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  for (const id of CLIP_IDS) {
    const loaded = await load(id), controller = createClipController({THREE, clip: loaded});
    for (const t of [0, .08371, .27713, .50477, .81239, 1]) {
      const seconds = t * loaded.data.durationSeconds, expected = sampleClip(loaded, seconds);
      controller.seek(seconds);
      for (const name of CANONICAL_BONE_NAMES) {
        const q = loaded.scene.getObjectByName(name).quaternion.toArray();
        const dot = Math.abs(q.reduce((sum, value, index) => sum + value * expected.rotations[name][index], 0));
        assert.ok(Math.abs(dot - 1) < 2e-6, `${id} ${name} quaternion t=${t}`);
      }
      const hipsRest = loaded.data.skeleton.bones.find(bone => bone.name === 'Hips').restTranslationMeters;
      assert.ok(distance(loaded.scene.getObjectByName('Hips').position.toArray(), add(hipsRest, expected.hipsOffsetMeters)) < 1e-5, `${id} Hips t=${t}`);
      assert.ok(distance(loaded.scene.getObjectByName('Ball').position.toArray(), expected.ballPositionMeters) < 1e-5, `${id} Ball t=${t}`);
      assert.ok(quaternionAngle(loaded.scene.getObjectByName('Ball').quaternion.toArray(), expected.ballRotationQuaternion) < 1e-5,
        `${id} ball rotation t=${t}`);
    }
    controller.dispose();
  }
});

test('ball spin uses finite unit quaternions, continuous hemispheres and bounded phase and loop seams', async () => {
  for (const id of CLIP_IDS) {
    const {data} = await load(id);
    let previous;
    for (const [index, frame] of data.keyframes.entries()) {
      const q = frame.ballRotationQuaternion;
      assert.ok(Array.isArray(q) && q.length === 4 && q.every(Number.isFinite), `${id} ball quaternion ${index}`);
      assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-6, `${id} ball quaternion norm ${index}`);
      assert.deepEqual(data.ball.trajectory[index].rotationQuaternion, q, `${id} trajectory/keyframe ball rotation ${index}`);
      if (previous) {
        assert.ok(quaternionDot(previous.ballRotationQuaternion, q) >= 0, `${id} ball hemisphere flip ${index}`);
        const angle = quaternionAngle(previous.ballRotationQuaternion, q);
        const seconds = (frame.time - previous.time) * data.durationSeconds;
        assert.ok(angle < .2 && angle / seconds < 20, `${id} ball spin jump ${index}: ${angle} radians / ${seconds} seconds`);
      }
      previous = frame;
    }
    const boundaries = [...data.events.map(event => event.atSeconds),
      ...data.ballContactWindows.flatMap(window => [window.startTime * data.durationSeconds, window.endTime * data.durationSeconds])];
    for (const seconds of boundaries) {
      const before = sampleClip(data, seconds - .001).ballRotationQuaternion;
      const after = sampleClip(data, seconds + .001).ballRotationQuaternion;
      assert.ok(quaternionAngle(before, after) < .05, `${id} ball phase boundary at ${seconds}`);
    }
    if (data.loop) {
      assert.ok(quaternionAngle(data.keyframes[0].ballRotationQuaternion, data.keyframes.at(-1).ballRotationQuaternion) < 1e-5, `${id} ball loop endpoints`);
      const before = sampleClip(data, data.durationSeconds - .001).ballRotationQuaternion;
      const after = sampleClip(data, data.durationSeconds + .001, {loop: true}).ballRotationQuaternion;
      assert.ok(quaternionAngle(before, after) < .05, `${id} ball loop seam`);
    }
  }
});

test('one-shots hold the last pose, seek is silent, and loop events cross boundaries exactly once', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  const loaded = await load('stop_two_feet'), received = [];
  const controller = createClipController({THREE, clip: loaded, onEvent: event => received.push(event)});
  controller.seek(.2); assert.equal(received.length, 0);
  controller.seek(0).update(loaded.meta.durationSeconds * 3);
  assert.equal(controller.time, controller.duration); assert.equal(controller.playing, false);
  const pose = loaded.scene.getObjectByName('LeftHand').quaternion.toArray();
  controller.update(10);
  assert.deepEqual(loaded.scene.getObjectByName('LeftHand').quaternion.toArray(), pose);
  assert.equal(received.length, loaded.meta.events.length);
  assert.ok(received.every(event => event.domain === 'presentation'));
  controller.seek(0); assert.equal(controller.time, 0);
  const loop = await load('dribble_idle'); received.length = 0;
  controller.play(loop).update(loop.meta.durationSeconds * 2.1);
  const expected = loop.meta.events.filter(event => event.time <= .1).length + loop.meta.events.length * 2;
  assert.equal(received.length, expected); assert.equal(controller.playing, true);
  assert.throws(() => controller.update(-.1), RangeError);
  assert.throws(() => controller.seek(NaN), TypeError);
  controller.dispose();
});

test('recommended player refuses indirect double-dribble before loading and only new authority permits it', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  let loads = 0;
  const player = createMotionPlayer({THREE, possession: {epoch: 1, owner: 'self'}, load: id => {loads++; return load(id);}});
  for (const id of ['receive_moving', 'dribble_run', 'stop_two_feet', 'pivot', 'receive_two_hands']) {
    assert.equal((await player.play(id)).ok, true);
  }
  const before = loads, held = player.clip;
  assert.equal((await player.play('dribble_idle')).reason, 'dribble-ended-this-possession');
  assert.equal(loads, before); assert.equal(player.clip, held);
  player.seek(held.meta.durationSeconds); player.update(5);
  assert.equal(player.context.dribbleEnded, true);
  player.authorizePossession({epoch: 2, owner: 'self'});
  assert.equal((await player.play('dribble_idle')).ok, true);
  player.dispose();
  assert.equal((await player.play('dribble_run')).reason, 'disposed');
});

test('a stale asynchronous load cannot play after authority changes', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  let resolveFirst;
  const player = createMotionPlayer({THREE, possession: {epoch: 1, owner: 'self'}, load: id => new Promise(resolve => {resolveFirst = () => load(id).then(resolve);})});
  const pending = player.play('receive_two_hands');
  player.authorizePossession({epoch: 2, owner: 'other'});
  await resolveFirst();
  assert.equal((await pending).reason, 'superseded');
  assert.equal(player.state, 'idle'); assert.equal(player.clip, null);
  player.dispose();
});

test('the newest valid playback request wins when clip loads resolve out of order', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  const pending = new Map();
  const player = createMotionPlayer({THREE, possession: {epoch: 1, owner: 'self'},
    load: id => new Promise(resolve => pending.set(id, () => load(id).then(resolve)))});
  const first = player.play('receive_two_hands'), second = player.play('receive_moving');
  await pending.get('receive_moving')();
  assert.equal((await second).ok, true);
  await pending.get('receive_two_hands')();
  assert.equal((await first).reason, 'superseded');
  assert.equal(player.state, 'receive_moving');
  assert.equal(player.clip.id, 'receive_moving');
  player.dispose();
});

test('default player owns and releases every unique geometry, material and atlas texture it loads', async () => {
  const THREE = await import('../runtime/vendor/three.module.js');
  const player = createMotionPlayer({THREE});
  await player.play('receive_two_hands');
  const resources = new Set(), disposed = new Map();
  player.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) {disposed.set(resource, 0); resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));}
  assert.ok(resources.size > 3);
  player.dispose(); player.dispose();
  assert.ok([...disposed.values()].every(count => count === 1));
});

test('runtime decoder cleanup waits for outstanding clip IO and parse to settle', async () => {
  let release, disposed = false;
  const gate = new Promise(resolve => {release = resolve;});
  const pending = loadClip('receive_two_hands', {format: 'glb', readFile: async url => {await gate; return readFile(url);}});
  const cleanup = disposeRuntime().then(() => {disposed = true;});
  await Promise.resolve();
  assert.equal(disposed, false);
  release();
  const loaded = await pending;
  await cleanup;
  assert.equal(disposed, true);
  assert.ok(loaded.animation.tracks.length >= 20);
  disposeClip(loaded);
});
