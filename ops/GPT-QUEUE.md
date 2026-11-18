# תור משימות ל-GPT (Codex) וספר הרצה לסשן מקומי

שימוש: סשן Claude מקומי (עם Claude in Chrome על המחשב של רועי) פותח משימות חדשות ב-ChatGPT Codex ברצף, כשהקודמת הסתיימה ונדחפה ל-GitHub, ומעביר שיחות שהסתיימו לארכיון.

## כללי בטיחות (חובה)
- לעבוד רק בדף של ChatGPT Codex, בריפו `roynaor-work/Bakasun`. לא לגעת בשיחות אחרות (למשל "TASK-024 ...", קוקטיילים, דף אירועים).
- **לא למחוק שיחות. רק לארכב** (Archive), ורק שיחה שהענף שלה כבר ב-GitHub.
- להדביק רק את הנוסח מהתור, בלי לשנות, בלי להוסיף פרטים אישיים, מיילים או סודות.
- לא לשלוח הודעות, מיילים או פוסטים בשם רועי. לא לאשר רכישות, קרדיטים או שדרוג תוכנית.
- אם מופיעה בקשת אישור, התחברות, תשלום או הודעת "הגעת למגבלה": לעצור ולדווח לרועי. לא להמשיך.
- אם משהו נראה שונה מהמצופה (ממשק שהשתנה, שגיאה): לעצור אחרי ניסיון אחד, לרשום מה קרה.
- לרוץ לפחות 5 שעות רצוף או עד שרועי כותב "הגעתי וחזרתי". לא יותר מ-25 משימות בסך הכול (עודכן 18/11: רועי אישר ריצה רצופה ויש לו איפוס נוסף).

## שבעת כללי ההרצה (נוספו 18/11, חלים על כל משימה בתור הבא)
1. **הרצה במקביל כברירת מחדל.** ברצף רק משימות שתלויות זו בזו.
2. **משימת שמע:** לכתוב בפרומפט "אין קלט שמע בסביבה, אל תפעיל ניגון בדפדפן, בדוק בקוד ובגודל, ובדוח כתוב שהניגון לא נבדק".
3. **דחיפה מיד אחרי יצירת הקבצים**, ורק אחר כך בדיקות ותיקונים בקומיט נוסף.
4. **ב-REPORT.md לרשום על איזה קומיט של main נבנתה המשימה.**
5. **תקרת גודל לכל משימה** (מספר קבצים ומספר שורות). קבצים שנוצרים אוטומטית נשמרים כסקריפט ולא כפלט.
6. **בדיקת ענפים בפקודה `git ls-remote` מהמעטפת**, לא דרך דפדפן. דפדפן רק לארכוב, ובסוף לוודא שרשימת השיחות ב-Codex ריקה.
7. **לרשום שעת שליחה לכל משימה** (בשורת הרישום של סוף כל סבב).

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

## תוספת 18/11 (עדיפות גבוהה: להכניס לפני 1-10 אם עוד לא התחילו)

