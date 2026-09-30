import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, LINE_STATUS, categoryOf, costOf, priceOf, plannedOf, paidOf, lineKey, latestQuote, linesFromCase, mergeLines, summary, paymentSchedule, attachPaymentsToCases, overviewRows, invoiceAskText } from '../js/logic/budget.js';
import { parseInvoiceRequest } from '../js/logic/commands.js';
import { hasArabic } from '../js/logic/core.js';
import { BUDGET } from '../js/i18n/budget.js';

const cs = { id: 'k1', client: 'ארגון שוב״ל', kind: 'כנס', date: '2026-10-18', status: 'נסגר', budget: '40000' };
const sups = [{ id: 's1', name: 'מלון שפיים', type: 'מקום לאירוע', phone: '0501111111' }, { id: 's2', name: 'ביסקוטי', type: 'קייטרינג ושפים' }, { id: 's3', name: 'גרשון טורס', type: 'הסעות' }];
const links = [
  { id: 'l1', caseId: 'k1', supplierId: 's1', supplier: 'מלון שפיים', status: 'אושר', what: 'גן שפיים, מפגש הכפר', cost: 12000 },
  { id: 'l2', caseId: 'k1', supplierId: 's2', supplier: 'ביסקוטי', status: 'הצעה התקבלה', what: 'כיבוד ל-100', cost: 4500 },
  { id: 'l3', caseId: 'k1', supplierId: 's3', supplier: 'גרשון טורס', status: 'ביקשנו הצעה', what: 'אוטובוס' },
  { id: 'l4', caseId: 'k1', supplierId: 's3', supplier: 'גרשון טורס', status: 'בוטל', what: 'אוטובוס', cost: 2000 },
  { id: 'l9', caseId: 'k2', supplierId: 's1', status: 'אושר', cost: 999 }
];
const quotes = [
  { id: 'q1', caseId: 'k1', status: 'טיוטה', created: '2026-09-01', defaultMargin: 20, lines: [{ item: 'מקום לאירוע', supplierId: 's1', cost: 12000, price: 15000, qty: 1, days: 1 }] },
  { id: 'q2', caseId: 'k1', status: 'נשלחה', created: '2026-09-20', defaultMargin: 25, lines: [
    { item: 'מקום לאירוע', supplierId: 's1', cost: 12000, price: 14400, qty: 1, days: 1, section: 'מקום' },
    { item: 'כיבוד קל', supplierId: 's2', cost: 4500, margin: '', price: '', qty: 1, days: 1, unit: 'משתתף', section: 'אוכל' },
    { item: 'ניהול והפקת האירוע', cost: '', price: 7000, qty: 1, days: 1, section: 'הפקה' },
    { item: 'תגי שם', cost: 300, price: 450, qty: 100, days: 1, unit: 'יחידה' }
  ] },
  { id: 'q3', caseId: 'k1', status: 'נדחתה', created: '2026-09-25', lines: [{ item: 'משהו', price: 1 }] }
];

test('categories: the eleven of the brief, and a guess from supplier type, section or words', () => {
  assert.equal(CATEGORIES.length, 11); assert.ok(CATEGORIES.includes('הפקה'));
  assert.equal(categoryOf('מלונות', '', ''), 'לינה'); assert.equal(categoryOf('', 'אוכל', ''), 'קייטרינג'); assert.equal(categoryOf('', '', 'ניהול והפקת האירוע'), 'הפקה');
  assert.equal(categoryOf('', '', 'אוטובוס 50 מקומות'), 'הסעות'); assert.equal(categoryOf('', '', 'דבר לא ידוע'), 'אחר');
});

