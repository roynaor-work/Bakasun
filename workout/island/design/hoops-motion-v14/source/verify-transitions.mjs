// SPDX-License-Identifier: CC0-1.0
// Continuous idle/run entry, exit and interruption measurements from serialized GLB poses.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {readMotion} from './read-motion.mjs';
import {makeClipBridge,interruptBridge,sampleMotion,poseVelocity} from '../runtime/player.mjs';

const base=new URL('../',import.meta.url),catalog=JSON.parse(readFileSync(new URL('runtime/catalog.json',base)));
const clips=catalog.clips.map(entry=>readMotion(new URL(`runtime/${entry.asset}`,base),entry));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b))))*180/Math.PI;
const thresholds={endpointHipsMeters:1e-9,endpointRotationDegrees:1e-5,
  endpointHipsVelocityMetersPerSecond:1e-4,endpointAngularVelocityRadiansPerSecond:.01,
  maximum240HzHipsStepMeters:.02,maximum240HzRotationStepDegrees:10};
function poseResidual(a,b){return {hipsMeters:distance(a.hips,b.hips),rotationDegrees:Math.max(...Object.keys(a.rotations).map(name=>angle(a.rotations[name],b.rotations[name])))};}
function velocityResidual(actual,expected,actualPose,expectedPose){
  let maximum=0;
  for(const name of Object.keys(actual.rotations)){
    const q=actualPose.rotations[name],sign=dot(q,expectedPose.rotations[name])<0?-1:1;
    const difference=actual.rotations[name].map((v,i)=>v-expected.rotations[name][i]*sign),projection=dot(difference,q)/dot(q,q);
    maximum=Math.max(maximum,2*Math.hypot(...difference.map((v,i)=>v-projection*q[i])));
  }
  return {hipsMetersPerSecond:distance(actual.hips,expected.hips),rotationRadiansPerSecond:maximum};
}
function measure(transition,from,to,fromTime,toTime){
  const duration=transition.duration,start=transition.sample(0),end=transition.sample(duration),sourcePose=from(fromTime),targetPose=to(toTime);
  const c0={start:poseResidual(start,sourcePose),end:poseResidual(end,targetPose)};
  const c1={
    start:velocityResidual(poseVelocity(transition.sample,0,{side:'right',delta:1e-7}),poseVelocity(from,fromTime,{side:'left'}),start,sourcePose),
    end:velocityResidual(poseVelocity(transition.sample,duration,{side:'left',delta:1e-7}),poseVelocity(to,toTime,{side:'right'}),end,targetPose),
  };
  let maxHipsStepMeters=0,maxRotationStepDegrees=0,maxUnitQuaternionError=0,rootFixed=true,finite=true,previous=start;
  const rate=240,count=Math.ceil(duration*rate);
  for(let i=0;i<=count;i++){
    const current=transition.sample(Math.min(duration,i/rate)),change=poseResidual(previous,current);
    maxHipsStepMeters=Math.max(maxHipsStepMeters,change.hipsMeters);maxRotationStepDegrees=Math.max(maxRotationStepDegrees,change.rotationDegrees);
    for(const q of Object.values(current.rotations)){finite&&=q.every(Number.isFinite);maxUnitQuaternionError=Math.max(maxUnitQuaternionError,Math.abs(Math.hypot(...q)-1));}
    finite&&=current.hips.every(Number.isFinite);rootFixed&&=current.rotations.Root.every((v,j)=>v===[0,0,0,1][j]);previous=current;
  }
  const pass=Object.values(c0).every(r=>r.hipsMeters<thresholds.endpointHipsMeters&&r.rotationDegrees<thresholds.endpointRotationDegrees)
    &&Object.values(c1).every(r=>r.hipsMetersPerSecond<thresholds.endpointHipsVelocityMetersPerSecond&&r.rotationRadiansPerSecond<thresholds.endpointAngularVelocityRadiansPerSecond)
    &&maxHipsStepMeters<thresholds.maximum240HzHipsStepMeters&&maxRotationStepDegrees<thresholds.maximum240HzRotationStepDegrees
    &&maxUnitQuaternionError<1e-12&&rootFixed&&finite;
  return {durationSeconds:duration,sampleRate:rate,sampleCount:count+1,c0,c1,maxHipsStepMeters,maxRotationStepDegrees,maxUnitQuaternionError,rootFixed,finite,pass};
}
const referenceBase=new URL('../../hoops-motion-v13/',import.meta.url);
const referenceCatalog=JSON.parse(readFileSync(new URL('runtime/catalog.json',referenceBase)));
const references=['idle','run'].map(id=>{const entry=referenceCatalog.clips.find(c=>c.id===id);if(!entry)throw Error(`Missing reference ${id}`);return readMotion(new URL(`runtime/${entry.asset}`,referenceBase),entry);});
const phases=[{name:'cycle-boundary',from:0,to:0},{name:'moving-interior',from:.371,to:.613},{name:'exit-to-moving',from:1,to:.231}],results=[];
for(const clip of clips)for(const reference of references)for(const direction of ['entry','exit']){
  const a=direction==='entry'?reference:clip,b=direction==='entry'?clip:reference,from=t=>sampleMotion(a,t),to=t=>sampleMotion(b,t);
  for(const phase of phases){
    const fromTime=a.duration*phase.from,toTime=b.duration*phase.to;
    const transition=makeClipBridge({fromMotion:a,toMotion:b,fromTime,toTime,duration:.4});
    results.push({clip:clip.id,reference:reference.id,direction,from:a.id,to:b.id,kind:phase.name,fromTime,toTime,...measure(transition,from,to,fromTime,toTime)});
  }
  const active=makeClipBridge({fromMotion:a,toMotion:b,fromTime:a.duration*.217,toTime:b.duration*.487,duration:.4}),elapsed=.173,toTime=a.duration*.719;
  const interrupted=interruptBridge({active,elapsed,toMotion:a,toTime,duration:.4});
  results.push({clip:clip.id,reference:reference.id,direction,from:a.id,activeTarget:b.id,to:a.id,kind:'interrupt-moving-bridge',fromTime:elapsed,toTime,...measure(interrupted,active.sample,from,elapsed,toTime)});
}
const nativeHandoffs=[];
for(const entry of catalog.clips.filter(entry=>entry.nativeHandoff)){
  const transition=clips.find(c=>c.id===entry.id),declaration=entry.nativeHandoff;
  const source=clips.find(c=>c.id===declaration.source),target=clips.find(c=>c.id===declaration.target);
  if(!source||!target)throw Error(`Unknown native handoff endpoint: ${entry.id}`);
  for(const [kind,a,aTime,b,bTime]of [
    ['entry',source,declaration.sourcePhaseSeconds??0,transition,0],
    ['exit',transition,transition.duration,target,declaration.targetPhaseSeconds??0],
  ]){
    const from=t=>sampleMotion(a,t),to=t=>sampleMotion(b,t),fromPose=from(aTime),toPose=to(bTime),c0=poseResidual(fromPose,toPose);
    const c1=velocityResidual(poseVelocity(to,bTime,{side:'right'}),poseVelocity(from,aTime,{side:'left'}),toPose,fromPose);
    nativeHandoffs.push({transition:entry.id,kind,from:a.id,to:b.id,fromTime:aTime,toTime:bTime,c0,c1,
      pass:c0.hipsMeters<thresholds.endpointHipsMeters&&c0.rotationDegrees<thresholds.endpointRotationDegrees
        &&c1.hipsMetersPerSecond<thresholds.endpointHipsVelocityMetersPerSecond&&c1.rotationRadiansPerSecond<thresholds.endpointAngularVelocityRadiansPerSecond});
  }
}
const sequenceHandoffs=[],sequenceBallHandoffs=[];
for(const [fromId,toId]of [['free_throw_prepare','free_throw_release'],['free_throw_release','free_throw_follow']]){
  const a=clips.find(c=>c.id===fromId),b=clips.find(c=>c.id===toId);
  if(!a||!b)throw Error(`Missing staged free-throw pair ${fromId} / ${toId}`);
  const from=t=>sampleMotion(a,t),to=t=>sampleMotion(b,t),fromPose=from(a.duration),toPose=to(0),c0=poseResidual(fromPose,toPose);
  const c1=velocityResidual(poseVelocity(to,0,{side:'right'}),poseVelocity(from,a.duration,{side:'left'}),toPose,fromPose);
  const ballA=catalog.clips.find(c=>c.id===fromId)?.ball?.samples,ballB=catalog.clips.find(c=>c.id===toId)?.ball?.samples;
  if(!ballA||!ballB||ballA.length<3||ballB.length<3)throw Error('Free-throw stage missing an independently sampled ball trajectory');
  const inFrames=ballA.slice(-3),outFrames=ballB.slice(0,3),hIn=inFrames[2].time-inFrames[1].time,hOut=outFrames[1].time-outFrames[0].time;
  const incoming=inFrames[2].position.map((v,k)=>(3*v-4*inFrames[1].position[k]+inFrames[0].position[k])/(2*hIn));
  const outgoing=outFrames[0].position.map((v,k)=>(-3*v+4*outFrames[1].position[k]-outFrames[2].position[k])/(2*hOut));
  const c0BallMeters=distance(inFrames[2].position,outFrames[0].position),c1BallMetersPerSecond=distance(incoming,outgoing);
  sequenceBallHandoffs.push({from:fromId,to:toId,c0BallMeters,c1BallMetersPerSecond,incomingVelocityMetersPerSecond:incoming,outgoingVelocityMetersPerSecond:outgoing,
    method:'Independent second-order one-sided derivatives from the final three/start three 120Hz trajectory samples. Quadratic gravity flight remains measurable without treating acceleration as a velocity discontinuity.',
    pass:c0BallMeters<1e-6&&c1BallMetersPerSecond<.01});
  sequenceHandoffs.push({from:fromId,to:toId,fromTime:a.duration,toTime:0,c0,c1,
    pass:c0.hipsMeters<thresholds.endpointHipsMeters&&c0.rotationDegrees<thresholds.endpointRotationDegrees
      &&c1.hipsMetersPerSecond<thresholds.endpointHipsVelocityMetersPerSecond&&c1.rotationRadiansPerSecond<thresholds.endpointAngularVelocityRadiansPerSecond});
}
const summary={clips:clips.length,references:references.map(c=>c.id),bridges:results.length,passed:results.filter(r=>r.pass).length,
  nativeBridges:results.filter(r=>r.kind!=='interrupt-moving-bridge').length,interruptedBridges:results.filter(r=>r.kind==='interrupt-moving-bridge').length,
  maxEndpointHipsMeters:Math.max(...results.flatMap(r=>Object.values(r.c0).map(v=>v.hipsMeters))),
  maxEndpointRotationDegrees:Math.max(...results.flatMap(r=>Object.values(r.c0).map(v=>v.rotationDegrees))),
  maxEndpointHipsVelocityMetersPerSecond:Math.max(...results.flatMap(r=>Object.values(r.c1).map(v=>v.hipsMetersPerSecond))),
  maxEndpointVelocityRadiansPerSecond:Math.max(...results.flatMap(r=>Object.values(r.c1).map(v=>v.rotationRadiansPerSecond))),
  maxHipsStepMeters:Math.max(...results.map(r=>r.maxHipsStepMeters)),maxRotationStepDegrees:Math.max(...results.map(r=>r.maxRotationStepDegrees)),
  freeThrowBallHandoffs:sequenceBallHandoffs.length,freeThrowBallHandoffsPassed:sequenceBallHandoffs.filter(h=>h.pass).length,
  freeThrowSequenceHandoffs:sequenceHandoffs.length,freeThrowSequenceHandoffsPassed:sequenceHandoffs.filter(h=>h.pass).length,
  nativeHandoffs:nativeHandoffs.length,nativeHandoffsPassed:nativeHandoffs.filter(h=>h.pass).length,
  maxNativeHandoffHipsVelocityMetersPerSecond:Math.max(0,...nativeHandoffs.map(h=>h.c1.hipsMetersPerSecond)),
  maxNativeHandoffAngularVelocityRadiansPerSecond:Math.max(0,...nativeHandoffs.map(h=>h.c1.rotationRadiansPerSecond)),
  allPassed:clips.length===20&&results.length===320&&results.every(r=>r.pass)&&sequenceHandoffs.length===2&&sequenceHandoffs.every(h=>h.pass)&&sequenceBallHandoffs.every(h=>h.pass)&&nativeHandoffs.every(h=>h.pass)};
const evidence={schemaVersion:1,
  method:'Serialized GLB FLOAT accessors, native LINEAR translation/quaternion slerp, supplied normalized-Hermite C1 playback helper. Every physical clip enters from and exits to idle and run at three phases; each ordered bridge is also interrupted. Endpoint derivatives use sided velocities; interiors sampled at 240 Hz.',
  scope:'Actor-local pose continuity. The explicit world travel/heading scenario, collision avoidance and game integration remain simulation-owned. A C1 bridge does not itself lock planted feet during arbitrary transitions; base-clip stance slip is measured separately by measure.mjs.',
  thresholds,referenceSource:{commit:"f97bf53bf2a933c2a5411fa542aeee02d7059156",catalog:"../hoops-motion-v13/runtime/catalog.json",clips:references.map(({id,sha256})=>({id,sha256}))},sourceFiles:clips.map(({id,sha256})=>({id,path:`runtime/${catalog.clips.find(c=>c.id===id).asset}`,sha256})),summary,sequenceHandoffs,sequenceBallHandoffs,nativeHandoffs,bridges:results};
mkdirSync(new URL('verification/',base),{recursive:true});
writeFileSync(new URL('verification/transitions.json',base),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(!summary.allPassed)process.exitCode=1;
