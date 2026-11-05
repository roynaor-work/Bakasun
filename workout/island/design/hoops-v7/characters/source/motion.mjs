/**
 * Original basketball presentation motion, authored for the canonical 18 joints.
 * Coordinates are metres, +Y up, +Z forward, +X anatomical left.
 * No gameplay, ownership, collision or score is inferred from animation time.
 * The same target-space solver is used for live playback and baked GLB clips.
 */
import * as THREE from '../vendor/three.module.js';

export const BONE_NAMES = Object.freeze(['Root','Hips','Spine','Chest','Neck','Head',
  'LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
  'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);

export const ACTIONS = Object.freeze([
  ['idle_hold','החזקת כדור','Ball hold',2.4,true,'control'],
  ['idle','עמידה ללא כדור','Ready without ball',2.8,true,'locomotion'],
  ['dribble_right','כדרור ימין','Right-hand dribble',.78,true,'dribble'],
  ['dribble_left','כדרור שמאל','Left-hand dribble',.82,true,'dribble'],
  ['dribble_power','כדרור כוח והגנה','Protective power dribble',.90,true,'dribble'],
  ['dribble_crossover','כדרור צולב','Crossover dribble',1.18,true,'dribble'],
  ['dribble_between_legs','כדרור בין הרגליים','Between-the-legs dribble',1.32,true,'dribble'],
  ['shot_set','קליעה מהמקום','Set shot',1.75,false,'shot'],
  ['shot_jump','קליעה בקפיצה','Jump shot',1.75,false,'shot'],
  ['shot_fadeaway','קליעה בנסיגה באוויר','Fadeaway shot',1.90,false,'shot'],
  ['shot_stepback','צעד לאחור וקליעה','Step-back shot',2.10,false,'shot'],
  ['layup','לייאפ','Right-hand layup',1.70,false,'finish'],
  ['dunk_one_hand','דאנק ביד אחת','One-hand dunk',2.05,false,'finish'],
  ['dunk_two_hand','דאנק בשתי ידיים','Two-hand dunk',1.95,false,'finish'],
  ['dunk_reverse','דאנק אחורי','Reverse dunk',2.40,false,'finish'],
  ['euro_step','רב-צעד ואיסוף','Euro-step gather',1.75,false,'control'],
  ['run','ריצה','Run',.72,true,'locomotion'],
  ['decelerate','האטה ובלימה','Deceleration',1.35,false,'locomotion'],
  ['defense_shuffle','הגנה בצעדי צד','Defensive lateral shuffle',1.18,true,'defense'],
  ['steal','חטיפה','Reach-in steal',1.15,false,'defense'],
  ['block','חסימה','Jump block',1.45,false,'defense'],
  ['rebound','ריבאונד ואחיזה','Rebound and secure',1.75,false,'control'],
  ['walk','צעדים ללא כדור','Walk without ball',1.30,true,'locomotion'],
  ['pivot','עבודת רגליים ללא כדור','Pivot footwork',1.85,true,'locomotion'],
  ['celebrate','חגיגה','Restrained victory celebration',2.30,false,'expression'],
  ['fall','נפילה והתאוששות','Side fall and recovery',2.80,false,'expression'],
  ['referee_signal','סימון שופט','Referee signal',2.35,false,'expression'],
].map(([id,label,labelEn,duration,loop,category])=>Object.freeze({id,label,labelEn,duration,loop,category})));
const CATALOG = Object.fromEntries(ACTIONS.map(a=>[a.id,a]));
const TAU = Math.PI*2, V = a=>new THREE.Vector3(...a), Q = ()=>new THREE.Quaternion();
const clamp = (x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const mix = (a,b,t)=>a+(b-a)*t;
const smooth = x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp = (p,a,b)=>smooth((p-a)/(b-a));
const pulse = (p,a,b,c,d)=>ramp(p,a,b)*(1-ramp(p,c,d));
const lerp3 = (a,b,t)=>a.map((x,i)=>mix(x,b[i],t));
const add3 = (a,b)=>a.map((x,i)=>x+b[i]);
const normalized = a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
function mixDirection(a,b,t){const va=V(normalized(a)),vb=V(normalized(b)),dot=clamp(va.dot(vb),-1,1);if(dot>.999)return va.lerp(vb,t).normalize().toArray();if(dot<-.999){const axis=Math.abs(va.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);axis.addScaledVector(va,-axis.dot(va)).normalize();return va.multiplyScalar(Math.cos(Math.PI*t)).addScaledVector(axis,Math.sin(Math.PI*t)).toArray();}const angle=Math.acos(dot),sin=Math.sin(angle);return va.multiplyScalar(Math.sin((1-t)*angle)/sin).addScaledVector(vb,Math.sin(t*angle)/sin).toArray();}
const copy = x=>Array.isArray(x)?x.map(copy):(x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,copy(v)])):x);
function blend(a,b,t){
  if(typeof a==='number')return mix(a,b,t);
  if(Array.isArray(a))return a.map((v,i)=>blend(v,b[i],t));
  if(a&&typeof a==='object')return Object.fromEntries(Object.keys(a).map(k=>[k,blend(a[k],b[k],t)]));
  return t<.5?a:b;
}
function arc(p,a,b,height){const t=clamp((p-a)/(b-a));return Math.sin(Math.PI*t)*height;}
const airSupport=(p,a,b)=>1-pulse(p,a-.03,a+.05,b-.05,b+.03);
function freeBallY(y,velocity,seconds,radius){const g=9.81,impact=(velocity+Math.sqrt(velocity*velocity+2*g*Math.max(0,y-radius)))/g;if(seconds<=impact)return y+velocity*seconds-.5*g*seconds*seconds;const t=seconds-impact,rebound=(g*impact-velocity)*.58;return Math.max(radius,radius+rebound*t-.5*g*t*t);}
function controlledBounce(top,radius,phase,period){
  const g=9.81,H=top-radius,T=period/2,push=Math.max(.08*period,T-Math.sqrt(2*H/g)),flight=T-push;
  // The hand supplies the extra downward acceleration during a short push;
  // the released ball then follows gravity. A slower protective dribble has
  // a brief top dwell instead of negative hand acceleration.
  const acceleration=Math.max(0,(H-.5*g*flight*flight)/(push*(T-.5*push))),t=Math.min(phase,1-phase)*period;
  const distance=t<=push?.5*acceleration*t*t:.5*acceleration*push*push+acceleration*push*(t-push)+.5*g*(t-push)*(t-push);
  return {y:Math.max(radius,top-distance),pushNormalized:push/period,handAccelerationMetersPerSecondSquared:acceleration};
}

