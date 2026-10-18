# TASK-017 — QA לפיילוט Meshy

מחבר לעיר מכונית Meshy חונה אחת ודמות אחת שהולכת במסלול קצר ועוצרת בכל קצה. באישור המשתמש הושבו **רק שני קובצי GLB מקוריים** ש-PR #147 מחק, ללא שינוי בבייטים, ונרשמו ב-manifest לפי בדיקת הנכסים של main. חסם הנכסים הוסר. זהו עדכון של PR #141 בלבד.

## בסיס וגבולות העבודה

- בסיס נוכחי: **main `6df6b485c093dd13c5de0940353c44d2f0d5f396`**, ששולב בענף. מקור שני הקבצים: `fa3b133880234a0d88d0226b61db011a0dfdb30b`. הבסיס המקורי של הפיילוט היה fa3b133; המדידות הסופיות לפני/אחרי נעשו מחדש מול 6df6b48.
- DATA_VERSION נשאר **`g2j-20261019-1`**; קישורי `?v=` קיימים לא שונו. CURRENT_VERSION נשאר **15**, ללא שדות שמירה או מעבר חדשים.
- `app.mjs`, `index.html`, `ui/game-shell.mjs`, `ui/press.mjs`, `styles.css`, `release.mjs`, `engine/persistence.mjs` ו-`tests/island-assets.test.mjs` זהים לבסיס 6df6b48. אין שינוי ב-CHANGELOG.md, QA.md או codex-lab/vendor.
- קוד המוצר מוגבל למודולי טעינת הדגמים/תצוגת העיר ול-`config.cityView.meshyPilot`. הבדיקות רק ב-`tests/island-task017-pilot.test.mjs` וב-`workout/island/tests/task017-pilot-browser.mjs`. QA ב-`workout/island/notes/task017-pilot-qa.md`.
- חריג הנכסים המאושר כולל רק `car-a-512.glb`, `adult-man-rigged-512.glb` ושתי רשומות ה-manifest שלהם. **כל 13 הדגמים ש-main שמר נשארו זהים בבייטים**, ולא הוחזר אף אחד מ-39 הדגמים האחרים שהוסרו.

## שלב 0 — מצב העיר

`IslandView` טוען מפרטי מבנים דרך `view/local-models.mjs` ו-`vendor/GLTFLoader.js`, עם הגבלת בקשות לתיקיית האי. `createBuilding` משתמש במודל הזמין או חוזר לגאומטריה הקיימת. לפני הפיילוט מחוברים הבית ברמה 1, החנות ובית החולים. אין מכוניות בעיר; `Citizens` מצייר תושבים באמצעות InstancedMesh של גוף/ראש/שיער/רגליים. דמות השחקן משתמשת בנפרד ב-`assets/kid-full.glb` וב-mixer שלה.

לא נמצאו במודולי JS/MJS או JSON הפניות ל-`house-a-512-orig.glb`, `shop-corner-512-orig.glb` או `shop-corner.glb`. בבסיס המקורי fa3b133 היו גם `palm-tree-512.glb` (299,172 בתים) ו-`firefighter-rigged-512.glb` (1,164,892 בתים); הם נמחקו בהמשך על ידי PR #147 ואינם קיימים בבסיס 6df6b48 או בפיילוט הסופי. גם שלוש החלופות המקוריות נמחקו שם; הפיילוט אינו מחזיר אותן.

## נכסים וחוזה המקור

| נכס | שימוש במשחק | קובץ ב-assets/models | מצב | rotationY / scale |
| --- | --- | --- | --- | --- |
| מכונית | אחת חונה ליד בית | car-a-512.glb | הושב ומחובר | ‎-90° / 0.38 |
| גבר עם שלד | מחליף תושב מצויר אחד; הליכה ועצירה | adult-man-rigged-512.glb | הושב ומחובר | 0° / 0.32 |
| בית רמה 1 | המבנה הקיים | house-a-512.glb | מחובר ללא שינוי | 0° / 0.77 |
| חנות | המבנה הקיים | shop-corner-512.glb | מחובר ללא שינוי | 0° / 0.97 |
| בית חולים | המבנה הקיים | hospital-512.glb | מחובר ללא שינוי | 0° / 1.39 |
| דקל וכבאי עם שלד | אין שימוש בפיילוט | palm-tree-512.glb / firefighter-rigged-512.glb | מושהים; מחוץ לפריסה לאחר #147 | — |

