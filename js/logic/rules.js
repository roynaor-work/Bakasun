/* Automatic reminders: pure rules over the data. `evaluate` turns the collections into a list of notifications,
   `pending` applies snooze / dismiss, `digestText` reads the list as one sentence. Nothing here writes or sends anything:
   every action is a draft she taps (a task, a WhatsApp text, a screen to open). Tested in tests/rules.test.mjs. */
import Office from './office.js';
import { str } from './core.js';
import { openTasks, callQueue, CALL, TASK, taskMessage, opening, signOff } from './extra.js';
import { silentSuppliers, quotesWaiting } from './dashboard.js';
import { QUOTE_STATUS } from './quotes.js';
import { rfqReminder } from './rfq.js';
import { openItems } from './openItems.js';
import { rsvpSummary } from './participants.js';
import { CONTRACT_STATUS } from './contracts.js';
import { PHASES } from './checklists.js';

const { day, iso, fmt, daysBetween, addDays } = Office;
const num = v => { const n = Office.num(v); return isNaN(n) ? 0 : n; };
const LANGS = ['he', 'fr', 'en'];
const LEVELS = { urgent: 0, warn: 1, info: 2 };

/* ---------------- settings ---------------- */

/** The rules and their defaults. `on` switches a rule off; the numbers are hers to tune (settings.rules). */
export const DEFAULT_RULES = {
  supSilent: { on: true, days: 2 },        // a supplier asked more than N days ago who did not answer
  quoteWait: { on: true, days: 3 },        // a quote sent N days ago without an answer
  quoteExpired: { on: true },              // a sent quote past its validUntil
  payLate: { on: true },                   // a client invoice past its due date and not paid
  supPay: { on: true, days: 3 },           // a supplier payment (budget line) due within N days
  event: { on: true },                     // an event in 14 / 7 / 1 days: open checklist items and missing suppliers
  taskLate: { on: true },                  // an open task past its date
  call: { on: true },                      // a callback due today
  rsvp: { on: true, days: 7, pct: 30 },    // event within N days and more than pct% still "invited"
  contract: { on: true, days: 10 },        // event within N days and the contract not signed
  digest: { on: true },                    // one morning summary per day
  readDigest: false,                       // read the digest aloud once a day
  quietFrom: '21:00', quietTo: '07:00'     // no browser notifications in between
};
/** Rule keys in the order the settings screen shows them, with which numbers each one has. */
export const RULE_KEYS = [
  ['supSilent', ['days']], ['quoteWait', ['days']], ['quoteExpired', []], ['payLate', []], ['supPay', ['days']], ['event', []],
  ['taskLate', []], ['call', []], ['rsvp', ['days', 'pct']], ['contract', ['days']], ['digest', []]
];

/** settings.rules merged over the defaults, numbers sanitised. */
export function ruleSettings(settings) {
  const r = (settings && settings.rules) || {};
  const out = {};
  Object.keys(DEFAULT_RULES).forEach(k => {
    const d = DEFAULT_RULES[k];
    if (d && typeof d === 'object') {
      const o = Object.assign({}, d, r[k] || {});
      o.on = r[k] && r[k].on !== undefined ? !!r[k].on && r[k].on !== 'false' : d.on;
      ['days', 'pct'].forEach(f => { if (d[f] !== undefined) { const n = +o[f]; o[f] = Number.isFinite(n) && n >= 0 ? n : d[f]; } });
      out[k] = o;
    } else if (typeof d === 'boolean') out[k] = r[k] === undefined ? d : !!r[k] && r[k] !== 'false';
    else out[k] = /^\d{1,2}:\d{2}$/.test(str(r[k])) ? Office.hhmm(r[k]) : d;
  });
  return out;
}

/** true when hh:mm falls inside the quiet window (which may wrap past midnight). */
export function inQuietHours(hhmm, from, to) {
  const m = s => { const x = /^(\d{1,2}):(\d{2})$/.exec(str(s).trim()); return x ? (+x[1]) * 60 + (+x[2]) : null; };
  const a = m(hhmm), f = m(from), t = m(to);
  if (a == null || f == null || t == null || f === t) return false;
  return f < t ? (a >= f && a < t) : (a >= f || a < t);
}

/* ---------------- the rules ---------------- */

function byId(list) { const m = {}; (list || []).forEach(x => { m[x.id] = x; }); return m; }
function eventOf(c) { return c ? [c.client, c.kind].filter(Boolean).join(' · ') + (day(c.date) ? ' · ' + fmt(c.date) : '') : ''; }
function isActive(c) { return !!c && Office.ACTIVE.includes(c.status); }