function blankPose(m){
  const {h,ankleY,footX,hipsY}=m;
  return {
    hips:[0,0,0],hipsRotation:[0,0,0],spine:[0,0,0],chest:[0,0,0],neck:[0,0,0],head:[0,0,0],
    leftFoot:[footX,ankleY,0],rightFoot:[-footX,ankleY,0],
    leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftFootRoll:0,rightFootRoll:0,leftSupport:1,rightSupport:1,
    leftKneePole:[footX+.04,hipsY*.5,.75],rightKneePole:[-footX-.04,hipsY*.5,.75],
    left:{wrist:[.14*h,.55*h,.025],normal:[0,0,1],fingers:[0,-1,0],rotation:[0,0,0,0],contact:0,grip:.10,freeGrip:.12,reach:.94,bend:[.015,-1,0],offset:[1,0,0]},
    right:{wrist:[-.14*h,.55*h,.025],normal:[0,0,1],fingers:[0,-1,0],rotation:[0,0,0,0],contact:0,grip:.10,freeGrip:.12,reach:.94,bend:[-.015,-1,0],offset:[-1,0,0]},
    ball:[0,.60*h,.34],ballVisible:0,ballRotation:[0,0,0],hipsY,
  };
}
function hold(p,m,ball=[0,.65*m.h,.30]){
  p.ball=ball;p.ballVisible=1;
  for(const [key,sign] of [['left',1],['right',-1]]){
    p[key].contact=1;p[key].grip=.85;p[key].offset=normalized([sign,.04,.14]);
    p[key].normal=[-sign,0,0];
    p[key].fingers=normalized([-.15*sign,-.12,1]);
  }
  return p;
}
function softReady(p,m){
  p.hips[1]=-.035*m.h;p.spine[0]=.04;
  p.left.wrist=[.15*m.h,.55*m.h,.11];p.right.wrist=[-.15*m.h,.55*m.h,.11];
}
function dribblePose(id,phase,m){
  const p=blankPose(m),{h}=m;
  const transfer=id==='dribble_crossover'||id==='dribble_between_legs';
  const two=phase*2,half=Math.floor(two),u=transfer?two-half:phase;
  const side=id==='dribble_left'?1:(transfer?(half%2===0?-1:1):-1);
  const bodySide=transfer?-Math.cos(phase*TAU):side;
  const power=id==='dribble_power',between=id==='dribble_between_legs';
  const top=h*(power?.43:between?.42:.51),r=m.ballRadius;
  const bounce=controlledBounce(top,r,u,CATALOG[id].duration/(transfer?2:1)),y=bounce.y;
  const s=transfer?-side*Math.cos(Math.PI*u):0;
  const x=transfer?-s*h*.185:side*h*(power?.245:.195);
  const z=between?mix(.35,-.14,ramp(u,.14,.84)):(power?.18:.35);
  p.ball=[x,y,z];p.ballVisible=1;p.ballRotation=[-phase*TAU*2,0,.16*Math.sin(phase*TAU)];
  p.hips=[(transfer?Math.sin(phase*TAU)*.035:side*.015)*h,-h*(between?.18:power?.16:.14)-.008*Math.sin(phase*TAU*2),0];
  p.spine=[between?.20:power?.16:.12,0,bodySide*.012];p.chest=[0,bodySide*(power?.20:.07),0];p.head=[-.05,-bodySide*.055,0];
  p.leftFoot=[m.footX+(between?.08:.025),m.ankleY,between?-.10:-.045];
  p.rightFoot=[-m.footX-(between?.08:.025),m.ankleY,between?.12:.065];
  if(transfer&&half%2===1&&between)p.ball[2]=mix(-.14,.35,ramp(u,.14,.84));
  for(const [key,sgn] of [['left',1],['right',-1]]){
    const outgoing=sgn===side,incoming=transfer?sgn===-side:outgoing;
    const release=bounce.pushNormalized,a=outgoing?1-ramp(u,release,release+.05):0,b=incoming?ramp(u,1-release-.05,1-release):0;
    p[key].contact=Math.max(a,b);p[key].offset=[0,1,0];
    p[key].grip=.30;
    const active=transfer?(1+sgn*bodySide)/2:(outgoing?1:0);
    p[key].normal=normalized([0,-active,1-active]);p[key].fingers=normalized([0,1-active,active]);
    const followingY=Math.max(y+.132,h*(between?.43:.47));
    p[key].wrist=[sgn*h*.19,mix(.62*h,followingY,active),mix(.26,.29,active)];
    if(between)p[key].wrist[2]=sgn===1?-.20:.29;
    if(power&&!outgoing)p[key].wrist=[sgn*.27*h,.61*h,.34];
    if(power&&outgoing){p[key].wrist[0]=side*h*.245;p[key].wrist[2]=.12;}
  }
  return p;
}
function shotPose(id,t,m){
  const p=hold(blankPose(m),m),{h}=m;
  const set=id==='shot_set',fade=id==='shot_fadeaway',step=id==='shot_stepback';
  const load=pulse(t,.0,.16,.24,.43),rise=ramp(t,.12,.49),recover=ramp(t,.72,1);
  const jump=set?0:arc(t,.24,.82,fade?.28:.23);
  p.hips[1]=-h*.075*load+jump;
  p.hips[2]=(fade?-.30*ramp(t,.25,.75):step?-.36*pulse(t,.05,.3,.84,1):0);
  p.spine=[fade?-.10*rise:.035*load,0,0];p.chest=[0,-.10,0];p.head=[-.10,0,0];
  const release=.49,follow=pulse(t,.45,.53,.76,.95);
  const releaseHeight=m.shoulderY+m.armReach+(set?.060:fade?.070:.085),releaseX=m.rightShoulderX*.85;
  const gather=[-.055,h*.69,.30],releaseBall=[releaseX,releaseHeight+jump,.23];
  p.ball=lerp3(gather,releaseBall,rise);
  p.ball[2]+=.18*Math.sin(Math.PI*rise);
  if(t>release){
    const s=(t-release)*CATALOG[id].duration;
    const releaseJump=set?0:arc(release,.24,.82,fade?.28:.23);
    p.ball=[releaseX,freeBallY(releaseHeight+releaseJump,3.8,s,m.ballRadius),.23+4.0*s];
  }
  p.ballRotation=[-t*TAU*1.7,0,0];
  p.right.offset=normalized([-.08,-1,-.12]);p.right.fingers=[0,.18,1];
  p.left.offset=normalized([.95,-.55,-.10]);p.left.fingers=[-.2,.1,1];
  p.right.contact=t<=release?1:0;p.left.contact=1-ramp(t,.35,.48);
  const flick=ramp(t,.49,.57),releaseJump=set?0:arc(release,.24,.82,fade?.28:.23);
  p.right.reach=mix(.97,.94,flick);
  p.right.freeGrip=mix(.85,.12,flick);
  const wristDelta=m.rightShotWristDelta||[0,-.12,-.06];
  p.right.wrist=add3([releaseX,releaseHeight+releaseJump,.23],wristDelta);p.right.wrist[1]+=.045*flick;p.right.wrist[2]+=.10*flick;
  p.left.wrist=[.18*h,.88*h+jump,.27];
  p.right.normal=normalized(lerp3(p.right.offset.map(v=>-v),[0,1,1.15],flick));p.right.fingers=mixDirection([0,0,1],[0,-1.15,1],flick);
  p.left.normal=[-1,0,0];p.left.fingers=[0,.4,1];
  if(recover>0){p.right.wrist=lerp3(p.right.wrist,[-.16*h,.70*h,.20],recover);p.left.wrist=lerp3(p.left.wrist,[.16*h,.62*h,.18],recover);}
  p.leftFoot=[m.footX,m.ankleY+jump,step?-.21*ramp(t,.08,.28):.035];
  p.rightFoot=[-m.footX,m.ankleY+jump,step?-.28*ramp(t,.13,.34):.10];
  p.leftSupport=set?1:airSupport(t,.24,.82);p.rightSupport=p.leftSupport;
  p.leftFootRotation[0]=p.rightFootRotation[0]=-.10*Math.sin(Math.PI*rise)*(1-recover);
  p.ballVisible=t<.96?1:0;
  const releaseHipZ=fade?-.30*ramp(release,.25,.75):step?-.36*pulse(release,.05,.3,.84,1):0;
  p.ball[0]+=p.hips[0];p.ball[2]+=t>release?releaseHipZ:p.hips[2];for(const key of ['left','right']){p[key].wrist[0]+=p.hips[0];p[key].wrist[2]+=p.hips[2];}
  return p;
}
function layupPose(t,m){
  const p=hold(blankPose(m),m),{h}=m;
  const takeoff=.34,land=.84,jump=arc(t,takeoff,land,.40),lift=ramp(t,.20,.57);
  p.hips=[.025,-.07*pulse(t,.0,.12,.25,.40)+jump,.27*pulse(t,.05,.33,.83,1)];
  p.spine=[.07,0,-.035];p.chest=[0,-.15,0];p.head=[-.16,0,0];
  p.ball=lerp3([-.04,.69*h,.30],[-.075,1.0*h+jump,.35],lift);
  if(t>.58){const s=(t-.58)*CATALOG.layup.duration;p.ball=[-.075,freeBallY(1.0*h+arc(.58,takeoff,land,.40),2.5,s,m.ballRadius),.35+2.8*s];}
  const follow=ramp(t,.58,.74);p.right.offset=[0,-1,0];p.right.fingers=mixDirection([0,0,1],[0,.65,1],follow);p.right.contact=t<=.58?1:0;
  p.right.reach=mix(.97,.94,follow);
  p.right.freeGrip=mix(.85,.12,follow);
  p.left.contact=1-ramp(t,.31,.43);p.left.wrist=[.25*h,.66*h+jump,.45];
  p.right.wrist=add3([-.075,h+arc(.58,takeoff,land,.40),.35],m.rightLayupWristDelta||[0,-.12,-.06]);p.right.wrist[1]+=.06*follow;p.right.wrist[2]+=.10*follow;p.right.normal=normalized([0,1,-.65*follow]);
  const knee=arc(t,.28,.75,.29);
  p.leftFoot=[m.footX,m.ankleY+jump,-.09];p.rightFoot=[-m.footX,m.ankleY+jump+knee,.23];
  p.leftFootRotation[0]=-.15;p.rightFootRotation[0]=-.35*knee;
  p.leftSupport=airSupport(t,takeoff,land);p.rightSupport=airSupport(t,.23,land);
  p.ballVisible=t<.97?1:0;p.ball[0]+=p.hips[0];p.ball[2]+=t>.58?.27:p.hips[2];for(const key of ['left','right']){p[key].wrist[0]+=p.hips[0];p[key].wrist[2]+=p.hips[2];}return p;
}
function dunkPose(id,t,m){
  const p=hold(blankPose(m),m),{h}=m;
  const reverse=id==='dunk_reverse',two=id==='dunk_two_hand'||reverse,takeoff=.29,land=.86;
  const amplitude=Math.max(.45,3.13-(m.shoulderY+m.armReach+.10));
  const jump=arc(t,takeoff,land,amplitude),up=ramp(t,.12,.55),down=ramp(t,.57,.68);
  p.hips=[0,-.11*pulse(t,.02,.16,.25,.36)+jump,.12*pulse(t,.05,.32,.86,1)];
  p.spine=[mix(.12,-.075,up)+.19*down,0,0];p.chest=[0,-.08,0];
  p.head=[-.16*(1-down),reverse?-.12:0,0];
  const raised=[two?0:-.08,Math.min(m.shoulderY+m.armReach+.065+jump,3.17),reverse?-.23:.20];
  p.ball=lerp3([-.03,.69*h,.30],raised,up);
  if(reverse)p.ball[2]+=.22*Math.sin(Math.PI*up);
  p.ball[1]-=.23*down;
  if(t>.64){const s=(t-.64)*CATALOG[id].duration,releaseJump=arc(.64,takeoff,land,amplitude),releaseY=Math.min(m.shoulderY+m.armReach+.065+releaseJump,3.17)-.23*ramp(.64,.57,.68);p.ball=[two?0:-.08,freeBallY(releaseY,-2.3,s,m.ballRadius),reverse?-.23:.20];}
  p.right.offset=two?normalized([-.80,-.35,-.2]):[0,-1,0];p.right.fingers=reverse?[0,0,-1]:[0,.1,1];
  p.left.offset=normalized([.80,-.35,-.2]);p.left.fingers=reverse?[0,0,-1]:[0,.1,1];
  p.right.contact=1-ramp(t,.63,.74);p.left.contact=two?1-ramp(t,.63,.74):1-ramp(t,.25,.37);
  p.right.wrist=[-.10*h,raised[1]-.13-.23*down,reverse?-.28:.23];
  p.left.wrist=two?[.10*h,raised[1]-.13-.23*down,reverse?-.28:.23]:[.24*h,h*.66+jump,.45];
  p.right.normal=[0,1,reverse?-1:1];p.right.fingers=[0,-1,reverse?-1:1];
  p.left.normal=[-1,.1,0];p.left.fingers=two?[0,.9,.2]:mixDirection([0,.9,.2],[0,-1,.3],ramp(t,.25,.45));
  if(two){p.left.fingers=p.right.fingers=[0,0,1];p.left.normal=[-1,0,0];p.right.normal=[1,0,0];}
  p.right.grip=two?.85:.35;
  const tuck=arc(t,.33,.78,.26);
  p.leftFoot=[m.footX,m.ankleY+jump+tuck*.3,-.15];p.rightFoot=[-m.footX,m.ankleY+jump+tuck,-.18];
  p.leftFootRotation[0]=-.18;p.rightFootRotation[0]=-.32;
  p.leftSupport=p.rightSupport=airSupport(t,takeoff,land);
  p.ballVisible=t<.95?1:0;
  p.ball[0]+=p.hips[0];p.ball[2]+=t>.64?.12:p.hips[2];for(const key of ['left','right']){p[key].wrist[0]+=p.hips[0];p[key].wrist[2]+=p.hips[2];}
  if(reverse){
    // Reverse means a whole-body turn. A half-turn in Chest alone would twist
    // the spine beyond human range and leave the planted feet facing forward.
    const yaw=Math.PI*ramp(t,.28,.62),turn=Q().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),rotate=a=>V(a).applyQuaternion(turn).toArray();
    p.hipsRotation[1]=yaw;p.hips=rotate(p.hips);p.ball=rotate(p.ball);p.ballRotation[1]+=yaw;
    for(const key of ['left','right']){p[key+'Foot']=rotate(p[key+'Foot']);p[key+'KneePole']=rotate(p[key+'KneePole']);p[key+'FootRotation'][1]+=yaw;for(const field of ['wrist','normal','fingers','offset','bend'])p[key][field]=rotate(p[key][field]);}
  }
  return p;
}
function locomotion(id,t,m){
  const p=blankPose(m),{h}=m,s=Math.sin(t*TAU),c=Math.cos(t*TAU);
  if(id==='idle'){
    softReady(p,m);p.hips[1]+=.004*Math.sin(t*TAU);p.chest[0]=.008*s;p.head[1]=.035*s;return p;
  }
  if(id==='run'||id==='walk'){
    const run=id==='run',span=run?.62:.44,lift=run?.18:.075,stance=run?.40:.62;
    p.hips=[.012*s,-(run?.085:.015)+.014*Math.cos(t*TAU*2),0];p.hipsRotation=[run?.04:.015,s*(run?.055:.03),-.012*s];
    p.spine=[run?.13:.035,0,.01*s];p.chest=[run?.04:0,-s*(run?.14:.065),-.01*s];p.neck=[run?-.02:0,0,0];p.head=[-(run?.10:.02),s*.04,0];
    let flightY=0;if(run){const q=t>=.90?(t-.90)/.10:t>=.40&&t<=.50?(t-.40)/.10:null;if(q!==null)flightY=.045*Math.sin(Math.PI*clamp(q));p.hips[1]+=flightY;}
    for(const [key,sign] of [['left',1],['right',-1]]){
      const wave=Math.cos(t*TAU)*sign,q=(t+(sign===1?0:.5))%1,supported=q<stance,u=supported?q/stance:(q-stance)/(1-stance);
      const swingTangent=-span*(1-stance)/stance;
      const z=supported?mix(span/2,-span/2,u):mix(-span/2,span/2,smooth(u))+(run?swingTangent*u*(1-u)*(1-2*u):0),swing=Math.sin(Math.PI*u),y=supported?0:(run?swing*swing:swing)*lift;
      const pitch=supported?-.15*(1-ramp(u,0,.2))+.28*ramp(u,.7,1):mix(.28,-.15,smooth(u))-.10*Math.sin(Math.PI*u);
      p[key+'Foot']=[sign*m.footX,m.ankleY+y,z];p[key+'FootRotation']=[pitch,sign*.035,0];p[key+'FootRoll']=1;
      p[key+'Support']=supported?1:0;
      p[key].wrist=[sign*h*.13,run?h*(.60+.16*Math.max(0,-wave)):.55*h+Math.max(0,-wave)*.05,-wave*(run?.30:.14)+.09];
      p[key].bend=[sign*.05,-.25,-.60];
      p[key].freeGrip=run?.72:.35;
      p[key].fingers=run?mixDirection([0,-.7,-.3],[0,.7,1.5],(1-wave)/2):[0,-.7,.7];p[key].normal=run?[-sign,0,0]:[-sign,.15,.3];
      p[key+'Foot'][1]+=flightY;p[key].wrist[1]+=flightY;p[key+'KneePole'][1]+=flightY;
    }
    return p;
  }
  if(id==='decelerate'){
    const brake=pulse(t,.02,.30,.63,.98),lead=ramp(t,.02,.24),trail=ramp(t,.48,.78);
    p.hips=[.025*brake,-.025-.085*h*brake,-.12*brake];p.spine=[.13-.31*brake,0,0];p.chest=[0,-.10*brake,0];p.head=[.06*brake,0,0];
    p.leftFoot=[m.footX,m.ankleY+arc(t,.02,.24,.075),.45*lead-.24*ramp(t,.76,1)];
    p.rightFoot=[-m.footX,m.ankleY+arc(t,.48,.78,.075),mix(-.23,.035,trail)];
    p.leftSupport=t>.02&&t<.24?0:1;p.rightSupport=t>.48&&t<.78?0:1;
    p.leftFootRotation=[-.12*(1-lead),0,0];p.leftFootRoll=1;
    p.left.wrist=[.18*h,.66*h,.10+.28*brake];p.right.wrist=[-.17*h,.65*h,.18+.12*brake];p.left.freeGrip=p.right.freeGrip=.55;return p;
  }
  if(id==='pivot'){
    const yaw=.55*Math.sin(t*TAU),toe=.08*h,footYaw=yaw*.65;
    p.hips=[.07+.025*c,-.065*h,.015*s];p.hipsRotation=[0,yaw*.65,0];p.chest=[0,yaw*.40,0];p.head=[0,-yaw*.35,0];
    p.leftFoot=[m.footX-Math.sin(footYaw)*toe,m.ankleY,.025+toe*(1-Math.cos(footYaw))];p.leftFootRotation=[.16,footYaw,0];p.leftFootRoll=1;
    p.rightFoot=[-m.footX-.14*(1-c),m.ankleY+.075*Math.abs(s),.22*s];p.rightSupport=Math.abs(s)<.025?1:0;
    p.rightFootRotation=[-.1*Math.abs(s),yaw,0];p.left.wrist=[.19*h,.64*h,.25];p.right.wrist=[-.19*h,.62*h,.27];p.left.freeGrip=p.right.freeGrip=.35;return p;
  }
  return p;
}
function defensePose(id,t,m){
  const p=blankPose(m),{h}=m;
  p.hips[1]=-.105*h;p.spine[0]=.15;p.head[0]=-.06;
  p.leftFoot=[m.footX+.07,m.ankleY,0];p.rightFoot=[-m.footX-.07,m.ankleY,0];
  p.left.wrist=[.30*h,.63*h,.27];p.right.wrist=[-.30*h,.63*h,.27];
  p.left.fingers=[1,.1,.4];p.right.fingers=[-1,.1,.4];
  if(id==='defense_shuffle'){
    const segment=Math.min(3,Math.floor(t*4)),u=(t*4)%1,q=smooth(u),base=m.footX+.045,near=base-.04,far=base+.16;
    const hipWaypoints=[-.12,.055,.12,-.055,-.12];p.hips[0]=mix(hipWaypoints[segment],hipWaypoints[segment+1],q);p.hips[1]=-.12*h+.012*Math.sin(Math.PI*u);
    const left=segment===0?mix(near,far,q):segment===3?mix(far,near,q):far;
    const right=segment===1?mix(-far,-near,q):segment===2?mix(-near,-far,q):-far;
    p.leftFoot=[left,m.ankleY+(segment===0||segment===3?.065*Math.sin(Math.PI*u):0),.015];
    p.rightFoot=[right,m.ankleY+(segment===1||segment===2?.065*Math.sin(Math.PI*u):0),-.015];
    p.leftSupport=segment===0||segment===3?0:1;p.rightSupport=segment===1||segment===2?0:1;p.chest[1]=-.04*Math.sin(t*TAU);
    p.left.wrist=[.30*h,.68*h,.35];p.right.wrist=[-.30*h,.68*h,.35];p.left.normal=p.right.normal=[0,0,1];p.left.fingers=[.15,1,0];p.right.fingers=[-.15,1,0];p.left.freeGrip=p.right.freeGrip=.18;
  }else if(id==='steal'){
    const reach=pulse(t,.06,.42,.48,.88);
    p.hips[0]=-.07*reach;p.hips[2]=.16*reach;p.hipsRotation[1]=.08*reach;p.chest[1]=.30*reach;p.spine[0]+=.12*reach;p.head[1]=-.15*reach;
    p.right.wrist=lerp3(p.right.wrist,[-.08*h,.51*h,.63],reach);p.right.wrist[0]+=.20*Math.sin(Math.PI*ramp(t,.34,.68))*reach;
    p.right.normal=[0,-1,-.25];p.right.fingers=[.05,-.25,1];p.left.wrist=[.28*h,.69*h,.22];p.left.normal=[0,0,1];p.left.fingers=[.1,1,0];
    p.rightFoot[2]=.25*reach;p.leftFoot[2]=-.12*reach;
  }else if(id==='block'){
    const jump=arc(t,.24,.84,.43),reach=pulse(t,.14,.45,.65,.92);
    p.hips[1]=-.13*(1-reach)+jump;p.spine[0]=.03;
    p.right.wrist=[-.12*h,.66*h+.39*h*reach+jump,.14+.06*reach+.18*Math.sin(Math.PI*reach)];
    p.left.wrist=[.26*h,.65*h+.25*h*reach+jump,.12];
    p.right.fingers=[0,1,.05];p.left.fingers=[.15,1,0];p.right.normal=p.left.normal=[0,0,1];
    p.leftFoot[1]+=jump;p.rightFoot[1]+=jump+.08*Math.sin(Math.PI*ramp(t,.24,.84));
    p.leftSupport=p.rightSupport=airSupport(t,.24,.84);
  }
  return p;
}
function otherPose(id,t,m){
  const p=blankPose(m),{h}=m;
  if(id==='idle_hold'){
    hold(p,m);p.hips[1]=-.025+.003*Math.sin(t*TAU);p.spine[0]=.025;p.head[0]=.04;p.ball[1]+=.003*Math.sin(t*TAU);return p;
  }
  if(id==='euro_step'){
    hold(p,m);const left=pulse(t,.05,.25,.36,.55),right=pulse(t,.31,.53,.68,.90),lead=ramp(t,.04,.26),trail=ramp(t,.30,.54),finish=ramp(t,.70,.98),jump=arc(t,.65,.90,.20);
    p.hips=[.26*left-.26*right+.03*finish,-.08*h+jump+.08*ramp(t,.88,1),.10*ramp(t,.02,.23)+.16*ramp(t,.26,.51)+.12*ramp(t,.55,.72)-.08*ramp(t,.85,1)];
    p.hipsRotation=[0,-.10*left+.10*right,0];p.chest=[0,.25*left-.25*right,0];p.spine[0]=.12;p.head[1]=-.12*left+.12*right;
    p.ball=[p.hips[0]+.11*left-.11*right,.65*h+jump*.75,p.hips[2]+.30];
    p.leftFoot=[mix(m.footX,m.footX+.22,lead)-.16*finish,m.ankleY+arc(t,.04,.26,.09)+jump+.16*pulse(t,.56,.68,.77,.90),mix(0,.20,lead)+.22*finish];
    p.rightFoot=[mix(-m.footX,-m.footX-.20,trail),m.ankleY+arc(t,.30,.54,.10)+jump,mix(-.08,.40,trail)];
    p.leftSupport=t>.04&&t<.26||t>.48&&t<.90?0:1;p.rightSupport=t>.30&&t<.54||t>.65&&t<.90?0:1;
    p.leftFootRotation=[-.18*pulse(t,.56,.68,.77,.90),-.08*left,0];p.rightFootRotation=[0,.08*right,0];
    return p;
  }
  if(id==='rebound'){
    const jump=arc(t,.22,.78,.37),catchTime=.43,gather=ramp(t,.48,.92),reach=ramp(t,.12,.4)*(1-gather),catchHeight=m.shoulderY+m.armReach-.01;
    p.hips[1]=-.10*pulse(t,.02,.13,.21,.34)+jump;p.spine[0]=.02;
    p.ball=[.015,mix(catchHeight+jump,.65*h,gather),mix(.18,.32,gather)];p.ballVisible=1;
    if(t<catchTime){const s=(catchTime-t)*CATALOG.rebound.duration;p.ball[1]=catchHeight+arc(catchTime,.22,.78,.37)+2.7*s;}
    p.left.contact=p.right.contact=ramp(t,.415,.445);p.left.offset=[1,0,0];p.right.offset=[-1,0,0];
    p.left.fingers=p.right.fingers=[0,.3,1];
    p.left.wrist=[.15,mix(.70*h,catchHeight-.025,reach)+jump,.13];p.right.wrist=[-.15,mix(.70*h,catchHeight-.025,reach)+jump,.13];
    p.left.normal=[-1,0,0];p.right.normal=[1,0,0];
    p.leftFoot[1]+=jump;p.rightFoot[1]+=jump;p.leftSupport=p.rightSupport=airSupport(t,.22,.78);
    return p;
  }
  if(id==='celebrate'){
    const raise=pulse(t,.04,.33,.69,.98),bounce=.055*Math.sin(Math.PI*ramp(t,.22,.65));
    p.hips=[-.04*raise,bounce,0];p.chest[1]=-.12*raise+.04*Math.sin(t*TAU);p.head[0]=-.07*raise;
    p.left.wrist=[.18*h,.58*h+.045*h*raise,.24];p.right.wrist=[-.10*h,.55*h+.46*h*raise,.16];
    p.left.normal=[-1,0,0];p.right.normal=[1,0,0];p.left.fingers=[0,0,1];p.right.fingers=[0,1,.05];p.leftFoot[1]+=bounce;p.rightFoot[1]+=bounce;
    p.left.freeGrip=.55;p.right.freeGrip=.90;
    p.leftSupport=p.rightSupport=airSupport(t,.22,.65);return p;
  }
  if(id==='fall'){
    const a=ramp(t,.10,.40);
    p.hips=[-.15*a,-(m.hipsY-.20)*a,.02*a];p.hipsRotation=[.10*a,0,1.28*a];p.spine=[.12*a,0,.10*a];p.chest=[.07*a,0,0];p.head=[-.08*a,0,-.06*a];
    p.leftFoot=lerp3(p.leftFoot,[.33,.12,-.12],a);p.rightFoot=lerp3(p.rightFoot,[.65,.13,.12],a);
    p.left.wrist=lerp3(p.left.wrist,[-.36,.11,.24],a);p.right.wrist=lerp3(p.right.wrist,[-.44,.10,.16],a);
    p.left.normal=p.right.normal=[0,-1,0];p.left.fingers=[0,0,1];p.right.fingers=[0,0,1];
    p.left.bend=p.right.bend=[0,0,1];
    p.leftSupport=p.rightSupport=a>.05?0:1;
    if(t<=.62)return p;
    const kneel=blankPose(m);kneel.hips=[0,.54-m.hipsY,.05];kneel.hipsRotation=[.16,0,.08];kneel.spine=[.34,0,0];kneel.chest=[-.04,0,0];kneel.head=[-.18,0,0];
    kneel.leftFoot=[.12,m.ankleY,-.40];kneel.rightFoot=[-.20,m.ankleY,.34];kneel.leftKneePole=[.12,0,.05];kneel.rightKneePole=[-.20,.22,.60];
    kneel.leftFootRotation=[.45,Math.PI,0];kneel.leftFootRoll=1;kneel.leftSupport=0;kneel.rightSupport=1;
    for(const [key,sign]of [['left',1],['right',-1]]){kneel[key].wrist=[sign*.17,.12,.30];kneel[key].normal=[0,-1,0];kneel[key].fingers=[0,0,1];kneel[key].bend=[0,0,1];kneel[key].freeGrip=.08;}
    if(t<.80)return blend(p,kneel,ramp(t,.62,.80));
    const stand=blankPose(m);stand.hips=[0,-.045,.10];stand.spine=[.06,0,0];stand.chest=[.02,0,0];stand.head=[-.03,0,0];stand.leftFoot=[.13,m.ankleY,-.10];stand.rightFoot=[-.20,m.ankleY,.34];
    for(const [key,sign]of [['left',1],['right',-1]]){stand[key].wrist=[sign*.17*h,.60*h,.20];stand[key].normal=[-sign,0,0];stand[key].fingers=[0,-.2,1];stand[key].bend=[0,0,1];stand[key].freeGrip=.30;}
    const recover=ramp(t,.80,1),out=blend(kneel,stand,recover);out.leftFoot[1]+=.07*Math.sin(Math.PI*recover);out.leftSupport=ramp(t,.91,.99);return out;
  }
  if(id==='referee_signal'){
    const raised=pulse(t,.05,.32,.66,.94);
    p.right.wrist=[-.13*h,.55*h+.45*h*raised,.20];p.right.normal=[0,0,1];p.right.fingers=[0,1,0];
    p.left.wrist=[.15*h,.55*h,.06];p.left.normal=[-1,0,0];p.left.fingers=[0,-1,.1];p.left.freeGrip=.35;p.head[1]=.1*Math.sin(t*Math.PI);return p;
  }
  return p;
}

