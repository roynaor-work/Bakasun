/* Pure calendar maths for the calendar screen: the month grid (weeks start on Sunday) and the items of every day
   (events, dated open tasks, scheduled calls, payment due dates). No DOM, no store, so it is unit-tested. */
import Office from './office.js';

const pad2 = n => String(n).padStart(2, '0');
export const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
/** Any stored date value (iso, dd/mm/yyyy, Date, iso datetime) → 'yyyy-mm-dd' or ''. */
export function dayIso(v) { const d = Office.day(v); return d ? isoOf(d) : ''; }
/** 'yyyy-mm' of a date or of an iso; the current month when the value is not a month. */
export function monthOf(v, fallback) {
  if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return v;
  const d = Office.day(v) || Office.day(fallback) || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
/** 'yyyy-mm' shifted by n months. */
export function shiftMonth(yyyyMm, n) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
export function shiftDay(iso, n) { return isoOf(Office.addDays(iso, n)); }
/** Sunday of the week that holds the day. */
export function weekStart(iso) { const d = Office.day(iso); return isoOf(Office.addDays(d, -d.getDay())); }

/** The month as weeks of 7 days, Sunday first, padded with the neighbouring months' days.
    Each day: {iso, day, dow, inMonth, today, past}. */
export function monthGrid(yyyyMm, today) {
  const month = monthOf(yyyyMm, today);
  const todayIso = dayIso(today || new Date());
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  let cur = Office.addDays(first, -first.getDay());
  const weeks = [];
  while (cur <= last || weeks.length === 0 || weeks[weeks.length - 1].length < 7) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    const iso = isoOf(cur);
    weeks[weeks.length - 1].push({ iso, day: cur.getDate(), dow: cur.getDay(), inMonth: cur.getMonth() === m - 1, today: iso === todayIso, past: iso < todayIso });
    cur = Office.addDays(cur, 1);
  }
  return { month, first: isoOf(first), last: isoOf(last), weeks };
}

/** The 7 days (Sunday..Saturday) of the week that holds the day, same day objects as monthGrid. */
export function weekDays(iso, today) {
  const start = weekStart(iso);
  const todayIso = dayIso(today || new Date());
  return Array.from({ length: 7 }, (_, i) => { const d = Office.addDays(start, i); const di = isoOf(d); return { iso: di, day: d.getDate(), dow: d.getDay(), inMonth: true, today: di === todayIso, past: di < todayIso }; });
}

const ORDER = { case: 0, task: 1, call: 2, pay: 3 };
const str = v => (v == null ? '' : String(v)).trim();

/** Everything that has a date between fromIso and toIso (inclusive), bucketed by day:
    { 'yyyy-mm-dd': [{kind, id, title, sub, href, status, time, caseId}] }. Kinds: case, task, call, pay. */
export function itemsByDay(data, fromIso, toIso) {
  data = data || {};
  const cases = data.cases || [], tasks = data.tasks || [], calls = data.calls || [], payments = data.payments || [];
  const out = {};
  const inRange = iso => iso && (!fromIso || iso >= fromIso) && (!toIso || iso <= toIso);
  const push = (iso, item) => { (out[iso] = out[iso] || []).push(item); };
  const caseName = id => { const c = id && cases.find(x => x.id === id); return c ? str(c.client) : ''; };

  cases.forEach(c => {
    if (c.status === Office.STATUS.lost) return;
    const iso = dayIso(c.date); if (!inRange(iso)) return;
    push(iso, { kind: 'case', id: c.id, caseId: c.id, title: str(c.client) || '?', sub: [str(c.kind), str(c.place)].filter(Boolean).join(' · '), href: '#/case/' + c.id, status: str(c.status), time: str(c.hours).slice(0, 5) });
  });
  tasks.forEach(x => {
    if (x.status === 'done') return;
    const iso = dayIso(x.due); if (!inRange(iso)) return;
    push(iso, { kind: 'task', id: x.id, caseId: x.caseId || '', title: str(x.title) || '?', sub: [str(x.who), caseName(x.caseId)].filter(Boolean).join(' · '), href: '#/tasks', status: str(x.status), time: str(x.time) });
  });
  calls.forEach(x => {
    if (x.status === 'answered') return;
    const iso = dayIso(x.when); if (!inRange(iso)) return;
    push(iso, { kind: 'call', id: x.id, caseId: x.caseId || '', title: str(x.who) || caseName(x.caseId) || '?', sub: [str(x.why), caseName(x.caseId)].filter(Boolean).join(' · '), href: x.caseId ? '#/case/' + x.caseId : '#/calls', status: str(x.status), time: '' });
  });
  payments.forEach(p => {
    if (p.status === Office.PAY.paid) return;
    const iso = dayIso(p.due); if (!inRange(iso)) return;
    const n = Office.num(p.amount);
    push(iso, { kind: 'pay', id: p.id, caseId: p.caseId || '', title: str(p.client) || caseName(p.caseId) || '?', sub: isNaN(n) ? '' : Office.money(n), href: p.caseId ? '#/case/' + p.caseId + '/money' : '#/money', status: str(p.status), time: '' });
  });
  Object.keys(out).forEach(k => out[k].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.time ? 0 : 1) - (b.time ? 0 : 1) || str(a.time).localeCompare(str(b.time)) || a.title.localeCompare(b.title)));
  return out;
}

/** Days with items in [fromIso, toIso], in order: [{iso, items}]. */
export function agenda(data, fromIso, toIso) {
  const by = itemsByDay(data, fromIso, toIso);
  return Object.keys(by).sort().map(iso => ({ iso, items: by[iso] }));
}