/**
 * data = {cases, tasks, calls, links, payments, quotes, checklists, contracts, participants, suppliers, budget}
 * today = a day; settings = the app settings (rules, lang, signer, msgLang).
 * Returns [{key, kind, level, title, body, href, caseId, when, actions: [{label, type, payload}]}], most urgent first, keys unique.
 */
export function evaluate(data, today, settings) {
  data = data || {};
  const t0 = day(today) || day(new Date()); const tIso = iso(t0);
  const s = settings || {};
  const R = ruleSettings(s);
  const L = LANGS.includes(s.lang) ? s.lang : 'he';
  const T = TEXT[L];
  const signer = str(s.signer);
  const cases = data.cases || []; const cs = byId(cases); const sups = byId(data.suppliers);
  const out = [];
  const clientLang = c => LANGS.includes(c && c.lang) ? c.lang : (LANGS.includes(s.msgLang) ? s.msgLang : 'he');
  const aTask = (title, due, caseId) => ({ label: T.aTask, type: 'task', payload: { title, due: due || tIso, caseId: caseId || '' } });
  const aWa = (phone, text, lang, name) => ({ label: T.aWhatsApp, type: 'whatsapp', payload: { phone: str(phone), text, lang, name: str(name) } });
  const aOpen = (href, label) => ({ label: label || T.aOpen, type: 'open', payload: { href } });
  const aDone = (payload, label) => ({ label: label || T.aDone, type: 'done', payload: payload || null });
  const say = (lang, name, body) => [opening(name, lang), body, signOff(signer, lang)].filter(Boolean).join('\n');

  // 1. a supplier we asked N days ago (or more) who did not answer: the dashboard's own list, its threshold is "more than"
  if (R.supSilent.on) silentSuppliers(data.links, cases, t0, Math.max(0, R.supSilent.days - 1)).forEach(l => {
    const c = cs[l.caseId]; const sp = sups[l.supplierId] || { name: l.supplier, phone: l.phone, contact: l.contact, lang: l.lang };
    const name = str(sp.name || l.supplier);
    out.push({
      key: 'sup-silent:' + l.id, kind: 'supSilent', level: l.waited > R.supSilent.days * 2 ? 'urgent' : 'warn',
      title: T.supSilent(name, l.waited), body: [eventOf(c), l.what].filter(Boolean).join(' · '),
      href: l.caseId ? '#/case/' + l.caseId + '/suppliers' : '#/suppliers', caseId: l.caseId || '', when: tIso,
      actions: [aWa(sp.phone, rfqReminder(c, sp, l.waited, { name: signer || undefined }), sp.lang || 'he', name), aTask(T.tRemind(name), tIso, l.caseId), aOpen('#/case/' + l.caseId + '/suppliers'), aDone({ col: 'links', id: l.id, patch: { answeredAt: tIso } }, T.aAnswered)]
    });
  });

  // 2. quotes: sent and waiting, or past their validity
  if (R.quoteWait.on) quotesWaiting(data.quotes, cases, t0).forEach(q => {
    if (q.waited == null || q.waited < R.quoteWait.days) return;
    const c = cs[q.caseId] || {}; const lg = clientLang(c);
    out.push({
      key: 'quote-wait:' + q.id, kind: 'quoteWait', level: q.waited >= R.quoteWait.days * 3 ? 'urgent' : 'warn',
      title: T.quoteWait(q.client, q.waited), body: [q.no ? T.quoteNo + ' ' + q.no : '', eventOf(c)].filter(Boolean).join(' · '),
      href: '#/quote/' + q.id, caseId: q.caseId || '', when: tIso,
      actions: [aWa(c.phone, say(lg, c.contact || q.client, WA[lg].quoteWait(c.date ? fmt(c.date) : '')), lg, q.client), aTask(T.tQuoteFollow(q.client), tIso, q.caseId), aOpen('#/quote/' + q.id), aDone(null)]
    });
  });
  if (R.quoteExpired.on) (data.quotes || []).forEach(q => {
    if (q.status !== QUOTE_STATUS.sent || !day(q.validUntil) || day(q.validUntil) >= t0) return;
    const c = cs[q.caseId] || {}; const lg = clientLang(c); const client = q.client || c.client || '';
    out.push({
      key: 'quote-expired:' + q.id, kind: 'quoteExpired', level: 'warn',
      title: T.quoteExpired(client), body: [T.validUntil + ' ' + fmt(q.validUntil), eventOf(c)].filter(Boolean).join(' · '),
      href: '#/quote/' + q.id, caseId: q.caseId || '', when: tIso,
      actions: [aWa(c.phone, say(lg, c.contact || client, WA[lg].quoteExpired(fmt(q.validUntil))), lg, client), aTask(T.tQuoteRenew(client), tIso, q.caseId), aOpen('#/quote/' + q.id), aDone(null)]
    });
  });

  // 3. a client invoice past its due date
  if (R.payLate.on) (data.payments || []).forEach(p => {
    if (p.status === Office.PAY.paid || !num(p.amount) || !day(p.due)) return;
    const late = daysBetween(p.due, t0); if (late <= 0) return;
    const c = cs[p.caseId] || {}; const client = p.client || c.client || ''; const lg = clientLang(c); const amt = Office.money(num(p.amount));
    out.push({
      key: 'pay-late:' + p.id, kind: 'payLate', level: late > 14 ? 'urgent' : 'warn',
      title: T.payLate(client), body: [amt, T.dueBy + ' ' + fmt(p.due) + ' (' + T.daysLate(late) + ')', str(p.status), eventOf(c)].filter(Boolean).join(' · '),
      href: '#/money', caseId: p.caseId || '', when: tIso,
      actions: [aWa(c.phone, say(lg, c.contact || client, WA[lg].payLate(amt, fmt(p.due))), lg, client), aTask(T.tCollect(client, amt), tIso, p.caseId), aOpen('#/money'), aDone({ col: 'payments', id: p.id, patch: { status: Office.PAY.paid } }, T.aPaid)]
    });
  });

  // 4. a supplier payment coming up (budget lines, when that module keeps them)
  if (R.supPay.on) (data.budget || []).forEach(b => {
    const due = day(b.dueDate || b.due); if (!due) return;
    if (Office.yes(b.paid) || /paid|שולם/i.test(str(b.status))) return;
    const n = daysBetween(t0, due); if (n > R.supPay.days) return;
    const c = cs[b.caseId]; const name = str(b.supplier || b.name || b.item || b.title);
    out.push({
      key: 'sup-pay:' + b.id, kind: 'supPay', level: n <= 0 ? 'urgent' : 'warn',
      title: T.supPay(name), body: [num(b.amount) ? Office.money(num(b.amount)) : '', T.dueBy + ' ' + fmt(due), eventOf(c)].filter(Boolean).join(' · '),
      href: b.caseId ? '#/budget/' + b.caseId : '#/money', caseId: b.caseId || '', when: iso(due) < tIso ? tIso : iso(due),
      actions: [aTask(T.tPay(name), iso(due), b.caseId), aOpen(b.caseId ? '#/budget/' + b.caseId : '#/money'), aDone(null)]
    });
  });

  // 5. an event in 14 / 7 / 1 days: what the checklist still has open, and what is missing on the supplier side
  if (R.event.on) cases.filter(c => isActive(c) && day(c.date)).forEach(c => {
    const n = daysBetween(t0, c.date); if (n < 0 || n > 14) return;
    const m = n <= 1 ? 1 : n <= 7 ? 7 : 14;
    const upto = PHASES.indexOf(m === 1 ? 'day' : m === 7 ? 'week' : 'before');
    const cl = (data.checklists || []).find(x => x.caseId === c.id);
    const open = cl ? (cl.items || []).filter(i => !i.done && PHASES.indexOf(i.phase) <= upto) : [];
    const sec = openItems(c, data, t0, L).sections.find(x => x.key === 'suppliers');
    const lines = [];
    if (open.length) lines.push(T.chkOpen(open.length) + ': ' + open.slice(0, 3).map(i => i.text).join(', ') + (open.length > 3 ? ' …' : ''));
    if (!cl) lines.push(T.noChecklist);
    (sec ? sec.items : []).slice(0, 3).forEach(x => lines.push(x.text));
    const busy = open.length || (sec && sec.items.length);
    out.push({
      key: 'event:' + c.id + ':' + m, kind: 'event', level: m === 1 ? 'urgent' : m === 7 && busy ? 'warn' : 'info',
      title: T.eventIn(n, eventOf(c)), body: lines.length ? lines.join('\n') : T.allSet,
      href: '#/case/' + c.id, caseId: c.id, when: tIso,
      actions: [aOpen('#/case/' + c.id + '/checklist', T.aChecklist), aTask(T.tPrepare(str(c.client)), tIso, c.id), aOpen('#/case/' + c.id), aDone(null)]
    });
  });

  // 6. tasks past their date
  if (R.taskLate.on) openTasks(data.tasks, t0).forEach(x => {
    if (x.late == null || x.late <= 0) return;
    const c = cs[x.caseId];
    const acts = [];
    if (x.phone) acts.push(aWa(x.phone, taskMessage(x, c, x.lang || (LANGS.includes(s.msgLang) ? s.msgLang : 'he'), signer), x.lang || 'he', x.who));
    acts.push(aOpen('#/tasks'), aDone({ col: 'tasks', id: x.id, patch: { status: TASK.done } }));
    out.push({
      key: 'task-late:' + x.id, kind: 'taskLate', level: x.late >= 3 ? 'urgent' : 'warn',
      title: T.taskLate(str(x.title)), body: [x.who, T.dueBy + ' ' + fmt(x.due) + ' (' + T.daysLate(x.late) + ')', eventOf(c)].filter(Boolean).join(' · '),
      href: '#/tasks', caseId: x.caseId || '', when: tIso, actions: acts
    });
  });

  // 7. callbacks due today (or missed)
  if (R.call.on) callQueue(data.calls, t0).now.forEach(k => {
    if (k.status !== CALL.callback || !day(k.callbackAt)) return;
    const c = cs[k.caseId];
    out.push({
      key: 'call:' + k.id, kind: 'call', level: 'warn',
      title: T.callBack(str(k.name)), body: [k.why, day(k.callbackAt) < t0 ? T.dueBy + ' ' + fmt(k.callbackAt) : '', eventOf(c)].filter(Boolean).join(' · '),
      href: '#/calls', caseId: k.caseId || '', when: tIso,
      actions: [aOpen('#/calls', T.aCall), aDone({ col: 'calls', id: k.id, patch: { status: CALL.answered } }, T.aAnswered)]
    });
  });

  // 8. participants: the event is close and too many did not answer
  if (R.rsvp.on) {
    const byCase = {}; (data.participants || []).forEach(p => { if (p.caseId) (byCase[p.caseId] = byCase[p.caseId] || []).push(p); });
    Object.keys(byCase).forEach(id => {
      const c = cs[id]; if (!isActive(c) || !day(c.date)) return;
      const n = daysBetween(t0, c.date); if (n < 0 || n > R.rsvp.days) return;
      const sum = rsvpSummary(byCase[id]); const pct = sum.total ? Math.round(sum.invited * 100 / sum.total) : 0;
      if (pct <= R.rsvp.pct) return;
      out.push({
        key: 'rsvp:' + id, kind: 'rsvp', level: n <= 2 ? 'urgent' : 'warn',
        title: T.rsvp(eventOf(c)), body: T.rsvpBody(sum.invited, sum.total, pct, n),
        href: '#/participants/' + id, caseId: id, when: tIso,
        actions: [aOpen('#/participants/' + id, T.aParticipants), aTask(T.tRsvp(str(c.client)), tIso, id), aDone(null)]
      });
    });
  }

  // 9. the contract is not signed and the event is close (one per case, the newest contract)
  if (R.contract.on) {
    const latest = {};
    (data.contracts || []).forEach(k => { if (!k.caseId) return; if (!latest[k.caseId] || str(k.created) > str(latest[k.caseId].created)) latest[k.caseId] = k; });
    Object.keys(latest).forEach(id => {
      const k = latest[id]; if (k.status === CONTRACT_STATUS.signed) return;
      const c = cs[id]; if (!isActive(c) || !day(c.date)) return;
      const n = daysBetween(t0, c.date); if (n < 0 || n > R.contract.days) return;
      const lg = clientLang(c);
      out.push({
        key: 'contract:' + id, kind: 'contract', level: n <= 3 ? 'urgent' : 'warn',
        title: T.contract(eventOf(c)), body: T.contractBody(n, k.status === CONTRACT_STATUS.sent),
        href: '#/contract/' + k.id, caseId: id, when: tIso,
        actions: [aWa(c.phone, say(lg, c.contact || c.client, WA[lg].contract(c.date ? fmt(c.date) : '')), lg, c.client), aTask(T.tContract(str(c.client)), tIso, id), aOpen('#/contract/' + k.id), aDone(null)]
      });
    });
  }

  const list = dedupe(out).sort(byUrgency);

  // 10. the morning digest: one per day, on top of everything else
  if (R.digest.on) list.unshift({
    key: 'digest:' + tIso, kind: 'digest', level: 'info', title: T.digestTitle, body: digestText(list, L),
    href: '#/notifications', caseId: '', when: tIso, actions: [aOpen('#/notifications', T.aList), aDone(null)]
  });
  return list;
}

