import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReminder, travelLine, handoverText } from '../js/logic/travel.js';

test('reminders she dictates: tomorrow, weekday, time, date, in three languages', () => {
  const today = '2026-09-28'; // Monday
  assert.deepEqual(parseReminder('תזכירי לי מחר ב-9 להתקשר לדנה', today), { title: 'להתקשר לדנה', due: '2026-09-29', time: '09:00' });
  assert.deepEqual(parseReminder('תזכירי לי ביום שלישי בשעה 14:30 לבדוק את ההצעה של דן', today), { title: 'לבדוק את ההצעה של דן', due: '2026-09-29', time: '14:30' });
  assert.deepEqual(parseReminder('תזכורת: לשלוח חשבונית 15/10', today), { title: 'לשלוח חשבונית', due: '2026-10-15', time: '' });
  assert.deepEqual(parseReminder('remind me on friday at 8 to call the hotel', today), { title: 'call the hotel', due: '2026-10-02', time: '08:00' });
  assert.deepEqual(parseReminder('rappelle-moi demain à 10 de confirmer le bus', today), { title: 'confirmer le bus', due: '2026-09-29', time: '10:00' });
  assert.deepEqual(parseReminder('תזכירי לי בעוד 3 ימים לחזור לצופיה', today), { title: 'לחזור לצופיה', due: '2026-10-01', time: '' });
  assert.deepEqual(parseReminder('תזכירי לי ב-5 לצאת', today), { title: 'לצאת', due: '2026-09-28', time: '17:00' });
  assert.equal(parseReminder('שלחי הודעה לרועי: מגיעה', today), null);
});

test('the travel line and the handover', () => {
  const tr = { on: true, from: '2026-09-18', to: '2026-09-28', subName: 'שירית כהן', subPhone: '050-1112222', notes: 'לדפוס: לאשר את ההזמנה רק אחרי שמשלחים הוכחת הדפסה. להתקשר חצי שעה לפני.' };
  assert.equal(travelLine(tr, 'he'), 'אני בחו״ל עד 28/09/2026, לדחוף: שירית כהן 050-1112222.');
  assert.equal(travelLine(tr, 'en'), 'I am abroad until 28/09/2026, for anything urgent: שירית כהן 050-1112222.');
  assert.equal(travelLine({ on: false }, 'he'), '');
  const h = handoverText(tr, { upcoming: ['מפגש הכפר · 18/10/2026 · גן שפיים'], suppliers: ['דף אור · הזמנת תגי שם'], print: [], calls: ['יוסי 050-1234567 · מחיר'], tasks: [], followups: [] }, 'וירג׳יני');
  assert.match(h, /^היי שירית, אני בחו״ל מ-18\/09\/2026 עד 28\/09\/2026\. מה שצריך לדחוף בינתיים:\n\nאירועים קרובים:\n• מפגש הכפר · 18\/10\/2026 · גן שפיים\n\nספקים שלא ענו \(להתקשר\):\n• דף אור · הזמנת תגי שם\n\nשיחות פתוחות:\n• יוסי 050-1234567 · מחיר\n\nהוראות:\nלדפוס/);
  assert.match(h, /וירג׳יני$/);
});
