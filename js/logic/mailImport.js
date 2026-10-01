/* A client's e-mail (or a WhatsApp message) pasted as it is: headers, quoted replies, signature and all.
   parseMail() strips what is not the message, reads who wrote, from which organisation, what event, when, how many,
   where, for how much, at what hours, and which suppliers it needs (through parseBrief), and matches the sender to a
   client the app knows. Pure, tested in tests/mailImport.test.mjs. Nothing here writes or sends. */
import Office from './office.js';
import { parseBrief } from './brief.js';
import { str, trim, samePhone } from './core.js';

const MONTH_NAMES = 'ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|jan|feb|sept?|oct|nov|dec|janv|févr|juil';
const MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12,
  jan: 1, feb: 2, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, janv: 1, 'févr': 2, juil: 7
};
const monthNo = w => MONTHS[str(w).toLowerCase()] || 0;

/* ---------------- 1. cleaning: headers, quoted replies, signature ---------------- */

const HEADER_RE = /^\s*\**\s*(from|de|מאת|subject|objet|sujet|נושא|date|sent|envoyé|envoye|תאריך|נשלח|to|à|a|אל|cc|cci|bcc|עותק|reply-to|répondre à)\s*\**\s*:\s*(.*)$/i;
const HEADER_KEY = { from: 'from', de: 'from', 'מאת': 'from', subject: 'subject', objet: 'subject', sujet: 'subject', 'נושא': 'subject', date: 'date', sent: 'date', 'envoyé': 'date', envoye: 'date', 'תאריך': 'date', 'נשלח': 'date', to: 'to', 'à': 'to', a: 'to', 'אל': 'to', cc: 'cc', cci: 'cc', bcc: 'cc', 'עותק': 'cc', 'reply-to': 'replyTo', 'répondre à': 'replyTo' };
const FORWARD_RE = /^\s*-{2,}\s*(?:forwarded message|message transféré|message transfere|הודעה שהועברה|הודעה מועברת)\s*-{2,}\s*$|^\s*begin forwarded message:?\s*$|^\s*début du message réexpédié\s*:?\s*$/i;
const QUOTE_START = [
  /^\s*-{2,}\s*(?:original message|message d'origine|message original|הודעה מקורית)\s*-{2,}\s*$/i,
  /^\s*on\s.{3,120}?\bwrote\s*:\s*$/i,
  /^\s*le\s.{3,120}?\sa\s+écrit\s*:\s*$/i,
  /^\s*(?:בתאריך|ב-?יום)\s.{3,140}?\sכתב(?:ה|\/ה)?\s*:?\s*$/,
  /^\s*_{5,}\s*$/
];
const SIGNOFF_RE = /^\s*(?:תודה(?: רבה| מראש)?|בתודה(?: מראש)?|בברכה|בכבוד רב|להתראות|נתראה|שבוע טוב|best(?: regards| wishes)?|(?:kind|warm) regards|regards|thanks(?: a lot| so much| in advance)?|thank you(?: in advance)?|many thanks|cheers|sincerely|cordialement|bien cordialement|bien à vous|merci(?: beaucoup| d'avance)?|à bientôt|amicalement|sincèrement|bonne journée|belle journée)\s*[,.!:]*\s*(.*)$/i;
const SENT_FROM_RE = /^\s*(?:sent from my|envoyé de mon|envoyé depuis|נשלח מה-?|נשלח מ(?:ה)?מכשיר)\b.*$/i;
const CLEAN_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Mail header value "Name <mail>" / "mail" / "Name" / "name@x <name@x>" → {name, email}. */
export function parseAddress(v) {
  const s = trim(str(v).replace(CLEAN_MARKS, '').replace(/^mailto:/i, ''));
  const em = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(s);
  let name = s.replace(/<[^>]*>/g, ' ').replace(/\([^)]*\)/g, ' ');
  if (em) name = name.replace(em[0], ' ');
  name = trim(name.replace(/^["'\s]+|["'\s]+$/g, '').replace(/^(.+?),\s+(.+)$/, (m, a, b) => /\s/.test(a) ? m : b + ' ' + a));
  if (/^[\w.\-]+$/.test(name) && em && em[0].indexOf(name) === 0) name = '';
  return { name, email: em ? em[0].toLowerCase() : '' };
}

/** Splits a pasted mail into its parts. {headers:{from,subject,date,to}, body, signature, quoted, hadQuote} */
export function cleanMail(text) {
  let lines = str(text).replace(CLEAN_MARKS, '').replace(/\r\n?/g, '\n').split('\n');
  // a forwarded mail: what is after the marker is the client's mail
  const fw = lines.findIndex(l => FORWARD_RE.test(l));
  if (fw >= 0) lines = lines.slice(fw + 1);
  // headers at the top (blank lines between them are allowed, a non-header line ends them)
  const headers = {};
  let i = 0, seen = false;
  while (i < lines.length) {
    const l = lines[i];
    if (!trim(l)) { if (!seen) { i++; continue; } let j = i + 1; while (j < lines.length && !trim(lines[j])) j++; if (j < lines.length && HEADER_RE.test(lines[j]) && HEADER_KEY[HEADER_RE.exec(lines[j])[1].toLowerCase()] !== 'to') { i = j; continue; } break; }
    const m = HEADER_RE.exec(l);
    if (!m) break;
    const k = HEADER_KEY[m[1].toLowerCase()];
    // "A:" in French is the recipient; a Hebrew "א:" would be odd, so only accept it before the body
    if (k && headers[k] == null) headers[k] = trim(m[2]);
    seen = true; i++;
  }
  let rest = lines.slice(i);
  // the quoted reply: everything from the first marker on, and every ">" line
  let hadQuote = false, quoted = [];
  const cut = (() => {
    for (let k = 0; k < rest.length; k++) {
      const l = rest[k];
      if (QUOTE_START.some(re => re.test(l))) return k;
      // "On Mon, 28 Sep 2026 at 10:15, X <x@y>" + next line "wrote:"
      if (/^\s*(?:on|le)\s.{3,140}$/i.test(l) && k + 1 < rest.length && /^\s*(?:wrote|a écrit)\s*:\s*$/i.test(rest[k + 1])) return k;
      if (/^\s*>/.test(l)) return k;
      // an Outlook-style header block after the body is the previous mail
      if (k > 0 && /^\s*(?:from|de|מאת)\s*:/i.test(l) && rest.slice(k + 1, k + 5).some(x => /^\s*(?:sent|date|envoyé|subject|objet|נושא|נשלח|to|à)\s*:/i.test(x))) return k;
    }
    return -1;
  })();
  if (cut >= 0) { hadQuote = true; quoted = rest.slice(cut); rest = rest.slice(0, cut); }
  rest = rest.filter(l => !/^\s*>/.test(l) && !SENT_FROM_RE.test(l));
  // the signature: after "-- ", or after the sign-off line
  let body = rest, signature = [], signName = '';
  const sepAt = rest.findIndex((l, k) => k > 0 && /^\s*(?:--\s*|__+|–{1,2}|—)$/.test(l));
  if (sepAt >= 0) { signature = rest.slice(sepAt + 1); body = rest.slice(0, sepAt); }
  let so = -1;
  for (let k = body.length - 1; k >= 0; k--) { if (trim(body[k]) && SIGNOFF_RE.test(body[k])) { so = k; break; } }
  if (so >= 0 && so >= body.length - 8) {
    const m = SIGNOFF_RE.exec(body[so]);
    const after = trim(m[1]).replace(/^[,\-–]\s*/, '');
    if (after && /^[\u0590-\u05FFA-Za-zÀ-ÿ'׳\-. ]{2,40}$/.test(after) && after.split(/\s+/).length <= 4) signName = after;
    signature = body.slice(so + 1).concat(signature); body = body.slice(0, so);
  }
  const strip = a => a.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { headers, body: strip(body), signature: strip(signature), signName, quoted: strip(quoted), hadQuote };
}

/* ---------------- 2. the pieces ---------------- */

const GENERIC_DOMAINS = /^(?:gmail|googlemail|walla|hotmail|yahoo|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|012|013|014|015|017|018|netvision|bezeqint|zahav|smile|nana|nana10|orange|free|wanadoo|sfr|laposte|bbox|gmx|web|t-online|yandex|mail|email|hushmail|tutanota)\.(?:[a-z]{2,}\.)?[a-z]{2,}$/i;
export function emailDomain(email) { const m = /@([A-Za-z0-9.\-]+)$/.exec(str(email).toLowerCase()); return m ? m[1] : ''; }
export function isGenericDomain(d) { return !d || GENERIC_DOMAINS.test(d); }

const ORG_WORDS_HE = 'חברת|עמותת|עיריית|מועצה אזורית|מועצה מקומית|המועצה האזורית|המועצה המקומית|ארגון|קרן|מכללת|אוניברסיטת|אגודת|התאחדות|איגוד|לשכת|משרד|בית הספר|בית ספר|תנועת|מרכז|קיבוץ|מושב|בנק|מכון';
const ORG_WORDS_EN = 'company|municipality|foundation|association|university|college|institute|ministry|council|school|organization|organisation|group|bank|stiftung|gmbh|ltd|inc|llc|sa|sas|sarl|mairie|fondation|université|entreprise|société|ecole|école|lycée|institut|conseil';
const ORG_SUFFIX = /\b(?:בע["״]?מ|ע["״]?ר|ltd\.?|inc\.?|llc|gmbh|ag|plc|co\.|corp\.?|sa|sas|sarl|stiftung|foundation|association|university|université|institute|institut|municipality|mairie|group|ministry|council)\b|בע"מ|בע״מ|ע"ר|ע״ר|\(ע["״]?ר\)/i;
const TITLE_WORDS = /\b(?:manager|director|coordinator|assistant|head of|chief|ceo|cfo|coo|hr|vp|officer|responsable|directeur|directrice|chargée?|assistante?|gérante?|président|présidente|secrétaire|coordinat(?:eur|rice))\b|מנהל|מנהלת|רכז|רכזת|אחראי|אחראית|סמנכ|מנכ|יו"ר|יו״ר|עוזר|עוזרת|מזכיר|מזכירה|משאבי אנוש|רווחה|מחלקת|אגף|מחלקה/i;

/** The organisation the writer belongs to: the body, the signature, or the e-mail domain as a last guess. */
export function takeOrg(body, signature, email) {
  const clean = s => trim(str(s)).replace(/[,.;:!?]+$/, '').replace(/^(?:ה|the\s+|la\s+|le\s+|l')/i, m => (/^ה/.test(m) ? 'ה' : '')).trim();
  let m;
  const b = str(body);
  // "שמי דנה מחברת אלפא" / "אני מעמותת מעוז" / "מטעם עיריית חריש"
  if ((m = new RegExp('(?:^|\\s)(?:מ|מטעם\\s+|בשם\\s+)(' + ORG_WORDS_HE + ')\\s+([^\\n,.;:!?()]{2,45}?)(?=[\\n,.;:!?()]|\\s+(?:ו|אנחנו|אנו|רוצים|רוצה|מעוניינים|מעוניינת|מעוניין|מחפשים|מחפשת|מחפש|מבקשים|מבקשת|מבקש|ואנחנו|ואנו|עם|ל|ב|שרוצים)(?:\\s|$)|$)').exec(b))) return clean(m[1] + ' ' + m[2]);
  if ((m = new RegExp('(?:^|\\s)(' + ORG_WORDS_HE + ')\\s+([^\\n,.;:!?()]{2,45}?)(?=[\\n,.;:!?()]|\\s+(?:ו|אנחנו|אנו|רוצים|רוצה|מעוניינים|מעוניינת|מעוניין|מחפשים|מחפשת|מחפש|מבקשים|מבקשת|מבקש|ואנחנו|ואנו|עם|ל|ב|שרוצים|מתכננת|מתכנן|מתכננים|מארגנת|מארגן|מארגנים|חוגגת|חוגג|חוגגים)(?:\\s|$)|$)').exec(b))) return clean(m[1] + ' ' + m[2]);
  // "I'm Dana from Alpha Ltd" / "writing on behalf of X" / "we at X"
  if ((m = /(?:\b(?:i(?:'m| am)|this is|my name is)\s+[A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?\s*,?\s*|\b(?:on behalf of|we at|here at|writing from)\s+)(?:the\s+)?(?:from|at|of|with)?\s*([A-Z][^\n,.;:!?()]{1,50}?)(?=[\n,.;:!?()]|\s+(?:and|we|our|in|for|to|which|where)\b|$)/.exec(b)) && !/^(?:from|at|of|with)$/i.test(m[1])) return clean(m[1].replace(/^(?:from|at|of|with)\s+/i, ''));
  // "de la société X" / "de l'association X" / "chez X" / "pour le compte de X"
  if ((m = /(?:de la (?:société|part de la société|mairie|fondation|commune)|de l'(?:entreprise|association|université|école|institut)|du (?:groupe|cabinet|lycée|conseil)|pour le compte de|au nom de|chez)\s+([^\n,.;:!?()]{2,50}?)(?=[\n,.;:!?()]|\s+(?:et|nous|qui|pour|dans|avec|souhaite|souhaitons|organise|organisons)\b|$)/i.exec(b))) return clean(m[1]);
  // the signature: a line with a company suffix or an organisation word, or the line after the name/title
  const sig = str(signature).split('\n').map(trim).filter(Boolean);
  for (const l of sig) if (ORG_SUFFIX.test(l) && !/@|https?:|www\./i.test(l) && l.length <= 60) return clean(l.replace(/^(?:[^|•·]*[|•·]\s*)?/, m2 => (/\b(?:ltd|inc|gmbh|sa|sas|sarl|בע|ע״ר|ע"ר)/i.test(m2) ? m2 : '')).replace(/\s*[|•·].*$/, '') || l);
  for (const l of sig) if (new RegExp('^(?:' + ORG_WORDS_HE + ')\\s', 'u').test(l) || new RegExp('\\b(?:' + ORG_WORDS_EN + ')\\b', 'i').test(l)) if (!/@|https?:|www\.|\d{7,}/.test(l) && !TITLE_WORDS.test(l) && l.length <= 60) return clean(l);
  // "Dana Cohen | HR manager | Alpha": the third piece
  for (const l of sig) if (/\s[|•·]\s/.test(l)) { const parts = l.split(/\s[|•·]\s/).map(trim); const org = parts.find(p => !TITLE_WORDS.test(p) && !/@|\d{6,}/.test(p) && p !== sig[0]); if (org && parts.length >= 2 && parts.indexOf(org) > 0) return clean(org); }
  // a title line, then the organisation on the next line
  for (let k = 0; k < sig.length - 1; k++) if (TITLE_WORDS.test(sig[k]) && !/@|\d{6,}|https?:/.test(sig[k + 1]) && !TITLE_WORDS.test(sig[k + 1]) && sig[k + 1].length <= 50 && !/^[\d\s+\-()]+$/.test(sig[k + 1])) return clean(sig[k + 1]);
  // "HR manager, Alpha Ltd" on one line
  for (const l of sig) if (TITLE_WORDS.test(l) && /,\s*\S/.test(l)) { const tail = trim(l.split(',').slice(-1)[0]); if (tail && !TITLE_WORDS.test(tail) && !/@/.test(tail)) return clean(tail); }
  // the e-mail domain, when it is not a public provider: shoval-net.org → "shoval-net"
  const d = emailDomain(email);
  if (!isGenericDomain(d)) { const label = d.replace(/\.(?:co|org|ac|gov|muni|net|com)?\.?[a-z]{2,3}$/i, '').split('.').slice(-1)[0]; return label ? label.charAt(0).toUpperCase() + label.slice(1) : ''; }
  return '';
}

const KIND_WORDS = [
  ['חתונה', /חתונ|חופה|wedding|mariage/i],
  ['בר או בת מצווה', /בר[ -]?מצו|בת[ -]?מצו|ba[rt][ -]?mit[sz]va/i],
  ['יום הולדת', /יום הולדת|יומולדת|birthday|anniversaire/i],
  ['כנס', /כנס|כינוס|ועידה|conference|conférence|congrès|congres|symposium|סימפוזיון|summit/i],
  ['יום גיבוש', /גיבוש|סמינר|יום עיון|ימי עיון|סדנה|סדנא|סדנת|סדנאות|השתלמות|team[ -]?building|seminar|séminaire|seminaire|workshop|atelier|retreat|off-?site|journée d'étude|journée d'équipe|study day|away ?day|kick-?off|הכשרה|training/i],
  ['משלחת או סיור', /משלחת|סיור|טיול|delegation|délégation|study tour|\btour\b|voyage|visite|trip/i],
  ['ערב טעימות', /טעימ|tasting|dégustation|degustation/i],
  ['אירוע חברה', /ערב (?:חברה|עובדים|גאלה|הוקרה|צוות|סיום|פתיחה)|הרמת כוסית|מסיבת (?:חברה|עובדים|סוף שנה|פורים|חנוכה)|אירוע (?:חברה|עובדים|צוות|סוף שנה)|גאלה|gala|company (?:event|evening|party|dinner)|staff (?:party|event|dinner)|team (?:dinner|evening|event)|end[ -]of[ -]year|holiday party|happy hour|soirée|événement d'entreprise|evenement d'entreprise|fête d'entreprise|repas d'équipe|dîner d'équipe|cocktail|réception|reception|launch|השקה/i],
  ['אירוע לרשות או משרד ממשלתי', /עיריי|מועצ[הת]|משרד ה|ממשל|municipal|mairie|ministry|ministère/i],
  ['אירוע לעמותה', /עמות|nonprofit|non-profit|association|ע["״]ר|charity|ngo\b/i],
  ['מסיבה בבית פרטי', /בבית|בחצר|at home|à la maison/i]
];
/** The event kind from the words of the mail; the word that gave it is kept for the summary. */
export function takeKind(text) {
  const t = str(text);
  for (const [kind, re] of KIND_WORDS) { const m = re.exec(t); if (m) return { kind, word: m[0] }; }
  return { kind: '', word: '' };
}

/** Dates and ranges in he/fr/en: "19-24/11", "19.10-20.10.26", "19 עד 24 בנובמבר", "du 19 au 24 novembre", "November 19-24, 2026",
    "2026-11-19", and the single forms Office.parseLead knows. {date, dateEnd, dateText, days} */
export function takeDates(text, today) {
  const t0 = str(text).replace(/(?:\+972|0)5\d[\s\-]?\d{3}[\s\-]?\d{4}/g, ' ').replace(/\b0\d[\s\-]?\d{3}[\s\-]?\d{4}\b/g, ' ');
  const t = t0.replace(/[\u2013\u2014]/g, '-');
  today = Office.day(today) || Office.day(new Date());
  const yr = y => { if (!y) return 0; y = +y; return y < 100 ? y + 2000 : y; };
  const mk = (d, mo, y) => { let yy = yr(y) || today.getFullYear(); let dt = new Date(yy, mo - 1, d); if (!y && dt < today) dt = new Date(yy + 1, mo - 1, d); return isNaN(dt) || dt.getMonth() !== mo - 1 ? null : dt; };
  const out = (a, b, txt) => {
    if (!a) return null;
    if (b && b < a) b = null;
    const r = { date: Office.iso(a), dateEnd: b ? Office.iso(b) : '', dateText: trim(txt), days: b ? Office.daysBetween(a, b) + 1 : 0 };
    return r;
  };
  let m;
  const SEP = '\\s*(?:-|עד|to|au|à|ל-?|et|and|through|till|until|jusqu\'au)\\s*(?:ה-?)?';
  // 2026-11-19 (and "2026-11-19 to 2026-11-24")
  if ((m = /(\d{4})-(\d{2})-(\d{2})(?:\s*(?:-|to|עד|au|à)\s*(\d{4})-(\d{2})-(\d{2}))?/.exec(t))) return out(new Date(+m[1], +m[2] - 1, +m[3]), m[4] ? new Date(+m[4], +m[5] - 1, +m[6]) : null, m[0]);
  // 19/10/2026 - 20/10/2026, 19.10-20.10.26, 19/10 עד 20/10
  if ((m = new RegExp('(?<![\\d/.])(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?' + SEP + '(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?(?![/.\\d])').exec(t))) {
    const y = m[6] || m[3]; const a = mk(+m[1], +m[2], y), b = mk(+m[4], +m[5], y); if (a && b) return out(a, b, m[0]);
  }
  // 19-24/11, 19-24/11/2026, 19 עד 24.11
  if ((m = new RegExp('(?<![\\d/.:])(\\d{1,2})' + SEP + '(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?(?![/.\\d])').exec(t)) && +m[3] <= 12) {
    const a = mk(+m[1], +m[3], m[4]), b = mk(+m[2], +m[3], m[4]); if (a && b) return out(a, b, m[0]);
  }
  // 19-24 בנובמבר / du 19 au 24 novembre 2026 / 19 to 24 November / בין ה-19 ל-24 בנובמבר
  const MN = '(' + MONTH_NAMES + ')';
  if ((m = new RegExp('(?<![\\d/.:])(\\d{1,2})(?:er|st|nd|rd|th)?' + SEP + '(\\d{1,2})(?:er|st|nd|rd|th)?\\s*(?:ב|ל|de |d\'|of )?\\s*' + MN + '\\.?(?:\\s+(\\d{4}))?(?![a-zà-ÿ])', 'i').exec(t)) && monthNo(m[3])) {
    const a = mk(+m[1], monthNo(m[3]), m[4]), b = mk(+m[2], monthNo(m[3]), m[4]); if (a && b) return out(a, b, m[0]);
  }
  // November 19-24 / November 19 to 24, 2026 / Nov. 19th-24th
  if ((m = new RegExp('\\b' + MN + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?' + SEP + '(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![/.\\d])', 'i').exec(t)) && monthNo(m[1])) {
    const a = mk(+m[2], monthNo(m[1]), m[4]), b = mk(+m[3], monthNo(m[1]), m[4]); if (a && b) return out(a, b, m[0]);
  }
  // 19 October - 24 November (two month names)
  if ((m = new RegExp('(?<![\\d/.:])(\\d{1,2})(?:er|st|nd|rd|th)?\\s*(?:ב|ל|de |d\'|of )?\\s*' + MN + '\\.?(?:\\s+(\\d{4}))?' + SEP + '(\\d{1,2})(?:er|st|nd|rd|th)?\\s*(?:ב|ל|de |d\'|of )?\\s*' + MN + '\\.?(?:\\s+(\\d{4}))?', 'i').exec(t)) && monthNo(m[2]) && monthNo(m[5])) {
    const a = mk(+m[1], monthNo(m[2]), m[3] || m[6]), b = mk(+m[4], monthNo(m[5]), m[6] || m[3]); if (a && b) return out(a, b, m[0]);
  }
  // a single date: what parseLead knows, plus "Nov. 19", "19 nov"
  const lead = Office.parseLead(t0, [], today);
  if (lead.date) return out(Office.day(lead.date), null, lead.dateText);
  if ((m = new RegExp('(?<![\\d/.:])(\\d{1,2})(?:er|st|nd|rd|th)?\\s*(?:ב|ל|de |d\'|of )?\\s*' + MN + '\\.?(?:\\s+(\\d{4}))?(?![a-zà-ÿ])', 'i').exec(t)) && monthNo(m[2])) { const a = mk(+m[1], monthNo(m[2]), m[3]); if (a) return out(a, null, m[0]); }
  if ((m = new RegExp('\\b' + MN + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![/.\\d:])', 'i').exec(t)) && monthNo(m[1])) { const a = mk(+m[2], monthNo(m[1]), m[3]); if (a) return out(a, null, m[0]); }
  return { date: '', dateEnd: '', dateText: lead.dateText || '', days: 0, month: lead.month || 0 };
}

/** Hours: "9:00-17:00", "de 9h à 17h30", "from 10am to 4pm", "בין השעות 9 ל-17", "בשעה 18:30", "at 7pm". 'HH:MM-HH:MM' / 'HH:MM' / ''. */
export function takeHours(text) {
  const t = str(text).replace(/[\u2013\u2014]/g, '-');
  const hh = (h, mi, ap) => { h = +h; mi = mi ? +mi : 0; if (ap && /pm/i.test(ap) && h < 12) h += 12; if (ap && /am/i.test(ap) && h === 12) h = 0; if (h > 23 || mi > 59) return ''; return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); };
  const NOT_DATE = '(?![/.\\d])';
  let m;
  if ((m = /(\d{1,2})[:.h](\d{2})\s*(am|pm)?\s*(?:-|עד|to|à|jusqu'à|et|ועד|until|till)\s*(?:השעה\s*)?(\d{1,2})[:.h](\d{2})?\s*(am|pm)?(?![\d])/i.exec(t))) { const a = hh(m[1], m[2], m[3]), b = hh(m[4], m[5], m[6]); if (a && b) return a + '-' + b; }
  if ((m = /(\d{1,2})\s*h(\d{2})?\s*(?:-|à|jusqu'à|et)\s*(\d{1,2})\s*h(\d{2})?(?![\d])/i.exec(t))) { const a = hh(m[1], m[2]), b = hh(m[3], m[4]); if (a && b) return a + '-' + b; }
  if ((m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|until|till|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?![\d])/i.exec(t))) { const a = hh(m[1], m[2], m[3] || m[6]), b = hh(m[4], m[5], m[6]); if (a && b) return a + '-' + b; }
  if ((m = new RegExp('(?:בשעות|משעה|בין השעות|from|between|entre|de|dès)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(?:h|:00)?\\s*(?:-|עד|ועד|to|and|à|et|ל-?)\\s*(?:השעה\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*h?' + NOT_DATE + '(?!\\s*(?:' + MONTH_NAMES + ')\\b)(?!\\s*(?:k\\b|אלף|₪|€|\\$|%|people|personnes|pax|איש|משתתפים|חדרים|חדרי|rooms|chambres|participants))', 'i').exec(t))) { const a = hh(m[1], m[2]), b = hh(m[3], m[4]); if (a && b && +m[3] <= 23) return a + '-' + b; }
  if ((m = /(?:בשעה|at|à|vers|ab|starting at|début à)\s*(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm|h)?(?![\d/.])/i.exec(t)) && (m[2] || m[3] || /^בשעה/.test(m[0]))) { const a = hh(m[1], m[2], m[3]); if (a) return a; }
  if ((m = /(?<![\d:])(\d{1,2}):(\d{2})(?![\d])/.exec(t))) { const a = hh(m[1], m[2]); if (a) return a; }
  return '';
}

/** Participants: parseLead's forms plus "une centaine de personnes", "about a hundred people", "כמאה איש". */
export function takeParticipants(text, lead) {
  if (lead && lead.participants) return lead.participants;
  const t = str(text);
  const WORDS = [[/une dizaine/i, '10'], [/une quinzaine/i, '15'], [/une vingtaine/i, '20'], [/une trentaine/i, '30'], [/une quarantaine/i, '40'], [/une cinquantaine/i, '50'], [/une soixantaine/i, '60'], [/une centaine|a hundred|כמאה|מאה (?:איש|משתתפים|אנשים)/i, '100'], [/deux cents|two hundred|כמאתיים|מאתיים/i, '200'], [/un millier|a thousand/i, '1000'], [/כחמישים|חמישים (?:איש|משתתפים|אנשים)/, '50'], [/כעשרים|עשרים (?:איש|משתתפים|אנשים)/, '20'], [/כשלושים|שלושים (?:איש|משתתפים|אנשים)/, '30']];
  for (const [re, n] of WORDS) if (re.test(t)) return n;
  let m;
  if ((m = /(?:participants|people|personnes|guests|משתתפים|אורחים|אנשים|עובדים)\s*(?:[:\-]|is|are|will be|sera|seront|יהיו|של)?\s*(?:about|around|approx\.?|environ|כ-?|בערך)?\s*(\d{1,4})(?![\d/.:])/i.exec(t))) return m[1];
  if ((m = /(\d{1,4})\s*(?:-|עד|to|à)?\s*(\d{1,4})?\s*(?:p\.|pers\.?|ppl|pax|employees|salariés|collaborateurs|membres|members|attendees|delegates|מוזמנים|חברים|נציגים)(?![a-zà-ÿ\u0590-\u05FF])/i.exec(t))) return m[2] ? m[1] + '-' + m[2] : m[1];
  return '';
}

/** Budget: parseLead's forms plus "20 000 €", "40,000 NIS", "15k$", "ILS 12,000". Formatted like the lead: "20,000 €". */
export function takeBudget(text, lead) {
  const t = str(text).replace(/(?<!\d)(\d{1,3})[\s\u202f\u00a0](\d{3})(?=\s?(?:€|₪|\$|ש"ח|ש״ח|שח|שקל|euros?|nis|ils|k\b|אלף|dollars?|usd|eur\b))/gi, '$1$2');
  if (lead && lead.budget) return lead.budget;
  const fmt = (val, cur) => String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ' + cur;
  const curOf = c => (/€|euro|eur/i.test(c) ? '€' : /\$|dollar|usd/i.test(c) ? '$' : '₪');
  let m;
  if ((m = /(?<![\d,.])(\d{1,3}(?:[,.]\d{3})+|\d{3,7})\s*(k\b|אלף)?\s*(₪|ש"ח|ש״ח|שח|שקל(?:ים)?|nis|ils|€|euros?|eur\b|\$|dollars?|usd)/i.exec(t)) || (m = /(€|\$|ils|nis|eur|usd)\s*(\d{1,3}(?:[,.]\d{3})+|\d{3,7})\s*(k\b)?/i.exec(t))) {
    const digits = /^\d/.test(m[1]) ? m[1] : m[2], mult = (/^\d/.test(m[1]) ? m[2] : m[3]) ? 1000 : 1, cur = /^\d/.test(m[1]) ? m[3] : m[1];
    const val = Math.round(parseFloat(digits.replace(/[,.](?=\d{3}\b)/g, '')) * mult);
    if (val >= 500) return fmt(val, curOf(cur));
  }
  if ((m = /(?:תקציב|budget)[^\d\n]{0,25}(\d{1,3}(?:[,.]\d{3})+|\d{1,4})\s*(k\b|אלף|000)?/i.exec(t))) { const val = Math.round(parseFloat(m[1].replace(/[,.](?=\d{3}\b)/g, '')) * (m[2] ? 1000 : 1)); if (val >= 500) return fmt(val, /€|euro/i.test(t) ? '€' : /\$|dollar/i.test(t) ? '$' : '₪'); }
  return '';
}

/** The venue named in the mail ("במלון דניאל", "at the Hilton Tel Aviv", "au Domaine de X"), if any. */
export function takeVenue(text) {
  const t = str(text);
  let m;
  if ((m = /(?:^|[\s,])(?:ב|ל)?((?:מלון|גן האירועים|גן אירועים|גן|אולם|אולמי|מתחם|קיבוץ|מרכז הכנסים|מרכז|בית|חוות|יקב|מוזיאון)\s+[^\s,.;:!?\n()]{2,}(?:\s+[^\s,.;:!?\n()]{2,})?)(?=[\s,.;:!?\n()]|$)/.exec(t)) && !/^(?:מלון|גן|אולם|מרכז|בית)\s+(?:ש|ו|כל|אחר|טוב|קטן|גדול|יפה|באזור|בצפון|בדרום|במרכז|עם|או|ל)/.test(m[1])) return trim(m[1]).replace(/\s+(?:או|עם|ש|כי|אבל|ו)$/, '');
  if ((m = /\b(?:at|in|chez|au|à l'|à la)\s+(?:the\s+)?((?:hotel|hôtel|kibbutz|domaine|château|chateau|salle|centre|center|museum|musée|winery|villa|palais|espace|resort)\s+[A-Z][^\s,.;:!?\n()]*(?:\s+[A-Z][^\s,.;:!?\n()]*){0,2})/i.exec(t))) return trim(m[1]);
  if ((m = /\b(?:at|in|chez|au)\s+(?:the\s+)?([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+){0,2}\s+(?:hotel|hôtel|resort|center|centre|hall|museum|winery|convention center))/i.exec(t))) return trim(m[1]);
  return '';
}

/** Why the event: "לרגל…", "לכבוד…", "במסגרת…", "to celebrate…", "for our…", "à l'occasion de…", "dans le cadre de…". */
export function takePurpose(text, lead) {
  if (lead && lead.purpose) return lead.purpose;
  const t = str(text);
  let m;
  if ((m = /(?:לרגל|לכבוד|לציון|במסגרת|לסיכום|לקראת|מטרת האירוע היא|המטרה היא|מטרה:|at the occasion of|on the occasion of|to celebrate|to mark|as part of|for our|for the|purpose:|the goal is|the idea is|à l'occasion de|dans le cadre de|pour fêter|pour célébrer|pour marquer|pour notre|l'objectif est|le but est)\s*:?\s+([^\n.!?;]{3,90})/i.exec(t))) return trim(m[1]).replace(/[,:]$/, '');
  return '';
}

/** he / fr / en from the letters and the small words of the text. */
export function takeLang(text) {
  const t = str(text);
  const he = (t.match(/[\u0590-\u05FF]/g) || []).length, lat = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (he && he * 2 >= lat) return 'he';
  const fr = (t.match(/\b(?:bonjour|nous|pour|merci|personnes|avec|les|une|vous|est|des|notre|événement|séminaire|journée|serait|souhaitons|souhaite|budget de|dans|sommes|cordialement|madame|monsieur|salle|repas|déjeuner|dîner|environ|participants|organiser|réunion)\b/gi) || []).length;
  const en = (t.match(/\b(?:hello|hi|the|we|our|for|with|would|like|please|thanks|thank|people|event|regards|about|looking|budget|team|dinner|lunch|from|and|are|is|have|need|want)\b/gi) || []).length;
  return fr > en ? 'fr' : 'en';
}

/** A phone in the signature or the body: Israeli mobile/landline, or an international number. Returns as written, cleaned. */
export function takePhone(text) {
  const t = str(text);
  let m;
  if ((m = /(?:\+972[\s\-]?|0)(5\d)[\s\-]?(\d{3})[\s\-]?(\d{4})(?!\d)/.exec(t))) return '0' + m[1] + '-' + m[2] + m[3];
  if ((m = /(?:\+972[\s\-]?|0)([2-9])[\s\-]?(\d{3})[\s\-]?(\d{4})(?!\d)/.exec(t)) && !/^0?5/.test(m[1])) return '0' + m[1] + '-' + m[2] + m[3];
  if ((m = /(?:\+|00)\d[\d\s\-.]{7,16}\d(?!\d)/.exec(t))) return m[0].replace(/[\s\-.]/g, '');
  return '';
}

/* ---------------- 3. the client ---------------- */

const norm = v => Office.normHe(str(v)).replace(/[.׳'"״\-]/g, '').replace(/\s+/g, '');
const emailsIn = s => (str(s).toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || []);

/** The client the mail belongs to: sender e-mail, the e-mail's domain, the organisation or an alias in the text, the contact's name.
    {client, by: 'email'|'domain'|'name'|'contact'|'phone'} or null. */
export function matchMailClient(mail, clients) {
  const list = clients || [];
  const email = str(mail.email).toLowerCase();
  if (email) { const c = list.find(x => emailsIn([x.email, x.invoiceEmail, x.notes].join(' ')).includes(email)); if (c) return { client: c, by: 'email' }; }
  if (mail.phone) { const c = list.find(x => samePhone(x.phone, mail.phone)); if (c) return { client: c, by: 'phone' }; }
  const d = emailDomain(email);
  if (!isGenericDomain(d)) { const c = list.find(x => emailsIn([x.email, x.invoiceEmail, x.notes].join(' ')).some(e => emailDomain(e) === d)); if (c) return { client: c, by: 'domain' }; }
  const hay = ' ' + norm([mail.org, mail.subject, mail.text].join(' ')) + ' ';
  let best = null, bl = 0;
  list.forEach(c => {
    [c.name, c.legalName].concat(str(c.aliases).split(/[,;]+/)).map(norm).filter(n => n.length >= 3).forEach(n => { if (n.length > bl && hay.indexOf(n) >= 0) { best = c; bl = n.length; } });
  });
  if (best) return { client: best, by: 'name' };
  const who = norm(mail.name);
  if (who.length >= 4) { const c = list.find(x => norm(x.contact) === who || (x.contact && norm(x.notes).indexOf(who) >= 0 && str(x.notes).indexOf('@') >= 0)); if (c) return { client: c, by: 'contact' }; }
  return null;
}

/* ---------------- 4. all together ---------------- */

const SUBJECT_PREFIX = /^\s*(?:(?:re|fw|fwd|tr|aw|wg|rép|réf|תגובה|הועבר|העברה)\s*:\s*)+/i;
export function cleanSubject(s) { return trim(str(s).replace(SUBJECT_PREFIX, '').replace(/^\((?:no subject|sans objet|ללא נושא)\)$/i, '')); }

/**
 * parseMail(text, {clients, places, today}) → everything the import screen shows, ready to edit:
 * {name, email, phone, org, subject, mailDate, client, clientId, clientBy, kind, kindWord, date, dateEnd, dateText, days,
 *  participants, place, venue, budget, purpose, hours, lang, needs, rooms, tasks, body, signature, hadQuote, missing}
 */
export function parseMail(text, opts) {
  opts = opts || {};
  const clients = opts.clients || [], places = opts.places || [], today = opts.today || new Date();
  const parts = cleanMail(text);
  const h = parts.headers;
  const from = parseAddress(h.from || '');
  const body = parts.body, sig = parts.signature;
  const subject = cleanSubject(h.subject);
  const forLead = [subject, body].filter(Boolean).join('\n');
  const b = parseBrief(forLead, places, today, clients);
  const lead = b.lead;
  const email = from.email || (emailsIn(sig)[0] || '') || lead.email || '';
  const phone = takePhone(sig) || takePhone(body) || lead.phone || '';
  let name = from.name || parts.signName || '';
  if (!name) { const first = str(sig).split('\n').map(trim).filter(Boolean)[0] || ''; if (/^[\u0590-\u05FFA-Za-zÀ-ÿ'׳\-. ]{2,40}$/.test(first) && first.split(/\s+/).length <= 4 && !TITLE_WORDS.test(first) && !ORG_SUFFIX.test(first)) name = first; }
  if (!name) name = lead.name || '';
  name = trim(name).replace(/[,.]$/, '');
  const org = takeOrg(body, sig, email);
  const dates = takeDates(forLead, today);
  const kind = takeKind(forLead);
  const out = {
    name, email, phone, org, subject, mailDate: h.date ? Office.iso(mailDateOf(h.date)) : '', to: h.to || '',
    client: '', clientId: '', clientBy: '',
    kind: kind.kind || lead.kind || '', kindWord: kind.word,
    date: dates.date, dateEnd: dates.dateEnd, dateText: dates.dateText, days: dates.days ? String(dates.days) : (b.days || ''), month: dates.month || lead.month || 0,
    participants: takeParticipants(forLead, lead), place: lead.place || '', venue: takeVenue(forLead), budget: takeBudget(forLead, lead), purpose: takePurpose(body, lead) || (subject && !/^(?:hello|hi|bonjour|שלום|היי)\b/i.test(subject) ? subject : ''),
    hours: takeHours(body), lang: takeLang(body || subject), needs: b.needs, rooms: b.rooms || '', tasks: b.tasks || [],
    body, signature: sig, hadQuote: parts.hadQuote, quoted: parts.quoted, headers: h, missing: []
  };
  if (!out.place && out.venue) out.place = out.venue;
  const hit = matchMailClient({ email, phone, org, subject, text: body + '\n' + sig, name }, clients);
  if (hit) { out.client = hit.client.name; out.clientId = hit.client.id || ''; out.clientBy = hit.by; if (!out.lang && hit.client.lang) out.lang = hit.client.lang; }
  else out.client = org || '';
  out.missing = missingOf(out);
  return out;
}

/** The mail's own date header, in any of the common formats; null when unreadable. */
export function mailDateOf(v) {
  const s = trim(str(v));
  let m;
  if ((m = /(\d{1,2})\s+([A-Za-zÀ-ÿ\u0590-\u05FF]+)\.?\s+(\d{4})/.exec(s)) && monthNo(m[2].replace(/^ב/, ''))) return new Date(+m[3], monthNo(m[2].replace(/^ב/, '')) - 1, +m[1]);
  if ((m = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && monthNo(m[1])) return new Date(+m[3], monthNo(m[1]) - 1, +m[2]);
  if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/.exec(s))) { const y = +m[3] < 100 ? +m[3] + 2000 : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  const d = new Date(s); return isNaN(d) ? null : d;
}

/** What the case still lacks: the six of Office.missingOf, plus 'client' and 'contact' (no e-mail and no phone). */
export function missingOf(p) {
  const miss = Office.missingOf(p);
  if (!trim(p.client) && !trim(p.org)) miss.unshift('client');
  if (!trim(p.email) && !trim(p.phone)) miss.push('contact');
  return miss;
}

/** A copyable summary. L: labels {client, contact, kind, date, participants, place, budget, hours, purpose, needs, days, rooms, subject}. */
export function summaryText(p, L) {
  L = Object.assign({ client: 'לקוח', contact: 'איש קשר', kind: 'סוג', date: 'תאריך', participants: 'משתתפים', place: 'מקום', budget: 'תקציב', hours: 'שעות', purpose: 'מטרה', needs: 'ספקים נדרשים', days: 'ימים', rooms: 'חדרים', subject: 'נושא' }, L || {});
  const rows = [];
  const push = (k, v) => { if (trim(v)) rows.push(L[k] + ': ' + trim(v)); };
  push('client', p.client || p.org);
  push('contact', [p.name, p.phone, p.email].filter(Boolean).join(' · '));
  push('subject', p.subject && p.subject !== p.purpose ? p.subject : '');
  push('kind', p.kind);
  push('date', p.date ? Office.fmt(p.date) + (p.dateEnd ? ' - ' + Office.fmt(p.dateEnd) : '') : p.dateText);
  push('hours', p.hours);
  push('participants', p.participants);
  push('place', p.place + (p.venue && p.venue !== p.place ? ' (' + p.venue + ')' : ''));
  push('budget', p.budget);
  push('days', p.days && p.days !== '1' ? p.days : '');
  push('rooms', p.rooms);
  push('purpose', p.purpose);
  push('needs', (p.needs || []).join(', '));
  return rows.join('\n');
}
