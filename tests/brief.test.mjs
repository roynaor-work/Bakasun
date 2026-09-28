import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief, sentences } from '../js/logic/brief.js';

const PLACES = [['הרצליה', 'Herzliya'], ['ראש פינה', 'Rosh Pinna'], ['תל אביב', 'Tel Aviv']];

test('a minute of talking becomes a case, the suppliers it needs, and the tasks she mentioned', () => {
  const txt = 'שוב״ל רוצים סמינר צוות ב-19 באוקטובר בהרצליה עם לינה לילה אחד 16 חדרי סינגל חצי פנסיון בערך 18 משתתפים צריך אולם עם מסך ומקרן ומיניבוס מתל אביב צריך לבדוק עם צופיה את התקציב ולהתקשר לארבל ממלון דניאל לתאם סיור לא לשכוח תגי שם';
  const b = parseBrief(txt, PLACES, '2026-09-28', [{ name: 'שוב"ל', contact: 'צופיה', phone: '050-1234567', lang: 'he' }, { name: 'Bertelsmann', lang: 'en' }]);
  assert.equal(b.lead.client, 'שוב"ל'); assert.equal(b.lead.phone, '050-1234567'); assert.equal(b.lead.kind, 'יום גיבוש');
  assert.equal(b.lead.date, '2026-10-19'); assert.equal(b.lead.participants, '18'); assert.equal(b.lead.place, 'הרצליה');
  assert.deepEqual(b.needs, ['מלונות', 'הסעות', 'מקום לאירוע', 'הגברה ותאורה', 'דפוס ומיתוג', 'פעילות וסיורים']);
  assert.equal(b.days, '2'); assert.equal(b.rooms, '16');
  assert.deepEqual(b.tasks.map(x => x.title), ['צריך לבדוק עם צופיה את התקציב', 'להתקשר לארבל ממלון דניאל', 'לתאם סיור', 'לא לשכוח תגי שם']);
  assert.deepEqual(b.open, ['budget']);
});

test('English brief', () => {
  const b = parseBrief('Bertelsmann delegation November 19 to 24, 24 participants, hotels in Tel Aviv and a bus, need to book Yad Vashem tour, remember to ask Claudia about vegetarian dinner', PLACES, '2026-09-28');
  assert.equal(b.lead.participants, '24'); assert.ok(b.needs.includes('מלונות')); assert.ok(b.needs.includes('הסעות')); assert.ok(b.needs.includes('פעילות וסיורים'));
  assert.deepEqual(b.tasks.map(x => x.title), ['need to book Yad Vashem tour', 'remember to ask Claudia about vegetarian dinner']);
  assert.equal(sentences('א. ב! ג').length, 3);
});
