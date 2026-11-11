# הנחיות Codex להדבקה (07/11/2026, רועי: "תכין הכל, אני אעלה לשם")

עשרים ואחת משימות. כל אחת בבלוק נפרד; מדביקים משימה אחת בכל פעם ב-Codex.

## 1. סביבת מירוצים בסגנון פורמולה 1 (רמה: ultra למודלים, extra high למרקמים)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/racing-formula workout/island/minigames
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/racing-environment-v2 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/island/design/racing-environment-v2/
מרקמים (tileable, עד 1024, WebP או JPEG): אספלט נקי, אספלט עם סימוני צמיגים, קרב אדום-לבן (kerb) עם נורמל, חצץ בריחה, דשא (3 וריאציות), בטון/קיר הגנה, מחסום צמיגים, קווי צבע (לבן, צהוב), אספלט פיטס.
דגמים (GLB, מקור במרכז הבסיס, פונה ל-+Z, יחידות מטרים): 1) יציע מודולרי באורך 20 מ' עם קהל מצויר בטקסטורה (עד 4,000 משולשים); 2) בניין פיטס (עד 6,000); 3) שער זינוק עם חמישה רמזורים אדומים כצמתים בשם Light1..Light5 (חומר פולט אור); 4) מגדל שיפוט; 5) מקטע מחסום צמיגים; 6) גדר רשת; 7) שלט חסות כללי (בלי מותג, עם טקסט RACE או מספר). שמות צמתים באנגלית, חומר אחד לכל חלק, UV בלי חפיפה.
תקציב: כל דגם עד 300KB בקובץ ריצה, סך הכול עד 4MB.
מוכן כש: כל דגם נטען ומוצג ב-preview.html עם התאורה, מרקמי האספלט והקרב חוזרים בלי תפר גלוי, דוח עם ספירת משולשים וגודל לכל קובץ, וטבלת שם קובץ וסוג.
```

## 2. צלילי מנוע למירוצים (רמה: high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/racing-formula workout/island/audio
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/racing-audio-v2 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/island/design/racing-audio-v2/
לבנות צלילים מקוריים (סינתזה או הקלטה/עיבוד CC0), לופים חלקים בלי תפר: מנוע פורמולה 1 ב-5 מצבי סל"ד (סרק, נמוך, בינוני, גבוה, קו אדום) באורך 2-4 שניות לכל לופ, עם קבצי manifest.json שמציינים סל"ד אופייני ונקודות לולאה; החלפת הילוך למעלה (קטיעה קצרה ופופ), החלפת הילוך למטה (פופ ופיצוצי פליטה), blow-off של טורבו, התנעה, פיצוצי פליטה קצרים; חריקת צמיגים (לולאה), רעש קרב (rumble) בנגיעה בקרב, רוח לפי מהירות (לולאה), עקיפה (whoosh) של רכב חולף.
פורמט: OGG ו-MP3 לכל קובץ, mono, 44.1kHz, עוצמה אחידה (בערך -16 LUFS), true peak לא מעל -3 dBFS, בלי קליפינג, עד 150KB לקובץ וסך הכול עד 2MB.
preview.html: מחוון סל"ד והילוך (1-7) שעושה מעבר חלק (crossfade) בין הלופים ומנגן החלפות הילוך.
מוכן כש: כל הלופים חלקים (בדיקה אוטומטית של הפרש בין תחילה לסוף), אין קליפינג, העוצמות אחידות, וה-preview מנגן מעבר חלק בין כל המצבים.
```

## 3. צלילי קהל לטניס (רמה: high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/audio workout/island/minigames
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/tennis-crowd-audio-v1 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/island/design/tennis-crowd-audio-v1/
צלילי קהל נעימים, רכים ולא חדים (המחיאות הקיימות "נשמעות על הפנים"): 1) לופ רקע של קהל באצטדיון ספורט (20-30 שניות, חלק, שקט, בלי צעקות בודדות בולטות); 2) מחיאות כפיים קצרות (1.5 שניות), בינוניות (3 שניות) וגדולות (5 שניות) עם עלייה וירידה טבעיות ו"שולחן" של מחיאות לא סינכרוניות; 3) "אוו" של קהל על כמעט-נקודה; 4) "אאוו" על טעות; 5) לחישה ושקט לפני הגשה; 6) תרועה גדולה בסוף משחק. אפשר לעבד קול קהל CC0 או לסנתז בשכבות (רעש ורוד מסונן ושכבות של מחיאות מקריות).
פורמט: OGG ו-MP3, stereo, 44.1kHz, עוצמה אחידה (בערך -18 LUFS), true peak לא מעל -3 dBFS, בלי קליפינג ובלי פסגות חדות (בדיקה: יחס פסגה לממוצע מוגבל), עד 200KB לקובץ וסך הכול עד 2MB.
preview.html שמנגן כל צליל עם בקרת עוצמה.
מוכן כש: כל הקבצים חלקים, בלי קליפינג, בלי פסגות חדות לפי הבדיקה, ועוצמות אחידות.
```

## 4. קהל ואצטדיון לטניס (רמה: extra high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/minigames workout/island/js workout/island/view
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/tennis-stadium-v1 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/island/design/tennis-stadium-v1/
לבנות חבילת אצטדיון טניס מקורית: 1) מקטע יציע מודולרי (10 מ') עם שורות מדורגות (עד 3,000 משולשים); 2) אטלס קהל של 8 וריאציות אוהדים (כל וריאציה 128x256, ידיים למטה ולמעלה, בגדים בצבעים שונים), מותאם ל-InstancedMesh כמו crowd() בקובץ workout/island/js/char3d.js, בלי פנים של אנשים אמיתיים; 3) שלטי מגרש (ad boards) כלליים בלי מותגים; 4) כיסא שופט, עמוד רשת, ספסל שחקנים, לוח תוצאות כללי, זרקור (עד 1,500 משולשים לכל פריט); 5) מרקם מגרש קשיח (כחול/ירוק) עם קווים (tileable), ומרקם רקע לשמיים/עיר רחוקה (1024x512).
תקציב: סך הכול עד 4MB, כל GLB עד 300KB. תאורה: סגנון ערב.
מוכן כש: כל הדגמים נטענים ב-preview.html בתוך סצנה אחת (מגרש + יציעים + קהל), עם ספירת משולשים כוללת (עד 25,000), טבלת קבצים, ובדיקה שטוענת את הכול.
```

