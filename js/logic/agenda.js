/* "What do I have tomorrow?" / "מה המשימות שלי למחר" / "mes tâches pour demain": the question is understood, and the answer is
   the tasks and reminders due that day, plus the events that day. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';
import { TASK } from './extra.js';
import { takeWhen, loose, polite } from './travel.js';

const ASKS = loose(/(?:משימות|משימה|רשימת|רשימות|תזכורות|תזכורת|מה יש לי|מה יש|מה מחכה|מה פתוח|מה על הפרק|מה אני צריכה|מה צריך|מה עושים|מה התוכנית|מה הלו[״"]?ז|tasks?|to-?dos?|reminders?|agenda|schedule|what(?:'s| is| do i have| have i got| are| is on| is planned| is the plan| is the programme)|my (?:day|schedule|agenda|calendar|plan|program|programme)|anything (?:on|planned|scheduled)|mes tâches|ma liste|mes rappels|mes rendez-vous|mes rdv|mon programme|mon agenda|ma journée|qu'est-ce que j'ai|j'ai quoi|quoi faire|qu'y a-t-il|qu'est-ce qu'il y a|qu'est-ce qui est prévu|quoi de prévu|c'est quoi le programme|programme)/i);
const ORDER = loose(/^(?:תזכירי|תזכיר|remind|rappelle|משימה\s*ל|task for|tâche pour|תוסיפי|הוסיפי|תבטלי|בטלי|סמני|תסמני|תרשמי|רשמי|תמחקי|מחקי|תורידי|add|cancel|remove|mark|tick|delete|log|schedule|ajoute|annule|supprime|marque|coche|note|reporte|décale|postpone|snooze|דחי|תדחי)(?=\s|$)/i);
const WEEK = loose(/(?:^|\s)(?:השבוע|this week|cette semaine|la semaine)(?=\s|$|\?)/i);
const NEXT_WEEK = loose(/(?:^|\s)(?:ל?שבוע הבא|בשבוע הבא|next week|la semaine prochaine|semaine prochaine)(?=\s|$|\?)/i);

/** The day the question is about: {from, to, key} where key is 'today' | 'tomorrow' | 'week' | 'nextweek' | 'day' | 'all'. Null when it is not such a question. */
export function parseAgenda(text, today) {
  const t = polite(trim(text).replace(/’/g, "'")); if (!t || t.length > 90) return null;
  if (!ASKS.test(t)) return null;
  // a question, not an instruction: no "remind me", no "task for X:", no colon body, no "add / cancel / mark ... done"
  if (ORDER.test(t) || /:\s*\S/.test(t) || /(?:^|\s)(?:בוצע|בוצעה|הושלמ|done|fait)(?:\s|$)/i.test(t)) return null;
  const base = Office.day(today) || Office.day(new Date());
  const iso = d => Office.iso(d);
  if (loose(/(?:^|\s)(?:היום|today|aujourd'hui)(?=\s|$|\?)/i).test(t)) return { from: iso(base), to: iso(base), key: 'today' };
  if (loose(/(?:^|\s)(?:מחרתיים|the day after tomorrow|après-demain|apres demain)(?=\s|$|\?)/i).test(t)) return { from: iso(Office.addDays(base, 2)), to: iso(Office.addDays(base, 2)), key: 'day' };
  if (/(?:^|\s)(?:ל?מחר|tomorrow|demain)(?=\s|$|\?)/i.test(t)) return { from: iso(Office.addDays(base, 1)), to: iso(Office.addDays(base, 1)), key: 'tomorrow' };
  if (NEXT_WEEK.test(t)) return { from: iso(Office.addDays(base, 7)), to: iso(Office.addDays(base, 14)), key: 'nextweek' };
  if (WEEK.test(t)) return { from: iso(base), to: iso(Office.addDays(base, 7)), key: 'week' };
  // a weekday ("on thursday", "jeudi prochain", "mardi 14"), a date ("15/10", "le 14/10", "the 14th"), "in 3 days" / "dans 3 jours" / "בעוד 3 ימים"
  const w = takeWhen(t.replace(/\?+$/, ''), base);
  if (w.due) return { from: w.due, to: w.due, key: 'day' };
  // "what are my tasks" with no day: everything open
  if (loose(/(?:משימות|משימה|רשימת|רשימות|תזכורות|tasks?|to-?dos?|reminders?|tâches|rappels|liste)/i).test(t)) return { from: '', to: '', key: 'all' };
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
