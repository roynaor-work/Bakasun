# ערכת בסיסים לספינות

13 מבנים תלת־ממדיים מקוריים בסגנון משחק לילדים: חוף בחול ובטון, ארמון בלבן וזהב עם כיפות כחולות, ומספן בבטון כהה ופלדה. לכל מבנה מצב שלם, פגוע עם פיח והרוס כערימה נמוכה. אלה קובצי נכסים ותצוגת ביקורת; החבילה אינה מחוברת למשחק.

## צפייה

1. משורש המאגר הפעילו שרת מקומי:

   ```sh
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

2. פתחו את [התצוגה המקומית](http://127.0.0.1:8765/workout/island/design/naval-base-models-v1/preview.html).
3. החליפו סגנון ומצב, ובחרו מבנה לבדיקה מקרוב. בתותח בדקו סיבוב צריח והגבהת קנה. חזית המבנים וחרטום הצוללת פונים לכיוון המסומן `+Z`.

הקבצים נטענים מהמאגר בלבד, באמצעות [three.js המקומי](../../vendor/three.module.js) ו[טוען GLB המקומי](../../vendor/GLTFLoader.js). אין שירות חיצוני, שלב בנייה או מפענח Draco. יש להגיש את משורש המאגר כדי שגם תיקיית `vendor` תהיה זמינה; פתיחה ישירה ב־`file://` עלולה להיחסם בדפדפן.

## תכולה וחוזה נכסים

| סגנון | מראה | מבנים |
|---|---|---|
| חוף | חול, בטון בהיר וגוונים ימיים | תותח חוף, מגדל שמירה, שער, מחסן תחמושת |
| ארמון | לבן, זהב וכיפות כחולות | תותח חוף, מגדל שמירה, שער, מחסן תחמושת |
| מספן | בטון כהה ופלדה | תותח חוף, מגדל שמירה, שער, מחסן תחמושת, מספן פתוח עם צוללת |

הקבצים ב[תיקיית המודלים](models/) ורשימת הנכסים המדידה ב[מניפסט](manifest.json). המידות הן רוחב × גובה × עומק; יחידת משחק אחת היא מטר אחד. המדידה מתייחסת למצב השלם בתנוחת המנוחה.

| סגנון / מבנה | קובץ | מידות X×Y×Z | משולשים: שלם / פגוע / הרוס | סך הכול |
|---|---|---|---|---:|
| חוף / תותח חוף | [coastal-coastal-gun.glb](models/coastal-coastal-gun.glb) | 7×3×6 | 368 / 449 / 152 | 969 |
| חוף / מגדל שמירה | [coastal-watchtower.glb](models/coastal-watchtower.glb) | 5×11×5 | 376 / 457 / 136 | 969 |
| חוף / שער | [coastal-gate.glb](models/coastal-gate.glb) | 22×9×3.6 | 432 / 513 / 176 | 1121 |
| חוף / מחסן תחמושת | [coastal-ammo-depot.glb](models/coastal-ammo-depot.glb) | 9×4×6 | 508 / 589 / 136 | 1233 |
| ארמון / תותח חוף | [palace-coastal-gun.glb](models/palace-coastal-gun.glb) | 7×3×6 | 394 / 475 / 152 | 1021 |
| ארמון / מגדל שמירה | [palace-watchtower.glb](models/palace-watchtower.glb) | 5×11×5 | 414 / 495 / 136 | 1045 |
| ארמון / שער | [palace-gate.glb](models/palace-gate.glb) | 22×9×3.6 | 416 / 497 / 176 | 1089 |
| ארמון / מחסן תחמושת | [palace-ammo-depot.glb](models/palace-ammo-depot.glb) | 9×4×6 | 544 / 625 / 136 | 1305 |
| מספן / תותח חוף | [submarine-coastal-gun.glb](models/submarine-coastal-gun.glb) | 7×3×6 | 368 / 449 / 152 | 969 |
| מספן / מגדל שמירה | [submarine-watchtower.glb](models/submarine-watchtower.glb) | 5×11×5 | 376 / 457 / 136 | 969 |
| מספן / שער | [submarine-gate.glb](models/submarine-gate.glb) | 22×9×3.6 | 432 / 513 / 176 | 1121 |
| מספן / מחסן תחמושת | [submarine-ammo-depot.glb](models/submarine-ammo-depot.glb) | 9×4×6 | 508 / 589 / 136 | 1233 |
| מספן / מספן פתוח עם צוללת | [submarine-submarine-pen.glb](models/submarine-submarine-pen.glb) | 12×7×10 | 428 / 482 / 136 | 1046 |