test('per line: quantity multiplies, the estimate stands in for a missing cost', () => {
  assert.equal(costOf({ cost: 100, qty: 3 }), 300); assert.equal(costOf({ planned: 80, qty: 2 }), 160); assert.equal(costOf({ cost: '', planned: '' }), 0);
  assert.equal(plannedOf({ planned: 50, cost: 70 }), 50); assert.equal(plannedOf({ cost: 70 }), 70);
  assert.equal(priceOf({ price: '1,200', qty: '' }), 1200);
  assert.equal(paidOf({ cost: 500, status: LINE_STATUS.paid }), 500); assert.equal(paidOf({ cost: 500, status: LINE_STATUS.paid, paidAmount: 200 }), 200); assert.equal(paidOf({ cost: 500, status: 'approved' }), 0);
  assert.equal(lineKey({ supplierId: 's1', item: 'x' }), 'sup:s1'); assert.equal(lineKey({ item: 'תגי  שם' }), lineKey({ item: 'תגי שם' }));
});

test('the latest quote: the accepted one wins, a rejected one never counts', () => {
  assert.equal(latestQuote(quotes, 'k1').id, 'q2');
  assert.equal(latestQuote(quotes.concat([{ id: 'q4', caseId: 'k1', status: 'אושרה', created: '2026-08-01', lines: [] }]), 'k1').id, 'q4');
  assert.equal(latestQuote(quotes, 'k7'), null);
});

test('lines from the case: approved and received links give the cost, the quote gives the price, one line per supplier', () => {
  const ls = linesFromCase(cs, links, quotes, sups);
  assert.deepEqual(ls.map(l => l.item), ['גן שפיים, מפגש הכפר', 'כיבוד ל-100', 'ניהול והפקת האירוע', 'תגי שם']);
  const venue = ls[0]; assert.equal(venue.cost, 12000); assert.equal(venue.price, 14400); assert.equal(venue.status, 'approved'); assert.equal(venue.category, 'מקום'); assert.equal(venue.linkId, 'l1');
  const food = ls[1]; assert.equal(food.cost, 4500); assert.equal(food.price, 5625); assert.equal(food.status, 'quoted'); assert.equal(food.category, 'קייטרינג'); assert.equal(food.unit, 'משתתף');
  const fee = ls[2]; assert.equal(fee.category, 'הפקה'); assert.equal(fee.cost, ''); assert.equal(fee.price, 7000); assert.equal(fee.status, 'estimate');
  const tags = ls[3]; assert.equal(tags.qty, 100); assert.equal(tags.price, 450); assert.equal(tags.cost, 300); assert.equal(tags.category, 'דפוס ומיתוג');
  assert.ok(ls.every(l => l.caseId === 'k1'));
  // a paid, approved link becomes a paid line
  const paid = linesFromCase(cs, [{ id: 'l1', caseId: 'k1', supplierId: 's1', status: 'אושר', cost: 12000, paid: 'כן', paidAt: '2026-10-20' }], [], sups)[0];
  assert.equal(paid.status, 'paid'); assert.equal(paid.paidAt, '2026-10-20'); assert.equal(paid.paidAmount, 12000);
});

test('refresh never overwrites what she typed: only missing lines are added and only empty numbers are filled', () => {
  const existing = [
    { id: 'b1', caseId: 'k1', supplierId: 's1', item: 'מקום', cost: 11000, price: 13000, status: 'approved', category: 'מקום' },
    { id: 'b2', caseId: 'k1', supplierId: 's2', item: 'כיבוד', cost: '', price: '', status: 'estimate', category: 'קייטרינג' },
    { id: 'b3', caseId: 'k1', supplierId: '', item: 'תגי שם', cost: 250, price: 400, qty: 100, status: 'estimate', category: 'דפוס ומיתוג' }
  ];
  const { add, update } = mergeLines(existing, linesFromCase(cs, links, quotes, sups));
  assert.deepEqual(add.map(l => l.item), ['ניהול והפקת האירוע']);
  // the venue line kept her 11000 / 13000 and only gained the link reference; the name tags kept 250 / 400 and gained a unit
  assert.deepEqual(update, [{ id: 'b1', linkId: 'l1' }, { id: 'b2', cost: 4500, price: 5625, linkId: 'l2', unit: 'משתתף', status: 'quoted' }, { id: 'b3', unit: 'יחידה' }]);
  assert.ok(!update.some(u => 'cost' in u && u.id !== 'b2')); assert.ok(!update.some(u => 'price' in u && u.id !== 'b2'));
  // a second refresh with everything in place changes nothing
  const after = existing.concat(add.map((l, i) => Object.assign({ id: 'n' + i }, l)));
  update.forEach(u => Object.assign(after.find(l => l.id === u.id), u));
  const again = mergeLines(after, linesFromCase(cs, links, quotes, sups));
  assert.equal(again.add.length, 0); assert.equal(again.update.length, 0);
  // a status she moved forward by hand is not moved back
  const m = mergeLines([{ id: 'x', supplierId: 's2', item: 'כיבוד', cost: 4500, price: 5000, status: 'paid' }], linesFromCase(cs, links, quotes, sups));
  assert.ok(!m.update.some(u => u.id === 'x' && u.status));
});

