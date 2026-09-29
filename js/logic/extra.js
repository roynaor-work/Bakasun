/* New logic that was not in Office.gs: the call queue, tasks handed to helpers, the client match,
   the search index, and the "today" list that joins everything. Pure functions; tested in tests/. */
import Office from './office.js';
import { trim, str, samePhone } from './core.js';

const { day, fmt, daysBetween } = Office;
function firstName(n) { return trim(n).split(' ')[0] || ''; }

/* ---------------- greeting and sign-off in the recipient's language ---------------- */
const HI = { he: 'היי', fr: 'Bonjour', en: 'Hi' };
const THANKS = { he: 'תודה', fr: 'Merci', en: 'Thanks' };
export function opening(name, lang) { const n = firstName(name); return (HI[lang] || HI.he) + (n ? ' ' + n : '') + ','; }
export function signOff(signer, lang) { return (THANKS[lang] || THANKS.he) + (signer ? '\n' + signer : ''); }

/* ---------------- the call queue ---------------- */
export const CALL = { todo: 'todo', noanswer: 'noanswer', answered: 'answered', callback: 'callback' };

/** Which calls she should make now, in order: callbacks due first (earliest), then new, then "no answer" with fewest attempts. */
export function callQueue(calls, today) {
  today = day(today) || day(new Date());
  const open = (calls || []).filter(c => c.status !== CALL.answered);
  const dueBack = c => c.status === CALL.callback && day(c.callbackAt) && day(c.callbackAt) <= today;
  const later = c => c.status === CALL.callback && day(c.callbackAt) && day(c.callbackAt) > today;
  const rank = c => dueBack(c) ? 0 : c.status === CALL.todo ? 1 : c.status === CALL.noanswer ? 2 : 3;
  const now = open.filter(c => !later(c)).sort((a, b) => rank(a) - rank(b) || (a.attempts || 0) - (b.attempts || 0) || str(a.created).localeCompare(str(b.created)));
  const scheduled = open.filter(later).sort((a, b) => str(a.callbackAt).localeCompare(str(b.callbackAt)));
  return { now, scheduled };
}

/** What happens to a call after an attempt. Returns the changed copy. */
export function callOutcome(call, outcome, extra) {
  const c = Object.assign({}, call, { attempts: (call.attempts || 0) + 1, lastTry: extra && extra.now ? extra.now : new Date().toISOString() });
  if (outcome === 'noanswer') { c.status = CALL.noanswer; }
  else if (outcome === 'answered') { c.status = CALL.answered; if (extra && extra.note != null) c.note = extra.note; }
  else if (outcome === 'callback') { c.status = CALL.callback; c.callbackAt = extra && extra.when ? Office.iso(extra.when) : Office.iso(Office.addDays(new Date(), 1)); }
  return c;
}

/** "I could not reach you" in the recipient's language, with what we need. */
export function noAnswerMessage(call, lang, signer) {
  const L = lang || 'he';
  const body = { he: 'ניסיתי להתקשר ולא הצלחתי לתפוס אותך.', fr: 'J’ai essayé de vous appeler sans succès.', en: 'I tried calling but could not reach you.' }[L];
  const why = trim(call.why) ? ({ he: 'רציתי לדבר על: ', fr: 'C’est au sujet de : ', en: 'It is about: ' }[L] + trim(call.why) + '.') : '';
  const when = { he: 'מתי נוח לך שאחזור?', fr: 'Quand puis-je vous rappeler ?', en: 'When is a good time to call back?' }[L];
  return [opening(call.name, L), body, why, when, signOff(signer, L)].filter(Boolean).join('\n');
}

/* ---------------- tasks handed to a helper ---------------- */
export const TASK = { open: 'open', sent: 'sent', done: 'done' };

/** The WhatsApp text that hands one task to a helper: what, exactly what, for which event, by when. */
export function taskMessage(task, cs, lang, signer) {
  const L = lang || 'he';
  const T = {
    he: { task: 'משימה', event: 'לאירוע', by: 'עד', details: 'מה בדיוק', confirm: 'תכתוב לי "קיבלתי" כשראית, וכשסיימת.' },
    fr: { task: 'Tâche', event: 'Pour l’événement', by: 'Pour le', details: 'Précisément', confirm: 'Écris-moi « reçu » quand tu l’as vu, et quand c’est fait.' },
    en: { task: 'Task', event: 'For the event', by: 'By', details: 'Exactly what', confirm: 'Reply “got it” when you see this, and again when it is done.' }
  }[L];
  const lines = [opening(task.who, L), T.task + ': ' + trim(task.title)];
  if (trim(task.details)) lines.push(T.details + ': ' + trim(task.details));
  if (cs) lines.push(T.event + ': ' + Office.eventLine(cs));
  if (task.due) lines.push(T.by + ' ' + fmt(task.due));
  lines.push(T.confirm, signOff(signer, L));
  return lines.join('\n');
}

