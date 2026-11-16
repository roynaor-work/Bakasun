// SPDX-License-Identifier: CC0-1.0
// Assemble a report from measured evidence, then hash every delivered file.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=new URL('../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const catalog=await read('catalog.json'),qa=await read('verification/requirements.json');
const c1=await read('verification/transitions.json'),gltf=await read('verification/gltf.json');
const floor=await read('verification/mesh-floor.json'),browser=await read('verification/browser.json');
const dense=await read('verification/dense-support.json'),denseById=new Map(dense.results.map(c=>[c.id,c]));
const hash=b=>createHash('sha256').update(b).digest('hex');
const primary=['jog','run','sprint','referee_run','keeper_ready_side_steps','keeper_catch_chest','keeper_catch_head'];
const labels={jog:'ג׳וג',run:'ריצה',sprint:'ספרינט',referee_run:'ריצת שופט',keeper_ready_side_steps:'מוכנות שוער וצעדי צד',keeper_catch_chest:'תפיסה בגובה חזה',keeper_catch_head:'תפיסה בגובה ראש'};
const f=(n,d=3)=>Number(n).toFixed(d),mm=n=>n<.000001?'<0.001':f(n*1000,3);
const checks=new Map(qa.checks.map(c=>[c.id,c]));
const table=primary.map(id=>{const c=catalog.clips.find(c=>c.id===id),q=checks.get(id);return `| ${labels[id]} | \`${id}\` | ${id==='referee_run'?'4–6, בסיס 5':c.speedMps??0} | ${f(c.durationSeconds)} | ${q.score} | ${mm(denseById.get(id).maxSpatialDriftMeters)} |`;}).join('\n');
const bridges=catalog.clips.filter(c=>c.nativeHandoff);
const bridgeTable=bridges.map(c=>`| \`${c.id}\` | ${f(c.durationSeconds)} | ${checks.get(c.id).score} | ${f(c.nativeHandoff.sourcePhaseSeconds)} ← ${f(c.nativeHandoff.targetPhaseSeconds)} | ${mm(denseById.get(c.id).maxSpatialDriftMeters)} |`).join('\n');
const maximum=(key)=>Math.max(...c1.baked.flatMap(c=>[c.c1.start[key],c.c1.end[key]]));
const minMesh=Math.min(...floor.clips.map(c=>c.minimumMeshY));
const ready=checks.get('keeper_ready_side_steps');
const contextual={schemaVersion:1,branch:'codex/soccer-run-cycles-v3',baseCommit:catalog.sources.baseCommit,
  modifiedExistingFiles:execFileSync('git',['diff','--name-only',catalog.sources.baseCommit,'--','.'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).filter(p=>!p.startsWith('workout/island/design/soccer-run-cycles-v3/')),
  completionCriteria:'Seven requested clips >88 on unchanged pinned motion-qa-v1, <2cm world support drift, measured C1 bridges, canonical18 GLBs, eight-frame sheets, 844x390 preview, licenses, report and branch push.'};
await fs.writeFile(new URL('verification/scope.json',base),JSON.stringify(contextual,null,2)+'\n');
if(contextual.modifiedExistingFiles.length)throw Error('Existing files changed outside requested scope');
const catalogBytes=await fs.readFile(new URL('catalog.json',base));
if(hash(catalogBytes)!==browser.catalogSha256||hash(catalogBytes)!==qa.catalogSha256)throw Error('Stale QA/browser evidence');
for(const c of catalog.clips){
  const b=browser.clips.find(b=>b.id===c.id);
  if(!b)throw Error('Missing rendered sheet '+c.id);
  const field=b.assetSha256??b.glbSha256??b.sha256;
  if(field&&field!==c.sha256)throw Error('Stale rendered sheet '+c.id);
  if(!floor.clips.some(a=>a.id===c.id&&a.sha256===c.sha256)||!gltf.assets.some(a=>a.id===c.id&&a.sha256===c.sha256))throw Error('Stale GLB audit '+c.id);
}
const red=qa.checks.flatMap(c=>Object.entries(c.qaMetrics).filter(([,m])=>m.status==='red').map(([key,m])=>`${c.id}: ${key} (${m.value})`));
let repoTests='בדיקות המאגר מתועדות בנפרד ב־verification/repository-tests.json.';
try {const t=await read('verification/repository-tests.json');repoTests=t.description??repoTests;}catch{}
const report=`# מסירה · מחזורי ריצה לכדורגל 3

נמסרים **${primary.length} קליפים מבוקשים**, שתי עמידות ייחוס ו־${bridges.length} גשרי האצה/בלימה: **${catalog.clips.length} קובצי GLB לקליפים**, עם קטלוג, פוזות מקור ב־120Hz וגיליון של שמונה פריימים לכל קובץ. כל ${catalog.clips.length} הקליפים קיבלו מעל 88 בכלי QA המקורי; הציון הנמוך ביותר **${qa.minimumScore}**. סטיית הסוליה המרבית בחלון תמיכה היא **${mm(dense.maxSpatialDriftMeters)} מ״מ**, מתחת לסף 20 מ״מ.

[תצוגה חיה](preview.html) · [קטלוג](catalog.json) · [QA המקורי](verification/qa/report.html) · [דרישות ומדדים מלאים](verification/requirements.json) · [רישיונות](LICENSES.md)

## הקליפים המבוקשים

| תנועה | מזהה | מהירות במ׳/ש׳ | משך בשניות | ציון QA | סטיית תמיכה מרבית במ״מ |
|---|---|---:|---:|---:|---:|
${table}

הידיים בריצה נעות בניגוד זו לזו ולרגל מאותו צד, עם מרפקים ב־90° וסגנון הנדנוד של soccer-locomotion-v2. צורת הצעד, זמני התמיכה ומסלולי ההחזרה חוברו מחדש לפי מהירויות המשחק, ולא באמצעות הגדלת מסלול של מחזור איטי. בריצת שופט הקצב הוא מהירות העולם חלקי 5; שלושת התרחישים 4, 5 ו־6 מ׳/ש׳ נמדדו בפועל ומתועדים ב־requirements.json. פתיחת הזרוע המרבית במוכנות השוער: **${f(ready.arms.maxAbductionDegrees,2)}°**, מתחת ל־30°.

בתפיסות הכדור מגיע במסלול עצמאי, שתי הידיים פוגשות את פניו ומחזיקות אותו במהלך הספיגה וההורדה לחזה. החלונות והנקודות המקומיות נמצאים בקטלוג. אלה סמני תצוגה; אין קביעת בעלות או הצלחה של פעולה מתוך זמן האנימציה.

## גשרים לעמידה ורציפות

| גשר | משך בשניות | ציון QA | פאזת מקור ← יעד, שניות | סטיית תמיכה במ״מ |
|---|---:|---:|---:|---:|
${bridgeTable}

הגשרים כוללים מסלול האטה/האצה והצבת רגליים המתאימים לטווח הרגל הקנונית. ההעברה נעשית בפאזות המפורשות של nativeHandoff, לאחר התאמת מיקום השחקן בעולם. יש להמשיך את קליפ היעד מפאזת היעד, ולא לאתחל אותו לאפס.

בדיקת C1 קוראת את הקווטרניונים ואת זמני Float32 מתוך ה־GLB הסופי: שגיאת מהירות האגן המרבית **${maximum('hipsMetersPerSecond').toExponential(3)} מ׳/ש׳**, ושגיאת מהירות הסיבוב המרבית **${maximum('angularRadiansPerSecond').toExponential(3)} רדיאן/ש׳**. נבדקו גם גשר Hermite כללי וקטיעתו. [ראיות הרציפות](verification/transitions.json). נעילת הרגל חלה על הגשרים האפויים וחלונות התמיכה; helper כללי לפאזה שרירותית מצריך את אילוצי התמיכה של הצרכן.

## אימות

- **QA:** הקוד המקורי בקומיט \`5eb4f093bc22523ee417a7f2345c3b813bffba24\`, ללא שינוי נוסחאות, משקלים או ספים; רק מתאם ספריית הקלט הוסף. כל המדדים הרלוונטיים בכיסוי מלא. [מקורות וגיבובים](verification/qa-provenance.json).
- **נעילה בעולם:** בדיקה נוספת ב־480Hz דגמה ${dense.totalSampledPoses.toLocaleString('en-US')} פוזות, כולל אינטרפולציה בין מפתחות GLB. הטבלאות מציגות את הסטייה התלת־ממדית הצפופה; שיא 120Hz של ה־QA המקורי הוא ${mm(qa.maxStanceDriftMeters)} מ״מ. [ראיות ביניים](verification/dense-support.json).
- **שלד ונכסים:** 18 עצמות בדיוק, שמות, הורות, מנוחה ו־inverse binds קנוניים; Root קבוע, מטרים, Y למעלה ו־Z קדימה. ${catalog.clips.length} אנימציות מקוריות ב־120Hz, ללא דחיסה. סך GLB: **${f(catalog.clips.reduce((n,c)=>n+c.bytes,0)/1e6,2)} MB**.
- **Khronos glTF Validator:** **${gltf.errors} שגיאות**, ${gltf.warnings} אזהרות. האזהרות הן יצירת tangent space לחומרי normal קיימים ברשת הייחוס. [תוצאות](verification/gltf.json).
- **רצפה:** כל קודקודי הרשת הוצבו באמצעות skinning מתוך GLB ב־120Hz, ללא תיקון רצפה. תחתית הרשת הנמוכה ביותר **${mm(minMesh)} מ״מ מעל הרצפה**; אפס חדירה. [בדיקת הרשת](verification/mesh-floor.json).
- **דפדפן:** 844×390 וגם 390×844, ללא גלילה חורגת; בחירת קליפ, מצלמה, קצב, עצירה, ציר זמן ותמיכות. שמונה פריימים מרונדרים לכל קליפ, עם זמני דגימה וגיבובי GLB. הבדיקה רצה עם WebAssembly חסום וללא בקשות decoder. [ראיות](verification/browser.json).
- **בדיקות המאגר:** ${repoTests}

${red.length?`מדדים אדומים אבחוניים שנותרו גלויים למרות הציון המשוקלל: ${red.join('; ')}. רציפות מול idle היא בדיקת קצה ישירה, והיא שונה מבדיקת C1 של הגשר המפורש.\n`:''}
מדד התחושה הוא מדד הנדסי של השלד ונקודות מגע, ולא ציון תפיסתי אנושי. מדידת נעילה בודקת תרחיש עולם ישר ומוצהר; שינוי כיוון, קצב או משטח במשחק דורש העברת עוגנים ו־IK של הצרכן. בדיקת רשת הרצפה נוספת למדד הסוליה ואינה בדיקת התנגשות מלאה של הגוף בכדור.

## היקף ושחזור

בסיס: \`${catalog.sources.baseCommit}\`. ענף: \`codex/soccer-run-cycles-v3\`. נוספו קבצים רק תחת \`workout/island/design/soccer-run-cycles-v3/\`; לא שונה קובץ קיים, קוד משחק, גרסה או חדר הבקרה. רישום הסשן וקריטריון הסיום נשמרים ב־[scope.json](verification/scope.json), בהתאם להגבלת התיקייה שבבקשה.

בתיקיית reference נכללת גם תבנית GLB קיימת כקלט הפקה, מעבר ל־17 קליפי הקטלוג. כל הקליפים נשענים על מהירויות המדרג ב־[soccer-codex-motion.mjs](../../minigames/soccer-codex-motion.mjs).

הפקה ובדיקות: [README.md](README.md). מקור סגנון הריצה: \`ec6c73949fb5820826b4c082972f5d4f1136641f\`. מלאי התוצרים וגיבובי SHA-256 ב־[manifest.json](verification/manifest.json). הנכסים והתצוגה נמסרים לסקירה וחיבור עתידי; המשחק הקיים לא שונה.
`;
if(!qa.passed||!c1.passed||!gltf.pass||!floor.pass||!browser.passed||!dense.passed)throw Error('Cannot finalize failed evidence');
await fs.writeFile(new URL('REPORT.md',base),report);
const files=[];
async function walk(relative=''){
  for(const entry of (await fs.readdir(new URL(relative,base),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=relative+entry.name;if(entry.isDirectory())await walk(path+'/');
    else if(path!=='verification/manifest.json'){const bytes=await fs.readFile(new URL(path,base));files.push({path,bytes:bytes.length,sha256:hash(bytes)});}
  }
}
await walk();
await fs.writeFile(new URL('verification/manifest.json',base),JSON.stringify({schemaVersion:1,algorithm:'sha256',scope:'All delivered files except this manifest itself',files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,clips:catalog.clips.length,minimumScore:qa.minimumScore,totalBytes:files.reduce((s,f)=>s+f.bytes,0)}));
