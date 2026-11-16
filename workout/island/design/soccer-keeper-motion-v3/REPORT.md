# דוח מסירה · שוערים ושחקני שדה בכדורגל

נמסרו **14 קליפים חדשים**, בקצב **30Hz**, על **18 העצמות הקנוניות**. ציון motion-qa-v1 מינימלי **92.8**, ללא מדדים אדומים וכיסוי מלא לכל המדדים הרלוונטיים. כל קובצי המסירה הם הוספות בתיקייה זו בלבד.

[תצוגת תלת־ממד](preview.html) · [לוח QA](verification/qa/report.html) · [קטלוג](catalog.json) · [מקורות ורישוי](LICENSES.md)

## הקליפים

הפריימים כוללים את שתי נקודות הקצה. גיליון כל קליפ מציג שמונה פריימים מקוריים של ה־GLB, לרבות אירועי המגע והשחרור.

| קליפ | תנועה | שניות | פריימים | ציון QA | גיליון |
|---|---|---:|---:|---:|---|
| [keeper_ready](clips/keeper_ready.glb) | עמידה דרוכה | 2.40 | 73 | 100 | [8 פריימים](sheets/keeper_ready.png) |
| [keeper_shuffle](clips/keeper_shuffle.glb) | הזזה צידה · דחיפה וסגירה | 3.20 | 97 | 98.1 | [8 פריימים](sheets/keeper_shuffle.png) |
| [keeper_dive_low](clips/keeper_dive_low.glb) | זינוק נמוך · נחיתה והתאוששות | 5.20 | 157 | 96.8 | [8 פריימים](sheets/keeper_dive_low.png) |
| [keeper_dive_high](clips/keeper_dive_high.glb) | זינוק גבוה · נחיתה והתאוששות | 5.20 | 157 | 95.5 | [8 פריימים](sheets/keeper_dive_high.png) |
| [keeper_catch_two_hands](clips/keeper_catch_two_hands.glb) | תפיסה בשתי ידיים · ספיגה לחזה | 3.60 | 109 | 98.5 | [8 פריימים](sheets/keeper_catch_two_hands.png) |
| [keeper_punch](clips/keeper_punch.glb) | אגרוף · ניתור והרחקה | 3.20 | 97 | 97.7 | [8 פריימים](sheets/keeper_punch.png) |
| [keeper_throw](clips/keeper_throw.glb) | הוצאת כדור · הטלה מעל הכתף | 3.80 | 115 | 95.1 | [8 פריימים](sheets/keeper_throw.png) |
| [keeper_punt](clips/keeper_punt.glb) | הוצאת כדור · שמיטה ובעיטת שוער | 4.20 | 127 | 96.9 | [8 פריימים](sheets/keeper_punt.png) |
| [keeper_celebrate](clips/keeper_celebrate.glb) | חגיגת שוער · שתי ידיים ואגרופים | 3.80 | 115 | 98 | [8 פריימים](sheets/keeper_celebrate.png) |
| [keeper_disappointed](clips/keeper_disappointed.glb) | התאכזבות שוער · שקיעת כתפיים | 3.60 | 109 | 99.2 | [8 פריימים](sheets/keeper_disappointed.png) |
| [field_miss](clips/field_miss.glb) | התאכזבות אחרי החטאה · ידיים לראש | 3.80 | 115 | 96.1 | [8 פריימים](sheets/field_miss.png) |
| [field_group_celebrate](clips/field_group_celebrate.glb) | חגיגת שער קבוצתית · הצטרפות והרמת ידיים | 4.40 | 133 | 96.5 | [8 פריימים](sheets/field_group_celebrate.png) |
| [field_enter](clips/field_enter.glb) | כניסה למגרש · צעדים ומבט קדימה | 4.00 | 121 | 92.8 | [8 פריימים](sheets/field_enter.png) |
| [field_clap](clips/field_clap.glb) | מחיאת כפיים · שלוש מחיאות | 4.00 | 121 | 97.9 | [8 פריימים](sheets/field_clap.png) |