## 5. שחקני כדורסל גבוהים עם זרועות ארוכות (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/hoops-motion-v9 workout/island/design/hoops-motion-v8 workout/island/design/motion2 workout/island/design/hoops-v7
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/hoops-tall-v1 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/island/design/hoops-tall-v1/
שים לב: קליפי hoops-motion-v9 נמצאים רק בענף codex/hoops-motion-v9 (PR #336), לא ב-main. אחרי ה-clone: git fetch origin codex/hoops-motion-v9 ; git checkout FETCH_HEAD -- workout/island/design/hoops-motion-v9
הרקע: בספריית התנועה החדשה (ענף codex/hoops-motion-v9, PR #336) ההטבעה דורשת קפיצה חריגה של כ-1.6 מ', כי הדמות הנוכחית נמוכה וזרועותיה קצרות ביחס לטבעת (3.05 מ'). לבנות שלוש דמויות כדורסלן חדשות באותו שלד קנוני של 18 עצמות (design/motion2) כך שכל קליפי hoops-motion-v9 ו-v8 יפעלו עליהן בלי שינוי: 1) רכז (גובה 1.88 מ', אורך זרוע יחסי 1.0), 2) קיצוני (1.98 מ', זרועות ארוכות יותר ב-8%), 3) סנטר (2.08 מ', זרועות ארוכות יותר ב-12%). אותה פריסת UV לכל שלוש, שתי קבוצות צבעים לתלבושות (בלי סמלים ובלי מותגים), עד 12,000 משולשים לדמות, טקסטורות עד 1024, GLB עם Draco ועותק ריצה בלי Draco.
בדיקות חובה: (א) טעינה של 5 קליפי hoops-motion-v9 לפחות (דריבל, צעד וחצי, הטבעה, הגנה, ריבאונד) על כל דמות, בלי עיוות מפרקים; (ב) מדידת כף יד בהטבעה: כף היד עוברת את שפת הטבעת (3.05 מ') ב-25 ס"מ ומעלה, ובקפיצה של לא יותר מ-1.0 מ' (גובה אגן באוויר); (ג) טבלה בדוח של גובה הדמות, אורך זרוע, וקפיצה נדרשת לכל קליפ הטבעה.
מוכן כש: שלוש הדמויות נטענות ומפעילות את הקליפים, ההטבעה נראית טבעית בקפיצה סבירה (מדוד), preview.html עם שלוש הדמויות זו ליד זו וליד הטבעת, ודוח עם המדידות.
```

## 6. קול נעים לילד באימון: 44 משפטים (רמה: high; אם אינך מסוגל להפיק קול, עצור ודווח)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/snd/voice workout/js workout/verification/voice-v1
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. ענף חדש בשם codex/workout-voice-recordings-v1 מ-main, ו-PR טיוטה מול main. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco (או meshopt) בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ.
תיקייה: workout/snd/voice/ (קבצים חדשים בלבד, לא לדרוס קיימים)
הרשימה: workout/snd/voice/LINES.md (44 משפטי copy-*: מזהה, נוסח, שם קובץ <מזהה>.wav); הנוסח המנוקד להפקה ב-workout/js/voice-copy.js (COPY). להפיק קובץ שמע לכל משפט: קול עברי חם, נעים וטבעי, קצב רגוע, כמו מדריך כושר חביב לילד בן 8-10 (לא קול רובוטי, לא מבוים מדי), עם הפסקות טבעיות, ובלי דיבור מהיר. פורמט WAV mono 44.1kHz 16-bit, עוצמה אחידה (בערך -16 LUFS), true peak לא מעל -3 dBFS, שקט של 80-150 מ"ש בתחילה ובסוף, בלי רעש רקע. שם הקובץ בדיוק <מזהה>.wav.
אם אינך יכול להפיק קול עברי אנושי באיכות כזאת: אל תחקה ואל תשתמש בקול מכני. עצור, וכתוב בדוח מה חסר.
בדיקות: כל 44 הקבצים קיימים, אורך כל קובץ סביר (0.8-6 שניות), אין קליפינג, העוצמות אחידות (סטייה עד 2 LUFS), ו-workout/tools/voice-missing.mjs מדווח 0 חסרים. לא לשנות קוד.
מוכן כש: 44 קבצים, הדוח עם מדידות, ו-preview.html (או index.html) שמנגן כל משפט עם הנוסח.
```


## 7. מסלולי פורמולה עם פניות ובלימות (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/minigames workout/island/design/racing-v7 workout/island/design/racing-environment-v2
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ. ענף חדש בשם codex/racing-tracks-v2 מ-main, ו-PR טיוטה מול main.
תיקייה: workout/island/design/racing-tracks-v2/
הרקע: במסלולים הנוכחיים (workout/island/minigames/racing-tracks.mjs) האוטו כמעט כל הזמן במהירות שיא, ולכן אין תחושת האצה ובלימה (רועי: "המטרה היא שלא יהיה כל הזמן בשיא המהירות, אלא יצטרך גם להאיץ לשם כל הזמן"). בנוסף, יש תקלות בגיאומטריה של פס הכביש (קטעי הר ירוקים, פס ירוק באמצע).
המשימה: לתכנן 6 מסלולי פורמולה חדשים באותו פורמט נתונים של TRACKS (id, name, theme, width, landmark, points כנקודות [x,y,z] במטרים, מעגל סגור, לפני הכפלת RACING_TRACK_SCALE=1.65), קובץ tracks.json + מודול tracks.mjs שמייצא אותם. כל מסלול: 10 עד 14 פניות (לפחות 3 פניות חדות עם רדיוס קטן שחייבות בלימה, פינת סיכה אחת, שיקאנה אחת), קו ישר ארוך אחד לכל היותר, אורך הקפה 1.3 עד 1.6 ק"מ (לפני הסקאלה), שינויי גובה מתונים (עד 8% שיפוע). קרא את workout/island/minigames/racing-physics.mjs ואת stage.playerSpeed/aiCorner כדי לחשב פרופיל מהירות אידיאלי לכל מסלול.
בדיקות חובה (סקריפט ואימות): (א) המסלול סגור וללא חיתוך עצמי, ומרחק מינימלי בין קטעים שאינם סמוכים לפחות פי 3 מרוחב הכביש (כדי שלא ייווצרו פסים ירוקים או חפיפת כביש); (ב) לפחות 40% מאורך ההקפה במהירות שמתחת ל-85% מהמהירות המרבית, ולא יותר מ-25% מעל 95%; (ג) כל פנייה חדה דורשת האטה של לפחות 25% מהמהירות המרבית; (ד) נמדד כרטיס זמן הקפה לשחקן טוב בסימולציה על racing-physics.mjs (הרצה הדלסית).
מוכן כש: 6 מסלולים נטענים ב-preview.html (מבט עליון עם צבע לפי מהירות, גרף מהירות לאורך ההקפה, סימון פניות ובלימות), טבלת מדידות לכל מסלול, ו-REPORT.md עם לפני/אחרי מול המסלולים הנוכחיים.
```

## 8. ערכת אייקונים והצעת שדרוג לילד (רמה: extra high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/hud-kit workout/island/ui workout/island/minigames
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly. דוח REPORT.md עם מדידות, preview.html שמריץ הכול, ובדיקה (node --test או Python) שטוענת כל קובץ. ענף חדש בשם codex/upgrade-offer-kit-v1 מ-main, ו-PR טיוטה מול main.
תיקייה: workout/island/design/upgrade-offer-kit-v1/
הרקע: בסוף כל שלב, גם אחרי הצלחה חלקית, אם לילד יש מספיק מטבעות או ניקוד בקטגוריה ששיחק, תופיע לו הצעה לשדרג (ליגת פורמולה, טניס, כדורסל, כדורגל, ספינות, חלליות ועוד). צריך ערכה חזותית: 
1) סט אייקוני SVG בסגנון הקיים של hud-kit (קו אחיד, צבע אחד + צבע מבטא, 48x48): מנוע, צמיגים, בלמים, אווירודינמיקה, ניטרו (מרוצים); מחבט, כוח, דיוק (טניס); כוח זריקה, קפיצה, הגנה (כדורסל); מהירות, בעיטה, שוער (כדורגל); תותח, מגן, שריון (ספינות וחלליות); וכללי: שדרוג, כוכב, מטבע, נעילה, חץ למעלה.
2) כרטיס הצעת שדרוג (HTML+CSS, RTL, עברית): "אפשר לשדרג!" עם אייקון, שם השדרוג, מחיר מול מטבעות הילד (פס התקדמות), כפתורים "שדרג" ו"אחר כך" בגודל מגע 48px לפחות, בלי טקסט ארוך, קריא לילד בן 7.
3) אנימציית פתיחה קצרה בקוד (CSS בלבד, עד 600ms) והבזק כוכבים קל.
תקציב: סך הכול עד 400KB. מוכן כש: כל האייקונים בתצוגה אחת (preview.html) בשלושה גדלים ובמצב כהה, כרטיס ההצעה בשלושה מצבים (מספיק כסף, חסר מעט, נעול), בדיקת ניגודיות AA ו-REPORT.md עם טבלת אייקונים.
```

## 9. כדורגל: קליפי תנועה חסרים, v10 (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 workout/island/design/soccer-motion-v8 ; git fetch origin codex/soccer-motion-v9 ; git checkout FETCH_HEAD -- workout/island/design/soccer-motion-v9
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/soccer-motion-v10 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/soccer-motion-v10/
הרקע (רועי: "בכדורגל לא חשתי שיפור בשום צורה שהיא"): ב-v9 חוברו רק 15 מתוך 48 קליפים; הקליפים של חיתוכי כיוון (1.4 שנ', ארוכים מדי לסיבוב הדרגתי), קבלת כדור (אין בהם אירוע קבלה), והוצאות שוער לא התאימו. לבנות קליפים חדשים על שלד motion2 (18 עצמות, 30Hz) שמתאימים לחיבור למכונת מצבים: 1) חיתוך כיוון קצר (0.35 עד 0.6 שנ') בארבע זוויות (45, 90, 135, 180 מעלות) לשני הכיוונים, ממצב ריצה; 2) קבלת כדור בריצה ובעמידה, עם אירוע קבלה מתועד בפריים (שדה event) ועם נעילת רגל; 3) הוצאת שוער: גלגול ביד, מסירה קצרה ברגל, בעיטת פתיחה רחוקה, עם אירוע שחרור/מגע; 4) סיבוב עם הכדור, בלימה והאצה מחדש; 5) חיכוך והגנה צמודה. כל קליפ עם שם, אורך, פריים מגע ושדה root-motion נקי.
בדיקות חובה: החלקת נטיעה עד 2 ס"מ, רציפות פוזת כניסה ויציאה מול קליפי ה-idle/jog של v9, שגיאת קצב עד 5%, טעינה בלי Draco, ו-GLTF validator בלי שגיאות. מוכן כש: preview.html מנגן כל קליפ בלולאה ובמעבר ריצה→קליפ→ריצה, וה-REPORT כולל טבלת מדידות לכל קליפ.
```

## 10. כדורסל: קליפים חסרים, v10 (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 workout/island/design/hoops-motion-v8 ; git fetch origin codex/hoops-motion-v9 ; git checkout FETCH_HEAD -- workout/island/design/hoops-motion-v9 ; git fetch origin codex/hoops-tall-v1 ; git checkout FETCH_HEAD -- workout/island/design/hoops-tall-v1
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/hoops-motion-v10 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/hoops-motion-v10/
הרקע (רועי: הגנה "מרושמת", הטבעה לא מגיעה לטבעת, צעד וחצי נראה כמו זריקה): חסרים או לא מחוברים בגלל מגבלות: dribble_behind_back, pivot, shot_start, stop_two_feet, גלישה, החלקת רגליים בספרינט ובפניות, צעד וחצי אמיתי (שני צעדים עם הרמת כדור). לבנות קליפים על השלד הקנוני של 18 עצמות, 30Hz, ובגדלים המתאימים לדמויות הגבוהות של hoops-tall-v1 (רכז 1.88, קיצוני 1.98, סנטר 2.08 מ'): 1) הטבעה ב-2 גבהים עם קפיצת אגן עד 1.0 מ' ויד שעוברת את הטבעת ב-25 ס"מ ומעלה; 2) צעד וחצי אמיתי (גו נוטה, שני צעדים, הרמה); 3) מעברי ספרינט-בלימה, פניות 90 ו-180 עם נעילת רגל; 4) עמדת הגנה עם צעדי החלקה צדדיים והושטת יד לחסימה; 5) dribble_behind_back, pivot, shot_start, stop_two_feet. כל קליפ עם שדות מגע, שחרור כדור ו-root-motion נקי.
בדיקות חובה: החלקת נטיעה עד 2 ס"מ, טעינה על שלוש דמויות hoops-tall-v1 בלי עיוות מפרקים, glTF validator, וקצב צעדים. מוכן כש: preview.html מנגן כל קליפ על שלוש הדמויות מול טבעת בגובה 3.05 מ', ו-REPORT עם מדידות.
```

