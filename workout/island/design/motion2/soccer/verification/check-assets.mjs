#!/usr/bin/env node
// Numerical asset audit. Independent of the authoring helper and rendered IK.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const design = resolve(here, '../../..');
const packDirectory = resolve(here, '..');
const filenames = ['kicks-locomotion.json', 'tackles-reactions.json', 'throws-receives.json'];
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node check-assets.mjs [pack.json ...] [--out report.json]');
  console.log('By default audits all three motion2 soccer packs against unchanged canonical sources.');
  process.exit(0);
}
const outIndex = args.indexOf('--out');
if (outIndex >= 0 && (!args[outIndex + 1] || args[outIndex + 1].startsWith('--'))) throw Error('--out requires a path');
const output = outIndex >= 0 ? resolve(args[outIndex + 1]) : null;
const selected = args.filter((_, i) => outIndex < 0 || (i !== outIndex && i !== outIndex + 1));
const paths = selected.length ? selected.map(p => resolve(p)) : filenames.map(f => resolve(packDirectory, f));
const baselineBytes = await readFile(resolve(design, 'motion/soccer.json'));
const baseline = JSON.parse(baselineBytes);
const bones = baseline.skeleton.bones;
const names = bones.map(b => b.name);
const identity = [0, 0, 0, 1];
const limits = Object.freeze({ supportMeters: .02, canonicalFloorMeters: .01, ballPointMeters: .0001, loopPose: .000001 });
const vector = (v, length = 3) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
const add = (a, b) => a.map((x, i) => x + b[i]);
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const distance = (a, b) => Math.hypot(...subtract(a, b));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = q => q.map(x => x / Math.hypot(...q));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const smooth = t => t * t * (3 - 2 * t);
function multiply([x, y, z, w], [a, b, c, d]) {
  return [w*a+x*d+y*c-z*b, w*b-x*c+y*d+z*a, w*c+x*b-y*a+z*d, w*d-x*a-y*b-z*c];
}
function rotate(q, v) { return multiply(multiply(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3); }
function slerp(a, b, t) {
  let cosine = dot(a, b);
  if (cosine < 0) { b = b.map(x => -x); cosine = -cosine; }
  if (cosine > .9995) return unit(lerp(a, b, t));
  const angle = Math.acos(Math.min(1, cosine));
  return a.map((x, i) => (x * Math.sin((1-t)*angle) + b[i] * Math.sin(t*angle)) / Math.sin(angle));
}
function sample(clip, time) {
  const keys = clip.keyframes;
  const hi = keys.findIndex(k => k.time >= time);
  if (hi <= 0) return hi === 0 ? keys[0] : keys.at(-1);
  const a = keys[hi - 1], b = keys[hi];
  const t = smooth((time - a.time) / (b.time - a.time));
  return {
    rotations: Object.fromEntries(names.map(n => [n, slerp(a.rotations[n], b.rotations[n], t)])),
    hipsOffsetMeters: lerp(a.hipsOffsetMeters, b.hipsOffsetMeters, t),
    referenceRootTranslationMeters: lerp(a.referenceRootTranslationMeters, b.referenceRootTranslationMeters, t),
  };
}
function forward(pose, reference = false) {
  const world = {};
  for (const bone of bones) {
    const parent = world[bone.parent] || { position: [0, 0, 0], rotation: identity };
    const offset = bone.name === 'Hips' ? add(bone.restTranslationMeters, pose.hipsOffsetMeters) : bone.restTranslationMeters;
    world[bone.name] = {
      position: add(parent.position, rotate(parent.rotation, offset)),
      rotation: unit(multiply(parent.rotation, pose.rotations[bone.name])),
    };
  }
  if (reference) for (const entry of Object.values(world)) entry.position = add(entry.position, pose.referenceRootTranslationMeters);
  return world;
}
const point = (world, bone, local) => add(world[bone].position, rotate(world[bone].rotation, local));
const normalized = t => Number.isFinite(t) && t >= 0 && t <= 1;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), pass: false, limits,
  scope: 'Canonical numerical poses before rendered retargeting, IK or mesh floor correction. Body ground contacts without local points verify timing only.',
  baselineSha256: hash(baselineBytes), packs: [], clips: [], errors: [],
};
const repository = resolve(design, '../../..');
const originalInputs = ['motion/soccer.json', 'viewer/retarget-map.json', 'viewer/test-viewer.mjs', 'characters/rig.json'];
report.originalInputs = {};
for (const input of originalInputs) {
  const repositoryPath = `workout/island/design/${input}`;
  try {
    const current = await readFile(resolve(design, input));
    const committed = execFileSync('git', ['show', `HEAD:${repositoryPath}`], { cwd: repository });
    const unchanged = current.equals(committed);
    report.originalInputs[repositoryPath] = { sha256: hash(current), unchangedFromHead: unchanged };
    assert(unchanged, `${repositoryPath}: existing source file changed`);
  } catch (error) { report.errors.push({ path: repositoryPath, error: error.message }); }
}
const loaded = [];
const allStates = { ...baseline.states };
for (const path of paths) {
  try {
    const bytes = await readFile(path), data = JSON.parse(bytes);
    loaded.push({ path, data });
    report.packs.push({ path: relative(design, path), sha256: hash(bytes), states: Object.keys(data.states || {}) });
    for (const [name, state] of Object.entries(data.states || {})) {
      assert(!Object.hasOwn(allStates, name), `duplicate or baseline-overriding state ${name}`);
      allStates[name] = state;
    }
  } catch (error) { report.errors.push({ path: relative(design, path), error: error.message }); }
}

