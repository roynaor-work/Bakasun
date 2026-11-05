# שחזור ובדיקות המחבר

הכלים כאן אופציונליים ואינם דרישת ריצה של index.html או offline.html. קובצי הפלט כבר מוכנים. כל המחוללים כותבים תחת racing-v7 בלבד; קלט המקור והתקנות כלי המחבר נשמרים ב-/tmp.

כלים שנבדקו: Blender 4.3.2, Python עם NumPy/Pillow/Matplotlib, Node 24, Three 0.160.0, glTF Transform 4.5.1, draco3dgltf 1.5.9, gltf-validator 2.0.0-dev.3.10 ו-Playwright 1.62.1 עם Chromium 151. מפענח הריצה הוא העותק המקומי הקיים בריפו; התאימות נבדקה בפועל על כל ה-GLB.

התקנת כלי המחבר:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm --prefix /tmp/racing-v7-tools install three@0.160.0 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 draco3dgltf@1.5.9 gltf-validator@2.0.0-dev.3.10 playwright@1.62.1
export NODE_PATH="/tmp/racing-v7-tools/node_modules${NODE_PATH:+:$NODE_PATH}"
```

הורדת מקור המכונית המיוחס ב-LICENSES.md:

```sh
curl --fail --location https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb -o /tmp/racing-v7-CarConcept.glb
```

יש להשוות את SHA-256 ל-`c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b` שבקובץ הייחוס לפני יצירה מחדש. המחולל אינו מוריד או מעדכן את המקור בעצמו.

מחוללים, משורש הריפו:

```sh
python3 workout/island/design/racing-v7/source/build-textures.py
```

```sh
blender -b --factory-startup --python workout/island/design/racing-v7/source/build-assets.py -- cars original tracks props crowd
```

```sh
node workout/island/design/racing-v7/source/compress-assets.mjs
```

```sh
node workout/island/design/racing-v7/source/audit-assets.mjs
```

```sh
node workout/island/design/racing-v7/source/verify-contact.mjs
```

```sh
node workout/island/design/racing-v7/source/verify-road-clearance.mjs
```

```sh
node workout/island/design/racing-v7/source/pack-offline.mjs
```

בדיקות דפדפן לקבצים המופרדים משתמשות בשרת localhost משורש הריפו:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

בסביבת העבודה מותקן Playwright בנתיב החיפוש של Node ו-Chromium ב-/usr/bin/chromium. בסביבה אחרת התאימו את נתיב ההפעלה בסקריפטים. יצירת סבב נוסף אינה משכתבת ביקורת קודמת:

```sh
node workout/island/design/racing-v7/source/capture.mjs 18
```

```sh
node workout/island/design/racing-v7/source/verify-ui.mjs
```

```sh
node workout/island/design/racing-v7/source/verify-framing.mjs framing --sweep
```

```sh
node workout/island/design/racing-v7/source/verify-offline.mjs
```

```sh
node workout/island/design/racing-v7/source/benchmark.mjs final 120
```

```sh
node workout/island/design/racing-v7/source/soak.mjs 45
```

בדיקות הריפו הושלמו עם Chromium המותקן, דרך hook התצורה הקיים, ללא שינוי בדיקות:

```sh
ISLAND_PLAYWRIGHT="$PWD/workout/island/design/racing-v7/source/playwright-system.mjs" node --test --test-concurrency=1 --test-force-exit tests/*.mjs
```

לאחר סיום הבדיקות אפשר להפיק גלריה, גרף משאבים, דוח ומלאי. מחולל הדוח דורש בדיקות שעברו ו-45 דקות שהייה שלמות, ומוודא התאמת hashes לגרסה שנבדקה:

```sh
node workout/island/design/racing-v7/source/build-review.mjs
```

```sh
python3 workout/island/design/racing-v7/source/verify-images.py
```

```sh
MPLCONFIGDIR=/tmp/racing-v7-mpl python3 workout/island/design/racing-v7/source/plot-stability.py
```

```sh
node workout/island/design/racing-v7/source/finalize-report.mjs
```

```sh
node workout/island/design/racing-v7/source/inventory.mjs
```

המלאי מופק אחרון, אחרי כל שינוי בדוח ובתיעוד. הבדיקה הבאה קוראת בלבד ומשווה כל hash, את תוכן ה-HTML העצמי, את הקישורים המקומיים ואת היקף שינויי Git:

```sh
node workout/island/design/racing-v7/source/verify-delivery.mjs
```

benchmark מודד תנועה רציפה ב-SwiftShader, עם בוסט ודריפט פעילים, ב-12 צירופי סביבה/אוריינטציה/איכות. יש להריצו לבדו לצורך מדידה מבודדת. soak מבצע החלפות רכב/סביבה/אוריינטציה ובודק זיכרון לאורך זמן; הוא אינו בדיקת טלפון. capture שומר תמונות, אפשרויות צילום, מדדי רינדור ו-hash של קוד התצוגה. כל ביקורת חזותית נכתבה לאחר צפייה בתמונות.
