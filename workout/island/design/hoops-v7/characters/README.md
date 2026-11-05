# דמויות כדורסל 07

חמישה שחקנים בדויים בעמדות PG–C ושופט, שני LOD לכל דמות, שלד בן 18 עצמות, מדים ממוספרים ושתי ערכות צבע בלבד. החבילה עצמאית ואינה מחוברת ללוגיקת המשחק הקיים.

## פתיחה

1. פותחים את [standalone.html](standalone.html) בדפדפן. הגאומטריה, המפות, Three.js r160 והמפענחים נמצאים בתוך הקובץ; אין התקנה, build, CDN או בקשת רשת בזמן השימוש.
2. בוחרים עמדה ופעולה, מחליפים בין גוף מלא, סגל, פנים, ידיים ובד. אפשר לסובב בגרירה, להתקרב בצביטה, להשהות ולגרור את ציר הזמן. כפתור כדרור↔אחיזה מפעיל את מעבר הקליטה.
3. בודקים את [יומן הסבבים והשוואת התמונות](review.html) ואת [REPORT.md](REPORT.md). בדוח נמצאים ציונים, משקלים, אימותים ומגבלות המדידה.

בדפדפן המנוהל של סביבת הבדיקה מדיניות מנהל חסמה ניווט ישיר ב־`file://`; אותו HTML מלא הורץ במסמך מבודד עם כל בקשות הרשת חסומות. אם מדיניות מקומית מחייבת HTTP, אפשר להגיש את התיקייה בשרת מקומי ולפתוח את `index.html`; גם הוא משתמש רק בקבצים מקומיים:

```sh
python3 -m http.server 8765 --directory workout/island/design/hoops-v7/characters
```

