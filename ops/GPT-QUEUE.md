# תור משימות ל-GPT (Codex) וספר הרצה לסשן מקומי

שימוש: סשן Claude מקומי (עם Claude in Chrome על המחשב של רועי) פותח משימות חדשות ב-ChatGPT Codex ברצף, כשהקודמת הסתיימה ונדחפה ל-GitHub, ומעביר שיחות שהסתיימו לארכיון.

## כללי בטיחות (חובה)
- לעבוד רק בדף של ChatGPT Codex, בריפו `roynaor-work/Bakasun`. לא לגעת בשיחות אחרות (למשל "TASK-024 ...", קוקטיילים, דף אירועים).
- **לא למחוק שיחות. רק לארכב** (Archive), ורק שיחה שהענף שלה כבר ב-GitHub.
- להדביק רק את הנוסח מהתור, בלי לשנות, בלי להוסיף פרטים אישיים, מיילים או סודות.
- לא לשלוח הודעות, מיילים או פוסטים בשם רועי. לא לאשר רכישות, קרדיטים או שדרוג תוכנית.
- אם מופיעה בקשת אישור, התחברות, תשלום או הודעת "הגעת למגבלה": לעצור ולדווח לרועי. לא להמשיך.
- אם משהו נראה שונה מהמצופה (ממשק שהשתנה, שגיאה): לעצור אחרי ניסיון אחד, לרשום מה קרה.
- לרוץ לפחות 5 שעות רצוף או עד שרועי כותב "הגעתי וחזרתי". לא יותר מ-12 משימות בסך הכול.

## נוהל כל 30 דקות
1. פתיחת https://github.com/roynaor-work/Bakasun/branches (או `git ls-remote`) ובדיקה אם הענף של המשימה הנוכחית `codex/<שם>` קיים.
2. אם קיים: לארכב את השיחה שלו ב-ChatGPT, ולפתוח שיחה חדשה בריפו `roynaor-work/Bakasun`, להדביק את המשימה הבאה בתור, ולשלוח.
3. אם לא קיים: להמתין עוד 30 דקות. אם עברו שלוש שעות בלי ענף: לדווח לרועי ולעבור למשימה הבאה (לא לארכב).
4. לרשום בסוף כל סבב שורה בקובץ `ops/GPT-QUEUE.md` מקומית (לא לדחוף): מספר המשימה, שעה, מה נעשה.

## התור (לפי סדר)

