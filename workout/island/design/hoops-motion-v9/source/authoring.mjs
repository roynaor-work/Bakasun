/** CC0 original authoring utilities adapted from v8; no animation data copied. */
import {SKELETON as CANONICAL_SKELETON} from "../runtime/skeleton.mjs";
export {CANONICAL_SKELETON};
export const HAND_CONTACT_POINT = [0, -.08, .025];
export const BALL_RADIUS = .12;
export const bones = CANONICAL_SKELETON.bones;
export const I = [0, 0, 0, 1], TAU = Math.PI * 2, G = 9.81;
const clamp = (x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const unit=(a,fallback=[0,0,1])=>norm(a)>1e-10?mul(a,1/norm(a)):fallback;
export const mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>mix(v,b[i],t)):a+(b-a)*t;
export const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
export const ramp=(t,a,b)=>smooth((t-a)/(b-a));
export const hermite=(a,b,va,vb,t,seconds)=>{t=clamp(t);const t2=t*t,t3=t2*t;return a.map((v,i)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*seconds*va[i]+(-2*t3+3*t2)*b[i]+(t3-t2)*seconds*vb[i]);};
export const hermiteC2=(a,b,va,vb,aa,ab,t,seconds)=>{t=clamp(t);return a.map((p,i)=>{const c0=p,c1=va[i]*seconds,c2=.5*aa[i]*seconds*seconds,S=b[i]-c0-c1-c2,V=vb[i]*seconds-c1-2*c2,A=ab[i]*seconds*seconds-2*c2,c3=10*S-4*V+.5*A,c4=-15*S+7*V-A,c5=6*S-3*V+.5*A;return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*c5))));});};
export const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));
export const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const qinv=q=>[-q[0],-q[1],-q[2],q[3]];
export const qnorm=q=>mul(q,1/norm(q));
export const slerp=(a,b,t)=>{let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995)return qnorm(mix(a,b,t));const angle=Math.acos(clamp(d,-1,1)),s=Math.sin(angle);return add(mul(a,Math.sin((1-t)*angle)/s),mul(b,Math.sin(t*angle)/s));};
export const axis=(a,r)=>[...mul(unit(a),Math.sin(r/2)),Math.cos(r/2)];
export const euler=(x=0,y=0,z=0)=>qmul(qmul(axis([0,1,0],y),axis([1,0,0],x)),axis([0,0,1],z));
export const rotate=(q,v)=>{const u=q.slice(0,3),uv=cross(u,v);return add(v,add(mul(uv,2*q[3]),mul(cross(u,uv),2)));};
export function basisQuaternion(x,y,z){
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2];
  const tr=m00+m11+m22;let q,s;
  if(tr>0){s=Math.sqrt(tr+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return qnorm(q);
}
export function handFrame(normal,fingers=[0,.25,1]){
  const z=mul(unit(normal),-1);
  const finger=unit(sub(fingers,mul(z,dot(fingers,z))),[0,1,0]);
  const y=mul(finger,-1),x=unit(cross(y,z));
  return basisQuaternion(x,y,z);
}
export function contactHand(center,normal,fingers){
  normal=unit(normal);const q=handFrame(normal,fingers);
  return {position:sub(add(center,mul(normal,BALL_RADIUS)),rotate(q,HAND_CONTACT_POINT)),orientation:q,contact:true,normal};
}
export function freeHand(position,normal=[0,0,1],fingers=[0,-1,0]){
  return {position,orientation:handFrame(normal,fingers),contact:false};
}
export function twoHands(center,back=0,tilt=0){
  return {LeftHand:contactHand(center,[1,tilt,-back],[0,.28,1]),RightHand:contactHand(center,[-1,tilt,-back],[0,.28,1])};
}
/** Analytic planar two-bone IK. Pole is a world point, not a joint Euler. */
function limb(a,b,end,target,pole,world,rotations){
  const origin=world[a].p,parent=world[a].parentQ;
  const len1=norm(bones.find(x=>x.name===b).restTranslationMeters),len2=norm(bones.find(x=>x.name===end).restTranslationMeters);
  const delta=sub(target,origin),raw=norm(delta),dist=clamp(raw,.025,len1+len2-.00015),direction=unit(delta);
  const u=unit(sub(sub(pole,origin),mul(direction,dot(sub(pole,origin),direction))),[1,0,0]);
  const along=(len1*len1-len2*len2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,len1*len1-along*along));
  const joint=add(origin,add(mul(direction,along),mul(u,height)));
  // Arms use the canonical anatomical hinge frame: forward elbow flexion is -X,
  // unlike +X knee flexion. This removes a 180-degree humeral frame flip.
  const plane=mul(unit(cross(u,direction)),a.endsWith('Arm')?-1:1),segmentQ=v=>{const y=mul(unit(v),-1),x=plane,z=unit(cross(x,y));return basisQuaternion(x,y,z);};
  const q1=segmentQ(sub(joint,origin)),q2=segmentQ(sub(add(origin,mul(direction,dist)),joint));
  rotations[a]=qnorm(qmul(qinv(parent),q1));rotations[b]=qnorm(qmul(qinv(q1),q2));
  world[a].q=q1;world[b]={p:joint,q:q2,parentQ:q1};world[end]={p:add(origin,mul(direction,dist)),q:q2,parentQ:q2};
  return Math.max(0,raw-(len1+len2-.00015));
}
export function forwardKinematics(frame){
  const result={};
  for(const b of bones){const parent=b.parent?result[b.parent]:null;let t=b.restTranslationMeters;if(b.name==='Hips')t=add(t,frame.hipsOffsetMeters);result[b.name]={position:parent?add(parent.position,rotate(parent.rotation,t)):t.slice(),rotation:parent?qmul(parent.rotation,frame.rotations[b.name]):frame.rotations[b.name]};}
  return result;
}
export const control=(t,keys)=>{if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);};
export const yawPoint=(p,a)=>rotate(axis([0,1,0],a),p);
export function basePose(){return {hips:[0,-.065,0],yaw:0,lean:.085,twist:0,roll:0,headPitch:-.025,headYaw:0,feet:{LeftFoot:{sole:[.18,0,.075],yaw:.08},RightFoot:{sole:[-.18,0,-.075],yaw:-.1}},hands:twoHands([0,1.115,.34]),ball:[0,1.115,.34],phase:'held',reference:[0,0,0]};}

