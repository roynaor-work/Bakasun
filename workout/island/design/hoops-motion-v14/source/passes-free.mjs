// SPDX-License-Identifier: CC0-1.0
// Original canonical-18 free-throw sequence and jump pass; v13 standing passes
// retain their measured mechanics with slower overhead preparation.
import {bones,I,solve,euler,qm,rotate,point,add,sub,mul,slerp} from '../../soccer-header-v1/source/rig.mjs';
import {idlePose} from '../../hoops-motion-v13/source/locomotion.mjs';
import {createBallActions} from '../../hoops-motion-v13/source/ball-actions.mjs';

const R=.12,PALM=[0,-.08,.025],SOLE=[0,-.08,0],FT_RELEASE=2.65;
const clamp=x=>Math.max(0,Math.min(1,x));
const S=x=>(x=clamp(x),x*x*x*(10+x*(-15+6*x)));
const mix=(a,b,u)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*u):a+(b-a)*u;
function curve(keys,t){if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],S((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);}
const noTravel=D=>({coordinateSpace:'simulation-owned demonstration world; never embedded Root translation',samples:[{time:0,position:[0,0,0],yawRadians:0},{time:D,position:[0,0,0],yawRadians:0}]});
const feet=(D,start=0,end=D)=>['LeftFoot','RightFoot'].map(bone=>({bone,start,end,local:SOLE,anchor:[bone.startsWith('Left')?.108:-.108,0,0]}));
function plant(p,height=0){for(const[side,sign]of[['Left',1],['Right',-1]])solve(p,side+'UpLeg',side+'Leg',side+'Foot',[sign*.108,.08+height,0],[0,0,1],I);return p;}
function hand(p,side,surface,q=I,weight=1,pole){
 const names=[side+'Arm',side+'ForeArm',side+'Hand'],before=names.map(n=>p.rotations[n]),sign=side==='Left'?1:-1;
 solve(p,...names,sub(surface,rotate(q,PALM)),pole??[sign*.32,-.55,-.5],q);
 if(weight<1)names.forEach((n,i)=>p.rotations[n]=slerp(before[i],p.rotations[n],weight));
}
function event(type,time,bone,p,center,extra={}){
 const marker=bone?point(p,bone,PALM):center;
 return {type,name:type,time,timeSeconds:time,...(bone?{bone,local:PALM}:{}),positionMeters:marker,heightMeters:marker[1],ballCenterMeters:center,ballCenterHeightMeters:center[1],ballRadiusMeters:R,...extra};
}
function build(id,label,D,sample,ball,{events=[],supports=feet(D),...metadata}={}){
 const frames=Array.from({length:Math.round(D*30)+1},(_,i)=>{const time=i/30,p=sample(time);return {time,hips:p.hips,rotations:p.rotations};});
 return {id,label,category:'pass',kind:id,role:'field',duration:D,durationSeconds:D,nativeRate:30,frameCount:frames.length,rootMotion:false,loop:false,locomotion:false,speedMps:0,symmetryMode:'structural',license:'CC0-1.0',events,supports,referenceTravel:noTravel(D),entry:{reference:'idle',phase:0,blendSeconds:.4,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},exit:{reference:'idle',phase:0,blendSeconds:.5,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},...metadata,frames,...(ball?{ball:{radius:R,coordinateSpace:'actor-local; apply referenceTravel exactly once',samples:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:ball(i/120)}))}}:{})};
}

