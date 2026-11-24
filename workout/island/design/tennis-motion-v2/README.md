# Tennis motion v2

ספריית נכסים עצמאית של **24 פעולות טניס ב־30Hz** לשלד הקנוני בן 18 העצמות. האחיזה הקשיחה של tennis-grip-v1 נשמרת בכל הפעולות. [הדוח והציונים שנמדדו](REPORT.md) · [הקטלוג](catalog.json) · [התצוגה](preview.html) · [הרישיונות](LICENSES.md).

| תוצר | שימוש |
|---|---|
| `tennis-motion-v2.glb` | ספריית 24 אנימציות, שלד, inverse bind וחיבורי מחבט ומורף. גאומטריית קישור זעירה ושקופה מאפשרת טעינה ב־GLTFLoader רגיל; את הפעולות מחילים על דמות תואמת. |
| `height-low.glb`, ‏`height-high.glb` | אותן ספריות של 24 פעולות, עם גובה מגע אחר בחבטות. פעולות ההקשר נכללות כדי לשמור על שלבי ההגשה ורפרנס ההיכון; מספר הפעולות הלוגיות נשאר 24. |
| `source/reference/grip-player.glb` | דמות הבדיקה, מחבט, ידיים, כדור, גאומטריה ומרקמים מקוריים של tennis-grip-v1. הקובץ נשמר ללא שינוי פעם אחת ומשמש את כל גרסאות התנועה. |
| `catalog.json` | מזהים, משכים, אירועים בשניות, חלונות תמיכה, נקודות מגע, גבהים, מקור ו־hash לכל GLB. |
| `sheets/*.webp` | גיליון של שמונה פריימים מרונדרים לכל אחת מ־24 הפעולות. |
| `runtime.mjs` | גשרי Hermite מסוג C1 לפוזות מקומיות עם מהירות קווית וזוויתית רציפה. |
| `verification/` | תוצאות motion-qa-v1, בדיקות GLB, בדיקת דפדפן ומקורות נעולים. |

הפעולות מכסות הטלה, הצלפה ונחיתה בהגשה; פורהנד; בקהנד בשתי ידיים וביד אחת; וולי פורהנד ובקהנד; סמאש; סלייס; דרופ שוט; ריצה צידה וקדימה; חזרה להיכון; עמידת קבלה; זינוק; החלקת חימר; חגיגה; אכזבה; לחיצת יד ליד הרשת; מעקב מבט; ושלוש הכנות שונות להגשה. וולי בקהנד משלים את רשימת הבקשה ל־24 קליפים.

## צפייה מקומית

משורש המאגר הפעילו שרת HTTP:

```sh
python3 -m http.server 8765
```

