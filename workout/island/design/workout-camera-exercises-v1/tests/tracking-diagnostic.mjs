import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { front, edit, clip, recording } from '../fixtures/geometry.mjs';

const workout = process.env.WORKOUT_V1_REPO
  ? pathToFileURL(resolve(process.env.WORKOUT_V1_REPO, 'workout') + '/')
  : new URL('../../../../', import.meta.url);
const tracking = process.env.WORKOUT_V1_TRACKING
  ? pathToFileURL(resolve(process.env.WORKOUT_V1_TRACKING))
  : new URL('js/camera-v1/tracking.mjs', workout);
const [{ PoseTracker }, { PoseFilter, thresholds }] = await Promise.all([
  import(tracking),
  import(new URL('cam-lab/counter.mjs', workout)),
]);

const steady = clip('wrist-check', { rest: front, phases: [[front, 6200, 0]], expected: 0 });
const tracker = new PoseTracker({required:[11,13,15]});
let squaredRaw = 0;
let squaredSmoothed = 0;
let squaredLegacy = 0;
const legacy = new PoseFilter('jumping-jacks', thresholds());
let samples = 0;
for (const frame of recording(steady, {step: 62, jitter: .006})) {
  const result = tracker.update(frame);
  const original = legacy.update(frame.poses[0].landmarks, frame.poses[0].world, frame.time, frame.aspect);
  if (!frame.active || !result.ready) continue;
  const error = row => Math.hypot(row.x - front.lw[0], row.y - front.lw[1]);
  squaredRaw += error(frame.poses[0].landmarks[15]) ** 2;
  squaredSmoothed += error(result.pose.landmarks[15]) ** 2;
  squaredLegacy += error(original.points[15]) ** 2;
  samples++;
}
const output = {
  samples,
  rawRms: Math.sqrt(squaredRaw / samples),
  legacyRms: Math.sqrt(squaredLegacy / samples),
  smoothedRms: Math.sqrt(squaredSmoothed / samples),
  reductionVsRawPct: 100*(1-Math.sqrt(squaredSmoothed/squaredRaw)),
  reductionVsLegacyPct: 100*(1-Math.sqrt(squaredSmoothed/squaredLegacy)),
};
const target = edit(front, { lw: [front.lw[0] - .095, front.lw[1]] });
const motion = clip('motion-check', { rest: front, phases: [[target, 400, 0]], expected: 0 });
tracker.reset();
legacy.reset();
output.response = [];
for (const frame of recording(motion, {step: 62})) {
  const result = tracker.update(frame);
  const original = legacy.update(frame.poses[0].landmarks, frame.poses[0].world, frame.time, frame.aspect);
  const newX = result.pose?.landmarks[15]?.x;
  const legacyX = original.points[15]?.x;
  if (result.ready && frame.active && frame.movementMs > 0 && frame.movementMs <= 124)
    output.response.push({time: frame.movementMs, legacyFraction: (front.lw[0] - legacyX) / .095,
      v1Fraction: (front.lw[0] - newX) / .095});
}
console.log(JSON.stringify(output, null, 2));
