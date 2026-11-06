/**
 * Original basketball performance authoring, CC0-1.0.
 * Canonical axes: +Y up, +Z forward, +X anatomical left. All lengths metres.
 * Targets are solved through a genuine two-bone limb solver, then baked at
 * 120 Hz. No existing animation samples are copied or retargeted.
 *
 * Runtime schema: each gzip holds one clip. keyframes use normalized time,
 * parent-local absolute xyzw rotations for EXACT18, additive Hips translation,
 * and an in-place ball centre. referenceRootTranslationMeters is descriptive
 * only; the simulation owns world translation. ball.trajectory mirrors every
 * key and marks held, flight, dribble, or loose. All events are presentation.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonical = JSON.parse(await readFile(new URL('../../motion2/hoops.json', import.meta.url), 'utf8'));
export const CANONICAL_SKELETON = canonical.skeleton;
export const HAND_CONTACT_POINT = [0, -.08, .025];
export const BALL_RADIUS = .12;
const bones = CANONICAL_SKELETON.bones;
const I = [0, 0, 0, 1], TAU = Math.PI * 2, G = 9.81;
const clamp = (x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=(a,fallback=[0,0,1])=>norm(a)>1e-10?mul(a,1/norm(a)):fallback;
const mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>mix(v,b[i],t)):a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
const ramp=(t,a,b)=>smooth((t-a)/(b-a));
const hermite=(a,b,va,vb,t,seconds)=>{t=clamp(t);const t2=t*t,t3=t2*t;return a.map((v,i)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*seconds*va[i]+(-2*t3+3*t2)*b[i]+(t3-t2)*seconds*vb[i]);};
const hermiteC2=(a,b,va,vb,aa,ab,t,seconds)=>{t=clamp(t);return a.map((p,i)=>{const c0=p,c1=va[i]*seconds,c2=.5*aa[i]*seconds*seconds,S=b[i]-c0-c1-c2,V=vb[i]*seconds-c1-2*c2,A=ab[i]*seconds*seconds-2*c2,c3=10*S-4*V+.5*A,c4=-15*S+7*V-A,c5=6*S-3*V+.5*A;return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*c5))));});};
const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qinv=q=>[-q[0],-q[1],-q[2],q[3]];
const qnorm=q=>mul(q,1/norm(q));
const slerp=(a,b,t)=>{let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995)return qnorm(mix(a,b,t));const angle=Math.acos(clamp(d,-1,1)),s=Math.sin(angle);return add(mul(a,Math.sin((1-t)*angle)/s),mul(b,Math.sin(t*angle)/s));};
const axis=(a,r)=>[...mul(unit(a),Math.sin(r/2)),Math.cos(r/2)];
const euler=(x=0,y=0,z=0)=>qmul(qmul(axis([0,1,0],y),axis([1,0,0],x)),axis([0,0,1],z));
const rotate=(q,v)=>{const u=q.slice(0,3),uv=cross(u,v);return add(v,add(mul(uv,2*q[3]),mul(cross(u,uv),2)));};
function basisQuaternion(x,y,z){
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2];
  const tr=m00+m11+m22;let q,s;
  if(tr>0){s=Math.sqrt(tr+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return qnorm(q);
}
function handFrame(normal,fingers=[0,.25,1]){
  const z=mul(unit(normal),-1);
  const finger=unit(sub(fingers,mul(z,dot(fingers,z))),[0,1,0]);
  const y=mul(finger,-1),x=unit(cross(y,z));
  return basisQuaternion(x,y,z);
}
function contactHand(center,normal,fingers){
  normal=unit(normal);const q=handFrame(normal,fingers);
  return {position:sub(add(center,mul(normal,BALL_RADIUS)),rotate(q,HAND_CONTACT_POINT)),orientation:q,contact:true,normal};
}
function freeHand(position,normal=[0,0,1],fingers=[0,-1,0]){
  return {position,orientation:handFrame(normal,fingers),contact:false};
}
function twoHands(center,back=0,tilt=0){
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
  const plane=unit(cross(u,direction)),segmentQ=v=>{const y=mul(unit(v),-1),x=plane,z=unit(cross(x,y));return basisQuaternion(x,y,z);};
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
const control=(t,keys)=>{if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);};
const yawPoint=(p,a)=>rotate(axis([0,1,0],a),p);
function basePose(){return {hips:[0,-.065,0],yaw:0,lean:.085,twist:0,roll:0,headPitch:-.025,headYaw:0,feet:{LeftFoot:{sole:[.18,0,.075],yaw:.08},RightFoot:{sole:[-.18,0,-.075],yaw:-.1}},hands:twoHands([0,1.115,.34]),ball:[0,1.115,.34],phase:'held',reference:[0,0,0]};}
const authored=[
 ['pass_chest',1.12,false,'held_ready','released_ready','Two-hand chest pass: load, left step, wrist extension, readable follow-through.'],
 ['pass_bounce',1.22,false,'held_ready','released_ready','Two-hand bounce pass: lower set, forward step, one ballistic floor rebound.'],
 ['pass_overhead',1.28,false,'held_ready','released_ready','Raise above forehead with tucked elbows, step, two-hand overhead release.'],
 ['pass_side',1.16,false,'held_ready','released_ready','Two-hand right-side push pass with hip and chest separation and recovery.'],
 ['pass_jump',1.30,false,'held_ready','released_ready','Two-foot jump pass: load, airborne two-hand chest release and balanced landing.'],
 ['receive_two_hands',1.08,false,'ready_empty','held_ready','Present palms, receive at chest height, yield into elbows and knees, secure.'],
 ['receive_moving',1.12,false,'moving_empty','moving_held','Reach ahead while stepping, absorb to the outside hip, continue the stride.'],
 ['dribble_idle',.88,true,'dribbling','dribbling','Low right-hand dribble with a smooth pressure window and ballistic floor contact.'],
 ['dribble_run',.72,true,'running_dribble','running_dribble','Forward running cycle with alternating support and a controlled right-hand dribble.'],
 ['dribble_behind_back',1.12,false,'dribbling','dribbling_left','Right-to-left behind-back transfer with trunk counterrotation and a real bounce.'],
 ['stop_two_feet',1.16,false,'running_dribble','held_stopped','Last bounce, two-foot jump stop, compression and secure gather ending the dribble.'],
 ['pivot',1.32,false,'held_stopped','held_pivoted','Protect the ball and turn around the planted left forefoot; right foot steps around.'],
 ['shot_start',1.26,false,'held_ready','shot_released','Compact gather and dip into upward extension, guide hand leaves before release.'],
 ['block',1.26,false,'defensive_ready','defensive_ready','Load, vertical contest, high right-hand deflection, two-foot cushioned landing.'],
 ['steal',1.16,false,'defensive_ready','held_ready','Lateral jab and low right-hand poke, recoil, then two-hand gather.']
];
export const AUTHOR_CLIPS=authored.map(([id,durationSeconds,loop,startState,endState,description])=>({id,durationSeconds,loop,startState,endState,description}));
const META=Object.fromEntries(AUTHOR_CLIPS.map(c=>[c.id,c]));
const releaseTimes={pass_chest:.48,pass_bounce:.48,pass_overhead:.52,pass_side:.5,pass_jump:.51,shot_start:.61};
const floorOffset=[0,-.08,0];
const PASS_BOUNCE_RESTITUTION=.90;
function passFlightVelocity(id,releasePosition,meta){
  const seconds=(1-releaseTimes[id])*meta.durationSeconds;
  const vy=id==='pass_bounce'?-2.3:(1.15-releasePosition[1]+.5*G*seconds*seconds)/seconds;
  return [id==='pass_side'?.55:0,vy,id==='pass_overhead'?4.5:id==='pass_side'?5.8:id==='pass_bounce'?5.25:id==='pass_jump'?5.7:5.9];
}

function passPose(id,t,meta){
  const p=basePose(),release=releaseTimes[id],bounce=id==='pass_bounce',over=id==='pass_overhead',side=id==='pass_side',jump=id==='pass_jump';
  const load=pulse(t,.02,.22,release),drive=ramp(t,.22,release),recover=ramp(t,.68,1);
  p.hips=[side?-.035*load:.015*drive,-.10-.035*load+.01*drive-.005*recover,.07*drive];
  p.yaw=side?-.24*load+.12*drive*(1-recover):-.04*load;
  p.lean=.08+.075*load-(over?.02:.04)*drive;p.twist=side?-.32*load+.16*drive*(1-recover):-.035*load;
  p.feet.LeftFoot.sole=[.18, .055*pulse(t,.12,.24,.36),.075+.24*ramp(t,.12,.36)];
  p.feet.RightFoot.sole=[-.18,0,-.075];p.feet.LeftFoot.yaw=.05;
  const start=[0,1.115,.38],loaded=over?[0,1.58,.32]:side?[-.26,1.025,.34]:bounce?[0,.98,.37]:jump?[0,1.105,.40]:[0,1.105,.37];
  const released=over?[0,1.62,.50]:side?[-.065,1.105,.59]:bounce?[0,1.035,.64]:jump?[0,1.55,.63]:[0,1.16,.65];
  const velocity=passFlightVelocity(id,released,meta);
  const launch=release-(over?.075:.10);
  const jumpAirSeconds=(.75-.32)*meta.durationSeconds,jumpState=time=>{const s=(time-.32)*meta.durationSeconds;return time>.32&&time<.75?{height:.5*G*s*(jumpAirSeconds-s),velocity:G*(jumpAirSeconds/2-s)}:{height:0,velocity:0};};
  const jumpNow=jumpState(t),jumpLaunch=jumpState(launch),launchPoint=jump?add(loaded,[0,jumpLaunch.height,0]):loaded;
  let center=t<launch?add(control(t,[[0,start],[.22,loaded],[launch,loaded]]),[0,jump?jumpNow.height:0,0]):hermiteC2(launchPoint,released,jump?[0,jumpLaunch.velocity,0]:[0,0,0],velocity,jump?[0,-G,0]:[0,0,0],[0,-G,0],(Math.min(t,release)-launch)/(release-launch),(release-launch)*meta.durationSeconds);
  if(jump){p.hips[1]=t>=.32&&t<=.75?-.09+jumpNow.height:control(t,[[0,-.10],[.20,-.15],[.32,-.09],[.75,-.09],[.84,-.15],[1,-.10]]);p.lean=.07+.055*load;p.feet.LeftFoot.sole=[.18,jumpNow.height,.10];p.feet.RightFoot.sole=[-.18,jumpNow.height,-.06];}
  if(t<=release){p.ball=center;p.hands=twoHands(center,.1+1.15*drive,over?-.08:0);}
  else{
    const elapsed=(t-release)*meta.durationSeconds;
    const hit=bounce?(-velocity[1]-Math.sqrt(velocity[1]**2+2*G*(released[1]-BALL_RADIUS)))/(-G):Infinity;
    p.ball=add(released,[velocity[0]*elapsed,velocity[1]*elapsed-.5*G*elapsed*elapsed,velocity[2]*elapsed]);
    if(bounce&&elapsed>=hit){const dy=elapsed-hit,vy=-(velocity[1]-G*hit)*PASS_BOUNCE_RESTITUTION;p.ball[1]=BALL_RADIUS+vy*dy-.5*G*dy*dy;}
    const endHands=twoHands(released,1.25,over?-.08:0);
    const follow=clamp((t-release)*meta.durationSeconds/.025),lower=ramp(t,.72,1);
    p.hands={};for(const name of ['LeftHand','RightHand']){const h=endHands[name];const ready=freeHand([name==='LeftHand'?.25:-.25,1.01,.31]),continued=hermite(h.position,add(h.position,mul(velocity,.0125)),velocity,[0,0,0],follow,.025);p.hands[name]={position:mix(continued,ready.position,lower),orientation:slerp(qmul(h.orientation,euler(-.3*smooth(follow))),ready.orientation,lower),contact:false};}
    p.phase='flight';
  }
  return p;
}
function receivePose(id,t,meta){
  const p=basePose(),moving=id==='receive_moving',contact=.31;
  p.lean=.1+.10*pulse(t,.28,.47,.75);p.hips=[moving?.025*ramp(t,.2,.6):0,-.065-.055*pulse(t,.29,.49,.76),moving?.025:0];
  const meet=moving?[-.055,1.18,.51]:[0,1.19,.51],secure=moving?[-.1,1.04,.38]:[0,1.105,.38];
  const catchVelocity=[0,-.35,-3.0],absorb=.49;
  const held=t<=contact?meet:t<absorb?hermite(meet,secure,catchVelocity,[0,0,0],(t-contact)/(absorb-contact),(absorb-contact)*meta.durationSeconds):control(t,[[absorb,secure],[1,[0,1.115,.38]]]);
  if(t<contact){const elapsed=(contact-t)*meta.durationSeconds;p.ball=add(meet,[0,-catchVelocity[1]*elapsed-.5*G*elapsed*elapsed,-catchVelocity[2]*elapsed]);p.phase='flight';const track=ramp(t,.10,.31);const preparation=add(meet,[0,-.03,-.055]);const tracking=add(meet,mul(catchVelocity,(t-contact)*meta.durationSeconds));p.hands=twoHands(mix(preparation,tracking,track),.35);for(const h of Object.values(p.hands))h.contact=false;}
  else{p.ball=held;p.hands=twoHands(held,.35);}
  if(moving){runFeet(p,t,meta.durationSeconds,.85);p.hips[1]=-.11-.025*pulse(t,.29,.49,.76);p.twist=-.07*Math.sin(TAU*t);}
  return p;
}
function cyclicBall(t,duration,top=.84,x=-.32,z=.34){
  // Contact-driven acceleration occupies the first/last 14%; the middle is
  // a gravity-only flight reflected once at the floor with restitution 1.
  const release=.14,hit=.5,catchAt=.86,flight=(hit-release)*duration;
  const yRelease=top-.09,vy=(BALL_RADIUS-yRelease+.5*G*flight*flight)/flight;
  let y,phase;
  if(t<release){y=hermiteC2([top],[yRelease],[0],[vy],[0],[-G],t/release,release*duration)[0];phase='hand';}
  else if(t<=hit){const s=(t-release)*duration;y=yRelease+vy*s-.5*G*s*s;phase='flight';}
  else if(t<catchAt){const s=(t-hit)*duration;y=BALL_RADIUS+(-vy+G*flight)*s-.5*G*s*s;phase='flight';}
  else{y=hermiteC2([yRelease],[top],[-vy],[0],[-G],[0],(t-catchAt)/(1-catchAt),(1-catchAt)*duration)[0];phase='hand';}
  return {position:[x,y,z],phase,releaseVelocity:vy};
}
function runFeet(p,t,duration,advance=1.65){
  const u=t%1,cycle=duration,stepLength=advance*cycle*.53;
  for(const [name,phase,x] of [['LeftFoot',0,.16],['RightFoot',.5,-.16]]){
    const f=(u+phase)%1;
    const z=f<.53?mix(stepLength*.5,-stepLength*.5,f/.53):mix(-stepLength*.5,stepLength*.5,smooth((f-.53)/.47));
    const lift=f<.53?0:.13*Math.sin(Math.PI*(f-.53)/.47)**1.5;
    p.feet[name]={sole:[x,lift,z],yaw:name==='LeftFoot'?.03:-.04,pitch:f<.53?0:.16*Math.sin(Math.PI*(f-.53)/.47)};
  }
  p.reference=[0,0,advance*duration*t];
}
function dribblePose(id,t,meta){
  const p=basePose(),run=id==='dribble_run';
  const cyc=cyclicBall(t,meta.durationSeconds,run?.88:.86,run?-.38:-.35,run?.47:.40);
  p.ball=cyc.position;p.phase=cyc.phase==='hand'?'dribble-contact':'dribble-flight';
  p.hips=[.012*Math.sin(TAU*t),-.10-.014*(1-Math.cos(TAU*t)),0];p.lean=run?.19:.12;p.twist=.045*Math.sin(TAU*t+.3);
  const touch=contactHand(p.ball,[0,1,0],[0,0,1]);
  if(cyc.phase==='hand')p.hands.RightHand=touch;
  else{const a=contactHand([p.ball[0],(run?.88:.86)-.09,p.ball[2]],[0,1,0],[0,0,1]).position,u=(t-.14)/.72,pos=hermite(a,a,[0,cyc.releaseVelocity,0],[0,-cyc.releaseVelocity,0],u,.72*meta.durationSeconds);pos[1]-=.07*Math.sin(Math.PI*u)**2;p.hands.RightHand=freeHand(pos,[0,1,0],[0,0,1]);}
  p.hands.LeftHand=freeHand([.30,run?1.07:1.02,.30+(run?.10*Math.sin(TAU*t):0)],[1,0,-.3],[0,-.3,1]);
  if(run){runFeet(p,t,meta.durationSeconds);p.hips[1]=-.13+.018*Math.cos(4*Math.PI*t);}
  return p;
}
function behindBackPose(t,meta){
  const p=basePose(),release=.25,hit=.45,catchAt=.76;
  p.hips=[.04*Math.sin(Math.PI*t),-.12-.035*Math.sin(Math.PI*t)**2,-.025];p.yaw=-.18*Math.sin(TAU*t);p.twist=.23*Math.sin(TAU*t);p.lean=.10;
  p.feet.RightFoot.sole=[-.19,0,-.09];p.feet.LeftFoot.sole=[.19,.035*pulse(t,.6,.73,.87),.08+.11*ramp(t,.60,.87)];
  const a=[-.34,.77,.20],b=[-.28,.65,-.24],c=[.31,.69,-.21],d=[.33,.82,.28];
  const horizontal=mul(sub(c,b),1/((catchAt-release)*meta.durationSeconds)),first=(hit-release)*meta.durationSeconds,down=(BALL_RADIUS-b[1]+.5*G*first*first)/first,launchV=[horizontal[0],down,horizontal[2]],second=(catchAt-hit)*meta.durationSeconds,up=(c[1]-BALL_RADIUS+.5*G*second*second)/second,catchV=[horizontal[0],up-G*second,horizontal[2]];
  if(t<=release){p.ball=hermiteC2(a,b,[0,0,0],launchV,[0,0,0],[0,-G,0],t/release,release*meta.durationSeconds);p.hands.RightHand=contactHand(p.ball,[0,.85,-.52],[0,-.52,-.85]);p.hands.LeftHand=freeHand([.31,.81,-.09],[0,.8,-.5],[0,-.5,-1]);p.phase='dribble-contact';}
  else if(t<catchAt){const elapsed=(t-release)*meta.durationSeconds,first=(hit-release)*meta.durationSeconds,vy=(BALL_RADIUS-b[1]+.5*G*first*first)/first;
    const horiz=(t-release)/(catchAt-release);p.ball=mix(b,c,horiz);if(t<=hit)p.ball[1]=b[1]+vy*elapsed-.5*G*elapsed*elapsed;else{const s=(t-hit)*meta.durationSeconds,second=(catchAt-hit)*meta.durationSeconds,v2=(c[1]-BALL_RADIUS+.5*G*second*second)/second;p.ball[1]=BALL_RADIUS+v2*s-.5*G*s*s;}
    const launchHand=contactHand(b,[0,.85,-.52],[0,-.52,-.85]);p.hands.RightHand=freeHand(control(t,[[release,launchHand.position],[.42,[-.23,.79,-.25]],[catchAt,[-.28,1.01,.15]]]),[0,.85,-.52],[0,-.52,-.85]);p.hands.RightHand.orientation=slerp(launchHand.orientation,freeHand([0,0,0],[0,0,1]).orientation,ramp(t,.47,catchAt));
    p.hands.LeftHand=freeHand(control(t,[[release,[.31,.81,-.09]],[.66,[.30,.82,-.19]],[catchAt,contactHand(c,[0,1,0],[0,0,1]).position]]),[0,1,0],[0,0,1]);p.hands.LeftHand.orientation=slerp(freeHand([0,0,0],[0,.8,-.5],[0,-.5,-1]).orientation,p.hands.LeftHand.orientation,ramp(t,release,.65));p.phase='dribble-flight';
  }else{p.ball=hermite(c,d,catchV,[0,0,0],(t-catchAt)/(1-catchAt),(1-catchAt)*meta.durationSeconds);p.hands.LeftHand=contactHand(p.ball,[0,1,0],[0,0,1]);p.hands.RightHand=freeHand(mix([-.28,1.01,.15],[-.29,1.02,.22],ramp(t,catchAt,1)),[0,0,1]);p.phase='dribble-contact';}
  return p;
}
function stopPose(t,meta){
  const p=basePose(),gather=.48,takeoff=.24,land=.55,catchAt=.344,cycleDuration=.40;
  const root=.60*(1-(1-clamp(t/.55))**3);p.reference=[0,0,root];
  const lift=.11*pulse(t,takeoff,.39,land);p.hips=[0,-.10+lift-.045*pulse(t,land,.66,.88),.02];p.lean=control(t,[[0,.19],[.35,.12],[.62,.20],[1,.07]]);
  p.feet.LeftFoot.sole=[.18,lift,mix(.24,.72,ramp(t,takeoff,land))-root];p.feet.RightFoot.sole=[-.18,lift+.07*pulse(t,.05,.17,.32),mix(-.08,.68,ramp(t,.05,land))-root];
  const leftGather=twoHands([-.10,1.06,.40],.1).LeftHand,leftFree=freeHand(mix([.28,1.05,.33],leftGather.position,ramp(t,.25,gather)),[1,0,-.1],[0,.28,1]);
  if(t<catchAt){const ball=cyclicBall(t/cycleDuration,cycleDuration*meta.durationSeconds,.85,-.29,.39);p.ball=ball.position;p.phase=ball.phase==='hand'?'dribble-contact':'dribble-flight';
    const release=.056,followEnd=release+.025/meta.durationSeconds,prepare=catchAt-.1/meta.durationSeconds,catchHand=contactHand([-.29,.76,.39],[0,1,0],[0,0,1]),departed=add(catchHand.position,[0,ball.releaseVelocity*.0125,0]),waiting=[-.30,.95,.33];
    const handPosition=t<=followEnd?hermite(catchHand.position,departed,[0,ball.releaseVelocity,0],[0,0,0],(t-release)/(followEnd-release),.025):t<prepare?mix(departed,waiting,ramp(t,followEnd,prepare)):hermite(waiting,catchHand.position,[0,0,0],[0,-ball.releaseVelocity,0],(t-prepare)/(catchAt-prepare),.1);
    p.hands.RightHand=ball.phase==='hand'?contactHand(p.ball,[0,1,0],[0,0,1]):freeHand(handPosition,[0,1,0],[0,0,1]);p.hands.LeftHand=leftFree;}
  else{const cyc=cyclicBall(.86,cycleDuration*meta.durationSeconds,.85,-.29,.39);p.ball=t<gather?hermite([-.29,.76,.39],[-.10,1.06,.40],[0,-cyc.releaseVelocity,0],[0,0,0],(t-catchAt)/(gather-catchAt),(gather-catchAt)*meta.durationSeconds):control(t,[[gather,[-.10,1.06,.40]],[.62,[0,1.02,.39]],[1,[0,1.115,.38]]]);p.hands=twoHands(p.ball,.10);if(t<gather){p.hands.LeftHand=leftFree;p.hands.RightHand=contactHand(p.ball,mix([0,1,0],[-1,0,-.1],ramp(t,catchAt,gather)),mix([0,0,1],[0,.28,1],ramp(t,catchAt,gather)));}}
  return p;
}
function pivotPose(t){
  const p=basePose(),turn=ramp(t,.19,.78),theta=.95*turn;
  p.yaw=theta;p.twist=.12*pulse(t,.08,.35,.85);p.lean=.095;p.hips=[.035*turn,-.07-.025*Math.sin(Math.PI*turn),.025*turn];
  const anchor=[.18,0,.10],right=add(anchor,yawPoint([-.36,0,-.19],theta));
  p.feet.LeftFoot={sole:anchor,yaw:.06+theta};p.feet.RightFoot={sole:add(right,[0,.085*pulse(t,.19,.47,.78),0]),yaw:-.08+theta};
  p.ball=add(yawPoint(control(t,[[0,[0,1.115,.38]],[.30,[-.10,1.015,.35]],[.80,[-.08,1.08,.38]],[1,[0,1.115,.38]]]),theta),[0,0,.015*turn]);
  const localBall=rotate(axis([0,1,0],-theta),p.ball);const h=twoHands(localBall,.12);p.hands={};for(const name of Object.keys(h))p.hands[name]={...h[name],position:yawPoint(h[name].position,theta),orientation:qmul(axis([0,1,0],theta),h[name].orientation)};
  return p;
}
function shotPose(t,meta){
  const p=basePose(),release=.61,guideOff=.55;
  const air=clamp((t-.49)/(.74-.49)),lift=t>.49&&t<.74?4*.12*air*(1-air):0;
  p.hips=[-.015,t>=.49&&t<=.74?-.065+lift:control(t,[[0,-.065],[.25,-.145],[.49,-.065],[.74,-.065],[.84,-.115],[1,-.065]]),0];
  p.lean=control(t,[[0,.08],[.25,.13],[.50,.025],[release,-.035],[.85,.05],[1,.08]]);p.twist=-.045;p.headPitch=-.025-.13*pulse(t,.34,.61,.96);
  p.feet.LeftFoot.sole=[.16,lift,.09];p.feet.RightFoot.sole=[-.16,lift,-.04];
  const shotVelocity=[0,5.2,3.8],set=t<.51?control(t,[[0,[0,1.115,.38]],[.24,[-.035,.99,.40]],[.46,[-.065,1.47,.37]],[.51,[-.065,1.49,.37]]]):hermiteC2([-.065,1.49,.37],[-.065,1.73,.47],[0,0,0],shotVelocity,[0,0,0],[0,-G,0],(Math.min(t,release)-.51)/.1,.1*meta.durationSeconds);
  if(t<=release){p.ball=set;p.hands=twoHands(set,.20);p.hands.RightHand=contactHand(set,[0,-.70,-.714],[0,.70,-.714]);const guide=ramp(t,.45,guideOff);p.hands.LeftHand=contactHand(set,[1,0,-.2*(1-guide)],[0,.28+.12*guide,1]);if(t>guideOff){p.hands.LeftHand=freeHand(add(contactHand(set,[1,0,0],[0,.4,1]).position,[.10*ramp(t,guideOff,release),-.015,0]),[1,0,0],[0,.4,1]);}}
  else{const s=(t-release)*meta.durationSeconds;p.ball=add(set,[.0,5.2*s-.5*G*s*s,3.8*s]);p.phase='flight';const releaseHand=contactHand(set,[0,-.70,-.714],[0,.70,-.714]);const follow=t<.72?hermite(releaseHand.position,[-.065,1.69,.39],shotVelocity,[0,0,0],(t-release)/.11,.11*meta.durationSeconds):control(t,[[.72,[-.065,1.69,.39]],[.85,[-.14,1.45,.35]],[1,[-.24,1.07,.33]]]);p.hands.RightHand=freeHand(follow);p.hands.RightHand.orientation=slerp(qmul(releaseHand.orientation,euler(-.95*ramp(t,release,.72))),freeHand([0,0,0]).orientation,ramp(t,.83,1));const leftSource=contactHand(set,[1,0,0],[0,.4,1]),leftRelease=add(leftSource.position,[.10,-.015,0]);p.hands.LeftHand=freeHand(control(t,[[release,leftRelease],[.78,[.27,1.4,.31]],[1,[.25,1.05,.32]]]),[1,0,-.2],[0,-.4,1]);p.hands.LeftHand.orientation=slerp(leftSource.orientation,p.hands.LeftHand.orientation,ramp(t,release,.8));}
  return p;
}
function blockPose(t,meta){
  const p=basePose(),takeoff=.31,contact=.53,land=.79;
  const u=clamp((t-takeoff)/(land-takeoff)),airSeconds=(land-takeoff)*meta.durationSeconds,footY=t>takeoff&&t<land?4*(G*airSeconds*airSeconds/8)*u*(1-u):0;
  p.hips=[-.025*pulse(t,.1,.5,.9),t>=takeoff&&t<=land?-.09+footY:control(t,[[0,-.09],[.20,-.16],[takeoff,-.09],[land,-.09],[.88,-.16],[1,-.09]]),-.025];p.lean=control(t,[[0,.12],[.2,.20],[.47,-.015],[.7,.01],[.88,.18],[1,.12]]);
  p.feet.LeftFoot.sole=[.18,footY,.07];p.feet.RightFoot.sole=[-.18,footY,-.07];p.headPitch=-.025-.18*pulse(t,.22,.53,.84);
  const right=control(t,[[0,[-.29,1.12,.25]],[.20,[-.31,1.01,.25]],[.39,[-.20,1.68,.21]],[contact,[-.13,2.02,.20]],[.63,[-.17,1.94,.25]],[.84,[-.30,1.31,.25]],[1,[-.29,1.12,.25]]]);
  p.hands.RightHand=freeHand(right,[0,0,-1],[0,1,.05]);p.hands.LeftHand=freeHand(control(t,[[0,[.29,1.12,.25]],[.43,[.35,1.67,.15]],[.61,[.36,1.80,.12]],[.83,[.31,1.28,.25]],[1,[.29,1.12,.25]]]),[0,0,-1],[0,1,.1]);
  // At the contest marker a real palm point meets the ball's rear surface.
  const impact=add([-.13,2.02,.20],rotate(p.hands.RightHand.orientation,HAND_CONTACT_POINT));
  if(t<contact){const s=(contact-t)*meta.durationSeconds;p.ball=add(add(impact,[0,0,BALL_RADIUS]),[0,2.8*s-.5*G*s*s,2.7*s]);}
  else{const s=(t-contact)*meta.durationSeconds;p.ball=add(add(impact,[0,0,BALL_RADIUS]),[-1.5*s,1.3*s-.5*G*s*s,-2.5*s]);}
  p.phase='loose';if(Math.abs(t-contact)<1e-7)p.hands.RightHand.contact=true;
  return p;
}
function stealPose(t){
  const p=basePose(),poke=.42,gather=.73;const lunge=pulse(t,.10,.43,.76);
  p.hips=[-.105*lunge,-.09-.085*lunge,.055*lunge];p.yaw=-.13*lunge;p.twist=-.22*lunge;p.lean=.13+.16*lunge;
  const recover=ramp(t,.78,.96);p.feet.RightFoot.sole=[-.18-.22*ramp(t,.10,.32)*(1-recover),.055*pulse(t,.10,.21,.32)+.055*pulse(t,.78,.87,.96),-.07+.22*ramp(t,.10,.32)*(1-recover)];p.feet.LeftFoot.sole=[.18,0,.08];p.headPitch=-.025+.13*pulse(t,.12,.42,.77);
  const ball=control(t,[[0,[-.50,.78,.66]],[poke,[-.40,.84,.44]],[.58,[-.37,.93,.44]],[gather,[-.15,1.02,.41]],[1,[0,1.115,.38]]]);p.ball=ball;p.phase=t<gather?'loose':'held';
  const swipe=contactHand(ball,[.35,0,-.94],[0,.15,1]);
  if(t<gather){p.hands.RightHand=t<poke?freeHand(control(t,[[0,[-.28,1.04,.26]],[.20,[-.36,.91,.32]],[poke,swipe.position]]),[.35,0,-.94],[0,.15,1]):contactHand(ball,mix([.35,0,-.94],[-1,0,-.12],ramp(t,poke,gather)),mix([0,.15,1],[0,.28,1],ramp(t,poke,gather)));p.hands.LeftHand=freeHand(control(t,[[0,[.29,1.05,.28]],[.46,[.28,1.12,.30]],[gather,contactHand(ball,[1,0,-.12]).position]]),[1,0,-.12],[0,.28,1]);}
  else p.hands=twoHands(ball,.12);
  return p;
}
function performance(id,t,meta){
  if(id.startsWith('pass_'))return passPose(id,t,meta);
  if(id.startsWith('receive_'))return receivePose(id,t,meta);
  if(id==='dribble_idle'||id==='dribble_run')return dribblePose(id,t,meta);
  if(id==='dribble_behind_back')return behindBackPose(t,meta);
  if(id==='stop_two_feet')return stopPose(t,meta);
  if(id==='pivot')return pivotPose(t);
  if(id==='shot_start')return shotPose(t,meta);
  if(id==='block')return blockPose(t,meta);
  return stealPose(t);
}
function ballOrientation(id,t,meta,p){
  const release=releaseTimes[id];
  if(release!==undefined){const at=Math.min(t,release),set=at===t?p:performance(id,at,meta),held=euler(.06*Math.sin(Math.PI*at/release)**2,set.yaw+set.twist*.5);return t<=release?held:qmul(axis([-1,0,0],(id==='shot_start'?11:8)*(t-release)*meta.durationSeconds),held);}
  if(id==='dribble_idle'||id==='dribble_run')return axis([1,0,0],TAU*t);
  if(id==='dribble_behind_back')return axis([0,0,1],TAU*t);
  if(id.startsWith('receive_')){const contact=.31,absorb=.49,elapsed=clamp(t-contact,0,absorb-contact),theta=-8*meta.durationSeconds*(Math.min(t,contact)+elapsed-elapsed*elapsed/(2*(absorb-contact)));return qmul(euler(0,p.yaw),axis([1,0,0],theta));}
  if(id==='stop_two_feet')return axis([1,0,0],TAU*Math.min(t/.48,1));
  if(id==='block')return qmul(axis([1,0,0],7*t*meta.durationSeconds),axis([0,0,1],-10*Math.max(0,t-.53)*meta.durationSeconds));
  return euler(0,p.yaw+p.twist*.5,0);
}
function bakePose(p,t){
  const rotations=Object.fromEntries(bones.map(b=>[b.name,I.slice()]));
  rotations.Hips=euler(0,p.yaw);rotations.Spine=euler(p.lean*.65,0,p.roll*.6);rotations.Chest=euler(p.lean*.35,p.twist,p.roll*.4);rotations.Neck=euler(-p.lean*.5);rotations.Head=euler(p.headPitch-p.lean*.35,p.headYaw-p.twist*.3);
  const world={};for(const b of bones){const parent=b.parent?world[b.parent]:null;let tr=b.restTranslationMeters;if(b.name==='Hips')tr=add(tr,p.hips);world[b.name]={p:parent?add(parent.p,rotate(parent.q,tr)):tr.slice(),q:parent?qmul(parent.q,rotations[b.name]):rotations[b.name],parentQ:parent?parent.q:I};}
  let maxReach=0;const reachByBone={};
  for(const [side,sgn] of [['Left',1],['Right',-1]]){
    const name=side+'Foot',f=p.feet[name],fq=euler(f.pitch||0,f.yaw||0),ankle=sub(f.sole,rotate(fq,floorOffset));
    const legReach=limb(side+'UpLeg',side+'Leg',name,ankle,add(world[side+'UpLeg'].p,yawPoint([.02*sgn,-.15,.8],p.yaw)),world,rotations);reachByBone[side+'UpLeg']=legReach;maxReach=Math.max(maxReach,legReach);rotations[name]=qnorm(qmul(qinv(world[name].parentQ),fq));
    const hand=p.hands[side+'Hand'],elbowPole=add(world[side+'Arm'].p,yawPoint([sgn*.38,-.32,-.13],p.yaw));
    if(!hand.contact){const origin=world[side+'Arm'].p,delta=sub(hand.position,origin);if(norm(delta)>.495)hand.position=add(origin,mul(unit(delta),.495));}
    const armReach=limb(side+'Arm',side+'ForeArm',side+'Hand',hand.position,elbowPole,world,rotations);reachByBone[side+'Arm']=armReach;maxReach=Math.max(maxReach,armReach);rotations[side+'Hand']=qnorm(qmul(qinv(world[side+'Hand'].parentQ),hand.orientation));
  }
  return {time:t,rotations,hipsOffsetMeters:p.hips,referenceRootTranslationMeters:p.reference,ballPositionMeters:p.ball,_reachError:maxReach,_reachByBone:reachByBone};
}
function definitions(id,meta){
  const event=(time,name)=>({time,atSeconds:time*meta.durationSeconds,name,domain:'presentation'});
  const support=(effector,startTime,endTime,kind='plant')=>({effector,startTime,endTime,startSeconds:startTime*meta.durationSeconds,endSeconds:endTime*meta.durationSeconds,kind,localPointMeters:floorOffset});
  let events=[],supportWindows=[],ballWindows=[];
  const hold=(a,b,names=['LeftHand','RightHand'])=>names.forEach(effector=>ballWindows.push({effector,startTime:a,endTime:b,localPointMeters:HAND_CONTACT_POINT}));
  if(id.startsWith('pass_')){const r=releaseTimes[id];events=[event(r,'release'),event(.36,'left_plant')];hold(0,r);supportWindows=[support('RightFoot',0,1),support('LeftFoot',0,.12),support('LeftFoot',.36,1)];if(id==='pass_jump'){events=[event(.32,'takeoff'),event(r,'release'),event(.75,'land')];supportWindows=[support('LeftFoot',0,.32),support('RightFoot',0,.32),support('LeftFoot',.75,1),support('RightFoot',.75,1)];}if(id==='pass_bounce'){const releasedY=1.035,vy=-2.3,flight=(-vy-Math.sqrt(vy*vy+2*G*(releasedY-BALL_RADIUS)))/(-G);events.push(event(r+flight/meta.durationSeconds,'bounce'));}}
  else if(id.startsWith('receive_')){events=[event(.31,'contact'),event(.56,'secure')];hold(.31,1);supportWindows=id==='receive_moving'?[support('LeftFoot',0,.53),support('RightFoot',0,.03),support('RightFoot',.5,1)]:[support('LeftFoot',0,1),support('RightFoot',0,1)];}
  else if(id==='dribble_idle'||id==='dribble_run'){events=[event(.14,'release'),event(.5,'bounce'),event(.86,'contact')];hold(0,.14,['RightHand']);hold(.86,1,['RightHand']);supportWindows=id==='dribble_run'?[support('LeftFoot',0,.53),support('RightFoot',0,.03),support('RightFoot',.5,1)]:[support('LeftFoot',0,1),support('RightFoot',0,1)];}
  else if(id==='dribble_behind_back'){events=[event(.25,'release'),event(.45,'bounce'),event(.76,'contact')];hold(0,.25,['RightHand']);hold(.76,1,['LeftHand']);supportWindows=[support('RightFoot',0,1),support('LeftFoot',0,.6),support('LeftFoot',.87,1)];}
  else if(id==='stop_two_feet'){events=[event(.056,'release'),event(.20,'bounce'),event(.344,'contact'),event(.48,'secure'),event(.24,'takeoff'),event(.55,'land')];hold(0,.056,['RightHand']);hold(.344,.48,['RightHand']);hold(.48,1);supportWindows=[support('LeftFoot',0,.24),support('RightFoot',0,.05),support('LeftFoot',.55,1),support('RightFoot',.55,1)];}
  else if(id==='pivot'){events=[event(.19,'pivot_start'),event(.78,'right_plant')];hold(0,1);supportWindows=[support('LeftFoot',0,1,'pivot'),support('RightFoot',0,.19),support('RightFoot',.78,1)];}
  else if(id==='shot_start'){events=[event(.49,'takeoff'),event(.55,'guide_release'),event(.61,'release'),event(.74,'land')];hold(0,.55,['LeftHand']);hold(0,.61,['RightHand']);supportWindows=[support('LeftFoot',0,.49),support('RightFoot',0,.49),support('LeftFoot',.74,1),support('RightFoot',.74,1)];}
  else if(id==='block'){events=[event(.31,'takeoff'),event(.53,'contact'),event(.79,'land')];hold(.53,.53,['RightHand']);supportWindows=[support('LeftFoot',0,.31),support('RightFoot',0,.31),support('LeftFoot',.79,1),support('RightFoot',.79,1)];}
  else{events=[event(.32,'right_plant'),event(.42,'contact'),event(.73,'secure'),event(.96,'recovery_plant')];hold(.42,.73,['RightHand']);hold(.73,1);supportWindows=[support('LeftFoot',0,1),support('RightFoot',0,.10),support('RightFoot',.32,.78),support('RightFoot',.96,1)];}
  return {events:events.sort((a,b)=>a.time-b.time),supportWindows,ballContactWindows:ballWindows};
}
const rounded=n=>Math.abs(n)<1e-10?0:Math.round(n*1e8)/1e8;
function clean(value){if(typeof value==='number')return rounded(value);if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));return value;}
export function buildClip(id){
  const meta=META[id];if(!meta)throw new Error('Unknown clip '+id);const def=definitions(id,meta);
  const steps=Math.ceil(meta.durationSeconds*120),times=new Set(Array.from({length:steps+1},(_,i)=>i/steps));
  for(const e of def.events)times.add(e.time);for(const w of def.ballContactWindows){times.add(w.startTime);times.add(w.endTime);}for(const w of def.supportWindows){times.add(w.startTime);times.add(w.endTime);}
  const keyframes=[],trajectory=[],ballContacts=[],reachByBone={};let maximumReachError=0;
  for(const time of [...times].sort((a,b)=>a-b)){
    const pose=performance(id,time,meta),frame=bakePose(pose,time);frame.ballRotationQuaternion=ballOrientation(id,time,meta,pose);maximumReachError=Math.max(maximumReachError,frame._reachError);for(const [bone,error] of Object.entries(frame._reachByBone))if(!reachByBone[bone]||error>reachByBone[bone].error)reachByBone[bone]={error,time};delete frame._reachError;delete frame._reachByBone;
    if(keyframes.length){for(const name of Object.keys(frame.rotations))if(dot(frame.rotations[name],keyframes.at(-1).rotations[name])<0)frame.rotations[name]=mul(frame.rotations[name],-1);}
    if(keyframes.length&&dot(frame.ballRotationQuaternion,keyframes.at(-1).ballRotationQuaternion)<0)frame.ballRotationQuaternion=mul(frame.ballRotationQuaternion,-1);
    keyframes.push(frame);trajectory.push({time,positionMeters:pose.ball,rotationQuaternion:frame.ballRotationQuaternion,phase:pose.phase});
  }
  for(const w of def.ballContactWindows){const sampleTimes=new Set([w.startTime,w.endTime,(w.startTime+w.endTime)/2]);for(const time of sampleTimes){const frame=keyframes.reduce((a,b)=>Math.abs(a.time-time)<Math.abs(b.time-time)?a:b),fk=forwardKinematics(frame),effector=fk[w.effector],point=add(effector.position,rotate(effector.rotation,HAND_CONTACT_POINT));ballContacts.push({time:frame.time,atSeconds:frame.time*meta.durationSeconds,effector:w.effector,localPointMeters:HAND_CONTACT_POINT,effectorPositionMeters:point,ballCenterMeters:frame.ballPositionMeters,surfaceDistanceMeters:norm(sub(point,frame.ballPositionMeters))});}}
  for(const w of def.supportWindows){const frame=keyframes.reduce((a,b)=>Math.abs(a.time-w.startTime)<Math.abs(b.time-w.startTime)?a:b),fk=forwardKinematics(frame),foot=fk[w.effector];w.anchorMeters=add(foot.position,rotate(foot.rotation,floorOffset));}
  const passRelease=id.startsWith('pass_')?keyframes.find(frame=>Math.abs(frame.time-releaseTimes[id])<1e-10):null;
  const flightReference=passRelease?{releaseTime:releaseTimes[id],releaseAtSeconds:releaseTimes[id]*meta.durationSeconds,releasePositionMeters:passRelease.ballPositionMeters,releaseVelocityMetersPerSecond:passFlightVelocity(id,passRelease.ballPositionMeters,meta),targetAtClipEndMeters:keyframes.at(-1).ballPositionMeters,gravityMetersPerSecondSquared:G,restitution:id==='pass_bounce'?PASS_BOUNCE_RESTITUTION:null,semantics:'visual reference only; no receiver, catch, possession or hit is implied'}:null;
  return clean({schemaVersion:1,kind:'hoops-motion-v8-clip',...meta,clip:id,rootMotion:false,sampleRate:120,axes:CANONICAL_SKELETON.axes,units:'meters',skeleton:CANONICAL_SKELETON,interpolation:'linear-time shortest-arc slerp; already eased by authoring',authorship:{type:'original procedural keyframe performance',license:'CC0-1.0',source:'source/motion-author.mjs',motionCapture:false},...def,keyframes,ball:{radiusMeters:BALL_RADIUS,coordinateSpace:'canonical-root-local-in-place',trajectory,simulationOwned:true,...(flightReference?{flightReference}:{})},diagnostics:{maximumReachErrorMeters:maximumReachError,reachByBone},semantics:{events:'presentation-only; gameplay owns possession, scoring and hit decisions',root:'Root identity; Hips translation is canonical rest plus hipsOffsetMeters; referenceRootTranslationMeters must never be applied as root motion',support:'plant anchors are local pose recommendations; preserve world anchor and solve IK after blending',ballContact:'localPointMeters meets the ball surface, not its centre'}});
}
export async function buildMotion(outDir=new URL('../runtime/keyframes/',import.meta.url)){
  await mkdir(outDir,{recursive:true});const results=[];
  for(const meta of AUTHOR_CLIPS){const clip=buildClip(meta.id),path=typeof outDir==='string'?resolve(outDir,meta.id+'.json.gz'):new URL(meta.id+'.json.gz',outDir),data=gzipSync(Buffer.from(JSON.stringify(clip)),{level:9,mtime:0});await writeFile(path,data);results.push({id:meta.id,path:typeof path==='string'?path:fileURLToPath(path),bytes:data.length,samples:clip.keyframes.length,reachError:clip.diagnostics.maximumReachErrorMeters});}
  return results;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildMotion(process.argv[2]),null,2));
