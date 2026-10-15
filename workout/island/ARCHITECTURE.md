# האי שלי — מבנה והרחבה

## גבולות התיקייה

- `app.mjs`: חיבור הנתונים, המנוע, התצוגה והממשק; שעון הכלכלה ו־`window.islandApi`.
- `data/`: כל התוכן. `config.json` מרכז מחירים, רדיוסים, מידות, רמות, קצב הכנסה, פרסים וספי הרחבה. `strings.he.json` מכיל את הטקסטים לפי מזהה; `featureFlags.json` מפעיל או מסתיר יכולות.
- `engine/`: חוקים ומצב ללא DOM או Three.js. `registry.mjs` לרישום סוגים; `rules.mjs` להנחה וגישה; `economy.mjs` להכנסה; `metrics.mjs` לכיסוי ולמדדי העיר; `persistence.mjs` לשמירות; `episodes.mjs` לפרקים; `hooks.mjs` לזמן ולקריינות.
- `view/`: תלת־ממד, נכסים, מצלמה, צל הנחה ותרגום מחוות לקואורדינטות. אינו מחליט אם מותר לבנות.
- `assets/kid-full.glb` ו־`vendor/`: עותקים זהים של הדמות, Three.js r160, ה־loader והתלות שלו, כולל רישיון MIT. המקורות ב־`codex-lab/kid-full/`; מקור ורישיון לכל קובץ ב־`ASSETS.md`.
- `ui/interface.mjs` ו־`styles.css`: כפתורים, הדרכה, כרטיסי מידע ושער ההורה. הממשק קורא לפקודות המנוע ומציג את התוצאה.
- `extensions/`: מודולי רישום; `data/extensions.json` הוא המניפסט ורשומות הדוגמאות.
- `episodes/`: קובץ JSON לכל פרק ומניפסט `index.json`.
- `tests/island-*.test.mjs`: בדיקות המנוע; `tests/e2e/island.mjs`: בדיקת הדפדפן. `ASSETS.md` מתעד מקורות ורישיונות; `QA.md` מתעד תוצאות ומגבלות.

לא משנים את `workout/js/`, את `workout/cam-lab/` או את `workout/upload-sw.js` לצורך הרחבת האי.

## הרצה ובדיקות

משורש המאגר, הפעילו שרת מקומי:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

