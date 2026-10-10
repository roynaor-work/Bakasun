import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SAY } from '../workout/js/say.js';
import { SAY_UI } from '../workout/js/say-ui.js';
import { EXERCISES } from '../workout/js/exercises.js';
import { numWord, timeCue } from '../workout/js/count.js';
import { VOICE_LINES, VOICE_BY_ID, splitVoiceText, voiceLinesMarkdown } from '../workout/js/voice-lines.js';
import { chooseVoice, createVoicePlayer, trimVoiceBuffer } from '../workout/js/voice-player.js';
import { wavBlob, zipBlob, crc32 } from '../workout/voice-rec/files.js';

const ids = text => splitVoiceText(text).map(p => p.id);
test('catalog covers every exercise, interface line, program, level and opening; documentation stays current', async () => {
  assert.equal(new Set(VOICE_LINES.map(l => l.id)).size, VOICE_LINES.length);
  assert.equal(new Set(VOICE_LINES.map(l => l.file)).size, VOICE_LINES.length);
  for (const ex of EXERCISES) assert.equal(VOICE_BY_ID[`exercise-${ex.id}`].text, SAY[ex.id]);
  for (const group of ['intro', 'levels', 'programs']) for (const text of Object.values(SAY_UI[group])) assert.ok(ids(text).every(Boolean), text);
  for (const line of VOICE_LINES) assert.match(line.file, /^[a-zA-Z0-9_-]+\.wav$/);
  assert.equal(await fs.readFile(new URL('../workout/snd/voice/LINES.md', import.meta.url), 'utf8'), voiceLinesMarkdown());
});
test('counting and countdown reuse number clips; tens and conjunctions are recorded once', () => {
  for (let n = 0; n < 100; n++) assert.ok(ids(numWord(n)).every(Boolean), String(n));
  assert.deepEqual(ids(numWord(23)), ['number-20', 'number-and-3']);
  assert.deepEqual(ids(timeCue(20, 60)), ['time-more', 'number-20', 'time-seconds']);
  assert.deepEqual(ids('עוד 10 שניות'), ['time-more', 'number-10', 'time-seconds']);
  assert.deepEqual(ids(`${numWord(12)}! כל הכבוד!`), ['number-12', 'encourage']);
  assert.deepEqual(ids('סיימת! כל הכבוד!'), ['finished', 'encourage']);
  assert.deepEqual(ids(timeCue(0, 30)), ['finished']);
});
test('dynamic feedback splits every program and level, including the attached Hebrew preposition', () => {
  for (const name of [...Object.values(SAY_UI.programs), ...EXERCISES.map(ex => ex.name), 'אימון חופשי']) {
    for (const fn of [SAY_UI.adjust.boost, SAY_UI.adjust.swaps]) assert.ok(ids(fn(name)).every(Boolean), fn(name));
  }
  for (const level of Object.values(SAY_UI.levels)) for (const fn of [SAY_UI.adjust.level, SAY_UI.adjust.downLevel]) assert.ok(ids(fn(level)).every(Boolean));
  assert.deepEqual(ids(SAY_UI.adjust.swaps(SAY_UI.programs.legs)), ['swaps-before', 'program-legs', 'swaps-after']);
});
test('feedback plus weekly/streak/milestone clauses reuse clips; arbitrary names and large numbers survive', () => {
  const text = SAY_UI.adjust.boost(SAY_UI.programs.legs) + ' ' + SAY_UI.perseverance({ thisWeek: 8, streak: 23, workouts: 100 });
  assert.deepEqual(ids(text), ['boost-before', 'program-legs', 'boost-after', 'week-before', 'number-label', 'number-8', 'week-after', 'number-20', 'number-and-3', 'streak-after', 'milestone-before', 'number-100', 'milestone-after']);
  for (const workouts of [1, 5, 10, 20, 30, 50, 100]) for (const thisWeek of [1, 3, 7, 8, 25])
    assert.ok(ids(SAY_UI.perseverance({ thisWeek, streak: 20, workouts })).every(Boolean));
  const unknown = 'שֵׁם שֶׁל תָּכְנִית חֲדָשָׁה';
  const parts = splitVoiceText(SAY_UI.adjust.boost(unknown));
  assert.deepEqual(parts[1], { id: null, text: unknown });
  assert.deepEqual(splitVoiceText('999'), [{ id: null, text: '999' }]);
  assert.deepEqual(splitVoiceText('A new line', 'en-US'), [{ id: null, text: 'A new line' }]);
});
test('recording wins; absent/partial clips use existing speech without losing text', () => {
  const buffer = { duration: 0.4 }, buffers = new Map([['number-20', buffer]]);
  assert.deepEqual(chooseVoice(numWord(20), buffers).map(p => p.kind), ['recording']);
  const text = timeCue(20, 60);
  assert.deepEqual(chooseVoice(text, buffers).map(p => p.kind), ['speech', 'recording', 'speech']);
  assert.deepEqual(chooseVoice(text, new Map()), [{ kind: 'speech', text, tts: 'עוֹד עֶשְׂרִים שְׁנִיּוֹת' }]);
  assert.equal(chooseVoice(SAY_UI.adjust.boost('תוכנית חדשה'), new Map())[0].text, SAY_UI.adjust.boost('תוכנית חדשה'));
  assert.deepEqual(chooseVoice('מַתְחִילִים!', new Map([['start', buffer]])).map(p => p.kind), ['recording']);
});

