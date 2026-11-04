# אצטדיון כדורגל 06

חבילת עיצוב עצמאית: אצטדיון פתוח בשני מפלסים, גגון וזרקורים, מגרש תקני, דשא PBR, רשתות גאומטריות, קהל בשש וריאציות, ותאורת יום וערב. נוצרו רק קבצים חדשים בתיקייה זו. אין שינוי במשחק או בגרסה החיה.

[דוח מסירה וגדלים](REPORT.md) · [דוח נכסים מדוד](verification/assets.json) · [בדיקת דפדפן](verification/browser.json) · [רישיונות ומקורות](LICENSES.md)

## צפייה

1. משורש הריפו, הפעילו שרת קבצים:

   ```sh
   python -m http.server 8765 --bind 127.0.0.1
   ```

2. פתחו את [דף התצוגה המקומי](http://127.0.0.1:8765/workout/island/design/soccer-v6/stadium/preview.html).
3. בחרו יום/ערב, שידור/שער/דשא/יציעים, ומים/אבק. גרירה מסובבת את המצלמה; גלילה מקרבת. אפשר לעצור את התנועה. העדפת מערכת להפחתת תנועה מתחילה בהשהיה.

התוצאה הצפויה: 12 דמויות קנה מידה, שתי קומות יציעים מלאות וקהל קופץ, רשת שניתן לבחון בתקריב, ומעבר ברור בין אור יום לתאורת ערב. התצוגה משתמשת רק ב־three.js r160, בטוענים ובמפענח Draco המקומיים של הריפו. אין CDN ואין שלב build להרצה.

קישורים שימושיים: [יום](preview.html?mode=day) · [תקריב שער](preview.html?view=goal) · [דשא רטוב](preview.html?view=turf&wet=1).

## מסירה לחיבור

| קובץ | תפקיד |
|---|---|
| `assets/stadium-shell.glb` | שבע גאומטריות מאוחדות: בטון, קורות, גגון, שורות ישיבה, מעקות, פרסום ניטרלי וזרקורים |
| `assets/pitch.glb` | דשא עם צבע, נורמל OpenGL ושיכוך; קווי מגרש ומשטח היקפי |
| `assets/goals.glb` | שני שערים במידות 7.32×2.44 מטר, רשת מצינורות בעלי נפח; אין משטח שקוף שמדמה רשת |
| `assets/crowd-six.glb` | שש וריאציות מקור לשכפול ב־InstancedMesh; החיבור מדגים שש קריאות לקהל הקרוב |
| `textures/crowd-atlas.png` | שש וריאציות מרונדרות ב־1024×256 לקהל הרחוק; קריאת ציור אחת |
| `textures/particles-atlas.png` | אטלס RGBA בגודל 256×256: אבק, טיפה, הילה ועלֶה |
| `assets/scale-athlete-lod0.glb`, `assets/scale-athlete-lod1.glb` | נגזרות קלות מדמות CC0 הקיימת לבדיקת קנה מידה ועומס 6 מול 6; אינן חבילת שחקנים חדשה |
| `layout.json` | מיקומים לקהל ולזרקורים. כל שורת קהל תואמת ל־`crowdFields`; `near` הוא 0 או 1 |
| `asset-report.json` | ספירות, גודל בבתים, SHA-256, תקציבים ומקור הדמות |
| `preview.mjs` | דוגמת הרכבה, תאורה, instancing, קפיצה על GPU, חלקיקים, רטיבות ומעבר מצלמות |

הצירים הם X לרוחב, Y למעלה ו־Z לאורך. המגרש 68×105 מטר ומרכזו `[0,0,0]`; פני הדשא ב־Y=0.01. קווי השער ב־Z=±52.5. השערים, הדשא והקערה כבר באותו קנה מידה ובאותו origin. ה־GLB מכילים את מפות החומר שלהם; העותקים החיצוניים ב־`textures/` נמסרים גם לעריכה ואינם נטענים שוב בתצוגה.

דשא: צבע 1024, נורמל 512, שיכוך 512, חזרה כל 3.8 מטר. פסי הכיסוח והבלאי מחושבים במרחב המגרש כדי להימנע מחזרת כתמי בלאי בכל אריח. נורמל ושיכוך הם נתונים לינאריים; צבע ואטלס קהל ב־sRGB. הגדרת גלישת מרקמים מוטמעת ב־GLB. הרטיבות מפחיתה roughness באזור אורגני ומשקפת את סביבת התאורה.

הקהל הקרוב משתמש בגאומטריה; הרחוק ב־billboards עם alpha test ואטלס משותף. כל המיקומים סטטיים. uniform זמן אחד מפעיל קפיצה חלקה עם phase לכל מופע, ללא עדכון אלפי מטריצות ב־CPU. שש הווריאציות נוצרו מדמות בדיונית קיימת, עם תנוחות ועיצוב צבע שונים. כל טקסט הפרסום הוא ביטויים כלליים ללא סמלים.

## שחזור היצירה

נדרשים Blender 4.3, Python עם NumPy/Pillow ו־Node. התלויות ב־`source/package.json` משמשות ליצירה ולא לדפדפן. תיקיית העבודה הזמנית היא `/tmp/stadium-v6-tools`.

```sh
mkdir -p /tmp/stadium-v6-tools
cp workout/island/design/soccer-v6/stadium/source/package.json /tmp/stadium-v6-tools/package.json
npm install --prefix /tmp/stadium-v6-tools --cache /tmp/stadium-v6-npm-cache --no-audit --no-fund
```

```sh
python workout/island/design/soccer-v6/stadium/source/textures.py
node workout/island/design/soccer-v6/stadium/source/build.mjs --decode
blender -b --factory-startup --python workout/island/design/soccer-v6/stadium/source/crowd.py
node workout/island/design/soccer-v6/stadium/source/build.mjs
node workout/island/design/soccer-v6/stadium/source/validate-assets.mjs
```

כאשר שרת התצוגה פועל ו־Playwright ו־Chromium מותקנים:

```sh
python workout/island/design/soccer-v6/stadium/source/inspect-browser.py
```

הבדיקה שומרת צילומי דפדפן בגודל מלא ומדידות; היא אינה משנה בדיקות קיימות. התוצאות לא מהוות מדידת ביצועים של טלפון פיזי. בדיקת טלפון וחיבור למשחק נעשים לאחר סקירת הטיוטה.
