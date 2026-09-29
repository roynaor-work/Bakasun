/* Activity history: every real change to a record becomes one compact entry in the 'history' collection
   ({col, refId, caseId, at, summary, changes:[{field, from, to}], isNew|deleted}). Nothing here is ever edited or deleted by hand;
   the store only keeps the newest CAP entries. describe() renders an entry in the three languages. */
import { db, setHistoryHook, nowIso } from '../store.js';

export const CAP = 2000;
const SKIP_COLS = ['receipts', 'history'];
const SKIP_FIELDS = ['updated', 'created', 'id'];
const MAX_LEN = 60;

const COL_NAMES = {
  cases: { he: 'תיק', fr: 'Dossier', en: 'Event' }, clients: { he: 'לקוח', fr: 'Client', en: 'Client' }, calls: { he: 'שיחה', fr: 'Appel', en: 'Call' },
  tasks: { he: 'משימה', fr: 'Tâche', en: 'Task' }, quotes: { he: 'הצעת מחיר', fr: 'Devis', en: 'Quote' }, suppliers: { he: 'ספק', fr: 'Fournisseur', en: 'Supplier' },
  links: { he: 'ספק לאירוע', fr: 'Fournisseur du dossier', en: 'Event supplier' }, schedule: { he: 'לו"ז', fr: 'Programme', en: 'Schedule' },
  staff: { he: 'איש צוות', fr: 'Équipier', en: 'Staff' }, payments: { he: 'תשלום', fr: 'Paiement', en: 'Payment' }, checks: { he: 'בדיקה', fr: 'Contrôle', en: 'Check' },
  groups: { he: 'קבוצה', fr: 'Groupe', en: 'Group' }, catalog: { he: 'קטלוג', fr: 'Catalogue', en: 'Catalog' }, notes: { he: 'הערה', fr: 'Note', en: 'Note' },
  approvals: { he: 'אישור', fr: 'Confirmation', en: 'Approval' }, team: { he: 'צוות', fr: 'Équipe', en: 'Team' }, contacts: { he: 'איש קשר', fr: 'Contact', en: 'Contact' },
  print: { he: 'הדפסה', fr: 'Impression', en: 'Print' }, participants: { he: 'משתתף', fr: 'Participant', en: 'Participant' },
  contracts: { he: 'חוזה', fr: 'Contrat', en: 'Contract' }, checklists: { he: 'רשימה', fr: 'Liste', en: 'Checklist' }
};
const FIELD_NAMES = {
  date: { he: 'תאריך', fr: 'Date', en: 'Date' }, place: { he: 'מקום', fr: 'Lieu', en: 'Place' }, status: { he: 'סטטוס', fr: 'Statut', en: 'Status' },
  participants: { he: 'משתתפים', fr: 'Participants', en: 'Participants' }, budget: { he: 'תקציב', fr: 'Budget', en: 'Budget' }, title: { he: 'כותרת', fr: 'Titre', en: 'Title' },
  due: { he: 'עד מתי', fr: 'Échéance', en: 'Due' }, amount: { he: 'סכום', fr: 'Montant', en: 'Amount' }, time: { he: 'שעה', fr: 'Heure', en: 'Time' },
  who: { he: 'מי', fr: 'Qui', en: 'Who' }, client: { he: 'לקוח', fr: 'Client', en: 'Client' }, contact: { he: 'איש קשר', fr: 'Contact', en: 'Contact' },
  phone: { he: 'טלפון', fr: 'Téléphone', en: 'Phone' }, email: { he: 'מייל', fr: 'E-mail', en: 'E-mail' }, kind: { he: 'סוג אירוע', fr: 'Type', en: 'Kind' },
  hours: { he: 'שעות', fr: 'Horaires', en: 'Hours' }, notes: { he: 'הערות', fr: 'Notes', en: 'Notes' }, cost: { he: 'עלות', fr: 'Coût', en: 'Cost' },
  what: { he: 'מה', fr: 'Quoi', en: 'What' }, when: { he: 'מתי', fr: 'Quand', en: 'When' }, name: { he: 'שם', fr: 'Nom', en: 'Name' },
  details: { he: 'פרטים', fr: 'Détails', en: 'Details' }, text: { he: 'טקסט', fr: 'Texte', en: 'Text' }, supplier: { he: 'ספק', fr: 'Fournisseur', en: 'Supplier' },
  paidAt: { he: 'שולם ב', fr: 'Payé le', en: 'Paid on' }, invoicedAt: { he: 'חשבונית ב', fr: 'Facturé le', en: 'Invoiced on' }, answeredAt: { he: 'ענה ב', fr: 'Répondu le', en: 'Answered on' },
  why: { he: 'מה צריך', fr: 'Objet', en: 'Why' }, caseId: { he: 'תיק', fr: 'Dossier', en: 'Event' }, lang: { he: 'שפה', fr: 'Langue', en: 'Language' },
  total: { he: 'סה"כ', fr: 'Total', en: 'Total' }, lines: { he: 'שורות', fr: 'Lignes', en: 'Lines' }, items: { he: 'פריטים', fr: 'Éléments', en: 'Items' }
};
const WORDS = {
  he: { created: 'נוצר', deleted: 'נמחק', changed: 'עודכן', empty: 'ריק', arrow: '←' },
  fr: { created: 'créé', deleted: 'supprimé', changed: 'modifié', empty: 'vide', arrow: '→' },
  en: { created: 'created', deleted: 'deleted', changed: 'changed', empty: 'empty', arrow: '→' }
};

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
function norm(v) {
  if (isEmpty(v)) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
/** A short, storable form of a value (long texts are cut, objects become a count). */
function compact(v) {
  if (isEmpty(v)) return '';
  if (Array.isArray(v)) return '[' + v.length + ']';
  if (typeof v === 'object') return '{…}';
  const s = String(v);
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN - 1) + '…' : s;
}

