import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf, monthLabel, receiptPath, receiptsOf, receiptsTotal, monthsToSend, receiptsMailText, isReceiptCommand } from '../js/logic/receipts.js';

test('months, paths, totals, and which months still have to go to the accountant', () => {
  assert.equal(monthOf('2026-09-28'), '2026-09'); assert.equal(monthLabel('2026-09', 'he'), 'ספטמבר 2026'); assert.equal(monthLabel('2026-09', 'en'), 'September 2026');
  assert.equal(receiptPath('org1', { id: 'r1', date: '2026-09-03' }), 'org1/2026-09/r1.jpg');
  const rs = [{ id: 'a', date: '2026-09-03', amount: 120 }, { id: 'b', date: '2026-09-20', amount: '1,500', month: '2026-09' }, { id: 'c', date: '2026-08-30', amount: 50 }];
  assert.deepEqual(receiptsOf(rs, '2026-09').map(r => r.id), ['b', 'a']); assert.equal(receiptsTotal(receiptsOf(rs, '2026-09')), 1620);
  assert.deepEqual(monthsToSend(rs, [{ paidAt: '2026-07-10' }], [{ paidAt: '2026-08-02' }], ['2026-07'], '2026-09-28'), ['2026-08']);
  assert.deepEqual(monthsToSend(rs, [], [], [], '2026-10-01'), ['2026-09', '2026-08']);
});

test('the command and the mail', () => {
  ['צלם חשבונית', 'צלמי קבלה', 'תצלמי את החשבונית', 'photo of an invoice', 'scan receipt', 'photo facture', 'חשבונית'].forEach(x => assert.equal(isReceiptCommand(x), true, x));
  assert.equal(isReceiptCommand('שלחי חשבונית לרועי'), false);
  const txt = receiptsMailText('2026-09', [{ date: '2026-09-03', supplier: 'ביסקוטי', amount: 1561.86, note: 'כיבוד' }], ['https://x/1'], 'שלום,\n\nסיכום 09/2026:\n\nהחשבוניות מצורפות / בקישור.\n\nתודה,\nוירג׳יני');
  assert.equal(txt, 'שלום,\n\nחשבוניות וקבלות שצולמו (1):\n• 03/09/2026 · ביסקוטי · 1,561.86 ₪ · כיבוד\n  https://x/1\n\nסיכום 09/2026:\n\nתודה,\nוירג׳יני');
});
