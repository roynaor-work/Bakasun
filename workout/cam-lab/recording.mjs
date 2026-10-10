import { RepCounter, EXERCISES, FLOOR } from './counter.mjs';
import { PeopleTracker } from './people.mjs';
import { PlacementGuide } from './placement.mjs';

export const RECORDING_LIMIT = 6000; // Four minutes at up to 24 FPS, with a small margin.
export const RECORDING_DURATION = 240000;
const cleanPoints = points => Array.from(points || []).slice(0, 33).map(p => {
  const q = {};
  for (const key of ['x', 'y', 'z', 'visibility', 'presence']) if (Number.isFinite(p?.[key])) q[key] = p[key];
  return q;
});
const POINT_FIELDS = ['x','y','z','visibility','presence'];
function compactPoints(points) {
  return points.map(p => {
    const tuple = POINT_FIELDS.map(key => Number.isFinite(p[key]) ? Number(p[key].toFixed(5)) : null);
    while (tuple.length && tuple.at(-1) == null) tuple.pop();
    return tuple;
  });
}
export function compactRecording(recording) {
  if (recording.version === 2) return recording;
  return { ...recording, version: 2, pointFormat: 'xyzvp', frames: recording.frames.map(f => ({
    ...f, t: Number(f.t.toFixed(2)), poses: f.poses.map(p => ({ landmarks: compactPoints(p.landmarks), world: compactPoints(p.world) }))
  })) };
}
function expandRecording(recording) {
  if (recording?.version !== 2) return recording;
  if (recording.pointFormat !== 'xyzvp' || !Array.isArray(recording.frames) || recording.frames.length > RECORDING_LIMIT) throw new TypeError('קובץ שלד דחוס לא תקין');
  const expand = points => {
    if (!Array.isArray(points) || points.length > 33) throw new TypeError('נקודות שלד דחוסות לא תקינות');
    return points.map(tuple => {
      if (!Array.isArray(tuple) || tuple.length > 5 || tuple.some(v => v != null && !Number.isFinite(v))) throw new TypeError('נקודת שלד דחוסה לא תקינה');
      return Object.fromEntries(tuple.flatMap((v,i) => v == null ? [] : [[POINT_FIELDS[i],v]]));
    });
  };
  return { ...recording, version:1, frames: recording.frames.map(f => {
    if (!f || !Array.isArray(f.poses) || f.poses.length>2) throw new TypeError('פריים שלד דחוס לא תקין');
    return { ...f, poses:f.poses.map(p => ({ landmarks:expand(p?.landmarks), world:expand(p?.world) })) };
  }) };
}
// Opt-in in-memory skeleton buffer. Whitelist every exported field; workers,
// ImageBitmaps, pixels, names and raw age/height can never enter this format.
export class SkeletonRecorder {
  constructor(limit = RECORDING_LIMIT, { compact = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > RECORDING_LIMIT) throw new RangeError('מגבלת פריימים לא תקינה');
    this.limit = limit; this.compact = compact; this.recording = null; this.active = false;
  }
  start({ exercise, mode, thresholds, adultThresholds, aspect }, time) {
    this.recording = { version: this.compact ? 2 : 1, ...(this.compact ? { pointFormat:'xyzvp' } : {}), type: 'cam-lab-skeleton', exercise, mode, aspect,
      thresholds: { ...thresholds }, ...(adultThresholds ? { adultThresholds: { ...adultThresholds } } : {}),
      countStartMs: null, frames: [], stoppedByLimit: false };
    this.origin = time; this.active = true;
  }
  markCountStart(time, armed) {
    const t = time - this.origin;
    if (this.active && Number.isFinite(t) && t >= 0 && t <= RECORDING_DURATION) {
      this.recording.countStartMs = t;
      if (Array.isArray(armed)) this.recording.countArmed = armed.slice(0, 2).map(Boolean);
    }
  }
  add(poses, time, aspect) {
    if (!this.active) return;
    const t = time - this.origin, frames = this.recording.frames;
    if (!Number.isFinite(t) || t < 0 || (frames.length && t <= frames.at(-1).t)) return;
    if (t > RECORDING_DURATION) { this.limitStop('duration', RECORDING_DURATION); return; }
    // Store a changed aspect with the frame that uses it. Dropping resolution
    // in the same orientation leaves the existing aspect unchanged.
    const changedAspect = Number.isFinite(aspect) && aspect > 0 && aspect !== this.recording.aspect;
    frames.push({ t, ...(changedAspect ? { aspect } : {}),
      poses: poses.slice(0, 2).map(p => {
        const landmarks = cleanPoints(p.landmarks), world = cleanPoints(p.world);
        return { landmarks: this.compact ? compactPoints(landmarks) : landmarks, world: this.compact ? compactPoints(world) : world };
      }) });
    if (t === RECORDING_DURATION) this.limitStop('duration', t);
    else if (frames.length >= this.limit) this.limitStop('frames', t);
  }
  limitStop(reason, time) {
    this.active = false; this.recording.stoppedByLimit = true;
    this.recording.stopReason = reason; this.recording.endMs = time;
  }
  stop(time) {
    if (this.recording && Number.isFinite(time) && time >= this.origin) {
      this.recording.endMs = Math.max(this.recording.frames.at(-1)?.t || 0, Math.min(RECORDING_DURATION, time - this.origin));
    }
    this.active = false;
  }
  json({ compact = false } = {}) { return this.recording ? JSON.stringify(compact ? compactRecording(this.recording) : this.recording) : null; }
}

