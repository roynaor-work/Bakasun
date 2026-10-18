# TASK-017 — QA לפיילוט Meshy בעיר

מוסיף לעיר מכונית Meshy חונה אחת ודמות אחת שהולכת הלוך ושוב על שפת השביל ליד בית. הדמות מחליפה הולך רגל מצויר אחד, עוצרת בכל קצה על פריים Walking עם timeScale=0, וחוזרת לייצוג הקיים אם הטעינה נכשלת. כשל המכונית משאיר את העיר ללא מכונית.

## התאמה לעבודה המקבילה

הפיילוט עומד בכללי G8, G3g, G4d, G6c, G2k ו-G2l:

- קוד המוצר מוגבל ל-`view/island-view.mjs`, `view/local-models.mjs`, שני מודולי עזר חדשים באותה תיקייה (`meshy-pilot.mjs`, `skeleton-utils.mjs`) ו-`config.cityView.meshyPilot` בלבד.
- `app.mjs`, `index.html`, `ui/game-shell.mjs`, `ui/press.mjs`, `styles.css`, `release.mjs`, `engine/persistence.mjs` וכל הבדיקות הקיימות זהים לבסיס. אין שינוי ב-CHANGELOG.md או QA.md, ואין CSS חדש.
- קובצי הבדיקה החדשים היחידים: `tests/island-task017-pilot.test.mjs` ו-`workout/island/tests/task017-pilot-browser.mjs`. מדידת לפני/אחרי כלולה בקובץ הדפדפן, במצב `TASK017_PHASE=before` או `after`.
- תיעוד QA: `workout/island/notes/task017-pilot-qa.md`. צילומים ודוחות JSON נשמרים ב-`workout/island/verification/task017/`.
- כשל יחיד מותר ונשאר ללא שינוי: בדיקת `tests/island-assets.test.mjs` ששמה מכיל `stays within 15 MB`. כל בדיקה אחרת חייבת לעבור.

## 1. שלב 0 — מצב לפני שינוי

- ענף `codex/task017-meshy-pilot`, מבוסס על main העדכני שנמשך ונבדק שוב לפני הפרסום: `fa3b133880234a0d88d0226b61db011a0dfdb30b`.
- DATA_VERSION נשאר **`g2j-20261019-1`**, וכל קישורי `?v=` הקיימים נשארו בדיוק בערכי הבסיס. CURRENT_VERSION נשאר **15**, ללא שדות שמירה או מיגרציה חדשים. קובצי הגרסה והשמירה זהים לבסיס.
- העיר טוענת מפרטי מבנים ב-`IslandView` באמצעות `view/local-models.mjs` ו-`vendor/GLTFLoader.js`, עם הגבלת כתובות לתיקיית האי. `createBuilding` נופל לגאומטריה הקיימת בקוד אם הטעינה נכשלת. מחוברים כבר: בית ברמה 1, חנות ובית חולים, בהתאם ל-PR #133.
- לא היו מכוניות בעיר. `Citizens` ב-`view/avatar.mjs` מצייר הולכי רגל ב-InstancedMesh: גוף, ראש, שיער ורגליים מתנדנדות על `cityPaths`. דמות השחקן נפרדת ומשתמשת ב-`assets/kid-full.glb` וב-mixer שלה.
- סריקת מודולי JS/MJS ו-JSON בכל הריפו לא מצאה הפניות ל-`house-a-512-orig.glb`, `shop-corner-512-orig.glb` או `shop-corner.glb`. הקבצים נשארו במקום.
- קיימים: `palm-tree-512.glb` — **299,172 בתים**; `firefighter-rigged-512.glb` — **1,164,892 בתים**. שניהם נשארים מושהים.
- הבסיס הראשוני, שנמדד לפני שינוי התצוגה, נשמר ב-`verification/task017/initial/`. להשוואה הסופית חזרתי על הבסיס מעותק ללא שינויים של אותו קומיט main, ואחריו הרצתי את הענף באותו סקריפט ללא בדיקות אחרות ברקע.

## 2. נכסים

כל הקבצים בטבלה תחת `workout/island/assets/models/`.

| נכס | שימוש במשחק | קובץ | מצב |
| --- | --- | --- | --- |
| מכונית | אחת חונה ליד הבית הראשון | car-a-512.glb | מחובר |
| גבר עם שלד | הליכה קצרה ועצירה בשני הקצוות, במקום תושב מצויר אחד | adult-man-rigged-512.glb | מחובר |
| בית רמה 1 | המבנה הקיים | house-a-512.glb | מחובר, קיים |
| חנות | המבנה הקיים | shop-corner-512.glb | מחובר, קיים |
| בית חולים | המבנה הקיים | hospital-512.glb | מחובר, קיים |
| דקל | אין שימוש בפיילוט | palm-tree-512.glb | מושהה |
| כבאי עם שלד | אין שימוש בפיילוט | firefighter-rigged-512.glb | מושהה |
| בית מקורי | ללא הפניה ממודול | house-a-512-orig.glb | חלופה לא פעילה |
| חנות מקורית | ללא הפניה ממודול | shop-corner-512-orig.glb | חלופה לא פעילה |
| חנות מלאה | ללא הפניה ממודול | shop-corner.glb | חלופה לא פעילה |

