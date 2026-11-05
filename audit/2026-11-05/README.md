# ביקורת ארבע האפליקציות

נקודת בסיס: main בקומיט `5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275`.
קבצים חדשים בלבד; אין תיקון מוצר, שינוי release, תגי גרסה או בדיקות קיימות.

1. פתחו [index.html](index.html) בדפדפן, גם כשאין רשת. אין build, CDN או fetch בדף המסירה.
2. סננו ממצאים לפי אפליקציה, תחום ועדיפות. פתחו ממצא לשחזור, תיקון מוצע והפניות למקור הקפוא.
3. בדקו את [REPORT.md](REPORT.md), טבלאות המשקל ו־iterations/NN. הצילומים קרובים/רחוקים ובשתי המידות; הביקורת העצמית מצורפת לכל סבב.

בסביבת הביקורת, מדיניות Chromium המנוהל חסמה ניווט `file://` ב־`ERR_BLOCKED_BY_ADMINISTRATOR`. מדיניות זו לא שונתה. האימות החלופי בוצע עם `offline=true`: כל בקשה מולאה ישירות מקובץ מקומי בזיכרון, ללא שרת HTTP, יציאה לרשת או CDN. זה מאמת את הדף ואת נכסיו במצב ללא רשת; פתיחה ישירה של `file://` בדפדפן רגיל נותרה לאימות מחוץ לסביבה המנוהלת. הכשל המקורי נשמר בסבב 06.

## שחזור כלי הביקורת

נדרשים Python עם Playwright ו־Pillow, Node, Chromium מקומי, axe-core 4.11.0, es-module-lexer 1.7.0 ו־PGlite 0.3.15. הכלים אינם תלות runtime של המוצר או של דף המסירה. התקנות הביקורת נעשו מחוץ לריפו ב־`/tmp/bakasun-audit-runtime`.

יש לשחזר על עותק נפרד של הקומיט הקפוא, ולהעתיק לתוכו את תיקיית הביקורת. סריקות inventory/deployment משתמשות ברשימת הקבצים של SHA הבסיס ובודקות שעץ המוצר זהה לו, כך שקובצי הביקורת שהתווספו ב־PR לא ייספרו כחלק מהמוצר המקורי. שאר הכלים קוראים גם הם את עץ העבודה; אין לפרש הרצה על מוצר ששונה כאימות של אותו בסיס.

מתוך שורש הריפו, לדוגמה:

```sh
python3 audit/2026-11-05/tools/inventory.py
python3 audit/2026-11-05/tools/history_scan.py
python3 audit/2026-11-05/tools/capture.py 01
python3 audit/2026-11-05/tools/security.py
node audit/2026-11-05/tools/backend.mjs
python3 audit/2026-11-05/tools/accessibility.py
python3 audit/2026-11-05/tools/reliability.py
python3 audit/2026-11-05/tools/checkout.py
node audit/2026-11-05/tools/island_backup.mjs
node audit/2026-11-05/tools/family_sync.mjs
python3 audit/2026-11-05/tools/runtime_assets.py
python3 audit/2026-11-05/tools/constraints.py
node audit/2026-11-05/tools/module_graph.mjs
node audit/2026-11-05/tools/offline-identity.mjs
python3 audit/2026-11-05/tools/performance.py
python3 audit/2026-11-05/tools/game_performance.py
python3 audit/2026-11-05/tools/soak.py 7200 600
```

`CHROMIUM_PATH`, `AXE_PATH`, `PGLITE_MODULE` ו־`ES_MODULE_LEXER` מאפשרים להפנות להתקנות אחרות. `PGLITE_RUNTIME` מפנה לתיקיית dist עם לוכסן מסיים לצורך הרחבת pgcrypto בבדיקת המשפחה. מתאם Playwright לבדיקות הקיימות מקבל `PLAYWRIGHT_MODULE`. סביבת ההרצה המתועדת היא Node 24.19.0 ו־Python Playwright 1.62.0; CI מוגדר ל־Node 22. הדוגמאות שומרות ראיות מחדש, לכן לשמירת חבילת המסירה המקורית מומלץ להריץ בעותק נפרד של הריפו.

