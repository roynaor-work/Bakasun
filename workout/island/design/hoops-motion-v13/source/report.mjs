// SPDX-License-Identifier: CC0-1.0
// Build a reviewable handoff directly from the committed measurements.
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
const [requirements,transitions,pack,catalog]=await Promise.all(['verification/requirements.json','verification/transitions.json','verification/pack.json','runtime/catalog.json'].map(read));
const browser=await read('verification/browser.json');
const playback=await read('verification/playback.json');
const table=requirements.checks.map(c=>{const m=catalog.clips.find(m=>m.id===c.id);const ev=[...new Set((m.events??[]).map(e=>e.type??e.name))].join(', ')||'—';return `| ${c.id} | ${c.score.toFixed(1)} | ${(c.maxStanceDriftMeters*1000).toFixed(2)} | ${ev} | [8 פריימים](verification/sheets/${c.id}.png) |`;}).join('\n');
const minimum=requirements.minimumScore,mean=requirements.checks.reduce((s,c)=>s+c.score,0)/requirements.clips;
const summary=transitions.summary;
const matchingCaptures=catalog.clips.every(c=>browser.clipsLoaded?.some(b=>b.id===c.id&&b.glbSha256===c.sha256&&b.frames?.length===8));
const matchingPlayback=playback.passed&&playback.glbSha256===catalog.clips.find(c=>c.id==='run').sha256;
const passed=requirements.passed&&summary.allPassed&&pack.passed&&browser.passed&&browser.clipCount===32&&browser.framesPerSheet===8&&matchingCaptures&&matchingPlayback&&browser.sharedModelSha256===catalog.sharedModel.sha256;
if(!passed)throw Error('Finish the measured motion requirements before generating the handoff report.');
const report=`# כדורסל — תנועה טבעית v13

חבילת סקירה בענף \`codex/hoops-motion-v13\`, מבוססת על \`main\` בקומיט \`19d9cdc5e3718236df5a2fc4d8b8c26c72007575\`. כל התוספות נמצאות בתיקייה זו בלבד. **32 קליפים מלאים ב־24 משפחות**, שלד קנוני של 18 עצמות, 30Hz, ללא Draco. כל השמות בבקשה מכוסים, כולל idle עם כדור ובלעדיו. המספר 24 בבקשה אינו תואם את הפירוט; לא הושמטה פעולה כדי להתאים אליו.

[תצוגה חיה](preview.html) · [QA מדורג](verification/qa/report.html) · [כל הדרישות והראיות](verification/requirements.json) · [רישיונות](LICENSES.md)

## תוצאה מדודה

| תנאי | תוצאה |
|---|---|
| ציון בכלי המקורי motion-qa-v1 | מינימום **${minimum.toFixed(1)}**, ממוצע **${mean.toFixed(1)}**, כל ${requirements.clips} הקליפים ≥88 |
| מדדים אדומים | **${requirements.redMetrics}** |
| מדדי QA ישימים | כיסוי מלא בכל קליפ; ללא נתונים חסרים במסך הציון |
| החלקת רגל נטועה | מרבית **${(requirements.maxStanceDriftMeters*1000).toFixed(2)} מ״מ**, לעומת רף 20 מ״מ; נבדק מרחק תלת־ממדי בעולם ולא רק מהירות RMS |
| שלד וקצב | 18 שמות/הורים/מיקומי מנוחה תואמי athletes-core; ערוצי GLB אמיתיים ב־30Hz |
| ATHLETE_STANDARD | כל בדיקות העמידה והריצות הישימות עברו: זרועות נגדיות, טווח נדנוד, מרפקים ונטייה לפי מהירות |
| רציפות idle/run | ${summary.passed}/${summary.bridges} גשרים עברו C0/C1, כולל קטיעת מעבר; ${summary.nativeHandoffsPassed}/${summary.nativeHandoffs} חיבורי האצה/עצירה ישירים עברו |
| קידוד tall v12 | ${pack.clips} קליפים עברו בדיקת round-trip; שגיאת אגן מרבית ${(pack.maxHipsQuantizationMeters*1000).toFixed(3)} מ״מ |
| תצוגה | גיליון רינדור 8 פריימים לכל קליפ, צילום מחשב ונייד, ראיות ב־browser.json |

ה־QA נקרא מהקומיט הקבוע \`${requirements.qaCommit}\`. \`measure.mjs\` מפעיל את \`workout/island/design/motion-qa-v1/run.mjs\` המקורי בתיקייה זמנית. רק inventory הקלט מוחלף באמצעות Node hook; הרץ, המדדים והספים נשארים ללא שינוי. SHA-256 של קובצי הכלי ושל הנכסים נרשמים בדוח. הרפרנס soccer-locomotion-v2 נקרא מהקומיט \`ec6c73949fb5820826b4c082972f5d4f1136641f\`, משום ששתי התיקיות אינן קיימות בבסיס main זה.

## מה השתנה בתנועה

הריצות משתמשות בצעדים שמתחילים מעוגני תמיכה בעולם, עם התאוששות כף רגל, תנועה נגדית של הזרועות ונטייה גוברת לפי המהירות. העמידות כוללות נשימה והעברת משקל. פניות, חיתוך וצעדי הגנה משמרים חלונות תמיכה, וכל כדרור כולל מסלול כדור ו־bounce ברצפה. במסירות ובקליעות יש שחרור, ובחסימה ובחטיפה מגע מתוזמן. הקליעות כוללות הכנה ברגליים, ניתור כשנדרש, המשך תנועת שורש כף היד ונחיתה עם ספיגה.

הגשרים מספקים רציפות פוזה ומהירות בין כל קליפ ל־idle ול־run. המדידה נעשית מה־FLOAT accessors הסופיים של ה־GLB, ולא רק מפוזות המקור. [פירוט כל המעברים](verification/transitions.json).

## כל הקליפים

החלקה בטבלה היא הסטייה המרחבית המרבית לאורך חלון תמיכה מוצהר. האירועים נמדדים בזמנם המדויק. גיליונות התמונה מרנדרים את אותו GLB שממנו מופקים המדדים.

| קליפ | ציון | החלקה מרבית, מ״מ | אירועים | גיליון |
|---|---:|---:|---|---|
${table}

## תצוגה וביקורת

![תצוגת מחשב](verification/preview-desktop.png)

[תצוגת נייד](verification/preview-mobile.png) · [ראיות דפדפן](verification/browser.json) · [תנועת מפרקים בזמן ניגון אמיתי](verification/playback.json) · [מקור והתאמת דמות הכדורסל](verification/model-provenance.json)

הדמות היא נכס כדורסל בדיוני CC0 קיים. הטופולוגיה, המרקם ומשקלי העור נשמרו; פוזת המנוחה הותאמה לשלד הקנוני. המודל משותף ל־32 קליפי אנימציה, ולכן אין שכפול mesh בכל GLB. אנימציות התצוגה אינן דמויות שמצוירות בקוד.

## חיבור ומגבלות

- זו חבילת נכסים וסקירה; קוד המשחק הקיים לא השתנה. מיזוג ה־PR וחיבור למשחק הם שלבים נפרדים.
- מבנה \`runtime/motion.json\` תואם לקידוד tall v12, אך פרופיל החבילה הוא \`canonical\`. שלושת הגופים המקוריים guard/wing/center דורשים retargeting לפרופורציותיהם; לא נטען שנבדקו כאן. יש להשתמש ב־reference/athlete.glb המצורף כדי לקבל את הפוזות שנמדדו.
- Root נשאר באפס. מסלול השחקן והכיוון מוחלים פעם אחת דרך \`referenceTravel\`. במשחק יש להתאים תנועה, מהירות וקצב לאותו תרחיש. גשר C1 לבדו אינו מבטיח נעילת רגל בזמן מסלול שרירותי; החיבור צריך לשמר עוגני תמיכה עד ההרמה.
- קידוד Int16 של כדור מיועד לעמידה עם כדור ולכדרורים. מסלולי שחרור ומגע הגנתי נשמרים במלואם ב־motions/catalog, ו־ball:null ב־motion.json מונע גלישת טווח בקידוד; הסימולציה אחראית למעוף אחרי האירוע.
- ציון QA הוא אבחון הנדסי של שלד ונקודות מגע מוצהרות. הוא אינו בדיקת כל קודקודי הנעל, תפיסה אנושית, התנגשות גוף־כדור או מכשיר טלפון אמיתי. הבדיקה הוויזואלית נעשתה בדפדפן ממוחשב.

## שחזור

\`\`\`sh
node workout/island/design/hoops-motion-v13/source/build.mjs
node workout/island/design/hoops-motion-v13/measure.mjs
node workout/island/design/hoops-motion-v13/source/verify-transitions.mjs
node workout/island/design/hoops-motion-v13/source/verify-pack.mjs
node workout/island/design/hoops-motion-v13/source/capture.mjs
node workout/island/design/hoops-motion-v13/source/report.mjs
\`\`\`

כל הנכסים והתוספות מקוריים או CC0 עם מקור מפורש. אין שינוי בקובץ קיים, ב־release.json, בתגי גרסה, ב־CLAUDE.md, ב־ops או בבדיקות המאגר.
`;
await writeFile(new URL('REPORT.md',base),report);
console.log(JSON.stringify({report:'REPORT.md',clips:requirements.clips,minimumScore:minimum,redMetrics:requirements.redMetrics,stanceDriftMeters:requirements.maxStanceDriftMeters,passed,browserEvidence:!!browser}));
