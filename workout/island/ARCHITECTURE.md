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
| משחקון | `registerMinigame({ ...record, start(ctx), onResult })` | `start` ו־`onResult` הם חוזה למשימה הבאה. `startMinigame(id, context)` בודק דגלים וזמן; הדוגמה ב־`example-minigame.mjs` אינה מפעילה משחק. |
| אירוע | `registerEventType({ ...record, prepare(ctx), apply(ctx) })` | חובה לתת `warningId`. `prepareEvent(id)` מחזיר התראה לפני פעילות עתידית. ראו `example-event.mjs`; אירועים כבויים בשלב הזה. |
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

השמירה מקומית בלבד, במפתח הקבוע `island.v1`, ובתוכה `version: 2`. `persistence.mjs` מכיל שרשרת `migrations`: כשמוסיפים גרסה, מוסיפים מעבר מהגרסה הקודמת, מעלים `CURRENT_VERSION`, ומוסיפים בדיקה עם שמירה ישנה. אין להסתמך על איפוס כדי לשנות סכימה.

טעינה בודקת מטבע, משאבים, מבנים, גבולות, חפיפות, רמות, דמות והתקדמות. שמירה פגומה או עתידית אינה נדרסת; נעשה ניסיון לשמור את הטקסט הגולמי במפתח `island.v1.corrupt.<timestamp>`, וכשל מוצג בממשק. ייבוא בשער ההורה ממזג מבנים שאינם מתנגשים, שומר מבנים קיימים, מאחד פרסים ומתקדם רק קדימה במטבע ובהתקדמות. התוצאה כוללת `added` ו־`conflicts`. קודם נשמר המיזוג בהצלחה ורק אז מתחלף המצב החי; היסטוריית הביטול מתנקה.

`undo()` הופך רק את שינוי המבנה והעלות של הפעולה האחרונה. הכנסה שכבר נצברה, פרסי הדרכה וחלקים נשארים. העברה או הסרה של כביש אינן מותרות אם הן מנתקות מבנה שהיה מחובר.

## החלפת תצוגה ושילוב חיצוני

תצוגה חלופית תממש את חוזה `IslandView`: בנאי עם `canvas`, `data` והקריאות החוזרות `onCell({x,z})`, `onHover({x,z})`, `onSelect(id)`, `onReady()` ו־`onError(textId)`; שיטות `setWorld(state)`, `setGhost(record,x,z,valid)`, `clearGhost()`, `showRadius(record,instance)`, `setAvatar(record)`, `home()` ו־`dispose()`. תצוגת יצירת הדמות משתמשת גם ב־`attachAvatarPreview(canvas)` וב־`detachAvatarPreview()`. בדיקות הדפדפן משתמשות ב־`screenForCell(x,z)` וב־`metrics()` לצילום ולמדידה.

הדמות נטענת מ־`assets/kid-full.glb`, ו־Three.js ו־GLTFLoader מ־`vendor/`, בתוך תיקיית האי. אלה עותקים ללא שינוי של הנכסים הקיימים במאגר, כולל הרישיון; אין CDN או פנייה לשירות חיצוני. ההעתקה נחוצה משום ש־GitHub Pages מפרסם את `workout/` ואינו מפרסם את `codex-lab/`. בדיקת תאימות הפרסום חייבת להצליח גם כאשר נתיבי המעבדה מחזירים 404. כמות האזרחים מוגבלת ב־`config.maxCitizens`, עד 30, והתצוגה מפחיתה איכות אוטומטית בקצב נמוך.

האפליקציה החיצונית יכולה להעניק חלקים באמצעות `window.islandApi.grantParts(groupId, count)`; קבוצת ההרחבה הנוכחית היא `data.world.partGroup`. החלקים פותחים את `config.worldStages` בלי תשלום אמיתי. `canPlay()` ו־`spendPlayTime(minutes)` זמינים ב־`engine/hooks.mjs`, במנוע וב־`window.islandApi`, ומחזירים כרגע תמיד `true`.

הממשק מפרסם אירוע `island:narrate` עם `{ id, values }`; המנוע מספק גם `narration.subscribe(listener)`. אלה הוקים בלבד: הטקסט מזוהה תמיד לפי מזהה, ואין כאן מימוש דיבור.
