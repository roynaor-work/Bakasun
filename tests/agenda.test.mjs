import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgenda, agenda } from '../js/logic/agenda.js';

const TODAY = '2026-09-28'; // a Monday

test('questions about a day are understood in three languages', () => {
  assert.deepEqual(parseAgenda('איפה הרשימות משימות שלי למחר', TODAY), { from: '2026-09-29', to: '2026-09-29', key: 'tomorrow' });
  assert.deepEqual(parseAgenda('מה המשימות שלי למחר?', TODAY), { from: '2026-09-29', to: '2026-09-29', key: 'tomorrow' });
  assert.deepEqual(parseAgenda('מה יש לי היום', TODAY), { from: TODAY, to: TODAY, key: 'today' });
  assert.deepEqual(parseAgenda('what do I have tomorrow', TODAY), { from: '2026-09-29', to: '2026-09-29', key: 'tomorrow' });
  assert.deepEqual(parseAgenda('what are my tasks for wednesday?', TODAY), { from: '2026-09-30', to: '2026-09-30', key: 'day' });
  assert.deepEqual(parseAgenda('mes tâches pour demain', TODAY), { from: '2026-09-29', to: '2026-09-29', key: 'tomorrow' });
  assert.deepEqual(parseAgenda('מה יש השבוע', TODAY), { from: TODAY, to: '2026-10-05', key: 'week' });
  assert.deepEqual(parseAgenda('משימות ל-15/10', TODAY), { from: '2026-10-15', to: '2026-10-15', key: 'day' });
  assert.deepEqual(parseAgenda('מה המשימות הפתוחות שלי', TODAY), { from: '', to: '', key: 'all' });
});

test('instructions are not questions', () => {
  assert.equal(parseAgenda('תזכירי לי מחר ב-9 להתקשר לדנה', TODAY), null);
  assert.equal(parseAgenda('משימה לשירית: לאסוף שלטים', TODAY), null);
  assert.equal(parseAgenda('שלחי הודעה לרועי: מגיעה מחר', TODAY), null);
  assert.equal(parseAgenda('תפתחי את דנה', TODAY), null);
});

test('the answer holds the reminder she dictated, overdue tasks on today, and the events of that day', () => {
  const data = {
    tasks: [{ id: 1, title: 'להתקשר לדנה', due: '2026-09-29', time: '09:00', status: 'open' }, { id: 2, title: 'ישן', due: '2026-09-20', status: 'open' }, { id: 3, title: 'נגמר', due: '2026-09-29', status: 'done' }, { id: 4, title: 'בלי תאריך', status: 'open' }],
    cases: [{ id: 'c1', client: 'שוב״ל', date: '2026-09-29', status: 'נסגר' }, { id: 'c2', client: 'ישן', date: '2026-01-01', status: 'בוצע' }],
    calls: []
  };
  const tomorrow = agenda(data, parseAgenda('מה יש לי מחר', TODAY), TODAY);
  assert.deepEqual(tomorrow.tasks.map(x => x.id), [1]);
  assert.deepEqual(tomorrow.events.map(x => x.id), ['c1']);
  const today = agenda(data, parseAgenda('מה יש לי היום', TODAY), TODAY);
  assert.deepEqual(today.tasks.map(x => x.id), [2]);
  const all = agenda(data, parseAgenda('מה המשימות שלי', TODAY), TODAY);
  assert.deepEqual(all.tasks.map(x => x.id).sort(), [1, 2, 4]);
});
