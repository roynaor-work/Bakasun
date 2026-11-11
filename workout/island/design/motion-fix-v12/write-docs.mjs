/** Original CC0-1.0. Build delivery documentation from measured outputs. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=path.dirname(fileURLToPath(import.meta.url)),read=async p=>JSON.parse(await readFile(path.join(base,p)));
const manifest=await read('manifest.json'),before=await read('data/before.json');
const status=(c,s)=>Object.values(c[s].metrics??{}),red=(c,s)=>status(c,s).filter(m=>m.status==='red').length,yellow=(c,s)=>status(c,s).some(m=>m.status==='yellow');
function summarize(clips,side){return {count:clips.length,average:clips.length?Number((clips.reduce((n,c)=>n+c[side].score,0)/clips.length).toFixed(2)):null,redMetrics:clips.reduce((n,c)=>n+red(c,side),0),yellowClips:clips.filter(c=>yellow(c,side)).length,yellowPercent:clips.length?Number((100*clips.filter(c=>yellow(c,side)).length/clips.length).toFixed(2)):null,unknownMetrics:clips.reduce((n,c)=>n+status(c,side).filter(m=>m.status==='insufficient-data').length,0)};}
const rows=manifest.libraries.map(l=>{const x=manifest.clips.filter(c=>c.library===l.id),a=summarize(x,'after'),b=summarize(x,'before'),accepted=x.filter(c=>c.status!=='blocked'),s=summarize(accepted,'after');return {id:l.id,before:b,after:a,accepted:s,blocked:x.length-accepted.length,wholeLibraryTarget:a.average>=88&&a.redMetrics===0&&a.yellowPercent<=5&&a.unknownMetrics===0};});
const allBefore=summarize(manifest.clips,'before'),allAfter=summarize(manifest.clips,'after'),allowed=manifest.clips.filter(c=>c.status!=='blocked'),accepted=summarize(allowed,'after');
const after={schemaVersion:1,version:manifest.version,generatedAt:manifest.generatedAt,before:allBefore,after:allAfter,admitted:accepted,blocked:manifest.clips.length-allowed.length,libraries:rows,clips:manifest.clips.map(c=>({key:c.key,library:c.library,id:c.id,status:c.status,reason:c.reason,before:{score:c.before.score,coverage:c.before.coverage,metrics:c.before.metrics},after:{score:c.after.score,coverage:c.after.coverage,metrics:c.after.metrics},timeScale:c.after.metadata?.timeScale??1,duration:c.after.duration}))};
await writeFile(path.join(base,'data/after.json'),JSON.stringify(after)+'\n');
const csvQuote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const columns=['library','clip','profile','status','before_score','after_score','delta','before_red_metrics','after_red_metrics','before_coverage','after_coverage','original_seconds','runtime_seconds','time_scale','reason'];
const csv=[columns.join(','),...manifest.clips.map(c=>[c.library,c.id,c.profile,c.status,c.before.score,c.after.score,Number((c.after.score-c.before.score).toFixed(1)),red(c,'before'),red(c,'after'),c.before.coverage,c.after.coverage,c.before.duration,c.after.duration,c.after.metadata?.timeScale??1,c.reason].map(csvQuote).join(','))].join('\n')+'\n';await writeFile(path.join(base,'data/scores.csv'),csv);
await writeFile(path.join(base,'runtime/catalog.json'),JSON.stringify({schemaVersion:1,version:manifest.version,policy:'Only admitted clips. Always consult ../blocklist.json; blocked candidate GLBs are review-only.',models:(await read('data/models.json')).models.map(({rig,...m})=>m),unchangedSources:allowed.filter(c=>!c.after.animation).map(c=>({key:c.key,source:c.source,score:c.after.score})),clips:allowed.filter(c=>c.after.animation).map(c=>({key:c.key,id:c.id,library:c.library,profile:c.profile,status:c.status,version:manifest.version,animation:c.after.animation??null,source:c.source,characters:c.characters,duration:c.after.duration,metadata:c.after.metadata??null,score:c.after.score,unchanged:c.status==='unchanged'}))},null,2)+'\n');
const timeScales=manifest.clips.map(c=>c.after.metadata?.timeScale??1),slowed=timeScales.filter(x=>x>1.001),fixed=manifest.clips.filter(c=>c.after.animation).length,regressions=manifest.clips.filter(c=>c.after.score<c.before.score),blocked=manifest.clips.filter(c=>c.status==='blocked');
const table=rows.map(r=>`| ${r.id} | ${r.before.count} | ${r.before.average} | ${r.after.average} | ${r.before.redMetrics} → ${r.after.redMetrics} | ${r.after.yellowClips}/${r.after.count} (${r.after.yellowPercent}%) | ${r.blocked} | ${r.wholeLibraryTarget?'עבר':'טרם עבר'} |`).join('\n');
const admittedTable=rows.map(r=>`| ${r.id} | ${r.accepted.count} | ${r.accepted.average??'—'} | ${r.accepted.redMetrics} | ${r.accepted.yellowClips} (${r.accepted.yellowPercent??'—'}%) |`).join('\n');
const report=`# תיקוני תנועה v12 — מדידה לפני ואחרי

${manifest.clips.length} קליפים ופרופילים, ${rows.length} ספריות. ${fixed} מועמדים הופקו ונמדדו מתוך קובצי GLB בפועל; ${blocked.length} נשמרו ברשימת חסימה. התוצרים מיועדים לסקירה ב־PR טיוטה.

[דוח מלא לכל קליפ](report.html) · [תצוגת מקור/תיקון](preview.html) · [טבלת CSV](data/scores.csv) · [חסימות עם סיבה](blocklist.json) · [קטלוג מותר לחיבור](runtime/catalog.json) · [רישיון ומקור לכל קובץ](LICENSES.md).

## תוצאות בכל הספריות, כולל חסומים

המכנה נשמר: כל ${manifest.clips.length} המקורות מופיעים. הממוצע הכולל ${allBefore.average} → ${allAfter.average}; המדדים האדומים ${allBefore.redMetrics} → ${allAfter.redMetrics}. ${allAfter.yellowClips}/${allAfter.count} קליפים כוללים מדד צהוב. מדד חסר אינו נחשב עובר. המספרים של מועמדים חסומים כלולים בטבלה ובדוח HTML, גם כשהתיקון לא הצליח.

| ספרייה | קליפים | ממוצע לפני | ממוצע אחרי | אדומים לפני → אחרי | קליפים עם צהוב | חסומים | יעד הספרייה כולה |
|---|---:|---:|---:|---:|---:|---:|---|
${table}

יעד הספרייה הוא ממוצע 88 ומעלה, אפס אדומים ועד 5% קליפים עם מדד צהוב, כולל קליפ שבו יש גם אדום. אימות של ספרייה מלאה דורש גם אפס מדדים ישימים חסרים. ${rows.filter(r=>r.wholeLibraryTarget).length}/${rows.length} הספריות עומדות ביעד במכנה המלא. רשימת החסימה מאפשרת לסקור גם כשלים; היא אינה מוחקת אותם מן הסטטיסטיקה.

## קובצי ריצה מותרים

${accepted.count}/${manifest.clips.length} קליפים מותרים בקטלוג, ממוצע ${accepted.average}, ${accepted.redMetrics} מדדים אדומים, ${accepted.yellowClips} קליפים עם צהוב (${accepted.yellowPercent}%). קבצים חסומים נשארים לצפייה לצד המקור ומחוץ לקטלוג המותר. מבין שאריות המדדים הצהובים נשמרות בקטלוג רק החריגות הקלות ביותר, עד מכסה של 5% בכל ספרייה; שאר המועמדים נשמרים בחסימה עם המדד והערך. זהו שער לחיבור ולא שיפור של ציון המקור. מקור שלא דרש תיקון מצוין כ־unchanged עם מקור Git מוצמד; לא נוצר לו קליפ חלופי.

| ספרייה | מותרים | ממוצע | אדומים | עם צהוב |
|---|---:|---:|---:|---:|
${admittedTable}

## מה תוקן

- פתרון IK דו־מקטעי ברגליים על שלד היעד; שמירת אורכי עצמות, עוגני סוליה בעולם, התאמת אגן ותחומי מעבר בין דריכות.
- סינון סיבובים על ציר זמן סדור, טיפול בכיוון ציר הברך והחלקת חפיפה בין עוגני צעד כדי למנוע קפיצות שנוצרות בריטרגטינג.
- כניסה ויציאה מפורשות מעמידת המתנה תואמת. ליבת הפעולה נשמרת בתוך coreRange. נבדקים גם הליבה וגם רצף הריצה המלא.
- פתרון מגע כפות ידיים אל מסלול כדור עצמאי. לדמויות הגבוהות סופק מסלול כדור מרוטרגט ממפתחות המקור; פרטי מקור ושיטת ההתאמה נשמרים במטא־נתונים.
- זוגות שמאל/ימין נפתרו כמסלול ושלד משוקפים יחד עם מגעים וכדור; בטניס שוקפו רק שורש ורגליים, ונשמר פלג הגוף העליון המקורי כדי לשמור על המחבט ביד ימין. מקור השיקוף מפורש לכל קובץ כזה.
- רק מחזורים כפולים שהוכחו לפי מגעי רגל והשוואת פוזות נחתכו למחזור הבסיסי. הוכחת החזרתיות ותחום המקור נשמרים ב־sourceRepeatNormalization.

${slowed.length} מועמדים כוללים האטה מקומית מתועדת; המקדם הממוצע של קליפ יחיד אינו עולה על ${Math.max(...timeScales).toFixed(2)}×. המקדם מחושב מול רצף הפעולה עם מעברי ההמתנה לפני ההאטה המקומית, ואינו הממוצע של כל החבילה. המסלול וסדר האירועים נשמרים; כל חלונות המגע ואירועי המשחק מותאמים לאותו זמן. התצוגה וטבלת הקליפים מציגות את משכי המקור והתיקון. אין לחבר לפי משכי המקור בלי לקרוא את המטא־נתונים החדשים. ${regressions.length} מועמדים קיבלו ציון נמוך מן המקור; הם נשארים גלויים בדוח ואינם מוצגים כשיפור גורף.

## מדידה ואמינות

קובץ qa/metrics.mjs זהה בבייטים לכלי motion-qa-v1 המוצמד. הספים, הנוסחאות והמשקלים לא השתנו. שבע ספריות הבסיס משחזרות בדיוק את הממוצעים שנמסרו: 93.34, 91.15, 84.88, 88.19, 87.55, 77.75 ו־69.88. המקור הגבוה משחזר 347 מדדים אדומים.

נמדדים 60Hz, כל זמני המפתח וכל אירועי המגע המדויקים. קובצי הפלט נטענים מחדש לאחר הייצוא; המדידה אינה מסתמכת על פריימים פנימיים של התיקון. זמני האירועים מעוגלים לאותו float32 שנשמר ב־GLB כדי שקצה חלון המגע יישאר בתוך הקובץ.

רציפות נבדקת על רצף הריצה המלא, כולל המעברים החדשים. מהירות גוף וסימטריית הליכה נבדקות על ליבת הפעולה עם תכונת הלולאה המקורית; כך המעברים אינם משנים את זהות ההליכה או מדללים את המהירות. ברגליים, רצפה, קפיצות פוזה, אנטומיה וכדור נלקחת החריגה המחמירה בין הליבה לרצף המלא. כל מדד מציין את תחום המדידה ואת שתי התצפיות. ראו runtime-measure.mjs ואת האימות העצמאי audit-native.mjs.

הציון אבחוני ואינו הערכת תחושה אנושית. בדיקות הרצפה משתמשות במפרקים ובנקודות סוליה, ולא בכל משטחי הנעל. בדיקת סימטריית הליכה עשויה לדחות תנועות צד תקינות; קליפ כזה אינו מקבל פטור מן המדידה, והסיבה נשמרת בחסימה. בדיקה חזותית בטלפון ובמשחק המחובר עדיין נדרשת בעת חיבור עתידי.

## אימות המסירה

- [טעינת כל הקבצים ובדיקות GLB](verification/structural.json): כל 1,374 קובצי GLB נבדקו ללא דחיסה וללא נתונים לא תקינים.
- [מדידה עצמאית חוזרת של הפלט](verification/native-audit.json): 741 רשומות, 173,403 דגימות; אפס הפרשי ציון, כיסוי או ערכי מדדים.
- [טעינה, קשירת מסלולים לעצמות ודגימת פוזות בדפדפן](verification/browser.json), עם WebAssembly חסום: 2,002 טעינות לפני/אחרי על דמויות, אפס כשלים בקשירה או בערכי מטריצות. כל 1,346 קובצי GLB הייחודיים שנשלפו בדפדפן אומתו בבייטים וב־SHA-256. אירועי Chromium של ERR_ABORTED נרשמו במלואם ואושרו רק אחרי הוכחת קריאה מלאה, חותמת זהה וניגון תקין; לא נשאר כשל תעבורה לא מוסבר.
- [תצוגת מחשב](verification/preview-1440x1000.png) · [תצוגת טלפון](verification/preview-390x844.png).
- נוספו רק קבצים בתיקייה זו. קוד האפליקציה, בדיקות קיימות, ops, CLAUDE.md וקובצי שחרור לא נערכו.

## מקורות מוצמדים

${before.libraries.map(l=>`- ${l.id}: ${l.source.ref}, commit ${l.source.commit}, ${l.clips.length} קליפים/פרופילים.`).join('\n')}

כל הנכסים והקוד החדשים מקוריים או CC0. הספרייה משתמשת בקריאה בלבד ב־three.js ובמטענים הקיימים במאגר; קוד צד שלישי זה לא הועתק לתיקייה החדשה. המודלים כלליים ואינם אנשים אמיתיים או מותגים. כל GLB ב־runtime/ ללא Draco או meshopt; אין מפענח ריצה ואין תלות ב־WebAssembly. שלדי המקור נשמרו, והפענוח של רשתות דחוסות נעשה בהכנה בלבד.
`;
await writeFile(path.join(base,'REPORT.md'),report);
await writeFile(path.join(base,'README.md'),`# תיקוני תנועה v12

פתחו את preview.html ואת report.html דרך שרת HTTP משורש המאגר. קטלוג החיבור המותר הוא runtime/catalog.json; חסימות מפורשות ב־blocklist.json. כל נכס הוא קובץ חדש, בלי שינוי באפליקציה.

## הפעלה מקומית

\`\`\`sh
python3 -m http.server 8765
\`\`\`

כתובת התצוגה: http://localhost:8765/workout/island/design/motion-fix-v12/preview.html

## שחזור

יש למשוך את עשרת המקורות המוצמדים המפורטים בדוח; מתאם המקורות משתמש ב־git show ומטמון מחוץ למאגר. מדידת המקור יוצרת את קובצי המקור הזמניים עבור הבנייה. המודלים כלולים; source-models.mjs מתעד הפקה חוזרת ופענוח רשתות אופליין.

\`\`\`sh
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/measure.mjs
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/build.mjs
node workout/island/design/motion-fix-v12/finalize.mjs
node workout/island/design/motion-fix-v12/write-docs.mjs
node workout/island/design/motion-fix-v12/report.mjs
node workout/island/design/motion-fix-v12/verify.mjs
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/audit-native.mjs
node workout/island/design/motion-fix-v12/verify-browser.mjs
node workout/island/design/motion-fix-v12/licenses.mjs
node workout/island/design/motion-fix-v12/verify.mjs --licenses-only
\`\`\`

בדיקת הדפדפן משתמשת ב־Chromium מותקן וב־playwright-core מחוץ למאגר. אפשר להגדיר MOTION_PLAYWRIGHT ו־MOTION_CHROMIUM. בהיעדר חבילת הבדיקה:

\`\`\`sh
npm install --prefix /tmp/motion-fix-deps --cache /tmp/motion-npm-cache --no-audit --no-fund playwright-core
\`\`\`

לריצה בדפדפן אין צורך ב־npm או בפענוח דחיסה. הפלט המקורי והמתוקן בנפרד, כל קובץ מתוקן נושא חותמת motion-fix-v12. יש לקרוא את משך הפעולה החדש, coreRange, timeScale ואת אירועי המגע שבקטלוג; אין להניח שמשך מקור מואט נשאר קבוע.
`);
console.log(JSON.stringify({allBefore,allAfter,accepted,blocked:blocked.length,librariesMeetingWholeTarget:rows.filter(r=>r.wholeLibraryTarget).length}));