function dedupe(list) { const seen = new Set(); return list.filter(n => !seen.has(n.key) && seen.add(n.key)); }
function byUrgency(a, b) { return (LEVELS[a.level] - LEVELS[b.level]) || str(a.when).localeCompare(str(b.when)) || str(a.title).localeCompare(str(b.title)); }

/* ---------------- state: seen, snoozed, dismissed ---------------- */
/* state = {key: {seen, snoozedUntil, dismissed}}; kept in db.setting('notifyState'). The functions return a new object. */

/** The notifications that are neither dismissed nor snoozed at `now` (an ISO day or date-time). */
export function pending(list, state, now) {
  const st = state || {}; const d = str(now).slice(0, 10) || iso(new Date());
  return (list || []).filter(n => {
    const x = st[n.key]; if (!x) return true;
    if (x.dismissed) return false;
    if (x.snoozedUntil && str(x.snoozedUntil).slice(0, 10) > d) return false;
    return true;
  });
}
export function snooze(state, key, untilIso) { return Object.assign({}, state, { [key]: Object.assign({}, (state || {})[key], { snoozedUntil: str(untilIso).slice(0, 10), dismissed: false }) }); }
export function dismiss(state, key) { return Object.assign({}, state, { [key]: Object.assign({}, (state || {})[key], { dismissed: true }) }); }
export function markSeen(state, keys, nowIso) {
  const out = Object.assign({}, state); const at = nowIso || new Date().toISOString();
  (keys || []).forEach(k => { out[k] = Object.assign({}, out[k], { seen: out[k] && out[k].seen ? out[k].seen : at }); });
  return out;
}
/** How many of the pending ones she has not seen yet: the badge number. */
export function unseen(list, state) { const st = state || {}; return (list || []).filter(n => !(st[n.key] && st[n.key].seen)).length; }
/** Drops the state of keys that no longer exist (keys starting with '_' are kept: the module's own notes). */
export function prune(state, liveKeys) { const keep = new Set(liveKeys || []); const out = {}; Object.keys(state || {}).forEach(k => { if (k.charAt(0) === '_' || keep.has(k)) out[k] = state[k]; }); return out; }
/** Snooze target: a day after today, or the day before the event. */
export function snoozeDate(today, days) { return iso(addDays(day(today) || new Date(), days)); }

