import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraConstraints, screenOrientation, cameraSnapshot, acquireCamera, selectZoom, configureZoom, findWideCamera,
  reduceResolution, ModelPerformance } from '../workout/cam-lab/camera.mjs';
import { PlacementGuide, placementDistance } from '../workout/cam-lab/placement.mjs';
import { pose, person, floorPose } from './cam-lab-fixtures.js';

test('portrait and landscape request full frame dimensions and a low-FPS resolution', () => {
  const portrait = cameraConstraints(), landscape = cameraConstraints({ facing: 'environment', orientation: 'landscape' });
  assert.equal(portrait.audio, false);
  assert.deepEqual([portrait.video.width.ideal, portrait.video.height.ideal], [720, 1280]);
  assert.deepEqual([landscape.video.width.ideal, landscape.video.height.ideal], [1280, 720]);
  assert.deepEqual(landscape.video.facingMode, { ideal: 'environment' });
  assert.deepEqual(cameraConstraints({ deviceId: 'wide-back' }).video.deviceId, { exact: 'wide-back' });
  for (const [orientation, dimensions] of [['portrait', [480, 640]], ['landscape', [640, 480]]]) {
    const { video } = cameraConstraints({ orientation, lowResolution: true });
    assert.deepEqual([video.width.ideal, video.height.ideal], dimensions);
  }
  assert.equal(screenOrientation({ matchMedia: () => ({ matches: true }) }), 'portrait');
  assert.equal(screenOrientation({ innerWidth: 800, innerHeight: 400 }), 'landscape');
});

function permissionCamera({ support = { zoom: true }, capabilities = { zoom: { min: .5, max: 4 } },
  settings = { zoom: 1, facingMode: 'user', width: 720, height: 1280 }, error = null } = {}) {
  const calls = [], queries = [];
  const track = { getCapabilities: () => capabilities, getSettings: () => settings };
  const stream = { getVideoTracks: () => [track] };
  const mediaDevices = { ...(support === null ? {} : { getSupportedConstraints: () => support }),
    getUserMedia: async constraints => { calls.push(constraints); if (calls.length === 1 && error) throw error; return stream; } };
  const permissions = { query: async descriptor => { queries.push(descriptor); return { state: 'granted' }; } };
  return { calls, queries, track, stream, mediaDevices, permissions };
}

test('camera requests supported PTZ controls and confirms the separate permission', async () => {
  const rig = permissionCamera({ support: { zoom: true, pan: true, tilt: true } });
  const options = { facing: 'environment', orientation: 'landscape', deviceId: 'chosen' };
  const result = await acquireCamera(rig.mediaDevices, options, rig.permissions);
  assert.equal(result.stream, rig.stream);
  assert.deepEqual(rig.calls[0], { audio: false, video: { ...cameraConstraints(options).video, zoom: true, pan: true, tilt: true } });
  assert.deepEqual(rig.queries, [{ name: 'camera', panTiltZoom: true }]);
  assert.deepEqual(result.permission, { requested: true, supported: true, granted: true, state: 'granted',
    fallback: false, requestError: null, actualZoom: 1 });
});

test('PTZ denial and unsupported requests fall back to the unchanged capture constraints', async () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'NotSupportedError', 'OverconstrainedError', 'TypeError']) {
    const rig = permissionCamera({ error: Object.assign(new Error('PTZ unavailable'), { name }) });
    const result = await acquireCamera(rig.mediaDevices, {}, rig.permissions);
    assert.equal(rig.calls.length, 2); assert.equal(rig.calls[0].video.zoom, true);
    assert.deepEqual(rig.calls[1], cameraConstraints());
    assert.equal(result.stream, rig.stream); assert.equal(result.permission.fallback, true);
    assert.equal(result.permission.requested, true); assert.equal(result.permission.requestError, name);
    assert.equal(result.permission.state, ['NotAllowedError', 'SecurityError'].includes(name) ? 'denied' : 'unsupported');
    assert.notEqual(result.permission.granted, true); assert.equal(rig.queries.length, 0);
  }
});

test('known unsupported PTZ captures once without requesting an unavailable permission', async () => {
  for (const support of [{ zoom: false, pan: true, tilt: true }, {}]) {
    const rig = permissionCamera({ support, capabilities: {}, settings: { width: 720, height: 1280 } });
    const result = await acquireCamera(rig.mediaDevices, {}, rig.permissions);
    assert.deepEqual(rig.calls, [cameraConstraints()]); assert.deepEqual(rig.queries, []);
    assert.equal(result.permission.requested, false); assert.equal(result.permission.supported, false);
    assert.equal(result.permission.state, 'unsupported'); assert.equal(result.permission.actualZoom, null);
    assert.equal(result.permission.granted, null); assert.equal(result.permission.fallback, false);
  }
});

