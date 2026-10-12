import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabSpeech } from '../workout/cam-lab/speech.mjs';
import { PLACEMENT_LINES } from '../workout/cam-lab/placement-lines.mjs';

const local = { name: 'Local Hebrew', lang: 'he-IL', localService: true };
const remote = { name: 'Remote Hebrew', lang: 'he-IL', localService: false };
const english = { name: 'English', lang: 'en-US', localService: true, default: true };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ voices = [english, remote, local], recording = false, broken = false, delayed = false } = {}) {
  const spoken = [], urls = [], sources = [];
  let resolveFetch, time = 1000;
  const buffer = (channels, length, sampleRate) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: c => data[c] };
  };
  const ctx = { state: 'running', currentTime: 0, destination: {}, createBuffer: buffer,
    async decodeAudioData() {
      if (broken) throw new Error('synthetic invalid wav');
      const b = buffer(1, 100, 1000); b.getChannelData(0).fill(.1); return b;
    },
    createBufferSource() {
      const source = { connect() {}, start(at) { source.started = at; }, stop() { source.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const response = { ok: recording, arrayBuffer: async () => new ArrayBuffer(8) };
  const speech = createLabSpeech({
    synth: { getVoices: () => voices, cancel() {}, speak(u) { spoken.push(u); } },
    Utterance: class { constructor(text) { this.text = text; } }, context: () => ctx,
    fetchFile: url => { urls.push(url.href); return delayed ? new Promise(resolve => { resolveFetch = resolve; }) : Promise.resolve(response); },
    now: () => time,
  });
  return { speech, spoken, sources, urls, advance: n => { time += n; }, release: () => resolveFetch(response) };
}

test('an existing catalog WAV plays before every Hebrew voice and reports the recording ID', async () => {
  const f = fixture({ recording: true }); let finished = 0;
  f.speech.play(PLACEMENT_LINES.right.tts, { onDone: () => finished++ }); await tick();
  assert.equal(f.spoken.length, 0); assert.equal(f.sources.length, 1);
  assert.match(f.urls[0], /\/workout\/snd\/voice\/camera-placement-right\.wav\?v=/);
  assert.equal(finished, 0); f.sources[0].onended(); assert.equal(finished, 1);
  assert.deepEqual(f.speech.snapshot(), { sources: { recording: 1 }, lastSource: 'recording',
    events: [{ timeMs: 0, source: 'recording', ids: ['camera-placement-right'] }] });
});

test('missing or invalid recordings fall back to local Hebrew before network Hebrew', async () => {
  for (const broken of [false, true]) {
    const f = fixture({ recording: broken, broken });
    f.speech.play(PLACEMENT_LINES.arrived.tts); await tick();
    assert.equal(f.sources.length, 0); assert.equal(f.spoken[0].voice, local);
    assert.equal(f.spoken[0].lang, 'he-IL'); assert.equal(f.spoken[0].text, PLACEMENT_LINES.arrived.tts);
    assert.equal(f.speech.snapshot().lastSource, 'hebrew-local');
  }
  const f = fixture({ voices: [english, remote] });
  f.speech.play(PLACEMENT_LINES['wrong-side'].tts); await tick();
  assert.equal(f.spoken[0].voice, remote); assert.equal(f.speech.snapshot().lastSource, 'hebrew-network');
});

test('without any Hebrew voice the recording still works; missing recording gives text only', async () => {
  for (const recording of [true, false]) {
    const f = fixture({ voices: [english], recording }); let finished = 0;
    f.speech.play(PLACEMENT_LINES.left.tts, { onDone: () => finished++ }); await tick();
    assert.equal(f.spoken.length, 0, 'Hebrew is never sent to an English voice');
    assert.equal(f.speech.snapshot().lastSource, recording ? 'recording' : 'text-only');
    if (recording) f.sources[0].onended();
    assert.equal(finished, 1);
  }
});

test('stopping during a delayed WAV fetch prevents stale recording or speech', async () => {
  for (const recording of [true, false]) {
    const f = fixture({ delayed: true, recording }); let finished = 0;
    f.speech.play(PLACEMENT_LINES.right.tts, { onDone: () => finished++ });
    f.speech.stop(); f.release(); await tick();
    assert.equal(f.sources.length, 0); assert.equal(f.spoken.length, 0); assert.equal(finished, 0);
    assert.equal(f.speech.snapshot().lastSource, null);
  }
  const f = fixture(); f.speech.play(PLACEMENT_LINES.left.tts); await tick();
  const before = f.speech.snapshot(); f.speech.stop(); f.spoken[0].onerror();
  assert.deepEqual(f.speech.snapshot(), before, 'cancelled utterance errors do not report another source');
});

test('diagnostics are bounded, contain only catalog IDs and sources, and reset per attempt', async () => {
  const f = fixture({ voices: [remote] });
  for (let i = 0; i < 35; i++) { f.advance(100); f.speech.play(PLACEMENT_LINES.near.tts); await tick(); f.spoken.at(-1).onend(); }
  const snapshot = f.speech.snapshot();
  assert.equal(snapshot.sources['hebrew-network'], 35); assert.equal(snapshot.events.length, 30);
  assert.deepEqual(Object.keys(snapshot.events[0]), ['timeMs', 'source', 'ids']);
  assert.ok(snapshot.events.every(e => e.ids[0] === 'camera-placement-near'));
  assert.ok(!JSON.stringify(snapshot).includes(remote.name)); assert.ok(!JSON.stringify(snapshot).includes(PLACEMENT_LINES.near.tts));
  snapshot.events[0].ids.length = 0; assert.equal(f.speech.snapshot().events[0].ids.length, 1);
  f.speech.resetDiagnostics(); assert.deepEqual(f.speech.snapshot(), { sources: {}, lastSource: null, events: [] });
});
