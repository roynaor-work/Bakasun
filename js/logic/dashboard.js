/* The producer's overview: counts for the tiles, the next two weeks, money per event, and the three things to do now.
   Pure functions on plain data; the screen only draws. Tested in tests/dashboard.test.mjs. */
import Office from './office.js';
import { openTasks, callQueue, TASK } from './extra.js';
import { QUOTE_STATUS } from './quotes.js';
import { str } from './core.js';

const { day, iso, daysBetween } = Office;
const num = v => { const n = Office.num(v); return isNaN(n) ? 0 : n; };

/** Days a supplier may stay silent after a request before the dashboard flags the link. */
export const SILENT_DAYS = 2;
/** The window of the "next days" list. */
export const NEXT_DAYS = 14;

function activeCases(cases) { return (cases || []).filter(c => Office.ACTIVE.includes(c.status)); }
function byId(list) { const m = {}; (list || []).forEach(x => { m[x.id] = x; }); return m; }

/** Open events with a date from today on, soonest first. Also the ones without a date, at the end. */
export function openEvents(cases, today) {
  today = day(today) || day(new Date());
  const act = activeCases(cases).filter(c => !day(c.date) || day(c.date) >= today);
  return act.map(c => Object.assign({}, c, { inDays: day(c.date) ? daysBetween(today, c.date) : null }))
    .sort((a, b) => (a.inDays == null ? 9999 : a.inDays) - (b.inDays == null ? 9999 : b.inDays) || str(a.client).localeCompare(str(b.client)));
}

/** Open tasks split the way a producer counts them: overdue, due today, due in the coming 7 days (tomorrow and on). */
export function taskBuckets(tasks, today) {
  today = day(today) || day(new Date());
  const open = openTasks(tasks, today);
  return {
    overdue: open.filter(t => t.late != null && t.late > 0),
    today: open.filter(t => t.late === 0),
    week: open.filter(t => t.late != null && t.late < 0 && t.late >= -7),
    open
  };
}

/** Client invoices that went out and were not paid yet: what Roy is still waiting for. */
export function unpaidInvoices(payments, cases) {
  const cs = byId(cases);
  const list = (payments || []).filter(p => p.status === Office.PAY.invoiced && num(p.amount) > 0)
    .map(p => Object.assign({}, p, { amount: num(p.amount), client: p.client || (cs[p.caseId] || {}).client || '' }));
  return { list, count: list.length, total: list.reduce((a, p) => a + p.amount, 0) };
}

/** Quotes sent to the client and still without an answer, the oldest first. */
export function quotesWaiting(quotes, cases, today) {
  today = day(today) || day(new Date());
  const cs = byId(cases);
  return (quotes || []).filter(q => q.status === QUOTE_STATUS.sent)
    .map(q => Object.assign({}, q, { client: q.client || (cs[q.caseId] || {}).client || '', waited: day(q.sentAt || q.date) ? daysBetween(q.sentAt || q.date, today) : null }))
    .sort((a, b) => (b.waited == null ? -1 : b.waited) - (a.waited == null ? -1 : a.waited));
}

/** Suppliers we asked for an offer more than SILENT_DAYS ago and who did not answer, on events that are still open. */
export function silentSuppliers(links, cases, today, days) {
  today = day(today) || day(new Date());
  const d = days == null ? SILENT_DAYS : days;
  const cs = byId(cases);
  return (links || []).filter(l => /ביקשנו/.test(str(l.status)) && day(l.askedAt) && !l.answeredAt)
    .map(l => { const c = cs[l.caseId] || {}; return Object.assign({}, l, { waited: daysBetween(l.askedAt, today), client: c.client || '', caseStatus: c.status || '' }); })
    .filter(l => l.waited > d && (!l.caseStatus || Office.ACTIVE.includes(l.caseStatus)))
    .sort((a, b) => b.waited - a.waited);
}

/** New leads: requests that did not get a quote yet. */
export function newLeads(cases) {
  return (cases || []).filter(c => c.status === Office.STATUS.lead || !c.status)
    .sort((a, b) => str(b.created).localeCompare(str(a.created)));
}

