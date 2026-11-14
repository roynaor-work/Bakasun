// SPDX-License-Identifier: CC0-1.0
// Native binary QA adapter. The pinned motion-qa-v1 metrics remain byte-for-byte unchanged.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeClip,METRICS} from '../vendor/qa/metrics.mjs';
import {sampleGLB,parseGLB,readAccessor} from '../vendor/qa/glb.mjs';

const base=fileURLToPath(new URL('../',import.meta.url));
const qaCommit='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const expected=['volley_right','volley_left','scissor_backward','scissor_land_getup','header_prepare','header_jump_neutral'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const qangle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b))))*180/Math.PI;
const qm=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rotate=(q,v)=>qm(qm(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
const point=(f,bone,local=[0,0,0])=>f.joints[bone].map((v,i)=>v+rotate(f.rotations[bone],local)[i]);
const nearest=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
const sole=[0,-.08,0];

export function track(keys,t){
 if(!keys?.length)return null;
 const value=k=>k.position??k.positionMeters;
 if(t<=keys[0].time)return [...value(keys[0])];
 for(let i=1;i<keys.length;i++)if(t<=keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time);return value(a).map((v,j)=>v+(value(b)[j]-v)*u);}
 return [...value(keys.at(-1))];
}

export async function loadAssets({fps=120}={}){
 const records=[];
 async function bytes(relative){const buffer=await readFile(path.join(base,relative));records.push({path:relative,bytes:buffer.length,sha256:hash(buffer)});return buffer;}
 const catalog=JSON.parse(await bytes('catalog.json'));
 const sourceBytes=await bytes('motions.json'),motions=JSON.parse(sourceBytes);
 async function load(entry,asset,reference=false){
  const events=(entry.events??[]).map(e=>({...e,type:e.type??e.name,time:e.time??e.timeSeconds??e.atSeconds??e.frame/30,bone:e.bone??e.effector,local:e.local??e.localPointMeters}));
  const supports=(entry.supports??entry.supportWindows??[]).map(w=>({...w,start:w.start??w.startSeconds,end:w.end??w.endSeconds,local:w.local??sole}));
  const contacts=events.filter(e=>e.type==='contact'&&e.bone);
  const buffer=await bytes(asset),doc=parseGLB(buffer);
  const native=sampleGLB(doc,{fps,extraTimes:[...events.map(e=>e.time),...supports.flatMap(w=>[w.start,w.end])]});
  const nativeFrames=structuredClone(native.frames);
  const travel=entry.referenceRootMotion?.samples;
  for(const f of native.frames){
   f.ball=track(entry.ball?.samples??entry.ball?.keys,f.t);
   f.rawJoints=structuredClone(f.joints);f.rawRotations=structuredClone(f.rotations);f.assetRoot=[...f.root];
   f.referenceRoot=track(travel,f.t)??[0,0,0];
   if(travel?.length){
    f.joints=Object.fromEntries(Object.entries(f.joints).map(([name,p])=>[name,p.map((v,i)=>v+f.referenceRoot[i])]));
    f.root=f.root.map((v,i)=>v+f.referenceRoot[i]);
    f.floorPoints=f.floorPoints.map(p=>({...p,position:p.position.map((v,i)=>v+f.referenceRoot[i])}));
    if(f.ball&&entry.ball?.coordinateSpace!=='world')f.ball=f.ball.map((v,i)=>v+f.referenceRoot[i]);
   }
  }
  const radius=entry.ball?.radius??entry.ball?.radiusMeters??.11;
  return {id:entry.id,entry,asset,doc,bytes:buffer,nativeFrames,frames:native.frames,duration:native.duration,height:native.height,
   metadata:{...entry,events,supports,contacts,ball:{...entry.ball,radius},ballRadius:radius,
    ballVisible:!reference&&!!entry.ball,locomotion:entry.locomotion??false,checkHingeDirection:true,
    soleLocal:sole,floorY:0,symmetryMode:entry.symmetryMode??'structural',
    coordinateSpace:'native GLB metres; explicitly declared reference travel applied once'}};
 }
 const clips=[];
 for(const entry of catalog.clips)clips.push(await load(entry,entry.asset??`clips/${entry.id}.glb`));
 const idle=await load({id:'idle_relaxed'},'reference/idle_relaxed.glb',true);
 const run=await load({id:'run'},'reference/run.glb',true);
 return {catalog,motions,sourceBytes,clips,idle,run,records};
}

function supportEvidence(clip){
 return clip.metadata.supports.map(w=>{
  const frames=clip.frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6),anchor=point(nearest(clip.frames,w.start),w.bone,w.local);
  return {...w,sampleCount:frames.length,
   maxDriftMeters3D:Math.max(0,...frames.map(f=>distance(point(f,w.bone,w.local),anchor))),
   maxDriftMetersHorizontal:Math.max(0,...frames.map(f=>{const p=point(f,w.bone,w.local);return Math.hypot(p[0]-anchor[0],p[2]-anchor[2]);})),
   maxFloorDistanceMeters:Math.max(0,...frames.map(f=>Math.abs(point(f,w.bone,w.local)[1])))};
 });
}

