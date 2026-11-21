import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hallClips } from '../fixtures/hall.mjs';
import { jumpClips, jumpNearMisses } from '../fixtures/jump.mjs';
import { strengthClips } from '../fixtures/strength.mjs';
import { recording } from '../fixtures/geometry.mjs';

const workout = process.env.WORKOUT_V1_REPO
  ? pathToFileURL(resolve(process.env.WORKOUT_V1_REPO, 'workout') + '/')
  : new URL('../../../../', import.meta.url);

function moduleUrl(relative, override) {
  return override ? pathToFileURL(resolve(override)) : new URL(relative, workout);
}

const [
  { EXERCISES: catalog },
  { EXERCISES: oldIds, RepCounter },
  { CAMERA_EXERCISES: policies, MotionCounter },
  { PoseTracker },
] = await Promise.all([
  import(new URL('js/exercises.js', workout)),
  import(new URL('cam-lab/counter.mjs', workout)),
  import(moduleUrl('js/camera-v1/motion.mjs', process.env.WORKOUT_V1_MOTION)),
  import(moduleUrl('js/camera-v1/tracking.mjs', process.env.WORKOUT_V1_TRACKING)),
]);

export { catalog, oldIds, policies, jumpNearMisses };
export const clips = [...jumpClips, ...hallClips, ...strengthClips];
export const clipById = Object.fromEntries(clips.map(spec => [spec.id, spec]));

export const variants = {
  clean: {},
  portrait: { aspect: 9 / 16, scale: .72, dx: -.013, dy: .018, step: 40, jitter: .003 },
  landscape: { aspect: 16 / 9, scale: .86, dx: .016, dy: -.014, step: 67, jitter: .0045 },
  dark: { disturbances: ({ active }) => active ? { light: { p50: 17, p90: 37 } } : {} },
  backlit: { disturbances: ({ active }) => active ? { light: { p50: 47, p90: 218, subjectP50: 17 } } : {} },
  multiple: { disturbances: ({ active }) => active ? { secondary: {} } : {} },
  multipleSwap: { disturbances: ({ active, time }) => active ? { secondary: { first: Math.floor(time / 97) % 2 === 1 } } : {} },
  absent: { disturbances: ({ active }) => active ? { absent: true } : {} },
  wrong: { variant: 'wrong' },
};

export function legacyReplay(spec, options) {
  if (!oldIds.includes(spec.id)) return null;
  // Same solo input and counter as the original workout screen. Start after the
  // warm-up and bypass the presentation countdown so it cannot skew the comparison.
  const counter = new RepCounter(spec.id);
  for (const sample of recording(spec, options)) {
    const person = sample.poses[0];
    counter.update(person?.landmarks ?? [], person?.world ?? [], sample.time, sample.aspect);
  }
  counter.finish();
  return { count: counter.count, rejected: counter.rejected, reasons: counter.reasons };
}

export function replay(spec, options = {}) {
  const policy = policies[spec.id];
  const tracker = new PoseTracker({
    aspect: options.aspect,
    view: policy.view,
    setup: policy.setup,
    required: policy.required,
  });
  const counter = new MotionCounter(spec.id, { goal: options.goal ?? 100 });
  let calibration, result = { count: 0, activeMs: 0 }, justBegan = false;
  const trackingStatuses = {}, hints = {}, events = [];
  for (const sample of recording(spec, options)) {
    const track = tracker.update(sample);
    trackingStatuses[track.status] = (trackingStatuses[track.status] ?? 0) + 1;
    if (track.hint) hints[track.hint.code] = (hints[track.hint.code] ?? 0) + 1;
    if (!track.ready || track.gap) counter.pause();
    if (!track.ready) continue;
    const { landmarks, world } = track.pose;
    if (track.calibration !== calibration) {
      calibration = track.calibration;
      const { reference } = calibration;
      counter.setReference(reference.landmarks, { aspect: sample.aspect, world: reference.world });
    }
    if (!justBegan && sample.active && sample.movementMs >= 0) {
      justBegan = true;
      if (spec.tags.includes('signal-required') && !options.noSignal) counter.signal(sample.time);
    }
    result = counter.update(landmarks, sample.time, { aspect: sample.aspect, world });
    if (result.event) events.push({ time: sample.time, type: result.event.type ?? result.event });
    if (result.hint) {
      const code = result.hint.code ?? result.hint;
      hints[code] = (hints[code] ?? 0) + 1;
    }
  }
  return { count: result.count, activeMs: result.activeMs, sideMs: result.sideMs, trackingStatuses, hints, events };
}

export function matches(result, expected) {
  if (expected.count != null) return result.count === expected.count;
  return result.activeMs >= expected.activeMs[0] && result.activeMs <= expected.activeMs[1];
}
