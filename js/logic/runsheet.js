/* Run of show of the event day, call sheets per supplier / staff, and the day-of helpers (now / next / late, delays).
   Pure and tested (tests/runsheet.test.mjs). Nothing here sends anything: it prepares texts, she presses send.

   Record (collection 'runsheet', one per case):
   { id, caseId, version, updatedAt, importedIds: [schedule row ids already imported],
     days: [{ date: 'YYYY-MM-DD', notes: 'parking, entrance...', blocks: [
       { id, start: 'HH:MM', end: 'HH:MM', title, kind: 'arrival'|'session'|'meal'|'transport'|'break'|'setup'|'strike'|'other',
         place, owner (staff or supplier name), supplierId, staffName, phone, notes, cue (what must be ready), status: 'planned'|'done'|'late' } ] }] } */
import Office from './office.js';
import { str, trim } from './core.js';

export const KINDS = ['arrival', 'session', 'meal', 'transport', 'break', 'setup', 'strike', 'other'];
export const STATUS = ['planned', 'done', 'late'];
export const TEMPLATE_KINDS = ['seminar', 'conference', 'delegation', 'dinner'];

const pad2 = n => (n < 10 ? '0' : '') + n;
const mins = v => Office.minutes(v);
/** minutes after midnight → 'HH:MM', clamped to the same day */
export function hhmm(m) { m = Math.max(0, Math.min(1439, Math.round(m))); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
let seq = 0;
export function newId() { seq = (seq + 1) % 1000; return 'b' + Date.now().toString(36) + seq.toString(36); }
const firstName = n => trim(n).split(' ')[0] || '';
const ALL = /^(כולם|הצוות|all|tous|everyone)$/i;

/** A block with every field present. */
export function newBlock(b) {
  b = b || {};
  return { id: b.id || newId(), start: Office.hhmm(b.start || ''), end: Office.hhmm(b.end || ''), title: trim(b.title), kind: KINDS.includes(b.kind) ? b.kind : 'other',
    place: trim(b.place), owner: trim(b.owner), supplierId: str(b.supplierId), staffName: trim(b.staffName), phone: trim(b.phone), notes: str(b.notes).trim(), cue: str(b.cue).trim(), status: STATUS.includes(b.status) ? b.status : 'planned' };
}
export function newRecord(caseId, days) { return { caseId, version: 1, updatedAt: new Date().toISOString(), importedIds: [], days: days || [] }; }
export function dayOf(rec, date) { return (rec.days || []).find(d => d.date === date) || null; }
export function ensureDay(rec, date) { let d = dayOf(rec, date); if (!d) { d = { date, notes: '', blocks: [] }; rec.days = (rec.days || []).concat([d]).sort((a, b) => str(a.date).localeCompare(str(b.date))); } return d; }
export function allBlocks(rec) { return (rec.days || []).reduce((a, d) => a.concat(sortBlocks(d.blocks).map(b => Object.assign({ date: d.date }, b))), []); }

/** By start time, then end, then title. Blocks without a time go last. */
export function sortBlocks(blocks) {
  return (blocks || []).slice().sort((a, b) => {
    const sa = mins(a.start), sb = mins(b.start);
    if (sa == null && sb == null) return 0; if (sa == null) return 1; if (sb == null) return -1;
    return sa - sb || ((mins(a.end) == null ? 0 : mins(a.end)) - (mins(b.end) == null ? 0 : mins(b.end))) || str(a.title).localeCompare(str(b.title));
  });
}
/** End of a block for the clock: its end, else the start of the next block, else 30 minutes. */
export function effectiveEnd(sorted, i) {
  const b = sorted[i]; const s = mins(b.start); if (s == null) return null;
  const e = mins(b.end); if (e != null && e > s) return e;
  const nx = sorted.slice(i + 1).map(x => mins(x.start)).find(x => x != null && x > s);
  return nx != null ? nx : s + 30;
}

/** Kind of a block from its title (for the import of her schedule lines). */
export function guessKind(text) {
  const s = str(text);
  if (/פירוק|strike|démontage|demontage|teardown/i.test(s)) return 'strike';
  if (/הקמה|הקמת|setup|set-up|montage|installation|בדיקת סאונד|sound ?check/i.test(s)) return 'setup';
  if (/הסע|איסוף|אוטובוס|נסיע|transfer|bus|pickup|pick-up|transport|navette|trajet/i.test(s)) return 'transport';
  if (/ארוח|צהריים|בוקר|ערב\b|כיבוד|קפה|lunch|dinner|breakfast|coffee|repas|déjeuner|dejeuner|dîner|diner|pause[- ]café|meal/i.test(s)) return 'meal';
  if (/הפסק|break|pause/i.test(s)) return 'break';
  if (/הגע|רישום|קבלת פנים|צ'ק[- ]?אין|check[- ]?in|arrival|arrivée|arrivee|accueil|registration|inscription/i.test(s)) return 'arrival';
  if (trim(s)) return 'session';
  return 'other';
}

/** Her existing schedule lines (collection 'schedule': caseId, date, start, end, what, where, who) become blocks, once:
    rows whose id is already in rec.importedIds are skipped, so pressing "import" twice adds nothing. Returns {rec, added}. */
export function buildFromSchedule(caseRec, scheduleRows, existing) {
  const rec = existing ? Object.assign({}, existing, { days: (existing.days || []).map(d => Object.assign({}, d, { blocks: (d.blocks || []).slice() })), importedIds: (existing.importedIds || []).slice() }) : newRecord(caseRec.id);
  let added = 0;
  (scheduleRows || []).filter(r => r && r.caseId === caseRec.id).forEach(r => {
    const key = r.id || ('row:' + [r.date, r.start, r.what].join('|'));
    if (rec.importedIds.includes(key)) return;
    const date = Office.iso(r.date) || Office.iso(caseRec.date) || '';
    if (!date) return;
    const who = str(r.who).split(/[,;]+/).map(trim).filter(w => w && !ALL.test(w));
    const day = ensureDay(rec, date);
    day.blocks.push(newBlock({ start: r.start, end: r.end, title: r.what, kind: guessKind(r.what), place: r.where || r.place, owner: who[0] || '', notes: who.length > 1 ? who.slice(1).join(', ') : '' }));
    rec.importedIds.push(key); added++;
  });
  rec.days.forEach(d => { d.blocks = sortBlocks(d.blocks); });
  return { rec, added };
}

/** Two blocks of the same owner at the same time, or two content blocks in the same place at the same time. [{a, b, why: 'owner'|'place', who}] */
export function overlaps(blocks) {
  const s = sortBlocks(blocks).filter(b => mins(b.start) != null);
  const out = [];
  const content = k => !['arrival', 'setup', 'strike', 'transport', 'other'].includes(k);
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const a = s[i], b = s[j];
    const ae = effectiveEnd(s, i), bs = mins(b.start);
    if (bs >= ae) continue;
    const oa = trim(a.owner), ob = trim(b.owner), pa = trim(a.place), pb = trim(b.place);
    if (oa && ob && oa.toLowerCase() === ob.toLowerCase() && !ALL.test(oa)) out.push({ a, b, why: 'owner', who: oa });
    else if (pa && pb && pa.toLowerCase() === pb.toLowerCase() && content(a.kind) && content(b.kind)) out.push({ a, b, why: 'place', who: pa });
  }
  return out;
}

/** A delay: the block `fromId` and everything after it move by `minutes` (negative = earlier). Done blocks stay. Returns new blocks. */
export function shift(blocks, fromId, minutes) {
  const s = sortBlocks(blocks); const at = s.findIndex(b => b.id === fromId);
  if (at < 0 || !minutes) return s;
  const from = mins(s[at].start);
  return s.map((b, i) => {
    const st = mins(b.start);
    if (i < at || st == null || b.status === 'done' || (st < from)) return b;
    const en = mins(b.end);
    return Object.assign({}, b, { start: hhmm(st + minutes), end: en != null ? hhmm(en + minutes) : b.end });
  });
}

/** What is on now, what comes next, what should have ended already (for the day-of screen). Time is 'HH:MM'. */
export function nowNext(blocks, timeHHMM) {
  const s = sortBlocks(blocks); const t = mins(timeHHMM); if (t == null) return { now: null, next: null, late: [] };
  const open = s.map((b, i) => ({ b, i, st: mins(b.start), en: effectiveEnd(s, i) })).filter(x => x.st != null && x.b.status !== 'done');
  const cur = open.find(x => x.st <= t && t < x.en);
  const nx = open.find(x => x.st > t);
  const late = open.filter(x => x.en <= t).map(x => Object.assign({}, x.b, { lateBy: t - x.en }));
  return {
    now: cur ? Object.assign({}, cur.b, { elapsed: t - cur.st, remaining: cur.en - t, total: cur.en - cur.st }) : null,
    next: nx ? Object.assign({}, nx.b, { inMinutes: nx.st - t }) : null,
    late
  };
}

/** Everyone on the sheet: {name, phone, supplierId, count}, by first appearance. */
export function people(rec) {
  const out = [];
  allBlocks(rec).forEach(b => {
    const name = trim(b.owner) || trim(b.staffName); if (!name || ALL.test(name)) return;
    let p = out.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!p) { p = { name, phone: '', supplierId: '', count: 0 }; out.push(p); }
    if (!p.phone && trim(b.phone)) p.phone = trim(b.phone);
    if (!p.supplierId && b.supplierId) p.supplierId = b.supplierId;
    p.count++;
  });
  return out;
}
const isMine = (b, who) => { const w = trim(who).toLowerCase(); return !!w && ([b.owner, b.staffName].some(x => trim(x).toLowerCase() === w) || ALL.test(trim(b.owner))); };

