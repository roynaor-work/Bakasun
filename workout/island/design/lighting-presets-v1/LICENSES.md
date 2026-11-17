# מקורות ורישיונות · lighting-presets-v1

כל הנכסים נטענים מהתיקייה הזאת. אין CDN, גופנים חיצוניים, מודלים דחוסים או WASM.

| קבצים | מקור | רישיון ושינויים |
|---|---|---|
| `presets.json`, `lighting.js`, `preview.html`, `preview.css`, `preview.js`, `tools/*` | יצירה מקורית למשימה, 17.11.2026 | MIT, הנוסח להלן |
| `textures/sky-tile.png`, `textures/clouds.png`, `textures/halo.png` | יצירה פרוצדורלית מקורית ב־`tools/build.py`; ללא צילום, מודל יצירה או נכס צד שלישי | MIT, כולל זכות שימוש, שינוי והפצה מסחרית |
| `preset-data.js`, `manifest.json`, `lighting-presets-v1.zip` | תוצרי בנייה של הקבצים המתועדים כאן | אותם רישיונות של התוכן; ה־ZIP כולל גם את רישיון Three.js |
| `verification/*` | צילומי התצוגה המקורית ופלט הבדיקות | MIT; הצילומים כוללים רינדור באמצעות Three.js |
| `vendor/three.local.js` | עותק מקומי של Three.js r160 מתוך `workout/island/vendor/three.module.js` במאגר הבסיס | MIT; הכרזת `export` הוחלפה בהשמה ל־`globalThis.THREE` ועטיפת פונקציה, כדי לתמוך בסקריפט רגיל ב־`file://`. גוף הספרייה נשמר |
| `vendor/LICENSE.three` | עותק מלא של הודעת הרישיון מהמאגר | Copyright © 2010–2023 three.js authors; נדרש לשמור בהפצה |
| `REPORT.md`, קובץ זה | תיעוד מקורי למשימה | MIT |

מקור Three.js: <https://github.com/mrdoob/three.js/tree/r160>.
רישיון המקור: <https://github.com/mrdoob/three.js/blob/r160/LICENSE>.
הקישורים הם לתיעוד בלבד ואינם נטענים בתצוגה.

הגופנים הם גופני המערכת שכבר מותקנים אצל המשתמש; שום קובץ גופן אינו מצורף. הסצנות הן גאומטריה מקורית פשוטה: חוף ומתקני אימון, מגרש ויציעים, הרים ומסלול. אין דמויות, לוגואים, מועדונים או נכסי משחק מסחרי.

## MIT — התוכן המקורי בחבילה

Copyright (c) 2026 Bakasun contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