test('summary: costs, price, margin, client money, supplier money, categories and VAT once', () => {
  const lines = [
    { id: 'b1', category: 'מקום', item: 'אולם', cost: 12000, price: 14400, status: 'approved', dueDate: '2026-10-10' },
    { id: 'b2', category: 'קייטרינג', item: 'כיבוד', planned: 4000, cost: 4500, price: 5625, status: 'quoted' },
    { id: 'b3', category: 'הפקה', item: 'דמי הפקה', cost: '', price: 7000, status: 'estimate' },
    { id: 'b4', category: 'דפוס ומיתוג', item: 'תגי שם', cost: 3, price: 4.5, qty: 100, status: 'paid', paidAt: '2026-09-20' }
  ];
  const pays = [
    { id: 'p1', caseId: 'k1', amount: 10000, status: 'שולם', paidAt: '2026-09-15', due: '2026-09-15' },
    { id: 'p2', caseId: 'k1', amount: 12000, status: 'חשבונית יצאה', due: '2026-10-25' },
    { id: 'p3', caseId: 'k1', amount: 5475, status: 'לגבות', due: '2026-11-01' }
  ];
  const sm = summary(lines, pays, 18, cs, '2026-10-01');
  assert.equal(sm.totalCost, 16800); assert.equal(sm.plannedCost, 16300); assert.equal(sm.agreedCost, 12300);
  assert.equal(sm.clientPrice, 27475); assert.equal(sm.margin, 10675); assert.equal(sm.marginPct, 38.9);
  assert.equal(sm.received, 10000); assert.equal(sm.invoiced, 22000); assert.equal(sm.scheduled, 27475); assert.equal(sm.open, 17475);
  assert.equal(sm.supplierPaid, 300); assert.equal(sm.supplierDue, 16500);
  assert.equal(sm.vatRate, 18); assert.equal(sm.vat, 4945.5); assert.equal(sm.gross, 32420.5);
  assert.deepEqual(sm.byCategory.map(c => [c.category, c.cost, c.price, c.margin, c.count]), [['מקום', 12000, 14400, 2400, 1], ['קייטרינג', 4500, 5625, 1125, 1], ['דפוס ומיתוג', 300, 450, 150, 1], ['הפקה', 0, 7000, 7000, 1]]);
  // the venue is due 10/10 and by then only 10,000 came in: 2,000 short
  assert.deepEqual(sm.warnings, [{ code: 'supplierBeforeClient', item: 'אולם', date: '2026-10-10', amount: 2000 }]);
  assert.equal(summary([], [], '', cs).vatRate, 18); assert.equal(summary(lines, pays, 17).vat, 4670.75);
});

test('warnings: cost above price, no fee line, loss, low margin, over the client budget, unpaid after the event', () => {
  const codes = w => w.warnings.map(x => x.code);
  const w1 = summary([{ category: 'מקום', item: 'אולם', cost: 5000, price: 4000, status: 'approved' }], [], 18, { budget: '3000', date: '2026-01-01' }, '2026-02-01');
  assert.deepEqual(codes(w1), ['costAbovePrice', 'noFee', 'negativeMargin', 'overClientBudget', 'unpaidAfterEvent']);
  assert.equal(w1.warnings[0].item, 'אולם'); assert.equal(w1.warnings[2].amount, 1000); assert.equal(w1.warnings[3].budget, 3000); assert.equal(w1.warnings[4].amount, 4000);
  const w2 = summary([{ category: 'מקום', cost: 950, price: 1000 }, { category: 'הפקה', price: 0 }], [], 18);
  assert.deepEqual(codes(w2), ['lowMargin']); assert.equal(w2.warnings[0].pct, 5);
  const w3 = summary([{ category: 'מקום', cost: 800, price: 1000 }, { category: 'הפקה', price: 500 }], [{ amount: 1500, status: 'שולם' }], 18, { date: '2026-01-01' }, '2026-02-01');
  assert.deepEqual(codes(w3), []);
  assert.deepEqual(codes(summary([], [], 18)), []);
});

