import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, matchTitles } from '../js/logic/questions.js';

const T = '2026-09-28';
test('short state sentences are understood', () => {
  assert.equal(parseAction('מי לא ענה', T).kind, 'waiting');
  assert.equal(parseAction('כמה ספקים לא ענו?', T).kind, 'waiting');
  assert.equal(parseAction("who hasn't answered", T).kind, 'waiting');
  assert.equal(parseAction('תזכירי לכל הספקים שלא ענו', T).kind, 'remindAll');
  assert.deepEqual(parseAction('תשלחי תזכורת לגרשון טורס', T), { kind: 'remindSup', who: 'גרשון טורס' });
  assert.deepEqual(parseAction('תזכירי לגרשון טורס', T), { kind: 'remindSup', who: 'גרשון טורס' });
  assert.equal(parseAction('תזכירי לי מחר להתקשר', T), null);
  assert.deepEqual(parseAction('מה שילמנו לביסקוטי', T), { kind: 'paidQuery', who: 'ביסקוטי' });
  assert.deepEqual(parseAction('העברתי תשלום לדף אור 500', T), { kind: 'paid', who: 'דף אור', amount: 500 });
  assert.deepEqual(parseAction('שילמתי לביסקוטי 1,561.86 ש"ח', T), { kind: 'paid', who: 'ביסקוטי', amount: 1561.86 });
  assert.deepEqual(parseAction('I paid Biscotti 500', T), { kind: 'paid', who: 'Biscotti', amount: 500 });
  const c = parseAction('תרשמי שיחה עם ארבל מחר ב-10', T);
  assert.equal(c.kind, 'callLog'); assert.equal(c.who, 'ארבל'); assert.deepEqual(c.when, { due: '2026-09-29', time: '10:00' });
  assert.deepEqual(parseAction('סמני שהסיור בוצע', T), { kind: 'taskDone', who: 'הסיור' });
  assert.deepEqual(parseAction('המשימה סיור במלון דניאל בוצעה', T), { kind: 'taskDone', who: 'סיור במלון דניאל' });
  assert.deepEqual(parseAction('mark call Dana as done', T), { kind: 'taskDone', who: 'call Dana' });
  assert.deepEqual(parseAction('תבטלי את המשימה של הסיור', T), { kind: 'taskCancel', who: 'הסיור' });
  assert.deepEqual(parseAction('סגרי עם מלון דניאל', T), { kind: 'chosen', who: 'מלון דניאל' });
  assert.deepEqual(parseAction('מלון דניאל נבחר', T), { kind: 'chosen', who: 'מלון דניאל' });
  assert.deepEqual(parseAction('תוסיפי לרשימת הדפוס 20 תגי שם לשוב״ל', T), { kind: 'printAdd', qty: 20, item: 'תגי שם', who: 'שוב״ל' });
  assert.deepEqual(parseAction('תוסיפי לדפוס שלט כניסה', T), { kind: 'printAdd', item: 'שלט כניסה', who: '' });
  assert.deepEqual(parseAction('מה התקציב של שוב״ל', T), { kind: 'field', field: 'budget', who: 'שוב״ל' });
  assert.deepEqual(parseAction('כמה משתתפים יש לברטלסמן', T), { kind: 'field', field: 'participants', who: 'ברטלסמן' });
  assert.deepEqual(parseAction('מתי האירוע של שוב״ל?', T), { kind: 'field', field: 'date', who: 'שוב״ל' });
  assert.deepEqual(parseAction('what is the budget of Shoval', T), { kind: 'field', field: 'budget', who: 'Shoval' });
  assert.equal(parseAction('שלחי וואטסאפ לדנה מגיעה', T), null);
  assert.equal(parseAction('מה יש לי מחר', T), null);
});

test('task titles are matched loosely', () => {
  const tasks = [{ title: 'סיור במלון דניאל, יום שלישי 10:30' }, { title: 'הצעה כתובה לארוחת הערב של ברטלסמן' }, { title: 'להתקשר לדנה' }];
  assert.equal(matchTitles('הסיור', tasks, x => x.title)[0].item.title.slice(0, 4), 'סיור');
  assert.equal(matchTitles('סיור במלון דניאל', tasks, x => x.title)[0].item.title.slice(0, 4), 'סיור');
  assert.equal(matchTitles('call Dana', tasks, x => x.title).length, 0);
  assert.equal(matchTitles('להתקשר לדנה', tasks, x => x.title)[0].item.title, 'להתקשר לדנה');
});
