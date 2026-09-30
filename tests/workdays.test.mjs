import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLIDAYS, holidayOf, isWorkday, addWorkdays, workdaysBetween, dueFrom, holidaysBetween } from '../js/logic/workdays.js';

const wd = s => new Date(s + 'T12:00:00').getDay();

test('the holiday table is internally consistent with the Hebrew calendar', () => {
  // Rosh Hashana never falls on Sunday, Wednesday or Friday; Yom Kippur is 9 days later; Sukkot 14; Simchat Torah 21
  ['2026', '2027', '2028'].forEach(y => {
    const rosh = Object.keys(HOLIDAYS).find(k => k.startsWith(y) && HOLIDAYS[k] === 'rosh1');
    assert.ok(![0, 3, 5].includes(wd(rosh)), y + ' Rosh Hashana weekday');
    const plus = n => { const d = new Date(rosh + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    assert.equal(HOLIDAYS[plus(1)], 'rosh2'); assert.equal(HOLIDAYS[plus(9)], 'kippur'); assert.equal(HOLIDAYS[plus(14)], 'sukkot1'); assert.equal(HOLIDAYS[plus(21)], 'simchat');
    // 1 Tishrei falls two weekdays after 15 Nisan of the same civil year; Shavuot 50 days after Pesach; 7th day 6 days after
    const pesach = Object.keys(HOLIDAYS).find(k => k.startsWith(y) && HOLIDAYS[k] === 'pesach1');
    assert.equal((wd(pesach) + 2) % 7, wd(rosh), y + ' Pesach vs Rosh Hashana weekday');
    const p = n => { const d = new Date(pesach + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    assert.equal(HOLIDAYS[p(6)], 'pesach7'); assert.equal(HOLIDAYS[p(50)], 'shavuot');
  });
  assert.equal(HOLIDAYS['2026-09-21'], 'kippur');
  assert.equal(HOLIDAYS['2028-05-02'], 'atzmaut', 'Yom HaAtzmaut 2028 moves from Monday to Tuesday');
  assert.equal(Object.keys(HOLIDAYS).length, 27);
});

test('isWorkday: Sunday to Thursday, not on a holiday, unless holidays are switched off', () => {
  assert.equal(isWorkday('2026-10-04'), true);  // Sunday
  assert.equal(isWorkday('2026-10-01'), true);  // Thursday
  assert.equal(isWorkday('2026-10-02'), false); // Friday
  assert.equal(isWorkday('2026-10-03'), false); // Saturday (also Simchat Torah)
  assert.equal(isWorkday('2026-09-21'), false); // Yom Kippur, a Monday
  assert.equal(isWorkday('2026-09-21', { holidays: false }), true);
  assert.equal(isWorkday('2026-11-11', { extra: { '2026-11-11': 'office' } }), false);
  assert.equal(isWorkday('nope'), false);
  assert.equal(holidayOf('2027-04-22'), 'pesach1');
});

test('addWorkdays skips the weekend and holidays, forwards and backwards', () => {
  assert.equal(addWorkdays('2026-10-01', 1), '2026-10-04'); // Thu + 1 → Sun
  assert.equal(addWorkdays('2026-09-17', 2), '2026-09-22'); // Thu 17 → Sun 20, Mon 21 is Kippur → Tue 22
  assert.equal(addWorkdays('2026-09-17', 2, { holidays: false }), '2026-09-21');
  assert.equal(addWorkdays('2026-10-04', -1), '2026-10-01'); // Sun - 1 → Thu
  assert.equal(addWorkdays('2026-10-04', 0), '2026-10-04');
  assert.equal(addWorkdays('', 3), '');
});

test('workdaysBetween counts [a, b) and inverts addWorkdays', () => {
  assert.equal(workdaysBetween('2026-10-04', '2026-10-06'), 2);
  assert.equal(workdaysBetween('2026-10-04', '2026-10-11'), 5); // one full week
  assert.equal(workdaysBetween('2026-10-11', '2026-10-04'), -5);
  assert.equal(workdaysBetween('2026-09-17', '2026-09-27'), 5); // Thu17, Sun20, (Mon21 Kippur), Tue22, Wed23, Thu24 = 5
  const a = '2026-10-05', b = '2026-10-20';
  assert.equal(addWorkdays(a, workdaysBetween(a, b)), b);
});

test('dueFrom: start + duration in days, weeks or workdays', () => {
  assert.equal(dueFrom('2026-10-01', 3, 'days'), '2026-10-04');
  assert.equal(dueFrom('2026-10-01', 2, 'weeks'), '2026-10-15');
  assert.equal(dueFrom('2026-10-01', 3, 'workdays'), '2026-10-06');
  assert.equal(dueFrom('', 3, 'days'), '');
  assert.equal(dueFrom('2026-10-01', 'x', 'days'), '');
  assert.deepEqual(holidaysBetween('2026-09-10', '2026-09-30').map(h => h.key), ['rosh1', 'rosh2', 'kippur', 'sukkot1']);
});
