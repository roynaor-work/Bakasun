/** Original CC0-1.0 basketball performances. Analytic target-space IK, 30Hz.
 * No imported animation samples. The measured tall bind rig is the only input.
 */
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {add,sub,mul,dot,cross,length,normalize,lerp,clamp,qIdentity as I,qMul,qInverse,qAxisAngle,qRotate,qEuler,qFromBasis,FK,palmMarker,soleMarker} from '../runtime/math.mjs';
const ROOT=new URL('../',import.meta.url);
const rig=JSON.parse(await fs.readFile(new URL('runtime/rig.json',ROOT)));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(t,a,b)=>smooth((t-a)/(b-a));
const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));
const yaw=a=>qAxisAngle([0,1,0],a);
function control(t,keys){if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return lerp(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);}
const specs=[
 ['dunk_low','הטבעה · קפיצה 94 ס״מ','dunk',2.2,{lift:.94}],
 ['dunk_high','הטבעה · קפיצה מטר','dunk',2.2,{lift:1}],
 ['layup_left','צעד וחצי · יד שמאל','layup',2,{side:1}],
 ['layup_right','צעד וחצי · יד ימין','layup',2,{side:-1}],
 ['sprint_brake','ספרינט ובלימה','sprint',1.6,{}],
 ['sprint_brake_ball','ספרינט ובלימה עם כדור','sprint',1.6,{ball:true}],
 ['turn_90_left','פנייה 90° שמאלה','turn',1.8,{angle:Math.PI/2}],
 ['turn_90_right','פנייה 90° ימינה','turn',1.8,{angle:-Math.PI/2}],
 ['turn_180_left','פנייה 180° שמאלה','turn',1.8,{angle:Math.PI}],
 ['turn_180_right','פנייה 180° ימינה','turn',1.8,{angle:-Math.PI}],
 ['defensive_stance','עמדת הגנה נמוכה','defense',2,{loop:true}],
 ['defensive_slide_left','צעדי הגנה שמאלה','slide',2,{side:1}],
 ['defensive_slide_right','צעדי הגנה ימינה','slide',2,{side:-1}],
 ['defensive_block','הגנה והושטת יד לחסימה','block',1.8,{}],
 ['dribble_behind_back','כדרור מאחורי הגב','behind',1.4,{ball:true}],
 ['pivot','ציר מוגן עם רגל נעולה','pivot',1.6,{ball:true}],
 ['shot_start','איסוף, עלייה ושחרור','shot',1.6,{ball:true}],
 ['stop_two_feet','איסוף ועצירה בשתי רגליים','stop',1.4,{ball:true}],
];
const clips=specs.map(([id,labelHe,kind,durationSeconds,o])=>({id,labelHe,kind,durationSeconds,loop:false,...o}));
const profiles=rig.profiles.map(p=>({...p,model:`runtime/models/${p.id}.glb`}));

