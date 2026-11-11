# תפוס את הפושע v6: חוזה המודולים (סבב עומק, ענף claude/catch-deep-fable)

מה רועי ביקש (מילה במילה אצל סשן הריכוז): מרדף תלת-ממדי על מסלול עם פניות ומכשולים שמאטים את הניידת, מבט מאחורי הניידת;
תוך כדי המרדף יורים בגלגלים של רכב הפושע (קריקטורי, בלי אנשים כמטרה) עד שהרכב נעצר; ואז התפיסה כמו משחק חץ וקשת
תלת-ממדי: מלמטה של המסך רואים את הפושע רחוק קדימה, מושכים ומשחררים, רוח, 5-6 זריקות, 2-3 פגיעות. סירנה אמיתית, גרפיקה טובה.

דגל: `?catchV6=0` מחזיר את v5 בדיוק. v5 (catch-chase.mjs, catch-view.mjs, catch-session.mjs) לא משתנה.
כל ייבוא של מודול מהאי נושא את התג `?v=island-v2-20261107-8` בדיוק כמו הייבואים הקיימים. לא נוגעים ב-release.json, בתגים ובגרסה.

## קבצים ובעלים

| קובץ | בעלים | תפקיד |
|---|---|---|
| `minigames/catch-track.mjs` | מוכן (Fable) | גיאומטריית המסלול: `buildTrack({seed,length,curve})` → `sample(s)`, `toWorld(s,d)`, `yawAt(s)`, `curvatureAt(s)`, `segments`, `toTrack(x,z,guess)`. d>0 = ימין כיוון הנסיעה. |
| `minigames/catch-gfx.mjs` | מוכן (Fable) | עזרי Three.js מ-v5: `fitModel`, `rigCar` (גלגלים `Wheel_FL/FR/RL/RR`, אורות `Light_R/B`), `Particles`, `blobShadow`, טקסטורות, `THEMES`, `FILES`, `BUILDINGS`, `clamp/lerp/damp/smooth`. |
| `minigames/catch-chase6.mjs` | סוכן A | חוקי המרדף על המסלול, טהור (בלי DOM). כולל קריאה ל-`createTyreGun` של B. |
| `minigames/catch-view6.mjs` | סוכן A | ה-Three.js של v6: רנדרר, טעינת דגמים, בניית הרחוב לאורך המסלול, סצנת המרדף, מצלמה מאחורי הניידת. קורא ל-`createTyreFx` (B) ול-`createBowStage` (C). |
| `minigames/catch-session6.mjs` | סוכן A (מרדף) ואז Fable (חיבור הקשת) | הבקר של v6: מנועים, לולאה, קלט, HUD של המרדף. מתחיל כהעתק של catch-session.mjs. |
| `minigames/catch-tyres.mjs` | סוכן B | חוקי הירי בגלגלים, טהור. |
| `minigames/catch-tyre-fx.mjs` | סוכן B | אפקטים: הבזק, קו ירי, ניצוצות בגלגל, פנצ'ר (גלגל שטוח, רכב שנוטה), עשן, החלקה. |
| `minigames/catch-fire-hud.mjs` | סוכן B | כפתור ירי, מונה כדורים, כוונת שמוקרנת על הרכב. |
| `minigames/catch-bow-view.mjs` | סוכן C | סצנת התפיסה: מצלמה בגוף ראשון, משגר הרשת למטה, הפושע רחוק, רשת, קו מסלול, טבעת נחיתה, רוח, אפקטים. |
| `minigames/catch-bow-hud.mjs` | סוכן C | קלט ומד: משיכה לאחור בגרירה = כיוון וכוח, שחרור = זריקה, פיפסים של זריקות, חץ רוח, פגיעות. |
| `minigames/catch-audio.mjs` | סוכן D | צלילים (הוספה בלבד; v5 משתמש באותו קובץ). |
| `tools/catch-harness6.html`, `tools/catch-bow-harness.html` | A / C | דפי פיתוח. |
| `tests/island-catch-v6-*.test.mjs` | כל סוכן בקובץ משלו | בדיקות יחידה. `node --test tests/island-catch.test.mjs` חייב להמשיך לעבור. |

כלל ברזל: כל סוכן כותב רק בקבצים שלו. לא `git commit`, לא `checkout`, לא `stash` (Fable מאחד). מחרוזות חדשות בעברית: כל מודול מייצא `STRINGS` (מפתח → עברית), ו-`t(key)` של הסשן נופל אליהן; `data/strings.he.json` מתעדכן בסוף על ידי Fable. בלי סימני קריאה בטקסטים.

