// SPDX-License-Identifier: CC0-1.0
// Assemble the handoff from measured evidence, and hash every delivery file.
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=fileURLToPath(new URL('../',import.meta.url));
const repo=path.resolve(base,'../../../..');
const read=async p=>JSON.parse(await readFile(path.join(base,p),'utf8'));
const write=async(p,v)=>writeFile(path.join(base,p),JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const kicks='d4a27a94dd63127dd9f38fc641db414bd09bac35',locomotion='ec6c73949fb5820826b4c082972f5d4f1136641f',qa='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const dependencies=[
 ['reference/idle_relaxed.glb',kicks,'soccer-kicks-v2/runtime/reference/idle_relaxed.glb','CC0-1.0'],
 ['reference/run.glb',kicks,'soccer-kicks-v2/runtime/reference/run.glb','CC0-1.0'],
 ['reference/locomotion_idle.glb',locomotion,'soccer-locomotion-v2/runtime/clips/idle_relaxed.glb','CC0-1.0'],
 ['reference/locomotion_run.glb',locomotion,'soccer-locomotion-v2/runtime/clips/run.glb','CC0-1.0'],
 ['source/rig.mjs',kicks,'soccer-header-v1/source/rig.mjs','CC0-1.0'],
 ['source/glb.mjs',kicks,'soccer-header-v1/source/glb.mjs','CC0-1.0'],
 ['source/hermite.mjs',kicks,'soccer-header-v1/runtime/player.mjs','CC0-1.0'],
 ['player.mjs',kicks,'soccer-kicks-v2/runtime/player.mjs','CC0-1.0'],
 ['vendor/qa/metrics.mjs',qa,'motion-qa-v1/metrics.mjs','CC0-1.0'],
 ['vendor/qa/glb.mjs',qa,'motion-qa-v1/glb.mjs','CC0-1.0'],
 ...['three.module.js','GLTFLoader.js','BufferGeometryUtils.js','LICENSE.three'].map(n=>['vendor/'+n,kicks,'soccer-motion-v8/runtime/vendor/'+n,'MIT']),
];
const origins=[];
for(const [file,commit,source,license]of dependencies){
 const original=execFileSync('git',['show',`${commit}:workout/island/design/${source}`],{cwd:repo,maxBuffer:8*1024*1024});
 const delivered=await readFile(path.join(base,file));
 origins.push({path:file,license,commit,sourcePath:'workout/island/design/'+source,sourceSha256:hash(original),sha256:hash(delivered),unchanged:hash(original)===hash(delivered),adaptation:hash(original)===hash(delivered)?null:'Local dependency import paths only'});
}
await write('verification/provenance.json',{schemaVersion:1,dependencies:origins,geometry:'Existing fictional canonical18 CC0 player; positions, inverse binds, skin weights and materials retained. Tangents derived from existing normals and UVs for glTF portability. Degenerate UVs receive deterministic orthogonal unit tangents.'});
const [catalog,qaReport,transitions,assets,browser,sheets,tests]=await Promise.all(['catalog.json','verification/qa/report.json','verification/transitions.json','verification/assets.json','verification/browser.json','sheets/manifest.json','verification/repository-tests.json'].map(read));
const rows=catalog.clips.map(c=>{
 const score=Math.min(...qaReport.runs.map(r=>r.clips.find(x=>x.id===c.id).score));
 const contact=c.events.find(e=>e.type==='contact');
 const g=c.contactGeometry;
 return `| ${c.label} | ${c.id} | ${c.frameCount} | ${score.toFixed(1)} | ${contact?`${contact.time.toFixed(3)} / ${contact.frame}`:'—'} | ${g?g.ballHeightMeters.toFixed(3):'—'} |`;
}).join('\n');
const ts=transitions.summary;
const report=`# דוח מסירה — soccer-volley-scissor-v1

ענף: \`codex/soccer-volley-scissor-v1\`. בסיס: \`19d9cdc5e3718236df5a2fc4d8b8c26c72007575\`. כל השינויים הם קבצים חדשים תחת תיקייה זו בלבד. קוד המשחק וקבצים קיימים לא שונו.

## תוצרים ותזמון

שישה GLB עצמאיים עם mesh/skin, שלד קנוני 18 עצמות וערוצים ב־30Hz; קטלוג מגעים, מקור פוזות, שישה גיליונות של שמונה פריימים ותצוגת RTL מותאמת 844×390. התנועה מקורית, פרוצדורלית עם IK; אינה motion capture.

| תנועה | מזהה | פריימים | QA מינימלי | מגע: שנ׳ / פריים | גובה מרכז הכדור במ׳ |
|---|---|---:|---:|---:|---:|
${rows}

זמן המגע נמצא ברשת 30Hz. קטלוג כל מגע כולל עצם, נקודה מקומית על משטח הפגיעה, מיקום במטרים ביחס לאגן, מיקום בצירי האגן ומרכז כדור נפרד ברדיוס 0.11 מ׳. לחלונות ההתאמה: עף 0.5–1.2 מ׳, נגיחה 1.5–2.2 מ׳, מספרת 1.8–2.4 מ׳. הגובה הוא בזמן המגע החזוי; כדור יורד מאפשר בחירה בנגיחה מוקדמת או עף מאוחר. אין מתיחה של השלד כדי לכסות טווח שלם.

המספרת נבעטת לאחור מעל הגוף, ומסתיימת בפוזה שמתחברת ישירות לתחילת הנחיתה. לאחר מגע הגב ברצפה, חלון הקימה הוא 0.6 שנ׳ בדיוק — 18 מרווחי פריימים. הקטלוג מסמן נחיתה, תחילת קימה וסיומה. הכנה לנגיחה ונחיתה אינן מסמנות מגע בכדור.

## QA ומעברים

- [motion-qa-v1 המקורי](verification/qa/report.json), קומיט \`${qa}\`, מדדים ללא שינוי: שש תנועות ב־60Hz וב־120Hz, כיסוי ${qaReport.summary.coverage*100}%, ציון מינימלי ${qaReport.summary.minimumScore}, ללא מדד אדום. המדידה קוראת את ערוצי ה־GLB הסופיים ולא רק פוזות מקור.
- החלקת תמיכה נטועה מרבית בתלת־ממד: **${(qaReport.summary.maximumPlantedSlideMeters3D*1000).toFixed(3)} מ״מ**, מתחת ל־20 מ״מ; מרחק סוליה מרצפה מרבי ${(qaReport.summary.maximumPlantedFloorDistanceMeters*1000).toFixed(3)} מ״מ. חלונות תמיכה ונתוני הגלם נשמרו לכל קליפ.
- [בדיקת C1](verification/transitions.json): ${ts.bridgesPassed}/${ts.bridges} גשרים אל/מעמידה וריצה של שתי חבילות המקור, ${ts.interruptedBridgesPassed}/${ts.interruptedBridges} הפרעות, ${ts.actionBridgesPassed}/${ts.actionBridges} גשר הכנה→נגיחה ו־${ts.directSeamsPassed}/${ts.directSeams} חיבור ישיר מספרת→נחיתה. הבדיקה דוגמת ב־240Hz ומודדת נגזרות חד־צדדיות. שארית מהירות סיבוב מרבית ${ts.maxEndpointVelocityRadiansPerSecond.toExponential(4)} רד׳/ש׳; drift בעמידה ${(ts.maxStationaryIdleSoleDriftMeters*1000).toFixed(3)} מ״מ.
- מערכת הגשר היא Hermite מנורמל עם תיקון רצפה של soccer-kicks-v2. הכנה→נגיחה משתמש בגשר 0.3 שנ׳ המוצהר בקטלוג; החיבור הישיר אינו C1. מספרת→נחיתה תואם ישירות בפוזה ובמהירות. אין יציאה מן האוויר לעמידה.
- [Khronos glTF Validator](verification/assets.json): **${assets.summary.errors} שגיאות, ${assets.summary.warnings} אזהרות**. נוספו tangents לגאומטריה המיוצאת לשמירת תאימות למפות הנורמל המקוריות. בדיקת CPU של כל קודקודי הרשת ב־120Hz מצאה גובה רצפה מינימלי ${(assets.summary.minimumSkinYMeters*1000).toFixed(3)} מ״מ; הגב והאצבעות אינם חודרים לרצפה בדגימות.
- [בדיקת דפדפן](verification/browser.json) ו־[מניפסט הגיליונות](sheets/manifest.json): ניגון GLB בפועל, החלפת תנועה, זוויות, מהירות, סרגל זמן, אירועי מגע ורצף מספרת→נחיתה. שמונה פריימים לכל קליפ כוללים אירועים משמעותיים וחתימת GLB המקור.
- [בדיקות הריפו](verification/repository-tests.json): ${tests.summary??tests.status??'ראו את הדוח המצורף'}.

## סקירה וחיבור

1. פותחים את [התצוגה](preview.html) דרך שרת HTTP בגודל 844×390.
2. בוחרים את ששת הקליפים, קופצים למגע וצופים במספרת→נחיתה במבט צד. בוחנים גם את [הגיליונות](sheets/manifest.json).
3. מחברים לפי [README](README.md) ו־[catalog.json](catalog.json): גובה כדור חזוי, התאמת מיקום/כיוון שחקן, אירועים ותנועת שחקן הם באחריות קוד המשחק. כל הנתיבים מקומיים לחבילה ואין CDN.

הממצאים הם בדיקות מספריות וסריקה חזותית ב־Chromium; טרם נעשתה בדיקת טלפון פיזי או שילוב במשחק 11×11. ציון QA הוא מסנן הנדסי, לא ציון תפיסתי אנושי. מדד posePops צהוב בפעולות המהירות, לרבות הקימה הקצרה; רציפות הגשרים נמדדה בנפרד. ערוצי ה־GLB הם LINEAR/slerp בדגימות 30Hz; הבטחת C1 מתייחסת לגשרי המעבר, ולא לכל צומת פנימי באנימציה. בדיקות החלקה מתייחסות לחלונות התמיכה המוצהרים ולצירי החבילה; בזמן חיבור למשחק צריך להעביר את העוגנים עם טרנספורמציית השחקן בעולם.

מקורות ורישוי: [LICENSES.md](LICENSES.md), [provenance.json](verification/provenance.json). [inventory.json](verification/inventory.json) מונה את כל קובצי המסירה וחתימותיהם. השחזור מפורט ב־README ובכלי \`source/\`.
`;
await writeFile(path.join(base,'REPORT.md'),report);
async function walk(dir=''){
 const output=[];for(const entry of await readdir(path.join(base,dir),{withFileTypes:true})){
  const file=path.posix.join(dir,entry.name);if(entry.isDirectory())output.push(...await walk(file));else output.push(file);
 }return output.sort();
}
const inventory=[];
for(const file of await walk()){
 if(file==='verification/inventory.json')continue;
 const bytes=await readFile(path.join(base,file)),origin=origins.find(o=>o.path===file);
 inventory.push({path:file,bytes:bytes.length,sha256:hash(bytes),license:origin?.license??'CC0-1.0',origin:origin?'Pinned source; see provenance.json':'Original task output or derived from the documented CC0 sources'});
}
await write('verification/inventory.json',{schemaVersion:1,selfHashOmitted:true,totalFiles:inventory.length+1,totalBytesExcludingInventory:inventory.reduce((n,f)=>n+f.bytes,0),files:inventory});
console.log(JSON.stringify({files:inventory.length+1,bytes:inventory.reduce((n,f)=>n+f.bytes,0),qa:qaReport.summary.passed,transitions:ts.allPassed,assets:assets.summary.passed}));
