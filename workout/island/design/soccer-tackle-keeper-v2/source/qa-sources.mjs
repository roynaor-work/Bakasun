// SPDX-License-Identifier: CC0-1.0
// Read the serialized GLBs. No scoring formula, threshold or pose is changed here.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'runtime');
const cli = process.env.SOCCER_TACKLE_QA_CLI;
if (!cli) throw new Error('Run source/run-qa.mjs to prepare the pinned QA tool.');
const {sampleGLB} = await import(new URL('./glb.mjs', cli));
export const SOURCES = Object.freeze([{
  id: 'soccer-tackle-keeper-v2', sport: 'soccer', version: 2,
  ref: 'codex/soccer-tackle-keeper-v2', commit: process.env.SOCCER_TACKLE_SOURCE_COMMIT ?? 'working-tree',
  path: 'workout/island/design/soccer-tackle-keeper-v2', kind: 'serialized-native-GLB-sequences',
}]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const eventTime = event => event.timeSeconds ?? event.atSeconds ?? event.time ?? (event.frame ?? 0) / 30;
const clipDuration = entry => entry.durationSeconds ?? entry.duration;
const eventsOf = entry => (entry.events ?? entry.metadata?.events ?? []).map(event => ({...event,
  type: event.type ?? event.name ?? event.event, time: eventTime(event),
  bone: event.bone ?? event.effector, local: event.local ?? event.localPointMeters,
}));
const supportsOf = entry => (entry.supports ?? entry.metadata?.supports ?? []).map(window => ({...window,
  start: window.startSeconds ?? window.start, end: window.endSeconds ?? window.end,
  local: window.local ?? window.effectorOffsetMeters ?? [0, -.08, 0],
}));
function ballAt(ball, time) {
  const keys = ball?.samples ?? ball?.keys;
  if (!keys?.length) return null;
  const position = key => key.position ?? key.positionMeters;
  const seconds = key => key.timeSeconds ?? key.time;
  if (time <= seconds(keys[0])) return [...position(keys[0])];
  for (let i = 1; i < keys.length; i++) if (time <= seconds(keys[i])) {
    const a = keys[i - 1], b = keys[i], alpha = (time - seconds(a)) / (seconds(b) - seconds(a));
    return position(a).map((value, j) => value + alpha * (position(b)[j] - value));
  }
  return [...position(keys.at(-1))];
}
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, value, i) => sum + value * b[i], 0)) / (Math.hypot(...a) * Math.hypot(...b)))) * 180 / Math.PI;
function velocity(frames, end, bone) {
  const a = frames[end ? frames.length - 2 : 0], b = frames[end ? frames.length - 1 : 1];
  return a.joints[bone].map((value, i) => (b.joints[bone][i] - value) / (b.t - a.t));
}
export function measureSeam(before, after) {
  const a = before.frames.at(-1), b = after.frames[0];
  const names = Object.keys(a.joints).filter(name => name !== 'Root' && b.joints[name]);
  const positions = names.map(name => distance(a.joints[name], b.joints[name]));
  const rotations = names.map(name => qangle(a.rotations[name], b.rotations[name]));
  const velocities = names.map(name => distance(velocity(before.frames, true, name), velocity(after.frames, false, name)));
  return {from: before.id, to: after.id, maxMarkerMeters: Math.max(...positions), rmsMarkerMeters: rms(positions),
    maxRotationDegrees: Math.max(...rotations), rmsRotationDegrees: rms(rotations),
    rmsVelocityMetersPerSecond: rms(velocities), maxVelocityMetersPerSecond: Math.max(...velocities)};
}
function concatenate(parts) {
  const seams = parts.slice(1).map((part, i) => measureSeam(parts[i], part));
  for (const seam of seams) assert(seam.maxMarkerMeters < .001 && seam.maxRotationDegrees < .1,
    `${seam.from} → ${seam.to}: nonmatching serialized seam (${seam.maxMarkerMeters}m, ${seam.maxRotationDegrees}°)`);
  const frames = [], supports = [], events = [], ballContacts = [];
  let offset = 0;
  for (const part of parts) {
    for (const frame of part.frames) if (!frames.length || frame.t > 1e-7) frames.push({...frame, t: frame.t + offset});
    supports.push(...part.metadata.supports.map(window => ({...window, start: window.start + offset, end: window.end + offset})));
    events.push(...part.metadata.events.map(event => ({...event, time: event.time + offset})));
    ballContacts.push(...part.metadata.ballContacts.map(window => ({...window, start: window.start + offset, end: window.end + offset})));
    offset += part.duration;
  }
  const first = parts[0], measuredBall = parts.some(part => part.metadata.ballVisible);
  return {id: parts.length > 1 ? `${first.id}__with_recovery` : first.id, motionId: first.id,
    label: `${first.label}${parts.length > 1 ? ' + קימה' : ''}`, role: first.role, duration: offset, height: first.height, frames,
    metadata: {...first.metadata, events, supports, ballContacts, ballVisible: measuredBall,
      ballContactExpected: parts.some(part => part.metadata.ballContactExpected),
      sequence: parts.map(part => ({id: part.id, duration: part.duration})), seams,
      scoringScope: 'Actual serialized action and declared recovery concatenated at matching poses; idle endpoints measured by unchanged CLI.'}};
}

