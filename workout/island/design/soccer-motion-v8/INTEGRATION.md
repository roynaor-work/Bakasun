# שילוב ספריית תנועה לכדורגל 08

העתיקו את `runtime/` בשלמותה לתיקיית נכסים המוגשת ב־HTTP מקומי או ב־HTTPS. זו תיקיית הריצה המדויקת: שני GLB עצמאיים עם Draco וטקסטורות מוטמעות, מטא־נתונים ובקר ES modules, ו־three.js r160 עם המפענח המקומי. אין צורך בבנייה, npm או CDN. שמרו את מבנה הנתיבים. פתיחת `file://` אינה נתמכת בדפדפני טלפון שחוסמים fetch של מודולים ונכסים.

החבילה מוסיפה נכסים בלבד; קוד המשחק, הקבצים הקיימים, release ותגי גרסה לא משתנים. צרו חיבור למשחק באמצעות דוגמת הקוד להלן. הבקר והצופה מייבאים כעת את `runtime/vendor/three.module.js`; הדוגמה משתמשת באותה כתובת גם עבור הסצנה של המארח. אם השילוב משתמש בעותק מקומי אחר של r160, יש לכוון את ייבואי הריצה והמארח לאותה כתובת בשלב השילוב, כדי לשמור על עותק מודול יחיד בסצנה.

## טעינה והפעלה של כל קליפ

```js
import * as THREE from './runtime/vendor/three.module.js';
import { loadLibrary, createController } from './runtime/controller.mjs';
import { clips } from './runtime/catalog.mjs';

const library = await loadLibrary(); // אפשר roles: ['field'] לטעינה חלקית
const actors = Object.fromEntries(['field', 'keeper'].map(role => {
  const actor = createController(library, {
    role, autoReturn: true,
    onEvent(cue) { /* cue.type, cue.bone, cue.time, cue.cycle */ }
  });
  scene.add(actor.root); // scene היא סצנת THREE של המשחק
  return [role, actor];
}));

function playClip(id) {
  const clip = clips.find(clip => clip.id === id);
  if (!clip) throw new Error(`Unknown clip: ${id}`);
  for (const actor of Object.values(actors)) actor.root.visible = false;
  const actor = actors[clip.role];
  actor.root.visible = true;
  actor.reset(id).resume(); // בחירה מפורשת בתצוגה: כל 25 הקליפים זמינים
  return actor;
}

// תפריט כזה מאפשר לטעון ולהפעיל כל קליפ ללא קובץ נתונים נוסף.
for (const clip of clips) {
  const button = document.createElement('button');
  button.textContent = clip.label;
  button.onclick = () => playClip(clip.id);
  menu.append(button); // menu הוא רכיב התפריט של המארח
}
playClip('pass_short');

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  for (const actor of Object.values(actors)) {
    if (actor.root.visible) actor.update(dt);
  }
  renderer.render(scene, camera);
}
frame();
```

`reset(id)` מיועד לאתחול ולבחירה מפורשת בצופה. הוא מבטל את הקליפ והסמנים הממתינים ומתחיל בזמן אפס. במשחק רציף השתמשו ב־`play(id)` או `request(trigger)`: הן מכבדות את מפת המעברים, חלון היציאה ומשך הערבוב. מעבר ידוע שאינו מותר כעת מחזיר `false`; מזהה שאינו זמין לתפקיד זורק שגיאה. לכל תפקיד דמות, בקר ומצב מוצא משלו. החלפת תפקיד נעשית אצל המארח באמצעות שתי הדמויות, ולא כמעבר בין שני שלדים בבקר אחד.

```js
const field = actors.field;
field.reset('idle');
field.play('shot');           // מעבר מאושר עם ערבוב חיובי
field.pause();               // שעון, פוזה ואירועים קופאים
field.seek(0.342);           // דגימת פוזה; אינה פולטת אירוע מגע
field.resume();
// update(dt) חוצה סמנים; autoReturn משתמש במעבר finished בסיום.
```

## מזהי הקליפים

