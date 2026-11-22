# הרצה חוזרת

הכלים קוראים את המשחקים הקיימים מתוך העתק זמני. אין התקנה, שמירה או שינוי בקוד המשחק המקורי. נתוני ברירת המחדל נכתבים רק בחבילה הזאת. הקוד נעצר אם נמצאו שינויים קיימים במקורות, ומאמת את גיבוב המקורות אחרי ההרצה.

דרוש Node.js 22 ומעלה. מדידת CPU לפי worker בכלי `verify-racing-project.mjs` דורשת גרסה המספקת `process.threadCpuUsage`, כגון Node.js 24. לחזירים דרושים Chromium ו־Playwright; לגרפים דרושים Python 3.10 ומעלה ו־Matplotlib. אין צורך ב־GPU. סביבת המדידה השתמשה ב־Node.js 24, ב־Chromium עם SwiftShader וב־Matplotlib 3.10.8.

להרצה חדשה בלי לדרוס את הנתונים שנמסרו:

```bash
node workout/island/design/balance-sim-v1/tools/run.mjs --samples 32 --jobs 4 --output /tmp/balance-recheck
```

דגימה ממוקדת, למשל כל שלבי הכבאות, שלושה בוטים ו־32 זרעים:

```bash
node workout/island/design/balance-sim-v1/tools/run.mjs --games fireRescue --samples 32 --jobs 4 --output /tmp/balance-fire
```

מזהי המשחקים:

```text
soccer,streetSlam,tennis,islandRacing,alpineRush,alienDefense,navalDuel,fireRescue,catchCriminal,boarDefense
```

אפשר לצמצם באמצעות `--stages 1,2` ו־`--profiles regular`, ולשנות את תחילת הזרעים באמצעות `--seed-start 1701`. אפשר להמשיך פלט קיים באותה פקודה: זוגות של שלב/בוט/זרע שכבר הושלמו לא רצים שוב. שינוי במקור או בבקר הבוט מחייב תיקיית פלט חדשה. `--keep-copy` משאיר את העתק המקורות לבדיקה.

תוכנית הדגימה שנמסרה, לכל אחד משלושת הבוטים: 16 זרעים לכדורגל, 32 לשבעת המשחקים הבאים, ו־8 למרוצים ולחזירים. בכדורגל שלב 1 נמדדו גם 32 זרעים לחסר הסבלנות ולרגיל; הפקודה השנייה משחזרת את התוספת הזאת. כל הזרעים מתחילים ב־1701. כדי לשחזר את השורות עצמן יש להשתמש באותם מקורות של המשחקים, כפי שמוגדרים ב־`data/source-manifest.json`.

```bash
node workout/island/design/balance-sim-v1/tools/run.mjs --games soccer --samples 16 --jobs 2 --output /tmp/balance-recheck
node workout/island/design/balance-sim-v1/tools/run.mjs --games soccer --stages 1 --profiles impatient,regular --samples 32 --jobs 2 --output /tmp/balance-recheck
node workout/island/design/balance-sim-v1/tools/run.mjs --games streetSlam,tennis,alpineRush,alienDefense,navalDuel,fireRescue,catchCriminal --samples 32 --jobs 2 --output /tmp/balance-recheck
node workout/island/design/balance-sim-v1/tools/run.mjs --games islandRacing --samples 8 --jobs 2 --output /tmp/balance-recheck
node workout/island/design/balance-sim-v1/tools/run.mjs --games boarDefense --samples 8 --jobs 1 --output /tmp/balance-recheck
```

ההרצה מחלקת את העבודה לקבוצות של ארבעה זרעים ושומרת אחרי כל קבוצה. כל הקבצים נכתבים באמצעות תור כתיבה והחלפה אטומית. `--stop-file /tmp/balance-stop` מאפשר עצירה נקייה בין קבוצות: יצירת הקובץ עוצרת את התור ומשמרת תוצאות שהושלמו. יש להסיר אותו לפני המשך ההרצה.

Playwright יכול להיות מותקן מחוץ לריפו:

```bash
npm install --prefix /tmp/balance-browser --no-save --package-lock=false playwright@1.62.1
```

לאחר התקנת Chromium, יש להצביע על נתיב הספרייה והדפדפן:

```bash
ISLAND_PLAYWRIGHT=/tmp/balance-browser/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node workout/island/design/balance-sim-v1/tools/run.mjs --games boarDefense --samples 8 --jobs 1 --output /tmp/balance-boars
```

החזירים משתמשים ב־API הבדיקות של המשחק ובחישוב הפגיעה המקורי של Three.js. שרת מקומי מגיש רק את ההעתק. הציור הרגיל אינו רץ; סימולציה ב־60 הרץ מריצה את הלוגיקה. יצירת מזהי UUID של Three.js מקבלת זרם אקראי נפרד, כדי שמטמוני גרפיקה לא יזיזו את הזרם האקראי של המשחק. נבדק שחזור גם אחרי החלפת גל וזרע.

הפרופילים מוגדרים ב־`profiles.mjs`. אלה בקרי ניסוי סינתטיים; אין כיול מול ילדים אמיתיים. תקציב הסבלנות הוא מדד מדווח, אינו מגבלת זמן ואינו מייצר הפסד מלאכותי. כל מתאם מתעד את הפעולות, הציוד, השעון וההחרגות שלו.

המרוצים מפעילים אינדקס מדויק לשאילתות גאומטריה על המסלול המקורי. העתק הלוגיקה משתמש באותה פיזיקה ובאותם תנאי תוצאה. תעודת `data/racing-project-equivalence.json` בודקת עשרה מרוצים וכ־3.5 מיליון שאילתות ללא סבילות; כלי השחזור הם `verify-racing-project.mjs` ו־`regress-racing-project.mjs`. ה־helper כלול בגיבוב הבקר, ולכן שינוי בו מבטל מטמון תוצאות. קיימת גם בדיקת רגישות לשמירת היסטוריית השידור החוזר בכדורסל, `probe-hoops-replay.mjs`; נתוני הבסיס נמדדו עם שמירת ההיסטוריה המקורית.

