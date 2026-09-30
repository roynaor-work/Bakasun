import { test } from 'node:test';
import assert from 'node:assert/strict';

const today = '2026-09-30';
const load = () => import('../js/logic/pipeline.js');

const cases = [
  { id: 'c1', client: 'שוב״ל', kind: 'כנס', date: '2026-10-18', place: 'שפיים', phone: '0544974644', status: 'נסגר', created: '2026-08-20T10:00:00Z', opened: '2026-08-20', wonAt: '2026-09-05', leadSource: 'המלצה' },
  { id: 'c2', client: 'ברטלסמן', kind: 'משלחת או סיור', date: '2026-11-19', status: 'נסגר', created: '2026-07-01T10:00:00Z', wonAt: '2026-07-20', leadSource: 'מייל' },
  { id: 'c3', client: 'לקוח חדש', kind: 'יום גיבוש', date: '2026-10-05', status: 'פנייה', created: '2026-09-27T10:00:00Z', leadSource: 'וואטסאפ' },
  { id: 'c4', client: 'ישן', kind: 'כנס', date: '2026-08-01', status: 'בוצע', created: '2026-06-01T10:00:00Z', wonAt: '2026-06-15', doneAt: '2026-08-02', leadSource: 'המלצה' },
  { id: 'c5', client: 'ירד', kind: 'כנס', date: '2026-10-02', status: 'ירד', created: '2026-09-01T10:00:00Z', lostAt: '2026-09-10', leadSource: 'וואטסאפ' },
  { id: 'c6', client: 'מחר', kind: 'חתונה', date: '', status: 'הצעה נשלחה', created: '2026-09-25T10:00:00Z', quotedAt: '2026-09-26' },
  { id: 'c7', client: 'ללא', kind: 'כנס', date: '2026-10-01', status: 'פנייה', created: '2026-09-28T10:00:00Z' }
];
const quotes = [
  { id: 'q1', caseId: 'c1', status: 'אושרה', sentAt: '2026-09-01', lines: [{ item: 'אולם', qty: 1, price: 10000 }, { item: 'קייטרינג', qty: 100, price: 150 }], vatRate: 18 },
  { id: 'q2', caseId: 'c2', status: 'נשלחה', sentAt: '2026-07-10', total: 40000 },
  { id: 'q3', caseId: 'c2', status: 'טיוטה', date: '2026-07-01', total: 1 },
  { id: 'q4', caseId: 'c6', status: 'נשלחה', sentAt: '2026-09-26', total: 5000 },
  { id: 'q5', caseId: 'c5', status: 'נדחתה', sentAt: '2026-09-05', total: 7000 }
];
const tasks = [
  { id: 't1', caseId: 'c1', title: 'late', due: '2026-09-20', status: 'open' },
  { id: 't2', caseId: 'c1', title: 'later', due: '2026-10-20', status: 'open' },
  { id: 't3', caseId: 'c1', title: 'done late', due: '2026-09-01', status: 'done' },
  { id: 't4', caseId: 'c3', title: 'today', due: '2026-09-30', status: 'open' }
];
const links = [
  { id: 'l1', caseId: 'c1', supplier: 'מלון', status: 'ביקשנו הצעה', askedAt: '2026-09-20' },
  { id: 'l2', caseId: 'c1', supplier: 'הסעות', status: 'ביקשנו הצעה', askedAt: '2026-09-29' },
  { id: 'l3', caseId: 'c1', supplier: 'צלם', status: 'ביקשנו הצעה', askedAt: '2026-09-01', answeredAt: '2026-09-02' },
  { id: 'l4', caseId: 'c3', supplier: 'אולם', status: 'הצעה התקבלה', askedAt: '2026-09-01' }
];
const payments = [{ id: 'p1', caseId: 'c4', amount: 12000, status: 'שולם' }, { id: 'p2', caseId: 'c4', amount: 3000 }];

test('columns: one per status in order, sorted by date, with count and total', async () => {
  const { columns, ORDER } = await load();
  const cols = columns(cases, quotes, tasks, links, today);
  assert.deepEqual(cols.map(c => c.status), ORDER);
  assert.deepEqual(cols.map(c => c.status), ['פנייה', 'הצעה נשלחה', 'נסגר', 'בוצע', 'ירד']);
  const lead = cols[0];
  assert.equal(lead.count, 2);
  assert.deepEqual(lead.cases.map(c => c.id), ['c7', 'c3']);
  const won = cols[2];
  assert.deepEqual(won.cases.map(c => c.id), ['c1', 'c2']);
  assert.equal(won.total, 25000 + 40000);
  assert.equal(cols[3].count, 1);
  assert.equal(cols[4].cases[0].id, 'c5');
});

