// SPDX-License-Identifier: CC0-1.0
// Original tennis choreography. IK is baked; the racket never animates relative to the hand.
import fs from 'node:fs/promises';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {bones,I,pose,solve,fk,rotate,add,sub,mul,qi,qm,slerp,curve,smooth,clamp,euler,dot,unit} from './rig.mjs';
export const RATE=30;
export const HANDLE_CENTER=[0,-.055,.020];
export const GRIP_Y=.065, HEAD_Y=.50;
export const ATTACH=euler(0,0,-123.36701297);
export const LEFT_ATTACH=euler(0,0,123.36701297);
export const HEAD_LOCAL=add(HANDLE_CENTER,rotate(ATTACH,[0,HEAD_Y-GRIP_Y,0]));
export function racketFrame(shaft,normal=[0,0,1]) {
 const y=new T.Vector3(...shaft).normalize(),z=new T.Vector3(...normal);
 z.addScaledVector(y,-z.dot(y));
 if(z.lengthSq()<1e-6)z.set(1,0,0).addScaledVector(y,-y.x);
 z.normalize();const x=new T.Vector3().crossVectors(y,z).normalize();z.crossVectors(x,y);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).toArray();
}
const ready={r:[-.145,1.035,.29],q:racketFrame([-.12,.98,.15]),l:[.23,1.015,.22],h:.735,twist:0,lean:6,closed:1};
// Each station contains time, wrist, shaft, torso twist, and off-hand closure.
const stations={
 forehand:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.25,[-.39,1.05,-.06],[-.85,.45,-.18],-38,0],
  [.43,[-.40,.93,.14],[-.86,.08,.5],-24,0],
  [.54,[-.35,1.02,.40],[-.92,.28,.20],8,0],
  [.76,[.08,1.34,.31],[.73,.64,.22],38,0],
  [1,ready.r,[-.12,.98,.15],0,1]],
 backhand:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.28,[.13,1.10,.24],[.74,.64,-.15],36,1],
  [.54,[.11,1.09,.41],[.93,.30,.05],-3,1],
  [.76,[-.12,1.29,.28],[-.62,.76,.18],-34,1],
  [1,ready.r,[-.12,.98,.15],0,1]],
 volley:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.30,[-.27,1.17,.27],[-.40,.91,.05],-13,0],
  [.52,[-.29,1.21,.44],[-.34,.93,.1],9,0],
  [.70,[-.20,1.24,.46],[-.12,.98,.15],14,0],
  [1,ready.r,[-.12,.98,.15],0,1]],
 drop_shot:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.28,[-.35,.99,.19],[-.75,.65,-.05],-17,0],
  [.52,[-.32,1.02,.42],[-.76,.59,-.27],5,0],
  [.69,[-.25,1.11,.46],[-.60,.70,-.38],16,0],
  [1,ready.r,[-.12,.98,.15],0,1]],
 lob:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.28,[-.36,.87,.18],[-.86,.42,-.1],-24,0],
  [.50,[-.34,.99,.42],[-.80,.52,-.28],4,0],
  [.74,[-.18,1.40,.36],[-.34,.86,-.37],26,0],
  [1,ready.r,[-.12,.98,.15],0,1]],
 serve:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.16,[-.32,.99,.18],[-.50,.83,-.10],-15,0],
  [.33,[-.39,1.31,-.02],[-.30,.74,-.60],-29,0],
  [.47,[-.25,1.49,-.16],[-.30,.20,-.93],-25,0],
  [.60,[-.22,1.64,.13],[-.11,.98,.05],7,0],
  [.75,[.02,1.18,.40],[.4,-.36,.84],27,0],
  [.88,[-.05,1.0,.31],[.25,.75,.61],15,0],
  [1,ready.r,[-.12,.98,.15],0,1]],
 recover:[
  [0,ready.r,[-.12,.98,.15],0,1],
  [.24,[-.28,1.09,.37],[-.35,.91,.20],-16,1],
  [.51,[-.11,1.11,.32],[.05,.98,.18],8,1],
  [.76,[-.16,1.045,.30],[-.16,.97,.19],-3,1],
  [1,ready.r,[-.12,.98,.15],0,1]]
};
export const definitions=[
 {id:'idle',label:'היכון · שתי ידיים',duration:2.4,loop:true},
 {id:'forehand',label:'פורהנד',duration:2.4,contact:.54},
 {id:'backhand',label:'בקהנד · שתי ידיים',duration:2.6,contact:.54},
 {id:'serve',label:'הגשה · הטלה וחבטה',duration:4,contact:.60,release:.33},
 {id:'volley',label:'וולה',duration:1.8,contact:.52},
 {id:'drop_shot',label:'דרופ שוט',duration:2.2,contact:.52},
 {id:'lob',label:'לוב',duration:2.6,contact:.50},
 {id:'recover',label:'חזרה להיכון',duration:2},
 {id:'run_side',label:'ריצת צד · במקום',duration:1.6,loop:true,locomotion:true}
].map(d=>({...d,loop:d.loop??false,locomotion:d.locomotion??false}));
function station(id,u) {
 const keys=stations[id];if(!keys)return {...ready};
 const r=curve(keys.map(k=>[k[0],k[1]]),u),twist=curve(keys.map(k=>[k[0],k[3]]),u),closed=curve(keys.map(k=>[k[0],k[4]]),u);
 let i=1;while(i<keys.length-1&&u>keys[i][0])i++;
 const a=keys[i-1],b=keys[i],t=smooth((u-a[0])/(b[0]-a[0]));
 return {...ready,r,twist,closed,q:slerp(racketFrame(a[2]),racketFrame(b[2]),t)};
}
function quaternionCurve(keys,u){let i=1;while(i<keys.length-1&&u>keys[i][0])i++;const a=keys[i-1],b=keys[i];return slerp(a[1],b[1],smooth((u-a[0])/(b[0]-a[0])));}
// Actual in-place feet, with a separate simulation travel scenario for locomotion QA.
const SPEED=.50,CYCLE=.8,STANCE=.48;
export function footPlan(t,side) {
 const sign=side==='Left'?1:-1,offset=side==='Left'?0:.5,n=t/CYCLE+offset,k=Math.floor(n),phase=n-k;
 const anchor=SPEED*((k-offset)*CYCLE+STANCE*CYCLE/2);
 const x=sign*.18;
 if(phase<=STANCE)return {p:[x+anchor-SPEED*t,.08,sign*.035],plant:true};
 const u=(phase-STANCE)/(1-STANCE),start=anchor-SPEED*t,end=anchor+SPEED*CYCLE-SPEED*t;
 return {p:[x+start+(end-start)*smooth(u),.08+.10*Math.sin(Math.PI*u)**2,sign*.035],plant:false};
}
function authoredPose(def,t) {
 const u=t/def.duration,s=station(def.id,u),breath=def.id==='idle'?.003*(1-Math.cos(u*Math.PI*2)):0;
 s.h+=breath;
 if(def.id==='serve')s.h+=curve([[0,0],[.33,-.025],[.48,-.015],[.60,.055],[.78,0],[1,0]],u);
 if(def.id==='lob')s.h+=curve([[0,0],[.28,-.035],[.74,.025],[1,0]],u);
 const rq=qm(s.q,qi(ATTACH));
 const rootR=sub(add(s.r,rotate(rq,HANDLE_CENTER)),rotate(s.q,[0,GRIP_Y,0]));
 const lq=qm(s.q,qi(LEFT_ATTACH));
 const heldLeft=sub(add(rootR,rotate(s.q,[0,.153,0])),rotate(lq,HANDLE_CENTER));
 let freeLeft=curve([[0,ready.l],[.3,[.29,1.08,.20]],[.6,[.28,1.04,.20]],[1,ready.l]],u);
 if(def.id==='forehand'||def.id==='lob')freeLeft=curve([[0,ready.l],[.28,[.34,1.20,.19]],[.62,[.27,1.12,.15]],[1,ready.l]],u);
 if(def.id==='serve')freeLeft=curve([[0,ready.l],[.16,[.21,1.08,.30]],[.33,[.15,1.59,.23]],[.45,[.13,1.62,.21]],[.60,[.27,1.21,.18]],[.78,[.27,1.02,.19]],[1,ready.l]],u);
 const left=freeLeft.map((v,i)=>v+(heldLeft[i]-v)*s.closed),leftQ=slerp(euler(-25,0,-12),lq,s.closed);
 // Persistent elbow planes avoid a 180-degree IK swivel at the racket drop.
 const rightPole=def.id==='serve'?[-1,-.10,-.35]:[-1,-.48,-.30];
 const leftPole=[1,-.48,-.30];
 const feet=def.id==='run_side'?[footPlan(t,'Left').p,footPlan(t,'Right').p]:[[.18,.08,.035],[-.18,.08,-.035]];
 const p=pose({hips:[0,s.h,0],yaw:0,hipYaw:s.twist*.18,twist:s.twist*.82,lean:s.lean,
  headYaw:-s.twist*.50,head:def.id==='serve'?-12*Math.sin(u*Math.PI)**2:0,
  rightHand:s.r,leftHand:left,rightHandAim:rq,leftHandAim:leftQ,rightElbow:rightPole,leftElbow:leftPole,
  leftFoot:feet[0],rightFoot:feet[1]});
 // Preserve the authored shaft, but relieve excessive wrist bend through
 // forearm pronation. The required hand/racket transform itself never changes.
 const w=fk(p),forearm=unit(sub(w.RightHand.position,w.RightForeArm.position));
 const wristAngle=q=>Math.acos(clamp(dot(forearm,rotate(qm(q,qi(ATTACH)),[0,-1,0])),-1,1))*180/Math.PI;
 let desiredRacketQ=s.q;
 const shaft=new T.Vector3(...rotate(s.q,[0,1,0])),along=new T.Vector3(...forearm),angle=shaft.angleTo(along)*180/Math.PI;
 if(angle>116){const turn=new T.Quaternion().setFromUnitVectors(shaft,along);turn.slerp(new T.Quaternion(),116/angle);desiredRacketQ=new T.Quaternion(...s.q).premultiply(turn).toArray();}
 let finalRacketQ=desiredRacketQ;
 if(wristAngle(desiredRacketQ)>55){
  const y=new T.Vector3(...rotate(desiredRacketQ,[0,1,0])),x=new T.Vector3(...forearm);x.addScaledVector(y,-x.dot(y));
  if(x.lengthSq()>1e-6){x.normalize();const z=new T.Vector3().crossVectors(x,y).normalize(),natural=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).toArray();
   const limit=Math.max(55,wristAngle(natural)+.25);let low=0,high=1;
   for(let i=0;i<24;i++){const mid=(low+high)/2;if(wristAngle(slerp(desiredRacketQ,natural,mid))>limit)low=mid;else high=mid;}
   finalRacketQ=slerp(desiredRacketQ,natural,high);
  }
 }
 const finalHandQ=qm(finalRacketQ,qi(ATTACH));p.rotations.RightHand=qm(qi(w.RightForeArm.rotation),finalHandQ);
 const finalRoot=sub(add(w.RightHand.position,rotate(finalHandQ,HANDLE_CENTER)),rotate(finalRacketQ,[0,GRIP_Y,0]));
 const finalLeftQ=qm(finalRacketQ,qi(LEFT_ATTACH)),finalHeldLeft=sub(add(finalRoot,rotate(finalRacketQ,[0,.153,0])),rotate(finalLeftQ,HANDLE_CENTER));
 const finalLeft=freeLeft.map((v,i)=>v+(finalHeldLeft[i]-v)*s.closed);
 solve(p,'LeftArm','LeftForeArm','LeftHand',finalLeft,leftPole);
 const leftParent=fk(p).LeftForeArm.rotation,heldReadyQ=qm(ready.q,qi(LEFT_ATTACH));
 let leftWorld=finalLeftQ;
 if(!['idle','backhand','recover','run_side'].includes(def.id)){
  const keys=def.id==='serve'?[[0,heldReadyQ],[.16,euler(-90,0,-12)],[.33,euler(-150,0,-12)],[.45,euler(-150,0,-12)],[.60,euler(-90,0,-12)],[.78,euler(-25,0,-12)],[1,heldReadyQ]]:[[0,heldReadyQ],[.25,euler(-25,0,-12)],[.75,euler(-25,0,-12)],[1,heldReadyQ]];
  leftWorld=quaternionCurve(keys,u);
 }
 p.rotations.LeftHand=qm(qi(leftParent),leftWorld);
 p.time=t;p.leftOpen=1-s.closed;p.racketRoot=finalRoot;p.racketRotation=finalRacketQ;p.referenceRoot=def.locomotion?[SPEED*t,0,0]:[0,0,0];
 return p;
}
function supportWindows(def) {
 if(!def.locomotion)return ['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:def.duration,local:[0,-.08,0]}));
 const windows=[];
 for(const [side,offset] of [['Left',0],['Right',.5]])for(let k=-1;k<4;k++){
  const start=Math.max(0,(k-offset)*CYCLE),end=Math.min(def.duration,(k-offset+STANCE)*CYCLE);
  if(end-start>.065)windows.push({bone:side+'Foot',start,end,local:[0,-.08,0]});
 }
 return windows;
}
export function author() {
 const clips=[];
 for(const def of definitions){
  const count=Math.round(def.duration*RATE),frames=Array.from({length:count+1},(_,i)=>authoredPose(def,i/RATE));
  for(let i=1;i<frames.length;i++)for(const b of bones){const q=frames[i].rotations[b.name],a=frames[i-1].rotations[b.name];if(q.reduce((s,v,k)=>s+v*a[k],0)<0)frames[i].rotations[b.name]=mul(q,-1);}
  const contactTime=def.contact===undefined?null:Math.round(def.contact*count)/RATE;
  const releaseTime=def.release===undefined?null:Math.round(def.release*count)/RATE;
  const contactFrame=contactTime===null?null:frames[Math.round(contactTime*RATE)];
  const contact=contactFrame?add(fk(contactFrame).RightHand.position,rotate(fk(contactFrame).RightHand.rotation,HEAD_LOCAL)):null;
  // Independent baked demonstration ball: one ballistic toss/flight, no per-frame snapping to strings.
  let atHit=null,atRelease=null,velocity=null;
  if(contact){atHit=add(contact,rotate(contactFrame.racketRotation,[0,0,.0335]));}
  if(releaseTime!==null){const f=frames[Math.round(releaseTime*RATE)],w=fk(f);atRelease=add(w.LeftHand.position,rotate(w.LeftHand.rotation,[0,-.075,.027]));const dt=contactTime-releaseTime;velocity=mul(add(sub(atHit,atRelease),[0,.5*9.81*dt*dt,0]),1/dt);}
  for(const f of frames){
   let ball=[0,-10,0];
   if(contact){const dt=f.time-contactTime;
    if(def.id==='serve'&&f.time<=releaseTime){const w=fk(f);ball=add(w.LeftHand.position,rotate(w.LeftHand.rotation,[0,-.075,.027]));}
    else if(def.id==='serve'&&f.time<contactTime){const d=f.time-releaseTime;ball=add(atRelease,add(mul(velocity,d),[0,-.5*9.81*d*d,0]));}
    else {const incoming=[0,-.5,-4],outgoing=def.id==='lob'?[0,5,3]:def.id==='drop_shot'?[0,1.4,2.5]:def.id==='serve'?[0,-1.5,12]:[0,1.0,8];ball=add(atHit,add(mul(dt<0?incoming:outgoing,dt),[0,-.5*9.81*dt*dt,0]));}
   }
   f.ball=ball;f.ballScale=contact?1:0;
  }
  const events=[];
  if(releaseTime!==null)events.push({type:'release',time:releaseTime,bone:'LeftHand',local:[0,-.075,0],label:'הטלה'});
  if(contact)events.push({type:'contact',time:contactTime,bone:'RightHand',local:HEAD_LOCAL,label:'מגע במיתרים'});
  clips.push({...def,nativeRate:RATE,rootMotion:false,frameCount:frames.length,contactTime,releaseTime,
   metadata:{label:def.label,loop:def.loop,role:'tennis',floorY:0,soleLocal:[0,-.08,0],checkHingeDirection:true,
    locomotion:def.locomotion,ballVisible:!!contact,ballContactExpected:!!contact,ball:{radius:.0335},events,
    supports:supportWindows(def),symmetryMode:def.locomotion?'gait':'structural',
    referenceTravel:def.locomotion?{speed:SPEED,direction:[1,0,0],description:'External simulation travel for this in-place side-running cycle; never baked into Root.'}:null},frames});
 }
 return {schemaVersion:1,version:'tennis-grip-v1',units:'meters',nativeRate:RATE,rootMotion:false,skeleton:bones,
  grip:{handleCenterInRightHand:HANDLE_CENTER,handFromRacket:ATTACH,gripNodeY:.20,primaryHandY:GRIP_Y,headY:HEAD_Y,headInRightHand:HEAD_LOCAL},clips};
}
if(process.argv[1]&&new URL('file:'+process.argv[1]).href===import.meta.url){
 const data=author();await fs.writeFile(new URL('../runtime/motions.json',import.meta.url),JSON.stringify(data));console.log('Authored '+data.clips.length+' clips at 30 Hz.');
}
