import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printSeedFor, printOrderText, printOrderSubject, pendingPrint, printSummary, PRINT_STATUS } from '../js/logic/print.js';

test('the print list of a conference, quantities from the participants with a spare', () => {
  const list = printSeedFor('כנס שנתי', 100);
  assert.deepEqual(list.slice(0, 2).map(i => [i.item, i.qty, i.size]), [['תגי שם', 105, '9x6 ס״מ עם שרוך'], ['תוכנייה', 105, 'A5 מקופל']]);
  assert.equal(list.find(i => i.item === 'שלט כניסה').qty, 1);
  assert.equal(printSeedFor('משלחת GIYLE', 24)[0].qty, 26);
  assert.equal(printSeedFor('משהו אחר', 10).length, 2);
});

test('the order to the printer and the confirmation she waits for', () => {
  const cs = { id: 'k1', client: 'ארגון שוב״ל', kind: 'מפגש הכפר', date: '2026-10-18' };
  const txt = printOrderText(cs, { name: 'דף אור', contact: 'אביטל' }, [{ item: 'תגי שם', qty: 105, size: '9x6 ס״מ עם שרוך' }, { item: 'ביגים', qty: 2, size: '2 מטר', notes: 'לוגו שוב״ל' }, { item: '' }], { due: '2026-10-14', files: 'בדרייב, תיקיית מפגש הכפר' });
  assert.equal(txt, 'היי אביטל, מה שלומך?\nהזמנה לארגון שוב״ל, מפגש הכפר · 18/10/2026:\n• תגי שם · 105 יח׳ · 9x6 ס״מ עם שרוך\n• ביגים · 2 יח׳ · 2 מטר · לוגו שוב״ל\nצריך מוכן עד 14/10/2026.\nהקבצים: בדרייב, תיקיית מפגש הכפר\nאשמח לאישור הזמנה עם מחיר לפני ההדפסה. תודה רבה!\nוירג׳יני 054-4974644');
  assert.equal(printOrderSubject(cs), 'הזמנת דפוס · ארגון שוב״ל · 18/10/2026');
  const items = [{ id: 'a', caseId: 'k1', supplierId: 's1', item: 'תגי שם', status: PRINT_STATUS.ordered, orderedAt: '2026-10-01' }, { id: 'b', caseId: 'k1', supplierId: 's1', item: 'ביגים', status: PRINT_STATUS.ordered, orderedAt: '2026-10-03' }, { id: 'c', caseId: 'k1', item: 'שלט', status: PRINT_STATUS.confirmed, orderedAt: '2026-09-20' }];
  const p = pendingPrint(items, [cs], '2026-10-04', 2);
  assert.equal(p.length, 1); assert.equal(p[0].items.length, 2); assert.equal(p[0].waited, 3);
  assert.deepEqual(printSummary(items.concat([{ status: PRINT_STATUS.ready, cost: 1200 }])), { total: 4, ordered: 2, confirmed: 2, ready: 1, cost: 1200 });
});
