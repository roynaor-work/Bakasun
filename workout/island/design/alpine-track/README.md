# האי שלי · נכסי מסלול סקי

חבילת עיצוב עצמאית ל־Alpine Rush, על בסיס `main` בקומיט `e67c6566`. כל הקבצים חדשים ונמצאים ב־`workout/island/design/alpine-track/`. החבילה מוסיפה משטחי שלג, רכיבי מסלול ואפקטים; היא אינה מחוברת למשחק. אין שינוי בפיזיקה, בקושי, בניקוד, בשיאים, בחוזה התוצאה או בגרסה.

[תצוגה מקומית](preview.html) · [מודלים ועוגנים](models.json) · [משטחים](surfaces.json) · [בדיקות](validation.json) · [פענוח GLB עצמאי](validation-models.json) · [מקור ורישיון CC0](LICENSES.md)

## פתיחה

1. פתחו את [preview.html](preview.html) ישירות מהדיסק, גם ב־`file://`, ללא שרת או חיבור לרשת. אפשר להעתיק את התיקייה כולה למחשב אחר.
2. בדקו את המסלול ואת דגמי המשטחים בחלון לאורך ובחלון לרוחב. שני גדלי הבדיקה הם 390×844 ו־844×390.
3. התוצאה הרצויה: שלג בהיר ומפורט ללא תפרים, רמפות ומוגולים ברורים, שפתי חצי־צינור מעוגלות, גבולות מסלול ועננים ואבק בעלי שוליים שקופים. הנכסים ניתנים להצבה עתידית דרך החוזים שבקובצי JSON.

התצוגה משתמשת בגאומטריה שפוענחה **מקובצי ה־GLB הסופיים** בזמן בניית הדף, ובמרקמי המסירה המוטמעים בו. בזמן הפתיחה אין פענוח Draco, יבוא מודולים, fetch,‏ worker,‏ CDN או בקשת רשת. זו תצוגת נכסים מקומית; היא אינה בדיקת loader של המשחק ואינה מדידת ביצועים בטלפון פיזי. מפות ה־normal האופציונליות נמסרות לשילוב עתידי ואינן מופעלות בתצוגה.

## מודלים

כל שבעת קובצי ה־GLB מחייבים `KHR_draco_mesh_compression` בכל primitive. בכל קובץ רשת אחת וחומר אחד, עם UV0 וצבעי קודקודים. המידות, המשולשים, העוגנים, גבולות הרשת ו־SHA-256 המדויקים נמצאים ב־[models.json](models.json).

| קובץ | מידות שימושיות במטרים | שימוש |
| --- | --- | --- |
| [jump-ramp.glb](models/jump-ramp.glb) | רוחב 6, אורך 12, עלייה 2.4 | רמפת שלג מעוגלת עם עוגני כניסה וניתור |
| [kicker.glb](models/kicker.glb) | רוחב 4, אורך 6, עלייה 1.8 | מקפצה תלולה וקצרה |
| [halfpipe-segment.glb](models/halfpipe-segment.glb) | אורך 12, רוחב רצפה 13, רדיוס קיר 4.2 | מקטע ישר עם שפתי מעבר מעוגלות וסיפון |
| [mogul.glb](models/mogul.glb) | רוחב 3.6, אורך 5, גובה 0.65 | תלולית חלקה, רשת משותפת המתאימה ל־instancing |
| [rope-post.glb](models/rope-post.glb) | גובה 1.26 | עמוד גבול נפרד עם עוגן חבל |
| [flag-rope.glb](models/flag-rope.glb) | מפתח 8, שבעה דגלונים | יחידת גבול עם שני עמודים ועוגני קצה; אין להציב שוב עמוד באותם קצוות |
| [direction-sign.glb](models/direction-sign.glb) | לוח ברוחב 1.35, מרכז בגובה 1.65 | חץ גנרי ללא טקסט או מותג, חזית ל־−Z וחץ ל־+X |

