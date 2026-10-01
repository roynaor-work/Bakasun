/* The long recording: she talks for a minute about a new event, and the app splits it into the case, what suppliers it
   needs, the tasks she mentioned, and what is still open. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';
import { loose } from './travel.js';

/** Supplier types hinted by the words she used. Order matters: first match per type. */
const NEEDS = [
  ['מלונות', /מלון|מלונות|לינה|חדרי|חדרים|סינגל|פנסיון|hotel|hôtel|rooms?|nuit|nuits|chambres?|hébergement|hebergement|nuitée|logement|accommodation|lodging|overnight/i],
  ['הסעות', /אוטובוס|הסעה|הסעות|מיניבוס|מוניות|הסעת|bus|minibus|autocar|transport|navette|shuttle|transfert|transfer|coach|taxis?|chauffeur/i],
  ['קייטרינג ושפים', /קייטרינג|אוכל|ארוחת|ארוחות|כיבוד|בופה|שף|catering|caterer|lunch|dinner|breakfast|food|meals?|traiteur|repas|buffet|déjeuner|dejeuner|dîner|diner|petit-déjeuner|cocktail|collation|chef/i],
  ['מקום לאירוע', /אולם|מקום לאירוע|חלל|גן אירועים|מתחם|venue|hall|salle|lieu|espace|conference room|meeting room|ballroom/i],
  ['הגברה ותאורה', /הגברה|מיקרופון|מסך|מקרן|תאורה|רמקול|sound|projector|screen|lighting|microphone|audio|speakers|(?:^|\s)AV(?=\s|$)|sono|sonorisation|micro|écran|ecran|projecteur|éclairage|eclairage|lumières?/i],
  ['דפוס ומיתוג', /דפוס|תגי שם|תגים|שלטים|שלט|מחברות|עטים|ביגים|רול-?אפ|תוכניות|תוכנייה|print|name tags|signs|signage|banners|roll-?ups?|impression|imprimer|panneaux|signalétique|signaletique|kakémono|kakemono|badges|affiches/i],
  ['צילום ווידאו', /צלם|צילום|וידאו|photograph|photos?|video|videographer|photographe|vidéo|vidéaste|videaste/i],
  ['פעילות וסיורים', /סיור|מדריך|פעילות|סדנה|סדנא|הרצאה|יד ושם|tour|guide|activity|activities|workshop|lecture|speaker|team.?building|visite|atelier|activité|activite|conférencier|conferencier|animation/i],
  ['תקליטנים ולהקות', /די\.?ג'?יי|תקליטן|להקה|מוזיקה|זמר|dj\b|band|music|singer|musique|chanteur|chanteuse|orchestre/i],
  ['עיצוב ופרחים', /פרחים|עיצוב|קישוט|סידורי שולחן|flowers|florist|decor|fleurs|fleuriste|décor/i],
  ['מסעדות', /מסעדה|מסעדות|restaurant|resto(?=\s|$|s)/i]
];
const VERBS = 'צריך|צריכה|צריכים|לבדוק|לשאול|להתקשר|לשלוח|לזכור|לא לשכוח|לתאם|להזמין|לוודא|לבקש|לחזור';
const HE_BREAK = new RegExp('(?<!צריך|צריכה|צריכים)\\s+(?=(?:ו|ואז\\s+|אז\\s+)?(?:' + VERBS + ')(?=\\s|$))');
const HE_LEAD = new RegExp('^(?:ואז |אז |ו)(?=(?:' + VERBS + ')(?=\\s|$))');
// "צריך לבדוק" is a task; "צריך אולם" is a need, not a task
const TASK_START = loose(new RegExp('^(?:(?:צריך|צריכה|צריכים)\\s+ל|(?:לבדוק|לשאול|להתקשר|לשלוח|לזכור|לא לשכוח|לתאם|להזמין|לוודא|לבקש|לחזור)(?=\\s|$)|(?:need to|needs to|have to|has to|remember to|don\'t forget|do not forget|make sure|to check|to call|to send|to ask|to book|to confirm|to order|to prepare|il faut|il faudra|faut|on doit|je dois|il faudrait|à vérifier|à faire|à confirmer|à réserver|à envoyer|à demander|penser à|pense à|ne pas oublier|n\'oublie pas|vérifier|appeler|envoyer|demander|réserver|confirmer|commander|prévoir|relancer|check|call|send|ask|book|confirm|order|prepare|follow up)(?=\\s|$)(?!\\s+(?:un|une|des|du|de la|de l\'|a|an|the|some|two|three|\\d)(?:\\s|$))|(?:must|should|need|needs)(?=\\s|$)(?!\\s+(?:un|une|des|du|de la|de l\'|le|la|les|a|an|the|some|two|three|\\d)(?:\\s|$)))', 'i'));
const LATIN_BREAK = loose(/(?<=[.!?])\s+|\s*[,;]\s*(?=(?:need|needs|remember|don't|do not|have to|has to|must|make sure|il faut|il faudra|faut|on doit|je dois|penser|pense|ne pas|n'oublie|à )(?:\s|$))|\s+(?=(?:and\s+|et\s+|then\s+|puis\s+)?(?:need to|needs to|have to|has to|must|remember to|don't forget|do not forget|make sure|il faut|il faudra|on doit|je dois|penser à|pense à|ne pas oublier|n'oublie pas)(?:\s|$))|\s+(?=(?:and|et|then|puis)\s+(?:check|call|send|ask|book|confirm|order|prepare|follow up|vérifier|appeler|envoyer|demander|réserver|confirmer|commander|prévoir|relancer)(?:\s|$))/i);
const LATIN_LEAD = /^(?:and|et|then|puis)\s+/i;
const NUMW = { two: 2, three: 3, four: 4, five: 5, deux: 2, trois: 3, quatre: 4, cinq: 5, 'שני': 2, 'שתי': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5 };

/** Splits a spoken text into sentences (she does not use much punctuation; a new verb like "לבדוק" also starts a new one). */
export function sentences(text) {
  return str(text).replace(/\s+/g, ' ')
    .split(LATIN_BREAK)
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
  sentences(t).forEach(s => { const s2 = s.replace(HE_LEAD, '').replace(LATIN_LEAD, ''); if (TASK_START.test(s2) && s2.length > 6) tasks.push({ title: s2.replace(/[.!?]+$/, '') }); });
  let m;
  let days = '';
  if ((m = /(?:^|\s)(\d+|two|three|four|five|deux|trois|quatre|cinq|שני|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש)\s*(?:לילות|ימים|nights?|days?|nuits|jours)(?=\s|$|[,.])/i.exec(t))) { const n = NUMW[m[1].toLowerCase()] || +m[1]; days = /לילות|nights?|nuits/i.test(m[0]) ? String(n + 1) : String(n); }
  else if (/לילה אחד|one night|une nuit/i.test(t)) days = '2';
  else if (/יומיים|two days|deux jours/i.test(t)) days = '2';
  else if (/שלושה ימים|three days|trois jours/i.test(t)) days = '3';
  const rooms = (m = /(\d+)\s*(?:single\s+|double\s+|twin\s+|simples?\s+|doubles?\s+|hotel\s+)?(?:חדרי|חדרים|rooms?|chambres?)/i.exec(t)) ? m[1] : '';
  const open = [];
  if (!lead.date) open.push('date'); if (!lead.participants) open.push('participants'); if (!lead.place && needs.includes('מלונות')) open.push('place'); if (!lead.budget) open.push('budget');
  return { lead, needs, tasks, days, rooms, open };
}
