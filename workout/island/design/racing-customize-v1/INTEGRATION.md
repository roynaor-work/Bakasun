# חיבור לרכב הקיים

החבילה תואמת לרכב השחקן המקורי, באורך 4.6 מטר, ב־`workout/island/assets/racing-formula/formula.glb`. חתימת המקור, הצירים, שמות הצמתים, מיקומי החיבור ומקדמי ההגדלה לגלגלים האחוריים נמצאים ב־[manifest.json](manifest.json). אין הנחה שהחבילה מתאימה לדגמי היריבים, לדגמי הקופה או לרכב החלופי.

**יש להרכיב על הסצנה המקורית לפני המיזוג לפי חומר.** הפונקציה `mergeFormula` במשחק מוחקת את ההפרדה בין הכנפיים, הקסדה ושאר החלקים הסטטיים. מתאם החיבור דוחה במפורש רכב שכבר איבד את הצמתים האלה. יש לשמר את ההפרדה בין החלקים המתחלפים בעת אופטימיזציה עתידית. קבצי המשחק הקיימים לא נערכו.

אין להעביר את הרכב המותאם דרך המיזוג הקיים לאחר ההתקנה: הוא עובר גם על החלקים המקוריים שהוסתרו. בחיבור למשחק שומרים את הסצנה המקורית עבור הרכב המותאם ומדלגים על המיזוג הזה, או ממזגים רק גוף קבוע תוך החרגת החלקים המוסתרים והענפים הניתנים להחלפה. עצם הקדמת ההתקנה למיזוג הקיים אינה מספיקה.

## נכסים וצירים

| חלק | צומת מקורי להסתרה | מיקום החיבור המקומי, מטרים |
| --- | --- | --- |
| כנף קדמית | `FrontWing` | `(0, 0.20, 1.98)` |
| כנף אחורית | `RearWing` | `(0, 0.21, -1.78)` |
| קסדה | `Helmet` | `(0, 0.695, -0.235)` |
| אביזר אפקט | אין | `(0, 0.27, -1.98)` |
| גלגלים קדמיים | `WheelFrontL`, `WheelFrontR` | `(±0.85, 0.34, 1.25)` |
| גלגלים אחוריים | `WheelRearL`, `WheelRearR` | `(±0.83, 0.36, -1.31)` |

מעלה הוא ‎+Y, כיוון נסיעה ‎+Z, שמאל הנהג ‎+X. בכל דגם חדש השורש `Mount` הוא טרנספורמציית זהות. חיבור הכנפיים הוא דרך `ConnectorL` ו־`ConnectorR`; הקסדה כוללת `Neck`; כל גלגל כולל `Axle`. אביזרי האפקט כוללים `EmitterL` ו־`EmitterR`, הפולטים לכיוון ‎−Z.

גלגל קדמי: רדיוס 0.34 ורוחב צמיג 0.29 מטר. מאותו דגם נוצרים ארבעה מופעים. בגלגל האחורי ההגדלה היא `X=0.35/0.29`, ‏`Y=Z=0.36/0.34`. שמירת גובה הסרן 0.36 מטר מביאה את סוליית הגלגל בדיוק לרצפה. סיבוב גלגול סביב X, היגוי קדמי סביב Y; סדר הסיבובים הוא `YXZ`. אין צורך בשיקוף עם קנה מידה שלילי.

## שימוש במתאם

מודולי הריצה מקבלים את מופע Three שכבר נמצא במשחק, ואינם מייבאים ספרייה מרשת. אפשר לטעון כל GLB ב־GLTFLoader הרגיל או בקורא המקומי של החבילה.

```js
import {createCustomizer} from './runtime/customize.mjs';
import {createDecalGeometry} from './runtime/decal.mjs';

// T, car and loader are the game's existing LOCAL instances.
// car is a per-vehicle clone of the ORIGINAL, unmerged Formula scene.
const rootURL = new URL('./', import.meta.url);
const manifest = await fetch(new URL('manifest.json', rootURL)).then(r => r.json());
const textureLoader = new T.TextureLoader();
const getTexture = file => textureLoader.loadAsync(new URL(file, rootURL).href);
const customizer = createCustomizer({
  T, car, manifest,
  loadGLB: async file => (await loader.loadAsync(new URL(file, rootURL).href)).scene,
  DecalGeometry: createDecalGeometry(T),
  stripeTexture: await getTexture(manifest.paint.stripeMask),
  decalTexture: getTexture
});

await customizer.equip('frontWing', 'front-arrow');
await customizer.equip('rearWing', 'rear-swan');
await customizer.equip('wheels', 'wheel-turbine');
await customizer.equip('helmet', 'helmet-aero');
await customizer.equip('effect', 'effect-ion');
await customizer.equip('decal', 'decal-flames-curl');
customizer.setPaint('body', 'paint-cobalt');
customizer.setPaint('stripes', 'paint-pearl');
customizer.animateWheels(spinRadians, steerRadians);
const selection = customizer.snapshot();

// End of vehicle lifetime: restores original visible parts and materials.
customizer.dispose();
```

ביישום יש לשמור מטמון לטקסטורות, להגדיר להן מרחב צבע `T.SRGBColorSpace` ולשחרר אותו בסיום. המתאם משחרר את גאומטריית המדבקות ואת החומרים שהוא יצר, ושומר על בעלות הקורא על הגאומטריה ועל הטקסטורות שנטענו מבחוץ. חומרים משותפים לרכבים משוכפלים מקומית לפני שינוי צבע.

הקרנת המדבקות מבוצעת על משולשי `Body` האמיתיים, כולל טיפול ברכב שהוזז או סובב. שלוש הקרנות בכל שכבה: חרטום ושני צדי הגוף. המניפסט מגדיר את המידות וההטיה למניעת הבהוב עומק. המדבקה הקודמת מוסרת בעת החלפה. שכבת הפסים משתמשת בחומר נפרד בשם `Paint Stripes`. עשרת הצבעים ניתנים לבחירה בכל שכבה; השדה `body` בפריט צבע הוא דוגמית הצבע המשמשת גם לבחירה בשכבת הפסים, והשדה `stripes` מציע צבע משלים לאייקון.

`runtime/effects.mjs` מספק תצוגת אפקטים עם מאגר קבוע של עד 40 חלקיקים, שני פולטים וללא הקצאת גאומטריה בכל פריים. בחיבור למשחק יש להזין זמן שמתקדם רק בזמן משחק, ולהפעיל פליטה לפי מצב המשחק המתאים. במצב העדפת תנועה מופחתת נשאר האביזר הפיזי בלי חלקיקים. הדגמה:

```js
import {createEffectPreview} from './runtime/effects.mjs';
const effects = createEffectPreview(T, car.getObjectByName('Formula'));
effects.select(manifest.items.find(item => item.id === selection.effect));
effects.setEnabled(boosting); // or the relevant cosmetic trigger
effects.update(raceTime, customizer.effectRoot(), reducedMotion);
// At teardown:
effects.dispose();
```

החנות המבודדת שומרת בחירה מקומית בלבד, במפתח נפרד `island.racing-customize-v1.design`. אין בה מחירים שהומצאו, חיוב מטבעות, שינויים בכסף האי או שינוי בנתוני השמירה של המשחק. החלקים קוסמטיים; אין לשנות בגללם פיזיקה, שדה התנגשות או כללי מרוץ.
