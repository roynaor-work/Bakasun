/* Moving between screens by voice: "ספקים", "go to tasks", "va aux fournisseurs". One clear word per screen, in three
   languages, with an optional "go to / open / show" in front and "screen / window" after. Pure, tested. */
import { str, trim } from './core.js';

/** route → the words she can say (lower case, no punctuation). The first Hebrew/French/English word of each is the one the help screen recommends. */
export const SCREENS = [
  ['today', ['היום', 'מסך הבית', 'בית', 'today', 'home', "aujourd'hui", 'aujourd’hui', 'accueil']],
  ['cases', ['תיקים', 'אירועים', 'cases', 'events', 'dossiers', 'événements', 'evenements']],
  ['suppliers', ['ספקים', 'ספק', 'suppliers', 'vendors', 'fournisseurs']],
  ['clients', ['לקוחות', 'לקוח', 'clients', 'customers']],
  ['tasks', ['משימות', 'tasks', 'to do', 'tâches', 'taches']],
  ['calls', ['שיחות', 'טלפונים', 'calls', 'appels']],
  ['quotes', ['הצעות מחיר', 'הצעות', 'quotes', 'devis']],
  ['money', ['כספים', 'כסף', 'תשלומים', 'money', 'payments', 'finances', 'paiements', 'argent']],
  ['receipts', ['קבלות', 'חשבוניות', 'צילומים', 'receipts', 'reçus', 'recus', 'factures']],
  ['notes', ['הערות', 'notes']],
  ['groups', ['קבוצות', 'groups', 'groupes']],
  ['search', ['חיפוש', 'search', 'recherche']],
  ['settings', ['הגדרות', 'settings', 'réglages', 'reglages', 'paramètres', 'parametres']],
  ['more', ['עוד', 'תפריט', 'more', 'menu', 'plus']],
  ['lead', ['פנייה חדשה', 'פניה חדשה', 'new lead', 'new inquiry', 'nouvelle demande']],
  ['assist', ['פקודה', 'תגידי לי מה לעשות', 'command', 'assistant', 'commande']],
  ['help', ['עזרה', 'מה אפשר להגיד', 'help', 'what can i say', 'aide', 'que puis-je dire']]
];
const LEAD = /^(?:עברי ל|תעברי ל|לכי ל|תלכי ל|קחי אותי ל|תראי לי את ה|תראי לי|הראי לי|תפתחי את ה|תפתחי|פתחי את ה|פתחי|ל|go to the|go to|take me to the|take me to|open the|open|show me the|show me|show|va aux|va au|va à la|va à|ouvre les|ouvre la|ouvre le|ouvre|montre-moi les|montre-moi la|montre-moi le|montre-moi|aller aux|aller au|aller à)\s*/i;
const TAIL = /\s*(?:מסך|חלון|דף|screen|window|page|écran|ecran|fenêtre|fenetre)?\s*[.!?]*$/i;

/** The route she asked for ('suppliers', 'tasks'...), or null when the text is not a move between screens. */
export function parseGoto(text) {
  const t = trim(str(text)).toLowerCase().replace(/[״"`]/g, '');
  if (!t || t.length > 40) return null;
  const art = /^(?:ה|the |les |le |la |l')/;
  const bare = t.replace(TAIL, '').trim();
  const core = bare.replace(LEAD, '').replace(TAIL, '').trim();
  const cands = [bare, bare.replace(art, ''), core, core.replace(art, '')].map(x => x.trim()).filter(Boolean);
  for (const [route, words] of SCREENS) if (words.some(w => cands.includes(w))) return route;
  return null;
}

/** The recommended word for each screen in this language (for the help screen and the examples). */
export function screenWord(route, lang) {
  const row = SCREENS.find(r => r[0] === route); if (!row) return '';
  const w = row[1]; const isHe = x => /[֐-׿]/.test(x);
  if (lang === 'he') return w.find(isHe) || w[0];
  const latin = w.filter(x => !isHe(x));
  if (lang === 'fr') { const fr = { today: 'accueil', cases: 'dossiers', suppliers: 'fournisseurs', clients: 'clients', tasks: 'tâches', calls: 'appels', quotes: 'devis', money: 'finances', receipts: 'reçus', notes: 'notes', groups: 'groupes', search: 'recherche', settings: 'réglages', more: 'menu', lead: 'nouvelle demande', assist: 'commande', help: 'aide' }; return fr[route] || latin[0]; }
  return latin[0] || w[0];
}
