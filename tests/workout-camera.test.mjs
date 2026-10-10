import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraAttempt, cameraSupported, readCameraConsent, cameraExplanation } from '../workout/js/camera-session.mjs';
import { CameraDemo } from '../workout/js/camera-demo.mjs';
import { EXERCISES, byId } from '../workout/js/exercises.js';
import { CAMERA_LINES, VOICE_BY_ID } from '../workout/js/voice-lines.js';
import { honestTime } from '../workout/js/logic.js';
import { pose } from './cam-lab-fixtures.js';

test('camera is opt-in and available for precisely the seven lab IDs', async () => {
  const storage = { getItem: () => null };
  const previous = globalThis.localStorage; globalThis.localStorage = storage;
  try {
    const { store } = await import('../workout/js/store.js?camera-default-test');
    assert.equal(store.profile.cameraWorkout, false);
  } finally { globalThis.localStorage = previous; }
  assert.deepEqual(EXERCISES.filter(ex => cameraSupported({ cameraWorkout: true }, ex.id)).map(ex => ex.id).sort(),
    ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge'].sort());
  for (const ex of EXERCISES) assert.equal(cameraSupported({}, ex.id), false);
  assert.equal(readCameraConsent(storage), null);
  assert.equal(cameraExplanation(null), 'הסרטון לא נשמר ולא יוצא מהטלפון');
  assert.equal(cameraExplanation({}), 'הסרטון נשלח לבדיקה בסיום');
  const actualLocation = globalThis.location;
  globalThis.location = { get hash() { throw Error('router hash must not be read'); } };
  try {
    const config = { endpoint: 'https://example.invalid/receive', secret: 'test', consentId: 'test' };
    assert.deepEqual(readCameraConsent({ getItem: () => JSON.stringify(config) }), config);
  } finally { globalThis.location = actualLocation; }
});

function harness(options = {}) {
  let time = 0, timerId = 0, stops = 0;
  const timers = new Map(), cues = [], counts = [], results = [], starts = [];
  const attempt = new CameraAttempt({ exercise: 'squats', target: 3, now: () => time,
    setTimer: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id),
    onCue: n => cues.push(n), onStart: () => starts.push(time), onCount: n => counts.push(n), onFinish: r => results.push(r), ...options });
  attempt.open({ getTracks: () => [{ stop: () => stops++ }] });
  const send = (sample = pose(), duration = 50) => {
    for (let i = 0; i < duration; i += 50) {
      time += 50;
      attempt.pose({ timestamp: time, poses: sample ? [{ landmarks: sample.p, world: sample.world }] : [], inferenceMs: 5 }, 4 / 3);
    }
  };
  return { attempt, send, timers, cues, counts, results, starts, setTime: t => { time = t; }, stops: () => stops };
}

test('intro and calibration precede fresh 3-2-1; lost readiness cancels countdown', async () => {
  const h = harness(); h.send(pose(), 2000);
  assert.deepEqual(h.cues, []); assert.equal(h.attempt.startedAt, null);
  h.attempt.introDone = true; h.send(); assert.deepEqual(h.cues, [3]);
  h.send(null); assert.deepEqual(h.cues, [3, null]);
  h.send(pose(), 4350);
  assert.deepEqual(h.cues.slice(-4), [3, 2, 1, null]); assert.equal(h.starts.length, 1);
  h.send(pose(), 1000); assert.equal(h.starts.length, 1);
  await h.attempt.finish();
});

test('only real complete reps advance the item, reach target and preserve honest time', async () => {
  const item = { exId: 'squats', block: 'האימון', type: 'reps', target: 3, done: 0, secs: 0 };
  const h = harness({ onCount: n => { item.done = n; }, onFinish: r => { item.secs = r.seconds; } });
  h.attempt.introDone = true; h.send(pose(), 4500);
  assert.ok(h.attempt.startedAt != null);
  for (let i = 0; i < 3; i++) { h.send(pose({ angle: 110 }), 900); h.send(pose(), 900); }
  assert.equal(item.done, 3); assert.equal(h.attempt.ended, true);
  assert.ok(item.secs >= 4.5); assert.ok(item.secs < 6);
  assert.equal(honestTime([item]).fast, 0);
  await h.attempt.finished;
});

test('help pauses reps and honest time; closing cannot complete an interrupted rep', async () => {
  const h = harness({ target: 20 }); h.attempt.introDone = true; h.send(pose(), 4500);
  h.send(pose({ angle: 110 }), 650); h.attempt.pause();
  h.send(pose(), 4000); assert.equal(h.attempt.counter.count, 0);
  h.attempt.resume(); h.send(pose(), 650); assert.equal(h.attempt.counter.count, 0);
  h.send(pose({ angle: 110 }), 650); h.send(pose(), 650);
  assert.equal(h.attempt.counter.count, 1);
  const r = await h.attempt.finish(); assert.ok(r.seconds < 4);
});

