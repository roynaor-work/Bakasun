import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {cloneSoccerRig, playerSoccerClip} from '../workout/island/minigames/soccer-rig.mjs';
import {createAthleteMotion, athleteLook, ATHLETE_BONES} from '../workout/island/minigames/soccer-athlete-motion.mjs';
import {createAthleteBody} from '../workout/island/minigames/soccer-athlete-body.mjs';

const config = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.soccer;
const m = config.view.athlete.motion;

/** The real athlete.glb, with image/texture/material references removed so it parses in Node.
 * Skeleton, skin and the 13 clips are untouched. */
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

function rig() {
  const root = cloneSoccerRig(gltf.scene), pivot = new T.Group(); pivot.add(root);
  const mixer = new T.AnimationMixer(root), motion = createAthleteMotion(T, mixer, gltf.animations.map(playerSoccerClip), m);
  const bones = Object.fromEntries(Object.entries(ATHLETE_BONES).map(([k, n]) => [k, {bone: root.getObjectByName(n)}]));
  const character = {pivot, root, bones, yaw: 0, lookWeight: 1};
  const body = createAthleteBody(T, character, m);
  const player = {id: 1, team: 0, role: 'striker', x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, kickTime: 0, stealTime: 0, headerTime: 0, throwTime: 0, diveTime: 0, catchTime: 0, hands: false};
  const state = {controlled: 0, sprint: {active: false}, ball: {x: 2, y: 0, z: 4, vx: 0, vz: 0, lastPlayer: null}};
  // the same order as the game view: orientation, mixer, head look, leg IK, matrices
  const tick = dt => {
    const st = body.orient(player, Math.atan2(player.fx, player.fz), dt, false); character.yaw = st.yaw;
    pivot.position.set(player.x, 0, player.z); pivot.rotation.set(0, st.yaw, 0);
    const r = motion.update(player, state, 'idle', dt, {turnRate: st.rate});
    athleteLook(T, character, state.ball, dt, m);
    body.plant(pivot, dt, 1, r.warp);
    pivot.updateMatrixWorld(true);
  };
  const watched = ['Head', 'Neck1', 'LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg'].map(n => root.getObjectByName(n));
  const snap = () => watched.map(o => [...o.matrixWorld.elements]);
  return {tick, snap, state, player, root, bones};
}
const maxDiff = (a, b) => Math.max(...a.flatMap((m, i) => m.map((v, k) => Math.abs(v - b[i][k]))));

test('pause after live play: head, neck and legs hold exactly, the ball is untouched', () => {
  const r = rig();
  for (let i = 0; i < 90; i++) r.tick(1 / 60);
  const ball = {...r.state.ball}, held = r.snap();
  for (let i = 0; i < 120; i++) r.tick(0);
  assert.equal(maxDiff(r.snap(), held), 0, 'no drift over 120 paused frames');
  assert.deepEqual(r.state.ball, ball);
});

test('the pose is rebuilt from the clean mixer pose, not from last frame', () => {
  const r = rig();
  for (let i = 0; i < 60; i++) r.tick(1 / 60);
  r.tick(0); const held = r.snap();
  for (const name of ['Head', 'Neck1', 'LeftUpLeg', 'RightLeg']) r.root.getObjectByName(name).quaternion.set(0.3, 0.4, 0.1, 0.86).normalize();
  r.tick(0);
  assert.ok(maxDiff(r.snap(), held) < 1e-12, 'a stale or tampered bone is reset before the look and IK layers');
});

test('resume after a pause continues without a jump', () => {
  const r = rig(), head = r.root.getObjectByName('Head'), P = new T.Vector3(), Q = new T.Quaternion();
  const sample = () => { head.getWorldPosition(P); head.getWorldQuaternion(Q); return [P.clone(), Q.clone()]; };
  r.state.ball.x = 4; r.state.ball.z = 1; // the head is still turning toward the ball when the pause starts
  let prev = (r.tick(1 / 60), sample()), live = 0;
  for (let i = 0; i < 20; i++) { r.tick(1 / 60); const s = sample(); live = Math.max(live, s[0].distanceTo(prev[0]) + s[1].angleTo(prev[1])); prev = s; }
  for (let i = 0; i < 60; i++) r.tick(0);
  const paused = sample();
  assert.equal(paused[0].distanceTo(prev[0]), 0);
  r.tick(1 / 60); const resumed = sample();
  const step = resumed[0].distanceTo(paused[0]) + resumed[1].angleTo(paused[1]);
  assert.ok(step <= live * 1.5 + 1e-4, `first resumed frame moves like a live frame (${step.toFixed(5)} vs ${live.toFixed(5)})`);
});

test('a paused frame never starts a dribble touch', () => {
  const body = createAthleteBody(T, {bones: {}}, m), p = {vx: 5, vz: 0};
  let o = 0, foot = 0;
  for (let i = 0; i < 40; i++) { foot = 0.2 + 0.01 * i; o = body.dribble(p, true, 1 / 60, foot, 0.7, true, 0.49); } // right foot still swinging forward
  const since = body.state.dribble.since;
  for (let i = 0; i < 30; i++) assert.equal(body.dribble(p, true, 0, foot, 0.7, true, 0.49), o, 'the frozen foot is not read as a touch');
  assert.equal(body.state.dribble.since, since);
});
