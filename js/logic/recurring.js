/* Recurring tasks. A template task (isTemplate: true) carries a rule:
     repeat: { every: 'day'|'week'|'month'|'2months'|'3months'|'6months'|'year', on, from, until, count }
   on = weekday 0-6 for 'week', day of month 1-31 for the month steps (clamped to short months); from/until iso; count =
   how many occurrences at most. Concrete tasks are ordinary tasks with templateId = the template's id.
   materialize() keeps at most one open occurrence per template and never re-creates one that exists. Pure. */
import Office from './office.js';
import { TASK } from './extra.js';

const { day, iso, addDays } = Office;
const STEP = { month: 1, '2months': 2, '3months': 3, '6months': 6 };
export const EVERY = ['day', 'week', 'month', '2months', '3months', '6months', 'year'];

function clampDate(y, m, d) { const last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(Math.max(1, d), last)); }

/** The first date of the rule strictly after `afterIso` (and not before rule.from), as iso; '' when none (past until). */
export function nextOccurrence(rule, afterIso) {
  if (!rule || !EVERY.includes(rule.every)) return '';
  const from = day(rule.from);
  let after = day(afterIso) || (from ? addDays(from, -1) : addDays(new Date(), -1));
  if (from && addDays(from, -1) > after) after = addDays(from, -1);
  const until = day(rule.until);
  let next = null;
  if (rule.every === 'day') next = addDays(after, 1);
  else if (rule.every === 'week') {
    const wd = rule.on == null || rule.on === '' ? (from ? from.getDay() : after.getDay()) : ((+rule.on % 7) + 7) % 7;
    next = addDays(after, 1);
    while (next.getDay() !== wd) next = addDays(next, 1);
  } else if (STEP[rule.every]) {
    const step = STEP[rule.every];
    const dom = rule.on == null || rule.on === '' ? (from ? from.getDate() : 1) : Math.min(31, Math.max(1, +rule.on || 1));
    const anchor = from || after;
    // walk month by month from the anchor month in steps, first candidate after `after`
    let y = anchor.getFullYear(), m = anchor.getMonth();
    if (!from) { const back = addDays(after, -31); y = back.getFullYear(); m = back.getMonth(); }
    let cand = clampDate(y, m, dom);
    let guard = 0;
    while (cand <= after && guard++ < 2000) { m += step; cand = clampDate(y, m, dom); }
    next = cand;
  } else if (rule.every === 'year') {
    const mm = from ? from.getMonth() : after.getMonth(), dd = from ? from.getDate() : after.getDate();
    let y = after.getFullYear();
    let cand = clampDate(y, mm, dd);
    while (cand <= after) { y++; cand = clampDate(y, mm, dd); }
    next = cand;
  }
  if (!next) return '';
  if (until && next > until) return '';
  return iso(next);
}

/** The fields an occurrence copies from its template. */
const COPY = ['title', 'details', 'who', 'phone', 'caseId', 'lang', 'priority', 'time', 'duration', 'durationUnit', 'holidays', 'blockedBy'];

/** What to do for one template today. existing = the concrete tasks made from it (templateId === template.id).
 *  Returns { create: task|null, patch: {id, lastDue, made}|null }. Rules: no open occurrence twice; the next one comes
 *  after the last one's due; when the app was not opened for a while only the most recent due one is created (it shows as
 *  late), never a pile; count and until stop it. Idempotent: run it on every render. */
export function materialize(template, today, existing) {
  const out = { create: null, patch: null };
  if (!template || !template.isTemplate || !template.repeat) return out;
  const list = (existing || []).filter(t => t.templateId === template.id);
  if (list.some(t => t.status !== TASK.done)) return out;
  const rule = template.repeat;
  const made = Math.max(list.length, +template.made || 0);
  if (rule.count && made >= +rule.count) return out;
  const td = day(today) || day(new Date());
  const lastDue = [template.lastDue].concat(list.map(t => t.due)).filter(d => day(d)).sort().pop() || '';
  let next = lastDue ? nextOccurrence(rule, lastDue) : nextOccurrence(rule, iso(addDays(rule.from && day(rule.from) > td ? day(rule.from) : td, -1)));
  if (!next) return out;
  // catch up: skip to the most recent occurrence that is not after today (one open, never a pile)
  let guard = 0;
  while (guard++ < 1000) { const n = nextOccurrence(rule, next); if (!n || day(n) > td) break; next = n; }
  const task = { status: TASK.open, due: next, templateId: template.id, from: 'recurring' };
  COPY.forEach(k => { if (template[k] != null && template[k] !== '') task[k] = Array.isArray(template[k]) ? template[k].slice() : template[k]; });
  if (Array.isArray(template.todos) && template.todos.length) task.todos = template.todos.map((x, i) => ({ id: 'td' + Date.now().toString(36) + i.toString(36), text: x.text, done: false }));
  if (template.duration && template.durationUnit) task.start = next; // the occurrence starts on its date; the screen may recompute due
  out.create = task;
  out.patch = { id: template.id, lastDue: next, made: made + 1 };
  return out;
}

/** The next dates of a rule for a preview, up to n. */
export function preview(rule, fromIso, n) {
  const out = []; let cur = fromIso ? iso(addDays(day(fromIso), -1)) : '';
  for (let i = 0; i < (n || 3); i++) { const d = nextOccurrence(rule, cur); if (!d) break; out.push(d); cur = d; }
  return out;
}