export const SOLE_POINT = [0,-.08,0];
export function bakePose(p,t){
  const rotations=Object.fromEntries(bones.map(b=>[b.name,I.slice()]));
  rotations.Hips=euler(p.hipsPitch||0,p.yaw,p.hipsRoll||0);rotations.Spine=euler(p.lean*.65,0,p.roll*.6);rotations.Chest=euler(p.lean*.35,p.twist,p.roll*.4);rotations.Neck=euler(-p.lean*.5);rotations.Head=euler(p.headPitch-p.lean*.35,p.headYaw-p.twist*.3);
  const world={};for(const b of bones){const parent=b.parent?world[b.parent]:null;let tr=b.restTranslationMeters;if(b.name==='Hips')tr=add(tr,p.hips);world[b.name]={p:parent?add(parent.p,rotate(parent.q,tr)):tr.slice(),q:parent?qmul(parent.q,rotations[b.name]):rotations[b.name],parentQ:parent?parent.q:I};}
  let maxReach=0;const reachByBone={};
  for(const [side,sgn] of [['Left',1],['Right',-1]]){
    const name=side+'Foot',f=p.feet[name],fq=f.orientation || euler(f.pitch||0,f.yaw||0),ankle=sub(f.sole,rotate(fq,SOLE_POINT));
    const legReach=limb(side+'UpLeg',side+'Leg',name,ankle,p.legPoles?.[side] || add(world[side+'UpLeg'].p,rotate(rotations.Hips,[.02*sgn,-.15,.8])),world,rotations);reachByBone[side+'UpLeg']=legReach;maxReach=Math.max(maxReach,legReach);rotations[name]=qnorm(qmul(qinv(world[name].parentQ),fq));
    const hand=p.hands[side+'Hand'],elbowPole=p.armPoles?.[side] || add(world[side+'Arm'].p,rotate(rotations.Hips,[sgn*.38,-.32,-.13]));
    if(!hand.contact){const origin=world[side+'Arm'].p,delta=sub(hand.position,origin);if(norm(delta)>.495)hand.position=add(origin,mul(unit(delta),.495));}
    const armReach=limb(side+'Arm',side+'ForeArm',side+'Hand',hand.position,elbowPole,world,rotations);reachByBone[side+'Arm']=armReach;maxReach=Math.max(maxReach,armReach);rotations[side+'Hand']=qnorm(qmul(qinv(world[side+'Hand'].parentQ),hand.orientation));
  }
  return {time:t,rotations,hipsOffsetMeters:p.hips,referenceRootTranslationMeters:p.reference,ballPositionMeters:p.ball,_reachError:maxReach,_reachByBone:reachByBone};
}