הרצת הבדיקות הקיימות עם Chromium של סביבת העבודה, ללא שינוי קובצי בדיקה:

```sh
ISLAND_PLAYWRIGHT="$PWD/audit/2026-11-05/tools/playwright-runtime.mjs" CHROMIUM_PATH=/usr/bin/chromium node --test tests/*.mjs
```

מבחן CSP ממוקד:

```sh
ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT="$PWD/audit/2026-11-05/tools/playwright-runtime.mjs" CHROMIUM_PATH=/usr/bin/chromium node --test tests/island-browser-csp.test.mjs tests/bakasun-a11y-browser.mjs
```

מבחן offline מלא, או השחזור הממוקד של הכשל האוטומטי:

```sh
ISLAND_OFFLINE_BROWSER=1 ISLAND_PLAYWRIGHT="$PWD/audit/2026-11-05/tools/playwright-runtime.mjs" CHROMIUM_PATH=/usr/bin/chromium node --test --test-reporter=tap tests/island-offline-browser.test.mjs
ISLAND_OFFLINE_BROWSER=1 ISLAND_PLAYWRIGHT="$PWD/audit/2026-11-05/tools/playwright-runtime.mjs" CHROMIUM_PATH=/usr/bin/chromium node --test --test-reporter=tap --test-name-pattern='automatic download' tests/island-offline-browser.test.mjs
```

מתאם ברירת המחדל בסביבת העבודה השתמש ב־Node Playwright 1.57.0; Python השתמש ב־1.62.0. בוצעה גם השוואה נפרדת לגרסת Node המוגדרת ב־CI, 1.62.1, עם אותו Chromium מערכת ו־Node 24. אפשר להגדיר `PLAYWRIGHT_MODULE=/tmp/bakasun-audit-ci-runtime/node_modules/playwright/index.mjs` אחרי התקנה חיצונית של `playwright@1.62.1`. כשל auto-download חזר גם בגרסה זו. אין בכך שחזור מלא של runner ה־CI, שמוגדר ל־Node 22.

בדיקת דף המסירה ללא תעבורת רשת, כולל גלריה, סינון, דיאלוג תמונה, מקלדת ו־axe:

```sh
python3 audit/2026-11-05/tools/build_review.py
python3 audit/2026-11-05/tools/review_qa.py 09 --virtual-offline
```

לבדיקת משחק הכדורגל המקורית יש להגדיר גם תיקיית פלט ניתנת לכתיבה מחוץ למוצר:

```sh
ISLAND_SOCCER_BROWSER=1 ISLAND_PLAYWRIGHT="$PWD/audit/2026-11-05/tools/playwright-runtime.mjs" CHROMIUM_PATH=/usr/bin/chromium ISLAND_SOCCER_RESTART_DIR=/tmp/bakasun-audit-soccer-restarts node --test tests/island-soccer-motion2-browser.test.mjs
```

הבדיקות מריצות שרת localhost. אין להשתמש בפרופיל דפדפן אישי. חסימת רשת חיצונית היא חלק מהכלים, ולא הוכחה ששירות חיצוני מושבת. בפרט, שגיאות webfonts צפויות ואינן מסווגות כתקלה באתר חי. אין לשלוח טפסים/תשלום אמיתיים כדי לשחזר.

מבט רחוק במסכי HTML הוא zoom של 67% לצילום בלבד; באי עם dev נקודת הבדיקה משתמשת ב־camera overview. מדידות ו־axe נעשים לפני שינוי zoom. צילומי החנות מסתירים אזורי קשר/זהות וסמלי תשלום קיימים. המבט הרחוק אינו בדיקת WCAG reflow או אישור חדות טקסט.

נתוני FPS נמדדים ב־SwiftShader בענן משותף. הם מסייעים להשוואה ולזיהוי עומס, ואינם מאשרים 30fps בטלפון פיזי. מספר משולשים בקובץ הוא סכום meshes ייחודיים; עלות frame נפרדת ותלויה ב־instances, שחקנים, מעברי צל ו־LOD.