יחידה: מטר; מעלה `+Y`; המשך המסלול `+Z`. השורש `asset_root` נמצא בראשית, בסיבוב אפס ובקנה מידה 1. תחתית הרמפות כוללת 18 ס״מ להטמנה בשלג. מקטע חצי־הצינור שטוח לאורך צירו המקומי; שיפוע הירידה ניתן בהצבה, כדי לא להוסיף אותו פעמיים. קצותיו בעלי אותו חתך וניתנים לחיבור דרך `anchor_route_start/end`.

משטחי השלג העליונים משתמשים ב־UV0 מנורמל: `u` לרוחב `+X`,‏ `v` לאורך `+Z`, בטווח 0–1 על המקטע כולו. הדפנות והקצוות משתמשים בהיטל לפי הציר הדומיננטי. מותרת חפיפה בין פאות; זו פריסת צבע חוזר, **לא אטלס AO/lightmap**. בשילוב עתידי יש להתאים את מספר החזרות למידות הרכיב ול־`tileMeters`, או לדגום לפי קואורדינטות משטח במטרים. אין להחיל את מפות `../baked/` על הגאומטריה החדשה.

## משטחים

ארבעה מרקמי צבע WebP ללא אובדן, 256×256, ושתי מפות normal בגודל 128×128. כל המידות קטנות מ־512px. לאחר הפענוח, השורה הראשונה והאחרונה והעמודה הראשונה והאחרונה זהות בכל ערוצי כל מרקם, גם במפות normal.

| מרקם | גודל חזרה במטרים | צבע/חספוס |
| --- | --- | --- |
| `textures/groomed-snow.webp` | 4×4 | שלג כבוש עם חריצי יישור; חספוס 0.94 |
| `textures/deep-snow.webp` | 2.5×2.5 | אבקה עמוקה ובהירה; חספוס 1 |
| `textures/halfpipe-ice.webp` | 5×5 | קרח בהיר ושריטות קשתיות; חספוס 0.28 |
| `textures/snow-ripples.webp` | 6×6 | אדוות רוח רחבות; חספוס 0.96 |

צבע בסיס הוא `sRGB`; מפות normal הן נתונים ליניאריים, במוסכמת OpenGL ‏`+Y`, בעוצמה מוצעת 0.18. כל המרקמים חוזרים בשני הצירים. בטעינה למודל glTF יש להשתמש ב־`flipY=false`. פרטי סינון, mipmaps, אנאיזוטרופיה וחותמות הקבצים ב־[surfaces.json](surfaces.json). מרקם הצבע אינו כולל תאורה אפויה או צל כיווני; צבעי `COLOR_0` של המודל נושאים גוון והצללה עדינה משלו.

דוגמת התאמת חומר עתידית ב־Three.js, כאשר `surface` היא רשומה מ־`surfaces.json` ו־`model` מ־`models.json`. טוענים מראש, מחוץ ללולאת הפריים:

```js
const map = await textureLoader.loadAsync(base + surface.file);
const normal = surface.normal
  ? await textureLoader.loadAsync(base + surface.normal.file) : null;
const repeats = [
  (model.bounds[1][0] - model.bounds[0][0]) / surface.tileMeters[0],
  (model.bounds[1][2] - model.bounds[0][2]) / surface.tileMeters[1],
];
for (const texture of [map, normal].filter(Boolean)) {
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeats);
  texture.colorSpace = texture === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
}
const material = new THREE.MeshStandardMaterial({map, normalMap: normal,
  vertexColors: true, roughness: surface.roughness, metalness: 0});
material.normalScale.setScalar(surface.normal?.scale ?? 0);
```

החזרה בדוגמה מתאימה ל־UV העליון המנורמל. בפאות צד עם היטל אחר יש להתאים כיווני חזרה בנפרד אם הן מקבלות חומר גלישה. אפשר לוותר על normal, לשתף חומרים ומרקמים בין מופעים, ולשחרר אותם בסיום השימוש.

