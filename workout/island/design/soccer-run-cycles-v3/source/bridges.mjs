// SPDX-License-Identifier: CC0-1.0
// Start/stop with trajectory time-warp and sequential in-motion replants.
// World translation is simulation-owned and never baked into the Root track.
import {bones,fk,solve,slerp,add,sub,I} from './rig.mjs';
import {evaluateLocomotion} from './locomotion.mjs';
import {sampleMotion} from '../runtime/player.mjs';

const FPS=120,DT=1/FPS;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>(x=clamp(x),x*x*x*(10+x*(-15+6*x)));
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const poseMix=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
const serial=f=>({hips:f.hips.map(Math.fround),rotations:Object.fromEntries(bones.map(({name})=>{
 const q=f.rotations[name],n=Math.hypot(...q),raw=q.map(v=>Math.fround(v/n)),r=Math.hypot(...raw);
 return [name,raw.map(v=>v/r)];
}))});

/** Exact C1 native LINEAR/slerp endpoint intervals after Float32 serialization.
 * At this density the constrained intervals' world-sole residual is millimetric;
 * QA independently measures them rather than exempting those samples.
 */
function constrainNativeHandoffs(frames,source,target,sourceTime,targetTime){
 const sourceIndex=Math.round(sourceTime*FPS),targetIndex=Math.round(targetTime*FPS);
 const sourceFrame=source.frames[sourceIndex],targetFrame=target.frames[targetIndex];
 const previous=source.frames[sourceIndex>0?sourceIndex-1:source.frames.length-2];
 const next=target.frames[targetIndex+1]??target.frames[1];
 const a=serial(sourceFrame),b=serial(targetFrame),ap=serial(previous),bn=serial(next);
 const sourceDt=sourceIndex>0?Math.fround(sourceFrame.time)-Math.fround(previous.time):Math.fround(source.duration)-Math.fround(previous.time);
 const targetDt=targetIndex+1<target.frames.length?Math.fround(next.time)-Math.fround(targetFrame.time):Math.fround(target.frames[1].time);
 const firstDt=Math.fround(frames[1].time)-Math.fround(frames[0].time);
 const lastDt=Math.fround(frames.at(-1).time)-Math.fround(frames.at(-2).time);
 Object.assign(frames[0],{hips:[...sourceFrame.hips],rotations:structuredClone(sourceFrame.rotations)});
 Object.assign(frames[1],poseMix(ap,a,1+firstDt/sourceDt));
 if(source.locomotion){
  // Fade the native outgoing tangent into the deceleration curvature over
  // two extra intervals. A one-interval handoff alone concentrates the
  // small FK curvature residual into the immediately following sole step.
  for(const [index,weight] of [[2,.65],[3,.92]]){
   const tangentPose=poseMix(ap,a,1+(Math.fround(frames[index].time)-Math.fround(frames[0].time))/sourceDt);
   Object.assign(frames[index],poseMix(tangentPose,frames[index],weight));
  }
 }
 Object.assign(frames.at(-2),poseMix(b,bn,-lastDt/targetDt));
 Object.assign(frames.at(-1),{hips:[...targetFrame.hips],rotations:structuredClone(targetFrame.rotations)});
}

