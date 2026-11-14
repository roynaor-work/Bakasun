// SPDX-License-Identifier: CC0-1.0
// Original basketball shot, finish and defensive actions. Canonical 18 bones,
// metres, seconds, +Y up, +Z forward. No captured or third-party motion data.
// The existing CC0 soccer-header-v1 rig supplies only analytic IK mathematics.
import {bones,I,pose,fk,point,solve,euler,qm,rotate,add,sub,mul,slerp,mix} from '../../soccer-header-v1/source/rig.mjs';
import {idlePose} from './locomotion.mjs';

const radius=.12,sole=[0,-.08,0],palm=[0,-.08,.025],tau=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const S=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const blend=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
function curve(keys,t){
 if(t<=keys[0][0])return structuredClone(keys[0][1]);
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],S((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));
 return structuredClone(keys.at(-1)[1]);
}
const labels={jump_shot:'קליעת ניתור',set_shot:'קליעה מהמקום',layup:'צעד וחצי',dunk:'הטבעה',fadeaway:'קליעה בנסיגה',block:'חסימה',steal_reach:'שליחת יד לחטיפה'};
const baseFeet={Left:[.108,.08,0],Right:[-.108,.08,0]};
const idle=idlePose(0);

// Feet are authored in the demonstrated world scenario; only the inverse
// actor transform enters the native in-place skeletal tracks.
function scenario(id,D,takeoff,land){
 const approach=id==='layup'||id==='dunk',fade=id==='fadeaway';
 const root=t=>approach?[0,0,curve([[0,0],[.25,.06],[.7,.34],[1.15,.58],[takeoff,.7],[land,1.3],[D,1.3]],t)]:fade?[0,0,curve([[0,0],[takeoff,0],[land,-.45],[D,-.45]],t)]:[0,0,0];
 return {root,approach,fade};
}
function flight(t,a,b,h){return t<a||t>b?0:4*h*((t-a)/(b-a))*(1-(t-a)/(b-a));}
function worldFoot(side,t,{D,takeoff,land,jumpHeight,travel,id}){
 const x=baseFeet[side][0],left=side==='Left';
 if(!jumpHeight)return baseFeet[side];
 const lift=flight(t,takeoff,land,jumpHeight),air=t>=takeoff&&t<=land;
 if(travel.approach){
  const from=left?.65:.55;
  if(t<takeoff){
   const leave=left?.7:.25,hit=left?1.15:.65;
   let z=curve([[0,0],[leave,0],[hit,left?.65:.30],[left?takeoff:1.05,left?.65:.30],[takeoff,from]],t);
   let y=.08;
   if(t>leave&&t<hit)y+=.13*Math.sin(Math.PI*(t-leave)/(hit-leave))**2;
   if(!left&&t>1.05)y+=.12*S((t-1.05)/(takeoff-1.05));
   return [x,y,z];
  }
  if(air){const u=(t-takeoff)/(land-takeoff),tuck=Math.sin(Math.PI*u)**2;
   return [x,.08+lift+(left?.04:.17)*tuck+(left?0:.12*(1-u)),mix(from,1.3,S(u))];}
  return [x,.08,1.3];
 }
 if(air){const u=(t-takeoff)/(land-takeoff),tuck=Math.sin(Math.PI*u)**2;
  return [x,.08+lift+.045*tuck,travel.root(t)[2]-.035*tuck];}
 return [x,.08,travel.root(t)[2]];
}
function footWindows({D,takeoff,land,jumpHeight,travel}){
 const supports=[];
 for(const side of ['Left','Right']){
  const bone=side+'Foot';
  if(!jumpHeight)supports.push({bone,start:0,end:D,local:sole,anchor:[baseFeet[side][0],0,0]});
  else if(travel.approach){
   const left=side==='Left';
   supports.push({bone,start:0,end:left?.7:.25,local:sole,anchor:[baseFeet[side][0],0,0]});
   supports.push({bone,start:left?1.15:.65,end:left?takeoff:1.05,local:sole,anchor:[baseFeet[side][0],0,left?.65:.30]});
   supports.push({bone,start:land,end:D,local:sole,anchor:[baseFeet[side][0],0,1.3]});
  }else{
   supports.push({bone,start:0,end:takeoff,local:sole,anchor:[baseFeet[side][0],0,0]});
   supports.push({bone,start:land,end:D,local:sole,anchor:[baseFeet[side][0],0,travel.root(D)[2]]});
  }
 }
 return supports;
}
function shootPose(t,c){
 const {id,D,takeoff,land,jumpHeight,release,travel}=c;
 const jump=jumpHeight>0,defence=id==='block',steal=id==='steal_reach',dunk=id==='dunk';
 const up=flight(t,takeoff,land,jumpHeight);
 const baseHip=curve([[0,.835],[.3,.835],[.75,travel.approach?.745:.69],[takeoff,jump?.835:.82],[land,jump?.81:.82],[land+.2,.715],[D-.7,.835],[D,.835]],t);
 const hipY=baseHip+up,wind=curve([[0,0],[.3,0],[.75,1],[takeoff,0],[release,0],[land,.3],[D-.7,0],[D,0]],t);
 const finish=curve([[0,0],[.4,0],[takeoff-.15,0],[release,1],[release+.3,1],[land+.5,.4],[D-.65,0],[D,0]],t);
 const lean=steal?curve([[0,0],[.5,0],[release,28],[release+.2,24],[D-.6,0],[D,0]],t):dunk?5*wind-4*finish:4*wind+(id==='fadeaway'?-12*finish:2*finish);
 const root=travel.root(t),lf=sub(worldFoot('Left',t,c),root),rf=sub(worldFoot('Right',t,c),root);
 const p=pose({hips:[.008*Math.sin(tau*t/D)*finish,hipY,0],hipPitch:lean*.5,spinePitch:lean*.3,chestPitch:lean*.2,
  hipYaw:steal?-12*finish:3*wind,twist:steal?-18*finish:4*wind,head:-lean*.55,
  leftFoot:lf,rightFoot:rf,leftKnee:[0,0,1],rightKnee:[0,0,1]});
 if(steal){
  const reach=curve([[0,0],[.4,0],[release-.1,1],[release+.15,1],[release+.5,.3],[D-.6,0],[D,0]],t);
  const lh=mix([.16,hipY+.11,.22],[.22,hipY+.26,.16],reach);
  const rh=mix([-.16,hipY+.11,.22],[-.22,hipY+.06,.51],reach);
  solve(p,'LeftArm','LeftForeArm','LeftHand',lh,[.35,-.5,-.5],euler(-10));
  solve(p,'RightArm','RightForeArm','RightHand',rh,[-.35,-.5,-.5],euler(-65,0,-10));
 }else if(defence){
  const guard=curve([[0,0],[.35,0],[takeoff,1],[release,1],[land,.7],[D-.65,0],[D,0]],t);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
   const h=mix([sign*.19,hipY+.12,.19],[sign*(side==='Right'?.17:.28),hipY+(side==='Right'?.84:.72),.21],guard);
   solve(p,side+'Arm',side+'ForeArm',side+'Hand',h,[sign*.55,-.3,-.3],euler(-155,0,sign*8));
  }
 }else{
  const lift=curve([[0,.16],[.3,.16],[.65,.37],[takeoff-.1,.55],[release,dunk?1.08:.99],[release+.25,dunk?.76:.99],[land+.35,.72],[D-.65,.16],[D,.16]],t);
  const center=[-.035,hipY+lift,dunk?curve([[0,.29],[takeoff-.15,.29],[release,.13],[D,.13]],t):.29],q=euler(180);
  // Right shooting palm sits below the ball; the left guide contacts its side.
  const offset=rotate(q,palm);
  const right=sub(sub(center,[0,radius,0]),offset);
  let left=sub(sub(center,[-radius,0,0]),offset);
  // The guide hand releases before a one-hand dunk; the shooting arm can
  // extend nearly vertically above the rim without stretching either arm.
  if(dunk)left=mix(left,[.22,hipY+.38,.22],S((t-(takeoff+.05))/.35));
  solve(p,'RightArm','RightForeArm','RightHand',right,dunk?[-.8,0,-.3]:[-.28,-.6,-.4],q);
  solve(p,'LeftArm','LeftForeArm','LeftHand',left,[.4,-.5,-.4],q);
  const follow=curve([[0,0],[release,0],[release+.16,1],[land+.35,1],[D-.65,0],[D,0]],t);
  p.rotations.RightHand=qm(p.rotations.RightHand,euler(45*follow));
 }
 // The first and final handles are the exact shared idle pose. Actual action
 // mechanics remain full amplitude; only the boundary handles are enveloped.
 const weight=Math.min(S(t/.35),S((D-t)/.45));
 const out=blend(idle,p,weight);
 // Re-solve after enveloping so every declared grounded interval is locked.
 for(const side of ['Left','Right']){
  const desired=sub(worldFoot(side,t,c),root);
  solve(out,side+'UpLeg',side+'Leg',side+'Foot',desired,[0,0,1],I);
 }
 // Exact endpoint idle includes its own planted foot solution and rotations.
 if(t<1e-9||Math.abs(t-D)<1e-9)return structuredClone(idle);
 return out;
}
function ballistic(center,velocity,dt){
 // Event calibrated once. Free flight and floor rebounds use no hand guide.
 let p=[...center],v=[...velocity],remain=Math.max(0,dt);
 while(remain>1e-10){
  const disc=v[1]*v[1]+2*9.81*Math.max(0,p[1]-radius),hit=(v[1]+Math.sqrt(disc))/9.81;
  const h=Math.min(remain,hit>1e-7?hit:remain);
  p=[p[0]+v[0]*h,p[1]+v[1]*h-4.905*h*h,p[2]+v[2]*h];v[1]-=9.81*h;remain-=h;
  if(remain>1e-10){p[1]=radius;v[1]=Math.abs(v[1])*.62;v[0]*=.8;v[2]*=.8;}
 }
 p[1]=Math.max(radius,p[1]);return p;
}
function build(id){
 const set=id==='set_shot',steal=id==='steal_reach',dunk=id==='dunk',block=id==='block';
 const D=steal?3.6:dunk?4.6:4.2,takeoff=steal?1.0:set?1.2:1.4,land=steal?2:set?2.2:dunk?2.6:2.4;
 const release=steal?1.4:set?1.6:dunk?2:block?1.9:1.8;
 const jumpHeight=set||steal?0:dunk?1.30:block?.42:.36;
 const travel=scenario(id,D,takeoff,land),c={id,D,takeoff,land,jumpHeight,release,travel};
 const frames=Array.from({length:Math.round(D*30)+1},(_,i)=>{const time=i/30,p=shootPose(time,c);return {time,hips:p.hips,rotations:p.rotations};});
 const releasePose=shootPose(release,c),hand=point(releasePose,'RightHand',palm);
 const normal=steal?[0,0,1]:block?[0,0,1]:[0,1,0],center=add(hand,mul(normal,radius));
 const velocity=steal?[2.1,-.25,.7]:block?[-1.5,1,-2.1]:dunk?[0,-2,1.2]:id==='layup'?[0,3.8,2.3]:[0,5.2,4];
 const samples=[];
 for(let i=0;i<=Math.round(D*120);i++){
  const time=i/120;let position;
  if(time<=release){
   if(steal||block){const dt=time-release;position=add(center,mul(steal?[.2,-.2,-.65]:[.1,-.6,-2],dt));position[1]=Math.max(radius,position[1]);}
   else{
    // Held gather/raise: the authored palm guide is baked at 120 Hz.
    // Only the post-release ballistic path is independent of the hand.
    const p=shootPose(time,c),marker=point(p,'RightHand',palm);
    position=add(marker,mul(normal,radius));
   }
  }else position=ballistic(center,velocity,time-release);
  samples.push({time,position});
 }
 const events=[{type:steal||block?'contact':'release',name:steal||block?'contact':'release',time:release,timeSeconds:release,bone:'RightHand',local:palm}];
 if(jumpHeight)events.push({type:'takeoff',time:takeoff,bones:travel.approach?['LeftFoot']:['LeftFoot','RightFoot']},{type:'land',time:land,bones:['LeftFoot','RightFoot']});
 const supports=footWindows(c);
 return {id,label:labels[id],category:steal?'steal':block?'block':'shot',kind:id,role:'field',duration:D,durationSeconds:D,nativeRate:30,frameCount:frames.length,loop:false,rootMotion:false,locomotion:false,speedMps:0,symmetryMode:'structural',
  events,supports,ball:{radius,trajectory:'Baked shooting-hand carry before release; independent event-calibrated ballistic flight after release, floor restitution .62. Defensive contact has a separate independent incoming trajectory.',samples},
  referenceTravel:{coordinateSpace:'simulation-owned demonstration world; never embedded Root translation',samples:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:travel.root(i/120),yawRadians:0}))},
  coreRange:{start:.35,end:D-.45},
  entry:{reference:'idle',phase:0,blendSeconds:.35,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},
  exit:{reference:'idle',phase:0,blendSeconds:.45,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},
  actionGeometry:{releaseTimeSeconds:release,releaseBallCenterMeters:center,releasePalmPointMeters:hand,handSurfaceLocalMeters:palm,ballisticVelocityMetersPerSecond:velocity,jumpHeightMeters:jumpHeight,travelEndMeters:travel.root(D),...(dunk?{rimHeightMeters:3.05,ballBottomClearanceAtReleaseMeters:center[1]-radius-3.05,palmClearanceAtReleaseMeters:hand[1]-3.05}:{})},
  license:'CC0-1.0',notes:steal?'Low quick reach with torso participation, hand withdraw and planted recovery.':block?'Two-arm vertical contest with a separate incoming ball and measured right-palm contact.':dunk?'Approach steps, left-foot takeoff, guide-hand separation, nearly vertical shooting-arm extension clearing the 3.05m rim and downward release, then two-foot absorption.':id==='layup'?'Two approach steps, asymmetric knee lift, one-foot takeoff and high controlled release.':id==='fadeaway'?'Backward airborne travel, trunk counterbalance, shooting follow-through and backward landing.':'Knee/hip loading, shooting/guide hands, wrist follow-through and relaxed recovery.',frames};
}
export function createShotActions(){return Object.keys(labels).map(build);}
