/* Everything she can say or do, in her language. The help screen shows this; keep it in step with the commands. */
export const HELP = {
  he: [
    { title: 'איך מקליטים', items: [
      'לוחצים "הקלטה", מדברים חופשי. אפשר לעצור לחשוב: אחרי 10 שניות שקט המיקרופון נעצר, הטקסט נשאר, ו"הקלטה" ממשיכה מאותו מקום.',
      'בסוף אומרים "סיימתי" (או לוחצים על הכפתור "סיימתי"). רק אז הפקודה מתבצעת.',
      'אומרים "מחקי" בסוף (גם בלי הפסקה לפני, גם "למחוק" או "דליט"), וכל מה שהוקלט נמחק. גם הכפתור "מחיקה" עושה את זה.',
      'מה שנמחק נשמר שעה ב"סל" (הכפתור ליד המחיקה). משם מחזירים כל הקלטה. "רוקני את הסל" (או הכפתור בתוך הסל) מוחק הכל לצמיתות, אחרי אישור.',
      'אפשר גם לכתוב במקום להקליט, ואז ללחוץ "קריאה".'
    ] },
    { title: 'מעבר בין מסכים: "עברי ל..." ואז שם המסך', items: ['"עברי לספקים", "עברי למשימות", "עברי להיום"', 'שמות המסכים: היום, תיקים, ספקים, לקוחות, משימות, שיחות, הצעות מחיר, כספים, קבלות, הערות, קבוצות, חיפוש, הגדרות, פנייה חדשה, עזרה', 'עובד גם "לכי ל...", "תראי לי את ה...", "מסך ספקים". שם מסך בלבד, בלי "עברי ל", לא מעביר, כדי שמילה בתוך משפט לא תזיז אותך בטעות.'] },
    { title: 'שאלות', items: [
      '"מה יש לי מחר" / "מה המשימות שלי להיום" / "מה יש השבוע" / "מה יש ביום שלישי" / "משימות ל-15/10"',
      '"מה המשימות הפתוחות שלי"',
      '"מה חסר לי לשוב״ל" / "מה פתוח באירוע של ברטלסמן": כל מה שעוד פתוח בתיק, לפי נושאים',
      '"מה חסר לי מהספקים של שוב״ל": רק הספקים, הדפוס והכספים מולם',
      '"מה פתוח מול הלקוח שוב״ל": רק פרטי האירוע והלקוח'
    ] },
    { title: 'תיק חדש', items: [
      '"פנייה חדשה: דנה לוי 052-1234567 יום גיבוש ל-40 בראש פינה ב-15/11"',
      'או במסך "פנייה חדשה": מספרים הכל בהקלטה אחת (לקוח, תאריך, משתתפים, לינה, אולם, הסעות, מה צריך לבדוק). האפליקציה מפרקת לתיק, לספקים שצריך ולמשימות.'
    ] },
    { title: 'ספקים והצעות', items: [
      '"תבקשי הצעות ממלונות לשוב״ל": בקשת הצעה לכמה ספקים בבת אחת, בסגנון שלך',
      '"תבני הצעת מחיר לשוב״ל"',
      '"קיבלתי הצעה ממלון דניאל: ..." או בתיק → ספקים → "הצעה התקבלה": מדביקים את ההצעה והיא נקראת לטבלת השוואה',
      '"הצעת ספק ← ללקוח": ההצעה של הספק הופכת להצעה ללקוח עם העמלה, ותרגום לאנגלית'
    ] },
    { title: 'תזכורות, משימות והערות', items: [
      '"תזכירי לי מחר ב-9 להתקשר לדנה" / "תזכירי לי ביום שלישי לאשר את האוטובוס"',
      '"משימה לשירית: לאסוף שלטים מהדפוס"',
      '"רשמי הערה על דן פנורמה: יקרים אבל שווים"',
      'אחרי תזכורת, ובכל משימה עם תאריך, יש כפתור "ליומן": התזכורת נכנסת ליומן של הטלפון ומצלצלת בשעה. גם בתיק יש "ליומן" ליום האירוע.'
    ] },
    { title: 'הודעות ושליחה (כלום לא נשלח בלי לחיצה שלך)', items: [
      'הנוסח הבטוח: "שלחי וואטסאפ ל<שם או מספר>" ואז אחת המילים "ההודעה", "תכתבי", "תגידי לה" או "שאלי", ואז ההודעה עצמה. למשל: "שלחי וואטסאפ לדנה, ההודעה: מגיעה ב-10", "שלחי וואטסאפ ל-0544974644 שאלי מתי את מגיעה הביתה" (הופך לשאלה עם סימן שאלה).',
      'בלי מילת סימון, כל מה שאחרי המספר או השם הוא ההודעה: "שלחי וואטסאפ ל-0544974644 זו בדיקה".',
      'לקבוצה: "שלחי וואטסאפ לקבוצת הצוות: הלו״ז נשלח". וואטסאפ נפתח עם ההודעה, ובוחרים את הקבוצה.',
      '"תגידי לדנה ש..." / "תשלחי מייל למארק: ..." עובדים גם. ההודעה נפתחת לבדיקה, ורק לחיצה על "וואטסאפ" שולחת.',
      '"תתקשרי לביסקוטי" / "תפתחי את דנה"',
      '"שלחי אישור ניהול חשבון ל-052-1234567" / "תשלחי את הלוגו לדנה לוי": מסמך מהספרייה',
      '"תבקש מרועי חשבונית: קומיוניטי או, 580777894, 3,000 + מע״מ"',
      '"שמרי את הטלפון של רועי 052..."'
    ] },
    { title: 'כספים וקבלות', items: [
      '"צלם חשבונית": צילום, סכום, ושמירה לפי חודש בענן',
      'בסוף חודש: מסך "כספים" → "לשלוח לעופר" פותח מייל מוכן עם הסיכום והקישורים',
      'ספק ששולם ולא שלח חשבונית מופיע במסך היום עם תזכורת מוכנה'
    ] },
    { title: 'שיתוף מאפליקציות אחרות', items: [
      'בכל אפליקציה בטלפון: "שיתוף" → "באקה סאן". איש קשר מוואטסאפ נכנס לאנשי הקשר, צילום מהגלריה לקבלות, PDF לספריית המסמכים.',
      'הודעה של ספק בוואטסאפ: לוחצים עליה, "שיתוף" → "באקה סאן" → "הצעה מספק", וההצעה נכנסת לטבלת ההשוואה בלי הקלדה.'
    ] },
    { title: 'מצב נסיעה', items: ['הגדרות → "מצב נסיעה": מי מחליף ועד מתי. החתימה מקבלת שורה על זה, ובמסך היום יש "חפיפה למחליפה".'] }
  ],
  fr: [
    { title: 'Comment dicter', items: [
      'Appuyez sur « Dicter », parlez librement. Vous pouvez réfléchir : après 10 secondes de silence le micro s’arrête, le texte reste, et « Dicter » reprend là où vous étiez.',
      'À la fin, dites « terminé » (ou appuyez sur le bouton « J’ai fini »). C’est seulement alors que l’instruction s’exécute.',
      'Dites « efface » à la fin, et tout l’enregistrement est supprimé. Le bouton « Effacer » fait pareil.',
      'Ce qui est effacé reste une heure dans la « corbeille » (le bouton à côté). On peut tout récupérer de là. « vide la corbeille » (ou le bouton dans la corbeille) supprime tout définitivement, après confirmation.',
      'On peut aussi écrire au lieu de dicter, puis appuyer sur « Lire ».'
    ] },
    { title: 'Changer d’écran : « va à ... » puis le nom de l’écran', items: ['« va aux fournisseurs », « va à tâches », « va à accueil »', 'Les écrans : accueil, dossiers, fournisseurs, clients, tâches, appels, devis, finances, reçus, notes, groupes, recherche, réglages, nouvelle demande, aide', '« montre-moi les ... » marche aussi. Le nom seul, sans « va à », ne change pas d’écran : un mot dans une phrase ne vous déplace jamais par erreur.'] },
    { title: 'Questions', items: [
      '« qu’est-ce que j’ai demain » / « mes tâches pour aujourd’hui » / « qu’est-ce que j’ai cette semaine » / « mes tâches mardi »',
      '« mes tâches ouvertes »',
      '« qu’est-ce qui manque pour Shoval » : tout ce qui est encore ouvert dans le dossier, par thème',
      '« qu’est-ce qui manque chez les fournisseurs de Shoval » : seulement les fournisseurs, l’impression et l’argent avec eux',
      '« qu’est-ce qui est ouvert avec le client Shoval » : seulement l’événement et le client'
    ] },
    { title: 'Nouveau dossier', items: [
      '« nouveau client : Dana Levy 052-1234567 team building 40 pers. Rosh Pinna 15/11 »',
      'Ou dans « Nouvelle demande » : racontez tout en une dictée (client, date, participants, hôtel, salle, bus, ce qu’il faut vérifier). L’application en fait un dossier, les fournisseurs nécessaires et les tâches.'
    ] },
    { title: 'Fournisseurs et devis', items: [
      '« demande des devis aux hôtels pour Shoval » : une demande à plusieurs fournisseurs d’un coup, dans votre style',
      '« prépare un devis pour Shoval »',
      '« j’ai reçu un devis de l’hôtel Daniel : ... » ou dossier → fournisseurs → « devis reçu » : collez le devis, il est lu dans le tableau comparatif',
      '« devis fournisseur → client » : le devis du fournisseur devient un devis au client avec votre marge, traduit'
    ] },
    { title: 'Rappels, tâches et notes', items: [
      '« rappelle-moi demain à 9 d’appeler Dana » / « rappelle-moi mardi de confirmer le bus »',
      '« tâche pour Shirit : récupérer les panneaux »',
      '« note sur Dan Panorama : chers mais bien »',
      'Après un rappel, et sur chaque tâche datée, le bouton « Au calendrier » met le rappel dans l’agenda du téléphone, qui sonne à l’heure. Le dossier a aussi « Au calendrier » pour le jour de l’événement.'
    ] },
    { title: 'Messages et envois (rien ne part sans votre clic)', items: [
      'La forme sûre : « envoie un whatsapp à <nom ou numéro> » puis « le message », « dis-lui » ou « demande », puis le message. Par exemple : « envoie un whatsapp à Dana, le message : j’arrive à 10h », « envoie un message au 0544974644 demande quand tu arrives » (devient une question).',
      'Sans mot-repère, tout ce qui suit le numéro ou le nom est le message : « envoie un whatsapp au 0544974644 ceci est un test ».',
      'À un groupe : « envoie un whatsapp au groupe équipe : le programme est parti ». WhatsApp s’ouvre avec le message, vous choisissez le groupe.',
      '« envoie un mail à Marc : ... » marche aussi. Le message s’ouvre pour vérification, seul le clic sur « WhatsApp » envoie.',
      '« appelle Biscotti » / « ouvre Dana »',
      '« envoie l’attestation bancaire au 052-1234567 » / « envoie le logo à Dana Levy » : un document de la bibliothèque',
      '« demande à Roy une facture : Community O, 580777894, 3 000 + TVA »',
      '« enregistre le téléphone de Roy 052... »'
    ] },
    { title: 'Argent et reçus', items: [
      '« photographie une facture » : photo, montant, classement par mois dans le cloud',
      'En fin de mois : écran « Finances » → « Envoyer à Ofer » ouvre un mail prêt avec le résumé et les liens',
      'Un fournisseur payé qui n’a pas envoyé sa facture apparaît sur l’accueil avec un rappel prêt'
    ] },
    { title: 'Partager depuis d’autres applications', items: [
      'Dans n’importe quelle application : « Partager » → « Baka Sun ». Un contact WhatsApp va dans les contacts, une photo dans les reçus, un PDF dans les documents.',
      'Le message d’un fournisseur sur WhatsApp : appui long, « Partager » → « Baka Sun » → « Devis fournisseur », et le devis entre dans le tableau comparatif sans rien taper.'
    ] },
    { title: 'Mode voyage', items: ['Réglages → « Mode voyage » : qui vous remplace et jusqu’à quand. La signature le mentionne, et l’accueil a un bouton « passation ».'] }
  ],
  en: [
    { title: 'How to dictate', items: [
      'Tap “Dictate” and talk freely. You can stop to think: after 10 seconds of silence the microphone stops, the text stays, and “Dictate” continues from there.',
      'At the end say “done” (or tap the “Done” button). Only then does the instruction run.',
      'Say “delete” at the end and the whole recording is removed. The “Delete” button does the same.',
      'What was deleted stays one hour in the “bin” (the button next to it). Anything can be brought back from there. “empty the bin” (or the button inside the bin) deletes everything for good, after a confirmation.',
      'You can also type instead of dictating, then tap “Read”.'
    ] },
    { title: 'Moving between screens: “go to ...” then the screen name', items: ['“go to suppliers”, “go to tasks”, “go to today”', 'The screens: today, cases, suppliers, clients, tasks, calls, quotes, money, receipts, notes, groups, search, settings, new lead, help', '“show me the ...” works too. The name alone, without “go to”, does not move you: a word inside a sentence never moves you by mistake.'] },
    { title: 'Questions', items: [
      '“what do I have tomorrow” / “my tasks for today” / “what is on this week” / “tasks on tuesday” / “tasks for 15/10”',
      '“what are my open tasks”',
      '“what’s missing for Shoval” / “what is open on the Bertelsmann event”: everything still open in the case, by topic',
      '“what do I need from the suppliers for Shoval”: only suppliers, print and money with them',
      '“what is open with the client Shoval”: only the event details and the client'
    ] },
    { title: 'New case', items: [
      '“new lead: Dana Levy 052-1234567 team building for 40 in Rosh Pinna on 15/11”',
      'Or on “New lead”: tell everything in one recording (client, date, participants, hotel, hall, bus, what to check). The app turns it into a case, the suppliers it needs, and tasks.'
    ] },
    { title: 'Suppliers and quotes', items: [
      '“ask for quotes from hotels for Shoval”: one request to several suppliers at once, in your style',
      '“build a quote for Shoval”',
      '“got a quote from Daniel hotel: ...” or case → suppliers → “quote received”: paste the offer, it is read into the comparison table',
      '“supplier quote → client”: the supplier’s quote becomes the client’s quote with your fee, translated'
    ] },
    { title: 'Reminders, tasks and notes', items: [
      '“remind me tomorrow at 9 to call Dana” / “remind me on tuesday to confirm the bus”',
      '“task for Shirit: collect the signs from the printer”',
      '“note on Dan Panorama: pricey but worth it”',
      'After a reminder, and on every dated task, the “To calendar” button puts it in the phone’s calendar, which rings at the hour. The case has “To calendar” for the event day too.'
    ] },
    { title: 'Messages and sending (nothing leaves without your tap)', items: [
      'The safe form: “send a whatsapp to <name or number>” then “saying”, “say”, “the message is” or “ask”, then the message. For example: “send a whatsapp to Dana saying arriving at 10”, “send a message to 0544974644 ask when you get home” (becomes a question).',
      'Without a marker, everything after the number or the name is the message: “send a whatsapp to 0544974644 this is a test”.',
      'To a group: “send a whatsapp to the group team: schedule sent”. WhatsApp opens with the message, you pick the group.',
      '“send an email to Marc: ...” works too. The message opens for a check, only the tap on “WhatsApp” sends it.',
      '“call Biscotti” / “open Dana”',
      '“send the bank confirmation to 052-1234567” / “send the logo to Dana Levy”: a document from the library',
      '“ask Roy for an invoice: Community O, 580777894, 3,000 + VAT”',
      '“save the phone of Roy 052...”'
    ] },
    { title: 'Money and receipts', items: [
      '“snap a receipt”: photo, amount, filed by month in the cloud',
      'At month end: “Money” screen → “Send to Ofer” opens a ready mail with the summary and links',
      'A supplier who was paid and sent no invoice shows on Today with a ready reminder'
    ] },
    { title: 'Sharing from other apps', items: [
      'In any app on the phone: “Share” → “Baka Sun”. A WhatsApp contact goes to contacts, a photo from the gallery to receipts, a PDF to the documents.',
      'A supplier’s WhatsApp message: long press, “Share” → “Baka Sun” → “Supplier offer”, and the offer enters the comparison table with no typing.'
    ] },
    { title: 'Travel mode', items: ['Settings → “Travel mode”: who covers and until when. The signature gets a line about it, and Today has a “handover” button.'] }
  ]
};
