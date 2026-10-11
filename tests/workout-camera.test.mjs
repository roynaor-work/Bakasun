import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CameraAttempt, CameraUploads, APP_VERSION, cameraAvailable, cameraPrivacy, readCameraConsent } from '../workout/js/camera-session.mjs';
import { CameraDemo } from '../workout/js/camera-demo.mjs';
import { CAMERA_LINES, splitVoiceText, normalizeVoice } from '../workout/js/voice-lines.js';
import { EXERCISES, byId } from '../workout/js/exercises.js';
import { honestTime } from '../workout/js/logic.js';
import { UploadQueue } from '../workout/cam-lab/upload.mjs';
import { pose } from './cam-lab-fixtures.js';

const consent = { endpoint: 'https://example.invalid/receive', secret: 'synthetic-test-key', consentId: 'synthetic-consent' };
const storage = config => ({ getItem: key => key === 'camlab.upload' ? JSON.stringify(config) : null });
function harness({ enabled = true, target = 3, initialCount = 0, onEnd } = {}) {
  let time = 0, stopped = 0, videoStarts = 0, videoStops = 0;
  const sent = [], records = new Map(), cues = [], progress = [], rejected = [], statuses = [];
  const uploads = new CameraUploads({ storage: storage(enabled ? consent : null), onStatus: s => statuses.push(s),
    queueFactory: options => new UploadQueue({ ...options, store: {
      put: async record => records.set(record.session, structuredClone(record)),
      list: async () => [...records.values()].map(record => structuredClone(record)),
      remove: async session => records.delete(session), clear: async () => records.clear(),
    }, fetchImpl: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true }) }; } }) });
  const attempt = new CameraAttempt({ exercise: 'squats', target, initialCount, uploads, now: () => time,
    onCue: n => cues.push(n), onCount: (n, secs) => progress.push({ n, secs }), onRejected: reason => rejected.push(reason), onEnd,
    makeVideo: () => ({ start: () => videoStarts++, stop: async () => { videoStops++; return new Blob(['synthetic-video'], { type: 'video/webm;codecs=vp8' }); } }) });
  attempt.open({ getTracks: () => [{ stop: () => stopped++ }] });
  const frame = (sample = pose()) => {
    time += 100;
    return attempt.frame({ timestamp: time, poses: [{ landmarks: sample.p, world: sample.world }], inferenceMs: 12, model: 'full' });
  };
  const hold = (angle, frames = 10) => { for (let i = 0; i < frames; i++) frame(pose({ angle })); };
  const prepare = () => { attempt.introDone = true; for (let i = 0; i < 50 && attempt.state !== 'counting'; i++) frame(); assert.equal(attempt.state, 'counting'); };
  const rep = (angle = 90) => { hold(145, 5); hold(angle, 8); hold(180, 10); };
  return { attempt, uploads, frame, hold, prepare, rep, sent, records, cues, progress, rejected, statuses,
    advance: ms => { time += ms; }, counts: () => ({ stopped, videoStarts, videoStops }) };
}

test('camera is opt-in for exactly the seven lab exercise identifiers; saved consent never reads router hash', async () => {
  globalThis.localStorage = { getItem: () => null };
  const { store } = await import('../workout/js/store.js?camera-default-test');
  assert.equal(store.profile.camera, false);
  for (const ex of EXERCISES) assert.equal(cameraAvailable({}, ex.id), false);
  assert.deepEqual(EXERCISES.filter(ex => cameraAvailable({ camera: true }, ex.id)).map(ex => ex.id).sort(),
    ['squats','jumping-jacks','high-knees','lunges','push-ups','knee-push-ups','glute-bridge'].sort());
  globalThis.location = { get hash() { throw Error('router hash must not be read'); } };
  assert.deepEqual(readCameraConsent(storage(consent)), consent);
  assert.equal(readCameraConsent(storage({ ...consent, consentId: null })), null);
  assert.equal(cameraPrivacy(true), 'הסרטון נשלח לבדיקה בסיום');
  assert.equal(cameraPrivacy(false), 'הסרטון לא נשמר ולא יוצא מהטלפון');
  delete globalThis.location; delete globalThis.localStorage;
});