export async function loadAssets({fps = 60} = {}) {
  const records = [], seen = new Set();
  async function read(relative) {
    const file = path.resolve(runtime, relative);
    assert(file.startsWith(`${runtime}${path.sep}`), `Asset escapes runtime/: ${relative}`);
    const bytes = await readFile(file);
    if (!seen.has(relative)) {
      seen.add(relative); records.push({path: `${SOURCES[0].path}/runtime/${relative}`, bytes: bytes.length,
        sha256: hash(bytes), gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')});
    }
    return bytes;
  }
  const catalog = JSON.parse(await read('catalog.json'));
  await read('motions.json');
  async function sampleEntry(entry, reference = false) {
    const asset = entry.asset ?? entry.animation?.replace(/^runtime\//, '');
    const events = eventsOf(entry), supports = supportsOf(entry), ball = entry.ball ?? entry.metadata?.ball;
    const ballContacts = (entry.ballContacts ?? entry.metadata?.ballContacts ?? []).map(window => ({...window,
      start: window.startSeconds ?? window.start ?? window.time, end: window.endSeconds ?? window.end ?? window.time,
      local: window.local ?? window.localPointMeters}));
    const hasTrajectory = !!(ball?.samples?.length || ball?.keys?.length);
    const native = sampleGLB(await read(asset), {fps, ...(entry.animationName ? {animation: entry.animationName} : {}),
      extraTimes: [...events.map(event => event.time), ...supports.flatMap(window => [window.start, window.end]),
        ...ballContacts.flatMap(window => [window.start, window.end])]});
    const duration = clipDuration(entry) ?? native.duration;
    assert(Math.abs(native.duration - duration) < 2e-5, `${entry.id}: serialized duration differs from catalog`);
    for (const frame of native.frames) {
      frame.localJoints = structuredClone(frame.joints); frame.assetRoot = [...frame.root];
      frame.referenceRoot = [0, 0, 0]; frame.ball = hasTrajectory ? ballAt(ball, frame.t) : null;
      assert(Object.keys(frame.joints).length === 18, `${entry.id}: expected 18 canonical joints`);
      assert(Math.hypot(...frame.root) < 1e-6 && qangle(frame.rotations.Root, [0, 0, 0, 1]) < 1e-4,
        `${entry.id}: Root must remain at origin with identity rotation`);
    }
    return {id: entry.id, motionId: entry.id, label: entry.label ?? entry.metadata?.label ?? entry.id,
      role: entry.role ?? entry.metadata?.role ?? 'field', duration, height: native.height,
      frames: native.frames, asset, entry,
      metadata: {...entry.metadata, ...entry, events, supports, ballContacts,
        rootMotion: false, locomotion: false, referenceTravelKnown: false,
        ballVisible: hasTrajectory && !reference, ballContactExpected: hasTrajectory && ballContacts.length > 0,
        ball: {...(ball ?? {}), radius: ball?.radius ?? ball?.radiusMeters ?? .12},
        ballRadius: ball?.radius ?? ball?.radiusMeters ?? .12,
        checkHingeDirection: true, symmetryMode: entry.symmetryMode ?? entry.metadata?.symmetryMode ?? 'structural',
        soleLocal: [0, -.08, 0], sourceAsset: asset,
        contactMeasurement: hasTrajectory ? 'Declared independent demonstration trajectory; exact contacts sampled.' :
          'Presentation cue only. No ball trajectory is supplied or measured; simulation owns the result.',
        coordinateSpace: 'Native serialized canonical metres, Root fixed; no reference travel, retargeting, IK or floor correction applied.'}};
  }
  const rawClips = [];
  for (const entry of catalog.clips) rawClips.push(await sampleEntry(entry));
  const idleEntry = {id: 'idle_relaxed_reference', asset: 'reference/idle_relaxed.glb', ...(catalog.idleReference ?? {})};
  const runEntry = {id: 'run_reference', asset: 'reference/run.glb', ...(catalog.runReference ?? {})};
  const idle = await sampleEntry(idleEntry, true), run = await sampleEntry(runEntry, true);
  const byId = new Map(rawClips.map(clip => [clip.id, clip]));
  const targeted = new Set(rawClips.map(clip => clip.entry.next).filter(Boolean));
  const sequences = [];
  for (const clip of rawClips) {
    if (targeted.has(clip.id) || clip.entry.preceding || /^getup/.test(clip.id)) continue;
    const parts = [clip], visited = new Set([clip.id]);
    while (parts.at(-1).entry.next) {
      const id = parts.at(-1).entry.next;
      assert(byId.has(id) && !visited.has(id), `Missing or cyclic recovery ${id}`);
      visited.add(id); parts.push(byId.get(id));
    }
    sequences.push(concatenate(parts));
  }
  return {catalog, rawClips, sequences, idle, run, records, byId};
}

export async function loadLibraries({fps = 60} = {}) {
  const {sequences, idle, records} = await loadAssets({fps});
  const roles = [...new Set(sequences.map(clip => clip.role))];
  const references = roles.map(role => ({...idle, id: `idle_relaxed_reference_${role}`, role,
    metadata: {...idle.metadata, role, loop: true, sourceLibrary: undefined,
      scoringScope: 'Reference row, excluded from delivery gate.'}}));
  return [{...SOURCES[0], source: SOURCES[0], sources: records, clips: [...sequences, ...references]}];
}
