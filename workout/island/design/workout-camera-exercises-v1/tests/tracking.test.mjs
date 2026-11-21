import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureLight, PoseTracker } from '../../../../js/camera-v1/tracking.mjs';

const point = (x, y, visibility = .97) => ({ x, y, z: 0, visibility, presence: .99 });
function player({ dx = 0, dy = 0, scale = 1, headY = .15, side = false } = {}) {
  const points = Array.from({ length: 33 }, () => point(.5, .44, 0));
  const half = side ? .018 : .105;
  const coordinates = {
    0: [.5, headY], 7: [.47, headY + .02], 8: [.53, headY + .02],
    11: [.5 - half, .29], 12: [.5 + half, .29],
    13: [.5 - half - .02, .41], 14: [.5 + half + .02, .41],
    15: [.5 - half - .03, .49], 16: [.5 + half + .03, .49],
    23: [.5 - half * .8, .50], 24: [.5 + half * .8, .50],
    25: [.46, .64], 26: [.54, .64],
    27: [.46, .81], 28: [.54, .81],
    29: [.46, .815], 30: [.54, .815],
    31: [.45, .82], 32: [.55, .82],
  };
  for (const [id, [x, y]] of Object.entries(coordinates)) {
    points[id] = point(.5 + (x - .5) * scale + dx, .5 + (y - .5) * scale + dy);
  }
  return { landmarks: points, world: [] };
}
const stabilize = (tracker, pose = player(), from = 0) =>
  Array.from({ length: 9 }, (_, i) => tracker.update({ poses: [pose], time: from + i * 90 }));

test('stable pose alone opens camera sensing and offers a demonstration', () => {
  const tracker = new PoseTracker();
  const frames = stabilize(tracker);
  assert.ok(frames.slice(0, 8).every(frame => frame.status === 'calibrating' && frame.pose === null));
  assert.equal(frames[8].status, 'ready');
  assert.equal(frames[8].gap, true);
  assert.equal(frames[8].hint.code, 'demo');
  assert.ok(frames[8].calibration.floor > .8);
  assert.ok(frames[8].calibration.torso > .2);
  const next = tracker.update({ poses: [player()], time: 810 });
  assert.equal(next.gap, false);
  assert.equal(next.hint, null);
});

test('a smaller second person or an entrant with only head and shoulders interrupts immediately', () => {
  const tracker = new PoseTracker();
  const primary = player();
  const small = player({ dx: .34, scale: .29 });
  stabilize(tracker, primary);
  const crowded = tracker.update({ poses: [small, primary], time: 810 });
  assert.equal(crowded.status, 'multiple');
  assert.equal(crowded.pose, null);
  assert.equal(crowded.gap, true);
  assert.equal(stabilize(tracker, primary, 900).at(-1).status, 'ready');
  small.landmarks = small.landmarks.map((p, id) => [0, 11, 12].includes(id) ? p : null);
  assert.equal(tracker.update({ poses: [primary, small], time: 1710 }).status, 'multiple');
});

test('light quality & interruption never bridge pose windows', () => {
  const tracker = new PoseTracker();
  const pose = player();
  stabilize(tracker, pose);
  const dark = tracker.update({ poses: [pose], time: 810, light: { p50: 19, p90: 27 } });
  assert.equal(dark.status, 'dark');
  assert.equal(dark.pose, null);
  const backlit = tracker.update({ poses: [pose], time: 900, light: { p50: 39, p90: 201, subjectP50: 17, subjectP90: 49 } });
  assert.equal(backlit.status, 'backlit');
  const recovery = stabilize(tracker, pose, 990);
  assert.equal(recovery[0].status, 'calibrating');
  assert.equal(recovery.at(-1).gap, true);
  const late = tracker.update({ poses: [pose], time: 2300 });
  assert.equal(late.status, 'calibrating');
  assert.equal(tracker.update({ poses: [pose], time: 2299 }).status, 'stale');
});

