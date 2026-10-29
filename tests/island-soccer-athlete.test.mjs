import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {ATHLETE_BONES, ATHLETE_CLIPS, locomotionWeights, strideRate, createAthleteMotion} from '../workout/island/minigames/soccer-athlete-motion.mjs';
import {athleteKit} from '../workout/island/minigames/soccer-athlete.mjs';

const config = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.soccer;
const glbUrl = new URL('../workout/island/assets/athlete/athlete.glb', import.meta.url);
async function glbJson() {
  const b = await readFile(glbUrl);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF binary magic');
  assert.equal(b.readUInt32LE(8), b.length, 'declared length matches the file');
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}
const m = config.view.athlete.motion;

test('athlete asset: one skinned rig with every adapter bone, all game clips and documented licences', async () => {
  const j = await glbJson(), names = new Set(j.nodes.map(n => n.name));
  assert.equal(j.skins.length, 1);
  assert.equal(j.skins[0].joints.length, 31, 'CMU/MotionBuilder 31-bone skeleton');
  for (const bone of Object.values(ATHLETE_BONES)) assert.ok(names.has(bone), 'adapter bone ' + bone);
  const clips = j.animations.map(a => a.name);
  for (const c of ATHLETE_CLIPS) assert.ok(clips.includes(c), 'clip ' + c);
  for (const a of j.animations) assert.match(a.extras.source, /^CMU \d+_\d+$/, 'every clip names its mocap take');
  assert.match(j.asset.extras.license, /CC0/); assert.match(j.asset.extras.license, /CMU/);
  assert.ok(names.has('Ball'), 'match ball travels with the asset');
  const athlete = j.meshes.find(x => x.name === 'Athlete');
  assert.deepEqual(athlete.extras.targetNames, ['african', 'asian', 'caucasian', 'jaw', 'narrow', 'nose', 'brow', 'hairVolume']);
  assert.equal(athlete.primitives.length, 2, 'two draw calls per player: skin and kit');
});

test('athlete asset fits the triangle and download budgets for the full roster', async () => {
  const j = await glbJson(), athlete = j.meshes.find(x => x.name === 'Athlete');
  const tris = athlete.primitives.reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
  assert.ok(tris <= 13000, 'per-player triangles ' + tris);
  assert.ok(tris * config.roster.numbers.length * 2 <= config.view.maxTriangles, 'eight players stay under the frame triangle budget');
  const bytes = (await stat(glbUrl)).size;
  assert.ok(bytes <= 2_000_000, 'athlete.glb stays within the 2 MB per-file budget: ' + bytes);
  let total = bytes;
  for (const img of j.images) {
    assert.ok(/^textures\/[a-z-]+\.(jpg|png)$/.test(img.uri || ''), 'textures sit next to the model: ' + img.uri);
    const size = (await stat(new URL(img.uri, glbUrl))).size;
    assert.ok(size <= 2_000_000, img.uri + ' ' + size); total += size;
  }
  assert.ok(total <= 3_000_000, 'whole athlete download ' + total);
  for (const a of j.accessors.filter(a => a.sparse)) assert.ok(a.sparse.count <= a.count, 'sparse morph targets');
});

test('locomotion weights always sum to one and follow speed', () => {
  let prevSprint = -1;
  for (let v = 0; v <= 9; v += 0.25) {
    const w = locomotionWeights(v, false, m), sum = w.still + w.jog + w.run + w.sprint;
    assert.ok(Math.abs(sum - 1) < 1e-9, 'sum at ' + v);
    assert.ok(w.sprint >= prevSprint - 1e-9, 'sprint weight never falls as speed rises'); prevSprint = w.sprint;
  }
  assert.equal(locomotionWeights(0, false, m).still, 1);
  assert.ok(locomotionWeights(m.sprintSpeed, false, m).sprint > 0.99);
  assert.ok(locomotionWeights(m.jogSpeed + 0.5, true, m).sprint > locomotionWeights(m.jogSpeed + 0.5, false, m).sprint, 'holding sprint leans into the sprint clip');
});

test('stride rate keeps feet planted at real speeds and caps cadence at arcade speeds', () => {
  const clips = {jog: {speed: 2.8, duration: 0.767}, run: {speed: 3.35, duration: 0.667}, sprint: {speed: 4.25, duration: 0.633}};
  const at = v => strideRate(v, locomotionWeights(v, false, m), clips, m);
  assert.ok(Math.abs(at(2.8) * 2.8 * 0.767 / 2.8 - 1) < 0.25, 'about one cycle per stride at jog speed');
  assert.ok(at(4) > at(3));
  assert.ok(at(9) <= m.maxRate / 0.633 + 1e-9, 'capped at top speed');
});

