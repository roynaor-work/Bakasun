/** Original CC0-1.0 basketball performances. Analytic target-space IK, 30Hz.
 * No imported animation samples. The measured tall bind rig is the only input.
 */
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {add,sub,mul,dot,cross,length,normalize,lerp,clamp,qIdentity as I,qMul,qInverse,qAxisAngle,qRotate,qEuler,qFromBasis,qSlerp,FK,palmMarker,soleMarker} from '../runtime/math.mjs';
const ROOT=new URL('../',import.meta.url);
const rig=JSON.parse(await fs.readFile(new URL('runtime/rig.json',ROOT)));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(t,a,b)=>smooth((t-a)/(b-a));
const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));
const yaw=a=>qAxisAngle([0,1,0],a);
function control(t,keys){if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return lerp(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);}
function limb(profile,frame,a,b,end,target,pole){
 let world=FK(profile,frame,{local:true}).world;
 const origin=world[a].position,parent=profile.joints.find(j=>j.name===a).parent,parentQ=world[parent].rotation;
 const L1=length(profile.joints.find(j=>j.name===b).translation),L2=length(profile.joints.find(j=>j.name===end).translation);
 const delta=sub(target,origin),raw=length(delta),d=clamp(raw,.04,L1+L2-.0001),dir=normalize(delta);
 const armPlane=normalize(sub([-1,0,0],mul(dir,dot([-1,0,0],dir))));
 const u=a.endsWith('Arm')?normalize(cross(dir,armPlane),[0,0,1]):normalize(sub(sub(pole,origin),mul(dir,dot(sub(pole,origin),dir))),[0,0,1]);
 const x=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-x*x));
 const elbow=add(origin,add(mul(dir,x),mul(u,h))),finish=add(origin,mul(dir,d));
 const plane=normalize(cross(u,dir));
 const segment=v=>{const yy=mul(normalize(v),-1),xx=plane,zz=normalize(cross(xx,yy));return qFromBasis(xx,yy,zz);};
 const qa=segment(sub(elbow,origin)),qb=segment(sub(finish,elbow));
 frame.rotations[a]=qMul(qInverse(parentQ),qa);frame.rotations[b]=qMul(qInverse(qa),qb);
 return Math.max(0,raw-d);
}
function palmQ(outward,fingers=[0,1,0]){const z=mul(normalize(outward),-1),y=mul(normalize(sub(fingers,mul(z,dot(fingers,z))),[0,0,1]),-1),x=normalize(cross(y,z));return qFromBasis(x,y,z);}
function hand(profile,frame,name,palm,outward,fingers,contact,orientation=null){
 const q=orientation||palmQ(outward,fingers),wrist=sub(palm,qRotate(q,palmMarker(profile,name))),side=name==='LeftHand'?1:-1;
 const parent=name==='LeftHand'?'LeftForeArm':'RightForeArm',arm=name==='LeftHand'?'LeftArm':'RightArm';
 const shoulder=FK(profile,frame,{local:true}).world[arm].position;
 // Elbows lead down and close to the ribcage; avoid the raised, lateral
 // "chicken wing" solution of an unconstrained two-bone hand target.
 const error=limb(profile,frame,arm,parent,name,wrist,add(shoulder,[side*.45,-.4,.30]));
 const pw=FK(profile,frame,{local:true}).world[parent].rotation;frame.rotations[name]=qMul(qInverse(pw),q);
 frame.handContacts[name]={touching:contact};return error;
}