for (const reason of ['finish', 'exit', 'navigation', 'target', 'duration-limit', 'failure', 'hidden', 'pagehide', 'retry']) {
  test(`one recording/enqueue for ${reason}, even if all end paths race`, async () => {
    const enqueued = [], order = []; let videos = 0, skeletons = 0, retries = 0;
    const h = harness({ queue: { enabled: true, enqueue: async value => { enqueued.push(value); order.push('enqueue'); }, retry: async () => { retries++; } },
      videoFactory: options => { videos++; return { start: () => order.push('video-start'), stop: async () => {
        options.onLimit(); order.push('video-stop'); return new Blob(['synthetic video'], { type: 'video/webm' }); } }; },
      onRelease: () => order.push('release'),
      skeletonFactory: () => { skeletons++; return { start() {}, stop() {}, json: () => '{"frames":[]}' }; } });
    if (reason === 'duration-limit') h.timers.values().next().value.fn();
    else h.attempt.finish(reason);
    const first = h.attempt.finished;
    assert.equal(h.attempt.finish('finish'), first); assert.equal(h.attempt.finish('exit'), first);
    await first;
    assert.equal(videos, 1); assert.equal(skeletons, 1); assert.equal(enqueued.length, 1); assert.equal(retries, 1);
    assert.equal(h.stops(), 1); assert.equal(h.results.length, 1);
    assert.match(enqueued[0].session, /^app-/); assert.ok(enqueued[0].video.size > 0);
    assert.equal(enqueued[0].diagnostics.endReason, reason);
    assert.equal(enqueued[0].diagnostics.exercise, 'squats'); assert.equal(enqueued[0].diagnostics.target, 3);
    assert.match(enqueued[0].diagnostics.appVersion, /^20261010/);
    assert.ok(order.indexOf('release') < order.indexOf('video-stop')); assert.ok(order.indexOf('video-stop') < order.indexOf('enqueue'));
  });
}

test('new attempts record again; privacy creates no recorders or upload work', async () => {
  let videoCalls = 0, skeletonCalls = 0;
  for (let i = 0; i < 2; i++) {
    const h = harness({ videoFactory: () => { videoCalls++; }, skeletonFactory: () => { skeletonCalls++; } });
    await h.attempt.finish('exit');
  }
  assert.equal(videoCalls, 0); assert.equal(skeletonCalls, 0);
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const h = harness({ queue: { enabled: true, enqueue: async x => sessions.push(x.session), retry: async () => {} },
      videoFactory: () => ({ start() { videoCalls++; }, stop: async () => new Blob(['video']) }) });
    await h.attempt.finish();
  }
  assert.equal(videoCalls, 2); assert.equal(new Set(sessions).size, 2);
});

test('recorder failure restores the exercise and never reports an empty video as a successful capture', async () => {
  const sent = [], errors = [];
  const h = harness({ queue: { enabled: true, enqueue: async value => sent.push(value), retry: async () => true },
    videoFactory: () => { throw Error('unsupported recorder'); },
    onCaptureError: () => queueMicrotask(() => h.attempt.finish('failure')), onUploadError: kind => errors.push(kind) });
  await Promise.resolve(); await h.attempt.finished;
  assert.equal(h.results.length, 1); assert.equal(h.results[0].reason, 'failure');
  assert.equal(sent.length, 1); assert.equal(sent[0].diagnostics.videoError, 'video-recording-unavailable');
  assert.equal(sent[0].video.size, 0); assert.deepEqual(errors, ['recording']);
});

test('an attempt saved as a preceding upload completes still drains automatically', async () => {
  let saves = 0, drains = 0;
  const queue = { enabled: true, pending: 0,
    enqueue: async () => { saves++; queue.pending++; },
    retry: async () => { drains++; if (drains > 1) queue.pending = 0; return true; } };
  const h = harness({ queue, videoFactory: () => ({ start() {}, stop: async () => new Blob(['video']) }) });
  await h.attempt.finish();
  assert.equal(saves, 1); assert.equal(drains, 2); assert.equal(queue.pending, 0);
});

test('one demo grows on rejection for two slow seconds, help reuses it, low FPS freezes, dispose cancels timers', () => {
  const calls = [], modes = [], timers = new Map(); let seq = 0;
  const stage = Object.fromEntries(['play', 'still', 'showPose', 'stop', 'dispose'].map(k => [k, (...args) => calls.push([k, ...args])]));
  const demo = new CameraDemo({ exercise: byId.squats, stage, paint: m => modes.push(m),
    setTimer: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; }, clearTimer: id => timers.delete(id) });
  assert.equal(demo.mode, 'intro'); demo.prepare(); assert.equal(demo.mode, 'corner');
  demo.start(); assert.equal(demo.mode, 'corner');
  demo.reject('partial'); assert.equal(demo.mode, 'correction'); assert.equal(calls.at(-1)[2], .35);
  assert.equal(timers.get(1).ms, 2000); timers.get(1).fn(); assert.equal(demo.mode, 'corner');
  demo.help(true); assert.equal(demo.mode, 'help'); demo.help(false); assert.equal(demo.mode, 'corner');
  demo.follow({ squat: 140 }, { squatUp: 157, squatDown: 125 }, 20); assert.equal(calls.at(-1)[0], 'showPose');
  demo.follow({ squat: 140 }, { squatUp: 157, squatDown: 125 }, 8); assert.equal(calls.at(-1)[0], 'stop');
  const length = calls.length; demo.follow({ squat: 100 }, { squatUp: 157, squatDown: 125 }, 8); assert.equal(calls.length, length);
  demo.reject('knees'); demo.dispose(); assert.equal(timers.size, 0); assert.equal(calls.at(-1)[0], 'dispose');
  assert.deepEqual(modes.slice(0, 4), ['intro', 'corner', 'corner', 'correction']);
});

test('new camera speech is catalogued, pointed for local TTS and at most eight words', () => {
  for (const [id, [text, tts]] of Object.entries(CAMERA_LINES)) {
    assert.ok(text.split(/\s+/).length <= 8, id);
    assert.equal(VOICE_BY_ID['camera-' + id].tts, tts);
  }
});