- צירים: `+X` ימינה, `+Y` למעלה, `+Z` לחזית. הראשית במרכז התחתית; אין צורך בהזזת המודל כדי להניח אותו על הקרקע.
- כל קובץ כולל חומר PBR יחיד המשותף לכל המצבים, וצבעי קודקודים. אין טקסטורות ואין דחיסת גאומטריה.
- מחסני התחמושת כוללים מכולות, מכלים גליליים וארגזים; שערי הבסיס כוללים מעבר פתוח במרכז.
- התקציב הוא עד 1,500 משולשים לכל קובץ, כולל סכום שלושת המצבים.
- שלוש סצנות נפרדות בשם `intact`, `damaged`, `ruined`, ובכל אחת צומת שורש באותו שם ובאותה ראשית. סצנת ברירת המחדל היא `intact`, כדי שטעינה רגילה לא תציג מצבים חופפים.
- בתותח השלם `turret` הוא צומת סיבוב הצריח סביב ציר `Y`; `barrel` הוא הילד שלו וציר ההגבהה הוא `X`. בתנוחת המנוחה הקנה פונה ל־`+Z`. במצב הפגוע הצמתים הם `turret_damaged` ו־`barrel_damaged`.
- פיח מופיע בגאומטריה וצבעי קודקודים של המצב הפגוע. המצב ההרוס הוא גאומטריה נפרדת ונמוכה, ולא הקטנה של המבנה השלם.

## דוגמת טעינה למימוש עתידי

`gltf.scene` מכיל רק את המצב השלם. כדי להחליף מצבים יש לשמור את כל הסצנות המוחזרות ב־`gltf.scenes`. הדוגמה מניחה שהמודולים המקומיים כבר יובאו:

```js
const gltf = await new GLTFLoader().loadAsync(modelUrl);
const building = new THREE.Group();
const states = Object.fromEntries(gltf.scenes.map((stateScene, index) => [
  gltf.parser.json.scenes[index].name, stateScene
]));
for (const scene of Object.values(states)) building.add(scene);

function setState(name) {
  if (!states[name]) throw new Error(`Unknown building state: ${name}`);
  for (const [key, scene] of Object.entries(states)) scene.visible = key === name;
}
setState('intact');
scene.add(building);

const turret = states.intact.getObjectByName('turret');
const barrel = states.intact.getObjectByName('barrel');
if (turret) turret.rotation.y = Math.PI / 6;
if (barrel) barrel.rotation.x = -Math.PI / 18; // מעלה את הקנה
```

יש להזיז ולסובב את `building` כיחידה; צמתי המצבים נשארים באותה ראשית. המימוש במשחק, בחירת מצב לפי נזק ובדיקת מכשיר נשארים לשלב החיבור.

שמות הסצנות בדוגמה נקראים מתיאור ה־glTF המקורי: הטוען עשוי להוסיף סיומת לשם האובייקט ב־Three כאשר סצנה וצומת נושאים אותו שם.

## יצירה ובדיקה

לשחזור הנכסים, משורש המאגר:

```sh
python3 workout/island/design/naval-base-models-v1/tools/build_models.py
```

המחולל משתמש בספרייה הסטנדרטית של Python בלבד, ופולט GLB ו־manifest באופן דטרמיניסטי. אין צורך ב־Blender או בחבילת תלת־ממד.

לבדיקת תקציב הגאומטריה, המידות והצמתים:

```sh
python3 workout/island/design/naval-base-models-v1/tools/validate_models.py
```

הבודק משתמש ב־NumPy, ואינו נדרש לצפייה בתצוגה. [אימות Khronos](verification/gltf-validation.json) ו[בדיקת הדפדפן](verification/browser.json) מצורפים בנפרד.

כלי המקור ב[תיקיית הכלים](tools/) יוצרים ובודקים את קובצי ה־GLB. [דוח המסירה והאימות](verification/REPORT.md) מרכז את הבדיקות; דוחות מפורטים ב[תיקיית האימות](verification/), וצילומים מהתצוגה ב[תיקיית הצילומים](screenshots/). [מקורות ורישיונות](LICENSES.md).

קריטריון המסירה: 13 קובצי GLB, שלושה מצבים לכל מבנה, תקציב גאומטריה וחומר, צירים ומידות מאומתים, תצוגה מקומית וצילומים; PR טיוטה מהענף `codex/naval-base-models-v1`. בהתאם לבקשה לקבצים חדשים בלבד, מסירת החבילה מתועדת כאן ללא שינוי בקובצי הבקרה הקיימים.
