# שילוב ספריית התנועה

העתיקו את **כל תיקיית `runtime/`**, תוך שמירת המבנה שלה. אלה הקבצים שהמשחק טוען: מודולי הניגון והמדיניות, Three.js r160 והמפענח המקומי, `clips/<id>.glb` ו־`keyframes/<id>.json.gz`. אין שלב build, CDN או שירות חיצוני. הגישו ב־HTTP; פתיחת `file://` בדפדפן אינה נתמכת.

שמרו גם את `runtime/vendor/draco/draco-worker.js`: הוא Worker סטטי מאותו מקור, לפי המתאם שכבר משמש במשחק. הטעינה נבדקה תחת מדיניות ה־CSP המדויקת של האי, עם `script-src 'self'`. דף התצוגה מפעיל אותה מדיניות. קובץ ה־Worker והעטיפה של Draco מוגשים כ־JavaScript מקומי.

## טעינה וניגון של כל קליפ

הדוגמה הבאה מתאימה לתצוגת קליפ עצמאי. `scene`, `renderer` ו־`camera` הם רכיבי Three הקיימים אצלכם. הטעינה עצלה, ופעולת `show` פועלת עבור **כל אחד מ־15 המזהים בטבלה**.

```js
import * as THREE from './runtime/vendor/three.module.js';
import { CATALOG, loadClip, createClipController, disposeClip,
  disposeRuntime } from './runtime/library.mjs';

const cache = new Map();
let visible, controller, request = 0;
async function show(id) {
  const currentRequest = ++request;
  if (!cache.has(id)) cache.set(id, loadClip(id, { format: 'glb' }));
  const loaded = await cache.get(id); // GLB + gzip metadata; Draco מקומי
  if (currentRequest !== request) return; // בקשה חדשה יותר כבר נבחרה
  controller?.dispose();
  if (visible) scene.remove(visible);
  visible = loaded.scene;
  scene.add(visible);
  controller = createClipController({ THREE, clip: loaded,
    onEvent: cue => console.log(cue.name) });
}
// לכל קליפ יש פעולת טעינה וניגון; חברו אותה לכפתור המתאים.
const play = Object.fromEntries(CATALOG.map(({ id }) => [id, () => show(id)]));
await play.pass_chest();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  controller?.update(clock.getDelta());
  renderer.render(scene, camera);
});
// seek מקבל שניות ואינו משגר אירועי מגע מחדש.
// controller.seek(0.54).pause();
async function destroyMotion() {
  controller?.dispose();
  if (visible) scene.remove(visible);
  for (const promise of cache.values()) disposeClip(await promise);
  cache.clear();
  await disposeRuntime(); // רק לאחר שכל המשתמשים במפענח סיימו
}
```

להנעה באמצעות JSON בלבד:

```js
import { loadClip, sampleClip } from './runtime/library.mjs';
const clip = await loadClip('pass_chest');
const pose = sampleClip(clip, 0.54); // שניות, מוחזק בקצה כברירת מחדל
// pose.rotations[name]: quaternion מקומי מוחלט [x,y,z,w]
// pose.hipsOffsetMeters: נוסף ל־Hips.restTranslationMeters
// pose.ballPositionMeters / pose.ballRotationQuaternion: כדור תצוגה
```

## הקליפים והאירועים

הזמנים בטבלה בשניות. מגע כפול מפורט לכל יד ב־`ballContactWindows`; מגעי רגליים, עוגנים, צירי העולם, שלד מלא ומסלול כדור נמצאים ב־JSON הדחוס. בכל JSON מופיעים `startState`, `endState`, `durationSeconds`, `loop` וכל האירועים. מפת המעברים מסופקת כמודול `runtime/state-machine.mjs`.