/** Events and dated tasks in the next NEXT_DAYS days, one list, by date then time. Today counts. */
export function nextDays(cases, tasks, today, days) {
  today = day(today) || day(new Date());
  const n = days == null ? NEXT_DAYS : days;
  const out = [];
  activeCases(cases).forEach(c => {
    const d = day(c.date); if (!d) return;
    const inDays = daysBetween(today, d);
    if (inDays < 0 || inDays > n) return;
    out.push({ type: 'event', id: c.id, caseId: c.id, date: iso(d), inDays, time: '', client: str(c.client), kind: str(c.kind), title: [c.client, c.kind].filter(Boolean).join(' · '), sub: [c.place, c.hours].filter(Boolean).join(' · '), href: '#/case/' + c.id });
  });
  (tasks || []).forEach(t => {
    if (t.status === TASK.done) return;
    const d = day(t.due); if (!d) return;
    const inDays = daysBetween(today, d);
    if (inDays < 0 || inDays > n) return;
    out.push({ type: 'task', id: t.id, caseId: t.caseId || '', date: iso(d), inDays, time: str(t.time), title: str(t.title), sub: str(t.who), href: '#/tasks' });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'event' ? -1 : b.type === 'event' ? 1 : 0) || str(a.time || '99').localeCompare(str(b.time || '99')));
}

/** Per open event that has payments: what was planned (all payment rows), what was invoiced and not paid, what was paid. */
export function moneyByEvent(cases, payments) {
  const rows = [];
  activeCases(cases).forEach(c => {
    const mine = (payments || []).filter(p => p.caseId === c.id && num(p.amount) > 0);
    if (!mine.length) return;
    const planned = mine.reduce((a, p) => a + num(p.amount), 0);
    const paid = mine.filter(p => p.status === Office.PAY.paid).reduce((a, p) => a + num(p.amount), 0);
    const invoiced = mine.filter(p => p.status === Office.PAY.invoiced).reduce((a, p) => a + num(p.amount), 0);
    rows.push({ caseId: c.id, client: c.client || '', kind: c.kind || '', date: c.date || '', planned, paid, invoiced, open: planned - paid, pct: planned ? Math.round(paid / planned * 100) : 0 });
  });
  return rows.sort((a, b) => str(a.date).localeCompare(str(b.date)) || str(a.client).localeCompare(str(b.client)));
}

/**
 * The three most urgent items. Each has a kind, a title, a sub line, the screen to open and a score:
 * an event today or tomorrow beats an overdue task, which beats an overdue invoice, a silent supplier, a call and a lead.
 * Overdue things get more urgent with every day.
 */