לאחר השלמת כל המשחקים, סיכום, גרפים ואימות מקור:

```bash
node workout/island/design/balance-sim-v1/tools/summarize.mjs
node --test workout/island/design/balance-sim-v1/tools/statistics.test.mjs
node workout/island/design/balance-sim-v1/tools/verify.mjs --replay
```

לקלט חדש ב־`/tmp` יש להשתמש באפשרויות הפלט המתועדות ב־`tools/SUMMARY.md`, כדי לשמר את הראיות שנמסרו. `report.mjs` הוא ניסוח מסקנות לגרסת הראיות הזאת; הוא בודק את `data/report-evidence-lock.json` ומסרב להשתמש במסקנות הישנות אחרי החלפת המקורות או הניסויים. סיכום מספרי וגרפים חדשים אינם מחייבים שימוש בניסוח המסקנות הישן.

הפקת הדוח לגרסת הראיות שסופקה, אחרי שכל קובצי הבסיס הושלמו:

```bash
node workout/island/design/balance-sim-v1/tools/racing-seasons.mjs
node workout/island/design/balance-sim-v1/tools/summarize.mjs
python3 workout/island/design/balance-sim-v1/tools/prove-summary.py
python3 workout/island/design/balance-sim-v1/tools/validate-artifacts.py
node workout/island/design/balance-sim-v1/tools/verify.mjs --replay
node workout/island/design/balance-sim-v1/tools/lock-report-evidence.mjs
node workout/island/design/balance-sim-v1/tools/report.mjs
```

בדיקת הדפדפן הקיימת של אנימציות האימון דורשת בינארי Playwright. בסביבת המדידה היה Chromium מערכתי בלבד. `system-browser.mjs` מאפשר להריץ אותה מולו בלי לערוך את הבדיקה. לבדיקות הסופרות חזרות לפי שעון אמיתי יש לפנות משאבי CPU בזמן ההרצה:

```bash
BALANCE_REAL_PLAYWRIGHT=/tmp/balance-browser/node_modules/playwright/index.mjs ISLAND_PLAYWRIGHT="$PWD/workout/island/design/balance-sim-v1/tools/system-browser.mjs" CHROMIUM_PATH=/usr/bin/chromium node --test tests/workout-royiki.test.mjs
```

ניסויי הכוונון ניתנים להרצה בכלים:

```text
tune-soccer.mjs
probe-hoops.mjs
probe-tennis-gear.mjs
probe-alpine.mjs
tune-aliens-naval.mjs
probe-alien-muzzle.mjs
tune-catch.mjs
tune-fire.mjs
probe-pigs.mjs
```

לכל ניסוי נשמרים לפני/אחרי על אותם זרעים ופרופילים. בכבאות נשמר גם מדגם אימות נפרד שנבחר אחרי הקפאת המועמד. שמות הכלים והארגומנטים המדויקים מופיעים בראש הקובץ; תוצרי ניסוי קודמים נשארים בחבילה כדי לתעד גם מועמדים שנדחו.


בדיקת ההמשך המחושב בחזירים מכסה גם את גלים 35 ו־40, בשמונה זרעים לכל אחד משלושת הפרופילים. יחד עם גלים 25 ו־30 במדגם הראשי, היא מכסה מחזור מלא ראשון של סוגי הבוסים בהמשך המחושב. הכלי יוצר העתק חדש, מאמת את המקורות לפני ואחרי, ומשווה שחזור מדויק לאחר החלפת גל ופרופיל:

```bash
ISLAND_PLAYWRIGHT=/tmp/balance-browser/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node workout/island/design/balance-sim-v1/tools/stress-pigs-tail.mjs --samples 8 --seed-start 1701 --output /tmp/balance-boars-tail.json
```

התוצר שנמסר הוא [`data/pigs-tail-stress.json`](../data/pigs-tail-stress.json): 48 משחקים, שחזור נוסף, גיבובי המקורות וניתוח נוסחת ההמשך. הקמפיין ממשיך ללא שלב סיום; מדגם סופי אינו בדיקה של כל הגלים העתידיים. הנתונים מתארים גל שמתחיל בלי שדרוגים, ואינם מחליפים בדיקת קמפיין שצובר ציוד בין גלים.

בדיקת תלות בציוד בחזירים משתמשת ב־48 תוצאות הזנב שנמסרו, ומריצה על אותם זרעים ופרופילים את חבילת `benchSave(stage)` המקורית: ארבעת נשקי הבסיס בדרגה 4, ושדרוגי מיגון/קירור/טיל/הקפאה/צריח בדרגות 3/3/3/2/2. הבקר נשאר עם המקלע; זו חבילת benchmark קיימת, ולא הנחה על ציוד שהילד היה קונה. הכלי מעתיק את המתאם לתיקייה זמנית ומחליף רק את חבילת הפתיחה ואת קריאת מדדי הציוד; המתאם שנמסר וקוד המשחק נשארים כפי שהם.

```bash
ISLAND_PLAYWRIGHT=/tmp/balance-browser/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node workout/island/design/balance-sim-v1/tools/probe-pigs-gear.mjs --output /tmp/balance-boars-gear.json
```

התוצר שנמסר הוא [`data/pigs-gear-sensitivity.json`](../data/pigs-gear-sensitivity.json). הוא כולל זוגות לפני/אחרי, קוד חבילת הציוד המקורית, הציוד שנצפה בפועל, גיבובים ושחזור חוזר.
