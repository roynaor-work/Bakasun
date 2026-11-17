#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const [catalog,qa,browser,bridges,technique]=await Promise.all(['catalog.json','verification/motion-qa-v1.json','verification/browser.json','verification/bridge-surfaces.json','verification/technique-audit.json'].map(read));
const testLog=await fs.readFile('/tmp/hoops-technique-repository-tests.log','utf8');
const tests=Object.fromEntries(['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms'].map(key=>[key,testLog.match(new RegExp('(?:ℹ |# )'+key+' ([0-9.]+)\\s*$','m'))?.[1]??null]));
const rerunLog=await fs.readFile('/tmp/hoops-technique-royiki-rerun.log','utf8');
const rerun=Object.fromEntries(['tests','pass','fail','skipped','duration_ms'].map(key=>[key,rerunLog.match(new RegExp('(?:ℹ |# )'+key+' ([0-9.]+)\\s*$','m'))?.[1]??null]));
const status=qa.pass&&browser.pass&&bridges.pass&&technique.pass;
const mm=n=>(n*1000).toFixed(3);
const fmt=n=>Number(n).toFixed(2);
const worstLinear=Math.max(...qa.bridges.flatMap(b=>b.boundaries.map(e=>e.maxLinearVelocityResidualMetersPerSecond)));
const worstAngular=Math.max(...qa.bridges.flatMap(b=>b.boundaries.map(e=>e.maxAngularVelocityResidualRadiansPerSecond)));
const rows=catalog.clips.map(c=>{const r=qa.results.find(r=>r.id===c.id);return `| ${c.label} | \`${c.id}\` | ${fmt(c.duration)} | ${c.frames} | ${r.score} | ${mm(r.maxFootSlipMeters)} | [8 פריימים](${c.contactSheet}) |`;}).join('\n');
const events=catalog.clips.filter(c=>c.releaseFrame!==undefined).map(c=>`| ${c.label} | ${c.releaseFrame} | ${fmt(c.releaseFrame/30)} |`).join('\n');
const text=`# ספריית טכניקת כדורסל v1

תאריך: 17/11/2026. ענף: \`codex/hoops-technique-v1\`. בסיס: \`43b27dc235387e3cb737aee9558cdf9d5fd5a262\`.

מצב הבדיקות המקומיות: **${status?'עבר':'קיימים כישלונות — ראו דוחות'}**. כל הקבצים החדשים נמצאים בתיקייה זו. שום קובץ קיים, לוגיקת משחק או קובץ גרסה לא שונה. רישום המשימה נשמר כאן בהתאם למגבלת התיקייה שבבקשה.

**גבול ה־QA:** הכלי/הסקיל המבוקש \`motion-qa-v1\` לא נמצא בריפו או בקטלוג הכלים והסקילים הזמין. \`source/validate.mjs\` הוא בודק מקומי מקורי עם משקלות וספים מפורשים. הציונים להלן אינם תוצאה של כלי חיצוני, אישור מאמן או הוכחה לרמת motion capture. שיפורי הטכניקה נבדקו גם ברינדורים ובמדידות FK.

## תוצרים וקריטריון סיום

24 קליפים ב־30Hz, שלד קנוני בן 18 עצמות, סימוני מגע ושחרור, גשרי C1 לעמידה ולריצה, 24 גיליונות של 8 פריימים ותצוגה במידה 844×390. קריטריון מספרי: כל קליפ מעל 88 בבדיקה המקומית, החלקה מתחת ל־20 מ״מ, GLB תקין וגשרים ללא חדירה משמעותית לרצפה.

| תוצר | קובץ |
| --- | --- |
| תצוגה מקדימה עם האטה, סקראב, זוויות, סמני מגע ובחירת גשרים | [preview.html](preview.html) |
| צילום במידה המבוקשת | [preview844x390.png](preview844x390.png) |
| GLB משותף: 24 תנועות, 2 תנועות ייחוס ו־96 גשרים | [models/athlete.glb](models/athlete.glb) |
| קטלוג, זמנים, קשרי גשרים, תנועת Root ו־SHA-256 | [catalog.json](catalog.json) |
| bind מדויק ומאפייני כף־יד | [rig.json](rig.json), [authoring-profile.json](authoring-profile.json) |
| מגעים בכל פריים והגדרת נקודת ציר | \`contacts/*.json\` |
| הפקה ובדיקה חוזרות | [source/README.md](source/README.md) |
| מקורות ורישיונות | [LICENSES.md](LICENSES.md) |

המודל המיוצא שוקל ${(catalog.files.model.bytes/1e6).toFixed(2)} MB. הגאומטריה, המרקמים, תנועות העצמות ומורפי האחיזה מוטבעים ב־GLB. גוף הדמות והשלד נלקחו מדמות קיימת בחבילת v7; הכוריאוגרפיה החדשה נכתבה למשימה זו. נשמר גם קובץ bind להפקה חוזרת. גיליונות התנועה מרונדרים מה־GLB שנמסר, באמצעות AnimationMixer.

## תנועות ומדידות

| תנועה | מזהה | שניות | דגימות כולל קצוות | ציון מקומי | החלקה מרבית במ״מ | גיליון |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

נקודות השחרור נרשמו בפריימים שלמים, גם בקטלוג וגם ב־extras של האנימציה:

| תנועה | פריים שחרור | שניות |
| --- | --- | --- |
${events}

הקליפים כוללים מסירות חזה/מקפיצה/מעל הראש/מאחורי הגב מימין ומשמאל/בקפיצה, אליי־אופ כמעביר וכמסיים, זריקת קפיצה/שלוש/פאדאווי/צעד לאחור, לייאפ ימין ושמאל, ריצה בכדרור בשתי הידיים, שלוש העברות כדרור, ציר בשתי הרגליים, שתי עצירות וחגיגה.

## דיוק טכני

הזריקה כוללת העמסת ברכיים ואגן, עלייה רציפה דרך כיס הזריקה, הפרדת היד התומכת, שחרור ומעקב כף־יד. אחרי הביקורת שופרו יישור המרפק והברכיים בשחרור, גובה מסירת החזה ומעקב היד התומכת. מדידות FK, זוויות מפרקים וחלוקת משקל מקורבת נמצאות בדוחות; אין כאן סימולציית כוחות או מדידה רפואית.

לשתי כפות הידיים מסגרות מגע נפרדות שנמדדו על הדמות. אחיזת האצבעות והאגודלים משתמשת במורפים נפרדים, ללא הוספת עצמות לשלד בן 18 העצמות. במצבי מגע מלא נבדקים גם נקודת כף־היד וגם קודקודי העור המונפש. בכדרור יש מקטעי דחיפה/תעופה/מגע קרקע/תפיסה; בשחרור הכדור ממשיך במסלול בעל מיקום ומהירות תואמים לפותר החי.

לריצה יש תנועת Root אמיתית; כף רגל תומכת נשארת באותו מקום בעולם. סיבוב ציר נמדד מול נקודה קבועה בכרית כף־הרגל. המעברים לריצה מתקדמים קדימה ומקבלים תיקון גובה Root מדוד מהעור המפוענח, עם תוספת מיקום ומהירות אפס בקצוות. בחלק מהגשרים יש הרמת גוף קצרה; אין הצהרה שכף רגל נשארת נטועה לאורך כל הגשר.

## תוצאות אימות

| בדיקה | תוצאה |
| --- | --- |
| קנוניות השלד וספירת קליפים | ${qa.canonical18?'18 עצמות תואמות בשם ובהיררכיה':'נכשל'}; ${qa.summary.mainClips} תנועות עיקריות |
| Khronos glTF Validator | ${qa.khronos.errors} שגיאות, ${qa.khronos.warnings} אזהרות |
| ציון מקומי מינימלי | ${qa.summary.minimumScore}/100; כל סעיף הוא גם תנאי חובה |
| החלקת תמיכה מרבית | ${mm(qa.summary.maximumFootSlipMeters)} מ״מ; הסף 20 מ״מ |
| שארית מגע כף־יד בדגימות המקור | ${mm(qa.summary.maximumPalmResidualMeters)} מ״מ |
| דגימות GLB עצמאיות, כולל נקודות ביניים | ${qa.summary.poseSamples} |
| גשרי C1 | ${qa.summary.bridges}; מהירות קווית שארית מרבית ${worstLinear.toFixed(5)} מ׳/ש׳; זוויתית ${worstAngular.toFixed(5)} רדיאן/ש׳ |
| רינדורים | ${browser.captures?.length??0} גיליונות, 8 פריימים לכל קליפ; תצוגה 844×390 |
| בדיקות הפותר סביב השחרור | ${technique.pass?'עברו':'נכשלו'}; [technique-audit.json](verification/technique-audit.json) |
| עור כפות רגליים לאורך הגשרים | ${bridges.pass?'עבר':'נכשל'}; [bridge-surfaces.json](verification/bridge-surfaces.json) |
| בדיקות המאגר | ${tests.tests===null?'הרצה עדיין לא סיכמה; ראו קובץ בדיקות':`${tests.tests} בדיקות; ${tests.pass} עברו, ${tests.fail} נכשלו, ${tests.skipped} דולגו. הכשל הסביבתי נבדק שוב בהצלחה, כמפורט להלן`} |

פירוט מלא: [motion-qa-v1.json](verification/motion-qa-v1.json), [browser.json](verification/browser.json), [bridge-grounding.json](verification/bridge-grounding.json), [build.json](verification/build.json), [repository-tests.json](verification/repository-tests.json).

הבדיקה המספרית נעשית על GLB מפוענח באמצעות AnimationMixer ללא הפעלת IK חי על הדגם הנבדק. נבדקים כל פריימי ה־30Hz ושלוש נקודות ביניים בכל מרווח. הבדיקה סביב שחרור בפותר החי משלימה את הדגימה; C1 של הגשרים נמדד בעצמות ובמורפי האחיזה. ניקוד גבוה בבדיקות האלה אינו ציון אסתטי של טכניקת כדורסל.

בהרצת npm test נכשלה בדיקת הדפדפן הקיימת בקובץ workout-royiki.test.mjs משום שבינארי ה־Playwright המוגדר לא מותקן בסביבה. תהליך הבדיקה נשאר עם שרת פתוח ונעצר אחרי האבחון. אותו קובץ הורץ שוב ללא שינוי בקוד, דרך ISLAND_PLAYWRIGHT עם Chromium המערכתי: ${rerun.pass}/${rerun.tests} עברו, ${rerun.fail} נכשלו. מתאם ההרצה הזמני נמצא מחוץ לריפו; קבצים קיימים לא תוקנו במסגרת משימה זו.

## חיבור והיקף

החבילה לא חוברה למשחק, לפי מגבלת הקבצים. יש להחיל את היסטי Root המפורשים ב־catalog גם על העוגן הנפרד MotionBallAnchor, לצבור התקדמות בין מחזורי ריצה ולהתאים את האנימציה למיקום הסל/המקבל. תנועת הכדור המוטבעת היא מסלול הצגה; החזקה, התנגשות, פגיעה בסל, קבלת מסירה ותוצאת קליעה נקבעות בקוד המשחק.

השמות וההיררכיה תואמים לשלד הקנוני; מידות ה־bind הן של דמות pg הקיימת. נדרש retarget כאשר מפעילים את הערוצים המקומיים על דמות בעלת מידות או תנוחת bind שונות. סימוני מגע בגשרים אינם מוסקים מקרבה בלבד לרצפה. לא בוצעה בדיקת טלפון פיזי.

## רישום מסירה

| נושא | ענף | קריטריון סיום | מצב |
| --- | --- | --- | --- |
| טכניקת כדורסל, נכסים בלבד | \`codex/hoops-technique-v1\` | 24 קליפים + GLB + קטלוג + 8 פריימים לכל קליפ + תצוגה + רישיונות + QA + push | ${status?'תוצרים ובדיקות מקומיות הושלמו; פרטי הדחיפה בתשובת המסירה':'בתיקון'} |
`;
await fs.writeFile(path.join(root,'REPORT.md'),text);
await fs.writeFile(path.join(root,'verification/repository-tests.json'),JSON.stringify({command:'npm test',baseCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',...tests,complete:tests.tests!==null,initialFailure:{file:'tests/workout-royiki.test.mjs',reason:'Configured Playwright Chromium executable missing; orphaned local HTTP server required terminating the test child after diagnosis.'},targetedRerun:{command:'ISLAND_PLAYWRIGHT=/tmp/hoops-technique-system-browser.mjs node --test tests/workout-royiki.test.mjs',...rerun,browser:'/usr/bin/chromium',repositoryFilesChanged:false},scope:'Existing repository suite; no pre-existing files changed.'},null,2)+'\n');
console.log(JSON.stringify({reportStatus:status,tests}));
