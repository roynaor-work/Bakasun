// SPDX-License-Identifier: CC0-1.0
// Runs the original pinned motion-qa-v1 CLI. Only its closed source inventory is adapted.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(base,'../../../..'),output=path.join(base,'verification');
const pinned='5eb4f093bc22523ee417a7f2345c3b813bffba24',qaPath='workout/island/design/motion-qa-v1';
const workspace=await mkdtemp(path.join(tmpdir(),'soccer-keeper-motion-qa-'));
const qaRoot=path.join(workspace,qaPath),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(qaRoot,{recursive:true});
try{execFileSync('git',['cat-file','-e',`${pinned}^{commit}`],{cwd:repo,stdio:'pipe'});}
catch{execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',pinned],{cwd:repo,stdio:'inherit'});}
const provenance=[];
async function extract(relative){
  const bytes=execFileSync('git',['show',`${pinned}:${relative}`],{cwd:repo,maxBuffer:16*1024*1024});
  const target=path.join(workspace,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
  provenance.push({path:relative,commit:pinned,bytes:bytes.length,sha256:sha(bytes)});return bytes;
}
for(const file of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs'])
  await extract(`${qaPath}/${file}`);
await extract('workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js');
await writeFile(path.join(workspace,'package.json'),'{"type":"module"}\n');
// The hook exists only in the temporary workspace. No QA source is rewritten.
const hook=path.join(workspace,'keeper-register.mjs');
await writeFile(hook,`import {registerHooks} from 'node:module';\nconst runner=${JSON.stringify(pathToFileURL(path.join(qaRoot,'run.mjs')).href)};\nconst adapter=${JSON.stringify(pathToFileURL(path.join(base,'qa-sources.mjs')).href)};\nregisterHooks({resolve(specifier,context,nextResolve){if(context.parentURL===runner&&specifier==='./sources.mjs')return {url:adapter,shortCircuit:true};return nextResolve(specifier,context);}});\n`);
const env={...process.env,SOCCER_KEEPER_QA_ROOT:qaRoot,
  SOCCER_KEEPER_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
await mkdir(output,{recursive:true});
const invocation=['--import',pathToFileURL(hook).href,path.join(qaRoot,'run.mjs'),
  '--library','soccer-keeper-motion-v3','--fps','120','--out',path.join(output,'qa')];
const run=spawnSync(process.execPath,invocation,{cwd:repo,env,stdio:'inherit'});
if(run.status!==0)throw new Error(`Pinned motion-qa-v1 CLI failed (${run.status}).`);
process.env.SOCCER_KEEPER_QA_ROOT=qaRoot;process.env.SOCCER_KEEPER_SOURCE_COMMIT=env.SOCCER_KEEPER_SOURCE_COMMIT;
const {loadMotionAssets}=await import('../qa-sources.mjs');
const {parseGLB,readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const {catalog,clips}=await loadMotionAssets({fps:120});
const report=JSON.parse(await readFile(path.join(output,'qa/report.json'),'utf8'));
const primary=report.libraries.flatMap(l=>l.clips).filter(c=>!c.auxiliary);
const sourceBytes=await readFile(path.join(base,'motions.json'));
const canonical=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand',
  'RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const required=['keeper_ready','keeper_shuffle','keeper_dive_low','keeper_dive_high','keeper_catch_two_hands',
  'keeper_punch','keeper_throw','keeper_punt','keeper_celebrate','keeper_disappointed',
  'field_miss','field_group_celebrate','field_enter','field_clap'];
const checks=[];
for(const clip of primary){
  const entry=catalog.clips.find(c=>c.id===clip.id),loaded=clips.find(c=>c.id===clip.id);
  const bytes=await readFile(path.join(base,entry.asset??entry.glb??`clips/${entry.id}.glb`));
  const native=parseGLB(bytes),animation=native.json.animations.find(a=>a.name===(entry.animation??entry.id));
  const times=animation.samplers.map(s=>Array.from(readAccessor(native,s.input)));
  const assertions={scoreStrictlyAbove88:clip.score>88,completeApplicableMetrics:clip.coverage===1,
    noRedMetric:Object.values(clip.metrics).every(m=>m.status!=='red'),
    exactly18CanonicalJoints:Object.keys(loaded.frames[0].localJoints).length===18&&canonical.every(n=>n in loaded.frames[0].localJoints),
    native30Hz:times.every(a=>a.length===Math.round(loaded.nativeDuration*30)+1&&a.every((t,i)=>Math.abs(t-i/30)<1e-6)),
    sourceHash:!catalog.sourceMotionSha256||catalog.sourceMotionSha256===sha(sourceBytes),
    assetHash:!entry.sha256||entry.sha256===sha(bytes),assetBytes:entry.bytes===undefined||entry.bytes===bytes.length,
    measuredSupportWindows:loaded.metadata.supports.length>0,
    measuredIdleForCorrectRole:!!clip.idleReference&&roleForReference(clip.idleReference)===loaded.role,
    noCompressedGeometry:!JSON.stringify(native.json).includes('KHR_draco_mesh_compression')&&!JSON.stringify(native.json).includes('EXT_meshopt_compression')};
  checks.push({id:clip.id,score:clip.score,coverage:clip.coverage,idleReference:clip.idleReference,
    role:loaded.role,assertions,metrics:clip.metrics,sourceAsset:loaded.metadata.sourceAsset,sha256:sha(bytes)});
}
function roleForReference(id){return clips.find(c=>c.id===id)?.role;}
const failures=[...(primary.length===14?[]:['Expected exactly 14 primary clips.']),
  ...required.filter(id=>!primary.some(c=>c.id===id)).map(id=>`Missing ${id}.`),
  ...checks.flatMap(c=>Object.entries(c.assertions).filter(([,ok])=>!ok).map(([key])=>`${c.id}: ${key}`))];
const summary={schemaVersion:1,qaCommit:pinned,qaFiles:provenance,
  invocation:'Unmodified motion-qa-v1/run.mjs --library soccer-keeper-motion-v3 --fps 120; only sources.mjs inventory hook adapted.',
  nativeRate:30,measurementRate:120,primaryClips:primary.length,
  auxiliaryClips:report.libraries.flatMap(l=>l.clips).filter(c=>c.auxiliary).map(c=>({id:c.id,score:c.score,role:c.role})),
  sourceMotionSha256:sha(sourceBytes),minimumScore:Math.min(...primary.map(c=>c.score)),
  redMetrics:primary.reduce((sum,c)=>sum+Object.values(c.metrics).filter(m=>m.status==='red').length,0),
  checks,failures,passed:failures.length===0};
await writeFile(path.join(output,'requirements.json'),JSON.stringify(summary,null,2)+'\n');

// Portable HTML presentation: original report JSON, per-clip JSON and SVG stay untouched.
const escape=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const labels={green:'ירוק',yellow:'צהוב',red:'אדום','not-applicable':'לא חל','insufficient-data':'חסר מידע'};
const page=(title,body)=>`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;background:#101d28;color:#e7edf2;margin:auto;padding:20px;max-width:1400px}a{color:#8de3cb}table{border-collapse:collapse;width:100%}th,td{border:1px solid #456;padding:9px;text-align:right}img{width:100%;height:auto}pre{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.green{color:#8decbe}.yellow{color:#ffe18e}.red{color:#ff9696}.scroll{overflow:auto}</style><h1>${escape(title)}</h1>${body}</html>`;
for(const clip of report.libraries.flatMap(l=>l.clips)){
  const rows=Object.entries(clip.metrics).map(([key,m])=>`<tr><th>${escape(report.metricDefinitions[key].label)}</th><td class="${escape(m.status)}">${escape(labels[m.status])}</td><td>${escape(m.value??'—')}</td><td>${escape(m.score??'—')}</td><td><details><summary>ראיות מקוריות</summary><pre>${escape(JSON.stringify(m.evidence??m.reason,null,2))}</pre></details></td></tr>`).join('');
  await writeFile(path.join(output,'qa',clip.htmlPath),page(clip.id,
    `<p><a href="../report.html">כל המדידות</a> · <a href="../../../preview.html">תצוגת התנועה</a> · <a href="${escape(path.basename(clip.jsonPath))}">JSON מקורי</a></p><p>ציון ${clip.score} · כיסוי ${clip.coverage*100}%${clip.auxiliary?' · קליפ ייחוס עזר':''}</p><p>עמידת ייחוס באותו תפקיד: ${escape(clip.idleReference)}. תרחיש השחקן החיצוני מיושם פעם אחת.</p><img src="../${escape(clip.sheetPath)}" alt="שמונה פוזות שלד מדודות: ${escape(clip.id)}"><div class="scroll"><table><tr><th>מדד</th><th>מצב</th><th>ערך</th><th>ציון</th><th>ראיות</th></tr>${rows}</table></div>`));
}
const rows=report.libraries.flatMap(l=>l.clips).map(c=>`<tr><th dir="ltr"><a href="${escape(c.htmlPath)}">${escape(c.id)}</a>${c.auxiliary?' · ייחוס עזר':''}</th><td>${c.score}</td><td>${c.coverage*100}%</td><td>${Object.entries(c.metrics).map(([k,m])=>`<span class="${escape(m.status)}">${escape(report.metricDefinitions[k].label)}: ${escape(labels[m.status])}</span>`).join('<br>')}</td><td><a href="${escape(c.jsonPath)}">JSON</a> · <a href="${escape(c.sheetPath)}">8 פריימים</a></td></tr>`).join('');
await writeFile(path.join(output,'qa/report.html'),page('מדידת תנועה · שוערים ושחקנים v3',
  `<p><a href="../../preview.html">תצוגת תלת־ממד</a> · <a href="report.json">JSON מקורי מלא</a> · <a href="../requirements.json">אימות דרישות</a> · <a href="../../REPORT.md">דוח מסירה</a></p><p>14 קליפים חדשים, עמידת ייחוס עזר אחת; ציון מינימלי ${summary.minimumScore}; ${summary.redMetrics} מדדים אדומים. נוסחאות, ספים ומשקלי motion-qa-v1 ללא שינוי. זהו מדד אבחוני של השלד ונקודות המגע המוצהרות.</p><div class="scroll"><table><tr><th>קליפ</th><th>ציון</th><th>כיסוי</th><th>מדדים</th><th>ראיות</th></tr>${rows}</table></div>`));
console.log(JSON.stringify({primaryClips:summary.primaryClips,auxiliaryClips:summary.auxiliaryClips,
  minimumScore:summary.minimumScore,redMetrics:summary.redMetrics,passed:summary.passed,failures},null,2));
if(!summary.passed)process.exitCode=1;
