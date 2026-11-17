# שחזור בדיקות הדפדפן

נדרשים Node.js, Playwright ו־Chromium. אין התקנת תלויות בריפו. אפשר להגדיר `ISLAND_CHROME` ו־`ISLAND_PLAYWRIGHT` לנתיבים המקומיים.

```sh
node workout/island/design/soccer-quality-v1/tests/browser-quality.mjs --root /path/to/baseline --label baseline
node workout/island/design/soccer-quality-v1/tests/browser-quality.mjs --root /path/to/patched-copy --label after --query soccerQuality=v1
node workout/island/design/soccer-quality-v1/tests/browser-performance.mjs --root /path/to/baseline --label baseline
node workout/island/design/soccer-quality-v1/tests/browser-performance.mjs --root /path/to/patched-copy --label after --query soccerQuality=v1
```

יש להעתיק את קובצי `sim/*scenarios.mjs` החדשים גם לעותק הנבדק. קובצי המשחק המקוריים בעותק הבסיס נשארים ללא שינוי.

`browser-quality.mjs` נכנס דרך ממשק האי, בונה מגרש בזיכרון בדיקת הדפדפן ומתחיל משחק רגיל בשתי המידות. המסירות מופעלות דרך מקלדת DOM; לחצן ההגבהה נלחץ באמצעות מגע אמיתי של Chromium ונבדק `isTrusted`. סידור שחקנים דרך `dev=1` מאפשר שחזור. זמן המשחק מדומה לצורך הקלט; אחרי השחרור פיזיקת הנחיתה נמדדת במודל המשחק הטעון בצעדים קבועים. בדיקת העומק מתעדת מהירות לפני השחרור, משום ששחקן שרץ חזרה למערך אינו מקבל חוקי למסירה לעומק.

`initialReceiverDistanceM` הוא המרחק מנקודת השחקן בתחילת הסידור, וכולל את תנועתו בלי כדור. `releaseTargetDistanceM` משווה לנקודה הנצפית לאחר השחרור. מדדי דיוק מבודדים, שוער, מיקום ורמות יריב נמדדים בנפרד באותו דפדפן באמצעות `runBrowserScenarios`, עם אותן פונקציות תרחיש המשמשות ב־Node.

`browser-performance.mjs` משתמש ב־RAF אמיתי ואינו מתקין שעון מדומה. אחרי 30 פריימי חימום נמדדים 90 פריימים בכל כיוון. יש להריץ אותו בלי בדיקות או סימולציות כבדות ברקע. השדה `renderCpu` מודד את זמן השעון של הקריאה ל־`view.render`, לרבות המתנה אפשרית לדרייבר; הוא אינו דגימת CPU של מערכת ההפעלה. SwiftShader הוא GPU תוכנה: מדידה זו מספקת השוואה מקומית ואינה בדיקת קצב פריימים בטלפון.

בשתי ההרצות נאכפת מדיניות ה־CSP המקורית, נרשמות שגיאות ונבדקים 22 שחקנים. בהרצת `soccerQuality=v1` נבדק גם שלא התבקשו קובצי WASM ושלא נקראו פונקציות יצירה/הידור של WebAssembly בדף; בדיקות הטוען משלימות את הבדיקה בתוך ה־worker.