/* ---------------- texts in her voice ---------------- */
const KIND_LABEL = {
  he: { arrival: 'הגעה', session: 'מושב', meal: 'ארוחה', transport: 'הסעה', break: 'הפסקה', setup: 'הקמה', strike: 'פירוק', other: 'אחר' },
  fr: { arrival: 'Arrivée', session: 'Session', meal: 'Repas', transport: 'Transport', break: 'Pause', setup: 'Montage', strike: 'Démontage', other: 'Autre' },
  en: { arrival: 'Arrival', session: 'Session', meal: 'Meal', transport: 'Transport', break: 'Break', setup: 'Setup', strike: 'Strike', other: 'Other' }
};
export function kindLabel(kind, lang) { return (KIND_LABEL[lang] || KIND_LABEL.he)[kind] || (KIND_LABEL[lang] || KIND_LABEL.he).other; }
function eventLine(cs, lang) {
  const kind = cs && cs.kind ? (lang === 'he' ? cs.kind : (cs.kindLabel || cs.kind)) : (lang === 'en' ? 'the event' : lang === 'fr' ? 'l’événement' : 'האירוע');
  return kind + (cs && cs.date ? (lang === 'he' ? ' ב-' : lang === 'fr' ? ' du ' : ' on ') + Office.fmt(cs.date) : '') + (cs && cs.place ? (lang === 'he' ? ' ב' : lang === 'fr' ? ' à ' : ' at ') + cs.place : '');
}
function blockLine(b, lang, withDate) {
  const time = Office.hhmm(b.start) + (mins(b.end) != null ? '-' + Office.hhmm(b.end) : '');
  const cue = trim(b.cue) ? ' (' + (lang === 'en' ? 'ready: ' : lang === 'fr' ? 'prêt : ' : 'מוכן: ') + trim(b.cue) + ')' : '';
  return '• ' + (withDate && b.date ? Office.fmt(b.date) + ' ' : '') + time + ' ' + trim(b.title) + (trim(b.place) ? ' · ' + trim(b.place) : '') + cue + (trim(b.notes) ? ' · ' + trim(b.notes) : '');
}
const multiDay = rec => (rec.days || []).filter(d => (d.blocks || []).length).length > 1;