| פעולה | מזהה ל־playClip | תפקיד |
| --- | --- | --- |
| המתנה | `idle` | שדה |
| מסירה קצרה | `pass_short` | שדה |
| מסירה ארוכה | `pass_long` | שדה |
| מסירה בגובה | `pass_loft` | שדה |
| בעיטה לשער | `shot` | שדה |
| קבלה בחזה | `receive_chest` | שדה |
| קבלה בכף הרגל | `receive_foot` | שדה |
| מגע ראשון בתנועה | `first_touch_moving` | שדה |
| כדרור | `dribble` | שדה |
| פנייה עם כדור | `turn_with_ball` | שדה |
| מחסום והגנת כדור | `shield` | שדה |
| חסימת בעיטה | `block` | שדה |
| חיתוך | `cut` | שדה |
| החלקה וקימה | `slide` | שדה |
| המתנת שוער | `keeper_ready` | שוער |
| הוצאה מהיד | `keeper_throw` | שוער |
| נמוך שמאל | `keeper_dive_low_left` | שוער |
| נמוך מרכז | `keeper_dive_low_center` | שוער |
| נמוך ימין | `keeper_dive_low_right` | שוער |
| אמצע שמאל | `keeper_dive_middle_left` | שוער |
| אמצע מרכז | `keeper_dive_middle_center` | שוער |
| אמצע ימין | `keeper_dive_middle_right` | שוער |
| גבוה שמאל | `keeper_dive_high_left` | שוער |
| גבוה מרכז | `keeper_dive_high_center` | שוער |
| גבוה ימין | `keeper_dive_high_right` | שוער |

שמאל וימין הם מנקודת מבט השוער. חלוקת השער היא שלוש שורות ושלוש עמודות; `zone` מתעד את יעד המגע המקומי. כל צלילה מכילה טעינה, הושטת יד, נחיתה וקימה. `shield` מגן על הכדור באמצעות הגוף; `block` חוסם בעיטה באמצעות סגירה והסטת גוף. אנימציות תוכננו ידנית בעזרת קינמטיקה; אינן motion capture.

## שלד, תזוזה וכדור

18 עצמות קנוניות תואמות `design/motion2`: מטרים; ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאל אנטומי; quaternions מסוג xyzw בסיבוב מקומי מוחלט. העצמות ושמות ההורים מיוצאים גם כ־`bones`. Root נשאר בזהות; ערוץ Hips מכיל את ההיסט המקומי של הגוף, לרבות צלילות. אין להוסיף את אותו היסט למיקום הדמות פעם נוספת.

מיקום ו־yaw של `actor.root` שייכים למשחק. ברירת המחדל `applyTravel:false` משאירה את תזוזת השחקן לסימולציה. `applyTravel:true` משמש להדגמת מסלול `travel` של כדרור ומגע בתנועה בתוך קבוצת־בת; הוא אינו משנה את transform של root. מסלול זה אינו תחליף להתנגשות או לתנועת משחק.

`events` מכיל שניות, עצם, נקודת מגע מקומית בעצם (`local`) ונקודת פני השטח במערכת הדמות (`position`). `contact` ו־`release` הם סמני תצוגה בלבד. מיקומו של מרכז כדור ברדיוס 0.11 מ׳ נמצא ב־`ball.keys`, במרחק רדיוס מנקודת המגע בזמן הסמן. `ballPosition(outVector3)` מדגים מסלול זה במערכת המקומית של root. המשחק מנהל את הכדור הפיזיקלי ואת ההכרעה; אין להפיק בעלות, הצלה או שער רק מזמן הקליפ.

`position` ומסלול הכדור מתארים את פוזת ה־GLB המקורית. בזמן ערבוב או כאשר המשחק מזיז את root, ניתן לקבל את נקודת האפקטור המוצגת בפועל בקואורדינטות העולם באמצעות `actor.eventPosition(cue, outVector3)`. הפעולה משתמשת בנקודת `local` ובעצם המוצגת. ה־callbacks נשלחים לאחר הערכת הפוזה בסוף update; כאשר דלתא חוצה כמה סמנים, `eventPosition` קורא את הפוזה הנוכחית ולא משחזר את הפוזה ההיסטורית בזמן `cue.at`.