test('columns: cards carry quote total, overdue tasks, silent suppliers and days to the event', async () => {
  const { columns } = await load();
  const c1 = columns(cases, quotes, tasks, links, today)[2].cases[0];
  assert.equal(c1.quoteTotal, 25000);
  assert.equal(c1.overdueTasks, 1);
  assert.equal(c1.silentSuppliers, 1);
  assert.equal(c1.daysToEvent, 18);
  const c3 = columns(cases, quotes, tasks, links, today)[0].cases.find(c => c.id === 'c3');
  assert.equal(c3.overdueTasks, 0);
  assert.equal(c3.silentSuppliers, 0);
  assert.equal(c3.quoteTotal, 0);
  const c6 = columns(cases, quotes, tasks, links, today)[1].cases[0];
  assert.equal(c6.daysToEvent, null);
  assert.equal(c6.quoteTotal, 5000);
});

test('caseQuote prefers accepted over sent over draft; rejected only as a last resort', async () => {
  const { caseQuote, quoteTotal } = await load();
  assert.equal(caseQuote(quotes, 'c2').id, 'q2');
  assert.equal(caseQuote(quotes, 'c5').id, 'q5');
  assert.equal(caseQuote(quotes, 'zzz'), null);
  assert.equal(quoteTotal(null), 0);
  assert.equal(quoteTotal({ total: '1,500' }), 1500);
});

test('filterCases: by kind, month (event month or opened month), source and words', async () => {
  const { filterCases } = await load();
  assert.deepEqual(filterCases(cases, { kind: 'כנס' }).map(c => c.id), ['c1', 'c4', 'c5', 'c7']);
  assert.deepEqual(filterCases(cases, { month: '2026-10' }).map(c => c.id), ['c1', 'c3', 'c5', 'c7']);
  assert.deepEqual(filterCases(cases, { month: '2026-09' }).map(c => c.id), ['c6']);
  assert.deepEqual(filterCases(cases, { source: 'וואטסאפ' }).map(c => c.id), ['c3', 'c5']);
  assert.deepEqual(filterCases(cases, { q: 'שפיים' }).map(c => c.id), ['c1']);
  assert.deepEqual(filterCases(cases, { q: '0544' }).map(c => c.id), ['c1']);
  assert.deepEqual(filterCases(cases, { kind: 'כנס', month: '2026-10', q: 'שובל' }).map(c => c.id), ['c1']);
  assert.equal(filterCases(cases, {}).length, cases.length);
});

test('validTransitions: forward and back, never to itself', async () => {
  const { validTransitions, ORDER } = await load();
  assert.deepEqual(validTransitions('פנייה'), ['הצעה נשלחה', 'נסגר', 'ירד']);
  assert.deepEqual(validTransitions('נסגר'), ['הצעה נשלחה', 'בוצע', 'ירד']);
  assert.deepEqual(validTransitions('בוצע'), ['נסגר']);
  assert.ok(validTransitions('ירד').includes('פנייה'));
  ORDER.forEach(s => assert.ok(!validTransitions(s).includes(s)));
  assert.deepEqual(validTransitions('???'), ORDER);
});

test('move: sets the status and the matching date, keeps an earlier date, refuses bad moves', async () => {
  const { move } = await load();
  const lead = { id: 'x', status: 'פנייה', created: '2026-09-01' };
  assert.deepEqual(move(lead, 'נסגר', today), { id: 'x', status: 'נסגר', wonAt: today });
  assert.deepEqual(move(lead, 'ירד', today), { id: 'x', status: 'ירד', lostAt: today });
  assert.deepEqual(move(lead, 'הצעה נשלחה', today), { id: 'x', status: 'הצעה נשלחה', quotedAt: today, waitingSince: '' });
  const won = { id: 'y', status: 'נסגר', wonAt: '2026-09-05' };
  assert.deepEqual(move(won, 'בוצע', today), { id: 'y', status: 'בוצע', doneAt: today });
  const wonNoDate = { id: 'z', status: 'נסגר' };
  assert.deepEqual(move(wonNoDate, 'בוצע', today), { id: 'z', status: 'בוצע', doneAt: today, wonAt: today });
  assert.equal(move(lead, 'בוצע', today), null);
  assert.equal(move(lead, 'פנייה', today), null);
  assert.equal(move(null, 'נסגר', today), null);
  assert.equal(move(won, 'הצעה נשלחה', today).wonAt, undefined);
  assert.equal(move(lead, 'נסגר', new Date(2026, 0, 2)).wonAt, '2026-01-02');
});