/** The call sheet of one supplier or staff member: only their blocks, the arrival, the place and parking notes, and how to reach the producer.
    opts: {producer: 'וירג׳יני', phone: '054-...', signer} */
export function callSheetText(rec, cs, who, lang, opts) {
  lang = lang || 'he'; opts = opts || {}; cs = cs || {};
  const md = multiDay(rec);
  const blocks = allBlocks(rec).filter(b => isMine(b, who));
  const first = blocks[0];
  const arrivals = allBlocks(rec).filter(b => b.kind === 'arrival' && !isMine(b, who) && (!first || b.date === first.date));
  const notes = (rec.days || []).filter(d => trim(d.notes) && (!md || blocks.some(b => b.date === d.date))).map(d => (md ? Office.fmt(d.date) + ': ' : '') + trim(d.notes));
  const n = firstName(who);
  const producer = opts.producer || 'וירג׳יני', phone = opts.phone || '054-4974644';
  const T = lang === 'en' ? { open: 'Hi' + (n ? ' ' + n : '') + ', hope you are doing well!', intro: 'Your call sheet for ' + eventLine(cs, lang) + ':', arrive: 'Please be there by', arrivals: 'Arrivals that day', notes: 'Getting there / parking', contact: 'On the day I am on ' + phone + (producer ? ' (' + producer + ')' : '') + '. Call me for anything.', end: 'Please confirm you got this. Thank you!' }
    : lang === 'fr' ? { open: 'Bonjour' + (n ? ' ' + n : '') + ', j’espère que vous allez bien !', intro: 'Votre feuille de route pour ' + eventLine(cs, lang) + ' :', arrive: 'Merci d’être sur place à', arrivals: 'Arrivées ce jour-là', notes: 'Accès / parking', contact: 'Le jour J je suis au ' + phone + (producer ? ' (' + producer + ')' : '') + '. Appelez-moi pour tout.', end: 'Merci de me confirmer la réception. Merci beaucoup !' }
    : { open: 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך?', intro: 'דף הקריאה שלך ל' + eventLine(cs, lang) + ':', arrive: 'צריך להיות במקום עד', arrivals: 'הגעות באותו יום', notes: 'הגעה וחניה', contact: 'ביום האירוע אני על ' + phone + (producer ? ' (' + producer + ')' : '') + '. לכל דבר, תתקשרו.', end: 'אשמח לאישור שקיבלת בבקשה. תודה רבה!' };
  const parts = [T.open, T.intro];
  if (first && mins(first.start) != null) parts.push(T.arrive + ' ' + (md ? Office.fmt(first.date) + ' ' : '') + Office.hhmm(first.start) + (trim(first.place) ? ', ' + trim(first.place) : cs.place ? ', ' + cs.place : '') + '.');
  if (blocks.length) parts.push(blocks.map(b => blockLine(b, lang, md)).join('\n'));
  if (arrivals.length) parts.push(T.arrivals + ':\n' + arrivals.map(b => blockLine(b, lang, md)).join('\n'));
  if (notes.length) parts.push(T.notes + ': ' + notes.join(' · '));
  parts.push(T.contact, T.end);
  if (opts.signer) parts.push(opts.signer);
  return parts.join('\n');
}

/** The whole day, or days, as a text (WhatsApp to the client or the team). */
export function runsheetText(rec, cs, lang, opts) {
  lang = lang || 'he'; opts = opts || {}; cs = cs || {};
  const T = lang === 'en' ? { title: 'Run of show', by: 'by' } : lang === 'fr' ? { title: 'Déroulé de la journée', by: 'par' } : { title: 'לו״ז יום האירוע', by: 'אחראי' };
  const out = [T.title + ' · ' + [cs.client, eventLine(cs, lang)].filter(Boolean).join(' · ')];
  (rec.days || []).forEach(d => {
    const bl = sortBlocks(d.blocks); if (!bl.length) return;
    if (multiDay(rec)) out.push('', Office.fmt(d.date) + ':');
    bl.forEach(b => out.push(blockLine(b, lang) + (trim(b.owner) ? ' · ' + T.by + ': ' + trim(b.owner) : '')));
    if (trim(d.notes)) out.push((lang === 'en' ? 'Notes: ' : lang === 'fr' ? 'Notes : ' : 'הערות: ') + trim(d.notes));
  });
  if (opts.signer) out.push('', opts.signer);
  return out.join('\n');
}

/* ---------------- calendar ---------------- */
const icsEsc = s => str(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function stamp(date, m) { const d = Office.day(date); if (!d || m == null) return ''; const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m); return String(x.getFullYear()) + pad2(x.getMonth() + 1) + pad2(x.getDate()) + 'T' + pad2(x.getHours()) + pad2(x.getMinutes()) + '00'; }
/** One VEVENT per block, all in one .ics (floating local time, like js/logic/ics.js). */
export function toIcs(rec, cs) {
  cs = cs || {};
  const now = new Date(); const dt = stamp(now, now.getHours() * 60 + now.getMinutes());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baka San//Runsheet//HE', 'CALSCALE:GREGORIAN'];
  (rec.days || []).forEach(d => {
    const s = sortBlocks(d.blocks);
    s.forEach((b, i) => {
      const st = mins(b.start); if (st == null || !Office.day(d.date)) return;
      const en = effectiveEnd(s, i);
      const title = [trim(b.title), cs.client].filter(Boolean).join(' · ');
      lines.push('BEGIN:VEVENT', 'UID:bakasun-rs-' + b.id + '@bakasun', 'DTSTAMP:' + dt, 'DTSTART:' + stamp(d.date, st), 'DTEND:' + stamp(d.date, en), 'SUMMARY:' + icsEsc(title));
      const det = [trim(b.owner), trim(b.cue) ? 'מוכן: ' + trim(b.cue) : '', trim(b.notes), trim(b.phone)].filter(Boolean).join('\n');
      if (det) lines.push('DESCRIPTION:' + icsEsc(det));
      if (trim(b.place) || trim(cs.place)) lines.push('LOCATION:' + icsEsc(trim(b.place) || trim(cs.place)));
      lines.push('BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'END:VALARM', 'END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ---------------- templates ---------------- */
/** Her kind of event (Hebrew kind names, or a template name) → template name. */
export function templateKind(kind) {
  const k = str(kind).toLowerCase();
  if (TEMPLATE_KINDS.includes(k)) return k;
  if (/משלחת|סיור|delegation|tour|voyage/.test(k)) return 'delegation';
  if (/כנס|ועיד|conference|congr/.test(k)) return 'conference';
  if (/גיבוש|סמינר|יום עיון|seminar|séminaire|retreat|הרצאה/.test(k)) return 'seminar';
  if (/ערב|טעימ|חתונ|יום הולדת|מצווה|מסיבה|dinner|dîner|wedding|party|soirée|tasting/.test(k)) return 'dinner';
  if (/חברה|עמותה|רשות|ממשל|company|corporate/.test(k)) return 'seminar';
  return 'conference';
}
/* [offset minutes from the event start, duration, title he, kind, cue, title en, title fr] */
const TPL = {
  seminar: [[-120, 60, 'הגעת צוות ההפקה והקמה', 'setup', 'שילוט, תגי שם, רשימת משתתפים', 'Production team arrives, setup', 'Arrivée de l’équipe, montage'], [-90, 60, 'הגעת ספקים והקמה', 'setup', 'הגברה, מקרן ומסך, קייטרינג', 'Suppliers arrive, setup', 'Arrivée des fournisseurs, montage'],
    [-45, 30, 'בדיקת סאונד ומצגות', 'setup', 'מיקרופונים, מצגות של המרצים', 'Sound and slides check', 'Test son et présentations'], [0, 30, 'הגעה ורישום', 'arrival', 'שולחן רישום, תגי שם, קפה', 'Arrival and registration', 'Arrivée et inscription'],
    [30, 15, 'פתיחה', 'session', 'המנחה במקום, מצגת פתיחה', 'Opening', 'Ouverture'], [45, 90, 'מושב ראשון', 'session', '', 'First session', 'Première session'], [135, 20, 'הפסקת קפה', 'break', 'כיבוד מוגש', 'Coffee break', 'Pause café'],
    [155, 85, 'מושב שני', 'session', '', 'Second session', 'Deuxième session'], [240, 60, 'ארוחת צהריים', 'meal', 'שולחנות ערוכים, מנות מיוחדות', 'Lunch', 'Déjeuner'], [300, 90, 'סדנאות', 'session', 'חדרים לקבוצות', 'Workshops', 'Ateliers'],
    [390, 30, 'סיכום וסיום', 'session', '', 'Wrap-up and closing', 'Synthèse et clôture'], [420, 60, 'פירוק', 'strike', 'ציוד נאסף, חשבון סופי', 'Strike', 'Démontage']],
  conference: [[-150, 60, 'הגעת צוות ההפקה והקמה', 'setup', 'שילוט, במה, שולחן רישום', 'Production team arrives, setup', 'Arrivée de l’équipe, montage'], [-120, 60, 'הגעת ספקים והקמה', 'setup', 'הגברה, תאורה, מסכים', 'Suppliers arrive, setup', 'Arrivée des fournisseurs, montage'],
    [-60, 45, 'בדיקת סאונד ומצגות', 'setup', 'מיקרופונים, מצגות, קליקר', 'Sound and slides check', 'Test son et présentations'], [0, 45, 'הגעה, רישום וקפה', 'arrival', 'תגי שם לפי א-ב, כיבוד', 'Arrival, registration and coffee', 'Accueil, inscription et café'],
    [45, 30, 'פתיחה וברכות', 'session', 'המנחה, סדר הברכות', 'Opening and greetings', 'Ouverture'], [75, 75, 'מושב ראשון', 'session', '', 'First session', 'Première session'], [150, 20, 'הפסקת קפה', 'break', '', 'Coffee break', 'Pause café'],
    [170, 80, 'מושב שני', 'session', '', 'Second session', 'Deuxième session'], [250, 60, 'ארוחת צהריים', 'meal', 'מנות מיוחדות מסומנות', 'Lunch', 'Déjeuner'], [310, 90, 'מושב שלישי', 'session', '', 'Third session', 'Troisième session'],
    [400, 30, 'סיכום וסיום', 'session', '', 'Closing', 'Clôture'], [430, 90, 'פירוק', 'strike', '', 'Strike', 'Démontage']],
  delegation: [[-30, 30, 'הגעת צוות ההפקה', 'setup', 'שלטי אוטובוס, רשימת משתתפים', 'Production team arrives', 'Arrivée de l’équipe'], [0, 30, 'איסוף מהמלון', 'transport', 'אוטובוס במקום, מים', 'Pickup at the hotel', 'Départ de l’hôtel'],
    [30, 60, 'נסיעה', 'transport', '', 'Drive', 'Trajet'], [90, 120, 'ביקור ראשון', 'session', 'איש קשר במקום, מדריך', 'First visit', 'Première visite'], [210, 75, 'ארוחת צהריים', 'meal', 'הזמנה מאושרת, מנות מיוחדות', 'Lunch', 'Déjeuner'],
    [285, 45, 'נסיעה', 'transport', '', 'Drive', 'Trajet'], [330, 120, 'ביקור שני', 'session', '', 'Second visit', 'Deuxième visite'], [450, 60, 'חזרה למלון וצ׳ק-אין', 'arrival', 'רשימת חדרים במלון', 'Back to the hotel, check-in', 'Retour à l’hôtel, check-in'],
    [570, 150, 'ארוחת ערב', 'meal', 'שולחן שמור, תפריט מאושר', 'Dinner', 'Dîner']],
  dinner: [[-180, 90, 'הגעת ספקים והקמה', 'setup', 'שולחנות, עיצוב, הגברה', 'Suppliers arrive, setup', 'Arrivée des fournisseurs, montage'], [-90, 60, 'הגעת צוות ההפקה', 'setup', 'סדר הושבה, שילוט', 'Production team arrives', 'Arrivée de l’équipe'],
    [-45, 30, 'בדיקת סאונד', 'setup', 'מיקרופון למברכים, מוזיקה', 'Sound check', 'Test son'], [0, 45, 'קבלת פנים', 'arrival', 'שתייה ומעדנים מוגשים', 'Reception', 'Accueil'],
    [45, 15, 'ברכות', 'session', 'סדר המברכים, מיקרופון', 'Greetings', 'Discours'], [60, 120, 'ארוחת ערב', 'meal', 'מנות מיוחדות מסומנות', 'Dinner', 'Dîner'], [180, 60, 'תוכן ומוזיקה', 'session', '', 'Programme and music', 'Programme et musique'],
    [240, 30, 'סיום', 'session', '', 'Closing', 'Clôture'], [270, 60, 'פירוק', 'strike', 'ציוד נאסף, השטח נקי', 'Strike', 'Démontage']]
};
/** A starter day: blocks of the template around the event start (the first 'HH:MM' in `hours`, else 09:00, 19:00 for a dinner). */
export function template(kind, date, hours, lang) {
  const tk = templateKind(kind);
  const m = /(\d{1,2}[:.]\d{2})/.exec(str(hours)); let s0 = m ? mins(Office.hhmm(m[1])) : null;
  if (s0 == null) s0 = tk === 'dinner' ? 19 * 60 : 9 * 60;
  const blocks = TPL[tk].map(r => {
    const st = s0 + r[0]; if (st < 0 || st > 1439) return null;
    return newBlock({ start: hhmm(st), end: hhmm(Math.min(1439, st + r[1])), title: lang === 'en' ? r[5] : lang === 'fr' ? r[6] : r[2], kind: r[3], cue: lang === 'he' || !lang ? r[4] : '' });
  }).filter(Boolean);
  return { date: Office.iso(date) || '', notes: '', blocks: sortBlocks(blocks) };
}

/* ---------------- printable page (A4) ---------------- */
export function runsheetHtml(rec, cs, lang, T) {
  lang = lang || 'he'; cs = cs || {}; T = T || {};
  const e = s => str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rtl = lang === 'he', dir = rtl ? 'rtl' : 'ltr', align = rtl ? 'right' : 'left';
  const L = Object.assign({ title: 'לו״ז יום האירוע', client: 'לקוח', event: 'אירוע', date: 'תאריך', place: 'מקום', time: 'שעה', what: 'מה', where: 'איפה', who: 'אחראי', cue: 'מה צריך להיות מוכן', notes: 'הערות', phone: 'טלפון', producer: 'הפקה' }, T);
  const head = [[L.client, cs.client], [L.event, cs.kind], [L.date, cs.date ? Office.fmt(cs.date) : ''], [L.place, cs.place], [L.producer, T.producerLine]].filter(x => trim(x[1]));
  const days = (rec.days || []).filter(d => (d.blocks || []).length).map(d => {
    const rows = sortBlocks(d.blocks).map(b => '<tr class="k-' + e(b.kind) + '"><td class="n">' + e(Office.hhmm(b.start) + (mins(b.end) != null ? '–' + Office.hhmm(b.end) : '')) + '</td><td><b>' + e(b.title) + '</b>' + (trim(b.notes) ? '<div class="small">' + e(b.notes) + '</div>' : '') + '</td><td>' + e(b.place) + '</td><td>' + e(b.owner) + (trim(b.phone) ? '<div class="small ltr">' + e(b.phone) + '</div>' : '') + '</td><td>' + e(b.cue) + '</td></tr>').join('');
    return (multiDay(rec) ? '<h2>' + e(Office.fmt(d.date)) + '</h2>' : '') + '<table><thead><tr><th class="n">' + e(L.time) + '</th><th>' + e(L.what) + '</th><th>' + e(L.where) + '</th><th>' + e(L.who) + '</th><th>' + e(L.cue) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' + (trim(d.notes) ? '<p class="small"><b>' + e(L.notes) + ':</b> ' + e(d.notes) + '</p>' : '');
  }).join('');
  return '<!DOCTYPE html><html dir="' + dir + '" lang="' + lang + '"><head><meta charset="utf-8"><title>' + e(L.title) + '</title><style>' +
    'body{font-family:Arial,"Noto Sans Hebrew",sans-serif;color:#17120F;font-size:12px;line-height:1.45;margin:22px;direction:' + dir + ';text-align:' + align + '}' +
    '.top{border-bottom:3px solid #C4352A;padding-bottom:8px;margin-bottom:12px}h1{font-size:21px;margin:0 0 4px}h2{font-size:15px;margin:16px 0 4px}.small{color:#6E6359;font-size:10.5px}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border-bottom:1px solid #E2D8C8;padding:5px 7px;text-align:' + align + ';vertical-align:top}th{background:#17120F;color:#fff;font-size:11px}' +
    'td.n,th.n{white-space:nowrap;direction:ltr;unicode-bidi:isolate;text-align:' + align + ';font-weight:bold;width:6.5em}.info td{border:0;padding:1px 6px 1px 0}' +
    'tr.k-meal td,tr.k-break td{background:#FBF3DF}tr.k-setup td,tr.k-strike td{background:#F3EEE5}tr.k-arrival td{background:#E6F5EA}tr.k-transport td{background:#E9F2FB}' +
    '.ltr{direction:ltr;display:inline-block;unicode-bidi:isolate}@media print{body{margin:10mm}}</style></head><body>' +
    '<div class="top"><h1>' + e(L.title) + '</h1><table class="info">' + head.map(x => '<tr><td><b>' + e(x[0]) + '</b></td><td>' + e(x[1]) + '</td></tr>').join('') + '</table></div>' + days + '</body></html>';
}