## מערכת הצירים
- עולם Three.js: y למעלה, המסלול במישור xz, מתחיל בראשית לכיוון +x.
- רכב: `(s, d)` לאורך המסלול ולרוחבו, `track.toWorld(s, d)` נותן `{x, z, tx, tz, k}`; `rotation.y = track.yawAt(s)` לדגם שפונה +x (דגמי Codex פונים +z, לכן עוטפים ב-Group ומסובבים `Math.PI/2` כמו ב-v5 `CX_TURN`).
- הכביש: רוחב 10 מ' (d מ--5 עד 5), 3 נתיבים ברוחב 3.3; כתף עד |d| 4.3, שפה מעבר לזה.
- שלב הקשת: צירים מקומיים של catch-engine (x קדימה, y למעלה, z לרוחב) ממופים לעולם דרך `frame = {s0, d0}`: `world = track.toWorld(s0 + x, d0 + z)`.

## חוזה A ↔ B (רובה הגלגלים)
```js
// catch-tyres.mjs (B)
export function createTyreGun({balance, stage, rnd, level}) // rnd = מחולל זרעים של המרדף
// gun.state: {ammo, ammoMax, reload (שניות שנותרו), locked (bool), lockWheel ('RL'|'RR'|null), flats: {FL,FR,RL,RR}, flatCount, flatsToStop, hitChance (0..1 לתצוגה)}
// gun.step(dt, ctx) כל פריים של המנוע. ctx = {gap (מ', חיובי = הפושע לפנים), lateral (d של הפושע פחות d של הניידת, מטרים), vOfficer, vThief, stun (>0 = הניידת לא יציבה), scraping (bool), thiefSwerve (-1..1), curvature (k במקום הניידת)}
// gun.fire() → false אם אין כדור/בטעינה/אין נעילה; אחרת מחזיר true ומוסיף אירועים
// gun.drainEvents() → [{type:'shot', hit:bool, wheel, x, y, z (יחסית לרכב הפושע)}, {type:'flat', wheel, flatCount}, {type:'stopped'}, {type:'reload'}, {type:'lock', on:bool}]
// gun.thiefSpeedScale() → 1 בלי פנצ'רים, ~.8 עם אחד, ~.55 עם שניים (A מכפיל את מהירות הפושע)
// gun.thiefWobble(t) → סטייה לרוחב במטרים (A מוסיף ל-d של הפושע) 
```
A מפעיל: `gun.step` כל צעד, `api.fire()` בסשן קורא ל-`gun.fire()`, האירועים של gun מצורפים לאירועי המרדף. `flatCount >= flatsToStop` → A מסיים את המרדף ב-`caught` אחרי החלקה של 2 שניות.
```js
// catch-tyre-fx.mjs (B)
export function createTyreFx({T, scene, playerCar, crimCar, sparks, dust, gfx}) // playerCar/crimCar = roots מ-rigCar (userData.wheels)
// fx.handle(events) לאירועי gun; fx.update(dt, {thiefSpeed, flatCount}); fx.dispose()
// catch-fire-hud.mjs (B)
export function installFireHud({hud, stageEl, t, gun: () => gun, project: (x,y,z) => {x,y,visible}, crimWorld: () => ({x,y,z}), onFire}) // → {refresh(), show(bool), dispose()}
```

## חוזה A ↔ C (שלב הקשת)
```js
// catch-bow-view.mjs (C)
export function createBowStage({T, scene, camera, models, officer, thieves, frame, track, balance, level, stage, engine, sparks, dust, gfx, theme})
// frame = {s0, d0}; stage.bind(engine); stage.enter(); stage.leave(); stage.update(dt, snap); stage.handle(events); stage.project(x,y,z); stage.dispose()
// catch-bow-hud.mjs (C)
export function installBowHud({hud, stageEl, doc, t, engine: () => engine, balance, onRelease, audio}) // → {refresh(), show(bool), setEnabled(bool), dispose()}
```
C מפתח מול `tools/catch-bow-harness.html` עם מסלול ישר (`buildTrack({segments:[{kind:'straight',len:400}]})`) ו-`createCatchEngine({..., arch:true, v2:true})` הקיים.
Fable מחבר את C לתוך catch-session6/catch-view6 אחרי שהשניים מוכנים.

## חוזה כולם ↔ D (צלילים)
`createCatchAudio()` הקיים; D מוסיף cues: `engine` לולאת מנוע לפי מהירות (`audio.engine(v, boosting)`), `siren` אמיתית וחזקה יותר, `turn` חריקה בפנייה חדה, `shot`, `shotHit`, `flat`, `skid`, `draw` (מתיחת הקשת, לפי כוח), `twang` (שחרור), `whistle` (רשת בטיסה), `hitBody`, `hitHead`. בלי ירי ריאליסטי: צליל פופ קריקטורי.

## הוכחות (לכל סוכן)
צילומים ב-`verification/catch-deep-fable/<topic>/` (Playwright 844x390, hasTouch, `--use-gl=angle --use-angle=swiftshader`), גיליון 8 פריימים למהלך, מספרים נמדדים, `node --test` של הקובץ שלך ושל `tests/island-catch.test.mjs`. דוח קצר `REPORT-<topic>.md` באותה תיקייה: מה נבנה, מה נמדד, מה פתוח.
