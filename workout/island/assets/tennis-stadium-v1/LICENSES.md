# רישיונות ומקורות

כל הקבצים החדשים בחבילה זו הם יצירה מקורית שנוצרה עבור משימה זו, ומוקדשים לנחלת הכלל תחת **CC0-1.0**. אין נכסי מלאי, צילומים, אנשים מזוהים, סימני מסחר או לוגואים. האוהדים הם דמויות גאומטריות בדיוניות עם פנים ללא תווי זיהוי. העיר בדיונית ואינה מבוססת על אתר אמיתי.

במידה המותרת בדין, יוצרי החבילה מוותרים על זכויות היוצרים והזכויות הנלוות ביצירות המקוריות המנויות להלן, באמצעות [CC0 1.0 Universal — הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ, לרבות לשימוש מסחרי, בלי חובת ייחוס. אין אחריות מכל סוג. CC0 אינו מעניק זכויות בסימני מסחר או בזכויות צדדים שלישיים.

| קובץ | רישיון | מקור ותהליך יצירה |
|---|---|---|
| `runtime/stand-10m.glb` | CC0-1.0 | גאומטריית מדרגות, כיסאות ומעקות מקורית; `source/build.py`, הפונקציה `models` |
| `runtime/ad-board.glb` | CC0-1.0 | לוח וגרפיקה גאומטרית מקוריים; `source/build.py` |
| `runtime/umpire-chair.glb` | CC0-1.0 | מודל כיסא וסולם מקורי; `source/build.py` |
| `runtime/net-post.glb` | CC0-1.0 | מודל עמוד וידית מתיחה מקורי; `source/build.py` |
| `runtime/player-bench.glb` | CC0-1.0 | ספסל מקורי; `source/build.py` |
| `runtime/scoreboard.glb` | CC0-1.0 | מודל לוח תוצאות מקורי; `source/build.py`; משתמש ב־`runtime/score-display.png` |
| `runtime/floodlight.glb` | CC0-1.0 | עמוד וגופי תאורה מקוריים; `source/build.py` |
| `runtime/net.glb` | CC0-1.0 | רשת וקצה עליון מדורג מקוריים; `source/build.py` |
| `runtime/court-blue-green.png` | CC0-1.0 | צבע, גרגר מחזורי וקווי מגרש מקוריים; `source/build.py`, הפונקציה `textures` |
| `runtime/hardcourt-tile.png` | CC0-1.0 | אריח משטח כחול מחזורי מקורי; `source/build.py` |
| `runtime/evening-city.png` | CC0-1.0 | שמיים וקו רקיע גאומטרי בדיוני מקורי; `source/build.py` |
| `runtime/score-display.png` | CC0-1.0 | תצוגת ניקוד וסימני 5×7 מקוריים; מילון `GLYPHS` בתוך `source/build.py`; בלי קובצי גופן |
| `runtime/crowd-atlas.png` | CC0-1.0 | רינדור מקורי של 16 דמויות גאומטריות ב־Blender; `source/fans.py`; בלי מודלים מיובאים או תמונות ייחוס |
| `source/build.py` | CC0-1.0 | קוד מקורי לכתיבת GLB, חומרים, מרקמים ופריסת הסצנה |
| `source/fans.py` | CC0-1.0 | קוד מקורי לבניית הדמויות, התאורה והמצלמה ולרינדור האטלס |
| `source/inventory.py` | CC0-1.0 | קוד מקורי לחישוב רשימת הקבצים והנפח המדויק |
| `preview.html` | CC0-1.0 | עמוד תצוגה מקורי בעברית |
| `preview.css` | CC0-1.0 | עיצוב מקורי של עמוד התצוגה |
| `preview.mjs` | CC0-1.0 | קוד סצנה, טעינה, קהל מופעי, ספירה ובקרי מצלמה מקוריים |
| `preview.jpg` | CC0-1.0 | צילום של סצנת החבילה ב־Chromium באמצעות `browser-check.mjs`; כל התוכן החזותי מקורי |
| `verify.py` | CC0-1.0 | בדיקות חבילה מקוריות |
| `browser-check.mjs` | CC0-1.0 | בדיקות טעינה, אינטראקציה ו־CSP מקוריות |
| `assets.json` | CC0-1.0 | מדידות וחתימות SHA-256 שנוצרו ב־`source/build.py` |
| `scene.json` | CC0-1.0 | פריסת סצנה ומפרט אטלס מקוריים שנוצרו ב־`source/build.py` |
| `inventory.json` | CC0-1.0 | רשימת כל קובצי החבילה ונפחיהם שנוצרה ב־`source/inventory.py` |
| `REPORT.md` | CC0-1.0 | תיעוד ומדידות מקוריים של החבילה |
| `LICENSES.md` | CC0-1.0 | מסמך מקור ורישוי מקורי זה |

## תוכנות ותלויות קיימות

לא נוספו עותקים של ספריות צד שלישי. התצוגה משתמשת בשלושה קבצים שכבר קיימים במאגר: `../../vendor/three.module.js`, `../../vendor/GLTFLoader.js`, `../../vendor/BufferGeometryUtils.js`. אלה חלק מ־[three.js, ברישיון MIT](https://github.com/mrdoob/three.js/blob/r160/LICENSE), ואינם חלק מקבצי החבילה החדשים או מההקדשה ל־CC0. האפליקציה צריכה להגיש אותם לצד התיקייה; אין טעינה מ־CDN.

כלי היצירה והבדיקה — Python, Pillow, Blender, Chromium, Node.js ו־Playwright — אינם מופצים בחבילה. פלטי הגאומטריה והתמונות מקוריים; ספריות הכלים וקוד המקור שלהן אינם מוטמעים בפלטים.
