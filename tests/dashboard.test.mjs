import { test } from 'node:test';
import assert from 'node:assert/strict';

const today = '2026-09-29';
const load = () => import('../js/logic/dashboard.js');

const cases = [
  { id: 'c1', client: 'שוב״ל', kind: 'כנס', date: '2026-10-18', place: 'שפיים', status: 'נסגר', created: '2026-09-20' },
  { id: 'c2', client: 'ברטלסמן', kind: 'משלחת', date: '2026-11-19', status: 'נסגר', created: '2026-09-21' },
  { id: 'c3', client: 'לקוח חדש', kind: 'יום גיבוש', date: '2026-10-05', status: 'פנייה', created: '2026-09-27' },
  { id: 'c4', client: 'ישן', kind: 'כנס', date: '2026-08-01', status: 'בוצע', created: '2026-07-01' },
  { id: 'c5', client: 'ירד', kind: 'כנס', date: '2026-10-02', status: 'ירד', created: '2026-09-01' },
  { id: 'c6', client: 'מחר', kind: 'סיור', date: '2026-09-30', status: 'הצעה נשלחה', created: '2026-09-25' }
];
const tasks = [
  { id: 't1', title: 'late', due: '2026-09-26', status: 'open', who: 'ארבל' },
  { id: 't2', title: 'today', due: '2026-09-29', time: '10:30', status: 'open' },
  { id: 't3', title: 'week', due: '2026-10-03', status: 'sent' },
  { id: 't4', title: 'later', due: '2026-10-20', status: 'open' },
  { id: 't5', title: 'done', due: '2026-09-29', status: 'done' },
  { id: 't6', title: 'nodate', status: 'open' }
];
const calls = [
  { id: 'k1', name: 'מאירי', status: 'todo', created: '2026-09-28' },
  { id: 'k2', name: 'ענה', status: 'answered' },
  { id: 'k3', name: 'לחזור מחר', status: 'callback', callbackAt: '2026-09-30' }
];
const payments = [
  { id: 'p1', caseId: 'c1', amount: 10000, status: 'חשבונית יצאה', due: '2026-09-20' },
  { id: 'p2', caseId: 'c1', amount: 5000, status: 'שולם' },
  { id: 'p3', caseId: 'c2', amount: '2,500', status: 'לגבות', due: '2026-10-30' },
  { id: 'p4', caseId: 'c4', amount: 7000, status: 'חשבונית יצאה', client: 'ישן' },
  { id: 'p5', caseId: 'c2', amount: '', status: 'חשבונית יצאה' }
];
const quotes = [
  { id: 'q1', no: '2026-01', caseId: 'c6', status: 'נשלחה', sentAt: '2026-09-24' },
  { id: 'q2', no: '2026-02', caseId: 'c1', status: 'אושרה' },
  { id: 'q3', no: '2026-03', caseId: 'c3', status: 'טיוטה' }
];
const links = [
  { id: 'l1', caseId: 'c2', supplier: 'גרשון טורס', status: 'ביקשנו הצעה', askedAt: '2026-09-25' },
  { id: 'l2', caseId: 'c2', supplier: 'יד ושם', status: 'ביקשנו הצעה', askedAt: '2026-09-28' },
  { id: 'l3', caseId: 'c2', supplier: 'ענה', status: 'ביקשנו הצעה', askedAt: '2026-09-20', answeredAt: '2026-09-22' },
  { id: 'l4', caseId: 'c4', supplier: 'אירוע ישן', status: 'ביקשנו הצעה', askedAt: '2026-07-01' },
  { id: 'l5', caseId: 'c1', supplier: 'אושר', status: 'אושר' }
];
const data = { cases, tasks, calls, payments, quotes, links };

test('open events: active cases from today on, soonest first, with the next one', async () => {
  const { openEvents, dashboardData } = await load();
  const ev = openEvents(cases, today);
  assert.deepEqual(ev.map(c => c.id), ['c6', 'c3', 'c1', 'c2']);
  assert.equal(ev[0].inDays, 1);
  const d = dashboardData(data, today);
  assert.equal(d.events.count, 4);
  assert.equal(d.events.next.id, 'c6');
});

test('tasks: overdue, today and this week are counted; done and undated are not', async () => {
  const { taskBuckets, dashboardData } = await load();
  const b = taskBuckets(tasks, today);
  assert.deepEqual(b.overdue.map(t => t.id), ['t1']);
  assert.deepEqual(b.today.map(t => t.id), ['t2']);
  assert.deepEqual(b.week.map(t => t.id), ['t3']);
  const d = dashboardData(data, today);
  assert.deepEqual(d.tasks, { overdue: 1, today: 1, week: 1, open: 5 });
});

test('calls to make now exclude answered and callbacks scheduled for later', async () => {
  const { dashboardData } = await load();
  const d = dashboardData(data, today);
  assert.equal(d.calls.count, 1);
  assert.equal(d.calls.scheduled, 1);
});

