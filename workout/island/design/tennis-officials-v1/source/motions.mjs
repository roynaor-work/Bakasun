// Original tennis officials keyframes / author-time two-bone IK. CC0-1.0.
import {createRequire} from 'node:module';
const require=createRequire('/tmp/tennis-officials-tools/package.json');
const T=require('three'),V=(...p)=>new T.Vector3(...p),Q=()=>new T.Quaternion();
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
export const smooth=x=>{x=clamp(x,0,1);return x*x*x*(10+x*(-15+6*x));};
const pulse=(t,a,b,c,d)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
export const BALL_RADIUS=.0335, PALM_LOCAL=[-.07,0,.03];
export const definitions=[
 {id:'chair_idle',role:'chair',label:'עמידה',duration:2.4,loop:true,idle:'chair_idle'},
 {id:'chair_seated',role:'chair',label:'ישיבה בכיסא הגבוה',duration:2.4,loop:true,idle:'chair_seated',seated:true},
 {id:'chair_score',role:'chair',label:'הכרזה על ניקוד',duration:3.2,idle:'chair_seated',seated:true,events:[{type:'score_call',time:1.2}]},
 {id:'chair_good',role:'chair',label:'סימון טוב',duration:3,idle:'chair_seated',seated:true,events:[{type:'good',time:1.2}]},
 {id:'chair_nod',role:'chair',label:'הנהון',duration:2.4,idle:'chair_seated',seated:true},
 {id:'line_idle',role:'line',label:'עמידה',duration:2.4,loop:true,idle:'line_idle'},
 {id:'line_out',role:'line',label:'אאוט — ידיים פרושות',duration:3.2,idle:'line_idle',events:[{type:'out',time:1.2,sound:'line-out'}]},
 {id:'line_good',role:'line',label:'טוב — ידיים למטה',duration:3.2,idle:'line_idle',events:[{type:'good',time:1.2,sound:'line-good'}]},
 {id:'kid_idle',role:'kid',label:'עמידה',duration:2.4,loop:true,idle:'kid_idle'},
 {id:'kid_bend',role:'kid',label:'רכינה לאיסוף',duration:3.6,idle:'kid_idle'},
 {id:'kid_run_collect',role:'kid',label:'רץ לאסוף כדור',duration:5.6,idle:'kid_idle',locomotion:true,ball:true,events:[{type:'contact',time:4.0,bone:'RightHand',local:PALM_LOCAL},{type:'pickup',time:4.15}]},
 {id:'kid_roll',role:'kid',label:'מגלגל כדור',duration:3.6,idle:'kid_idle',ball:true,events:[{type:'release',time:1.6,bone:'RightHand',local:PALM_LOCAL,sound:'ball-roll'}]},
 {id:'kid_offer',role:'kid',label:'מניף כדור לשחקן',duration:3.2,idle:'kid_idle',ball:true,events:[{type:'offer',time:1.3},{type:'receive_ready',time:2.0}]},
 {id:'kid_return',role:'kid',label:'חוזר למקום',duration:4.2,idle:'kid_idle',locomotion:true,events:[{type:'home',time:4.0}]},
];
// World-space swing trajectories. During all other times the sole is planted.
const swings={Left:[[.15,.55,.65],[.95,1.35,1.65],[1.75,2.15,2.42]],Right:[[.55,.95,1.15],[1.35,1.75,2.15],[2.15,2.55,2.38]]};
function distance(t){const a=.25,b=2.4,end=2.65;if(t<=0)return 0;if(t<a)return t*t/(2*a);if(t<b)return t-a/2;if(t<end){const u=t-b;return b-a/2+u-u*u/(2*a);}return 2.4;}
function step(side,t){let z=side==='Left'?.02:-.02,y=.106;for(const [a,b,target] of swings[side]){if(t<a)break;if(t<=b){const u=(t-a)/(b-a);y+=.12*Math.sin(Math.PI*u)**2;z=lerp(z,target,u*u*(3-2*u));break;}z=target;}return V(side==='Left'?.16:-.16,y,z);}
export function createBaker(rig){
 const group=new T.Group(),bones={},rest={};
 for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);bones[j.name]=b;rest[j.name]=V(...j.worldPosition);(j.parent?bones[j.parent]:group).add(b);}
 group.updateMatrixWorld(true);
 const pos=n=>bones[n].getWorldPosition(V()),rot=n=>bones[n].getWorldQuaternion(Q());
 function orient(n,q){bones[n].quaternion.copy(bones[n].parent.getWorldQuaternion(Q()).invert().multiply(q));group.updateMatrixWorld(true);}
 function ik(side,limb,target,pole,heading=Q()){
  const [a,b,c]=(limb==='arm'?['Arm','ForeArm','Hand']:['UpLeg','Leg','Foot']).map(n=>side+n),o=pos(a);
  const upper=rest[b].clone().sub(rest[a]),lower=rest[c].clone().sub(rest[b]),la=upper.length(),lb=lower.length(),d=target.clone().sub(o);
  const wanted=d.length(),reach=clamp(wanted,Math.abs(la-lb)+.002,la+lb-.001);d.normalize();
  const effective=o.clone().addScaledVector(d,reach),cos=clamp((la*la+reach*reach-lb*lb)/(2*la*reach),-1,1);
  const p=pole.clone().sub(o);p.addScaledVector(d,-p.dot(d)).normalize();
  const mid=o.clone().addScaledVector(d,la*cos).addScaledVector(p,la*Math.sqrt(1-cos*cos));
  const inverse=heading.clone().invert();
  orient(a,heading.clone().multiply(Q().setFromUnitVectors(upper.normalize(),mid.sub(o).normalize().applyQuaternion(inverse))));
  orient(b,heading.clone().multiply(Q().setFromUnitVectors(lower.normalize(),effective.sub(pos(b)).normalize().applyQuaternion(inverse))));
  return Math.abs(wanted-reach);
 }
 function pose(def,t){
  for(const j of rig.joints){bones[j.name].position.fromArray(j.translation);bones[j.name].quaternion.identity();}
  const time=t*def.duration;
  let rootZ=0,yaw=0,hipY=.835,lean=.015,footL=V(.16,.106,.02),footR=V(-.16,.106,-.02),bend=0;
  let handL=V(.28,.96,.11),handR=V(-.28,.96,.11),ball=null,ballVisible=0;
  const rightQ=Q().setFromAxisAngle(V(0,0,1),Math.PI/2),leftQ=Q().setFromAxisAngle(V(0,0,1),-Math.PI/2);
  if(def.seated){hipY=1.68;footL.set(.17,1.22,.44);footR.set(-.17,1.22,.44);handL.set(.27,1.80,.24);handR.set(-.27,1.80,.24);}
  // Quiet weight-free breathing: feet and hands stay on their supports.
  lean+=.004*Math.sin(t*2*Math.PI)**2;
  if(def.id==='chair_score'){const a=pulse(time,.35,1.15,1.8,2.8);handR.lerp(V(-.36,2.16,.30),a);bones.Head.quaternion.setFromEuler(new T.Euler(-.07*a,.10*a,0));}
  if(def.id==='chair_good'){const a=pulse(time,.35,1.05,1.65,2.7);handR.lerp(V(-.46,1.90,.45),a);}
  if(def.id==='chair_nod'){const a=pulse(time,.35,.65,1.75,2.1);bones.Head.quaternion.setFromEuler(new T.Euler(.20*a*Math.sin((time-.35)/1.4*2*Math.PI)**2,0,0));}
  if(def.id==='line_out'){const a=pulse(time,.35,1.15,1.9,2.9);handL.lerp(V(.65,1.43,.04),a);handR.lerp(V(-.65,1.43,.04),a);}
  if(def.id==='line_good'){const a=pulse(time,.35,1.15,1.9,2.9);lean+=.16*a;handL.lerp(V(.21,.91,.25),a);handR.lerp(V(-.21,.91,.25),a);}
  if(def.id==='kid_bend')bend=pulse(time,.35,1.45,1.95,3.2);
  let travelTime=null;
  if(def.id==='kid_run_collect'){travelTime=time;rootZ=distance(time);bend=pulse(time,2.85,3.95,4.15,5.1);ballVisible=1;ball=V(-.28,.98,2.4+.18);
   if(time<=4.0)ball.set(-.28,.039,2.4+.58);
   else if(time<5.1)ball.lerpVectors(V(-.28,.039,2.4+.58),V(-.28,.98,2.4+.18),smooth((time-4.0)/1.1));
  }
  if(def.id==='kid_return'){travelTime=clamp(time-.75,0,2.65);rootZ=-distance(travelTime);yaw=Math.PI*pulse(time,0,.7,3.45,4.15);}
  if(travelTime!==null){
   footL=step('Left',travelTime);footR=step('Right',travelTime);
   const run=pulse(travelTime,0,.35,2.3,2.65);hipY-=.135*run;lean+=.10*run;
   const pump=Math.sin(travelTime/ .8*2*Math.PI)*.18*run;handL.z+=pump;handR.z-=pump;handL.y+=.14*run;handR.y+=.14*run;
   // Feet are targets in the run's +Z coordinates, then rotated to world.
   if(def.id==='kid_return'){footL.z-=distance(travelTime);footR.z-=distance(travelTime);footL.applyAxisAngle(V(0,1,0),yaw);footR.applyAxisAngle(V(0,1,0),yaw);footL.z+=rootZ;footR.z+=rootZ;}
  }
  if(def.id==='kid_roll'){bend=pulse(time,.25,1.35,1.75,3.2);ballVisible=1;
   if(time<=1.6)ball=V(-.28,lerp(.98,.039,smooth((time-.25)/1.35)),lerp(.18,.58,smooth((time-.25)/1.35)));
   else {const u=(time-1.6)/2;ball=V(-.28,.039,.58+2.1*u-.65*u*u);}
  }
  if(def.id==='kid_offer'){const a=pulse(time,.3,1.2,2,2.9);ballVisible=1;ball=V(-.28,lerp(.98,1.78,a),lerp(.18,.22,a));handR=ball.clone().sub(V(0,-.07,.0635));}
  if(bend){hipY=lerp(hipY,.32,bend);lean=lerp(lean,1.22,bend);handL.lerp(V(.27,.39,.47),bend);handR.lerp(V(-.28,.109,.5165),bend);}
  // Stationary gestures use relative hand targets; locomotion adds world translation.
  const heading=Q().setFromAxisAngle(V(0,1,0),yaw);
  if(travelTime!==null){handL.applyQuaternion(heading);handR.applyQuaternion(heading);handL.z+=rootZ;handR.z+=rootZ;}
  if(def.id==='kid_run_collect'&&time>=3.95)handR=ball.clone().sub(V(0,-.07,.0635));
  if(def.id==='kid_roll'&&time<=1.6)handR=ball.clone().sub(V(0,-.07,.0635));
  bones.Root.position.z=rootZ;
  bones.Hips.position.y=hipY;bones.Hips.quaternion.copy(heading).multiply(Q().setFromEuler(new T.Euler(lean*.70,0,0)));
  bones.Spine.quaternion.setFromEuler(new T.Euler(lean*.20,0,0));bones.Chest.quaternion.setFromEuler(new T.Euler(lean*.10,0,0));group.updateMatrixWorld(true);
  if(def.id==='kid_return'){
   // Two lifted/replanted steps turn the body; the planted foot never rotates
   // around the pelvis. Actual support windows below exclude these swings.
   function pivot(a,b,start,end){const u=smooth((time-a)/(b-a));const v=start.clone().lerp(end,u);v.y+=.10*Math.sin(Math.PI*clamp((time-a)/(b-a),0,1))**2;return v;}
   if(time<.75){footL=pivot(0,.30,V(.16,.106,.02),V(-.16,.106,-.02));footR=pivot(.35,.65,V(-.16,.106,-.02),V(.16,.106,.02));}
   if(time>=3.4){footL=pivot(3.45,3.75,V(-.16,.106,-2.42),V(.16,.106,-2.38));footR=pivot(3.8,4.1,V(.16,.106,-2.38),V(-.16,.106,-2.42));}
  }
  const errors=[];
  const pole=(x,y,z)=>V(x,y,z).applyQuaternion(heading).add(V(0,0,rootZ));
  errors.push(ik('Left','leg',footL,pole(.2,hipY*.6,1.2),heading),ik('Right','leg',footR,pole(-.2,hipY*.6,1.2),heading));
  orient('LeftFoot',heading);orient('RightFoot',heading);
  errors.push(ik('Left','arm',handL,pole(1.1,hipY+.30,-.5),heading),ik('Right','arm',handR,pole(-1.1,hipY+.30,-.5),heading));
  orient('LeftHand',heading.clone().multiply(leftQ));orient('RightHand',heading.clone().multiply(rightQ));
  group.updateMatrixWorld(true);
  return {values:Object.fromEntries(rig.joints.map(j=>[j.name,{translation:bones[j.name].position.toArray(),rotation:bones[j.name].quaternion.toArray()}])),ball:ball?.toArray()??[0,-10,0],ballVisible,maxReachClamp:Math.max(...errors)};
 }
 function supports(def){
  const result=[],local=[0,-.09579774,0];
  for(const side of ['Left','Right']){
   if(def.locomotion){let prior=def.id==='kid_return'?.75:0;const offset=def.id==='kid_return'?.75:0;
    for(const [a,b] of swings[side]){if(a+offset>prior)result.push({bone:side+'Foot',start:prior,end:a+offset,local});prior=b+offset;}
    if(def.id==='kid_return'){
     const a=side==='Left'?3.45:3.8,b=side==='Left'?3.75:4.1;
     if(prior<a)result.push({bone:side+'Foot',start:prior,end:a,local});
     result.push({bone:side+'Foot',start:b,end:def.duration,local});
     if(side==='Left')result.push({bone:'LeftFoot',start:.30,end:.75,local});
     else result.push({bone:'RightFoot',start:0,end:.35,local},{bone:'RightFoot',start:.65,end:.75,local});
    }else if(prior<def.duration)result.push({bone:side+'Foot',start:prior,end:def.duration,local});
   }else result.push({bone:side+'Foot',start:0,end:def.duration,local});
  }return result;
 }
 const clips=definitions.map(def=>{const n=Math.round(def.duration*30),times=Array.from({length:n+1},(_,i)=>i/30),samples=times.map(s=>pose(def,s/def.duration));
  if(def.loop)samples[n]=structuredClone(samples[0]);
  const motionQA={supports:supports(def),soleLocal:[0,-.09579774,0],floorY:0,loop:!!def.loop,locomotion:!!def.locomotion,symmetryMode:'structural',checkHingeDirection:true,ballVisible:!!def.ball,idle:def.idle,...(def.seated?{supportPlaneY:1.12420226}:{})};
  if(def.ball){motionQA.ball={radius:BALL_RADIUS};motionQA.ballContactExpected=true;motionQA.contacts=(def.events??[]).filter(e=>['contact','release'].includes(e.type)).map(e=>({time:e.time,bone:'RightHand',local:PALM_LOCAL}));
   motionQA.ballContacts=def.id==='kid_roll'?[{start:0,end:1.6,bone:'RightHand',local:PALM_LOCAL}]:def.id==='kid_offer'?[{start:0,end:3.2,bone:'RightHand',local:PALM_LOCAL}]:[{start:4,end:5.6,bone:'RightHand',local:PALM_LOCAL}];}
  return {...def,loop:!!def.loop,events:def.events??[],times,samples,motionQA};});
 return {clips,pose};
}