test('ignored PTZ requests and generic camera grants never claim a confirmed PTZ grant', async () => {
  for (const [support, capabilities, state] of [[null, { zoom: { min: .5, max: 4 } }, 'unknown'],
    [{ zoom: true }, {}, 'unavailable'], [{ zoom: true }, { zoom: {} }, 'unavailable']]) {
    const rig = permissionCamera({ support, capabilities });
    const result = await acquireCamera(rig.mediaDevices, {}, rig.permissions);
    assert.equal(rig.calls[0].video.zoom, true); assert.equal(result.permission.state, state);
    assert.equal(result.permission.granted, null, 'successful camera capture is not a PTZ permission grant');
  }
  const rig = permissionCamera();
  const unknown = await acquireCamera(rig.mediaDevices, {}, { query: async () => { throw new TypeError('unsupported descriptor'); } });
  assert.equal(unknown.permission.state, 'unknown'); assert.equal(unknown.permission.granted, null);
  for (const state of ['denied', 'prompt']) {
    const ungranted = await acquireCamera(rig.mediaDevices, {}, { query: async () => ({ state }) });
    assert.equal(ungranted.permission.state, state); assert.equal(ungranted.permission.granted, false);
  }
});

test('PTZ fallback preserves a real camera denial and does not retry capture hardware failures', async () => {
  const denied = Object.assign(new Error('capture denied'), { name: 'NotAllowedError' });
  let calls = 0;
  await assert.rejects(acquireCamera({ getSupportedConstraints: () => ({ zoom: true }),
    getUserMedia: async () => { calls++; throw denied; } }), error => error === denied);
  assert.equal(calls, 2);
  const unavailable = Object.assign(new Error('camera in use'), { name: 'NotReadableError' });
  calls = 0;
  await assert.rejects(acquireCamera({ getSupportedConstraints: () => ({ zoom: true }),
    getUserMedia: async () => { calls++; throw unavailable; } }), error => error === unavailable);
  assert.equal(calls, 1);
});

test('zoom ranges choose real supported wide minimum or clamp regular zoom', () => {
  for (const [zoom, wide, expected] of [[{ min: .5, max: 5 }, true, .5], [{ min: .7, max: 2 }, true, .7],
    [{ min: .5, max: 5 }, false, 1], [{ min: 1.2, max: 5 }, true, null], [{ min: .4, max: .8 }, false, .8]]) {
    assert.equal(selectZoom({ zoom }, wide), expected);
  }
  for (const value of [{}, { zoom: {} }, { zoom: { min: 2, max: 1 } }, { zoom: { min: NaN, max: 2 } }]) assert.equal(selectZoom(value), null);
});

test('wide default applies optional controls and reads back effective zoom', async () => {
  let zoom = 1; const calls = [];
  const track = { getSettings: () => ({ zoom, width: 720, deviceId: 'private-id' }), getCapabilities: () => ({ zoom: { min: .5, max: 5 }, deviceId: 'private-id' }),
    applyConstraints: async constraint => { calls.push(constraint); zoom = constraint.advanced[0].zoom; } };
  const wide = await configureZoom(track);
  assert.deepEqual(calls[0], { advanced: [{ zoom: .5 }] });
  assert.equal(wide.actualZoom, .5); assert.match(wide.message, /0.5×/);
  assert.equal(wide.settings.deviceId, undefined); assert.equal(wide.capabilities.deviceId, undefined);
  const regular = await configureZoom(track, { wide: false });
  assert.equal(regular.actualZoom, 1); assert.deepEqual(calls[1], { advanced: [{ zoom: 1 }] });
});

test('confirmed PTZ restores a minimum of 1 while unconfirmed grants preserve round 3 behavior', async () => {
  for (const granted of [true, false, null]) {
    let zoom = 3; const calls = [];
    const track = { getSettings: () => ({ zoom }), getCapabilities: () => ({ zoom: { min: 1, max: 5 } }),
      applyConstraints: async constraint => { calls.push(constraint); zoom = constraint.advanced[0].zoom; } };
    const result = await configureZoom(track, { ptz: { granted } });
    assert.equal(result.actualZoom, granted === true ? 1 : 3);
    assert.equal(result.requestedZoom, granted === true ? 1 : null);
    assert.deepEqual(calls, granted === true ? [{ advanced: [{ zoom: 1 }] }] : []);
  }
  const rig = permissionCamera({ capabilities: { zoom: { min: 1, max: 5 } }, settings: { zoom: 3 } });
  const acquired = await acquireCamera(rig.mediaDevices, {}, { query: async () => ({ state: 'denied' }) });
  const result = await configureZoom(rig.track, { ptz: acquired.permission });
  assert.equal(acquired.permission.granted, false); assert.equal(result.actualZoom, 3);
});

