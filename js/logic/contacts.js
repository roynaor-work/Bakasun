/* Contact lists brought in from the phone: Google Contacts exports (CSV, old and new layouts), Outlook CSV, vCard 2.1/3.0/4.0,
   and the phone's own picker. Pure parsing and classification, tested.
   Each contact is {name, phone, email, phones, emails, org, title, labels}. Notes from the export are never kept
   (they may hold ID numbers or bank details, which this app does not store). */
import { trim, phonePretty, phoneDigits, str } from './core.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';

/* ---------- vCard ---------- */

/** vCard 2.1 / 3.0 / 4.0 text → contacts. Folded lines, several TEL/EMAIL, N;CHARSET, quoted-printable Hebrew from old exports, tel: URIs. */
export function parseVcf(text) {
  const out = [];
  const unfolded = String(text || '').replace(/^﻿/, '').replace(/\r/g, '').replace(/\n[ \t]/g, '');
  unfolded.split(/^BEGIN:VCARD/im).slice(1).forEach(card => {
    const c = blank();
    let n = null;
    const lines = card.split('\n');
    for (let li = 0; li < lines.length; li++) {
      let line = lines[li];
      const i = line.indexOf(':'); if (i < 0) continue;
      let key = line.slice(0, i).toUpperCase(); let val = line.slice(i + 1);
      key = key.replace(/^ITEM\d+\./, '');
      const qp = /ENCODING=QUOTED-PRINTABLE/.test(key);
      if (qp) { while (/=$/.test(val) && li + 1 < lines.length) { val = val.slice(0, -1) + lines[++li]; } val = decodeQp(val, charsetOf(key)); }
      val = trim(val);
      const prop = key.split(';')[0];
      if (prop === 'FN') c.name = c.name || unesc(val);
      else if (prop === 'N') { const p = val.split(';').map(unesc); n = trim([p[3], p[1], p[2], p[0]].filter(Boolean).join(' ')); c.first = trim(p[1] || ''); c.last = trim(p[0] || ''); }
      else if (prop === 'TEL') { const v = val.replace(/^tel:/i, '').split(/[,;]/)[0]; if (phoneDigits(v).length >= 9) addPhone(c, v); }
      else if (prop === 'EMAIL') { const v = val.replace(/^mailto:/i, ''); if (/@/.test(v)) addEmail(c, v); }
      else if (prop === 'ORG') c.org = c.org || unesc(val.split(';')[0]);
      else if (prop === 'TITLE') c.title = c.title || unesc(val);
      else if (prop === 'CATEGORIES') val.split(',').forEach(l => addLabel(c, unesc(l)));
    }
    if (!c.name && n) c.name = n;
    if (!c.name && c.org) c.name = c.org;
    finish(c, out);
  });
  return dedupe(out);
}
function charsetOf(key) { const m = /CHARSET=([\w-]+)/.exec(key); return m ? m[1].toLowerCase() : 'utf-8'; }
function decodeQp(s, charset) {
  const bytes = []; let i = 0;
  while (i < s.length) { if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 3; } else { bytes.push(s.charCodeAt(i) & 255); i++; } }
  const enc = /1255|8859-8|hebrew/.test(charset) ? 'windows-1255' : 'utf-8';
  try { return new TextDecoder(enc).decode(new Uint8Array(bytes)); } catch (e) { try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch (e2) { return s; } }
}
function unesc(s) { return str(s).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1'); }

/* ---------- CSV ---------- */

/** Google Contacts CSV (the 2024+ "First Name / E-mail 1 - Value / Labels" layout and the older "Name / Given Name / Group Membership" one),
    Outlook CSV ("E-mail Address", "Mobile Phone", "Company", "Categories") and simple Hebrew sheets (שם / טלפון / מייל) → contacts. */
export function parseContactsCsv(text) {
  const rows = csvRows(String(text || '').replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const head = rows[0].map(h => trim(h).toLowerCase());
  const col = re => head.findIndex(h => re.test(h));
  const cols = re => head.map((h, i) => re.test(h) ? i : -1).filter(i => i >= 0);
  const iName = col(/^(name|full name|שם|שם מלא)$/), iFirst = col(/^(first name|given name|שם פרטי|prénom)$/), iMiddle = col(/^(middle name|additional name)$/), iLast = col(/^(last name|family name|שם משפחה|nom)$/);
  const iOrg = col(/^(organization name|organization 1 - name|company|חברה|ארגון|société)$/), iTitle = col(/^(organization title|organization 1 - title|job title|תפקיד)$/);
  const iPhones = cols(/^phone(\s*\d+)?( - value)?$|^(mobile|business|home|other|primary|company main|car|pager)\s*phone(\s*\d+)?$|טלפון|נייד|téléphone|portable/);
  const iMails = cols(/^e-?mail(\s*\d+)?( - value)?$|^e-?mail( \d+)? address$|מייל|דוא"ל|courriel/);
  const iLabels = cols(/^(labels|group membership|categories|קבוצות|תוויות)$/);
  const out = [];
  rows.slice(1).forEach(r => {
    if (!r.some(x => trim(x))) return;
    const c = blank();
    const parts = [iFirst, iMiddle, iLast].map(i => i >= 0 ? trim(r[i]) : '').filter(Boolean);
    c.name = iName >= 0 && trim(r[iName]) ? trim(r[iName]) : parts.join(' ');
    c.first = iFirst >= 0 ? trim(r[iFirst]) : ''; c.last = iLast >= 0 ? trim(r[iLast]) : '';
    c.org = iOrg >= 0 ? trim(r[iOrg]) : ''; c.title = iTitle >= 0 ? trim(r[iTitle]) : '';
    iPhones.map(i => r[i]).flatMap(v => splitMulti(v)).forEach(v => { if (phoneDigits(v).length >= 9) addPhone(c, v); });
    iMails.map(i => r[i]).flatMap(v => splitMulti(v)).forEach(v => { if (/@/.test(v)) addEmail(c, v); });
    iLabels.map(i => r[i]).flatMap(v => splitMulti(v)).forEach(l => addLabel(c, l));
    if (!c.name && c.org) c.name = c.org;
    finish(c, out);
  });
  return dedupe(out);
}
function splitMulti(v) { return String(v || '').split(/\s*:::\s*|\s*;\s*/).map(trim).filter(Boolean); }
/** RFC 4180: quoted fields with commas and newlines, doubled quotes, CRLF or LF. */
function csvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- shared pieces ---------- */

function blank() { return { name: '', first: '', last: '', phone: '', email: '', phones: [], emails: [], org: '', title: '', labels: [] }; }
function addPhone(c, v) { const p = phonePretty(v); if (!c.phones.includes(p)) c.phones.push(p); }
function addEmail(c, v) { const e = trim(v).toLowerCase(); if (e && !c.emails.includes(e)) c.emails.push(e); }
const NOISE_LABEL = /^\*?\s*(my ?contacts|starred|friends|family|coworkers|אנשי הקשר שלי|contacts)$/i;
function addLabel(c, l) { l = trim(String(l || '').replace(/^\*\s*/, '')); if (l && !NOISE_LABEL.test(l) && !c.labels.includes(l)) c.labels.push(l); }
function finish(c, out) {
  c.phone = c.phones[0] || ''; c.email = c.emails[0] || '';
  c.name = trim(c.name);
  if (c.name || c.phone || c.email) out.push(Object.assign(c, { name: c.name || c.org || c.phone || c.email }));
}

/** Name as a key: lower case, no punctuation, no doubled spaces, Hebrew quotes dropped. */
export function normName(s) {
  return str(s).toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[״"'’`.,;:()\-–־/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same phone, same e-mail or same normalised name → one contact; the missing pieces of the later one are merged into the first. */
export function dedupe(list) {
  const byKey = new Map(), out = [];
  const keysOf = c => [].concat((c.phones || [c.phone]).filter(Boolean).map(p => 'p:' + phoneDigits(p)), (c.emails || [c.email]).filter(Boolean).map(e => 'e:' + trim(e).toLowerCase()), c.name ? ['n:' + normName(c.name)] : []).filter(k => k.length > 2);
  list.forEach(c => {
    const ks = keysOf(c);
    const hits = []; ks.forEach(k => { const h = byKey.get(k); if (h && !hits.includes(h)) hits.push(h); });
    if (hits.length) {
      hits.sort((a, b) => out.indexOf(a) - out.indexOf(b)); // the one seen first keeps its name
      const had = hits[0];
      // a row that matches two earlier entries (phone of one, e-mail of the other) shows they are one person: join them
      hits.slice(1).forEach(h => { mergeInto(had, h); h._gone = true; });
      mergeInto(had, c); keysOf(had).forEach(k => byKey.set(k, had)); return;
    }
    ks.forEach(k => byKey.set(k, c)); out.push(c);
  });
  return out.filter(c => { if (c._gone) return false; delete c._gone; return true; });
}
function mergeInto(a, b) {
  (b.phones || (b.phone ? [b.phone] : [])).forEach(p => { a.phones = a.phones || (a.phone ? [a.phone] : []); if (!a.phones.includes(p)) a.phones.push(p); });
  (b.emails || (b.email ? [b.email] : [])).forEach(e => { a.emails = a.emails || (a.email ? [a.email] : []); if (!a.emails.includes(e)) a.emails.push(e); });
  (b.labels || []).forEach(l => { a.labels = a.labels || []; if (!a.labels.includes(l)) a.labels.push(l); });
  ['org', 'title', 'first', 'last'].forEach(k => { if (!a[k] && b[k]) a[k] = b[k]; });
  if (!a.phone && a.phones && a.phones[0]) a.phone = a.phones[0];
  if (!a.email && a.emails && a.emails[0]) a.email = a.emails[0];
}

/** Which file is it? */
export function parseContactsFile(name, text) {
  return /\.vcf$/i.test(name || '') || /BEGIN:VCARD/i.test(String(text).slice(0, 200)) ? parseVcf(text) : parseContactsCsv(text);
}

/* ---------- classification ---------- */

/* Supplier words → supplier type (from the catalog). Short words are matched whole; longer ones as a word start, with a Hebrew prefix letter allowed. */
const SUPPLIER_WORDS = [
  ['מלונות', ['מלון', 'מלונות', 'hotel', 'hôtel', 'hotels', 'אכסניה', 'צימר', 'resort', 'לודג', 'lodge']],
  ['קייטרינג ושפים', ['קייטרינג', 'קיטרינג', 'catering', 'traiteur', 'שף', 'chef', 'אוכל', 'מטבח']],
  ['מסעדות', ['מסעדה', 'מסעדת', 'restaurant', 'ביסטרו', 'bistro', 'brasserie', 'קפה', 'café', 'cafe']],
  ['דפוס ומיתוג', ['דפוס', 'הדפסות', 'הדפסה', 'print', 'printing', 'imprimerie', 'מיתוג', 'branding', 'שילוט', 'signage']],
  ['הסעות', ['הסעות', 'הסעה', 'אוטובוסים', 'אוטובוס', 'transport', 'autocar', 'autocars', 'bus', 'מוניות', 'taxi', 'נסיעות', 'shuttle']],
  ['צילום ווידאו', ['צילום', 'צלם', 'צלמת', 'photo', 'photographe', 'photography', 'וידאו', 'video', 'vidéo', 'מדיה']],
  ['הגברה ותאורה', ['הגברה', 'סאונד', 'sound', 'audio', 'תאורה', 'lighting', 'éclairage', 'sonorisation', 'הקרנה', 'מסכים']],
  ['תקליטנים ולהקות', ['dj', 'תקליטן', 'תקליטנים', 'להקה', 'להקת', 'band', 'מוזיקה', 'music', 'musique', 'נגן', 'זמר']],
  ['עיצוב ופרחים', ['פרחים', 'flowers', 'fleurs', 'fleuriste', 'עיצוב', 'décor', 'decor', 'décoration', 'decoration', 'בלונים', 'ballons']],
  ['בר ומשקאות', ['בר', 'bar', 'משקאות', 'drinks', 'boissons', 'יינות', 'יקב', 'wine', 'vin', 'ברמן', 'barman', 'קוקטייל', 'cocktail']],
  ['מקום לאירוע', ['אולם', 'אולמי', 'גן אירועים', 'venue', 'salle', 'domaine', 'lieu', 'חווה', 'אחוזת', 'אחוזה']],
  ['השכרת ציוד', ['השכרת', 'השכרה', 'ציוד', 'rental', 'location', 'אוהלים', 'אוהל', 'tente', 'tentes']],
  ['מדריכי טיולים', ['מדריך', 'מדריכת', 'guide', 'guides', 'טיולים', 'סיורים', 'tours']],
  ['פעילות וסיורים', ['סדנאות', 'סדנה', 'atelier', 'workshop', 'פעילויות', 'פעילות', 'activités', 'activities', 'גיבוש', 'אטרקציות']],
  ['אחר', ['הפקות', 'הפקה', 'production', 'productions', 'אירועים', 'events', 'événementiel', 'evenementiel', 'ספק', 'supplier', 'fournisseur', 'אמן', 'מרצה', 'מנחה', 'קוסם', 'הרצאות']]
];
const CLIENT_WORDS = ['עיריית', 'עירייה', 'עיריה', 'מועצה', 'מועצת', 'עמותת', 'עמותה', 'בע"מ', 'בע״מ', 'בעמ', 'ltd', 'limited', 'inc', 'llc', 'plc', 'corp', 'gmbh', 'sarl', 'sas', 'sa', 'association', 'fondation', 'fédération', 'federation', 'פדרציה', 'mairie', 'municipalité', 'ministère', 'משרד', 'קרן', 'אוניברסיטת', 'אוניברסיטה', 'מכללת', 'מכללה', 'university', 'université', 'ארגון', 'חברת', 'חברה', 'קהילת', 'קהילה', 'הסוכנות', 'agency', 'בנק', 'bank', 'banque', 'תנועת', 'תנועה', 'איגוד', 'לשכת', 'מחוז', 'הסתדרות', 'קיבוץ', 'מושב', 'school', 'école', 'בית ספר', 'מרכז', 'centre', 'center', 'institut', 'מכון', 'קונסוליה', 'שגרירות', 'ambassade', 'consulat'];
const LABEL_SUPPLIER = ['ספק', 'ספקים', 'supplier', 'suppliers', 'vendor', 'vendors', 'fournisseur', 'fournisseurs', 'prestataire', 'prestataires'];
const LABEL_CLIENT = ['לקוח', 'לקוחות', 'client', 'clients', 'customer', 'customers', 'לידים', 'lead', 'leads', 'prospect', 'prospects'];
const LABEL_STAFF = ['צוות', 'staff', 'team', 'équipe', 'equipe', 'עובדים', 'עובד', 'עובדת', 'פרילנסרים', 'פרילנסר', 'freelance', 'freelancers', 'מדריכים', 'אנשי צוות', 'intervenants'];
const FREE_MAIL = /^(gmail|googlemail|walla|hotmail|outlook|live|yahoo|icloud|me|mac|msn|aol|proton|protonmail|orange|free|wanadoo|sfr|laposte|bezeqint|netvision|012|013|014|nana10|zahav|smile|hotmail\.fr|yahoo\.fr|outlook\.fr)\./i;
const HEB_PREFIX = /^(?:ו?[הבלמשכ]|וה|שה|כש|מה|לה|בה)/;

function tokens(s) { return normName(s).split(/[^\p{L}\p{N}"]+/u).filter(Boolean); }
function tokenHas(tok, w) {
  if (tok === w) return true;
  if (w.length <= 3) return false;
  if (tok.startsWith(w)) return true;
  if (/[֐-׿]/.test(w)) { const stripped = tok.replace(HEB_PREFIX, ''); return stripped !== tok && stripped.startsWith(w); }
  return false;
}
function hasWord(text, words) {
  const toks = tokens(text); if (!toks.length) return '';
  const joined = ' ' + toks.join(' ') + ' ';
  for (const w of words) {
    const nw = normName(w); if (!nw) continue;
    if (/\s/.test(nw)) { if (joined.includes(' ' + nw + ' ')) return w; continue; }
    if (toks.some(tk => tokenHas(tk, nw))) return w;
  }
  return '';
}

/** A supplier type from the catalog for a name or organisation, or '' when no word matches. */
export function guessSupplierType(text, strict) {
  for (const [type, words] of SUPPLIER_WORDS) if (hasWord(text, strict ? words.filter(x => !AMBIG.includes(x)) : words)) return SUPPLIER_TYPES.includes(type) ? type : 'אחר';
  return '';
}
function supplierWord(text, strict) { for (const [, words] of SUPPLIER_WORDS) { const w = hasWord(text, strict ? words.filter(x => !AMBIG.includes(x)) : words); if (w) return w; } return ''; }
/* Words that are also first names or everyday words: they count in an organisation name, not in a person's name (בר אילן is a person, "בר" alone is a drinks supplier). */
const AMBIG = ['בר', 'bar', 'שף', 'chef', 'אוכל', 'מטבח', 'קפה', 'מדיה', 'מדריך', 'מדריכת', 'guide', 'guides', 'אמן', 'נגן', 'זמר', 'מנחה', 'מרצה', 'ציוד', 'location', 'lieu', 'קרן', 'מרכז', 'משרד', 'חברה', 'sa', 'school', 'מכון', 'centre', 'center', 'אחוזה', 'חווה', 'domaine', 'סדנה', 'פעילות', 'תנועה', 'קהילה', 'מושב', 'מחוז'];

function mailDomain(e) { const m = /@([^@\s>]+)$/.exec(trim(e).toLowerCase()); return m ? m[1] : ''; }
function isCompanyDomain(d) { return d && !FREE_MAIL.test(d + '.'); }
function cardPhones(x) { return [x.phone, x.phone2, x.mobile, x.contactPhone].map(p => phoneDigits(p || '')).filter(Boolean); }
function cardEmails(x) { return [x.email, x.email2, x.invoiceEmail, x.contactEmail].map(e => trim(e || '').toLowerCase()).filter(Boolean); }
function cardNames(x) { return [x.name, x.contact, x.legalName].concat(str(x.aliases).split(/\s*[,;]\s*/)).map(normName).filter(n => n.length > 1); }

/** The existing card (client/supplier/staff/contact) this contact is: same phone, same e-mail or same normalised name (the card's name, contact person or alias). */
export function findExisting(contact, list) {
  const phones = ((contact.phones && contact.phones.length) ? contact.phones : [contact.phone]).map(p => phoneDigits(p || '')).filter(Boolean);
  const emails = ((contact.emails && contact.emails.length) ? contact.emails : [contact.email]).map(e => trim(e || '').toLowerCase()).filter(Boolean);
  const names = [contact.name, contact.org].map(normName).filter(n => n.length > 1);
  const by = (pred, how) => { const x = (list || []).find(pred); return x ? { card: x, how } : null; };
  return (phones.length && by(x => cardPhones(x).some(p => phones.includes(p)), 'phone'))
    || (emails.length && by(x => cardEmails(x).some(e => emails.includes(e)), 'email'))
    || (names.length && by(x => cardNames(x).some(n => names.includes(n)), 'name')) || null;
}

/** 'client' | 'supplier' | 'staff' | 'contact', with why.
    Order: an existing card → its class; a Google label or group; words in the organisation or the name; a company e-mail domain shared with an existing client or supplier.
    Returns {cls, reason, word, type, existing: {col, card, how} | null}. */
export function classify(contact, lists) {
  lists = lists || {};
  const c = contact || {};
  const orgText = trim([c.org, c.title].filter(Boolean).join(' '));
  const type = guessSupplierType(orgText) || guessSupplierType(c.name, true);
  const res = (cls, reason, word, existing, hint) => ({ cls, reason, word: word || '', type: cls === 'supplier' ? (existing && existing.card.type) || hint || type || 'אחר' : '', existing: existing || null });
  for (const [col, cls] of [['suppliers', 'supplier'], ['clients', 'client'], ['staff', 'staff']]) {
    const f = findExisting(c, lists[col]);
    if (f) return res(cls, 'existing', f.card.name, { col, card: f.card, how: f.how });
  }
  const labels = (c.labels || []).join(' , ');
  let w = hasWord(labels, LABEL_SUPPLIER); if (w) return res('supplier', 'label', w);
  w = hasWord(labels, LABEL_CLIENT); if (w) return res('client', 'label', w);
  w = hasWord(labels, LABEL_STAFF); if (w) return res('staff', 'label', w);
  w = supplierWord(orgText); if (w) return res('supplier', 'org', w);
  w = hasWord(orgText, CLIENT_WORDS); if (w) return res('client', 'org', w);
  w = supplierWord(c.name, true); if (w) return res('supplier', 'name', w);
  w = hasWord(c.name, CLIENT_WORDS.filter(x => !AMBIG.includes(x))); if (w) return res('client', 'name', w);
  const domains = ((c.emails && c.emails.length) ? c.emails : [c.email]).map(mailDomain).filter(isCompanyDomain);
  if (domains.length) {
    for (const [col, cls] of [['suppliers', 'supplier'], ['clients', 'client']]) {
      const hit = (lists[col] || []).find(x => cardEmails(x).some(e => domains.includes(mailDomain(e))));
      if (hit) return res(cls, 'domain', hit.name, null, hit.type);
    }
  }
  return res('contact', 'none', '');
}

/** Classifies a whole list against the existing cards: [{contact, cls, reason, word, type, existing}] plus counts per class. */
export function classifyAll(list, lists) {
  const rows = (list || []).map(contact => Object.assign({ contact }, classify(contact, lists)));
  const counts = { client: 0, supplier: 0, staff: 0, contact: 0, existing: 0 };
  rows.forEach(r => { counts[r.cls]++; if (r.existing) counts.existing++; });
  return { rows, counts };
}
