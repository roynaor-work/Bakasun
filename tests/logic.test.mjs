/* Logic tests: run with `node --test tests/`. No browser, no network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Office from '../js/logic/office.js';
import { PLACES } from '../js/data/places.js';
import { hasArabic, phoneDigits, phonePretty, waLink, samePhone } from '../js/logic/core.js';
import { callQueue, callOutcome, noAnswerMessage, taskMessage, openTasks, matchClient, searchDocs, todayList, CALL, TASK } from '../js/logic/extra.js';

const today = new Date(2026, 8, 26);

test('parseLead reads a Hebrew WhatsApp message', () => {
  const l = Office.parseLead('היי, שמי דנה מטכנו-גליל. רוצים יום גיבוש ל-40 עובדים ב-15/11 בראש פינה, תקציב 20 אלף ש"ח. 052-1234567', PLACES, today);
  assert.equal(l.date, '2026-11-15'); assert.equal(l.participants, '40'); assert.equal(l.budget, '20,000 ₪');
  assert.equal(l.place, 'ראש פינה'); assert.equal(l.kind, 'יום גיבוש'); assert.equal(l.phone, '052-1234567'); assert.equal(l.lang, 'he');
  assert.deepEqual(l.missing, ['purpose']);
});
test('parseLead reads French and English', () => {
  const f = Office.parseLead('Bonjour, je m\'appelle Marc Cohen. Nous organisons la bar mitsva de Nathan le 15 octobre à Safed, environ 120 personnes, budget 60000 shekels. +33 6 12 34 56 78', PLACES, today);
  assert.equal(f.lang, 'fr'); assert.equal(f.kind, 'בר או בת מצווה'); assert.equal(f.participants, '120'); assert.equal(f.date, '2026-10-15'); assert.equal(f.name, 'Marc Cohen');
  const e = Office.parseLead('Hi, this is Sarah. A delegation of 25-30 people from Toronto, 3 days in the Upper Galilee in March, budget about 90k NIS. sarah@example.com', PLACES, today);
  assert.equal(e.lang, 'en'); assert.equal(e.kind, 'משלחת או סיור'); assert.equal(e.participants, '25-30'); assert.equal(e.email, 'sarah@example.com'); assert.equal(e.place, 'גליל עליון');
});
test('followupQuestions asks only what is missing, in the client language', () => {
  const l = { name: 'Marc', lang: 'fr', missing: ['date', 'budget'] };
  const s = Office.followupQuestions(l, 'fr', 'Virginie');
  assert.match(s, /Bonjour Marc/); assert.match(s, /Quelle date/); assert.match(s, /budget/); assert.doesNotMatch(s, /Combien de personnes/); assert.match(s, /Virginie$/);
});

test('no-Arabic rule and phones', () => {
  assert.equal(hasArabic('שלום hello bonjour'), false);
  assert.equal(hasArabic('x' + String.fromCharCode(0x0633)), true);
  assert.equal(phoneDigits('052-123-4567'), '972521234567'); assert.equal(phoneDigits('+33 6 12 34 56 78'), '33612345678'); assert.equal(phoneDigits('abc'), '');
  assert.equal(phonePretty('+972521234567'), '052-1234567'); assert.equal(phonePretty('0033612345678'), '+33612345678');
  assert.equal(waLink('052-1234567', 'היי'), 'https://wa.me/972521234567?text=%D7%94%D7%99%D7%99');
  assert.ok(samePhone('052-1234567', '+972 52 123 4567')); assert.ok(!samePhone('', ''));
});

test('call queue: due call-backs first, then new, then no-answer by attempts; future call-backs separate', () => {
  const calls = [
    { id: 'a', status: CALL.noanswer, attempts: 2, created: '1' }, { id: 'b', status: CALL.todo, attempts: 0, created: '2' },
    { id: 'c', status: CALL.callback, callbackAt: '2026-09-26', created: '3' }, { id: 'd', status: CALL.callback, callbackAt: '2026-09-30', created: '4' },
    { id: 'e', status: CALL.answered, created: '5' }, { id: 'f', status: CALL.noanswer, attempts: 1, created: '6' }
  ];
  const q = callQueue(calls, today);
  assert.deepEqual(q.now.map(c => c.id), ['c', 'b', 'f', 'a']); assert.deepEqual(q.scheduled.map(c => c.id), ['d']);
});
test('call outcomes', () => {
  const c = { id: 'x', status: CALL.todo, attempts: 0 };
  assert.equal(callOutcome(c, 'noanswer').status, CALL.noanswer); assert.equal(callOutcome(c, 'noanswer').attempts, 1);
  const cb = callOutcome(c, 'callback', { when: '2026-10-01' }); assert.equal(cb.status, CALL.callback); assert.equal(cb.callbackAt, '2026-10-01');
  const an = callOutcome(c, 'answered', { note: 'אישר' }); assert.equal(an.status, CALL.answered); assert.equal(an.note, 'אישר');
  assert.equal(c.attempts, 0, 'the original is not changed');
});
test('no-answer message in three languages, with what we need', () => {
  const c = { name: 'Marc Cohen', why: 'le devis' };
  assert.match(noAnswerMessage(c, 'fr', 'Virginie'), /^Bonjour Marc,\nJ’ai essayé[\s\S]*le devis[\s\S]*Merci\nVirginie$/);
  assert.match(noAnswerMessage(c, 'he'), /^היי Marc,\nניסיתי/); assert.match(noAnswerMessage(c, 'en'), /When is a good time/);
});

test('task message hands over exactly what to do', () => {
  const cs = { kind: 'יום גיבוש', date: '2026-11-15', place: 'ראש פינה', participants: '40' };
  const m = taskMessage({ title: 'לאסוף שלטים', details: '6 שלטים מהדפוס', who: 'נועה כהן', due: '2026-11-10' }, cs, 'he', 'וירג׳יני');
  assert.match(m, /^היי נועה,\nמשימה: לאסוף שלטים\nמה בדיוק: 6 שלטים מהדפוס\nלאירוע: יום גיבוש · 15\/11\/2026 · ראש פינה · 40 משתתפים\nעד 10\/11\/2026\n/);
  assert.match(taskMessage({ title: 'Photos', who: 'Léa' }, null, 'fr'), /^Bonjour Léa,\nTâche: Photos\nÉcris-moi/);
});
test('open tasks: overdue first', () => {
  const t = openTasks([{ id: 1, due: '2026-09-30', status: TASK.open }, { id: 2, due: '2026-09-20', status: TASK.sent }, { id: 3, status: TASK.done }, { id: 4, status: TASK.open }], today);
  assert.deepEqual(t.map(x => x.id), [2, 1, 4]); assert.equal(t[0].late, 6);
});

test('matchClient by phone, e-mail, or name', () => {
  const clients = [{ id: 'c1', name: 'טכנו-גליל בע״מ', phone: '052-1234567', email: 'dana@x.com' }];
  assert.equal(matchClient({ phone: '+972521234567' }, clients).id, 'c1');
  assert.equal(matchClient({ email: 'DANA@x.com' }, clients).id, 'c1');
  assert.equal(matchClient({ client: 'טכנו-גליל בע"מ' }, clients).id, 'c1');
  assert.equal(matchClient({ phone: '050-0000000' }, clients), null);
});

test('search finds by word and by phone digits', () => {
  const docs = searchDocs({ cases: [{ id: 'k1', client: 'טכנו-גליל', phone: '052-1234567', kind: 'יום גיבוש', place: 'ראש פינה' }], clients: [{ id: 'c1', name: 'Famille Cohen', phone: '+33612345678' }] });
  assert.equal(Office.search(docs, 'ראש פינה')[0].id, 'k1'); assert.equal(Office.search(docs, '0521234567')[0].id, 'k1'); assert.equal(Office.search(docs, 'cohen')[0].id, 'c1');
  assert.equal(Office.search(docs, 'xyz').length, 0);
});

test('today joins events, follow-ups, calls and due tasks', () => {
  const data = {
    cases: [{ id: 'k1', client: 'A', kind: 'כנס', date: '2026-10-02', status: Office.STATUS.won }, { id: 'k2', client: 'B', status: Office.STATUS.quoted, waitingSince: '2026-09-20', phone: '052-1234567' }],
    calls: [{ id: 'x', name: 'יוסי', status: CALL.todo }], tasks: [{ id: 't', title: 'שלטים', due: '2026-09-26', status: TASK.open }, { id: 'u', title: 'מאוחר יותר', due: '2026-10-20', status: TASK.open }]
  };
  const r = todayList(data, today, { followupDays: 1 });
  assert.deepEqual(r.items.map(i => i.type), ['upcoming', 'followup']); assert.equal(r.items[1].waited, 6);
  assert.equal(r.calls.length, 1); assert.deepEqual(r.tasks.map(x => x.id), ['t']);
  assert.match(Office.morningText(r.items, '26/09/2026'), /בוקר טוב/);
});

test('quote totals still work (for the next stage)', () => {
  const q = Office.quoteTotals([{ item: 'בר', qty: 40, price: 100, cost: 60 }, { item: 'DJ', price: 3000, cost: 2000 }], 18);
  assert.equal(q.net, 7000); assert.equal(q.vat, 1260); assert.equal(q.gross, 8260); assert.equal(q.cost, 4400); assert.equal(q.margin, 37.1);
});
