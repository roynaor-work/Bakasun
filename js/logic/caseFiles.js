/* Files and documents of one event (קבצי האירוע): what kind of paper a file is, how it is listed and searched,
   where it goes in the cloud, and which documents an event with approved suppliers is still missing.
   Pure functions, no DOM and no storage; tested in tests/caseFiles.test.mjs.

   A record of the 'casefiles' collection (metadata only, the bytes live in IndexedDB through js/files.js):
   { id, caseId, fileId, name, type, size, kind, supplierId, note, tags[], addedAt, cloudPath, cloudOk } */
import { str, trim } from './core.js';

export const KINDS = ['quote', 'contract', 'menu', 'permit', 'insurance', 'invoice', 'receipt', 'photo', 'plan', 'other'];
export const BUCKET = 'receipts';
/* What the cloud bucket accepts (supabase/storage.sql): images and PDFs up to 15 MB. Anything else stays on the device. */
export const CLOUD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const CLOUD_MAX = 15 * 1024 * 1024;

/* Words that name a kind of document, in the order they are tried: the more specific first. A file name such as
   "חשבונית מס קבלה 123.pdf" is an invoice, "אישור ביטוח" is insurance (not a permit). */
const WORDS = [
  ['quote', /הצעת\s*מחיר|הצעה|quotation|quote|devis|offer|proposal/i],
  ['contract', /הסכם|חוזה|contract|agreement|contrat|convention/i],
  ['insurance', /ביטוח|פוליסה|insurance|assurance|policy|police\s+d/i],
  ['invoice', /חשבונית|invoice|facture/i],
  ['receipt', /קבלה|receipt|reçu|recu\b|payment\s+confirmation|אישור\s+תשלום/i],
  ['menu', /תפריט|menu|carte\s+des/i],
  ['permit', /היתר|רישיון|רשיון|אישור\s*(?:משטרה|כיבוי|בטיחות|מכבי|עירייה|רשות)|permit|licen[cs]e|autorisation/i],
  ['plan', /תוכנית|תכנית|לו["״]?ז|מפה|סקיצה|schedule|plan\b|planning|floor|layout|program/i]
];
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i;

/** The kind of a file from its name, its mime type and (for PDFs) the first text pdfText gave. */
export function guessKind(name, mime, text) {
  const n = str(name);
  for (const [kind, re] of WORDS) if (re.test(n)) return kind;
  const head = str(text).slice(0, 800);
  if (head) for (const [kind, re] of WORDS) if (re.test(head)) return kind;
  if (/^image\//i.test(str(mime)) || IMAGE_EXT.test(n)) return 'photo';
  return 'other';
}

/** 1234 → '1.2 KB', 5 * 1024 * 1024 → '5 MB'. ASCII units, a number that reads the same in every language. */
export function humanSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024 < 10 ? (b / 1024).toFixed(1) : Math.round(b / 1024)) + ' KB';
  const m = b / (1024 * 1024);
  return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' MB';
}

/** Newest first (addedAt, then created), then by name so the order is stable. Does not touch the input. */
export function sortFiles(list) {
  return (list || []).slice().sort((a, b) => str(b.addedAt || b.created).localeCompare(str(a.addedAt || a.created)) || str(a.name).localeCompare(str(b.name)));
}

/** Search text: lower case, Hebrew quotes and punctuation folded, so "שוב"ל" finds "שוב״ל". */
export function normText(s) { return str(s).toLowerCase().replace(/["״'׳`]/g, '').replace(/[_\-.,/]+/g, ' ').replace(/\s+/g, ' ').trim(); }

/** The files that match a search, a kind and a supplier. `lookup` (optional) gives the event client and the supplier
   name for the search: { caseOf(caseId) → case record, supplierOf(id) → supplier record }. */
export function filterFiles(list, opts, lookup) {
  opts = opts || {}; lookup = lookup || {};
  const q = normText(opts.q);
  return (list || []).filter(f => {
    if (opts.kind && (f.kind || 'other') !== opts.kind) return false;
    if (opts.supplierId && f.supplierId !== opts.supplierId) return false;
    if (opts.caseId && f.caseId !== opts.caseId) return false;
    if (!q) return true;
    const cs = lookup.caseOf ? lookup.caseOf(f.caseId) : null;
    const sp = lookup.supplierOf && f.supplierId ? lookup.supplierOf(f.supplierId) : null;
    const hay = normText([f.name, f.note, (f.tags || []).join(' '), cs && cs.client, cs && cs.kind, cs && cs.place, sp && sp.name].filter(Boolean).join(' '));
    return q.split(' ').every(w => hay.indexOf(w) >= 0);
  });
}

/** Only ASCII letters, digits, dot, dash and underscore survive; nothing else can break a storage path. */
export function safeSegment(s, fallback) {
  const out = str(s).normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/-{2,}/g, '-').slice(0, 60);
  return out || str(fallback);
}
/** The file extension that fits the name or the mime type: '.pdf', '.jpg'... always ASCII, always with the dot. */
export function extOf(name, mime) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(str(name));
  if (m) return '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
  const byMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf', 'image/gif': '.gif' };
  return byMime[str(mime).toLowerCase()] || '';
}
/** The storage path of a file: <org>/files/<case>/<fileId>-<safe name>.<ext>. The org folder is what the bucket
   policy checks (supabase/storage.sql); without an org (cloud off) the path starts with 'files'. */
export function cloudPathFor(caseId, meta, orgId) {
  meta = meta || {};
  const ext = extOf(meta.name, meta.type);
  const base = safeSegment(str(meta.name).replace(/\.[A-Za-z0-9]{1,5}$/, ''), '');
  const id = safeSegment(meta.fileId || meta.id, 'f' + Date.now().toString(36));
  return [safeSegment(orgId, ''), 'files', safeSegment(caseId, 'case'), id + (base ? '-' + base : '') + ext].filter(Boolean).join('/');
}
/** True when the bucket will take the file (type and size); the rest stays on the device and says so. */
export function cloudEligible(meta) {
  return CLOUD_TYPES.includes(str(meta && meta.type).toLowerCase()) && (Number(meta && meta.size) || 0) <= CLOUD_MAX;
}

/* ---- which documents are still missing ---- */
const VENUE_TYPES = ['מקום לאירוע', 'מלונות'];
const FOOD_TYPES = ['קייטרינג ושפים', 'מסעדות'];
const approved = l => /אושר|הוזמן/.test(str(l && l.status)) && !/בוטל/.test(str(l && l.status));
const wantsInsurance = (l, sp, cs) => /ביטוח|insurance|assurance/i.test([l && l.needsInsurance === true ? 'ביטוח' : '', l && l.notes, l && l.note, sp && sp.notes, sp && sp.insurance ? 'ביטוח' : '', cs && cs.needsInsurance ? 'ביטוח' : ''].map(str).join(' '));

/** What an event with approved suppliers should have in its files and does not yet:
   [{ kind, why, who, supplierId }] where `why` is a text key of the screen ('mkVenueContract', 'mkInsurance',
   'mkMenu', 'mkQuote', 'mkClientContract') and `who` the supplier's name.
   ctx (optional): { suppliers: array or map by id, contracts: the event's contract records (a signed one counts) }. */
export function missingKinds(caseRec, list, links, ctx) {
  const cs = caseRec || {}; ctx = ctx || {};
  const sups = Array.isArray(ctx.suppliers) ? Object.fromEntries(ctx.suppliers.map(s => [s.id, s])) : (ctx.suppliers || {});
  const mine = (list || []).filter(f => f.caseId === cs.id || !cs.id);
  const has = (kind, supplierId) => mine.some(f => (f.kind || 'other') === kind && (!supplierId || f.supplierId === supplierId));
  const out = [];
  const seen = new Set();
  (links || []).filter(l => l.caseId === cs.id && approved(l)).forEach(l => {
    const sp = sups[l.supplierId] || { id: l.supplierId, name: l.supplier || '', type: l.type || '' };
    const who = str(sp.name || l.supplier);
    const push = (kind, why, supplierId) => { const k = kind + '|' + why + '|' + supplierId; if (!seen.has(k)) { seen.add(k); out.push({ kind, why, who, supplierId }); } };
    if (VENUE_TYPES.includes(sp.type)) {
      if (!has('contract', sp.id)) push('contract', 'mkVenueContract', sp.id);
      if (wantsInsurance(l, sp, cs) && !has('insurance')) push('insurance', 'mkInsurance', sp.id);
    }
    if (FOOD_TYPES.includes(sp.type) && !has('menu', sp.id) && !has('menu')) push('menu', 'mkMenu', sp.id);
    if (!has('quote', sp.id)) push('quote', 'mkQuote', sp.id);
  });
  const closed = /נסגר|בוצע/.test(str(cs.status));
  const signed = (ctx.contracts || []).some(c => c.caseId === cs.id && c.status === 'signed');
  if (closed && !signed && !mine.some(f => f.kind === 'contract' && !f.supplierId)) out.push({ kind: 'contract', why: 'mkClientContract', who: str(cs.client), supplierId: '' });
  return out;
}

/** The metadata record for a file that arrived from the share sheet (or any File/IndexedDB record) into an event.
   `save(meta)` (optional) stores it; the record is returned either way. The screen's pickCaseAndAttach does the whole flow. */
export function attachShared(caseId, fileRec, save, extra) {
  fileRec = fileRec || {};
  const meta = Object.assign({
    caseId: str(caseId), fileId: str(fileRec.id), name: str(fileRec.name || fileRec.title || 'file'), type: str(fileRec.type), size: Number(fileRec.size) || 0,
    kind: guessKind(fileRec.name || fileRec.title, fileRec.type, fileRec.text), supplierId: '', note: '', tags: [], addedAt: new Date().toISOString(), cloudPath: '', cloudOk: false
  }, extra || {});
  if (typeof save === 'function') { const id = save(meta); if (id && !meta.id) meta.id = id; }
  return meta;
}

/** One line that names the event, for the share sheet and the mail: "שוב״ל · כנס · 18/10/2026 · שפיים". */
export function eventLine(caseRec, fmt) {
  const c = caseRec || {};
  return [c.client, c.kind, c.date ? (fmt ? fmt(c.date) : c.date) : '', c.place].map(trim).filter(Boolean).join(' · ');
}
