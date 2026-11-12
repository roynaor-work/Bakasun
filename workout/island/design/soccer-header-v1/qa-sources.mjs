// SPDX-License-Identifier: CC0-1.0
// Original loader for new header assets; the pinned QA formulas remain unmodified.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const source = {
  id: 'soccer-header-v1', sport: 'soccer', version: 'header-v1',
  ref: 'codex/soccer-header-v1', commit: process.env.SOCCER_HEADER_SOURCE_COMMIT ?? 'working-tree',
  path: 'workout/island/design/soccer-header-v1', kind: 'soccer', catalog: 'runtime/catalog.json',
};
export const SOURCES = Object.freeze([source]);
const qaRoot = process.env.SOCCER_HEADER_QA_ROOT;
if (!qaRoot) throw new Error('SOCCER_HEADER_QA_ROOT must identify the pinned QA workspace.');
const {sampleGLB} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);

function track(keys, time) {
  if (!keys?.length) return null;
  const point = key => key.position ?? key.positionMeters;
  if (time <= keys[0].time) return [...point(keys[0])];
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i].time) {
      const a = keys[i - 1], b = keys[i];
      const u = (time - a.time) / (b.time - a.time);
      return point(a).map((v, j) => v + (point(b)[j] - v) * u);
    }
  }
  return [...point(keys.at(-1))];
}

export async function loadHeaderAssets({fps = 60} = {}) {
  const catalog = JSON.parse(await readFile(path.join(base, 'runtime/catalog.json'), 'utf8'));
  const records = [], clips = [];
  async function read(relative) {
    const buffer = await readFile(path.join(base, relative));
    records.push({path: `${source.path}/${relative}`, bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      gitBlob: createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex')});
    return buffer;
  }
  async function sample(entry, relative, isReference = false) {
    const duration = entry.durationSeconds ?? entry.duration;
    const events = (entry.events ?? []).map(e => ({...e,
      type: e.type ?? e.name ?? e.event, time: e.timeSeconds ?? e.atSeconds ?? e.time ?? (e.frame ?? 0) / 30,
      bone: e.bone ?? e.effector, local: e.local ?? e.localPointMeters}));
    const supports = (entry.supports ?? entry.supportWindows ?? []).map(w => ({...w,
      start: w.startSeconds ?? w.start, end: w.endSeconds ?? w.end, local: w.local ?? [0, -.08, 0]}));
    const ballContacts = (entry.ballContactWindows ?? entry.ballContacts ?? []).map(w => ({...w}));
    for (const e of events) if (e.type === 'contact' && e.bone) {
      ballContacts.push({bone: e.bone, start: e.time, end: e.time, local: e.local});
    }
    const extraTimes = [entry.coreRange?.start, entry.coreRange?.end,
      ...events.map(e => e.time), ...supports.flatMap(w => [w.start, w.end]),
      ...ballContacts.flatMap(w => [w.start, w.end])];
    const native = sampleGLB(await read(relative), {fps, extraTimes});
    for (const frame of native.frames) {
      frame.ball = entry.ball ? track(entry.ball.samples ?? entry.ball.keys, frame.t) : null;
      frame.localJoints = structuredClone(frame.joints);
      frame.assetRoot = [...frame.root];
      frame.referenceRoot = [0, 0, 0];
    }
    const radius = entry.ball?.radius ?? entry.ball?.radiusMeters ?? .12;
    return {id: entry.id, motionId: entry.id, label: entry.label ?? entry.labelHe ?? entry.id,
      duration: duration ?? native.duration, height: native.height,
      metadata: {...entry, role: 'field', kind: entry.kind ?? entry.category ?? 'header',
        events, supports, ballContacts, ball: {...(entry.ball ?? {}), radius}, ballRadius: radius,
        rootMotion: false, ballVisible: !isReference, locomotion: false,
        soleLocal: [0, -.08, 0], checkHingeDirection: true,
        symmetryMode: entry.symmetryMode ?? 'structural',
        referenceTravelKnown: false, sourceAsset: relative,
        coordinateSpace: 'native in-place canonical metres; no reference root path applied'},
      frames: native.frames, nativeDuration: native.duration};
  }
  for (const entry of catalog.clips) {
    clips.push(await sample(entry, `runtime/${entry.asset}`));
  }
  const idle = await sample({id: 'idle_relaxed', loop: true, category: 'reference'},
    'runtime/reference/idle_relaxed.glb', true);
  const run = await sample({id: 'run', loop: true, category: 'reference'},
    'runtime/reference/run.glb', true);
  return {catalog, clips, idle, run, records};
}

export async function loadLibraries({fps = 60} = {}) {
  const {clips, idle, records} = await loadHeaderAssets({fps});
  // The original runner selects its idle from library.clips. It is a documented
  // reference row; only the six header rows are subject to the delivery gate.
  return [{...source, source, clips: [...clips, idle], sources: records}];
}