/* ---------------- reading the list ---------------- */

/** {today, soon, later}: urgent items and items due today; within 7 days; the rest. */
export function groupByWhen(list, today) {
  const t0 = day(today) || day(new Date()); const tIso = iso(t0);
  const g = { today: [], soon: [], later: [] };
  (list || []).forEach(n => {
    const w = str(n.when).slice(0, 10);
    if (n.level === 'urgent' || !w || w <= tIso) g.today.push(n);
    else if (daysBetween(t0, w) <= 7) g.soon.push(n);
    else g.later.push(n);
  });
  return g;
}
export function counts(list) {
  const c = { total: 0, urgent: 0, warn: 0, info: 0 };
  (list || []).forEach(n => { if (n.kind === 'digest') return; c.total++; c[n.level] = (c[n.level] || 0) + 1; });
  return c;
}

/** One readable / spoken paragraph: how many, how many urgent, and a count per kind. */
export function digestText(list, lang) {
  const L = LANGS.includes(lang) ? lang : 'he'; const T = TEXT[L];
  const items = (list || []).filter(n => n.kind !== 'digest');
  if (!items.length) return T.digestEmpty;
  const c = counts(items);
  const per = {}; items.forEach(n => { per[n.kind] = (per[n.kind] || 0) + 1; });
  const parts = Object.keys(COUNT[L]).filter(k => per[k]).map(k => COUNT[L][k](per[k]));
  return T.digestIntro(c.total, c.urgent) + ' ' + parts.join(T.sep) + '.';
}

