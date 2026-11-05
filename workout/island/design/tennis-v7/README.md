# טניס v7 — נכסים ותצוגה מקומית

חבילת טניס מקורית בסגנון תלת־ממד מצויר ומאופק: קשיח, חימר ודשא; רשת עם שקיעה וצל; שופט כסא, ארבעה שופטי קו ושני צלמים; יציע עם 480 צופים ב־instancing; יום וערב; שני שחקנים ושתי שחקניות עם תלבושת ומחבט. ארבע הדמויות בוגרות ובדויות. [הדוח](REPORT.md) כולל טבלת ציונים, משקלים, תיעוד סבבים ומגבלות המדידה.

## פתיחה

1. פותחים את [standalone.html](standalone.html). זה קובץ יחיד הכולל קוד, ארבע דמויות, מגרשים, טקסטורות ומפענח; אין build, התקנה, CDN או בקשת רשת. אפשר להעתיק רק אותו לטלפון. בסביבה המנוהלת כאן ניווט ישיר ל־file נחסם במדיניות הדפדפן; הקובץ נבדק במצב offline באמצעות קריאה מקומית, בלי חיבור לשרת.
2. בוחרים משטח, יום/ערב ומבט. ב״תקריב״ בוחרים אחת מארבע הדמויות ואז גוף, פנים או אחיזה. בתפריט התנועה בוחרים פעולה, מפעילים/משהים או גוררים זמן. גרירה מסובבת, צביטה מקרבת; חצים, +/− ו־Home פועלים במקלדת.
3. התוצאה הצפויה: קווים ורשת קריאים בשתי מידות הטלפון, ארבע דמויות מובחנות, שירות בארבעה שלבים, אחיזה סביב הידית, סימן נחיתה על קו יחידים/הגשה, ותנועה שקופאת בהשהיה. סמל הפסים מחליף איכות מאוזנת/חסכונית.

אם דפדפן חוסם פתיחת קובץ, מפעילים משורש הריפו שרת מקומי בלבד:

```sh
python3 workout/island/design/tennis-v7/source/serve.py
```