/** Open tasks, overdue first. */
export function openTasks(tasks, today) {
  today = day(today) || day(new Date());
  return (tasks || []).filter(t => t.status !== TASK.done).map(t => Object.assign({}, t, { late: day(t.due) ? daysBetween(t.due, today) : null }))
    .sort((a, b) => (b.late == null ? -999 : b.late) - (a.late == null ? -999 : a.late) || str(a.created).localeCompare(str(b.created)));
}

/** Open tasks in the order a to-do app shows them: overdue, today, tomorrow, this week, later, no date.
 *  Returns [{key, items}] with empty groups left out; items keep their "late" count. */
export function groupTasks(open, today) {
  today = day(today) || day(new Date());
  const keyOf = t => { if (t.late == null) return 'nodate'; if (t.late > 0) return 'late'; if (t.late === 0) return 'today'; if (t.late === -1) return 'tomorrow'; if (t.late >= -6) return 'week'; return 'later'; };
  const order = ['late', 'today', 'tomorrow', 'week', 'later', 'nodate'];
  const g = {}; (open || []).forEach(t => { const k = keyOf(t); (g[k] = g[k] || []).push(t); });
  return order.filter(k => g[k]).map(k => ({ key: k, items: k === 'late' ? g[k] : g[k].slice().sort((a, b) => str(a.due).localeCompare(str(b.due)) || str(a.time).localeCompare(str(b.time))) }));
}

/* ---------------- clients ---------------- */

/** The existing client for a parsed lead (same phone, or same e-mail, or same company name), or null. */
export function matchClient(lead, clients) {
  const list = clients || [];
  if (lead.phone) { const m = list.find(c => samePhone(c.phone, lead.phone)); if (m) return m; }
  if (lead.email) { const e = trim(lead.email).toLowerCase(); const m = list.find(c => trim(c.email).toLowerCase() === e); if (m) return m; }
  if (trim(lead.client)) { const n = Office.normHe(lead.client); const m = list.find(c => Office.normHe(c.name) === n); if (m) return m; }
  return null;
}

/* ---------------- search index ---------------- */

/** Everything as {type, id, title, sub, text} for Office.search. */
export function searchDocs(data) {
  const docs = [];
  (data.cases || []).forEach(c => docs.push({ type: 'case', id: c.id, title: [c.client, c.contact].filter(Boolean).join(' · '), sub: [c.kind, fmt(c.date), c.place, c.status].filter(Boolean).join(' · '),
    text: [c.phone, c.email, c.purpose, c.notes, c.source, c.participants, c.budget].filter(Boolean).join(' ') }));
  (data.clients || []).forEach(c => docs.push({ type: 'client', id: c.id, title: c.name || '', sub: [c.contact, c.type].filter(Boolean).join(' · '), text: [c.phone, c.email, c.notes, c.address, c.legalName].filter(Boolean).join(' ') }));
  (data.calls || []).forEach(c => docs.push({ type: 'call', id: c.id, title: c.name || '', sub: c.why || '', text: [c.phone, c.note].filter(Boolean).join(' ') }));
  (data.tasks || []).forEach(x => docs.push({ type: 'task', id: x.id, title: x.title || '', sub: x.who || '', text: [x.details, x.phone].filter(Boolean).join(' ') }));
  (data.notes || []).forEach(n => docs.push({ type: 'note', id: n.id, title: n.aboutLabel || '', sub: n.text, text: '', about: n.about, aboutId: n.aboutId }));
  (data.suppliers || []).forEach(s => docs.push({ type: 'supplier', id: s.id, title: s.name || '', sub: [s.type, s.area].filter(Boolean).join(' · '), text: [s.contact, s.phone, s.email, s.notes].filter(Boolean).join(' ') }));
  return docs;
}

/* ---------------- today ---------------- */

/** The day's list: Office.today (events, follow-ups, money) plus the calls and tasks that are due. */
export function todayList(data, today, settings) {
  today = day(today) || day(new Date());
  const items = Office.today(data, today, settings || {});
  const q = callQueue(data.calls || [], today);
  const tasks = openTasks(data.tasks || [], today).filter(t => t.late != null && t.late >= 0);
  return { items, calls: q.now, tasks };
}