/* ---------------- texts (he / fr / en; no Arabic letters anywhere) ---------------- */

const days = { he: n => n === 1 ? 'יום' : n + ' ימים', fr: n => n + (n === 1 ? ' jour' : ' jours'), en: n => n + (n === 1 ? ' day' : ' days') };

const TEXT = {
  he: {
    aTask: 'משימה', aWhatsApp: 'וואטסאפ', aOpen: 'פתיחה', aDone: 'טופל', aAnswered: 'ענו', aPaid: 'שולם', aChecklist: 'רשימת תיוג', aCall: 'לשיחות', aParticipants: 'משתתפים', aList: 'לרשימה',
    supSilent: (n, d) => 'ספק לא ענה: ' + n + ' (' + days.he(d) + ')', tRemind: n => 'להזכיר ל' + n,
    quoteWait: (c, d) => 'הצעה מחכה לתשובה: ' + c + ' (' + days.he(d) + ')', quoteNo: 'הצעה', tQuoteFollow: c => 'לבדוק עם ' + c + ' לגבי ההצעה',
    quoteExpired: c => 'תוקף ההצעה פג: ' + c, validUntil: 'בתוקף עד', tQuoteRenew: c => 'לחדש הצעה ל' + c,
    payLate: c => 'חשבונית לא שולמה: ' + c, dueBy: 'עד', daysLate: n => 'איחור של ' + days.he(n), tCollect: (c, a) => 'לגבות ' + a + ' מ' + c,
    supPay: n => 'תשלום לספק: ' + n, tPay: n => 'להעביר תשלום ל' + n,
    eventIn: (n, ev) => (n === 0 ? 'האירוע היום: ' : n === 1 ? 'האירוע מחר: ' : 'האירוע בעוד ' + n + ' ימים: ') + ev, chkOpen: n => n + ' פריטים פתוחים ברשימה', noChecklist: 'אין עדיין רשימת תיוג לאירוע', allSet: 'הכל סגור. כל הכבוד.', tPrepare: c => 'הכנה אחרונה לאירוע של ' + c,
    taskLate: t => 'משימה באיחור: ' + t,
    callBack: n => 'לחזור היום: ' + n,
    rsvp: ev => 'אישורי הגעה: ' + ev, rsvpBody: (i, t, p, n) => i + ' מתוך ' + t + ' עדיין לא ענו (' + p + '%), האירוע בעוד ' + days.he(n), tRsvp: c => 'לבדוק אישורי הגעה, ' + c,
    contract: ev => 'חוזה לא חתום: ' + ev, contractBody: (n, sent) => (sent ? 'נשלח ללקוח ועוד לא נחתם' : 'טיוטה, עוד לא נשלח') + ' · האירוע בעוד ' + days.he(n), tContract: c => 'לסגור חוזה עם ' + c,
    digestTitle: 'סיכום הבוקר', digestEmpty: 'שקט. אין תזכורות היום.', digestIntro: (n, u) => 'בוקר טוב. יש ' + (n === 1 ? 'תזכורת אחת' : n + ' תזכורות') + (u ? ', ' + (u === 1 ? 'אחת דחופה' : u + ' דחופות') : '') + ':', sep: ', '
  },
  fr: {
    aTask: 'Tâche', aWhatsApp: 'WhatsApp', aOpen: 'Ouvrir', aDone: 'Réglé', aAnswered: 'A répondu', aPaid: 'Payé', aChecklist: 'Check-list', aCall: 'Appels', aParticipants: 'Participants', aList: 'La liste',
    supSilent: (n, d) => 'Fournisseur sans réponse : ' + n + ' (' + days.fr(d) + ')', tRemind: n => 'Relancer ' + n,
    quoteWait: (c, d) => 'Devis en attente : ' + c + ' (' + days.fr(d) + ')', quoteNo: 'Devis', tQuoteFollow: c => 'Relancer ' + c + ' pour le devis',
    quoteExpired: c => 'Devis expiré : ' + c, validUntil: 'Valable jusqu’au', tQuoteRenew: c => 'Renouveler le devis pour ' + c,
    payLate: c => 'Facture impayée : ' + c, dueBy: 'Pour le', daysLate: n => 'retard de ' + days.fr(n), tCollect: (c, a) => 'Encaisser ' + a + ' de ' + c,
    supPay: n => 'Paiement fournisseur : ' + n, tPay: n => 'Payer ' + n,
    eventIn: (n, ev) => (n === 0 ? 'L’événement est aujourd’hui : ' : n === 1 ? 'L’événement est demain : ' : 'Événement dans ' + n + ' jours : ') + ev, chkOpen: n => n + ' points ouverts dans la check-list', noChecklist: 'Pas encore de check-list pour l’événement', allSet: 'Tout est réglé. Bravo.', tPrepare: c => 'Derniers préparatifs pour ' + c,
    taskLate: t => 'Tâche en retard : ' + t,
    callBack: n => 'À rappeler aujourd’hui : ' + n,
    rsvp: ev => 'Confirmations : ' + ev, rsvpBody: (i, t, p, n) => i + ' sur ' + t + ' n’ont pas répondu (' + p + ' %), événement dans ' + days.fr(n), tRsvp: c => 'Vérifier les confirmations, ' + c,
    contract: ev => 'Contrat non signé : ' + ev, contractBody: (n, sent) => (sent ? 'Envoyé au client, pas encore signé' : 'Brouillon, pas encore envoyé') + ' · événement dans ' + days.fr(n), tContract: c => 'Conclure le contrat avec ' + c,
    digestTitle: 'Résumé du matin', digestEmpty: 'Rien en attente. Pas de rappel aujourd’hui.', digestIntro: (n, u) => 'Bonjour. Il y a ' + (n === 1 ? 'un rappel' : n + ' rappels') + (u ? ', dont ' + (u === 1 ? 'un urgent' : u + ' urgents') : '') + ' :', sep: ', '
  },
  en: {
    aTask: 'Task', aWhatsApp: 'WhatsApp', aOpen: 'Open', aDone: 'Done', aAnswered: 'Answered', aPaid: 'Paid', aChecklist: 'Checklist', aCall: 'Calls', aParticipants: 'Guests', aList: 'The list',
    supSilent: (n, d) => 'Supplier did not answer: ' + n + ' (' + days.en(d) + ')', tRemind: n => 'Remind ' + n,
    quoteWait: (c, d) => 'Quote waiting: ' + c + ' (' + days.en(d) + ')', quoteNo: 'Quote', tQuoteFollow: c => 'Follow up with ' + c + ' on the quote',
    quoteExpired: c => 'Quote expired: ' + c, validUntil: 'Valid until', tQuoteRenew: c => 'Renew the quote for ' + c,
    payLate: c => 'Invoice unpaid: ' + c, dueBy: 'Due', daysLate: n => days.en(n) + ' late', tCollect: (c, a) => 'Collect ' + a + ' from ' + c,
    supPay: n => 'Supplier payment: ' + n, tPay: n => 'Pay ' + n,
    eventIn: (n, ev) => (n === 0 ? 'The event is today: ' : n === 1 ? 'The event is tomorrow: ' : 'Event in ' + n + ' days: ') + ev, chkOpen: n => n + ' open checklist items', noChecklist: 'No checklist for the event yet', allSet: 'All set. Well done.', tPrepare: c => 'Final preparations for ' + c,
    taskLate: t => 'Task overdue: ' + t,
    callBack: n => 'Call back today: ' + n,
    rsvp: ev => 'RSVPs: ' + ev, rsvpBody: (i, t, p, n) => i + ' of ' + t + ' have not answered (' + p + '%), event in ' + days.en(n), tRsvp: c => 'Check RSVPs, ' + c,
    contract: ev => 'Contract not signed: ' + ev, contractBody: (n, sent) => (sent ? 'Sent to the client, not signed yet' : 'Draft, not sent yet') + ' · event in ' + days.en(n), tContract: c => 'Close the contract with ' + c,
    digestTitle: 'Morning summary', digestEmpty: 'Quiet. No reminders today.', digestIntro: (n, u) => 'Good morning. There ' + (n === 1 ? 'is one reminder' : 'are ' + n + ' reminders') + (u ? ', ' + (u === 1 ? 'one urgent' : u + ' urgent') : '') + ':', sep: ', '
  }
};