## 11. צלילים: סירנת משטרה וירי וולקן (רמה: high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/minigames workout/island/design/racing-audio-v2 workout/island/design/tennis-crowd-audio-v1
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול סינתזה מקורית או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי הקלטות מותג. ענף חדש codex/sirens-vulcan-audio-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/sirens-vulcan-audio-v1/
צלילים: 1) סירנת ניידת משטרה (שני גוונים מתחלפים, wail ו-yelp, לופ חלק 4-6 שניות, עם דופלר קל למסלול עוקף) וצפירה קצרה; 2) ירי וולקן (תותח גאטלינג): לופ ירי רציף BRRRT של כ-60 עד 100 פעימות לשנייה, סיבוב עולה בהתחלה (0.4 שנ'), סיבוב יורד בסוף (0.5 שנ'), הבזק רקע, וגרסה שקטה יותר לרקע; 3) פגיעה במתכת והחמצה ליד האוזן (whoosh) לשימוש בחלליות ובמרדף.
פורמט: OGG ו-MP3, mono/stereo, 44.1kHz, עוצמה אחידה (בערך -16 LUFS), true peak לא מעל -3 dBFS, בלי קליפינג, עד 150KB לקובץ וסך הכול עד 1.5MB. preview.html עם כפתור לכל צליל ובקרת עוצמה. מוכן כש: כל הלופים חלקים (בדיקה אוטומטית), אין קליפינג, ועוצמות אחידות, ו-REPORT עם מדידות.
```

## 12. חללית עם תותחים בשני הצדדים ורכבי מרדף (רמה: ultra למודלים)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/minigames workout/island/assets/game-catch workout/island/design/models2
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/ship-chase-models-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/ship-chase-models-v1/
מודלים (GLB, מטרים, פונה ל-+Z, כל אחד עד 300KB וסך הכול עד 3MB): 1) חללית שחקן עם שני תותחי וולקן, אחד בכל כנף, קנה מסתובב כצומת בשם Barrel_L ו-Barrel_R, נקודות לוע בשם Muzzle_L ו-Muzzle_R, בלי סמלים או מותגים; 2) ניידת משטרה אמיתית למראה (פנסי גג כחול-אדום כצמתים Light_R ו-Light_B, גרסה לילדים נעימה בלי סמלי רשות אמיתיים); 3) שלושה רכבי בריחה: רכב ספורט, טנדר, ואוטו משוריין לבוס; 4) מחסום כביש וקונוס; כל רכב עם גלגלים נפרדים (Wheel_FL/FR/RL/RR) לסיבוב. מרקמים עד 1024.
מוכן כש: preview.html מציג את כולם בתאורה אחת, מסובב את הקנה והגלגלים, ומציג ספירת משולשים (עד 4,000 לחללית, עד 3,000 לרכב), טבלת קבצים, ו-REPORT עם מדידות.
```