function checkClip(name, clip) {
  const context = `${name}`;
  assert.equal(clip.clip, name, `${context}: clip identifier`);
  assert(Number.isFinite(clip.durationSeconds) && clip.durationSeconds > 0, `${context}: duration`);
  assert.equal(typeof clip.loop, 'boolean', `${context}: loop`);
  assert.equal(clip.rootMotion, false, `${context}: root motion must remain simulation-owned`);
  assert.deepEqual(clip.interpolation, { rotation: 'slerp', translation: 'linear', easing: 'smoothstep' }, `${context}: interpolation`);
  assert(typeof clip.notes === 'string' && clip.notes.length, `${context}: notes`);
  assert(Array.isArray(clip.events) && clip.events.length, `${context}: presentation events`);
  assert(Array.isArray(clip.ballContacts) && Array.isArray(clip.supportContacts), `${context}: contacts`);
  assert(Array.isArray(clip.groundContacts) && clip.groundContacts.length, `${context}: timed ground contacts`);
  const keys = clip.keyframes;
  assert(Array.isArray(keys) && keys.length >= 2, `${context}: keyframes`);
  assert.equal(keys[0].time, 0, `${context}: first key`);
  assert.equal(keys.at(-1).time, 1, `${context}: last key`);
  let previous = -1;
  for (const key of keys) {
    assert(normalized(key.time) && key.time > previous, `${context}: strictly increasing key times`);
    previous = key.time;
    assert.deepEqual(Object.keys(key.rotations).sort(), [...names].sort(), `${context}@${key.time}: complete bones`);
    for (const bone of names) {
      const q = key.rotations[bone];
      assert(vector(q, 4) && Math.abs(Math.hypot(...q) - 1) < 1e-5, `${context}@${key.time}/${bone}: normalized quaternion`);
    }
    assert(distance(key.rotations.Root, identity) < 1e-7, `${context}: identity Root`);
    assert(vector(key.hipsOffsetMeters) && vector(key.referenceRootTranslationMeters), `${context}: translation vectors`);
  }
  for (const event of clip.events) {
    assert(typeof event.name === 'string' && event.name.length, `${context}: named presentation event`);
    assert(normalized(event.time) && Number.isFinite(event.atSeconds), `${context}/${event.name}: event time`);
    assert(Math.abs(event.time * clip.durationSeconds - event.atSeconds) < 1e-6, `${context}/${event.name}: seconds/phase mismatch`);
    assert(keys.some(k => Math.abs(k.time - event.time) < 1e-8), `${context}/${event.name}: exact event key missing`);
  }
  assert.equal(clip.ballContactStatus, clip.ballContacts.length ? 'authored' : 'none', `${context}: ball status`);
  if (!clip.ballContacts.length) assert(typeof clip.ballContactReason === 'string' && clip.ballContactReason.length, `${context}: no-ball reason`);
  let maxBallPointErrorMeters = 0, maxBallSurfaceErrorMeters = 0;
  const contactSpheres = new Map();
  for (const contact of clip.ballContacts) {
    assert(names.includes(contact.bone) && contact.bone !== 'Root', `${context}: ball bone`);
    assert(normalized(contact.time), `${context}: ball time`);
    assert(vector(contact.localPointMeters) && vector(contact.pointMeters) && vector(contact.ballCenterMeters), `${context}: ball vectors`);
    assert(Number.isFinite(contact.ballRadiusMeters) && contact.ballRadiusMeters > 0, `${context}: ball radius`);
    assert(clip.events.some(e => e.name === contact.event && Math.abs(e.time - contact.time) < 1e-8), `${context}: matching presentation ball event`);
    const world = forward(sample(clip, contact.time));
    const pointError = distance(point(world, contact.bone, contact.localPointMeters), contact.pointMeters);
    const surfaceError = Math.abs(distance(contact.pointMeters, contact.ballCenterMeters) - contact.ballRadiusMeters);
    maxBallPointErrorMeters = Math.max(maxBallPointErrorMeters, pointError);
    maxBallSurfaceErrorMeters = Math.max(maxBallSurfaceErrorMeters, surfaceError);
    assert(pointError <= limits.ballPointMeters, `${context}/${contact.bone}@${contact.time}: ball point differs from canonical FK by ${pointError}m`);
    assert(surfaceError <= limits.ballPointMeters, `${context}/${contact.bone}: point off ball surface by ${surfaceError}m`);
    const sphereKey = `${contact.time}:${contact.event}`;
    const sphere = contactSpheres.get(sphereKey);
    if (sphere) {
      assert(distance(sphere.center, contact.ballCenterMeters) < 1e-6 && Math.abs(sphere.radius-contact.ballRadiusMeters)<1e-6, `${context}: simultaneous contacts must share one ball`);
    } else contactSpheres.set(sphereKey, { center: contact.ballCenterMeters, radius: contact.ballRadiusMeters });
  }
  const intervals = {};
  for (const contact of clip.supportContacts) {
    assert(['LeftFoot', 'RightFoot'].includes(contact.bone), `${context}: rendered support effector must be a foot`);
    assert.equal(contact.mode, 'plant', `${context}: soccer support must measure full spatial drift`);
    assert(normalized(contact.startTime) && normalized(contact.endTime) && contact.startTime < contact.endTime, `${context}: support interval`);
    assert(vector(contact.anchorMeters) && vector(contact.effectorOffsetMeters), `${context}: support vectors`);
    assert(contact.startTime >= (intervals[contact.bone] ?? -1), `${context}: unordered or overlapping support intervals`);
    intervals[contact.bone] = contact.endTime;
  }
  let metadataGroundContacts = 0, verifiedGroundSupports = 0;
  for (const contact of clip.groundContacts) {
    assert(names.includes(contact.bone) && contact.bone !== 'Root', `${context}: ground contact bone`);
    assert(normalized(contact.startTime) && normalized(contact.endTime) && contact.startTime <= contact.endTime, `${context}: ground interval`);
    assert(typeof contact.mode === 'string' && contact.mode.length, `${context}: ground contact mode`);
    assert(clip.events.some(e => Math.abs(e.time - contact.startTime) < 1e-8), `${context}: ground acquire presentation event missing @${contact.startTime}`);
    assert(clip.events.some(e => Math.abs(e.time - contact.endTime) < 1e-8), `${context}: ground release presentation event missing @${contact.endTime}`);
    if (contact.mode === 'plant' && ['LeftFoot', 'RightFoot'].includes(contact.bone)) {
      const support = clip.supportContacts.find(s => s.bone === contact.bone && Math.abs(s.startTime - contact.startTime) < 1e-8 && Math.abs(s.endTime - contact.endTime) < 1e-8);
      assert(support, `${context}: planted ground interval must match a measured support`);
      if (contact.anchorMeters) assert(distance(contact.anchorMeters, support.anchorMeters) < 1e-6, `${context}: ground/support anchor mismatch`);
      verifiedGroundSupports++;
    } else if (!contact.pointMeters) metadataGroundContacts++;
    if (contact.pointMeters) {
      assert(vector(contact.pointMeters) && vector(contact.localPointMeters || contact.effectorOffsetMeters), `${context}: ground point vectors`);
      const p = point(forward(sample(clip, contact.startTime), true), contact.bone, contact.localPointMeters || contact.effectorOffsetMeters);
      assert(distance(p, contact.pointMeters) <= limits.supportMeters, `${context}: ground point differs from FK`);
    }
  }
  const samples = new Set([0, 1, ...keys.map(k => k.time), ...clip.supportContacts.flatMap(c => [c.startTime, c.endTime])]);
  const frameCount = Math.ceil(clip.durationSeconds * 120);
  for (let i = 0; i <= frameCount; i++) samples.add(i / frameCount);
  let maxSupportErrorMeters = 0, canonicalMinY = Infinity;
  for (const time of samples) {
    const world = forward(sample(clip, time), true);
    for (const contact of clip.supportContacts) if (time >= contact.startTime && time <= contact.endTime) {
      const error = distance(point(world, contact.bone, contact.effectorOffsetMeters), contact.anchorMeters);
      maxSupportErrorMeters = Math.max(maxSupportErrorMeters, error);
      assert(error <= limits.supportMeters, `${context}/${contact.bone}@${time}: source support drift ${error}m exceeds ${limits.supportMeters}m`);
    }
    const floorPoints = names.filter(n => n !== 'Root').map(n => world[n].position);
    for (const n of ['LeftFoot', 'RightFoot']) floorPoints.push(point(world, n, [0, -.08, 0]));
    for (const n of ['LeftHand', 'RightHand']) floorPoints.push(point(world, n, [0, -.08, .025]));
    canonicalMinY = Math.min(canonicalMinY, ...floorPoints.map(p => p[1]));
  }
  assert(canonicalMinY >= -limits.canonicalFloorMeters, `${context}: canonical joint/sole/palm floor minimum ${canonicalMinY}m`);
  let loop = null;
  if (clip.loop) {
    const first = keys[0], last = keys.at(-1);
    const maxQuaternionDifference = Math.max(...names.map(n => {
      const a = first.rotations[n], b = last.rotations[n];
      return Math.min(distance(a, b), distance(a, b.map(x => -x)));
    }));
    const hipsDifferenceMeters = distance(first.hipsOffsetMeters, last.hipsOffsetMeters);
    const stride = clip.referenceLocomotion?.cycleAnchorTranslationMeters || [0, 0, 0];
    assert(vector(stride), `${context}: loop stride vector`);
    const strideErrorMeters = distance(subtract(last.referenceRootTranslationMeters, first.referenceRootTranslationMeters), stride);
    assert(maxQuaternionDifference <= limits.loopPose && hipsDifferenceMeters <= limits.loopPose && strideErrorMeters <= limits.loopPose, `${context}: open canonical loop`);
    loop = { maxQuaternionDifference, hipsDifferenceMeters, strideErrorMeters };
  }
  return { clip: name, pass: true, durationSeconds: clip.durationSeconds, keys: keys.length, samples: samples.size,
    ballContacts: clip.ballContacts.length, maxBallPointErrorMeters, maxBallSurfaceErrorMeters,
    supportContacts: clip.supportContacts.length, maxSupportErrorMeters, canonicalMinY,
    groundContacts: clip.groundContacts.length, verifiedGroundSupports, metadataGroundContacts, loop };
}