[פתיחת התצוגה בשרת המקומי](http://localhost:8765/index.html).

## קובצי המסירה

| תכולה | מיקום |
| --- | --- |
| שש דמויות מפורטות | `models/{pg,sg,sf,pf,c,referee}.glb` |
| שש גרסאות מרוחקות | `models/{pg,sg,sf,pf,c,referee}-lod1.glb` |
| אטלס צבע מקור לכל דמות ונורמל משותף | `textures/` — פריסת UV אחת, עד 1024×1024 |
| פרופורציות, קשירה ומשטחי כפות ידיים | `model-authoring.json`, `rig.json` |
| קטלוג 27 הפעולות וחוזה התזמון | `motions.json`, `motion-contract.json` |
| בקר התנועה ומעברי המגע | `source/motion.mjs` |
| התאמת motion2 המפורשת | [RETARGET.md](RETARGET.md), `retarget-map.json` |
| תוצאות בדיקה, גדלים וגיבובים | `verification/` |
| רינדורים וביקורת לכל סבב | `iterations/NN/` |

מפות הצבע המוטבעות דחוסות WebP; קובצי PNG הם עותקי מקור לעריכה, ואינם נטענים בנוסף. שני ה־LOD משתפים מפות, שלד ומשקלי morph בתצוגה. הקהל משתמש בשני InstancedMesh; במצב הסגל האוטומטי נבחר LOD1.

## טעינת GLB מקומי

הגאומטריה דחוסה ב־Draco. נתוני האנימציה משתמשים בנוסף ב־`EXT_meshopt_compression` ללא אובדן, עם `filter: NONE`; ערכי ה־accessor נשמרים בדיוק. נדרשים שני המפענחים המקומיים בעת טעינת קובצי ה־GLB המלאים:

```js
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

await MeshoptDecoder.ready;
const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
const loader = new GLTFLoader()
  .setDRACOLoader(draco)
  .setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('./models/pg.glb');
```

כל GLB מלא מכיל 27 קליפים, כולל משקלי `grip_left` ו־`grip_right`, ו־`MotionBallAnchor` שאינו עצם skin. העוגן כולל מיקום, סיבוב ונראות תצוגתית של כדור ברדיוס 0.12 מ׳. הוא אינו כדור פיזיקלי, אינו קובע החזקה או ניקוד, ואינו מתווסף פעם נוספת לכדור שמנוהל בסימולציה.

גאומטריית הכדור נוצרת בנפרד בתצוגה ואינה משוכפלת בתוך כל GLB של דמות. לבדיקת הקליפים המוטבעים בנגן עצמאי אפשר להצמיד כדור מקומי לעוגן ולתת ל־AnimationMixer של הדמות לנגן:

```js
import * as THREE from './vendor/three.module.js';

const anchor = gltf.scene.getObjectByName('MotionBallAnchor');
anchor.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xb75c27, roughness: 0.9 }),
));
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations.find(clip => clip.name === 'dribble_right')).play();
// בלולאת התצוגה: mixer.update(deltaSeconds).
```

לכל דמות נטענת יש Mixer משלה. כאשר סימולציה מנהלת כדור משותף, היא משתמשת במסלול ובאירועי המגע כרפרנס ומציגה רק את הכדור שבבעלותה.

## מעברי כדרור ואחיזה

הקליפים המוטבעים מתאימים לניגון באמצעות AnimationMixer. מעבר ששומר על מגע משתמש בבקר המצורף: המתנה לקליטת הכדור, שמירת הפוזה והמהירות המוצגות, ערבוב מסלול הכדור ו־IK לאחר הערבוב. `crossFade` רגיל של AnimationMixer לבדו אינו מבטיח את המגע הזה.

```js
import { createMotionController } from './source/motion.mjs';

const profile = {
  ...authoring.profiles.find(p => p.id === 'pg'),
  ...rig.profiles.pg,
};
const motion = createMotionController(gltf.scene, { profile, ball });
motion.setAction('dribble_right', { immediate: true });
// בכל פריים, עם בעלים יחיד לסיבובי הדמות:
motion.update(deltaSeconds);
// בקשה מפורשת לקליטה; אפשר להפריע למעבר ולבקש פעולה אחרת.
motion.setAction('idle_hold');
```

אין להפעיל את הבקר ואת AnimationMixer במקביל על אותן עצמות. לצורך motion2 מיובא משתמשים במתאם המפורש וב־IK לאחר ההתאמה; תנוחת הקשירה האנושית שונה מתנוחת המנוחה של motion2, כפי שמוסבר ב־[RETARGET.md](RETARGET.md).

## שחזור ההפקה והבדיקות

התקנת כלי ההפקה נעשית מחוץ לריפו. הצפייה בקובץ העצמאי אינה דורשת אותם. הגרסאות המדויקות ב־`source/package.json`; מחולל האטלס דורש Python עם Pillow ו־NumPy.

```sh
mkdir -p /tmp/hoops-v7-tools
cp workout/island/design/hoops-v7/characters/source/package.json /tmp/hoops-v7-tools/package.json
npm install --prefix /tmp/hoops-v7-tools --cache /tmp/hoops-v7-npm-cache --no-audit --no-fund
python workout/island/design/hoops-v7/characters/source/model_helpers_atlas.py
node workout/island/design/hoops-v7/characters/source/build_characters.mjs
node workout/island/design/hoops-v7/characters/source/motion-export.mjs --write
node workout/island/design/hoops-v7/characters/source/validate-assets.mjs
node workout/island/design/hoops-v7/characters/source/validate-motion.mjs
node workout/island/design/hoops-v7/characters/source/validate-skin.mjs --hz 60
node workout/island/design/hoops-v7/characters/source/validate-skin.mjs --baked --hz 60
node workout/island/design/hoops-v7/characters/source/retarget-motion2.mjs --write-map --validate
node workout/island/design/hoops-v7/characters/source/package-offline.mjs
node workout/island/design/hoops-v7/characters/source/validate-offline.mjs
```

כלי התיעוד והמדידה נמצאים גם הם ב־`source/`: `capture.mjs` לסבב קפוא, `capture-motion.mjs` לגיליונות פוזות, `capture-transition.mjs` לרצף קליטה, `benchmark.mjs` למדידת ניגון, `build-review.mjs` ליומן ו־`build-report.py` לטבלאות המסירה. יצירת הדוח דורשת בדיקות שעברו וגיבובים שמתאימים לקבצים, וכן סבב חזותי אחרון שאושר. אחרי יצירת הדוח אורזים שוב כדי להטביע אותו, מאמתים את ההורדה המקומית ומריצים `build-inventory.py` למצאי הסופי.

המחוללים כותבים רק בתיקיית המסירה וב־`/tmp`. פקודת היצוא בודקת סט מלא לפני החלפה; בלי `--write` היא משאירה דגימות ב־`/tmp`. בדיקות הרשת בוחנות קודקודים מעוותים בפועל, ואינן הבטחה להתנגשות רציפה בין משולשים. יעד התצוגה הוא 30fps; מדידת SwiftShader ובדיקת ביצועים בטלפון פיזי מתועדות בנפרד בדוח.

[מקורות ורישיונות](LICENSES.md) · [הרפרנס וקריטריוני הביקורת](REFERENCE.md)