## 13. טניס: ספריית תנועה מלאה (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 workout/island/minigames ; git fetch origin codex/hoops-tall-v1 ; git checkout FETCH_HEAD -- workout/island/design/hoops-tall-v1 ; git fetch origin codex/soccer-motion-v10 ; git checkout FETCH_HEAD -- workout/island/design/soccer-motion-v10
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/tennis-motion-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/tennis-motion-v1/
הרקע (רועי: "בטניס צריך לעבוד עוד על השיפור, זה אפילו לא קרוב"): אין היום ספריית תנועה אמיתית לטניס. לבנות 40 עד 50 קליפים על השלד הקנוני של 18 עצמות (design/motion2), 30Hz, כמו בספריות הכדורגל והכדורסל, לשחקן אחד שמחזיק מחבט (נקודת אחיזה בכף היד, צומת Racket עם ראש וידית): 1) עמידת היכון ו-split step; 2) ריצה לכל כיוון, צעד צד, האטה ושינוי כיוון, חזרה למרכז; 3) מכות קרקע: פורהנד ובקהנד, flat/topspin/slice, מהקרקע ומאחור, עם מגע ארוך ועם מגע קצר; 4) גשה: הטלת כדור, trophy pose, מגע, follow-through, גשה שנייה; 5) וולי פורהנד ובקהנד, סמאש, drop shot, לוב; 6) חגיגת נקודה, אכזבה, נעיצת מחבט, ידיים לשמיים, לחיצת יד. כל קליפ עם event מגע (פריים, נקודת מגע מקומית), event שחרור כדור בהטלה, root-motion נקי, נעילת רגל.
בדיקות חובה: החלקת נטיעה עד 2 ס"מ, רציפות מעבר ריצה→הכאה→ריצה, מהירות ראש המחבט במגע בטווח ריאלי (מדוד), glTF validator, טעינה בלי Draco. מוכן כש: preview.html מנגן כל קליפ ומציג את מסלול ראש המחבט, ו-REPORT עם טבלת מדידות.
```

## 14. כדורגל: שליטה בכדור, תיקולים וכדורים נייחים v11 (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 ; git fetch origin codex/soccer-motion-v10 ; git checkout FETCH_HEAD -- workout/island/design/soccer-motion-v10 ; git fetch origin codex/soccer-motion-v9 ; git checkout FETCH_HEAD -- workout/island/design/soccer-motion-v9
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/soccer-motion-v11 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/soccer-motion-v11/
הרקע (רועי: "בכדורגל לא חשתי שיפור"): v9 ו-v10 כיסו ריצה, חיתוכים וקבלה. חסר בעיקר מה שהופך משחק לכדורגל: 1) כדרור: מגעים בכדור בכל צעד בקצב ריצה איטי, בינוני וספרינט, סיבוב עם כדור, פיינט, גוף בין היריב לכדור (shielding); 2) מסירות: קרקע קצרה ב-8 כיוונים, אוויר, חוצה, מסירת עומק, עם event בעיטה ומרחק; 3) בעיטות: חזקה, מסולסלת, בעיטת קשת, בעיטה ראשונה (volley), ראשונה בחזה; 4) תיקול עומד ותיקול גלישה (נקי ומפספס), חטיפה, התנגשות קלה; 5) נגיחה: מקום ובקפיצה, הגנה, התקפה; 6) כדורים נייחים: זריקת חוץ, קרן, בעיטה חופשית, פנדל, הצבת חומה; 7) שוער: תפיסה ב-8 כיוונים, דחיפה, יציאה לכדור, זינוק, אחרי שער; 8) חגיגות לשחקן ולקבוצה. כל קליפ עם event מגע (כדור/רגל, פריים), root-motion נקי ונעילת רגל.
בדיקות חובה: החלקת נטיעה עד 2 ס"מ, רציפות מול קליפי v9 ו-v10, שגיאת קצב עד 5%, טעינה בלי Draco, glTF validator. מוכן כש: preview.html מנגן כל קליפ בלולאה ובמעברים, ו-REPORT עם טבלת מדידות.
```