test('sources: known order first, then others, with counts', async () => {
  const { sources } = await load();
  const s = sources(cases.concat([{ id: 'c8', leadSource: 'כנס תעשייה' }, { id: 'c9', leadSource: ' ' }]));
  assert.deepEqual(s, [{ source: 'וואטסאפ', count: 2 }, { source: 'מייל', count: 1 }, { source: 'המלצה', count: 2 }, { source: 'כנס תעשייה', count: 1 }]);
  assert.deepEqual(sources([]), []);
});

test('lastMonths and monthKey', async () => {
  const { lastMonths, monthKey } = await load();
  const m = lastMonths(today, 12);
  assert.equal(m.length, 12);
  assert.equal(m[0], '2025-10');
  assert.equal(m[11], '2026-09');
  assert.equal(lastMonths('2026-01-15', 3).join(','), '2025-11,2025-12,2026-01');
  assert.equal(monthKey('2026-08-20T10:00:00Z'), '2026-08');
  assert.equal(monthKey(''), '');
});

test('stats: monthly rows, conversion, average days, revenue in the event month', async () => {
  const { stats } = await load();
  const s = stats(cases, quotes, payments, today);
  assert.equal(s.months.length, 12);
  const m = Object.fromEntries(s.months.map(r => [r.month, r]));
  assert.equal(m['2026-09'].leads, 4);           // c3, c5, c6, c7 opened in September
  assert.equal(m['2026-08'].leads, 1);           // c1
  assert.equal(m['2026-09'].won, 1);             // c1 won 05/09
  assert.equal(m['2026-09'].lost, 1);            // c5
  assert.equal(m['2026-09'].conversion, 50);
  assert.equal(m['2026-09'].avgDays, 16);        // c1: 20/08 -> 05/09
  assert.equal(m['2026-09'].quoted, 3);          // q1 sent 01/09 (c1), c6 quoted 26/09, c5 quoted 05/09 then dropped
  assert.equal(m['2026-09'].revenue, 25000);     // c1, won in September
  assert.equal(m['2026-07'].revenue, 40000);     // c2
  assert.equal(m['2026-06'].revenue, 15000);     // c4: no quote, payments 12000 + 3000
  assert.equal(m['2026-10'], undefined);         // the window ends with the current month
  assert.equal(m['2026-08'].done, 1);
  assert.equal(m['2026-07'].won, 1);
  assert.equal(m['2026-07'].conversion, 100);
  assert.equal(m['2026-05'].conversion, null);
  assert.equal(m['2026-05'].avgDays, null);
});

test('stats: totals, funnel, by kind, by source and the best month', async () => {
  const { stats } = await load();
  const s = stats(cases, quotes, payments, today);
  assert.deepEqual(s.funnel, { leads: 7, quoted: 5, won: 3, done: 1, lost: 1 });
  assert.equal(s.totals.leads, 7);
  assert.equal(s.totals.won, 3);
  assert.equal(s.totals.conversion, 75);
  assert.equal(s.totals.revenue, 80000);
  const kinds = Object.fromEntries(s.byKind.map(r => [r.kind, r]));
  assert.equal(s.byKind[0].kind, 'כנס');
  assert.equal(kinds['כנס'].leads, 4);
  assert.equal(kinds['כנס'].won, 2);
  assert.equal(kinds['כנס'].lost, 1);
  assert.equal(kinds['כנס'].conversion, 67);
  assert.equal(kinds['כנס'].revenue, 40000);
  const src = Object.fromEntries(s.bySource.map(r => [r.source, r]));
  assert.equal(src['המלצה'].won, 2);
  assert.equal(src['המלצה'].revenue, 40000);
  assert.equal(src['וואטסאפ'].lost, 1);
  assert.equal(src[''].leads, 2);
  assert.deepEqual(s.best, { month: '2026-07', revenue: 40000, won: 1 });
  assert.equal(stats([], [], [], today).best, null);
  assert.equal(stats([], [], [], today, 3).months.length, 3);
});