export function whatNow(data, today, limit) {
  today = day(today) || day(new Date());
  const items = [];
  openEvents(data.cases, today).forEach(c => {
    if (c.inDays == null || c.inDays > 2) return;
    items.push({ kind: 'event', id: c.id, title: [c.client, c.kind].filter(Boolean).join(' · '), sub: c.place || '', inDays: c.inDays, href: '#/case/' + c.id, score: 100 - c.inDays * 10 });
  });
  const tb = taskBuckets(data.tasks, today);
  tb.overdue.forEach(t => items.push({ kind: 'taskLate', id: t.id, title: str(t.title), sub: str(t.who), late: t.late, href: '#/tasks', score: 70 + Math.min(t.late, 20) }));
  tb.today.forEach(t => items.push({ kind: 'taskToday', id: t.id, title: str(t.title), sub: str(t.who), href: '#/tasks', score: 60 }));
  const cs = byId(data.cases);
  (data.payments || []).forEach(p => {
    if (p.status === Office.PAY.paid || !num(p.amount) || !day(p.due)) return;
    const late = daysBetween(p.due, today);
    if (late <= 0) return;
    items.push({ kind: 'payLate', id: p.id, title: (p.client || (cs[p.caseId] || {}).client || ''), sub: Office.money(num(p.amount)), late, href: '#/money', score: 55 + Math.min(late, 30) });
  });
  silentSuppliers(data.links, data.cases, today).forEach(l => items.push({ kind: 'supplierSilent', id: l.id, title: str(l.supplier), sub: l.client, late: l.waited, href: l.caseId ? '#/case/' + l.caseId + '/suppliers' : '#/suppliers', score: 40 + Math.min(l.waited, 20) }));
  const q = callQueue(data.calls, today);
  q.now.forEach((c, i) => items.push({ kind: 'call', id: c.id, title: str(c.name), sub: str(c.why), href: '#/calls', score: (c.status === 'callback' ? 50 : 35) - i }));
  quotesWaiting(data.quotes, data.cases, today).forEach(x => { if (x.waited != null && x.waited >= 3) items.push({ kind: 'quoteWaiting', id: x.id, title: x.client, sub: str(x.no), late: x.waited, href: '#/quote/' + x.id, score: 30 + Math.min(x.waited, 20) }); });
  newLeads(data.cases).forEach(c => { const age = day(c.created) ? daysBetween(c.created, today) : 0; items.push({ kind: 'lead', id: c.id, title: str(c.client), sub: str(c.kind), late: age, href: '#/case/' + c.id, score: 25 + Math.min(age, 20) }); });
  // The most urgent first, but no more than two of the same kind, so three late invoices do not hide a silent supplier.
  const n = limit || 3, cap = n >= 3 ? 2 : n;
  const sorted = items.sort((a, b) => b.score - a.score);
  const out = [], perKind = {}, rest = [];
  sorted.forEach(x => { if (out.length < n && (perKind[x.kind] || 0) < cap) { out.push(x); perKind[x.kind] = (perKind[x.kind] || 0) + 1; } else rest.push(x); });
  return out.concat(rest.slice(0, n - out.length)).sort((a, b) => b.score - a.score);
}

/** Everything the dashboard shows, in one object. data: {cases, tasks, calls, payments, quotes, links}. */
export function dashboardData(data, today) {
  data = data || {};
  today = day(today) || day(new Date());
  const events = openEvents(data.cases, today);
  const tb = taskBuckets(data.tasks, today);
  const calls = callQueue(data.calls, today);
  const money = unpaidInvoices(data.payments, data.cases);
  const quotes = quotesWaiting(data.quotes, data.cases, today);
  const silent = silentSuppliers(data.links, data.cases, today);
  const leads = newLeads(data.cases);
  return {
    today: iso(today),
    events: { count: events.length, next: events.find(c => c.inDays != null) || null, list: events },
    tasks: { overdue: tb.overdue.length, today: tb.today.length, week: tb.week.length, open: tb.open.length },
    calls: { count: calls.now.length, scheduled: calls.scheduled.length },
    money,
    quotes: { count: quotes.length, list: quotes },
    suppliers: { count: silent.length, list: silent },
    leads: { count: leads.length, list: leads },
    next: nextDays(data.cases, data.tasks, today),
    moneyByEvent: moneyByEvent(data.cases, data.payments),
    now: whatNow(data, today, 3)
  };
}

/* ---------------- which widgets she wants (settings → "אישי") ---------------- */

/** Every tile and section of the dashboard, in the order they are drawn. All are on until she unticks some. */
export const DASH_WIDGETS = ['now', 'events', 'tasksOverdue', 'tasksToday', 'tasksWeek', 'calls', 'money', 'quotes', 'suppliers', 'leads', 'next14', 'moneyByEvent'];
/** The saved setting 'dashWidgets' (a JSON map key → true/false, or empty) → {key: on} with every widget present. */
export function widgetsOn(setting) {
  let saved = {};
  try { const o = JSON.parse(setting || '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) saved = o; } catch (e) { saved = {}; }
  const out = {};
  DASH_WIDGETS.forEach(k => { out[k] = saved[k] !== false; });
  return out;
}
/** The value to save for a list of the ticked widgets: '' when all are on (the default), otherwise the JSON map. */
export function widgetsSetting(ticked) {
  const on = new Set(ticked || []);
  if (DASH_WIDGETS.every(k => on.has(k))) return '';
  const o = {}; DASH_WIDGETS.forEach(k => { o[k] = on.has(k); });
  return JSON.stringify(o);
}
