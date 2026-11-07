# כלי חיבור ושחזור

כל הביצועים מקוריים: locomotion.mjs, attack.mjs ו־actions.mjs. authoring.mjs מכיל מתמטיקת וקטורים, קווטרניונים ו־IK בשתי עצמות, המותאמת מכלי CC0 של v8; אין בו פונקציות ביצוע של v8. model.mjs יוצר את כל הגאומטריה המקורית. כל קובץ חדש שייך לתיקיית v9 בלבד.

נדרשים Node 24, Chromium ו־Python לשרת בלבד. התלויות מותקנות מחוץ למאגר:

```sh
npm install --prefix /tmp/hoops-v9-tools --cache /tmp/hoops-v9-npm-cache --no-audit --no-fund @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 draco3dgltf@1.5.7 three@0.160.0
npm install --prefix /tmp/hoops-v9-browser --cache /tmp/hoops-v9-npm-cache --no-audit --no-fund playwright@1.56.1
npm install --prefix /tmp/hoops-v9-validator --cache /tmp/hoops-v9-npm-cache --no-audit --no-fund gltf-validator@2.0.0-dev.3.10
```

מהשורש של המאגר, לפי הסדר:

```sh
node workout/island/design/hoops-motion-v9/source/model.mjs
node workout/island/design/hoops-motion-v9/source/build.mjs
node workout/island/design/hoops-motion-v9/source/write-docs.mjs
node workout/island/design/hoops-motion-v9/source/write-transitions.mjs
node workout/island/design/hoops-motion-v9/source/measure.mjs
node workout/island/design/hoops-motion-v9/source/validate-glb.mjs
node workout/island/design/hoops-motion-v9/source/verify-seams.mjs
node --test workout/island/design/hoops-motion-v9/tests/*.mjs > workout/island/design/hoops-motion-v9/verification/tests.txt
node workout/island/design/hoops-motion-v9/source/capture.mjs --all-sheets
```

למדידה ללא כתיבת דוח: import של measureAll() מ־measure.mjs. להפעלה בספריית כלים אחרת ניתן להגדיר HOOPS_TOOLS_DIR, HOOPS_PLAYWRIGHT_PATH ו־HOOPS_VALIDATOR_DIR; ראו ברירות המחדל בכל כלי.

ה־runtime עצמאי, כולל Three והמפענח המקומיים, ואינו תלוי בכלי הבנייה או בקבצי v8. בדיקת המקוריות בלבד קוראת את נתוני v8 להשוואת ביצועים; נדרש עותק קריא של תיקיות הייחוס האלה לצורך בדיקות הקבלה. אף כלי אינו כותב בהן.

המפרקים אפויים במרווחי 1/30 שנייה. אין מפתחות חריגים מחוץ לרשת כדי להסתיר גבולות קשים. אינטרפולציית GLB ו־gzip היא LINEAR/Slerp. מדידות ב־120Hz כוללות גם את גבולות המגע, ולכן נבדקות הפוזות המוצגות בין הפריימים. לולאות חוזרות בדיוק לאותה פוזה מקומית, בעוד מסלול התנועה החיצוני מצטבר. אירועי זריקה וסמני מגע נשארים תיאוריים בלבד.

המדידות אינן אישור ל־motion capture או לפיזיולוגיה אנושית ספציפית. זהו ספורטאי פרוצדורלי בסגנון תלת־ממד פשוט, עם השלד הקומפקטי הקבוע של הפרויקט. כדי להגיע לכף יד 25 ס״מ מעל טבעת תקנית, ההטבעות דורשות גובה קפיצה חריג ביחס לשלד הקבוע; הדוח מציג את גובהו בפועל.

לאחר שכל בדיקות הקבלה והצילומים עברו ונשמר פלט tests.txt, source/finalize-report.mjs יוצר REPORT.md ומניפסט SHA-256 מתוך הראיות השמורות בלבד.
