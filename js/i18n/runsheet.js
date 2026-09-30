/* Texts of the runsheet module (run of show, call sheets, day-of mode): he / fr / en. No Arabic letters anywhere. */
export const RUNSHEET = {
  he: {
    tRunsheet: 'לו״ז יום האירוע', rsTitle: 'לו״ז יום האירוע', rsEmpty: 'עדיין אין לו״ז ליום האירוע. התחילי מתבנית, ייבאי את הלו״ז הקיים או הוסיפי בלוק.',
    rsAdd: 'בלוק', rsAddDay: 'יום', rsTemplate: 'תבנית ליום', rsImport: 'ייבוא מהלו״ז הקיים', rsImported: 'נוספו {n} בלוקים מהלו״ז', rsImportedNone: 'הכל כבר יובא, לא נוסף כלום',
    rsCallSheet: 'דף קריאה ל…', rsCallSheetFor: 'דף קריאה ל{who}', rsWhole: 'כל הלו״ז', rsToCal: 'ליומן', rsLive: 'מצב יום האירוע', rsPdf: 'PDF', rsWaPick: 'וואטסאפ (לבחור צ׳אט)', rsMail: 'מייל', rsCopy: 'העתקה',
    rsDelay15: '+15 דק׳ איחור מכאן', rsDelayed: 'הלו״ז זז ב-{n} דקות', rsShifted: 'הוזז', rsNoPeople: 'אין עדיין אחראים בבלוקים. כתבי בכל בלוק מי אחראי.',
    rsBlock: 'בלוק', rsEditBlock: 'עריכת בלוק', rsStart: 'התחלה', rsEnd: 'סיום', rsWhat: 'מה קורה', rsKind: 'סוג', rsPlace: 'איפה', rsOwner: 'אחראי (ספק או איש צוות)', rsPhone: 'טלפון', rsCue: 'מה צריך להיות מוכן', rsNotes: 'הערות', rsStatus: 'מצב', rsDayNotes: 'הגעה, חניה והערות ליום',
    rsKindArrival: 'הגעה', rsKindSession: 'מושב', rsKindMeal: 'ארוחה', rsKindTransport: 'הסעה', rsKindBreak: 'הפסקה', rsKindSetup: 'הקמה', rsKindStrike: 'פירוק', rsKindOther: 'אחר',
    rsPlanned: 'מתוכנן', rsDone: 'בוצע', rsLate: 'באיחור', rsDeleteBlock: 'למחוק את "{title}"?', rsDeleted: 'הבלוק נמחק', rsDeleteDay: 'למחוק את היום {date} על כל הבלוקים שלו?',
    rsOverlapOwner: '{who} משובץ בשני מקומות בו-זמנית: "{a}" ({ta}) ו"{b}" ({tb})', rsOverlapPlace: 'שני דברים ב{who} באותו זמן: "{a}" ({ta}) ו"{b}" ({tb})', rsNoOverlap: 'אין התנגשויות',
    rsLangOf: 'שפה', rsPickWho: 'למי', rsWaTo: 'וואטסאפ ל{who}', rsNoPhoneFor: 'אין טלפון ל{who}, בחרי צ׳אט בוואטסאפ', rsNoEmailFor: 'אין מייל, הטקסט הועתק',
    rsCalDone: 'קובץ היומן מוכן. פותחים אותו ביומן של הטלפון.', rsCalNothing: 'אין בלוקים עם שעה',
    rsNow: 'עכשיו', rsNext: 'הבא', rsNothingNow: 'אין בלוק פעיל כרגע', rsAllDone: 'כל הלו״ז בוצע. כל הכבוד!', rsElapsed: 'עברו {n} דק׳', rsRemaining: 'נשארו {n} דק׳', rsInMin: 'בעוד {n} דק׳', rsLateBy: 'באיחור של {n} דק׳', rsRunningLate: 'באיחור',
    rsMarkDone: 'בוצע', rsDelay10: 'איחור +10', rsDelay15s: 'איחור +15', rsCall: 'התקשרי ל{who}', rsPhones: 'טלפונים', rsExit: 'יציאה', rsLiveHint: 'המסך נשאר דולק. מתעדכן כל 30 שניות.', rsWake: 'המסך יישאר דולק', rsNoDay: 'אין לו״ז ליום הזה', rsPickDay: 'יום',
    rsTplSeminar: 'סמינר / יום עיון', rsTplConference: 'כנס', rsTplDelegation: 'משלחת', rsTplDinner: 'ארוחת ערב / אירוע ערב',
    rsPrintTitle: 'לו״ז יום האירוע', rsPrintClient: 'לקוח', rsPrintEvent: 'אירוע', rsPrintDate: 'תאריך', rsPrintPlace: 'מקום', rsPrintTime: 'שעה', rsPrintWhat: 'מה', rsPrintWhere: 'איפה', rsPrintWho: 'אחראי', rsPrintCue: 'מה צריך להיות מוכן', rsPrintNotes: 'הערות', rsPrintProducer: 'הפקה', rsPrintHint: 'נפתח חלון הדפסה: בוחרים "שמירה כ-PDF".', rsToParticipants: 'משתתפים: {n} מגיעים מתוך {m}'
  },
  fr: {
    tRunsheet: 'Déroulé du jour J', rsTitle: 'Déroulé du jour J', rsEmpty: 'Pas encore de déroulé. Partez d’un modèle, importez le planning existant ou ajoutez un bloc.',
    rsAdd: 'Bloc', rsAddDay: 'Jour', rsTemplate: 'Modèle de journée', rsImport: 'Importer le planning existant', rsImported: '{n} blocs ajoutés depuis le planning', rsImportedNone: 'Tout était déjà importé, rien d’ajouté',
    rsCallSheet: 'Feuille de route pour…', rsCallSheetFor: 'Feuille de route pour {who}', rsWhole: 'Tout le déroulé', rsToCal: 'Au calendrier', rsLive: 'Mode jour J', rsPdf: 'PDF', rsWaPick: 'WhatsApp (choisir la discussion)', rsMail: 'E-mail', rsCopy: 'Copier',
    rsDelay15: '+15 min de retard à partir d’ici', rsDelayed: 'Le déroulé a été décalé de {n} min', rsShifted: 'Décalé', rsNoPeople: 'Aucun responsable dans les blocs. Indiquez qui est responsable de chaque bloc.',
    rsBlock: 'Bloc', rsEditBlock: 'Modifier le bloc', rsStart: 'Début', rsEnd: 'Fin', rsWhat: 'Quoi', rsKind: 'Type', rsPlace: 'Où', rsOwner: 'Responsable (fournisseur ou équipe)', rsPhone: 'Téléphone', rsCue: 'Ce qui doit être prêt', rsNotes: 'Notes', rsStatus: 'État', rsDayNotes: 'Accès, parking et notes du jour',
    rsKindArrival: 'Arrivée', rsKindSession: 'Session', rsKindMeal: 'Repas', rsKindTransport: 'Transport', rsKindBreak: 'Pause', rsKindSetup: 'Montage', rsKindStrike: 'Démontage', rsKindOther: 'Autre',
    rsPlanned: 'Prévu', rsDone: 'Fait', rsLate: 'En retard', rsDeleteBlock: 'Supprimer « {title} » ?', rsDeleted: 'Bloc supprimé', rsDeleteDay: 'Supprimer le jour {date} et tous ses blocs ?',
    rsOverlapOwner: '{who} est à deux endroits en même temps : « {a} » ({ta}) et « {b} » ({tb})', rsOverlapPlace: 'Deux choses à {who} en même temps : « {a} » ({ta}) et « {b} » ({tb})', rsNoOverlap: 'Aucun conflit',
    rsLangOf: 'Langue', rsPickWho: 'Pour qui', rsWaTo: 'WhatsApp à {who}', rsNoPhoneFor: 'Pas de téléphone pour {who}, choisissez la discussion WhatsApp', rsNoEmailFor: 'Pas d’e-mail, le texte a été copié',
    rsCalDone: 'Le fichier calendrier est prêt. Ouvrez-le dans le calendrier du téléphone.', rsCalNothing: 'Aucun bloc avec une heure',
    rsNow: 'Maintenant', rsNext: 'Ensuite', rsNothingNow: 'Aucun bloc en cours', rsAllDone: 'Tout le déroulé est fait. Bravo !', rsElapsed: '{n} min écoulées', rsRemaining: '{n} min restantes', rsInMin: 'dans {n} min', rsLateBy: 'en retard de {n} min', rsRunningLate: 'En retard',
    rsMarkDone: 'Fait', rsDelay10: 'Retard +10', rsDelay15s: 'Retard +15', rsCall: 'Appeler {who}', rsPhones: 'Téléphones', rsExit: 'Quitter', rsLiveHint: 'L’écran reste allumé. Mise à jour toutes les 30 secondes.', rsWake: 'L’écran restera allumé', rsNoDay: 'Pas de déroulé pour ce jour', rsPickDay: 'Jour',
    rsTplSeminar: 'Séminaire', rsTplConference: 'Conférence', rsTplDelegation: 'Délégation', rsTplDinner: 'Dîner / soirée',
    rsPrintTitle: 'Déroulé du jour J', rsPrintClient: 'Client', rsPrintEvent: 'Événement', rsPrintDate: 'Date', rsPrintPlace: 'Lieu', rsPrintTime: 'Heure', rsPrintWhat: 'Quoi', rsPrintWhere: 'Où', rsPrintWho: 'Responsable', rsPrintCue: 'Ce qui doit être prêt', rsPrintNotes: 'Notes', rsPrintProducer: 'Production', rsPrintHint: 'La fenêtre d’impression s’ouvre : choisissez « Enregistrer en PDF ».', rsToParticipants: 'Participants : {n} viennent sur {m}'
  },
  en: {
    tRunsheet: 'Run of show', rsTitle: 'Run of show', rsEmpty: 'No run of show yet. Start from a template, import the existing schedule or add a block.',
    rsAdd: 'Block', rsAddDay: 'Day', rsTemplate: 'Day template', rsImport: 'Import the existing schedule', rsImported: '{n} blocks added from the schedule', rsImportedNone: 'Everything was already imported, nothing added',
    rsCallSheet: 'Call sheet for…', rsCallSheetFor: 'Call sheet for {who}', rsWhole: 'Whole run of show', rsToCal: 'To calendar', rsLive: 'Day-of mode', rsPdf: 'PDF', rsWaPick: 'WhatsApp (pick the chat)', rsMail: 'E-mail', rsCopy: 'Copy',
    rsDelay15: '+15 min delay from here', rsDelayed: 'The run of show moved by {n} min', rsShifted: 'Shifted', rsNoPeople: 'No owners in the blocks yet. Write who is responsible for each block.',
    rsBlock: 'Block', rsEditBlock: 'Edit block', rsStart: 'Start', rsEnd: 'End', rsWhat: 'What', rsKind: 'Kind', rsPlace: 'Where', rsOwner: 'Owner (supplier or staff)', rsPhone: 'Phone', rsCue: 'What must be ready', rsNotes: 'Notes', rsStatus: 'Status', rsDayNotes: 'Getting there, parking and notes for the day',
    rsKindArrival: 'Arrival', rsKindSession: 'Session', rsKindMeal: 'Meal', rsKindTransport: 'Transport', rsKindBreak: 'Break', rsKindSetup: 'Setup', rsKindStrike: 'Strike', rsKindOther: 'Other',
    rsPlanned: 'Planned', rsDone: 'Done', rsLate: 'Late', rsDeleteBlock: 'Delete “{title}”?', rsDeleted: 'Block deleted', rsDeleteDay: 'Delete the day {date} with all its blocks?',
    rsOverlapOwner: '{who} is in two places at once: “{a}” ({ta}) and “{b}” ({tb})', rsOverlapPlace: 'Two things at {who} at the same time: “{a}” ({ta}) and “{b}” ({tb})', rsNoOverlap: 'No clashes',
    rsLangOf: 'Language', rsPickWho: 'For whom', rsWaTo: 'WhatsApp to {who}', rsNoPhoneFor: 'No phone for {who}, pick the WhatsApp chat', rsNoEmailFor: 'No e-mail, the text was copied',
    rsCalDone: 'The calendar file is ready. Open it in the phone’s calendar.', rsCalNothing: 'No blocks with a time',
    rsNow: 'Now', rsNext: 'Next', rsNothingNow: 'No block running right now', rsAllDone: 'The whole run of show is done. Well done!', rsElapsed: '{n} min elapsed', rsRemaining: '{n} min left', rsInMin: 'in {n} min', rsLateBy: '{n} min late', rsRunningLate: 'Running late',
    rsMarkDone: 'Done', rsDelay10: 'Delay +10', rsDelay15s: 'Delay +15', rsCall: 'Call {who}', rsPhones: 'Phones', rsExit: 'Exit', rsLiveHint: 'The screen stays awake. Updates every 30 seconds.', rsWake: 'The screen will stay awake', rsNoDay: 'No run of show for this day', rsPickDay: 'Day',
    rsTplSeminar: 'Seminar', rsTplConference: 'Conference', rsTplDelegation: 'Delegation', rsTplDinner: 'Dinner / evening event',
    rsPrintTitle: 'Run of show', rsPrintClient: 'Client', rsPrintEvent: 'Event', rsPrintDate: 'Date', rsPrintPlace: 'Place', rsPrintTime: 'Time', rsPrintWhat: 'What', rsPrintWhere: 'Where', rsPrintWho: 'Owner', rsPrintCue: 'What must be ready', rsPrintNotes: 'Notes', rsPrintProducer: 'Production', rsPrintHint: 'The print dialog opens: choose “Save as PDF”.', rsToParticipants: 'Participants: {n} coming of {m}'
  }
};
