# אולם 08 — שילוב

חבילת אולם ושידור עצמאית ל־three.js **r160**, ללא build וללא בקשות רשת חיצוניות. המשחק טוען רק מתוך `runtime/`; דף התצוגה, כלי ההפקה והצילומים אינם נדרשים במשחק. אין שינוי בקוד המשחק או בגרסת ההפצה.

## טעינה קצרה

```js
import * as THREE from './hoops-arena-v8/runtime/vendor/three.module.js';
import { createArena } from './hoops-arena-v8/runtime/arena.mjs';

const arena = await createArena();
scene.add(arena.group);
scene.background = arena.background;
scene.fog = arena.fog;
// בתוך לולאת הציור הקיימת, seconds ו־dt בשניות:
arena.update(camera, seconds, dt);
renderer.render(scene, camera);
// ביציאה מהמשחק:
// arena.dispose();
```

`scene`, `camera` ו־`renderer` שייכים למנוע המשחק. קובצי ה־loader מייבאים את אותו עותק מקומי של three.js. אם למארח כבר יש עותק r160, יש לאחד את נתיבי הייבוא בזמן החיבור כדי להימנע מהורדה של שני עותקים. אין importmap או build שנדרשים לחבילה הזו.

## מה מחברים

| API | תפקיד |
|---|---|
| `await createArena({lod:'auto'})` | טוען את שלושת קובצי ה־GLB ואת חמש הטקסטורות, מוסיף אור, קהל, מושבים ולוחות; כשל טעינה דוחה את ה־Promise ומשחרר נכסים שכבר הושלמו. |
| `arena.group` | הוספה לסצנה אחת. יחידות במטרים, Y למעלה, X לאורך המגרש. מרכז המגרש במקור; פני הפרקט Y=0.008. |
| `arena.update(camera, seconds, dt, {cheer:0})` | בחירת LOD לפי מרחק וקצב פריימים; הנעת קהל ב־GPU. הזמן והפרש הזמן בשניות. |
| `arena.prepareView(camera)` | חיתוך גג וקיר קרוב לכל מצלמה; הריפליי קורא לו לפני כל הגשה. |
| `arena.setLOD('auto' / 0 / 1 / 2)` | 0 קרוב, 1 ביניים, 2 חסכוני. המעבר אינו טוען נכס נוסף. |
| `arena.updateScore({home,away,period,clock,shot})` | מעדכן את קוביית התוצאות ואת שעוני ה־24. לדוגמה `clock:'02:18'`. |
| `arena.anchors.home / away` | מרכזי טבעות מקומיים: X=±12.75, Y=3.048, Z=0. קרא `group.localToWorld(anchor.clone())` אם מזיזים את הקבוצה. |
| `arena.lod / crowdCount` | רמת הפירוט הפעילה ומספר הצופים המוגשים לציור. |
| `arena.dispose()` | הסרה מהסצנה וניקוי משאבי החבילה; ה־renderer של המארח נשאר בבעלותו. קריאה חוזרת בטוחה. |

ה־GLB לבדו הוא מעטפת גאומטרית עם חלקים בשם. חומר הפרקט מקבל את המפות החיצוניות במודול; קהל, מושבים, לוחות ונתוני שידור מתווספים בזמן ריצה. יש לטעון דרך `createArena`, כדי לקבל בדיוק את התוצאה שנבדקה. אין שחקנים בחבילה.

## HUD וריפליי

```js
import { createBroadcastHUD } from './hoops-arena-v8/runtime/hud.mjs';
const hud = createBroadcastHUD(container);
hud.update({home:68, away:64, homeFouls:3, awayFouls:4, period:4, clock:'02:18', shot:24});
arena.updateScore({home:68, away:64, period:4, clock:'02:18', shot:24});
// hud.destroy() ביציאה
```

