import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, weekDays, weekStart, shiftMonth, monthOf, itemsByDay, agenda, dayIso } from '../js/logic/calendarGrid.js';

const TODAY = '2026-09-29'; // a Tuesday

test('the month grid starts on a Sunday, ends on a Saturday and covers the whole month', () => {
  const g = monthGrid('2026-10', TODAY);
  assert.equal(g.month, '2026-10');
  assert.equal(g.first, '2026-10-01'); assert.equal(g.last, '2026-10-31');
  assert.ok(g.weeks.length >= 5 && g.weeks.length <= 6);
  g.weeks.forEach(w => { assert.equal(w.length, 7); assert.equal(w[0].dow, 0); assert.equal(w[6].dow, 6); });
  // 1 October 2026 is a Thursday: four padding days from September before it
  assert.deepEqual(g.weeks[0].slice(0, 5).map(d => d.iso), ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
  assert.equal(g.weeks[0][0].inMonth, false); assert.equal(g.weeks[0][4].inMonth, true);
  const inMonth = g.weeks.flat().filter(d => d.inMonth);
  assert.equal(inMonth.length, 31); assert.equal(inMonth[0].day, 1); assert.equal(inMonth[30].day, 31);
  assert.equal(g.weeks.flat().find(d => d.iso === TODAY).today, true);
  assert.equal(g.weeks.flat().find(d => d.iso === '2026-09-28').past, true);
});

test('month boundaries: February in a leap year, a month that starts on Sunday, December to January', () => {
  const feb = monthGrid('2028-02', TODAY);
  assert.equal(feb.weeks.flat().filter(d => d.inMonth).length, 29);
  assert.equal(feb.last, '2028-02-29');
  const nov = monthGrid('2026-11', TODAY); // 1 November 2026 is a Sunday: no padding before it
  assert.equal(nov.weeks[0][0].iso, '2026-11-01');
  assert.equal(nov.weeks.length, 5);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthOf('2026-10'), '2026-10');
  assert.equal(monthOf('2026-10-15'), '2026-10');
  assert.equal(monthOf('junk', TODAY), '2026-09');
  assert.equal(monthGrid('nonsense', TODAY).month, '2026-09');
});

test('a week runs Sunday to Saturday around any day', () => {
  assert.equal(weekStart(TODAY), '2026-09-27');
  assert.equal(weekStart('2026-09-27'), '2026-09-27');
  const w = weekDays('2026-10-01', TODAY);
  assert.deepEqual(w.map(d => d.iso), ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(w[2].today, true);
});

const DATA = {
  cases: [
    { id: 'c1', client: 'טבע', kind: 'כנס', place: 'הרצליה', date: '2026-10-05', hours: '18:00-23:00', status: 'נסגר' },
    { id: 'c2', client: 'סטרטסיס', date: '05/10/2026', status: 'פנייה' },
    { id: 'c3', client: 'ירד', date: '2026-10-06', status: 'ירד' },
    { id: 'c4', client: 'בלי תאריך', status: 'פנייה' },
    { id: 'c5', client: 'מחוץ לטווח', date: '2026-11-02', status: 'נסגר' }
  ],
  tasks: [
    { id: 't1', title: 'להזמין אוטובוס', who: 'דנה', due: '2026-10-05', time: '09:00', status: 'open', caseId: 'c1' },
    { id: 't2', title: 'בוצע', due: '2026-10-05', status: 'done' },
    { id: 't3', title: 'בלי תאריך', status: 'open' }
  ],
  calls: [
    { id: 'k1', who: 'רון', why: 'הצעה', when: '2026-10-07', status: 'callback', caseId: 'c1' },
    { id: 'k2', who: 'ענה כבר', when: '2026-10-07', status: 'answered' }
  ],
  payments: [
    { id: 'p1', caseId: 'c1', amount: '12,500', due: '2026-10-20', status: 'לגבות' },
    { id: 'p2', caseId: 'c1', amount: 100, due: '2026-10-20', status: 'שולם' }
  ]
};

test('items are bucketed by day: events, open dated tasks, scheduled calls, payment due dates', () => {
  const by = itemsByDay(DATA, '2026-10-01', '2026-10-31');
  assert.deepEqual(Object.keys(by).sort(), ['2026-10-05', '2026-10-07', '2026-10-20']);
  const d5 = by['2026-10-05'];
  assert.deepEqual(d5.map(x => x.kind), ['case', 'case', 'task']);
  assert.deepEqual(d5.map(x => x.title), ['טבע', 'סטרטסיס', 'להזמין אוטובוס']);
  assert.equal(d5[0].href, '#/case/c1'); assert.equal(d5[0].status, 'נסגר'); assert.equal(d5[0].time, '18:00'); assert.equal(d5[0].sub, 'כנס · הרצליה');
  assert.equal(d5[2].href, '#/tasks'); assert.equal(d5[2].sub, 'דנה · טבע'); assert.equal(d5[2].caseId, 'c1');
  assert.deepEqual(by['2026-10-07'].map(x => [x.kind, x.title, x.href]), [['call', 'רון', '#/case/c1']]);
  const pay = by['2026-10-20'];
  assert.equal(pay.length, 1); assert.equal(pay[0].kind, 'pay'); assert.equal(pay[0].title, 'טבע'); assert.equal(pay[0].sub, '12,500 ₪'); assert.equal(pay[0].href, '#/case/c1/money');
});

test('the range is inclusive, lost events and done tasks stay out, missing collections are fine', () => {
  assert.deepEqual(Object.keys(itemsByDay(DATA, '2026-10-05', '2026-10-05')), ['2026-10-05']);
  assert.deepEqual(Object.keys(itemsByDay(DATA, '2026-10-06', '2026-10-06')), []);
  assert.deepEqual(Object.keys(itemsByDay(DATA, '2026-11-01', '2026-11-30')), ['2026-11-02']);
  assert.deepEqual(itemsByDay({}, '2026-10-01', '2026-10-31'), {});
  assert.deepEqual(itemsByDay(null, '2026-10-01', '2026-10-31'), {});
  const ag = agenda(DATA, '2026-10-01', '2026-10-31');
  assert.deepEqual(ag.map(d => d.iso), ['2026-10-05', '2026-10-07', '2026-10-20']);
  assert.equal(ag[0].items.length, 3);
});

test('dates in any stored form become an iso day', () => {
  assert.equal(dayIso('2026-10-05'), '2026-10-05');
  assert.equal(dayIso('5/10/2026'), '2026-10-05');
  assert.equal(dayIso('2026-10-05T08:00:00.000Z'), '2026-10-05');
  assert.equal(dayIso(''), ''); assert.equal(dayIso(null), ''); assert.equal(dayIso('מחר'), '');
});
