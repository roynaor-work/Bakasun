/* Need number six: reminders she dictates, and "travel mode": who covers for her, what is open, and the handover text.
   Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

const DAYS = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] };

/* Helpers shared by every voice parser (commands, questions, agenda, nav...): the same regex with and without French accents,
   the politeness words she adds, and amounts the way she says them in three languages. */
const ACC = { 'é': 'eé', 'è': 'eè', 'ê': 'eê', 'ë': 'eë', 'à': 'aà', 'â': 'aâ', 'î': 'iî', 'ï': 'iï', 'ô': 'oô', 'ù': 'uù', 'û': 'uû', 'ü': 'uü', 'ç': 'cç' };
/** The same regex, where every accented French letter also matches its bare form ("répondu" matches "repondu", "à" matches "a")
 *  and a straight apostrophe matches a curly one. Hebrew is untouched. Do not use it on a regex where a bare "a" would be wrong. */
export function loose(re) {
  const src = re.source; let out = '', cls = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { out += c + (src[i + 1] || ''); i++; continue; }
    if (cls) { out += ACC[c] || c; if (c === ']') cls = false; continue; }
    if (c === '[') { cls = true; out += c; continue; }
    if (ACC[c]) out += '[' + ACC[c] + ']';
    else if (c === "'" || c === '’') out += "['’]";
    else out += c;
  }
  return new RegExp(out, re.flags);
}
const POLITE = loose(/,?(?:^|\s)(?:please|pls|s'il te plaît|s'il vous plaît|stp|svp|בבקשה)(?=\s|$|[.!,?])[,]?/gi);
/** The sentence without "please" / "s'il te plaît" / "בבקשה", wherever she put it. */
export function polite(text, keepLines) { const x = str(text).replace(POLITE, ' '); return (keepLines ? x.replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/g, '') : trim(x)).replace(/^[,:;]\s*/, ''); }
/** "1,500" → 1500, "1 500" → 1500, "1 561,86" → 1561.86, "10.500" → 10500, "3000" → 3000. NaN when it is not a number. */
export function amountNum(s) {
  let x = str(s).replace(/[\s  ₪$€]/g, '').replace(/(?:ש"?ח|שקל(?:ים)?|ils|nis|shekels?|euros?|eur|dollars?|usd)$/i, '');
  if (/^\d+,\d{1,2}$/.test(x)) x = x.replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  else x = x.replace(/,/g, '');
  return x ? Number(x) : NaN;
}
/** An amount as she says it, in any of the three formats, with or without a currency word: "500", "1,500 ₪", "1 561,86 €", "3000 shekels". */
export const AMOUNT_RE = /(\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:₪|ש"?ח|שקל(?:ים)?|ils|nis|shekels?|€|euros?|eur|\$|dollars?|usd)?/i;

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15 };
const dayIndex = w => { const x = w.toLowerCase(); let idx = -1; Object.values(DAYS).forEach(list => { const i = list.indexOf(x); if (i >= 0) idx = i; }); return idx; };
/** The next date whose day of month is `dd`: this month if it has not passed, otherwise next month. */
const dayOfMonth = (base, dd) => { const b = new Date(base); let d = new Date(b.getFullYear(), b.getMonth(), dd); if (d < b) d = new Date(b.getFullYear(), b.getMonth() + 1, dd); return d; };

/**
 * "תזכירי לי מחר ב-9 להתקשר לדנה" / "remind me on tuesday at 14:30 to call the hotel" / "rappelle-moi demain de ..."
 * → {title, due: 'YYYY-MM-DD', time: 'HH:MM'} or null when it is not a reminder.
 */
/** Pulls a date and a time out of free text: "מחר", "ביום חמישי", "בעוד 3 ימים", "15/10", "ב-10:30", "next thursday", "jeudi prochain",
 *  "mardi 14", "the 14th", "le 14/10", "dans 3 jours", "in a week", "à 10h30", "at 5pm".
 *  Returns {rest, due (iso or ''), time}. Used by reminders, tasks ("משימה לדנה: להתקשר עד יום חמישי"), "postpone" and the agenda. */
export function takeWhen(text, today) {
  let rest = trim(text); const base = Office.day(today) || Office.day(new Date());
  let due = null, time = '';
  const take = (re, fn) => { const x = re.exec(rest); if (x) { fn(x); rest = trim(rest.replace(x[0], ' ')); } };
  take(loose(/(?:^|\s)(היום|today|aujourd'hui)(?=\s|$)/i), () => { due = base; });
  take(loose(/(?:^|\s)(?:ל|עד\s+|for\s+|pour\s+)?(מחרתיים|the day after tomorrow|après-demain|apres demain)(?=\s|$)/i), () => { due = Office.addDays(base, 2); });
  take(loose(/(?:^|\s)(?:ל|עד\s+|for\s+|by\s+|pour\s+)?(מחר|tomorrow|demain)(?=\s|$)/i), () => { due = Office.addDays(base, 1); });
  take(loose(/(?:^|\s)(?:ל|עד\s+|for\s+|by\s+|pour\s+)?(?:שבוע הבא|לשבוע הבא|בשבוע הבא|next week|la semaine prochaine|semaine prochaine)(?=\s|$)/i), () => { due = Office.addDays(base, 7); });
  // "ביום חמישי" (Hebrew, as before)
  take(/(?:^|\s)(?:עד\s+)?(?:ביום|ליום|יום)?\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=\s|$)/, x => {
    const idx = dayIndex(x[1]); if (idx >= 0) { const d = new Date(base); let diff = (idx - d.getDay() + 7) % 7; if (diff === 0) diff = 7; due = Office.addDays(base, diff); }
  });
  // "next thursday" / "ce jeudi" / "jeudi prochain" / "mardi 14" / "tuesday the 14th"
  take(loose(/(?:^|\s)(?:on|by|for|le|pour|ce|cet|this|next|coming|every)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+(?:prochain|prochaine|next|qui vient))?(?:\s+(?:the\s+|le\s+)?(\d{1,2})(?:st|nd|rd|th|er)?(?![\d/.:h]))?(?=\s|$|[,:])/i), x => {
    if (x[2] && +x[2] >= 1 && +x[2] <= 31) { due = dayOfMonth(base, +x[2]); return; }
    const idx = dayIndex(x[1]); if (idx >= 0) { const d = new Date(base); let diff = (idx - d.getDay() + 7) % 7; if (diff === 0) diff = 7; due = Office.addDays(base, diff); }
  });
  // "בעוד 3 ימים" / "in 3 days" / "dans trois jours" / "in a week" / "dans deux semaines" / "בעוד שבועיים"
  take(loose(/(?:^|\s)(?:בעוד|in|dans|d'ici)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix|quinze)\s*(ימים|יום|days?|jours?|שבועות|שבוע|weeks?|semaines?)(?=\s|$)/i), x => { const n = NUMW[x[1].toLowerCase()] || +x[1]; due = Office.addDays(base, /שבוע|week|semaine/i.test(x[2]) ? n * 7 : n); });
  take(/(?:^|\s)בעוד\s+(שבוע|שבועיים)(?=\s|$)/, x => { due = Office.addDays(base, x[1] === 'שבוע' ? 7 : 14); });
  // "le 14" / "on the 14th" / "the 14th" (no weekday, no month): the next 14th
  take(/(?:^|\s)(?:le|on the|the|du)\s+(\d{1,2})(?:st|nd|rd|th|er)?(?![\d/.:h])(?=\s|$|[,:])/i, x => { if (+x[1] >= 1 && +x[1] <= 31) due = dayOfMonth(base, +x[1]); });
  // "ב-9" / "at 14:30" / "à 10h30" / "à 17h" / "at 5pm" / "at 9:30 am" (a bare "a" is not a time word: "a 10 people event")
  take(/(?:^|\s)(?:ב-?|בשעה|at|à|vers|a(?=\s*\d{1,2}h))\s*(\d{1,2})(?:[:.](\d{2})|h(\d{2})?)?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$|[:,])/i, x => {
    let h = +x[1]; const mm = x[2] || x[3] || '00'; const ap = (x[4] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12; else if (!ap && h < 7 && !x[2] && !x[3]) h += 12;
    if (h <= 24) time = String(h).padStart(2, '0') + ':' + mm;
  });
  // "10h30" / "17h" said without "à"
  if (!time) take(/(?:^|\s)(\d{1,2})h(\d{2})?(?=\s|$|[:,])/i, x => { let h = +x[1]; if (h < 7 && !x[2]) h += 12; if (h <= 24) time = String(h).padStart(2, '0') + ':' + (x[2] || '00'); });
  // "15/10" / "ל-15/10" / "le 14/10" / "on the 14/10" / "15.10.2026"
  take(/(?:^|\s)(?:עד\s+|[בל]-?|le\s+|on\s+(?:the\s+)?|the\s+|by\s+(?:the\s+)?|for\s+(?:the\s+)?|pour\s+le\s+|du\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|[,:])/i, x => { const y = x[3] ? (x[3].length === 2 ? '20' + x[3] : x[3]) : String(new Date(base).getFullYear()); due = Office.iso(y + '-' + x[2].padStart(2, '0') + '-' + x[1].padStart(2, '0')); });
  return { rest, due: due ? Office.iso(due) : '', time, base };
}

const REMIND = loose(/^(?:תזכירי לי|תזכיר לי|תזכורת|remind me|reminder|set a reminder|put a reminder|add a reminder|note a reminder|rappelle[- ]moi|rappel|un rappel|mets un rappel|mets-moi un rappel|ajoute un rappel|note un rappel)(?=\s|$|[:,])\s*[:,]?\s*(.+)$/i);
export function parseReminder(text, today) {
  const t = polite(text); if (!t) return null;
  const m = REMIND.exec(t); if (!m) return null;
  const w = takeWhen(m[1], today); let rest = trim(w.rest).replace(/^[:,\-–]+\s*/, '');
  const due = w.due || Office.iso(w.time ? w.base : Office.addDays(w.base, 1));
  const title = trim(rest.replace(loose(/^(?:ל|to |de |d')/i), m0 => (/^ל/.test(m0) ? 'ל' : ''))).replace(loose(/^\s*(?:that|que|qu'|ש)\s*/i), '').replace(/^[:,\-–]+\s*/, '');
  if (!title) return null;
  return { title, due, time: w.time };
}

/** The line added to her signature while she is away. */
export function travelLine(travel, lang) {
  if (!travel || !travel.on) return '';
  const L = lang || 'he'; const until = travel.to ? Office.fmt(travel.to) : '';
  const sub = travel.subName ? travel.subName + (travel.subPhone ? ' ' + travel.subPhone : '') : '';
  if (L === 'en') return 'I am abroad' + (until ? ' until ' + until : '') + (sub ? ', for anything urgent: ' + sub : '') + '.';
  if (L === 'fr') return 'Je suis à l’étranger' + (until ? ' jusqu’au ' + until : '') + (sub ? ', en cas d’urgence : ' + sub : '') + '.';
  return 'אני בחו״ל' + (until ? ' עד ' + until : '') + (sub ? ', לדחוף: ' + sub : '') + '.';
}

/** The handover to whoever covers: everything open, in one message, in her voice. */
export function handoverText(travel, open, signer) {
  const n = trim(travel.subName || '').split(' ')[0];
  const lines = ['היי' + (n ? ' ' + n : '') + ', אני בחו״ל' + (travel.from ? ' מ-' + Office.fmt(travel.from) : '') + (travel.to ? ' עד ' + Office.fmt(travel.to) : '') + '. מה שצריך לדחוף בינתיים:'];
  const add = (title, arr, fn) => { if (!arr || !arr.length) return; lines.push('', title + ':'); arr.forEach(x => lines.push('• ' + fn(x))); };
  add('אירועים קרובים', open.upcoming, x => x);
  add('ספקים שלא ענו (להתקשר)', open.suppliers, x => x);
  add('דפוס בלי אישור', open.print, x => x);
  add('שיחות פתוחות', open.calls, x => x);
  add('משימות', open.tasks, x => x);
  add('לקוחות שמחכים לתשובה', open.followups, x => x);
  if (trim(travel.notes)) lines.push('', 'הוראות:', trim(travel.notes));
  lines.push('', 'תודה רבה! זמינה בוואטסאפ לכל שאלה.', signer || 'וירג׳יני');
  return lines.join('\n');
}