## 15. כדורסל: תנועות כדרור, מסירות וזריקות v11 (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 ; git fetch origin codex/hoops-motion-v10 ; git checkout FETCH_HEAD -- workout/island/design/hoops-motion-v10 ; git fetch origin codex/hoops-tall-v1 ; git checkout FETCH_HEAD -- workout/island/design/hoops-tall-v1
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/hoops-motion-v11 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/hoops-motion-v11/
הרקע (רועי: "בכדורסל זה אפילו לא קרוב"): v10 כיסה הטבעה, צעד וחצי והגנה. חסר מה שנותן לכדורסל תחושה: 1) כדרור: crossover, בין הרגליים, מאחורי הגב, hesitation, step-back, jab step, סיבוב (spin), כדרור מהיר בספרינט, כדרור הגנתי; 2) מסירות: חזה, קרקע, מעל הראש, מאחורי הגב, מסירה בקפיצה, אלי-הופ; 3) זריקות: jump shot, fadeaway, floater, hook, קליעה לשלוש מכדרור ומקבלה, זריקה בלחץ הגנה; 4) ריבאונד ופסילות: ריבאונד התקפה והגנה, חסימת זריקה, חסימה, אקרן (screen); 5) הגנה: עמידה צמודה, חטיפה, חציית מסלול. כל קליפ על שלוש דמויות hoops-tall-v1 (רכז 1.88, קיצוני 1.98, סנטר 2.08) עם event מגע וקליטה של הכדור, אורך כדרור נכון (הכדור חוזר לכף היד), נעילת רגל ו-root-motion נקי.
בדיקות חובה: החלקת נטיעה עד 2 ס"מ, טעינה על שלוש הדמויות, מרחק הכדור מכף היד בעת כדרור, glTF validator, טעינה בלי Draco. מוכן כש: preview.html מנגן כל קליפ על שלוש הדמויות מול טבעת בגובה 3.05 מ', ו-REPORT עם טבלת מדידות.
```

## 16. כלי בקרת איכות תנועה לכל הספריות (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 workout/island/design/soccer-motion-v8 workout/island/design/hoops-motion-v8 ; for b in codex/soccer-motion-v9 codex/soccer-motion-v10 codex/hoops-motion-v9 codex/hoops-motion-v10 codex/hoops-tall-v1; do git fetch origin $b ; done
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/motion-qa-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/motion-qa-v1/
הרקע: רועי ממשיך להרגיש שהתנועה "לא קרובה". אין כלי מדידה אחיד שמראה אובייקטיבית למה. לבנות כלי Node (בלי תלות ב-WebAssembly, three.js מקומי) שטוען כל ספריית קליפים (v8, v9, v10 של כדורגל וכדורסל, ודמויות hoops-tall) ומפיק דוח JSON ו-HTML לכל קליפ: החלקת רגליים, חדירה לרצפה, קפיצות פוזה בין פריימים סמוכים (pops), חריגות אנטומיות במפרקים, מרחק כדור מכף היד או הרגל בפריים המגע, רציפות כניסה ויציאה מול קליפי idle, מהירות שורש מול קצב צעד (מדד "החלקה של הגוף"), ובדיקת סימטריה. סף ירוק/צהוב/אדום לכל מדד, וציון תחושה מ-0 עד 100 לכל קליפ, וטבלת סיכום לכל ספרייה. בנוסף: מצב השוואה בין שתי גרסאות (v9 מול v10) וגיליון פריימים (8 פריימים לכל קליפ) כתמונות.
מוכן כש: הכלי מריץ את כל הספריות בפקודה אחת, מפיק report.html עם מיון לפי ציון, ו-REPORT מציג את 20 הקליפים הגרועים ביותר ואת הסיבה לכל אחד. בדיקות לכלי עצמו כלולות.
```

