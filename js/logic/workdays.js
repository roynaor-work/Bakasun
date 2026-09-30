/* Israeli working days (Sunday to Thursday) and the holidays on which the office is closed, for task durations
   given in workdays. Pure functions, no storage.

   Holiday dates (Gregorian, Israel) for 2026, 2027 and 2028 were taken from Hebcal (https://www.hebcal.com/holidays/2026,
   /2027, /2028 — "Israel" setting, major holidays) and cross-checked: 1 Tishrei falls two weekdays after 15 Nisan of the same
   civil year, 5786 is a regular year and 5787 a leap year (Pesach 2027 is late), Yom HaAtzmaut moves from Monday to Tuesday
   (2028) and from Friday/Saturday to Thursday. In Israel Shmini Atzeret and Simchat Torah are the same day (22 Tishrei),
   which is also the last festival day of Sukkot. Chol HaMoed (the middle days) are not listed: they are half working days.
   The list ends in 2028; isWorkday() then only knows the weekend, and the office can add dates through `extra`. */
import Office from './office.js';

const { day, iso, addDays } = Office;

/** iso → holiday key (an i18n key without the "hol" prefix), for the three years we know. */
export const HOLIDAYS = {
  // 2026 (5786 → 5787)
  '2026-04-02': 'pesach1', '2026-04-08': 'pesach7', '2026-04-22': 'atzmaut', '2026-05-22': 'shavuot',
  '2026-09-12': 'rosh1', '2026-09-13': 'rosh2', '2026-09-21': 'kippur', '2026-09-26': 'sukkot1', '2026-10-03': 'simchat',
  // 2027 (5787 leap year → 5788)
  '2027-04-22': 'pesach1', '2027-04-28': 'pesach7', '2027-05-12': 'atzmaut', '2027-06-11': 'shavuot',
  '2027-10-02': 'rosh1', '2027-10-03': 'rosh2', '2027-10-11': 'kippur', '2027-10-16': 'sukkot1', '2027-10-23': 'simchat',
  // 2028 (5788 → 5789)
  '2028-04-11': 'pesach1', '2028-04-17': 'pesach7', '2028-05-02': 'atzmaut', '2028-05-31': 'shavuot',
  '2028-09-21': 'rosh1', '2028-09-22': 'rosh2', '2028-09-30': 'kippur', '2028-10-05': 'sukkot1', '2028-10-12': 'simchat'
};

/** Holiday key of a date, or ''. opts.holidays === false ignores the list; opts.extra = {iso: key} adds dates. */
export function holidayOf(d, opts) {
  const k = iso(d); if (!k) return '';
  if (opts && opts.holidays === false) return '';
  return HOLIDAYS[k] || (opts && opts.extra && opts.extra[k]) || '';
}

/** Sunday to Thursday, and not a holiday (unless opts.holidays === false). */
export function isWorkday(d, opts) {
  const x = day(d); if (!x) return false;
  const wd = x.getDay();
  if (wd === 5 || wd === 6) return false;
  return !holidayOf(x, opts);
}

/** The date n workdays after d (n may be negative: before). n = 0 returns d itself as iso. */
export function addWorkdays(d, n, opts) {
  let x = day(d); if (!x) return '';
  n = Math.trunc(+n || 0);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) { x = addDays(x, step); if (isWorkday(x, opts)) left--; }
  return iso(x);
}

/** Workdays from a (inclusive) to b (exclusive), so addWorkdays(a, workdaysBetween(a, b)) lands on b when b is a workday.
 *  Negative when b is before a. */
export function workdaysBetween(a, b, opts) {
  let x = day(a); const y = day(b); if (!x || !y) return 0;
  if (y < x) return -workdaysBetween(b, a, opts);
  let n = 0;
  while (x < y) { if (isWorkday(x, opts)) n++; x = addDays(x, 1); }
  return n;
}

/** Due date of a task that starts on `start` and takes `duration` in unit 'days' | 'workdays' | 'weeks'. '' when unknown. */
export function dueFrom(start, duration, unit, opts) {
  const s = day(start); const n = +duration;
  if (!s || !(n >= 0)) return '';
  if (unit === 'workdays') return addWorkdays(s, n, opts);
  if (unit === 'weeks') return iso(addDays(s, Math.round(n * 7)));
  return iso(addDays(s, Math.round(n)));
}

/** The holidays inside [a, b], as [{date, key}], for a small "closed on" hint. */
export function holidaysBetween(a, b, opts) {
  let x = day(a); const y = day(b); const out = [];
  if (!x || !y) return out;
  while (x <= y) { const k = holidayOf(x, opts); if (k) out.push({ date: iso(x), key: k }); x = addDays(x, 1); }
  return out;
}
