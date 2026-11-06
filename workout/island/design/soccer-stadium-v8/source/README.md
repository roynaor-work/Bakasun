# שחזור הפקה ובדיקות

כלים אלה משמשים להפקה ולבדיקה. המשחק טוען את `runtime/` בלבד, ללא build או התקנות. הבדיקה הנדרשת למסירה היא `node --test` מתיקיית החבילה והיא משתמשת רק ב־Node ובמפענח המצורף; סביבת האימות הייתה Node ‏24.19.0.

| כלי | תפקיד |
|---|---|
| `textures.py` | מרקמים מקוריים ודטרמיניסטיים, Pillow; שמירה אטומית |
| `build-assets.mjs` | גאומטריה מדורגת, כיווץ Draco וכתיבה אטומית |
| `capture.mjs NN` | עשר תמונות מדויקות ב־390×844 וב־844×390, זמן קבוע והפחתת תנועה |
| `coverage.mjs NN` | 432 רינדורים ובדיקת פיקסלים לחשיפת שמיים בצדי המגרש |
| `game-fit-check.mjs NN` | 324 נקודות ראות עם זוויות המצלמה ומידות המשחק |
| `browser-check.mjs` | LOD, טקסט HUD, סיבוב מסך, שחרור GPU ושחזור הקשר WebGL |
| `failure-check.mjs` | כשלי HTTP, Worker וביטול, ניקוי וניסיון חוזר |
| `integration-check.mjs` | העתקת runtime למארח זמני נפרד עם ה־CSP הקיים |
| `csp-check.mjs NN` | ה־CSP הקיים ובדיקת התאמה בין קובצי runtime לבקשות בפועל |
| `atomic-write-check.mjs` | קריאת GLB ומרקמים דרך HTTP בזמן הפקה מחדש |
| `soak.mjs 90 URL` | רינדור רצוף, החלפת מצלמות/כיוון מסך/LOD ורענון מחזורי |
| `performance-check.mjs URL` | זמני RAF ורינדור עם GPU finish; ייחוס תוכנתי בלבד, ללא אישור ביצועי טלפון |
| `residency-check.mjs URL` | ספירת בתים במאגרי גאומטריה והערכת מרקמי RGBA8; ללא framebuffer או תקורת מנהל התקן |
| `report.mjs` | ספירת פאות עצמאית, גדלים, רשימת קבצים וחתימות |
| `roll-iterations.mjs NN` | שמירת שני סבבים בלבד והפיכת הקודמים לשורה ביומן |

הפקת GLB דורשת glTF Transform ‏4.2.1 ו־draco3dgltf ‏1.5.7 מותקנים מחוץ לריפו; `STADIUM_TOOLS` מצביע ל־`node_modules` שלהם. רינדור דורש Playwright ו־Chromium מותקנים; `PLAYWRIGHT_MODULE` מצביע ל־`index.mjs` ו־`CHROMIUM_PATH` לקובץ ההפעלה. לא נשמרו תיקיית node_modules, קובץ נעילה או תלות npm בחבילה.

דוגמת סדר עבודה מתיקיית החבילה, כאשר הכלים מותקנים:

```sh
python source/textures.py
node source/build-assets.mjs
node source/serve.mjs 8765 --game-csp
```

במסוף נפרד:

```sh
node source/capture.mjs 13
node source/coverage.mjs 13
node source/game-fit-check.mjs 13
node source/csp-check.mjs 13
node --test
```

לאחר צפייה בכל התמונות כותבים ביקורת וציונים ב־`iterations/NN/REVIEW.md`, מתקנים ומתחילים סבב נוסף. בסוף מפעילים את `roll-iterations.mjs` על הסבב האחרון שהושלם. יומן ה־CSV של הרינדור מכיל זמני RAF של Chromium תוכנתי בלבד; אין להמיר אותם להבטחת ביצועים בטלפון.
