# שחזור וולידציה

אלה כלי יצירה בלבד. לפתיחת התצוגה אין צורך להריץ אותם.

התקנת התלויות מתבצעת מחוץ לריפו, כדי שלא להוסיף `node_modules` או לשנות קבצים קיימים:

```sh
npm install --prefix /tmp/defense-v7-tools --cache /tmp/defense-v7-npm-cache @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 draco3dgltf@1.5.7 gltf-validator@2.0.0-dev.3.10 meshoptimizer@0.24.0 esbuild@0.25.12
```

מריצים משורש המאגר, לפי הסדר. אפשר לבחור מיקום tooling אחר בעזרת `DEFENSE_TOOLS` שמצביע ל־`package.json` שלו.

```sh
node workout/island/design/defense-v7/source/build-assets.mjs
node workout/island/design/defense-v7/source/build-environment.mjs
node workout/island/design/defense-v7/source/build-guards.mjs
node workout/island/design/defense-v7/source/guard-lod.mjs
node workout/island/design/defense-v7/source/guard-static-lod.mjs
node workout/island/design/defense-v7/source/boar-static-lod.mjs
python3 workout/island/design/defense-v7/source/effect-atlas.py
python3 workout/island/design/defense-v7/source/water-map.py
node workout/island/design/defense-v7/source/audit.mjs
node workout/island/design/defense-v7/source/winding-audit.mjs
node workout/island/design/defense-v7/source/animation-audit.mjs
node workout/island/design/defense-v7/source/manifest.mjs
node workout/island/design/defense-v7/source/offline.mjs
```

`audit.mjs` מפענח Draco ובודק גם את ה־GLB הדחוס וגם את הגרסה המפוענחת ב־Khronos Validator. הוא בודק גודל, משולשים, נורמלים, משקולות, אטלס משותף, עצמות ועוגנים. `winding-audit.mjs` בודק את התאמת כיוון המשולשים לנורמלים. `animation-audit.mjs` משחזר skinning במעבד ובודק את כל הקליפים המונפשים, קרקע וסגירת לולאות ב־30Hz.

לצילום סבב חדש, מפעילים את `serve.py` ואז `capture.py --iteration NN --night --assets`. הכלי מסרב לדרוס `render.json` של סבב קיים. ביקורת ידנית מתווספת ל־`iterations/NN/CRITIQUE.md`.

`browser-audit.py` בודק את ה־HTML העצמאי במצב מנותק, כולל פקדים, אפקטים ושחזור WebGL. `performance.py` בודק בנפרד CPU רגיל והאטה פי ארבע; משהים רינדור סטודיו לפני הרצה. בדיקת `soak.py` מזהה את קובץ הנעילה של המדידה ומשהה את העומס עד לסיומה. `soak.py --seconds 8400` מבצע החלפות, פגיעות ובדיקת משאבים ממושכת, עם SHA של כל גרסת HTML שנבחנה.

רינדורי הסטודיו הם ביקורת נוספת של גאומטריית ה־GLB הסופית, בתאורה שונה. צילומי הדפדפן הם האסמכתה למראה בזמן שימוש.

אחרי ריצת ההשהייה הארוכה מריצים גם `soak.py --seconds 600 --output soak-final` מול ה־HTML הסופי. `report.py` מסרב להפיק דוח לפני ששתי הריצות ושאר הבדיקות הושלמו. `inventory.py` מפיק CSV של גדלי הקבצים וחותמותיהם אחרי סיום כל הרינדורים.

אפיית הצל הנייד: `studio-input.mjs --all --out /tmp/defense-v7-shadow-input`, אחריו Blender עם `farm-shadow.py`, ואז `shadow-filter.py`. מקור 1024² מפיק מפת אלפא 512². לאחר רינדורי סטודיו משתמשים ב־`pack-studio.py`; הוא שומר WebP באיכות 92 וחותמת SHA של ה־PNG המקורי.
