/* Ready message templates (js/data/messageTemplates.js) filled from the app's data. Pure functions, tested.
   fillFrom(template, {case, client, supplier, link, payment, settings, extra}, lang) → the text; unknown placeholders stay
   visible as 【label】 so she sees what to fill. listTemplates(lang, customList) merges the built-ins with her own saved
   templates (js/logic/templates.js, {name, text}). parseTemplateRequest(text) reads a spoken request in he / fr / en. */
import Office from './office.js';
import { str, trim } from './core.js';
import { KIND_LABELS } from '../i18n.js';
import { MESSAGE_TEMPLATES, PLACEHOLDERS, INSURANCE, AUDIENCES } from '../data/messageTemplates.js';

const LANGS = ['he', 'fr', 'en'];
/** A valid message language, 'he' otherwise. */
export const msgLangOf = l => (LANGS.includes(l) ? l : 'he');
/** The language of the message for a recipient: the card's language, else the default of the settings, else the UI language. */
export function pickLang(recipient, settings, uiLang) {
  const r = recipient && recipient.lang, s = settings && settings.msgLang;
  return LANGS.includes(r) ? r : LANGS.includes(s) ? s : msgLangOf(uiLang);
}

const firstName = n => trim(n).split(' ')[0] || '';
const firstLine = s => str(s).split('\n')[0].trim();
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isNaN(n) ? null : n; };
const moneyOf = v => { if (v == null || v === '') return ''; const s = str(v).trim(); const n = num(s); return n !== null && /^[\d.,\s₪$€]+$/.test(s) ? Office.money(n) : s; };
const dateOf = v => { const s = str(v).trim(); return s ? (Office.fmt(s) || s) : ''; };
/** The kind of event in the language of the message ('כנס' → 'Conference'). */
export function kindIn(kind, lang) { kind = trim(kind); if (!kind || lang === 'he') return kind; const k = KIND_LABELS[kind]; return (k && k[lang]) || kind; }

/* Aliases she may type in her own templates: {name} / {שם} / {nom}, {date} / {תאריך}, … */
const ALIASES = {
  name: 'contact', 'שם': 'contact', nom: 'contact', 'prénom': 'contact', prenom: 'contact', 'שם פרטי': 'contact',
  'תאריך': 'date', 'אירוע': 'event', 'événement': 'event', evenement: 'event', 'מקום': 'place', lieu: 'place',
  'לקוח': 'client', 'ספק': 'supplier', fournisseur: 'supplier', 'סכום': 'amount', montant: 'amount', 'חתימה': 'signer',
  'כתובת': 'address', adresse: 'address', 'מחיר': 'price', prix: 'price', 'בנק': 'bank', banque: 'bank'
};

/** Every value the placeholders can take, from the data; '' when unknown. extra overrides everything. */
export function valuesFrom(data, lang, to) {
  data = data || {}; lang = msgLangOf(lang);
  const cs = data.case || {}, cl = data.client || {}, sp = data.supplier || {}, lk = data.link || {}, pay = data.payment || {}, s = data.settings || {}, x = data.extra || {};
  const clientName = trim(cl.name) || trim(cs.client);
  const contact = to === 'supplier' ? firstName(sp.contact || sp.name || lk.supplier) : to === 'client' || to === 'custom' ? firstName(cl.contact || cs.contact || cl.name || cs.client) : '';
  const signer = str(s.signer).trim();
  const days = num(cs.days);
  const v = {
    client: clientName, clientLegal: trim(cl.legalName) || clientName, clientTaxId: trim(cl.taxId), contact,
    event: kindIn(cs.kind, lang), date: dateOf(cs.date), place: trim(cs.place), address: trim(cs.address),
    participants: trim(cs.participants), nights: days && days > 1 ? String(days - 1) : '', rooms: trim(cs.rooms),
    meetingRoom: '', kosher: '', board: '', requirements: '',
    amount: moneyOf(pay.amount), invoiceNo: trim(pay.invoiceNo), dueDate: dateOf(pay.due), bank: str(s.bankDetails).trim(),
    price: '', terms: str(s.terms).trim(),
    supplier: trim(sp.name) || trim(lk.supplier), what: trim(lk.what), arrival: trim(lk.arrive), parking: '',
    onsite: [firstLine(signer), trim(s.bizPhone)].filter(Boolean).join(' '), rsvpBy: '',
    signer, me: firstName(firstLine(signer)),
    policyNo: INSURANCE.of(s).policyNo, policyPeriod: INSURANCE.of(s).period, limits: INSURANCE.of(s).limits, agency: INSURANCE.agency[lang], insurer: INSURANCE.insurer[lang]
  };
  Object.keys(x).forEach(k => {
    const val = x[k]; if (val == null || !String(val).trim()) return;
    const key = ALIASES[k] || k;
    v[key] = key === 'amount' || key === 'price' ? moneyOf(val) : key === 'dueDate' || key === 'rsvpBy' || key === 'date' ? dateOf(val) : String(val).trim();
  });
  return v;
}

