/** Generate REPORT.md only from complete, current final evidence. No browser/build. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectMatrixCase} from './audit-matrix-protocol.mjs';
import {inspectMatrixContinuation} from './audit-matrix-continuation.mjs';

const PACK=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO=path.resolve(PACK,'../../../..'),VENDOR=path.resolve(PACK,'../../vendor');
const PREFIX=path.relative(REPO,PACK).replaceAll(path.sep,'/')+'/';
const CHECK=process.argv.includes('--check'),errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const check=(condition,message)=>{if(!condition)errors.push(message);return !!condition;};
const read=async file=>{try{return JSON.parse(await fs.readFile(path.join(PACK,file),'utf8'));}catch(error){errors.push(`${file}: ${error.message}`);return null;}};
const run=promisify(execFile);
const git=async(...args)=>(await run('git',args,{cwd:REPO,encoding:'utf8',maxBuffer:20*1024*1024})).stdout.trim();
const local=file=>{const target=path.resolve(PACK,file);if(!target.startsWith(PACK+path.sep))throw Error(`Path leaves alpine-v7: ${file}`);return target;};
const currentHash=async(file,sha,target=local(file))=>{try{check(typeof sha==='string'&&hash(await fs.readFile(target))===sha,`Stale or missing SHA-256: ${file}`);}catch(error){errors.push(`${file}: ${error.message}`);}};
const fmt=n=>Number(n).toLocaleString('en-US');
const mb=n=>(n/1000000).toFixed(6);
const cell=s=>String(s??'').replaceAll('|','\\|').replace(/\r?\n/g,' ');
const link=file=>`[${cell(file)}](${encodeURI(file)})`;
const clipNames=['glide','carve_left','carve_right','crouch','accelerate','ramp_jump','trick_180','trick_360','trick_shifty','trick_tail_grab','trick_backflip','fall_roll','get_up','celebrate'];
const criteria=[['character','דמות'],['carving','תנועת גוף בפנייה'],['snow','שלג'],['trees','עצים'],['background','רקע'],['consistency','עקביות']];
const files={scores:'verification/scores.json',asset:'verification/asset-audit.json',motion:'verification/motion-audit.json',dense:'motion/verification/dense-boundaries.json',json:'motion/verification/json-playback.json',package:'verification/package-audit.json',browser:'verification/browser-audit.json',repository:'verification/repository-tests.json',matrix:'verification/matrix-soak.json',work:'verification/work-log.json',offline:'verification/offline-package.json'};
const proof=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,file])=>[key,await read(file)])));

for(const key of ['asset','motion','dense','json','package']){
  const data=proof[key];if(!data)continue;
  check(data.allPassed===true&&!data.errors?.length&&!data.failures?.length,`${files[key]} must pass without unresolved failures`);
}
for(const key of ['motion','dense']){
  const data=proof[key];if(!data)continue;
  check(data.allLODs===true&&data.characters?.length===9&&new Set(data.characters?.map(c=>c.file)).size===9,`${files[key]} must cover all 9 character/LOD files`);
  for(const entry of data.characters??[])await currentHash(entry.file,entry.sha256);
}
if(proof.asset){
  check(proof.asset.assetCount===proof.asset.assets?.length&&proof.asset.assets?.length>0,'Asset inventory is incomplete');
  for(const entry of [...(proof.asset.assets??[]),...(proof.asset.externalTextures??[])])await currentHash(entry.file,entry.sha256);
  for(const asset of proof.asset.assets??[]){
    check(asset.bytes<=1500000&&asset.allPrimitivesDraco===true,`${asset.file}: GLB budget or Draco gate failed`);
    check((asset.textures??[]).every(t=>t.width<=1024&&t.height<=1024),`${asset.file}: oversized texture`);
    if(asset.file.startsWith('characters/'))check(asset.skin?.jointCount===18&&asset.textures?.length===1&&asset.animations?.length===14,`${asset.file}: canonical character structure is incomplete`);
  }
}
for(const [file,record]of Object.entries(proof.json?.inputs??{}))await currentHash(file,record.sha256);
const modulePaths={three:path.join(VENDOR,'three.module.js'),geometry:path.join(VENDOR,'BufferGeometryUtils.js'),gltf:path.join(VENDOR,'GLTFLoader.js'),draco:path.join(VENDOR,'DRACOLoader.js'),world:path.join(PACK,'world/world.js'),preview:path.join(PACK,'preview-client.mjs'),motion:path.join(PACK,'motion/motion.mjs')};
if(proof.package){
  for(const entry of proof.package.assets??[])await currentHash(entry.file,entry.sha256,entry.file.startsWith('engine/')?path.join(VENDOR,'draco',entry.file.slice(7)):local(entry.file));
  for(const module of proof.package.modules??[]){
    if(check(!!modulePaths[module.name],`Unknown package module: ${module.name}`))await currentHash('module:'+module.name,module.sha256,modulePaths[module.name]);
  }
  check(proof.package.modules?.length===7&&proof.package.standalone?.passed===true,'Package proof is incomplete');
  await currentHash('preview-standalone.html',proof.package.standalone?.sha256);
  await currentHash('preview.css',proof.package.standalone?.stylesheetSha256);
  await currentHash('bootstrap.js',proof.package.standalone?.bootstrapSha256);
  check(proof.package.bundleBuiltAt===proof.offline?.builtAt,'Package audit and final offline package have different build times');
}
const moduleHashes=Object.fromEntries((proof.package?.modules??[]).map(m=>[m.name,m.sha256]));
const snapshots=value=>{const found=[];const visit=x=>{if(!x||typeof x!=='object')return;if(x.bundleBuiltAt&&x.bundleSources)found.push(x);for(const child of Object.values(x))if(child&&typeof child==='object')visit(child);};visit(value);return found;};
const samePackage=s=>s.bundleBuiltAt===proof.package?.bundleBuiltAt&&Object.entries(moduleHashes).every(([name,sha])=>s.bundleSources?.[name]===sha);
if(proof.browser){
  const data=proof.browser,observed=snapshots(data);
  check(data.pass===true&&!data.errors?.length&&!data.consoleErrors?.length&&!data.externalRequests?.length&&data.checks?.length>0&&data.checks.every(c=>c.pass===true),'Browser proof has failures, console errors, or external requests');
  check(observed.length>=2&&observed.every(samePackage),'Browser proof is not from the final package/source hashes');
  check(['390x844','844x390'].every(size=>data.viewports?.some(v=>v.size?.join('x')===size)), 'Browser proof must cover both exact viewports');
  for(const size of ['390x844','844x390'])for(const [name,minimum]of [['full body and equipment framing',870],['near fall and recovery hands clear of athlete controls',75],['air to ground selection restores camera preset',150]])check(data.checks?.some(c=>c.name===`${size} ${name}`&&c.pass===true&&c.samples>=minimum),`Missing final browser coverage: ${size} ${name}`);
  check(['passed','blocked by managed browser policy'].includes(data.localFileNavigation?.status),'Direct-file navigation probe evidence is missing or failed');
}
if(proof.repository)check(proof.repository.success===true&&proof.repository.exitCode===0&&proof.repository.fail===0&&proof.repository.tests>0,'Repository npm test proof must report success');
if(proof.matrix){
  const data=proof.matrix;
  check(data.schemaVersion===2&&typeof data.playbackProtocol==='string'&&data.playbackProtocol.length>30,'Final matrix must declare the separate real-playback and seek-assisted-end protocol');
  check(data.minimumProgressTimeoutSeconds===45&&data.endProbeTimeoutSeconds===45&&data.execution?.cpuAffinity==='0-2'&&typeof data.execution.cpuQuota==='string','Final matrix execution environment and bounded patience must be recorded consistently');
  await currentHash('tools/matrix-soak.mjs',data.toolSourceSHA256);
  check(data.pass===true&&data.expectedCases===504&&data.cases?.length===504,'Matrix must pass exactly 504 expected and actual cases');
  check(!data.errors?.length&&!data.externalRequests?.length&&data.cases?.every(c=>c.playbackPass===true&&c.resourcesPass===true),'Matrix has playback, resource, console, or network failures');
  check(data.dwellSeconds>=10&&data.devicePixelRatio===1.5,'Final matrix must use at least 10 seconds per case at DPR1.5');
  await currentHash('matrix sourceHTMLSHA256',data.sourceHTMLSHA256,path.join(PACK,'preview-standalone.html'));
  check(data.baselines?.length===2&&data.baselines.every(b=>samePackage(b.snapshot)),'Matrix baselines use stale source/package hashes');
  const actual=new Set((data.cases??[]).map(c=>[c.viewport?.join('x'),c.configuration?.environment,c.configuration?.athlete,c.configuration?.view,c.configuration?.clip].join('|')));
  check(actual.size===504,'Matrix contains duplicate configurations');
  for(const size of ['390x844','844x390'])for(const env of ['sunset','fog','night-floodlit'])for(let athlete=0;athlete<3;athlete++)for(const view of ['close','wide'])for(const clip of clipNames)check(actual.has([size,env,athlete,view,clip].join('|')),`Missing matrix combination: ${size}/${env}/${athlete}/${view}/${clip}`);
  check(data.cases?.every(c=>c.elapsedSeconds>=data.dwellSeconds&&c.snapshot?.bundleBuiltAt===proof.package?.bundleBuiltAt&&c.snapshot?.pixelRatio===1.5),'Matrix dwell duration, observed DPR, or package identity is inconsistent');
  for(const c of data.cases??[])for(const error of inspectMatrixCase(c,{bundleBuiltAt:proof.package?.bundleBuiltAt,minDwell:data.dwellSeconds,requireDiagnostics:true}).errors)errors.push('Matrix protocol: '+error);
  try{const continuationProof=await inspectMatrixContinuation({pack:PACK,report:data,cases:data.cases??[],complete:true});for(const error of continuationProof.errors)errors.push('Matrix continuation: '+error);}catch(error){errors.push('Matrix continuation: '+error.message);}
  const start=Date.parse(data.startedAt),end=Date.parse(data.completedAt);
  check(Number.isFinite(start)&&Number.isFinite(end)&&end<=Date.now()+1000&&(end-start)/1000>=504*data.dwellSeconds,'Matrix timestamps do not support the recorded run duration');
}
let scoreRows=[];
if(proof.scores){
  const rows=proof.scores.criteria??[];
  check(rows.length===6&&new Set(rows.map(r=>r.id)).size===6,'scores.json must contain exactly six unique criteria');
  check(Number.isFinite(Date.parse(proof.scores.reviewedAt))&&Date.parse(proof.scores.reviewedAt)<=Date.now()+1000,'scores.json reviewedAt must be an actual, non-future timestamp');
  check(Date.parse(proof.scores.reviewedAt)>=Date.parse(proof.offline?.builtAt),'Final visual scores predate the final packaged preview');
  for(const [id,label]of criteria){
    const row=rows.find(r=>r.id===id);
    if(!check(!!row,`Missing final score: ${id}`))continue;
    check(Number.isFinite(row.score)&&row.score>=8&&row.score<=10,`${id}: final score must be between 8 and 10`);
    check(typeof row.notes==='string'&&row.notes.trim().length>0,`${id}: final review notes are missing`);
    check(Array.isArray(row.evidence)&&row.evidence.length>0,`${id}: evidence list is empty`);
    for(const file of row.evidence??[]){try{check(typeof file==='string'&&(await fs.stat(local(file))).isFile(),`${id}: evidence is not a local file`);}catch(error){errors.push(`${id}: ${error.message}`);}}
    scoreRows.push(`| ${label} | ${row.score} | ${cell(row.notes)} | ${(row.evidence??[]).map(link).join(' · ')} |`);
  }
}
let durationMinutes=0;
if(proof.work){
  const start=Date.parse(proof.work.startedAt),end=Date.parse(proof.work.completedAt);
  durationMinutes=(end-start)/60000;
  check(Number.isFinite(start)&&Number.isFinite(end)&&end<=Date.now()+1000&&durationMinutes>=120,'Work log needs actual completed timestamps covering at least 120 minutes');
  for(const key of ['browser','matrix','repository'])if(proof[key])check(end>=Date.parse(proof[key].completedAt),`Work log ends before ${key} proof completed`);
}

let scope=[],base=null,branch=null,iterations=[];
try{
  base=await git('merge-base','HEAD','origin/main');branch=await git('branch','--show-current');
  check(branch==='codex/alpine-v7-20261105','Wrong final branch');
  const lines=[...(await git('diff','--name-status',base,'--')).split('\n'),...(await git('diff','--cached','--name-status','--')).split('\n')].filter(Boolean);
  for(const line of new Set(lines)){const [status,...names]=line.split('\t');for(const file of names){scope.push(file);check(status==='A'&&file.startsWith(PREFIX),`Out-of-scope tracked change: ${status} ${file}`);}}
  for(const file of (await git('ls-files','--others','--exclude-standard')).split('\n').filter(Boolean)){scope.push(file);check(file.startsWith(PREFIX),`New file outside authorized directory: ${file}`);}
  for(const file of scope)check(!/(^|\/)(CLAUDE\.md|release\.(json|mjs))$/.test(file)&&!file.startsWith('tests/'),`Protected task change: ${file}`);
  const dirs=(await fs.readdir(path.join(PACK,'iterations'),{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d\d$/.test(d.name)).map(d=>d.name).sort();
  check(dirs.length>=6,'At least six saved iterations are required');
  for(const id of dirs){
    const dir=path.join(PACK,'iterations',id),names=await fs.readdir(dir),review=names.find(n=>/(critique|review|ביקורת).*\.md$/i.test(n));
    check(!!review&&((await fs.readFile(path.join(dir,review),'utf8')).trim().length>=80),`Iteration ${id} is missing its substantive critique`);
    for(const name of ['near-390x844.webp','far-390x844.webp','near-844x390.webp','far-844x390.webp'])check(names.includes(name),`Iteration ${id} is missing ${name}`);
    iterations.push({id,review,captures:names.filter(n=>/\.(webp|png|jpe?g)$/i.test(n)).length});
  }
}catch(error){errors.push('Scope/iteration check: '+error.message);}
let weights='';
try{
  const lookup=new Map([...(proof.asset?.assets??[]),...(proof.asset?.externalTextures??[])].map(a=>[a.file,a]));
  const seen=new Set();
  weights=(await fs.readFile(path.join(PACK,'verification/asset-weights.md'),'utf8')).split('\n').filter(line=>!line.startsWith('# ')).map(line=>{
    const parts=line.split('|'),record=lookup.get(parts[1]?.trim());if(!record)return line;seen.add(record.file);
    if(record.triangles!==undefined){parts[2]=` ${fmt(record.triangles)} `;parts[3]=` ${mb(record.bytes)} `;parts[4]=` ${record.textures?.map(t=>`${t.width}×${t.height}`).join(', ')||'—'} `;}
    else{parts[2]=` ${mb(record.bytes)} `;parts[3]=` ${record.width}×${record.height} `;}
    return parts.join('|');
  }).join('\n').trim();
  check(seen.size===lookup.size,'asset-weights.md is missing audited files');
}catch(error){errors.push('Weight table: '+error.message);}
if(errors.length){console.error(JSON.stringify({written:false,checkOnly:CHECK,errors},null,2));process.exitCode=1;}
else if(CHECK)console.log(JSON.stringify({written:false,checkOnly:true,allPassed:true,iterations:iterations.length,matrixCases:proof.matrix.cases.length}));
else{
  async function walk(dir){const entries=await fs.readdir(dir,{withFileTypes:true});return(await Promise.all(entries.map(async e=>e.isDirectory()?walk(path.join(dir,e.name)):[{file:path.relative(PACK,path.join(dir,e.name)).replaceAll(path.sep,'/'),bytes:(await fs.stat(path.join(dir,e.name))).size}]))).flat();}
  const inventory=(await walk(PACK)).sort((a,b)=>b.bytes-a.bytes),largest=inventory.slice(0,10);
  const when=value=>new Date(value).toISOString();
  const denseSamples=proof.dense.characters.reduce((sum,c)=>sum+c.clips.reduce((s,k)=>s+k.samples,0),0),jsonSamples=proof.json.characters.reduce((sum,c)=>sum+c.clips.reduce((s,k)=>s+k.samples,0),0);
  const pineTriangles=[0,1,2].map(lod=>fmt(proof.asset.assets.find(a=>a.file===`world/models/pine-lod${lod}.glb`).triangles));
  const poses=proof.browser.checks.filter(c=>c.name.includes('full body and equipment framing')).reduce((sum,c)=>sum+(c.samples??0),0);
  const uiPoses=proof.browser.checks.filter(c=>c.name.includes('near fall and recovery hands clear of athlete controls')).reduce((sum,c)=>sum+(c.samples??0),0);
  const cameraTransitions=proof.browser.checks.filter(c=>c.name.includes('air to ground selection restores camera preset')).reduce((sum,c)=>sum+(c.samples??0),0);
  const softwareFPS=proof.matrix.cases.map(c=>c.snapshot.fps).filter(Number.isFinite);
  const softwareFPSRange=softwareFPS.length?`${Math.min(...softwareFPS).toFixed(2)}–${Math.max(...softwareFPS).toFixed(2)}`:'לא נרשם';
  const replayCount=proof.matrix.replayCases?.length??0;
  const observationMinutes=[...proof.matrix.cases,...(proof.matrix.replayCases??[])].reduce((sum,c)=>sum+c.progressObservation.observationElapsedMilliseconds,0)/60000;
  const laterCaptureFailures=[...proof.matrix.cases,...(proof.matrix.replayCases??[])].reduce((sum,c)=>sum+(c.captureAttempts??[]).filter(a=>!a.passed).length,0);
  const continuationText=proof.matrix.continuations?.length?`הקמפיין נקטע אחרי 285 מקרים שנשמרו, עקב timeout של 30 שניות בצילום המקרה הבא. הרשומה החלקית של 286 לא נספרה כהצלחה. יומן ההפסקה, 285 הרשומות ובקר ההרצה המקורי נשמרו ב־${link('verification/matrix/continuation-01/interruption.json')}; בדיקת ההמשך מאמתת את חותמות המקורות, זהות הבתים של הקידומת ושל 61 הצילומים המקוריים ושני ה־baselines המקוריים. ההמשך הפעיל הקשר דפדפן חדש למסך הרוחב ושחזר בו במלואם ${replayCount} מקרים, 253–285, לפני 286–504. השחזורים נשמרים בנפרד ב־${link('verification/matrix/replay-01/cases.jsonl')} ואינם נספרים בין 504 השילובים הייחודיים. כך רצף 252 מקרי הרוחב נבדק בהקשר החדש. נשמרו ${proof.matrix.controllerSegments.length} מקטעי בקר עם מקור ו־SHA לכל מקטע. משך הקמפיין כולל את ההפסקה; אין טענה לריצה רצופה של תהליך יחיד. זמן התצפיות המצטבר שנרשם במקרים ובשחזורים הוא ${observationMinutes.toFixed(1)} דקות. לצילומי ההמשך הוגדר timeout של ${proof.matrix.screenshotTimeoutSeconds} שניות וניסיון חוזר אחד לכל היותר על אותה תנוחה מושהית; נרשמו ${laterCaptureFailures} ניסיונות צילום כושלים נוספים, וכל צילום שנדרש למסירה הסתיים בהצלחה.`:'';
  const nav=proof.browser.localFileNavigation.status==='passed'?'ניווט ישיר ב־file:// עבר כשהרשת כבויה.':'ניווט ישיר ב־file:// נחסם ב־ERR_BLOCKED_BY_ADMINISTRATOR על ידי מדיניות הדפדפן המנוהל. לא בוצע עקף למדיניות. התנהגות הקובץ הוכחה באמצעות טעינת תוכן ה־HTML העצמאי ל־about:blank עם רשת כבויה; אין כאן אישור של ניווט file:// בסביבה זו.';
  const proofRows=[['מבנה GLB, Draco, שלד, UV וטקסטורות',files.asset,`${proof.asset.assets.length} GLB; ${proof.asset.externalTextures.length} תמונות חיצוניות`],['תנועות בכל LOD',files.motion,`${proof.motion.characters.length} קבצים × 14 קליפים × 121 דגימות`],['מגע ורציפות צפופים',files.dense,`${fmt(denseSamples)} דגימות`],['JSON מול קליפי GLB',files.json,`${fmt(jsonSamples)} דגימות`],['זהות חבילה ומקורות',files.package,`${proof.package.assets.length} נכסים; ${proof.package.modules.length} מודולים`],['ממשק, מסגור, חלקיקים ו־LOD',files.browser,`${fmt(poses)} בדיקות הקרנת גאומטריה; ${proof.browser.checks.length} שערים`],['רגרסיית המאגר',files.repository,`${fmt(proof.repository.pass)} עברו; ${fmt(proof.repository.skipped)} דולגו; ${proof.repository.fail} נכשלו`],['מטריצת רינדור',files.matrix,`504/504; ${proof.matrix.durationMinutes.toFixed(1)} דקות; DPR1.5`]].map(([name,file,detail])=>`| ${name} | עבר | ${detail} | ${link(file)} |`).join('\n');
  const report=`# אלפיין v7 — דוח מסירה

שלוש דמויות בדויות לסקי ולסנובורד, ציוד מלא, 14 אנימציות לכל דמות ועולם שלג תואם לשפה החזותית של alpine-v5. החבילה נמצאת ב־\`${PREFIX}\`; תצוגת הרינדור פועלת מקומית באמצעות Three.js r160 ו־Draco, ללא בנייה וללא תלות רשת בזמן שימוש.

## זמן והיקף

תחילת העבודה (UTC): **${when(proof.work.startedAt)}**. סיום העבודה (UTC): **${when(proof.work.completedAt)}**. משך מתועד: **${durationMinutes.toFixed(1)} דקות** (${link(files.work)}). כל חותמות הזמן בדוח הן ב־UTC.

נבדקו שינויי Git מול \`${base}\`: תוספות בלבד בתוך התיקייה המורשית, בענף \`${branch}\`. קוד קיים, release.json, release.mjs, CLAUDE.md ובדיקות קיימות אינם נכללים בשינויים. לא נוספו מותגים, סמלי מועדונים, דמויות של אנשים אמיתיים או נתוני לקוחות.

## ציון עצמי עם ראיות

הציונים מבוססים על הצילומים, תקריבי החומרים וראיות התנועה ב־${link(files.scores)}. ההערכה מתייחסת ליעד של משחק מובייל בגבולות התקציב; אין טענה לפוטוריאליזם.

| סעיף | ציון / 10 | ביקורת ומגבלה שנותרה | ראיות |
|---|---:|---|---|
${scoreRows.join('\n')}

## סבבי בנייה, צילום וביקורת

נשמרו **${iterations.length} סבבים**. בכל סבב ארבעה צילומי חובה: קרוב ורחוק ב־390×844 וב־844×390, וביקורת כתובה. ציוני ביניים שנכשלו נשמרו בתיעוד; הם אינם ציוני המסירה. ${link('iterations/index.html')} מציג את היומן המקומי.

| סבב | צילומים שנשמרו | ביקורת |
|---|---:|---|
${iterations.map(i=>`| ${i.id} | ${i.captures} | ${link(`iterations/${i.id}/${i.review}`)} |`).join('\n')}

## בדיקות שהושלמו

| בדיקה | תוצאה | כיסוי בפועל | דוח |
|---|---|---|---|
${proofRows}

בדיקות המסגור מקרינות את כל קודקודי הגוף והציוד לאחר skinning דרך מצלמת התצוגה בפועל, בשלוש דמויות, 14 קליפים, שני מרחקים ושתי אוריינטציות. זמני הדגימה כוללים שלבי ביניים צפופים נוספים בנפילה. במהלך סריקת גאומטריה זו בלבד מדלגים על רסטריזציה, תוך שמירת עדכון התנוחה, השלד והמצלמה. אלה ${fmt(poses)} בדיקות הקרנה, ולא אותו מספר של רינדורי GPU. בנוסף עברו ${fmt(uiPoses)} תנוחות בדיקה מול מלבן בקרות הדמות בפועל, ו־${fmt(cameraTransitions)} מעברי בחירת קליפ מאוויר לנפילה/קימה בדקו את זמן התנוחה ואת איפוס כיוון המצלמה. בדיקת החפיפה כוללת קודקודי ראש, אמות וידיים בעלי משקל שלד מעל 0.2, ודורשת אפס חפיפות. בדיקות הממשק והחלקיקים, צילומי הסבבים ומטריצת הרינדור מפעילים רינדור ממשי בנפרד.

מטריצת הרינדור מכסה בדיוק 3 דמויות × 14 קליפים × 3 סביבות × 2 מרחקים × 2 אוריינטציות = 504 שילובים ייחודיים. כל שילוב נוגן בפועל לפחות ${proof.matrix.dwellSeconds} שניות, עם לפחות שני רינדורים ושני שינויי זמן שנצפו בנפרד. ב־${proof.matrix.cases.filter(c=>c.endProbe).length} קליפים חד־פעמיים שלא הגיעו לסופם בזמן התצפית, בוצעה אחריה בדיקת סיום נפרדת באמצעות seek ל־50 מילישניות לפני סוף הקליפ והמתנה לעצירה אמיתית. מצב התצפית המקורי, עקבת ההתקדמות ותוצאת בדיקת הסיום נשמרים בנפרד; אין טענה שכל הקליפים הושלמו באופן טבעי בתוך עשר שניות תחת רינדור התוכנה. נבדקו גבולות משאבים גם לאחר בדיקת הסיום, ללא שגיאות JavaScript בקונסולה או בקשות HTTP חיצוניות. קמפיין המטריצה התחיל ב־${when(proof.matrix.startedAt)} והסתיימה ב־${when(proof.matrix.completedAt)}. הגלריה המקומית ${link('verification/matrix/index.html')} מסננת את הצילומים ומציינת אם התנוחה המצולמת שייכת לתצפית או לבדיקת סיום מסייעת. בדיקות התנועה הצפופות בודקות מגע מול משטח אופקי וקודקודי גוף בנפילה/קימה; הן אינן סימולציית התנגשויות מלאה.

מגבלות ההמתנה שהוגדרו במטריצה הן ${proof.matrix.minimumProgressTimeoutSeconds} שניות להשלמת תנאי ההתקדמות לאחר התצפית הראשונית, ו־${proof.matrix.endProbeTimeoutSeconds} שניות לבדיקת סיום מסייעת. הזמנים שנמדדו בפועל נשמרים בכל מקרה. נרשמו גם נראות ומיקוד הדף ופערי rAF, כולל הפער לפני התצפית הראשונה ואחרי האחרונה. סביבת ההרצה השתמשה ב־CPU affinity **${cell(proof.matrix.execution.cpuAffinity)}** ובמכסת cgroup **${cell(proof.matrix.execution.cpuQuota)}**; חותמת כלי ההרצה שמורה בדוח המטריצה. ניסיונות שנעצרו נשמרו בנפרד ואינם נספרים בין 504 המקרים האלה.

${continuationText}

## הפעלה מקומית וביצועים

פתחו את ${link('preview-standalone.html')} בדפדפן רגיל, או את ${link('preview.html')} לצד תיקיית \`offline/\`. דף התצוגה העצמאי הוא **${mb(proof.package.standalone.bytes)} MB** ומרכז מנוע, מפענח, כל הדמויות ורמות הפירוט, סביבות וממשק בדיקה. זהו משקל חבילת הביקורת הכוללת; מגבלת 1.5MB חלה על כל GLB בנפרד. ${link('README.md')} מתאר את דרך השילוב של הנכסים המקוריים במשחק.

${nav}

יעד הפלטפורמה הוא **30fps בטלפון בינוני**. המדידה נעשתה ב־Chromium/ANGLE SwiftShader בתוכנה ב־DPR **${proof.matrix.devicePixelRatio}**, בשני גדלי המסך המבוקשים. ערכי זמן הרינדור במטריצה הם זמני הגשת עבודה במעבד ואינם מדידת השלמת GPU. **30fps בטלפון פיזי לא אומתו**; נדרשת בדיקת מכשיר לפני אישור ביצועים למוצר. מספר המשולשים בסצנה כולל חזרות Instancing ומעברי צל; הוא שונה ממספר המשולשים המאוחסנים בקובץ בודד.

קצב הרינדור הנצפה בסביבת התוכנה במקרי המטריצה היה ${softwareFPSRange}fps. זו תוצאת סביבת הבדיקה המתועדת, והיא אינה מדידת ביצועים של טלפון.

נעשה שימוש ב־LOD לדמויות ולעצים, קהל ב־InstancedMesh ומאגר חלקיקים מוגבל. האורן הקרוב כולל גזע מלא, ענפים רדיאליים תלת־ממדיים וכרטיסי מחטים קצרים, ב־${pineTriangles[0]} משולשים. הרמה הבינונית משתמשת בשני כרטיסי עץ מצטלבים עם משטחי גב מפורשים, ב־${pineTriangles[1]} משולשים; הרמה הרחוקה היא billboard עם משטח גב, ב־${pineTriangles[2]} משולשים. שלוש הרמות חולקות אטלס 1024² אחד. סביב מעבר המרחק ב־15 מ׳ עדיין נראה שינוי בצללית הענפים, אף שהגובה והפרישה מותאמים; אין הבטחה למעבר בלתי נראה. ${link('world/verification-pine-lod.json')} מתעדת את גבול ה־LOD בפועל. מפות השלג יוצרות הבחנה חומרית, ללא סימולציה נפחית של שלג או קרח.

## משקלי נכסים

הטבלה מבוססת על ${link('verification/asset-weights.md')} ועל דוח הנכסים הדחוסים. MB עשרוני = 1,000,000 בתים; שש ספרות עשרוניות מציינות את מספר הבתים המדויק. בכל דמות אטלס יחיד, וכל תמונת טקסטורה מוגבלת ל־1024 בצלע.

${weights}

## הקבצים הגדולים

| קובץ | בתים | MB |
|---|---:|---:|
${largest.map(f=>`| ${link(f.file)} | ${fmt(f.bytes)} | ${mb(f.bytes)} |`).join('\n')}

${proof.package.deduplication?`מקטעי התוכן משחזרים ${fmt(proof.package.deduplication.originalAssetBytes)} בתים של נכסים מתוך ${fmt(proof.package.deduplication.uniqueChunkBytes)} בתים ייחודיים: חיסכון של ${fmt(proof.package.deduplication.savingsBytes)} בתים (${proof.package.deduplication.savingsPercent.toFixed(2)}%). קובצי GLB מקוריים נשארו עצמאיים.

`:''}## מקורות ושחזור

חותמות SHA-256 של מקור קנוני, נכסים, מקורות יצירה ומודולים נמצאות בדוחות הנכסים והחבילה. רישיונות המנוע והמפענח נמצאים ב־${link('licenses/three-MIT.txt')} וב־${link('licenses/draco-Apache-2.0.txt')}; הודעות הרישיון מוטמעות גם ב־HTML העצמאי. מקור האורנים והרקעים מתועד ב־${link('world/README.md')}, ותהליך התנועה ב־${link('motion/README.md')}.

פקודות הבדיקות מפורטות ב־${link('tools/audit-README.md')}. הכלי \`tools/report-final.mjs --check\` מאמת את תנאי יצירת הדוח ללא כתיבה. לאחר יצירתו מפעילים \`node workout/island/design/alpine-v7/tools/audit-delivery.mjs --modules /tmp/alpine-v7-tools\` כדי לעדכן את בדיקת המסירה ומלאי הקבצים.
`;
  await fs.writeFile(path.join(PACK,'REPORT.md'),report);
  console.log(JSON.stringify({written:true,file:'REPORT.md',bytes:Buffer.byteLength(report),iterations:iterations.length,matrixCases:504,durationMinutes}));
}
