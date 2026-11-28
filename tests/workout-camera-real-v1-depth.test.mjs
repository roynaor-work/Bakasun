// Camera workout v1, real-people round two (28/11/2026): push-up depth (camDepth) and the start confidence per
// setup (camConf), each behind its address flag and off by default. Bodies of different sizes stand in for
// children; the real-clip numbers are in workout/tools/camera-v1-QA.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADULT, bodyFromFrames, depthEaseOf, DEPTH_EASE } from '../workout/js/camera-v1/body.mjs';
import { measure, either } from '../workout/js/camera-v1/geometry.mjs';
import { cameraFlags } from '../workout/js/camera-v1/flag.mjs';
import { PoseTracker, confidenceFor, CONFIDENCE_START } from '../workout/js/camera-v1/tracking.mjs';

// A standing body in world coordinates (metres): torso, thigh, shin and arm against the torso.
function world({ torso = ADULT.torsoMeters, thigh = ADULT.thigh, shin = ADULT.shin, arm = ADULT.arm } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
  const half = .19 * torso / ADULT.torsoMeters;
  const put = (i, x, y) => { pts[i] = { x, y, z: 0, visibility: .95, presence: .95 }; };
  for (const [sign, base] of [[-1, 11], [1, 12]]) {
    const x = sign * half;
    put(base, x, -torso); put(base + 12, x * .6, 0);
    put(base + 2, x * 1.15, -torso + arm * torso * .5); put(base + 4, x * 1.2, -torso + arm * torso);
    put(base + 14, x * .6, thigh * torso); put(base + 16, x * .6, (thigh + shin) * torso);
  }
  return pts;
}
const still = (options, n = 8) => Array.from({ length: n }, () => world(options));

test('camDepth: the push-up depth is eased, less so for a child whose arms are short against the torso', () => {
  const grown = depthEaseOf(bodyFromFrames(still({ torso: .48 })));
  const small = depthEaseOf(bodyFromFrames(still({ torso: .28, thigh: .78, arm: .9 })));
  assert.ok(Math.abs(grown - DEPTH_EASE) < .03, 'a tall eleven-year-old gets the grown-up factor: ' + grown);
  assert.ok(small < grown && small >= .6, 'short arms lower less in torso units: ' + small);
  assert.equal(depthEaseOf(null), DEPTH_EASE, 'no body measured: the plain factor');
  assert.ok(depthEaseOf({ arm: .05 }) >= .6 && depthEaseOf({ arm: 9 }) <= .85, 'a nonsense arm stays inside the clamp');
});

test('camDepth: nothing changes unless the flag is on and a reference carries the factor', () => {
  assert.equal(cameraFlags('?x=1').depth, false);
  assert.equal(cameraFlags('?camDepth=1').depth, true);
  const points = Array.from({ length: 33 }, (_, i) => ({ x: .3 + (i % 7) * .05, y: .3 + (i % 5) * .08, visibility: .95, presence: .95 }));
  const required = either('shoulder', 'hip');
  assert.equal(measure(points, .75, null, required)?.depthEase, 1, 'no reference: the depth is as written');
  assert.equal(measure(points, .75, { depthEase: .77, scale: .2 }, required)?.depthEase, .77);
});

test('camConf: floor exercises start on a lower limit, standing ones and the default keep .49', () => {
  assert.equal(confidenceFor({ setup: 'floor' }, false), .49);
  assert.equal(confidenceFor({ setup: 'standing' }, true), .49);
  assert.equal(confidenceFor({ setup: 'floor' }, true), CONFIDENCE_START.floor);
  assert.ok(CONFIDENCE_START.floor < .49 && CONFIDENCE_START.floor > .36, 'above the stay limit, below the common one');
  assert.equal(new PoseTracker({ setup: 'floor' }).startConfidence, .49);
  assert.equal(new PoseTracker({ setup: 'floor', minConfidence: .1 }).startConfidence, .38, 'never below the stay limit');
  assert.equal(cameraFlags('?camConf=1').conf, true);
});
