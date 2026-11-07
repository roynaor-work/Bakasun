import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY, COPY_LINES, createVoiceCopy, ageBand, voiceCopyEnabled, dayPart } from '../workout/js/voice-copy.js';
import { VOICE_BY_ID, splitVoiceText, normalizeVoice } from '../workout/js/voice-lines.js';

const NIQ = /[֑-ׇ]/;
const words = t => t.trim().split(/\s+/).filter(Boolean);
const hebWords = t => words(t).filter(w => /[א-ת]/.test(w));
const rngSeq = () => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; };

test('every static line has plain text and fully vocalized speech text', () => {
  for (const l of COPY_LINES) {
    assert.ok(!NIQ.test(l.text), l.id);
    for (const w of hebWords(l.tts)) assert.ok(NIQ.test(w), `${l.id}: ${w}`);
    assert.equal(normalizeVoice(l.text).replace(/ו(?=\S)/g, '').length > 0, true);
    assert.ok(!/אנא|נא /.test(l.text), l.id);
  }
});
test('sentences are short and everyday (average and maximum words)', () => {
  const lens = COPY_LINES.map(l => words(l.text).length);
  assert.ok(lens.reduce((a, b) => a + b, 0) / lens.length <= 8.5);
  assert.ok(Math.max(...lens) <= 14);
});
test('no immediate repeat in 20 consecutive picks, for every situation and age band', () => {
  for (const key of Object.keys(COPY)) for (const band of ['y', 'b']) {
    const vc = createVoiceCopy({ rng: rngSeq() }); let prev = null;
    for (let i = 0; i < 20; i++) { const t = vc.pick(key, { band }).text; if (COPY[key].filter(l => !l[2] || l[2] === band).length > 1) assert.notEqual(t, prev, `${key}/${band}/${i}`); prev = t; }
  }
});
test('age band picks matching variants only', () => {
  assert.equal(ageBand({}), 'b'); assert.equal(ageBand({ age: 6 }), 'y'); assert.equal(ageBand({ age: 9 }), 'b');
  const vc = createVoiceCopy({ rng: rngSeq() });
  for (let i = 0; i < 40; i++) { assert.notEqual(vc.pick('howWas', { band: 'y' }).text, COPY.howWas[4][0]); assert.notEqual(vc.pick('howWas', { band: 'b' }).text, COPY.howWas[3][0]); }
});
test('howWas always asks the same three answers: easy, exact, hard', () => {
  const vc = createVoiceCopy({ rng: rngSeq() });
  for (let i = 0; i < 30; i++) { const t = vc.howWas({ name: i % 2 ? 'דני' : '', band: 'b' }).text; assert.match(t, /קל/); assert.match(t, /בדיוק/); assert.match(t, /קשה/); }
});
test('perseverance adapts to week, streak, milestone and time of day, with matching text and speech', () => {
  const vc = createVoiceCopy({ rng: rngSeq() });
  const a = vc.perseverance({ thisWeek: 3, streak: 4, workouts: 20 }, { hour: 8 });
  assert.match(a.text, /4|ארבעה/); assert.match(a.text, /20/);
  assert.ok(hebWords(a.tts).every(w => NIQ.test(w)));
  const first = vc.perseverance({ thisWeek: 1, streak: 1, workouts: 1 }, {});
  assert.match(first.text, /ראשון/);
  const big = vc.perseverance({ thisWeek: 12, streak: 30, workouts: 100 }, {});
  assert.match(big.text, /100/);
  assert.equal(dayPart(8), 'morning'); assert.equal(dayPart(20), 'evening'); assert.equal(dayPart(13), 'day');
});
test('flag turns the new copy off', () => {
  assert.equal(voiceCopyEnabled({}), true); assert.equal(voiceCopyEnabled({ voiceV1: false }), false); assert.equal(voiceCopyEnabled({}, '?voiceV1=0'), false);
});
test('static lines are in the recording catalog or identical to an existing recorded line', () => {
  for (const l of COPY_LINES) {
    const parts = splitVoiceText(l.text); assert.equal(parts.length, 1, l.id); assert.ok(parts[0].id, l.id);
    assert.ok(VOICE_BY_ID[parts[0].id], l.id);
  }
});
test('number then cheer splits into number clip and cheer clip, for every cheer variant', () => {
  for (const [text] of COPY.cheer) { const p = splitVoiceText(`שמונה! ${text}`); assert.equal(p.length, 2); assert.ok(p.every(x => x.id)); }
});