פתחו [את התצוגה המקומית](http://localhost:8765/workout/island/design/tennis-motion-v2/preview.html). בחרו פעולה, נגנו או גררו את ציר הזמן ובחרו גובה כשיש לפעולה גרסאות גובה. גודל הייחוס הוא 844×390. פתיחה ישירה ב־`file://` אינה נתמכת בגלל טעינת מודולים וקובצי GLB.

## חוזה השימוש

כל GLB בחבילה עומד בתקרת המאגר של 2,000,000 בתים לקובץ. קובצי ספריית התנועה מיועדים להעברת קליפים לדמות: טוענים פעם אחת את `catalog.referenceAsset`, טוענים את ספריית התנועה מתוך `catalog.asset` או גרסת הגובה, ומקשרים את ערוצי האנימציה לדמות לפי שמות העצמות והצמתים. התצוגה המצורפת מבצעת זאת ב־`AnimationMixer`. הגאומטריה המלאה נשמרת בקובץ הייחוס בלבד.

לדוגמה, כאשר `loader` הוא `GLTFLoader` ו־`THREE` מיובא מהספרייה המקומית:

```js
const actor = await loader.loadAsync(catalog.referenceAsset);
const library = await loader.loadAsync(catalog.asset);
scene.add(actor.scene);
const mixer = new THREE.AnimationMixer(actor.scene);
const clip = library.animations.find(clip => clip.name === 'forehand');
mixer.clipAction(clip).play();
```

מנגנים את 24 הקליפים שבספריית התנועה; האנימציות המקוריות שבקובץ הייחוס הן חלק מהמקור הנעול. לדמות אחרת דרושים אותם 18 שמות עצמות, הורות ומנח מנוחה, וכן צמתי `grip_hand_L` עם morph פתיחה ו־`Ball` אם מציגים אותם.

היחידות הן מטרים: ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאלה. ערכי quaternion הם מקומיים ביחס להורה בסדר xyzw. אנימציית הגוף משתמשת ב־`CUBICSPLINE` עם ערכים ונגזרות ב־30Hz. ערוצי הכדור הם `LINEAR`: המהירות משתנה ברגע החבטה בהתאם לאימפולס. נקודת המגע בקטלוג היא מרכז המיתרים, ומרכז הכדור נמצא במרחק רדיוס כדור ממנו ברגע המגע.

`Root` נשאר במקום. בריצה נדרש מנוע המשחק להזיז את הדמות פעם אחת בהתאם לתרחיש `metadata.referenceTravel`. חלונות התמיכה נמדדים עם תרחיש זה ב־QA. החלקת החימר מתועדת כהחלקה מכוונת, ובדיקת רגל נטועה חלה על חלונות התמיכה שמסביבה.

אין להוסיף סיבוב או היסט למחבט: `racket_mount` הוא בן קבוע של `RightHand`, עם המטריצה המקורית של tennis-grip-v1. האנימציות משנות את עצם היד, בלי ערוצים לציוד ובלי עצמות נוספות. בקהנד בשתי ידיים מכוון את יד שמאל למרכז התמיכה העליון של הידית.

שלושת שלבי ההגשה הם מקטעים של תנועה אחת. מעבר בין פעולות אחרות משתמש ב־`createBridge({from,to,duration:.3})`, ב־`sampleBridge(bridge,t)` וב־`applyLocalPose(scene,pose)` מתוך `runtime.mjs`. כל קצה כולל `hips`, ‏`rotations` לכל 18 העצמות, ובמידת הצורך `hipsVelocity`, ‏`rotationDerivatives`, ‏`leftOpen`, ‏`leftOpenVelocity`. נגזרות הסיבוב הן רכיבי quaternion לשנייה, כפי שהם נשמרים בערוצי ה־GLB. ציוד אינו חלק מגשר הפוזות.

## שחזור ואימות

דרושים Node.js 24+, ‏Python 3, ‏Playwright עם Chromium ו־Pillow. קוד הבנייה, ה־QA וגשרי C1 משתמש בקבצים המצורפים ואינו דורש התקנת חבילות Node במאגר. הפקודות הבאות רצות משורש המאגר.

```sh
node workout/island/design/tennis-motion-v2/source/build.mjs
node workout/island/design/tennis-motion-v2/source/qa.mjs
node --test workout/island/design/tennis-motion-v2/source/test-runtime.mjs
node --import ./workout/island/design/tennis-motion-v2/source/qa-register.mjs --test workout/island/design/tennis-motion-v2/vendor/motion-qa-v1/test/*.test.mjs
```

להתקנת מאמת GLB בלבד, מחוץ למאגר, ולהרצתו:

```sh
npm install --prefix /tmp/tennis-motion-v2-tools gltf-validator@2.0.0-dev.3.10 --cache /tmp/tennis-motion-v2-npm-cache --no-audit --no-fund
node workout/island/design/tennis-motion-v2/source/validate.mjs
```

צילום הגיליונות ותצוגת הייחוס:

```sh
python3 workout/island/design/tennis-motion-v2/source/capture.py
```

לאחר שהבדיקות והצילומים הושלמו, הפקת הדוח והמלאי:

```sh
node workout/island/design/tennis-motion-v2/source/finalize-report.mjs
```

ה־QA מפענח את שלושת קובצי ה־GLB ומריץ את המתמטיקה המקורית של motion-qa-v1 ללא שינוי, עם דגימות ב־120Hz, זמני האירועים והמפתחות המקוריים. תנאי המעבר הוא ציון **גדול מ־88** וכיסוי מלא לכל מדד חל בכל 72 זרמי האנימציה. זהו ציון אבחוני דטרמיניסטי; הוא אינו הערכה אנושית של איכות התנועה. בדיקות הרצפה משתמשות בנקודות שלד וסוליות, ואינן בדיקת התנגשויות מלאה של הרשת המעוותת.

המסירה מוסיפה קבצים רק בתיקייה זו. חיבור הנכסים ללוגיקת המשחק, מיזוג הענף ובדיקת טלפון אמיתי הם שלבים נפרדים.