בשרשרת מקטעים, מספר חזרות שאינו שלם דורש גם פאזה רציפה: לדוגמה, מקטע של 12 מ׳ עם אריח של 5 מ׳ מסתיים אחרי 2.4 חזרות, והמקטע הבא צריך להתחיל באותה פאזה. אפשר לאפות ל־UV את `v=(distanceFromRouteStart+localDistance)/tileMeters[1]`, או להעביר מרחק ופאזה לשיידר. `Texture.offset` הוא מאפיין משותף של המרקם ואינו ניתן לשינוי נפרד לכל מופע באותו `InstancedMesh`. אין לאפס פאזה בכל חיבור. התצוגה מחברת מקטעי חצי־צינור דרך עוגניהם המסובבים ומשמרת את פאזה המרקם לאורך השרשרת.

## אפקטים ועקבות

`vfx/cloud-atlas.png` ו־`vfx/ski-powder-atlas.png` הם אטלסי RGBA בגודל 384×384: רשת 4×4, 16 פריימים בגודל 96×96. ענן חוזר בלולאה; אבקת סקי היא אפקט חד־פעמי. קובץ JSON ליד כל תמונה מגדיר קצב, משך, alpha ושולי תאים. אין להפעיל mipmaps על האטלסים; יש להשתמש ב־UV inset וב־straight alpha לפי החוזה כדי למנוע דליפת פריימים והילות.

`decals/footprint-treads.png` ו־`decals/snow-groove.png` הם שכבות שקופות בגודל 128×128. העזר [track-decals.mjs](decals/track-decals.mjs) מקבל `sampleSurface` ומחזיר גאומטריית עקבות במאגר מוגבל מראש. הוא דוגם גובה ונורמל לכל פינת מלבן ומרים אותה מעט מהשלג; אין כאן collider או שינוי בפיזיקה. יש לקרוא את חוזה העזר וה־JSON הנלווים לפני שילוב, ולהפסיק נתיב בניתוק מגע. יצירת העקבות עצמה אינה מתקינה renderer או חומר.

דוגמת מתאם למאגר הקבוע; `sampleSurface(x,z,out)` כותב `out.height` ו־`out.normal[0..2]` במערכת העולם:

```js
const trail = createTrackDecals({sampleSurface, capacity: 512, pathCount: 8});
const geometry = new THREE.BufferGeometry();
for (const [name, spec] of Object.entries(trail.buffers.attributes)) {
  geometry.setAttribute(name, new THREE.BufferAttribute(
    spec.array, spec.itemSize, spec.normalized ?? false).setUsage(THREE.DynamicDrawUsage));
}
geometry.setIndex(new THREE.BufferAttribute(trail.buffers.indices, 1));
geometry.setDrawRange(0, 0);
const trailMesh = new THREE.Mesh(geometry, trailMaterial);
trailMesh.frustumCulled = false; // או עדכון bounds אחרי שינוי מאגר המקטעים
const attributeNames = ['position', 'normal', 'uv', 'color'];
// בכל עדכון, רק במגע מאומת עם משטח:
if (grounded) trail.add(x, z, headingRadians, pressure, playerId);
else trail.breakPath(playerId);
const frame = trail.update(timeSeconds);
for (const name of attributeNames) {
  const range = frame.changes[name], attribute = geometry.getAttribute(name);
  if (range.count) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(range.offset, range.count);
    attribute.needsUpdate = true;
  }
}
geometry.setDrawRange(frame.drawRange.start, frame.drawRange.count);
```

טווחי ההעלאה הם **רכיבי attribute**, לא בתים או קודקודים. כל ה־buffers יציבים בזהותם; נתוני UV מתעדכנים לפי המרחק והאינדקסים נשארים קבועים. גם `update()` מחזיר את אותו אובייקט. חומר `trailMaterial` בדוגמה צריך straight alpha,‏ `vertexColors=true`,‏ `transparent=true`,‏ `depthTest=true` ו־`depthWrite=false`. יש להגביל overdraw, לבצע `breakPath` בקפיצה או בטלפורט, `reset` בריצה חדשה, ולשחרר את גאומטריית המתאם והחומר ביציאה. ברירת המחדל מוגבלת ל־512 זוגות מקטעים, לכל היותר 2,048 משולשים.

