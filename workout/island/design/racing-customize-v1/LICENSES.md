# רישיונות ומקורות

| רכיב | מקור | רישיון |
| --- | --- | --- |
| 16 כנפיים, 6 גלגלים, 8 קסדות, 6 אביזרי אפקט | גאומטריה מקורית שנוצרה לחבילה זו; המחולל ב־`source/build-assets.py` | CC0-1.0 |
| 12 מדבקות, מסכת פסים, 58 אייקוני פריטים ו־7 אייקוני קטגוריות | נתיבים וקטוריים מקוריים; בלי מותגים, כיתוב או תמונות חיצוניות | CC0-1.0 |
| העתק רכב הבסיס עם ארבעה צמתי חיבור נוספים | `../../assets/racing-formula/formula.glb`; המקור והתיעוד ב־`../racing-formula/README.md` מצהירים על גאומטריה מקורית ברישיון CC0-1.0 | CC0-1.0 |
| ממשק, קורא GLB, מתאם חיבור, אפקטים וכלי מחבר | קבצים מקוריים בחבילה זו, למעט רכיב ההקרנה בשורה הבאה | CC0-1.0 |
| מנוע תצוגה, סביבת תאורת חדר והקרנת מדבקות | Three.js 0.160.0: `three`, `RoomEnvironment`, `DecalGeometry`; משובצים בקובץ התצוגה | MIT |
| `runtime/decal.mjs` | העתק של `DecalGeometry` מאותה גרסה; גבול הייבוא והייצוא הותאם לקבלת מופע Three המקומי של המשחק | MIT |

קובץ הרכב המקורי נקרא בלבד. החתימה המדויקת של המקור שמורה בשדה התאימות במניפסט. ההעתק בחבילה שומר את הגאומטריה והחומרים ומוסיף צמתי חיבור בלבד. אין כאן חלקים שמקורם בדגמי הקופה האחרים או ברישיונות שלהם.

החומרים הם צבעים מוצקים; אין גופנים, HDR, צילומי מוצר, סמלי יצרן, טקסטורות או נכסי צד שלישי נוספים. מרקמי המדבקות נוצרים מה־SVG המקומי, ורכות העשן וצל המגע נוצרות מקומית בזמן התצוגה.

כל התוכן המקורי החדש בחבילה מוקדש לשימוש חופשי לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). מקור הרכב מתועד באותו רישיון. כלי המחבר אינם נדרשים להפעלת התצוגה: מאמת Khronos, כלי האיגוד ובדיקות הדפדפן מותקנים בנפרד ואינם כלולים או מופצים בחבילת הריצה.

## Three.js — רישיון מלא

The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