export function sampleMotion(id,phase,measurements){
  if(!CATALOG[id])throw new Error('Unknown basketball motion: '+id);
  const m=measurements,t=clamp(phase);
  if(id.startsWith('dribble_'))return dribblePose(id,t===1?0:t,m);
  if(id.startsWith('shot_'))return shotPose(id,t,m);
  if(id.startsWith('dunk_'))return dunkPose(id,t,m);
  if(id==='layup')return layupPose(t,m);
  if(['idle','run','walk','decelerate','pivot'].includes(id))return locomotion(id,t===1&&CATALOG[id].loop?0:t,m);
  if(['defense_shuffle','steal','block'].includes(id))return defensePose(id,t===1&&CATALOG[id].loop?0:t,m);
  return otherPose(id,t===1&&CATALOG[id].loop?0:t,m);
}

function quaternionBasis(fingers,normal){
  const f=V(normalized(fingers)),n=V(normalized(normal));
  n.addScaledVector(f,-f.dot(n));if(n.lengthSq()<1e-8){n.set(Math.abs(f.x)<.8?1:0,Math.abs(f.x)<.8?0:1,0).addScaledVector(f,-(Math.abs(f.x)<.8?f.x:f.y));}
  n.normalize();const side=new THREE.Vector3().crossVectors(f,n).normalize();
  return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,f,n));
}
function handFrame(hand,root,profile,side,h){
  const key=side==='left'?'LeftHand':'RightHand';
  const supplied=profile?.palm?.[key]||profile?.palms?.[key]||profile?.palm?.[side]||profile?.palms?.[side];
  const center=V(supplied?.palmPoint||supplied?.center||supplied?.localCenter||[0,-.040*h,.012]),normal=V(supplied?.palmNormal||supplied?.normal||[0,0,1]).normalize();
  // Early authoring metadata selected the dorsal surface. A native relaxed
  // thumb opposes toward the palmar hemisphere; use that sign while older
  // intermediates are open, until the verified palmar chart replaces them.
  const dorsal=supplied?.palmarSurfaceVerified?false:supplied?.thumbDirection?normal.dot(V(supplied.thumbDirection))<0:!!supplied&&normal.y>0;
  if(dorsal){center.addScaledVector(normal,-.018);normal.negate();}
  return {
    center,
    normal,
    fingers:V(supplied?.fingers||supplied?.fingerDirection||[0,-1,0]).normalize(),
    worldBind:hand.getWorldQuaternion(Q()),
  };
}