// Consume the downloaded JSON directly in node:test. Expectations live in the
// test, not in the recording. Real family recordings should stay outside git.
export function replayRecording(recording, options = {}) {
  recording = expandRecording(recording);
  const details = options.details === true;
  const hasCountStart = Number.isFinite(recording?.countStartMs) && recording.countStartMs >= 0;
  if (recording?.type !== 'cam-lab-skeleton' || recording.version !== 1 || !EXERCISES.includes(recording.exercise) ||
    !['solo', 'pair'].includes(recording.mode) || !Number.isFinite(recording.aspect) || recording.aspect <= 0 ||
    (!hasCountStart && (!details || recording.countStartMs != null)) ||
    (hasCountStart && recording.countStartMs > RECORDING_DURATION) ||
    !Array.isArray(recording.frames) || recording.frames.length > RECORDING_LIMIT ||
    (recording.endMs != null && (!Number.isFinite(recording.endMs) || recording.endMs < 0 || recording.endMs > RECORDING_DURATION))) {
    throw new TypeError('קובץ הקלטת שלד לא תקין או ללא התחלת ספירה');
  }
  if (recording.countArmed != null && (!Array.isArray(recording.countArmed) || recording.countArmed.length !== (recording.mode === 'pair' ? 2 : 1) ||
    recording.countArmed.some(v => typeof v !== 'boolean'))) throw new TypeError('מוכנות תחילת ספירה לא תקינה');
  const counters = [new RepCounter(recording.exercise)];
  if (recording.mode === 'pair') counters.push(new RepCounter(recording.exercise));
  for (const [i, c] of counters.entries()) {
    const t = i ? recording.adultThresholds : recording.thresholds;
    if (!t || Object.keys(c.t).some(k => !Number.isFinite(t[k]) || t[k] <= 0)) throw new TypeError('ספים לא תקינים');
    c.t = { ...c.t, ...Object.fromEntries(Object.keys(c.t).map(k => [k, t[k]])) };
    const override = i ? options.adultThresholds || options.thresholds : options.thresholds;
    if (override != null) {
      if (typeof override !== 'object' || Array.isArray(override) || Object.entries(override).some(([k, v]) =>
        !Object.hasOwn(c.t, k) || !Number.isFinite(v) || v <= 0)) throw new TypeError('ספים חלופיים לא תקינים');
      Object.assign(c.t, override);
    }
  }
  const preparation = counters.map(c => { const probe = new RepCounter(recording.exercise); probe.t = { ...c.t }; return probe; });
  const stopReasons = counters.map(() => ({})), preparationStops = counters.map(() => ({}));
  const blocked = counters.map(() => null), preparationBlocked = counters.map(() => null);
  const noteStop = (reasons, previous, index, code) => {
    const stop = code && !['armed', 'moving'].includes(code) ? code : null;
    if (stop && stop !== previous[index]) reasons[index][stop] = (reasons[index][stop] || 0) + 1;
    previous[index] = stop;
  };
  const tracker = recording.mode === 'pair' ? new PeopleTracker() : null;
  const placement = new PlacementGuide(); let placementDone = !FLOOR.includes(recording.exercise);
  let started = false, last = -1; const ambiguous = [false, false];
  for (const frame of recording.frames) {
    if (!Number.isFinite(frame.t) || frame.t < 0 || frame.t > RECORDING_DURATION || frame.t <= last ||
      !Array.isArray(frame.poses) || frame.poses.length > 2 ||
      (frame.aspect != null && (!Number.isFinite(frame.aspect) || frame.aspect <= 0)) ||
      frame.poses.some(p => !p || typeof p !== 'object' || !Array.isArray(p.landmarks) || p.landmarks.length > 33 ||
        (p.world != null && (!Array.isArray(p.world) || p.world.length > 33)))) throw new TypeError('רצף פריימים לא תקין');
    last = frame.t;
    const aspect = frame.aspect ?? recording.aspect;
    const preparing = !hasCountStart || frame.t < recording.countStartMs;
    const placementCode = preparing && (!FLOOR.includes(recording.exercise) || !placementDone) ?
      placement.update(frame.poses, frame.t, aspect) : null;
    const poses = tracker ? tracker.update(frame.poses, frame.t, aspect) : [frame.poses[0] || null];
    if (tracker?.tracks.length) placementDone = true;
    if (preparing) {
      preparation.forEach((c, i) => {
        c.update(poses[i]?.landmarks || [], poses[i]?.world || [], frame.t, aspect);
        noteStop(preparationStops, preparationBlocked, i, placementCode ||
          (tracker && !poses[i] ? tracker.status : c.status));
      });
      continue;
    }
    if (!started) { counters.forEach((c,i) => c.begin(recording.countStartMs, recording.countArmed?.[i] ?? true)); started = true; }
    counters.forEach((c, i) => {
      // Identity uncertainty cannot use held points. An ordinary missing pose
      // uses exactly the same bounded per-point grace as the live counter.
      const uncertain = tracker?.status === 'ambiguous';
      if (uncertain && !ambiguous[i]) c.resetTracking('ambiguous');
      ambiguous[i] = uncertain;
      c.update(poses[i]?.landmarks || [], poses[i]?.world || [], frame.t, aspect);
      noteStop(stopReasons, blocked, i, tracker && !poses[i] ? tracker.status : c.status);
    });
  }
  if (recording.endMs != null && recording.endMs < last) throw new TypeError('זמן סיום הקלטה קודם לפריים האחרון');
  counters.forEach(c => c.finish(recording.endMs ?? last));
  return counters.map((c, i) => ({ counted: c.count, rejected: c.rejected, reasons: { ...c.reasons },
    ...(details ? { thresholds: { ...c.t }, diagnostics: c.snapshot(),
      stopReasons: { ...stopReasons[i], ...(!hasCountStart ? { 'no-count-start': 1 } : {}) },
      stops: Object.values(stopReasons[i]).reduce((sum, n) => sum + n, 0) + (!hasCountStart ? 1 : 0),
      preparation: { ...preparation[i].snapshot(), stopReasons: preparationStops[i] } } : {}) }));
}
