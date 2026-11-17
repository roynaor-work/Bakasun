# בנייה ואימות

לשימוש בחבילה מספיק לפתוח את `../preview.html`; אין צורך בכלי הפיתוח.

המודל נבנה ב־Python 3 עם NumPy. האצבעות הן morphs, ועצמות המנוחה נלקחות מ־`../rig.json`. הגאומטריה, הבעות הפנים והמחוות ניתנות לשחזור, ללא הורדת נכסים.

1. מתוך תיקיית הריפו, לבניית GLB מחדש:

```sh
python3 workout/island/design/coach-mascot-v1/source/build.py
```

2. כדי לארוז HTML מחדש יש להתקין את גרסאות הפיתוח הנעולות ב־`source/package.json` בתיקייה זמנית, ולהגדיר `COACH_NODE_MODULES` ל־`node_modules` שלה. סביבת הבנייה המקורית השתמשה ב־`/tmp/coach-tools/node_modules`. לאחר התקנת כלי הפיתוח, האריזה עצמה אינה מבצעת בקשות רשת:

```sh
node workout/island/design/coach-mascot-v1/source/package-preview.mjs
```

3. מדידת motion-qa-v1 משתמשת בעותק מקומי ללא שינוי של ששת המודולים ב־`qa-upstream/` וב־three.js המקומי שב־`vendor/`. הסקריפט בודק SHA לפני ההרצה, דוגם את ה־GLB ואת פינות הסוליה, ושומר את הדוחות תחת `../verification/`:

```sh
node workout/island/design/coach-mascot-v1/source/qa-run.mjs
```

4. לבדיקת Khronos ושאר אילוצי הנכס (אפשר להעביר נתיב אחר ל־gltf-validator כארגומנט):

```sh
node workout/island/design/coach-mascot-v1/source/validate.mjs /tmp/coach-tools/node_modules/gltf-validator
```

5. בדיקת התצוגה דורשת Playwright ו־Chromium, ומריצה את המסמך עם כל הרשת חסומה. יצירת לוחות הפריימים דורשת Pillow וגופן DejaVu Sans מקומי:

```sh
node workout/island/design/coach-mascot-v1/source/browser-check.mjs
python3 workout/island/design/coach-mascot-v1/source/contact-sheets.py
```

6. אחרי שכל הבדיקות עברו, יוצרים manifest, דוח ו־ZIP ובודקים שהגודל הכולל, כולל הארכיון, נמוך מ־6,000,000 בתים:

```sh
python3 workout/island/design/coach-mascot-v1/source/finalize.py
```

יש להריץ שוב את `validate.mjs` בסוף כדי לתעד את תקציב התיקייה כולל ה־ZIP, ואז את `finalize.py` כדי לכלול בארכיון את הדוח המעודכן. אין לשנות את הקוד המקורי תחת `qa-upstream/`; רק המתאם וקובץ המטא־דאטה שייכים לחבילה זו.
