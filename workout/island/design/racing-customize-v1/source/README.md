# יצירה ואימות חוזרים

התצוגה המוכנה אינה דורשת התקנה, שרת או רשת. המקורות כאן מיועדים למחבר ולבודק בלבד. כל פלט נכתב בתוך תיקיית החבילה; אין שינוי בקובץ קיים מחוץ לה.

דרישות המחבר: Python 3.12, Node 24, Three 0.160.0, esbuild 0.25.12, gltf-validator 2.0.0-dev.3.10, Playwright ו־Chromium. ההתקנות נשמרות מחוץ לריפו.

```sh
npm --cache /tmp/racing-customize-npm --prefix /tmp/racing-customize-tools install --no-audit --no-fund three@0.160.0 esbuild@0.25.12 gltf-validator@2.0.0-dev.3.10
```

משורש המאגר:

```sh
python3 workout/island/design/racing-customize-v1/source/build-assets.py
node workout/island/design/racing-customize-v1/source/build-preview.mjs
node workout/island/design/racing-customize-v1/source/validate.mjs
node workout/island/design/racing-customize-v1/source/verify-runtime.mjs
node workout/island/design/racing-customize-v1/source/verify-browser.mjs
```

נתיבי כלים ניתנים לשינוי באמצעות `RACING_TOOLS`, ‏`RACING_PLAYWRIGHT` ו־`RACING_CHROMIUM`. ברירת המחדל של כלי הדפדפן מתאימה לסביבת Codex שבה החבילה נבדקה. בסביבה אחרת יש להפנות לקובץ `index.mjs` של Playwright ולבינארי Chromium מותקנים.

המחולל משחזר 58 פריטים, 37 קובצי GLB, כל ה־SVG והמניפסט בצורה דטרמיניסטית. הוא קורא את רכב הפורמולה הקיים בלבד; אין הורדות או כלי דחיסה. האיגוד משבץ את משאבי הריצה והקוד בקובץ תצוגה אחד. קובץ ההורדה אינו משכפל את הממשק שכבר נוצר בדפדפן.

המאמת בודק את כל קובצי ה־GLB, חתימות הנכסים, הצירים, הצמתים, הספירות, כל SVG והנפח הכולל. הודעות המידע `NODE_EMPTY` צפויות: אלה צמתי החיבור והפליטה המכוונים; אין שגיאות או אזהרות. בדיקת הריצה טוענת גם ב־GLTFLoader הרגיל של Three, בלי מפענחים, ובודקת שיתוף חומרים, מגע קרקע, החלפה מקבילה ושחרור.

בדיקת הדפדפן מפעילה את כל הפריטים ואת 100 שילובי הצבעים, שומרת ומרעננת, משחזרת משמירה פגומה, מבצעת החלפות חוזרות, בודקת מקלדת ושתי אוריינטציות, מורידה את המסמך ופותחת את תוכנו מחדש בהקשר אופליין. היא מפיקה צילומי מסך ולוחות השוואה מתוך הרכב שהורכב בפועל. מדיניות המכונה חוסמת ניווט `file://`; הטעינה המבודדת ללא רשת מתועדת בדוח ואינה מתוארת כבדיקת ניווט קובץ שעברה.

בדיקות הריפו:

```sh
npm test
```

בסביבה זו Playwright ברירת המחדל מפנה לכרום שאינו מותקן. לבדיקות המאגר משתמשים בנתיב החיבור שכבר קיים בבדיקות, בלי לשנות אותן:

```sh
ISLAND_PLAYWRIGHT="$PWD/workout/island/design/racing-customize-v1/source/playwright-system.mjs" node --test --test-force-exit tests/*.mjs
```

לאחר שהדוח וכל הצילומים סופיים, הפקת מלאי ובדיקת מסירה סופית:

```sh
node workout/island/design/racing-customize-v1/source/finalize.mjs
```
