// SPDX-License-Identifier: CC0-1.0
// Adapter only: the pinned QA sampler, metrics, weights and thresholds are unchanged.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const source = {
  id: 'soccer-kicks-v2', sport: 'soccer', version: 'kicks-v2',
  ref: 'codex/soccer-kicks-v2', commit: 'working-tree',
  baseCommit: process.env.SOCCER_KICKS_BASE_COMMIT ?? null,
  assetIdentity: 'SHA-256 of catalog, authored poses and each sampled GLB in sources records',
  path: 'workout/island/design/soccer-kicks-v2', kind: 'soccer', catalog: 'runtime/catalog.json',
};
export const SOURCES = Object.freeze([source]);
const qaRoot = process.env.SOCCER_KICKS_QA_ROOT;
if (!qaRoot) throw new Error('SOCCER_KICKS_QA_ROOT must identify the pinned QA workspace.');
const {sampleGLB} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);

export function track(keys, time) {
  if (!keys?.length) return null;
  const position = key => key.position ?? key.positionMeters ?? key.referenceRootTranslationMeters;
  if (time <= keys[0].time) return [...position(keys[0])];
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i].time) {
      const a = keys[i - 1], b = keys[i], u = (time - a.time) / (b.time - a.time);
      return position(a).map((v, j) => v + (position(b)[j] - v) * u);
    }
  }
  return [...position(keys.at(-1))];
}

export async function loadKickAssets({fps = 120} = {}) {
  const records = [], clips = [];
  async function read(relative) {
    const buffer = await readFile(path.join(base, relative));
    records.push({path: `${source.path}/${relative}`, bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      gitBlob: createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex')});
    return buffer;
  }
  const catalog = JSON.parse((await read('runtime/catalog.json')).toString('utf8'));
  await read('runtime/motions.json');
  async function sample(entry, relative, isReference = false) {
    const events = (entry.events ?? []).map(e => ({...e,
      type: e.type ?? e.name ?? e.event,
      time: e.timeSeconds ?? e.atSeconds ?? e.time ?? (e.frame ?? 0) / 30,
      bone: e.bone ?? e.effector, local: e.local ?? e.localPointMeters}));
    const supports = (entry.supports ?? entry.supportWindows ?? []).map(w => ({...w,
      start: w.startSeconds ?? w.start, end: w.endSeconds ?? w.end,
      local: w.local ?? [0, -.08, 0]}));
    const ballContacts = [...(entry.ballContacts ?? [])];
    for (const e of events) if (e.type === 'contact' && e.bone) {
      ballContacts.push({bone: e.bone, start: e.time, end: e.time, local: e.local});
    }
    const travel = entry.referenceRootMotion?.samples ?? entry.travel;
    const ballKeys = entry.ball?.samples ?? entry.ball?.keys;
    const extraTimes = [entry.coreRange?.start, entry.coreRange?.end,
      ...events.map(e => e.time), ...supports.flatMap(w => [w.start, w.end]),
      ...ballContacts.flatMap(w => [w.start, w.end]), ...(travel ?? []).map(k => k.time)];
    const native = sampleGLB(await read(relative), {fps, extraTimes});
    const nativeFrames = structuredClone(native.frames);
    // This is the original QA source convention: in-place poses + explicit
    // author travel scenario become presented world poses for support measures.
    for (const frame of native.frames) {
      frame.ball = track(ballKeys, frame.t);
      frame.localJoints = structuredClone(frame.joints);
      frame.rawJoints = structuredClone(frame.joints);
      frame.rawRotations = structuredClone(frame.rotations);
      frame.assetRoot = [...frame.root];
      frame.referenceRoot = track(travel, frame.t) ?? [0, 0, 0];
      if (travel?.length) {
        frame.joints = Object.fromEntries(Object.entries(frame.joints).map(([name, p]) =>
          [name, p.map((v, i) => v + frame.referenceRoot[i])]));
        frame.root = frame.root.map((v, i) => v + frame.referenceRoot[i]);
        if (frame.ball && entry.ball?.coordinateSpace !== 'world') {
          frame.ball = frame.ball.map((v, i) => v + frame.referenceRoot[i]);
        }
      }
    }
    const radius = entry.ball?.radius ?? entry.ball?.radiusMeters ?? .11;
    const profile = entry.entry?.reference === 'run' ? 'run-boundary' : '';
    return {id: entry.id, motionId: entry.id, label: entry.label ?? entry.labelHe ?? entry.id,
      profile, duration: entry.durationSeconds ?? entry.duration ?? native.duration, height: native.height,
      metadata: {...entry, role: 'field', profile, kind: entry.kind ?? entry.category ?? 'kick',
        events, supports, ballContacts, ball: {...(entry.ball ?? {}), radius}, ballRadius: radius,
        ballVisible: !isReference, locomotion: entry.locomotion ?? false,
        soleLocal: [0, -.08, 0], checkHingeDirection: true,
        symmetryMode: entry.symmetryMode ?? 'structural',
        referenceTravelKnown: !!travel?.length, sourceAsset: relative,
        coordinateSpace: travel?.length ? 'native in-place canonical metres plus explicit reference travel' :
          'native in-place canonical metres; no reference root path applied'},
      frames: native.frames, nativeFrames, nativeDuration: native.duration};
  }
  for (const entry of catalog.clips) clips.push(await sample(entry, `runtime/${entry.asset}`));
  const idle = await sample({id: 'idle_relaxed', loop: true, category: 'reference'},
    'runtime/reference/idle_relaxed.glb', true);
  const running = catalog.clips.find(c => c.id === 'running_kick');
  const runDuration = sampleGLB(await readFile(path.join(base, 'runtime/reference/run.glb')), {fps: 1}).duration;
  const speed = running.referenceRootMotion.speedMetersPerSecond;
  // The reference is the same continuous run cycle, using the actual gait
  // supports and travel speed authored for running_kick, clipped to that cycle.
  const runSupports = running.supports.filter(w => w.start < runDuration - 1e-6)
    .map(w => ({...w, end: Math.min(w.end, runDuration)}));
  const run = await sample({id: 'idle_run_reference', label: 'run.glb (run boundary reference)',
    loop: true, category: 'reference', locomotion: true, rootMotion: false,
    supports: runSupports,
    referenceRootMotion: {speedMetersPerSecond: speed, coordinateSpace: 'world', samples: [
      {time: 0, position: [0, 0, 0]}, {time: runDuration, position: [0, 0, speed * runDuration]}]},
    entry: {reference: 'run'}}, 'runtime/reference/run.glb', true);
  return {catalog, clips, idle, run, records};
}

export async function loadLibraries({fps = 120} = {}) {
  const {clips, idle, run, records} = await loadKickAssets({fps});
  // Unmodified run.mjs locates an idle/ready/stance row with matching profile.
  // This explicit reference row contains the real run.glb, with its real poses
  // and velocity. It is never included among the 14 delivery-gated actions.
  const all = [...clips, idle, run].map(({nativeFrames, ...clip}) => clip);
  return [{...source, source, clips: all, sources: records}];
}
