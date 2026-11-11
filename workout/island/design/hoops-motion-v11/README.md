# תנועות כדורסל v11

30 מהלכים מקוריים × שלוש דמויות `hoops-tall-v1` = 90 ביצועים. כל מהלך נפתר בנפרד למידות הרכז (1.88 מ׳), הקיצוני (1.98 מ׳) והסנטר (2.08 מ׳), ונמסר כ־GLB של אנימציה וכנתוני JSON אפויים ב־30Hz. כל הקבצים החדשים נמצאים בתיקייה זו והם מקוריים/CC0; אין שינוי בקוד המשחק. התצוגה משתמשת בשלוש ספריות תוכנה שכבר קיימות במאגר, כמפורט להלן.

| משפחה | מהלכים |
|---|---|
| כדרור · 9 | crossover, בין הרגליים, מאחורי הגב, hesitation, step-back, jab step, spin, כדרור בספרינט, כדרור מוגן |
| מסירות · 6 | חזה, קרקע, מעל הראש, מאחורי הגב, בקפיצה, אלי־הופ |
| זריקות · 7 | jump shot, fadeaway, floater, hook, שלוש מכדרור, שלוש מקבלה, זריקה תחת לחץ הגנתי |
| ריבאונד וחסימות · 5 | ריבאונד התקפה, ריבאונד הגנה, חסימת זריקה, חסימת גוף/בוקס־אאוט, screen |
| הגנה · 3 | הגנה צמודה, חטיפה, חציית נתיב מסירה |

`screen` ו־`close_guard` הם מהלכים ללא כדור אצל המבצע. מדידת מגע/קליטת כדור אינה חלה עליהם; אין בהם אירוע קליטה מלאכותי. יתר המהלכים כוללים מסלול כדור ואירועי מגע בהתאם לפעולה.

## צפייה

1. בשכפול sparse הוסיפו את תיקיית התוכנה הקיימת, ללא שינוי בקבצים שלה:

```sh
git sparse-checkout add workout/island/design/hoops-motion-v8/runtime/vendor
```

2. הפעילו שרת משורש המאגר:

```sh
python3 -m http.server 8765
```

