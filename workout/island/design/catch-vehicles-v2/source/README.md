# שחזור ואימות

המקור נמצא כולו בחבילה. ארכיון הקלט כולל את דגמי Kenney המקוריים ואת הרישיון; חתימותיהם נבדקות בזמן בנייה. אין צורך להוריד מודלים או לקרוא קבצים קיימים בריפו.

מהתיקייה הראשית של החבילה:

```bash
python3 -m pip install --target /tmp/catch-vehicles-python -r source/requirements.txt
PYTHONPATH=/tmp/catch-vehicles-python PYTHONDONTWRITEBYTECODE=1 python3 source/build.py
```

המחולל כותב מחדש רק את `models/` ואת `manifest.json`. הגאומטריה, הפלטות, נורמלי הנזק, מבנה הצמתים והקליפים נמצאים בקוד. לא נדרש Blender, כלי מסחרי או מפענח דחיסה.

התקינו כלי Node בתיקייה זמנית, כדי לא להכניס תלויות לחבילת המסירה:

```bash
npm install --prefix /tmp/catch-vehicles-tools --cache /tmp/catch-vehicles-npm --no-audit --no-fund three@0.160.0 esbuild@0.25.0 gltf-validator@2.0.0-dev.3.10
NODE_PATH=/tmp/catch-vehicles-tools/node_modules /tmp/catch-vehicles-tools/node_modules/.bin/esbuild source/engine-entry.mjs --bundle --format=esm --minify --outfile=vendor/engine.mjs
cp /tmp/catch-vehicles-tools/node_modules/three/LICENSE vendor/LICENSE.three
node source/validate.mjs --modules /tmp/catch-vehicles-tools
```

המאמת בודק את קובצי ה־GLB שנמסרו: חתימות, מספרי משולשים, כל הסצנות, ערכי המורף, הורות הגלגלים, פנסים, קליפים, מגע בקרקע ותקציב התיקייה כולה. הוא שומר דוח Khronos גולמי לכל דגם וסיכום מבני.

בדיקת דפדפן, עם Playwright ל־Python ו־Chromium מותקן:

```bash
python3 -m http.server 8765
```

במסוף נוסף:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 source/browser_check.py --url http://127.0.0.1:8765/ --chromium /usr/bin/chromium
```

הבדיקה מפעילה את הבקר והאנימציות המובנות, בודקת מסגור בכל דגם ומצב בשתי מידות מסך ובשלוש זוויות, מפוצצת כל גלגל בנפרד, בודקת פקדים ומבצעת שלושה מחזורי החלפת צי. היא שומרת נתונים וצילומי דפדפן ישירים ב־`verification/`. אין עריכת תמונות בדיעבד.

בדיקות הריפו הכלליות מופעלות משורש הריפו:

```bash
npm test
```

אם Playwright של הסביבה מפנה לדפדפן שלא הותקן, והריפו מספק את נקודת החיבור `ISLAND_PLAYWRIGHT`, אפשר לבחור ב־Chromium המותקן בלי לערוך את הבדיקות. משורש הריפו:

```bash
ISLAND_PLAYWRIGHT="$PWD/workout/island/design/catch-vehicles-v2/source/playwright-system.mjs" npm test
```

אפשר להגדיר גם את `CATCH_CHROMIUM_EXECUTABLE_PATH` ואת `CATCH_PLAYWRIGHT_MODULE` לנתיבים המקומיים המתאימים.
