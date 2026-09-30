/* The event board (kanban by status) and the lead pipeline statistics: pure functions on plain data,
   the screen (js/screens/board.js) only draws. Tested in tests/pipeline.test.mjs.
   Nothing here writes: move() returns the patch the screen saves with an ordinary db.put. */
import Office from './office.js';
import { TASK } from './extra.js';
import { QUOTE_STATUS } from './quotes.js';

const { STATUS, day, iso, daysBetween } = Office;
const str = v => (v == null ? '' : String(v));
const trim = v => str(v).replace(/\s+/g, ' ').trim();
const num = v => { const n = Office.num(v); return isNaN(n) ? 0 : n; };

/** Column order of the board: the pipeline from the first call to the day after the event; "dropped" last. */
export const ORDER = [STATUS.lead, STATUS.quoted, STATUS.won, STATUS.done, STATUS.lost];
/** The case field that holds where the lead came from (`source` already holds the original message). */
export const SOURCE_FIELD = 'leadSource';
/** Lead sources she can pick; stored in Hebrew like the statuses, shown through t('src_' + value). */
export const SOURCES = ['וואטסאפ', 'טלפון', 'מייל', 'המלצה', 'אתר', 'לקוח חוזר', 'אחר'];
/** Days a supplier may stay silent after a request before the card flags it (same as the dashboard). */
export const SILENT_DAYS = 2;

const TRANSITIONS = {
  [STATUS.lead]: [STATUS.quoted, STATUS.won, STATUS.lost],
  [STATUS.quoted]: [STATUS.lead, STATUS.won, STATUS.lost],
  [STATUS.won]: [STATUS.quoted, STATUS.done, STATUS.lost],
  [STATUS.done]: [STATUS.won],
  [STATUS.lost]: [STATUS.lead, STATUS.quoted, STATUS.won]
};
/** Where a case may move from its status. An unknown status may go anywhere. */
export function validTransitions(status) {
  return TRANSITIONS[status] ? TRANSITIONS[status].slice() : ORDER.slice();
}

/** The month key of a date-like value, 'YYYY-MM', or ''. Accepts ISO timestamps too. */
export function monthKey(d) { const s = iso(d); return s ? s.slice(0, 7) : ''; }
/** The last n month keys ending with today's month, oldest first. */
export function lastMonths(today, n) {
  const t = day(today) || day(new Date());
  const out = [];
  for (let i = (n || 12) - 1; i >= 0; i--) out.push(monthKey(new Date(t.getFullYear(), t.getMonth() - i, 1)));
  return out;
}

/** The quote that counts for a case: accepted beats sent beats draft; rejected ones only when nothing else exists. */
export function caseQuote(quotes, caseId) {
  const rank = { [QUOTE_STATUS.accepted]: 3, [QUOTE_STATUS.sent]: 2, [QUOTE_STATUS.draft]: 1 };
  const mine = (quotes || []).filter(q => q.caseId === caseId);
  if (!mine.length) return null;
  return mine.slice().sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0) || str(b.sentAt || b.date).localeCompare(str(a.sentAt || a.date)))[0];
}
/** Net total of a quote: its stored total when it has one, else the sum of its lines. */
export function quoteTotal(q) {
  if (!q) return 0;
  if (q.total != null && q.total !== '') return num(q.total);
  if (Array.isArray(q.lines) && q.lines.length) return num(Office.quoteTotals(q.lines, q.vatRate).net);
  return 0;
}

function overdueCount(tasks, caseId, today) {
  return (tasks || []).filter(t => t.caseId === caseId && t.status !== TASK.done && day(t.due) && daysBetween(t.due, today) > 0).length;
}
function silentCount(links, caseId, today) {
  return (links || []).filter(l => l.caseId === caseId && /ביקשנו/.test(str(l.status)) && day(l.askedAt) && !l.answeredAt && daysBetween(l.askedAt, today) > SILENT_DAYS).length;
}

/** One case with what the card shows: quote total, overdue tasks, silent suppliers, days to the event. */
export function enrich(c, quotes, tasks, links, today) {
  today = day(today) || day(new Date());
  return Object.assign({}, c, {
    quoteTotal: quoteTotal(caseQuote(quotes, c.id)),
    overdueTasks: overdueCount(tasks, c.id, today),
    silentSuppliers: silentCount(links, c.id, today),
    daysToEvent: day(c.date) ? daysBetween(today, c.date) : null
  });
}