3. פתחו את [preview.html](http://localhost:8765/workout/island/design/hoops-motion-v11/preview.html).
4. בחרו מהלך. התצוגה מנגנת את קובצי ה־GLB שנמסרו על שלוש הדמויות, מול טבעת בגובה 3.05 מ׳. אפשר להשהות, לגרור זמן, להאט, לשנות זווית ולהציג מסלולי כדור ושורש. לחיצה על אירוע עוצרת ברגע המגע.

[REPORT.md](REPORT.md) מכיל טבלאות של המדידות בפועל ותוצאות טעינת כל הקבצים. [LICENSES.md](LICENSES.md) מונה מקור ורישיון לכל קובץ חדש. המודלים והאנימציות נמצאים תחת `runtime/`. התצוגה פועלת בתוך המאגר ללא CDN או חיבור חיצוני, באמצעות `three.module.js`, `GLTFLoader.js` ו־`BufferGeometryUtils.js` הקיימים ב־`../hoops-motion-v8/runtime/vendor/`. אלה קובצי תוכנה קיימים ב־MIT; לא נוספו להם עותקים ולא שונה רישיונם. כל קובצי ה־GLB החדשים נמסרים ללא Draco וללא meshopt, והניגון עובד תחת CSP שחוסם WebAssembly.

## חוזה ניגון GLB

`runtime/catalog.json` מונה את המהלכים והפרופילים. טוענים דמות מ־`runtime/models/<profile>.glb` ואנימציה תואמת מ־`runtime/clips/<profile>/<id>.glb`. קובץ האנימציה מכיל היררכיה וערוצים; הגאומטריה והמשקולות נמצאות במודל המשותף. אין להחליף בין פרופילי אנימציה או לשנות את סקאלת השלד כדי להתאים גובה.

בדוגמה הבאה `THREE`, `loader` מסוג `GLTFLoader`, `scene` ו־`clipId` כבר הוגדרו. הנתיבים יחסיים לתיקיית החבילה:

```js
async function loadGLB(relativePath) {
  const url = new URL(relativePath, location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${relativePath}: HTTP ${response.status}`);
  return loader.parseAsync(await response.arrayBuffer(), new URL('.', url).href);
}
const model = await loadGLB('runtime/models/guard.glb');
const performance = await loadGLB(`runtime/clips/guard/${clipId}.glb`);
const motion = new THREE.Group();
motion.name = 'Motion';
motion.add(model.scene);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(.12, 20, 14),
  new THREE.MeshStandardMaterial({color: '#cb7d3f'}),
);
ball.name = 'Ball';
motion.add(ball);
scene.add(motion);
const mixer = new THREE.AnimationMixer(motion);
const action = mixer.clipAction(performance.animations[0]);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
// בלולאת הרינדור: mixer.update(deltaSeconds).
```

`Motion` מקבל את תרגום וסיבוב העולם. העצם `Root` נשארת בזהות. `Hips.position` ב־GLB כבר כולל את מיקום המנוחה וההיסט; אין להוסיף אליהם את תנועת השורש או את גובה האגן פעם נוספת. מיקום השחקן במגרש שייך לקבוצת אב מעל `Motion`. את נראות הכדור קובעים לפי מטא־הנתונים ושלב הכדור, כפי שעושה התצוגה.

## נתוני JSON ומגעים

`runtime/keyframes/<profile>/<id>.json` מכיל משך בשניות, `fps:30`, מידות שלד, אירועים ומערך `keyframes` הכולל את נקודת הסיום. זמן הדגימות מנורמל 0–1; זמן האירועים בשניות. הצירים: ‎+Y למעלה, ‎+Z קדימה, ‎+X לצד שמאל האנטומי; כל המידות במטרים.

`rotations` הם קווטרניונים מוחלטים במרחב ההורה, בסדר xyzw. `hipsOffsetMeters` מתווסף למנוחת האגן בלבד. `referenceRootTranslationMeters` ו־`rootRotationQuaternion` הם תנועת `Motion`; `ballPositionMeters` הוא מרכז הכדור במרחב המקומי של אותה קבוצה. `contacts` מספק מצב נטיעה ועוגן עולם לכל רגל; `handContacts` מסמן מגע יד בכדור. רדיוס הכדור 0.12 מ׳, ולכן מודדים מגע כף יד מול מעטפתו ולא מול מרכזו.

לניגון JSON אפשר לייבא `sampleFrame`, `createActor` ו־`applyFrame` מ־`runtime/math.mjs`. `sampleFrame(clip, normalizedTime)` מבצע LINEAR/SLERP בין דגימות אפויות. אין להוסיף easing בזמן הניגון. יוצרים שחקן באמצעות `createActor(model.scene, profile, motion)` ומחילים `applyFrame(actor, frame)`; מיקום הכדור נלקח מהדגימה. כך תנועת השורש מוחלת פעם אחת.

| אירוע | משמעות |
|---|---|
| `foot_plant` / `foot_lift` | תחילת נטיעה בעוגן עולם / ניתוק הרגל |
| `hand_ball_contact` / `hand_ball_release` | התחלה / סיום של מגע כף יד בכדור |
| `ball_release` עם `bounceIndex` | דחיפת הכדור למחזור כדרור מסוים |
| `ball_floor_contact` עם `bounceIndex` | מגע הכדור ברצפה באותו מחזור |
| `ball_return` עם `hand`, `bounceIndex` | חזרת הכדור לכף היד המצוינת אחרי ההקפצה |
| `ball_gather` | איסוף הכדור והפסקת הכדרור לצורך הפעולה הבאה |
| `ball_catch` עם מקור | קליטת כדור נכנס אצל השחקן המבצע; המקור מתואר במטא־הנתונים |
| `ball_release` ללא `bounceIndex` | שחרור מסירה או זריקה |
| `ball_target_catch` | הגעה לנקודת קליטה של מקבל חיצוני, שאינו דמות מונפשת נוספת בקליפ |
| `ball_deflect` | מגע שמסיט את הכדור בחסימת זריקה |

האירועים הם סימני תזמון להמחשה ולחיבור עתידי. הם אינם מעניקים בעלות בכדור, קובעים עבירה, פוסקים חוקיות screen או מבטיחים תוצאת משחק. משחק שצורך אותם צריך לעבד כל שחרור פעם אחת ולנהל את הסמכות שלו בנפרד.

## מעברים וגבולות

`loop:true` בקטלוג מציין מחזור סגור. שאר המהלכים חד־פעמיים; החזרה בתצוגה היא איפוס לצורך סקירה. אין לראות באיפוס מעבר חלק בעולם או היתר לחבר מסלולים בלי יישור.

במעבר בין קליפים יש ליישר את שורש הקליפ החדש למיקום השחקן ולשמר עוגן רגל פעיל. ערבוב פוזות עשוי לדרוש תיקון IK אחרי הערבוב. בדיקות הנטיעה מתייחסות לקליפים שנמסרו ולתנאי המדידה שבדוח. התצוגה אינה מנוע מגע בין שחקנים; מסירה למקבל חיצוני ולחץ הגנתי מיוצגים לפי מסלול ואירועים.

הדמויות הועתקו מעותקי הריצה של `hoops-tall-v1`, קומיט `cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa`. כל הקבצים החדשים ב־CC0. ספריות התוכנה המשותפות נשארות מחוץ לתיקייה זו, תחת [רישיון MIT הקיים](../hoops-motion-v8/runtime/vendor/LICENSE.three) של המאגר. הוראות שחזור ב־[source/README.md](source/README.md).