## תאימות ושילוב עתידי

הקבצים הקיימים `models2/`,‏ `environment/`,‏ `baked/` ו־`vfx/` לא שונו. הטוען הקיים של Alpine קורא כרגע `design/models/`, מסיר UV בעת איחוד אביזרים ומייצר מחדש את משטח חצי־הצינור לפי הפיזיקה. לכן נכסים אלה דורשים מתאם תצוגה מפורש; החלפת כתובת קובץ לבדה אינה שילוב מלא. עוגנים כאן הם חוזה חדש ואינם שינוי בעוגני הקבצים הקיימים.

באתר המוגש ב־HTTP יש להשתמש במפענח Draco המקומי וב־worker הסטטי התואם למדיניות CSP של האי. הטוען הסטנדרטי שמייצר blob worker אינו תואם ל־`script-src 'self'`. התצוגה המקומית עוקפת צורך בטעינה בזמן הצפייה באמצעות נתונים מוטמעים; היא אינה משנה או מרחיבה את מדיניות האתר.

## שחזור ואימות

נדרשים Blender 5.2 עם מפענח ומקודד Draco מובנים, Node 22+ וכלי sharp מחוץ לתיקייה. אין להוסיף `node_modules` לחבילה. `--modules` בבוני המשטחים מצביע לתיקיית `node_modules`; באימות אפשר להפנות לתיקיית הכלים המכילה אותה.

1. בנו את המודלים ואת האפקטים המקוריים:

   ```sh
   blender --background --factory-startup --python-exit-code 1 --python workout/island/design/alpine-track/tools/build-models.py
   node workout/island/design/alpine-track/tools/build-effects.mjs
   ```

2. לשחזור מרקמי הצבע דרוש אטלס המקור המפורט ב־[PROMPTS.md](PROMPTS.md). מסירת ה־WebP הסופית אינה תלויה בקיומו:

   ```sh
   node workout/island/design/alpine-track/tools/build-surfaces.mjs --input /path/to/original-atlas.png --modules /path/to/tooling/node_modules
   ```

3. הריצו אימות של בתים, פיקסלים ופענוח ה־GLB הסופי, ובדקו `allPassed: true` ב־`validation.json` וב־`validation-models.json`:

   ```sh
   node workout/island/design/alpine-track/tools/validate.mjs --modules /path/to/tooling --blender /path/to/blender --base e67c6566
   ```

4. לאחר שינוי נכסים בנו מחדש את התצוגה מה־GLB הסופיים, ואז בדקו אותה בדפדפן ללא רשת. כלי הבנייה קורא את מפענח Draco הקיים במאגר ואינו מעתיק אותו לחבילה:

   ```sh
   node workout/island/design/alpine-track/tools/build-preview.mjs
   node workout/island/design/alpine-track/tools/validate-preview.mjs --modules /path/to/tooling --browser /path/to/chrome --outputs /path/to/screenshots
   ```

   נדרש `allPassed: true` ב־[browser-validation.json](browser-validation.json), ואחריו מריצים שוב את שלב 3 כדי לכלול בתקציב את צילומי התצוגה והדוחות החדשים. בדיקת הדפדפן משתמשת ב־`file://` ללא דגל עקיפת הרשאות קבצים, במצב offline ועם חסימת HTTP; היא בודקת ארבעה מצבי תצוגה, גרירה וצביטה אמיתיות, עצירת אנימציה, RTL וגלילה אופקית בשני כיווני הטלפון.

האימות בודק את כל התיקייה מול תקרה עשרונית של **2,000,000 bytes**, כולל תצוגה, צילומים, תיעוד וכלים; כל primitive בדחיסת Draco; פענוח עצמאי; קודקודים, נורמלים ו־UV סופיים ללא ערכים לא סופיים או משולשים מנוונים; התאמה לנתוני המניפסט; וזהות שולי המרקמים. דוח הדפדפן נפרד ומציין את היקף בדיקת `file://` ואת מגבלותיה. אין בחבילה טענה ל־FPS או לשיפור בביצועי המשחק.
