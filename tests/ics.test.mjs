import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText, gcalLink, taskEvent, caseEvent } from '../js/logic/ics.js';

test('a reminder with a time becomes a 30-minute event with an alarm', () => {
  const ics = icsText({ id: 't1', title: 'להתקשר לדנה', date: '2026-09-29', time: '09:00' });
  assert.ok(ics.includes('DTSTART:20260929T090000'));
  assert.ok(ics.includes('DTEND:20260929T093000'));
  assert.ok(ics.includes('SUMMARY:להתקשר לדנה'));
  assert.ok(ics.includes('TRIGGER:-PT10M'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
});

test('without a time it is an all-day event; commas are escaped; empty input gives nothing', () => {
  const ics = icsText({ title: 'סיור, מלון דניאל', date: '2026-09-29', details: 'a;b' });
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260929'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260930'));
  assert.ok(ics.includes('SUMMARY:סיור\\, מלון דניאל'));
  assert.ok(ics.includes('DESCRIPTION:a\\;b'));
  assert.equal(icsText({ title: 'x', date: '' }), '');
  assert.equal(icsText({ title: '', date: '2026-09-29' }), '');
});

test('google calendar link and the task/case adapters', () => {
  const link = gcalLink({ title: 'להתקשר לדנה', date: '2026-09-29', time: '09:00' });
  assert.ok(link.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(link.includes('dates=20260929T090000%2F20260929T093000'));
  const ev = taskEvent({ id: 'a', title: 'סיור', due: '2026-09-29', time: '10:30', who: 'אני' }, { client: 'שוב״ל', date: '2026-10-19' });
  assert.equal(ev.time, '10:30'); assert.ok(ev.details.includes('שוב״ל · 19/10/2026'));
  const ce = caseEvent({ id: 'c', client: 'שוב״ל', kind: 'כנס', date: '2026-10-19', hours: '09:00-17:00', place: 'הרצליה', participants: '18' });
  assert.equal(ce.time, '09:00'); assert.equal(ce.place, 'הרצליה'); assert.equal(ce.title, 'שוב״ל · כנס');
});