### 1. codex/kid-ux-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/kid-ux-patches-v1. רמת חשיבה: ultra.
אילוצים: בלי WASM, JavaScript בלבד, בלי שינוי קבצים קיימים (תוצר הוא קבצי patch שלא מוחלים), כל שינוי מאחורי דגל URL שמחזיר את הקודם.
מטרה: patch ובדיקה לכל אחד מ-40 ממצאי ביקורת הנגישות ב-workout/island/design/kid-ux-audit-v1/REPORT.md (ענף codex/kid-ux-audit-v1), בעדיפות P1 ואז P2: יעדי לחיצה לפחות 44 פיקסל, טקסט 14 ומעלה, ניגודיות 4.5:1, הוראות ללא קריאה (איור או הדגמה), תיקון כפתור שמיעת ההוראות, יציאה ברורה מהמשחקים, כפתורי פעולה בסיום שלא יורדים מתחת לקפל. לכל תיקון בדיקה שנכשלת לפני ועוברת אחרי, והוכחה בדפדפן מגע 844x390.
תוצר: workout/island/design/kid-ux-patches-v1/ עם patches/, tests/, REPORT.md (טבלה: ממצא, patch, לפני/אחרי, סיכון, סדר החלה), apply.sh (על עותק נקי). אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 2. codex/strings-patches-v1 (high)
```
repo roynaor-work/Bakasun, ענף חדש codex/strings-patches-v1. רמת חשיבה: high.
אילוצים: בלי WASM, בלי שינוי קבצים קיימים (תוצר הוא patch שלא מוחל).
מטרה: להפוך את הצעות ההחלפה של ביקורת הטקסטים (workout/island/design/strings-audit-v1, ענף codex/strings-audit-v1, strings.patch.json ו-487 ההצעות, ו-14 התיקונים בהרכבת טקסט והקראה) ל-patch אחד או כמה ל-workout/island/data/strings.he.json ולקוד המרכיב טקסטים, עם בדיקות (JSON תקין, אין מפתחות כפולים או חסרים, ניקוד מלא בטקסטי ההקראה, בלי ערבית, בלי סימני קריאה במערכת).
תוצר: workout/island/design/strings-patches-v1/ עם patches/, tests/, REPORT.md, apply.sh (על עותק נקי). אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 3. codex/balance-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/balance-patches-v1. רמת חשיבה: ultra.
אילוצים: בלי WASM, בלי שינוי קבצים קיימים (תוצר הוא patch שלא מוחל), כל כוונון מאחורי דגל URL.
מטרה: ליישם כ-patch את המלצות הכוונון של workout/island/design/balance-sim-v1/REPORT.md (ענף codex/balance-sim-v1): כיבוי אש שלבים 7-10 (קיר קושי), שלושה כוכבי תעודה בלתי אפשריים בשלבים 1, 2, 11 ו-13, תגמול 3 כוכבים בפושע, יעדי בונוס בכדורגל שלא נבחרים בליגה, ועוד. לכל כוונון: מדידה לפני/אחרי בסימולציית הבוטים של balance-sim-v1 (שלוש רמות), ובדיקה.
תוצר: workout/island/design/balance-patches-v1/ עם patches/, tests/, sim/ (הרצה חוזרת), REPORT.md, apply.sh (על עותק נקי). אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 4. codex/test-fixes-patches-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/test-fixes-patches-v1. רמת חשיבה: max.
אילוצים: בלי WASM, בלי שינוי קבצים קיימים (תוצר הוא patch שלא מוחל), אסור להחליש בדיקה.
מטרה: ליישם כ-patch את 13 התיקונים המוצעים בביקורת הבדיקות (workout/island/design/test-audit-v1, ענף codex/test-audit-v1): בדיקות שבודקות מימוש במקום התנהגות, בדיקות לא יציבות (כשלי עומס, דליפת שרת: timeouts, ניקוי תהליכים, תלות בסדר), וכיסוי חסר. בנוסף: למנוע את הכשל שחזר פעמיים (בדיקות שבודקות "אין תג ישן" שמתהפכות בהעלאת גרסה): להחליף בבדיקה יציבה שלא תלויה במספר הגרסה.
תוצר: workout/island/design/test-fixes-patches-v1/ עם patches/, tests/, REPORT.md (לפני/אחרי: זמן הרצה ויציבות), apply.sh (על עותק נקי). אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 5. codex/privacy-fixes-patches-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/privacy-fixes-patches-v1. רמת חשיבה: max.
אילוצים: בלי שינוי קבצים קיימים (תוצר הוא patch שלא מוחל). אסור לכלול בדוח או בתוצרים סודות או מידע אישי, רק מיקומים. אסור להציע כתיבה מחדש של היסטוריית Git בלי תיאור סיכונים והחלטה נפרדת.
מטרה: patch לתיקון ממצאי הביקורת workout/island/design/privacy-audit-v1 (ענף codex/privacy-audit-v1), בלי פעולות הרסניות: (PA-001) הסרת מידע אישי מהקבצים הנוכחיים בריפו (מסמכי הוראות, דוחות, צילומי verification) והחלפה בהפניה לדלי הפרטי, (PA-003) הפרדת מפתחות אחסון בין האפליקציות, (PA-011) אימות יעד הרשאת העלאת מצלמה מול רשימה מאושרת, ועוד לפי חומרה. ובנפרד: מסמך הצעת ניקוי היסטוריה (git filter-repo) עם שלבים, סיכונים ותוצאות, בלי להריץ.
תוצר: workout/island/design/privacy-fixes-patches-v1/ עם patches/, tests/, REPORT.md, HISTORY-CLEANUP-PLAN.md, apply.sh (על עותק נקי). אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 6. codex/racing-tracks-v3 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/racing-tracks-v3. רמת חשיבה: max.
אילוצים: בלי WASM ובלי Draco/meshopt/KTX2, הכול מקומי, בלי שינוי קבצים קיימים.
מטרה: 6 מסלולים חדשים למשחק המרוצים ב-workout/island: נתוני מסלול (JSON תואם לפורמט ב-workout/island/minigames/racing-tracks.mjs, קרא אותו) עם קווי ציר, רוחב, פינות, ישורת פיט, אזורי יציאה, DRS, וגשרים. לכל מסלול נושא (עיר בלילה, מדבר, חוף, הרים, יער, שלג), שמיים, 8 אביזרי צד, ושלושה מצבי מזג. 
תוצר: workout/island/design/racing-tracks-v3/ עם tracks/*.json, assets/, preview.html (844x390, מציג מסלול ומסלול רכב), בדיקות node (אורך מסלול סגור, אין חפיפות), REPORT.md, LICENSES.md. עד 8MB. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 7. codex/fire-interiors-v3 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/fire-interiors-v3. רמת חשיבה: max.
אילוצים: בלי WASM ובלי Draco/meshopt/KTX2, הכול מקומי, בלי שינוי קבצים קיימים.
מטרה: הרחבת בנייני כיבוי האש ב-workout/island מעל codex/fire-multifloor-v2: קומות 4 עד 10, גג עם מדרגות יציאה, חדר מדרגות מלא, מעלית (לא בשימוש בשריפה), מסדרון עם דלתות, 6 סוגי חדרים חדשים (חדר ילדים, משרד, חנות, מטבח מסעדה, מחסן, חדר מדרגות), כל אחד עם burn_/intact_/burnt_/fire_ כמו fire-rooms-v1, שלושה מצבי עשן, אפקט הצפה.
תוצר: workout/island/design/fire-interiors-v3/ עם manifest.json, preview.html (844x390), LICENSES.md, REPORT.md. עד 8MB, Khronos נקי. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 8. codex/tennis-motion-v3 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/tennis-motion-v3. רמת חשיבה: ultra.
אילוצים: בלי WASM ובלי Draco/meshopt/KTX2, בלי שינוי קבצים קיימים.
מטרה: השלמת תנועות הטניס על השלד הקנוני בן 18 עצמות מעל codex/tennis-motion-v2 (אל תחזור על קליפים שקיימים שם): 18 קליפים ב-30Hz: משחק ליד הרשת (וולי נמוך, וולי גבוה, חצי וולי), לוב, ביטול לוב (סמאש לאחור), החזר הגשה חזק, מגננה (חיתוך מגן), ריצה לצד ושינוי כיוון, החלקה לכדור, נפילה וקימה, ניצחון נקודה ושמחה ילדותית, אכזבה, לחיצת ידיים בסיום, הדרכה (מדגים לילד איך להגיש).
QA עם motion-qa-v1 מעל 88. תיקייה חדשה בלבד: workout/island/design/tennis-motion-v3/ עם GLB, catalog.json, גיליון 8 פריימים לכל קליפ, preview.html (844x390), LICENSES.md, REPORT.md. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 9. codex/alpine-runner-themes-v2 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/alpine-runner-themes-v2. רמת חשיבה: max.
אילוצים: בלי WASM ובלי Draco/meshopt/KTX2, הכול מקומי, בלי שינוי קבצים קיימים, נכסים מקוריים בלבד.
מטרה: 6 ערכות נושא לראנר הסקי ב-workout/island מעל codex/alpine-runner-v1: יער, קרח, לבה (קפואה), אורורה, כפר, פסגה. לכל נושא: 8 אריחי מסלול של 30 מטר, רקע בשלוש שכבות פרלקסה, 10 אביזרי צד, אפקט מזג (שלג, ערפל, זוהר), ושלט התחלה/סיום. 
תוצר: workout/island/design/alpine-runner-themes-v2/ עם manifest.json, preview.html (844x390), LICENSES.md, REPORT.md. עד 8MB, Khronos נקי. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 10. codex/ui-icons-v2 (extra high)
```
repo roynaor-work/Bakasun, ענף חדש codex/ui-icons-v2. רמת חשיבה: extra high.
אילוצים: בלי WASM, בלי טקסט שנשרף (עברית RTL בקוד), בלי מותגים, בלי שינוי קבצים קיימים.
מטרה: ערכת אייקונים אחידה לכל משחקי workout/island: 120 אייקוני HUD (נשקים, כלי כיבוי, מתקנים, בונוסים, מגן, האצה, מטבע, כוכב, שעון, לב, מפתח, שער, דגל, פיט, צמיגים, מד מהירות, כיוון, בלימה, קפיצה, החלקה, נעילה, מכ"ם, וגל אותות) בשלושה מצבים (רגיל, לחוץ, מושבת) ב-SVG ו-PNG 96, יעד לחיצה 56. 
תוצר: workout/island/design/ui-icons-v2/ עם manifest.json (שמות ותיוג לפי משחק), preview.html (844x390), LICENSE.txt, REPORT.md. עד 2MB. אסור לערוך קבצים קיימים. push בסוף והדוח.
```