// All choreography below is original. The v10 canonical18 IK/math is retained
// as infrastructure; no v10 animation samples are reused. Metres, seconds.
const specs=[
 ['dribble_crossover','קרוסאובר','dribble',2.4,{loop:true,transfer:true}],
 ['dribble_between_legs','בין הרגליים','dribble',2.4,{loop:true,transfer:true}],
 ['dribble_behind_back','מאחורי הגב','dribble',2.4,{loop:true,transfer:true}],
 ['dribble_hesitation','השהיה והאצה','dribble',2.4,{}],
 ['dribble_step_back','כדרור ונסיגה','dribble',2.4,{}],
 ['dribble_jab_step','צעד הטעיה וכדרור','dribble',2.4,{}],
 ['dribble_spin','סיבוב עם כדור','dribble',2.4,{}],
 ['dribble_sprint','כדרור בספרינט','dribble',2.4,{}],
 ['dribble_protective','כדרור מוגן','dribble',2.4,{loop:true}],
 ['pass_chest','מסירת חזה','pass',2.4,{}],
 ['pass_bounce','מסירת קרקע','pass',2.4,{}],
 ['pass_overhead','מסירה מעל הראש','pass',2.4,{}],
 ['pass_behind_back','מסירה מאחורי הגב','pass',2.4,{}],
 ['pass_jump','מסירה בקפיצה','pass',2.4,{}],
 ['pass_alley_oop','מסירת אלי־הופ','pass',2.4,{}],
 ['jump_shot','זריקה בקפיצה','shot',3.6,{}],
 ['fadeaway','זריקה בנסיגה','shot',3.6,{}],
 ['floater','פלואטר','shot',3.6,{}],
 ['hook_shot','זריקת וו','shot',3.6,{}],
 ['three_off_dribble','שלוש מכדרור','shot',3.6,{three:true}],
 ['three_catch','שלוש מקבלה','shot',3.6,{three:true}],
 ['shot_under_pressure','זריקה בלחץ הגנה','shot',3.6,{}],
 ['rebound_offensive','ריבאונד התקפה','rebound',2.4,{}],
 ['rebound_defensive','ריבאונד הגנה','rebound',2.4,{}],
 ['shot_block','חסימת זריקה','contact',2.4,{}],
 ['body_block','חסימת גוף ובוקס־אאוט','contact',2.4,{}],
 ['screen','אקרן','contact',2.4,{}],
 ['close_guard','הגנה צמודה','defense',2.4,{loop:true}],
 ['steal','חטיפה','defense',2.4,{}],
 ['lane_intercept','חציית מסלול מסירה','defense',2.4,{}],
];
const categoryHe={dribble:'כדרור',pass:'מסירות',shot:'זריקות',rebound:'ריבאונד',contact:'חסימות ואקרן',defense:'הגנה'};
const clips=specs.map(([id,labelHe,kind,durationSeconds,o])=>({id,labelHe,kind,category:kind,categoryHe:categoryHe[kind],durationSeconds,loop:false,...o}));
const profiles=rig.profiles.map(p=>({...p,model:`runtime/models/${p.id}.glb`}));
const named=side=>side>0?'LeftHand':'RightHand';
const grid=t=>Math.round(t*30)/30;
const TOL=1e-7;
function rootAt(c,t){
 let p=[0,0,0],angle=0;
 const id=c.id;
 if(id==='dribble_crossover')p[0]=.085*Math.sin(t/2.4*Math.PI*4);
 if(id==='dribble_hesitation')p[2]=control(t,[[0,0],[.65,.32],[1.45,.36],[2.4,1.7]]);
 if(id==='dribble_step_back')p[2]=control(t,[[0,0],[.6,.26],[1.2,-.8],[1.8,-1.05],[2.4,-1.05]]);
 if(id==='dribble_jab_step')p[2]=.07*pulse(t,.25,.6,1.1);
 if(id==='dribble_spin'){angle=Math.PI*2*ramp(t,.35,1.95);p=[.15*Math.sin(angle),0,.6*ramp(t,.3,2.1)];}
 if(id==='dribble_sprint')p[2]=4.2*t;
 if(c.kind==='pass')p[2]=.15*ramp(t,.55,1.05);
 if(id==='pass_behind_back')angle=-.35*pulse(t,.45,.9,1.5);
 if(id==='pass_jump')p[2]=.35*ramp(t,.7,1.5);
 if(id==='fadeaway')p[2]=-.6*ramp(t,1.1,1.9);
 if(id==='floater')p[2]=1.25*ramp(t,0,1.6);
 if(id==='hook_shot'){angle=-Math.PI/2*ramp(t,.4,1.1);p[2]=.3*ramp(t,.4,1);}
 if(id==='three_off_dribble')p[2]=-.45*ramp(t,.6,1.1);
 if(id==='shot_under_pressure')p[0]=-.28*ramp(t,.6,1.1);
 if(id==='rebound_offensive')p[2]=.65*ramp(t,.1,1.25);
 if(id==='rebound_defensive'){p[2]=.22*ramp(t,.1,.55);angle=-.7*ramp(t,1.55,2.2);}
 if(id==='shot_block')p[2]=.22*ramp(t,.35,.9);
 if(id==='body_block')angle=Math.PI*pulse(t,.1,.65,1.45);
 if(id==='screen')p[2]=.22*ramp(t,0,.5);
 if(id==='close_guard')p[0]=.07*Math.sin(t/2.4*Math.PI*2);
 if(id==='steal')p[2]=.32*pulse(t,.15,.7,1.7);
 if(id==='lane_intercept'){p[0]=-.95*ramp(t,.3,1.1);p[2]=.22*ramp(t,.3,1.1);}
 return {p,q:yaw(angle)};
}
function jumpAt(c,t){
 let a,b,h;
 if(c.kind==='shot'){a=1.1;b=1.9;h=c.id==='fadeaway'?.40:c.id==='floater'?.34:.37;}
 if(c.id==='pass_jump'){a=.8;b=1.5;h=.38;}
 if(c.kind==='rebound'){a=.65;b=1.5;h=c.id==='rebound_offensive'?.48:.40;}
 if(c.id==='shot_block'){a=.6;b=1.4;h=.48;}
 if(a===undefined||t<a||t>b)return 0;
 const u=(t-a)/(b-a);return h*4*u*(1-u);
}
function hipsAt(c,t){
 let h=c.kind==='dribble'?-.28:c.kind==='defense'?-.30:-.17;
 if(c.id==='dribble_protective')h=-.34;
 if(c.id==='dribble_sprint')h=-.23-.025*Math.cos(t*Math.PI*8);
 if(c.id==='dribble_hesitation')h+=.1*pulse(t,.55,1.1,1.6);
 if(c.kind==='shot')h=-.17-.09*pulse(t,.3,.8,1.1)+.055*pulse(t,1.1,1.5,1.9)-.11*pulse(t,1.9,2.0,2.3);
 if(c.kind==='rebound')h=-.18-.09*pulse(t,.1,.5,.65)-.12*pulse(t,1.5,1.63,1.9);
 if(c.id==='shot_block')h=-.20-.08*pulse(t,.1,.45,.6)-.09*pulse(t,1.4,1.55,1.9);
 return h+jumpAt(c,t);
}
function supportWindows(c,side){
 const d=c.durationSeconds,id=c.id;
 if(id==='dribble_sprint'){
  const ws=[];for(let a=side===1?0:.25;a<d;a+=.5)ws.push([grid(a),Math.min(d,grid(a+.1666666667))]);return ws;
 }
 if(c.kind==='shot'){
  if(id==='floater')return side===1?[[0,.2],[.6,1.1],[1.9,d]]:[[.3,.5],[1.9666666667,d]];
  if(id==='three_off_dribble')return side===1?[[0,.6],[.9333333333,1.1],[1.9,d]]:[[0,.4333333333],[.8333333333,1.1],[1.9666666667,d]];
  return [[0,1.1],[side===1?1.9:1.9666666667,d]];
 }
 if(id==='pass_jump')return [[0,.8],[side===1?1.5:1.5666666667,d]];
 if(c.kind==='rebound')return side===1?[[0,.2],[.5,.65],[1.5,d]]:[[0,.4],[1.5666666667,d]];
 if(id==='shot_block')return [[0,.6],[side===1?1.4:1.4666666667,d]];
 if(id==='dribble_jab_step')return side===1?[[0,d]]:[[0,.2],[.5,.8],[1.2,d]];
 if(id==='dribble_step_back')return side===1?[[0,.5],[1.0666666667,1.4],[1.9666666667,d]]:[[0,.7],[1.4,d]];
 if(id==='dribble_hesitation')return side===1?[[0,.4],[.8666666667,1.5],[1.9,d]]:[[0,.9],[1.5,1.7],[2.2666666667,d]];
 if(id==='dribble_spin')return side===1?[[0,.3],[.6,.9],[1.2,1.5],[1.9666666667,d]]:[[0,.5],[.9,1.2],[1.5,1.8],[2.1666666667,d]];
 if(id==='lane_intercept')return side===-1?[[0,.3],[.9,1.3],[1.8,d]]:[[0,.55],[1.3,d]];
 if(id==='body_block')return side===1?[[0,.1],[.5,.9],[1.3,1.5],[1.9,d]]:[[0,.3],[.9,1.1],[1.5,1.7],[2.1,d]];
 if(id==='screen')return side===1?[[0,.2],[.5,d]]:[[0,.3333333333],[.6333333333,d]];
 if(id==='steal')return side===1?[[0,d]]:[[0,.2],[.6,1],[1.5,d]];
 return [[0,d]];
}
function anchorAt(c,side,a,b){
 let time=a===0?0:Math.min(c.durationSeconds,a+.08),width=.24,z=0;
 if(c.kind==='dribble'||c.kind==='defense'||['screen','body_block'].includes(c.id))width=.30;
 if(c.id==='dribble_between_legs')z=side*.29;
 if(c.kind==='pass')z=side*.15;
 if(c.id==='dribble_sprint'){time=Math.min(c.durationSeconds,a+.07);z=.02;}
 if(c.id==='dribble_jab_step'&&side===-1&&a>.3&&a<.9)z=.42;
 if(c.id==='steal'&&side===-1&&a>.4&&a<1.1)z=.42;
 if(c.id==='dribble_spin'){time=a;z=side*.08;}
 if(c.kind==='shot'&&a>1.8)time=1.9;
 if(c.kind==='rebound'&&a>1.4)time=1.5;
 const r=rootAt(c,time);
 return {a:grid(a),b:grid(b),p:add(r.p,qRotate(r.q,[side*width,0,z])),q:r.q};
}
function footAt(c,side,t){
 const ws=supportWindows(c,side).map(([a,b])=>anchorAt(c,side,a,b));
 const active=ws.find(w=>t>=w.a-TOL&&t<=w.b+TOL);
 if(active)return {p:active.p,q:active.q,planted:true,anchor:active.p};
 let before=[...ws].reverse().find(w=>w.b<t),after=ws.find(w=>w.a>t);
 if(!before){const w=anchorAt(c,side,0,0);before={...w,b:-.2};}
 if(!after){const w=anchorAt(c,side,c.durationSeconds,c.durationSeconds);after={...w,a:c.durationSeconds+.1};}
 const u=clamp((t-before.b)/(after.a-before.b));
 const p=lerp(before.p,after.p,smooth(u));
 p[1]=jumpAt(c,t)+(.10+(c.id==='dribble_sprint'?.05:0))*Math.sin(Math.PI*u);
 return {p,q:qSlerp(before.q,after.q,smooth(u)),planted:false,anchor:null};
}
function ballLocalToWorld(c,t,p){const r=rootAt(c,t);return add(r.p,qRotate(r.q,p));}
function worldToLocal(c,t,p){const r=rootAt(c,t);return qRotate(qInverse(r.q),sub(p,r.p));}
function projectile(a,b,start,end,t){
 const dt=clamp(t-start,0,end-start),dur=end-start;
 const v=mul(sub(b,a),1/dur);v[1]+=4.905*dur;
 return add(a,[v[0]*dt,v[1]*dt-4.905*dt*dt,v[2]*dt]);
}
function bounceSchedule(c){
 const periods=c.id==='dribble_sprint'?[.4,.4,.4,.4,.4,.4]:c.id==='dribble_hesitation'?[.8,.8,.4,.4]:c.id==='three_off_dribble'?[.6]:[.6,.6,.6,.6];
 let start=0;
 return periods.map((period,index)=>{
  const n=Math.round(period*30),side=c.transfer?(index%2===0?-1:1):-1,next=c.transfer?-side:side;
  const out={index,start,end:grid(start+period),release:grid(start+Math.round(n/6)/30),floor:grid(start+Math.round(n*.4333333333)/30),receive:grid(start+Math.round(n*.9)/30),side,next};start=out.end;return out;
 });
}
function dribblePoint(p,c,b,phase){
 const s=p.heightMeters/1.88,side=phase==='start'||phase==='release'?b.side:b.next;
 const behind=c.id==='dribble_behind_back',protect=c.id==='dribble_protective';
 const topY=(protect?.72:c.id==='dribble_sprint'?1.02:.9)*s;
 let z=behind?(phase==='release'||phase==='receive'?-.24:.10):.32;
 if(c.id==='dribble_between_legs')z=phase==='release'?-.06:.15;
 let x=side*(protect?.54:.43)*s;
 if(phase==='floor')return [c.transfer?0:x,.12,behind?-.37:c.id==='dribble_between_legs'?0:c.id==='dribble_sprint'?.60:.34];
 return [x,phase==='release'?topY-.18:topY,z];
}
function dribbleAt(p,c,t){
 const schedule=bounceSchedule(c),b=schedule.find(b=>t<b.end-TOL)||schedule.at(-1);
 const start=dribblePoint(p,c,b,'start'),release=dribblePoint(p,c,b,'release'),floor=dribblePoint(p,c,b,'floor'),receive=dribblePoint(p,c,b,'receive'),finish=dribblePoint(p,c,b,'end');
 let ball,touching=null;
 if(t<=b.release+TOL){ball=lerp(start,release,smooth((t-b.start)/(b.release-b.start)));touching=named(b.side);}
 else if(t<b.receive-TOL){
  const a=ballLocalToWorld(c,b.release,release),mid=ballLocalToWorld(c,b.floor,floor),z=ballLocalToWorld(c,b.receive,receive);
  ball=worldToLocal(c,t,t<=b.floor?projectile(a,mid,b.release,b.floor,t):projectile(mid,z,b.floor,b.receive,t));
 }else{ball=lerp(receive,finish,smooth((t-b.receive)/(b.end-b.receive)));touching=named(b.next);}
 return {ball,touching,bounce:b};
}
function passInfo(p,c){
 const s=p.heightMeters/1.88,release=c.id==='pass_jump'?1.1:1,catchTime=.3,targetTime=c.id==='pass_alley_oop'?1.9:1.8;
 const target=c.id==='pass_behind_back'?[2,1.12*s,-2.4]:c.id==='pass_alley_oop'?[0,3.28,2.4]:[0,1.15*s,3.7];
 return {release,catchTime,targetTime,target};
}
function passHeld(p,c,t){
 const s=p.heightMeters/1.88,h=hipsAt(c,t),chest=p.shoulderHeightMeters+h-.29;
 const initial=[0,chest,.40];
 if(c.id==='pass_overhead'||c.id==='pass_alley_oop')return control(t,[[.3,initial],[.65,[0,p.shoulderHeightMeters+h+.30,.18]],[1,[0,p.shoulderHeightMeters+h+.48,.48]]]);
 if(c.id==='pass_behind_back')return control(t,[[.3,initial],[.6,[-.40,1.03*s,-.05]],[1,[-.47,1.03*s,-.32]]]);
 if(c.id==='pass_jump')return control(t,[[.3,initial],[.7,[0,chest-.10,.3]],[1.1,[0,chest+.16,.60]]]);
 return control(t,[[.3,initial],[.65,[0,chest-.08,.25]],[1,[0,chest+(c.id==='pass_bounce'?-.12:.02),.60]]]);
}
/** Profile-sized shooting extension. Derive the ball from an almost straight
 * shooting wrist, its measured palm marker and the actual torso transforms.
 * This avoids forcing long-armed profiles to release with a folded elbow. */
