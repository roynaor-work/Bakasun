import { RepCounter, EXERCISES, FLOOR, bodyReport, features, worldRequired } from './counter.mjs';
import { PeopleTracker } from './people.mjs';
import { PlacementGuide } from './placement.mjs';

export const RECORDING_LIMIT = 6000; // ~5 minutes at 20 FPS; never silently truncate.
const cleanPoints = points => Array.from(points || []).slice(0, 33).map(p => {
  const q = {};
  for (const key of ['x', 'y', 'z', 'visibility', 'presence']) if (Number.isFinite(p?.[key])) q[key] = p[key];
  return q;
});
// Opt-in in-memory skeleton buffer. Whitelist every exported field; workers,
// ImageBitmaps, pixels, names and raw age/height can never enter this format.
export class SkeletonRecorder {
  constructor(limit = RECORDING_LIMIT) { this.limit = limit; this.recording = null; this.active = false; }
  start({ exercise, mode, thresholds, adultThresholds, aspect }, time) {
    this.recording = { version: 1, type: 'cam-lab-skeleton', exercise, mode, aspect,
      thresholds: { ...thresholds }, ...(adultThresholds ? { adultThresholds: { ...adultThresholds } } : {}),
      countStartMs: null, frames: [], stoppedByLimit: false };
    this.origin = time; this.active = true;
  }
  markCountStart(time) { if (this.active) this.recording.countStartMs = time - this.origin; }
  add(poses, time) {
    if (!this.active) return;
    const t = time - this.origin, frames = this.recording.frames;
    if (t < 0 || (frames.length && t <= frames.at(-1).t)) return;
    frames.push({ t, poses: poses.slice(0, 2).map(p => ({ landmarks: cleanPoints(p.landmarks), world: cleanPoints(p.world) })) });
    if (frames.length >= this.limit) { this.active = false; this.recording.stoppedByLimit = true; }
  }
  stop() { this.active = false; }
  json() { return this.recording ? JSON.stringify(this.recording) : null; }
}

// Consume the downloaded JSON directly in node:test. Expectations live in the
// test, not in the recording. Real family recordings should stay outside git.
export function replayRecording(recording) {
  if (recording?.type !== 'cam-lab-skeleton' || recording.version !== 1 || !EXERCISES.includes(recording.exercise) ||
    !['solo', 'pair'].includes(recording.mode) || !Number.isFinite(recording.aspect) || recording.aspect <= 0 ||
    !Number.isFinite(recording.countStartMs) || !Array.isArray(recording.frames) || recording.frames.length > RECORDING_LIMIT) {
    throw new TypeError('קובץ הקלטת שלד לא תקין או ללא התחלת ספירה');
  }
  const counters = [new RepCounter(recording.exercise)];
  if (recording.mode === 'pair') counters.push(new RepCounter(recording.exercise));
  for (const [i, c] of counters.entries()) {
    const t = i ? recording.adultThresholds : recording.thresholds;
    if (!t || Object.keys(c.t).some(k => !Number.isFinite(t[k]) || t[k] <= 0)) throw new TypeError('ספים לא תקינים');
    c.t = { ...c.t, ...Object.fromEntries(Object.keys(c.t).map(k => [k, t[k]])) };
  }
  const tracker = recording.mode === 'pair' ? new PeopleTracker() : null;
  const placement = new PlacementGuide(); let placementDone = !FLOOR.includes(recording.exercise);
  let started = false, last = -1; const missing = [false, false];
  for (const frame of recording.frames) {
    if (!Number.isFinite(frame.t) || frame.t <= last || !Array.isArray(frame.poses)) throw new TypeError('רצף פריימים לא תקין');
    last = frame.t;
    const placementCode = frame.t < recording.countStartMs && (!FLOOR.includes(recording.exercise) || !placementDone) ?
      placement.update(frame.poses, frame.t, recording.aspect) : null;
    const poses = tracker ? tracker.update(placementCode ? [] : frame.poses, frame.t, recording.aspect) : [frame.poses[0] || null];
    if (tracker?.tracks.length) placementDone = true;
    if (frame.t < recording.countStartMs) continue;
    if (!started) { counters.forEach(c => c.begin(recording.countStartMs, true)); started = true; }
    counters.forEach((c, i) => {
      const report = bodyReport(poses[i]?.landmarks || [], recording.aspect, recording.exercise);
      const valid = report.ok && !worldRequired(recording.exercise,
        features(poses[i]?.landmarks || [], poses[i]?.world || [], recording.aspect, report));
      if (!valid && tracker && !missing[i]) c.resetTracking();
      missing[i] = !valid;
      c.update(poses[i]?.landmarks || [], poses[i]?.world || [], frame.t, recording.aspect);
    });
  }
  counters.forEach(c => c.finish(last));
  return counters.map(c => ({ counted: c.count, rejected: c.rejected, reasons: { ...c.reasons } }));
}
