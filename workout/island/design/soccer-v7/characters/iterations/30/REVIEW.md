# סבב 30 — בדיקת פה ובקרת חומרים

זהו סבב מועמדים מבודד, ולא גרסת החבילה שנבחרה. גאומטריית candidate30 היא P02/P04, ‏Face27, ‏Hair24, ‏mouthCompression=.25 וצבע עיניים בסיסי 1 בקובץ. היא נשארת תחת source/character-candidates30/; קובצי live24 לא שונו.

החלטת Root לאחר ההשוואה: לשמור פה .40 ו־Skin normalScale=.5, לבחור במכפיל צבע Eyes/EyesCornea ‏.88 בלבד, ולשלב Face27 ו־crown29 כשיפורים מתונים. אין להסיק מצילומי core30 שהניסוי .25/Hair24 הוא בחירת הסיום.

ביקורת עצמית: השחרור ל־.25 מוסיף מעט מלאות לשפתיים, אך ב־P02 מרחיב מעט את החריץ השחור במרכז ובפינה הימנית בתמונה. ב־P04 ההבדל קטן; אין שיניים נראות בשני המסלולים. מכפיל העיניים .88 מרסן מעט את הלובן, בעוד העלאת normalScale של העור ל־1.25 אינה מוסיפה רווח ברור בגודל הטלפון. אין שיפור שמצדיק ציון 8 אוטומטי לפנים או לביגוד.

## ראיות קרוב ורחוק

נוצרו שמונה רינדורי PBR אמיתיים חדשים ב־[preflight/core](preflight/core/capture.json), עם frozen86, פריים idle קבוע, DPR1.5 וצילום CSS. near משתמש ב־body, ‏zoom1 ו־LOD0; far מרחיק בפועל את המצלמה באמצעות zoom1.55 ומשתמש ב־LOD1. זו ראיית מרחקי צפייה למועמד, ולא השוואה מבודדת של איכות LOD או מדידת fps.

| דמות | קרוב 390×844 | רחוק 390×844 | קרוב 844×390 | רחוק 844×390 |
|---|---|---|---|---|
| player-02 | [body-near](preflight/core/player-02-body-near-390x844.png) | [body-far](preflight/core/player-02-body-far-390x844.png) | [body-near](preflight/core/player-02-body-near-844x390.png) | [body-far](preflight/core/player-02-body-far-844x390.png) |
| player-04 | [body-near](preflight/core/player-04-body-near-390x844.png) | [body-far](preflight/core/player-04-body-far-390x844.png) | [body-near](preflight/core/player-04-body-near-844x390.png) | [body-far](preflight/core/player-04-body-far-844x390.png) |

24 צילומי הפה המלאים ושתי מערכות הבקרה נמצאים ב־[MOUTH-REVIEW.md](preflight/MOUTH-REVIEW.md), [MOUTH-CONTROLS.json](preflight/MOUTH-CONTROLS.json) וב־[סקירת 16 פריימי החומרים](preflight/material-controls/REVIEW.md). צילומי חזית ושלושה רבעים קיימים בשני גדלי הטלפון; אבחון close-mouth הוא צילום full-phone נפרד, ללא חיתוך או שינוי תמונה.

הסייג המקורי נשמר: sidecar המצלמה של candidate25/P02/face-front/844×390 נקרא לפני עדכון resize ורושם aspect של פורטרט. אין מצלמה מומצאת או תיקון רטרואקטיבי לאותו JSON. יתר 11 רשומות המצלמה תואמות בדיוק, ובפרט כל ארבע מצלמות close-mouth. ה־PNG עצמו נבדק חזותית וראיות הפיקסלים נרשמו בדוח המפורט. בבקרת החומרים וב־core נעשתה המתנה ל־RAF/resize לפני מדידת המצלמה.

כל שש טקסטורות candidate30 זהות בייט־לבייט ל־baseline27. ארבעת קובצי Draco נשארים מתחת ל־1.5MB: near ‏P02=939,048B ו־P04=946,692B; far ‏500,844B ו־555,096B. כל 41 קובצי live24 תואמים לתמונת המצב המקורית. ה־hashes, מצלמות, הגדרות וזמני הפריים נמצאים ב־capture.json בכל תיקיית ראיות. אין שגיאות JavaScript או בקשות חיצוניות בצילומים; כל Chromium של סבב30 נסגר.

כל הראיות כאן הן למועמד ובדיקה נקודתית. בחירת Root תיושם בנפרד אחרי בדיקות ההמשך והקפאת מטריצת הסיום; קבצים אלה אינם מצהירים על השלמת יעד איכות EA FC Mobile.

בבדיקת core30 נראה פגם נוסף במועמד הישן: [P02 far390](preflight/core/player-02-body-far-390x844.png) חושף פערי קרקפת גדולים ב־LOD1. זה אינו תיעוד של תיקוןFarCap32; לתיקון ההוא נדרשות ראיות משל עצמו במועמד/מטריצה32.