test('luminance samples ignore transparent pixels and distinguish shaded torso', () => {
  const shades = [40, 40, 240, 240, 40, 40, 240, 240, 40, 40, 240, 240, 40, 40, 240, 255];
  const rgba = Uint8ClampedArray.from(shades.flatMap((shade, id) => [shade, shade, shade, id === 15 ? 0 : 255]));
  assert.deepEqual(measureLight(rgba, { width: 4, height: 4, region: { left: 0, right: .5, top: 0, bottom: 1 } }),
    { p50: 40, p90: 240, subjectP50: 40, subjectP90: 40 });
  assert.equal(measureLight([0, 0, 0, 0]), null);
});

test('a dark shirt in normal ambient light or a lit face does not alone interrupt', () => {
  const tracker = new PoseTracker();
  const pose = player();
  stabilize(tracker, pose);
  const brightRoom = tracker.update({ poses: [pose], time: 810,
    light: { p50: 100, p90: 220, subjectP50: 14, subjectP90: 35 } });
  assert.equal(brightRoom.status, 'ready');
  const litFace = tracker.update({ poses: [pose], time: 900,
    light: { p50: 40, p90: 220, subjectP50: 14, subjectP90: 110 } });
  assert.equal(litFace.status, 'ready');
});

test('framing advice identifies near, far, view, and persistent cutoff at the top', () => {
  const tracker = new PoseTracker({ view: 'side' });
  const see = (pose, time) => tracker.update({ poses: [pose], time });
  assert.equal(see(player({ scale: 1.4 }), 0).status, 'move-back');
  assert.equal(see(player({ scale: .20 }), 90).status, 'move-closer');
  assert.equal(see(player(), 180).status, 'turn-side');
  assert.equal(see(player({ dx: .39 }), 270).status, 'center');
  for (let time = 360; time <= 630; time += 90) {
    assert.equal(see(player({ headY: .018 }), time).status, 'center');
  }
  assert.equal(see(player({ headY: .018 }), 720).status, 'raise-phone');
});

test('a sudden subject center or scale jump resets track continuity', () => {
  const tracker = new PoseTracker();
  stabilize(tracker);
  const teleported = player({ dx: .23 });
  const jump = tracker.update({ poses: [teleported], time: 810 });
  assert.equal(jump.status, 'reacquiring');
  assert.equal(jump.calibration, null);
  assert.equal(stabilize(tracker, teleported, 900).at(-1).gap, true);
  const resized = tracker.update({ poses: [player({ dx: .23, scale: .62 })], time: 1710 });
  assert.equal(resized.status, 'reacquiring');
});

test('a projected change isolated to the torso does not reset exercise motion', () => {
  const tracker = new PoseTracker();
  stabilize(tracker);
  const crouched = player();
  crouched.landmarks[11].y = .372;
  crouched.landmarks[12].y = .372;
  const frame = tracker.update({ poses: [crouched], time: 810 });
  assert.equal(frame.status, 'ready');
  assert.equal(frame.gap, false);
});

test('OR groups admit the visible side and smoothing retains fresh scores', () => {
  const tracker = new PoseTracker({ view: 'side', required: [[11, 13, 15], [12, 14, 16]] });
  const pose = player({ side: true });
  pose.landmarks[13].visibility = .2;
  const start = stabilize(tracker, pose).at(-1);
  assert.equal(start.status, 'ready');
  const jitter = player({ side: true });
  jitter.landmarks[13].visibility = .2;
  jitter.landmarks[16] = point(pose.landmarks[16].x + .014, pose.landmarks[16].y, .87);
  const smoothed = tracker.update({ poses: [jitter], time: 753 }).pose.landmarks[16];
  assert.ok(smoothed.x > pose.landmarks[16].x && smoothed.x < jitter.landmarks[16].x);
  assert.equal(smoothed.visibility, .87);
  jitter.landmarks[16].visibility = .12;
  assert.equal(tracker.update({ poses: [jitter], time: 786 }).status, 'missing');
});
