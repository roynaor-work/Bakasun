# התאמה ל־CSP של המשחק

תוצאה: **PASS** · 2026-11-06T10:34:56.087Z.

מדיניות המשחק נקראה ללא שינוי מתוך workout/island/index.html והוגשה ככותרת HTTP למסמך הבדיקה. לא נוספו blob:, eval או wasm-unsafe-eval ל־script-src.

```text
default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

8 הקשרים חדשים × 15 קליפים נמסרים, עם פענוח Draco ו־WebP מקומי, 21 ערוצי אנימציה ושני Workers סטטיים מאותו מקור בכל הקשר. כל כשל בקשה או שגיאת CSP מכשילים את המקרים החיוביים.

| מקרה | תוצאה | קליפים | Workers סטטיים | כשלים בבקשות | זמן, ms |
|---|---|---:|---:|---:|---:|
| 1 | PASS | 15 | 2 | 0 | 1235.6 |
| 2 | PASS | 15 | 2 | 0 | 1313.5 |
| 3 | PASS | 15 | 2 | 0 | 1103.0 |
| 4 | PASS | 15 | 2 | 0 | 1192.7 |
| 5 | PASS | 15 | 2 | 0 | 1124.4 |
| 6 | PASS | 15 | 2 | 0 | 1223.7 |
| 7 | PASS | 15 | 2 | 0 | 1266.4 |
| 8 | PASS | 15 | 2 | 0 | 1013.3 |
| 404 של Worker — ביקורת שלילית | PASS | 0 | 2 | 2 | 166.2 |

הביקורת השלילית מחזירה 404 רק לקובץ ה־Worker במכוון. הטעינה חייבת להידחות עם הודעת Worker בתוך 10 שניות; deadline אינו נחשב לתוצאה תקינה.

ה־Worker הסטטי מבוסס על minigames/hoops-draco-worker.mjs הקיים; גוף פרוטוקול r160 הועתק ללא שינוי, ורק נתיב importScripts הותאם. המתאם שומר קריאה ישירה של Response עבור קובץ WASM ואת מגבלת שני ה־Workers.

SHA-256 ספרייה: `ad77d97f92443d8b924834b16620c1896354956945dab1d39fad1a8e6a255f7f`.

SHA-256 Worker: `0b658d61a560f875058de7aa99c958d5f7a3e2134c075cc78940629c7784f53e`.

תוצאות מלאות, מדיניות, כתובות Worker ושגיאות הביקורת השלילית נמצאות בקובץ JSON הדחוס שליד דוח זה.

שחזור:

```sh
node workout/island/design/hoops-motion-v8/source/verify-csp.mjs --rounds 8
```

## הוכחת התקלה לפני התיקון

אותו קליפ 07 ואותו harness הצליחו ללא CSP, אך עם המדיניות המדויקת דפדפן Chromium חסם יצירת blob Worker לפי script-src self. שתי שגיאות CSP הופיעו והטעינה לא הסתיימה בתוך 8 שניות. אחרי החלפת המתאם ל־Worker הסטטי, שני המצבים נטענו עם 21 ערוצים ואפס שגיאות. התיעוד לפני/אחרי נשמר ב־[CSP-REGRESSION.json.gz](CSP-REGRESSION.json.gz).