test('money: invoices issued and not paid, total and count, amounts read as text too', async () => {
  const { unpaidInvoices } = await load();
  const m = unpaidInvoices(payments, cases);
  assert.equal(m.count, 2);
  assert.equal(m.total, 17000);
  assert.equal(m.list.find(p => p.id === 'p1').client, 'שוב״ל');
  assert.equal(m.list.find(p => p.id === 'p4').client, 'ישן');
});

test('quotes waiting for an answer: only the sent ones, with days waited and the client name from the case', async () => {
  const { quotesWaiting } = await load();
  const q = quotesWaiting(quotes, cases, today);
  assert.deepEqual(q.map(x => x.id), ['q1']);
  assert.equal(q[0].waited, 5);
  assert.equal(q[0].client, 'מחר');
});

test('silent suppliers: asked more than two days ago, no answer, on an open event only', async () => {
  const { silentSuppliers } = await load();
  const s = silentSuppliers(links, cases, today);
  assert.deepEqual(s.map(l => l.id), ['l1']);
  assert.equal(s[0].waited, 4);
  assert.equal(s[0].client, 'ברטלסמן');
  assert.deepEqual(silentSuppliers(links, cases, today, 0).map(l => l.id), ['l1', 'l2']);
});

test('new leads are the cases still at the first status, newest first', async () => {
  const { newLeads } = await load();
  assert.deepEqual(newLeads(cases.concat([{ id: 'c7', client: 'בלי סטטוס', created: '2026-09-28' }])).map(c => c.id), ['c7', 'c3']);
});

test('next 14 days: events and dated open tasks in one list, by date, events before tasks on the same day', async () => {
  const { nextDays } = await load();
  const n = nextDays(cases, tasks, today);
  assert.deepEqual(n.map(x => x.type + ':' + x.id), ['task:t2', 'event:c6', 'task:t3', 'event:c3']);
  assert.equal(n[1].inDays, 1);
  assert.equal(n[0].time, '10:30');
  const sameDay = nextDays([{ id: 'e', client: 'x', date: '2026-09-29', status: 'נסגר' }], [{ id: 't', title: 'y', due: '2026-09-29', status: 'open' }], today);
  assert.deepEqual(sameDay.map(x => x.type), ['event', 'task']);
  assert.equal(nextDays(cases, tasks, today, 0).length, 1);
});

test('money by event: planned, invoiced and paid per open event that has payments', async () => {
  const { moneyByEvent } = await load();
  const rows = moneyByEvent(cases, payments);
  assert.deepEqual(rows.map(r => r.caseId), ['c1', 'c2']);
  const c1 = rows[0];
  assert.equal(c1.planned, 15000); assert.equal(c1.paid, 5000); assert.equal(c1.invoiced, 10000); assert.equal(c1.open, 10000); assert.equal(c1.pct, 33);
  assert.equal(rows[1].planned, 2500);
});

test('what to do now: three items, the event tomorrow first, then the overdue task, then the overdue invoice', async () => {
  const { whatNow } = await load();
  const now = whatNow(data, today);
  assert.equal(now.length, 3);
  assert.deepEqual(now.map(x => x.kind), ['event', 'taskLate', 'payLate']);
  assert.equal(now[0].href, '#/case/c6');
  assert.equal(now[1].late, 3);
  assert.equal(now[2].late, 9);
  const all = whatNow(data, today, 20);
  assert.ok(all.some(x => x.kind === 'supplierSilent' && x.href === '#/case/c2/suppliers'));
  assert.ok(all.some(x => x.kind === 'call' && x.id === 'k1'));
  assert.ok(all.some(x => x.kind === 'lead' && x.id === 'c3'));
  assert.ok(all.some(x => x.kind === 'quoteWaiting' && x.id === 'q1'));
  assert.ok(!all.some(x => x.kind === 'call' && x.id === 'k3'), 'a callback for tomorrow is not for now');
});

test('what to do now: at most two items of one kind, unless there is nothing else', async () => {
  const { whatNow } = await load();
  const pays = [1, 2, 3].map(i => ({ id: 'p' + i, caseId: 'c1', amount: 1000 * i, status: 'חשבונית יצאה', due: '2026-09-0' + i }));
  const three = whatNow({ cases: [cases[0]], payments: pays, links: [links[0]] }, today);
  assert.deepEqual(three.map(x => x.kind), ['payLate', 'payLate', 'supplierSilent']);
  assert.deepEqual(three.map(x => x.id), ['p1', 'p2', 'l1']);
  const only = whatNow({ cases: [cases[0]], payments: pays }, today);
  assert.deepEqual(only.map(x => x.id), ['p1', 'p2', 'p3']);
});

test('dashboardData copes with empty data', async () => {
  const { dashboardData } = await load();
  const d = dashboardData({}, today);
  assert.equal(d.today, today);
  assert.equal(d.events.count, 0); assert.equal(d.events.next, null);
  assert.equal(d.money.total, 0); assert.equal(d.now.length, 0); assert.equal(d.next.length, 0); assert.equal(d.moneyByEvent.length, 0);
});