for (const { path, data } of loaded) {
  const pack = relative(design, path);
  try {
    assert.equal(data.schemaVersion, baseline.schemaVersion, `${pack}: schema version`);
    assert.equal(data.kind, baseline.kind, `${pack}: kind`);
    assert.equal(data.game, 'soccer', `${pack}: game`);
    assert.deepEqual(data.skeleton, baseline.skeleton, `${pack}: canonical skeleton changed`);
    assert(data.sourceContract && typeof data.sourceContract.path === 'string', `${pack}: source contract`);
    const sourcePath = resolve(repository, data.sourceContract.path);
    assert(relative(repository, sourcePath).replaceAll('\\', '/').startsWith('workout/island/design/'), `${pack}: source contract must resolve inside island design`);
    const sourceBytes = await readFile(sourcePath);
    const sourceBlob = createHash('sha1').update(`blob ${sourceBytes.length}\0`).update(sourceBytes).digest('hex');
    assert.equal(data.sourceContract.gitBlobSha, sourceBlob, `${pack}: exact source contract blob`);
    assert(Object.hasOwn(allStates, data.initialState), `${pack}: initial state does not resolve`);
    assert(Array.isArray(data.transitions) && data.transitions.length, `${pack}: transition recommendations`);
    assert(Array.isArray(data.eventInputs), `${pack}: event inputs`);
    for (const transition of data.transitions) {
      assert(transition.source === '*' || Object.hasOwn(allStates, transition.source), `${pack}: transition source ${transition.source}`);
      assert(Object.hasOwn(allStates, transition.target), `${pack}: transition target ${transition.target}`);
      assert(typeof transition.on === 'string' && data.eventInputs.includes(transition.on), `${pack}: missing event input ${transition.on}`);
      assert(Number.isFinite(transition.priority), `${pack}: transition priority`);
      assert(Number.isFinite(transition.crossfadeSeconds) && transition.crossfadeSeconds >= 0, `${pack}: crossfade`);
      assert(Number.isFinite(transition.visualBlendSeconds) && transition.visualBlendSeconds > 0 && transition.visualBlendSeconds <= allStates[transition.target].durationSeconds, `${pack}: positive bounded visual blend`);
      for (const [field, value] of Object.entries({ blendCurve: 'smoothstep', sourcePose: 'current-displayed', sourceContinuation: 'velocity-extrapolation', targetTime: 0, footLock: 'carry-until-release' })) assert.equal(transition[field], value, `${pack}: ${field}`);
    }
  } catch (error) { report.errors.push({ pack, error: error.message }); }
  for (const [name, clip] of Object.entries(data.states)) {
    try { report.clips.push({ pack, ...checkClip(name, clip) }); }
    catch (error) { report.clips.push({ pack, clip: name, pass: false, error: error.message }); report.errors.push({ pack, clip: name, error: error.message }); }
  }
}
const extensionNames = loaded.flatMap(({ data }) => Object.keys(data.states));
const allTransitions = [...baseline.transitions, ...loaded.flatMap(({ data }) => data.transitions)];
for (const name of extensionNames) {
  if (!allTransitions.some(t => t.target === name && t.source !== name)) report.errors.push({ clip: name, error: `${name}: no incoming transition recommendation` });
  if (!allTransitions.some(t => (t.source === name || t.source === '*') && t.target !== name)) report.errors.push({ clip: name, error: `${name}: no exit transition recommendation` });
}
const reachable = new Set([baseline.initialState]);
for (let changed = true; changed;) {
  changed = false;
  for (const t of allTransitions) if ((t.source === '*' || reachable.has(t.source)) && !reachable.has(t.target)) { reachable.add(t.target); changed = true; }
}
for (const name of extensionNames) if (!reachable.has(name)) report.errors.push({ clip: name, error: `${name}: unreachable from baseline ${baseline.initialState}` });
report.transitionRecommendations = { count: allTransitions.length - baseline.transitions.length, reachableExtensionStates: extensionNames.filter(n => reachable.has(n)).length };
report.pass = report.errors.length === 0 && report.clips.length > 0 && report.clips.every(c => c.pass);
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
for (const error of report.errors) console.error(error.error);
console.log(`${report.pass ? 'PASS' : 'FAIL'} canonical assets: ${report.clips.filter(c => c.pass).length}/${report.clips.length} clips; ${report.errors.length} errors${output ? `; ${output}` : ''}`);
process.exitCode = report.pass ? 0 : 1;
