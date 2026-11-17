// SPDX-License-Identifier: CC0-1.0
// Run the immutable motion-qa-v1 reader against the new, explicitly declared source inventory.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CANON_BONES,CANON_NAMES,ATHLETE_STANDARD,gaitMetrics,checkGait,checkStand} from '../../minigames/athletes-core.mjs';
import {writeQAPages} from './source/present-qa.mjs';

const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../../../..');
const pinned='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath='workout/island/design/motion-qa-v1',output=path.join(base,'verification');
const workspace=await mkdtemp(path.join(tmpdir(),'hoops-motion-v13-qa-')),qaRoot=path.join(workspace,qaPath);
await mkdir(qaRoot,{recursive:true});
try {execFileSync('git',['cat-file','-e',`${pinned}^{commit}`],{cwd:repo,stdio:'pipe'});}
catch {execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',pinned],{cwd:repo,stdio:'inherit'});}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),provenance=[];
for(const file of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs']) {
  const bytes=execFileSync('git',['show',`${pinned}:${qaPath}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});
  await writeFile(path.join(qaRoot,file),bytes);
  provenance.push({path:`${qaPath}/${file}`,commit:pinned,bytes:bytes.length,sha256:sha(bytes)});
}
await mkdir(path.join(qaRoot,'../soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),path.join(qaRoot,'../soccer-motion-v8/runtime/vendor'),'dir');
await mkdir(output,{recursive:true});
const env={...process.env,HOOPS_MOTION_QA_ROOT:qaRoot,
  HOOPS_MOTION_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
const command=['--import',pathToFileURL(path.join(base,'qa-register.mjs')).href,
  path.join(qaRoot,'run.mjs'),'--library','hoops-motion-v13','--fps','120','--out',path.join(output,'qa')];
const result=spawnSync(process.execPath,command,{cwd:repo,env,stdio:'inherit'});
if(result.status!==0)throw new Error(`Pinned motion QA failed with exit ${result.status}`);
process.env.HOOPS_MOTION_QA_ROOT=qaRoot;
const {loadMotionAssets}=await import('./qa-sources.mjs');
const {parseGLB,readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const {catalog,clips}=await loadMotionAssets({fps:120});
const motionBytes=await readFile(path.join(base,'runtime/motions.json')),motions=JSON.parse(motionBytes);
const report=JSON.parse(await readFile(path.join(output,'qa/report.json'),'utf8'));
const qaClips=report.libraries[0].clips;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const nearest=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
const correlation=(a,b)=>{
  const mean=values=>values.reduce((sum,v)=>sum+v,0)/values.length,A=mean(a),B=mean(b);
  return a.reduce((sum,v,i)=>sum+(v-A)*(b[i]-B),0)/Math.max(1e-12,Math.sqrt(a.reduce((sum,v)=>sum+(v-A)**2,0)*b.reduce((sum,v)=>sum+(v-B)**2,0)));
};
function rotate(v,q){
  const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
function point(frame,bone,local=[0,-.08,0]){
  const offset=rotate(local,frame.rotations[bone]);return frame.joints[bone].map((v,i)=>v+offset[i]);
}
const sourceMotionHash=sha(motionBytes);
const canonicalDefinition=catalog.skeleton?.length===18&&CANON_BONES.every(reference=>{
  const bone=catalog.skeleton.find(b=>b.name===reference.name);
  return bone&&bone.parent===reference.parent&&distance(bone.rest??bone.restTranslationMeters,reference.rest)<1e-8;
});
const checks=[];
for(const clip of clips){
  const entry=catalog.clips.find(c=>c.id===clip.id),authored=motions.clips.find(c=>c.id===clip.id),qa=qaClips.find(c=>c.id===clip.id);
  const bytes=await readFile(path.join(base,'runtime',entry.asset)),native=parseGLB(bytes);
  const timeArrays=native.json.animations.flatMap(a=>a.samplers.map(s=>Array.from(readAccessor(native,s.input))));
  const actual30Hz=timeArrays.every(times=>times.length===entry.frameCount&&times.every((t,i)=>Math.abs(t-i/30)<1e-6));
  let maxQuaternionError=0,maxHipsError=0;
  if(authored)for(const frame of authored.frames){
    const actual=nearest(clip.frames,frame.time);
    maxHipsError=Math.max(maxHipsError,distance(actual.localJoints.Hips,frame.hips));
    for(const {name}of CANON_BONES){
      const q=frame.rotations[name],expected=q.map(v=>v/Math.hypot(...q));
      maxQuaternionError=Math.max(maxQuaternionError,Math.min(distance(actual.localRotations[name],expected),distance(actual.localRotations[name],expected.map(v=>-v))));
    }
  }
  const supportWindows=clip.metadata.supports.map(window=>{
    const frames=clip.frames.filter(f=>f.t>=window.start-1e-6&&f.t<=window.end+1e-6),anchor=point(nearest(clip.frames,window.start),window.bone,window.local);
    return {bone:window.bone,start:window.start,end:window.end,samples:frames.length,
      maxHorizontalDriftMeters:Math.max(0,...frames.map(f=>horizontal(point(f,window.bone,window.local),anchor))),
      maxSpatialDriftMeters:Math.max(0,...frames.map(f=>distance(point(f,window.bone,window.local),anchor))),
      maxFloorDistanceMeters:Math.max(0,...frames.map(f=>Math.abs(point(f,window.bone,window.local)[1])))};
  });
  const canonical={name:clip.id,lib:'hoops-motion-v13',dur:clip.duration,loop:!!entry.loop,speed:entry.speedMps??0,
    frames:clip.frames.map(f=>({t:f.t,rot:f.localRotations,hips:f.localJoints.Hips.map((v,i)=>v-CANON_BONES[1].rest[i])}))};
  const athlete=gaitMetrics(canonical,120),fullGait=!!entry.gaitKind&&entry.athleteGait!==false;
  const forward=(side,kind)=>clip.frames.map(frame=>{
    const joints=frame.localJoints,a=kind==='arm'?side+'ForeArm':side+'Leg',b=kind==='arm'?side+'Arm':side+'UpLeg';
    return joints[a][2]-joints[b][2];
  });
  const counterPhase={leftArmVersusLeftLeg:correlation(forward('Left','arm'),forward('Left','leg')),
    rightArmVersusRightLeg:correlation(forward('Right','arm'),forward('Right','leg')),
    leftArmVersusRightArm:correlation(forward('Left','arm'),forward('Right','arm'))};
  const idle=/^idle(?:_|$)/.test(clip.id);
  const athleteFailures=idle?checkStand(athlete):fullGait?checkGait(athlete,entry.gaitKind):[];
  const nativeCanonical=CANON_BONES.every(reference=>{
    const index=native.json.nodes.findIndex(n=>n.name===reference.name),node=native.json.nodes[index],parent=native.json.nodes.find(n=>n.children?.includes(index));
    return node&&(parent?.name??null)===reference.parent&&distance(node.translation??[0,0,0],reference.rest)<1e-8;
  });
  const names=Object.keys(clip.frames[0].localJoints),rootNode=native.json.nodes.find(n=>n.name==='Root');
  const stillRoot=distance(rootNode.translation??[0,0,0],[0,0,0])<1e-8&&clip.frames.every(frame=>distance(frame.assetRoot,[0,0,0])<1e-6&&Math.min(distance(frame.localRotations.Root,[0,0,0,1]),distance(frame.localRotations.Root,[0,0,0,-1]))<1e-6);
  const events=clip.metadata.events;
  const bounceEvents=events.filter(e=>e.type==='bounce').map(event=>{
    const frame=nearest(clip.frames,event.time),radius=clip.metadata.ballRadius;
    return {time:event.time,surfaceHeightMeters:frame.ball?frame.ball[1]-radius:null,
      atFloor:!!frame.ball&&Math.abs(frame.ball[1]-radius)<=.02};
  });
  const assertions={
    score:qa?.score>=ATHLETE_STANDARD.feelScoreMin,
    noRedMetric:!!qa&&Object.values(qa.metrics).every(metric=>metric.status!=='red'),
    completeApplicableMetrics:qa?.coverage===1,
    sourceMotionHash:sourceMotionHash===catalog.sourceMotionSha256,
    assetHashAndBytes:sha(bytes)===entry.sha256&&bytes.length===entry.bytes,
    nativePoseMatchesSource:!!authored&&maxQuaternionError<1e-6&&maxHipsError<1e-6,
    canonical18:canonicalDefinition&&nativeCanonical&&names.length===18&&CANON_NAMES.every(name=>names.includes(name)),
    native30Hz:actual30Hz&&entry.nativeRate===30&&entry.frameCount===Math.round(clip.duration*30)+1,
    durationMatchesFrameTimes:Math.abs(clip.duration-(entry.frameCount-1)/30)<1e-6,
    rootStationary:stillRoot&&entry.rootMotion===false,
    noDraco:!JSON.stringify(native.json).includes('KHR_draco_mesh_compression'),
    noMeshopt:!JSON.stringify(native.json).includes('EXT_meshopt_compression'),
    externalScenarioDeclared:!clip.metadata.locomotion||!!entry.referenceTravel?.samples?.length,
    stanceWindowsDeclared:supportWindows.length>0&&supportWindows.every(w=>w.samples>=2&&w.end>w.start),
    stanceWindowsOnFloor:supportWindows.length>0&&supportWindows.every(w=>w.maxFloorDistanceMeters<=.02+1e-6),
    stanceFootSlip2cm:supportWindows.length>0&&supportWindows.every(w=>w.maxSpatialDriftMeters<=.02+1e-6),
    athleteStandard:athleteFailures.length===0,
    contralateralArmSwing:!['jog','run','sprint'].includes(clip.id)||counterPhase.leftArmVersusLeftLeg<-.5&&counterPhase.rightArmVersusRightLeg<-.5&&counterPhase.leftArmVersusRightArm<-.7,
    dribbleBounce:!/^dribble_/.test(clip.id)||bounceEvents.length>0&&bounceEvents.every(event=>event.atFloor),
    passRelease:!/^pass_/.test(clip.id)||events.some(event=>event.type==='release'),
    shotReleaseOrContact:!['jump_shot','set_shot','layup','dunk','fadeaway','block','steal_reach'].includes(clip.id)||events.some(event=>['release','contact'].includes(event.type)),
    eventsInRange:events.every(event=>event.time>=0&&event.time<=clip.duration+1e-6),
    eightFrameSheet:((await readFile(path.join(output,'qa',qa.sheetPath),'utf8')).match(/ \/ 8 · /g)??[]).length===8,
  };
  checks.push({id:clip.id,score:qa?.score,assertions,
    nativePoseError:{maxQuaternionError,maxHipsErrorMeters:maxHipsError},
    athlete:{standardKind:idle?'stand':fullGait?entry.gaitKind:'action (gait cycle limits do not apply to purposeful arm reaches)',...athlete,counterPhase,failures:athleteFailures},
    supportWindows,maxStanceDriftMeters:Math.max(0,...supportWindows.map(w=>w.maxSpatialDriftMeters)),bounceEvents,qaMetrics:qa?.metrics});
}
const requiredIds=['idle','idle_ball','jog','run','sprint','accelerate','stop','turn_45','turn_90','turn_180','cross','defensive_slide','defense_stance',
  'dribble_stand','dribble_run','dribble_cross','dribble_behind','dribble_spin','dribble_low','pass_chest','pass_bounce','pass_overhead','pass_behind',
  'jump_shot','set_shot','layup','dunk','fadeaway','block','steal_reach','celebrate_short','disappointed'];
const libraryAssertions={allRequiredClips:requiredIds.every(id=>checks.some(c=>c.id===id)),
  exactly32PhysicalClips:checks.length===32,uniqueClipIds:new Set(checks.map(c=>c.id)).size===checks.length,
  leanIncreasesWithSpeed:['jog','run','sprint'].every((id,i,ids)=>i===0||checks.find(c=>c.id===id).athlete.lean>checks.find(c=>c.id===ids[i-1]).athlete.lean)};
const failures=[...Object.entries(libraryAssertions).filter(([,ok])=>!ok).map(([check])=>`library: ${check}`),
  ...checks.flatMap(c=>Object.entries(c.assertions).filter(([,ok])=>!ok).map(([check])=>`${c.id}: ${check}`))];
const evidence={schemaVersion:1,qaCommit:pinned,qaFiles:provenance,
  qaInvocation:'Unmodified motion-qa-v1/run.mjs --library hoops-motion-v13 --fps 120; only sources.mjs inventory hook adapted',
  nativeRate:30,measurementRate:120,sourceMotionSha256:sourceMotionHash,
  coordinateSpace:'Native zero-root GLB plus explicit external actor position/heading for body travel and support drift. Native poses retained separately for continuity.',
  athleteStandard:ATHLETE_STANDARD,requiredIds,libraryAssertions,clips:checks.length,minimumScore:Math.min(...checks.map(c=>c.score)),
  redMetrics:qaClips.reduce((sum,c)=>sum+Object.values(c.metrics).filter(metric=>metric.status==='red').length,0),
  maxStanceDriftMeters:Math.max(...checks.map(c=>c.maxStanceDriftMeters)),checks,failures,passed:failures.length===0};
await writeFile(path.join(output,'requirements.json'),JSON.stringify(evidence,null,2)+'\n');
await writeQAPages({output,report,evidence});
console.log(JSON.stringify({qaRoot,clips:evidence.clips,minScore:evidence.minimumScore,redMetrics:evidence.redMetrics,maxStanceDriftMeters:evidence.maxStanceDriftMeters,passed:evidence.passed,failures},null,2));
if(!evidence.passed)process.exitCode=1;
