/* Three UI languages. Virginie picks one in settings; the page direction follows. */

export const LANGS = { he: 'עברית', fr: 'Français', en: 'English' };
export const SPEECH = { he: 'he-IL', fr: 'fr-FR', en: 'en-US' };

const D = {
  he: {
    app: 'באקה סאן', today: 'היום', cases: 'תיקים', clients: 'לקוחות', calls: 'שיחות', tasks: 'משימות', more: 'עוד',
    search: 'חיפוש', settings: 'הגדרות', newLead: 'פנייה חדשה', suppliers: 'ספקים', quotes: 'הצעות מחיר',
    // today
    upcoming: 'אירועים קרובים', followups: 'לקוחות שמחכים לתשובה', callsToday: 'שיחות להיום', tasksOpen: 'משימות פתוחות',
    nothingToday: 'שקט. אין שום דבר שמחכה.', inDays: 'בעוד {n} ימים', todayIs: 'היום', tomorrow: 'מחר', waited: 'מחכה {n} ימים',
    morningCopy: 'העתקת סיכום הבוקר', copied: 'הועתק',
    // lead
    leadIntro: 'הדביקי את ההודעה של הלקוח, או לחצי על המיקרופון וספרי מה הוא ביקש.',
    leadPlaceholder: 'ההודעה מהלקוח...', read: 'קריאה', dictate: 'הקלטה', stop: 'עצירה', listening: 'מקשיבה...',
    dictateLang: 'שפת ההקלטה', noSpeech: 'הדפדפן הזה לא תומך בהקלטה. בכרום באנדרואיד זה עובד.',
    missing: 'חסר', allThere: 'יש הכל', saveCase: 'שמירת התיק', askMissing: 'לשאול מה שחסר', saved: 'נשמר',
    // fields
    fDate: 'תאריך', fParticipants: 'משתתפים', fBudget: 'תקציב', fPlace: 'מקום', fKind: 'סוג אירוע', fPurpose: 'מטרה',
    fName: 'איש קשר', fClient: 'לקוח / חברה', fPhone: 'טלפון', fEmail: 'מייל', fLang: 'שפת הלקוח', fHours: 'שעות', fNotes: 'הערות',
    fStatus: 'סטטוס', fSource: 'ההודעה המקורית', fAudience: 'קהל', fType: 'סוג', fAddress: 'כתובת', fLegal: 'שם לחשבונית', fTaxId: 'ח.פ. / ע.מ.',
    // statuses (stored in Hebrew, shown translated)
    's_פנייה': 'פנייה', 's_הצעה נשלחה': 'הצעה נשלחה', 's_נסגר': 'נסגר', 's_בוצע': 'בוצע', 's_ירד': 'ירד',
    // case
    caseOf: 'תיק', openCases: 'פתוחים', allCases: 'הכל', noCases: 'אין תיקים עדיין. התחילי מפנייה חדשה.',
    whatsapp: 'וואטסאפ', call: 'חיוג', addCall: 'לתור החיוג', addTask: 'משימה', history: 'היסטוריה', edit: 'עריכה', save: 'שמירה', cancel: 'ביטול', delete: 'מחיקה',
    confirmDelete: 'למחוק? אי אפשר לשחזר.', waitingSince: 'מחכים לתשובה מאז', markWaiting: 'שלחתי, מחכה לתשובה', gotAnswer: 'הלקוח ענה',
    followupMsg: 'הודעת מעקב', questionsMsg: 'שאלות המשך', noPhone: 'אין טלפון בתיק',
    // clients
    noClients: 'אין לקוחות עדיין.', events: 'אירועים', won: 'נסגרו', lost: 'ירדו', totalNet: 'סה"כ לפני מע"מ', lastEvent: 'האירוע האחרון', newClient: 'לקוח חדש',
    // calls
    callQueue: 'תור חיוג', toCall: 'להתקשר', callbacks: 'לחזור אליהם', callsDone: 'נעשו', why: 'מה צריך ממנו', noCalls: 'אין שיחות בתור.',
    noAnswer: 'לא ענה', answered: 'ענה', callBack: 'לחזור', attempts: 'ניסיונות', newCall: 'שיחה חדשה', whoToCall: 'למי', callbackWhen: 'מתי לחזור',
    sendMsg: 'לשלוח הודעה', noAnswerMsg: 'ניסיתי להתקשר, לא הצלחתי לתפוס. מתי נוח לך שאחזור?',
    // tasks
    taskTitle: 'מה לעשות', taskDetails: 'בדיוק מה צריך', taskWho: 'מי מבצע', taskDue: 'עד מתי', taskSend: 'שליחה בוואטסאפ', taskDone: 'בוצע', taskOpen: 'פתוח', taskSent: 'נשלח',
    noTasks: 'אין משימות פתוחות.', newTask: 'משימה חדשה', forCase: 'לתיק', doneTasks: 'בוצעו', reopen: 'לפתוח מחדש',
    // search
    searchPh: 'שם, טלפון, מקום, מילה מההודעה...', noResults: 'לא נמצא כלום.',
    // settings
    uiLang: 'שפת האפליקציה', signer: 'חתימה בהודעות', biz: 'העסק', vat: 'מע"מ %', followupDays: 'ימים עד תזכורת ללקוח', backup: 'גיבוי',
    exportJson: 'הורדת קובץ גיבוי', importJson: 'השלמה מקובץ גיבוי', startData: 'נתוני התחלה', noWipeHint: 'אין באפליקציה מחיקה של כל המידע, בכוונה. מוחקים רק פריט אחד בכל פעם, ותמיד עם אישור. קובץ גיבוי רק משלים מה שחסר, לא דורס.', mergedBackup: 'הגיבוי שולב: {n} רשומות נוספו או עודכנו. כלום לא נמחק.', badBackup: 'הקובץ לא נראה כקובץ גיבוי של האפליקציה.', dataLocal: 'המידע שמור כרגע במכשיר הזה בלבד. בשלב הבא הוא עובר לענן.',
    invoiceTo: 'טלפון לבקשת חשבונית (רועי)', msgLang: 'שפת ברירת מחדל להודעות',
    demo: 'דוגמה', loadDemo: 'לטעון נתוני דוגמה', clearAll: 'למחוק את כל המידע', confirmClear: 'למחוק הכל? אין דרך חזרה.',
    // misc
    arabicBlocked: 'ההודעה מכילה אותיות ערביות, ולכן לא נפתחת. תקני את הטקסט.', none: 'אין', back: 'חזרה', add: 'הוספה', close: 'סגירה',
    date: 'תאריך', time: 'שעה', name: 'שם', phone: 'טלפון', note: 'הערה', all: 'הכל', new: 'חדש', open: 'פתיחה', openWa: 'ההודעה מוכנה. וואטסאפ נפתח, את לוחצת שליחה.',
    install: 'להוסיף למסך הבית: תפריט הדפדפן ← "הוספה למסך הבית".', of: 'של', unknownClient: 'לקוח בלי שם', people: 'משתתפים',
    soon: 'בשלב הבא', kindsHint: 'סוג האירוע', pickKind: 'בחירה...', langHe: 'עברית', langEn: 'אנגלית', langFr: 'צרפתית'
  },
  fr: {
    app: 'Baka Sun', today: 'Aujourd’hui', cases: 'Dossiers', clients: 'Clients', calls: 'Appels', tasks: 'Tâches', more: 'Plus',
    search: 'Recherche', settings: 'Réglages', newLead: 'Nouvelle demande', suppliers: 'Fournisseurs', quotes: 'Devis',
    upcoming: 'Événements à venir', followups: 'Clients en attente de réponse', callsToday: 'Appels du jour', tasksOpen: 'Tâches ouvertes',
    nothingToday: 'Rien en attente. Journée calme.', inDays: 'dans {n} jours', todayIs: 'aujourd’hui', tomorrow: 'demain', waited: 'attend depuis {n} jours',
    morningCopy: 'Copier le résumé du matin', copied: 'Copié',
    leadIntro: 'Collez le message du client, ou appuyez sur le micro et racontez ce qu’il demande.',
    leadPlaceholder: 'Le message du client...', read: 'Lire', dictate: 'Dicter', stop: 'Arrêter', listening: 'J’écoute...',
    dictateLang: 'Langue de dictée', noSpeech: 'Ce navigateur ne permet pas la dictée. Sur Chrome Android, ça marche.',
    missing: 'Manque', allThere: 'Tout y est', saveCase: 'Enregistrer le dossier', askMissing: 'Demander ce qui manque', saved: 'Enregistré',
    fDate: 'Date', fParticipants: 'Participants', fBudget: 'Budget', fPlace: 'Lieu', fKind: 'Type d’événement', fPurpose: 'Objectif',
    fName: 'Contact', fClient: 'Client / société', fPhone: 'Téléphone', fEmail: 'E-mail', fLang: 'Langue du client', fHours: 'Horaires', fNotes: 'Notes',
    fStatus: 'Statut', fSource: 'Message d’origine', fAudience: 'Public', fType: 'Type', fAddress: 'Adresse', fLegal: 'Nom pour facture', fTaxId: 'N° d’entreprise',
    's_פנייה': 'Demande', 's_הצעה נשלחה': 'Devis envoyé', 's_נסגר': 'Confirmé', 's_בוצע': 'Réalisé', 's_ירד': 'Annulé',
    caseOf: 'Dossier', openCases: 'Ouverts', allCases: 'Tous', noCases: 'Pas encore de dossier. Commencez par une nouvelle demande.',
    whatsapp: 'WhatsApp', call: 'Appeler', addCall: 'À la file d’appels', addTask: 'Tâche', history: 'Historique', edit: 'Modifier', save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer',
    confirmDelete: 'Supprimer ? Irréversible.', waitingSince: 'En attente de réponse depuis', markWaiting: 'Envoyé, j’attends la réponse', gotAnswer: 'Le client a répondu',
    followupMsg: 'Message de relance', questionsMsg: 'Questions complémentaires', noPhone: 'Pas de téléphone dans le dossier',
    noClients: 'Pas encore de client.', events: 'événements', won: 'confirmés', lost: 'annulés', totalNet: 'Total HT', lastEvent: 'Dernier événement', newClient: 'Nouveau client',
    callQueue: 'File d’appels', toCall: 'À appeler', callbacks: 'À rappeler', callsDone: 'Faits', why: 'Ce qu’il faut obtenir', noCalls: 'Aucun appel en attente.',
    noAnswer: 'Pas de réponse', answered: 'A répondu', callBack: 'Rappeler', attempts: 'essais', newCall: 'Nouvel appel', whoToCall: 'Qui', callbackWhen: 'Quand rappeler',
    sendMsg: 'Envoyer un message', noAnswerMsg: 'J’ai essayé de vous appeler sans succès. Quand puis-je vous rappeler ?',
    taskTitle: 'Quoi faire', taskDetails: 'Exactement ce qu’il faut', taskWho: 'Qui s’en charge', taskDue: 'Pour quand', taskSend: 'Envoyer par WhatsApp', taskDone: 'Fait', taskOpen: 'Ouverte', taskSent: 'Envoyée',
    noTasks: 'Aucune tâche ouverte.', newTask: 'Nouvelle tâche', forCase: 'Dossier', doneTasks: 'Faites', reopen: 'Rouvrir',
    searchPh: 'Nom, téléphone, lieu, un mot du message...', noResults: 'Rien trouvé.',
    uiLang: 'Langue de l’application', signer: 'Signature des messages', biz: 'L’entreprise', vat: 'TVA %', followupDays: 'Jours avant relance', backup: 'Sauvegarde',
    exportJson: 'Télécharger une sauvegarde', importJson: 'Compléter depuis une sauvegarde', startData: 'Données de départ', noWipeHint: 'Il n’y a pas de « tout effacer » dans l’application, volontairement. On ne supprime qu’un élément à la fois, toujours avec confirmation. Une sauvegarde complète ce qui manque, elle n’écrase rien.', mergedBackup: 'Sauvegarde intégrée : {n} enregistrements ajoutés ou mis à jour. Rien n’a été effacé.', badBackup: 'Ce fichier ne ressemble pas à une sauvegarde de l’application.', dataLocal: 'Les données sont pour l’instant sur cet appareil seulement. À l’étape suivante, elles passent dans le cloud.',
    invoiceTo: 'Téléphone pour demande de facture (Roy)', msgLang: 'Langue par défaut des messages',
    demo: 'Démo', loadDemo: 'Charger des données de démo', clearAll: 'Tout effacer', confirmClear: 'Tout effacer ? Sans retour possible.',
    arabicBlocked: 'Le message contient des lettres arabes et ne s’ouvre donc pas. Corrigez le texte.', none: 'Aucun', back: 'Retour', add: 'Ajouter', close: 'Fermer',
    date: 'Date', time: 'Heure', name: 'Nom', phone: 'Téléphone', note: 'Note', all: 'Tout', new: 'Nouveau', open: 'Ouvrir', openWa: 'Le message est prêt. WhatsApp s’ouvre, vous appuyez sur envoyer.',
    install: 'Pour l’ajouter à l’écran d’accueil : menu du navigateur → « Ajouter à l’écran d’accueil ».', of: 'de', unknownClient: 'Client sans nom', people: 'participants',
    soon: 'Prochaine étape', kindsHint: 'Type d’événement', pickKind: 'Choisir...', langHe: 'Hébreu', langEn: 'Anglais', langFr: 'Français'
  },
  en: {
    app: 'Baka Sun', today: 'Today', cases: 'Cases', clients: 'Clients', calls: 'Calls', tasks: 'Tasks', more: 'More',
    search: 'Search', settings: 'Settings', newLead: 'New inquiry', suppliers: 'Suppliers', quotes: 'Quotes',
    upcoming: 'Upcoming events', followups: 'Clients waiting for an answer', callsToday: 'Calls for today', tasksOpen: 'Open tasks',
    nothingToday: 'Quiet. Nothing is waiting.', inDays: 'in {n} days', todayIs: 'today', tomorrow: 'tomorrow', waited: 'waiting {n} days',
    morningCopy: 'Copy the morning summary', copied: 'Copied',
    leadIntro: 'Paste the client’s message, or tap the microphone and say what they asked for.',
    leadPlaceholder: 'The client’s message...', read: 'Read', dictate: 'Dictate', stop: 'Stop', listening: 'Listening...',
    dictateLang: 'Dictation language', noSpeech: 'This browser cannot dictate. On Chrome for Android it works.',
    missing: 'Missing', allThere: 'All there', saveCase: 'Save the case', askMissing: 'Ask what is missing', saved: 'Saved',
    fDate: 'Date', fParticipants: 'Guests', fBudget: 'Budget', fPlace: 'Venue', fKind: 'Event type', fPurpose: 'Purpose',
    fName: 'Contact', fClient: 'Client / company', fPhone: 'Phone', fEmail: 'E-mail', fLang: 'Client language', fHours: 'Hours', fNotes: 'Notes',
    fStatus: 'Status', fSource: 'Original message', fAudience: 'Audience', fType: 'Type', fAddress: 'Address', fLegal: 'Invoice name', fTaxId: 'Company no.',
    's_פנייה': 'Inquiry', 's_הצעה נשלחה': 'Quote sent', 's_נסגר': 'Confirmed', 's_בוצע': 'Done', 's_ירד': 'Dropped',
    caseOf: 'Case', openCases: 'Open', allCases: 'All', noCases: 'No cases yet. Start with a new inquiry.',
    whatsapp: 'WhatsApp', call: 'Call', addCall: 'To call queue', addTask: 'Task', history: 'History', edit: 'Edit', save: 'Save', cancel: 'Cancel', delete: 'Delete',
    confirmDelete: 'Delete? This cannot be undone.', waitingSince: 'Waiting for an answer since', markWaiting: 'Sent, waiting for a reply', gotAnswer: 'Client replied',
    followupMsg: 'Follow-up message', questionsMsg: 'Follow-up questions', noPhone: 'No phone on the case',
    noClients: 'No clients yet.', events: 'events', won: 'confirmed', lost: 'dropped', totalNet: 'Total before VAT', lastEvent: 'Last event', newClient: 'New client',
    callQueue: 'Call queue', toCall: 'To call', callbacks: 'Call back', callsDone: 'Done', why: 'What we need from them', noCalls: 'No calls in the queue.',
    noAnswer: 'No answer', answered: 'Answered', callBack: 'Call back', attempts: 'attempts', newCall: 'New call', whoToCall: 'Who', callbackWhen: 'When to call back',
    sendMsg: 'Send a message', noAnswerMsg: 'I tried calling but could not reach you. When is a good time to call back?',
    taskTitle: 'What to do', taskDetails: 'Exactly what is needed', taskWho: 'Who does it', taskDue: 'By when', taskSend: 'Send on WhatsApp', taskDone: 'Done', taskOpen: 'Open', taskSent: 'Sent',
    noTasks: 'No open tasks.', newTask: 'New task', forCase: 'Case', doneTasks: 'Done', reopen: 'Reopen',
    searchPh: 'Name, phone, place, a word from the message...', noResults: 'Nothing found.',
    uiLang: 'App language', signer: 'Signature in messages', biz: 'Business', vat: 'VAT %', followupDays: 'Days until client reminder', backup: 'Backup',
    exportJson: 'Download a backup file', importJson: 'Complete from a backup file', startData: 'Starting data', noWipeHint: 'There is no “delete everything” in this app, on purpose. Only one item at a time is deleted, always with a confirmation. A backup file only fills in what is missing; it never overwrites.', mergedBackup: 'Backup merged: {n} records added or updated. Nothing was deleted.', badBackup: 'This file does not look like a backup of the app.', dataLocal: 'Data is currently stored on this device only. In the next stage it moves to the cloud.',
    invoiceTo: 'Phone for invoice requests (Roy)', msgLang: 'Default language for messages',
    demo: 'Demo', loadDemo: 'Load demo data', clearAll: 'Delete all data', confirmClear: 'Delete everything? There is no way back.',
    arabicBlocked: 'The message contains Arabic letters, so it will not open. Fix the text.', none: 'None', back: 'Back', add: 'Add', close: 'Close',
    date: 'Date', time: 'Time', name: 'Name', phone: 'Phone', note: 'Note', all: 'All', new: 'New', open: 'Open', openWa: 'The message is ready. WhatsApp opens, you press send.',
    install: 'To add to the home screen: browser menu → “Add to Home screen”.', of: 'of', unknownClient: 'Unnamed client', people: 'guests',
    soon: 'Next stage', kindsHint: 'Event type', pickKind: 'Choose...', langHe: 'Hebrew', langEn: 'English', langFr: 'French'
  }
};

