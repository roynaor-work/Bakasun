/* Everything she can say or do, in her language. The help screen shows this; keep it in step with the commands. */
export const HELP = {
  he: [
    { title: 'איך מקליטים', items: [
      'לוחצים "הקלטה", מדברים חופשי. אפשר לעצור לחשוב: אחרי 10 שניות שקט המיקרופון נעצר, הטקסט נשאר, ו"הקלטה" ממשיכה מאותו מקום.',
      'בסוף אומרים "סיימתי" (או לוחצים על הכפתור "סיימתי"). רק אז הפקודה מתבצעת. "סיימתי" ואז ממשיכים לדבר בלי הפסקה: זה חלק מההקלטה, לא פקודה.',
      'אומרים "מחקי" בסוף (גם בלי הפסקה לפני, גם "למחוק" או "דליט"), וכל מה שהוקלט נמחק. גם הכפתור "מחיקה" עושה את זה.',
      'מה שנמחק נשמר שעה ב"סל" (הכפתור ליד המחיקה). משם מחזירים כל הקלטה. "רוקני את הסל" (או הכפתור בתוך הסל) מוחק הכל לצמיתות, אחרי אישור.',
      'אפשר גם לכתוב במקום להקליט, ואז ללחוץ "קריאה".',
      'בקשת חשבונית מרועי: "חשבונית לב.ד. על 10,000 לפני מע״מ עבור הפקה של חיים ומשה". לקוח שמופיע ברשימה (גם באיות של הדיבור, "בית. ד") מזוהה, וח.פ. וכתובת מהכרטיס נכנסים לבד. "שלחי במייל לרועי" פותח את המייל במקום וואטסאפ. "בנוסף אבקש ממנו…" נכנס כשורה נוספת.',
      'בזמן הקלטה הכפתור מראה שעון רץ, הטלפון רוטט קצר בהתחלה ובסוף, והמסך לא נכבה.',
      '"פקודות אחרונות" מעל התיבה: לחיצה על אחת מהן ממלאת אותה מחדש.',
      'לחיצה ארוכה על סמל האפליקציה במסך הבית: "הקלטה" (פותח את המיקרופון מיד), "צלם חשבונית", "מה יש לי היום".'
    ] },
    { title: 'מהמחשב', items: [
      'במסך רחב (מחשב, טאבלט לרוחב) התפריט עובר לצד והכרטיסים מסתדרים בעמודות. אותם נתונים, אותו ענן.',
      '"עוד" ← "לוח בקרה": מבט אחד על אירועים קרובים, משימות באיחור, שיחות, כסף שלא שולם, ספקים שלא ענו.',
      '"עוד" ← "יומן": חודש / שבוע / רשימה עם אירועים, משימות, שיחות ותשלומים. לחיצה על יום פותחת אותו.',
      'בכרטיס האירוע נוספו לשוניות: משתתפים (רשימה למלון, תזונה, אישורי הגעה), חוזה (הסכם עם חתימה על המסך), רשימת תיוג (לפי סוג האירוע), היסטוריה (מי שינה מה ומתי), תקציב (עלות ספקים מול מחיר ללקוח, רווח, לוח תשלומים), לו״ז יום האירוע (ציר זמן, דפי קריאה לספקים ולצוות, מצב יום האירוע עם "עכשיו" ו"הבא"), קבצים (הצעות, תפריטים, אישורים, צילומים; מה חסר במסמכים).',
      '"עוד" ← "לוח אירועים": קנבן לפי סטטוס. גוררים כרטיס בין עמודות (בטלפון: לחיצה ארוכה), "⋯" על כרטיס לשינוי סטטוס ומקור הפנייה. "סטטיסטיקה": המרה לפי חודש, סוג ומקור.',
      '"עוד" ← "תזכורות": המערכת בודקת לבד: ספק שלא ענה, הצעה בלי תשובה, חשבונית באיחור, אירוע בעוד 14/7/1 ימים עם פריטים פתוחים, אישורי הגעה חסרים, חוזה לא חתום. לכל תזכורת: משימה, טיוטת וואטסאפ, בוצע, דחייה. בהגדרות התזכורות: הפעלה/כיבוי לכל כלל, התראות דפדפן, הקראת תקציר בוקר, שעות שקט.',
      'ליד כל טקסט, טלפון, מייל וכתובת יש כפתור "העתק".'
    ] },
    { title: 'מעבר בין מסכים: "עברי ל..." ואז שם המסך', items: ['"עברי לספקים", "עברי למשימות", "עברי להיום"', 'שמות המסכים: היום, תיקים, ספקים, לקוחות, משימות, שיחות, הצעות מחיר, כספים, קבלות, הערות, קבוצות, חיפוש, הגדרות, פנייה חדשה, עזרה', 'עובד גם "לכי ל...", "תראי לי את ה...", "מסך ספקים". שם מסך בלבד, בלי "עברי ל", לא מעביר, כדי שמילה בתוך משפט לא תזיז אותך בטעות.'] },
    { title: 'שאלות', items: [
      '"מה יש לי מחר" / "מה המשימות שלי להיום" / "מה יש השבוע" / "מה יש ביום שלישי" / "משימות ל-15/10"',
      '"מה המשימות הפתוחות שלי"',
      'מתחת לכל תשובה יש "הקראה": הטלפון מקריא בקול. "תקריאי לי" מקריא את התשובה האחרונה. בהגדרות אפשר לבחור הקראה אוטומטית של כל תשובה (לנהיגה).',
      '"מה חסר לי לשוב״ל" / "מה פתוח באירוע של ברטלסמן": כל מה שעוד פתוח בתיק, לפי נושאים',
      '"מה חסר לי מהספקים של שוב״ל": רק הספקים, הדפוס והכספים מולם',
      '"מה פתוח מול הלקוח שוב״ל": רק פרטי האירוע והלקוח'
    ] },
    { title: 'מצב העבודה, במשפט אחד', items: [
      '"מי לא ענה" / "כמה ספקים לא ענו": הרשימה, עם "תזכורת לכולם"',
      '"תשלחי תזכורת לגרשון טורס" / "תזכירי לכל הספקים שלא ענו"',
      '"מה עם מלון דניאל": מצב הספק בכל האירועים הפתוחים',
      '"סגרי עם מלון דניאל" / "מלון דניאל נבחר": הספק מסומן כאושר',
      '"העברתי תשלום לדף אור 500": נרשם ששולם, ונפתחת בקשת חשבונית מוכנה. "מה שילמנו לביסקוטי": כל התשלומים',
      '"סמני שהסיור בוצע" / "תבטלי את המשימה של הסיור" / "דחי את המשימה של הסיור ליום חמישי"',
      '"תחזירי" / "בטלי את הפעולה האחרונה" (או הכפתור "בטלי" מתחת לתשובה): הפעולה האחרונה שנשמרה חוזרת אחורה: משימה, הערה, תזכורת, סימון בוצע, דחייה, בחירת ספק, שורת דפוס',
      '"משימה לדנה: להתקשר לאולם עד יום חמישי" / "משימה: לשלוח הצעה מחר ב-10": התאריך והשעה נלקחים מהמשפט. בלי תאריך: מחר',
      '"תרשמי שיחה עם ארבל מחר ב-10": נכנס לתור השיחות (ו"ליומן")',
      '"תוסיפי לרשימת הדפוס 20 תגי שם לשוב״ל"',
      '"מה התקציב של שוב״ל" / "כמה משתתפים יש לברטלסמן" / "מתי האירוע של שוב״ל"'
    ] },
    { title: 'משתתפים, תקציב, לו״ז, קבצים, חוזה, רשימת תיוג, תזכורות, לוח והיסטוריה', items: [
      '"הוסיפי משתתף לשוב״ל: דנה כהן 052-1234567 צמחונית" (אפשר כמה שורות, אחת לכל אדם). "כמה אישרו הגעה לשוב״ל" / "מי עוד לא אישר הגעה לשוב״ל" / "רשימה למלון של שוב״ל": הרשימה לפי חדרים, עם "העתקה"',
      '"מה הרווח באירוע שוב״ל" / "כמה עולים לנו הספקים בברטלסמן" / "מה לוח התשלומים של שוב״ל" / "כמה פתוח לתשלום בשוב״ל": מהלשונית "תקציב", עם האזהרות שלה',
      '"מה עכשיו בלו״ז" / "מה הבא בלו״ז": האירוע של היום (או הקרוב), מה רץ, מה הבא ומה באיחור. "עברי למצב יום האירוע" פותח את מצב יום האירוע',
      '"דף קריאה לגרשון טורס לשוב״ל": הטקסט מוכן, עם "העתקה" ו"וואטסאפ"',
      '"מה חסר במסמכים של שוב״ל" / "איפה התפריט של שוב״ל" (גם חוזה, הצעה, ביטוח, חשבונית, תמונות): הקבצים שנמצאו, עם "פתיחה"',
      '"פתחי קבוצת עבודה לשובל עם דנה, רותם ומרינה": כרטיס עם האנשים (מהרשימות שלך, לפי שם פרטי), ואז שאלה: וואטסאפ / מייל / תדריך / משימה לכולם. עונים בקול או בלחיצה. "תוסיפי את עופר" מוסיף. הקבוצה נשמרת בלשונית "קבוצת עבודה" של האירוע.',
      '"מה חסר לחוזה של שוב״ל" / "האם החוזה של שוב״ל חתום"',
      '"מה נשאר ברשימת התיוג של שוב״ל" / "מה לשבוע הקרוב ברשימה של ברטלסמן"',
      '"מה התזכורות שלי" / "מה דחוף": התזכורות עם קישור לכל אחת. "סמני את התזכורות כנקראו"',
      '"העבירי את שוב״ל לנסגר" / "הפנייה של שוב״ל נסגרה" / "הפנייה של X ירדה": התיק זז בלוח האירועים (עם "בטלי")',
      '"מה השתנה היום בשוב״ל" / "מה השתנה לאחרונה" / "מה השתנה השבוע": ההיסטוריה, עם קישור לתיק'
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
      '"שמרי את הטלפון של רועי 052..."',
      'כשהודעה פתוחה על המסך: "תשלחי" לבד לוחץ על וואטסאפ. "שמרי כתבנית סיור" שומר אותה, ובפעם הבאה "שלחי לדנה את תבנית הסיור" ({שם} מתחלף בשם הפרטי).'
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
      'On peut aussi écrire au lieu de dicter, puis appuyer sur « Lire ».',
      'Demande de facture à Roy : « facture pour B.D. de 10 000 HT pour la production de Haïm et Moshe ». Un client de la liste est reconnu (même épelé à la voix), son n° d’entreprise et son adresse se remplissent seuls. « envoie par mail à Roy » ouvre le mail au lieu de WhatsApp.'
    ] },
    { title: 'Depuis l’ordinateur', items: [
      'Sur un écran large, le menu passe sur le côté et les cartes s’alignent en colonnes. Mêmes données, même nuage.',
      '« Plus » → « Tableau de bord » : événements proches, tâches en retard, appels, argent non payé, fournisseurs sans réponse.',
      '« Plus » → « Agenda » : mois / semaine / liste avec événements, tâches, appels et paiements.',
      'Sur la fiche événement : participants (liste pour l’hôtel, régimes, confirmations), contrat (signature à l’écran), liste de contrôle, historique, budget (coût fournisseurs vs prix client, marge, échéancier), déroulé du jour J (feuilles d’appel, mode jour J), fichiers (devis, menus, attestations, photos).',
      '« Plus » → « Tableau des événements » : kanban par statut, glisser entre colonnes, statistiques de conversion.',
      '« Plus » → « Rappels » : fournisseur sans réponse, devis en attente, facture en retard, événement dans 14/7/1 jours, confirmations manquantes, contrat non signé. Réglages par règle, notifications du navigateur, heures calmes.',
      'Un bouton « Copier » à côté de chaque texte, téléphone, e-mail et adresse.'
    ] },
    { title: 'Changer d’écran : « va à ... » puis le nom de l’écran', items: ['« va aux fournisseurs », « va à tâches », « va à accueil »', 'Les écrans : accueil, dossiers, fournisseurs, clients, tâches, appels, devis, finances, reçus, notes, groupes, recherche, réglages, nouvelle demande, aide', '« montre-moi les ... » marche aussi. Le nom seul, sans « va à », ne change pas d’écran : un mot dans une phrase ne vous déplace jamais par erreur.'] },
    { title: 'Questions', items: [
      '« qu’est-ce que j’ai demain » / « mes tâches pour aujourd’hui » / « qu’est-ce que j’ai cette semaine » / « mes tâches mardi »',
      '« mes tâches ouvertes »',
      'Sous chaque réponse : « Lire à voix haute ». « lis-moi » lit la dernière réponse. Dans les réglages, la lecture automatique de chaque réponse (pour la route).',
      '« qu’est-ce qui manque pour Shoval » : tout ce qui est encore ouvert dans le dossier, par thème',
      '« qu’est-ce qui manque chez les fournisseurs de Shoval » : seulement les fournisseurs, l’impression et l’argent avec eux',
      '« qu’est-ce qui est ouvert avec le client Shoval » : seulement l’événement et le client'
    ] },
    { title: 'L’état du travail, en une phrase', items: [
      '« qui n’a pas répondu » : la liste, avec « rappel à tous »',
      '« envoie un rappel à Gershon Tours » / « rappelle tous les fournisseurs »',
      '« où en est l’hôtel Daniel » : l’état du fournisseur sur les événements ouverts',
      '« on prend l’hôtel Daniel » : le fournisseur est marqué confirmé',
      '« j’ai payé Daf Or 500 » : noté payé, et la demande de facture est prête. « combien on a payé à Biscotti »',
      '« marque la visite comme faite » / « annule la tâche de la visite » / « reporte la tâche visite à jeudi »',
      '« annule la dernière action » / « reviens en arrière » (ou le bouton « Annuler » sous la réponse) : la dernière chose enregistrée est reprise : tâche, note, rappel, marquage fait, report, fournisseur choisi, ligne d’impression',
      '« tâche pour Dana : appeler la salle jeudi » / « tâche : envoyer le devis demain à 10 » : la date et l’heure viennent de la phrase. Sans date : demain',
      '« note un appel avec Arbel demain à 10 »',
      '« ajoute à l’impression 20 badges pour Shoval »',
      '« quel est le budget de Shoval » / « combien de participants pour Bertelsmann » / « quand est l’événement de Shoval »'
    ] },
    { title: 'Participants, budget, déroulé, fichiers, contrat, check-list, rappels, tableau et historique', items: [
      '« ajoute un participant à Shoval : Dana Cohen 052-1234567 végétarienne » (plusieurs lignes possibles, une par personne). « combien ont confirmé pour Shoval » / « qui n’a pas encore confirmé pour Shoval » / « liste pour l’hôtel de Shoval » : la liste par chambres, avec « Copier »',
      '« quelle est la marge de Shoval » / « combien coûtent les fournisseurs pour Bertelsmann » / « quel est l’échéancier de Shoval » / « combien reste à payer pour Shoval » : depuis l’onglet « Budget », avec ses alertes',
      '« qu’est-ce qu’il y a maintenant au programme » / « et après » : l’événement du jour (ou le prochain), ce qui est en cours, la suite et les retards. « passe en mode jour J » ouvre le mode jour J',
      '« feuille de route pour Gershon Tours pour Shoval » : le texte prêt, avec « Copier » et « WhatsApp »',
      '« quels documents manquent pour Shoval » / « où est le menu de Shoval » (aussi contrat, devis, assurance, facture, photos) : les fichiers trouvés, avec « Ouvrir »',
      '« ouvre un groupe de travail pour Shoval avec Dana, Rotem et Marina » : une carte avec les personnes (de tes listes, par prénom), puis la question : WhatsApp / mail / brief / une tâche pour chacun. Réponds à voix haute ou en tapant. « ajoute Ofer » ajoute. Le groupe est gardé dans l’onglet « Groupe de travail » de l’événement.',
      '« que manque-t-il au contrat de Shoval » / « le contrat de Shoval est-il signé »',
      '« que reste-t-il sur la check-list de Shoval » / « qu’est-ce qu’il y a cette semaine sur la liste de Bertelsmann »',
      '« quels sont mes rappels » / « qu’est-ce qui est urgent » : les rappels, chacun avec son lien. « marque les rappels comme lus »',
      '« passe Shoval en gagné » / « le dossier de Shoval est perdu » : le dossier change de colonne sur le tableau (avec « Annuler »)',
      '« qu’est-ce qui a changé aujourd’hui dans Shoval » / « quoi de neuf récemment » : l’historique, avec le lien vers le dossier'
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
      '« enregistre le téléphone de Roy 052... »',
      'Quand un message est ouvert : « envoie » seul appuie sur WhatsApp. « enregistre comme modèle visite » le garde, et ensuite « envoie à Dana le modèle visite » ({nom} devient le prénom).'
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
      'You can also type instead of dictating, then tap “Read”.',
      'Invoice request to Roy: “invoice for B.D. of 10,000 before VAT for the production of Haim and Moshe”. A client from the list is recognised (even spelled out by voice), its company number and address fill in by themselves. “send by mail to Roy” opens the mail instead of WhatsApp.'
    ] },
    { title: 'From the computer', items: [
      'On a wide screen the menu moves to the side and cards line up in columns. Same data, same cloud.',
      '“More” → “Dashboard”: upcoming events, overdue tasks, calls, unpaid money, suppliers who have not answered.',
      '“More” → “Calendar”: month / week / list with events, tasks, calls and payments.',
      'On the event card: participants (rooming list, dietary needs, confirmations), contract (sign on screen), checklist, history, budget (supplier cost vs client price, margin, payment schedule), run of show (call sheets, day-of mode), files (quotes, menus, certificates, photos).',
      '“More” → “Event board”: kanban by status, drag between columns, conversion statistics.',
      '“More” → “Reminders”: silent supplier, quote waiting, late invoice, event in 14/7/1 days, missing confirmations, unsigned contract. Per-rule settings, browser notifications, quiet hours.',
      'A “Copy” button next to every text, phone, e-mail and address.'
    ] },
    { title: 'Moving between screens: “go to ...” then the screen name', items: ['“go to suppliers”, “go to tasks”, “go to today”', 'The screens: today, cases, suppliers, clients, tasks, calls, quotes, money, receipts, notes, groups, search, settings, new lead, help', '“show me the ...” works too. The name alone, without “go to”, does not move you: a word inside a sentence never moves you by mistake.'] },
    { title: 'Questions', items: [
      '“what do I have tomorrow” / “my tasks for today” / “what is on this week” / “tasks on tuesday” / “tasks for 15/10”',
      '“what are my open tasks”',
      'Under every answer: “Read aloud”. “read it to me” reads the last answer. In settings, automatic reading of every answer (for driving).',
      '“what’s missing for Shoval” / “what is open on the Bertelsmann event”: everything still open in the case, by topic',
      '“what do I need from the suppliers for Shoval”: only suppliers, print and money with them',
      '“what is open with the client Shoval”: only the event details and the client'
    ] },
    { title: 'The state of work, in one sentence', items: [
      '“who hasn’t answered”: the list, with “remind everyone”',
      '“send a reminder to Gershon Tours” / “remind all suppliers”',
      '“what’s up with Daniel hotel”: the supplier across the open events',
      '“go with Daniel hotel”: the supplier is marked confirmed',
      '“I paid Daf Or 500”: noted as paid, and the invoice request is ready. “how much did we pay Biscotti”',
      '“mark the tour as done” / “cancel the task tour” / “postpone the task tour to Thursday”',
      '“undo” / “go back” (or the “Undo” button under the answer): the last saved thing is taken back: task, note, reminder, mark done, postpone, chosen supplier, print line',
      '“task for Dana: call the venue by Thursday” / “task: send the quote tomorrow at 10”: the date and time come from the sentence. No date: tomorrow',
      '“log a call with Arbel tomorrow at 10”',
      '“add to the print list 20 name tags for Shoval”',
      '“what is the budget of Shoval” / “how many participants for Bertelsmann” / “when is the event of Shoval”'
    ] },
    { title: 'Participants, budget, run of show, files, contract, checklist, reminders, board and history', items: [
      '“add a participant to Shoval: Dana Cohen 052-1234567 vegetarian” (several lines work, one per person). “how many confirmed for Shoval” / “who hasn’t confirmed for Shoval” / “rooming list for Shoval”: the list by rooms, with “Copy”',
      '“what is the margin of Shoval” / “how much do the suppliers cost for Bertelsmann” / “what is the payment schedule for Shoval” / “how much is still open for Shoval”: from the “Budget” tab, with its warnings',
      '“what’s on now” / “what’s next on the run sheet”: today’s event (or the next one), what is running, what comes next and what is late. “go to day-of mode” opens the day-of mode',
      '“call sheet for Gershon Tours for Shoval”: the text ready, with “Copy” and “WhatsApp”',
      '“which documents are missing for Shoval” / “where is the menu of Shoval” (also contract, quote, insurance, invoice, photos): the files found, with “Open”',
      '“open a working group for Shoval with Dana, Rotem and Marina”: a card with the people (from your lists, by first name), then the question: WhatsApp / mail / brief / a task for everyone. Answer by voice or tap. “add Ofer” adds. The group is kept in the event’s “Working group” tab.',
      '“what’s missing for the contract of Shoval” / “is the contract of Shoval signed”',
      '“what’s left on the checklist of Shoval” / “what’s due this week on the checklist of Bertelsmann”',
      '“what are my reminders” / “what’s urgent”: the reminders, each with its link. “mark the reminders as read”',
      '“move Shoval to won” / “the lead of Shoval is lost”: the case moves on the event board (with “Undo”)',
      '“what changed today in Shoval” / “what changed recently”: the history, with a link to the case'
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
      '“save the phone of Roy 052...”',
      'When a message is on screen: “send” alone taps WhatsApp. “save as template tour” keeps it, and next time “send Dana the template tour” ({name} becomes the first name).'
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
