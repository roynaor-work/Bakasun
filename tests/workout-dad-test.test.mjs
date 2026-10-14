import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dadTestReminder, dadTestToday, localDateKey, validTestDate, isDadTest } from '../workout/js/dad-test.js';
import { VOICE_BY_ID, splitVoiceText } from '../workout/js/voice-lines.js';
import { summarize } from '../workout/js/logic.js';

test('reminders count 3, 2, 1 and today; stay silent earlier, later and without a valid date', () => {
  const date = '2026-10-18';
  for (let day = 14; day <= 19; day++) {
    const now = new Date(2026, 9, day, 23, 59);
    const reminder = dadTestReminder(date, now);
    if (day < 15 || day > 18) assert.equal(reminder, null);
    else {
      assert.equal(reminder.days, 18 - day);
      assert.equal(reminder.key, `${date}:2026-10-${day}`);
      const line = VOICE_BY_ID[reminder.voiceId];
      assert.deepEqual(splitVoiceText(line.text).map(p => p.id), [reminder.voiceId]);
      assert.match(line.tts, /[\u0591-\u05c7]/u);
    }
    assert.equal(dadTestToday(date, now), day === 18 ? date : '');
  }
  for (const date of ['', undefined, null, '2026-02-30', '2026-13-01', '2026-1-01', '2026-10-18T00:00:00Z', 1]) {
    assert.equal(validTestDate(date), ''); assert.equal(dadTestReminder(date), null);
  }
  assert.equal(validTestDate('2028-02-29'), '2028-02-29');
  assert.equal(dadTestReminder(date, new Date(NaN)), null);
});

test('calendar countdown crosses Jerusalem daylight saving and local midnight correctly', () => {
  const module = new URL('../workout/js/dad-test.js', import.meta.url).href;
  const script = `import {dadTestReminder,localDateKey} from '${module}';
    console.log(JSON.stringify([
      dadTestReminder('2026-10-26',new Date(2026,9,23,23,59)).days,
      dadTestReminder('2026-10-26',new Date(2026,9,25,0,1)).days,
      localDateKey(new Date('2026-10-14T22:30:00Z')),
      dadTestReminder('2027-01-01',new Date(2026,11,29)).days]));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'Asia/Jerusalem' } }));
  assert.deepEqual(result, [3, 1, '2026-10-15', 3]);
  assert.equal(localDateKey(new Date(2026, 0, 2)), '2026-01-02');
});

test('only a scheduled full shared workout is a test, and success never changes the measured counts', () => {
  for (const done of [0, 1, 10]) {
    const session = { dadTestDate: '2026-10-18', together: { mode: 'workout', programId: 'full' },
      items: [{ type: 'reps', target: 10, done, skipped: done === 0 }] };
    assert.equal(isDadTest(session), true);
    assert.equal(isDadTest(JSON.parse(JSON.stringify(session))), true);
    assert.equal(summarize(session).reps, done);
    assert.equal(VOICE_BY_ID['dad-test-success'].text, 'הצלחת במבחן עם אבא!');
  }
  for (const session of [{}, { dadTestDate: 'bad' }, { dadTestDate: '2026-10-18', together: { mode: 'challenge', exId: 'squats' } },
    { dadTestDate: '2026-10-18', together: { mode: 'workout', programId: 'jump-a' } }]) assert.equal(isDadTest(session), false);
});

test('parent schedule persists on old data without changing the chosen activity or past workouts', async () => {
  let raw = JSON.stringify({ sessions: [{ id: 'old', items: [] }], parent: { pinHash: 'synthetic', together: { mode: 'challenge', exId: 'squats', target: 5 } } });
  globalThis.localStorage = { getItem: () => raw, setItem: (key, value) => { raw = value; } };
  try {
    const { store } = await import('../workout/js/store.js?dad-test');
    assert.equal(store.parent.dadTestDate, '');
    const before = structuredClone(store.data);
    store.setParent({ dadTestDate: '2026-10-18' });
    const reloaded = (await import('../workout/js/store.js?dad-test-reload')).store;
    assert.equal(reloaded.parent.dadTestDate, '2026-10-18');
    assert.deepEqual(reloaded.parent.together, before.parent.together);
    assert.deepEqual(reloaded.sessions, before.sessions);
    reloaded.setParent({ dadTestDate: '' });
    assert.equal(dadTestReminder(reloaded.parent.dadTestDate), null);
  } finally { delete globalThis.localStorage; }
});
