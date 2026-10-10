import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoRecorder, chooseVideoMime, VIDEO_BITRATE, VIDEO_LIMIT_MS } from '../workout/cam-lab/video-recording.mjs';
import { MAX_UPLOAD_BYTES } from '../workout/cam-lab/upload.mjs';

class FakeStream {
  constructor(tracks) { this.tracks = tracks; }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
}
const camera = () => new FakeStream([{ kind: 'video', stopped: false }, { kind: 'audio' }]);
class FakeRecorder {
  static instances = [];
  static isTypeSupported(mime) { return mime === 'video/webm;codecs=vp8'; }
  constructor(stream, options) { this.stream = stream; this.options = options; this.mimeType = options.mimeType; this.state = 'inactive'; FakeRecorder.instances.push(this); }
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

test('video uses supported webm at 1.2Mbps and strips all audio tracks', async () => {
  const { recording, clock } = setup(); const stream = camera(); assert.equal(recording.start(stream), 'video/webm;codecs=vp8');
  const encoder = recording.recorder; assert.equal(encoder.options.videoBitsPerSecond, VIDEO_BITRATE); assert.equal(VIDEO_BITRATE, 1200000);
  assert.equal(encoder.stream.tracks.length, 1); assert.equal(encoder.stream.tracks[0].kind, 'video'); assert.equal(encoder.timeslice, 1000);
  assert.equal(clock.entries[0].delay, 240000);
  await recording.stop(); assert.equal(stream.getVideoTracks()[0].stopped, false);
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
  const stream = camera(); recording.start(stream); assert.equal(clock.entries[0].delay, VIDEO_LIMIT_MS);
  clock.entries[0].fn(); assert.equal(recording.active, false); assert.equal(recording.recorder.stopRequested, true);
  assert.match(messages[0], /ארבע דקות/); assert.equal((await recording.stop()).size > 0, true);
  assert.equal(stream.getVideoTracks()[0].stopped, false);
});

test('video byte cap produces a visible error and refuses a truncated movie', async () => {
  const messages = [], { recording } = setup({ onError: message => messages.push(message) }); recording.start(camera());
  recording.recorder.ondataavailable({ data: new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]) });
  await assert.rejects(recording.stop(), /40MB/); assert.match(messages[0], /40MB/);
});

test('encoder failure surfaces a Hebrew error and cleans timers', async () => {
  const messages = [], { recording, clock } = setup({ onError: message => messages.push(message) }); recording.start(camera());
  recording.recorder.onerror({ error: new Error('sensitive detail must not escape') });
  await assert.rejects(recording.stop(), /להקליט וידאו/); assert.equal(messages[0].includes('sensitive'), false);
  assert.equal(clock.entries.every(entry => entry.cleared), true);
});

test('encoder missing a stop event cannot block camera release indefinitely', async () => {
  class HangingRecorder extends FakeRecorder { stop() { this.state = 'inactive'; } }
  const { recording, clock } = setup({ MediaRecorderClass: HangingRecorder }); recording.start(camera()); const finished = recording.stop();
  clock.entries.at(-1).fn(); await assert.rejects(finished, /לא הסתיימה/);
});

test('a completed VideoRecorder can be reused without stale chunks or settled state', async () => {
  const { recording } = setup(); recording.start(camera()); await recording.stop();
  recording.start(camera()); assert.equal(await (await recording.stop()).text(), 'final-frame');
});