test('intro and fresh calibration precede automatic 3-2-1; missing points cancel the countdown', async () => {
  const h = harness({ enabled: false });
  h.hold(180, 30); assert.equal(h.attempt.state, 'preparing'); assert.deepEqual(h.cues, []);
  h.prepare(); assert.deepEqual(h.cues, [3,2,1]); assert.equal(h.attempt.counter.count, 0);
  await h.attempt.finish();
  const lost = harness({ enabled: false }); lost.attempt.introDone = true;
  lost.hold(180, 14); assert.equal(lost.attempt.state, 'countdown');
  lost.frame({ p: [], world: [] }); assert.equal(lost.attempt.state, 'preparing');
  assert.equal(lost.attempt.counter.count, 0); await lost.attempt.finish();
});

test('real lab events reach workout progress, complete at target and retain honest elapsed exercise time', async () => {
  const h = harness({ target: 3 }); h.prepare(); h.rep(); h.rep(); h.rep();
  await h.attempt.ending;
  assert.deepEqual(h.progress.map(p => p.n), [1,2,3]); assert.equal(h.attempt.endReason, 'target');
  const result = h.attempt.result;
  assert.ok(result.seconds > 6);
  assert.ok(honestTime([{ exId: 'squats', type: 'reps', target: 3, done: result.counted, secs: result.seconds }]).seconds > 0);
  const diagnostics = JSON.parse(Buffer.from(h.sent[2].data, 'base64'));
  assert.equal(diagnostics.appVersion, APP_VERSION); assert.equal(diagnostics.counted, 3);
  assert.equal(diagnostics.target, 3); assert.equal(diagnostics.endReason, 'target');
  assert.deepEqual(diagnostics.thresholds, h.attempt.counter.t);
});

test('help waits without counting, drops unfinished movement and excludes help time from honestTime', async () => {
  const h = harness(); h.prepare(); h.hold(145); h.attempt.help(true);
  h.advance(10000); h.rep(); assert.deepEqual(h.progress, []);
  h.attempt.help(false); h.hold(180); h.rep();
  assert.equal(h.attempt.counter.count, 1); assert.ok(h.attempt.seconds() < 8);
  await h.attempt.finish();
});

test('reopening after partial progress adds new reps to the workout total and finishes at its remaining target', async () => {
  const h = harness({ initialCount: 2, target: 3 }); h.prepare(); h.rep();
  await h.attempt.ending;
  assert.equal(h.attempt.result.counted, 3); assert.equal(h.attempt.endReason, 'target');
  const diagnostics = JSON.parse(Buffer.from(h.sent[2].data, 'base64'));
  assert.equal(diagnostics.counted, 3); assert.equal(diagnostics.attemptCount, 1);
});

for (const reason of ['finish','exit','target','limit','hidden','pagehide','switch','error']) test(`one attempt sends once for ${reason}, even with competing/reentrant endings`, async () => {
  const h = harness({ onEnd: () => h.attempt.finish('exit') });
  h.prepare(); h.frame();
  let ending;
  if (reason === 'target') { h.rep(); h.rep(); h.rep(); ending = h.attempt.ending; }
  else if (reason === 'limit') { h.advance(240000); h.frame(); ending = h.attempt.ending; }
  else ending = h.attempt.finish(reason);
  assert.equal(h.attempt.finish('finish'), ending);
  assert.equal(h.attempt.finish('exit'), ending);
  await ending;
  assert.deepEqual(h.sent.map(s => s.part), ['video','skeleton','diagnostics']);
  assert.equal(new Set(h.sent.map(s => s.session)).size, 1); assert.match(h.sent[0].session, /^app-/);
  assert.ok(Buffer.from(h.sent[0].data, 'base64').length > 0);
  assert.equal(h.counts().videoStarts, 1); assert.equal(h.counts().videoStops, 1); assert.equal(h.counts().stopped, 1);
  assert.equal(h.records.size, 0);
});

