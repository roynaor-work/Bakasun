#!/usr/bin/env node
/** Reproducible original 30Hz performances; writes only within this new package. */
import {mkdir,readFile,writeFile,open,unlink} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {CATALOG} from '../runtime/catalog.mjs';
import {SKELETON} from '../runtime/skeleton.mjs';
import {bakePose,forwardKinematics,rotate,add,sub,norm,dot,mul,axis,euler,qmul,HAND_CONTACT_POINT,SOLE_POINT} from './authoring.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const r8=x=>Math.abs(x)<1e-11?0:Math.round(x*1e10)/1e10;
const clean=x=>typeof x==='number'?r8(x):Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clean(v)])):x;
const point=(frame,name,local)=>{const b=forwardKinematics(frame)[name];return add(b.position,rotate(b.rotation,local));};
function intervals(flags,make){const out=[];let start=-1;for(let i=0;i<=flags.length;i++){if(flags[i]&&start<0)start=i;if(!flags[i]&&start>=0){out.push(make(start,i-1));start=-1;}}return out;}
function deriveSupports(poses){const n=poses.length-1,out=[];for(const effector of ['LeftFoot','RightFoot']){const points=poses.map(p=>add(p.feet[effector].sole,p.reference));const flags=points.map((p,i)=>p[1]<.0015&&Math.min(i?norm(sub(p,points[i-1])):Infinity,i<n?norm(sub(p,points[i+1])):Infinity)<.004);out.push(...intervals(flags,(a,b)=>({effector,startTime:a/n,endTime:b/n,kind:'plant',localPointMeters:SOLE_POINT})).filter(w=>w.endTime-w.startTime>=1/n-1e-8));}return out;}
function deriveContacts(poses){const n=poses.length-1,out=[];for(const effector of ['LeftHand','RightHand'])out.push(...intervals(poses.map(p=>p.hands[effector].contact),(a,b)=>({effector,startTime:a/n,endTime:b/n,localPointMeters:HAND_CONTACT_POINT})));return out;}
function phaseIntervals(poses,module,meta){
  const n=poses.length-1,out=[];let start=0,name=poses[0].phase;
  for(let i=1;i<=n;i++)if(poses[i].phase!==name){let lo=(i-1)/n,hi=i/n;for(let j=0;j<35;j++){const mid=(lo+hi)/2;if(module.pose(meta,mid).phase===name)lo=mid;else hi=mid;}out.push({startTime:start,endTime:hi,name});start=hi;name=poses[i].phase;}
  if(start<1-1e-9)out.push({startTime:start,endTime:1,name});return out;
}
export async function buildClip(meta){
  const module=await import(`./${meta.group==='locomotion'?'locomotion':meta.group==='attack'?'attack':'actions'}.mjs`);
  const def=module.definitions?.(meta)||{};const shot=['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(meta.kind);const release=shot?def.events?.find(e=>e.name==='release')?.time:null;const releasePose=release!==null&&release!==undefined?module.pose(meta,release):null;const n=Math.round(meta.durationSeconds*30),poses=[],keyframes=[];let reach=0,reachBone={},ballSpin=0;
  for(let i=0;i<=n;i++){
    const t=i/n,p=module.pose(meta,t);if(!p.phase)p.phase=meta.ball?'held':'empty';if(!meta.ball)p.ball=[0,-.5,0];
    const frame=bakePose(p,t);const bodyBall=euler(0,p.yaw+p.twist*.5);
    // A gathered ball follows the body rather than spinning through fixed palms.
    if(!meta.ball)frame.ballRotationQuaternion=[0,0,0,1];
    else if(shot&&t>release)frame.ballRotationQuaternion=qmul(axis([1,0,0],10*(t-release)*meta.durationSeconds),euler(0,releasePose.yaw+releasePose.twist*.5));
    else if(shot)frame.ballRotationQuaternion=bodyBall;
    else if(meta.loop&&p.phase.startsWith('dribble'))frame.ballRotationQuaternion=qmul(bodyBall,axis([1,0,0],Math.PI*2*t));
    else {const held=!p.phase.startsWith('dribble')&&Object.values(p.hands).some(h=>h.contact);if(i&&!held)ballSpin+=8/30;frame.ballRotationQuaternion=qmul(bodyBall,axis([1,0,0],ballSpin));}
    reach=Math.max(reach,frame._reachError);for(const [bone,e]of Object.entries(frame._reachByBone))if(e>(reachBone[bone]?.error||0))reachBone[bone]={error:e,time:t};
    delete frame._reachError;delete frame._reachByBone;
    if(i)for(const name of Object.keys(frame.rotations))if(dot(frame.rotations[name],keyframes[i-1].rotations[name])<0)frame.rotations[name]=mul(frame.rotations[name],-1);
    keyframes.push(frame);poses.push(p);
  }
  if(meta.loop){const first=keyframes[0],last=keyframes[n];for(const k of ['rotations','hipsOffsetMeters','ballPositionMeters','ballRotationQuaternion'])last[k]=structuredClone(first[k]);}
  const events=(def.events||[]).map(e=>({...e,atSeconds:e.time*meta.durationSeconds,domain:'presentation'})).sort((a,b)=>a.time-b.time);
  const supportWindows=(def.supportWindows||deriveSupports(poses)).map(w=>{
    const frame=bakePose(module.pose(meta,w.startTime),w.startTime);
    return {...w,kind:w.kind||'plant',localPointMeters:w.localPointMeters||SOLE_POINT,startSeconds:w.startTime*meta.durationSeconds,endSeconds:w.endTime*meta.durationSeconds,anchorMeters:point(frame,w.effector,w.localPointMeters||SOLE_POINT)};
  });
  const ballContactWindows=def.ballContactWindows||deriveContacts(poses);
  const ballContacts=ballContactWindows.flatMap(w=>[w.startTime,(w.startTime+w.endTime)/2,w.endTime].map(t=>{const frame=keyframes[Math.round(t*n)];const at=point(frame,w.effector,w.localPointMeters||HAND_CONTACT_POINT);return{time:frame.time,atSeconds:frame.time*meta.durationSeconds,effector:w.effector,localPointMeters:w.localPointMeters||HAND_CONTACT_POINT,effectorPositionMeters:at,ballCenterMeters:frame.ballPositionMeters,surfaceDistanceMeters:norm(sub(at,frame.ballPositionMeters))};}));
  return clean({schemaVersion:1,kind:'hoops-motion-v9-clip',...meta,clip:meta.id,sampleRate:30,rootMotion:false,units:'meters',axes:SKELETON.axes,skeleton:SKELETON,
    interpolation:'30Hz uniform keys; LINEAR vectors and shortest-arc SLERP quaternions',
    authorship:{type:'original procedural performance',license:'CC0-1.0',source:`source/${meta.group==='locomotion'?'locomotion':meta.group==='attack'?'attack':'actions'}.mjs`,motionCapture:false},
    events,supportWindows,ballContactWindows,ballContacts,...(def.courtTarget?{courtTarget:def.courtTarget}:{}),phases:def.phases?.length?def.phases:phaseIntervals(poses,module,meta),keyframes,
    ball:{radiusMeters:.12,visible:!!meta.ball,coordinateSpace:'canonical-root-local-in-place',simulationOwned:true,trajectory:keyframes.map((f,i)=>({time:f.time,positionMeters:f.ballPositionMeters,rotationQuaternion:f.ballRotationQuaternion,phase:poses[i].phase}))},
    diagnostics:{maximumReachErrorMeters:reach,reachByBone:reachBone},
    semantics:{events:'presentation only; never gameplay authority',root:'Root identity; Hips rest plus offset; referenceRootTranslationMeters descriptive only, host owns motion',support:'world diagnostic assumes external reference trajectory; use IK after blend',ballContact:'hand guide meets ball surface until release; simulation owns live ball'}});
}
export async function buildMotion({ids=null}={}){await mkdir(new URL('../runtime/keyframes/',import.meta.url),{recursive:true});const rows=[];for(const meta of CATALOG.filter(m=>!ids||ids.includes(m.id))){const clip=await buildClip(meta),bytes=gzipSync(JSON.stringify(clip),{level:9,mtime:0});await writeFile(new URL(`../${meta.json}`,import.meta.url),bytes);rows.push({id:meta.id,keys:clip.keyframes.length,jsonBytes:bytes.length,reachError:clip.diagnostics.maximumReachErrorMeters,reachByBone:clip.diagnostics.reachByBone});}return rows;}
async function main(){const ids=process.argv.slice(2).filter(x=>!x.startsWith('--'));const lockPath='/tmp/hoops-v9-'+hash(Buffer.from(root)).slice(0,12)+'.lock';const lock=await open(lockPath,'wx');try{const sources=['runtime/catalog.mjs','runtime/skeleton.mjs','source/authoring.mjs','source/locomotion.mjs','source/attack.mjs','source/actions.mjs','source/model.mjs','source/export-glb.mjs','source/build.mjs'];const before=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(resolve(root,p)))])));const rows=await buildMotion({ids:ids.length?ids:null});console.log(JSON.stringify(rows));if(!process.argv.includes('--json-only')){const {exportClips}=await import('./export-glb.mjs');const result=await exportClips({ids:ids.length?ids:null});console.log(JSON.stringify(result));}await mkdir(new URL('../verification/',import.meta.url),{recursive:true});await writeFile(new URL('../verification/build.json',import.meta.url),JSON.stringify({sampleRate:30,sourceMain:'main',baseCommit:'d1af33d98b73b4763a399c260fcaa3621fc1792f',sourceSha256:before,rows},null,2)+'\n');for(const [p,sha]of Object.entries(before))if(hash(await readFile(resolve(root,p)))!==sha)throw new Error('Source changed during build: '+p);}finally{await lock.close();await unlink(lockPath);}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