| קובץ שהושב | בתים | SHA-256 מקורי וב-manifest |
| --- | ---: | --- |
| car-a-512.glb | 327,664 | `91a0211f18a84cf47dd271aac51783d8d2bc0be7296ccdfd3782aaaf7b53d6c9` |
| adult-man-rigged-512.glb | 1,218,676 | `5bf0beed6c7584ead260d579c11af3b707db9f4ebb420af98e4d81f84a2ce217` |

הבדיקה החדשה מאמתת גודל, SHA-256, משולשים, משאבים מוטמעים וחוזה האנימציה. בדיקת ה-manifest הקיימת של main עוברת: רשימת **15** הקבצים זהה לרשימת ההפניות ב-config/buildings ולמפת ה-hash. לא שונו רשתות, טקסטורות, שלדים או קליפים.

## תנועה, עצירה ונפילה לחלופה

- המכונית חונה: תיקון פנימי ‎-90° מסובב חזית ‎-X ל-‎-Z, לפי מוסכמת הכבאית, ואז ה-holder מיושר למקטע הדרך. scale ‏0.38 נותן אורך 0.720 וגובה 0.470 ליד הבית הקיים בגובה 1.385. התחתית מיושרת למשטח הכביש הקיים. בדיקות נסיעה אינן חלות על מכונית חונה.
- הדמות פונה במקור ל-‎+Z; rotationY פנימי 0°, ו-holder פונה לפי atan2(dx,dz), כולל בכיוון החזרה. scale ‏0.32 נותן גובה מקור 0.544 ביחס לדלת הבית. מסלול של תא אחד על שפת הדרך, מהירות 0.3 יחידות/שנייה, עצירה של 1.5 שניות סימולציה בכל קצה.
- העצירה משתמשת ב-**Walking בזמן 1/12 שנייה**, פריים 2 ב-24fps, עם **timeScale=0**. היסט סוליה: 0.04563 ביחידות המקור. שתי הסוליות נבדקו במרחק פחות מ-0.00073 יחידות מהמשטח; הזרוע שונה מה-A-pose בכ-0.956 רדיאן. אין שימוש ב-Idle או Running.
- שכפול נעשה רק דרך `SkeletonUtils.clone` (פונקציית Three.js r160 המקורית עם ייחוס MIT במודול עזר מקומי, ללא שינוי vendor). לכל עותק שלד ו-AnimationMixer עצמאי. העותק השני נוצר רק בבדיקה ומסולק בסופה. שמות העצמות נבדקים כ-`mixamorigHips` ו-`mixamorigLeftFoot` ללא נקודתיים.
- כשל מכונית משאיר את העיר ללא מכונית; כשל דמות משאיר את התושב המצויר. הכשלים עצמאיים. הזזה/הסרה של הבית מעדכנת/מסתירה את הפיילוט, וטעינה שמסתיימת אחרי סגירת התצוגה מסולקת.

## מדידות לפני ואחרי ותקציב הורדת העיר

תרחיש זהה בשני הגדלים: בית L1 ב-(4,6), חנות ב-(7,6), בית חולים ב-(10,6), כביש x=3…11 / z=5; מצלמת home רגילה וזהה, seed ‏17017, DPR 1, הקשר דפדפן קר, איכות גבוהה וצללים קבועים למדידה בלבד. ההתאמה האוטומטית של האיכות נשארת פעילה במשחק. FPS נמדד ב-rAF אמיתי במשך שתי שניות; Chromium / ANGLE SwiftShader הוא רינדור תוכנה ואינו מדידת טלפון.

״טעינה״ היא loadEventEnd; ״מוכנות״ כוללת את הנכסים ואת מסך הדמות הראשוני. בתים בגוף התגובה ו-transferSize הכולל תקורה מדווחים בנפרד; פירוט כל המשאבים נשמר ב-JSON.

| מסך | מצב | משולשים | קריאות ציור | FPS | טעינה ms | מוכנות ms | גופי תגובות, בתים | תעבורה עם תקורה, בתים |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 390×844 | לפני — main 6df6b48 | 38,824 | 35 | 10.07 | 195.3 | 2147.2 | 3,964,525 | 3,997,525 |
| 844×390 | לפני — main 6df6b48 | 38,824 | 35 | 4.09 | 176.8 | 2211.0 | 3,964,525 | 3,997,525 |
| 390×844 | אחרי — הפיילוט | 48,600 | 37 | 9.28 | 190.3 | 2425.3 | 5,536,264 | 5,570,764 |
| 844×390 | אחרי — הפיילוט | 48,600 | 37 | 7.34 | 194.0 | 3268.5 | 5,518,970 | 5,553,170 |

