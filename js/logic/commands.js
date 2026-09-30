/* Spoken or typed commands: "send the bank confirmation to 052-1234567", "ask Roy for an invoice: Community O, 580777894, 3,000 + VAT",
   "call Yossi back". Pure parsing, tested; the screens decide what to open. */
import Office from './office.js';
import { trim, str, phoneDigits, phonePretty } from './core.js';
import { parseReminder, takeWhen } from './travel.js';

const SEND = /^(?:שלחי|שלח|תשלחי|תשלח|לשלוח|send|envoie|envoyer|envoyez)(?=\s|$)/i;
const INVOICE = /(חשבונית|חשבון עסקה|דרישת תשלום|invoice|facture)/i;
const TO = /(?:\s(?:ל|אל|to|à)\s*|\s(?:למספר|לטלפון|למייל|to number|to phone|au numéro|par mail)\s*)/i;

// "(save|add) (the) (phone|number|mail) of X 052..." in three languages, or "X's phone is 052..."
const CONTACT = /(?:^(?:שמרי|תשמרי|שמור|הוסיפי|תוסיפי|הוסף|save|add|enregistre|ajoute)\s+(?:את\s+|the\s+|le\s+|la\s+|l['’]\s*)?(?:ה)?(?:טלפון|מספר|מייל|אימייל|phone|number|mail|e-mail|email|numéro|téléphone)\s+(?:של\s+|of\s+|de\s+|d['’]\s*)?([^:,\d@]+?)\s*[:,]?\s+(?=[+0\d]|[A-Za-z0-9._%+\-]+@))|(?:^(?:ה)?(?:טלפון|מספר|מייל|אימייל|phone|number|mail|e-mail|email|numéro|téléphone)\s+(?:של\s+|of\s+|de\s+|d['’]\s*)([^:,\d@]+?)\s*(?:הוא|זה|is|est|[:,])?\s+(?=[+0\d]|[A-Za-z0-9._%+\-]+@))/i;
// "(send|write|tell) (a message|a whatsapp|an e-mail) to X[:,] body"
// The body starts at ":" / "," or at a marker word: "ההודעה", "תכתבי", "תגידי לה", "שאלי" (a question), or a "ש..." clause.
const MARK = '(?:ההודעה(?:\\s+היא)?|הודעה|תכתבי|כתבי|תגידי|תאמרי|שאלי|תשאלי|שאל|תשאל|saying|say|ask|asking|that|the message is|message|le message|dis|demande|que)';
const MESSAGE = new RegExp('^(?:שלחי|שלח|תשלחי|תשלח|תכתבי|תכתוב|כתבי|תגידי|תאמרי|תגיד|send|write|tell|envoie|envoyer|écris|dis)\\s+(?:(?:את\\s+)?(?:ה)?(הודעה|הודעת וואטסאפ|הודעה בוואטסאפ|וואטסאפ|ווצאפ|מייל|אימייל|a message|a whatsapp|message|whatsapp|an e-mail|an email|e-mail|email|mail|un message|un mail|un e-mail|un whatsapp|courriel)\\s+)?(?:ל|אל\\s+|to\\s+|à\\s+|a\\s+)([^:,]+?)\\s*(?:[:,]|\\s(?=' + MARK + '(?:\\s|$)|ש[א-ת]))\\s*(.+)$', 'i');
const MSG_VERB = /^(?:שלחי|שלח|תשלחי|תשלח|תכתבי|תכתוב|כתבי|תגידי|תאמרי|תגיד|send|write|tell|envoie|envoyer|écris|dis)\s+(?:(?:את\s+)?(?:ה)?(?:הודעה|הודעת וואטסאפ|הודעה בוואטסאפ|וואטסאפ|ווצאפ|מייל|אימייל|a message|a whatsapp|message|whatsapp|an e-mail|an email|e-mail|email|mail|un message|un mail|un e-mail|un whatsapp|courriel)\s+)?/i;
const CHANNEL_TAIL = /^(?:בוואטסאפ|בווצאפ|במייל|באימייל|on whatsapp|by whatsapp|via whatsapp|by email|by mail|by e-mail|par whatsapp|par mail|par e-mail|sur whatsapp)\s*[:,]?\s*/i;
const ASK_V = /^(?:שאלי|תשאלי|שאל|תשאל|ask(?: her| him| them)?|asking|demande(?:-lui)?)\s+/i;
const SAY_V = /^(?:ההודעה(?:\s+היא)?|הודעה|תכתבי|כתבי|תגידי(?:\s+(?:לו|לה|להם))?|תאמרי|saying|say|that|the message is|message|le message(?:\s+est)?|dis(?:-lui)?|que)(?:\s*[:,]\s*|\s+)/i;
function findPerson(text, people) {
  const hay = Office.normHe(text); let bp = null, bl = 0;
  // the name inside the text ("send to Dana Levy the logo"), or the text inside the name ("Shoval" for "ארגון שוב״ל")
  (people || []).forEach(p => (p.names || []).forEach(n => { const k = Office.normHe(n); if (!k || k.length < 3) return; const hit = hay.indexOf(k) >= 0 ? k.length : (hay.length >= 3 && k.indexOf(hay) >= 0) ? hay.length : 0; if (hit > bl) { bp = p; bl = hit; } }));
  // the first name alone ("to Roy" for "Roy Naor"), as a whole word, with or without a Hebrew prefix letter
  if (!bp) (people || []).forEach(p => (p.names || []).forEach(n => { const first = Office.normHe(n).split(/\s+/)[0]; if (!first || first.length < 3) return; const re = new RegExp('(?:^|\\s)(?:ל|ב|מ|של\\s+|עבור\\s+|את\\s+)?' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)'); if (re.test(hay) && first.length > bl) { bp = p; bl = first.length; } }));
  return bp ? { name: bp.label, phone: bp.phone, email: bp.email, about: bp.about, id: bp.id } : null;
}

/** The supplier an offer came from, guessed from the text: a phone number, an e-mail domain, or the supplier's or contact's name. */
export function guessSupplier(text, suppliers) {
  const t = str(text); const list = suppliers || [];
  const phones = [...t.matchAll(/(?:\+972[\s\-]?|0)5\d[\s\-]?\d{3}[\s\-]?\d{4}/g)].map(m => phoneDigits(m[0]));
  for (const p of phones) { const hit = list.find(s => s.phone && phoneDigits(s.phone) === p); if (hit) return hit; }
  const mails = [...t.matchAll(/[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g)];
  for (const m of mails) { const dom = m[1].toLowerCase(); const hit = list.find(s => s.email && s.email.toLowerCase().indexOf('@' + dom) >= 0 && !/gmail|walla|hotmail|outlook|yahoo/.test(dom)); if (hit) return hit; }
  const hay = Office.normHe(t); let best = null, bl = 0;
  list.forEach(s => {
    const name = Office.normHe(s.name || ''), contact = Office.normHe(s.contact || '');
    // the full name, its first two words ("מלון דניאל"), the contact's full and first name, and any alias
    const cands = [name, name.split(' ').slice(0, 2).join(' '), contact, contact.split(' ')[0]].concat(String(s.aliases || '').split(/[,;]+/).map(x => Office.normHe(x || '')));
    cands.filter(k => k && k.length >= 3).forEach(k => {
      const core = k.replace(/^(?:מלון|הוטל|hotel|hôtel|מסעדת|מסעדה)\s+/, '');
      if (hay.indexOf(k) >= 0 && k.length > bl) { best = s; bl = k.length; }
      else if (core.length >= 4 && hay.indexOf(core) >= 0 && core.length > bl) { best = s; bl = core.length; }
    });
  });
  return best;
}

/** What a command asks for: {kind: 'send'|'message'|'contact'|'invoice'|'supplierQuote'|'unknown', doc, to: {phone|email|name}} */
// "build me a quote for X", "new lead: ...", "ask quotes from hotels for X", "open X", "call X", "task for X: ...", "note on X: ...", "what is today"
const ACTIONS = [
  ['today', /^(?:מה יש לי היום|מה יש היום|מה היום|what(?:'s| is) (?:on )?today|aujourd['’]hui|qu['’]est-ce qu['’]il y a aujourd['’]hui)\??$/i],
  ['lead', /^(?:פנייה חדשה|פניה חדשה|לקוח חדש|ליד חדש|new lead|new client|new enquiry|nouveau client|nouvelle demande)\s*[:,]?\s*(.*)$/i],
  ['quote', /^(?:תבני|תבנה|בני|הכיני|תכיני|תכין|צרי|build|make|prepare|create|prépare|fais|crée)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:הצעת מחיר|הצעה|a quote|quote|un devis|devis)(?:\s+(?:ל|for|pour)\s*(.+))?$/i],
  ['ask', /^(?:תבקשי|בקשי|תבקש|תשלחי בקשה|ask for|request|demande)\s+(?:הצעות מחיר|הצעות|הצעת מחיר|הצעה|quotes|a quote|des devis|un devis)(?:\s+(?:מ|from|de|à|aux|au|auprès de|auprès des)\s*(.+?))?(?:\s+(?:ל|for|pour)\s*(.+))?$/i],
  ['call', /^(?:תתקשרי|התקשרי|תתקשר|חייגי|תחייגי|call|appelle)\s+(?:ל|to\s+|à\s+)?(.+)$/i],
  ['task', /^(?:משימה|תוסיפי משימה|הוסיפי משימה|תני משימה|add a task|new task|task|tâche|ajoute une tâche)\s*(?:ל|for|pour)?\s*([^:]+?)?\s*[:]\s*(.+)$/i],
  ['note', /^(?:רשמי|תרשמי|כתבי|תכתבי|note|write down|écris|note que)\s+(?:הערה\s+|a note\s+|une note\s+)?(?:על|about|on|sur)\s+([^:]+?)\s*[:]\s*(.+)$/i],
  ['open', /^(?:תפתחי|פתחי|תפתח|תראי לי|הראי לי|open|show me|ouvre|montre-moi)\s+(?:את\s+)?(?:ה)?(?:תיק|לקוח|ספק|case|client|supplier|dossier|fournisseur)?\s*(?:של\s+|of\s+|de\s+)?(.+)$/i]
];
export function parseCommand(text, docs, people) {
  const t = trim(text);
  const out = { kind: 'unknown', text: t, doc: null, to: null };
  if (!t) return out;
  for (const [kind, re] of ACTIONS) {
    const m = re.exec(t); if (!m) continue;
    out.kind = kind;
    if (kind === 'lead') out.body = trim(m[1] || '');
    if (kind === 'quote' || kind === 'open' || kind === 'call') { out.who = trim(m[1] || ''); out.to = findPerson(out.who, people); }
    if (kind === 'ask') { out.type = trim(m[1] || ''); out.who = trim(m[2] || ''); out.to = findPerson(out.who || out.type, people); if (!out.who && out.to) { out.who = out.type; out.type = ''; } }
    if (kind === 'task') { out.who = trim(m[1] || ''); const w = takeWhen(trim(m[2] || ''), new Date()); out.body = w.rest || trim(m[2] || ''); out.due = w.due; out.time = w.time; out.to = out.who ? findPerson(out.who, people) : null; }
    if (kind === 'note') { out.who = trim(m[1] || ''); out.body = trim(m[2] || ''); out.to = findPerson(out.who, people); }
    return out;
  }
  const rem = parseReminder(t, new Date()); if (rem) { out.kind = 'reminder'; out.reminder = rem; return out; }
  if (INVOICE.test(t) && /(רועי|roy|בקש|ask|demande)/i.test(t)) { out.kind = 'invoice'; out.invoice = parseInvoiceRequest(t); return out; }
  if (/(קיבלתי|יש לי|הגיעה|got|received|reçu|j'ai reçu)\s.*(הצעה|הצעת מחיר|quote|devis)/i.test(t) || /^(הצעה|הצעת מחיר|quote|devis)\s+(מ|from|de)\b/i.test(t)) {
    let bp = null, bl = 0;
    (people || []).filter(p => p.about === 'supplier' || !p.about).forEach(p => (p.names || []).forEach(n => { const k = Office.normHe(n); if (k && k.length >= 3 && k.length > bl && Office.normHe(t).indexOf(k) >= 0) { bp = p; bl = k.length; } }));
    out.kind = 'supplierQuote'; out.supplier = bp; return out;
  }
  const email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(t);
  // an Israeli mobile in any grouping the speech engine produces ("052-58708-38", "052 587 0838", "0525870838"), or an international number
  const phone = /(?:\+972[\s\-]?|0)5\d(?:[\s\-]?\d){7}(?!\d)/.exec(t) || /(?:\+|00)\d[\d\s\-]{7,16}\d/.exec(t);
  out.phoneFound = phone ? phonePretty(phone[0]) : '';
  // "save Roy's phone 052-1234567" / "הטלפון של רועי 052..." / "המייל של דנה dana@x.com"
  const contact = CONTACT.exec(t);
  if (contact && (phone || email)) {
    const who = trim(contact[1] || contact[2] || '').replace(/^(?:של|of|de)\s+/i, '');
    out.kind = 'contact'; out.contact = { name: who, phone: phone ? phonePretty(phone[0]) : '', email: email ? email[0] : '' };
    out.to = findPerson(who, people); return out;
  }
  // a free message: "send a message to Roy: I'm late" / "תגידי לדנה ש..." / "mail à Marc : ..."
  const cleanBody = (body, spoken) => {
    body = trim(body).replace(CHANNEL_TAIL, '');
    if (ASK_V.test(body)) { out.ask = true; return trim(body.replace(ASK_V, '')).replace(/[?.!]+$/, '').replace(/^אם\s/, 'האם ') + '?'; }
    if (SAY_V.test(body)) body = trim(body.replace(SAY_V, ''));
    // "תגידי לדנה שאני מאחרת": the ש is grammar, not part of the message. "שאל מתי" keeps its ש (it is the verb).
    if (spoken && /^ש[א-ת]/.test(body) && !/^(?:שאל|שלום|שלח|שמר|שוב|שיר|שבוע|שעה|שני|שלוש|שיש|שבע|שמונ|שם\b)/.test(body)) body = body.replace(/^ש/, '');
    return trim(body);
  };
  const isGroup = who => /^(?:ה)?קבוצ|^(?:the\s+)?group|^(?:le\s+|au\s+)?groupe/i.test(trim(who));
  // spoken (no ":" or ","): whatever comes after the number or the name is the message
  const positional = () => {
    if (!MSG_VERB.test(t) || INVOICE.test(t)) return null;
    const head = t.replace(MSG_VERB, '');
    const via = /(מייל|אימייל|mail|e-mail|email|courriel)/i.test(t.slice(0, t.length - head.length)) ? 'email' : 'whatsapp';
    const hit = email || phone;
    if (hit && head.indexOf(hit[0]) >= 0) {
      const at = head.indexOf(hit[0]);
      const body = cleanBody(head.slice(at + hit[0].length), true);
      if (!body) return null;
      const to = email ? { email: email[0] } : { phone: phonePretty(phone[0]) };
      // "send Dana 052-... hello": the number she read is used as is, and it can be kept on Dana's card afterwards
      const named = findPerson(head.slice(0, at).replace(/^(?:ל|אל\s+|to\s+|à\s+)/, ''), people);
      if (named && named.name) { to.name = named.name; to.about = named.about; to.id = named.id; if (!named.phone && to.phone) to.newPhone = true; else if (named.email && !to.email) to.email = named.email; }
      return { via, body, to };
    }
    let best = null;
    // the full name, or just the first name ("ארבל" for "ארבל גבילי"), wherever it sits in the sentence
    const low = head.toLowerCase();
    (people || []).forEach(p => (p.names || []).forEach(n => {
      const full = str(n).trim(); const first = full.split(/\s+/)[0];
      [full, first].forEach(k => {
        if (k.length < 3) return;
        const i = low.indexOf(k.toLowerCase()); if (i < 0) return;
        const after = low.charAt(i + k.length); if (after && !/[\s,.:;!?]/.test(after)) return;
        if (!best || i < best.i || (i === best.i && k.length > best.k.length)) best = { p, i, k };
      });
    }));
    if (!best) return null;
    const body = cleanBody(head.slice(best.i + best.k.length), true);
    return body ? { via, body, to: { name: best.p.label, phone: best.p.phone, email: best.p.email, about: best.p.about, id: best.p.id } } : null;
  };
  if (!/[:,]/.test(t)) { const p = positional(); if (p) { out.kind = 'message'; out.via = p.via; out.body = p.body; out.to = p.to; return out; } }
  const msg = MESSAGE.exec(t);
  if (msg) {
    const via = /(מייל|אימייל|mail|e-mail|email|courriel)/i.test(msg[1] || '') ? 'email' : 'whatsapp';
    // "send myself whatsapp ask..." : the channel word after the name is not part of the name
    const who = trim(msg[2]).replace(/\s+(?:ב?וואטסאפ|ב?ווצאפ|ב?מייל|באימייל|הודעה|on whatsapp|by whatsapp|via whatsapp|a whatsapp|by e?-?mail|par whatsapp|par mail|un whatsapp)$/i, '').trim();
    const body = cleanBody(msg[3] || '', !/[:,]/.test(t.slice(0, t.length - trim(msg[3] || '').length)));
    out.kind = 'message'; out.via = via; out.body = body;
    // "send Dana 052-... : hello" through the marker path too: the number she read, kept on Dana's card when it has none
    if (phone && !email) {
      const to = { phone: phonePretty(phone[0]) };
      const at = who.indexOf(phone[0]); const named = at > 0 ? findPerson(who.slice(0, at), people) : null;
      if (named && named.name) { to.name = named.name; to.about = named.about; to.id = named.id; if (!named.phone) to.newPhone = true; }
      out.to = to; return out;
    }
    out.to = email ? { email: email[0] } : phone ? { phone: phonePretty(phone[0]) } : isGroup(who) ? { name: who.replace(/^(?:ה)?קבוצ(?:ה|ת)\s*(?:של\s+)?|^(?:the\s+)?group\s*(?:of\s+)?|^(?:le\s+|au\s+)?groupe\s*(?:de\s+|des\s+)?/i, '').trim() || who, group: true } : findPerson(who, people);
    if (!out.to) out.to = { name: who };
    return out;
  }
  { const p = positional(); if (p) { out.kind = 'message'; out.via = p.via; out.body = p.body; out.to = p.to; return out; } }
  if (email) out.to = { email: email[0] };
  else if (phone) out.to = { phone: phonePretty(phone[0]) };
  let body = t.replace(SEND, '').replace(email ? email[0] : '', '').replace(phone ? phone[0] : '', '');
  // the document: the library entry whose title words appear in the text (longest match)
  let best = null, bestLen = 0;
  (docs || []).forEach(d => {
    const names = [d.title].concat(d.aliases || []);
    // "the incorporation certificate" for "incorporation certificate": every word of the name may carry a leading ה in the text
    const hay = Office.normHe(body);
    names.forEach(n => { const k = Office.normHe(n); if (!k || k.length <= bestLen) return; const re = new RegExp(k.split(/\s+/).map(w => 'ה?' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')); if (re.test(hay)) { best = d; bestLen = k.length; } });
  });
  out.doc = best;
  if (!out.to) out.to = findPerson(body, people);
  if (SEND.test(t) || out.doc) out.kind = 'send';
  return out;
}

/** "לקוח: קומיוניטי או (ע״ר) 580777894, עין ורד 1 תל אביב. מקדמה 3,000 + מע״מ הפקה, 20 כריות 1,595 + מע״מ"
    → {client, taxId, address, email, items:[{desc, amount}], total} */
/* Spelled letters: she says "ב' נקודה ד'" and the recognizer writes "בית. ד'" or "בית נקודה דלת".
   Letter names next to a dot, a geresh or the word "נקודה" become the letters themselves: "ב.ד". */
const LETTER_NAMES = { 'אלף': 'א', 'בית': 'ב', 'גימל': 'ג', 'דלת': 'ד', 'הא': 'ה', 'וו': 'ו', 'זין': 'ז', 'חית': 'ח', 'טית': 'ט', 'יוד': 'י', 'כף': 'כ', 'למד': 'ל', 'מם': 'מ', 'נון': 'נ', 'סמך': 'ס', 'עין': 'ע', 'פא': 'פ', 'פה': 'פ', 'צדי': 'צ', 'קוף': 'ק', 'ריש': 'ר', 'שין': 'ש', 'תו': 'ת' };
export function spelledLetters(text) {
  let t = str(text).replace(/\s+נקודה\s+/g, '. ').replace(/\s+נקודה(?=\s|$)/g, '.');
  const NAME = '(?:' + Object.keys(LETTER_NAMES).join('|') + ')';
  // "בית. ד'" / "ב. דלת" / "בית נקודה דלת": a name (or a single letter) followed by a mark, then another
  // gershayim ("מע״מ", "ש״ח") are left alone: only a dot or a geresh, or a spelled name, marks a spelled abbreviation
  const re = new RegExp('(?:^|(?<=[\\s(]))(ל|ב|מ|ו)?(' + NAME + '|[א-ת])\\s*([.׳\'])\\s*(' + NAME + '|[א-ת])(?=[.׳\'"״\\s,]|$)([.׳\'])?', 'g');
  return t.replace(re, (m, pre, a, mark, b, end) => (pre || '') + (LETTER_NAMES[a] || a) + '.' + (LETTER_NAMES[b] || b) + '.');
}

/** The client she named, from the app's list: name, legal name or an alias, written with or without dots and spaces. */
export function findClientIn(text, clients) {
  const key = x => Office.normHe(str(x)).replace(/[.׳'"״\-]/g, '').replace(/\s+/g, '');
  const hay = ' ' + key(spelledLetters(text)) + ' ';
  const hayWords = key(spelledLetters(text).replace(/[.׳'"״]/g, ' ')).length;
  let best = null, bl = 0;
  (clients || []).forEach(c => {
    const names = [c.name, c.legalName].concat(str(c.aliases).split(/[,;]+/)).map(key).filter(n => n.length >= 2);
    names.forEach(n => {
      if (n.length > bl && hay.indexOf(n) >= 0) {
        // two letters ("בד") must stand as their own word (with dots/spaces around), not inside another word
        if (n.length <= 3) { const re = new RegExp('(?:^|[\\s,:(])(?:ל|ב|מ|של|עבור)?' + n.split('').join('[.׳\'"״\\s]*') + '[.׳\'"״]*(?=[\\s,.;:)]|$)'); if (!re.test(spelledLetters(text))) return; }
        best = c; bl = n.length;
      }
    });
  });
  return best;
}

export function parseInvoiceRequest(text, clients) {
  const t = spelledLetters(str(text).replace(/[‎‏]/g, ''));
  const out = { client: '', taxId: '', address: '', email: '', items: [], total: 0, kind: /חשבון עסקה|דרישת תשלום|proforma/i.test(t) ? 'חשבון עסקה' : 'חשבונית', channel: /(?:^|\s)(?:במייל|באימייל|מייל|by e?-?mail|par (?:e-?)?mail|courriel)(?=\s|$)/i.test(t) ? 'mail' : /וואטסאפ|whatsapp/i.test(t) ? 'wa' : '' };
  const em = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(t); if (em) out.email = em[0];
  // the company number, also as she dictates it: "ח.פ. 514 572 312", "חפ 51-457-2312"
  const ID_WORD = "(?:ח\\.?\\s?פ\\.?|ע\\.?\\s?ר\\.?|ע\\.?\\s?מ\\.?|ת\\.?\\s?ז\\.?|מס'? ?חברה|מספר חברה|company no\\.?|company number|reg\\.?|siret|siren)";
  const id = new RegExp(ID_WORD + "\\s*:?\\s*(\\d(?:[\\d\\s\\-]{6,14})\\d)", 'i').exec(t) || /\b(5\d{8})\b/.exec(t);
  if (id) { const digits = id[1].replace(/\D/g, ''); if (digits.length >= 8 && digits.length <= 9) out.taxId = digits; }
  const cl = /(?:לכבוד|לקוח(?: חדש)?|client|customer|à l'attention de|pour le client)\s*:?\s*([^\n,.]{2,60}?)(?=\s*(?:ח\.?פ|ע\.?ר|ע\.?מ|\d{8,9}|[\n,.]|$))/i.exec(t)
    // "חשבונית לחברת אלפא ח.פ. 514..." / "invoice for Alpha Ltd, company no. ...": the name sits between the request and the number
    || new RegExp("(?:חשבונית(?:\\s+מס)?|חשבון\\s+עסקה|דרישת\\s+תשלום|invoice|facture)\\s+(?:בבקשה\\s+|please\\s+)?(?:ל|for\\s+|to\\s+|pour\\s+|à\\s+)([^\\n,.]{2,60}?)\\s*,?\\s*(?=" + ID_WORD + "\\s*:?\\s*\\d)", 'i').exec(t)
    // the words right before the number ("... מועצה אזורית גליל עליון ח.פ. 500...")
    || new RegExp("((?:[^\\s\\d,.]+\\s+){1,5}?[^\\s\\d,.]+)\\s*,?\\s*(?=" + ID_WORD + "\\s*:?\\s*\\d)", 'i').exec(t);
  if (cl) {
    out.client = trim(cl[1]).replace(/\s*(ח\.?פ\.?|ע\.?ר\.?|ע\.?מ\.?)\s*\d*$/, '').replace(/\d{8,9}/, '').trim();
    // only the guessed forms carry the request words and the ל prefix; "לקוח: לקוח חדש" keeps its name whole
    if (!/^(?:לכבוד|לקוח|client|customer|à l'attention|pour le client)/i.test(cl[0])) out.client = out.client.replace(/^(?:תוציא|תוציאי|הוציאי|בבקשה|לי|את|ה?חשבונית|חשבון|עסקה|invoice|facture|please|issue|make)\s+/i, '').replace(/^(?:ל|for\s+|to\s+|pour\s+)(?=\S)/, '').trim();
  }
  // a client the app knows, named anywhere in the sentence ("חשבונית לב.ד. על 10000")
  const known = findClientIn(t, clients);
  if (known) { out.client = known.legalName || known.name; out.clientId = known.id; out.taxId = out.taxId || known.taxId || ''; out.address = known.address || ''; out.email = out.email || known.invoiceEmail || known.email || ''; }
  const addr = /(?:כתובת|address|adresse)\s*:?\s*([^\n]{3,80})/i.exec(t) || /((?:רח(?:וב|')?|שד(?:רות|')?)\s?[^\n,]{2,40}(?:,?\s*[^\n,]{2,30})?)/.exec(t)
    || /^((?![^\n]*(?:₪|ש"?ח|מע["״]?מ|vat|\d{8,}))[^\n\d]{2,30}\s\d{1,4}\s*,\s*[^\n\d]{2,30})$/m.exec(t);
  if (addr) out.address = trim(addr[1]);
  // "עבור הפקה של חיים ומשה" / "for the J50 delegation": what the invoice is for
  const forM = /(?:^|\s)(?:עבור|בעבור|בגין|for|pour)\s+([^\n.;]{2,80}?)(?=\s+(?:בנוסף|וגם|ותשלח|תשלח|שלח|ואבקש|אבקש|and also|also|et aussi)(?=\s|$)|[.;]|$)/i.exec(t);
  const purpose = forM ? trim(forM[1]).replace(/\s+(?:על|of|de)\s+\d[\d,.]*.*$/, '').trim() : '';
  // amounts: "3,000 + מע"מ", "1595 פלוס מעמ", "10.500 plus VAT", "27,310+ מע״מ", "10000 לפני מע"מ", "5000 שקל"
  const re = /([^\n.;]{0,60}?)(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(?:₪|ש"?ח|שקל(?:ים)?|nis)?\s*(\+|פלוס|plus|כולל|incl\.?|TTC|HT|לפני|before|לא כולל|hors)?\s*(מע["״]?מ|vat|tva|taxe)?/gi;
  let m;
  while ((m = re.exec(t))) {
    if (!m[4] && !/₪|ש"?ח|שקל/.test(m[0])) continue;
    const num = Office.num(m[2].replace(/\.(\d{3})\b/g, ',$1'));
    if (isNaN(num) || num < 50 || String(num) === out.taxId) continue;
    let desc = trim(m[1]).replace(/^(?:סכומים?|סכום|amount|montant)\s*:?\s*/i, '').replace(/[:\-–]+$/, '').trim();
    // the words before the number often carry the request itself ("תוציא לי חשבונית בבקשה ל weRisrael מקדמה"): keep what follows
    desc = desc.replace(/^.*?(?:חשבונית(?: מס)?|חשבון עסקה|דרישת תשלום|invoice|facture)\s*(?:בבקשה|please|s'il te plaît)?\s*/i, '');
    if (known) [known.name, known.legalName].concat(str(known.aliases).split(/[,;]+/)).map(trim).filter(Boolean).sort((a, b) => b.length - a.length).forEach(n => {
      const re = new RegExp('^(?:ל|for|to|pour|à)?\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '[.׳\'"״]?').replace(/\s+/g, '\\s*') + '[.׳\'"״]*\\s*(?:על|of|sur|de)?\\s*', 'i');
      desc = desc.replace(re, '');
    });
    desc = desc.replace(/^(?:על|of|sur|de|בבקשה|please)\s+/i, '').replace(/^(?:עבור|בעבור|בגין|for|pour)\s+/i, '').replace(/^ו(?=[א-ת]{3,})/, '').replace(/\s+(?:על|of|sur|de)$/i, '').trim();
    if (!desc || /^(?:חשבונית|חשבון|invoice|facture|בבקשה|please|על|of|sur)$/i.test(desc)) desc = purpose;
    if (!desc) { const after = /^[^\n.;]{2,80}?(?=\s+(?:בנוסף|וגם|ותשלח|תשלח|שלח|ואבקש|אבקש|and also|also|et aussi)(?=\s|$)|[.;\n]|$)/.exec(t.slice(re.lastIndex).replace(/^\s*(?:מע["״]?מ|vat|tva)?\s*/i, '')); if (after) desc = trim(after[0]).replace(/\s*(?:סיימתי|תודה)\s*$/, ''); }
    const incl = m[3] && /כולל|incl|TTC/i.test(m[3]);
    out.items.push({ desc, amount: incl ? Math.round(num / 1.18) : num, incl: !!incl });
  }
  out.total = out.items.reduce((a, x) => a + x.amount, 0);
  // what she asked Roy on top ("בנוסף אבקש ממנו לבדוק האם שולם חודש קודם")
  const extra = /(?:בנוסף|וגם|and also|also|en plus|aussi)\s*[,:]?\s*(?:אבקש ממנו|אבקש|תבקש ממנו|ask him to|ask him|demande-lui de|demande)?\s*([^\n]{3,160})$/i.exec(t);
  if (extra) out.note = trim(extra[1]).replace(/\s*(?:סיימתי|תודה|merci|thanks)\s*[.!]?$/i, '');
  return out;
}

/** The message to Roy, built from a parsed request (and what the app knows about the client). */
export function invoiceRequestText(req, extra, signer) {
  extra = extra || {};
  const lines = ['שלום רועי,', '', 'צריך להוציא ' + (req.kind || 'חשבונית') + ':',
    '• לקוח: ' + (req.client || extra.client || ''),
    (req.taxId || extra.taxId) ? '• ח.פ. / ע.ר: ' + (req.taxId || extra.taxId) : '',
    (req.address || extra.address) ? '• כתובת: ' + (req.address || extra.address) : '',
    (req.email || extra.email) ? '• לשלוח ל: ' + (req.email || extra.email) : ''];
  (req.items || []).forEach(x => lines.push('• ' + (x.desc ? x.desc + ': ' : '') + Office.money(x.amount) + ' + מע״מ'));
  if ((req.items || []).length > 1) lines.push('• סה״כ לפני מע״מ: ' + Office.money(req.total));
  if (req.note || extra.note) lines.push('', 'ועוד: ' + (req.note || extra.note));
  lines.push('', 'תודה,', signer || 'וירג׳יני');
  return lines.filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}

/** Lines of a supplier's quote from its text (pasted, or extracted from a PDF): item + price, plus a total when stated. */
export function parseSupplierQuote(text) {
  const lines = str(text).split(/\n+/).map(trim).filter(Boolean);
  const items = [];
  let total = null;
  lines.forEach(l => {
    if (/סה["״]?כ|total|totale|montant total/i.test(l)) { const n = lastNumber(l); if (n) total = n; return; }
    const n = lastNumber(l);
    if (!n || n < 10) return;
    const desc = l.replace(/[\d,.\s₪]+(?:₪|ש"?ח|nis|ils|€)?\s*(?:\+\s*מע["״]?מ|כולל מע["״]?מ|plus vat|incl\.? vat|ht|ttc)?\s*$/i, '').replace(/^[\-•*\d.)\s]+/, '').trim();
    if (!desc || desc.length < 2) return;
    const q = /(?:^|\s)(\d{1,3})\s*(?:x|×|יח'?|יחידות|pcs|pers\.?|personnes|משתתפים|משתתפות|אנשים|איש|אורחים|מנות)(?=\s|$|[,.])/i.exec(desc);
    items.push({ item: q ? trim(desc.replace(q[0], ' ')) : desc, cost: n, qty: q ? +q[1] : 1 });
  });
  return { items, total, sum: items.reduce((a, x) => a + x.cost, 0) };
}
function lastNumber(l) {
  const ms = l.match(/\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if (!ms) return null;
  const n = Office.num(ms[ms.length - 1].replace(/\.(\d{3})\b/g, ',$1'));
  return isNaN(n) ? null : n;
}

/** Supplier lines → quote lines with a markup, ready for the client's quote. */
export function markupLines(items, pct, supplier) {
  return (items || []).map(x => ({ item: x.item, en: '', fr: '', unit: x.qty > 1 ? 'משתתף' : 'אירוע', qty: x.qty || 1, days: 1,
    cost: x.qty > 1 ? Math.round(x.cost / x.qty) : x.cost, margin: pct, price: '', supplierId: supplier ? supplier.id : '', supplier: supplier ? supplier.name : '', section: supplier ? supplier.type : '' }));
}

/** "I sent the client a quote based on yours" note to the supplier, in the supplier's language. */
export function supplierMarkupMessage(sup, cs, total, lang, signer) {
  const L = lang || 'he';
  const n = trim(sup.contact || sup.name).split(' ')[0];
  const ev = Office.eventLine(cs);
  const T = {
    he: 'היי ' + n + ', תודה על ההצעה ל' + ev + '.\nהעברתי ללקוח הצעה על בסיס ההצעה שלך, בסכום כולל של ' + Office.money(total) + ' לפני מע״מ (כולל דמי ההפקה שלנו).\nהמחיר בינינו נשאר כמו שסיכמנו. תאשר לי שקיבלת, ושהמפרט מולך עדיין תקף.',
    en: 'Hi ' + n + ', thank you for the quote for ' + ev + '.\nI sent the client a proposal based on yours, at a total of ' + Office.money(total) + ' before VAT (including our production fee).\nThe price between us stays as agreed. Please confirm you received this and the spec still holds.',
    fr: 'Bonjour ' + n + ', merci pour le devis pour ' + ev + '.\nJ’ai transmis au client une proposition basée sur la vôtre, pour un total de ' + Office.money(total) + ' HT (frais de production inclus).\nLe prix entre nous reste celui convenu. Merci de me confirmer la réception et que le descriptif est toujours valable.'
  }[L] || '';
  return T + (signer ? '\n' + signer : '');
}

/** Calls tried yesterday (or since `since`) that were not answered. */
export function unansweredSince(calls, since, today) {
  const s = Office.day(since), t = Office.day(today) || Office.day(new Date());
  return (calls || []).filter(c => c.status === 'noanswer' && c.lastTry && Office.day(c.lastTry) && Office.day(c.lastTry) >= s && Office.day(c.lastTry) < t);
}
/** Handing a call to someone else: the message, in the helper's language. */
export function delegateCallMessage(call, who, cs, lang, signer) {
  const L = lang || 'he';
  const n = trim(who).split(' ')[0];
  const T = {
    he: 'היי ' + n + ', תוכל/י להתקשר ל' + call.name + ' (' + (call.phone || '') + ')?\n' + (call.why ? 'מה צריך: ' + call.why + '\n' : '') + (cs ? 'לגבי: ' + Office.eventLine(cs) + '\n' : '') + 'ניסיתי ' + (call.attempts || 1) + ' פעמים בלי מענה. תעדכן/י אותי מה יצא.',
    en: 'Hi ' + n + ', could you call ' + call.name + ' (' + (call.phone || '') + ')?\n' + (call.why ? 'What we need: ' + call.why + '\n' : '') + (cs ? 'About: ' + Office.eventLine(cs) + '\n' : '') + 'I tried ' + (call.attempts || 1) + ' times with no answer. Let me know how it went.',
    fr: 'Bonjour ' + n + ', peux-tu appeler ' + call.name + ' (' + (call.phone || '') + ') ?\n' + (call.why ? 'Ce qu’il faut : ' + call.why + '\n' : '') + (cs ? 'Au sujet de : ' + Office.eventLine(cs) + '\n' : '') + 'J’ai essayé ' + (call.attempts || 1) + ' fois sans réponse. Tiens-moi au courant.'
  }[L];
  return T + (signer ? '\n' + signer : '');
}