export function buildBridges(baseClips,{sprintOffset=-1/FPS}={}){
 const idle=baseClips.find(c=>c.id==='idle_relaxed');
 if(!idle)throw Error('C1 bridges require idle_relaxed.');
 const result=[];
 for(const id of ['jog','run','sprint','referee_run']){
  const gait=baseClips.find(c=>c.id===id);if(!gait)throw Error('Missing gait '+id);
  const period=gait.duration??gait.durationSeconds,speed=gait.speedMps,half=period/2,rampDuration=3*period,phaseOffset=id==='sprint'?sprintOffset:0;
  for(const launch of [true,false]){
   const duration=rampDuration,frames=[],travel=[],idlePose=sampleMotion(idle,0),idleWorld=fk(idlePose),phaseEnd=duration/2;
   const phaseAt=t=>{
    t=clamp(t/duration)*duration;const span=.15*duration,primitive=u=>u**3-.5*u**4;
    let accelerating;
    if(t<span)accelerating=.5*span*primitive(t/span);
    else if(t<=duration-span)accelerating=.25*span+.5*(t-span);
    else{const s=t-(duration-span);accelerating=.5*duration-.75*span+.5*s+.5*span*primitive(s/span);}
    return launch?accelerating:t-accelerating;
   };
   const inverse=v=>{let a=0,b=duration;for(let i=0;i<56;i++){const m=(a+b)/2;if(phaseAt(m)<v)a=m;else b=m;}return(a+b)/2;};
   const leftRelease=inverse(.025/speed),rightRelease=inverse(.15/speed),join=Math.max(inverse(.35/speed),rightRelease+.28);
   const settleStart=inverse(phaseEnd-.3/speed),leftLand=duration-.10,rightLand=duration-.025;
   function sample(t){
    const phase=phaseAt(t);
    const position=[0,0,speed*phase];
    const gaitPose=evaluateLocomotion(id,phase+phaseOffset),native=fk(gaitPose);
    let p=gaitPose;
    if(launch&&t<join){
     p=poseMix(idlePose,gaitPose,ease(t/join));
     for(const side of ['Left','Right']){
      const leave=side==='Left'?leftRelease:rightRelease,k=ease((t-leave)/(join-leave));
      const start=idleWorld[side+'Foot'].position,end=add(native[side+'Foot'].position,position);
      const world=mix(start,end,k);if(t>leave)world[1]+=.07*Math.sin(Math.PI*clamp((t-leave)/(join-leave)))**2;
      solve(p,side+'UpLeg',side+'Leg',side+'Foot',sub(world,position),[0,0,1],slerp(idleWorld[side+'Foot'].rotation,native[side+'Foot'].rotation,k));
     }
    }else if(!launch&&t>settleStart){
     p=poseMix(gaitPose,idlePose,ease((t-settleStart)/(duration-settleStart)));
     for(const side of ['Left','Right']){
      const land=side==='Left'?leftLand:rightLand,k=ease((t-settleStart)/(land-settleStart));
      const world=mix(add(native[side+'Foot'].position,position),[(side==='Left'?1:-1)*.108,.084,speed*phaseEnd],k);
      solve(p,side+'UpLeg',side+'Leg',side+'Foot',sub(world,position),[0,0,1],slerp(native[side+'Foot'].rotation,I,k));
     }
    }
    return {p,position};
   }
   for(let i=0;i<=Math.round(duration*FPS);i++){const time=i/FPS,{p,position}=sample(time);frames.push({time,hips:p.hips,rotations:p.rotations});travel.push({time,position,yawRadians:0});}
   const source=launch?idle:gait,target=launch?gait:idle,sourceTime=launch?0:(phaseOffset+period)%period,targetTime=launch?(half+phaseOffset+period)%period:0;
   constrainNativeHandoffs(frames,source,target,sourceTime,targetTime);
   const supports=[];
   for(let cycle=-1;cycle<=Math.ceil(phaseEnd/period);cycle++)for(const w of gait.supports??[]){
    let start=inverse(Math.max(0,w.start+cycle*period-phaseOffset)),end=inverse(Math.min(phaseEnd,w.end+cycle*period-phaseOffset));
    if(launch)start=Math.max(start,join);else end=Math.min(end,settleStart);
    if(end-start>DT)supports.push({bone:w.bone,start,end,local:[0,-.08,0]});
   }
   if(launch){supports.push({bone:'LeftFoot',start:0,end:leftRelease,local:[0,-.08,0]},{bone:'RightFoot',start:0,end:rightRelease,local:[0,-.08,0]});}
   else supports.push({bone:'LeftFoot',start:leftLand,end:duration,local:[0,-.08,0]},{bone:'RightFoot',start:rightLand,end:duration,local:[0,-.08,0]});
   const key=launch?`idle_to_${id}`:`${id}_to_idle`;
   result.push({id:key,label:launch?`האצה מעמידה · ${gait.label}`:`בלימה לעמידה · ${gait.label}`,duration,durationSeconds:duration,loop:false,nativeRate:FPS,frameCount:frames.length,
    speedMps:speed*rampDuration/2/duration,startSpeedMps:launch?0:speed,endSpeedMps:launch?speed:0,category:'transition',locomotion:true,rootMotion:false,symmetryMode:'structural',
    nativeHandoff:{source:source.id,sourcePhaseSeconds:sourceTime,target:target.id,targetPhaseSeconds:targetTime,continuity:'C1 decoded native LINEAR/slerp endpoint intervals'},
    transitionPlan:{method:'continuous gait time-warp with sequential acceleration/landing replants',gaitRampSeconds:rampDuration,settleSeconds:0,sourcePhaseSeconds:phaseOffset,destinationGaitPhaseSeconds:half+phaseOffset,stanceLock:'same world anchors through native gait time-warp; idle feet acquire/release while speed tends to zero'},
    events:[],supports,referenceTravel:{coordinateSpace:'simulation-owned world scenario; not a Root track',samples:travel},frames});
  }
 }
 return result;
}
