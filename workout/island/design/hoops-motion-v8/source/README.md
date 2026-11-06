# הפקה ובדיקות

המשחק משתמש בתיקיית `runtime/` המוכנה. הכלים כאן מיועדים לעריכת הנכסים ולשחזור הבדיקות, ואינם חלק מלולאת המשחק. כל חבילות הפיתוח מותקנות ב־`/tmp`, מחוץ לריפו.

## כלים

נדרשים Node 24, Chromium ו־Python לשרת מקומי בלבד. התקנה חד פעמית:

```sh
npm install --prefix /tmp/hoops-motion-v8-tools --cache /tmp/hoops-motion-v8-npm-cache --no-audit --no-fund @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 draco3dgltf@1.5.7 meshoptimizer@0.25.0 three@0.160.0 sharp@0.34.4
npm install --prefix /tmp/hoops-motion-v8-browser --cache /tmp/hoops-motion-v8-npm-cache --no-audit --no-fund playwright@1.56.1
npm install --prefix /tmp/hoops-motion-v8-validator --cache /tmp/hoops-motion-v8-npm-cache --no-audit --no-fund gltf-validator@2.0.0-dev.3.10
```

`HOOPS_TOOLS_DIR`, `HOOPS_PLAYWRIGHT_PATH`, `HOOPS_VALIDATOR_DIR` ו־`HOOPS_CHROMIUM` מאפשרים נתיבים אחרים. ברירת המחדל של Chromium היא `/usr/bin/chromium`. אין צורך בהתקנת Chromium נוספת דרך Playwright אם הוא כבר זמין.

## בנייה ברצף

מתיקיית החבילה:

```sh
node source/build.mjs
```

התהליך מחבר את כל הפוזות, כותב JSON דחוס, מייצא את כל ה־GLB, בודק FK עצמאי ובודק כדור מול משולשי הגוף שנמסרים. בכל GLB מוטבע SHA-256 של קובץ ה־gzip ושל מודל התצוגה. הדוח ב־`verification/BUILD.md` כולל חתימות של המקורות והקבצים.

אין להריץ מחבר, ייצוא או רנדר במקביל. אחרי שינוי פוזות יש להשלים **את כל הייצוא** לפני צילום או בדיקות התאמה. מקור שנערך במהלך `build.mjs` גורם לכישלון. רנדר קיים נעשה מיושן אם משתנים בתיו של קובץ שהתצוגה טוענת; בדיקת הראיות מזהה זאת.

מודל העריכה כבר נמסר כ־`source/preview-model.glb`. בנייה מחדש של הגאומטריה מהמקורות הקיימים בריפו:

```sh
node source/build.mjs --rebuild-model
```

אפשרות זו דורשת גם את דגמי המקור והמטא־דאטה ב־`hoops-v7/characters/` ואת חוזה השלד ב־`motion2/`. היא משמרת את הגאומטריה המורשית, מתאימה אותה ל־bind הקנוני, מחליקה משקלי ביגוד ומתקנת סוליות. נתוני התנועה עצמם מקוריים למשימה זו.

## בדיקות

```sh
node --test
node --test --test-isolation=none tests/*.test.mjs
node source/audit-motion.mjs
node source/preview-model-validate.mjs --report verification/SKIN.md --assert
node source/body-clearance.mjs --report verification/BODY.md --assert
node source/validate-gltf.mjs
node source/verify-csp.mjs
node source/check-package.mjs --write
node source/reproduce.mjs
```

הפקודה השנייה מספקת פירוט לכל מקרה בסביבה שמציגה רק סיכום לכל קובץ. גם `node --test` רגיל מזהה כשל: בוצעה בדיקת בקרה שלילית בקובץ זמני שהכיל assertion שגוי והחזירה קוד יציאה 1.

`audit-motion.mjs` משתמש ב־FK ובדגימת quaternion עצמאיים, ובוחן את ה־gzip שנמסר, ללא המחבר. `preview-model-validate.mjs` ו־`body-clearance.mjs` מפענחים את הגאומטריה והאנימציה האמיתיות, כולל סוליות, פני כדור ומשולשי גוף. `--author` בבדיקת הגוף הוא כלי עזר לכוונון פוזות מול מודל התצוגה; דוח המסירה משתמש בברירת המחדל, אנימציית ה־GLB שנמסרת.

`verify-csp.mjs` מגיש מסמך עם מדיניות המשחק המדויקת, טוען את כל הקליפים בהקשרים חדשים ובודק גם Worker חסר. התצוגה והרנדר משתמשים באותה מדיניות; המפענח פועל בשני Workers סטטיים מקומיים.

`reproduce.mjs` בונה עותק בתיקייה זמנית במבנה ריפו, ומשווה את כל 30 קובצי ה־GLB/gzip ברמת הבתים. הוא אינו כותב לקובצי runtime שנמסרים. הדוח ב־`verification/REPRODUCIBILITY.md`.

לבדיקות הריפו הרחבות בסביבת הענן שיש בה Playwright מותקן אך חסר Chromium במטמון שלו, אפשר להפנות את ההרצה לדפדפן המערכת. משורש הריפו, עם גישה לשרת HTTP מקומי:

```sh
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=$PWD/workout/island/design/hoops-motion-v8/source/system-browser-preload.mjs" npm test
```

ה־preload משנה את נתיב הדפדפן בלבד. הוא אינו חלק מהמשחק, אינו משנה בדיקות קיימות ואינו עוקף assertions או CSP. תוצאות ההרצה וההשוואה לקומיט הבסיס ב־`verification/TESTS.md`.

## רנדר וביקורת

```sh
node source/capture.mjs --iteration 09 --label describe_the_change
```

בחרו מספר חדש. הכלי מקפיא עותק של דף התצוגה וה־runtime, מאמת SHA של זוגות GLB/gzip, מרנדר 15×8×4 פריימים אמיתיים ב־390×844 ו־844×390, קרוב ורחוק, ושומר WebP ו־`capture.json.gz`. צילומי המסך המלאים נשמרים במידות המדויקות; גיליונות שמונת הפריימים מוקטנים לצפייה והשוואה. כל בדיקת מסגור נעשית במידות הרנדר המקוריות.

אחרי הרנדר: עברו על כל הקליפים, בדקו ידיים, שחרור, עומק, כדור, תמיכות ונחיתה; כתבו ביקורת קצרה וציון 1–10 לכל סעיף. לציון מתחת ל־8 ציינו את החסר ואת התיקון הבא. תקנו לפני הסבב הבא. שמרו רק שתי תיקיות הסבב האחרונות, והעבירו כל סבב קודם לשורת טקסט אחת ב־`iterations/HISTORY.md`.

בדיקת דפדפן צפופה ובדיקת רצף ממושכת:

```sh
node source/verify-browser.mjs
node source/verify-browser.mjs --minutes 75 --out verification/SOAK.md
```

הבדיקה מגישה את החבילה בלבד, חוסמת בקשות חיצוניות, בודקת את כל הקליפים, צעדי זמן, מסגור ופקדי ניגון, ומודדת רצף ניגון והחלפת קליפים. המדידה משתמשת ב־SwiftShader בענן; זו אינה מדידת GPU בטלפון פיזי. האינטגרציה במשחק והמדיניות הסמכותית נשארות אצל המשחק המארח.
