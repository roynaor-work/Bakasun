/* Need number four: the print and branding list of an event (name tags, programmes, signs, notebooks and pens),
   with sizes, quantities, the order to the printer and the confirmation she waits for. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

export const PRINT_STATUS = { plan: 'לתכנן', ordered: 'הוזמן', confirmed: 'אושר', ready: 'מוכן', received: 'התקבל' };

/** What an event of this kind usually needs. [item, size, qty rule ('participants' | number)]. */
export const PRINT_SEED = {
  'כנס': [['תגי שם', '9x6 ס״מ עם שרוך', 'participants'], ['תוכנייה', 'A5 מקופל', 'participants'], ['לו״ז קטן לכיס', '10x7 ס״מ', 'participants'], ['שלט כניסה', 'רול-אפ 85x200', 1], ['שלטי הכוונה', 'A3 קאפה', 4], ['ביגים', '2 מטר', 2]],
  'יום עיון': [['תגי שם', '9x6 ס״מ עם שרוך', 'participants'], ['תוכנייה', 'A5', 'participants'], ['שלט כניסה', 'רול-אפ 85x200', 1], ['שלטי הכוונה', 'A3 קאפה', 3]],
  'סמינר': [['תגי שם', '9x6 ס״מ עם שרוך', 'participants'], ['לו״ז', 'A4', 'participants'], ['מחברות ועטים ממותגים', 'A5', 'participants'], ['שלט חדר', 'A4 קאפה', 2]],
  'משלחת או סיור': [['תגי שם', '9x6 ס״מ עם שרוך', 'participants'], ['מחברות ועטים ממותגים', 'A5', 'participants'], ['תוכנייה באנגלית', 'A5 מקופל', 'participants'], ['שלט לאוטובוס', 'A3 למינציה', 2], ['תגי מזוודה', '', 'participants']],
  'יום גיבוש': [['שלטי הכוונה', 'A3 קאפה', 4], ['ביגים', '2 מטר', 2], ['כובעים ממותגים', '', 'participants']],
  'חתונה': [['תפריטים', 'A5', 'participants'], ['שלט קבלת פנים', 'רול-אפ', 1], ['סידורי הושבה', 'A2 קאפה', 1]],
  'הכל': [['תגי שם', '9x6 ס״מ עם שרוך', 'participants'], ['שלטי הכוונה', 'A3 קאפה', 3]]
};
/** Which seed list fits the kind of event (Hebrew kind names; falls back to the general list). */
export function printSeedFor(kind, participants) {
  const k = str(kind); const n = Office.num(participants) || 0;
  const key = Object.keys(PRINT_SEED).find(x => x !== 'הכל' && (k.indexOf(x) >= 0 || (x === 'משלחת או סיור' && /משלחת|סיור|delegation|tour/i.test(k)) || (x === 'כנס' && /conference|ועידה/i.test(k)) || (x === 'סמינר' && /seminar|השתלמות/i.test(k)) || (x === 'יום עיון' && /מפגש|ערב|הרצאה|meeting/i.test(k)))) || 'הכל';
  return PRINT_SEED[key].map(([item, size, rule]) => ({ item, size, qty: rule === 'participants' ? (n ? n + Math.max(2, Math.round(n * 0.05)) : '') : rule, status: PRINT_STATUS.plan }));
}

/** The order to the printer in her voice: one line per item, with sizes and quantities, ready-by date and the files. */
export function printOrderText(cs, sup, items, opts) {
  opts = opts || {}; const n = trim(sup && (sup.contact || sup.name)).split(' ')[0]; const who = opts.name || 'וירג׳יני';
  const org = opts.asClient !== false && cs && cs.client ? cs.client : 'באקה סאן';
  const ev = cs ? [cs.kind, cs.date ? Office.fmt(cs.date) : ''].filter(Boolean).join(' · ') : '';
  const lines = (items || []).filter(i => trim(i.item)).map(i => '• ' + trim(i.item) + (Office.num(i.qty) ? ' · ' + Office.num(i.qty) + ' יח׳' : '') + (trim(i.size) ? ' · ' + trim(i.size) : '') + (trim(i.notes) ? ' · ' + trim(i.notes) : ''));
  return ['היי' + (n ? ' ' + n : '') + ', מה שלומך?', 'הזמנה ל' + org + (ev ? ', ' + ev : '') + ':', ...lines,
    opts.due ? 'צריך מוכן עד ' + Office.fmt(opts.due) + '.' : '', opts.files ? 'הקבצים: ' + opts.files : 'הקבצים לגרפיקה יגיעו במייל נפרד.',
    'אשמח לאישור הזמנה עם מחיר לפני ההדפסה. תודה רבה!', who + ' ' + (opts.phone || '054-4974644')].filter(Boolean).join('\n');
}
export function printOrderSubject(cs) { return 'הזמנת דפוס' + (cs && cs.client ? ' · ' + cs.client : '') + (cs && cs.date ? ' · ' + Office.fmt(cs.date) : ''); }

/** Orders sent and not confirmed for at least `days` days (default 2), oldest first. */
export function pendingPrint(items, cases, today, days) {
  const t = Office.day(today) || Office.day(new Date()); const d = isNaN(Office.num(days)) ? 2 : Office.num(days);
  const byId = {}; (cases || []).forEach(c => { byId[c.id] = c; });
  const byCase = {};
  (items || []).filter(i => i.status === PRINT_STATUS.ordered && i.orderedAt).forEach(i => { const w = Office.daysBetween(i.orderedAt, t); const k = i.caseId + '|' + (i.supplierId || ''); (byCase[k] = byCase[k] || { caseId: i.caseId, supplierId: i.supplierId, cs: byId[i.caseId] || {}, items: [], waited: 0 }); byCase[k].items.push(i); byCase[k].waited = Math.max(byCase[k].waited, w); });
  return Object.values(byCase).filter(g => g.waited >= d).sort((a, b) => b.waited - a.waited);
}
/** Totals for the list header. */
export function printSummary(items) {
  const list = items || [];
  return { total: list.length, ordered: list.filter(i => i.status === PRINT_STATUS.ordered).length, confirmed: list.filter(i => i.status === PRINT_STATUS.confirmed || i.status === PRINT_STATUS.ready || i.status === PRINT_STATUS.received).length, ready: list.filter(i => i.status === PRINT_STATUS.ready || i.status === PRINT_STATUS.received).length, cost: list.reduce((a, i) => a + (Office.num(i.cost) || 0), 0) };
}
