/* The long recording: she talks for a minute about a new event, and the app splits it into the case, what suppliers it
   needs, the tasks she mentioned, and what is still open. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

/** Supplier types hinted by the words she used. Order matters: first match per type. */
const NEEDS = [
  ['מלונות', /מלון|מלונות|לינה|חדרי|חדרים|סינגל|פנסיון|hotel|rooms?|nuit|hôtel|chambres?/i],
  ['הסעות', /אוטובוס|הסעה|הסעות|מיניבוס|מוניות|הסעת|bus|minibus|transport|navette|shuttle/i],
  ['קייטרינג ושפים', /קייטרינג|אוכל|ארוחת|ארוחות|כיבוד|בופה|שף|catering|lunch|dinner|breakfast|food|traiteur|repas|buffet/i],
  ['מקום לאירוע', /אולם|מקום לאירוע|חלל|גן אירועים|מתחם|venue|hall|salle|lieu/i],
  ['הגברה ותאורה', /הגברה|מיקרופון|מסך|מקרן|תאורה|רמקול|sound|projector|screen|lighting|sono|micro/i],
  ['דפוס ומיתוג', /דפוס|תגי שם|תגים|שלטים|שלט|מחברות|עטים|ביגים|רול-?אפ|תוכניות|תוכנייה|print|name tags|signs|badges|impression|badges/i],
  ['צילום ווידאו', /צלם|צילום|וידאו|photograph|video|photographe|vidéo/i],
  ['פעילות וסיורים', /סיור|מדריך|פעילות|סדנה|סדנא|הרצאה|יד ושם|tour|guide|activity|workshop|visite|atelier/i],
  ['תקליטנים ולהקות', /די\.?ג'?יי|תקליטן|להקה|מוזיקה|זמר|dj\b|band|music|musique/i],
  ['עיצוב ופרחים', /פרחים|עיצוב|קישוט|סידורי שולחן|flowers|decor|fleurs|décor/i],
  ['מסעדות', /מסעדה|מסעדות|restaurant/i]
];
const VERBS = 'צריך|צריכה|צריכים|לבדוק|לשאול|להתקשר|לשלוח|לזכור|לא לשכוח|לתאם|להזמין|לוודא|לבקש|לחזור';
const HE_BREAK = new RegExp('(?<!צריך|צריכה|צריכים)\\s+(?=(?:ו|ואז\\s+|אז\\s+)?(?:' + VERBS + ')(?=\\s|$))');
const HE_LEAD = new RegExp('^(?:ואז |אז |ו)(?=(?:' + VERBS + ')(?=\\s|$))');
// "צריך לבדוק" is a task; "צריך אולם" is a need, not a task
const TASK_START = new RegExp('^(?:(?:צריך|צריכה|צריכים)\\s+ל|(?:לבדוק|לשאול|להתקשר|לשלוח|לזכור|לא לשכוח|לתאם|להזמין|לוודא|לבקש|לחזור)(?=\\s|$)|(?:need to|have to|to check|to call|to send|to ask|to book|remember to|don\'t forget|il faut|à vérifier|à faire|penser à|ne pas oublier)\\b)', 'i');

/** Splits a spoken text into sentences (she does not use much punctuation; a new verb like "לבדוק" also starts a new one). */
export function sentences(text) {
  return str(text).replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s*[,;]\s*(?=(?:need|remember|don't|have to|il faut|penser|ne pas|à )\b)|\s+(?=(?:and\s+|et\s+)?(?:need to|remember to|don't forget|il faut|penser à|ne pas oublier)\b)/i)
    .flatMap(p => p.split(HE_BREAK))
    .map(trim).filter(Boolean);
}

/** Supplier types named in a short text, e.g. "hotels" or "ממלונות" → ['מלונות']. */
export function typesIn(text) { const t = str(text); return NEEDS.filter(([, re]) => re.test(t)).map(([type]) => type); }

/** The client, if one of the known names is said in the text (quotes and hyphens do not matter). */
export function clientIn(text, clients) {
  const norm = v => str(v).toLowerCase().replace(/[״"'׳’`\-]/g, '').replace(/\s+/g, ' ').trim();
  const t = ' ' + norm(text) + ' ';
  const hits = (clients || []).map(c => [c, norm(c.name)]).filter(([, n]) => n.length >= 3 && (t.includes(' ' + n + ' ') || t.includes(' ל' + n + ' ') || t.includes(' ב' + n + ' ') || t.includes(' מ' + n + ' ') || t.includes(' ' + n + ',')));
  hits.sort((a, b) => b[1].length - a[1].length);
  return hits.length ? hits[0][0] : null;
}

/** {lead, needs: [supplier types], tasks: [{title}], days, rooms, open: [questions still unanswered]} */
export function parseBrief(text, places, today, clients) {
  const t = str(text);
  const lead = Office.parseLead(t, places || [], today);
  const known = clientIn(t, clients); if (known && !lead.client) { lead.client = known.name; if (!lead.phone) lead.phone = str(known.phone); if (!lead.email) lead.email = str(known.email); if (!lead.name) lead.name = str(known.contact); if (known.lang) lead.lang = known.lang; }
  const needs = NEEDS.filter(([, re]) => re.test(t)).map(([type]) => type);
  const tasks = [];
  sentences(t).forEach(s => { const s2 = s.replace(HE_LEAD, '').replace(/^(?:and|et)\s+/i, ''); if (TASK_START.test(s2) && s2.length > 6) tasks.push({ title: s2.replace(/[.!?]+$/, '') }); });
  let m;
  let days = '';
  if ((m = /(\d+)\s*(?:לילות|ימים|nights?|days?|nuits|jours)/i.exec(t))) days = /לילות|nights?|nuits/i.test(m[0]) ? String(+m[1] + 1) : m[1];
  else if (/לילה אחד|one night|une nuit/i.test(t)) days = '2';
  else if (/יומיים|two days|deux jours/i.test(t)) days = '2';
  else if (/שלושה ימים|three days|trois jours/i.test(t)) days = '3';
  const rooms = (m = /(\d+)\s*(?:חדרי|חדרים|rooms?|chambres?)/i.exec(t)) ? m[1] : '';
  const open = [];
  if (!lead.date) open.push('date'); if (!lead.participants) open.push('participants'); if (!lead.place && needs.includes('מלונות')) open.push('place'); if (!lead.budget) open.push('budget');
  return { lead, needs, tasks, days, rooms, open };
}
