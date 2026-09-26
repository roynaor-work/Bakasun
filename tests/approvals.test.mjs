import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalMessage, approvalReminder, pendingApprovals, supplierPaidMessage, APPROVAL } from '../js/logic/approvals.js';

const cs = { client: 'טכנו-גליל', contact: 'דנה לוי', kind: 'יום גיבוש', date: '2026-10-05', place: 'ראש פינה', participants: '40' };
test('an approval request in three languages', () => {
  const a = { kind: 'participants', title: '45 במקום 40', details: 'הקייטרינג צריך לדעת עד יום שלישי', amount: 750 };
  assert.match(approvalMessage(a, cs, 'he', 'וירג׳יני'), /^היי דנה,\nלגבי יום גיבוש · 05\/10\/2026 · ראש פינה · 40 משתתפים:\nשינוי במספר המשתתפים: 45 במקום 40\nהקייטרינג צריך לדעת עד יום שלישי\nסכום: 750 ₪ \+ מע״מ\nאשמח לאישור/);
  assert.match(approvalMessage(a, cs, 'fr'), /^Bonjour דנה,/); assert.match(approvalMessage(a, cs, 'en'), /Additional|Change in the number of guests/);
  assert.match(approvalReminder(a, cs, 'he', '', 3), /מלפני 3 ימים/);
});
test('pending approvals after N days', () => {
  const list = [{ id: 1, status: APPROVAL.sent, sentAt: '2026-09-20' }, { id: 2, status: APPROVAL.sent, sentAt: '2026-09-25' }, { id: 3, status: APPROVAL.approved, sentAt: '2026-09-01' }, { id: 4, status: APPROVAL.draft }];
  assert.deepEqual(pendingApprovals(list, '2026-09-26', 2).map(a => [a.id, a.waited]), [[1, 6]]);
  assert.deepEqual(pendingApprovals(list, '2026-09-26', 1).map(a => a.id), [1, 2]);
});
test('supplier paid note', () => {
  assert.match(supplierPaidMessage({ name: 'הגברה יוסי', contact: 'יוסי' }, cs, 1800, 'he'), /^היי יוסי, התשלום על יום גיבוש[\s\S]*\(1,800 ₪\) הועבר בהעברה בנקאית/);
});