ואז פותחים [תצוגה מקומית](http://127.0.0.1:8765/standalone.html). [preview.html](preview.html) הוא אותו viewer עם ספריות מקומיות נפרדות, נוח לעריכה. כל התלויות שלו נמצאות בתיקייה זו.

## חוזה שילוב

| פרט | ערך |
|---|---|
| מנוע | Three.js r160 מקומי; GLB סטנדרטי עם Draco required |
| יחידות וצירים | מטרים, +Y למעלה, +Z קדימה; אורך המגרש על Z, מרכז הרשת במקור |
| מגרש | 23.77×10.97 מ׳; יחידים 8.23, קו הגשה ±6.40, בסיס ±11.885 |
| רשת | רוחב 12.8; 1.07 מ׳ בקצה, 0.914 במרכז, מיתרים 1.8 מ״מ וחורים כ־45 מ״מ |
| שלד | 18 עצמות: סדר, שמות והורים של motion2; תרגומי bind מכוילים ו־inverse binds מסופקים |
| דמות | `Body_LOD0/1/2`, `Racket_RightHand`, `Racket_LOD1`; עור, בגד וציוד באטלס 512 אחד |
| LOD | LOD0 לעיון קרוב, LOD1 בשידור/סגל, LOD2 בריחוק חסכוני. פירוט המחבט מותאם למרחק. כל הרמות באותו GLB |
| אנימציות | idle, run, serve, forehand, backhand, volley, smash, slide, celebrate |
| ניגון | idle/run לולאה; האחרות LoopOnce + clampWhenFinished; preview חוזר עליהן לצורך עיון |
| Root | in-place. [presentation.json](presentation.json) מתאר גלישה חזותית חיצונית; הסימולציה אחראית לתנועה |
| מגע | `extras.events`, זמן מנורמל ושניות, ו־contactSweetSpot; סמני תצוגה בלבד |
| כדור | קוטר פיזי 67 מ״מ; הדגש חזותי במבט שידור מתועד ב־presentation.json |
| קהל | GLB של אבטיפוסי high/cheer/low + crowd-layout.json; 480 מטריצות, 3 ציורים מאוזנים או אחד חסכוני |
| תאורה/צללים | מידע ב־presentation.json; תאורה וצל מוקרן הם רכיבי הסצנה, אינם נאפים בתוך GLB |

לשילוב במשחק משתמשים ב־`models/*.glb`, ב־rig/motions/layout ובטקסטורות המוטבעות. תיקיית `offline/` וה־HTML העצמאי הם עותקי תצוגה מקומיים; אין לטעון אותם בנוסף ל־GLB באותו מסלול משחק. [manifest.json](manifest.json) שומר bytes ו־SHA-256.

## מדידה ואימות

[verification/assets.json](verification/assets.json) בוחן את הקבצים שנמסרו אחרי פענוח Draco, ולא קובצי ביניים. כל הקבצים ≤1,500,000 bytes, כל תמונה ≤1024, ולכל דמות אטלס אחד. דוח Validator דחוס ומפוענח נפרד נשמר לכל קובץ.

[verification/browser.json](verification/browser.json) מתעד אינטראקציה בלי רשת, כולל עצירה ללא רינדור, צביטה, שינוי כיוון ו־WebGL recovery. צילומי 390×844 ו־844×390, קרוב ורחוק, נשמרים ב־`iterations/NN/` לצד ביקורת. מסבב 06 נשמר גם snapshot מקור לפני צילום.

יעד הריצה הוא 30fps עם DPR מוגבל, LOD, צל זירה במטמון ואיכות אדפטיבית. **SwiftShader הוא GPU תוכנה; אין בחבילה מדידת FPS בטלפון פיזי.** המדידות המלאות ומצב החומרה מופיעים בדוח, בלי להציג אמולציית מסך כמדידת מכשיר.

לבדיקת מכשיר אמיתי פותחים את [phone-check.html](phone-check.html), שגם הוא קובץ יחיד בלי רשת. בוחרים איכות/תאורה, לוחצים ״מדידת 60 שניות״ ומעתיקים את התוצאה בלחצן. בודקים יום וערב בשני הכיוונים. הקובץ מציג ממוצע, סוף חלון מדידה, p95 ו־DPR; אין שליחה של מידע לשירות כלשהו.

## שחזור הנכסים

כלי הכתיבה בלבד דורשים Python עם NumPy/Pillow/Playwright, Node, Chromium וגרסאות התלויות המוצמדות ב־source/package.json. מתקינים בתיקיית כלים זמנית; הריפו הראשי אינו צריך npm install לצפייה.

```sh
mkdir -p /tmp/tennis-v7-tools
cp workout/island/design/tennis-v7/source/package.json /tmp/tennis-v7-tools/package.json
cp workout/island/design/tennis-v7/source/package-lock.json /tmp/tennis-v7-tools/package-lock.json
npm ci --prefix /tmp/tennis-v7-tools --cache /tmp/tennis-v7-npm --no-audit --no-fund
python3 workout/island/design/tennis-v7/source/characters.py
python3 workout/island/design/tennis-v7/source/textures.py
node workout/island/design/tennis-v7/source/build-actors.mjs
node workout/island/design/tennis-v7/source/build-environment.mjs
node workout/island/design/tennis-v7/source/build-props.mjs
node workout/island/design/tennis-v7/source/package-offline.mjs
python3 workout/island/design/tennis-v7/source/create-phone-check.py
node workout/island/design/tennis-v7/source/audit-assets.mjs
```

אחרי שינוי תצוגה מפעילים שוב package-offline כדי לעדכן את ה־HTML העצמאי. הצילום והביקורת הם חלק מהשחזור; עצם הצלחת המחולל אינה אישור חזותי. [מקורות ורישיונות](LICENSES.md).