## 17. תיקון הקליפים האדומים לפי כלי ה-QA (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 ; for b in codex/motion-qa-v1 codex/soccer-motion-v9 codex/soccer-motion-v10 codex/soccer-motion-v11 codex/hoops-motion-v9 codex/hoops-motion-v10 codex/hoops-motion-v11 codex/hoops-tall-v1 codex/tennis-motion-v1; do git fetch origin $b ; done ; git checkout FETCH_HEAD -- workout/island/design/tennis-motion-v1 ; git checkout origin/codex/motion-qa-v1 -- workout/island/design/motion-qa-v1
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/motion-fix-v12 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/motion-fix-v12/
הרקע: כלי ה-QA שלך (motion-qa-v1) מדד ממוצעי ציון: soccer-v8 93.3, soccer-v9 91.2, soccer-v10 84.9, hoops-v8 88.2, hoops-v9 87.6, hoops-v10 77.8, hoops-tall-v1 69.9 (347 מדדים אדומים). כלומר הספריות החדשות גרועות מהישנות, ולכן רועי לא מרגיש שיפור ("זה אפילו לא קרוב"). הגרועים: v9/cut_*_ball ו-brake_ball על דמויות hoops-tall (החלקת רגליים עד 0.30 מ', קפיצות פוזה 10-22 מעלות, פער יציאה מול idle). המשימה: לתקן, לא להוסיף: 1) להריץ את הכלי על כל הספריות כולל tennis-motion-v1, soccer-v11 ו-hoops-v11; 2) לכל קליפ עם ציון מתחת ל-80: לתקן את הסיבה (נעילת רגל/IK, החלקת ביניים, מיסוך קפיצות פוזה, מעבר רציף אל idle ומתוכו, ריטרגטינג מחדש לדמויות הגבוהות), ולהפיק גרסה מתוקנת תחת runtime/ באותו שם קליפ + חותמת גרסה; 3) לדווח ציון לפני ואחרי לכל קליפ. יעד: אפס מדדים אדומים, ממוצע ספרייה לפחות 88, ולא יותר מ-5% קליפים בצהוב. לא למחוק קליפים: אם אי אפשר לתקן, לסמן אותם בקובץ blocklist.json עם הסיבה. מוכן כש: report.html לפני/אחרי, טבלת סיכום, וכל הקליפים המתוקנים נטענים ב-preview.html על שלוש דמויות או על הדמות המתאימה.
```

## 18. קהל תלת-ממדי קל לטניס (רמה: extra high)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/minigames workout/island/design/tennis-stadium-v1 workout/island/js
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/tennis-crowd-3d-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/tennis-crowd-3d-v1/
הרקע (רועי: "הקהל נראה כמו חתיכות קרטון ישרות"): הקהל בטניס הוא אטלס דו-ממדי שטוח, גם אחרי v13. המשימה: קהל תלת-ממדי קל לטניס באי: 12 וריאציות של אוהד יושב (GLB מרוסן אחד לכל וריאציה, עד 220 משולשים כל אחד, חולצות וצבעי עור ושיער שונים, ידיים למטה וידיים למעלה כשני מצבי אנימציה בפורמט morph או שני GLB), מתאים ל-InstancedMesh עם 600 מופעים (כמו במבנה של tennis-stadium-v1). הצללה אפויה בצבעי קודקוד, בלי טקסטורה גדולה. מגבלת משקל כוללת 400KB. ניואנסים: ראשים שמסתובבים בעקבות הכדור (מפת עצם ראש אם יש), קפיצה קלה בחגיגה, שונות בגובה ובגוף.
מוכן כש: preview.html מציג את היציע עם 600 מופעים מזוויות המצלמה של המשחק (צד ומאחור), מונה משולשים (עד 132,000 לכל הקהל או לפי התקציב שבדוח), מדידת fps בתוכנה לפני/אחרי, ו-REPORT עם טבלת קבצים.
```

## 19. נכסי שחקני הוקי קרח (רמה: ultra)
```
משימה: נכסי שחקני הוקי קרח על שלד השחקנים המאוחד של האי.
קישור: ענף claude/unified-athletes-v1 בריפו roynaor-work/Bakasun. קראו קודם
workout/island/verification/unified-athletes-v1/REPORT.md ואת
workout/island/minigames/athletes-roles.mjs (הערך hockey).

כללים: קבצים חדשים בלבד, תחת workout/island/design/hockey-v1/. בלי נגיעה בקוד משחק, בגרסה, ב-ops ובבדיקות.
רישיון CC0 לכל קובץ, עם מקור. עברית בלבד בטקסטים למשתמש, בלי סימני קריאה, ילדים בני 7 ומעלה.

צעדים:
1. גוף שחקן ושוער (GLB) על השלד הקנוני של 18 עצמות: Root, Hips, Spine, Chest, Neck, Head,
   LeftArm, LeftForeArm, LeftHand, RightArm, RightForeArm, RightHand, LeftUpLeg, LeftLeg, LeftFoot,
   RightUpLeg, RightLeg, RightFoot. אותו סדר ואותו מיקום מנוחה כמו
   workout/island/assets/hoops-tall/motion.json (מערך CANON_BONES ב-athletes-core.mjs).
   שחקן 1.85 מ', עד 8,000 משולשים. שוער עם רפידות, כפפה ומחסום ידיים, עד 10,000 משולשים.
   קסדה, קסדה לשוער, גלגליות ולהבים. צבעי חולצה וקסדה לפי צבעי קבוצה (צבע קודקודים לפי אזורים,
   כמו בגופי הכדורסל: uniform_primary, uniform_secondary, uniform_trim). ללא Draco.
2. מקל כנכס נפרד (GLB) עם נקודת אחיזה ביד ימין ונקודת להב.
3. קליפים בפורמט של workout/island/assets/soccer-v9/clips.json: schemaVersion 1, 30 פריימים בשנייה,
   keyframes עם rotations לכל 18 העצמות ו-hipsOffsetMeters, לפחות:
   החלקה: דחיפה (3 מהירויות), גלישה, חצייה שמאלה וימינה, בלימה (שני צדדים), פנייה 45/90/180,
   החלקה אחורה, עמידה מוכנה (3 וריאציות).
   פעולות: קליעת פרק יד, קליעת סלאפ, מסירה, קבלה, בדיקת גוף.
   שוער: עמידה, נפילה לפרפר, החלקה לצד, עצירה עם כפפה גבוהה ונמוכה, עצירה עם מקל.
   חגיגה: 3.
   בכל קליפ: supports עם חלון מגע ללהב (במקום רגל נטועה), events (מגע במקל, שחרור), loop.
4. רף איכות (חובה, כולל הוכחה בדוח): 
   א. כל קליפ בכלי של Codex (node workout/island/design/motion-qa-v1/run.mjs) בציון תחושה לפחות 88.
   ב. כל קליפ החלקה/הליכה עומד ב-ATHLETE_STANDARD של athletes-core.mjs: פיסוק זרוע עד 24°,
      נדנוד לפי הטבלה, מרפק פנימי 40° עד 100°, נטייה קדימה לפחות כמו בטבלה
      (הרצה: node workout/island/tools/athletes/measure.mjs).
   ג. גיליון 8 פריימים לכל קליפ מרכזי.
5. דוח REPORT.md ומניפסט בתיקייה, עם SHA-256 לכל קובץ.

התוצאה הרצויה: PR טיוטה עם התיקייה, ובדיקה: node --test tests/island-athletes-unified.test.mjs
עובר, ומדידת measure.mjs על הקליפים החדשים בלי כשלים.
```

## 20. גוף שחקן אחיד לכל משחקי הספורט (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/design/motion2 workout/island/assets ; git fetch origin claude/unified-athletes-v1 ; git checkout FETCH_HEAD -- workout/island/verification/unified-athletes-v1 workout/island/minigames/athletes-core.mjs workout/island/minigames/athletes-roles.mjs
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי אנשים אמיתיים. ה-CSP של האפליקציה חוסם WebAssembly: לכל GLB עם Draco חובה גם עותק ריצה בלי Draco/meshopt בתיקיית runtime/. דוח REPORT.md עם מדידות, preview.html, ובדיקה שטוענת כל קובץ. ענף חדש codex/athlete-body-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/athlete-body-v1/
הרקע (רועי: "אותם שחקנים באותה גרפיקה, לא שתי גרפיקות שונות"): בכדורגל השחקן הוא athlete.glb, ובכדורסל שלושה גופים מצוירים, ולכן הם נראים שונים. המשימה: גוף שחקן אחד על השלד הקנוני של 18 עצמות (CANON_BONES ב-athletes-core.mjs) שמחליף את שניהם: 1) שלושה מבנים (רכז, קיצוני, סנטר) בגובה 1.78 עד 2.08 מ' ושחקן כדורגל 1.75 עד 1.85 מ', מאותו מבנה גוף ואותם חומרים; 2) 6 גווני עור, 8 סגנונות שיער, נעליים, וצבעי תלבושת בצבעי קודקודים לפי אזורים (uniform_primary, uniform_secondary, uniform_trim) כך שאפשר לצבוע חולצה ומכנסיים לפי קבוצה ולפי ענף ספורט (ג'רזי כדורגל, גופייה כדורסל, חולצת טניס, ג'רזי הוקי); 3) חומר אחד (MeshToonMaterial או PBR פשוט עם גוון), תאורה זהה, אותו קו מתאר; 4) עד 7,000 משולשים לשחקן, UV משותף, טקסטורה 1024 אחת; 5) כל הגופים נטענים על קליפי soccer-v9/v10/v11, hoops-tall-v1 ו-hoops-v11 מהקטלוג המתוקן (design/motion-fix-v12/runtime/catalog.json) בלי עיוות מפרקים.
בדיקות חובה: glTF validator, טעינה בלי Draco, הרצה של 5 קליפים מכל ספרייה על כל גוף וגיליון 8 פריימים, ומדידת הפרש מראה בין גוף כדורגל לכדורסל (צילום זה לצד זה באותה תאורה). מוכן כש: preview.html מציג את כל הגופים וצבעי התלבושת לפי ענף, ו-REPORT עם טבלת משולשים ומשקל.
```

## 21. קיט כדורסל אמיתי לגוף האתלט (רמה: ultra)
```
המאגר: https://github.com/roynaor-work/Bakasun (ציבורי), ענף main. כדי לא להוריד הכול: git clone --depth 1 --filter=blob:none --sparse https://github.com/roynaor-work/Bakasun.git ; cd Bakasun ; git sparse-checkout set workout/island/assets/athlete workout/island/minigames
כללים: קבצים חדשים בלבד בתיקייה שלמטה. לא לערוך קוד קיים, release.json, release.mjs, תגי ?v=, CLAUDE.md, ops או בדיקות. הכול מקורי או CC0, עם רישיון ומקור לכל קובץ ב-LICENSES.md, בלי מותגים ובלי לוגו של ליגה. ענף חדש codex/athlete-kits-v1 מ-main, ו-PR טיוטה. תיקייה: workout/island/design/athlete-kits-v1/
המשימה: לגוף workout/island/assets/athlete/athlete.glb (MakeHuman hm08, UV של הקיט ב-assets/athlete/textures/kit-mask.png) לבנות וריאציית קיט כדורסל: מסכת UV נפרדת kit-mask-basketball.png (R = גופייה בלי שרוולים עם סרט קצה בצבע משני, G = מכנסיים עד הברך, B = גרביים קצרות, שחור = נעליים), kit-detail-basketball.png (קפלים, תפרים, רשת), ו-kit-normal-basketball.jpg. לצרף preview.html עם three.js מקומי שמציג את הגוף עם המסכה החדשה מול הישנה, ו-REPORT.md עם צילומים.
```
