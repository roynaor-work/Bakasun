import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoRecorder, chooseVideoMime, VIDEO_BITRATE, VIDEO_FRAME_RATE, VIDEO_LIMIT_MS } from '../workout/cam-lab/video-recording.mjs';
import { MAX_UPLOAD_BYTES } from '../workout/cam-lab/upload.mjs';

class FakeStream {
  constructor(tracks) { this.tracks = tracks; }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
}
class FakeTrack {
  constructor(frameRate = 30) { this.kind = 'video'; this.frameRate = frameRate; this.stopped = false; this.constraints = []; }
  clone() { this.copy = new FakeTrack(this.frameRate); return this.copy; }
  async applyConstraints(value) { this.constraints.push(value); this.frameRate = value.frameRate; }
  getSettings() { return { frameRate: this.frameRate }; }
  stop() { this.stopped = true; }
}
const camera = () => new FakeStream([new FakeTrack(), { kind: 'audio' }]);
class FakeRecorder {
  static instances = [];
  static isTypeSupported(mime) { return mime === 'video/webm;codecs=vp8'; }
  constructor(stream, options) { this.stream = stream; this.options = options; this.mimeType = options.mimeType; this.videoBitsPerSecond = options.videoBitsPerSecond; this.state = 'inactive'; FakeRecorder.instances.push(this); }
  start(timeslice) { this.timeslice = timeslice; this.state = 'recording'; }
  stop() {
    this.state = 'inactive'; this.stopRequested = true;
    queueMicrotask(() => { this.ondataavailable({ data: new Blob(['final-frame']) }); this.onstop(); });
  }
}
function timers() {
  const entries = [];
  return { entries, setTimer(fn, delay) { const entry = { fn, delay, cleared: false }; entries.push(entry); return entry; },
    clearTimer(entry) { if (entry) entry.cleared = true; } };
}
function setup(extra = {}) {
  const clock = timers(); const recording = new VideoRecorder({ MediaRecorderClass: FakeRecorder, MediaStreamClass: FakeStream,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...extra });
  return { clock, recording };
}
test('native-style timers retain the global receiver', async () => {
  let calls=0;
  const recording = new VideoRecorder({MediaRecorderClass:FakeRecorder,MediaStreamClass:FakeStream,
    setTimer:function(){assert.equal(this,globalThis);calls++;return 1;},
    clearTimer:function(){assert.equal(this,globalThis);calls++;}});
  recording.start(camera());await recording.stop();assert.ok(calls>=3);
});

test('video uses a 15fps clone at 800Kbps, strips audio, and leaves the inference track unchanged', async () => {
  const { recording, clock } = setup(); const stream = camera(), original = stream.getVideoTracks()[0];
  assert.equal(await recording.startConstrained(stream), 'video/webm;codecs=vp8');
  const encoder = recording.recorder; assert.equal(encoder.options.videoBitsPerSecond, 800000); assert.equal(VIDEO_BITRATE, 800000);
  assert.equal(VIDEO_FRAME_RATE, 15); assert.notEqual(encoder.stream.tracks[0], original);
  assert.deepEqual(original.copy.constraints, [{ frameRate: 15 }]); assert.deepEqual(original.constraints, []);
  assert.equal(original.getSettings().frameRate, 30);
  assert.equal(encoder.stream.tracks.length, 1); assert.equal(encoder.stream.tracks[0].kind, 'video'); assert.equal(encoder.timeslice, 1000);
  assert.deepEqual(recording.diagnostics(), { requestedFrameRate: 15, requestedVideoBitsPerSecond: 800000,
    frameRate: 15, videoBitsPerSecond: 800000, track: 'clone', constraint: 'applied', fallback: null });
  assert.equal(clock.entries[0].delay, 240000);
  await recording.stop(); assert.equal(original.stopped, false); assert.equal(original.copy.stopped, true);
});

for (const mode of ['rejected', 'ignored', 'unsupported', 'missing-clone', 'unknown-frame-rate']) {
  test(`constraints ${mode}: record the original at 800Kbps and report actual settings`, async () => {
    const { recording } = setup(), stream = camera(), original = stream.getVideoTracks()[0];
    if (mode === 'missing-clone') original.clone = undefined;
    else original.clone = () => {
      const copy = original.copy = new FakeTrack();
      if (mode === 'unsupported') copy.applyConstraints = undefined;
      if (mode === 'rejected') copy.applyConstraints = async () => { throw new Error('private browser detail'); };
      if (mode === 'ignored') copy.applyConstraints = async () => {};
      if (mode === 'unknown-frame-rate') copy.getSettings = () => ({});
      return copy;
    };
    await recording.startConstrained(stream);
    assert.equal(recording.recorder.stream.tracks[0], original);
    assert.equal(recording.recorder.options.videoBitsPerSecond, 800000);
    const actual = recording.diagnostics();
    assert.equal(actual.track, 'original'); assert.equal(actual.frameRate, 30); assert.equal(actual.videoBitsPerSecond, 800000);
    assert.ok(actual.fallback); assert.notEqual(actual.constraint, 'applied');
    assert.equal(JSON.stringify(actual).includes('private'), false);
    assert.deepEqual(original.constraints, []); if (original.copy) assert.equal(original.copy.stopped, true);
    await recording.stop(); assert.equal(original.stopped, false);
  });
}

test('diagnostics report the encoder bitrate actually accepted, including updates at stop', async () => {
  class AdjustedRecorder extends FakeRecorder {
    start(timeslice) { super.start(timeslice); this.videoBitsPerSecond = 780000; }
  }
  const { recording } = setup({ MediaRecorderClass: AdjustedRecorder });
  await recording.startConstrained(camera());
  assert.equal(recording.diagnostics().requestedVideoBitsPerSecond, 800000);
  assert.equal(recording.diagnostics().videoBitsPerSecond, 780000);
  recording.recorder.videoBitsPerSecond = 790000;
  await recording.stop(); assert.equal(recording.diagnostics().videoBitsPerSecond, 790000);
});