/* the count phrases of the digest, per kind */
const COUNT = {
  he: {
    supSilent: n => n === 1 ? 'ספק אחד לא ענה' : n + ' ספקים לא ענו', quoteWait: n => n === 1 ? 'הצעה אחת מחכה לתשובה' : n + ' הצעות מחכות לתשובה',
    quoteExpired: n => n === 1 ? 'הצעה אחת פג תוקפה' : n + ' הצעות פג תוקפן', payLate: n => n === 1 ? 'חשבונית אחת לא שולמה' : n + ' חשבוניות לא שולמו',
    supPay: n => n === 1 ? 'תשלום אחד לספק מתקרב' : n + ' תשלומים לספקים מתקרבים', event: n => n === 1 ? 'אירוע אחד קרוב' : n + ' אירועים קרובים',
    taskLate: n => n === 1 ? 'משימה אחת באיחור' : n + ' משימות באיחור', call: n => n === 1 ? 'שיחה אחת לחזור' : n + ' שיחות לחזור',
    rsvp: n => n === 1 ? 'אישורי הגעה חסרים לאירוע אחד' : 'אישורי הגעה חסרים ל-' + n + ' אירועים', contract: n => n === 1 ? 'חוזה אחד לא חתום' : n + ' חוזים לא חתומים'
  },
  fr: {
    supSilent: n => n === 1 ? 'un fournisseur sans réponse' : n + ' fournisseurs sans réponse', quoteWait: n => n === 1 ? 'un devis en attente' : n + ' devis en attente',
    quoteExpired: n => n === 1 ? 'un devis expiré' : n + ' devis expirés', payLate: n => n === 1 ? 'une facture impayée' : n + ' factures impayées',
    supPay: n => n === 1 ? 'un paiement fournisseur à venir' : n + ' paiements fournisseurs à venir', event: n => n === 1 ? 'un événement proche' : n + ' événements proches',
    taskLate: n => n === 1 ? 'une tâche en retard' : n + ' tâches en retard', call: n => n === 1 ? 'un appel à rappeler' : n + ' appels à rappeler',
    rsvp: n => n === 1 ? 'des confirmations manquent pour un événement' : 'des confirmations manquent pour ' + n + ' événements', contract: n => n === 1 ? 'un contrat non signé' : n + ' contrats non signés'
  },
  en: {
    supSilent: n => n === 1 ? 'one supplier did not answer' : n + ' suppliers did not answer', quoteWait: n => n === 1 ? 'one quote is waiting' : n + ' quotes are waiting',
    quoteExpired: n => n === 1 ? 'one quote expired' : n + ' quotes expired', payLate: n => n === 1 ? 'one invoice is unpaid' : n + ' invoices are unpaid',
    supPay: n => n === 1 ? 'one supplier payment is due' : n + ' supplier payments are due', event: n => n === 1 ? 'one event is close' : n + ' events are close',
    taskLate: n => n === 1 ? 'one task is overdue' : n + ' tasks are overdue', call: n => n === 1 ? 'one call to return' : n + ' calls to return',
    rsvp: n => n === 1 ? 'RSVPs are missing for one event' : 'RSVPs are missing for ' + n + ' events', contract: n => n === 1 ? 'one contract is not signed' : n + ' contracts are not signed'
  }
};

