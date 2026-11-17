# hoops-motion-v13

חבילת תנועה לכדורסל: שלד `ATHLETE_STANDARD` קנוני של 18 עצמות, 30 הרץ, מטרים, Y למעלה, Z קדימה ו־X לשמאל השחקן. כל הפעולות המפורטות בבקשה נשמרות: **32 קליפים נפרדים ב־24 משפחות**, כולל עמידה עם כדור ובלעדיו. אין שינוי בקוד המשחק או חיבור אוטומטי אליו.

[תצוגה חיה](preview.html) · [דוח מסירה](REPORT.md) · [רישיונות ומקורות](LICENSES.md) · [תוצאות דרישות](verification/requirements.json) · [QA מקורי](verification/qa/report.html)

## תוצרי ריצה

- `runtime/motions.json`: כל 32 התנועות, פוזות מלאות ב־30Hz, אירועים, חלונות תמיכה, מסלולי כדור ותרחישי תנועת השחקן.
- `runtime/catalog.json`: אינדקס, גודל ו־SHA-256 לכל GLB, בלי שכפול פוזות.
- `runtime/clips/*.glb`: קליפי glTF 2.0 ללא דחיסה, 18 ערוצי סיבוב ותרגום Hips. דמות התצוגה משותפת; אין צורך לשכפל mesh לכל פעולה.
- `runtime/motion.json`: מבנה הקידוד של hoops-tall v12: `version:1`, `fps:30`, עצמות לפי `CANON_NAMES`, סיבובים Int16/32767, היסטי אגן Int16/10000, אירועים במילון שם→זמנים בשניות. יש לקרוא את פרופיל השלד והערות הכדור בקובץ לפני חיבור.
- `runtime/player.mjs`: דגימה, גשר רציף C1, החלפת יעד בזמן גשר ואירועים לפי שעון מוחלט.

ב־`motions.json` מיקום Hips הוא תרגום מקומי **מוחלט**; `athletes-core` וקידוד tall מקבלים את ההיסט ממנו ביחס לגובה המנוחה `0.86`. משך כל קליפ הוא בדיוק `(frameCount-1)/30`.

Root נשאר באפס עם סיבוב זהות. `referenceTravel` הוא מסלול שחקן חיצוני, ומוחל פעם אחת במדידה ובתצוגה. מי שמחבר למשחק צריך להפעיל את אותה מהירות ייחוס וכיוון כדי לשמור רגל נטועה בעולם. המסלול אינו ערוץ Root כפול.

## שחזור

משורש המאגר, עם Node 24 שתומך ב־`registerHooks`:

```sh
node workout/island/design/hoops-motion-v13/source/build.mjs
node workout/island/design/hoops-motion-v13/measure.mjs
node workout/island/design/hoops-motion-v13/source/verify-transitions.mjs
node workout/island/design/hoops-motion-v13/source/verify-pack.mjs
node workout/island/design/hoops-motion-v13/source/capture.mjs
node workout/island/design/hoops-motion-v13/source/report.mjs
```

`measure.mjs` קורא את הקומיט הקבוע `5eb4f093bc22523ee417a7f2345c3b813bffba24` של כלי `motion-qa-v1`, מחלץ אותו לתיקייה זמנית ומריץ את `workout/island/design/motion-qa-v1/run.mjs` המקורי. ה־hook מחליף רק את רשימת קובצי הקלט בספרייה החדשה; הרץ, נוסחאות המדדים והספים אינם משתנים. אם אובייקט Git חסר, הסקריפט מוריד רק את קומיט הרפרנס. קובצי הכלי אינם מתווספים ל־main במסגרת החבילה.

המדידה נעשית מה־GLB הסופי ב־120Hz, כולל זמני האירועים וחלונות התמיכה. בנוסף לציון QA נבדקים רגל נטועה בטווח 2 ס״מ **במרחב תלת־ממדי**, מגע ברצפה, 30Hz אמיתי בערוצים, התאמה למקור ו־`ATHLETE_STANDARD`. מדידת הגשרים בודקת קצוות ומהירויות מול idle ו־run, כולל קטיעת גשר בתנועה. הגשר מתאר פוזה במערכת השחקן; מגעי עולם בזמן מעבר תלויים במסלול השחקן וב־IK של החיבור למשחק.

תצוגה מקומית:

```sh
python3 -m http.server 8765
```

פתחו את `workout/island/design/hoops-motion-v13/preview.html` דרך השרת. אין `Draco`, `Meshopt`, decoder, WASM או הורדת מודל משירות חיצוני בזמן התצוגה.

הצילום משתמש ב־Playwright וב־Chromium שמותקנים בסביבת העבודה מחוץ למאגר. בסביבה אחרת אפשר להגדיר `PLAYWRIGHT_MODULE` לנתיב מודול Playwright ו־`CHROMIUM_PATH` לקובץ ההפעלה של Chromium. אין צורך בהם לשחזור הנכסים, המדדים והגשרים ב־Node.