test('payment schedule: client and supplier by date, overdue marked, running balance, undated last', () => {
  const lines = [
    { id: 'b1', category: 'מקום', item: 'אולם', cost: 12000, status: 'approved', dueDate: '2026-10-10' },
    { id: 'b2', category: 'קייטרינג', item: 'כיבוד', cost: 4500, status: 'paid', paidAt: '2026-09-25' },
    { id: 'b3', category: 'הפקה', item: 'דמי הפקה', price: 7000 },
    { id: 'b4', category: 'הסעות', item: 'אוטובוס', cost: 2000, status: 'approved' }
  ];
  const pays = [{ id: 'p1', amount: 10000, status: 'שולם', paidAt: '2026-09-15', due: '2026-09-10' }, { id: 'p2', amount: 12000, status: 'לגבות', due: '2026-09-28', note: 'מקדמה' }, { id: 'p3', amount: 5000, status: 'לגבות', due: '' }];
  const sch = paymentSchedule(lines, pays, cs, '2026-10-01');
  assert.deepEqual(sch.map(r => [r.kind, r.date, r.amount, r.paid, r.overdue, r.balance]), [
    ['client', '2026-09-15', 10000, true, false, 10000], ['supplier', '2026-09-25', 4500, true, false, 5500], ['client', '2026-09-28', 12000, false, true, 17500],
    ['supplier', '2026-10-10', 12000, false, false, 5500], ['client', '', 5000, false, false, 10500]]);
  assert.equal(sch[2].label, 'מקדמה'); assert.equal(sch[3].label, 'אולם'); assert.equal(sch[0].label, 'ארגון שוב״ל');
});

test('payments without a case go to the case whose client matches and whose date is closest', () => {
  const cases = [
    { id: 'k1', client: 'ארגון שוב״ל', date: '2026-10-18', clientId: 'c1' }, { id: 'k2', client: 'ארגון שוב״ל', date: '2026-10-19', clientId: 'c1' },
    { id: 'k3', client: 'Bertelsmann Stiftung', date: '2026-11-19', clientId: 'c2' }, { id: 'k4', client: 'WeRIsrael', date: '2026-08-20', clientId: 'c3' }
  ];
  const pays = [
    { id: 'p1', client: 'קומיוניטי', note: 'מפגש (עבור שוב״ל)', due: '2026-09-15' },
    { id: 'p2', client: 'WeRIsrael', note: 'מקדמה J50', due: '2026-08-02' },
    { id: 'p3', client: 'Bertelsmann', note: '', due: '2026-11-25' },
    { id: 'p4', client: 'מעוז', note: 'חשבונית לעמותת מעוז', due: '2026-01-10' },
    { id: 'p5', client: 'קומיוניטי', note: 'כנס גורדוניה (עבור שוב״ל)', due: '2026-04-11' },
    { id: 'p6', client: 'ארגון שוב״ל', note: '', due: '2026-10-19', caseId: 'k1' },
    { id: 'p7', client: '', clientId: 'c2', note: '', due: '' }
  ];
  const patches = attachPaymentsToCases(pays, cases);
  assert.deepEqual(patches, [{ id: 'p1', caseId: 'k1' }, { id: 'p2', caseId: 'k4' }, { id: 'p3', caseId: 'k3' }, { id: 'p7', caseId: 'k3' }]);
  // p4: no such client. p5: too far in time (default 180 days). p6: already attached. A second run on the patched list is a no-op.
  const patched = pays.map(p => { const x = patches.find(q => q.id === p.id); return x ? Object.assign({}, p, { caseId: x.caseId }) : p; });
  assert.deepEqual(attachPaymentsToCases(patched, cases), []);
  assert.deepEqual(attachPaymentsToCases([pays[4]], cases, { maxDays: 400 }), [{ id: 'p5', caseId: 'k1' }]);
  assert.deepEqual(attachPaymentsToCases([], cases), []);
});