test('unsupported zoom offers a labeled physical wide device without inferring labels', async () => {
  const devices = [
    { kind: 'videoinput', deviceId: 'regular', label: 'Wide Camera' },
    { kind: 'audioinput', deviceId: 'mic', label: 'Ultra wide' },
    { kind: 'videoinput', deviceId: 'unlabeled', label: '' },
    { kind: 'videoinput', deviceId: 'wide-back', label: 'Back Ultra Wide Camera' },
  ];
  assert.equal(findWideCamera(devices).deviceId, 'wide-back');
  assert.equal(findWideCamera(devices.slice(0, 3)), null);
  const result = await configureZoom({ getSettings: () => ({ deviceId: 'front', facingMode: 'user' }) },
    { mediaDevices: { enumerateDevices: async () => devices } });
  assert.equal(result.requestedZoom, null); assert.equal(result.actualZoom, null);
  assert.equal(result.wideDevice.facing, 'environment'); assert.match(result.message, /מצלמה רחבה נפרדת/);
  const front = { kind: 'videoinput', deviceId: 'front-wide', label: 'Front wide-angle camera' };
  assert.equal(findWideCamera([...devices, front], { facing: 'user' }).deviceId, 'front-wide');
  assert.equal(findWideCamera([...devices, front], { facing: 'environment' }).deviceId, 'wide-back');
});

test('rejected or ignored zoom controls keep the camera running and report its actual value', async () => {
  let enumerated = 0;
  for (const applyConstraints of [undefined, async () => {}, async () => { throw Object.assign(new Error('unsupported'), { name: 'OverconstrainedError' }); }]) {
    const result = await configureZoom({ getSettings: () => ({ zoom: 1 }), getCapabilities: () => ({ zoom: { min: .5, max: 3 } }), applyConstraints },
      { mediaDevices: { enumerateDevices: async () => { enumerated++; return []; } } });
    assert.equal(result.actualZoom, 1); assert.match(result.message, /זום בפועל: 1×/); assert.match(result.message, /0.5 לא זמין/);
  }
  assert.equal(enumerated, 3);
  const noReadback = await configureZoom({ getCapabilities: () => ({ zoom: { min: .5, max: 3 } }), applyConstraints: async () => {} });
  assert.equal(noReadback.actualZoom, null); assert.match(noReadback.message, /לא מדווח/);
  assert.deepEqual(cameraSnapshot({ getSettings: () => { throw new Error(); } }), { settings: {}, capabilities: {} });
});

test('low-FPS resolution adjustment preserves optional camera operation on failures', async () => {
  const calls = [];
  const result = await reduceResolution({ applyConstraints: async c => calls.push(c), getSettings: () => ({ width: 480, height: 640, zoom: .5 }) });
  assert.deepEqual(calls[0], { width: { ideal: 480, max: 480 }, height: { ideal: 640, max: 640 } });
  assert.equal(result.settings.zoom, .5); assert.equal(result.error, null);
  const missing = await reduceResolution({}); assert.ok(missing.error);
  const failed = await reduceResolution({ applyConstraints: async () => { throw Object.assign(new Error(), { name: 'OverconstrainedError' }); } });
  assert.equal(failed.error, 'OverconstrainedError');
});

test('full-model fallback measures delivered FPS over the first five seconds once', () => {
  for (const [fps, fallback] of [[10, true], [12, false], [20, false]]) {
    const window = new ModelPerformance(); let result;
    for (let i = 0; i <= fps * 5; i++) {
      result = window.update(i * 1000 / fps);
      if (i < fps * 5) assert.equal(result, null);
    }
    assert.ok(Math.abs(result.fps - fps) < .0001); assert.equal(result.fallback, fallback);
    assert.equal(window.update(7000), null, 'the startup decision is not repeated');
  }
  const sparse = new ModelPerformance(); sparse.update(1000);
  assert.equal(sparse.update(6100).fallback, true, 'capture pauses must count as low delivered FPS');
});

test('placement accepts a child at quarter-frame height and always remains advisory', () => {
  const sample = person(pose(), { size: .25 / .77 });
  const distance = placementDistance(sample.landmarks);
  assert.ok(Math.abs(distance.span - .25) < .0001); assert.equal(distance.direction, null);
  assert.equal(distance.blocking, false); assert.equal(new PlacementGuide().update([sample], 0), null);
  const far = placementDistance(person(pose(), { size: .2 }).landmarks);
  assert.equal(far.direction, 'closer'); assert.ok(far.steps >= 1); assert.match(far.message, /תתקרב/);
  const near = placementDistance(person(pose(), { size: 1.2 }).landmarks);
  assert.equal(near.direction, 'away'); assert.match(near.message, /תתרחק/);
  for (const result of [far, near, placementDistance([]), placementDistance(floorPose().p)]) assert.equal(result.blocking, false);
  sample.landmarks[0].visibility = .1;
  sample.landmarks[7].visibility = .1; sample.landmarks[8].visibility = .1;
  assert.ok(placementDistance(sample.landmarks).span > 0, 'distance hint survives a missing head');
});