function angularVelocity(a,b,dt){
 let q=qm([-a[0],-a[1],-a[2],a[3]],b);if(q[3]<0)q=q.map(v=>-v);
 const s=Math.hypot(...q.slice(0,3)),angle=2*Math.atan2(s,q[3]);
 return s<1e-12?[0,0,0]:q.slice(0,3).map(v=>v*angle/(s*dt));
}
function seam(a,b,names){
 const end=a.nativeFrames.at(-1),prior=a.nativeFrames.at(-2),start=b.nativeFrames[0],next=b.nativeFrames[1];
 const dtA=end.t-prior.t,dtB=next.t-start.t;
 const vel=(x,y,dt)=>y.map((v,i)=>(v-x[i])/dt);
 const p0=end.joints.Hips,p1=start.joints.Hips;
 const angular=names.map(name=>distance(angularVelocity(prior.localRotations[name],end.localRotations[name],dtA),angularVelocity(start.localRotations[name],next.localRotations[name],dtB)));
 const result={from:a.id,to:b.id,positionMeters:distance(p0,p1),maxRotationDegrees:Math.max(...names.map(n=>qangle(end.localRotations[n],start.localRotations[n]))),
  velocityMetersPerSecond:distance(vel(prior.joints.Hips,p0,dtA),vel(p1,next.joints.Hips,dtB)),maxAngularVelocityRadiansPerSecond:Math.max(...angular)};
 result.passed=result.positionMeters<1e-6&&result.maxRotationDegrees<1e-4&&result.velocityMetersPerSecond<1e-5&&result.maxAngularVelocityRadiansPerSecond<1e-3;
 return result;
}