| מזהה לטעינה | פעולה | משך | לולאה | התחלה → סיום | אירועים עיקריים בשניות |
|---|---|---:|---|---|---|
| `pass_chest` | מסירת חזה | 1.12 | לא | held_ready → released_ready | release 0.538 |
| `pass_bounce` | מסירת הקפצה | 1.22 | לא | held_ready → released_ready | release 0.586, bounce 0.843 |
| `pass_overhead` | מעל הראש | 1.28 | לא | held_ready → released_ready | release 0.666 |
| `pass_side` | מהצד | 1.16 | לא | held_ready → released_ready | release 0.580 |
| `pass_jump` | מסירה בקפיצה | 1.30 | לא | held_ready → released_ready | takeoff 0.416, release 0.663, land 0.975 |
| `receive_two_hands` | קבלה בשתי ידיים | 1.08 | לא | ready_empty → held_ready | contact 0.335, secure 0.605 |
| `receive_moving` | קבלה בתנועה | 1.12 | לא | moving_empty → moving_held | contact 0.347, secure 0.627 |
| `dribble_idle` | כדרור במקום | 0.88 | כן | dribbling → dribbling | release 0.123, bounce 0.440, contact 0.757 |
| `dribble_run` | כדרור בריצה | 0.72 | כן | running_dribble → running_dribble | release 0.101, bounce 0.360, contact 0.619 |
| `dribble_behind_back` | מאחורי הגב | 1.12 | לא | dribbling → dribbling_left | release 0.280, bounce 0.504, contact 0.851 |
| `stop_two_feet` | עצירה וסיום כדרור | 1.16 | לא | running_dribble → held_stopped | release 0.065, bounce 0.232, contact 0.399, secure 0.557, land 0.638 |
| `pivot` | פיבוט | 1.32 | לא | held_stopped → held_pivoted | pivot_start 0.251, right_plant 1.030 |
| `shot_start` | התחלת קליעה והמשך לשחרור | 1.26 | לא | held_ready → shot_released | takeoff 0.617, guide_release 0.693, release 0.769, land 0.932 |
| `block` | חסימה | 1.26 | לא | defensive_ready → defensive_ready | takeoff 0.391, contact 0.668, land 0.995 |
| `steal` | ניסיון חטיפה ואיסוף חזותי | 1.16 | לא | defensive_ready → held_ready | right_plant 0.371, contact 0.487, secure 0.847, recovery_plant 1.114 |

אין אירוע נחיתה בקליפ שנשאר על הקרקע. `shot_start` כולל המשך לשחרור; אפשר להחזיק פוזת הכנה באמצעות `seek` ו־`pause`. מצבי ההתחלה והסיום מתארים את הפוזה, ואינם אישור להחזקת כדור.

במסירות `ball.flightReference` מתעד את זמן ומיקום השחרור, וקטור המהירות, הכבידה ואת יעד סוף ההדגמה. המסירות הישירות מסתיימות בגובה 1.15 מ׳; מסירת ההקפצה בכ־1.06 מ׳, עם מקדם החזרה 0.90. זהו יעד חזותי בגובה קבלה, ללא אירוע קבלה מלאכותי או העברת החזקה.

## מניעת חזרה לכדרור

במשחק השתמשו ב־`createMotionPlayer`, שמחבר את בקשת הניגון למפת המעברים. ה־controller הנמוך שבדוגמת התצוגה אינו מכונת חוקי משחק.

```js
import { createMotionPlayer } from './runtime/library.mjs';
// canonicalRig: שלד קיים עם אותם שמות, הורים והיסטי מנוחה,
// וגם Object3D בשם Ball לכדור התצוגה.
const player = createMotionPlayer({ THREE, root: canonicalRig });
player.authorizePossession({ epoch: 41, owner: 'self' }); // מהסימולציה בלבד
await player.play('receive_moving');
await player.play('dribble_run');
await player.play('stop_two_feet');
await player.play('pivot');
await player.play('receive_two_hands');
const denied = await player.play('dribble_idle');
console.assert(!denied.ok && denied.reason === 'dribble-ended-this-possession');
// גם מעבר דרך idle, קבלה, מסירה או קליפ הגנה אינו מוחק את הנעילה.
// רק החזקה חדשה שהסימולציה מאשרת רשאית לפתוח מחזור חדש:
player.authorizePossession({ epoch: 42, owner: 'self' });
await player.play('dribble_idle');
// בלולאת המשחק: player.update(deltaSeconds);
// בסיום השימוש: player.dispose();
```

`epoch` הוא מזהה עולה שהסימולציה מקצה להחלפת החזקה אמיתית. אין להגדיל אותו בעקבות `contact`, קבלת כדור חזותית, `seek`, סיום קליפ או reset של האנימציה. `owner` יכול להיות `'self'`, `'other'` או `null`. epoch ישן נדחה. אירוע אנימציה לעולם אינו מקנה כדור, הצלחת חסימה, חטיפה או ניקוד.