function rig() {
  const root = new T.Group(), hips = new T.Bone(); hips.name = 'Hips'; root.add(hips);
  const clips = ATHLETE_CLIPS.map(name => new T.AnimationClip(name, name === 'sit' ? 0.4 : 1, [new T.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 1, 0])]));
  return {root, mixer: new T.AnimationMixer(root), clips};
}
const player = (o = {}) => ({id: 1, team: 0, role: 'striker', vx: 0, vz: 0, kickTime: 0, stealTime: 0, headerTime: 0, throwTime: 0, diveTime: 0, catchTime: 0, hands: false, ...o});
const state = (o = {}) => ({controlled: 0, sprint: {active: false}, ball: {vx: 0, vz: 0, lastPlayer: null}, ...o});

test('a kick picks the shot clip for a fast ball and the pass clip otherwise, then hands back to locomotion', () => {
  const {mixer, clips} = rig(), motion = createAthleteMotion(T, mixer, clips, m);
  let p = player(); motion.update(p, state(), 'idle', 0.016);
  p = player({kickTime: 0.42}); motion.update(p, state({ball: {vx: 18, vz: 0, lastPlayer: 1}}), 'kick', 0.016);
  assert.match(motion.oneShot, /^shot/);
  const q = player({kickTime: 0}); motion.update(q, state(), 'idle', 0.016);
  const r = player({kickTime: 0.42}); motion.update(r, state({ball: {vx: 8, vz: 0, lastPlayer: 1}}), 'kick', 0.016);
  assert.equal(motion.oneShot, 'pass');
  for (let i = 0; i < 120; i++) motion.update(player(), state(), 'idle', 1 / 60);
  assert.equal(motion.oneShot, null);
  const total = Object.values(motion.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 0.02, 'weights settle to a full pose');
  assert.ok(motion.weights.idle > 0.95);
  mixer.stopAllAction();
});

test('keepers and markers stand in the ready stance; slides use the grounded pose', () => {
  const {mixer, clips} = rig(), motion = createAthleteMotion(T, mixer, clips, m);
  for (let i = 0; i < 60; i++) motion.update(player({role: 'keeper'}), state(), 'idle', 1 / 60);
  assert.ok(motion.weights.ready > 0.95);
  for (let i = 0; i < 60; i++) motion.update(player(), state(), 'slide', 1 / 60, {slide: 1});
  assert.ok(motion.weights.sit > 0.95);
});

test('every roster slot has a complete appearance profile and kits contrast for keepers', () => {
  const a = config.view.athlete;
  assert.ok(a.profiles.length >= config.players.roster.length);
  for (const p of a.profiles) { for (const k of ['skin', 'hair', 'boots', 'bootAccent']) assert.match(p[k], /^#[0-9a-f]{6}$/i); assert.ok(p.beard >= 0 && p.beard <= 1); }
  const field = athleteKit(config.team.colors, false, a.keeperColors[0]), keeper = athleteKit(config.team.colors, true, a.keeperColors[0]);
  assert.notEqual(field.primary, keeper.primary);
});

test('kick contact times in the game config match the measured contact frames stored with each clip', async () => {
  const j = await glbJson();
  for (const name of ['shot', 'shot-b', 'pass']) {
    const clip = j.animations.find(a => a.name === name);
    assert.ok(Math.abs(clip.extras.contact - m.contacts[name]) < 0.005, name);
    assert.ok(m.contacts[name] < j.accessors[clip.samplers[0].input].max[0] - 0.25, 'room for the follow-through after contact');
  }
});

test('the economy level of detail shares skin, morphs and UV layout with fewer than half the triangles', async () => {
  const j = await glbJson(), full = j.meshes.find(x => x.name === 'Athlete'), low = j.meshes.find(x => x.name === 'AthleteLOD1');
  assert.ok(low, 'economy mesh present');
  const tris = mesh => mesh.primitives.reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
  assert.ok(tris(low) <= tris(full) * 0.5, `${tris(low)} vs ${tris(full)}`);
  assert.deepEqual(low.extras.targetNames, full.extras.targetNames);
  const nodes = j.nodes.filter(n => n.mesh === j.meshes.indexOf(full) || n.mesh === j.meshes.indexOf(low));
  assert.equal(new Set(nodes.map(n => n.skin)).size, 1, 'both levels bind to the one skeleton');
  assert.equal(low.primitives.length, full.primitives.length);
  assert.ok(config.view.athlete.lodFromQuality >= 1 && config.view.athlete.lodFromQuality <= 3);
});
