# תנועות כדורסל v10

18 מהלכים מקוריים על השלד הקנוני בן 18 העצמות, ב־30Hz. כל מהלך נפתר ונאפה בנפרד לשלוש דמויות `hoops-tall-v1`: רכז 1.88 מ׳, קיצוני 1.98 מ׳ וסנטר 2.08 מ׳ — 54 ביצועים, כל אחד כ־JSON וכ־GLB של אנימציה. אין חיבור לקוד המשחק.

| משפחה | מהלכים |
|---|---|
| הטבעה | `dunk_low`, `dunk_high` — שתי עוצמות ניתור, מול טבעת 3.05 מ׳ |
| צעד וחצי | `layup_left`, `layup_right` — איסוף, שני צעדים, הרמה ושחרור |
| ספרינט ובלימה | `sprint_brake`, `sprint_brake_ball` |
| פניות עם נטיעה | `turn_90_left`, `turn_90_right`, `turn_180_left`, `turn_180_right` |
| הגנה | `defensive_stance`, `defensive_slide_left`, `defensive_slide_right`, `defensive_block` |
| שליטה בכדור | `dribble_behind_back`, `pivot`, `shot_start`, `stop_two_feet` |

## צפייה

1. משורש המאגר הפעילו שרת:

```sh
python3 -m http.server 8765
```

2. פתחו [preview.html](http://localhost:8765/workout/island/design/hoops-motion-v10/preview.html).
3. בחרו כל מהלך. התצוגה מנגנת את קובצי ה־GLB שנמסרו על שלוש הדמויות בפועל. אפשר להשהות, לגרור זמן, לשנות מהירות וזווית ולראות עוגני מגע ומסלול שורש. [REPORT.md](REPORT.md) מכיל את המדידות ותוצאות הבדיקות.

הדמויות מועתקות בבתים זהים ל־`runtime/models/` ממסירת `hoops-tall-v1`, commit `cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa`. האנימציות והמודלים אינם דורשים Draco, Meshopt או WebAssembly. התצוגה משתמשת בעותקי Three.js ו־GLTFLoader המקומיים ב־`../hoops-motion-v8/runtime/vendor/`; אין CDN. פרטי המקור והרישיון לכל קובץ נמצאים ב־[LICENSES.md](LICENSES.md).

## ניגון GLB

`runtime/catalog.json` מונה את המהלכים והפרופילים. עבור אותו פרופיל טוענים דמות מ־`runtime/models/<profile>.glb` ואנימציה מ־`runtime/clips/<profile>/<id>.glb`. ה־GLB של המהלך מכיל היררכיה וערוצי אנימציה; הגאומטריה נמצאת בקובץ הדמות המשותף.

בדוגמה הבאה `THREE`, `loader` מסוג `GLTFLoader` ו־`scene` כבר נוצרו. הנתיבים יחסיים לתיקיית התצוגה:

```js
const model = await loader.loadAsync('runtime/models/guard.glb');
const performance = await loader.loadAsync('runtime/clips/guard/layup_right.glb');
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

שמות העצמות בדמות תואמים לערוצים. `Motion` מקבל את התרגום והסיבוב החיצוניים; העצם `Root` נשארת בזהות. ערוץ `Hips.position` ב־GLB כבר כולל את מידות המנוחה של הפרופיל. אין להוסיף אליו שוב את היסט האגן או את מסלול השורש. מיקום השחקן במגרש שייך לקבוצת אב מעל `Motion`.

## נתוני JSON

`runtime/keyframes/<profile>/<id>.json` מכיל משך בשניות, `fps:30`, מידות שלד, אירועים ומערך `keyframes`. זמן כל דגימה מנורמל 0–1. `rotations` הם קווטרניונים מוחלטים במרחב ההורה, בסדר xyzw; `hipsOffsetMeters` מתווסף להזזת המנוחה של האגן בלבד. הצירים הם ‎+Y למעלה, ‎+Z קדימה ו־‎+X לצד שמאל האנטומי; המידות במטרים.

`referenceRootTranslationMeters` ו־`rootRotationQuaternion` הם תנועת `Motion`. `ballPositionMeters` הוא מרכז הכדור במרחב המקומי של אותה קבוצה. `contacts` מציין נטיעה ועוגן עולם לכל רגל; `handContacts` מציין מגע יד בכדור. `ballPhase`, אירועי `ball_gather`/`ball_release` ו־`ball.releaseTimeSeconds` מספקים תזמון המחשה; בקליפ ללא שחרור הזמן הוא `null`. האירועים אינם מעניקים בעלות בכדור ואינם קובעים תוצאה במשחק.

לניגון JSON אפשר לייבא `sampleFrame`, `createActor` ו־`applyFrame` מ־`runtime/math.mjs`. `sampleFrame(clip, normalizedTime)` משתמש באינטרפולציה LINEAR/SLERP על הדגימות האפויות; אין להוסיף easing נוסף. יוצרים שחקן באמצעות `createActor(model.scene, profile, motion)`, ואז מפעילים `applyFrame(actor, frame)` ומעדכנים את מיקום הכדור מהדגימה. שיטה זו משמרת את מידות המנוחה של הדמות ומחילה את תנועת השורש פעם אחת.

## מעברים וחזרה

`loop:true` מציין מחזור סגור. שאר המהלכים חד־פעמיים: התצוגה מחזיקה את הסיום ואז מפעילה אותם מחדש לצורך סקירה. האיפוס הזה אינו חיבור תנועה חלק או לולאה של מסלול העולם.

עוגני הנטיעה נמדדים בתוך כל מהלך שנמסר. בעת חיבור מהלכים למשחק יש ליישר את שורש המהלך החדש למיקום השחקן, לשמר עוגן פעיל לאורך המעבר ולבצע תיקון IK אחרי ערבוב פוזות, או לבחור מעבר בזמן תמיכה תואם. ערבוב חופשי בין קליפים עלול להזיז רגל נטועה; החבילה אינה כוללת מנוע מעברים למשחק. אות שחרור בכדור נצרך פעם אחת בכל הפעלה של מהלך, לפי השעון והסמכות של המשחק.

הוראות בנייה ואימות ב־[source/README.md](source/README.md).
