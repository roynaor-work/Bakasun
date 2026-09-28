/* Need number six: reminders she dictates, and "travel mode": who covers for her, what is open, and the handover text.
   Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

const DAYS = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] };

/**
 * "תזכירי לי מחר ב-9 להתקשר לדנה" / "remind me on tuesday at 14:30 to call the hotel" / "rappelle-moi demain de ..."
 * → {title, due: 'YYYY-MM-DD', time: 'HH:MM'} or null when it is not a reminder.
 */
export function parseReminder(text, today) {
  const t = trim(text); if (!t) return null;
  const m = /^(?:תזכירי לי|תזכיר לי|תזכורת|remind me|reminder|rappelle-moi|rappel)\s*[:,]?\s*(.+)$/i.exec(t); if (!m) return null;
  let rest = m[1]; const base = Office.day(today) || Office.day(new Date());
  let due = null, time = '';
  const take = (re, fn) => { const x = re.exec(rest); if (x) { fn(x); rest = trim(rest.replace(x[0], ' ')); } };
  take(/(?:^|\s)(היום|today|aujourd'hui)(?=\s|$)/i, () => { due = base; });
  take(/(?:^|\s)(מחרתיים|the day after tomorrow|après-demain)(?=\s|$)/i, () => { due = Office.addDays(base, 2); });
  take(/(?:^|\s)(מחר|tomorrow|demain)(?=\s|$)/i, () => { due = Office.addDays(base, 1); });
  take(/(?:^|\s)(?:ביום|on|le)?\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?=\s|$)/i, x => {
    const w = x[1].toLowerCase(); let idx = -1; Object.values(DAYS).forEach(list => { const i = list.indexOf(w); if (i >= 0) idx = i; });
    if (idx >= 0) { const d = new Date(base); let diff = (idx - d.getDay() + 7) % 7; if (diff === 0) diff = 7; due = Office.addDays(base, diff); }
  });
  take(/(?:^|\s)(?:בעוד|in|dans)\s+(\d+)\s*(ימים|יום|days?|jours?)(?=\s|$)/i, x => { due = Office.addDays(base, +x[1]); });
  take(/(?:^|\s)(?:ב-?|בשעה|at|à)\s*(\d{1,2})(?:[:.](\d{2}))?(?=\s|$)/i, x => { let h = +x[1]; const mm = x[2] || '00'; if (h < 7 && !x[2]) h += 12; time = String(h).padStart(2, '0') + ':' + mm; });
  take(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$)/, x => { const y = x[3] ? (x[3].length === 2 ? '20' + x[3] : x[3]) : String(new Date(base).getFullYear()); due = Office.iso(y + '-' + x[2].padStart(2, '0') + '-' + x[1].padStart(2, '0')); });
  if (!due) due = time ? base : Office.addDays(base, 1);
  const title = trim(rest.replace(/^(?:ל|to |de |d')/i, m0 => (/^ל/.test(m0) ? 'ל' : ''))).replace(/^\s*(?:that|que|ש)\s*/i, '');
  if (!title) return null;
  return { title, due: Office.iso(due), time };
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