/** The fields that really changed between two records: [{field, from, to}]. */
export function diff(before, after) {
  before = before || {}; after = after || {};
  const keys = Object.keys(Object.assign({}, before, after)).filter(k => !SKIP_FIELDS.includes(k));
  const out = [];
  keys.forEach(k => {
    const a = norm(before[k]), b = norm(after[k]);
    if (a !== b) out.push({ field: k, from: compact(before[k]), to: compact(after[k]) });
  });
  return out;
}

/** A label for the record itself: the client, the title, the name... */
export function labelOf(col, rec) {
  rec = rec || {};
  const v = col === 'cases' ? rec.client : rec.title || rec.name || rec.client || rec.who || rec.supplier || rec.what || rec.text || '';
  return compact(v);
}

function caseIdOf(col, rec) { rec = rec || {}; return col === 'cases' ? rec.id : (rec.caseId || ''); }

/** Builds the entry for one store event, or null when nothing is worth recording. Pure; exported for tests. */
export function entryFor(ev, at) {
  if (!ev || SKIP_COLS.includes(ev.col)) return null;
  const rec = ev.after || ev.before || {};
  const e = { col: ev.col, refId: ev.id, caseId: caseIdOf(ev.col, rec) || '', label: labelOf(ev.col, rec), at: at || nowIso(), changes: [] };
  if (ev.deleted) e.deleted = true;
  else if (!ev.before) { e.isNew = true; e.changes = diff({}, ev.after).filter(c => c.to !== ''); }
  else { e.changes = diff(ev.before, ev.after); if (!e.changes.length) return null; }
  e.summary = describe(e, 'he');
  return e;
}

export function colName(col, lang) { const n = COL_NAMES[col]; return n ? n[lang] || n.he : col; }
export function fieldName(field, lang) { const n = FIELD_NAMES[field]; return n ? n[lang] || n.he : field; }

const isoDate = /^\d{4}-\d{2}-\d{2}(T|$)/;
function fmtValue(v, lang, w) {
  if (v === '' || v == null) return w.empty;
  const s = String(v);
  if (isoDate.test(s)) { const [y, m, d] = s.slice(0, 10).split('-'); return d + '/' + m + '/' + y; }
  return s;
}

/** One human line for an entry, in he / fr / en. opts.value(field, value) may pretty-print values (e.g. statuses). */
export function describe(entry, lang, opts) {
  lang = WORDS[lang] ? lang : 'he'; const w = WORDS[lang]; opts = opts || {};
  const val = (f, v) => (opts.value ? opts.value(f, v, lang) : null) || fmtValue(v, lang, w);
  const head = colName(entry.col, lang) + (entry.label ? ' ' + entry.label : '');
  if (entry.deleted) return head + ': ' + w.deleted;
  const list = (entry.changes || []);
  if (entry.isNew) return head + ': ' + w.created + (list.length ? ' (' + list.slice(0, 4).map(c => fieldName(c.field, lang) + ': ' + val(c.field, c.to)).join(', ') + (list.length > 4 ? '…' : '') + ')' : '');
  if (!list.length) return head + ': ' + w.changed;
  return head + ': ' + list.map(c => fieldName(c.field, lang) + ' ' + val(c.field, c.from) + ' ' + w.arrow + ' ' + val(c.field, c.to)).join('; ');
}

/* Several saves can land in the same millisecond, so every entry also gets a running number; (at, seq) is the order. */
let seq = 0;
const byAge = (a, b) => String(a.at).localeCompare(String(b.at)) || ((a.seq || 0) - (b.seq || 0));
export const newestFirst = (a, b) => byAge(b, a);

/** Writes the entry and keeps the collection under CAP (oldest go first). */
function record(ev) {
  const e = entryFor(ev);
  if (!e) return null;
  e.seq = ++seq;
  const id = db.put('history', e);
  const all = db.list('history');
  if (all.length > CAP) all.sort(byAge).slice(0, all.length - CAP).forEach(x => db.remove('history', x.id));
  return id;
}

export function startHistory() {
  db.list('history').forEach(h => { if (h.seq > seq) seq = h.seq; });
  setHistoryHook(record);
}

/** The entries of one case (its own record and everything that points at it), newest first. */
export function historyFor(caseId) {
  return db.list('history', h => h.caseId === caseId).sort(newestFirst);
}

/** Entries grouped by day, newest day first: [{day: 'yyyy-mm-dd', items}]. */
export function groupByDay(entries) {
  const g = {}; const order = [];
  (entries || []).forEach(e => { const d = String(e.at || '').slice(0, 10); if (!g[d]) { g[d] = []; order.push(d); } g[d].push(e); });
  return order.sort().reverse().map(d => ({ day: d, items: g[d] }));
}
