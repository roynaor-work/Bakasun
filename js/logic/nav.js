/* Moving between screens by voice: "ספקים", "go to tasks", "va aux fournisseurs". One clear word per screen, in three
   languages, with an optional "go to / open / show" in front and "screen / window" after. Pure, tested. */
import { str, trim } from './core.js';
import { loose, polite } from './travel.js';

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
  ['lead', ['פנייה חדשה', 'פניה חדשה', 'new lead', 'new inquiry', 'new enquiry', 'nouvelle demande']],
  ['assist', ['פקודה', 'תגידי לי מה לעשות', 'command', 'assistant', 'commande']],
  ['help', ['עזרה', 'מה אפשר להגיד', 'help', 'what can i say', 'aide', 'que puis-je dire']],
  ['dashboard', ['לוח בקרה', 'לוח הבקרה', 'דשבורד', 'dashboard', 'tableau de bord']],
  ['calendar', ['יומן', 'לוח שנה', 'calendar', 'agenda', 'calendrier']],
  ['board', ['לוח אירועים', 'קנבן', 'board', 'kanban', 'tableau']],
  ['notifications', ['תזכורות', 'התראות', 'notifications', 'reminders', 'alerts', 'rappels', 'notifications']],
  ['templates', ['תבניות', 'תבנית', 'תבניות הודעות', 'templates', 'template', 'message templates', 'modèles', 'modeles', 'modèle', 'modèles de messages']],
  ['import', ['ייבוא', 'יבוא', 'ייבוא מייל', 'ייבוא מיילים', 'import', 'import mail', 'mail import', 'importer', 'importation', 'import de mail']]
];
// Phrases that move her even without "go to" in front: a verb that is the screen's whole purpose ("לייבא מייל", "import a mail").
const BARE = [
  ['import', ['לייבא מייל', 'לייבא מיילים', 'ייבוא מייל', 'ייבוא מיילים', 'תייבאי מייל', 'ייבאי מייל', 'import a mail', 'import an email', 'import an e-mail', 'import a message', 'import mail', 'import email', 'import an inquiry', 'importer un mail', 'importer un e-mail', 'importer un email', 'importer un message', 'importe un mail', 'importe un e-mail']]
];
// A move needs an explicit "go to" in front, so a screen word said inside a sentence ("the cases folder...") never moves her by mistake.
const LEAD = loose(/^(?:עברי ל|תעברי ל|עבור ל|לעבור ל|לכי ל|תלכי ל|קחי אותי ל|עברי אל ה|תעברי אל ה|עברי אל|תעברי אל|תראי לי את ה|תראי לי|הראי לי|תפתחי את מסך ה|תפתחי את ה|תפתחי את|תפתחי מסך|פתחי מסך|פתחי את ה|פתחי את|תפתחי|פתחי|מסך|go to the|go to my|go to|take me to the|take me to my|take me to|switch to the|switch to|open the .* screen|open the|open my|open|show me the|show me my|show me|bring up the|bring up|va aux|va au|va à la|va à l'|va à|va dans les|va dans le|va dans la|va dans|aller aux|aller au|aller à la|aller à|allez aux|allez au|allez à|passe aux|passe au|passe à la|passe à|montre-moi les|montre-moi la|montre-moi le|montre-moi l'|montre-moi|montre les|montre le|montre la|montre|affiche les|affiche le|affiche la|affiche|ouvre les|ouvre le|ouvre la|ouvre l'|ouvre|ouvrir les|ouvrir le|ouvrir la|ouvrir|ouvre l'écran|écran|ecran|page)\s*/i);
const TAIL = loose(/\s*(?:מסך|חלון|דף|screen|window|page|tab|écran|ecran|fenêtre|fenetre|onglet)?\s*[.!?]*$/i);
const deacc = s => str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'");

/** The route she asked for ('suppliers', 'tasks'...), or null when the text is not "go to <screen>". */
export function parseGoto(text) {
  const t = deacc(polite(trim(str(text)).toLowerCase().replace(/[״"`]/g, '')));
  if (!t || t.length > 40) return null;
  const bare = t.replace(TAIL, '').trim();
  for (const [route, words] of BARE) if (words.some(w => deacc(w) === bare)) return route;
  if (!LEAD.test(bare)) return null;
  const core = bare.replace(LEAD, '').replace(TAIL, '').trim();
  const art = /^(?:ה|the |my |les |le |la |l'|mes |mon |ma )/;
  const cands = [core, core.replace(art, '')].map(x => x.trim()).filter(Boolean);
  for (const [route, words] of SCREENS) if (words.some(w => cands.includes(deacc(w)))) return route;
  for (const [route, words] of BARE) if (words.some(w => cands.includes(deacc(w)))) return route;
  return null;
}

/** The recommended way to say it, per language: "עברי ל" + screen word. */
export function gotoPhrase(route, lang) {
  const w = screenWord(route, lang);
  if (lang === 'fr') return 'va à ' + w;
  if (lang === 'en') return 'go to ' + w;
  return 'עברי ל' + w;
}

/** The recommended word for each screen in this language (for the help screen and the examples). */
export function screenWord(route, lang) {
  const row = SCREENS.find(r => r[0] === route); if (!row) return '';
  const w = row[1]; const isHe = x => /[֐-׿]/.test(x);
  if (lang === 'he') return w.find(isHe) || w[0];
  const latin = w.filter(x => !isHe(x));
  if (lang === 'fr') { const fr = { today: 'accueil', cases: 'dossiers', suppliers: 'fournisseurs', clients: 'clients', tasks: 'tâches', calls: 'appels', quotes: 'devis', money: 'finances', receipts: 'reçus', notes: 'notes', groups: 'groupes', search: 'recherche', settings: 'réglages', more: 'menu', lead: 'nouvelle demande', assist: 'commande', help: 'aide', dashboard: 'tableau de bord', calendar: 'agenda', board: 'tableau', notifications: 'rappels', templates: 'modèles', import: 'importer' }; return fr[route] || latin[0]; }
  return latin[0] || w[0];
}
