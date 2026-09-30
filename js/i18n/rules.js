/* Texts of the rules module (automatic reminders): he / fr / en. No Arabic letters anywhere. */
export const RULES = {
  he: {
    notifications: 'תזכורות', nfSub: 'מה שהאפליקציה שמה לב אליו במקומך', nfSettings: 'הגדרות תזכורות', nfBackToList: 'לרשימת התזכורות',
    nfToday: 'היום', nfSoon: 'בימים הקרובים', nfLater: 'בהמשך', nfNew: 'חדש', nfAllRead: 'הכל נקרא', nfCount: '{n} תזכורות',
    nfEmptyTitle: 'שקט. אין תזכורות.', nfEmpty: 'כאן יופיעו לבד: ספק שלא ענה על בקשת הצעה, הצעה ללקוח שמחכה לתשובה או שפג תוקפה, חשבונית שלא שולמה, תשלום לספק שמתקרב, אירוע בעוד 14, 7 ויום אחד עם מה שעוד פתוח, משימה באיחור, שיחה לחזור, אישורי הגעה חסרים וחוזה שלא נחתם. שום דבר לא נשלח בלי שאת לוחצת.',
    nfSnooze: 'דחייה', nfSnooze1: 'מחר', nfSnooze3: '3 ימים', nfSnoozeEvent: 'עד יום לפני האירוע', nfDismiss: 'הסרה', nfDismissed: 'הוסר', nfSnoozed: 'נדחה עד {d}', nfTaskMade: 'המשימה נוצרה', nfMarkedRead: 'סומן כנקרא', nfDoneOk: 'סומן כטופל',
    nfEvent: 'לתיק', nfPhoneAsk: 'אין טלפון. אפשר להקליד:', nfWaTitle: 'טיוטה לוואטסאפ',
    nfLevelUrgent: 'דחוף', nfLevelWarn: 'לטפל', nfLevelInfo: 'לידיעה',
    nfRules: 'הכללים', nfRulesHint: 'כל כלל אפשר לכבות או לכוון. השינוי נשמר מיד.', nfOn: 'פעיל', nfDays: 'ימים', nfPct: '% לא ענו',
    nfR_supSilent: 'ספק שלא ענה על בקשת הצעה', nfR_quoteWait: 'הצעה ללקוח שמחכה לתשובה', nfR_quoteExpired: 'הצעה שפג תוקפה', nfR_payLate: 'חשבונית ללקוח שלא שולמה במועד',
    nfR_supPay: 'תשלום לספק שמתקרב', nfR_event: 'אירוע בעוד 14, 7 ויום אחד: מה עוד פתוח', nfR_taskLate: 'משימה באיחור', nfR_call: 'שיחה לחזור היום',
    nfR_rsvp: 'אישורי הגעה חסרים לפני האירוע', nfR_contract: 'חוזה לא חתום לפני האירוע', nfR_digest: 'סיכום בוקר, פעם ביום',
    nfBrowser: 'התראות של הדפדפן', nfBrowserHint: 'רק לפריטים דחופים, רק כשהאפליקציה פתוחה, ולא בשעות השקט. הדפדפן ישאל פעם אחת.', nfBrowserAsk: 'לאפשר התראות', nfBrowserGranted: 'מאושר', nfBrowserDenied: 'נחסם בדפדפן. אפשר לשנות בהגדרות האתר בדפדפן.', nfBrowserNo: 'הדפדפן הזה לא תומך בהתראות.',
    nfReadDigest: 'להקריא את סיכום הבוקר בקול, פעם ביום', nfReadNow: 'הקראה עכשיו',
    nfQuiet: 'שעות שקט', nfQuietHint: 'בין השעות האלה אין התראות של הדפדפן. הרשימה עצמה תמיד זמינה.', nfQuietFrom: 'מ', nfQuietTo: 'עד',
    nfTestNow: 'בדיקה עכשיו', nfTestResult: '{n} תזכורות: {u} דחופות, {w} לטפל, {i} לידיעה', nfSaved: 'נשמר'
  },
  fr: {
    notifications: 'Rappels', nfSub: 'Ce que l’application remarque à votre place', nfSettings: 'Réglages des rappels', nfBackToList: 'Retour aux rappels',
    nfToday: 'Aujourd’hui', nfSoon: 'Ces prochains jours', nfLater: 'Plus tard', nfNew: 'Nouveau', nfAllRead: 'Tout lu', nfCount: '{n} rappels',
    nfEmptyTitle: 'Rien en attente. Aucun rappel.', nfEmpty: 'Ici apparaîtront d’eux-mêmes : un fournisseur qui n’a pas répondu à une demande de devis, un devis client en attente ou expiré, une facture impayée, un paiement fournisseur qui approche, un événement dans 14, 7 et 1 jour avec ce qui reste ouvert, une tâche en retard, un appel à rappeler, des confirmations manquantes et un contrat non signé. Rien ne part sans que vous appuyiez.',
    nfSnooze: 'Reporter', nfSnooze1: 'Demain', nfSnooze3: '3 jours', nfSnoozeEvent: 'À la veille de l’événement', nfDismiss: 'Retirer', nfDismissed: 'Retiré', nfSnoozed: 'Reporté au {d}', nfTaskMade: 'Tâche créée', nfMarkedRead: 'Marqué comme lu', nfDoneOk: 'Marqué comme réglé',
    nfEvent: 'Dossier', nfPhoneAsk: 'Pas de téléphone. Vous pouvez le saisir :', nfWaTitle: 'Brouillon WhatsApp',
    nfLevelUrgent: 'Urgent', nfLevelWarn: 'À traiter', nfLevelInfo: 'Pour info',
    nfRules: 'Les règles', nfRulesHint: 'Chaque règle peut être désactivée ou ajustée. Le changement est enregistré aussitôt.', nfOn: 'Active', nfDays: 'jours', nfPct: '% sans réponse',
    nfR_supSilent: 'Fournisseur sans réponse à une demande de devis', nfR_quoteWait: 'Devis client en attente de réponse', nfR_quoteExpired: 'Devis expiré', nfR_payLate: 'Facture client impayée à l’échéance',
    nfR_supPay: 'Paiement fournisseur qui approche', nfR_event: 'Événement dans 14, 7 et 1 jour : ce qui reste ouvert', nfR_taskLate: 'Tâche en retard', nfR_call: 'Appel à rappeler aujourd’hui',
    nfR_rsvp: 'Confirmations manquantes avant l’événement', nfR_contract: 'Contrat non signé avant l’événement', nfR_digest: 'Résumé du matin, une fois par jour',
    nfBrowser: 'Notifications du navigateur', nfBrowserHint: 'Seulement pour l’urgent, seulement quand l’application est ouverte, et pas pendant les heures calmes. Le navigateur demande une seule fois.', nfBrowserAsk: 'Autoriser les notifications', nfBrowserGranted: 'Autorisées', nfBrowserDenied: 'Bloquées par le navigateur. Modifiable dans les réglages du site.', nfBrowserNo: 'Ce navigateur ne gère pas les notifications.',
    nfReadDigest: 'Lire le résumé du matin à voix haute, une fois par jour', nfReadNow: 'Lire maintenant',
    nfQuiet: 'Heures calmes', nfQuietHint: 'Entre ces heures, pas de notification du navigateur. La liste reste toujours disponible.', nfQuietFrom: 'De', nfQuietTo: 'À',
    nfTestNow: 'Vérifier maintenant', nfTestResult: '{n} rappels : {u} urgents, {w} à traiter, {i} pour info', nfSaved: 'Enregistré'
  },
  en: {
    notifications: 'Reminders', nfSub: 'What the app notices for you', nfSettings: 'Reminder settings', nfBackToList: 'Back to reminders',
    nfToday: 'Today', nfSoon: 'Coming days', nfLater: 'Later', nfNew: 'New', nfAllRead: 'All read', nfCount: '{n} reminders',
    nfEmptyTitle: 'Quiet. No reminders.', nfEmpty: 'These appear here on their own: a supplier who did not answer a request, a client quote waiting for an answer or expired, an unpaid invoice, a supplier payment coming up, an event in 14, 7 and 1 day with what is still open, an overdue task, a call to return, missing RSVPs and an unsigned contract. Nothing is sent unless you tap.',
    nfSnooze: 'Snooze', nfSnooze1: 'Tomorrow', nfSnooze3: '3 days', nfSnoozeEvent: 'Until the day before the event', nfDismiss: 'Remove', nfDismissed: 'Removed', nfSnoozed: 'Snoozed until {d}', nfTaskMade: 'Task created', nfMarkedRead: 'Marked as read', nfDoneOk: 'Marked as done',
    nfEvent: 'Case', nfPhoneAsk: 'No phone. You can type one:', nfWaTitle: 'WhatsApp draft',
    nfLevelUrgent: 'Urgent', nfLevelWarn: 'To handle', nfLevelInfo: 'For info',
    nfRules: 'The rules', nfRulesHint: 'Each rule can be turned off or tuned. Changes are saved at once.', nfOn: 'On', nfDays: 'days', nfPct: '% not answered',
    nfR_supSilent: 'Supplier who did not answer a request', nfR_quoteWait: 'Client quote waiting for an answer', nfR_quoteExpired: 'Quote past its validity', nfR_payLate: 'Client invoice unpaid past due',
    nfR_supPay: 'Supplier payment coming up', nfR_event: 'Event in 14, 7 and 1 day: what is still open', nfR_taskLate: 'Overdue task', nfR_call: 'Call to return today',
    nfR_rsvp: 'Missing RSVPs before the event', nfR_contract: 'Contract not signed before the event', nfR_digest: 'Morning summary, once a day',
    nfBrowser: 'Browser notifications', nfBrowserHint: 'Only for urgent items, only while the app is open, and not during quiet hours. The browser asks once.', nfBrowserAsk: 'Allow notifications', nfBrowserGranted: 'Allowed', nfBrowserDenied: 'Blocked by the browser. It can be changed in the site settings.', nfBrowserNo: 'This browser does not support notifications.',
    nfReadDigest: 'Read the morning summary aloud, once a day', nfReadNow: 'Read now',
    nfQuiet: 'Quiet hours', nfQuietHint: 'No browser notifications between these hours. The list itself is always there.', nfQuietFrom: 'From', nfQuietTo: 'To',
    nfTestNow: 'Check now', nfTestResult: '{n} reminders: {u} urgent, {w} to handle, {i} for info', nfSaved: 'Saved'
  }
};