const audioBuffer = (channels, length, sampleRate) => {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c] };
};
function harness({ suspended = false, missing = [] } = {}) {
  const starts = [], spoken = [], callbacks = [], requests = [], nodes = [];
  let time = 10000, cancels = 0, resume;
  const context = {
    state: suspended ? 'suspended' : 'running', currentTime: 10, destination: {},
    createBuffer: audioBuffer,
    decodeAudioData: async () => { const b = audioBuffer(1, 100, 1000); b.getChannelData(0).fill(0.5); return b; },
    resume: () => new Promise(resolve => { resume = () => { context.state = 'running'; resolve(); }; }),
    createBufferSource: () => {
      const source = { connect() {}, start(at) { starts.push({ at, buffer: this.buffer }); }, stop() { this.stopped = true; this.onended?.(); } };
      nodes.push(source); return source;
    },
  };
  const player = createVoicePlayer({ context: () => context,
    fetchFile: async url => { requests.push(String(url)); return { ok: !['finished', ...missing].some(id => String(url).includes(`${id}.wav`)), arrayBuffer: async () => new ArrayBuffer(4) }; },
    speakFallback: (text, options, done) => { spoken.push({ text, options }); callbacks.push(done); return true; },
    cancelFallback: () => { cancels++; }, now: () => time,
  });
  return { player, context, starts, spoken, callbacks, requests, nodes, resume: () => resume(), advance: ms => { time += ms; }, cancels: () => cancels };
}
test('loaded parts are scheduled on the same audio clock with no gap; recent-speech guard lasts through playback', async () => {
  const h = harness(); await Promise.all(['time-more', 'number-20', 'time-seconds'].map(h.player.load));
  h.player.play(timeCue(20, 60), { quick: true });
  assert.equal(h.spoken.length, 0); assert.equal(h.starts.length, 3);
  for (let i = 1; i < h.starts.length; i++) assert.equal(h.starts[i].at, h.starts[i - 1].at + h.starts[i - 1].buffer.duration);
  h.advance(5000); assert.equal(h.player.spokeRecently(), true);
  h.nodes.at(-1).onended(); h.advance(901); assert.equal(h.player.spokeRecently(), false);
});
test('missing and corrupt files preserve fallback; requests are fetched once and an early call uses its recording', async () => {
  const h = harness(); h.player.play('סִיַּמְתָּ!');
  await h.player.load('finished'); await Promise.resolve(); assert.equal(h.spoken[0].text, 'סִיַּמְתָּ!');
  await Promise.all([h.player.load('finished'), h.player.load('finished')]);
  assert.equal(h.requests.length, 1); h.player.play('סִיַּמְתָּ!'); assert.equal(h.spoken.length, 2);
  h.context.decodeAudioData = async () => { throw Error('bad audio'); };
  await h.player.load('start'); h.player.play('מַתְחִילִים!'); assert.equal(h.spoken.at(-1).text, 'מַתְחִילִים!');
  const early = harness(); early.player.play(numWord(3));
  await early.player.load('number-3'); await Promise.resolve();
  assert.equal(early.starts.length, 1); assert.equal(early.spoken.length, 0);
  const stopped = harness(); stopped.player.play(numWord(3)); stopped.player.stop();
  await stopped.player.load('number-3'); await Promise.resolve(); assert.equal(stopped.starts.length, 0);
});
test('partial recording alternates with speech once; stop cancels sources and stale speech callbacks', async () => {
  const h = harness({ missing: ['time-more', 'time-seconds'] }); await Promise.all(['number-20', 'time-more', 'time-seconds'].map(h.player.load));
  h.player.play(timeCue(20, 60)); assert.equal(h.spoken[0].text, 'עוֹד');
  h.callbacks[0](); assert.equal(h.starts.length, 1);
  h.nodes[0].onended(); assert.equal(h.spoken[1].text, 'שְׁנִיּוֹת');
  h.player.stop(); h.callbacks[1](); assert.equal(h.spoken.length, 2); assert.equal(h.player.spokeRecently(), true);
  const active = harness(); await active.player.load('number-3'); active.player.play(numWord(3)); active.player.stop();
  assert.equal(active.nodes[0].stopped, true);
});
test('quick queue stays bounded and does not interrupt the first cue; stop during audio unlock prevents late playback', async () => {
  const h = harness(); await Promise.all(['number-1', 'number-2', 'number-3'].map(h.player.load));
  h.player.play(numWord(1), { quick: true }); h.player.play(numWord(2), { quick: true });
  assert.equal(h.starts.length, 1);
  h.player.play(numWord(3), { quick: true }); assert.equal(h.nodes[0].stopped, true); assert.equal(h.starts.length, 2);
  const s = harness({ suspended: true }); await s.player.load('number-3'); s.player.play(numWord(3)); s.player.stop(); s.resume();
  await Promise.resolve(); assert.equal(s.starts.length, 0);
});
test('trimming removes edge silence, retains internal pauses and rejects silent clips', () => {
  const b = audioBuffer(2, 100, 1000); b.getChannelData(1).fill(.2, 20, 30); b.getChannelData(1).fill(.3, 70, 80);
  const trimmed = trimVoiceBuffer(b, { createBuffer: audioBuffer });
  assert.equal(trimmed.length, 76); assert.equal(trimmed.getChannelData(1)[40], 0);
  assert.throws(() => trimVoiceBuffer(audioBuffer(1, 20, 1000), { createBuffer: audioBuffer }), /לא נשמע/);
});
test('phone export is a mono PCM WAV; ZIP directory, payload and checksums use the exact catalog filenames', async () => {
  const b = audioBuffer(2, 3, 24000); b.getChannelData(0).set([1, -1, .5]); b.getChannelData(1).set([1, -1, -.5]);
  const blob = wavBlob(b), wav = new Uint8Array(await blob.arrayBuffer()), view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF'); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24000); assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768); assert.equal(view.getInt16(48, true), 0);
  const name = VOICE_BY_ID['number-3'].file, zip = new Uint8Array(await (await zipBlob([{ name, blob }])).arrayBuffer());
  const z = new DataView(zip.buffer), filenameLength = z.getUint16(26, true), start = 30 + filenameLength;
  assert.equal(z.getUint32(0, true), 0x04034b50); assert.equal(z.getUint32(14, true), crc32(wav));
  assert.equal(new TextDecoder().decode(zip.slice(30, start)), name); assert.deepEqual(zip.slice(start, start + wav.length), wav);
  const central = start + wav.length; assert.equal(z.getUint32(central, true), 0x02014b50); assert.equal(z.getUint32(central + 42, true), 0);
  assert.equal(z.getUint32(zip.length - 22, true), 0x06054b50); assert.equal(z.getUint16(zip.length - 12, true), 1);
  await assert.rejects(zipBlob([{ name: '../bad.wav', blob }]), /שם קובץ/);
});