פתחו את [האי המקומי](http://127.0.0.1:8765/workout/island/). פרמטר `?dev=1` מוסיף כלי בדיקה; כפתור החלקים כפוף גם לדגל `devParts`.

במסוף נוסף, בדיקות המנוע:

```powershell
node --test tests/island-*.test.mjs
```

בדיקת הדפדפן (מפעילה בעצמה שרת מקומי זמני):

```powershell
node tests/e2e/island.mjs
```

הבדיקה משתמשת ב־Playwright מותקן וב־Chrome המקומי ב־Windows. אפשר להתאים את הכתובת והכלים באמצעות משתני סביבה:

```powershell
$env:ISLAND_BASE_URL = 'http://127.0.0.1:8765/'
$env:ISLAND_PLAYWRIGHT = 'C:/path/to/playwright/index.mjs'
$env:ISLAND_BROWSER = 'C:/path/to/chrome.exe'
node tests/e2e/island.mjs
```

הבדיקה מפיקה תמונות ודוח ב־`tests/e2e/screenshots/`, בודקת רוחב 1440 ורוחב 390 וגם תצוגה אופקית. השרת הפרטי שלה מגיש רק את `/workout/island/` וחוסם כל נתיב אחר, לרבות `codex-lab/`; אותה פקודה בודקת גם עצמאות של התיקייה המפורסמת. בדיקות תוכנה ו־SwiftShader אינן מדידת ביצועים במכשיר Android 10 פיזי; מכשיר כזה טרם נמדד.

## חוזה המנוע

`loadData()` מתוך `engine/load-data.mjs` קורא קבצים מקומיים, ממזג את האיזון לתוכן וטוען את המניפסטים. אפשר להעביר `base` ו־`fetcher` לבדיקה ללא דפדפן.

`createEngine(data, { storage, now })` מתוך `engine/engine.mjs` מחזיר מנוע עם `state` ו־`registry`. `state` נשאר אותו אובייקט גם בייבוא. הרשומות ב־`registry.buildings`, ב־`sports`, ב־`minigames`, ב־`eventTypes` וב־`metrics` הן מפות לפי מזהה.

- בנייה: `validatePlacement(typeId, x, z, ignoreId?)`, `place(typeId, x, z)`, `move(id, x, z)`, `remove(id)`, `upgrade(id)`, `undo()` ו־`canUndo()`.
- מצב: `setAvatar(record)`, `grantParts(groupId, count)`, `tick(seconds)`, `metrics()`, `coverage(id)`, `population()`, `income()` ו־`incomePerMinute()`.
- הדרכה: `nextObjective()`, `skipTutorial()` ו־`restartTutorial()`. רק הנחה בפועל של הסוג המבוקש משלימה צעד. הפרסים משולמים פעם אחת; ביטול וביצוע חוזר אינם מכפילים אותם.
- שמירה: `save()`, `exportJSON()` ו־`importJSON(raw)`; `storageStatus` מדווח כשל. `subscribe((state, event) => {})` מחזיר פונקציית ביטול הרשמה.

פקודות מחזירות `{ ok, reason, ... }`; `reason` הוא מזהה ב־`strings.he.json`. קואורדינטות הרשת הן מספרים שלמים מ־0 ועד `state.world.size - 1`. `footprint: [width, depth]` נפרש מהעוגן בכיוון החיובי. רדיוס נמדד בין מרכזי המבנים, כולל הגבול.

## הוספת תוכן ללא שינוי המנוע

לסוג רגיל אפשר להוסיף רשומה למערך המתאים ב־`data/`. לתוכן עם התנהגות חדשה מוסיפים מודול יחיד ב־`extensions/`, מוסיפים את נתיבו ל־`data/extensions.json.modules`, ואת הרשומה ל־`records` באותו קובץ. את המספרים מוסיפים ל־`config.json`, ואת הניסוחים ל־`strings.he.json`. אין צורך לערוך את `engine/`.

לדוגמה, מודול בנייה יכול להכיל:

```js
export function install(registry, data) {
  registry.registerBuilding(data.extensions.myBuilding);
}
```

| סוג | הרישום | הנתונים והתנהגות הדוגמה |
| --- | --- | --- |
| מבנה | `registerBuilding(record)` | `id`, `title`, `icon`, `category`, `visual.kind`, תנאי כביש/חוף; `config.buildings[id]` מכיל `cost`, `footprint`, `radius`, `effects`, `income`, `resources` ו־`levels`. ראו `example-building.mjs`. |
| ספורט | `registerSport(record)` | `id`, `title`, `icon`, `buildingId`; איזון ב־`config.sports[id]`. ראו `sports.json` ו־`example-sport.mjs`. |
| משחקון | `registerMinigame({ ...record, start(ctx), onResult })` | `startMinigame(id, context)` בודק דגלים ו־`canPlay`, מפעיל session ומספק `finish` ו־`cancel`. ראו מודולי `alien-defense`, `fire-rescue` ו־`naval-duel`; דוגמת G1 נשארת מוסתרת. |
| אירוע | `registerEventType({ ...record, prepare(ctx), apply(ctx) })` | חובה לתת `warningId`. `prepareEvent(id, context?)` מכין יעד באמצעות מחולל עם זרע. `activity/runtime.mjs` מנהל התראה, דחייה יחידה, משחק או טיפול עצמי; `apply` משמש להחלטת העיר. |
| מדד | `registerMetric({ ...record, calculate(ctx) })` | בסיס ב־`config.metrics[id]`, אייקון וצבע ברשומה; `calculate` אופציונלי וטהור. ראו `metrics.json` ו־`example-metric.mjs`. |

אפשר לקרוא לאותן פונקציות דרך `engine.registerBuilding(...)` ושאר שיטות הרישום. מקור הכנסה חדש נרשם ב־`config.incomeSources` או דרך `registerIncomeSource({ id, calculate(ctx) })`; הוא מחזיר כמויות לדקה לפי שמות המשאבים. כל המקורות מופיעים בפירוט של `income()`.

שדרוגים מוגדרים רק ב־`config.buildings[id].levels`: הרשומה הראשונה היא הרמה הבסיסית, והבאות מציינות את מחיר השדרוג. `levelMultiplier` מגדיר כיצד האפקט, הרדיוס וההכנסה גדלים. `balanceId` מאפשר לסוג חדש להשתמש ברשומת איזון קיימת. דגל `featureFlag` ברשומה נבדק מול `featureFlags.json`; הדוגמאות מוסתרות תחת `exampleContent`. ארבע רשומות ההגנה נעולות במפורש.

למודל חזותי חדש אפשר להוסיף מפעל תצוגה באמצעות `view.setBuildingFactory((record, level) => group)`. המבנה יכול להשתמש מיד ב־`visual.kind` קיים; הדוגמה משתמשת בסגנון הפארק.

אפשר גם לייבא `registerBuildingVisual` מ־`view/buildings.mjs` ולרשום `registerBuildingVisual('kind', (group, visual, width, depth, height) => { ... })`. שדה `visual.kind` בוחר במראה החדש בלי לשנות חוקים.

## פרקים, קבוצה ושחקנים

מוסיפים קובץ JSON ל־`episodes/` ואת שמו ל־`episodes/index.json.episodes`. הפורמט לדוגמה נמצא ב־`example-first-visit.json`: `id`, `title`, `opponent` עם `nameId` ו־`personalityId`, מערך `dialogues` עם `speakerId` ו־`textId`, תנאי `unlock`, ו־`rewardId` שמפנה ל־`config.episodeRewards`.

`loadEpisode(data, id)` טוען רשומה; `engine.startEpisode(id)` בודק תנאי פתיחה, ו־`completeEpisode(id)` מעניק פרס פעם אחת. הפרק המצורף מסומן `testOnly`; אפשר לבדוק אותו באמצעות `{ testMode: true }` אחרי ההדרכה. אין פרק עלילתי פעיל כברירת מחדל, ו־`episodes` כבוי בדגלים.

`team.json` מגדיר שם וצבעים; `players.json` מגדיר שמות וצבעי שחקנים. מהירות, בעיטה, שמירה ורמה התחלתית באים מ־`config.playerDefaults`.

## שמירות והמשך פיתוח

השמירה מקומית בלבד, במפתח הקבוע `island.v1`, ובתוכה `version: 3`. `persistence.mjs` מכיל שרשרת `migrations`: כשמוסיפים גרסה, מוסיפים מעבר מהגרסה הקודמת, מעלים `CURRENT_VERSION`, ומוסיפים בדיקה עם שמירה ישנה. אין להסתמך על איפוס כדי לשנות סכימה.

טעינה בודקת מטבע, משאבים, מבנים, גבולות, חפיפות, רמות, דמות והתקדמות. שמירה פגומה או עתידית אינה נדרסת; נעשה ניסיון לשמור את הטקסט הגולמי במפתח `island.v1.corrupt.<timestamp>`, וכשל מוצג בממשק. ייבוא בשער ההורה ממזג מבנים שאינם מתנגשים, שומר מבנים קיימים, מאחד פרסים ומתקדם רק קדימה במטבע ובהתקדמות. התוצאה כוללת `added` ו־`conflicts`. קודם נשמר המיזוג בהצלחה ורק אז מתחלף המצב החי; היסטוריית הביטול מתנקה.

`undo()` הופך רק את שינוי המבנה והעלות של הפעולה האחרונה. הכנסה שכבר נצברה, פרסי הדרכה וחלקים נשארים. העברה או הסרה של כביש אינן מותרות אם הן מנתקות מבנה שהיה מחובר.

## החלפת תצוגה ושילוב חיצוני

תצוגה חלופית תממש את חוזה `IslandView`: בנאי עם `canvas`, `data` והקריאות החוזרות `onCell({x,z})`, `onHover({x,z})`, `onSelect(id)`, `onReady()` ו־`onError(textId)`; שיטות `setWorld(state)`, `setGhost(record,x,z,valid)`, `clearGhost()`, `showRadius(record,instance)`, `setAvatar(record)`, `home()` ו־`dispose()`. תצוגת יצירת הדמות משתמשת גם ב־`attachAvatarPreview(canvas)` וב־`detachAvatarPreview()`. בדיקות הדפדפן משתמשות ב־`screenForCell(x,z)` וב־`metrics()` לצילום ולמדידה.

הדמות נטענת מ־`assets/kid-full.glb`, ו־Three.js ו־GLTFLoader מ־`vendor/`, בתוך תיקיית האי. אלה עותקים ללא שינוי של הנכסים הקיימים במאגר, כולל הרישיון; אין CDN או פנייה לשירות חיצוני. ההעתקה נחוצה משום ש־GitHub Pages מפרסם את `workout/` ואינו מפרסם את `codex-lab/`. בדיקת תאימות הפרסום חייבת להצליח גם כאשר נתיבי המעבדה מחזירים 404. כמות האזרחים מוגבלת ב־`config.maxCitizens`, עד 30, והתצוגה מפחיתה איכות אוטומטית בקצב נמוך.

האפליקציה החיצונית יכולה להעניק חלקים באמצעות `window.islandApi.grantParts(groupId, count)`; קבוצת ההרחבה הנוכחית היא `data.world.partGroup`. החלקים פותחים את `config.worldStages` בלי תשלום אמיתי. `canPlay()` ו־`spendPlayTime(minutes)` זמינים ב־`engine/hooks.mjs`, במנוע וב־`window.islandApi`, ומחזירים כרגע תמיד `true`.

הממשק מפרסם אירוע `island:narrate` עם `{ id, values }`; המנוע מספק גם `narration.subscribe(listener)`. אלה הוקים בלבד: הטקסט מזוהה תמיד לפי מזהה, ואין כאן מימוש דיבור.

## פעילות G2: משחקונים, אירועים ותיקונים

`minigames/` מכילה מודלים טהורים נפרדים לחייזרים, לכיבוי ולספינות; `canvas-session.mjs` אחראי לקנבס, למגע, למקלדת, לפריימים ולניקוי. כל מודל מקבל `random` עם זרע ואינו משנה את העיר. `ui/activity.mjs` מחבר תפריט, הוראות, משחק, תוצאה והתראות. הכניסה למשחקונים נמצאת בפירוט המדדים של העיר, בלי להוסיף מסילה קבועה למסך של G1b. שכבת המשחק ממלאת את המסך רק בזמן משחק.

קישור עם `?games=1` פותח ישירות את כרטיסי המשחקים. אם טרם נוצרה דמות, התפריט נפתח מיד אחרי בחירתה; אין צורך לסיים את ההדרכה כדי לנסות משחקון חופשי. האירועים עדיין כפופים לחסימת ההדרכה. הקיצור מאפשר בדיקה ומשוב מאותו קוד של האפליקציה.

כדי להוסיף משחקון:

1. הוסיפו מודל וציור בתיקיית `minigames/`, עם `update(dt,input)`, `result` ו־`snapshot()` לבדיקות. השתמשו רק ב־`ctx.random`; אל תשנו את מצב העיר מתוך המודל.
2. הוסיפו מודול יחיד ב־`extensions/` שקורא ל־`registerMinigame({id,title,featureFlag,difficulty,helpId,icon,start,onResult})`, ונתיב במניפסט `data/extensions.json`. `start` יכול להשתמש ב־`runCanvasGame`; הוא מחזיר `dispose()` ואפשר גם `setPaused()` ו־`snapshot`.
3. הוסיפו את כל האיזון, מידות הציור והפרסים ב־`config.minigames[id]`, שלוש שורות קושי ב־`levels`, ומחירי ציוד ב־`config.minigameLevels[id]`. הוסיפו דגל ומזהי מחרוזות, לרבות שלוש שורות `minigame.<id>.help.1` עד `.3`. התפריט והשדרוגים נקראים מהנתונים; משחק עם שליטה חדשה יוסיף גם את רכיב השליטה שלו בממשק.
4. `ctx.level` ו־`difficulty` נגזרים משלב הרחבת העיר (1–3). `ctx.upgradeLevel` ו־`power` באים מהשדרוג שנקנה. `ctx.bonuses` כולל מגינים ממשטרה, קצב ירי מבית ספר, ובאירוע שריפה גם זמן ומים מתחנת כיבוי פעילה בטווח. הרדיוס נמדד בין מרכזי footprint ובאותו מקדם שדרוג של G1.
5. המודל קורא ל־`ctx.finish({outcome:'win'|'lose',score})`; `onResult(raw,ctx)` מחשב `{outcome,score,money}`. המנוע מאמת, מזכה ושומר פעם אחת, מעדכן שיא וניצחונות, ומוסיף חלק בכל מספר ניצחונות המוגדר בנתונים. יציאה קוראת ל־`ctx.cancel()` בלי פרס, הפסד או הפחתת כסף. שני המסלולים מנקים את ה־session וקוראים ל־`spendPlayTime` בדקות. רק session אחד יכול לפעול.

כדי להוסיף אירוע, הוסיפו שורה ב־`config.events.types` עם `gameId`, `featureFlag`, `warningId`, `titleId`, סמל ו־`cooldownMs`, ומודול רישום עם `prepare({state,engine,random})` ו־`apply({state,engine,random})`. המימושים הקיימים נמצאים ב־`extensions/island-events.mjs`. `prepare` מחזיר `targetId`; `apply` מחזיר תוצאת טיפול עצמי. תזמון ותדירות, זמן התראה, דחייה ואפשרויות הילד באים מהנתונים. אין צורך בשינוי המנוע להוספת רשומה.

`activity/runtime.mjs` שומר לכל היותר אירוע אחד. סדר השלבים הוא `warning` → `ready` → `playing`; אי אפשר להתחיל משחק או טיפול עצמי לפני תום ההתראה. דחייה מאריכה את ההתראה פעם אחת. הפסד מחזיר את אותו אירוע ל־`ready` לניסיון נוסף. משחק שבוטל או שוחזר מרענון אינו מקבל פרס אוטומטי. הדרכה פעילה, בחירת דמות וכל חלונית פתוחה עוצרים יצירה והתקדמות של אירועים. דגל כבוי מסתיר ומשהה את האירוע השמור, בלי למחוק אותו. ההתראות שקטות ומשתמשות בהוק הקריינות; אין צליל שהורד מהרשת.

הפסד בשריפה מוסיף מועד סיום ל־`state.events.repairs[targetId]`. המבנה נשאר במקומו ובאותה רמה, מקבל סימון תלת־ממדי וטקסט בכרטיס, ומוחרג מהכנסה ומייצור עד מועד זה. התיקון מסתיים מעצמו, או בפקודה מפורשת ובמחיר המוגדר. שני מקורות הכנסה נוספים רשומים ב־`extensions/activity-income.mjs`; כל המקורות מקבלים `activeBuildings`, ואינם מבטלים את התיירות והייצור של G1.

גרסה 3 מוסיפה `minigameLevels`, `highScores`, `minigameWins`, `instructionsSeen` ו־`events` (ספירות, מועדים, רצף מזהים, אירוע פעיל, תיקונים ומזהים שהסתיימו). מעבר 2→3 מוסיף רק ברירות מחדל; גרסה 1 עוברת גם דרך המעבר הישן. `activity/state.mjs` מאמת וממזג את השדות. בייבוא נשמר הגבוה מבין רמות ושיאים, אין שני אירועים פעילים, ואירוע שכבר הסתיים אינו מתעורר מחדש. מזהה משחק חדש מקבל רמה 1 בעת טעינה, ללא איפוס שמירה או מעבר סכימה נוסף. שינוי מבני בסכימה דורש מעבר חדש כרגיל.

הקנבס משתמש במאגרים מוגבלים שהוכנו מראש לקליעים ולחלקיקים, במידות CSS שמורות ובציור דו־ממדי. הודעות ומדים מתעדכנים בקצב מוגבל. בקצב נמוך ה־DPR יורד לפי הנתונים; רינדור האי התלת־ממדי מושהה בזמן המשחק וחוזר עם אותה מצלמה. `AbortController`, ביטול RAF, ניתוק ResizeObserver ואיפוס הקנבס אחראים לסגירה. בדיקות הדפדפן מאמתות גם שכל מאזיני ה־session בוטלו לאחר תוצאה ויציאה חוזרת. אין מדידת Android פיזית בסביבה הזאת.

## אייקון ופתיחה ממסך הבית

`manifest.webmanifest` עצמאי מצביע על `./` לפתיחה ולהיקף, ולכן מתאים גם ל־`/Bakasun/workout/island/`. `index.html` מקשר אליו, ל־SVG המקומי ול־Apple בגודל 180. מקור האיור הוא `assets/icons/island.svg`; `tests/tools/generate-island-icons.mjs` מפיק ממנו PNG ב־192, ב־512 וב־512 maskable, וגם Apple. מסגרת האיור החיוני ב־maskable נמצאת בתוך העיגול הבטוח שרדיוסו 40% מהצלע. אין service worker ואין תמיכה ללא חיבור.

בדיקות נוספות: `tests/e2e/island-install.mjs` מאמתת את נתיבי הפרסום וסוגי התוכן; הרצת `tests/e2e/island.mjs` כוללת כעת גם שלושה משחקים ותוצאות, אירועים, שמירה, רענון וייבוא/ייצוא ב־390 וב־1440. `ISLAND_ONLY=activity` בודק רק את הפעילות; `ISLAND_ONLY=layout` שומר על ארבע פריסות G1b. כל המשחקים והאירועים נבדקים גם ב־Node עם זרע קבוע.
