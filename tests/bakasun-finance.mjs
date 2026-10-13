import { test } from 'node:test';
import assert from 'node:assert/strict';
import Office from '../js/logic/office.js';
import { linesFromCase, summary } from '../js/logic/budget.js';
import { resolveLines } from '../js/logic/quotes.js';
import { contractFromCase } from '../js/logic/contracts.js';
import { quoteTotal } from '../js/logic/pipeline.js';
import { monthReport } from '../js/logic/money.js';

// All records are synthetic. Each active characterization has a skipped regression
// for the desired fix; remove its skip only when the application is fixed.
const cs = { id: 'b3-case', clientId: 'b3-client', client: 'ארגון בדיקה', kind: 'כנס', status: Office.STATUS.won };
const supplier = { id: 'b3-supplier', name: 'ספק בדיקה', type: 'קייטרינג ושפים' };
const quote = { id: 'b3-quote', caseId: cs.id, status: 'אושרה', vatRate: 0, defaultMargin: 25,
  lines: [{ item: 'ארוחה', supplierId: supplier.id, qty: 40, cost: 150, price: 200 }] };
const link = { id: 'b3-link', caseId: cs.id, supplierId: supplier.id, status: 'אושר', cost: 6000 };
const imported = () => linesFromCase(cs, [link], [quote], [supplier]);

test('B3-F01 current: total supplier cost becomes a unit cost and is multiplied by 40', () => {
  assert.equal(summary(imported(), [], 18).totalCost, 240000);
  assert.equal(Office.quoteTotals(quote.lines, 18).cost, 6000);
});
test('B3-F01 fix: importing the event preserves its total supplier cost',
  { skip: 'B3-F01: linesFromCase replaces qty but keeps the link total as cost per unit.' }, () => {
    assert.equal(summary(imported(), [], 18).totalCost, 6000);
  });

const multiQuote = { ...quote, lines: [
  { item: 'ארוחה', supplierId: supplier.id, qty: 40, cost: 150, price: 200 },
  { item: 'כיבוד', supplierId: supplier.id, qty: 40, cost: 20, price: 30 }
] };
test('B3-F02 current: two quote items from one supplier lose the second item in the budget', () => {
  const lines = linesFromCase(cs, [], [multiQuote], [supplier]);
  assert.equal(lines.length, 1);
  assert.equal(summary(lines, [], 18).clientPrice, 8000);
  assert.equal(Office.quoteTotals(multiQuote.lines, 18).net, 9200);
});
test('B3-F02 fix: budget import preserves all quote items',
  { skip: 'B3-F02: candidates are matched only by supplier, and an existing price suppresses subsequent items.' }, () => {
    assert.equal(summary(linesFromCase(cs, [], [multiQuote], [supplier]), [], 18).clientPrice, 9200);
  });

const currencyLinks = ['ILS', 'EUR'].map((currency, i) => ({ ...link, id: 'b3-currency-' + i, cost: 100,
  paid: 'כן', paidAt: '2026-10-12', offer: { total: 100, currency, vatPct: 18 } }));
test('B3-F03 current: monthly report combines 100 ILS and 100 EUR into the same 200 total', () => {
  const report = monthReport([], currencyLinks, [cs], [supplier], '2026-10');
  assert.equal(report.totalOut, 200);
  assert.ok(report.supplierRows.every(row => !Object.hasOwn(row, 'currency')));
});
test('B3-F03 fix: monthly report never adds different currencies into one total',
  { skip: 'B3-F03: monthReport drops offer.currency and sums every supplier cost; totals need a currency breakdown.' }, () => {
    const report = monthReport([], currencyLinks, [cs], [supplier], '2026-10');
    assert.deepEqual(report.supplierRows.map(row => row.currency), ['ILS', 'EUR']);
  });

test('B3-F04 current: the generic money parser drops a French decimal comma', () => {
  assert.equal(Office.num('1 234,56'), 123456);
});
test('B3-F04 fix: French decimal amounts preserve cents',
  { skip: 'B3-F04: Office.num removes every comma; RFQ has its own correct parser but other flows do not.' }, () => {
    assert.equal(Office.num('1 234,56'), 1234.56);
  });

test('B3-F05 current: the new contract ignores the quote VAT rate and uses settings', () => {
  assert.equal(contractFromCase(cs, {}, quote, { vat: 18 }).vatRate, 18);
  assert.equal(Office.quoteTotals(quote.lines, quote.vatRate).gross, 8000);
});
test('B3-F05 fix: a contract priced from a quote preserves that quote VAT rate',
  { skip: 'B3-F05: contractFromCase takes price from quote and vatRate from settings.' }, () => {
    assert.equal(contractFromCase(cs, {}, quote, { vat: 18 }).vatRate, quote.vatRate);
  });

test('B3-F06 current: client history sees zero revenue for a quote saved as lines', () => {
  assert.equal(Office.clientHistory(cs.clientId, [cs], [quote]).totalNet, 0);
});
test('B3-F06 fix: client history computes the accepted quote total from its lines',
  { skip: 'B3-F06: clientHistory reads q.net, which the quote editor does not save.' }, () => {
    assert.equal(Office.clientHistory(cs.clientId, [cs], [quote]).totalNet, 8000);
  });

const autoPrice = { ...quote, lines: [{ item: 'בדיקה', qty: 1, cost: 100, price: '', margin: '' }] };
test('B3-F07 current: the board reports zero for a quote using cost plus default markup', () => {
  assert.equal(Office.quoteTotals(resolveLines(autoPrice.lines, autoPrice.defaultMargin), 18).net, 125);
  assert.equal(quoteTotal(autoPrice), 0);
});
test('B3-F07 fix: the board and the quote editor agree on automatic prices',
  { skip: 'B3-F07: pipeline.quoteTotal does not call resolveLines before quoteTotals.' }, () => {
    assert.equal(quoteTotal(autoPrice), 125);
  });

test('B3-F08 current: quote numbering wraps after 999 and can reuse BS-2026-000', () => {
  assert.equal(Office.nextQuoteNo(['BS-2026-999', 'BS-2026-000'], '2026-10-13'), 'BS-2026-000');
});
test('B3-F08 fix: quote sequence continues beyond three digits',
  { skip: 'B3-F08: nextQuoteNo slices the last three characters instead of padding the whole sequence.' }, () => {
    assert.equal(Office.nextQuoteNo(['BS-2026-999'], '2026-10-13'), 'BS-2026-1000');
  });

test('B3-F09 current: one payment is counted as income in both its invoice and payment months', () => {
  const payment = { amount: 1000, status: Office.PAY.paid, invoicedAt: '2026-09-30', paidAt: '2026-10-10' };
  assert.equal(monthReport([payment], [], [], [], '2026-09').totalIn, 1000);
  assert.equal(monthReport([payment], [], [], [], '2026-10').totalIn, 1000);
});
test('B3-F09 fix: cash income counts the payment only in the paid month',
  { skip: 'B3-F09: report uses invoicedAt OR paidAt but labels their sum income; separate invoices and receipts or choose a basis.' }, () => {
    const payment = { amount: 1000, status: Office.PAY.paid, invoicedAt: '2026-09-30', paidAt: '2026-10-10' };
    assert.equal(monthReport([payment], [], [], [], '2026-09').totalIn, 0);
  });