test('stop during pending constraints discards the clone without starting a late recorder', async () => {
  const { recording } = setup(), stream = camera(), original = stream.getVideoTracks()[0]; let complete;
  original.clone = () => {
    const copy = original.copy = new FakeTrack();
    copy.applyConstraints = () => new Promise(resolve => { complete = resolve; }); return copy;
  };
  const starting = recording.startConstrained(stream), stopping = recording.stop();
  complete(); assert.equal(await starting, null); assert.equal(await stopping, null);
  assert.equal(recording.recorder, null); assert.equal(original.copy.stopped, true); assert.equal(original.stopped, false);
});

test('failed recorder construction releases its clone and permits another attempt', async () => {
  class FailingRecorder extends FakeRecorder { constructor() { throw new Error('encoder failed'); } }
  const { recording } = setup({ MediaRecorderClass: FailingRecorder }), stream = camera(), original = stream.getVideoTracks()[0];
  await assert.rejects(recording.startConstrained(stream), /להקליט וידאו/);
  assert.equal(original.copy.stopped, true); assert.equal(original.stopped, false);
  recording.MediaRecorderClass = FakeRecorder;
  await recording.startConstrained(stream); await recording.stop();
});

test('iPhone-style mp4-only support selects mp4, and unsupported encoders fail clearly', () => {
  assert.equal(chooseVideoMime({ isTypeSupported: mime => mime === 'video/mp4' }), 'video/mp4');
  assert.equal(chooseVideoMime({ isTypeSupported: () => false }), null); assert.equal(chooseVideoMime(undefined), null);
  const { recording } = setup({ MediaRecorderClass: { isTypeSupported: () => false } });
  assert.throws(() => recording.start(camera()), /להקליט וידאו/);
});

test('iPhone prefers mp4 even when its browser also supports WebM', () => {
  const both = { isTypeSupported: mime => ['video/mp4', 'video/webm;codecs=vp8'].includes(mime) };
  assert.equal(chooseVideoMime(both, 'synthetic iPhone'), 'video/mp4');
  assert.equal(chooseVideoMime(both, 'synthetic Android'), 'video/webm;codecs=vp8');
  assert.equal(chooseVideoMime(FakeRecorder, 'synthetic iPhone'), 'video/webm;codecs=vp8', 'use a supported encoder when MP4 is unavailable');
});

test('stop resolves after final dataavailable, includes every chunk, and is idempotent', async () => {
  const { recording } = setup(); recording.start(camera());
  recording.recorder.ondataavailable({ data: new Blob(['first-']) });
  const finished = recording.stop(); assert.equal(recording.blob, null); assert.equal(recording.recorder.stopRequested, true);
  const blob = await finished; assert.equal(await blob.text(), 'first-final-frame'); assert.equal(blob.type, 'video/webm;codecs=vp8');
  assert.equal(await recording.stop(), blob);
});

test('the four-minute timer stops video and invokes root limit hook without stopping camera tracks', async () => {
  const messages = [], { recording, clock } = setup({ onLimit: message => messages.push(message), limitMs: VIDEO_LIMIT_MS + 10000 });
  const stream = camera(); await recording.startConstrained(stream); assert.equal(clock.entries[0].delay, VIDEO_LIMIT_MS);
  clock.entries[0].fn(); assert.equal(recording.active, false); assert.equal(recording.recorder.stopRequested, true);
  assert.match(messages[0], /ארבע דקות/); assert.equal((await recording.stop()).size > 0, true);
  assert.equal(stream.getVideoTracks()[0].stopped, false);
  assert.equal(stream.getVideoTracks()[0].copy.stopped, true);
});

test('video byte cap produces a visible error and refuses a truncated movie', async () => {
  const messages = [], { recording } = setup({ onError: message => messages.push(message) }); recording.start(camera());
  recording.recorder.ondataavailable({ data: new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]) });
  await assert.rejects(recording.stop(), /40MB/); assert.match(messages[0], /40MB/);
});

test('encoder failure surfaces a Hebrew error and cleans timers', async () => {
  const messages = [], { recording, clock } = setup({ onError: message => messages.push(message) }), stream = camera();
  await recording.startConstrained(stream);
  recording.recorder.onerror({ error: new Error('sensitive detail must not escape') });
  await assert.rejects(recording.stop(), /להקליט וידאו/); assert.equal(messages[0].includes('sensitive'), false);
  assert.equal(clock.entries.every(entry => entry.cleared), true);
  assert.equal(stream.getVideoTracks()[0].stopped, false); assert.equal(stream.getVideoTracks()[0].copy.stopped, true);
});

test('encoder missing a stop event cannot block camera release indefinitely', async () => {
  class HangingRecorder extends FakeRecorder { stop() { this.state = 'inactive'; } }
  const { recording, clock } = setup({ MediaRecorderClass: HangingRecorder }), stream = camera();
  await recording.startConstrained(stream); const finished = recording.stop();
  clock.entries.at(-1).fn(); await assert.rejects(finished, /לא הסתיימה/);
  assert.equal(stream.getVideoTracks()[0].copy.stopped, true); assert.equal(stream.getVideoTracks()[0].stopped, false);
});

test('a completed VideoRecorder can be reused without stale chunks or settled state', async () => {
  const { recording } = setup(); await recording.startConstrained(camera()); await recording.stop();
  await recording.startConstrained(camera()); assert.equal(await (await recording.stop()).text(), 'final-frame');
});
