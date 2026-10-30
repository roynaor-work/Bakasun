#!/usr/bin/env node
// Asset-only validation; no game code, renderer, or external dependencies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const parents = {
  Root: null, Hips: 'Root', Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck',
  LeftArm: 'Chest', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightArm: 'Chest', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
};
const names = Object.keys(parents), identity = [0, 0, 0, 1];
const grounded = new Set(['idle', 'run', 'decelerate', 'turn_left', 'turn_right', 'kick', 'shoot', 'catch', 'celebrate', 'glide', 'pole_push', 'land', 'recover']);
const finite = Number.isFinite;
const vector = (v, size = 3) => Array.isArray(v) && v.length === size && v.every(finite);
const add = (a, b) => a.map((v, i) => v + b[i]);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const unit = q => q.map(v => v / Math.hypot(...q));
const smoothstep = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function multiply([x, y, z, w], [a, b, c, d]) {
  return [w*a+x*d+y*c-z*b, w*b-x*c+y*d+z*a, w*c+x*b-y*a+z*d, w*d-x*a-y*b-z*c];
}
function rotate(q, v) {
  return multiply(multiply(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3);
}
function slerp(a, b, t) {
  let cosine = dot(a, b);
  if (cosine < 0) { b = b.map(v => -v); cosine = -cosine; }
  if (cosine > 0.9995) return unit(mix(a, b, t));
  const angle = Math.acos(Math.min(1, cosine)), denominator = Math.sin(angle);
  return a.map((v, i) => (v * Math.sin((1-t)*angle) + b[i] * Math.sin(t*angle)) / denominator);
}
function blendPose(a, b, weight) {
  return {
    rotations: Object.fromEntries(names.map(name => [name, slerp(a.rotations[name], b.rotations[name], weight)])),
    hipsOffsetMeters: mix(a.hipsOffsetMeters, b.hipsOffsetMeters, weight),
    referenceRootTranslationMeters: mix(a.referenceRootTranslationMeters, b.referenceRootTranslationMeters, weight),
  };
}
function sample(state, time) {
  const keys = state.keyframes;
  const index = keys.findIndex(key => key.time >= time);
  if (index <= 0) return keys[0];
  const a = keys[index - 1], b = keys[index];
  const weight = smoothstep((time - a.time) / (b.time - a.time));
  return blendPose(a, b, weight);
}
function forward(bones, pose, referenceMotion = false) {
  const world = {};
  for (const bone of bones) {
    const parent = world[bone.parent] ?? { position: [0, 0, 0], rotation: identity };
    const offset = bone.name === 'Hips' ? add(bone.restTranslationMeters, pose.hipsOffsetMeters) : bone.restTranslationMeters;
    world[bone.name] = {
      position: add(parent.position, rotate(parent.rotation, offset)),
      rotation: unit(multiply(parent.rotation, pose.rotations[bone.name])),
    };
  }
  if (referenceMotion) for (const bone of Object.values(world)) bone.position = add(bone.position, pose.referenceRootTranslationMeters);
  return world;
}
const point = (world, bone, local) => add(world[bone].position, rotate(world[bone].rotation, local));
function samePose(a, b, context) {
  for (const name of names) assert(Math.abs(dot(unit(a.rotations[name]), unit(b.rotations[name]))) > 1 - 1e-7, `${context}: ${name} rotation discontinuity`);
  assert(distance(a.hipsOffsetMeters, b.hipsOffsetMeters) < 1e-6, `${context}: hips discontinuity`);
}
function eligible(transition, source) {
  if (source === transition.target || transition.source !== '*' && transition.source !== source) return false;
  if (transition.on === 'fall_confirmed' && ['fall', 'recover'].includes(source)) return false;
  if (transition.on === 'result_success' && ['fall', 'recover', 'celebrate'].includes(source)) return false;
  return true;
}
async function validate(path) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  assert(['soccer', 'hoops', 'alpine'].includes(data.game), 'unknown game');
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.kind, 'authored-skeletal-motion');
  const sourceBytes = await readFile(resolve(directory, '..', data.game, 'animations.json'));
  const source = JSON.parse(sourceBytes);
  const sourceSha = createHash('sha1').update(`blob ${sourceBytes.length}\0`).update(sourceBytes).digest('hex');
  assert.equal(data.sourceContract.path, `workout/island/design/${data.game}/animations.json`, 'source contract path');
  assert.equal(data.sourceContract.gitBlobSha, sourceSha, 'source contract SHA changed');
  assert.equal(data.initialState, source.initialState);
  assert.deepEqual(data.eventInputs, source.eventInputs);
  assert.equal(data.skeleton.rotationFormat, 'quaternion-xyzw');
  assert.equal(data.skeleton.rotationSpace, 'parent-local');
  const bones = data.skeleton.bones;
  assert.deepEqual(bones.map(b => b.name).sort(), [...names].sort(), 'required skeleton bones');
  const seen = new Set();
  for (const bone of bones) {
    assert.equal(bone.parent, parents[bone.name], `${bone.name}: incorrect parent`);
    assert(bone.parent === null || seen.has(bone.parent), `${bone.name}: parent must precede child`);
    assert(vector(bone.restTranslationMeters), `${bone.name}: invalid rest translation`);
    if (bone.name === 'Root') assert.deepEqual(bone.restTranslationMeters, [0, 0, 0], 'Root must stay at the reference origin');
    seen.add(bone.name);
  }
  assert.deepEqual(Object.keys(data.states).sort(), Object.keys(source.states).sort(), 'source state coverage');
  let frames = 0, contacts = 0, worstSlip = 0, pairs = 0, blends = 0;
  for (const [name, state] of Object.entries(data.states)) {
    const context = `${data.game}/${name}`, original = source.states[name], keys = state.keyframes;
    for (const field of ['clip', 'durationSeconds', 'loop', 'rootMotion']) assert.equal(state[field], original[field], `${context}: ${field}`);
    assert.equal(state.rootMotion, false);
    assert.deepEqual(state.interpolation, { rotation: 'slerp', translation: 'linear', easing: 'smoothstep' });
    assert(Array.isArray(keys) && keys.length >= 2, `${context}: missing keys`);
    assert.equal(keys[0].time, 0, `${context}: first time`);
    assert.equal(keys.at(-1).time, 1, `${context}: last time`);
    let previous = -1;
    for (const key of keys) {
      assert(finite(key.time) && key.time > previous && key.time <= 1, `${context}: times must strictly increase in [0,1]`);
      previous = key.time;
      assert.deepEqual(Object.keys(key.rotations).sort(), [...names].sort(), `${context}@${key.time}: missing bone`);
      for (const name of names) {
        const q = key.rotations[name];
        assert(vector(q, 4) && Math.abs(Math.hypot(...q) - 1) < 1e-5, `${context}@${key.time}/${name}: invalid unit quaternion`);
        if (name === 'Root') assert(Math.hypot(...q.slice(0, 3)) < 1e-7 && Math.abs(Math.abs(q[3]) - 1) < 1e-7, `${context}@${key.time}: Root rotation must stay identity`);
      }
      assert(vector(key.hipsOffsetMeters) && vector(key.referenceRootTranslationMeters), `${context}: invalid translation`);
    }
    frames += keys.length;
    if (state.loop) samePose(keys[0], keys.at(-1), `${context}: loop`);
    if (['fall', 'recover'].includes(name)) {
      const count = Math.ceil(state.durationSeconds * 120);
      const times = new Set([...keys.map(key => key.time), ...Array.from({ length: count + 1 }, (_, index) => index / count)]);
      for (const time of times) {
        const world = forward(bones, sample(state, time));
        const points = names.filter(name => name !== 'Root').map(name => [name, world[name].position]);
        for (const bone of ['LeftFoot', 'RightFoot']) points.push([`${bone} sole`, point(world, bone, [0, -.08, 0])]);
        for (const bone of ['LeftHand', 'RightHand']) points.push([`${bone} palm`, point(world, bone, [0, -.08, .025])]);
        for (const [label, position] of points) assert(position[1] >= -.01, `${context}@${time.toFixed(6)}/${label}: floor penetration ${(position[1]*100).toFixed(3)}cm`);
      }
    }
    assert.deepEqual(state.events.map(({ atSeconds, name }) => ({ atSeconds, name })), original.events, `${context}: source events`);
    for (const event of state.events) {
      assert(finite(event.time) && Math.abs(event.time - event.atSeconds / state.durationSeconds) < 1e-6, `${context}: normalized event time`);
      assert(keys.some(key => Math.abs(key.time - event.time) < 1e-6), `${context}: event requires an exact key`);
    }
    assert(Array.isArray(state.ballContacts) && Array.isArray(state.supportContacts), `${context}: contact arrays`);
    if (grounded.has(name)) assert(state.supportContacts.length, `${context}: grounded clip requires support contacts`);
    assert.equal(state.ballContactStatus, state.ballContacts.length ? 'authored' : 'none');
    if (data.game === 'alpine') assert.equal(state.ballContacts.length, 0, `${context}: skiing has no ball`);
    if (data.game !== 'alpine' && original.events.length) assert(state.ballContacts.length, `${context}: missing ball contact`);
    for (const contact of state.ballContacts) {
      assert(['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].includes(contact.bone), `${context}: invalid ball effector`);
      assert(vector(contact.localPointMeters) && vector(contact.pointMeters) && vector(contact.ballCenterMeters), `${context}: invalid ball point`);
      assert(finite(contact.ballRadiusMeters) && contact.ballRadiusMeters > 0, `${context}: invalid ball radius`);
      assert(state.events.some(event => event.name === contact.event && Math.abs(event.time-contact.time) < 1e-6), `${context}: unmatched ball event`);
      const pose = sample(state, contact.time), world = forward(bones, pose);
      assert(distance(point(world, contact.bone, contact.localPointMeters), contact.pointMeters) < 1e-4, `${context}: ball point differs from FK`);
      assert(Math.abs(distance(contact.pointMeters, contact.ballCenterMeters) - contact.ballRadiusMeters) < 1e-4, `${context}: ball point off surface`);
      contacts++;
    }
    const intervals = {};
    for (const support of state.supportContacts) {
      assert(['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].includes(support.bone), `${context}: invalid support effector`);
      assert(['plant', 'ski-slide'].includes(support.mode), `${context}: invalid support mode`);
      assert(finite(support.startTime) && finite(support.endTime) && support.startTime >= 0 && support.endTime <= 1 && support.startTime < support.endTime, `${context}: invalid support interval`);
      assert(vector(support.anchorMeters) && vector(support.effectorOffsetMeters), `${context}: invalid support point`);
      assert(support.startTime >= (intervals[support.bone] ?? -1), `${context}: overlapping or unordered support intervals`);
      intervals[support.bone] = support.endTime;
      const samples = new Set([support.startTime, support.endTime, ...keys.map(key => key.time)]);
      const count = Math.ceil(state.durationSeconds * 120);
      for (let index = 0; index <= count; index++) samples.add(index / count);
      for (const time of samples) {
        if (time < support.startTime || time > support.endTime) continue;
        const world = forward(bones, sample(state, time), true);
        const sole = point(world, support.bone, support.effectorOffsetMeters);
        const slip = support.mode === 'plant' ? distance(sole, support.anchorMeters) : Math.abs(sole[1]-support.anchorMeters[1]);
        worstSlip = Math.max(worstSlip, slip);
        assert(slip <= 0.02, `${context}@${time.toFixed(6)}/${support.bone}: support drift ${(slip*100).toFixed(3)}cm exceeds 2cm`);
      }
    }
  }
  samePose(data.states.fall.keyframes.at(-1), data.states.recover.keyframes[0], `${data.game}: fall/recover`);
  assert.equal(data.transitions.length, source.transitions.length, 'source transition coverage');
  for (const [index, transition] of data.transitions.entries()) {
    for (const field of ['source', 'target', 'on', 'priority', 'crossfadeSeconds']) assert.equal(transition[field], source.transitions[index][field], `transition ${index}: ${field}`);
    assert(finite(transition.visualBlendSeconds) && transition.visualBlendSeconds > 0 && transition.visualBlendSeconds <= data.states[transition.target].durationSeconds, `transition ${index}: positive bounded visual blend required, including reset`);
    assert.equal(transition.blendCurve, 'smoothstep');
    assert.equal(transition.sourcePose, 'current-displayed');
    assert.equal(transition.sourceContinuation, 'velocity-extrapolation');
    assert.equal(transition.targetTime, 0);
    assert.equal(transition.footLock, 'carry-until-release');
    // Validate this package's declared blend, not a consumer's mixer or post-mix foot IK.
    for (const sourceName of Object.keys(data.states)) if (eligible(transition, sourceName)) {
      pairs++;
      const target = sample(data.states[transition.target], transition.targetTime);
      for (const phase of [0, .25, .5, .75, 1]) {
        const from = sample(data.states[sourceName], phase), context = `${sourceName}@${phase}->${transition.target}`;
        samePose(blendPose(from, target, smoothstep(0)), from, `${context}: blend start`);
        samePose(blendPose(from, target, smoothstep(1)), target, `${context}: blend end`);
        for (const progress of [.25, .5, .75]) {
          const mixed = blendPose(from, target, smoothstep(progress));
          assert(vector(mixed.hipsOffsetMeters), `${context}: invalid blended hips`);
          for (const [bone, q] of Object.entries(mixed.rotations)) {
            assert(vector(q, 4) && Math.abs(Math.hypot(...q)-1) < 1e-5, `${context}/${bone}: invalid blended quaternion`);
          }
          assert(Math.abs(mixed.rotations.Root[3]) > 1-1e-7, `${context}: blended Root rotation`);
        }
        blends++;
      }
    }
  }
  return `${data.game}: ${Object.keys(data.states).length} clips, ${frames} keys, ${contacts} ball contacts, ${pairs} eligible transitions (${blends} blend probes); max support error ${(worstSlip*100).toFixed(3)}cm`;
}

const paths = process.argv.slice(2);
try {
  for (const path of paths.length ? paths.map(path => resolve(path)) : ['soccer', 'hoops', 'alpine'].map(game => resolve(directory, `${game}.json`))) {
    console.log(await validate(path));
  }
} catch (error) {
  console.error(`Motion validation failed: ${error.message}`);
  process.exitCode = 1;
}
