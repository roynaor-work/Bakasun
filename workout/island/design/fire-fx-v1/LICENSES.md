# מקור ורישיונות — fire-fx-v1

כל הקבצים בחבילה נוצרו במיוחד עבור Bakasun, בסיוע Codex, ב־13/11/2026.
כל האיורים הם צורות וקטוריות ואנימציות מתמטיות מקוריות. אין בחבילה נכס מיובא,
צילום, גופן, סמל, כיתוב מוטבע או דגימה מחבילת צד שלישי.
רפרנס סגנוני נוצר באמצעות OpenAI Image Generation; פיקסלים ממנו אינם כלולים בתוצרים.

| קובץ | מקור | רישיון |
|---|---|---|
| flame-small.png | source/build.cjs — fireFrame, קנה מידה 0.48 | CC0-1.0 |
| flame-medium.png | source/build.cjs — fireFrame, קנה מידה 0.72 | CC0-1.0 |
| flame-large.png | source/build.cjs — fireFrame, קנה מידה 1.00 | CC0-1.0 |
| flame-extinguish.png | source/build.cjs — fireFrame, הקטנה ודעיכה עד שקיפות | CC0-1.0 |
| smoke-black.png | source/build.cjs — smokeFrame, שלושה ענני עשן מדורגים | CC0-1.0 |
| steam-white.png | source/build.cjs — smokeFrame, אדים לבנים | CC0-1.0 |
| water-jet.png | source/build.cjs — jetFrame, סילון ופסי זרימה | CC0-1.0 |
| water-droplets.png | source/build.cjs — jetFrame/drop, טיפות נעות | CC0-1.0 |
| water-impact.png | source/build.cjs — splashFrame, נתז שמסתיים בשקיפות | CC0-1.0 |
| water-puddle.png | source/build.cjs — puddleFrame, שלולית | CC0-1.0 |
| foam-bubbles.png | source/build.cjs — foamFrame, בועות מחזוריות | CC0-1.0 |
| sparks.png | source/build.cjs — sparksFrame, חלקיקים עולים | CC0-1.0 |
| water-pressure-line.png | source/build.cjs — pressureFrame, גלים מחזוריים בציר X | CC0-1.0 |
| manifest.json | source/build.cjs — מידות, פריימים, קצב, עיגון, ערבול ו־SHA-256 | CC0-1.0 |
| preview-data.js | source/build.cjs — מטא־דאטה מהמניפסט לפתיחה גם ללא שרת | CC0-1.0 |
| preview.html | מקור HTML/CSS מקורי לחבילה | CC0-1.0 |
| preview.js | מקור JavaScript מקורי לניגון באמצעות Canvas 2D | CC0-1.0 |
| source/build.cjs | מקור SVG/JavaScript מקורי של האיורים ומחולל הגיליונות | CC0-1.0 |
| LICENSES.md | מסמך מקור ורישוי מקורי זה | CC0-1.0 |

כל הזכויות הניתנות לוויתור בקבצים המקוריים לעיל מוקדשות לנחלת הכלל לפי
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
מותר להעתיק, לשנות ולהפיץ, גם מסחרית וללא ייחוס. אין אחריות.
נוסח הרישיון: https://creativecommons.org/publicdomain/zero/1.0/legalcode

כלי היצירה sharp ו־libvips משמשים רק לרסטריזציה ולדחיסת PNG; קוד שלהם אינו
מופץ בחבילה. לשחזור: Node.js 22 ומעלה, sharp 0.35.4 (Apache-2.0; libvips: LGPL-2.1-or-later).
הוראות ההרצה מופיעות בראש source/build.cjs. התצוגה אינה דורשת התקנה או רשת.