הגאומטריה מוסיפה 9,776 משולשים ושתי קריאות: 4,770 + 5,170 פחות 164 של התושב המצויר שהוחלף. שני ה-GLB יחד הם **1,546,340 בתים**. בקשות אייקון אוטומטיות עשויות להוסיף 17,294 בתים; רשימת הבקשות נשמרת במלואה, ללא הסתרת בקשות.

בדיקת הפיילוט מגדירה תקרת הורדה קרה מפורשת של **6,000,000 בתים למסך העיר**, גם לגופי התגובות וגם לתעבורה עם תקורה. זהו סף רגרסיה חדש ומחמיר למסך העיר, ואינו שינוי בבדיקת הפריסה הקיימת של 15MB. בכל שמונת מקרי הדפדפן ובמדידות התקציב עובר; השיא במקרי הדפדפן היה **5,570,764 בתים** עם תקורה. בטעינה תקינה נבדק גם שהורדו בדיוק 327,664 ו-1,218,676 בתים לשני הנכסים.

## צילומים מאותה מצלמה

| מסך | לפני | אחרי |
| --- | --- | --- |
| 390×844 | ![לפני לאורך](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/before-390x844.png) | ![אחרי לאורך](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/after-390x844.png) |
| 844×390 | ![לפני לרוחב](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/before-844x390.png) | ![אחרי לרוחב](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/after-844x390.png) |

תקריב נפרד לכיול, שאינו משמש להשוואת הביצועים:

![מכונית ודמות ליד הבית](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/detail-stop.png)

## סיבת השונות ב-FPS

הירידה החדה שדווחה בהרצה הראשונה (7.05→3.44 לאורך) לא הייתה עקבית בהרצות החוזרות. בדיקות בידוד קודמות נשמרו עבור אותו קוד רינדור ואותם בייטים של הנכסים: שתי קריאות ריקות, מיקסר מוקפא, רשת סטטית באותה תנוחה במקום skinning, הסרת שתי טקסטורות 512×512, מכונית בלבד ודמות בלבד.

במדידת WebGL סינכרונית (render + gl.finish, שבע דגימות מתחלפות אחרי חימום) התקבלו חציוני ms אלה:

| בידוד | קריאות | 390×844 ms | 844×390 ms |
| --- | ---: | ---: | ---: |
| ללא הפיילוט | 35 | 1.10 | 1.20 |
| שתי קריאות ריקות בלבד | 37 | 1.10 | 1.10 |
| פיילוט מלא | 37 | 1.40 | 2.20 |
| מיקסר מוקפא, שלד נשאר | 37 | 1.40 | 1.20 |
| תנוחה אפויה ללא skinning | 37 | 1.30 | 1.20 |
| ללא שתי הטקסטורות | 37 | 1.40 | 1.20 |

שתי הקריאות הנוספות לבדן לא הוסיפו עלות עקבית. הסרת skinning חסכה רק 0.1ms לאורך ולא שינתה את החציון לרוחב. הסרת טקסטורות לא שינתה את החציון לאורך; לרוחב גם היא וגם הקפאת המיקסר שינו 2.2→1.2ms, לצד חריגות של כ-23ms. עלות tick של הפיילוט בחציון הייתה מתחת ל-0.1ms לאורך וכ-0.1ms לרוחב, ברזולוציית המדידה.

לכן **אין בסיס לייחס את הירידה הקודמת דווקא לשלד, לטקסטורות או למספר הקריאות**. הפיילוט מוסיף עבודה גרפית, אבל נפילת ה-FPS הגדולה לא בודדה לסיבה יחידה. תזמון/קומפוזיציית הדפדפן ברינדור תוכנה אינם נמדדים במלואם על ידי תזמון WebGL סינכרוני. דרושה בדיקה בטלפון/GPU אמיתי לפני הרחבה. הדוחות diagnostics.json ו-profile.json כוללים את כל הדגימות והחריגות, לא רק חציונים.

## בדיקות ותוצאת stays within 15 MB

