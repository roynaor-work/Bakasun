/* The second round of short questions and orders, about the newer modules: participants, budget, run of show,
   files, contracts, checklists, reminders, the event board and the history. Pure parsing, tested in tests/questions2.test.mjs.
   The screens act on the result (runAction in js/screens/actions.js); nothing here reads the store.
   Hebrew word boundaries: (?=\s|$), never \b. No Arabic letters anywhere. */
import { trim, str } from './core.js';

/* the event name, after "של / ל / באירוע / for / of / pour / de"; alt = without a Hebrew one-letter prefix (ל/ב) */
const OF = /^(?:של\s+|באירוע\s+של\s+|באירוע\s+|לאירוע\s+של\s+|לאירוע\s+|בתיק\s+של\s+|בתיק\s+|מול\s+|עבור\s+|for the event of\s+|for the event\s+|of the event\s+|for\s+|of\s+|on\s+|in\s+|at\s+|with\s+|pour l['’]événement de\s+|pour l['’]événement\s+|pour\s+|de l['’]|de la\s+|des\s+|du\s+|de\s+|d['’]|dans\s+|chez\s+|avec\s+|sur\s+|à\s+|au\s+|aux\s+)/i;
export function whoOf(rest) {
  let who = trim(str(rest)).replace(/[?!.]+$/, '').replace(OF, '').replace(/^(?:the|le|la|les|l['’])\s*/i, '').trim();
  who = who.replace(/^(?:ה?אירוע|ה?תיק|event|case|dossier|événement)\s+(?:של|of|de)?\s*/i, '').replace(/[?!.]+$/, '').trim();
  const alt = /^[לב][֐-׿]/.test(who) ? who.slice(1) : who;
  return { who, alt };
}

const Q = '[״"\'׳]?'; // "לו״ז" is written with a gershayim, a quote, or nothing
const LIST = '(?:רשימת\\s+(?:ה)?תיוג|רשימת\\s+(?:ה)?בדיקה|רשימה|צ[\'׳]?ק\\s*ליסט)';
const DOC_HE = '(תפריט|תפריטים|חוזה|הסכם|הצעת\\s+(?:ה)?מחיר|הצעה|הצעות|ביטוח|אישור\\s+(?:ה)?ביטוח|חשבונית|חשבוניות|קבלה|קבלות|תמונות|תמונה|צילומים|תוכנית|תכנית|לו' + Q + 'ז|קובץ|קבצים|מסמך|מסמכים|היתר|רישיון|רשיון)';
const DOC_EN = '(menus?|contracts?|agreements?|quotes?|quotations?|insurance|invoices?|receipts?|photos?|pictures?|plans?|schedule|files?|documents?|permits?|licen[cs]es?)';
const DOC_FR = '(menus?|contrats?|devis|assurance|factures?|reçus?|recus?|photos?|plans?|programme|fichiers?|documents?|permis|autorisations?)';

const R = [
  // participants
  ['partAdd', new RegExp('^(?:הוסיפי|תוסיפי|הוסף|רשמי|תרשמי)\\s+(?:משתתף|משתתפת|משתתפים|משתתפות|אורח|אורחת|אורחים)\\s+(?:ל|ב|לרשימה\\s+של\\s+|לרשימת\\s+)(.+?)\\s*:\\s*([\\s\\S]+)$|^(?:add|register|put)\\s+(?:a\\s+|the\\s+)?(?:participants?|guests?|attendees?)\\s+(?:to|for|on)\\s+(.+?)\\s*:\\s*([\\s\\S]+)$|^(?:ajoute|inscris)\\s+(?:un|une|des|le|la|les)?\\s*(?:participants?|invités?|invitées?)\\s+(?:à|a|pour|dans|sur)\\s+(.+?)\\s*:\\s*([\\s\\S]+)$', 'i')],
  ['rsvpCount', /^כמה\s+(?:כבר\s+)?(?:אישרו(?:\s+הגעה)?|אנשים\s+אישרו(?:\s+הגעה)?|מגיעים|מגיעות|יגיעו|אנשים\s+מגיעים|משתתפים\s+מגיעים|אישורי\s+הגעה\s+יש)\s+(.+)$|^how\s+many\s+(?:have\s+|people\s+)?(?:confirmed|are\s+coming|rsvp[’']?d|rsvps?)\s+(?:for|to)?\s*(.+)$|^combien\s+(?:ont\s+)?(?:confirmé|confirment|viennent|de\s+confirmations?)\s+(?:pour|à)?\s*(.+)$/i],
  ['rsvpMissing', /^מי\s+(?:עוד\s+|עדיין\s+)?לא\s+(?:אישר|אישרו|אישרה)(?:\s+הגעה)?\s+(.+)$|^who\s+(?:has\s+not|hasn['’]t|have\s+not|haven['’]t|did\s+not|didn['’]t|still\s+hasn['’]t)\s+(?:confirmed|rsvp[’']?d)\s+(?:for|to)?\s*(.+)$|^qui\s+n['’]a\s+pas\s+(?:encore\s+)?confirmé\s+(?:pour|à)?\s*(.+)$/i],
  ['hotelList', /^(?:(?:תכיני|הכיני|תני\s+לי|תראי\s+לי|הראי\s+לי)\s+(?:את\s+)?)?(?:ה)?(?:רשימה\s+למלון|רשימת\s+(?:ה)?חדרים|רשימת\s+(?:ה)?לינה|רשימה\s+ללינה)\s+(?:של\s+|ל|ב)?(.+)$|^(?:(?:prepare|make|show\s+me|give\s+me)\s+)?(?:the\s+)?(?:rooming\s+list|hotel\s+list|room\s+list)\s+(?:for|of)\s+(.+)$|^(?:(?:prépare|prepare|montre-moi|donne-moi)\s+)?(?:la\s+)?(?:rooming\s+list|liste\s+(?:pour\s+)?l['’]hôtel|liste\s+des\s+chambres)\s+(?:pour|de|d['’])\s*(.+)$/i],
  // budget
  ['budgetProfit', /^(?:מה|כמה)\s+(?:ה)?(?:רווח|רווחיות|מרווח|מרג['׳]?ין)\s+(.+)$|^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:margin|profit|profitability)|how\s+much\s+(?:do\s+we|will\s+we)\s+(?:make|earn))\s+(?:on|of|for|from)?\s*(.+)$|^(?:quelle\s+est\s+la\s+(?:marge|rentabilité)|combien\s+(?:on\s+gagne|gagne-t-on))\s+(?:sur|de|pour|d['’])?\s*(.+)$/i],
  ['budgetCost', /^(?:כמה|מה)\s+(?:עולים|עולה|עולות|עלות|העלות\s+של)\s+(?:לנו\s+|לי\s+)?(?:ה)?(?:ספקים|ספק|ספקי)\s+(.+)$|^(?:how\s+much\s+(?:do|are)\s+(?:the\s+)?suppliers\s+cost(?:ing)?(?:\s+us)?|what(?:'s|\s+is)\s+(?:the\s+)?(?:supplier|suppliers['’]?)\s+cost)\s+(?:for|of|on|in)?\s*(.+)$|^(?:combien\s+(?:nous\s+)?coûtent\s+les\s+fournisseurs|quel\s+est\s+le\s+coût\s+(?:des\s+)?fournisseurs)\s+(?:pour|de|sur|d['’])?\s*(.+)$/i],
  ['budgetSchedule', /^(?:מה|תראי\s+לי\s+את|הראי\s+לי\s+את)\s+(?:ה)?לוח\s+(?:ה)?תשלומים\s+(.+)$|^(?:what(?:'s|\s+is)\s+(?:the\s+)?payment\s+schedule|show\s+me\s+the\s+payment\s+schedule)\s+(?:for|of)?\s*(.+)$|^(?:quel\s+est\s+l['’]échéancier|montre-moi\s+l['’]échéancier)\s+(?:de|pour|d['’])?\s*(.+)$/i],
  ['budgetOpen', /^(?:כמה|מה)\s+(?:עוד\s+)?(?:פתוח|נשאר)\s+(?:לתשלום|לשלם|לגבות|לקבל|בתשלומים|מול\s+הלקוח)\s+(.+)$|^(?:how\s+much|what)\s+(?:is\s+)?(?:still\s+)?(?:open|outstanding|left\s+to\s+(?:pay|collect)|unpaid|due)\s+(?:for|on|of|in)?\s*(.+)$|^(?:combien\s+(?:reste|reste-t-il|il\s+reste)(?:\s+à\s+(?:payer|encaisser))?|qu['’]est-ce\s+qui\s+reste\s+à\s+payer)\s+(?:pour|sur|de|d['’])?\s*(.+)$/i],
  // run of show
  ['rsNow', new RegExp('^(?:מה\\s+(?:קורה\\s+)?עכשיו(?:\\s+(?:ב|לפי\\s+|על\\s+פי\\s+)(?:ה)?לו' + Q + 'ז)?|מה\\s+(?:ה)?(?:שלב|בלוק)\\s+(?:הנוכחי|עכשיו)|איפה\\s+אנחנו\\s+בלו' + Q + 'ז)\\s*$|^(?:what(?:\'s|\\s+is)\\s+(?:on\\s+|happening\\s+)?now(?:\\s+(?:on|in)\\s+the\\s+(?:run\\s*sheet|schedule|run\\s+of\\s+show|programme))?|where\\s+are\\s+we\\s+(?:on|in)\\s+the\\s+(?:run\\s*sheet|schedule))\\s*$|^(?:qu[\'’]est-ce\\s+qu[\'’]il\\s+y\\s+a|qu[\'’]est-ce\\s+qui\\s+se\\s+passe|on\\s+en\\s+est\\s+où)\\s+maintenant(?:\\s+(?:au|dans\\s+le|sur\\s+le)\\s+(?:programme|déroulé))?\\s*$', 'i')],
  ['rsNext', new RegExp('^(?:מה\\s+(?:ה)?(?:הבא|בא)(?:\\s+(?:בתור|אחר\\s+כך))?(?:\\s+ב(?:ה)?לו' + Q + 'ז)?|מה\\s+(?:ה)?(?:שלב|בלוק)\\s+הבא(?:\\s+בלו' + Q + 'ז)?)\\s*$|^(?:what(?:\'s|\\s+is)\\s+(?:up\\s+)?next(?:\\s+(?:on|in)\\s+the\\s+(?:run\\s*sheet|schedule|run\\s+of\\s+show|programme))?)\\s*$|^(?:(?:qu[\'’]est-ce\\s+qu[\'’]il\\s+y\\s+a|c[\'’]est\\s+quoi)\\s+)?(?:après|ensuite|la\\s+suite)(?:\\s+(?:au|dans\\s+le|sur\\s+le)\\s+(?:programme|déroulé))?\\s*$', 'i')],
  ['callSheet', /^(?:(?:תכיני|הכיני|תשלחי|שלחי|תני|תראי\s+לי|prepare|make|send|show\s+me|prépare|prepare|envoie|montre-moi)\s+)?(?:את\s+|the\s+|la\s+|une\s+)?(?:דף\s+(?:ה)?קריאה|call\s*sheet|feuille\s+de\s+route)\s+(?:ל|של\s+|for\s+|of\s+|to\s+|pour\s+|de\s+|d['’]|à\s+)(.+?)(?:\s+(?:ל|לאירוע\s+(?:של\s+)?|באירוע\s+(?:של\s+)?|של\s+|for\s+(?:the\s+event\s+(?:of\s+)?)?|pour\s+(?:l['’]événement\s+(?:de\s+)?)?|de\s+|d['’]|à\s+)(.+))?$/i],
  ['live', /^(?:(?:עברי|תעברי|עבור|לכי|תלכי|תפתחי|פתחי|הפעילי|תפעילי)\s+(?:ל|את\s+)?)?(?:מצב\s+)?יום\s+האירוע(?:\s+(?:של\s+|ל)(.+))?$|^(?:(?:go\s+to|switch\s+to|open|start)\s+(?:the\s+)?)?(?:day[- ]of(?:\s+mode)?|event\s+day\s+mode|live\s+mode)(?:\s+(?:for|of)\s+(.+))?$|^(?:(?:passe|va|ouvre|lance)\s+(?:en|au|le)\s+)?mode\s+jour\s+j(?:\s+(?:pour|de|d['’])\s*(.+))?$/i],
  // files
  ['docsMissing', /^(?:מה|אילו|איזה)\s+(?:עוד\s+)?(?:חסר|חסרים)\s+(?:לי\s+)?(?:ב|מ)?(?:ה)?(?:מסמכים|קבצים|ניירת)\s+(.+)$|^(?:מה|אילו|איזה)\s+(?:מסמכים|קבצים)\s+(?:עוד\s+)?חסרים\s+(.+)$|^(?:what|which)\s+(?:documents?|files?|papers?)\s+(?:are|is)\s+(?:still\s+)?missing\s+(?:for|in|on|of)?\s*(.+)$|^what(?:'s|\s+is)\s+missing\s+(?:in|from)\s+the\s+(?:documents?|files?|papers?)\s+(?:of|for)?\s*(.+)$|^(?:quels?\s+(?:documents?|fichiers?)\s+manquent?|qu['’]est-ce\s+qui\s+manque\s+dans\s+les\s+(?:documents?|fichiers?)|que\s+manque-t-il\s+dans\s+les\s+(?:documents?|fichiers?))\s+(?:pour|à|de|d['’]|dans)?\s*(.+)$/i],
  ['fileFind', new RegExp('^(?:איפה|היכן|תמצאי\\s+לי|תמצאי|מצאי)\\s+(?:את\\s+)?(?:ה)?' + DOC_HE + '\\s+(?:של|ל|ב|מ)\\s*(.+)$|^(?:where(?:\'s|\\s+is|\\s+are)|find(?:\\s+me)?|show\\s+me)\\s+(?:the\\s+)?' + DOC_EN + '\\s+(?:of|for|from|in)\\s+(.+)$|^(?:où\\s+(?:est|sont)|trouve(?:-moi)?|montre-moi)\\s+(?:le|la|les|l[\'’])?\\s*' + DOC_FR + '\\s+(?:de|du|pour|d[\'’])\\s*(.+)$', 'i')],
  // contracts
  ['contractMissing', /^(?:מה|איזה|אילו)\s+(?:עוד\s+)?(?:חסר|חסרים)\s+(?:לי\s+)?(?:ל|ב)(?:ה)?(?:חוזה|הסכם)\s+(.+)$|^what(?:'s|\s+is)\s+(?:still\s+)?missing\s+(?:for|in|on|from)\s+the\s+(?:contract|agreement)\s+(?:of|for|with)?\s*(.+)$|^(?:que\s+manque-t-il|qu['’]est-ce\s+qui\s+manque|qu['’]est-ce\s+qu['’]il\s+manque)\s+(?:au|dans\s+le|pour\s+le|sur\s+le)\s+contrat\s+(?:de|pour|avec|d['’])?\s*(.+)$/i],
  ['contractSigned', /^(?:האם\s+)?(?:ה)?(?:חוזה|הסכם)\s+(?:של\s+|עם\s+|ל)(.+?)\s+(?:כבר\s+)?(?:חתום|נחתם)$|^(?:האם\s+)?(.+?)\s+(?:כבר\s+)?(?:חתם|חתמו|חתמה)\s+(?:על\s+)?(?:ה)?(?:חוזה|הסכם)$|^(?:is|has)\s+the\s+(?:contract|agreement)\s+(?:of|for|with)\s+(.+?)\s+(?:been\s+)?signed$|^(?:did|has)\s+(.+?)\s+sign(?:ed)?\s+the\s+(?:contract|agreement)$|^(?:est-ce\s+que\s+)?le\s+contrat\s+(?:de|avec|pour|d['’])\s*(.+?)\s+est(?:-il)?\s+signé$|^(.+?)\s+a(?:-t-il|-t-elle)?\s+signé\s+le\s+contrat$/i],
  // checklists
  ['checklistWeek', new RegExp('^(?:מה\\s+(?:יש\\s+)?(?:לשבוע\\s+הקרוב|השבוע|לשבוע\\s+הזה|בשבוע\\s+הקרוב|לימים\\s+הקרובים|דחוף)|מה\\s+(?:צריך|יש)\\s+לעשות\\s+(?:השבוע|בשבוע\\s+הקרוב))\\s+ב(?:ה)?' + LIST + '\\s+(.+)$|^what(?:\'s|\\s+is)\\s+(?:due|up|on|left)\\s+(?:this|next|for\\s+the\\s+coming|for\\s+this)\\s+(?:week|days)\\s+(?:on|in)\\s+the\\s+(?:checklist|check-list|list)\\s+(?:of|for)?\\s*(.+)$|^(?:qu[\'’]est-ce\\s+qu[\'’]il\\s+y\\s+a|qu[\'’]y\\s+a-t-il|que\\s+faire)\\s+(?:pour\\s+)?(?:cette\\s+semaine|la\\s+semaine\\s+prochaine|ces\\s+prochains\\s+jours)\\s+(?:sur|dans)\\s+la\\s+(?:check-?list|liste)\\s+(?:de|pour|d[\'’])?\\s*(.+)$', 'i')],
  ['checklistLeft', new RegExp('^(?:מה\\s+(?:עוד\\s+)?(?:נשאר|פתוח|לא\\s+סומן|לא\\s+בוצע)|מה\\s+(?:ה)?מצב)\\s+(?:לי\\s+)?ב(?:ה)?' + LIST + '\\s+(.+)$|^what(?:\'s|\\s+is)\\s+(?:still\\s+)?(?:left|open|remaining|not\\s+done)\\s+(?:on|in)\\s+the\\s+(?:checklist|check-list|list)\\s+(?:of|for)?\\s*(.+)$|^(?:que\\s+reste-t-il|qu[\'’]est-ce\\s+qui\\s+reste|qu[\'’]est-ce\\s+qu[\'’]il\\s+reste)\\s+(?:sur|dans)\\s+la\\s+(?:check-?list|liste(?:\\s+de\\s+contrôle)?)\\s+(?:de|pour|d[\'’])?\\s*(.+)$', 'i')],
  // reminders
  ['remindersRead', /^(?:סמני|תסמני|סימני)\s+(?:את\s+)?(?:כל\s+)?(?:ה)?(?:תזכורות|התראות)\s+(?:כ)?(?:נקראו|נקרא|טופלו)$|^mark\s+(?:all\s+)?(?:the\s+|my\s+)?(?:reminders|notifications)\s+(?:as\s+)?(?:read|seen)$|^marque\s+(?:tous\s+)?(?:les|mes)\s+(?:rappels|notifications)\s+comme\s+lus?$/i],
  ['urgent', /^(?:מה\s+דחוף(?:\s+(?:עכשיו|היום))?|יש\s+משהו\s+דחוף|מה\s+הדחוף)$|^(?:what(?:'s|\s+is)\s+urgent(?:\s+(?:now|today))?|anything\s+urgent)$|^(?:qu['’]est-ce\s+qui\s+est\s+urgent|quoi\s+d['’]urgent|c['’]est\s+quoi\s+l['’]urgent|urgences?)$/i],
  ['reminders', /^(?:מה\s+(?:ה)?(?:תזכורות|התראות)(?:\s+שלי)?|(?:ה)?(?:תזכורות|התראות)\s+שלי|יש\s+(?:לי\s+)?תזכורות)$|^(?:what\s+are\s+my\s+(?:reminders|notifications|alerts)|my\s+(?:reminders|notifications)|any\s+reminders)$|^(?:quels\s+sont\s+mes\s+rappels|mes\s+rappels|qu['’]est-ce\s+que\s+j['’]ai\s+comme\s+rappels|il\s+y\s+a\s+des\s+rappels)$/i],
  // event board
  ['caseMove', /^(?:העבירי|תעבירי|העברי|שני|תשני)\s+(?:את\s+)?(?:ה)?(?:פנייה\s+של\s+|פניה\s+של\s+|תיק\s+של\s+|אירוע\s+של\s+)?(.+?)\s+ל(?:סטטוס\s+|מצב\s+|עמודה\s+|עמודת\s+)?"?(פנייה|פניה|הצעה\s+נשלחה|נשלחה\s+הצעה|נסגר|סגור|בוצע|ירד|ירדה|אבוד)"?$|^(?:ה)?(?:פנייה|פניה|תיק|אירוע)\s+(?:של\s+)?(.+?)\s+(נסגרה|נסגר|ירדה|ירד|בוצעה|בוצע|התבטלה|בוטלה)$|^(?:move|put|set)\s+(?:the\s+(?:lead|case|event)\s+(?:of\s+)?)?(.+?)\s+(?:to|as|in)\s+(?:status\s+|column\s+)?(lead|quoted|quote\s+sent|won|closed|done|lost|dropped)$|^(?:the\s+)?(?:lead|case|event|enquiry|inquiry)\s+(?:of\s+)?(.+?)\s+(?:is|was)\s+(won|closed|lost|dropped|done|cancelled|canceled)$|^(?:passe|mets|déplace)\s+(?:le\s+(?:dossier|lead)\s+(?:de\s+)?)?(.+?)\s+(?:en|à|dans|au)\s+(?:statut\s+|colonne\s+)?"?(demande|devis\s+envoyé|gagné|conclu|fait|terminé|perdu|abandonné)"?$|^(?:le|la)\s+(?:dossier|demande|lead)\s+(?:de\s+)?(.+?)\s+est\s+(gagnée?|conclue?|perdue?|abandonnée?|faite?|terminée?)$/i],
  // history
  ['history', /^(?:מה\s+(?:השתנה|עודכן|התעדכן|השתנו|קרה)|אילו\s+שינויים(?:\s+היו)?|מה\s+(?:ה)?היסטוריה)(?:\s+(היום|אתמול|לאחרונה|השבוע))?(?:\s+(?:ב|של\s+|באירוע\s+|בתיק\s+)(.+?))?(?:\s+(היום|אתמול|לאחרונה|השבוע))?$|^(?:what\s+(?:has\s+)?changed|what(?:'s|\s+is)\s+new|any\s+changes|show\s+(?:me\s+)?the\s+history)(?:\s+(today|yesterday|recently|lately|this\s+week))?(?:\s+(?:in|on|for|with)\s+(.+?))?(?:\s+(today|yesterday|recently|lately|this\s+week))?$|^(?:qu['’]est-ce\s+qui\s+a\s+changé|qu['’]est-ce\s+qui\s+a\s+été\s+modifié|quoi\s+de\s+neuf|quels\s+changements|montre(?:-moi)?\s+l['’]historique)(?:\s+(aujourd['’]hui|hier|récemment|recemment|dernièrement|cette\s+semaine))?(?:\s+(?:dans|sur|pour|de|d['’]|chez)\s*(.+?))?(?:\s+(aujourd['’]hui|hier|récemment|recemment|dernièrement|cette\s+semaine))?$/i]
];

const STATUS_WORDS = {
  'פנייה': 'פנייה', 'פניה': 'פנייה', 'הצעה נשלחה': 'הצעה נשלחה', 'נשלחה הצעה': 'הצעה נשלחה', 'נסגר': 'נסגר', 'סגור': 'נסגר', 'נסגרה': 'נסגר', 'בוצע': 'בוצע', 'בוצעה': 'בוצע',
  'ירד': 'ירד', 'ירדה': 'ירד', 'אבוד': 'ירד', 'התבטלה': 'ירד', 'בוטלה': 'ירד',
  lead: 'פנייה', quoted: 'הצעה נשלחה', 'quote sent': 'הצעה נשלחה', won: 'נסגר', closed: 'נסגר', done: 'בוצע', lost: 'ירד', dropped: 'ירד', cancelled: 'ירד', canceled: 'ירד',
  demande: 'פנייה', 'devis envoyé': 'הצעה נשלחה', gagné: 'נסגר', gagnée: 'נסגר', conclu: 'נסגר', conclue: 'נסגר', fait: 'בוצע', faite: 'בוצע', terminé: 'בוצע', terminée: 'בוצע', perdu: 'ירד', perdue: 'ירד', abandonné: 'ירד', abandonnée: 'ירד'
};
const WHEN_WORDS = { 'היום': 'today', today: 'today', "aujourd'hui": 'today', 'aujourd’hui': 'today', 'אתמול': 'yesterday', yesterday: 'yesterday', hier: 'yesterday', 'השבוע': 'week', 'this week': 'week', 'cette semaine': 'week',
  'לאחרונה': 'recent', recently: 'recent', lately: 'recent', 'récemment': 'recent', recemment: 'recent', 'dernièrement': 'recent' };
const norm = s => trim(str(s)).toLowerCase().replace(/\s+/g, ' ');

/** {kind, who, alt, ...} or null. `who`/`alt` name the event (alt = without a Hebrew ל/ב prefix); the screen resolves it. */
export function parseAction2(text) {
  const raw = str(text).replace(/^\s+|\s+$/g, ''); // line breaks stay: a pasted list of participants is several lines
  if (!raw || raw.length > 600) return null;
  const t = raw.replace(/[?!.]+$/, '').trim();
  if (t.length > 400) return null;
  for (const [kind, re] of R) {
    const m = re.exec(t); if (!m) continue;
    const g = m.slice(1).filter(x => x != null);
    const out = { kind };
    // the pasted list keeps its line breaks (core.trim would fold them)
    if (kind === 'partAdd') { Object.assign(out, whoOf(g[0])); out.text = str(g[1]).replace(/^\s+|\s+$/g, '').replace(/\s*(?:סיימתי|terminé|done)\s*$/i, ''); return out; }
    if (kind === 'rsNow' || kind === 'rsNext' || kind === 'remindersRead' || kind === 'urgent' || kind === 'reminders') return out;
    if (kind === 'live') { if (g[0]) Object.assign(out, whoOf(g[0])); return out; }
    if (kind === 'callSheet') { out.who = trim(g[0] || ''); if (g[1]) { const e = whoOf(g[1]); out.event = e.who; out.eventAlt = e.alt; } out.raw = trim(m[0].replace(/^.*?(?:דף\s+(?:ה)?קריאה|call\s*sheet|feuille\s+de\s+route)\s+(?:ל|של\s+|for\s+|of\s+|to\s+|pour\s+|de\s+|d['’]|à\s+)/i, '')); return out; }
    if (kind === 'fileFind') { out.what = trim(g[0] || ''); Object.assign(out, whoOf(g[1])); return out; }
    if (kind === 'caseMove') { Object.assign(out, whoOf(g[0])); out.status = STATUS_WORDS[norm(g[1])] || ''; if (!out.status) return null; return out; }
    if (kind === 'history') {
      const words = g.map(norm); const when = words.map(w => WHEN_WORDS[w]).find(Boolean) || 'recent';
      const name = g.find(x => !WHEN_WORDS[norm(x)]);
      out.when = when; Object.assign(out, name ? whoOf(name) : { who: '', alt: '' }); return out;
    }
    Object.assign(out, whoOf(g[0]));
    return out;
  }
  return null;
}

/** The stored status word for a status she said, or ''. */
export function statusWord(w) { return STATUS_WORDS[norm(w)] || ''; }
