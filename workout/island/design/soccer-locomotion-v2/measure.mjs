// SPDX-License-Identifier: CC0-1.0
// Reproduce the unchanged pinned motion-qa-v1 CLI against this new library.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CANON_BONES,ATHLETE_STANDARD,gaitMetrics,checkGait,checkStand} from '../../minigames/athletes-core.mjs';

const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../../../..');
const pinned='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath='workout/island/design/motion-qa-v1',output=path.join(base,'verification');
const workspace=await mkdtemp(path.join(tmpdir(),'soccer-locomotion-qa-')),qaRoot=path.join(workspace,qaPath);
await mkdir(qaRoot,{recursive:true});
try {execFileSync('git',['cat-file','-e',`${pinned}^{commit}`],{cwd:repo,stdio:'pipe'});}
catch {execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',pinned],{cwd:repo,stdio:'inherit'});}
const provenance=[];
for (const file of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs']) {
  const bytes=execFileSync('git',['show',`${pinned}:${qaPath}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});
  await writeFile(path.join(qaRoot,file),bytes);
  provenance.push({path:`${qaPath}/${file}`,commit:pinned,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')});
}
await mkdir(path.join(qaRoot,'../soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),
  path.join(qaRoot,'../soccer-motion-v8/runtime/vendor'),'dir');
await mkdir(output,{recursive:true});
const env={...process.env,SOCCER_LOCOMOTION_QA_ROOT:qaRoot,
  SOCCER_LOCOMOTION_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
const command=['--import',pathToFileURL(path.join(base,'qa-register.mjs')).href,
  path.join(qaRoot,'run.mjs'),'--library','soccer-locomotion-v2','--fps','120','--out',path.join(output,'qa')];
const result=spawnSync(process.execPath,command,{cwd:repo,env,stdio:'inherit'});
if (result.status!==0) throw new Error(`Pinned QA CLI failed with exit ${result.status}`);
process.env.SOCCER_LOCOMOTION_QA_ROOT=qaRoot;
const {loadMotionAssets}=await import('./qa-sources.mjs');
const {parseGLB,readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const {catalog,clips}=await loadMotionAssets({fps:120});
const motionBytes=await readFile(path.join(base,'runtime/motions.json')),motions=JSON.parse(motionBytes);
const report=JSON.parse(await readFile(path.join(output,'qa/report.json'),'utf8'));
const qaClips=report.libraries[0].clips;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const nearest=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
function rotate(v,q) {
  const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
function point(frame,bone,local=[0,-.08,0]) {
  const offset=rotate(local,frame.rotations[bone]);
  return frame.joints[bone].map((v,i)=>v+offset[i]);
}
const sourceMotionHash=sha(motionBytes);
const canonicalDefinition=catalog.skeleton?.length===18 && CANON_BONES.every(reference=>{
  const b=catalog.skeleton.find(b=>b.name===reference.name);
  return b&&b.parent===reference.parent&&distance(b.rest??b.restTranslationMeters,reference.rest)<1e-8;
});
const checks=[];
for (const clip of clips) {
  const entry=catalog.clips.find(c=>c.id===clip.id),authored=motions.clips.find(c=>c.id===clip.id);
  const qa=qaClips.find(c=>c.id===clip.id);
  const bytes=await readFile(path.join(base,'runtime',entry.asset)),native=parseGLB(bytes);
  const timeArrays=native.json.animations.flatMap(a=>a.samplers.map(s=>Array.from(readAccessor(native,s.input))));
  const actual30Hz=timeArrays.every(times=>times.length===entry.frameCount&&
    times.every((t,i)=>Math.abs(t-i/30)<1e-6));
  let maxQuaternionError=0,maxHipsError=0;
  for (const f of authored.frames) {
    const actual=nearest(clip.frames,f.time);
    maxHipsError=Math.max(maxHipsError,distance(actual.localJoints.Hips,f.hips));
    for (const {name} of CANON_BONES) {
      const q=f.rotations[name],n=Math.hypot(...q),expected=q.map(v=>v/n);
      maxQuaternionError=Math.max(maxQuaternionError,Math.min(distance(actual.localRotations[name],expected),
        distance(actual.localRotations[name],expected.map(v=>-v))));
    }
  }
  const supportWindows=clip.metadata.supports.map(w=>{
    const frames=clip.frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6);
    const anchor=point(nearest(clip.frames,w.start),w.bone,w.local);
    return {bone:w.bone,start:w.start,end:w.end,samples:frames.length,
      maxHorizontalDriftMeters:Math.max(0,...frames.map(f=>horizontal(point(f,w.bone,w.local),anchor))),
      maxSpatialDriftMeters:Math.max(0,...frames.map(f=>distance(point(f,w.bone,w.local),anchor))),
      maxFloorDistanceMeters:Math.max(0,...frames.map(f=>Math.abs(point(f,w.bone,w.local)[1])))};
  });
  const canonical={name:clip.id,lib:'soccer-locomotion-v2',dur:clip.duration,loop:!!entry.loop,speed:entry.speedMps??0,
    frames:clip.frames.map(f=>({t:f.t,rot:f.localRotations,hips:f.localJoints.Hips.map((v,i)=>v-CANON_BONES[1].rest[i])}))};
  const athlete=gaitMetrics(canonical,120);
  const idle=entry.category==='idle',fullGait=!!entry.gaitKind&&(entry.loop||entry.athleteGait||entry.category==='turn');
  let athleteFailures=idle?checkStand(athlete):fullGait?checkGait(athlete,entry.gaitKind):[];
  if (!idle&&!fullGait) {
    if (athlete.armAbdMax>ATHLETE_STANDARD.gait.run.armAbdMax) athleteFailures.push(`arms ${athlete.armAbdMax}° (max 24°)`);
  }
  const rootNode=native.json.nodes.find(n=>n.name==='Root');
  const nativeCanonical=CANON_BONES.every(reference=>{
    const index=native.json.nodes.findIndex(n=>n.name===reference.name),node=native.json.nodes[index];
    const parent=native.json.nodes.find(n=>n.children?.includes(index));
    return node&&(parent?.name??null)===reference.parent&&distance(node.translation??[0,0,0],reference.rest)<1e-8;
  });
  const stillRoot=distance(rootNode.translation??[0,0,0],[0,0,0])<1e-8&&clip.frames.every(f=>
    distance(f.assetRoot,[0,0,0])<1e-6&&Math.min(distance(f.localRotations.Root,[0,0,0,1]),distance(f.localRotations.Root,[0,0,0,-1]))<1e-6);
  const names=Object.keys(clip.frames[0].localJoints);
  const assertions={
    score:qa?.score>=ATHLETE_STANDARD.feelScoreMin,
    noRedMetric:!!qa&&Object.values(qa.metrics).every(m=>m.status!=='red'),
    completeApplicableMetrics:qa?.coverage===1,
    sourceMotionHash:sourceMotionHash===catalog.sourceMotionSha256,
    assetHashAndBytes:sha(bytes)===entry.sha256&&bytes.length===entry.bytes,
    nativePoseMatchesSource:maxQuaternionError<1e-6&&maxHipsError<1e-6,
    canonical18:canonicalDefinition&&nativeCanonical&&names.length===18&&CANON_BONES.every(b=>names.includes(b.name)),
    native30Hz:actual30Hz&&entry.nativeRate===30&&entry.frameCount===Math.round(clip.duration*30)+1,
    rootStationary:stillRoot&&entry.rootMotion===false,
    noDraco:!JSON.stringify(native.json).includes('KHR_draco_mesh_compression'),
    noMeshopt:!JSON.stringify(native.json).includes('EXT_meshopt_compression'),
    externalScenarioDeclared:!clip.metadata.locomotion||!!entry.referenceTravel?.samples?.length,
    stanceWindowsDeclared:supportWindows.length>0&&supportWindows.every(w=>w.samples>=2&&w.end>w.start),
    stanceFootSlip2cm:supportWindows.length>0&&supportWindows.every(w=>w.maxSpatialDriftMeters<=.02+1e-6),
    athleteStandard:athleteFailures.length===0,
    transitionDuration:entry.category!=='transition'||clip.duration>=.3-1e-6&&clip.duration<=.5+1e-6,
  };
  checks.push({id:clip.id,score:qa?.score,assertions,
    nativePoseError:{maxQuaternionError,maxHipsErrorMeters:maxHipsError},
    athlete:{standardKind:idle?'stand':fullGait?entry.gaitKind:'one-shot arm spread (cycle-mean elbow/swing/lean rules apply to full gaits)',...athlete,failures:athleteFailures},
    supportWindows,maxStanceDriftMeters:Math.max(0,...supportWindows.map(w=>w.maxSpatialDriftMeters)),
    qaMetrics:qa?.metrics});
}
const requiredIds=['idle_relaxed','idle_weight_shift','idle_scan','walk','jog','run','sprint',
  'idle_to_run','run_to_idle','turn_left_45','turn_right_45','turn_left_90','turn_right_90',
  'turn_left_180','turn_right_180','strafe_left','strafe_right','run_backward','run_ball'];
const libraryAssertions={allRequiredClips:requiredIds.every(id=>checks.some(c=>c.id===id)),
  uniqueClipIds:new Set(checks.map(c=>c.id)).size===checks.length};
const failures=[...Object.entries(libraryAssertions).filter(([,ok])=>!ok).map(([check])=>`library: ${check}`),
  ...checks.flatMap(c=>Object.entries(c.assertions).filter(([,ok])=>!ok).map(([check])=>`${c.id}: ${check}`))];
const evidence={schemaVersion:1,qaCommit:pinned,qaFiles:provenance,
  qaInvocation:'Unmodified motion-qa-v1/run.mjs --library soccer-locomotion-v2 --fps 120; only sources.mjs inventory hook adapted',
  nativeRate:30,measurementRate:120,sourceMotionSha256:sourceMotionHash,
  coordinateSpace:'Native zero-root GLB plus explicit external actor position/heading for contact and body speed. Native pose retained separately for continuity.',
  athleteStandard:ATHLETE_STANDARD,requiredIds,libraryAssertions,clips:checks.length,minimumScore:Math.min(...checks.map(c=>c.score)),
  redMetrics:qaClips.reduce((sum,c)=>sum+Object.values(c.metrics).filter(m=>m.status==='red').length,0),
  maxStanceDriftMeters:Math.max(...checks.map(c=>c.maxStanceDriftMeters)),checks,failures,passed:failures.length===0};
await writeFile(path.join(output,'requirements.json'),JSON.stringify(evidence,null,2)+'\n');

// Presentation only. Original numerical report.json and per-clip JSON remain untouched.
const escape=value=>String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status={green:'ירוק',yellow:'צהוב',red:'אדום','not-applicable':'לא חל','insufficient-data':'חסר מידע'};
const style='body{font:16px system-ui;background:#101d28;color:#e7edf2;margin:0 auto;padding:24px;max-width:1400px}a{color:#8de3cb}table{border-collapse:collapse;width:100%;background:#162838}th,td{border:1px solid #456;padding:10px;text-align:right}img{width:100%;height:auto;background:white}pre{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.green{color:#8decbe}.yellow{color:#ffe18e}.red{color:#ff9696}.number{font-size:1.4em}';
const page=(title,body)=>`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style><h1>${escape(title)}</h1>${body}</html>`;
for (const clip of qaClips) {
  const metrics=Object.entries(clip.metrics).map(([key,m])=>`<tr><th>${escape(report.metricDefinitions[key].label)}</th><td class="${escape(m.status)}">${escape(status[m.status])}</td><td>${escape(m.value??'—')}</td><td>${escape(m.score??'—')}</td><td><details><summary>ראיות מקוריות</summary><pre>${escape(JSON.stringify(m.evidence??m.reason,null,2))}</pre></details></td></tr>`).join('');
  const body=`<p><a href="../report.html">כל הקליפים</a> · <a href="../../../preview.html">תצוגת התנועה</a> · <a href="${escape(path.basename(clip.jsonPath))}">JSON המקור</a></p><p class="number">ציון ${clip.score} · כיסוי ${clip.coverage*100}%</p><p>הסוליות נמדדות בתרחיש תנועה חיצוני מוצהר; Root בנכס נשאר קבוע. הרציפות משתמשת בפוזה המקומית.</p><img src="../${escape(clip.sheetPath)}" alt="שמונה פריימים: ${escape(clip.id)}"><table><thead><tr><th>מדד</th><th>מצב</th><th>ערך</th><th>ציון</th><th>ראיות</th></tr></thead><tbody>${metrics}</tbody></table>`;
  await writeFile(path.join(output,'qa',clip.htmlPath),page(clip.id,body));
}
const rows=qaClips.map(c=>`<tr><th dir="ltr"><a href="${escape(c.htmlPath)}">${escape(c.id)}</a></th><td>${c.score}</td><td>${c.coverage*100}%</td><td>${Object.entries(c.metrics).map(([key,m])=>`<span class="${escape(m.status)}">${escape(report.metricDefinitions[key].label)}: ${escape(status[m.status])}</span>`).join('<br>')}</td><td><a href="${escape(c.jsonPath)}">JSON</a> · <a href="${escape(c.sheetPath)}">8 פריימים</a></td></tr>`).join('');
await writeFile(path.join(output,'qa/report.html'),page('מדידת תנועה · כדורגל v2',`<p><a href="../../preview.html">תצוגת תלת־ממד</a> · <a href="report.json">JSON מקורי</a> · <a href="../requirements.json">אימות דרישות</a> · <a href="../../REPORT.md">דוח מסירה</a></p><p>${evidence.clips} קליפים; מינימום ${evidence.minimumScore}; ${evidence.redMetrics} מדדים אדומים. נוסחאות וספי motion-qa-v1 ללא שינוי. הציון הוא מדד אבחוני הנדסי; נבדקים השלד ונקודות סוליה מוצהרות.</p><table><thead><tr><th>קליפ</th><th>ציון</th><th>כיסוי</th><th>מדדים</th><th>ראיות</th></tr></thead><tbody>${rows}</tbody></table>`));
console.log(JSON.stringify({qaRoot,clips:evidence.clips,minScore:evidence.minimumScore,redMetrics:evidence.redMetrics,
  maxStanceDriftMeters:evidence.maxStanceDriftMeters,passed:evidence.passed,failures},null,2));
if (!evidence.passed) process.exitCode=1;
