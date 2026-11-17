import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(process.env.REVIEW_FIX_ROOT || process.cwd());
const fromRoot = p => pathToFileURL(resolve(root, p));
const T = await import(fromRoot('workout/island/vendor/three.module.js'));
const view = await import(fromRoot('workout/island/minigames/alpine-view.mjs'));
const steer = await import(fromRoot('workout/island/minigames/alpine-steer.mjs'));
const source = await readFile(fromRoot('workout/island/minigames/alpine-view.mjs'), 'utf8');
// Before the patch the view dispatch calls travelYaw directly. The compatibility
// branch lets the regression fail on its wrong world direction, not a missing export.
const yaw = view.riderRootYaw || ((tilt, frame, speed, lateral, v241 = true) => {
  assert.match(source, /const yawShown = V241 && !s\.crashed \? travelYaw\(/);
  return v241 && !frame.crashed ? steer.travelYaw(tilt, frame, speed, lateral) : steer.carvePose(tilt).yaw;
});
const worldForward = (rootYaw, theta = 0) => new T.Vector3(0, 0, 1)
  .applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI)
  .applyAxisAngle(new T.Vector3(0, 1, 0), -theta + rootYaw);

test('V241-011: the production view root faces the real velocity, both ways and at braking speed', () => {
  const rows = [];
  for (const speed of [20, 11, 4]) for (const lean of [-1, -.4, 0, .4, 1]) for (const theta of [0, -.55, .55]) {
    const rootYaw = yaw(lean, {lean}, speed, 8.5, true, '');
    const velocity = new T.Vector3(lean * 8.5, 0, -speed).normalize().applyAxisAngle(new T.Vector3(0, 1, 0), -theta);
    const gap = worldForward(rootYaw, theta).angleTo(velocity);
    assert.ok(gap < 1e-6, `speed=${speed}, lean=${lean}, course=${theta}: heading error ${gap * 180 / Math.PI} degrees`);
    rows.push({speed, lean, theta, yaw: rootYaw, gapDeg: gap * 180 / Math.PI});
  }
  assert.match(source, /const yawShown = riderRootYaw\(r\.tilt, s,/,
    'the tested view export is the function dispatched onto each actual rider root');
  console.log(JSON.stringify({production: 'alpine-view.riderRootYaw', rows}));
});

test('V241-011: lead follows intent; both rollback paths and crash presentation retain their original pose', () => {
  for (const side of [-1, 1]) {
    assert.ok(worldForward(yaw(side, {lean: 0}, 11, 8.5, true, '')).x * side > 0, 'lead turns toward the requested side');
    assert.equal(yaw(side, {lean: side}, 11, 8.5, true, '?alpineYawFix=0'), steer.travelYaw(side, {lean: side}, 11, 8.5));
    assert.equal(yaw(side, {lean: side}, 11, 8.5, false, ''), steer.carvePose(side).yaw);
    assert.equal(yaw(side, {lean: side, crashed: true}, 11, 8.5, true, ''), steer.carvePose(side).yaw);
  }
});