export async function verify(){
 const qaDir=path.join(base,'verification/qa');await mkdir(qaDir,{recursive:true});
 const canonical=JSON.parse(await readFile(new URL('../../motion/soccer.json',import.meta.url))).skeleton.bones;
 const names=canonical.map(b=>b.name),allRuns=[],failures=[];
 for(const fps of [60,120]){
  const assets=await loadAssets({fps}),{clips,idle,run,catalog,motions}=assets;
  if(clips.length!==6||expected.some(id=>!clips.some(c=>c.id===id)))failures.push(`${fps}Hz: expected exactly the six requested clips`);
  const byId=new Map(clips.map(c=>[c.id,c]));
  function reference(c,direction){
   const id=c.entry[direction]?.reference;
   if(id==='run')return run.frames;
   if(id&&byId.has(id)){const f=byId.get(id).frames;return direction==='entry'?f.slice(-2):f.slice(0,2);}
   if(c.id==='scissor_backward'&&direction==='exit')return byId.get('scissor_land_getup').frames.slice(0,2);
   if(c.id==='scissor_land_getup'&&direction==='entry')return byId.get('scissor_backward').frames.slice(-2);
   return idle.frames;
  }
  const outputs=[];
  for(const c of clips){
   if(c.id==='volley_right')c.metadata.mirrorFrames=byId.get('volley_left').frames;
   if(c.id==='volley_left')c.metadata.mirrorFrames=byId.get('volley_right').frames;
   const analysis=analyzeClip({frames:c.frames,duration:c.duration,height:c.height,metadata:c.metadata,
    idleFrames:{entry:reference(c,'entry'),exit:reference(c,'exit')},clipId:c.id,sport:'soccer'});
   const supports=supportEvidence(c);
   const animation=c.doc.json.animations?.[0];
   const arrays=animation.samplers.map(s=>Array.from(readAccessor(c.doc,s.input)));
   const durationFrames=Math.round(c.duration*30)+1;
   const native30Hz=arrays.every(times=>times.length===durationFrames&&times.every((t,i)=>Math.abs(t-i/30)<1e-6));
   const canonical18=c.doc.json.skins?.every(s=>s.joints.length===18&&s.joints.every((j,i)=>c.doc.json.nodes[j].name===names[i]))&&
    canonical.every(b=>{const i=c.doc.json.nodes.findIndex(n=>n.name===b.name),n=c.doc.json.nodes[i],parent=c.doc.json.nodes.find(p=>(p.children??[]).includes(i));
     return n&&distance(n.translation??[0,0,0],b.restTranslationMeters)<1e-6&&(parent?.name??null)===(b.parent??null);});
   const assetHashMatches=(!c.entry.sha256||hash(c.bytes)===c.entry.sha256)&&(!c.entry.bytes||c.entry.bytes===c.bytes.length);
   const source=motions.clips?.find(x=>x.id===c.id);let maxHipsError=0,maxQuaternionError=0;
   if(source?.frames)for(const frame of source.frames){const f=nearest(c.nativeFrames,frame.time??frame.t);maxHipsError=Math.max(maxHipsError,distance(f.joints.Hips,frame.hips));
    for(const name of names){const q=frame.rotations[name];maxQuaternionError=Math.max(maxQuaternionError,Math.min(distance(f.localRotations[name],q),distance(f.localRotations[name],q.map(x=>-x))));}}
   const heightRange=c.id.startsWith('volley_')?[.5,1.2]:c.id==='scissor_backward'?[1.8,2.4]:c.id==='header_jump_neutral'?[1.5,2.2]:null;
   const contacts=c.metadata.contacts.map(event=>{const f=nearest(c.frames,event.time),p=point(f,event.bone,event.local),pelvis=f.joints.Hips,relative=p.map((v,i)=>v-pelvis[i]),q=f.rotations.Hips;
    return {timeSeconds:event.time,bone:event.bone,boneLocalPointMeters:event.local??[0,0,0],contactPointMeters:p,
     contactPointFromPelvisMeters:relative,contactPointPelvisLocalMeters:rotate([-q[0],-q[1],-q[2],q[3]],relative),ballCenterMeters:f.ball,ballCenterHeightMeters:f.ball?.[1],
     ballSurfaceGapMeters:f.ball?Math.abs(distance(p,f.ball)-c.metadata.ballRadius):null,requestedBallCenterHeightRangeMeters:heightRange};});
   const checks={scoreAbove88:analysis.score>88,completeApplicableMetrics:analysis.coverage===1,native30Hz,canonical18:!!canonical18,
    noCompression:!JSON.stringify(c.doc.json).includes('KHR_draco_mesh_compression')&&!JSON.stringify(c.doc.json).includes('EXT_meshopt_compression'),
    assetHashMatches,sourceMotionHashMatches:!catalog.sourceMotionSha256||hash(assets.sourceBytes)===catalog.sourceMotionSha256,
    sourcePoseMatchesGLB:!!source?.frames&&maxHipsError<1e-6&&maxQuaternionError<1e-6,
    ballContactPresent:!heightRange||contacts.length>0,
    ballContactWithinRequestedHeight:!heightRange||contacts.every(e=>e.ballCenterHeightMeters>=heightRange[0]&&e.ballCenterHeightMeters<=heightRange[1]),
    ballSurfaceContactWithin2mm:contacts.every(e=>e.ballSurfaceGapMeters!==null&&e.ballSurfaceGapMeters<.002),
    contactTimeMarkedOnNativeFrame:c.metadata.contacts.every(e=>Number.isInteger(e.frame)&&Math.abs(e.time-e.frame/30)<1e-8),
    catalogContactPointMatchesGLB:contacts.every((e,i)=>{const declared=c.metadata.contacts[i];return distance(e.contactPointMeters,declared.pointMeters??declared.position??[])<2e-5&&distance(e.contactPointFromPelvisMeters,declared.pelvisRelativePointMeters??[])<2e-5;}),
    requestedGetupDuration:c.id!=='scissor_land_getup'||Math.abs(c.entry.recovery?.getupDurationSeconds-.6)<1e-9&&Math.abs(c.entry.recovery.getupCompleteSeconds-c.entry.recovery.getupStartSeconds-.6)<1e-9&&c.entry.recovery.getupNativeIntervals===18,
    measuredPlantedSupport:supports.some(w=>w.end-w.start>=.06),
    plantedSlideBelow2cm:supports.every(w=>w.maxDriftMeters3D<.02),
    plantedSoleWithin2cmOfFloor:supports.every(w=>w.maxFloorDistanceMeters<.02)};
   for(const [key,ok]of Object.entries(checks))if(!ok)failures.push(`${fps}Hz ${c.id}: ${key}`);
   const output={id:c.id,fps,durationSeconds:c.duration,heightProxyMeters:c.height,score:analysis.score,coverage:analysis.coverage,metrics:analysis.metrics,scoring:analysis.scoring,reasons:analysis.reasons,
    checks,contacts,supportWindows:supports,sourcePoseError:{maxHipsErrorMeters:maxHipsError,maxQuaternionError},asset:c.asset,sha256:hash(c.bytes)};
   outputs.push(output);await writeFile(path.join(qaDir,`${c.id}-${fps}hz.json`),JSON.stringify(output,null,2)+'\n');
  }
  const directSeam=seam(byId.get('scissor_backward'),byId.get('scissor_land_getup'),names);
  if(!directSeam.passed)failures.push(`${fps}Hz scissor direct seam is not C1`);
  allRuns.push({fps,clips:outputs,directSeam,sources:assets.records});
 }
 const metricsBytes=await readFile(path.join(base,'vendor/qa/metrics.mjs'));
 const metricsGitBlob=createHash('sha1').update(`blob ${metricsBytes.length}\0`).update(metricsBytes).digest('hex');
 if(metricsGitBlob!=='a986793b77f32177edf5a8231a44d2258294366e')failures.push('Pinned QA metrics differ from original Git blob');
 // Record exact identity; the original Git blob ID also independently identifies the source.
 const qaSource={commit:qaCommit,metricsGitBlob,metricsSha256:hash(metricsBytes),
  metricsBytes:metricsBytes.length,parserNote:'Pinned glb.mjs; only its three.module.js import was relocated into this package.'};
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),qaSource,metricDefinitions:METRICS,
  method:'Unmodified motion-qa-v1 analyzeClip on exported GLB FLOAT tracks, sampled at 60 and 120Hz plus native key times and declared contact/support boundaries. Ball path comes from independent authored catalog samples. In-place root is never translated implicitly.',
  limits:['Diagnostic weighted score is not a human perceptual grade.','Floor metric covers skeletal joints and declared sole probes; rendered mesh clearance is verified separately.','Direct scissor seam uses adjacent actual serialized poses. Bridges to idle and run are measured separately.'],
  summary:{clips:6,minimumScore:Math.min(...allRuns.flatMap(r=>r.clips.map(c=>c.score))),coverage:Math.min(...allRuns.flatMap(r=>r.clips.map(c=>c.coverage))),
   maximumPlantedSlideMeters3D:Math.max(0,...allRuns.flatMap(r=>r.clips.flatMap(c=>c.supportWindows.map(w=>w.maxDriftMeters3D)))),
   maximumPlantedFloorDistanceMeters:Math.max(0,...allRuns.flatMap(r=>r.clips.flatMap(c=>c.supportWindows.map(w=>w.maxFloorDistanceMeters)))),
   failures:[...new Set(failures)],passed:failures.length===0},runs:allRuns};
 await writeFile(path.join(qaDir,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary,null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verify().then(r=>{if(!r.summary.passed)process.exitCode=1;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