שאר הספרייה נשארת מושהית. לא שונו או נוספו קובצי GLB, לא שונו קובצי vendor ולא שונו קבצים ב-codex-lab. לא חוברו מבנים, רכבי חירום, טבע או דמויות נוספות.

## 3. מדידות לפני ואחרי

תרחיש זהה: בית L1 ב-(4,6), חנות ב-(7,6), בית חולים ב-(10,6), כביש x=3…11 / z=5; מצלמת `home()` רגילה, seed קבוע, DPR 1, דפדפן קר. איכות גבוהה וצללים נשמרו במהלך המדידה בלבד. התנהגות הורדת האיכות במשחק נשארה קיימת. מיקומי המצלמה וה-frustum זהים לפני ואחרי בכל גודל.

Chromium / ANGLE SwiftShader, כלומר רינדור תוכנה. FPS נמדד באמצעות rAF אמיתי במשך שתי שניות. ״טעינה״ היא navigation loadEventEnd; ״מוכנות״ כוללת את טעינת הנכסים ואת האינטראקציה הראשונית עם מסך הדמות. סך הבתים הוא גופי תגובות מקודדים, כולל מסמך הניווט; ב-JSON יש גם transferSize ופירוט משאבים.

| מסך | מצב | משולשים | קריאות ציור | FPS | טעינה ms | מוכנות ms | בתים שהורדו |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 390×844 | לפני | 38,824 | 35 | 7.54 | 206.7 | 2774.7 | 3,981,819 |
| 844×390 | לפני | 38,824 | 35 | 6.63 | 182.7 | 4882.0 | 3,964,525 |
| 390×844 | אחרי | 48,600 | 37 | 8.13 | 333.7 | 4404.2 | 5,518,970 |
| 844×390 | אחרי | 48,600 | 37 | 6.24 | 206.3 | 2214.7 | 5,518,970 |

תוספת: **9,776 משולשים**, **2 קריאות ציור**, **1,537,151 בתים** ב-390×844, **1,554,445 בתים** ב-844×390. שני ה-GLB עצמם יחד: **1,546,340 בתים**. תוספת הקוד והתצורה היא 8,105 בתים. ב-390×844 ה-baseline לבדו כלל גם בקשת apple-touch-icon.png של 17,294 בתים, ולכן הפרש סך ההורדות שם קטן יותר; ב-JSON נשמר פירוט הבקשות המלא. חישוב המשולשים: 4,770 + 5,170 פחות 164 של התושב המצויר שהוחלף. רק שני קובצי דגמים חדשים מתבקשים בדפדפן.

## 4. צילומים

| מסך | לפני | אחרי |
| --- | --- | --- |
| 390×844 | ![לפני לאורך](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/before-390x844.png) | ![אחרי לאורך](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/after-390x844.png) |
| 844×390 | ![לפני לרוחב](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/before-844x390.png) | ![אחרי לרוחב](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/after-844x390.png) |

תקריב נוסף לבדיקת היחס לבית ותנוחת העצירה, ממצלמה נפרדת שאינה משמשת למדידות:

