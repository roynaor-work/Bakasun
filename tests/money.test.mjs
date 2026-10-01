import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supplierInvoicesMissing, supplierInvoiceReminder, monthReport, monthCsv, monthText, SUP_INVOICE } from '../js/logic/money.js';

const cases = [{ id: 'k1', client: 'ארגון שוב״ל', kind: 'סמינר צוות', date: '2026-10-19' }];
const sups = [{ id: 's1', name: 'מלון דניאל', contact: 'אורי שגב' }, { id: 's2', name: 'ביסקוטי' }];
const links = [
  { id: 'l1', caseId: 'k1', supplierId: 's1', status: 'אושר', cost: 9000, paid: 'כן', paidAt: '2026-10-22' },
  { id: 'l2', caseId: 'k1', supplierId: 's2', status: 'אושר', cost: 3200, paid: 'כן', paidAt: '2026-10-25', supInvoice: SUP_INVOICE.received, supInvoiceNo: '4471' },
  { id: 'l3', caseId: 'k1', supplierId: 's1', status: 'אושר', cost: 500, paid: 'לא' }
];

test('suppliers paid and still without an invoice, and the reminder', () => {
  const m = supplierInvoicesMissing(links, cases, sups, '2026-10-28', 3);
  assert.deepEqual(m.map(x => [x.id, x.waited, x.sup.name]), [['l1', 6, 'מלון דניאל']]);
  assert.equal(supplierInvoicesMissing(links, cases, sups, '2026-10-23', 3).length, 0);
  assert.equal(supplierInvoiceReminder(sups[0], cases[0], 9000, 'he', 'וירג׳יני'), 'היי אורי, התשלום על סמינר צוות · 19/10/2026 (9,000 ₪) הועבר ועדיין לא קיבלתי חשבונית מס. אשמח שתשלחו על שם באקה סאן בע״מ, ח.פ. 515000032. תודה רבה!\nוירג׳יני');
});

test('the month for the accountant: both directions, totals, CSV and mail', () => {
  const payments = [{ id: 'p1', caseId: 'k1', amount: 27310, status: 'שולם', paidAt: '2026-10-30', invoiceNo: '1042' }, { id: 'p2', caseId: 'k1', amount: 5000, status: 'לגבות', updated: '2026-10-05' }, { id: 'p3', caseId: 'k1', amount: 800, status: 'שולם', paidAt: '2026-09-02' }];
  const rep = monthReport(payments, links, cases, sups, '2026-10');
  assert.equal(rep.clientRows.length, 1); assert.equal(rep.totalIn, 27310);
  assert.deepEqual(rep.supplierRows.map(r => [r.supplier, r.amount, r.invoice]), [['מלון דניאל', 9000, 'חסרה'], ['ביסקוטי', 3200, '4471']]);
  assert.equal(rep.totalOut, 12200); assert.equal(rep.missing, 1);
  const csv = monthCsv(rep);
  assert.match(csv, /^﻿"סוג","תאריך"/); assert.match(csv, /"הכנסה","30\/10\/2026","ארגון שוב״ל","סמינר צוות · 19\/10\/2026","27310","1042","שולם",""/); assert.match(csv, /"סה״כ הוצאות","12200"/);
  const mail = monthText(rep, 'וירג׳יני');
  assert.equal(mail.subject, 'באקה סאן · סיכום 10/2026 לרואה החשבון');
  assert.match(mail.text, /הכנסות \(1\):\n• 30\/10\/2026 · ארגון שוב״ל · סמינר צוות · 19\/10\/2026 · 27,310 ₪ · חשבונית 1042 · שולם\nסה״כ הכנסות לפני מע״מ: 27,310 ₪/);
  assert.match(mail.text, /חסרות עדיין 1 חשבוניות מספקים/);
});
