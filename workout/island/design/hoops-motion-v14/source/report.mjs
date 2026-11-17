// SPDX-License-Identifier: CC0-1.0
// Generate the Hebrew handoff from measured final GLBs and browser evidence.
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
const [r,t,p,c,b,play,regression]=await Promise.all(['verification/requirements.json','verification/transitions.json','verification/pack.json','runtime/catalog.json','verification/browser.json','verification/playback.json','verification/regression.json'].map(read));
const matched=c.clips.every(e=>b.clipsLoaded?.some(x=>x.id===e.id&&x.glbSha256===e.sha256&&x.frames?.length===8));
if(!(r.passed&&r.sourceMotionSha256===c.sourceMotionSha256&&t.summary.allPassed&&p.passed&&b.passed&&play.passed&&regression.passed&&c.clips.length===20&&b.clipCount===20&&b.framesPerSheet===8&&matched&&b.sharedModelSha256===c.sharedModel.sha256))throw Error('Final evidence incomplete or stale; finish required checks first.');
const mean=r.checks.reduce((sum,x)=>sum+x.score,0)/r.checks.length;
const regressionNote=regression.rerun?'בסוויטת המאגר 4,017 בדיקות עברו ו־64 דולגו; בדיקת דפדפן קיימת אחת נתקעה מפני שבינארי Chromium ברירת המחדל של Playwright חסר, והבדיקה השאירה שרת פתוח כשפתיחת הדפדפן נכשלה. לאחר אבחון הופסק העובד התקוע, וקובץ הבדיקה הורץ מחדש ללא שינוי מול Chromium המותקן: 5/5 עברו, כולל הבדיקה שנתקעה. התוצאה המאוחדת היא 4,018 שעברו ו־64 דילוגים. פרטי ההרצה המקורית והחוזרת והחתימות נשמרים ב־[regression.json](verification/regression.json).':'';
const table=r.checks.map(x=>{const e=c.clips.find(e=>e.id===x.id);return `| ${e.label} — \`${x.id}\` | ${x.score.toFixed(1)} | ${(x.maxStanceDriftMeters*1000).toFixed(2)} | [8 פריימים](verification/sheets/${x.id}.png) |`;}).join('\n');
const heights=c.clips.flatMap(e=>(e.events??[]).filter(x=>['contact','release','rim_contact','assist_contact'].includes(x.type)).map(x=>`| ${e.id} | ${x.type} | ${x.time.toFixed(3)} | ${x.bone??'—'} | ${(x.heightMeters??x.position?.[1]??0).toFixed(3)} |`)).join('\n');
const text=`# ספריית תנועות כדורסל v14

**20 קליפים חדשים ב־30Hz על השלד הקנוני בן 18 עצמות**, מעל [v13 בקומיט f97bf53b](https://github.com/roynaor-work/Bakasun/commit/f97bf53bf2a933c2a5411fa542aeee02d7059156), בענף \`codex/hoops-motion-v14\`. כל השינויים הם קבצים חדשים בתוך \`workout/island/design/hoops-motion-v14/\`.

[תצוגה 844×390](preview.html) · [קטלוג](catalog.json) · [דוח QA](verification/qa/report.html) · [ראיות מלאות](verification/requirements.json) · [רישיונות](LICENSES.md)

## תוצאות

| דרישה | תוצאה מדודה |
|---|---|
| motion-qa-v1, כל קליפ מעל 88 | מינימום **${r.minimumScore.toFixed(1)}**, ממוצע **${mean.toFixed(1)}**; 20/20 עברו |
| החלקת כף רגל מתחת ל־2 ס״מ | מרבית **${(r.maxStanceDriftMeters*1000).toFixed(2)} מ״מ**; נמדד מרחק תלת־ממדי לאורך כל חלון תמיכה |
| שלד וקצב | שמות, הורים ומנוחה קנוניים; ערוצי FLOAT אמיתיים ב־GLB ב־30Hz |
| C1 לעמידה ולריצה | **${t.summary.passed}/${t.summary.bridges}** גשרים עברו, כולל קטיעה באמצע מעבר |
| קידוד compact | ${p.clips}/20 קליפים עברו round-trip; שגיאת אגן מרבית ${(p.maxHipsQuantizationMeters*1000).toFixed(3)} מ״מ |
| גיליונות | 20 גיליונות × 8 פריימים מה־GLB שנמסרים; SHA-256 תואם לקטלוג |
| בדיקת דפדפן | תצוגת 844×390, ניגון מפרקים אמיתי וגשרי idle/run; ללא שגיאות |
| בדיקות מאגר | ${regression.passedTests} עברו, ${regression.failedTests} נכשלו, ${regression.skippedTests} דולגו |

${regressionNote}

כלי motion-qa-v1 מחולץ מהקומיט הקבוע \`${r.qaCommit}\`. הרץ, נוסחאות המדדים והספים נשארים ללא שינוי; מתאם inventory מחבר אליו את קובצי v14. שני קליפי העמידה והריצה של v13 משמשים כרפרנס בלבד ומסומנים \`sourceReference\` בתוצאת הכלי המקורית; הם אינם חלק מ־20 קליפי המסירה. ציוני החבילה נמדדים על GLB סופיים ב־120Hz. מספר המדדים האדומים המקוריים: **${r.redMetrics}** — השוואת קצות שלבי העונשין לעמידה רגילה. פוזות ביניים אלה שייכות לרצף העונשין, וחיבוריהן הישירים נבדקו בנפרד ב־C0/C1; ציוני הכלי המקורי נשמרו ללא תיקון כלפי מעלה.

## הקליפים

כל לייאפ מכיל גישה, ניתור וסיומת מלאה. העונשין מחולק להכנה, שחרור והמשך תנועה; שלושת השלבים נועדו להתנגן ברצף. שתי ההטבעות, שתי החסימות ושלוש המסירות הן קליפים נפרדים.

| קליפ | ציון | החלקה מרבית במ״מ | גיליון |
|---|---:|---:|---|
${table}

## מגעים לפי גובה

סימוני כדור וטבעת נפרדים. לכל אירוע בעל עצם יש נקודת מגע מקומית, מיקום בעולם ו־\`heightMeters\` ביחס לרצפה y=0; הטבעת מסומנת בגובה 3.05 מ׳. מגע רצפה בכדרור מסומן בגובה 0, ומרכז הכדור נשמר בנפרד בגובה רדיוסו. הנתונים נמצאים גם ב־\`contactMarkers\` ובתצוגה.

| קליפ | אירוע | זמן בשניות | עצם | גובה מגע במטרים |
|---|---|---:|---|---:|
${heights}

## תצוגה ואימות

![תצוגת 844×390](verification/preview-844x390.png)

[בדיקות דפדפן](verification/browser.json) · [ניגון מפרקים](verification/playback.json) · [מעברי C1 וחיבורי העונשין](verification/transitions.json) · [קידוד](verification/pack.json) · [מקור הדמות](verification/model-provenance.json)

הדמות היא נכס כדורסל בדיוני CC0 קיים, עם אותה התאמת מנוחה קנונית כמו v13. קובץ הדמות משותף לכל האנימציות; ה־GLB של הקליפים מכיל ערוצי שלד ללא שכפול mesh וללא דחיסה.

## חיבור ושחזור

\`catalog.json\` בשורש החבילה מכיל נתיבי נכסים יחסיים לשורש; \`runtime/catalog.json\` מכיל אותם נתונים עם נתיבים יחסיים ל־runtime. \`runtime/motions.json\` שומר פוזות מלאות, מסלולי כדור ואירועים; \`runtime/motion.json\` מכיל קידוד tall v12 בפרופיל canonical. Root נשאר באפס, והתנועה והכיוון בעולם מוחלים פעם אחת דרך \`referenceTravel\`. גשר C1 מבטיח רציפות פוזה ומהירות; בעת חיבור למשחק יש לשמר עוגני רגל עד ההרמה.

\`runtime/player.mjs\` מספק \`makeClipBridge\`, \`interruptBridge\` ו־\`eventsBetween\`, באותו חוזה כמו v13. הפניות idle/run מגיעות מהתיקייה הקיימת של v13. שינוי פרופורציות לדגמי guard/wing/center דורש retargeting; המדידה כאן מתייחסת לשלד הקנוני ולדמות המצורפת.

הסימולציה אחראית למעוף אחרי שחרור ולמשתתף השני בעזרה לקום. זהו אימות נכסים בדפדפן ממוחשב, ולא בדיקת חיבור במשחק או במכשיר טלפון. בדיקות המגע וההחלקה מודדות סמנים מוגדרים בשלד, ולא כל קודקוד בנעל או התנגשות mesh מלאה.

\`\`\`sh
node workout/island/design/hoops-motion-v14/source/build.mjs
node workout/island/design/hoops-motion-v14/measure.mjs
node workout/island/design/hoops-motion-v14/source/verify-transitions.mjs
node workout/island/design/hoops-motion-v14/source/verify-pack.mjs
node workout/island/design/hoops-motion-v14/source/capture.mjs
node workout/island/design/hoops-motion-v14/source/regression.mjs
node workout/island/design/hoops-motion-v14/source/report.mjs
\`\`\`

לפי ההוראה המפורשת של המשימה לא נערכו קבצים קיימים, לרבות ops/CONTROL.md, גרסאות, קוד משחק ותלויות. קריטריון הסיום: 20 GLB, קטלוג, גיליונות, תצוגה, רישיונות ודוח, QA מעל 88 והחלקה מתחת ל־20 מ״מ, ודחיפה לענף החדש.
`;
await writeFile(new URL('REPORT.md',base),text);
await writeFile(new URL('README.md',base),'# hoops-motion-v14\n\n[דוח ותוצאות](REPORT.md) · [תצוגת 844×390](preview.html) · [קטלוג 20 קליפים](catalog.json) · [רישיונות](LICENSES.md)\n');
console.log(JSON.stringify({clips:20,minimumScore:r.minimumScore,meanScore:mean,maxSlipMeters:r.maxStanceDriftMeters,bridges:t.summary.bridges,passed:true}));
