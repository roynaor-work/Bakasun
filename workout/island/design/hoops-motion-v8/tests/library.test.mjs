import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {loadClip, sampleClip, disposeClip, createMotionPlayer, CANONICAL_BONE_NAMES} from '../runtime/library.mjs';

const rotation = Object.fromEntries(CANONICAL_BONE_NAMES.map(name => [name, [0, 0, 0, 1]]));
const frame = time => ({time, rotations: structuredClone(rotation), hipsOffsetMeters: [time, 0, 0],
  referenceRootTranslationMeters: [0, 0, 0], ballPositionMeters: [0, 1 + time, 0]});
const fixture = {id: 'pass_chest', durationSeconds: 2, loop: false,
  skeleton: {bones: CANONICAL_BONE_NAMES.map(name => ({name}))}, keyframes: [frame(0), frame(1)]};

test('gzip loading supports injected binary IO and a package-relative URL', async () => {
  let requested;
  const loaded = await loadClip('pass_chest', {readFile: async url => {requested = url; return gzipSync(JSON.stringify(fixture));}});
  assert.ok(requested.href.endsWith('/hoops-motion-v8/runtime/keyframes/pass_chest.json.gz'));
  assert.equal(loaded.data.durationSeconds, 2);
  assert.equal(loaded.meta.durationSeconds, 2);
  assert.equal(loaded.format, 'json');
  assert.deepEqual(sampleClip(loaded, 1).hipsOffsetMeters, [.5, 0, 0]);
  assert.deepEqual(sampleClip(loaded, 1).ballPositionMeters, [0, 1.5, 0]);
});

test('fetch already transparently decoded gzip is accepted and HTTP errors retain context', async () => {
  const fetch = async () => new Response(JSON.stringify(fixture), {status: 200});
  const loaded = await loadClip('pass_chest', {baseURL: 'https://local.invalid/package/', fetch});
  assert.equal(loaded.id, 'pass_chest');
  await assert.rejects(loadClip('pass_chest', {baseURL: 'https://local.invalid/', fetch: async () => new Response('', {status: 404})}), /HTTP 404/);
});

test('unknown IDs, malformed gzip and canonical skeleton mismatch fail before playback', async () => {
  let calls = 0;
  await assert.rejects(loadClip('../other', {readFile: async () => {calls++;}}), RangeError);
  await assert.rejects(loadClip('pass_chest', {format: 'video'}), RangeError);
  assert.equal(calls, 0);
  await assert.rejects(loadClip('pass_chest', {readFile: async () => Buffer.from([0x1f, 0x8b, 0])}));
  await assert.rejects(loadClip('pass_chest', {readFile: async () => gzipSync(JSON.stringify({...fixture, skeleton: {bones: []}}))}), /Canonical skeleton mismatch/);
});

test('sampling clamps one-shots, wraps only when requested, takes shortest quaternion arc and rejects invalid time', () => {
  assert.equal(sampleClip(fixture, -2).timeSeconds, 0);
  assert.equal(sampleClip(fixture, 20).timeSeconds, 2);
  assert.equal(sampleClip(fixture, 2.5, {loop: true}).timeSeconds, .5);
  const opposite = structuredClone(fixture);
  opposite.keyframes[1].rotations.Root = [0, 0, 0, -1];
  assert.deepEqual(sampleClip(opposite, 1).rotations.Root, [0, 0, 0, 1]);
  assert.deepEqual(sampleClip(fixture, 1).ballRotationQuaternion, [0, 0, 0, 1]);
  const spinning = structuredClone(fixture);
  spinning.keyframes[0].ballRotationQuaternion = [0, 0, 0, 1];
  spinning.keyframes[1].ballRotationQuaternion = [0, 0, -1, 0];
  const middle = sampleClip(spinning, 1).ballRotationQuaternion;
  assert.ok(Math.abs(middle[2] + Math.SQRT1_2) < 1e-8 && Math.abs(middle[3] - Math.SQRT1_2) < 1e-8);
  spinning.keyframes[1].ballRotationQuaternion = [0, 0, 0, -1];
  assert.deepEqual(sampleClip(spinning, 1).ballRotationQuaternion, [0, 0, 0, 1]);
  for (const seconds of [NaN, Infinity, -Infinity]) assert.throws(() => sampleClip(fixture, seconds), TypeError);
});

async function disposableFixture(id = 'receive_two_hands') {
  const THREE = await import('../runtime/vendor/three.module.js');
  const counts = {geometry: 0, material: 0, texture: 0, image: 0};
  const image = {width: 1, height: 1, close() {counts.image++;}};
  const texture = new THREE.Texture(image), geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial({map: texture});
  texture.addEventListener('dispose', () => counts.texture++);
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  return {THREE, counts, loaded: {id, scene, meta: {durationSeconds: 1, loop: false, events: []},
    animation: new THREE.AnimationClip(id, 1, [new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 0, 0])])}};
}

test('disposeClip detaches a scene and releases shared geometry, material, texture and ImageBitmap exactly once', async () => {
  const {THREE, counts, loaded} = await disposableFixture();
  const parent = new THREE.Group(); parent.add(loaded.scene);
  const first = disposeClip(loaded);
  assert.deepEqual(first, {geometries: 1, materials: 1, textures: 1, skeletons: 0, images: 1});
  assert.equal(loaded.scene.parent, null);
  assert.deepEqual(counts, {geometry: 1, material: 1, texture: 1, image: 1});
  assert.deepEqual(disposeClip(loaded), {geometries: 0, materials: 0, textures: 0, skeletons: 0, images: 0});
  assert.deepEqual(disposeClip({scene: loaded.scene}), {geometries: 0, materials: 0, textures: 0, skeletons: 0, images: 0});
  assert.deepEqual(counts, {geometry: 1, material: 1, texture: 1, image: 1});
});

test('player caches owned clips, holds idle without IO, and releases its resources on disposal', async () => {
  const {THREE, counts, loaded} = await disposableFixture();
  let loads = 0;
  const player = createMotionPlayer({THREE, ownsLoadedClips: true, load: async () => {loads++; return loaded;}});
  assert.equal((await player.play('receive_two_hands')).ok, true);
  assert.equal((await player.play('idle')).ok, true);
  assert.equal(player.playing, false);
  assert.equal((await player.play('receive_two_hands')).ok, true);
  assert.equal(loads, 1);
  player.dispose(); player.dispose();
  assert.deepEqual(counts, {geometry: 1, material: 1, texture: 1, image: 1});
});

test('injected loader resources remain caller-owned unless ownership is explicitly transferred', async () => {
  const {THREE, counts, loaded} = await disposableFixture();
  const player = createMotionPlayer({THREE, load: async () => loaded});
  await player.play('receive_two_hands'); player.dispose();
  assert.deepEqual(counts, {geometry: 0, material: 0, texture: 0, image: 0});
  disposeClip(loaded);
  assert.deepEqual(counts, {geometry: 1, material: 1, texture: 1, image: 1});
});

test('owned resources arriving after player disposal are still released once', async () => {
  const {THREE, counts, loaded} = await disposableFixture();
  let resolve;
  const player = createMotionPlayer({THREE, ownsLoadedClips: true, load: () => new Promise(done => {resolve = done;})});
  const pending = player.play('receive_two_hands'); player.dispose();
  resolve(loaded);
  assert.equal((await pending).reason, 'superseded');
  assert.deepEqual(counts, {geometry: 1, material: 1, texture: 1, image: 1});
});