function shotReleasePose(p,c,t){
 const lean=c.id==='fadeaway'?-.18*pulse(t,.8,1.45,2):.08,twist=c.id==='hook_shot'?.25*pulse(t,.7,1.4,2):0;
 const body={rotations:{Spine:qEuler(lean*.6,twist*.4),Chest:qEuler(lean*.4,twist*.6)},hipsOffsetMeters:[0,hipsAt(c,t),0]};
 const shoulder=FK(p,body,{local:true}).world.RightArm.position;
 const armLength=length(p.joints.find(j=>j.name==='RightForeArm').translation)+length(p.joints.find(j=>j.name==='RightHand').translation);
 const direction=normalize(c.id==='floater'?[.08,.88,.47]:c.id==='hook_shot'?[-.25,.965,.08]:c.id==='fadeaway'?[.10,.98,.15]:[.12,.96,.25]);
 const out=c.id==='floater'?[0,-1,0]:normalize([0,-.76,-.65]),q=palmQ(out,[0,0,1]),wrist=add(shoulder,mul(direction,armLength*.98));
 const ball=sub(add(wrist,qRotate(q,palmMarker(p,'RightHand'))),mul(out,.12));
 return {ball,wrist,shoulder,direction,armLength,out,q};
}
function shotHeld(p,c,t){
 const h=hipsAt(c,t),chest=p.shoulderHeightMeters+h-.28,r=shotReleasePose(p,c,t).ball;
 return control(t,[[.3,[0,chest,.40]],[.75,[0,chest-.13,.34]],[1.1,[-.085,p.shoulderHeightMeters+h+.16,.39]],[1.4,r]]);
}
function court(c){return {rimCenterMeters:[0,3.05,c.three?7.3:c.id==='dribble_sprint'?12:c.kind==='shot'&&c.id!=='hook_shot'?4.2:2.4],rimInnerRadiusMeters:.2286};}
function pose(p,c,t){
 const root=rootAt(c,t),s=p.heightMeters/1.88,h=hipsAt(c,t),id=c.id;
 let lean=c.kind==='dribble'?.18:c.kind==='defense'?.2:.08,twist=0,roll=0;
 if(id==='dribble_sprint')lean=.28;
 if(id==='dribble_crossover'||id==='dribble_between_legs'){twist=.17*Math.sin(t/2.4*Math.PI*4);roll=.055*Math.sin(t/2.4*Math.PI*4);}
 if(id==='dribble_behind_back')twist=.22*Math.sin(t/2.4*Math.PI*4);
 if(id==='dribble_protective')twist=-.38;
 if(id==='fadeaway')lean=-.18*pulse(t,.8,1.45,2.0);
 if(id==='hook_shot')twist=.25*pulse(t,.7,1.4,2);
 if(id==='body_block')lean=-.10*pulse(t,.25,.7,1.2);
 const frame={time:t/c.durationSeconds,rotations:Object.fromEntries(p.joints.map(j=>[j.name,[...I]])),hipsOffsetMeters:[0,h,0],referenceRootTranslationMeters:root.p,rootRotationQuaternion:root.q,ballPositionMeters:[0,-2,0],ballPhase:'empty',contacts:{},handContacts:{}};
 frame.rotations.Spine=qEuler(lean*.6,twist*.4,roll*.5);frame.rotations.Chest=qEuler(lean*.4,twist*.6,roll*.5);frame.rotations.Neck=qEuler(-lean*.5,-twist*.3);
 let reachError=0;const reachDetails={};
 for(const side of [1,-1]){
  const foot=side===1?'LeftFoot':'RightFoot',upper=side===1?'LeftUpLeg':'RightUpLeg',lower=side===1?'LeftLeg':'RightLeg',f=footAt(c,side,t),fq=qMul(qInverse(root.q),f.q),target=sub(worldToLocal(c,t,f.p),qRotate(fq,soleMarker(p,foot)));
  const hip=FK(p,frame,{local:true}).world[upper].position;
  reachDetails[foot]=limb(p,frame,upper,lower,foot,target,add(hip,[side*.055,0,1]));reachError=Math.max(reachError,reachDetails[foot]);
  const parent=FK(p,frame,{local:true}).world[lower].rotation;frame.rotations[foot]=qMul(qInverse(parent),fq);
  frame.contacts[foot]={planted:f.planted,anchorWorldMeters:f.anchor};
 }
 const targets={},chest=p.shoulderHeightMeters+h-.29;
 const free=(name,point,out=[0,0,1],fingers=[0,-1,0])=>targets[name]={point,out,fingers,touch:false};
 const touch=(name,ball,out=[0,1,0],fingers=[0,0,1])=>targets[name]={point:add(ball,mul(normalize(out),.12)),out:normalize(out),fingers,touch:true};
 const touchBlend=(name,ball,aOut,aFingers,bOut,bFingers,u)=>{const q=qSlerp(palmQ(aOut,aFingers),palmQ(bOut,bFingers),u),out=mul(qRotate(q,[0,0,1]),-1);targets[name]={point:add(ball,mul(out,.12)),out,fingers:bFingers,touch:true,q};};
 const freeBlend=(name,point,aOut,aFingers,bOut,bFingers,u)=>{const q=qSlerp(palmQ(aOut,aFingers),palmQ(bOut,bFingers),u);targets[name]={point,out:bOut,fingers:bFingers,touch:false,q};};
 const hold=(ball,phase='held')=>{frame.ballPositionMeters=ball;frame.ballPhase=phase;touch('LeftHand',ball,[1,0,0],[0,.3,1]);touch('RightHand',ball,[-1,0,0],[0,.3,1]);};
 free('LeftHand',[.34*s,chest,.25]);free('RightHand',[-.34*s,chest,.25]);
 if(c.kind==='dribble'||id==='three_off_dribble'&&t<.6-TOL){
  const d=dribbleAt(p,c,t);frame.ballPositionMeters=d.ball;frame.ballPhase=d.touching?'dribble-contact':'dribble-flight';
  const waitingY=(id==='dribble_protective'?.95:1.02)*s;
  free('LeftHand',[.42*s,waitingY,.30],[0,1,0],[0,0,1]);free('RightHand',[-.42*s,waitingY,.30],[0,1,0],[0,0,1]);
  const b=d.bounce,release=dribblePoint(p,c,b,'release'),received=dribblePoint(p,c,b,'receive'),wait=side=>[side*.42*s,waitingY,.30];
  if(t>b.release+TOL){free(named(b.side),lerp(add(release,[0,.12,0]),wait(b.side),ramp(t,b.release,b.floor+.05)),[0,1,0],[0,0,1]);}
  if(b.next!==b.side&&t<b.receive-TOL)free(named(b.next),lerp(wait(b.next),add(received,[0,.12,0]),ramp(t,b.floor-.04,b.receive)),[0,1,0],[0,0,1]);
  if(b.next===b.side&&t>b.floor&&t<b.receive-TOL)free(named(b.side),lerp(wait(b.side),add(received,[0,.12,0]),ramp(t,b.floor,b.receive)),[0,1,0],[0,0,1]);
  if(d.touching)touch(d.touching,d.ball,[0,1,0],[0,0,1]);
  if(id==='dribble_protective')free('LeftHand',[.55*s,p.shoulderHeightMeters+h-.05,.40],[0,0,1],[0,1,0]);
  if(id==='dribble_sprint'){
   const swing=.18*Math.sin(t*Math.PI*4);free('LeftHand',[.34*s,chest-.05,.45+swing]);
  }
 }
 if(c.kind==='pass'){
  const info=passInfo(p,c),relWorld=ballLocalToWorld(c,info.release,passHeld(p,c,info.release));
  if(t<info.catchTime-TOL){
   const catchWorld=ballLocalToWorld(c,.3,passHeld(p,c,.3));frame.ballPositionMeters=worldToLocal(c,t,lerp([.9,catchWorld[1]+.16,2.1],catchWorld,smooth(t/.3)));frame.ballPhase='incoming';
   for(const side of [1,-1])free(named(side),lerp([side*.34*s,chest,.25],add(passHeld(p,c,.3),[side*.12,0,0]),ramp(t,0,.3)),[side,0,0],[0,.3,1]);
  }else if(t<=info.release+TOL){
   const ball=passHeld(p,c,t);hold(ball);
   if(id==='pass_behind_back'){const angle=.29+(Math.PI-.29)*ramp(t,.4,.85);touch('RightHand',ball,[-1,0,0],[0,Math.sin(angle),Math.cos(angle)]);if(t>.5)free('LeftHand',lerp(add(ball,[.12,0,0]),[.40,chest,.36],ramp(t,.5,.85)),[1,0,0],[0,.3,1]);}
   if(['pass_overhead','pass_alley_oop'].includes(id)){const u=ramp(t,.7,1);touchBlend('RightHand',ball,[-1,0,0],[0,.3,1],[0,-.7,-.714],[0,1,0],u);touchBlend('LeftHand',ball,[1,0,0],[0,.3,1],[1,0,0],[0,1,0],u);}
  }else{
   let world;
   if(id==='pass_bounce'){const mid=[0,.12,2.05],bt=1.3;world=t<=bt?projectile(relWorld,mid,info.release,bt,t):projectile(mid,info.target,bt,info.targetTime,t);}
   else world=projectile(relWorld,info.target,info.release,info.targetTime,t);
   frame.ballPositionMeters=worldToLocal(c,t,world);frame.ballPhase=t>=info.targetTime?'received':'flight';
   const releaseBall=passHeld(p,c,info.release),dy=h-hipsAt(c,info.release),relax=ramp(t,info.release+.1,info.release+.55),turn=ramp(t,info.release,info.release+.3);
   for(const side of [1,-1]){const name=named(side),over=['pass_overhead','pass_alley_oop'].includes(id),out=side===-1&&over?[0,-.7,-.714]:[side,0,0],fingers=over?[0,1,0]:id==='pass_behind_back'&&side===-1?[0,0,-1]:[0,.3,1];
    const start=id==='pass_behind_back'&&side===1?[.40,chest,.36]:add(add(releaseBall,mul(out,.12)),[0,dy-.06*ramp(t,info.release,info.release+.2),-.04*ramp(t,info.release,info.release+.2)]),finish=[side*.34*s,chest,.25];
    const f=over?[0,Math.cos(Math.PI*turn),Math.sin(Math.PI*turn)]:normalize(lerp(fingers,[0,-1,0],turn));
    freeBlend(name,lerp(start,finish,relax),out,fingers,[0,0,1],[0,-1,0],turn);
   }
  }
 }
 if(c.kind==='shot'&&!(id==='three_off_dribble'&&t<.6-TOL)){
  let ball=shotHeld(p,c,Math.min(t,1.4));const release=1.4,catchTime=id==='three_off_dribble'?.6:.3;if(id==='three_off_dribble'&&t>=.6&&t<=.9)ball=lerp(dribbleAt(p,c,.6).ball,ball,ramp(t,.6,.9));
  if(t<catchTime-TOL){const cp=ballLocalToWorld(c,.3,shotHeld(p,c,.3));frame.ballPositionMeters=worldToLocal(c,t,lerp([1.2,cp[1]+.1,2.2],cp,smooth(t/.3)));frame.ballPhase='incoming';for(const side of [1,-1])free(named(side),lerp([side*.34*s,chest,.25],add(shotHeld(p,c,.3),[side*.12,0,0]),ramp(t,0,.3)),[side,0,0],[0,.3,1]);}
  else if(t<=release+TOL){
   hold(ball);
   const u=ramp(t,.9,1.2);touchBlend('RightHand',ball,[-1,0,0],[0,.3,1],id==='floater'?[0,-1,0]:[0,-.76,-.65],[0,0,1],u);if(id==='three_off_dribble'&&t<=.9){touchBlend('RightHand',ball,[0,1,0],[0,0,1],[-1,0,0],[0,.3,1],ramp(t,.6,.9));if(t<.8)freeBlend('LeftHand',lerp([.42*s,1.02*s,.30],add(ball,[.12,0,0]),ramp(t,.6,.8)),[0,1,0],[0,0,1],[1,0,0],[0,.3,1],ramp(t,.6,.8));}
   const leftRelease=id==='hook_shot'?1.0333333333:1.2;
   if(t>=leftRelease-TOL)free('LeftHand',lerp(add(ball,[.12,0,0]),[.43*s,chest+.20,.30],ramp(t,leftRelease,leftRelease+.35)),[1,0,0],[0,.3,1]);
  }else{
   const origin=ballLocalToWorld(c,release,shotHeld(p,c,release)),rim=court(c).rimCenterMeters,flight=c.three?1.2:.9,dt=t-release;
   const v=mul(sub(rim,origin),1/flight);v[1]+=4.905*flight;
   let world;
   if(dt<=flight)world=add(origin,[v[0]*dt,v[1]*dt-4.905*dt*dt,v[2]*dt]);
   else{const post=dt-flight,drag=(1-Math.exp(-30*post))/30;world=[rim[0]+v[0]*drag,Math.max(.12,rim[1]+(v[1]-9.81*flight)*post-4.905*post*post),rim[2]+v[2]*drag];}
   frame.ballPositionMeters=worldToLocal(c,t,world);frame.ballPhase='flight';
   const extended=shotReleasePose(p,c,t),out=extended.out,relax=ramp(t,1.8,2.25),flick=ramp(t,1.4,1.7),q=qSlerp(extended.q,palmQ([0,.25,.97],[0,-1,.2]),flick);
   const wrist=add(extended.shoulder,mul(extended.direction,extended.armLength*(.98-.15*ramp(t,1.4,1.8)))),palm=add(wrist,qRotate(q,palmMarker(p,'RightHand')));
   targets.RightHand={point:lerp(palm,[-.34*s,chest,.25],relax),out,fingers:[0,0,1],touch:false,q};
   const leftRelease=id==='hook_shot'?1.0333333333:1.2,guide=add(shotHeld(p,c,release),[.12,hipsAt(c,t)-hipsAt(c,release),0]);
   free('LeftHand',lerp(guide,[.43*s,chest+.20,.30],ramp(t,leftRelease,leftRelease+.35)),[1,0,0],[0,.3,1]);
  }
 }
 if(c.kind==='rebound'){
  const catchTime=1,high=[.02,p.shoulderHeightMeters+hipsAt(c,1)+.57,.38],catchWorld=ballLocalToWorld(c,1,high);
  if(t<catchTime-TOL){frame.ballPositionMeters=worldToLocal(c,t,projectile([.45,3.35,2.4],catchWorld,0,1,t));frame.ballPhase='incoming';const u=ramp(t,.3,.94);free('LeftHand',lerp([.45,chest,.28],add(high,[.12,0,0]),u),[1,0,0],[0,.3,1]);free('RightHand',lerp([-.45,chest,.28],add(high,[-.12,0,0]),u),[-1,0,0],[0,.3,1]);}
  else{const ball=lerp([.02,p.shoulderHeightMeters+h+.57,.38],[c.id==='rebound_defensive'?-.22:0,chest+.02,.35],ramp(t,1.15,1.85));hold(ball,t<1.2?'catch':'held');}
 }
 if(id==='shot_block'){
  const hit=.9,local=[-.12,p.shoulderHeightMeters+hipsAt(c,hit)+.57,.48],world=ballLocalToWorld(c,hit,local);
  if(t<hit-TOL){frame.ballPositionMeters=worldToLocal(c,t,t<.6333333333?add(world,[.15,-.75,.55]):projectile(add(world,[.15,-.75,.55]),world,.6333333333,hit,t));frame.ballPhase='incoming';}
  else{const dt=t-hit;frame.ballPositionMeters=worldToLocal(c,t,add(world,[-2.1*dt,-.3*dt-4.905*dt*dt,1.9*dt]));frame.ballPositionMeters[1]=Math.max(.12,frame.ballPositionMeters[1]);frame.ballPhase='deflected';}
  const high=lerp([-.43,chest,.28],add(local,[0,0,-.12]),pulse(t,.3,hit,1.5));free('RightHand',high,[0,0,-1],[0,1,0]);free('LeftHand',[.48*s,chest+.1,.25],[0,0,1],[0,1,0]);if(Math.abs(t-hit)<TOL)touch('RightHand',local,[0,0,-1],[0,1,0]);
 }
 if(id==='body_block'){
  free('LeftHand',[.59*s,chest+.05,.06],[1,0,0],[0,.3,1]);free('RightHand',[-.59*s,chest+.05,.06],[-1,0,0],[0,.3,1]);
  const target=[0,p.shoulderHeightMeters+hipsAt(c,1.6)+.20,.42],catchWorld=ballLocalToWorld(c,1.6,target);
  if(t<1.6-TOL){frame.ballPositionMeters=worldToLocal(c,t,projectile([.7,3.3,2.4],catchWorld,0,1.6,t));frame.ballPhase='incoming';for(const side of [1,-1])free(named(side),lerp([side*.59*s,chest+.05,.06],add([0,p.shoulderHeightMeters+h+.20,.42],[side*.12,0,0]),ramp(t,1.2,1.6)),[side,0,0],[0,.3,1]);}
  else hold(lerp([0,p.shoulderHeightMeters+h+.20,.42],[0,chest,.35],ramp(t,1.6,2.1)));
 }
 if(id==='screen'){free('LeftHand',[.09,chest-.22,.33],[0,0,1],[1,-.3,0]);free('RightHand',[-.09,chest-.26,.34],[0,0,1],[-1,-.3,0]);}
 if(id==='close_guard'){free('LeftHand',[.60*s,chest+.30+.07*Math.sin(t/2.4*Math.PI*2),.25],[0,0,1],[0,1,0]);free('RightHand',[-.58*s,chest-.08,.40],[0,0,1],[0,-1,0]);}
 if(id==='steal'){
  const poke=[-.44,.76*s,.63],catchBall=[-.30,chest,.44];free('LeftHand',[.34*s,chest,.25],[1,0,0],[0,.3,1]);
  if(t<.6-TOL){frame.ballPositionMeters=lerp([.15,1.08*s,1.15],poke,smooth(t/.6));frame.ballPhase='incoming';free('RightHand',lerp([-.30,chest,.25],add(poke,[0,.12,0]),ramp(t,.15,.6)),[0,1,0],[0,0,1]);}
  else if(t<=1.2){const ball=lerp(poke,catchBall,ramp(t,.7,1.1));frame.ballPositionMeters=ball;frame.ballPhase='controlled';const u=ramp(t,.9,1.2);touchBlend('RightHand',ball,[0,1,0],[0,0,1],[-1,0,0],[0,.3,1],u);free('LeftHand',lerp([.34*s,chest,.25],add(ball,[.12,0,0]),ramp(t,.6,1)),[1,0,0],[0,.3,1]);if(t>=1-TOL)touch('LeftHand',ball,[1,0,0],[0,.3,1]);}
  else hold(lerp(catchBall,[-.16,chest,.36],ramp(t,1.1,1.7)));
 }
 if(id==='lane_intercept'){
  const target=[0,p.shoulderHeightMeters+hipsAt(c,1)-.24,.48],catchWorld=ballLocalToWorld(c,1,target);
  if(t<1-TOL){frame.ballPositionMeters=worldToLocal(c,t,lerp([-2.4,catchWorld[1]+.1,.6],catchWorld,t));frame.ballPhase='incoming';for(const side of [1,-1])free(named(side),lerp([side*.34*s,chest,.25],add([0,p.shoulderHeightMeters+h-.24,.48],[side*.12,0,0]),ramp(t,.6,1)),[side,0,0],[0,.3,1]);}
  else hold(lerp([0,p.shoulderHeightMeters+h-.24,.48],[-.22,chest,.34],ramp(t,1.1,1.65)));
 }
 for(const name of ['LeftHand','RightHand']){const x=targets[name];reachDetails[name]=hand(p,frame,name,x.point,x.out,x.fingers,x.touch,x.q);reachError=Math.max(reachError,reachDetails[name]);}
 frame.solverReachExcessMeters=reachError;frame.solverReachExcessByEffectorMeters=reachDetails;
 return frame;
}
function eventsFor(c,p,frames){
 const events=[],event=(type,timeSeconds,fields={})=>events.push({type,timeSeconds:grid(timeSeconds),presentationOnly:true,...fields});
 for(let i=0;i<frames.length;i++){
  const f=frames[i],previous=frames[i-1];
  for(const foot of ['LeftFoot','RightFoot'])if(i===0?f.contacts[foot].planted:f.contacts[foot].planted!==previous.contacts[foot].planted)event(f.contacts[foot].planted?'foot_plant':'foot_lift',i/30,{foot,anchorWorldMeters:f.contacts[foot].anchorWorldMeters});
  for(const hand of ['LeftHand','RightHand'])if(i===0?f.handContacts[hand].touching:f.handContacts[hand].touching!==previous.handContacts[hand].touching)event(f.handContacts[hand].touching?'hand_ball_contact':'hand_ball_release',i/30,{hand});
 }
 if(c.kind==='dribble'||c.id==='three_off_dribble')for(const b of bounceSchedule(c)){
  event('ball_release',b.release,{hand:named(b.side),bounceIndex:b.index});event('ball_floor_contact',b.floor,{bounceIndex:b.index});event('ball_return',b.receive,{hand:named(b.next),bounceIndex:b.index});
 }
 if(c.kind==='pass'){const x=passInfo(p,c);event('ball_catch',.3,{source:'external_pass',hands:['LeftHand','RightHand']});event('ball_gather',.3);event('ball_release',x.release,{hand:c.id==='pass_behind_back'?'RightHand':'both'});if(c.id==='pass_bounce')event('ball_floor_contact',1.3,{passBounce:true});event('ball_target_catch',x.targetTime,{positionMeters:x.target,externalActor:true});}
 if(c.kind==='shot'){const ct=c.id==='three_off_dribble'?.6:.3;event('ball_gather',ct);if(c.id!=='three_off_dribble')event('ball_catch',ct,{source:'external_pass',hands:['LeftHand','RightHand']});event('ball_release',1.4,{hand:'RightHand'});event('rim_crossing',1.4+(c.three?1.2:.9));}
 if(c.kind==='rebound'){event('ball_catch',1,{source:c.kind==='rebound'?'rim_rebound':c.id==='steal'?'opponent_dribble':'external_pass',hands:['LeftHand','RightHand']});event('ball_gather',1);}
 if(c.id==='shot_block'){event('opponent_ball_release',.6333333333,{externalActor:true});event('ball_deflect',.9,{hand:'RightHand'});}
 if(c.id==='body_block'){event('body_contact',.7,{externalActor:true});event('ball_catch',1.6,{source:'rim_rebound',hands:['LeftHand','RightHand']});event('ball_gather',1.6);}
 if(c.id==='screen'){event('screen_set',.6333333333);event('body_contact',1.2,{externalActor:true});}
 if(c.id==='close_guard')event('defensive_pressure',1.2);
 if(c.id==='steal'){event('ball_deflect',.6,{hand:'RightHand'});event('ball_catch',1,{source:c.kind==='rebound'?'rim_rebound':c.id==='steal'?'opponent_dribble':'external_pass',hands:['LeftHand','RightHand']});event('ball_gather',1);}
 if(c.id==='lane_intercept'){event('ball_catch',1,{source:c.kind==='rebound'?'rim_rebound':c.id==='steal'?'opponent_dribble':'external_pass',hands:['LeftHand','RightHand']});event('ball_gather',1);}
 return events.sort((a,b)=>a.timeSeconds-b.timeSeconds);
}
function contextFor(c,p){
 const id=c.id;
 if(c.kind==='pass'){const x=passInfo(p,c);return {receiver:{positionMeters:sub(x.target,[0,p.shoulderHeightMeters-.25,-.36]),yawRadians:Math.PI,catchTimeSeconds:x.targetTime}};}
 if(['shot_under_pressure','close_guard','shot_block','body_block','screen','dribble_protective','steal'].includes(id))return {defender:{positionMeters:id==='screen'?[.55,0,.35]:id==='body_block'?[0,0,-.65]:[.10,0,1.12],yawRadians:Math.PI}};
 return {};
}
export async function author(){
 const catalog={schemaVersion:1,version:'hoops-motion-v11',fps:30,license:'CC0-1.0',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},units:'meters',profiles,clips:clips.map(c=>({...c,activeHands:[],cadenceTargetStepsPerSecond:c.id==='dribble_sprint'?4:null,cadenceWindowSeconds:c.id==='dribble_sprint'?[0,2.4]:null}))};
 await fs.writeFile(new URL('runtime/catalog.json',ROOT),JSON.stringify(catalog,null,2)+'\n');
 const summary=[];
 for(const p of profiles){await fs.mkdir(new URL(`runtime/keyframes/${p.id}/`,ROOT),{recursive:true});for(const c of clips){
  const frames=Array.from({length:Math.round(c.durationSeconds*30)+1},(_,i)=>pose(p,c,i/30));
  for(let i=1;i<frames.length;i++)for(const name of rig.boneNames)if(dot(frames[i-1].rotations[name],frames[i].rotations[name])<0)frames[i].rotations[name]=mul(frames[i].rotations[name],-1);
  const x=c.kind==='pass'?passInfo(p,c):null;
  const data={schemaVersion:1,id:c.id,profileId:p.id,fps:30,durationSeconds:c.durationSeconds,loop:c.loop,license:'CC0-1.0',authorship:'Original basketball-specific target-space choreography, analytic canonical18 IK; no imported mocap or animation samples.',skeleton:{rotationFormat:'quaternion-xyzw',rotationSpace:'parent-local',bones:p.joints.map(j=>({name:j.name,parent:j.parent,restTranslationMeters:j.translation}))},rootMotion:{mode:'external',translationField:'referenceRootTranslationMeters',rotationField:'rootRotationQuaternion',boneRoot:'identity',applyExactlyOnce:true},ball:{radiusMeters:.12,releaseTimeSeconds:x?x.release:c.kind==='shot'?1.4:null,eventsArePresentationOnly:true,...(x?{targetCatchPositionMeters:x.target,targetCatchTimeSeconds:x.targetTime}:{})},courtTarget:court(c),context:contextFor(c,p),events:eventsFor(c,p,frames),keyframes:frames};
  await fs.writeFile(new URL(`runtime/keyframes/${p.id}/${c.id}.json`,ROOT),JSON.stringify(data)+'\n');
  summary.push({id:c.id,profile:p.id,reachExcess:Math.max(...frames.map(f=>f.solverReachExcessMeters))});
 }}
 console.log(JSON.stringify({performances:summary.length,worstReachExcess:Math.max(...summary.map(x=>x.reachExcess)),needsAdjustment:summary.filter(x=>x.reachExcess>.002)},null,2));
 return catalog;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await author();
