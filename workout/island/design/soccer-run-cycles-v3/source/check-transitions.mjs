// SPDX-License-Identifier: CC0-1.0
// Measures the decoded Float32 native GLB tracks, not the authoring curves.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,readAccessor} from './glb.mjs';
import {sampleMotion,poseVelocity,makeClipBridge,interruptBridge} from '../runtime/player.mjs';

const base=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('catalog.json',base)));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b))));
const thresholds={poseMeters:1e-8,poseRadians:1e-6,hipsVelocityMps:1e-4,angularVelocityRadps:.003,maximum240HzRotationStepRadians:Math.PI/18};
const decoded=new Map();
for(const entry of catalog.clips){
 const bytes=await readFile(new URL(entry.asset,base)),glb=unpack(bytes),doc=glb.document,a=doc.animations[0],tracks=[];
 for(const channel of a.channels){const s=a.samplers[channel.sampler];if((s.interpolation??'LINEAR')!=='LINEAR')throw Error('Unexpected interpolation');tracks.push({name:doc.nodes[channel.target.node].name,path:channel.target.path,times:readAccessor(glb,s.input).values,values:readAccessor(glb,s.output).values});}
 const h=tracks.find(t=>t.name==='Hips'&&t.path==='translation'),r=tracks.filter(t=>t.path==='rotation');
 if(r.length!==18||!h)throw Error('Not a canonical18 animation');
 const frames=h.times.map((time,i)=>({time,hips:h.values.slice(i*3,i*3+3),rotations:Object.fromEntries(r.map(t=>[t.name,t.values.slice(i*4,i*4+4)]))}));
 decoded.set(entry.id,{id:entry.id,loop:entry.loop,frames,duration:frames.at(-1).time,sha256:createHash('sha256').update(bytes).digest('hex')});
}
function poseError(a,b){return {hipsMeters:dist(a.hips,b.hips),rotationRadians:Math.max(...Object.keys(a.rotations).map(n=>angle(a.rotations[n],b.rotations[n])))};}
function velocityError(a,b,pa,pb){let rotation=0;for(const n of Object.keys(a.rotations)){const q=pa.rotations[n],sign=dot(q,pb.rotations[n])<0?-1:1,v=a.rotations[n].map((v,i)=>v-sign*b.rotations[n][i]),project=dot(q,v)/dot(q,q);rotation=Math.max(rotation,2*Math.hypot(...v.map((v,i)=>v-project*q[i])));}return {hipsMetersPerSecond:dist(a.hips,b.hips),angularRadiansPerSecond:rotation};}
const nearestTime=(m,t)=>m.frames.reduce((a,b)=>Math.abs(b.time-t)<Math.abs(a.time-t)?b:a).time;
function measure({sample,duration},source,sourceTime,target,targetTime){
 const from=t=>sampleMotion(source,t),to=t=>sampleMotion(target,t);
 const a=sample(0),b=sample(duration),pa=from(sourceTime),pb=to(targetTime);
 const c0={start:poseError(a,pa),end:poseError(b,pb)};
 const c1={start:velocityError(poseVelocity(sample,0,{side:'right',delta:1e-7}),poseVelocity(from,sourceTime,{side:'left',delta:1e-7}),a,pa),end:velocityError(poseVelocity(sample,duration,{side:'left',delta:1e-7}),poseVelocity(to,targetTime,{side:'right',delta:1e-7}),b,pb)};
 let maxRotationStep=0,maxHipsStep=0,previous=a;
 for(let i=1;i<=Math.ceil(duration*240);i++){const current=sample(Math.min(duration,i/240)),e=poseError(previous,current);maxRotationStep=Math.max(maxRotationStep,e.rotationRadians);maxHipsStep=Math.max(maxHipsStep,e.hipsMeters);previous=current;}
 const passed=Object.values(c0).every(v=>v.hipsMeters<thresholds.poseMeters&&v.rotationRadians<thresholds.poseRadians)&&Object.values(c1).every(v=>v.hipsMetersPerSecond<thresholds.hipsVelocityMps&&v.angularRadiansPerSecond<thresholds.angularVelocityRadps)&&maxRotationStep<thresholds.maximum240HzRotationStepRadians;
 return {c0,c1,maxRotationStepRadians:maxRotationStep,maxHipsStepMeters:maxHipsStep,passed};
}
const baked=[];
for(const entry of catalog.clips.filter(c=>c.nativeHandoff)){
 const h=entry.nativeHandoff,m=decoded.get(entry.id),s=decoded.get(h.source),t=decoded.get(h.target),st=nearestTime(s,h.sourcePhaseSeconds),tt=nearestTime(t,h.targetPhaseSeconds);
 const result=measure({sample:x=>sampleMotion(m,x,{loop:false}),duration:m.duration},s,st,t,tt);
 baked.push({id:entry.id,source:s.id,target:t.id,sourcePhaseSeconds:st,targetPhaseSeconds:tt,sha256:m.sha256,...result});
}
const helper=[];
for(const id of ['jog','run','sprint','referee_run'])for(const direction of [true,false]){
 const source=decoded.get(direction?'idle_relaxed':id),target=decoded.get(direction?id:'idle_relaxed'),fromTime=direction?.173:source.duration*.371,toTime=direction?target.duration*.689:.217;
 const bridge=makeClipBridge({fromMotion:source,toMotion:target,fromTime,toTime,duration:.8});
 helper.push({id:`generic_${source.id}_to_${target.id}`,...measure(bridge,source,fromTime,target,toTime)});
}
const idle=decoded.get('idle_relaxed'),sprint=decoded.get('sprint'),active=makeClipBridge({fromMotion:idle,toMotion:sprint,fromTime:.17,toTime:sprint.duration*.37,duration:.8}),elapsed=.29;
const interrupted=interruptBridge({active,elapsed,toMotion:idle,toTime:.21,duration:.8});
const interruptedStart=poseError(interrupted.sample(0),active.sample(elapsed));
const interruptedVelocity=velocityError(poseVelocity(interrupted.sample,0,{side:'right',delta:1e-7}),poseVelocity(active.sample,elapsed,{side:'left',delta:1e-7}),interrupted.sample(0),active.sample(elapsed));
const interruptedPass=interruptedStart.hipsMeters<thresholds.poseMeters&&interruptedStart.rotationRadians<thresholds.poseRadians&&interruptedVelocity.hipsMetersPerSecond<thresholds.hipsVelocityMps&&interruptedVelocity.angularRadiansPerSecond<thresholds.angularVelocityRadps;
const output={schemaVersion:1,description:'C1 verification on decoded native LINEAR/slerp GLBs and generic interrupted Hermite helper',thresholds,baked,helper,interrupted:{pose:interruptedStart,velocity:interruptedVelocity,passed:interruptedPass},passed:baked.length===8&&baked.every(c=>c.passed)&&helper.every(c=>c.passed)&&interruptedPass};
await mkdir(new URL('verification/',base),{recursive:true});await writeFile(new URL('verification/transitions.json',base),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({baked:baked.length,maximumC0Meters:Math.max(...baked.flatMap(c=>Object.values(c.c0).map(v=>v.hipsMeters))),maximumC1Mps:Math.max(...baked.flatMap(c=>Object.values(c.c1).map(v=>v.hipsMetersPerSecond))),maximumC1Radps:Math.max(...baked.flatMap(c=>Object.values(c.c1).map(v=>v.angularRadiansPerSecond))),failed:baked.filter(c=>!c.passed).map(c=>c.id),passed:output.passed},null,2));
if(!output.passed)process.exitCode=1;