test('every reopened attempt records immediately with its own app session; private mode creates no recorders or queue', async () => {
  const first = harness(); assert.equal(first.counts().videoStarts, 1); await first.attempt.finish('exit');
  const second = harness(); assert.equal(second.counts().videoStarts, 1); await second.attempt.finish('finish');
  assert.notEqual(first.sent[0].session, second.sent[0].session);
  const privateAttempt = harness({ enabled: false }); privateAttempt.prepare(); privateAttempt.rep(); await privateAttempt.attempt.finish('exit');
  assert.equal(privateAttempt.attempt.skeleton, undefined); assert.equal(privateAttempt.uploads.queue, null);
  assert.equal(privateAttempt.counts().videoStarts, 0); assert.equal(privateAttempt.counts().videoStops, 0); assert.deepEqual(privateAttempt.sent, []);
});

test('a screen rendering exception cannot interrupt stopping capture and queuing the attempt', async () => {
  const h = harness({ onEnd: () => { throw Error('synthetic render failure'); } });
  assert.throws(() => h.attempt.finish(), /synthetic render failure/);
  await h.attempt.ending;
  assert.deepEqual(h.sent.map(part => part.part), ['video','skeleton','diagnostics']);
  assert.equal(h.counts().videoStops, 1); assert.equal(h.counts().stopped, 1);
});

test('focus/online/manual retries during a pending save enqueue an attempt only once', async () => {
  const h = harness(); let release, saves = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const enqueue = h.uploads.queue.enqueue.bind(h.uploads.queue);
  h.uploads.queue.enqueue = async payload => { saves++; await gate; return enqueue(payload); };
  const ending = h.attempt.finish();
  while (!saves) await Promise.resolve();
  const retryA = h.uploads.retry(), retryB = h.uploads.retry();
  release(); await Promise.all([ending, retryA, retryB]);
  assert.equal(saves, 1); assert.deepEqual(h.sent.map(part => part.part), ['video','skeleton','diagnostics']);
});

test('rejection enlarges the existing demo for two seconds; help uses it fullscreen; low FPS freezes the corner', async () => {
  const calls = [], modes = [], spoken = []; let timeout;
  const demo = new CameraDemo({ stage: { play: (...a) => calls.push(['play',...a]), pace: (...a) => calls.push(['pace',...a]), still: () => calls.push(['still']), stop: () => calls.push(['stop']), dispose: () => calls.push(['dispose']) },
    exercise: byId.squats, paint: mode => modes.push(mode), speak: text => spoken.push(text), pause: open => calls.push(['pause',open]),
    setTimer: (fn, ms) => { timeout = fn; assert.equal(ms, 2000); return 1; }, clearTimer: () => {} });
  await Promise.resolve(); assert.equal(demo.mode, 'intro'); assert.equal(spoken[0], CAMERA_LINES.instructions.squats);
  demo.counting(); demo.movement(100, 'moving'); demo.counted(2400);
  assert.equal(demo.pace, 2300); demo.rejected('knees'); assert.equal(demo.mode, 'correction');
  assert.equal(spoken.at(-1), CAMERA_LINES.reasons.knees); assert.equal(calls.at(-1)[2], .75);
  timeout(); assert.equal(demo.mode, 'corner'); demo.fps(11); assert.equal(calls.at(-1)[0], 'still');
  demo.help(true); assert.equal(demo.mode, 'help'); assert.ok(calls.some(c => c[0] === 'pause' && c[1]));
  demo.help(false); assert.equal(demo.mode, 'corner'); assert.equal(calls.at(-1)[0], 'still');
  demo.dispose(); assert.equal(calls.at(-1)[0], 'dispose');
  assert.deepEqual(modes.slice(0,4), ['intro','corner','correction','corner']);
});

test('partial reps drive corrective guidance through the unchanged counter; all new spoken lines are short and catalogued', async () => {
  const h = harness(); h.prepare(); h.rep(140); assert.deepEqual(h.rejected, ['partial']); assert.equal(h.progress.length, 0); await h.attempt.finish();
  for (const group of Object.values(CAMERA_LINES)) for (const line of Object.values(group)) {
    assert.ok(normalizeVoice(line).split(' ').length <= 8, line);
    assert.ok(splitVoiceText(line).every(part => part.id), line);
  }
  const ui = await readFile(new URL('../workout/js/camera-screen.mjs', import.meta.url), 'utf8');
  assert.match(ui, /cam-lab\/pose-worker\.js\?v=/);
  assert.doesNotMatch(ui, /הקלטת שלד|הורדה|מתחילים לספור|type="file"/);
});