/** Fills {placeholders} in any text. Unknown ones become 【label】 in the language of the message. */
export function fillText(text, values, lang) {
  lang = msgLangOf(lang); const v = values || {};
  return str(text).replace(/\{([^{}\n]+)\}/g, (m, raw) => {
    const k = raw.trim(); const key = v[k] != null ? k : (ALIASES[k] || ALIASES[k.toLowerCase()] || k);
    const val = v[key];
    if (val != null && String(val).trim()) return String(val).trim();
    const lab = PLACEHOLDERS[key]; return '【' + ((lab && lab[lang]) || key) + '】';
  }).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** The body of the template (built-in or custom) in the language, filled from the data. */
export function fillFrom(template, data, lang) {
  if (!template) return '';
  lang = msgLangOf(lang || (data && data.lang));
  const body = template.body ? (template.body[lang] || template.body.he || '') : str(template.text);
  return fillText(body, valuesFrom(data, lang, template.to), lang);
}
/** The mail subject of a built-in template, filled; the title for a custom one. */
export function fillSubject(template, data, lang) {
  if (!template) return '';
  lang = msgLangOf(lang || (data && data.lang));
  const s = template.subject ? (template.subject[lang] || template.subject.he) : (template.title && template.title[lang]) || template.name || '';
  return fillText(s, valuesFrom(data, lang, template.to), lang).replace(/【[^】]*】/g, '').replace(/\s{2,}/g, ' ').replace(/[,:\s]+$/, '').trim();
}
/** The labels still shown as 【…】 in a filled text, in order, without repeats. */
export function missingIn(text) {
  const out = []; str(text).replace(/【([^】]+)】/g, (m, l) => { if (!out.includes(l)) out.push(l); return m; }); return out;
}

/** Built-ins (in the language) followed by her own templates, as {key, to, title, body, fields, custom}. */
export function listTemplates(lang, customList) {
  lang = msgLangOf(lang);
  const built = MESSAGE_TEMPLATES.map(tp => ({ key: tp.key, to: tp.to, title: tp.title[lang] || tp.title.he, body: tp.body[lang] || tp.body.he, fields: tp.fields || [], custom: false }));
  const mine = (Array.isArray(customList) ? customList : []).filter(c => c && trim(c.name)).map(c => ({ key: 'custom:' + trim(c.name), to: 'custom', title: trim(c.name), body: str(c.text), fields: [], custom: true }));
  return built.concat(mine);
}
/** The full template for a key ('insuranceCert' or 'custom:<name>'), or null. */
export function templateByKey(key, customList) {
  key = str(key).trim(); if (!key) return null;
  const b = MESSAGE_TEMPLATES.find(tp => tp.key === key); if (b) return b;
  const name = key.startsWith('custom:') ? key.slice(7) : key;
  const c = (Array.isArray(customList) ? customList : []).find(x => x && Office.normHe(x.name) === Office.normHe(name));
  return c ? { key: 'custom:' + trim(c.name), to: 'custom', name: trim(c.name), title: { he: c.name, fr: c.name, en: c.name }, text: str(c.text), fields: [], custom: true } : null;
}
/** The templates of one audience, in the language. */
export function byAudience(lang, customList) {
  const all = listTemplates(lang, customList);
  return AUDIENCES.concat(['custom']).map(a => ({ audience: a, items: all.filter(tp => tp.to === a) })).filter(g => g.items.length);
}
/** Search in titles and bodies. */
export function searchTemplates(list, q) {
  const n = Office.normHe(str(q)); if (!n) return list || [];
  return (list || []).filter(tp => Office.normHe(tp.title + ' ' + tp.body + ' ' + tp.key).indexOf(n) >= 0);
}

/* ---------- the spoken request: "תכיני בקשת אישור ביטוח לחריש", "prépare la demande d'attestation d'assurance pour Harish",
   "prepare a hotel quote request for Shoval", "תזכורת תשלום לשובל" → {key, who} ---------- */
const KEY_RES = [
  ['insuranceCert', /אישור\s+(?:קיום\s+)?ביטוח(?:ים)?|בקשת\s+ביטוח|אישור\s+ביטוחי|attestation\s+d['’]?\s*assurance|certificat\s+d['’]?\s*assurance|(?:certificate|proof|cert)\s+of\s+insurance|insurance\s+(?:certificate|cert|confirmation|letter)|coi\b/i],
  ['hotelQuote', /(?:הצעת\s+מחיר|בקשת\s+הצעה|הצעה|בקשה)\s+(?:ל|מ)(?:ה)?(?:מלון|מקום|אולם)|(?:demande\s+de\s+)?devis\s+(?:pour\s+(?:l['’]|un\s+|le\s+)?|d['’]|à\s+l['’])?(?:h[ôo]tel|lieu|salle)|(?:h[ôo]tel|venue)\s+quote(?:\s+request)?|quote\s+(?:request\s+)?(?:for|from|to)\s+(?:a\s+|the\s+)?(?:hotel|venue)|rfq\s+(?:for\s+)?(?:a\s+|the\s+)?(?:hotel|venue)/i],
  ['bookingConfirm', /אישור\s+(?:ה)?הזמנה|אישור\s+הזמנת|confirmation\s+de\s+(?:la\s+)?(?:réservation|reservation|commande)|booking\s+confirmation|confirm(?:ation)?\s+(?:of\s+)?(?:the\s+)?booking/i],
  ['paymentReminder', /תזכורת\s+(?:ל)?תשלום|תזכורת\s+גבייה|rappel\s+de\s+paiement|relance\s+(?:de\s+)?paiement|payment\s+reminder|reminder\s+(?:for|about)\s+(?:the\s+)?payment/i],
  ['supplierBrief', /תדריך\s+(?:ל)?(?:ספק|יום\s+האירוע|ליום)|תדריך|brief(?:ing)?\s+(?:du\s+jour|fournisseur|pour\s+le\s+jour)|(?:day-of|supplier)\s+brief|brief\s+(?:for|to)\s+(?:the\s+)?supplier/i],
  ['thankYou', /(?:הודעת|מכתב)\s+תודה|תודה\s+(?:ללקוח|אחרי\s+האירוע|ל)|remerciement|message\s+de\s+merci|merci\s+(?:au\s+client|après)|thank[\s-]?you|thanks\s+(?:to|after)/i],
  ['rsvpReminder', /תזכורת\s+(?:ל)?(?:משתתפים|אישור\s+הגעה|הגעה)|אישור\s+הגעה|rsvp|rappel\s+(?:aux\s+)?participants|confirmation\s+de\s+présence|reminder\s+(?:to\s+)?(?:the\s+)?participants/i],
  ['supplierFollowUp', /(?:שלחת|שלחתם)\s+(?:כבר\s+)?(?:את\s+)?ההצעה|מעקב\s+(?:אחרי\s+)?(?:ה)?ספק|מעקב\s+(?:אחרי\s+)?(?:ה)?הצעה|תזכורת\s+(?:ל)?ספק|relance\s+(?:du\s+)?(?:fournisseur|devis)|devis\s+envoy[ée]|supplier\s+follow[\s-]?up|follow[\s-]?up\s+(?:with\s+)?(?:the\s+)?(?:supplier|quote)|sent\s+the\s+quote/i]
];
const TAIL = /\s*(?:בבקשה|please|s['’]il\s+(?:te|vous)\s+pla[îi]t|stp|svp)?\s*[.!?]*\s*$/i;
function whoAfter(rest) {
  rest = trim(rest).replace(TAIL, '');
  let m = /(?:^|\s)(?:pour|à|a|for|to)\s+(?:la\s+|le\s+|les\s+|l['’]\s*|the\s+)?(.+)$/i.exec(rest);
  if (!m) m = /(?:^|\s)ל(?:חברת\s+|ארגון\s+|עבור\s+)?(\S.*)$/.exec(rest);
  if (!m) m = /(?:^|\s)(?:עבור|של)\s+(.+)$/.exec(rest);
  if (!m) m = /^(\S.*)$/.exec(rest.replace(/^\s*(?:request|reminder|message|demande|rappel|modèle|template|הודעה|תבנית)\b\s*/i, '')); /* a bare name right after the template words */
  return m ? trim(m[1]).replace(/^את\s+/, '').replace(/[.!?,]+$/, '') : '';
}
/** {key, who} for a spoken request, or null when no template is named. who = '' when no name follows. */
export function parseTemplateRequest(text) {
  const s = trim(text); if (!s) return null;
  for (const [key, re] of KEY_RES) {
    const m = re.exec(s); if (!m) continue;
    const rest = s.slice(m.index + m[0].length);
    let who = whoAfter(rest);
    if (!who && key === 'thankYou' && /תודה\s+ל(\S.*)$/.test(s)) who = whoAfter(' ל' + /תודה\s+ל(\S.*)$/.exec(s)[1]);
    return { key, who };
  }
  return null;
}
/** The templates whose title or key is said ("תבנית תודה"), for the voice flow. */
export function findTemplateKey(name, lang, customList) {
  const n = Office.normHe(name); if (!n) return null;
  const hit = listTemplates(lang, customList).find(tp => Office.normHe(tp.title) === n || Office.normHe(tp.key) === n) || listTemplates(lang, customList).find(tp => Office.normHe(tp.title).indexOf(n) >= 0);
  return hit ? hit.key : null;
}