![מכונית ודמות ליד הבית](https://raw.githubusercontent.com/roynaor-work/Bakasun/codex/task017-meshy-pilot/workout/island/verification/task017/detail-stop.png)

## 5. סיבוב, קנה מידה ואנימציה

| נכס | rotationY פנימי | scale אחיד | כיול |
| --- | ---: | ---: | --- |
| מכונית | ‎-90° | 0.38 | חזית ‎-X הופכת ל-‎-Z, לפי הכבאית; ה-holder מיושר למקטע הכביש. אורך 0.720, גובה 0.470, תחתית על גובה הכביש הקיים. חונה: בדיקות נסיעה וסיבוב אינן חלות. |
| דמות | 0° | 0.32 | חזית ‎+Z; ה-holder פונה לפי atan2(dx,dz), כולל כיוון חזרה. גובה מקור מכויל 0.544 לצד בית בגובה 1.385, לפי יחס הדלת. |

- מסלול של תא אחד, מהירות 0.3 יחידות/שנייה והמתנה של 1.5 שניות סימולציה בכל קצה. במסלול הקיים זו שפת הכביש; ללא כביש ההתאמה היא לשביל הקוסמטי הקיים.
- עצירה ב-Walking בזמן **1/12 שנייה**, פריים 2 ב-24fps, `timeScale=0`. היסט סוליה של 0.04563 ביחידות המקור. שתי הסוליות נמדדו במרחק של פחות מ-**0.00073** יחידות מהמשטח; הזרוע שונה מה-A-pose ב-0.956 רדיאן. אין שימוש ב-Idle או ב-Running.
- שכפול באמצעות `SkeletonUtils.clone` בלבד. נשמרה פונקציית clone המקורית של Three.js r160 עם ייחוס MIT ב-`view/skeleton-utils.mjs`, ללא שינוי vendor. לכל עותק שלד ו-AnimationMixer משלו; העותק השני נוצר רק בבדיקה ומפורק בסופה. שמות Three.js נבדקים באמצעות `mixamorigHips` ו-`mixamorigLeftFoot`.
- כשל בכל נכס עצמאי; כשל הדמות משאיר את מספר הולכי הרגל המצוירים המקורי. הזזה/הסרה של הבית מעדכנת/מסתירה את הפיילוט; סגירה במהלך טעינה אינה מצרפת עצמים מאוחר.

## בדיקות ותקציב נכסים

- `node --test tests/*.mjs`: **1,646 עברו, כשל ידוע אחד (15MB), 38 דילוגים קיימים**, 1,685 בסך הכול.
- `workout/island/tests/task017-pilot-browser.mjs`: **8/8 עברו**: שני הגדלים × תקין / מכונית משובשת / דמות משובשת / שתיהן משובשות. אפס שגיאות קונסול ואפס בקשות מחוץ לתיקיית האי.
- נבדקו טעינה, מגע בקרקע, תזוזת עצם הרגל ביחס לשורש בשני זמנים, תנועה דרך לולאת התצוגה הרגילה, עצירה יציבה בשני הקצוות, כיוון חזרה, אי תלות בין שלדים ו-mixers, והסרה והחזרה של הבית. השיבוש הוא גוף GLB פגום בתגובת HTTP תקינה; שגיאות דפדפן אינן מסוננות.
- נוספו בדיקות Node לחוזה הנכסים, בעלות על משאבים משותפים, עצמאות השלדים, סגירה בזמן טעינה וקליפ חסר.
- בדיקת 15MB הקיימת נשארה ללא שינוי וב-main היא כבר נכשלת: תיקיית האי בבסיס מכילה **32,992,172 בתים** לאחר העלאות הספרייה. זהו הכשל היחיד המותר לפי ההוראות המעודכנות. הקובץ זהה כעת ל-main. בהרצה הקודמת היא עברה כי שיניתי אותה לספור רק את התוכן הפעיל ולהחריג ראיות ודגמים מושהים; שינוי זה בוטל במלואו. התקציב ובדיקת התיקייה המלאה נשארו כפי שהם ב-main.

## אבחון ה-FPS: שלד, טקסטורות וקריאות ציור

בהרצה שדווחה קודם, לפני התיקון, נמדדו 7.05→3.44 FPS לאורך ו-6.26→5.34 לרוחב. ההרצה החוזרת של הקוד הסופי, בטבלת המדידות לעיל, נתנה 7.54→8.13 לאורך ו-6.63→6.24 לרוחב. כלומר, הירידה החדה לאורך **לא שוחזרה**; לרוחב נמדדה ירידה קטנה. לא הסקתי שהחזרת גרסת הנתונים שיפרה ביצועים: השתנו תנאי התזמון של סביבת הרינדור, והדגימה קצרה.

בדיקת בידוד נוספת שומרת על אותה מצלמה, גאומטריה ו-37 קריאות בפיילוט, ומחליפה זמנית רק רכיב אחד בזיכרון הדפדפן. קיימות שתי טקסטורות map בגודל 512×512 ו-66 עצמות. להפרדה מרעש rAF נמדדה גם עלות `renderer.render` עם `gl.finish`: חציון שבע דגימות, בסדרים מתחלפים, לאחר חימום השיידרים. אלו **מילישניות לרינדור**, ולא FPS של האפליקציה:

| מצב בידוד | קריאות ציור | 390×844 ms | 844×390 ms |
| --- | ---: | ---: | ---: |
| ללא הפיילוט | 35 | 1.10 | 1.20 |
| ללא מודלים + שתי קריאות ריקות | 37 | 1.10 | 1.10 |
| פיילוט מלא | 37 | 1.40 | 2.20 |
| מיקסר מוקפא, שלד עדיין מצויר | 37 | 1.40 | 1.20 |
| אותה תנוחה כרשת סטטית ללא skinning | 37 | 1.30 | 1.20 |
| פיילוט ללא שתי הטקסטורות | 37 | 1.40 | 1.20 |

- שתי קריאות ציור ריקות לא הוסיפו עלות מדידה עקבית, כך שמספר הקריאות לבדו אינו מסביר נפילה חדה.
- הקפאת המיקסר משאירה את שיידר השלד פעיל. החלפתו ברשת סטטית באותה תנוחה, באותו חומר ובאותן קריאות, חסכה 0.1ms לאורך ולא שינתה את החציון לרוחב. זה קטן מרעש הדגימה. עלות tick של הפיילוט בחציון הייתה מתחת ל-0.1ms לאורך וכ-0.1ms לרוחב; זו רזולוציית המדידה, ולא טענה שאין עלות לשלד.
- הסרת שתי הטקסטורות לא שינתה את החציון לאורך, והורידה 2.2→1.2ms לרוחב. גם הקפאת המיקסר נתנה 1.2ms לרוחב, ודגימות הפיילוט כללו קפיצות של כ-23ms. לכן אין בסיס לייחס את ההפרש הזה דווקא לטקסטורות.

**מסקנה:** הפיילוט מוסיף עלות ציור של גאומטריה ושלד, אך הבדיקה הנוכחית אינה מבודדת גורם יחיד לירידת ה-FPS הקודמת. לא נמצאה ראיה שהטקסטורות או שתי קריאות הציור הנוספות הן הגורם, וגם השלד לא הוכח כמקור לנפילה החדה. נשארת שונות גבוהה בתזמון/רינדור התוכנה ובקומפוזיציית הדפדפן, שאינם כלולים במלואם בתזמון WebGL הסינכרוני. דרושה מדידה בטלפון/GPU אמיתי כדי לקבוע סיבה חד-משמעית לפני הרחבה. הדוחות `diagnostics.json` ו-`profile.json` משמרים את כל הדגימות, כולל החריגות, ולא רק את החציונים.

## 6. תקלות ומגבלות שנותרו

נשאר רק כשל 15MB המותר בבדיקות Node. אין כשל תפקודי בשמונת מקרי הדפדפן שנבדקו. FPS ברינדור תוכנה תנודתי; הירידה החדה לאורך לא שוחזרה במדידה האחרונה. סיבת הירידה הקודמת לא נקבעה באופן חד-משמעי, כמפורט בבדיקות הבידוד. נדרשת מדידה בטלפון או GPU אמיתי לפני חיבור רחב. לולאת העיר הקיימת מגבילה delta ל-0.05, ולכן התנועה בפועל איטית יותר במצב FPS נמוך. הפיילוט אינו מוסיף מערכת תנועה או התנגשויות.

## רשימה מלאה של הקבצים ששונו ביחס ל-main

בסיס: `fa3b133880234a0d88d0226b61db011a0dfdb30b`. 30 קבצים; הרשימה כוללת את כל הצילומים והדוחות.

- `tests/island-task017-pilot.test.mjs`
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

דוחות מלאים, צילומים ופקודות שחזור: [workout/island/notes/task017-pilot-qa.md](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/notes/task017-pilot-qa.md), [browser.json](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/verification/task017/browser.json), [validation.json](https://github.com/roynaor-work/Bakasun/blob/codex/task017-meshy-pilot/workout/island/verification/task017/validation.json).



## שחזור QA

לאחר הפעלת שרת HTTP של הריפו ב-8765, כאשר Playwright זמין:

```sh
node --test tests/*.mjs
node --test tests/island-task017-pilot.test.mjs
node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=after node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=diagnostics node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=profile node workout/island/tests/task017-pilot-browser.mjs
```

הפקודה הראשונה צפויה לצאת עם קוד 1 רק בגלל בדיקת 15MB הידועה; הבדיקה החדשה ומקרי הדפדפן צריכים לצאת עם קוד 0. ניתן להגדיר PLAYWRIGHT_MODULE ו-CHROMIUM_PATH לפי סביבת ההרצה.

למדידה של הבסיס יש לשרת עותק ללא שינויים של fa3b133 בפורט 8766 ולהריץ:

```sh
TASK017_PHASE=before ISLAND_URL='http://127.0.0.1:8766/workout/island/?dev=1' node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=after node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=diagnostics node workout/island/tests/task017-pilot-browser.mjs
TASK017_PHASE=profile node workout/island/tests/task017-pilot-browser.mjs
```

המדידות הסופיות רצות ברצף ללא בדיקות אחרות ברקע. צילומי initial/before נשמרו מהמדידה המקורית לפני יישום הפיילוט. הסקריפט מקבע seed, רשימת מבנים, איכות, צללים ומצלמה; הוא מבטל את הירידה האוטומטית באיכות רק לצורך המדידה באמצעות view.started=Infinity. בקוד המשחק ההתנהגות הקיימת נשארה ללא שינוי.
