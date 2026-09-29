/* The short things she says about the state of work: who has not answered, I paid X, mark the tour done, close with Daniel,
   what is the budget of Shoval, add name tags to the print list, log a call with Arbel tomorrow at 10. Pure parsing, tested.
   The screens act on the result; nothing is sent and nothing is deleted. */
import { trim, str } from './core.js';
import { parseReminder, takeWhen } from './travel.js';
import Office from './office.js';

const AMOUNT = /(\d[\d,.]*)\s*(?:ש["״]?ח|שקל(?:ים)?|₪|ils|nis|shekels?)?\s*$/i;
const R = [
  ['waiting', /^(?:מי (?:עוד )?לא (?:ענה|ענו|חזר אלי|חזרו אלי)|כמה ספקים (?:עוד )?לא ענו|אילו ספקים (?:עוד )?לא ענו|ספקים שלא ענו|who (?:has not|hasn['’]t|did not|didn['’]t|still hasn['’]t) answered?|which suppliers (?:have not|haven['’]t) answered|qui n['’]a pas (?:encore )?répondu)\s*\??$/i],
  ['remindAll', /^(?:תזכירי לכל הספקים(?: שלא ענו)?|תזכורת לכולם|תשלחי תזכורת לכולם|remind (?:all|every) (?:the )?suppliers(?: who have not answered)?|rappelle tous les fournisseurs)\s*[.!]?$/i],
  ['remindSup', /^(?:תשלחי|שלחי|תשלח)\s+תזכורת\s+ל(.+)$|^(?:תזכירי|הזכירי)\s+ל(?!י\b|י\s)(.+)$|^(?:send a reminder to|remind)\s+(?!me\b)(.+)$|^(?:envoie un rappel à|rappelle)\s+(?!-moi)(.+)$/i],
  ['paidQuery', /^(?:מה|כמה)\s+(?:שילמנו|שלמנו|שילמתי|שלמתי|העברנו|העברתי)\s+ל(.+?)\s*\??$|^how much (?:did we|did i|have we) (?:pay|paid|transfer(?:red)?)\s+(?:to\s+)?(.+?)\s*\??$|^combien (?:on a|avons-nous|j['’]ai) payé\s+(?:à\s+)?(.+?)\s*\??$/i],
  ['paid', /^(?:העברתי|שילמתי|שלמתי|העברנו|שילמנו|שלמנו)\s+(?:תשלום\s+|את התשלום\s+|כסף\s+)?ל(.+)$|^(?:i )?(?:paid|transferred|sent (?:the )?payment to)\s+(.+)$|^(?:j['’]ai payé|on a payé|payé)\s+(?:à\s+)?(.+)$/i],
  ['callLog', /^(?:תרשמי|רשמי|תוסיפי|הוסיפי|תזכירי לי)\s+(?:לי\s+)?(?:שיחה|טלפון|להתקשר)\s+(?:עם|ל|אל)\s*(.+)$|^(?:log|add|schedule)\s+a call\s+(?:with|to)\s+(.+)$|^(?:note|ajoute)\s+un appel\s+(?:avec|à)\s+(.+)$/i],
  ['taskDone', /^(?:סמני|תסמני|סימני|תסמן)\s+(?:ש|את\s+)?(?:ה?משימה\s+)?(?:של\s+)?(.+?)\s+(?:בוצע|בוצעה|נעשה|נעשתה|הושלם|הושלמה|סגור|סגורה)\s*[.!]?$|^(?:ה?משימה\s+)?(.+?)\s+(?:בוצע|בוצעה|הושלמה|הושלם)\s*[.!]?$|^(?:בוצע|done|fait)\s*[:]\s*(.+)$|^(?:mark|tick)\s+(?:the task\s+)?(.+?)\s+(?:as\s+)?(?:done|complete)$|^(?:marque|coche)\s+(?:la tâche\s+)?(.+?)\s+(?:comme\s+)?(?:faite|terminée)$/i],
  ['snooze', /^(?:דחי|תדחי|העבירי|תעבירי)\s+(?:את\s+)?(?:ה?משימה|ה?תזכורת)\s+(?:של\s+)?(.+)$|^(?:postpone|snooze|move|push)\s+(?:the\s+)?(?:task|reminder)\s+(?:of\s+)?(.+)$|^(?:reporte|décale|decale)\s+la\s+(?:tâche|tache)\s+(?:de\s+)?(.+)$/i],
  ['taskCancel', /^(?:תבטלי|בטלי|תמחקי|מחקי|תורידי)\s+(?:את\s+)?(?:ה?משימה|ה?תזכורת)\s+(?:של\s+|ל)?(.+)$|^(?:cancel|remove|delete)\s+the (?:task|reminder)\s+(?:of\s+|to\s+)?(.+)$|^(?:annule|supprime)\s+la (?:tâche|tache)\s+(?:de\s+)?(.+)$/i],
  ['chosen', /^(?:סגרי עם|סוגרים עם|נסגר עם|סגרנו עם|בחרי את|תבחרי את|בחרנו את|בחרנו ב|הלכנו על|נלך על)\s*(.+)$|^(.+?)\s+(?:נבחר|נבחרה|אושר|אושרה|סגור|נסגר)\s*[.!]?$|^(?:choose|go with|we chose|confirm)\s+(.+)$|^(.+?)\s+(?:is chosen|is confirmed)$|^(?:on prend|on choisit|on a choisi)\s+(.+)$/i],
  ['printAdd', /^(?:תוסיפי|הוסיפי|תרשמי|רשמי)\s+(?:ל|את\s+)?(?:רשימת\s+ה?דפוס|ה?דפוס|לדפוס)\s*[:]?\s*(.+)$|^add\s+(?:to (?:the )?print(?: list)?)\s*[:]?\s*(.+)$|^ajoute\s+(?:à l['’]impression|à la liste d['’]impression)\s*[:]?\s*(.+)$/i],
  ['field', /^(?:מה|כמה|מתי|איפה|באיזה תאריך)\s+(?:ה)?(?:יש\s+)?(תקציב|משתתפים|תאריך|מקום|שעה|שעות|אירוע|מטרה|לו״?ז)\s*(?:יש\s+)?(?:של|ל|ב)\s*(.+?)\s*\??$|^(?:what|when|where|how many)\s+(?:is|are|'s)?\s*(?:the\s+)?(budget|participants|date|place|venue|event|time|purpose)\s+(?:of|for|does|is)?\s*(.+?)\s*\??$|^(?:quel(?:le)? est|combien de|quand est|où est)\s+(?:le|la|l['’])?\s*(budget|participants|date|lieu|événement|evenement|heure)\s+(?:de|pour|d['’])\s*(.+?)\s*\??$/i]
];
const FIELD = { 'תקציב': 'budget', 'משתתפים': 'participants', 'תאריך': 'date', 'מקום': 'place', 'שעה': 'hours', 'שעות': 'hours', 'אירוע': 'date', 'מטרה': 'purpose', 'לו״ז': 'hours', 'לוז': 'hours', budget: 'budget', participants: 'participants', date: 'date', place: 'place', venue: 'place', event: 'date', time: 'hours', purpose: 'purpose', lieu: 'place', 'événement': 'date', 'evenement': 'date', heure: 'hours' };

/** {kind, who, amount, qty, item, field, when:{due,time}} or null. */
export function parseAction(text, today) {
  const t = trim(str(text)).replace(/[.!]+$/, '');
  if (!t || t.length > 140) return null;
  for (const [kind, re] of R) {
    const m = re.exec(t); if (!m) continue;
    const g = m.slice(1).filter(x => x != null);
    const out = { kind };
    if (kind === 'waiting' || kind === 'remindAll') return out;
    if (kind === 'field') { out.field = FIELD[(g[0] || '').toLowerCase()] || FIELD[g[0]] || 'date'; out.who = trim(g[1] || ''); return out; }
    if (kind === 'paid') { let who = trim(g[0] || ''); const a = AMOUNT.exec(who); if (a && a.index > 0) { out.amount = Number(a[1].replace(/,/g, '')); who = trim(who.slice(0, a.index)); } out.who = who.replace(/^(?:ה)?(?:ספק\s+)?/, ''); return out; }
    if (kind === 'printAdd') {
      let rest = trim(g[0] || ''); let who = '';
      const forM = /\s+(?:ל|עבור\s+|for\s+|pour\s+)([^\d]+)$/.exec(rest); if (forM && forM[1].trim().length >= 2 && !/^(?:כל|each)/.test(forM[1].trim())) { who = trim(forM[1]); rest = trim(rest.slice(0, forM.index)); }
      const q = /^(\d+)\s+(.+)$|^(.+?)\s+(?:x|×|\*)\s*(\d+)$|^(.+?)\s+(\d+)$/.exec(rest);
      if (q) { out.qty = Number(q[1] || q[4] || q[6]); out.item = trim(q[2] || q[3] || q[5]); } else { out.item = rest; }
      out.who = who; return out;
    }
    if (kind === 'snooze') {
      const w = takeWhen(trim(g[0] || ''), today);
      out.when = { due: w.due || Office.iso(Office.addDays(w.base, 1)), time: w.time };
      out.who = trim(w.rest).replace(/^(?:ל|to\s+|à\s+)/, '').replace(/\s+(?:to|à|ל|עד|pour|by)$/i, '');
      return out;
    }
    if (kind === 'callLog') {
      const rest = trim(g[0] || '');
      const rem = parseReminder('תזכירי לי ' + rest, today);
      out.when = rem ? { due: rem.due, time: rem.time } : null;
      out.who = rem ? trim(rem.title).replace(/^(?:ל|עם\s+)/, '') : rest;
      return out;
    }
    out.who = trim(g[0] || ''); return out;
  }
  return null;
}

const norm = w => str(w).toLowerCase().replace(/[״"'’().,:;!?]/g, '').replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]));
const words = s => norm(s).split(/\s+/).filter(w => w.length >= 2);
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) || (a.length >= 4 && /^[הלבמוש]/.test(a) && a.slice(1) === b) || (b.length >= 4 && /^[הלבמוש]/.test(b) && b.slice(1) === a);

/** The items whose title best matches what she said: [{item, score}], best first, only real matches. */
export function matchTitles(query, items, titleOf) {
  const q = words(query); if (!q.length) return [];
  return items.map(item => { const h = words(titleOf(item)); let score = 0; q.forEach(w => { if (h.some(x => same(x, w))) score++; }); return { item, score }; })
    .filter(x => x.score > 0 && x.score >= Math.min(2, q.length)).sort((a, b) => b.score - a.score);
}