/** Sort for a column: dated cases by date, undated last, then by client. */
function byDate(a, b) {
  const da = iso(a.date), dbb = iso(b.date);
  if (da && dbb) return da.localeCompare(dbb) || str(a.client).localeCompare(str(b.client));
  if (da) return -1; if (dbb) return 1;
  return str(a.created).localeCompare(str(b.created));
}

/** The board: one column per status in ORDER, each with its enriched cases sorted by date, a count and the total quote value. */
export function columns(cases, quotes, tasks, links, today) {
  today = day(today) || day(new Date());
  const rich = (cases || []).map(c => enrich(c, quotes, tasks, links, today));
  return ORDER.map(status => {
    const list = rich.filter(c => c.status === status).sort(byDate);
    return { status, cases: list, count: list.length, total: Math.round(list.reduce((a, c) => a + c.quoteTotal, 0) * 100) / 100 };
  });
}

/** The month a case belongs to on the board: its event month, or the month it was opened when it has no date. */
export function caseMonth(c) { return monthKey(c.date) || monthKey(c.opened || c.created); }

/** Board filters: kind, month ('YYYY-MM'), lead source, free text. Empty values match everything. */
export function filterCases(cases, f) {
  f = f || {};
  const words = Office.normHe(f.q || '').split(' ').filter(Boolean);
  const digits = str(f.q).replace(/\D/g, '');
  return (cases || []).filter(c => {
    if (f.kind && c.kind !== f.kind) return false;
    if (f.month && caseMonth(c) !== f.month) return false;
    if (f.source && str(c[SOURCE_FIELD]) !== f.source) return false;
    if (!words.length) return true;
    const hay = Office.normHe([c.client, c.contact, c.place, c.kind, c.email, c.notes, c.purpose].map(str).join(' '));
    const tel = str(c.phone).replace(/\D/g, '');
    return words.every(w => hay.indexOf(w) >= 0 || (digits.length >= 3 && /^\d+$/.test(w) && tel.indexOf(w) >= 0));
  });
}

/** The patch for moving a case to a status: the status, and the date it was won / dropped / done when moving there.
 *  Returns null when nothing changes or the move is not allowed. Moving back never erases a date. */
export function move(caseRec, toStatus, today) {
  if (!caseRec || !toStatus || caseRec.status === toStatus) return null;
  if (validTransitions(caseRec.status).indexOf(toStatus) < 0) return null;
  const t = iso(today) || iso(new Date());
  const patch = { id: caseRec.id, status: toStatus };
  if (toStatus === STATUS.won && !caseRec.wonAt) patch.wonAt = t;
  if (toStatus === STATUS.lost) patch.lostAt = t;
  if (toStatus === STATUS.done) { patch.doneAt = t; if (!caseRec.wonAt) patch.wonAt = t; }
  if (toStatus === STATUS.quoted && !caseRec.quotedAt) patch.quotedAt = t;
  if (toStatus === STATUS.quoted || toStatus === STATUS.lead) patch.waitingSince = caseRec.waitingSince || '';
  return patch;
}

/** Distinct lead sources with counts: the known ones first in their order, then anything else she typed. */
export function sources(cases) {
  const counts = {};
  (cases || []).forEach(c => { const s = trim(c[SOURCE_FIELD]); if (s) counts[s] = (counts[s] || 0) + 1; });
  const known = SOURCES.filter(s => counts[s]);
  const other = Object.keys(counts).filter(s => SOURCES.indexOf(s) < 0).sort();
  return known.concat(other).map(s => ({ source: s, count: counts[s] }));
}

/* ---------------- statistics ---------------- */

const isWon = c => c.status === STATUS.won || c.status === STATUS.done;
const wonDate = c => c.wonAt || (isWon(c) ? c.updated || c.created : '');
const quotedDate = (c, q) => c.quotedAt || (q && q.sentAt) || (c.status !== STATUS.lead && c.status !== STATUS.lost ? c.updated || c.created : '');
const wasQuoted = (c, q) => !!(c.quotedAt || (q && q.status !== QUOTE_STATUS.draft) || c.status === STATUS.quoted || isWon(c));