// Carry and the free-flight solver share one absolute timeline across all three
// phase clips, including the ball's position/velocity at both phase boundaries.
const ftCarry=t=>curve([[0,[-.19,.94,.20]],[.4,[-.19,.94,.20]],[1.15,[0,1.04,.25]],[1.7,[-.035,1.40,.27]],[1.9,[-.035,1.40,.27]],[FT_RELEASE,[-.035,1.80,.29]]],t);
function flight(center,velocity,dt){
 let p=[...center],v=[...velocity],remain=Math.max(0,dt);
 for(let k=0;k<20&&remain>1e-10;k++){
  const disc=v[1]*v[1]+19.62*Math.max(0,p[1]-R),hit=(v[1]+Math.sqrt(disc))/9.81;
  const h=Math.min(remain,hit>1e-7?hit:remain);
  p=[p[0]+v[0]*h,p[1]+v[1]*h-4.905*h*h,p[2]+v[2]*h];v[1]-=9.81*h;remain-=h;
  if(remain>1e-10){p[1]=R;v[1]=Math.abs(v[1])*.62;v[0]*=.8;v[2]*=.8;}
 }
 p[1]=Math.max(R,p[1]);return p;
}
// This trajectory crosses a regulation-height target at 4.60m on its descending
// arc after 0.95s. The actual release impulse belongs to the shooting hand.
const FT_VELOCITY=[0,(3.05-1.80+4.905*.95*.95)/.95,(4.60-.29)/.95];
const ftBall=t=>t<=FT_RELEASE?ftCarry(t):flight(ftCarry(FT_RELEASE),FT_VELOCITY,t-FT_RELEASE);
function ftPose(t){
 const p=idlePose(0),a=S(t/.4)*(1-S((t-4.0)/.9));
 p.hips[1]=curve([[0,.835],[.4,.835],[1.4,.74],[1.9,.74],[FT_RELEASE,.835],[3.4,.835],[4.0,.81],[4.9,.835],[5.2,.835]],t);
 p.rotations.Hips=slerp(p.rotations.Hips,euler(curve([[0,0],[1.7,4],[1.9,4],[FT_RELEASE,-1],[3.4,-1],[4.9,0]],t)),a);
 p.rotations.Spine=slerp(p.rotations.Spine,euler(curve([[0,0],[1.7,5],[1.9,5],[FT_RELEASE,-2],[3.4,-2],[4.9,0]],t)),a);
 p.rotations.Chest=slerp(p.rotations.Chest,euler(curve([[0,0],[1.7,3],[1.9,3],[FT_RELEASE,-1],[3.4,-1],[4.9,0]],t)),a);
 p.rotations.Head=euler(curve([[0,0],[1.7,-7],[1.9,-7],[FT_RELEASE,-9],[3.4,-9],[4.9,0]],t));
 plant(p);
 const center=ftCarry(Math.min(t,FT_RELEASE)),aim=euler(180),carry=S(t/.4)*(1-S((t-3.4)/1.5));
 const palmAngle=Math.PI/2*S((Math.min(t,FT_RELEASE)-.5)/.65);
 hand(p,'Right',add(center,[-R*Math.cos(palmAngle),-R*Math.sin(palmAngle),0]),aim,carry,[-.36,-.5,-.4]);
 const guideWeight=S(t/.4)*(1-S((t-2.05)/.6));
 const guideCenter=ftCarry(Math.min(t,2.05));
 hand(p,'Left',add(guideCenter,[R,0,0]),aim,guideWeight,[.45,-.4,-.5]);
 // Wrist flexion follows release, while the shooting elbow stays extended.
 const follow=S((t-FT_RELEASE)/.25)*(1-S((t-3.4)/1.5));
 p.rotations.RightHand=qm(p.rotations.RightHand,euler(43*follow));
 return p;
}
function freeThrows(){
 const phases=[['free_throw_prepare','עונשין — הכנה',0,1.8],['free_throw_release','עונשין — שחרור',1.8,3.0],['free_throw_follow','עונשין — המשך התנועה',3.0,5.2]];
 return phases.map(([id,label,start,end],index)=>{
  const D=end-start,sample=t=>ftPose(start+t),ball=t=>ftBall(start+t),events=[];
  const previous=phases[index-1]?.[0]??null,next=phases[index+1]?.[0]??null;
  if(index===0)events.push(event('contact',.6,'RightHand',sample(.6),ball(.6)),event('contact',1.8,'LeftHand',sample(1.8),ball(1.8)));
  if(index===1){const t=FT_RELEASE-start;events.push(event('release',t,'RightHand',sample(t),ball(t),{velocityMetersPerSecond:FT_VELOCITY}));}
  if(index===2)events.push({type:'rim_crossing',name:'rim_crossing',time:.6,timeSeconds:.6,absoluteTimeSeconds:3.6,heightMeters:3.05,positionMeters:[-.035,3.05,4.60],ballCenterMeters:[-.035,3.05,4.60],ballCenterHeightMeters:3.05,ballRadiusMeters:R,surface:'rim-plane',coordinateSpace:'world',direction:'descending'});
  const ballContacts=index===0?['RightHand','LeftHand'].map(bone=>({bone,start:.6,end:D,local:PALM})):index===1?[{bone:'RightHand',start:0,end:FT_RELEASE-start,local:PALM},{bone:'LeftHand',start:0,end:.2,local:PALM}]:[];
  return build(id,label,D,sample,ball,{category:'free_throw',events,ballContacts,rim:{center:[-.035,3.05,4.60],radius:.225,coordinateSpace:'world',heightMeters:3.05},coreRange:{start:0,end:D},sequence:{id:'free_throw',index,previous,next,startSeconds:start,endSeconds:end,absoluteReleaseTimeSeconds:FT_RELEASE,ballConvention:'One continuous 120Hz trajectory across the three phases; no reattachment or reset.'},actionGeometry:{regulationRimHeightMeters:3.05,rimCenterMeters:[-.035,3.05,4.60],targetCenterMeters:[-.035,3.05,4.60],releaseBallCenterMeters:ftCarry(FT_RELEASE),releaseVelocityMetersPerSecond:FT_VELOCITY,releaseTimeSeconds:index===1?FT_RELEASE-start:null,absoluteReleaseTimeSeconds:FT_RELEASE,absoluteTimelineSeconds:[start,end]},notes:index===0?'Gather, load the knees and raise the ball to a stable set point. Ends in the exact starting pose of free_throw_release.':index===1?'Leg extension drives a right-hand release; guide hand separates before extension, then the wrist folds. Exact preparation and follow-through handoffs.':'Hold the shooting follow-through, track the independent flight, then lower the arm and recover the neutral stance. Begins in the exact final pose of free_throw_release.'});
 });
}

