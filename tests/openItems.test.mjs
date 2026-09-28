import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMissing, openItems, focusSections } from '../js/logic/openItems.js';

test('the question is understood, with who and what she focuses on', () => {
  assert.deepEqual(parseMissing('מה חסר לי לשוב״ל'), { who: 'לשוב״ל', alt: 'שוב״ל', focus: 'all' });
  assert.deepEqual(parseMissing('מה חסר לי מהספקים של ברטלסמן?'), { who: 'ברטלסמן', alt: 'רטלסמן', focus: 'suppliers' });
  assert.deepEqual(parseMissing('מה פתוח מול הלקוח שוב״ל'), { who: 'שוב״ל', alt: 'שוב״ל', focus: 'client' });
  assert.deepEqual(parseMissing('מה עוד צריך לאירוע של שוב״ל'), { who: 'שוב״ל', alt: 'שוב״ל', focus: 'all' });
  assert.deepEqual(parseMissing("what's missing for Shoval"), { who: 'Shoval', alt: 'Shoval', focus: 'all' });
  assert.deepEqual(parseMissing('what do I still need from the suppliers for Bertelsmann'), { who: 'Bertelsmann', alt: 'Bertelsmann', focus: 'suppliers' });
  assert.deepEqual(parseMissing('qu’est-ce qui manque pour Shoval ?'), { who: 'Shoval', alt: 'Shoval', focus: 'all' });
  assert.equal(parseMissing('תזכירי לי מחר להתקשר לדנה'), null);
  assert.equal(parseMissing('מה המשימות שלי למחר'), null);
});

test('open items are grouped in plain sections', () => {
  const cs = { id: 'c1', clientId: 'k1', client: 'שוב״ל', kind: 'כנס', date: '2026-10-19', participants: '18', place: 'הרצליה', budget: '', purpose: '', phone: '', email: 'a@b.c', status: 'נסגר', needs: ['מלונות', 'הסעות', 'דפוס ומיתוג'] };
  const data = {
    suppliers: [{ id: 's1', name: 'מלון דניאל', type: 'מלונות', email: 'x@y' }, { id: 's2', name: 'מלון השרון', type: 'מלונות' }, { id: 's3', name: 'דף אור', type: 'דפוס ומיתוג', phone: '04' }],
    links: [{ caseId: 'c1', supplierId: 's1', status: 'הצעה התקבלה', answeredAt: '2026-09-26' }, { caseId: 'c1', supplierId: 's2', status: 'ביקשנו הצעה', askedAt: '2026-09-25' }, { caseId: 'c1', supplierId: 's3', status: 'אושר', cost: 500, paid: 'כן', paidAt: '2026-09-20' }],
    approvals: [{ caseId: 'c1', title: 'מקדמה למלון', status: 'sent', sentAt: '2026-09-26' }],
    payments: [{ caseId: 'c1', amount: 3000, status: 'לגבות' }],
    clients: [{ id: 'k1', name: 'שוב״ל', approver: 'צופיה' }],
    tasks: [{ caseId: 'c1', title: 'סיור במלון', due: '2026-09-29', status: 'open' }, { caseId: 'c1', title: 'נגמר', status: 'done' }],
    calls: [], print: [{ caseId: 'c1', item: 'תגי שם', status: 'לתכנן' }]
  };
  const r = openItems(cs, data, '2026-09-28', 'he');
  const keys = r.sections.map(s => s.key);
  assert.deepEqual(keys, ['details', 'suppliers', 'client', 'tasks', 'print', 'money']);
  const texts = r.sections.flatMap(s => s.items.map(i => i.text));
  assert.ok(texts.includes('אין תקציב')); assert.ok(texts.includes('אין מטרה'));
  assert.ok(texts.includes('אין עדיין ספק להסעות'));
  assert.ok(texts.includes('מלון השרון: ביקשנו הצעה, עדיין לא ענו (3 ימים)'));
  assert.ok(texts.includes('התקבלו 1 הצעות למלונות, עדיין לא נבחר'));
  assert.ok(texts.includes('מלון השרון: אין טלפון ומייל'));
  assert.ok(texts.includes('מחכה לאישור הלקוח: מקדמה למלון'));
  assert.ok(texts.includes('סיור במלון · 29/09/2026'));
  assert.ok(texts.includes('1 פריטי דפוס עוד לא הוזמנו'));
  assert.ok(texts.includes('דף אור: שולם, חסרה חשבונית'));
  assert.equal(r.daysLeft, 21);
  assert.deepEqual(focusSections(r, 'suppliers').sections.map(s => s.key), ['suppliers', 'print', 'money']);
  assert.deepEqual(focusSections(r, 'client').sections.map(s => s.key), ['details', 'client']);
  assert.equal(openItems(cs, data, '2026-09-28', 'en').sections[1].title, 'Suppliers');
});
