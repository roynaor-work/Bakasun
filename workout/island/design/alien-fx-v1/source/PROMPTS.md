# מקור הגרפיקה

תאריך: 13.11.2026. נוצרה תמונת מקור חדשה באמצעות כלי ImageGen המובנה של OpenAI, ללא תמונת ייחוס וללא נכס חיצוני. התוצאה המקורית נשמרה ללא שינוי בשם `effects-original.png` ‏(1254×1254, RGBA). התבקש רקע שקוף אמיתי באמצעות `transparent_background: true`.

## ההוראה לכלי

```text
Create an ORIGINAL production game VFX source atlas PNG with a TRUE TRANSPARENT alpha background, no backdrop, no checkerboard, no text, no lettering, no labels, no borders, no guns or ships or creatures. Square 1024x1024 canvas divided into EXACTLY 2 columns and 3 rows, six evenly spaced isolated effects, each effect centered in its cell with at least 22% transparent padding around its silhouette, nothing touching another cell. Top left: stylized cartoon sci-fi muzzle flash pointed vertically UP, a compact white hot ivory core and tapered golden yellow orange flame lobes, base at bottom. Top right: a longer powerful vulcan cannon burst pointed vertically UP, bright yellow ivory core with lively orange glow, multiple tapered flame lobes, base at bottom. Middle left: a small cheerful star shaped alien impact spark cluster, 5 gold yellow rays with warm mint flecks. Middle right: a round small alien energy explosion, orange golden billowing puffs, ivory core, mint teal sparks around it. Bottom left: a large boss explosion source, beautiful round stylized billowing fireball with ivory yellow core, orange scalloped plumes and some coral magenta outer energy accents, NO shockwave ring (added separately later). Bottom right: a translucent cyan teal energy shield circular ring, perfectly face-on, very thin glassy luminous rim, a few little light glints, the inside must be transparent, NO solid disk. Style: polished friendly 2D cartoon mobile space game for seven year olds, crisp silhouettes, lively soft gradients, premium carefully painted game sprites, not photoreal, not scary, no violence or debris bodies, controlled local glow with clean transparency. All 6 must be separated and complete, clearly defined consistent illumination and coherent art direction.
```

הכלי החזיר 1254×1254, ולכן `pack.mjs` משתמש בקואורדינטות של התוצאה בפועל. ההנפשה מבוססת על מקור נפרד לכל משפחת אפקטים: שינוי גודל, זווית, שקיפות ותזמון. גל ההלם, חלקיקי הבוס, מד החום ואייקון הלהבה הם גאומטריה מקורית שנכתבה לחבילה. המקור לא עבר הסרת רקע לפי צבע; ה־alpha נשמר. באריזת המגן בלבד, ערכי alpha קטנים מ־4/255 מאופסים כדי להסיר אבק כימות מהמרכז השקוף. לא מדובר ב־64 איורים ידניים נפרדים.

## שחזור

נדרשים Node.js עם Sharp 0.35.4, ‏Python 3 עם NumPy 2.3.5 ו־FFmpeg עם libvorbis ו־libmp3lame. אין תלות זו לצורך פתיחת המציג או שימוש בנכסים המוכנים.

מתוך תיקיית `source/`, לאחר התקנת התלויות שבקבצים המצורפים:

```sh
python3 synthesize.py
node pack.mjs
```

הסינתזה דטרמיניסטית עם seed קבוע, ב־48kHz, ללא דגימות קול חיצוניות. מתבצעים דחיסה, הגבלת שיאים ומדידת הקבצים לאחר קידוד. רשימת התוצאות נשמרת ב־`audio-measurements.json`; לאחריה נבנים האטלסים, `manifest.json` ו־`preview-data.js`. מקור ה־PNG כבר כלול, ולכן שחזור אינו מחייב יצירת תמונה נוספת או גישה לכלי AI.