המיכל צריך `position:relative` ומידות של משטח המשחק. ה־HUD טוען CSS מקומי ומציג עברית, שתי קבוצות בדיוניות, מספר עבירות ונקודות עבירה, שעון רבע ושעון זריקה עם מצב אזהרה ב־5 שניות ומטה. callbacks נוספים: `onView('near'|'far')`, `onQuality('auto'|0|2)`, `onSeek(fraction)`. שינוי מצלמה או איכות בידי המארח אינו מתבצע דרך ה־DOM. `setView`, `setReplay`, `progress(time,duration)` מסנכרנים את המסגרת עם המנוע. עדכוני טקסט משתמשים ב־`textContent`.

הריפליי מקליט טרנספורמציות בזיכרון, בלי סרטונים ובלי שמירה. בחיבור ריפליי משתמשים ביצירת ה־HUD הבאה במקום הקטע הפשוט שמעל:

```js
import { createReplayRecorder } from './hoops-arena-v8/runtime/replay.mjs';
import { createBroadcastRenderer } from './hoops-arena-v8/runtime/broadcast.mjs';
const recorder = createReplayRecorder([ball, ...players], {seconds:8, rate:30});
const hud = createBroadcastHUD(container, {
  onReplay: active => hud.setReplay(broadcast.setReplay(active)),
  onSeek: fraction => broadcast.seek(fraction),
});
const broadcast = createBroadcastRenderer({renderer, scene, liveCamera:camera, replayCamera,
  recorder, prepareView:arena.prepareView, onProgress:(t,d) => hud.progress(t,d)});
// בכל פריים: עדכן משחק → recorder.record(seconds) → arena.update(...) → broadcast.render(dt)
// הפעלה: hud.setReplay(broadcast.setReplay(true)); חזרה: broadcast.setReplay(false)
// גרירה: broadcast.seek(fraction); בסגירה: broadcast.dispose(); recorder.stop()
```

ההקלטה מחזיקה חלון חסום של 8 שניות ב־30 דגימות לשנייה. `start()` מצלם עותק קפוא של החלון, וההקלטה החיה ממשיכה. אינטרפולציה מחזירה מיקום/סיבוב/קנה מידה/נראות בזמן המבוקש; לאחר רינדור חוזר המצב החי משוחזר גם אם פונקציית הציור זורקת שגיאה. ה־draw callback סינכרוני. היררכיה: יש לרשום גם הורים זזים; אין כאן הקלטת עצמות או לוגיקת משחק. `setReplay` מחזיר `false` אם טרם נאספו שתי דגימות. תצוגת הדוגמה משתמשת בכדור מקורי בלבד, ואינה מוסיפה שחקנים.

`broadcast.render` מצייר פעם אחת בשידור חי, ופעמיים בריפליי: תמונה ראשית וחלונית חיה באותו canvas. הוא משתמש ב־scissor, משחזר את מצב העצמים ואת יחס המצלמה החיה, ומונה את שתי ההגשות ב־`renderer.info`. אין מעבר shadow או השתקפות סצנה נוסף. אין לקרוא במקביל גם ל־`renderer.render` מהלולאה של המארח.

## יעד טלפון ותקציב

שלוש רמות: מרחקי 0/38/60 מ׳, תחום מעבר של 3 מ׳ למניעת ריצוד, ירידה אחרי כשתי שניות מתחת לכ־28fps וחזרה הדרגתית אחרי 12 שניות טובות. `dt` צריך לייצג את הזמן האמיתי בין ציורים; אחרי חזרה מרקע יש לאפס את שעון המארח. קהל ומושבים ב־instancing; הקהל נע ב־shader. אין עבודת CPU לכל צופה בכל פריים.

מומלץ: DPR עד 1.25, ללא postprocessing, `ACESFilmicToneMapping`, חשיפה 1.08, תאורה של החבילה, וציור עד 30fps. חומר הפרקט משלב מייפל, normal, roughness/lacquer וסביבת תקרה אפויה. אין השתקפות שחקנים חיה, וכך נחסך מעבר סצנה בטלפון.

