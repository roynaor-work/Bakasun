/* The short things she says about the state of work: who has not answered, I paid X, mark the tour done, close with Daniel,
   what is the budget of Shoval, add name tags to the print list, log a call with Arbel tomorrow at 10. Pure parsing, tested.
   The screens act on the result; nothing is sent and nothing is deleted. */
import { trim, str } from './core.js';
import { parseReminder, takeWhen, loose, polite, amountNum } from './travel.js';
import Office from './office.js';

const AMOUNT = loose(/(\d[\d,.\s\u00a0\u202f]*\d|\d)\s*(?:ש["״]?ח|שקל(?:ים)?|₪|ils|nis|shekels?|€|euros?|eur|\$|dollars?)?\s*$/i);
const AMOUNT_FIRST = loose(/^(\d[\d,.\s\u00a0\u202f]*\d|\d)\s*(?:ש["״]?ח|שקל(?:ים)?|₪|ils|nis|shekels?|€|euros?|eur|\$|dollars?)?\s+(?:to\s+|à\s+|au\s+|a\s+|ל)(.+)$/i);
const R = [
  ['waiting', /^(?:מי (?:עוד )?לא (?:ענה|ענו|חזר אלי|חזרו אלי)|כמה ספקים (?:עוד )?לא ענו|אילו ספקים (?:עוד )?לא ענו|ספקים שלא ענו|who (?:has not|hasn't|did not|didn't|still hasn't|has still not|have not|haven't|still haven't) (?:answered?|replied|responded|got back(?: to me)?)(?: yet| me yet| me)?|which (?:suppliers|vendors) (?:have not|haven't|still haven't|did not|didn't|still have not) (?:answered|replied|responded)(?: yet)?|how many suppliers (?:have not|haven't|still haven't|did not|didn't) (?:answered|replied|responded)(?: yet)?|(?:which|how many) suppliers are (?:still )?(?:waiting|pending|outstanding)|suppliers without (?:an )?answer|who is still waiting|qui n'a pas (?:encore )?répondu|qui ne m'a pas (?:encore )?répondu|qui n'a toujours pas répondu|quels fournisseurs n'ont pas (?:encore )?répondu|combien de fournisseurs n'ont pas (?:encore )?répondu|quels fournisseurs n'ont toujours pas répondu|fournisseurs sans réponse|qui manque à l'appel)\s*\??$/i],
  ['remindAll', /^(?:תזכירי לכל הספקים(?: שלא ענו)?|תזכורת לכולם|תשלחי תזכורת לכולם|remind (?:all|every|all the|all of the|every one of the) (?:the )?suppliers(?: (?:who|that) (?:have not|haven't|did not|didn't|still haven't) (?:answered|replied))?|send a reminder to (?:all|everyone|everybody|all the suppliers|all suppliers)|send (?:all|every) (?:the )?suppliers a reminder|remind everyone|nudge everyone|chase everyone|chase (?:all )?(?:the )?suppliers|rappelle tous les fournisseurs(?: qui n'ont pas (?:encore )?répondu)?|relance (?:tous les fournisseurs|tout le monde|les fournisseurs|tous)(?: qui n'ont pas (?:encore )?répondu)?|envoie un rappel à tous(?: les fournisseurs)?|envoie un rappel à tout le monde|rappel à tous|rappelle tout le monde)\s*[.!]?$/i],
  ['remindSup', /^(?:תשלחי|שלחי|תשלח)\s+תזכורת\s+ל(.+)$|^(?:תזכירי|הזכירי)\s+ל(?!י\b|י\s)(.+)$|^(?:send a reminder to|send (?:a )?reminder to|send a nudge to|remind|nudge|chase|chase up|follow up with)\s+(?!me(?:\s|$))(.+)$|^send\s+(.+?)\s+a reminder$|^(?:envoie un rappel à|envoie un rappel au|envoie un rappel aux|fais un rappel à|relance|rappelle|rappeler|relancer)\s+(?!-?\s?moi(?:\s|$))(.+)$/i],
  ['paidQuery', /^(?:מה|כמה)\s+(?:שילמנו|שלמנו|שילמתי|שלמתי|העברנו|העברתי)\s+ל(.+?)\s*\??$|^(?:how much|what) (?:did we|did i|have we|have i|do we|was) (?:pay|paid|transfer(?:red)?|wire(?:d)?|send|sent)\s+(?:to\s+)?(.+?)\s*\??$|^combien (?:on a|avons-nous|a-t-on|j'ai|ai-je|est-ce qu'on a|est-ce que j'ai) (?:payé|versé|viré|réglé|donné)\s+(?:à\s+|au\s+|aux\s+)?(.+?)\s*\??$|^qu'est-ce qu'on a (?:payé|versé|viré) (?:à\s+|au\s+)?(.+?)\s*\??$/i],
  ['paid', /^(?:העברתי|שילמתי|שלמתי|העברנו|שילמנו|שלמנו)\s+(?:תשלום\s+|את התשלום\s+|כסף\s+)?ל(.+)$|^(?:העברתי|שילמתי|שלמתי|העברנו|שילמנו|שלמנו)\s+(\d.+)$|^(?:i |we )?(?:paid|transferred|wired|sent (?:the )?payment to|made (?:the |a )?payment to|settled with|settled)\s+(.+)$|^(?:j'ai payé|on a payé|nous avons payé|j'ai viré|on a viré|j'ai réglé|on a réglé|j'ai versé|on a versé|payé|viré|réglé|versé)\s+(?:à\s+|au\s+|aux\s+)?(.+)$/i],
  ['callLog', /^(?:תרשמי|רשמי|תוסיפי|הוסיפי|תזכירי לי)\s+(?:לי\s+)?(?:שיחה|טלפון|להתקשר)\s+(?:עם|ל|אל)\s*(.+)$|^(?:log|add|schedule|note|put|book|plan|record|set up|set)\s+(?:a |an )?(?:call|phone call)\s+(?:with|to)\s+(.+)$|^(?:note|ajoute|programme|prévois|planifie|enregistre|mets|note-moi|ajoute-moi|cale|prévoir|noter|planifier)\s+un (?:appel|coup de fil)\s+(?:avec|à|au)\s+(.+)$/i],
  ['taskDone', /^(?:סמני|תסמני|סימני|תסמן)\s+(?:ש|את\s+)?(?:ה?משימה\s+)?(?:של\s+)?(.+?)\s+(?:בוצע|בוצעה|נעשה|נעשתה|הושלם|הושלמה|סגור|סגורה)\s*[.!]?$|^(?:ה?משימה\s+)?(.+?)\s+(?:בוצע|בוצעה|הושלמה|הושלם)\s*[.!]?$|^(?:בוצע|done|fait|faite|terminé|finished|complete)\s*[:]\s*(.+)$|^(?:mark|tick|check|check off|tick off)\s+(?:the task\s+|the\s+|la tâche\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$|^(?:tick|tick off|check off)\s+(?:the task\s+|the\s+)?(.+)$|^(?:the task\s+)?(.+?)\s+(?:is|was|has been)\s+(?:done|completed|finished)$|^(?:marque|coche|note|passe)\s+(?:la tâche\s+)?(.+?)\s+(?:comme\s+|en\s+)?(?:faite|fait|terminée|terminé|finie|fini|réglée|réglé)$|^(?:coche|valide)\s+(?:la tâche\s+)?(.+)$|^(?:la tâche\s+)?(.+?)\s+(?:est|a été|c'est)\s+(?:faite|fait|terminée|terminé|finie|fini|réglée|réglé)$/i],
  ['snooze', /^(?:דחי|תדחי|העבירי|תעבירי)\s+(?:את\s+)?(?:ה?משימה|ה?תזכורת)\s+(?:של\s+)?(.+)$|^(?:postpone|snooze|move|push|push back|delay|defer|reschedule|shift)\s+(?:the\s+|my\s+)?(?:task|reminder|to-?do)\s+(?:of\s+|for\s+|to\s+|about\s+)?(.+)$|^(?:postpone|snooze|move|push|push back|delay|defer|reschedule|shift)\s+(?:the\s+|my\s+)?(.+?)\s+(?:task|reminder)\s+(.+)$|^(?:reporte|décale|repousse|déplace|remets|reporter|décaler|repousser|déplacer)\s+(?:la\s+|le\s+|ma\s+|mon\s+)?(?:tâche|rappel)\s+(?:de\s+|pour\s+|du\s+|de la\s+|d')?(.+)$/i],
  ['taskCancel', /^(?:תבטלי|בטלי|תמחקי|מחקי|תורידי)\s+(?:את\s+)?(?:ה?משימה|ה?תזכורת)\s+(?:של\s+|ל)?(.+)$|^(?:cancel|remove|delete|drop|scrap|kill)\s+(?:the\s+|my\s+)?(?:task|reminder|to-?do)\s+(?:of\s+|to\s+|for\s+|about\s+)?(.+)$|^(?:cancel|remove|delete|drop)\s+(?:the\s+|my\s+)?(.+?)\s+(?:task|reminder)$|^(?:annule|supprime|enlève|retire|efface|annuler|supprimer|enlever|retirer|effacer|vire)\s+(?:la\s+|le\s+|ma\s+|mon\s+)?(?:tâche|rappel)\s+(?:de\s+|pour\s+|du\s+|de la\s+|d')?(.+)$/i],
  ['chosen', /^(?:סגרי עם|סוגרים עם|נסגר עם|סגרנו עם|בחרי את|תבחרי את|בחרנו את|בחרנו ב|הלכנו על|נלך על)\s*(.+)$|^(.+?)\s+(?:נבחר|נבחרה|אושר|אושרה|סגור|נסגר)\s*[.!]?$|^(?:choose|go with|let's go with|we go with|we'll go with|we're going with|we chose|we have chosen|we've chosen|we picked|we pick|pick|select|we select|confirm|close with|closing with|we close with|we closed with|book|we book|we booked|take|we take|we'll take|we are taking)\s+(.+)$|^(.+?)\s+(?:is|was|has been)\s+(?:chosen|confirmed|selected|picked|booked|approved)$|^(?:on prend|on choisit|on a choisi|on part sur|on part avec|on va avec|on y va avec|on signe avec|on conclut avec|on ferme avec|je prends|on retient|retiens|choisis|prends|confirme|réserve|on réserve|valide|on valide|on garde|garde)\s+(.+)$|^(.+?)\s+(?:est|a été|c'est)\s+(?:choisi|choisie|retenu|retenue|confirmé|confirmée|validé|validée|réservé|réservée|sélectionné|sélectionnée)$/i],
  ['printAdd', /^(?:תוסיפי|הוסיפי|תרשמי|רשמי)\s+(?:ל|את\s+)?(?:רשימת\s+ה?דפוס|ה?דפוס|לדפוס)\s*[:]?\s*(.+)$|^(?:add|put|note)\s+(?:to (?:the )?print(?:ing)?(?: list)?|on (?:the )?print(?:ing)? list|for print(?:ing)?)\s*[:]?\s*(.+)$|^(?:ajoute|mets|rajoute|note|ajouter|mettre)\s+(?:à l'impression|à la liste d'impression|dans la liste d'impression|à imprimer|pour l'impression|en impression)\s*[:]?\s*(.+)$/i],
  ['field', /^(מה|כמה|מתי|איפה|היכן|באיזה תאריך|באיזו שעה|באיזה שעה)\s+(?:ה)?(?:יש\s+)?(תקציב|משתתפים|תאריך|מקום|שעה|שעות|אירוע|מטרה|לו״?ז)\s*(?:יש\s+)?(?:של|ל|ב)\s*(.+?)\s*\??$|^(at what time|what time|how many|how much|what's|what|when|where)\s+(?:is|are|'s|does|do|will)?\s*(?:the\s+)?(budget|participants|people|guests|attendees|date|place|venue|location|event|time|hours|start time|purpose|goal|objective)\s+(?:of|for|does|is|at|in|do|with)?\s*(.+?)(?:\s+(?:have|got|take place|start|begin|happen|happening|starting))?\s*\??$|^(quel(?:le)? est|c'est quoi|combien de|combien y a-t-il de|il y a combien de|quand est|quand a lieu|quand se passe|c'est quand|où est|où a lieu|où se passe|c'est où|à quelle heure (?:est|commence|a lieu|démarre)|quel est le but de|quel est l'objectif de)\s+(?:le|la|l'|les)?\s*(budget|participants|personnes|invités|date|lieu|endroit|événement|evenement|heure|horaires?|objectif|but)\s+(?:de|pour|d'|du|des|à|a lieu|est|commence)?\s*(.+?)\s*\??$/i]
].map(([k, re]) => [k, loose(re)]);
const FIELD = { 'תקציב': 'budget', 'משתתפים': 'participants', 'תאריך': 'date', 'מקום': 'place', 'שעה': 'hours', 'שעות': 'hours', 'אירוע': 'date', 'מטרה': 'purpose', 'לו״ז': 'hours', 'לוז': 'hours', budget: 'budget', participants: 'participants', people: 'participants', guests: 'participants', attendees: 'participants', date: 'date', place: 'place', venue: 'place', location: 'place', event: 'date', time: 'hours', hours: 'hours', 'start time': 'hours', purpose: 'purpose', goal: 'purpose', objective: 'purpose', personnes: 'participants', 'invités': 'participants', invites: 'participants', lieu: 'place', endroit: 'place', 'événement': 'date', 'evenement': 'date', heure: 'hours', horaire: 'hours', horaires: 'hours', objectif: 'purpose', but: 'purpose' };
const EVENT_NOUN = /^(?:אירוע|event|événement|evenement)$/i;

/** {kind, who, amount, qty, item, field, when:{due,time}} or null. */
export function parseAction(text, today) {
  const t = polite(trim(str(text)).replace(/’/g, "'")).replace(/[.!]+$/, '');
  if (!t || t.length > 140) return null;
  for (const [kind, re] of R) {
    const m = re.exec(t); if (!m) continue;
    const g = m.slice(1).filter(x => x != null);
    const out = { kind };
    if (kind === 'waiting' || kind === 'remindAll') return out;
    if (kind === 'field') {
      const q = (g[0] || '').toLowerCase(), noun = (g[1] || '').toLowerCase();
      out.field = FIELD[noun] || FIELD[g[1]] || 'date';
      // "when / where / what time is the event of X": the question word says which field
      if (EVENT_NOUN.test(noun)) out.field = /איפה|היכן|where|où|ou /.test(q) ? 'place' : /שעה|time|heure/.test(q) ? 'hours' : 'date';
      out.who = trim(g[2] || '').replace(loose(/^(?:the\s+|l'|le\s+)?(?:event|événement|evenement|אירוע)\s+(?:of|de|d'|של)\s*/i), ''); return out;
    }
    if (kind === 'paid') {
      let who = trim(g[0] || '');
      const f = AMOUNT_FIRST.exec(who);
      if (f) { out.amount = amountNum(f[1]); who = trim(f[2]); }
      else { const a = AMOUNT.exec(who); if (a && a.index > 0) { out.amount = amountNum(a[1]); who = trim(who.slice(0, a.index)); } }
      if (isNaN(out.amount)) delete out.amount;
      out.who = who.replace(/^(?:ה)?(?:ספק\s+)?/, '').replace(/^(?:the\s+|le\s+|la\s+|l')/i, ''); return out;
    }
    if (kind === 'printAdd') {
      let rest = trim(g[0] || ''); let who = '';
      const forM = /\s+(?:ל|עבור\s+|for\s+|pour\s+)([^\d]+)$/.exec(rest); if (forM && forM[1].trim().length >= 2 && !/^(?:כל|each|chaque)/.test(forM[1].trim())) { who = trim(forM[1]); rest = trim(rest.slice(0, forM.index)); }
      const q = /^(\d+)\s+(.+)$|^(.+?)\s+(?:x|×|\*)\s*(\d+)$|^(.+?)\s+(\d+)$/.exec(rest);
      if (q) { out.qty = Number(q[1] || q[4] || q[6]); out.item = trim(q[2] || q[3] || q[5]); } else { out.item = rest; }
      out.who = who; return out;
    }
    if (kind === 'snooze') {
      const w = takeWhen(trim(g.join(' ')), today);
      out.when = { due: w.due || Office.iso(Office.addDays(w.base, 1)), time: w.time };
      out.who = trim(w.rest).replace(/^(?:ל|to\s+|à\s+|a\s+)/, '').replace(/\s+(?:to|à|a|ל|עד|pour|by|until|jusqu'à|jusqu'au|au)$/i, '');
      return out;
    }
    if (kind === 'callLog') {
      const rest = trim(g[0] || '');
      const rem = parseReminder('תזכירי לי ' + rest, today);
      out.when = rem ? { due: rem.due, time: rem.time } : null;
      out.who = rem ? trim(rem.title).replace(/^(?:ל|עם\s+)/, '') : rest;
      return out;
    }
    out.who = trim(g[0] || '').replace(/^(?:the task\s+|la tâche\s+)/i, ''); return out;
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
