# בנייה ואימות

כל כלי הפיתוח מותקנים מחוץ למאגר. נדרש Node.js 22 ומעלה. לצילום אוטומטי נדרש Chromium; ניתן להגדיר `CHROMIUM_PATH` כאשר הנתיב אינו `/usr/bin/chromium`.

```sh
npm install --prefix /tmp/hoops-tall-tools --cache /tmp/hoops-tall-npm-cache @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 draco3dgltf@1.5.7 meshoptimizer@0.25.0 three@0.160.0 sharp@0.34.5 gltf-validator@2.0.0-dev.3.10 playwright@1.56.1
```

ברירת המחדל של הכלים היא `/tmp/hoops-tall-tools`. המשתנה `HOOPS_TALL_TOOLS` מאפשר לבחור תיקיית כלים אחרת. פקודות משורש המאגר:

```sh
node workout/island/design/hoops-tall-v1/source/build-models.mjs
node workout/island/design/hoops-tall-v1/source/verify.mjs
node --test workout/island/design/hoops-tall-v1/tests/*.mjs
```

בנייה מחדש של עותקי הקליפים קוראת ישירות את הקומיטים הקפואים ב־Git. הפעולה אינה משנה קליפים: היא מעתיקה gzip בבתים זהים ורושמת SHA-256 בקטלוג. עותקי המסירה כבר כלולים ואין צורך להפעיל אותה לצפייה או לבדיקה. אין צורך לבצע checkout של קובצי v9 אל ענף המסירה.

```sh
git fetch origin codex/hoops-motion-v9
node workout/island/design/hoops-tall-v1/source/package-clips.mjs
```

המקור הקפוא שנמסר: `main` בקומיט `bd4d3600692b14be8881d2ba50a2b96485f3119e`; v9 בקומיט `6dd1675ded8ef2c9d361821aa1642ab75de90541`. מחולל הדמויות קורא רק את `hoops-v7/characters/models/pg-lod1.glb`, `rig.json` ו־`retarget-map.json`. הוא משמר את ליבת העור והעיניים של MakeHuman ואת גזרת הגופייה המקורית שנוצרה במאגר, מסיר שיער ונעליים מהמקור ואת כל האנימציות, ומתאים בגדים, נעליים ושיער מקוריים. נתוני המקור וגיבובו רשומים ב־`rig.json`.

אימות כולל טעינה ממשית של ששת קובצי ה־GLB, פענוח Draco בכלי הפיתוח, אימות glTF, קריאת כל 98 קובצי התנועה הדחוסים, בדיקות שלד ומדידות כף יד/אגן על המודלים שנמסרו. קובצי הריצה נשארים ללא מפענח וללא דחיסת גאומטריה.