function standingPasses(){
 return createBallActions().filter(c=>['pass_overhead','pass_chest'].includes(c.id)).map(source=>{
  const c=structuredClone(source),factor=c.id==='pass_overhead'?1.25:1;
  // Resample the original complete action at native 30Hz after time dilation.
  if(factor!==1){
   const sourceFrames=c.frames,D=c.duration*factor;
   const interpolate=t=>{
    const f=t/factor*30,i=Math.min(sourceFrames.length-2,Math.floor(f)),u=Math.min(1,f-i),a=sourceFrames[Math.max(0,i)],b=sourceFrames[Math.max(0,i)+1];
    return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))};
   };
   c.frames=Array.from({length:Math.round(D*30)+1},(_,i)=>({time:i/30,...interpolate(i/30)}));
   c.duration=c.durationSeconds=D;c.frameCount=c.frames.length;
   c.events.forEach(e=>{e.time*=factor;if(e.timeSeconds!=null)e.timeSeconds*=factor;});
   c.supports.forEach(w=>{w.start*=factor;w.end*=factor;});
   c.ballContacts.forEach(w=>{w.start*=factor;w.end*=factor;});
   c.ball.samples.forEach(k=>k.time*=factor);c.referenceTravel.samples.forEach(k=>k.time*=factor);
   c.coreRange.start*=factor;c.coreRange.end*=factor;c.receiver.arrivalTime*=factor;
   for(const k of ['entry','exit'])c.neutralHandles[k]=c.neutralHandles[k].map(t=>t*factor);
  }
  for(const e of c.events){const f=c.frames[Math.round(e.time*30)],p={hips:f.hips,rotations:f.rotations};let center=c.ball.samples.reduce((a,b)=>Math.abs(a.time-e.time)<Math.abs(b.time-e.time)?a:b).position;Object.assign(e,event(e.type,e.time,e.bone,p,center));}
  c.license='CC0-1.0';c.sourceMotion={library:'hoops-motion-v13',clip:c.id,modification:factor===1?'Preserved measured complete chest-pass mechanics; added explicit contact heights.':'Time-dilated overhead gather to reduce angular speed; resampled at native 30Hz; added explicit contact heights.'};
  c.entry={reference:'idle',phase:0,blendSeconds:.4,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'};
  c.exit={reference:'idle',phase:0,blendSeconds:.5,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'};
  return c;
 });
}
function jumpPass(){
 const D=3.4,takeoff=1,land=1.6,release=1.3;
 const air=t=>t<takeoff||t>land?0:4.905*(t-takeoff)*(land-t);
 const carry=t=>{const p=curve([[0,[-.19,.94,.20]],[.35,[-.19,.94,.20]],[.8,[0,1.03,.27]],[release,[0,1.12,.43]]],t);p[1]+=air(t);return p;};
 const atRelease=carry(release),arrival=release+.55,destination=[0,1.12,3.8];
 const velocity=[0,(destination[1]-atRelease[1]+4.905*.55*.55)/.55,(destination[2]-atRelease[2])/.55];
 const ball=t=>t<=release?carry(t):t<arrival?flight(atRelease,velocity,t-release):destination;
 const sample=t=>{
  const p=idlePose(0),active=S((t-.15)/.4)*(1-S((t-2.05)/.8)),up=air(t);
  p.hips[1]=curve([[0,.835],[.35,.835],[.7,.715],[takeoff,.835],[land,.81],[1.85,.72],[2.6,.835],[D,.835]],t)+up;
  p.rotations.Hips=slerp(p.rotations.Hips,euler(3),active);p.rotations.Spine=slerp(p.rotations.Spine,euler(3),active);p.rotations.Chest=slerp(p.rotations.Chest,euler(2),active);p.rotations.Head=euler(-4*active);
  plant(p,up);
  const center=carry(Math.min(t,release));
  if(t>release)center[1]+=air(t)-air(release);
  const engage=S((t-.15)/.4)*(1-S((t-release)/.8));
  for(const[side,sign]of[['Left',1],['Right',-1]])hand(p,side,add(center,[sign*R,0,0]),I,engage);
  return p;
 };
 const events=[event('release',release,'RightHand',sample(release),ball(release),{velocityMetersPerSecond:velocity}),event('contact',release,'LeftHand',sample(release),ball(release)),{type:'takeoff',time:takeoff,bones:['LeftFoot','RightFoot'],heightMeters:0},{type:'land',time:land,bones:['LeftFoot','RightFoot'],heightMeters:0}];
 return build('pass_jump','מסירה עם קפיצה',D,sample,ball,{events,supports:[...feet(D,0,takeoff),...feet(D,land,D)],ballContacts:['LeftHand','RightHand'].map(bone=>({bone,start:.8,end:release,local:PALM})),coreRange:{start:.35,end:2.6},neutralHandles:{entry:[0,.15],exit:[2.85,D]},receiver:{position:destination,arrivalTime:arrival},actionGeometry:{takeoffTimeSeconds:takeoff,landTimeSeconds:land,releaseTimeSeconds:release,ballisticJumpHeightMeters:air(release),gravityMetersPerSecondSquared:9.81,releaseBallCenterMeters:atRelease,releaseVelocityMetersPerSecond:velocity},notes:'Two-foot load and a gravity-consistent vertical jump. Two hands extend from chest level at the apex; the independent pass trajectory leaves both palms before a soft landing.'});
}
export function createPassesAndFreeThrows(){return [...freeThrows(),...standingPasses(),jumpPass()];}