- `node --test --test-reporter=tap tests/*.mjs`: **1,647 עברו, 1 כשל ידוע, 38 דילוגים קיימים**, 1,686 בסך הכול. הכשל היחיד הוא `island complete deployable folder including bundled assets stays within 15 MB`.
- בדיקת ה-manifest של PR #147: **עוברת**. גם בדיקת ה-SHA המקורי לשני הקבצים המשוחזרים עוברת. `tests/island-assets.test.mjs` עצמו זהה ל-main 6df6b48.
- בדיקת תקציב הורדת העיר: **עוברת**, מתחת ל-6MB בשני הגדלים ובכל מקרי השיבוש.
- דפדפן: **8/8** — שני הגדלים × תקין / מכונית משובשת / דמות משובשת / שתיהן משובשות. אפס שגיאות קונסול ואפס בקשות מחוץ לתיקייה. נבדקו תזוזת עצם ביחס לשורש גם בלולאת העיר האמיתית, עצירות, כיוון חזרה, אי תלות בשלדים וב-mixers, מגע סוליות, סילוק והסרה/החזרה של הבית.
- בבסיס main 6df6b48 ארבע בדיקות הנכסים עוברות; תיקיית האי מכילה **14,998,973 בתים**. הוספת שני הנכסים המקוריים לבדה מביאה את הרצפה ל-**16,545,313 בתים**, עוד לפני קוד וראיות. בהרצת הסוויטה נמדדו **18,385,841 בתים**, ולכן בדיקת **תיקיית הפריסה המלאה** נכשלת — זו אינה בדיקת ההורדה של מסך העיר. התקציב לא הועלה ולא הוחרגו קבצים מהבדיקה. זהו הכשל היחיד המותר לפי כללי המקביל.
- בהרצה המוקדמת לפני התיקון בדיקת 15MB עברה מפני ששיניתי את תחום הספירה לתוכן פעיל בלבד. שינוי זה בוטל במלואו; כעת נשמרת הבדיקה המקורית של main, כולל ה-manifest שהוסף ב-PR #147.

## כל הדגמים ש-PR #147 הסיר

רשימה זו נגזרה מה-diff של `6df6b485c093dd13c5de0940353c44d2f0d5f396` מול ההורה הראשון `fa3b133880234a0d88d0226b61db011a0dfdb30b`, ומגדלי הבלובים באותו הורה. **41 קבצים, 17,996,000 בתים**. ה-manifest נוצר ב-PR #147, ולכן לא הוסרו רשומות מ-manifest קודם: הקבצים הבאים נמחקו מהפריסה ולא נכללו ב-manifest החדש. רק שתי השורות המסומנות הושבו באישור לפיילוט זה; 39 האחרים נשארו מחוץ לפריסה.

| קובץ ב-workout/island/assets/models | גודל מקורי בבתים | מצב בפיילוט |
| --- | ---: | --- |
| adult-man-512.glb | 319,156 | לא הושב |
| adult-man-rigged-512.glb | 1,218,676 | הושב באישור לפיילוט |
| adult-woman-512.glb | 298,956 | לא הושב |
| adult-woman-rigged-512.glb | 552,580 | לא הושב |
| ambulance-512.glb | 303,668 | לא הושב |
| apartment-block-512.glb | 328,704 | לא הושב |
| bench-512.glb | 308,176 | לא הושב |
| boss-ship-512.glb | 321,364 | לא הושב |
| bus-512.glb | 339,584 | לא הושב |
| bush-512.glb | 206,072 | לא הושב |
| cafe-512.glb | 317,992 | לא הושב |
| car-a-512.glb | 327,664 | הושב באישור לפיילוט |
| enemy-ship-b-512.glb | 276,116 | לא הושב |
| fire-station-512.glb | 290,468 | לא הושב |
| firefighter-512.glb | 314,580 | לא הושב |
| firefighter-rigged-512.glb | 1,164,892 | לא הושב |
| gas-station-512.glb | 294,284 | לא הושב |
| grocery-512.glb | 328,620 | לא הושב |
| helicopter-512.glb | 306,524 | לא הושב |
| house-a-512-orig.glb | 281,152 | לא הושב |
| kid-boy-512.glb | 301,420 | לא הושב |
| kid-boy-rigged-512.glb | 974,924 | לא הושב |
| kid-girl-512.glb | 320,132 | לא הושב |
| kid-girl-rigged-512.glb | 1,204,980 | לא הושב |
| palm-tree-512.glb | 299,172 | לא הושב |
| pine-tree-512.glb | 296,728 | לא הושב |
| playground-park-512.glb | 301,036 | לא הושב |
| police-car-512.glb | 301,012 | לא הושב |
| police-officer-512.glb | 340,436 | לא הושב |
| police-officer-rigged-512.glb | 1,201,532 | לא הושב |
| police-station-512.glb | 274,056 | לא הושב |
| rock-512.glb | 270,772 | לא הושב |
| school-512.glb | 320,732 | לא הושב |
| shop-corner-512-orig.glb | 248,848 | לא הושב |
| shop-corner.glb | 1,276,148 | לא הושב |
| soccer-field-512.glb | 381,976 | לא הושב |
| street-lamp-512.glb | 284,096 | לא הושב |
| tennis-court-512.glb | 335,848 | לא הושב |
| trash-bin-512.glb | 355,756 | לא הושב |
| tree-a-512.glb | 272,196 | לא הושב |
| water-tower-512.glb | 334,972 | לא הושב |

