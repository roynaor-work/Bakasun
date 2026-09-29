/* Event checklists: the template per kind of event, the record of one event, progress, what is due soon,
   and "refresh from the template" that only adds what is missing. Pure; tested in tests/checklists.test.mjs. */
import Office from './office.js';
import { TASK } from './extra.js';
import { BASE, BY_KIND } from '../data/checklistTemplates.js';

export const PHASES = ['before', 'week', 'day', 'after'];
const norm = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');

/* A short stable id from the text, so the same template item gets the same id on every device. */
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
export function itemId(text, phase) { return 'k' + phase + '-' + hash(norm(text)); }

/** Which template key fits the kind (exact key first, then words that mean the same, then the generic list). */
export function templateKey(kind) {
  const k = norm(kind);
  if (BY_KIND[k]) return k;
  if (/כנס|conference|conférence|ועידה|יום עיון|סמינר|seminar|séminaire|הרצא/i.test(k)) return 'כנס';
  if (/גיבוש|team|offsite|נופש|סדנ/i.test(k)) return 'יום גיבוש';
  if (/משלחת|סיור|delegation|délégation|tour|visite|טיול/i.test(k)) return 'משלחת או סיור';
  if (/חתונה|wedding|mariage/i.test(k)) return 'חתונה';
  if (/עמותה|nonprofit|associati/i.test(k)) return 'אירוע לעמותה';
  if (/רשות|עירי|משרד|ממשל|municipal|government|public/i.test(k)) return 'אירוע לרשות או משרד ממשלתי';
  if (/חברה|company|entreprise|corporate/i.test(k)) return 'אירוע חברה';
  if (/טעימ|tasting|dégustation|ארוחת ערב|dinner|dîner/i.test(k)) return 'ערב טעימות';
  if (/מצווה|mitzva|mitsva/i.test(k)) return 'בר או בת מצווה';
  if (/יום הולדת|birthday|anniversaire/i.test(k)) return 'יום הולדת';
  if (/בית פרטי|private|privée/i.test(k)) return 'מסיבה בבית פרטי';
  return 'default';
}

/** The full template for a kind: the base list plus the kind's own items, in phase order. Fresh copies. */
export function templateFor(kind) {
  const key = templateKey(kind);
  const all = BASE.concat(BY_KIND[key] || []);
  return PHASES.flatMap(p => all.filter(i => i.phase === p).map(i => ({ text: i.text, phase: i.phase, lead: i.lead })));
}

/** The due date of an item from the event date: 'before' and 'week' count back, 'day' is the day, 'after' counts forward. */
export function dueFor(eventDate, phase, lead) {
  const d = Office.day(eventDate); if (!d) return '';
  const n = Number.isFinite(+lead) && lead !== '' && lead != null ? +lead : ({ before: 30, week: 7, day: 0, after: 3 }[phase] || 0);
  return Office.iso(Office.addDays(d, phase === 'after' ? n : -n));
}

function fromTemplate(tpl, caseRec) {
  return { id: itemId(tpl.text, tpl.phase), text: tpl.text, phase: tpl.phase, lead: tpl.lead, done: false, due: dueFor(caseRec && caseRec.date, tpl.phase, tpl.lead), taskId: '' };
}

/** A new checklist record for a case (not saved). */
export function buildChecklist(caseRec) {
  const c = caseRec || {};
  return { caseId: c.id || '', kind: c.kind || '', templateKey: templateKey(c.kind), items: templateFor(c.kind).map(tpl => fromTemplate(tpl, c)) };
}

/** A custom item she typed. lead is null, so the due date is hers and never recomputed. */
export function customItem(text, phase, due) {
  const p = PHASES.includes(phase) ? phase : 'before';
  return { id: 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), text: norm(text), phase: p, lead: null, done: false, due: Office.iso(due) || '', taskId: '', custom: true };
}

/** {done, total, pct} */
export function progress(checklist) {
  const items = (checklist && checklist.items) || [];
  const done = items.filter(i => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round(done * 100 / items.length) : 0 };
}

/** Open items due within `days` days (default 7) or already late, earliest first. Each gets `late` (days past due, 0 if not). */
export function dueSoon(checklist, today, days) {
  const t = Office.day(today) || Office.day(new Date());
  const n = Number.isFinite(+days) && days != null ? +days : 7;
  return ((checklist && checklist.items) || []).filter(i => !i.done && Office.day(i.due) && Office.daysBetween(t, i.due) <= n)
    .map(i => Object.assign({}, i, { late: Math.max(0, Office.daysBetween(i.due, t)) }))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
}

/** Items grouped by phase, in phase order: [{phase, items}] (empty phases included). */
export function byPhase(checklist) {
  const items = (checklist && checklist.items) || [];
  return PHASES.map(phase => ({ phase, items: items.filter(i => i.phase === phase) }));
}

/** Refresh from the template: adds the template items that are missing (by text), keeps every existing item and its tick,
    and recomputes the due date of open template items (lead known) when the event date is known. Returns {checklist, added}. */
export function addMissing(checklist, caseRec) {
  const c = caseRec || {};
  const have = new Set(((checklist && checklist.items) || []).map(i => norm(i.text)));
  const fresh = templateFor(c.kind || (checklist && checklist.kind)).filter(tpl => !have.has(norm(tpl.text))).map(tpl => fromTemplate(tpl, c));
  const kept = ((checklist && checklist.items) || []).map(i => {
    if (i.done || i.lead == null || !c.date) return i;
    return Object.assign({}, i, { due: dueFor(c.date, i.phase, i.lead) });
  });
  const items = kept.concat(fresh);
  return { checklist: Object.assign({}, checklist, { kind: c.kind || (checklist && checklist.kind) || '', items: PHASES.flatMap(p => items.filter(i => i.phase === p)) }), added: fresh.length };
}

/** The item with its tick flipped (and when). */
export function toggle(item, when) {
  const done = !item.done;
  return Object.assign({}, item, { done, doneAt: done ? (when || new Date().toISOString()) : '' });
}

/** A task record for the tasks collection from one item. */
export function taskFromItem(item, caseRec, who) {
  const c = caseRec || {};
  return { title: norm(item.text), due: item.due || '', caseId: c.id || '', who: who || '', status: TASK.open, from: 'checklist', itemId: item.id };
}