### 11. codex/racing-audio-v6 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/racing-audio-v6. רמת חשיבה: ultra.
אילוצים: בלי WASM, הכול מקומי, סינתזה מקורית, ogg+mp3 עד 60KB כל אחד, נורמליזציה -18 LUFS, אין קליק בלולאות, אין קו טונאלי חד מעל 2 קילוהרץ.
רקע (ציטוט רועי): "לשפר את הקול כאשר יש עקיפה / בהתחלה צריך רעש של מנוע עומד / מציע לבדוק את הרעש במירוץ אמיתי של פורמולה 1 / יש עדיין רעש מעצבן כאשר יש מעט חריגה מהחלק של המסלול / אותו רעש גם שיורדים לפיטס".
מטרה: ערכת צליל פורמולה 1 מקורית ל-workout/island: (1) מנוע עומד בזינוק (לולאה, סל"ד נמוך עם רטט), רמזור וזינוק, (2) מנוע בסל"ד עולה ויורד כמו מכונית פורמולה אמיתית (שלוש עוצמות), (3) עקיפה: אפקט Doppler קצר ורוח (3 וריאציות), (4) חריגה קלה מהמסלול: קצה אספלט וקרבה רכה, בלי רעש לבן חד (לולאה), (5) נתיב פיט: מנוע נמוך ומגביל מהירות בלי צפצוף (לולאה) ורעש רקע עדין, (6) חריקות ובלימה רכות. מדידת ספקטרום לפני ואחרי מול codex/racing-audio-v5 (קריאה בלבד).
תוצר: workout/island/design/racing-audio-v6/ עם manifest.json, listen.html, synthesize.py, REPORT.md, LICENSE.txt. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 12. codex/fire-rescue-actions-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/fire-rescue-actions-v1. רמת חשיבה: ultra.
אילוצים: בלי WASM ובלי Draco/meshopt/KTX2, הכול מקומי, בלי שינוי קבצים קיימים.
רקע (ציטוט רועי): "בחילוץ צריך גם פעולת חילוץ ולא לחיצה על ירי מים".
מטרה: פעולות חילוץ אמיתיות בכיבוי אש על השלד הקנוני בן 18 עצמות, מעל codex/fire-rescue-people-v2 ו-firefighter-v1: 14 קליפים ב-30Hz: ניקוי דרך (הזזת מכשול), פתיחת דלת תקועה, חיתוך עם כלי, הרמת ילד, נשיאה על הכתף, נשיאה בידיים, הנחה בבטחה, עטיפת שמיכה, תמיכה בהליכה, משיכה מתחת לשולחן, הרמת חתול, פתיחת כלוב, סימון "פנוי", מסירה לחובש. לכל פעולה אייקון כפתור (SVG 96), שעון קצר (1.5-3 שניות), וחיבורי אביזרים.
QA עם motion-qa-v1 מעל 88. תיקייה חדשה בלבד: workout/island/design/fire-rescue-actions-v1/ עם GLB, catalog.json, icons/, preview.html (844x390), LICENSES.md, REPORT.md. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 13. codex/tennis-callouts-v1 (extra high)
```
repo roynaor-work/Bakasun, ענף חדש codex/tennis-callouts-v1. רמת חשיבה: extra high.
אילוצים: בלי WASM, הכול מקומי, סינתזה מקורית, ogg+mp3 עד 40KB.
רקע (ציטוט רועי): "בהגשה רעה שהכדור ימשיך עד הסוף ולא יעצור פתאום / אם זה בחוץ שיהיה צעקה של OUT אם זה נתקע ברשת NET".
מטרה: צעקות שופט ושלטים בטניס ב-workout/island: צליל "אאוט" (שופט קו, קצר וברור, 3 וריאציות), "נט" (נתקע ברשת, 3 וריאציות), "טוב" (3 וריאציות), "פולט" (2), צעקת קהל קצרה בכל אחד, ובנוסף ויזואל: שלטי OUT ו-NET כגרפיקה בלי טקסט שנשרף (SVG ו-PNG 256, שני סגנונות), והבזק קו נפגע. סינתזת קול אנושי מקורית פשוטה (לא דיבור אמיתי, צורת אות עם פורמנטים), ללא דגימות חיצוניות.
תיקייה חדשה בלבד: workout/island/design/tennis-callouts-v1/ עם manifest.json, listen.html, preview.html (844x390), synthesize.py, REPORT.md, LICENSE.txt. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 14. codex/boars-levels-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/boars-levels-v1. רמת חשיבה: max.
אילוצים: בלי WASM, הכול מקומי, בלי שינוי קבצים קיימים.
רקע (ציטוט רועי): "מעולה כולל מסכי גשם וערפל, אפשר לשפר עוד את המסכים בהמשך, ואחרי זה לעלות רמת קושי / ועוד שלבים עם רמות קושי עולות / עוד שיפורי נשקים להמשך".
מטרה: חבילת תוכן לחזירים ב-workout/island מעל codex/boars-world-v1 ו-boars-weapons-v2: 20 שלבים נוספים (JSON: גלים, סוגי חזירים, פריסה, מזג אוויר, יעד), 6 מסכי מזג משופרים (גשם, ערפל, שלג, לילה, סערה, שקיעה) כטקסטורות ושכבות אור, 12 שדרוגי נשק חדשים (שם, אפקט, מחיר, אייקון SVG 96), טבלת התקדמות קושי הדרגתית (פרמטרים בלבד).
תיקייה חדשה בלבד: workout/island/design/boars-levels-v1/ עם levels.json, weather/, upgrades.json, icons/, preview.html (844x390), REPORT.md, LICENSES.md. עד 6MB. אסור לערוך קבצים קיימים. push בסוף והדוח.
```


## תוספת 18/11 (ערב): משימות שחוסכות עבודה ל-Claude/Fable (תוצר: patches מוכנים להחלה, לא נכסים)
כלל לכל המשימות כאן: לבנות את ה-patches מול `origin/main` העדכני ביום הריצה (git fetch לפני), להריץ `apply.sh` על עותק נקי ולוודא שהבדיקות הממוקדות עוברות (כולל `node workout/island/tools/offline-shell.mjs`), רשימות האופליין ממוינות, בלי WASM, כל שינוי מאחורי דגל URL שמחזיר את הקודם, בלי לשנות קבצים קיימים (תוצר patch בלבד), ובדוח: לפני/אחרי נמדד, סיכון וסדר החלה.

### 15. codex/naval-battle-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/naval-battle-patches-v1. רמת חשיבה: ultra.
רקע (ציטוט רועי): "ספינות עובד מעולה / אפשר להגדיל את הכמות אויבים בהתחלה מאחר ויש הרבה חיים ואת כמות הירי שלהם גם / לא להקשות יותר מידי אבל להגדיל את הנפח קרב והאורך שלו".
מטרה: patch לכוונון משחק הספינות ב-workout/island (קרא workout/island/minigames/naval*.mjs ואת workout/island/data/config.json): יותר אויבים בהתחלת השלב, יותר ירי אויב, קרב ארוך ועמוס יותר, בלי להקשות מדי. מדידה בבוטי ילד (שלוש רמות) לפני/אחרי: אחוזי ניצחון (יעד: שלב 1 בין 80% ל-90%, שלבים מאוחרים 40%-60%), אורך קרב (יעד: פי 1.5 עד פי 2), כמות יריות. חבר את codex/naval-sinking-v1 (טביעה ופגיעות) ו-codex/naval-sea-v2 (ים) אם יש בהם תועלת, בנפילה שקטה. דגל חזרה `?navalBattle=0`.
תוצר: workout/island/design/naval-battle-patches-v1/ עם patches/, tests/, sim/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 16. codex/fire-levels-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/fire-levels-patches-v1. רמת חשיבה: ultra.
רקע (ציטוט רועי): "צריך עוד כל שלוש שלבים כניסה לבניין ורמת קושי עולה כולל עוד קומות / בחילוץ צריך גם פעולת חילוץ ולא לחיצה על ירי מים / המרחק שהכבאית יורה מים צריך להיות קצר יותר / המשחק מתחיל עם כבאית במראה ישן ומתחלף אחרי כמה שניות".
מטרה: patch למשחק כיבוי האש ב-workout/island (קרא workout/island/minigames/fire*.mjs ו-fire-v24*.mjs): (א) כניסה לבניין בכל שלב שלישי עם קושי עולה, עוד קומות (3 עד 10) מנכסי codex/fire-multifloor-v2 ו-codex/fire-interiors-v3, (ב) פעולת חילוץ אמיתית (לא ירי מים) לפי codex/fire-rescue-actions-v1 עם כפתור פעולה לפי מצב, (ג) טווח המים של הכבאית קצר יותר, (ד) המשאית נטענת פעם אחת ובאיכות הסופית: אין החלפה מישן לחדש אחרי כמה שניות (מצא את סיבת ההחלפה: טעינה ברמות איכות? תקן בטעינה מוקדמת או בדגם אחד), (ה) מדידה בבוט (ילד סבלני מנצח, ילד שלא עושה כלום כוכב אחד). דגל חזרה `?fireLevels=0`.
תוצר: workout/island/design/fire-levels-patches-v1/ עם patches/, tests/, sim/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 17. codex/hoops-polish-patches-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/hoops-polish-patches-v1. רמת חשיבה: max.
רקע (ציטוט רועי): "כדורסל תקין, צריך שיפור במראה עדין / פגיעה בטבעת צריכה גם שיפור".
מטרה: patch לשיפור מראה עדין ופגיעה בטבעת בכדורסל ב-workout/island: טבעת שרועדת ומתנדנדת בפגיעה (פיזיקה קלה: קפיצה, ריחוף כדור על הטבעת), רשת שזזה וחוזרת לצורה, צליל נקי לכל סוג פגיעה (מתוך codex/hoops-realism-v2 ו-hoops-referee-audio-v1), תאורה עדינה יותר, צל כדור, ליטוש מעברים. לכל שיפור דגל ומדידת עלות ביצועים (משולשים, קריאות ציור). דגל חזרה `?hoopsPolish=0`.
תוצר: workout/island/design/hoops-polish-patches-v1/ עם patches/, tests/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 18. codex/boars-levels-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/boars-levels-patches-v1. רמת חשיבה: ultra.
רקע (ציטוט רועי): "חזירים מעולה כולל מסכי גשם וערפל, אפשר לשפר עוד את המסכים בהמשך ואחרי זה לעלות רמת קושי אם ממשיכים ועוברים, ועוד שלבים עם רמות קושי עולות, ועוד שיפורי נשקים".
מטרה: patch שמחבר את codex/boars-levels-v1 (20 שלבים, 6 מסכי מזג, 12 שדרוגי נשק) למשחק החזירים ב-workout/island/minigames/boar-island/: קבצי נתונים, מסך בחירת שלב, מזג אוויר, מסך שדרוגים, קושי עולה (פרמטרים). בדיקות ובוט (שלוש רמות). דגל `?boarsLevels=0`.
תוצר: workout/island/design/boars-levels-patches-v1/ עם patches/, tests/, sim/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 19. codex/pack-wiring-patches-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/pack-wiring-patches-v1. רמת חשיבה: max.
מטרה: patch שמעתיק ורושם את כל חבילות הנכסים החדשות בצורה מכנית (בלי שינוי התנהגות משחק): לכל חבילה ב-codex/asset-adapters-v1 (copy-plan.sh ו-offline-entries.json): העתקה ל-workout/island/assets/<pack>/ (בלי מקורות וצילומים), רישום ברשימת workout/island/offline-manifest.json (שומר על רשימות ממוינות), רישיון ב-workout/island/ASSETS.md, ועדכון בדיקות סופרות קבצים (racing-v7 ודומיהן) בכוונה ובהסבר. לפי חבילות בלבד: hoops-realism-v2, hoops-motion-v14, hoops-arena-v2, tennis-motion-v2, tennis-ui-v2, soccer-crowd-people-v2, soccer-run-cycles-v3, soccer-keeper-motion-v3, soccer-celebrations-v1, fire-multifloor-v2, fire-rescue-people-v2, fire-fx-v2, alpine-runner-v1, alien-hits-v1, boars-weapons-v2, catch-vehicles-v2, naval-sinking-v1, racing-podium-v1, city-citizens-v1, ui-sounds-v1, lighting-presets-v1. מדידת גודל כולל לכל משחק (יעד: לא יותר מ-30MB למשחק) והצעת חלוקה.
תוצר: workout/island/design/pack-wiring-patches-v1/ עם patches/ (patch לכל חבילה), tests/, REPORT.md (גדלים לפני/אחרי לכל משחק), apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 20. codex/alpine-runner-integration-patches-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/alpine-runner-integration-patches-v1. רמת חשיבה: ultra (תן לזה זמן ארוך).
רקע (ציטוט רועי): "הסקי: שהמסלול יהיה קצת יותר ארוך ויהיה בנוי בצורה של Subway Surfers, להמשיך בדיוק על אותו קו, פשוט לשנות אותו למשחק הזה."
מטרה: patch שמחליף את מצב ה"ראנר" במשחק הסקי ב-workout/island/minigames/alpine-*.mjs בראנר אינסופי בשלושה נתיבים (מכניקה בלבד, נכסים מקוריים): שימוש במחולל המסלול מ-codex/logic-modules-v1 (runner-course-generator) ובנכסי codex/alpine-runner-v1, alpine-runner-themes-v2 ו-alpine-content-v1. שליטה בנגיעה (החלפת נתיב בהחלקה, קפיצה, החלקה), מכשולים, מטבעות, בונוסים, ליגה קיימת נשמרת (דגל `?alpineRunner=0` מחזיר את המשחק הקיים בדיוק), שמירת שיא. בדיקות, מדידת FPS ותקציב משולשים, ובוטים (שלוש רמות).
תוצר: workout/island/design/alpine-runner-integration-patches-v1/ עם patches/, tests/, sim/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

## תוספת 18/11 (ערב מאוחר): העיר, למידה, מצלמה ופרסים (21-25)
אותו כלל החלה כמו 15-20: patches מול `origin/main` העדכני, `apply.sh` על עותק נקי, בדיקות ממוקדות, דגל URL שמחזיר את הקודם, בלי WASM, בלי שינוי קבצים קיימים.

### 21. codex/city-missions-events-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/city-missions-events-v1. רמת חשיבה: ultra (תן לזה זמן ארוך).
אילוצים: בלי WASM, JavaScript בלבד (ES modules), בלי שינוי קבצים קיימים (תוצר patch ומודול חדש בתיקייה), דגל חזרה `?cityMissions=0`.
רקע (ציטוט רועי): "צריך לשפר את המשימות במשחק עצמו בעיר, את הבניה וההתקדמות, אירועים כמו שריפה ואז צריך לעשות שלב בכיבוי אש למשל".
מטרה: מערכת משימות ואירועים לתצוגת "העיר שלי" ב-workout/island (קרא את workout/island/engine/ ואת workout/island/activity/, ואת city-management.mjs, episodes.mjs, progress.mjs): (א) סוגי משימות (בנה, שדרג, אסוף, חבר, שחק משחק, הצל), (ב) אירועים אקראיים ותלויי מצב בעיר (שריפה ← מעבר לשלב כיבוי אש מתאים, פשע ← תפוס את הפושע, אירוע ספורט ← כדורגל/כדורסל/טניס, סערה ← ספינות, ועוד), (ג) תגמולים, (ד) קצב שמתאים לילד בן 7 (לא מציף, לא מעט מדי: משימה אחת פעילה ועוד אחת צפויה). מודול לוגיקה טהורה עם בדיקות (אירוע לא חוזר מיד, אירוע מתאים לרמה, אין לולאה), נתוני משימות ב-JSON, וחיבור לאי כ-patch.
תוצר: workout/island/design/city-missions-events-v1/ עם src/, data/, patches/, tests/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 22. codex/city-progression-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/city-progression-v1. רמת חשיבה: ultra.
אילוצים: בלי WASM, JavaScript בלבד, בלי שינוי קבצים קיימים, דגל חזרה `?cityProgress=0`.
רקע (ציטוט רועי): "צריך לשפר את הבניה וההתקדמות".
מטרה: מודל בנייה והתקדמות לעיר ב-workout/island (קרא workout/island/engine/economy.mjs, metrics.mjs, rules.mjs, city-management.mjs): עץ פתיחה (איזה בניין נפתח מתי), עלויות ותשואות, מסלולי שדרוג, גודל אוכלוסייה, מדדי שביעות רצון, התקדמות בין "ימים" וזמני משחק, בלי "קיר" מוקדם ובלי שעמום. סימולציה (שלושה סגנונות ילד) שמראה עקומת התקדמות, ונקודות תקיעה. שילוב עם 20 הבניינים החדשים ב-codex/city-buildings-v2 ושלבי הבנייה שלהם. patch וכוונון מדוד.
תוצר: workout/island/design/city-progression-v1/ עם src/, data/, sim/, patches/, tests/, REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 23. codex/learning-questions-v2 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/learning-questions-v2. רמת חשיבה: ultra.
אילוצים: בלי WASM, בלי שינוי קבצים קיימים, בלי ערבית ובלי אותיות ערביות, עברית נקייה ופשוטה, ניקוד מלא בטקסטי הקראה (מנוע דיבור), דגל חזרה `?learningV2=0`.
רקע (ציטוט רועי): "שיפור השאלות והרמה שלהם לפי גיל החל מגיל 6 עד גיל 12 בערך".
מטרה: מאגר שאלות והתאמת רמה ללימוד ב-workout/island (קרא את workout/island/learning/ ואת מבנה השאלות הקיים): 600 שאלות לפחות לפי גיל 6 עד 12 ב-5 תחומים (חשבון, עברית, היגיון, ידע כללי וגיאוגרפיה, מדע וטבע), כל שאלה עם רמת קושי, גיל מומלץ, רמז, הסבר קצר אחרי תשובה, ושאלות המשך. בחירה אדפטיבית (עולה כשהצליח, יורד כשנתקע), בלי חזרה קרובה, ובדיקת איכות אוטומטית (תשובה נכונה אחת, אין כפילות, אורך שאלה, ניקוד בהקראה). שילוב עם אירועי העיר (שאלה לפני פתיחת בניין, תגמול).
תוצר: workout/island/design/learning-questions-v2/ עם data/*.json, src/ (בחירה אדפטיבית), patches/, tests/, REPORT.md (התפלגות לפי גיל ותחום), apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 24. codex/workout-camera-exercises-v1 (ultra)
```
repo roynaor-work/Bakasun, ענף חדש codex/workout-camera-exercises-v1. רמת חשיבה: ultra (תן לזה זמן ארוך).
אילוצים: הכול מקומי, בלי רשת בזמן הריצה, בלי שליחת וידאו או תמונות לשום מקום (פרטיות הילד), בלי WASM אלא אם כבר קיים באפליקציה ומותר ב-CSP שלה (בדוק את workout/index.html ואת workout/cam-lab/ ואת ענפי codex/cam-lab-*), בלי שינוי קבצים קיימים (תוצר patch), דגל חזרה.
רקע (ציטוט רועי): "שיפור המצלמה והתרגילים והבדיקה שעושים".
מטרה: שיפור המצלמה והתרגילים והבדיקה (האם הילד באמת עושה את התרגיל) באפליקציית האימון ב-workout/: ביקורת של הצנרת הקיימת (workout/cam-lab, workout/js/count.js, exercises.js, logic.js), ואז patches: (א) יציבות זיהוי תנוחה (החלקה, כשל בתאורה גרועה, שני אנשים בפריים), (ב) ספירת חזרות מדויקת לכל תרגיל (50 התרגילים), עם בדיקות על הקלטות תנוחה מדומות, (ג) בדיקת צורה והסברים ידידותיים לילד (איזה חלק בגוף, איך מתקנים, בלי ביקורת), (ד) מסגור מצלמה וכיול (הנחיה: זוז אחורה, הרם את הטלפון, הדגם), (ה) מצב בלי מצלמה (אימון על אמון) עם הצהרה על הקשיבות. מדידה לפני/אחרי על הקלטות מדומות ובדיקות node.
תוצר: workout/island/design/workout-camera-exercises-v1/ עם REPORT.md (ביקורת וטבלת בעיות), patches/, tests/, fixtures/, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```

### 25. codex/progress-board-praise-v1 (max)
```
repo roynaor-work/Bakasun, ענף חדש codex/progress-board-praise-v1. רמת חשיבה: max.
אילוצים: בלי WASM, בלי שינוי קבצים קיימים, בלי ערבית, עברית נקייה, ניקוד בטקסטי הקראה, בלי סימני קריאה במערכת (מחמאות לילד כן יכולות להיות חמות אבל לא להצעק), דגל חזרה `?progressBoard=0`.
רקע (ציטוט רועי): "לוח שיפור ומחמאות".
מטרה: לוח התקדמות ומחמאות לילד (גיל 6-12) באי ובאפליקציית האימון: (א) לוח: כוכבים השבוע, רצף ימים, תגים (20 תגים: התמדה, שיפור, ניסיון חדש, עזרה לאחרים, מומחה משחק, אומץ), רמות, גרף שיפור פשוט (לא משווה לילדים אחרים), (ב) מחמאות: מאגר של 300 מחמאות מגוונות בעברית ובזכר ונקבה, מדויקות למה שהילד עשה ("השתפרת בכך ש...", לא "אתה מדהים" כללי), לפי גיל, עם גרסה מנוקדת להקראה, (ג) כללי מתי להחמיא (לא יותר מדי, לא על כל פעולה), (ד) נכסי ממשק: אייקוני תגים (SVG 128), אנימציית קבלת תג (8 פריימים), סרט מחמאה, (ה) שילוב כ-patch.
תוצר: workout/island/design/progress-board-praise-v1/ עם data/, src/, assets/, patches/, tests/, preview.html (844x390), REPORT.md, apply.sh. אסור לערוך קבצים קיימים. push בסוף והדוח.
```