test('overview: active events only, totals, sort by date or margin, both directions', () => {
  const cases = [{ id: 'k1', client: 'א', date: '2026-10-18', status: 'נסגר' }, { id: 'k2', client: 'ב', date: '2026-09-01', status: 'פנייה' }, { id: 'k3', client: 'ג', date: '2026-08-01', status: 'ירד' }];
  const lines = [{ caseId: 'k1', category: 'מקום', cost: 1000, price: 1500 }, { caseId: 'k2', category: 'הפקה', price: 2000 }, { caseId: 'k2', category: 'מקום', cost: 3000, price: 3000 }, { caseId: 'k3', category: 'מקום', cost: 5, price: 9 }];
  const pays = [{ caseId: 'k1', amount: 500, status: 'שולם' }, { caseId: 'k3', amount: 9, status: 'שולם' }];
  const o = overviewRows(cases, lines, pays, 18, 'date');
  assert.deepEqual(o.rows.map(r => r.id), ['k2', 'k1']);
  assert.deepEqual(o.rows.map(r => [r.cost, r.price, r.margin, r.marginPct, r.received, r.open]), [[3000, 5000, 2000, 40, 0, 5000], [1000, 1500, 500, 33.3, 500, 1000]]);
  assert.deepEqual(o.totals, { cost: 4000, price: 6500, margin: 2500, received: 500, open: 6000, marginPct: 38.5 });
  assert.deepEqual(overviewRows(cases, lines, pays, 18, '-date').rows.map(r => r.id), ['k1', 'k2']);
  assert.deepEqual(overviewRows(cases, lines, pays, 18, 'margin').rows.map(r => r.id), ['k1', 'k2']);
  assert.deepEqual(overviewRows(cases, lines, pays, 18, '-margin').rows.map(r => r.id), ['k2', 'k1']);
});

test('the request to Roy for the open amount is a command the assistant reads back correctly', () => {
  const text = invoiceAskText(cs, 17475.4);
  assert.equal(text, 'רועי, תוציא חשבונית על 17,475 + מע״מ עבור כנס 18/10/2026. לקוח: ארגון שוב״ל');
  const req = parseInvoiceRequest(text, [{ id: 'c1', name: 'ארגון שוב״ל', taxId: '580123456' }]);
  assert.equal(req.client, 'ארגון שוב״ל'); assert.equal(req.total, 17475); assert.equal(req.items[0].desc, 'כנס 18/10/2026'); assert.equal(req.taxId, '580123456');
  const unknown = parseInvoiceRequest(invoiceAskText({ client: 'לקוח חדש בע״מ', kind: 'יום גיבוש', date: '2027-01-05' }, 3000), []);
  assert.equal(unknown.client, 'לקוח חדש בע״מ'); assert.equal(unknown.total, 3000);
});

test('texts: three languages, the same keys, no Arabic letters', () => {
  const keys = Object.keys(BUDGET.he).sort();
  assert.deepEqual(Object.keys(BUDGET.fr).sort(), keys); assert.deepEqual(Object.keys(BUDGET.en).sort(), keys);
  ['he', 'fr', 'en'].forEach(L => Object.values(BUDGET[L]).forEach(v => assert.ok(!hasArabic(v), L + ': ' + v)));
  CATEGORIES.forEach(c => assert.ok(BUDGET.he['bgc_' + c], 'label for ' + c));
  ['costAbovePrice', 'noFee', 'supplierBeforeClient', 'negativeMargin', 'lowMargin', 'overClientBudget', 'unpaidAfterEvent'].forEach(c => assert.ok(BUDGET.en['bgW_' + c], 'warning text ' + c));
});