המעברים מערבבים מהפוזה המוצגת בפועל, ממשיכים את מהירותה ודועכים אל קליפ היעד בעקומת smoothstep. אחרי הערבוב נפתר IK לרגלי התמיכה, עם עוגנים בעולם ושחרור מדורג בסוף חלון התמיכה. הפותר מניח מגרש שטוח במישור Y=0 המקומי של root. קריאה ישירה ל־reset או seek דוגמת את ערוצי ה־GLB ללא התאמות מעבר. הטרנספורמציה של root תומכת בהזזה, yaw וקנה מידה אחיד; שמרו על ציר Y מקומי כלפי מעלה. בעת החלפת מיקום מיידית או respawn בצעו reset לשחרור עוגנים ישנים. רציפות הפוזה נבדקת במעברים; בספי תמיכה יכולה להשתנות המהירות, ואין התחייבות ל־C1 מתמטי.

ערוצי השלד נדגמו ב־30Hz ובזמני הסמנים והתמיכות המדויקים. מיקומי כדור מוחזק והמסלולים שלאחר שחרור נדגמו ב־120Hz ונקראים ב־linear interpolation. בקבלת רגל יש ספיגה של 180ms ומרקר שחרור ב־0.6168s. מסלולים אלו הם נתוני ייחוס לתצוגה; המשחק יכול להזין את הכדור מהסימולציה שלו ולהשתמש בסמנים לאפקטים ולתזמון.

הבקר פולט סמן פעם אחת בכל חציה בכל מחזור, גם כאשר update חוצה יותר ממחזור אחד. השהיה, update עם אפס ו־seek אינם פולטים סמנים. reset, seek או החלפת מצב מתוך callback מבטלים את יתר סמני המצב הקודם. לולאה ממשיכה עד מעבר מפורש; פעולה חד־פעמית נשארת בפוזת הסיום כאשר `autoReturn:false`.

## בדיקות ותצוגה

משורש הריפו:

```sh
node --test workout/island/design/soccer-motion-v8/verification/verify.test.mjs
```

או מתוך החבילה העצמאית:

```sh
node --test
```

Node 24 מפענח את Draco המקומי וטוען כל קליפ באמצעות GLTFLoader r160 האמיתי. מאחר שאין ב־Node מפענח תמונות בדפדפן, הבדיקה מחליפה טקסטורות בפיקסל ניטרלי בלבד; גאומטריה, משקלי שלד ואנימציות נטענים מה־GLB שנמסר. בדיקת הדפדפן בודקת את הטקסטורות המקוריות. `LocalDRACOLoader.mjs` מפעיל את `draco-worker.js` כ־worker סטטי מאותו מקור; אין צורך ב־Blob worker, סקריפט inline, eval או שינוי מדיניות האבטחה של המשחק.

להצגת החבילה מריצים משרת הריפו:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

פותחים את [דף התצוגה המקומי](http://127.0.0.1:8765/workout/island/design/soccer-motion-v8/preview.html). בוחרים קליפ, מצלמה קרובה או רחוקה, ועוצרים בסמני המגע. הקישור ״8 פריימים״ פותח את גיליון הראיות של הסבב האחרון. קוד ההכנה והבדיקה תחת `source/` ו־`verification/` אינו נטען במשחק.

יעד הריצה הוא 30fps. השתמשו ב־DPR עד 1.5, צל יחיד וברשתות LOD1 המצורפות. מדידות הדפדפן בענן והתקציב המדויק מופיעים בדוח; הן אינן מדידת GPU של טלפון פיזי.

## שחרור משאבים

```js
for (const actor of Object.values(actors)) actor.dispose();
library.dispose(); // לאחר שכל הבקרים המשתמשים בגאומטריה ובחומרים שוחררו
```

לכל בקר יש עצמות ומערבל משלו; גאומטריה, חומרים וטקסטורות משותפים לספרייה. `dispose()` חוזר הוא בטוח. עצירת לולאת requestAnimationFrame של המארח נעשית אצל המארח.