תנועות השוער משתמשות בדמות השוער הקיימת עם כפפות; ארבע תנועות השדה בדמות השדה הקיימת. החגיגה הקבוצתית מדגימה שלושה מופעים בעלי skin עצמאי, עם היסטי מיקום וזמן מפורשים בקטלוג. הקליפ המשותף ניתן לניגון בכל שחקן של הקבוצה.

## שלד, מסלולים וצריכה

כל GLB עצמאי, כולל גאומטריה, חומרים, skin ואנימציה אחת: 18 ערוצי סיבוב וערוץ תרגום של Hips. אין דחיסה ואין צורך ב־WASM. Root קבוע; תרגום Hips הוא מקומי מוחלט, עם גובה מנוחה 0.86 מ׳. +Y למעלה, +Z קדימה, +X שמאל אנטומי. מידות המנוחה, ההיררכיה וה־inverse binds נשמרו.

catalog.json מספק משכים, אירועים, חלונות תמיכה, חתימות, מסלולי כדור וגשרים; motions.json כולל פוזה מלאה לכל דגימת 30Hz. referenceTravel הוא תרחיש תנועה חיצוני שבבעלות הסימולציה, ואינו מסלול Root המוטמע באנימציה. התצוגה מיישמת אותו פעם אחת בלבד. שיקוף הזינוקים וההזזה לצד השני נתון לצרכן; בחבילה יש קליפ אחד לכל פעולה מבוקשת.

שמיטת הבעיטה ונתיבי הכדור אחרי הטלה, אגרוף והדיפה משתמשים בכבידה 9.81 מ׳/שנ׳², עם מהירויות שחרור/פגיעה מפורשות. מסלול ההטלה לפני השחרור מוגדר באופן עצמאי והיד נפתרת מולו; אין הצמדת כדור חיה ליד בניגון. מסלולי הזינוק מחושבים בעולם ואז נשמרים ביחס לתרחיש השחקן כדי למנוע תוספת תנועת שחקן לכדור. לאחר מגע ברצפה התצוגה שומרת את מרכז הכדור בגובה הרדיוס; קפיצות, חיכוך, בעלות ומסירה למשחק דורשים מנוע כדור. בתפיסה, possession_transfer ב־2.7 שנ׳ מסמן העברת החזקה לצרכן לפני איפוס הפוזה; טווח הנראות מונע כדור תלוי אחרי פתיחת הידיים.

## אימות