ה־player שומר במטמון קליפים שטען, ומשחרר את המשאבים שבבעלותו ב־`dispose()`. עבור `load` שהמארח מזריק, הבעלות נשארת אצל המארח, אלא אם מעבירים `ownsLoadedClips:true`. `disposeClip` מיועד לבעלים של תוצאת טעינה ידנית; `disposeRuntime` סוגר את המפענח המשותף לאחר שכל המשתמשים סיימו לטעון.

`LEGAL_TRANSITIONS` מפרט כל קשת ואת תנאי ההחזקה שלה. `effectiveTransitionGraph(context)` מחזיר את המפה לאחר החלת התנאים; כאשר `dribbleEnded=true`, **אין בשום רשימת יעדים קליפ כדרור**. הבדיקות עוברות על כל המסלולים העקיפים. אין wildcard או חזרה אוטומטית לכדרור בסיום קליפ. קליפ שאינו לולאה נשאר בפריים הסיום.

## שלד, כדור ותנועה בעולם

18 העצמות, ההורים והיסטי המנוחה זהים ל־`design/motion2/hoops.json`: Root/Hips/Spine/Chest/Neck/Head, שתי שרשראות Arm/ForeArm/Hand ושתי שרשראות UpLeg/Leg/Foot. מטרים; ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאל אנטומי. אין היפוך בשל RTL.

ה־JSON וה־GLB ניגנים בזמן ליניארי וב־slerp בקשת הקצרה, מתוך פוזות שכבר נאפו בקצב 120Hz ובזמני האירועים המדויקים. GLB מכיל ערוץ לכל עצם, היסט Hips ומיקום וסיבוב כדור. Root נשאר זהות. `referenceRootTranslationMeters` הוא מסלול בדיקה; **אין להוסיף אותו לתנועת העולם של המשחק**. הסימולציה מזיזה את מעטפת הדמות ומסובבת אותה. לכדור המשחק השתמשו בפיזיקת המשחק; ניתן להסתיר את `Ball` המובנה ב־GLB ולהשתמש במסלול רק כהנחיית תצוגה. כאשר `root` הוא שלד המשחק, הוסיפו צומת תצוגה בשם `Ball` ברמת מעטפת הדמות לצד Root, באותו מרחב קנוני, או סננו מה־AnimationClip את הערוצים `Ball.position` ו־`Ball.quaternion`, כדי שלא יופיעו אזהרות על יעד חסר.

עוגני תמיכה מתייחסים להיסט סוליה `[0,-0.08,0]`. נקודת מגע ביד `[0,-0.08,0.025]` היא נקודת אצבע/כף יד, ואינה מודל פיזיקלי של כל האצבעות. בשלד 18 עצמות אין עצמות אצבע נפרדות. מתאם לדמות בעלת היסטי מנוחה שונים זקוק לריטרגוט; העתקת quaternion לבדה אינה מתקנת פרופורציות שונות.

`dribble_behind_back` מסיים ביד שמאל, כפי שמצוין ב־`endState`. מתאם המשחק צריך לשמר את היד ומיקום הכדור שהסימולציה קובעת בעת בחירת ההמשך וערבוב הפוזות.

המתאם מספק ניגון ושמירת מדיניות החזקה. ערבוב בין קליפים, נשיאת עוגני רגליים בעולם ופתרון IK לאחר ערבוב נמצאים באחריות מתאם המשחק; אין כאן טענה לרציפות בין כל שני קליפים אפשריים.

## בדיקה והרצה

מתיקייה זו, עם Node 24:

```sh
node --test
```

לפירוט כל מקרה בדיקה בסביבה שמקבצת פלט לפי קובץ:

```sh
node --test --test-isolation=none tests/*.test.mjs
```

הבדיקה טוענת את כל הקליפים ב־GLTFLoader האמיתי וב־Draco WASM, משווה גם זמני ביניים ל־JSON, בודקת מגעים לאורך החלונות, תמיכות, שחרור, מגבלות גודל ומסלולי מעבר. ב־Node טקסטורת WebP נבדקת כבתים וכמטא־דאטה; פענוח פיקסלים ורנדר נבדקים ב־Chromium.

```sh
python3 -m http.server 8765
```

פתחו את `http://localhost:8765/` לתצוגה המקומית. התצוגה כוללת בחירת קליפ, שמונה פריימים, מהירות, קרוב/רחוק וזוויות בדיקה. כלי הפקה ורנדר מפורטים ב־`source/README.md`; הם אינם נדרשים במשחק.