/* the WhatsApp drafts, in the recipient's language; she reads, edits and presses send */
const WA = {
  he: {
    quoteWait: d => 'רציתי לבדוק אם יצא לך לעבור על ההצעה' + (d ? ' לאירוע ב-' + d : '') + '. אשמח לענות על שאלות או להתאים מה שצריך.',
    quoteExpired: d => 'ההצעה ששלחתי הייתה בתוקף עד ' + d + '. אם זה עדיין רלוונטי, אשמח לעדכן ולשלוח הצעה מעודכנת.',
    payLate: (a, d) => 'תזכורת קטנה: החשבונית על סך ' + a + ' הייתה לתשלום עד ' + d + '. אשמח לדעת מתי צפויה ההעברה.',
    contract: d => 'ההסכם' + (d ? ' לאירוע ב-' + d : '') + ' מחכה לחתימה. אשמח שנסגור את זה לפני האירוע.'
  },
  fr: {
    quoteWait: d => 'Je voulais savoir si vous avez pu regarder le devis' + (d ? ' pour l’événement du ' + d : '') + '. Je reste disponible pour toute question ou ajustement.',
    quoteExpired: d => 'Le devis envoyé était valable jusqu’au ' + d + '. Si c’est toujours d’actualité, je vous envoie volontiers un devis mis à jour.',
    payLate: (a, d) => 'Petit rappel : la facture de ' + a + ' était à régler pour le ' + d + '. Pouvez-vous me dire quand le virement est prévu ?',
    contract: d => 'Le contrat' + (d ? ' pour l’événement du ' + d : '') + ' attend votre signature. J’aimerais le finaliser avant l’événement.'
  },
  en: {
    quoteWait: d => 'I wanted to check whether you had a chance to look at the quote' + (d ? ' for the event on ' + d : '') + '. Happy to answer questions or adjust anything.',
    quoteExpired: d => 'The quote I sent was valid until ' + d + '. If it is still relevant, I will gladly send an updated one.',
    payLate: (a, d) => 'A small reminder: the invoice of ' + a + ' was due on ' + d + '. Could you let me know when the transfer is expected?',
    contract: d => 'The contract' + (d ? ' for the event on ' + d : '') + ' is waiting for your signature. I would like to close it before the event.'
  }
};

export const KINDS = Object.keys(COUNT.he);