## רשימה מלאה של הקבצים ששונו לעומת main 6df6b48

**33 קבצים**, כולל שני ה-GLB המאושרים, ה-manifest וכל הראיות. אין שינוי באף נכס אחר:

- `tests/island-task017-pilot.test.mjs`
- `workout/island/assets/models/adult-man-rigged-512.glb`
- `workout/island/assets/models/car-a-512.glb`
- `workout/island/assets/models/manifest.json`
- `workout/island/data/config.json`
- `workout/island/notes/task017-pilot-qa.md`
- `workout/island/tests/task017-pilot-browser.mjs`
- `workout/island/verification/task017/after-390x844.png`
- `workout/island/verification/task017/after-844x390.png`
- `workout/island/verification/task017/after.json`
- `workout/island/verification/task017/before-390x844.png`
- `workout/island/verification/task017/before-844x390.png`
- `workout/island/verification/task017/before.json`
- `workout/island/verification/task017/browser-390x844-both.png`
- `workout/island/verification/task017/browser-390x844-car.png`
- `workout/island/verification/task017/browser-390x844-none.png`
- `workout/island/verification/task017/browser-390x844-walker.png`
- `workout/island/verification/task017/browser-844x390-both.png`
- `workout/island/verification/task017/browser-844x390-car.png`
- `workout/island/verification/task017/browser-844x390-none.png`
- `workout/island/verification/task017/browser-844x390-walker.png`
- `workout/island/verification/task017/browser.json`
- `workout/island/verification/task017/detail-stop.png`
- `workout/island/verification/task017/diagnostics.json`
- `workout/island/verification/task017/initial/before-390x844.png`
- `workout/island/verification/task017/initial/before-844x390.png`
- `workout/island/verification/task017/initial/before.json`
- `workout/island/verification/task017/profile.json`
- `workout/island/verification/task017/validation.json`
- `workout/island/view/island-view.mjs`
- `workout/island/view/local-models.mjs`
- `workout/island/view/meshy-pilot.mjs`
- `workout/island/view/skeleton-utils.mjs`

## תקלות ומגבלות שנותרו

נשאר רק כשל תקציב תיקיית הפריסה המלאה המותר; manifest, הורדות העיר, הפיילוט וכל יתר בדיקות Node עוברים. מקור התנודתיות ב-FPS לא הוכרע; התנועה מואטת במצב FPS נמוך בגלל תקרת delta=.05 של העיר הקיימת. הפיילוט אינו מוסיף תנועה של מכוניות, מערכת התנגשויות או דמויות נוספות.

[דוח QA ופקודות שחזור](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/notes/task017-pilot-qa.md) · [אימות מובנה](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/verification/task017/validation.json) · [בדיקות דפדפן](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/verification/task017/browser.json).


## פקודות שחזור

לאחר הפעלת שרת HTTP של הענף ב-8765 ושל עותק main 6df6b48 ב-8767, עם Playwright זמין:

```sh
node --test --test-reporter=tap tests/*.mjs
node --test tests/island-task017-pilot.test.mjs
node --test --test-name-pattern="audited bytes" tests/island-assets.test.mjs
node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=before ISLAND_URL='http://127.0.0.1:8767/workout/island/?dev=1' node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=after node workout/island/tests/task017-pilot-browser.mjs
```

הסוויטה המלאה צפויה להיכשל רק בבדיקת תיקיית 15MB; בדיקת ה-manifest, בדיקת הפיילוט והדפדפן יוצאות עם קוד 0. ניתן להגדיר PLAYWRIGHT_MODULE ו-CHROMIUM_PATH. מצבי TASK017_PHASE=diagnostics ו-profile מריצים את בדיקות הבידוד בזיכרון בלבד. אין כתיבה של GLB על ידי הבדיקות. המדידות רצות ברצף ללא בדיקות אחרות ברקע; איכות קבועה רק בהארנס באמצעות view.started=Infinity. צילומי initial נשמרים מהמדידה המקורית על fa3b133.
