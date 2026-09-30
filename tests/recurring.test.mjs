import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, materialize, preview, EVERY } from '../js/logic/recurring.js';

test('nextOccurrence: day, week on a weekday, month on a day (clamped), every N months, year, from and until', () => {
  assert.equal(nextOccurrence({ every: 'day' }, '2026-09-30'), '2026-10-01');
  assert.equal(nextOccurrence({ every: 'week', on: 0 }, '2026-09-30'), '2026-10-04', 'next Sunday after a Wednesday');
  assert.equal(nextOccurrence({ every: 'week', on: 3 }, '2026-09-30'), '2026-10-07', 'same weekday → a week later');
  assert.equal(nextOccurrence({ every: 'week', from: '2026-10-06' }, '2026-09-30'), '2026-10-06', 'weekday taken from "from"');
  assert.equal(nextOccurrence({ every: 'month', on: 1, from: '2026-09-15' }, '2026-09-30'), '2026-10-01');
  assert.equal(nextOccurrence({ every: 'month', on: 1, from: '2026-09-15' }, '2026-10-01'), '2026-11-01');
  assert.equal(nextOccurrence({ every: 'month', on: 31, from: '2027-01-31' }, '2027-01-31'), '2027-02-28', 'clamped to the end of February');
  assert.equal(nextOccurrence({ every: '2months', on: 5, from: '2026-09-05' }, '2026-09-05'), '2026-11-05');
  assert.equal(nextOccurrence({ every: '3months', on: 5, from: '2026-09-05' }, '2026-09-05'), '2026-12-05');
  assert.equal(nextOccurrence({ every: '6months', on: 5, from: '2026-09-05' }, '2026-09-05'), '2027-03-05');
  assert.equal(nextOccurrence({ every: 'year', from: '2026-03-10' }, '2026-03-10'), '2027-03-10');
  assert.equal(nextOccurrence({ every: 'day', from: '2026-12-01' }, '2026-09-30'), '2026-12-01', 'never before "from"');
  assert.equal(nextOccurrence({ every: 'month', on: 1, from: '2026-09-01', until: '2026-10-15' }, '2026-10-01'), '', 'past "until"');
  assert.equal(nextOccurrence({ every: 'never' }, '2026-09-30'), '');
  assert.equal(nextOccurrence(null, '2026-09-30'), '');
  assert.deepEqual(preview({ every: 'week', on: 1, from: '2026-10-01' }, '2026-10-01', 3), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.equal(EVERY.length, 7);
});

const tpl = { id: 'tpl1', isTemplate: true, title: 'בקשת חשבונית חודשית לב.ד. גרייבר', who: 'רועי', caseId: 'k', priority: 'high', status: 'open',
  todos: [{ id: 'q', text: 'לצרף פירוט', done: true }], repeat: { every: 'month', on: 1, from: '2026-09-01' } };

test('materialize creates the first occurrence on or after today, copies the template, and is idempotent', () => {
  const r = materialize(tpl, '2026-09-30', []);
  assert.ok(r.create);
  assert.equal(r.create.due, '2026-10-01');
  assert.equal(r.create.title, tpl.title); assert.equal(r.create.who, 'רועי'); assert.equal(r.create.caseId, 'k'); assert.equal(r.create.priority, 'high');
  assert.equal(r.create.templateId, 'tpl1'); assert.equal(r.create.isTemplate, undefined); assert.equal(r.create.status, 'open');
  assert.equal(r.create.todos[0].done, false, 'todos start unticked');
  assert.deepEqual(r.patch, { id: 'tpl1', lastDue: '2026-10-01', made: 1 });
  // the created one exists and is open → nothing more
  const again = materialize(Object.assign({}, tpl, r.patch), '2026-10-20', [Object.assign({ id: 'o1' }, r.create)]);
  assert.equal(again.create, null); assert.equal(again.patch, null);
});

test('materialize makes the next one only after the previous is done; when the app slept it makes just the latest due one', () => {
  const done = { id: 'o1', templateId: 'tpl1', due: '2026-10-01', status: 'done' };
  const r = materialize(Object.assign({}, tpl, { lastDue: '2026-10-01', made: 1 }), '2026-10-03', [done]);
  assert.equal(r.create.due, '2026-11-01', 'made ahead of time, shows under later');
  assert.equal(r.patch.made, 2);
  // she did not open the app for three months: only 2027-01-01 is created (late), not a pile of three
  const late = materialize(Object.assign({}, tpl, { lastDue: '2026-10-01', made: 1 }), '2027-01-10', [done]);
  assert.equal(late.create.due, '2027-01-01');
  // an open overdue occurrence blocks a new one
  const stuck = materialize(tpl, '2027-01-10', [{ id: 'o2', templateId: 'tpl1', due: '2026-11-01', status: 'sent' }]);
  assert.equal(stuck.create, null);
});

test('materialize respects count and until, ignores non-templates', () => {
  const two = Object.assign({}, tpl, { repeat: Object.assign({}, tpl.repeat, { count: 2 }), made: 2 });
  assert.equal(materialize(two, '2026-12-05', [{ id: 'a', templateId: 'tpl1', due: '2026-11-01', status: 'done' }]).create, null);
  const ended = Object.assign({}, tpl, { repeat: Object.assign({}, tpl.repeat, { until: '2026-10-15' }), lastDue: '2026-10-01' });
  assert.equal(materialize(ended, '2026-10-20', [{ id: 'a', templateId: 'tpl1', due: '2026-10-01', status: 'done' }]).create, null);
  assert.equal(materialize({ id: 'x', title: 'plain', status: 'open' }, '2026-10-20', []).create, null);
  // a weekly supplier follow-up starting in the future
  const weekly = { id: 'w', isTemplate: true, title: 'מעקב ספקים', repeat: { every: 'week', on: 1, from: '2026-10-10' } };
  assert.equal(materialize(weekly, '2026-09-30', []).create.due, '2026-10-12');
  // a template with a duration: the occurrence starts on its date
  const dur = Object.assign({}, tpl, { duration: 3, durationUnit: 'workdays' });
  const d = materialize(dur, '2026-09-30', []).create;
  assert.equal(d.start, '2026-10-01'); assert.equal(d.duration, 3); assert.equal(d.durationUnit, 'workdays');
});