/* Event kinds are stored in Hebrew (the logic matches them); shown per language. */
export const KIND_LABELS = {
  'אירוע חברה': { fr: 'Événement d’entreprise', en: 'Company event' }, 'יום גיבוש': { fr: 'Journée team building', en: 'Team-building day' },
  'כנס': { fr: 'Conférence', en: 'Conference' }, 'חתונה': { fr: 'Mariage', en: 'Wedding' }, 'אירוע לעמותה': { fr: 'Événement associatif', en: 'Nonprofit event' },
  'משלחת או סיור': { fr: 'Délégation ou visite', en: 'Delegation or tour' }, 'אירוע לרשות או משרד ממשלתי': { fr: 'Événement public / municipal', en: 'Government or municipal event' },
  'יום הולדת': { fr: 'Anniversaire', en: 'Birthday' }, 'בר או בת מצווה': { fr: 'Bar / Bat mitsva', en: 'Bar / Bat mitzvah' }, 'מסיבה בבית פרטי': { fr: 'Fête privée à domicile', en: 'Private home party' },
  'ערב טעימות': { fr: 'Soirée dégustation', en: 'Tasting evening' }, 'אחר': { fr: 'Autre', en: 'Other' }
};

import { MORE } from './i18n-more.js';
Object.keys(MORE).forEach(k => Object.assign(D[k], MORE[k]));

let current = 'he';
export function lang() { return current; }
export function setLang(l) { current = D[l] ? l : 'he'; }
export function dir(l) { return (l || current) === 'he' ? 'rtl' : 'ltr'; }
export function t(key, vars) {
  let s = (D[current] && D[current][key]) || D.he[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.replace('{' + k + '}', vars[k]); });
  return s;
}
export function kindLabel(kind) {
  if (!kind) return '';
  if (current === 'he') return kind;
  const k = KIND_LABELS[kind];
  return (k && k[current]) || kind;
}
export function statusLabel(s) { return s ? t('s_' + s) : ''; }
export function langName(code) { return { he: t('langHe'), en: t('langEn'), fr: t('langFr') }[code] || code; }