function blank() { return { leads: 0, quoted: 0, won: 0, lost: 0, done: 0, revenue: 0, days: [] }; }
function finish(row) {
  const decided = row.won + row.lost;
  row.conversion = decided ? Math.round(row.won / decided * 100) : null;
  row.avgDays = row.days.length ? Math.round(row.days.reduce((a, b) => a + b, 0) / row.days.length) : null;
  row.revenue = Math.round(row.revenue * 100) / 100;
  delete row.days;
  return row;
}

/** Revenue of a case: its quote total, or when it has no quote the sum of its payments. */
export function caseRevenue(c, quotes, payments) {
  const q = quoteTotal(caseQuote(quotes, c.id));
  if (q) return q;
  return (payments || []).filter(p => p.caseId === c.id).reduce((a, p) => a + num(p.amount), 0);
}

/**
 * The pipeline numbers: per month (the last 12, oldest first) leads opened, quotes sent, won, lost, done,
 * conversion % (won / (won + lost)), average days from lead to won, revenue (quote totals of won + done, else
 * payments, counted in the month the case was won); the same counts by kind and by lead source over all cases; the funnel; the best month.
 */
export function stats(cases, quotes, payments, today, monthsBack) {
  today = day(today) || day(new Date());
  const keys = lastMonths(today, monthsBack || 12);
  const months = {}; keys.forEach(k => { months[k] = blank(); });
  const kinds = {}, srcs = {};
  const bump = (map, key, fn) => { if (key == null) return; if (!map[key]) map[key] = blank(); fn(map[key]); };
  const funnel = { leads: 0, quoted: 0, won: 0, done: 0, lost: 0 };
  const all = blank();

  (cases || []).forEach(c => {
    const q = caseQuote(quotes, c.id);
    const openedM = monthKey(c.opened || c.created);
    const kind = trim(c.kind) || 'אחר';
    const src = trim(c[SOURCE_FIELD]) || '';
    const won = isWon(c), lost = c.status === STATUS.lost, done = c.status === STATUS.done, quoted = wasQuoted(c, q);
    const rev = won ? caseRevenue(c, quotes, payments) : 0;
    const dayCount = won && day(c.opened || c.created) && day(wonDate(c)) ? Math.max(0, daysBetween(c.opened || c.created, wonDate(c))) : null;
    const add = row => {
      row.leads += 1; if (quoted) row.quoted += 1; if (won) row.won += 1; if (lost) row.lost += 1; if (done) row.done += 1;
      row.revenue += rev; if (dayCount != null) row.days.push(dayCount);
    };
    add(all); bump(kinds, kind, add); bump(srcs, src, add);
    funnel.leads += 1; if (quoted) funnel.quoted += 1; if (won) funnel.won += 1; if (done) funnel.done += 1; if (lost) funnel.lost += 1;

    // per month: each count lands in the month it happened
    if (months[openedM]) months[openedM].leads += 1;
    if (quoted) { const m = monthKey(quotedDate(c, q)); if (months[m]) months[m].quoted += 1; }
    if (won) {
      const m = monthKey(wonDate(c));
      if (months[m]) { months[m].won += 1; months[m].revenue += rev; if (dayCount != null) months[m].days.push(dayCount); }
    }
    if (lost) { const m = monthKey(c.lostAt || c.updated || c.created); if (months[m]) months[m].lost += 1; }
    if (done) { const m = monthKey(c.doneAt || c.date || c.updated); if (months[m]) months[m].done += 1; }
  });

  const monthRows = keys.map(k => Object.assign({ month: k }, finish(months[k])));
  const byKind = Object.keys(kinds).map(k => Object.assign({ kind: k }, finish(kinds[k]))).sort((a, b) => b.leads - a.leads || a.kind.localeCompare(b.kind));
  const bySource = Object.keys(srcs).map(k => Object.assign({ source: k }, finish(srcs[k]))).sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
  const best = monthRows.filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue || b.won - a.won)[0] || null;
  return { months: monthRows, totals: finish(all), byKind, bySource, funnel, best: best ? { month: best.month, revenue: best.revenue, won: best.won } : null };
}