- כלי motion-qa-v1 המקורי מקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24 הורץ ב־120Hz. נוסחאות, ספים ומשקלים לא שונו. המתאם מוסיף רק את הספרייה החדשה לרשימת מקורות סגורה. בדוח 15 שורות: 14 קליפים חדשים ועמידת שדה נלווית; עמידת השוער נמדדת מול keeper_ready. חתימות הכלי ודרישות המסירה ב־[requirements.json](verification/requirements.json). הציון הוא מדד הנדסי של שלד ומגעים, ולא ציון תפיסתי.
- **224/224 גשרי C1 עברו**, ב־240Hz, לעמידה ולריצה של soccer-locomotion-v2 בשני הכיוונים, בשלושה שלבים ובקטיעת גשר פעיל. שגיאת קצה מרבית 3.818e-6 מעלות; שארית מהירות זוויתית 9.449e-6 רדיאן/שנ׳. [ראיות](verification/transitions.json).
- **14/14 GLB עברו**, עם **אפס שגיאות Khronos**. נרשמו **70 אזהרות קיימות** על חישוב tangent בזמן ריצה: חמש לכל דמות, עקב מפות normal ללא TANGENT מפורש. [תוצאות מלאות](verification/assets.json).
- כל קודקודי הרשת נבדקו לאחר skinning ב־60Hz לאורך הקליפים: **אפס חדירה לרצפה**, מרווח מינימלי 4.445 מ״מ. זו דגימה סופית של רצפה; אינה בדיקת התנגשויות גוף/בגד בכל זמן אפשרי. תמיכות, צעדי התאוששות ובליסטיקת כדור נבדקו גם ב־[actions.json](verification/actions.json).
- Chromium טען את כל 14 הקליפים וצילם **112 פריימים**. 844×390 ללא גלילה, ו־390×844 ללא גלילה אופקית; ניגון, עצירה, גרירה ומצלמות עברו. בדיקת שתי טעינות מתחרות אימתה שחרור משאבים ללא שחרור כפול ושמירת הקליפ האחרון. WebAssembly חסום בבדיקה; אין שגיאות דף או בקשות חיצוניות. [ראיות וחתימות](verification/browser.json), [844×390](verification/preview-844x390.png), [390×844](verification/preview-390x844.png).
- בדיקות המאגר: 4,261 עברו, 1 נכשל ו־64 דולגו. הכשל הקיים במסך האימון שוחזר בנפרד: דפדפן Playwright המובנה חסר בסביבה ושרת הבדיקה נשאר פתוח. קובץ הבדיקה והקוד הקיים לא שונו; בדיקות הנכסים השתמשו בדפדפן המקומי ועברו. סיכום ההרצה ב־[repository-tests.json](verification/repository-tests.json).

## גשרי כניסה ויציאה

runtime/player.mjs מספק sampleMotion, makeClipBridge ו־interruptBridge. ברירת המחדל בקטלוג היא 0.4 שנ׳, עם התאמת פוזה ומהירות בשני הקצוות מתוך נתוני ה־GLB הסופיים. קליפ היעד ממשיך מהשלב שנבחר אחרי הגשר. הצרכן אחראי לעוגני תמיכה בעולם ול־IK בזמן ערבוב; רציפות C1 אינה מבטיחה נעילת כף רגל או הימנעות מהתנגשויות במעבר שרירותי. קובצי הייחוס נלווים ל־14 הקליפים ונשמרו זהים בתים למקור המוצמד.

## שחזור

מתיקיית הריפו, Node 22 ומעלה:

```sh
node workout/island/design/soccer-keeper-motion-v3/source/prepare-keeper.mjs
node workout/island/design/soccer-keeper-motion-v3/source/author.mjs
node workout/island/design/soccer-keeper-motion-v3/source/bake.mjs
node workout/island/design/soccer-keeper-motion-v3/source/run-qa.mjs
node workout/island/design/soccer-keeper-motion-v3/source/validate-assets.mjs
node workout/island/design/soccer-keeper-motion-v3/source/measure-transitions.mjs
node workout/island/design/soccer-keeper-motion-v3/source/verify-actions.mjs
node workout/island/design/soccer-keeper-motion-v3/source/capture.mjs
node workout/island/design/soccer-keeper-motion-v3/source/report.mjs
```

כלי פענוח/אימות מותקנים זמנית ב־/tmp/keeper-tools, וניתן לשנות את הנתיב באמצעות KEEPER_TOOLS_DIR. להתקנה בסביבה חדשה: npm install --prefix /tmp/keeper-tools @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 draco3dgltf@1.5.9 gltf-validator@2.0.0-dev.3.10. צילום משתמש ב־Playwright וב־Chromium הזמינים בסביבה; אפשר להגדיר PLAYWRIGHT_MODULE ו־CHROMIUM_PATH. לצפייה מקומית יש להגיש את שורש הריפו בשרת HTTP ולפתוח את preview.html; התלויות המקומיות הקיימות נמצאות בריפו.

החבילה לא חוברה ללוגיקת המשחק. לא בוצעו מיזוג, העלאת גרסה או בדיקה בטלפון פיזי. הדוח והקבצים הוכנו לביקורת בענף codex/soccer-keeper-motion-v3.