function rootAt(c,t){
 if(c.kind==='sprint'){const end=.9,s=Math.min(t,end);return {p:[0,0,4.8*(s-s*s/(2*end))],q:yaw(0)};}
 if(c.kind==='turn'){
  const a=c.angle*ramp(t,.5,1.1),v=.95;
  // Integrate a fixed heading schedule independently of feet/ball.
  const n=240,dt=t/n;let p=[0,0,0];for(let i=0;i<n;i++){const h=c.angle*ramp((i+.5)*dt,.5,1.1),speed=v*(1-.3*pulse((i+.5)*dt,.4,.8,1.2));p=add(p,[Math.sin(h)*speed*dt,0,Math.cos(h)*speed*dt]);}
  return {p,q:yaw(a)};
 }
 if(c.kind==='slide')return {p:[c.side*.95*ramp(t,0,1.8),0,0],q:yaw(0)};
 if(c.kind==='pivot'){const a=1.2*ramp(t,.3,1.2),anchor=[.21,0,0];return {p:sub(anchor,qRotate(yaw(a),anchor)),q:yaw(a)};}
 if(c.kind==='layup')return {p:[0,0,control(t,[[0,0],[.3,.45],[.6,1.0],[.8,1.45],[1.1,1.95],[1.6,2.2],[2,2.2]])],q:yaw(0)};
 if(c.kind==='dunk')return {p:[0,0,control(t,[[0,0],[.3,.55],[.6,1.1],[.8,1.6],[1.1,2.25],[1.3,2.30],[1.7,2.3],[2.2,2.3]])],q:yaw(0)};
 if(c.kind==='stop'){const s=Math.min(t,.6);return {p:[0,0,2.8*(s-s*s/1.2)],q:yaw(0)};}
 return {p:[0,0,0],q:yaw(0)};
}
function groundAnchor(c,t,side,z=0,width=.21){const r=rootAt(c,t);return {p:add(r.p,qRotate(r.q,[side*width,0,z])),q:r.q};}
function windows(c,side){
 if(c.kind==='sprint')return side===1?[[0,.13],[.53,.67],[.93,c.durationSeconds]]:[[.267,.4],[.8,c.durationSeconds]];
 if(c.kind==='turn')return side===1?[[0,.2],[.5,1.1],[1.4,c.durationSeconds]]:[[.267,.467],[1.1,1.333],[1.667,c.durationSeconds]];
 if(c.kind==='layup')return side===c.side?[[.3,.467],[1.6,2]]:[[0,.167],[.6,.8],[1.667,2]];
 if(c.kind==='dunk')return side===1?[[0,.167],[.6,.8],[1.7,2.2]]:[[.3,.467],[.6,.8],[1.767,2.2]];
 if(c.kind==='stop')return side===1?[[0,.167],[.767,1.4]]:[[.267,.433],[.767,1.4]];
 if(c.kind==='slide')return side===c.side?[[0,.067],[.433,.9],[1.333,2]]:[[0,.5],[.933,1.433],[1.867,2]];
 if(c.kind==='pivot')return side===1?[[0,1.6]]:[[0,.233],[1.233,1.6]];
 return [[0,c.durationSeconds]];
}
function anchored(c,side,a,b){
 let targetTime=a;
 if(c.kind==='sprint')targetTime=Math.min(.9,a+.065);
 if(c.kind==='turn')targetTime=a+.07;
 if(c.kind==='layup'||c.kind==='dunk')targetTime=a>=1.5?1.7:a+.07;
 if(c.kind==='stop'&&a>.7)targetTime=.6;
 if(c.kind==='slide')targetTime=a===0?0:Math.min(1.8,a+.18);
 let anchor=groundAnchor(c,targetTime,side,0,c.kind==='slide'||c.kind==='defense'||c.kind==='block'?.32:.21);
 if(c.kind==='pivot')anchor=a===0?groundAnchor(c,0,side):groundAnchor(c,1.3,side);
 return {...anchor,a,b};
}
function footPose(c,side,t,jump){
 const ws=windows(c,side).map(([a,b])=>anchored(c,side,a,b));
 const support=ws.find(w=>t>=w.a-1e-7&&t<=w.b+1e-7);
 if(support)return {sole:support.p,q:support.q,planted:true,anchor:support.p};
 let before=[...ws].reverse().find(w=>w.b<t),after=ws.find(w=>w.a>t);
 if(!before){const start=groundAnchor(c,-.12,side,-.22);before={...start,b:-.2};}
 if(!after){const last=groundAnchor(c,c.durationSeconds,side);after={...last,a:c.durationSeconds+.1};}
 const u=clamp((t-before.b)/(after.a-before.b)),p=lerp(before.p,after.p,smooth(u));
 let h=(c.kind==='slide'?.04:.15)*Math.sin(Math.PI*u);
 if((c.kind==='layup'&&t>.8&&t<1.6)||(c.kind==='dunk'&&t>.8&&t<1.7))h=jump+.16*Math.sin(Math.PI*clamp((t-.8)/((c.kind==='dunk'?1.7:1.6)-.8)));
 if(c.kind==='stop'&&t>.433&&t<.767)h=.1*Math.sin(Math.PI*(t-.433)/.334);
 p[1]=h;return {sole:p,q:before.q,planted:false,anchor:null};
}
function limb(profile,frame,a,b,end,target,pole){
 let world=FK(profile,frame,{local:true}).world;
 const origin=world[a].position,parent=profile.joints.find(j=>j.name===a).parent,parentQ=world[parent].rotation;
 const L1=length(profile.joints.find(j=>j.name===b).translation),L2=length(profile.joints.find(j=>j.name===end).translation);
 const delta=sub(target,origin),raw=length(delta),d=clamp(raw,.04,L1+L2-.0001),dir=normalize(delta);
 const u=normalize(sub(sub(pole,origin),mul(dir,dot(sub(pole,origin),dir))),[0,0,1]);
 const x=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-x*x));
 const elbow=add(origin,add(mul(dir,x),mul(u,h))),finish=add(origin,mul(dir,d));
 const plane=normalize(cross(u,dir));
 const segment=v=>{const yy=mul(normalize(v),-1),xx=plane,zz=normalize(cross(xx,yy));return qFromBasis(xx,yy,zz);};
 const qa=segment(sub(elbow,origin)),qb=segment(sub(finish,elbow));
 frame.rotations[a]=qMul(qInverse(parentQ),qa);frame.rotations[b]=qMul(qInverse(qa),qb);
 return Math.max(0,raw-d);
}
function palmQ(outward,fingers=[0,1,0]){const z=mul(normalize(outward),-1),y=mul(normalize(sub(fingers,mul(z,dot(fingers,z))),[0,0,1]),-1),x=normalize(cross(y,z));return qFromBasis(x,y,z);}
function hand(profile,frame,name,palm,outward,fingers,contact){
 const q=palmQ(outward,fingers),wrist=sub(palm,qRotate(q,palmMarker(profile,name))),side=name==='LeftHand'?1:-1;
 const parent=name==='LeftHand'?'LeftForeArm':'RightForeArm',arm=name==='LeftHand'?'LeftArm':'RightArm';
 const shoulder=FK(profile,frame,{local:true}).world[arm].position;
 // Elbows lead down and close to the ribcage; avoid the raised, lateral
 // "chicken wing" solution of an unconstrained two-bone hand target.
 const error=limb(profile,frame,arm,parent,name,wrist,add(shoulder,[side*.15,-.6,.05]));
 const pw=FK(profile,frame,{local:true}).world[parent].rotation;frame.rotations[name]=qMul(qInverse(pw),q);
 frame.handContacts[name]={touching:contact};return error;
}
function pose(profile,c,t){
 const scale=profile.heightMeters/1.88,root=rootAt(c,t),duration=c.durationSeconds;
 let jump=0,hips=-.17,lean=.10;
 if(c.kind==='dunk'){jump=c.lift*pulse(t,.8,1.1,1.7);hips=jump>0?jump-.12*(1-ramp(t,.8,1.1))-.12*ramp(t,1.1,1.7):control(t,[[0,-.17],[.7,-.25],[.8,-.12],[1.7,-.12],[1.83,-.28],[2.2,-.17]]);lean=.16*(1-ramp(t,.8,1.1));}
 if(c.kind==='layup'){jump=.58*pulse(t,.8,1.1,1.6);hips=jump>0?jump-.12*(1-ramp(t,.8,1.1))-.12*ramp(t,1.1,1.6):control(t,[[0,-.17],[.7,-.20],[.8,-.12],[1.6,-.12],[1.73,-.25],[2,-.17]]);lean=.27*(1-ramp(t,.8,1.1))+.03;}
 if(c.kind==='sprint'){hips=-.18-.055*Math.cos(t*Math.PI*7.5);lean=.29*(1-ramp(t,.4,1))-.12*pulse(t,.5,.8,1.2);}
 if(c.kind==='turn'){hips=-.24-.03*Math.sin(t*Math.PI*4);lean=.17;}
 if(['defense','slide','block'].includes(c.kind)){hips=-.30;lean=.17;}
 if(c.kind==='stop'){jump=.10*pulse(t,.433,.6,.767);hips=-.20+jump-.08*pulse(t,.767,.9,1.2);lean=.15;}
 if(c.kind==='shot'){jump=.12*pulse(t,.6,.9,1.2);hips=-.16-.10*pulse(t,0,.4,.65)+jump;lean=.06;}
 const frame={time:t/duration,rotations:Object.fromEntries(profile.joints.map(j=>[j.name,[...I]])),hipsOffsetMeters:[0,hips,0],referenceRootTranslationMeters:root.p,rootRotationQuaternion:root.q,ballPositionMeters:[0,-2,0],ballPhase:'empty',contacts:{},handContacts:{}};
 frame.rotations.Spine=qEuler(lean*.6);frame.rotations.Chest=qEuler(lean*.4,c.kind==='behind'?.25*Math.sin(t/duration*Math.PI*2):0);frame.rotations.Neck=qEuler(-lean*.35);
 const toLocal=p=>qRotate(qInverse(root.q),sub(p,root.p));
 let reachError=0;
 for(const side of [1,-1]){
  const foot=side===1?'LeftFoot':'RightFoot',upper=side===1?'LeftUpLeg':'RightUpLeg',lower=side===1?'LeftLeg':'RightLeg',fp=footPose(c,side,t,jump),fq=qMul(qInverse(root.q),fp.q),target=sub(toLocal(fp.sole),qRotate(fq,soleMarker(profile,foot)));
  const hip=FK(profile,frame,{local:true}).world[upper].position;
  reachError=Math.max(reachError,limb(profile,frame,upper,lower,foot,target,add(hip,[side*.07,0,1])));
  const parent=FK(profile,frame,{local:true}).world[lower].rotation;frame.rotations[foot]=qMul(qInverse(parent),fq);
  frame.contacts[foot]={planted:fp.planted,anchorWorldMeters:fp.anchor};
 }
 const handTargets={};
 const free=(name,p,out=[0,0,1],fingers=[0,-1,0])=>handTargets[name]={p,out,fingers,contact:false};
 const touch=(name,ball,out,fingers=[0,.3,1])=>handTargets[name]={p:add(ball,mul(out,.12)),out,fingers,contact:true};
 const hold=ball=>{frame.ballPositionMeters=ball;frame.ballPhase='held';touch('LeftHand',ball,[1,0,0]);touch('RightHand',ball,[-1,0,0]);};
 const chestY=profile.shoulderHeightMeters-.32+hips;
 const swing=.16*Math.sin(t*2*Math.PI*2);
 free('LeftHand',[.30*scale,chestY+.06,.28+swing]);free('RightHand',[-.30*scale,chestY+.06,.28-swing]);
 if(['defense','slide','block'].includes(c.kind)){
  free('LeftHand',[.65*scale,profile.shoulderHeightMeters-.2,.22]);free('RightHand',[-.65*scale,profile.shoulderHeightMeters-.2,.22]);
  if(c.kind==='block'){const r=pulse(t,.3,.85,1.4);free('RightHand',lerp([-.6,1.35,.2],[-.14,2.0*scale,.46],r),[0,0,1],[0,1,0]);}
 }
 if(c.ball||['dunk','layup','shot'].includes(c.kind))hold([0,chestY,.36]);
 let release=null,gather=null;
 if(c.kind==='pivot')hold([-.28,chestY+.06,.36]);
 if(c.kind==='behind'){
  free('LeftHand',[.35,chestY,.2]);free('RightHand',[-.35,chestY,.2]);
  const ball=control(t,[[0,[-.36,.95*scale,.32]],[.3,[-.40,.76*scale,-.22]],[.6,[0,.12,-.31]],[1,[.40,.76*scale,-.22]],[1.4,[.36,.95*scale,.32]]]);
  frame.ballPositionMeters=ball;frame.ballPhase=t<.3?'dribble-contact':t<1?'dribble-flight':'dribble-contact';
  if(t<=.3)touch('RightHand',ball,[0,1,0],[0,0,-1]);else if(t>=1)touch('LeftHand',ball,[0,1,0],[0,0,1]);
 }
 if(c.kind==='sprint'&&c.ball){
  free('LeftHand',[.30*scale,chestY+.06,.28+swing]);free('RightHand',[-.30*scale,chestY+.06,.28-swing]);
  const b=[-.35,.12+.80*Math.abs(Math.cos(Math.PI*t/.8)),.34];frame.ballPositionMeters=b;frame.ballPhase=t>=.8?'gather':'dribble-flight';
  if(t>=.8){gather=.8;const held=lerp([-.35,.92,.34],[0,chestY,.36],ramp(t,.8,1.05));frame.ballPositionMeters=held;if(t>=1.05)hold(held);else touch('RightHand',held,[0,1,0]);}else if(Math.abs(Math.cos(Math.PI*t/.8))>.8)touch('RightHand',b,[0,1,0]);
 }
 if(c.kind==='stop'){gather=.533;const b=t<gather?[-.32,.12+.7*Math.abs(Math.cos(Math.PI*t/.533)),.35]:[0,chestY+.03,.38];if(t<gather){free('LeftHand',[.35,chestY,.2]);free('RightHand',[-.35,chestY,.2]);frame.ballPositionMeters=b;frame.ballPhase='dribble-flight';if(t<.1)touch('RightHand',b,[0,1,0]);}else hold(b);}
 if(c.kind==='dunk'||c.kind==='layup'){
  gather=.167;release=c.kind==='dunk'?1.2:1.1;
  const side=c.kind==='layup'?c.side:-1,name=side===1?'LeftHand':'RightHand';
  const startWorld=add(root.p,[0,chestY,.36]);
  const peak=c.kind==='dunk'?[-.08,3.32+(c.lift-.94),2.4]:[side*.07,2.73*scale,2.1];
  const liftStart=.6;
  let ballWorld;
  if(t<liftStart)ballWorld=startWorld;
  else if(t<=release){
   if(c.kind==='dunk'){
    const extension=lerp(-.32,peak[1]-profile.shoulderHeightMeters-c.lift,ramp(t,liftStart,1.1));
    ballWorld=[-.08*ramp(t,liftStart,1.1),profile.shoulderHeightMeters+hips+extension,root.p[2]+lerp(.38,.15,ramp(t,liftStart,1.1))];
    if(t>1.1)ballWorld=lerp(ballWorld,[-.08,3.15,2.4],ramp(t,1.1,release));
   }else ballWorld=control(t,[[liftStart,add(rootAt(c,liftStart).p,[0,profile.shoulderHeightMeters-.45,.38])],[release,peak]]);
  }
  else{
   const rel=c.kind==='dunk'?[-.08,3.15,2.4]:peak,dt=t-release;
   if(c.kind==='dunk')ballWorld=add(rel,[0,-1.7*dt-4.905*dt*dt,0]);
   else{const flight=.35,vy=(3.05-rel[1]+4.905*flight*flight)/flight;ballWorld=add(rel,[-rel[0]/flight*dt,vy*dt-4.905*dt*dt,(2.4-rel[2])/flight*dt]);}
   ballWorld[1]=Math.max(.12,ballWorld[1]);
  }
  const ball=toLocal(ballWorld);frame.ballPositionMeters=ball;
  if(t<gather){
   const b=[side*.34,.9*scale-.25*Math.sin(Math.PI*t/gather),.34];frame.ballPositionMeters=b;frame.ballPhase='dribble-contact';
   free('LeftHand',[.35,chestY,.2]);free('RightHand',[-.35,chestY,.2]);touch(name,b,[0,1,0]);
  }else if(t<liftStart)hold(ball);else if(t<=release){frame.ballPhase='carry';touch(name,ball,c.kind==='dunk'?[0,0,-1]:[side*.15,-.8,-.58],c.kind==='dunk'?[0,1,0]:[0,0,1]);free(side===1?'RightHand':'LeftHand',[-side*.42,profile.shoulderHeightMeters-.3+hips,.12]);}
  else{frame.ballPhase='flight';const follow=toLocal(add(peak,[0,.06,0]));free(name,lerp(follow,[side*.3,chestY,.3],ramp(t,release+.08,release+.45)),[0,1,0],[0,0,1]);free(side===1?'RightHand':'LeftHand',[-side*.42,chestY,.12]);}
 }
 if(c.kind==='shot'){
  gather=.2;release=.9;const ball=control(Math.min(t,release),[[0,[0,chestY,.35]],[.4,[0,chestY-.09,.38]],[.7,[-.08,1.85*scale,.39]],[release,[-.08,2.18*scale,.42]]]);
  if(t<=release){hold(ball);if(t>.733){handTargets.LeftHand.contact=false;free('LeftHand',[.25,1.9*scale,.35]);}}
  else{const dt=t-release,rel=[-.08,2.18*scale,.42],flight=.7,vy=(3.05-rel[1]+4.905*flight*flight)/flight;frame.ballPositionMeters=add(rel,[.08/flight*dt,vy*dt-4.905*dt*dt,(2.4-.42)/flight*dt]);frame.ballPhase='flight';free('RightHand',[-.1,2.12*scale,.5],[0,0,1],[0,1,0]);free('LeftHand',[.30,chestY,.24]);}
 }
 for(const name of ['LeftHand','RightHand']){const h=handTargets[name];reachError=Math.max(reachError,hand(profile,frame,name,h.p,h.out,h.fingers,h.contact));}
 if(frame.ballPhase==='dribble-flight'&&Object.values(frame.handContacts).some(h=>h.touching))frame.ballPhase='dribble-contact';
 if(frame.ballPhase==='dribble-contact'&&!Object.values(frame.handContacts).some(h=>h.touching))frame.ballPhase='dribble-flight';
 frame.solverReachExcessMeters=reachError;
 return frame;
}
export async function author(){
 await fs.mkdir(new URL('runtime/keyframes/',ROOT),{recursive:true});
 const catalog={schemaVersion:1,fps:30,license:'CC0-1.0',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},units:'meters',profiles,clips:clips.map(c=>({...c,activeHands:c.kind==='dunk'?['RightHand']:c.kind==='layup'?[c.side===1?'LeftHand':'RightHand']:[],cadenceTargetStepsPerSecond:c.kind==='sprint'?3.75:null,cadenceWindowSeconds:c.kind==='sprint'?[0,.8]:null}))};
 await fs.writeFile(new URL('runtime/catalog.json',ROOT),JSON.stringify(catalog,null,2)+'\n');
 for(const p of profiles){await fs.mkdir(new URL(`runtime/keyframes/${p.id}/`,ROOT),{recursive:true});for(const c of clips){
  const count=Math.round(c.durationSeconds*30),frames=Array.from({length:count+1},(_,i)=>pose(p,c,i/30));
  // Hemisphere continuity prevents exporter/interpolator taking an avoidable long arc.
  for(let i=1;i<frames.length;i++)for(const name of rig.boneNames)if(dot(frames[i-1].rotations[name],frames[i].rotations[name])<0)frames[i].rotations[name]=mul(frames[i].rotations[name],-1);
  const events=[];for(let i=0;i<frames.length;i++){const f=frames[i];for(const foot of ['LeftFoot','RightFoot'])if(i===0?f.contacts[foot].planted:f.contacts[foot].planted!==frames[i-1].contacts[foot].planted)events.push({type:f.contacts[foot].planted?'foot_plant':'foot_lift',foot,timeSeconds:i/30,anchorWorldMeters:f.contacts[foot].anchorWorldMeters});for(const hand of ['LeftHand','RightHand'])if(i===0?f.handContacts[hand].touching:f.handContacts[hand].touching!==frames[i-1].handContacts[hand].touching)events.push({type:f.handContacts[hand].touching?'hand_ball_contact':'hand_ball_release',hand,timeSeconds:i/30,presentationOnly:true});}
  const gather=c.kind==='layup'||c.kind==='dunk'?.167:c.kind==='stop'?.533:c.kind==='sprint'&&c.ball?.8:c.kind==='shot'?.2:null;
  const release=c.kind==='dunk'?1.2:c.kind==='layup'?1.1:c.kind==='shot'?.9:null;
  if(gather!==null)events.push({type:'ball_gather',timeSeconds:Math.round(gather*30)/30});
  if(release!==null)events.push({type:'ball_release',timeSeconds:release,hand:c.kind==='layup'&&c.side===1?'LeftHand':'RightHand',presentationOnly:true});
  if(c.kind==='behind')events.push({type:'ball_floor_contact',timeSeconds:.6});
  events.sort((a,b)=>a.timeSeconds-b.timeSeconds);
  const data={schemaVersion:1,id:c.id,profileId:p.id,fps:30,durationSeconds:c.durationSeconds,loop:c.loop,license:'CC0-1.0',authorship:'Original target-space basketball phase poses with analytic two-bone IK; no mocap or imported animation samples.',skeleton:{rotationFormat:'quaternion-xyzw',rotationSpace:'parent-local',bones:p.joints.map(j=>({name:j.name,parent:j.parent,restTranslationMeters:j.translation}))},rootMotion:{mode:'external',translationField:'referenceRootTranslationMeters',rotationField:'rootRotationQuaternion',boneRoot:'identity',applyExactlyOnce:true},ball:{radiusMeters:.12,releaseTimeSeconds:release,eventsArePresentationOnly:true},courtTarget:{rimCenterMeters:[0,3.05,2.4],rimInnerRadiusMeters:.2286},activeHands:catalog.clips.find(x=>x.id===c.id).activeHands,events,keyframes:frames};
  await fs.writeFile(new URL(`runtime/keyframes/${p.id}/${c.id}.json`,ROOT),JSON.stringify(data)+'\n');
  console.log(`${p.id}/${c.id}: ${frames.length} keys`);
 }}
 return catalog;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await author();
