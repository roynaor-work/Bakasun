// SPDX-License-Identifier: CC0-1.0
// Generate delivery documentation only from final measured/captured assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(base,'../../../..');
const read=async relative=>JSON.parse(await fs.readFile(path.join(base,relative),'utf8'));
const catalog=await read('runtime/catalog.json');
const requirements=await read('verification/requirements.json');
const transitions=await read('verification/transitions.json');
const browser=await read('verification/browser.json');
const existingChecks=await read('verification/checks.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};

requireThat(requirements.passed,'Generate REPORT.md only after the required QA checks pass.');
requireThat(transitions.summary.allPassed,'Generate REPORT.md only after all C1 bridges pass.');
if(transitions.summary.nativeHandoffs!==undefined)requireThat(transitions.summary.nativeHandoffsPassed===transitions.summary.nativeHandoffs,'Native acceleration/deceleration handoffs must also pass.');
requireThat(browser.passed,'Generate REPORT.md only after browser capture passes.');
requireThat(catalog.clips.length===19&&requirements.clips===19&&browser.clipCount===19,'Expected all 19 clips.');
requireThat(browser.framesPerSheet===8,'Expected eight frames in every sheet.');
requireThat(requirements.sourceMotionSha256===catalog.sourceMotionSha256,'QA source hash is stale.');

for(const clip of catalog.clips){
 const assetSha=sha(await fs.readFile(path.join(base,'runtime',clip.asset)));
 requireThat(assetSha===clip.sha256,`${clip.id}: stale catalog hash`);
 const bridgeSource=transitions.sourceFiles.find(s=>s.id===clip.id);
 const capture=browser.clipsLoaded.find(c=>c.id===clip.id);
 requireThat(bridgeSource?.sha256===assetSha,`${clip.id}: rerun transition measurement after the last bake`);
 requireThat(capture?.glbSha256===assetSha,`${clip.id}: rerun capture after the last bake`);
 requireThat(capture.frames.length===8&&new Set(capture.frames).size===8,`${clip.id}: needs eight distinct native frames`);
 await fs.access(path.join(base,'verification',capture.sheet));
}

const f=(value,digits=2)=>Number(value).toFixed(digits);
const pass=value=>value?'עבר':'נכשל';
const rows=catalog.clips.map(clip=>{
 const result=requirements.checks.find(c=>c.id===clip.id);
 const red=Object.values(result.qaMetrics).filter(m=>m.status==='red').length;
 return `| \`${clip.id}\` · ${clip.label} | ${f(clip.durationSeconds,3)} | ${clip.frameCount} | ${f(result.score,1)} | ${red} | ${f(result.maxStanceDriftMeters*100,3)} | ${pass(result.assertions.athleteStandard)} | [PNG](verification/sheets/${clip.id}.png) · [QA](verification/qa/clips/soccer-locomotion-v2--${clip.id}.html) |`;
}).join('\n');
const gaitRows=['walk','jog','run','sprint'].map(id=>{
 const clip=catalog.clips.find(c=>c.id===id),m=requirements.checks.find(c=>c.id===id).athlete;
 return `| \`${id}\` | ${f(clip.speedMps)} | ${f(m.armAbdMax,1)}° | ${f(m.swingRange,1)}° | ${f(m.elbowMean,1)}° | ${f(m.lean,1)}° | ${pass(m.failures.length===0)} |`;
}).join('\n');
const allAssetsBytes=catalog.clips.reduce((sum,c)=>sum+c.bytes,0);
const acceleration=catalog.clips.find(c=>c.id==='idle_to_run'),deceleration=catalog.clips.find(c=>c.id==='run_to_idle');
const summary=transitions.summary;
const fullRun=existingChecks.runs[0],focusedRun=existingChecks.runs[1];
const report=`# דוח מסירה — ספריית תנועה לכדורגל v2

19 קליפים מקוריים על שלד קנוני של 18 עצמות, ב־30 הרץ. מינימום **${f(requirements.minimumScore,1)}**, **${requirements.redMetrics} מדדים אדומים**, וכיסוי מלא לכל המדדים החלים. סטיית התמיכה המרבית שנמדדה בתלת־ממד: **${f(requirements.maxStanceDriftMeters*100,3)} ס״מ** מתוך מגבלה של 2 ס״מ. כל בדיקות ATHLETE_STANDARD עברו.

[תצוגת תלת־ממד](preview.html) · [לוח QA](verification/qa/report.html) · [אימות דרישות מפורט](verification/requirements.json) · [מדידת מעברים](verification/transitions.json) · [ראיות דפדפן](verification/browser.json) · [מקורות ורישיונות](LICENSES.md)

## קליפים וראיות

שלוש עמידות עם נשימה ושינויי משקל/מבט, ארבע מהירויות עם נדנוד זרועות נגדי לרגליים, האצה של ${f(acceleration.durationSeconds,3)} שניות והאטה של ${f(deceleration.durationSeconds,3)} שניות, פניות לשני הכיוונים, צעדי צד, ריצה לאחור וריצה עם כדור. בכל קליפ סיבוב Root הוא זהות ומיקומו אפס; אין תנועת שורש או דחיסה. גליון PNG מכיל שמונה פריימים שונים מתוך ה־GLB עצמו.

| קליפ | שניות | פריימים ב־30Hz | ציון | אדומים | סטיית תמיכה מרבית, ס״מ | ATHLETE_STANDARD | 8 פריימים ומדדים |
|---|---:|---:|---:|---:|---:|---|---|
${rows}

## הזרועות והטיית הגוף

המדדים הבאים מחושבים בכלי הקיים \`athletes-core.mjs\`, במערכת הגוף לאורך מחזור מלא. זווית המרפק היא הזווית הפנימית: 180° ישר, 90° כפוף. רוחב הזרוע המרבי מושווה לסף 24°; דרישות טווח הנדנוד והטיית הגו עולות לפי סוג הריצה.

| קליפ | מהירות ייחוס, מ׳/שנ׳ | פתיחת זרוע מרבית | טווח נדנוד | מרפק ממוצע | הטיית גו ממוצעת | תקן |
|---|---:|---:|---:|---:|---:|---|
${gaitRows}

העמידות נבדקות מול סף העמידה. קליפי הפנייה נבדקים מול תקן ריצה; במעברי האצה/האטה נבדקת פתיחת הזרועות, כי ממוצעי מרפק, נדנוד והטיה של מחזור ריצה מלא אינם חלים על קליפ המתחיל או מסתיים בעמידה רגועה. ראיות ופירוט התחולה נמצאים ב־requirements.json. בדיקת האנטומיה המקורית של כלי ה־QA חלה על כל הפריימים.

## מדידה ללא שינוי כלי ה־QA

קובץ \`workout/island/design/motion-qa-v1/run.mjs\` אינו נמצא ב־main שעליו מבוססת החבילה. \`measure.mjs\` מחלץ זמנית את הקובץ ואת שבע תלויותיו מתוך הקומיט **${requirements.qaCommit}**, כפי שנעשה ב־soccer-header-v1. הוא מריץ את ה־CLI המקורי ב־120 הרץ, עם Node hook המחליף רק את מלאי הספריות הסגור ב־\`qa-sources.mjs\`. נוסחאות המדידה, הספים, המשקלים וקורא ה־GLB לא משתנים. חתימות שמונת קובצי המקור נשמרות ב־requirements.json וב־provenance.json.

\`\`\`sh
node workout/island/design/soccer-locomotion-v2/measure.mjs
\`\`\`

הפעלת ה־CLI בפועל: \`node --import <qa-register.mjs> <temporary>/workout/island/design/motion-qa-v1/run.mjs --library soccer-locomotion-v2 --fps 120 --out <verification/qa>\`.

כל GLB נבדק בנפרד: 18 עצמות עם שמות/הורים/מידות מנוחה קנוניים, כל דגימות הזמן ב־30 הרץ, התאמה ל־JSON המקורי, SHA-256 וגודל, Root קבוע וללא Draco/Meshopt. סך 19 קובצי ה־GLB: ${allAssetsBytes.toLocaleString('en-US')} בתים. [provenance.json](verification/provenance.json) מפרט חתימות לכל קובצי המסירה ולתלויות הקיימות.

## מגעי קרקע, מסלול ופניות

הנכס הוא תנועה במקום. לצורך מדידת החלקה פיזיקלית, המתאם מפעיל פעם אחת את \`referenceTravel.samples\` — מיקום וכיוון חיצוניים של השחקן — על השלד המקורי. הסוליה נמדדת בעולם מול העוגן הראשון בכל חלון תמיכה; בדיקת הדרישה משתמשת גם בסטייה תלת־ממדית. ה־Root המקורי והפוזה המקומית נשמרים בנפרד ומאומתים. כיוון פניות 45/90/180 מעלות שייך לאותו מסלול חיצוני; הוא אינו ערוץ סיבוב Root בנכס.

המדידה מתייחסת לנקודת הסוליה המוצהרת \`[0,-.08,0]\`, לפרקי השלד ולחלונות התמיכה המוצהרים; היא אינה בדיקת התנגשויות מלאה של משטחי העור. ב־run_ball מסלול כדור עצמאי ומגעי נעל נבדקים במועדים המדויקים. עיצוב ידיים/אצבעות מגיע מהדמות הקיימת; בשלד 18 העצמות אין עצמות אצבעות.

## רציפות בין קליפים

ה־API ב־\`runtime/player.mjs\` מספק גשר Hermite C1 המשמר פוזה ומהירות בין כל זוג קליפים, עם טיפול בקטיעת ערבוב פעיל. נבדקו **${summary.orderedClipPairs} זוגות סדורים** בשלוש בחירות של שלבי כניסה/יציאה ועוד קטיעה לכל זוג: **${summary.bridges} גשרים**, ${summary.passed} עברו. המדידה קוראת את ערכי FLOAT מתוך ה־GLB בפועל ודוגמת את הגשרים ב־240 הרץ.

שגיאת פוזת קצה מרבית: ${Number(summary.maxEndpointRotationDegrees).toExponential(3)} מעלות; שארית מהירות זוויתית מרבית: ${Number(summary.maxEndpointVelocityRadiansPerSecond).toExponential(3)} רדיאנים/שנייה. Root נשאר קבוע לאורך כל הגשרים. [הראיות המלאות](verification/transitions.json) כוללות ספים, חתימות נכסים וכל זוג שנדגם.

${summary.nativeHandoffs!==undefined?`נבדקו גם ${summary.nativeHandoffs} חיבורים ישירים בין קליפי ההאצה/ההאטה לבין עמידה וריצה, לפי הפריימים הסמוכים בקבצים האפויים: ${summary.nativeHandoffsPassed} עברו. שארית המהירות הזוויתית המרבית בחיבורים אלה: ${Number(summary.maxNativeHandoffAngularVelocityRadiansPerSecond).toExponential(3)} רדיאנים/שנייה.`:''}

יש להפעיל את API הגשר בעת החלפת קליפים ולחדש את היעד מהשלב שנבחר. מדידת C1 זו נפרדת מהחלקת הרגליים בחלונות התמיכה. ערבוב שרירותי תוך הזזת השחקן בעולם דורש גם שמירת עוגני מגע ב־IK עד שחרור התמיכה; גשר מקומי לבדו אינו מבטיח סטיית סוליה עד 2 ס״מ במהלך כל ערבוב אפשרי. החבילה אינה מחוברת לקוד המשחק.

## תצוגה ושחזור

נטענו כל ${browser.clipCount} הקליפים ונוצרו ${browser.clipCount} גליונות בני שמונה פריימים. דפדפן: ${browser.errors.length} שגיאות; גלילה אופקית בטלפון: ${browser.mobileOverflow?'נמצאה':'לא נמצאה'}; בקשות WASM/decoder: ${browser.wasmRequests.length}. הרינדור נבדק גם כשה־WebAssembly חסום. [מחשב](verification/preview-desktop.png) · [טלפון](verification/preview-mobile.png).

בהרצת הבדיקות הקיימות \`npm test\`: ${fullRun.passed} עברו, ${fullRun.skipped} דולגו, וכישלון סביבתי אחד נגרם מהיעדר קובץ Chromium ברירת המחדל של Playwright. קובץ הבדיקות היחיד שנכשל הורץ שוב עם Chromium המותקן ועם הגדרת \`ISLAND_PLAYWRIGHT\` הקיימת: ${focusedRun.passed}/${focusedRun.passed+focusedRun.failed} עברו. קוד הבדיקות והטענות לא שונו; החבילה המלאה לא הורצה מחדש בתצורת הדפדפן החלופית. [פקודות ותוצאות מדויקות](verification/checks.json).

פקודות ההפקה והצפייה ב־[README.md](README.md). כל התוצרים נמצאים בתיקייה החדשה בלבד; אין שינוי בקוד קיים, release, תגי גרסה, CLAUDE.md, ops או בדיקות. התנועות והתרומות החדשות CC0-1.0; הדמות הקיימת CC0 ותלויות Three.js הקיימות MIT, כמפורט ב־LICENSES.md.
`;
await fs.writeFile(path.join(base,'REPORT.md'),report);

const dependencies=[
 'workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb',
 'workout/island/design/soccer-header-v1/source/rig.mjs',
 'workout/island/design/soccer-header-v1/source/glb.mjs',
 'workout/island/design/soccer-header-v1/runtime/player.mjs',
 'workout/island/minigames/athletes-core.mjs',
 'workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js',
 'workout/island/design/soccer-motion-v8/runtime/vendor/GLTFLoader.js',
 'workout/island/design/soccer-motion-v8/runtime/vendor/LICENSE.three',
];
const record=async absolute=>{const bytes=await fs.readFile(absolute);return {path:path.relative(repo,absolute),bytes:bytes.length,sha256:sha(bytes)};};
const files=[];
async function walk(directory){
 for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const absolute=path.join(directory,entry.name);
  if(entry.isDirectory())await walk(absolute);
  else if(path.relative(base,absolute)!=='verification/provenance.json')files.push(await record(absolute));
 }
}
await walk(base);
const sourceDependencies=await Promise.all(dependencies.map(p=>record(path.join(repo,p))));
const provenance={schemaVersion:1,baseCommit:execFileSync('git',['merge-base','HEAD','origin/main'],{cwd:repo,encoding:'utf8'}).trim(),
 sourceRevision:{kind:'authored-worktree',gitHeadWhenReportGenerated:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
  contentIdentity:'The HEAD identifies checkout ancestry; authored asset content is identified by sourceMotionSha256 and each runtime/catalog.json clip SHA-256, not by that pre-commit HEAD.'},
 license:'CC0-1.0 original contributions; CC0 inherited mesh/rig/player; existing Three.js MIT',
 nativeRate:30,canonicalBones:18,rootMotion:false,sourceMotionSha256:catalog.sourceMotionSha256,
 qaCommit:requirements.qaCommit,qaFiles:requirements.qaFiles,
 assertions:{qaPassed:requirements.passed,transitionsPassed:summary.allPassed,browserPassed:browser.passed,
  allEvidenceAssetHashesMatch:true,eightDistinctNativeFramesPerSheet:true},
 sourceDependencies,files,
 inventoryScope:'Every package file except this inventory itself; REPORT.md included after generation. Existing dependencies are hashed separately.'};
await fs.writeFile(path.join(base,'verification/provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(`Generated REPORT.md and provenance for ${files.length} files and ${dependencies.length} existing dependencies.`);