/**
 * Construct one controller per character. Transform the model in an outer Group.
 * A supplied ball must share the model's parent, or can live elsewhere in scene;
 * the controller converts its centre/quaternion through that parent correctly.
 */
export function createMotionController(root,{ball=null,profile={},id='idle_hold',transitionSeconds=.42}={}){
  root.updateWorldMatrix(true,true);
  const inverseRootWorld=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones=Object.fromEntries(BONE_NAMES.map(name=>[name,root.getObjectByName(name)]));
  const absent=BONE_NAMES.filter(n=>!bones[n]);if(absent.length)throw new Error('Missing canonical basketball joints: '+absent.join(', '));
  const bind=Object.fromEntries(BONE_NAMES.map(n=>[n,{position:bones[n].position.clone(),quaternion:bones[n].quaternion.clone(),scale:bones[n].scale.clone()}]));
  const toModel=o=>root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  const restModel=Object.fromEntries(BONE_NAMES.map(n=>[n,toModel(bones[n])]));
  const suppliedHeight=Number(profile.heightMeters||profile.height);
  const h=suppliedHeight>1?suppliedHeight:Math.max(1.6,restModel.Head.y+.17);
  const m={h,hipsY:restModel.Hips.y,shoulderY:(restModel.LeftArm.y+restModel.RightArm.y)/2,
    rightShoulderX:restModel.RightArm.x,
    ankleY:(restModel.LeftFoot.y+restModel.RightFoot.y)/2,
    footX:(Math.abs(restModel.LeftFoot.x)+Math.abs(restModel.RightFoot.x))/2,
    armReach:restModel.RightArm.distanceTo(restModel.RightForeArm)+restModel.RightForeArm.distanceTo(restModel.RightHand),ballRadius:.12};
  const handFrames={left:handFrame(bones.LeftHand,root,profile,'left',h),right:handFrame(bones.RightHand,root,profile,'right',h)};
  {
    const offset=V(normalized([-.08,-1,-.12])),f=handFrames.right,normal=offset.clone().negate(),finger=new THREE.Vector3(0,0,1).addScaledVector(normal,-normal.z).normalize(),rotation=quaternionBasis(finger.toArray(),normal.toArray()).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    m.rightShotWristDelta=offset.multiplyScalar(m.ballRadius).sub(f.center.clone().applyQuaternion(rotation)).toArray();
    const layupOffset=new THREE.Vector3(0,-1,0),layupRotation=quaternionBasis([0,0,1],[0,1,0]).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    m.rightLayupWristDelta=layupOffset.multiplyScalar(m.ballRadius).sub(f.center.clone().applyQuaternion(layupRotation)).toArray();
  }
  const morphMeshes=[];root.traverse(o=>{if(o.morphTargetDictionary&&o.morphTargetInfluences)morphMeshes.push(o);});
  const skinMeshes=[];root.traverse(o=>{if(o.isSkinnedMesh)skinMeshes.push(o);});
  // A small extremal set is selected from the actual decoded skin, once per
  // controller. Grounding then evaluates shoes rather than assuming an ankle
  // height equals the sole of every role and LOD. Loose official trousers need
  // every surface vertex during a fall: blended knee vertices can become the
  // lowest point even when they were interior to their bind-pose bone bin.
  const probes={leftFoot:[],rightFoot:[],leftHand:[],rightHand:[],body:[]};
  const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push([x,y,z]);
  for(const mesh of skinMeshes){
    mesh.skeleton.update();const position=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,bins={};
    if(!indices||!weights)continue;
    const denseFallGarment=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>material?.name==='official_trousers');
    if(denseFallGarment)for(let index=0;index<position.count;index++)probes.body.push({mesh,index});
    const point=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      let dominant=0,max=-1;for(let k=0;k<4;k++){const w=weights.getComponent(i,k);if(w>max){max=w;dominant=indices.getComponent(i,k);}}
      const name=mesh.skeleton.bones[dominant]?.name;if(!name)continue;
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseRootWorld);
      (bins[name]??=[]).push({index:i,point:point.toArray()});
    }
    for(const [name,vertices]of Object.entries(bins)){
      const selected=new Set();for(const d of directions){let best=-Infinity,index=-1;for(const v of vertices){const score=v.point[0]*d[0]+v.point[1]*d[1]+v.point[2]*d[2];if(score>best){best=score;index=v.index;}}if(index>=0)selected.add(index);}
      const key=name==='LeftFoot'?'leftFoot':name==='RightFoot'?'rightFoot':name==='LeftHand'?'leftHand':name==='RightHand'?'rightHand':'body';
      if(denseFallGarment&&key==='body')continue;
      probes[key].push(...[...selected].map(index=>({mesh,index})));
    }
  }
  const bindRootQ=root.getWorldQuaternion(Q()).invert();
  const restFootQ={left:bindRootQ.clone().multiply(bones.LeftFoot.getWorldQuaternion(Q())),right:bindRootQ.clone().multiply(bones.RightFoot.getWorldQuaternion(Q()))};
  const chainLengths={};for(const [key,names] of [['left',['LeftArm','LeftForeArm','LeftHand']],['right',['RightArm','RightForeArm','RightHand']],['leftLeg',['LeftUpLeg','LeftLeg','LeftFoot']],['rightLeg',['RightUpLeg','RightLeg','RightFoot']]])chainLengths[key]=restModel[names[0]].distanceTo(restModel[names[1]])+restModel[names[1]].distanceTo(restModel[names[2]]);
  const chainBindFrames={};
  for(const [key,names]of [['left',['LeftArm','LeftForeArm','LeftHand']],['right',['RightArm','RightForeArm','RightHand']],['leftLeg',['LeftUpLeg','LeftLeg','LeftFoot']],['rightLeg',['RightUpLeg','RightLeg','RightFoot']]]){
    const first=restModel[names[1]].clone().sub(restModel[names[0]]),second=restModel[names[2]].clone().sub(restModel[names[1]]),normal=new THREE.Vector3().crossVectors(first,second);
    if(normal.lengthSq()<1e-10)normal.set(1,0,0);normal.normalize();
    const rootInverse=root.getWorldQuaternion(Q()).invert();
    chainBindFrames[key]={upperFrame:quaternionBasis(first.toArray(),normal.toArray()).invert(),lowerFrame:quaternionBasis(second.toArray(),normal.toArray()).invert(),upperRotation:rootInverse.clone().multiply(bones[names[0]].getWorldQuaternion(Q())),lowerRotation:rootInverse.clone().multiply(bones[names[1]].getWorldQuaternion(Q()))};
  }
  let action=CATALOG[id]?id:'idle_hold',time=0,frame=0,transition=null,pending=null,displayed=sampleMotion(action,0,m),previousBall=V(displayed.ball),ballVelocity=new THREE.Vector3(),lastDt=0,lastDiagnostics={};
  const maxReach={left:0,right:0,leftLeg:0,rightLeg:0};
  function modelQ(){return root.getWorldQuaternion(Q());}
  function targetWorld(a){return root.localToWorld(V(a));}
  function setWorldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
  function rotation(name,euler){bones[name].quaternion.copy(bind[name].quaternion).multiply(Q().setFromEuler(new THREE.Euler(...euler,'XYZ')));bones[name].updateWorldMatrix(false,true);}
  function aim(bone,child,point){
    const origin=bone.getWorldPosition(new THREE.Vector3()),old=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),next=point.clone().sub(origin).normalize();
    if(next.lengthSq()<.5)return;
    const world=Q().setFromUnitVectors(old,next).multiply(bone.getWorldQuaternion(Q()));setWorldQuaternion(bone,world);
  }
  function chain(upperName,lowerName,endName,target,pole,key){
    const upper=bones[upperName],lower=bones[lowerName],end=bones[endName],a=upper.getWorldPosition(new THREE.Vector3());
    const l1=a.distanceTo(lower.getWorldPosition(new THREE.Vector3())),l2=lower.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()));
    const t=targetWorld(target),axis=t.clone().sub(a),requested=axis.length(),len=clamp(requested,.005,l1+l2-.00005);axis.normalize();
    const poleWorld=targetWorld(pole).sub(a),perp=poleWorld.addScaledVector(axis,-poleWorld.dot(axis));
    if(perp.lengthSq()<1e-8)perp.set(0,0,1).addScaledVector(axis,-axis.z);perp.normalize();
    const along=clamp((l1*l1-l2*l2+len*len)/(2*len),-l1,l1),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const elbow=a.clone().addScaledVector(axis,along).addScaledVector(perp,height),reachable=a.clone().addScaledVector(axis,len);
    // A rest-frame construction preserves limb twist through overhead motion.
    // Minimal fromUnitVectors swings have an antipodal singularity here and
    // can turn an upper arm almost180degrees between adjacent frames.
    const normal=new THREE.Vector3().crossVectors(perp,axis).normalize(),rest=chainBindFrames[key];
    const upperQ=quaternionBasis(elbow.clone().sub(a).toArray(),normal.toArray()).multiply(rest.upperFrame).multiply(rest.upperRotation);
    setWorldQuaternion(upper,upperQ);
    const lowerQ=quaternionBasis(reachable.clone().sub(elbow).toArray(),normal.toArray()).multiply(rest.lowerFrame).multiply(rest.lowerRotation);
    setWorldQuaternion(lower,lowerQ);
    maxReach[key]=Math.max(0,requested-(l1+l2));
  }
  function handTarget(key,p){
    const hand=p[key],f=handFrames[key],sign=key==='left'?1:-1,contact=clamp(hand.contact),offset=V(normalized(hand.offset));
    const desiredNormal=V(hand.normal).lerp(offset.clone().negate(),contact).normalize();
    const tangentFinger=V(hand.fingers).addScaledVector(desiredNormal,-V(hand.fingers).dot(desiredNormal));
    if(tangentFinger.lengthSq()<1e-8)tangentFinger.set(0,0,1).addScaledVector(desiredNormal,-desiredNormal.z);tangentFinger.normalize();
    const hasOverride=Math.hypot(...hand.rotation)>.5;
    const desiredQ=hasOverride?Q().fromArray(hand.rotation).normalize():quaternionBasis(tangentFinger.toArray(),desiredNormal.toArray()).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    if(hasOverride)offset.copy(f.normal).applyQuaternion(desiredQ).negate().normalize();
    const palmOffset=f.center.clone().applyQuaternion(desiredQ);
    const center=V(p.ball).addScaledVector(offset,m.ballRadius),contactWrist=center.sub(palmOffset);
    const wrist=V(hand.wrist).lerp(contactWrist,contact);
    return {wrist:wrist.toArray(),rotation:desiredQ,contact,offset:offset.toArray(),finger:hand.fingers,sign};
  }
  function probeMin(items){let min=Infinity;const point=new THREE.Vector3();for(const item of items){item.mesh.getVertexPosition(item.index,point).applyMatrix4(item.mesh.matrixWorld).applyMatrix4(inverseRootWorld);min=Math.min(min,point.y);}return min;}
  function refreshSkin(){root.updateWorldMatrix(true,true);for(const mesh of skinMeshes)mesh.skeleton.update();}
  function apply(p,groundIteration=0,groundReference=null){
    for(const name of BONE_NAMES){bones[name].position.copy(bind[name].position);bones[name].quaternion.copy(bind[name].quaternion);bones[name].scale.copy(bind[name].scale);}
    root.updateWorldMatrix(true,true);
    inverseRootWorld.copy(root.matrixWorld).invert();
    const setHips=()=>{const hipsTarget=targetWorld(add3(restModel.Hips.toArray(),p.hips));bones.Hips.position.copy(bones.Hips.parent.worldToLocal(hipsTarget));bones.Hips.updateWorldMatrix(false,true);};setHips();
    rotation('Hips',p.hipsRotation);rotation('Spine',p.spine);rotation('Chest',p.chest);rotation('Neck',p.neck);rotation('Head',p.head);
    // Reach adaptation uses the measured limb lengths of each position. Lower
    // the pelvis for a planted long step instead of stretching the shin or
    // allowing a supporting sole to rise. Airborne targets remain free.
    let lower=0;
    for(const [key,name]of [['left','LeftUpLeg'],['right','RightUpLeg']]){
      const hip=toModel(bones[name]),foot=V(p[key+'Foot']),dx=hip.x-foot.x,dz=hip.z-foot.z,L=chainLengths[key+'Leg']*.98;
      const available=Math.sqrt(Math.max(.0001,L*L-dx*dx-dz*dz)),landingPreparation=1-ramp(foot.y-m.ankleY,0,.06),support=Math.max(p[key+'Support'],landingPreparation);
      lower=Math.max(lower,(hip.y-foot.y-available)*support);
    }
    if(lower>0){p.hips[1]-=Math.min(lower,.18*h);setHips();}
    // A few millimetres of measured-proportion adaptation keep a small guard's
    // shooting pocket reachable, while the ball and both palms move together.
    for(let iteration=0;iteration<3;iteration++)for(const [key,name]of [['left','LeftArm'],['right','RightArm']])if(p[key].contact>.9999){
      const a=handTarget(key,p),shoulder=toModel(bones[name]),delta=V(a.wrist).sub(shoulder),distance=delta.length(),max=chainLengths[key]*.97;
      if(distance>max){const strength=smooth((p[key].contact-.5)*2);delta.multiplyScalar((distance-max)/distance*strength);p.ball=V(p.ball).sub(delta).toArray();}
    }
    const left=handTarget('left',p),right=handTarget('right',p);
    p.left.rotation=left.rotation.toArray();p.right.rotation=right.rotation.toArray();
    for(const [key,name]of [['left','LeftUpLeg'],['right','RightUpLeg']])if(p[key+'Support']<.99){
      const hip=toModel(bones[name]),delta=V(p[key+'Foot']).sub(hip),reach=chainLengths[key+'Leg']*.98;
      if(delta.length()>reach)p[key+'Foot']=hip.add(delta.setLength(reach)).toArray();
    }
    chain('LeftUpLeg','LeftLeg','LeftFoot',p.leftFoot,p.leftKneePole,'leftLeg');
    chain('RightUpLeg','RightLeg','RightFoot',p.rightFoot,p.rightKneePole,'rightLeg');
    const mq=modelQ();
    for(const [key,name] of [['left','LeftFoot'],['right','RightFoot']]){
      const angles=[...p[key+'FootRotation']],roll=1-p[key+'Support']*(1-p[key+'FootRoll']);angles[0]*=roll;angles[2]*=roll;
      const delta=Q().setFromEuler(new THREE.Euler(...angles,'XYZ'));
      setWorldQuaternion(bones[name],mq.clone().multiply(delta).multiply(restFootQ[key]));
    }
    for(const [key,a,names] of [['left',left,['LeftArm','LeftForeArm','LeftHand']],['right',right,['RightArm','RightForeArm','RightHand']]]){
      const shoulder=toModel(bones[names[0]]),pole=shoulder.clone().add(V(p[key].bend)).toArray();
      const delta=V(a.wrist).sub(shoulder),reach=chainLengths[key]*mix(p[key].reach,.97,smooth(a.contact));if(delta.length()>reach)a.wrist=shoulder.clone().add(delta.setLength(reach)).toArray();
      chain(...names,a.wrist,pole,key);setWorldQuaternion(bones[names[2]],mq.clone().multiply(a.rotation));
    }
    root.updateWorldMatrix(true,true);
    for(const mesh of morphMeshes){const d=mesh.morphTargetDictionary,v=mesh.morphTargetInfluences,L=mix(p.left.freeGrip,p.left.grip,smooth(p.left.contact)),R=mix(p.right.freeGrip,p.right.grip,smooth(p.right.contact));if(d.grip_left!==undefined)v[d.grip_left]=L;if(d.grip_right!==undefined)v[d.grip_right]=R;if(d.grip!==undefined)v[d.grip]=Math.max(L,R);}
    refreshSkin();
    const soleHeights={};
    const desiredSole=groundReference||{left:.003+Math.max(0,p.leftFoot[1]-m.ankleY),right:.003+Math.max(0,p.rightFoot[1]-m.ankleY)};
    for(let pass=0;pass<2;pass++)for(const [key,name]of [['left','LeftFoot'],['right','RightFoot']]){
      const minimum=probeMin(probes[key+'Foot']);soleHeights[key]=minimum;
      const correction=desiredSole[key]-minimum;
      if(!Number.isFinite(correction)||Math.abs(correction)<.0002)continue;
      p[key+'Foot'][1]+=correction;
      chain(key==='left'?'LeftUpLeg':'RightUpLeg',key==='left'?'LeftLeg':'RightLeg',name,p[key+'Foot'],p[key+'KneePole'],key+'Leg');
      const angles=[...p[key+'FootRotation']],roll=1-p[key+'Support']*(1-p[key+'FootRoll']);angles[0]*=roll;angles[2]*=roll;
      setWorldQuaternion(bones[name],mq.clone().multiply(Q().setFromEuler(new THREE.Euler(...angles,'XYZ'))).multiply(restFootQ[key]));refreshSkin();
    }
    if(action==='fall'&&groundIteration<3){
      for(const key of ['left','right']){const minimum=probeMin(probes[key+'Hand']);if(minimum<.002)p[key].wrist[1]+=.002-minimum;}
      const bodyY=probeMin(probes.body);if(bodyY<.002)p.hips[1]+=.002-bodyY;
      // A fixed number of full constraint projections avoids a pose jump when
      // a surface crosses the contact threshold and changes the pass count.
      // Every pass retains the same authored sole-height baseline.
      apply(p,groundIteration+1,desiredSole);return;
    }
    if(ball){
      ball.visible=p.ballVisible>.05;
      const world=targetWorld(p.ball);ball.position.copy(ball.parent?ball.parent.worldToLocal(world):world);
      const rotation=mq.clone().multiply(Q().setFromEuler(new THREE.Euler(...p.ballRotation,'XYZ')));
      ball.quaternion.copy(ball.parent?ball.parent.getWorldQuaternion(Q()).invert().multiply(rotation):rotation);
      ball.updateWorldMatrix(false,true);
    }
    const contacts=[];let error=0;
    for(const [key,name] of [['left','LeftHand'],['right','RightHand']]){
      if(p[key].contact<.9999)continue;
      const f=handFrames[key],palm=f.center.clone().applyMatrix4(bones[name].matrixWorld),center=targetWorld(p.ball),dist=palm.distanceTo(center),e=Math.abs(dist-m.ballRadius);
      error=Math.max(error,e);contacts.push({effector:name,palm:root.worldToLocal(palm).toArray(),errorMeters:e});
    }
    const feet={};for(const [key,name] of [['left','LeftFoot'],['right','RightFoot']]){
      const actual=toModel(bones[name]);feet[key]={support:p[key+'Support']>.99,target:p[key+'Foot'],position:actual.toArray(),errorMeters:actual.distanceTo(V(p[key+'Foot']))};
    }
    lastDiagnostics={action,time,phase:getPhase(),transition:transition?{from:transition.from,to:action,progress:clamp(transition.elapsed/transition.duration)}:pending?{from:action,to:pending.id,waitingForCatch:true}:null,
      contact:contacts,handContactErrorMeters:error,footErrors:feet,soleProbeHeights:soleHeights,groundProbeCount:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,v.length])),maxReach:{...maxReach},ballPosition:[...p.ball],ballVisible:p.ballVisible>.05,frame,rootMotion:false};
    lastDiagnostics.handTargets={left:left.wrist,right:right.wrist};lastDiagnostics.elbows={left:toModel(bones.LeftForeArm).toArray(),right:toModel(bones.RightForeArm).toArray()};
  }
  function getPhase(){const a=CATALOG[action];return a.loop?(time/a.duration)%1:clamp(time/a.duration);}
  function begin(next,duration){
    const before=copy(displayed),beforeVelocity=ballVelocity.toArray();
    const targetPhaseLocked=next.startsWith('dribble_')&&(action==='idle_hold'||!!transition);
    transition={from:action,source:before,velocity:beforeVelocity,wristFrom:copy(lastDiagnostics.handTargets),targetPhaseLocked,elapsed:0,duration};action=next;time=0;pending=null;
  }
  function render(dt=0){
    const target=sampleMotion(action,getPhase(),m);
    if(transition){
      const u=clamp(transition.elapsed/transition.duration),s=smooth(u),source=transition.source;
      displayed=blend(source,target,s);
      for(const key of ['left','right'])displayed[key].rotation=handTarget(key,source).rotation.slerp(handTarget(key,target).rotation,s).normalize().toArray();
      for(const key of ['left','right'])for(const field of ['normal','fingers','offset'])displayed[key][field]=mixDirection(source[key][field],target[key][field],s);
      if(transition.from==='dribble_between_legs'){
        const a=transition.wristFrom.left,b=handTarget('left',target).wrist,c=[Math.max(a[0],b[0])+.15*h,mix(a[1],b[1],.5),.18];
        displayed.left.wrist=a.map((v,i)=>(1-s)*(1-s)*v+2*(1-s)*s*c[i]+s*s*b[i]);
        displayed.left.contact=ramp(u,.72,.98);
      }
      // Hermite endpoint derivatives preserve the displayed ball velocity at
      // interrupted transitions; post-blend wrist IK keeps any full contact.
      const u2=u*u,u3=u2*u,dh=transition.duration;
      displayed.ball=source.ball.map((x,i)=>(2*u3-3*u2+1)*x+(u3-2*u2+u)*dh*transition.velocity[i]+(-2*u3+3*u2)*target.ball[i]);
      displayed.ball[1]=Math.max(m.ballRadius,displayed.ball[1]);
      if(u>=1)transition=null;
    }else displayed=target;
    frame++;apply(displayed);
    if(dt>1e-6){ballVelocity.copy(V(displayed.ball).sub(previousBall).multiplyScalar(1/dt));lastDt=dt;}
    previousBall.copy(V(displayed.ball));lastDiagnostics.ballVelocityMetersPerSecond=ballVelocity.toArray();
  }
  const controller={
    setAction(next,{immediate=false,blendSeconds=transitionSeconds}={}){
      if(!CATALOG[next])throw new Error('Unknown basketball motion: '+next);
      if(immediate){action=next;time=0;transition=pending=null;ballVelocity.set(0,0,0);render();return controller;}
      if(next===action&&!pending&&!transition)return controller;
      // A live dribble is gathered at the next upper catch. It cannot be
      // physically held while its centre is still at the floor.
      if(next==='idle_hold'&&action.startsWith('dribble_')&&!transition){pending={id:next,duration:Math.max(action==='dribble_between_legs'?.65:action==='dribble_power'?.62:.52,blendSeconds)};return controller;}
      begin(next,Math.max(.08,blendSeconds));return controller;
    },
    update(dt){
      dt=clamp(Number(dt)||0,0,.10);if(transition?.targetPhaseLocked)time=0;else time+=dt;
      if(pending){
        const a=CATALOG[action],phase=getPhase(),u=(action==='dribble_crossover'||action==='dribble_between_legs')?(phase*2)%1:phase;
        const safeCatch=action==='dribble_between_legs'?(phase>.9875||phase<.0125):(u>.975||u<.025);
        if(safeCatch)begin(pending.id,pending.duration);
      }
      if(transition)transition.elapsed+=dt;render(dt);return controller;
    },
    seek(phase){time=clamp(Number(phase)||0)*CATALOG[action].duration;transition=pending=null;ballVelocity.set(0,0,0);render();return controller;},
    getDiagnostics(){return copy(lastDiagnostics);},
    snapshot(){return {action,time,phase:getPhase(),measurements:{...m},pose:copy(displayed),bones:Object.fromEntries(BONE_NAMES.map(n=>[n,{position:bones[n].position.toArray(),quaternion:bones[n].quaternion.toArray(),scale:bones[n].scale.toArray()}])),morphs:morphMeshes.map(mesh=>({node:mesh.name,targetNames:{...mesh.morphTargetDictionary},weights:[...mesh.morphTargetInfluences]})),ballAnchor:{position:[...displayed.ball],quaternion:Q().setFromEuler(new THREE.Euler(...displayed.ballRotation,'XYZ')).toArray(),scale:displayed.ballVisible>.05?[1,1,1]:[0,0,0]},...controller.getDiagnostics()};},
    get action(){return action;},get duration(){return CATALOG[action].duration;},get measurements(){return {...m};},
    dispose(){for(const n of BONE_NAMES){bones[n].position.copy(bind[n].position);bones[n].quaternion.copy(bind[n].quaternion);bones[n].scale.copy(bind[n].scale);}root.updateWorldMatrix(true,true);},
  };
  render();return controller;
}
