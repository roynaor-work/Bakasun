import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {cloneSoccerRig, playerSoccerClip} from '../workout/island/minigames/soccer-rig.mjs';
import {createAthleteMotion} from '../workout/island/minigames/soccer-athlete-motion.mjs';
import {createQualityMonitor} from '../workout/island/minigames/soccer-presentation.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const config = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.soccer;

/** The real athlete.glb without image references, so it parses in Node (same trick as the pause test). */
async function athlete() {
  const b = await readFile(new URL('../workout/island/assets/athlete/athlete.glb', import.meta.url));
  const L = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + L).toString());
  delete j.images; delete j.textures; delete j.samplers; delete j.extensionsUsed; delete j.extensionsRequired;
  j.materials = (j.materials || []).map(x => ({name: x.name}));
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bin = b.subarray(20 + L), out = Buffer.alloc(20 + js.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20); bin.copy(out, 20 + js.length);
  return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset, out.byteOffset + out.length), '');
}
const gltf = await athlete();

test('quality monitor: fast frames never step down, even over a long match', () => {
  const q = createQualityMonitor({slowFrameMs: 25, qualityWindowSeconds: 2, qualityQuickFrames: 20, qualityQuickFactor: 1.8, qualityGraceSeconds: 1});
  for (let i = 0; i < 60 * 90; i++) assert.equal(q.sample(16.7), false);
});

test('quality monitor: frames far over budget step down within the quick window, after the grace period', () => {
  const q = createQualityMonitor({slowFrameMs: 25, qualityWindowSeconds: 2, qualityQuickFrames: 20, qualityQuickFactor: 1.8, qualityGraceSeconds: 1});
  const steps = []; let elapsed = 0;
  for (let i = 0; i < 200; i++) { elapsed += 60; if (q.sample(60)) steps.push(elapsed); }
  assert.ok(steps[0] >= 1000 + 19 * 60 && steps[0] <= 1000 + 21 * 60, `one second of grace, then twenty slow frames (${steps[0]} ms)`);
  assert.ok(steps.length >= 2 && steps.every((at, i) => i === 0 || at - steps[i - 1] >= 1000 + 19 * 60), `each further step waits for its own grace and window (${steps.join(', ')})`);
});

test('quality monitor: moderately slow frames step on the window average, not on the quick path', () => {
  const q = createQualityMonitor({slowFrameMs: 25, qualityWindowSeconds: 2, qualityQuickFrames: 20, qualityQuickFactor: 1.8, qualityGraceSeconds: 1});
  let at = null, elapsed = 0;
  for (let i = 0; i < 400 && at === null; i++) { elapsed += 30; if (q.sample(30)) at = elapsed; }
  assert.ok(at > 1000 + 2000 - 30 && at <= 1000 + 2000 + 30, `window of two seconds after the grace (${at} ms)`);
});

test('quality monitor: one huge sample still steps (browser harness contract), zero and NaN are ignored', () => {
  const q = createQualityMonitor(config.view);
  assert.equal(q.sample(0), false); assert.equal(q.sample(NaN), false);
  assert.equal(q.sample(20000), true);
});

test('cloned rig: every skinned mesh of a player shares one skeleton; players never share bones', () => {
  const a = cloneSoccerRig(gltf.scene), b = cloneSoccerRig(gltf.scene);
  const skeletons = root => { const set = new Set(), meshes = []; root.traverse(o => { if (o.isSkinnedMesh) { set.add(o.skeleton); meshes.push(o); } }); return {set, meshes}; };
  const sa = skeletons(a), sb = skeletons(b);
  assert.ok(sa.meshes.length >= 2, 'skin and kit meshes');
  assert.equal(sa.set.size, 1, 'one skeleton per player (one bone update and one bone texture per frame)');
  assert.notEqual([...sa.set][0], [...sb.set][0], 'each player owns its skeleton');
  const bones = [...sa.set][0].bones, inside = new Set(); a.traverse(o => inside.add(o));
  assert.ok(bones.every(bone => inside.has(bone)), 'bones are the cloned nodes');
  assert.equal(bones.length, 31);
  for (const mesh of sa.meshes) assert.ok(mesh.bindMatrixInverse.elements.some(v => v !== 0), 'bind matrices stay per mesh');
});

test('render state is reused between frames, interpolates, and never feeds back into the simulation', () => {
  const game = createSoccer({config, seed: 5, stage: 1, difficulty: 'normal', role: 'field', league: true});
  game.update(1 / 60, {moveX: 1, moveZ: 0});
  const first = game.renderState();
  game.update(1 / 120, {moveX: 1, moveZ: 0});
  const second = game.renderState();
  assert.equal(first, second, 'one presentation copy, overwritten each frame');
  assert.equal(second.players.length, game.getState().players.length);
  const live = game.getState().players[game.getState().controlled], shown = second.players[game.getState().controlled];
  assert.notEqual(shown, live, 'the copy is not the simulation object');
  assert.equal(shown.vx, live.vx);
  shown.x += 100; second.ball.x += 100;
  assert.notEqual(game.getState().players[game.getState().controlled].x, shown.x, 'writing the copy does not touch the simulation');
  assert.notEqual(game.getState().ball.x, second.ball.x);
});

test('athlete motion returns one reused summary object and keeps the same clip weights as before', () => {
  const root = cloneSoccerRig(gltf.scene), mixer = new T.AnimationMixer(root);
  const motion = createAthleteMotion(T, mixer, gltf.animations.map(playerSoccerClip), config.view.athlete.motion);
  const player = {id: 1, team: 0, role: 'striker', x: 0, z: 0, fx: 0, fz: 1, vx: 3, vz: 0, kickTime: 0, stealTime: 0, headerTime: 0, throwTime: 0, diveTime: 0, catchTime: 0, hands: false};
  const state = {controlled: 0, sprint: {active: false}, ball: {x: 2, y: 0, z: 4, vx: 0, vz: 0, lastPlayer: null}};
  const a = motion.update(player, state, 'run', 1 / 60), b = motion.update(player, state, 'run', 1 / 60);
  assert.equal(a, b, 'no per-frame summary allocation');
  assert.ok(b.speed > 0 && b.rate > 0 && b.warp >= 1);
  for (let i = 0; i < 60; i++) motion.update(player, state, 'run', 1 / 60);
  const sum = Object.values(motion.weights).reduce((n, w) => n + w, 0);
  assert.ok(sum > 0.9 && sum < 1.1, `locomotion weights blend to one (${sum.toFixed(3)})`);
  assert.ok(motion.weights.jog + motion.weights.run > 0.8, 'running at 3 m/s is jog/run');
});