הבדיקה סופרת פענוח Draco בפועל לכל חלק, מופעים, כדור הדוגמה, כל שמונת משטחי התוצאה/24, ושתי הגשות מלאות בריפליי. תקרת **35,000** מתייחסת לכל מה שאינו שחקנים, כולל הריפליי. המספרים הסופיים נמצאים ב־`verification/BUDGET.md`. 30fps הוא יעד; מדידות Chromium/SwiftShader הן בדיקות תוכנה ואינן מדידת טלפון פיזי.

## הרצה ואימות

מתוך תיקיית החבילה:

```sh
node source/serve.mjs
```

פותחים [תצוגה מקומית](http://127.0.0.1:8765/preview.html), עוברים בין רחב/קרוב/ריפליי/איכות ומסובבים את המסך. השרת מאזין ל־loopback ומגיש רק קבצים מתוך החבילה. לצפייה בטלפון יש להגיש את אותה תיקייה משרת הפיתוח של המארח.

```sh
node --test
```

בדיקות Node משתמשות רק בספרייה הסטנדרטית, בעותק three.js ובמפענח Draco שנמסרו. הן אינן דורשות npm install. דו״ח מפורט אפשר לקבל עם `node --test --test-isolation=none` ב־Node 24. בדיקות החבילה אינן עורכות או מריצות בדיקות קיימות של הריפו.

כלי ההפקה האופציונליים ב־`source/` משתמשים ב־Pillow, Chromium ו־npm packages: three@0.160.0, @gltf-transform/{core,extensions,functions}@4.2.1, draco3dgltf@1.5.7, playwright@1.56.1. מתקינים אותם מחוץ לחבילה ומגדירים `HOOPS_AUTHORING_MODULES` לתיקיית `node_modules`. אין צורך בהם לטעינת המשחק או לבדיקת תקציב Node.

סדר הפקה: `create-textures.py` → `build-arena.mjs` → `bake-environment.mjs` → `capture.mjs NN` → `check-browser.mjs`. כל תיקייה `iterations/NN` כוללת רק צילום ששת המצבים, CSV וביקורת קצרה. לפני סבב חדש מעבירים את הסבב הישן לשורת טקסט ב־`iterations/HISTORY.md` ומסירים את תמונותיו; נשמרים שני סבבים בלבד.

## דפדפן ו־CSP

נדרשים ES modules, WebGL ו־WebAssembly. הקבצים חייבים להיות מוגשים ב־HTTP(S), עם MIME תקין ל־JS ול־WASM. `draco.mjs` מחליף את יצירת ה־blob של ה־loader ב־worker סטטי מקומי: `runtime/draco-worker.js`. הוא מייבא רק את המפענח המקומי. הדף עובד עם `script-src 'self'` ו־`worker-src 'self'`, ללא הרשאת eval או blob scripts בדף המארח. `img-src 'self' blob: data:` ו־`style-src 'self'` תואמים את התצוגה.

אם השרת שולח CSP גם לתגובות JS של workers, יש להגדיר לקובץ `draco-worker.js` בלבד `script-src 'self' 'wasm-unsafe-eval'` ו־`connect-src 'self'`, כדי להרשות פענוח WebAssembly בהקשר העובד. זו מדיניות התגובה של העובד, לא שינוי במדיניות דף המשחק. שרת ההדגמה מגדיר אותה, ובדיקת הדפדפן מוודאת פענוח מלא תחת מדיניות הדף הקשיחה של האי. כשל worker/decoder נדחה לשגיאת טעינה במקום להותיר את המשחק ממתין. דף התצוגה מציג שגיאה בעברית עם ניסיון נוסף, וכן מסלול התאוששות מאובדן WebGL context.

מקור כל הגאומטריה, הטקסטורות והעיצוב הוא קוד ההפקה בחבילה. פרטי רישיונות וספריות ב־`LICENSES.md`.
