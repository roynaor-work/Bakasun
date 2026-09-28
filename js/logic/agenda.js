/* "What do I have tomorrow?" / "מה המשימות שלי למחר" / "mes tâches pour demain": the question is understood, and the answer is
   the tasks and reminders due that day, plus the events that day. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';
import { TASK } from './extra.js';

const DAYS = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] };
const ASKS = /(?:משימות|משימה|רשימת|רשימות|תזכורות|תזכורת|מה יש לי|מה יש|מה מחכה|מה פתוח|מה על הפרק|מה אני צריכה|מה צריך|מה עושים|מה התוכנית|מה הלו[״"]?ז|tasks?|to-?dos?|reminders?|agenda|schedule|what(?:'s| is| do i have| have i got| are)|mes tâches|ma liste|mes rappels|qu['’]est-ce que j['’]ai|quoi faire|qu['’]y a-t-il|programme)/i;

/** The day the question is about: {from, to, key} where key is 'today' | 'tomorrow' | 'week' | 'day' | 'all'. Null when it is not such a question. */
export function parseAgenda(text, today) {
  const t = trim(text); if (!t || t.length > 90) return null;
  if (!ASKS.test(t)) return null;
  // a question, not an instruction: no "remind me", no "task for X:", no colon body
  if (/^(?:תזכירי|תזכיר|remind|rappelle|משימה\s*ל|task for|tâche pour)/i.test(t) || /:\s*\S/.test(t)) return null;
  const base = Office.day(today) || Office.day(new Date());
  const iso = d => Office.iso(d);
  let m;
  if (/(?:^|\s)(?:היום|today|aujourd['’]hui)(?=\s|$|\?)/i.test(t)) return { from: iso(base), to: iso(base), key: 'today' };
  if (/(?:^|\s)(?:מחרתיים|the day after tomorrow|après-demain)(?=\s|$|\?)/i.test(t)) return { from: iso(Office.addDays(base, 2)), to: iso(Office.addDays(base, 2)), key: 'day' };
  if (/(?:^|\s)(?:ל?מחר|tomorrow|demain)(?=\s|$|\?)/i.test(t)) return { from: iso(Office.addDays(base, 1)), to: iso(Office.addDays(base, 1)), key: 'tomorrow' };
  if (/(?:^|\s)(?:השבוע|this week|cette semaine|la semaine)(?=\s|$|\?)/i.test(t)) return { from: iso(base), to: iso(Office.addDays(base, 7)), key: 'week' };
  if ((m = /(?:^|\s)(?:ב?יום\s+|on\s+|le\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?=\s|$|\?)/i.exec(t))) {
    const w = m[1].toLowerCase(); let idx = -1; Object.values(DAYS).forEach(list => { const i = list.indexOf(w); if (i >= 0) idx = i; });
    if (idx >= 0) { let diff = (idx - new Date(base).getDay() + 7) % 7; if (diff === 0) diff = 7; const d = Office.addDays(base, diff); return { from: iso(d), to: iso(d), key: 'day' }; }
  }
  if ((m = /(?:^|\s|-)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|\?)/.exec(t))) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date(base).getFullYear());
    const d = Office.iso(y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')); if (d) return { from: d, to: d, key: 'day' };
  }
  // "what are my tasks" with no day: everything open
  if (/(?:משימות|משימה|רשימת|רשימות|תזכורות|tasks?|to-?dos?|reminders?|tâches|rappels|liste)/i.test(t)) return { from: '', to: '', key: 'all' };
  return null;
}

/** What is on between from and to (inclusive, ISO dates; empty = all open): tasks (with reminders), events, calls. Overdue open tasks are included when the range starts today. */
export function agenda(data, range, today) {
  const base = Office.iso(Office.day(today) || Office.day(new Date()));
  const inRange = d => { if (!range.from) return true; const x = Office.iso(d); return !!x && x >= range.from && x <= range.to; };
  const tasks = (data.tasks || []).filter(x => x.status !== TASK.done && x.status !== 'בוצע')
    .filter(x => inRange(x.due) || (range.from && range.from <= base && Office.iso(x.due) && Office.iso(x.due) < base))
    .sort((a, b) => str(a.due).localeCompare(str(b.due)) || str(a.time).localeCompare(str(b.time)));
  const events = (data.cases || []).filter(c => Office.ACTIVE.includes(c.status) && inRange(c.date)).sort((a, b) => str(a.date).localeCompare(str(b.date)));
  const calls = (data.calls || []).filter(c => !c.done && !c.outcome && inRange(c.due || c.when)).sort((a, b) => str(a.due || a.when).localeCompare(str(b.due || b.when)));
  return { tasks, events, calls };
}
