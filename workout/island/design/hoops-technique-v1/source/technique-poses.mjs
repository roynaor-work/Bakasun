/**
 * Original basketball technique choreography, in metres at 30 frames/second.
 * All target positions are in the athlete's model frame. rootTravel is applied
 * after the measured-skin IK solve; it supplies real travel for running gait.
 * Hand frames use the measured palmar surface supplied by the skin controller.
 */
import * as THREE from '../vendor/three.module.js';

const HZ=30,TAU=2*Math.PI;
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,u)=>a+(b-a)*u;
const ease=u=>{u=clamp(u);return u*u*u*(10+u*(-15+6*u));};
const ramp=(t,a,b)=>ease((t-a)/(b-a));
const pulse=(t,a,b,c,d)=>ramp(t,a,b)*(1-ramp(t,c,d));
const lerp=(a,b,u)=>a.map((x,i)=>mix(x,b[i],u));
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const norm=a=>{const n=Math.hypot(...a);return n>1e-10?a.map(x=>x/n):[0,0,1];};
const vec=a=>new THREE.Vector3(...a);
function direction(a,b,u){return norm(lerp(a,b,u));}
function hermite(a,b,va,vb,u,seconds){const u2=u*u,u3=u2*u;return a.map((x,i)=>(2*u3-3*u2+1)*x+(u3-2*u2+u)*seconds*va[i]+(-2*u3+3*u2)*b[i]+(u3-u2)*seconds*vb[i]);}
function basis(fingers,normal){
  const f=vec(norm(fingers)),n=vec(norm(normal));n.addScaledVector(f,-f.dot(n));
  if(n.lengthSq()<1e-10)n.set(1,0,0).addScaledVector(f,-f.x);n.normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(f,n).normalize(),f,n));
}
function wrist(m,side,ball,offset,fingers){
  const f=m.handFrames?.[side]||{center:[0,-.040*m.h,.012],normal:[0,0,1],fingers:[0,-1,0]},o=norm(offset),normal=mul(o,-1);
  const n=vec(normal),tangent=vec(fingers).addScaledVector(n,-vec(fingers).dot(n)).normalize();
  const q=basis(tangent.toArray(),normal).multiply(basis(f.fingers,f.normal).invert());
  return add(add(ball,mul(o,m.ballRadius)),vec(f.center).applyQuaternion(q).negate().toArray());
}
function event(type,frame,extra={}){return {type,frame,timeSeconds:frame/HZ,...extra};}
function entry(id,label,labelEn,frames,category,releaseFrame=null,extra={}){
  return {id,label,labelEn,duration:frames/HZ,frames,loop:false,category,
    ...(releaseFrame===null?{}:{releaseFrame}),events:releaseFrame===null?[]:[event('release',releaseFrame)],...extra};
}

export const TECHNIQUES=Object.freeze([
  entry('pass_chest','מסירת חזה','Two-hand chest pass',48,'pass',20,{technique:['Transfer weight toward the target','Elbows extend together','Thumbs rotate down after release']}),
  entry('pass_bounce','מסירה מקפיצה','Two-hand bounce pass',54,'pass',21,{events:[event('release',21),event('floor_contact',30)],technique:['Low athletic base','Push down and forward','One controlled floor contact']}),
  entry('pass_overhead','מסירה מעל הראש','Two-hand overhead pass',51,'pass',21,{technique:['Ball above forehead','Elbows lead forward','No excessive lumbar arch']}),
  entry('pass_behind_back_right','מסירה מאחורי הגב מימין','Right-hand behind-the-back pass',57,'pass',24,{technique:['Ball clears the rear hip','Small trunk counter-rotation','One-hand lateral release']}),
  entry('pass_behind_back_left','מסירה מאחורי הגב משמאל','Left-hand behind-the-back pass',57,'pass',24,{technique:['Mirrored rear-hip route','Stable planted base','One-hand lateral release']}),
  entry('pass_jump','מסירה בקפיצה','Two-hand jump pass',57,'pass',25,{events:[event('takeoff',14),event('release',25),event('landing',44)]}),
  entry('alley_oop_pass','אליי־אופ: העברה','Alley-oop lob pass',54,'pass',23,{technique:['High soft release','Two-hand guide','Arc toward a finishing teammate']}),
  entry('alley_oop_dunk','אליי־אופ: תפיסה והטבעה','Alley-oop catch and dunk',63,'finish',35,{events:[event('takeoff',12),event('catch',20),event('release',35),event('landing',52)],technique:['Track incoming lob','Catch above shoulder','Extend and finish downward']}),
  entry('shot_jump','זריקת קפיצה','Clean jump shot',60,'shot',28,{events:[event('load',9),event('takeoff',17),event('guide_hand_off',25),event('release',28),event('landing',48)],technique:['Knee and hip load','Ball rises through the shooting pocket','Guide hand separates','Wrist follows through']}),
  entry('shot_three','זריקת שלוש','Three-point jump shot',63,'shot',29,{events:[event('load',10),event('takeoff',18),event('guide_hand_off',26),event('release',29),event('landing',50)],technique:['Deeper leg drive','One continuous upward motion','Higher forward launch speed']}),
  entry('shot_fadeaway','פאדאווי','Fadeaway jump shot',66,'shot',31,{events:[event('takeoff',18),event('guide_hand_off',28),event('release',31),event('landing',53)],technique:['Backward travel occurs in the air','Eyes remain on target','Balanced two-foot landing']}),
  entry('shot_stepback','צעד לאחור וזריקה','Step-back jump shot',72,'shot',35,{events:[event('stepback_takeoff',6),event('stepback_land',20),event('takeoff',24),event('release',35),event('landing',59)]}),
  entry('layup_right','צעד וחצי ביד ימין','Right-hand layup',63,'finish',33,{events:[event('takeoff',20),event('release',33),event('landing',51)],technique:['Opposite-leg takeoff','Same-side knee drive','Soft fingertip finish']}),
  entry('layup_left','צעד וחצי ביד שמאל','Left-hand layup',63,'finish',33,{events:[event('takeoff',20),event('release',33),event('landing',51)],technique:['Mirrored footwork','Opposite-leg takeoff','Soft left-hand finish']}),
  entry('dribble_run_right','ריצה בכדרור ימין','Run with right-hand dribble',24,'dribble',null,{cycle:true,travelMeters:1.76,events:[event('hand_push',0,{side:'right'}),event('floor_contact',12),event('hand_catch',24,{side:'right'})]}),
  entry('dribble_run_left','ריצה בכדרור שמאל','Run with left-hand dribble',24,'dribble',null,{cycle:true,travelMeters:1.76,events:[event('hand_push',0,{side:'left'}),event('floor_contact',12),event('hand_catch',24,{side:'left'})]}),
  entry('dribble_crossover','קרוס אובר','Low front crossover',36,'dribble',null,{cycle:true,loop:true,events:[event('hand_push',0,{side:'right'}),event('floor_contact',9),event('hand_catch',18,{side:'left'}),event('floor_contact',27),event('hand_catch',36,{side:'right'})]}),
  entry('dribble_between_legs','כדרור בין הרגליים','Between-the-legs transfer',48,'dribble',null,{cycle:true,loop:true,events:[event('hand_push',0,{side:'right'}),event('floor_contact',12),event('hand_catch',24,{side:'left'}),event('floor_contact',36),event('hand_catch',48,{side:'right'})]}),
  entry('dribble_behind_back','כדרור מאחורי הגב','Behind-the-back dribble',48,'dribble',null,{cycle:true,loop:true,events:[event('hand_push',0,{side:'right'}),event('floor_contact',12),event('hand_catch',24,{side:'left'}),event('floor_contact',36),event('hand_catch',48,{side:'right'})]}),
  entry('pivot_left','סיבוב על רגל שמאל','Left-foot anchored pivot',54,'footwork',null,{events:[event('pivot_anchor',0,{side:'left',marker:'ball-of-foot'}),event('swing_foot_land',28),event('return_land',54)]}),
  entry('pivot_right','סיבוב על רגל ימין','Right-foot anchored pivot',54,'footwork',null,{events:[event('pivot_anchor',0,{side:'right',marker:'ball-of-foot'}),event('swing_foot_land',28),event('return_land',54)]}),
  entry('stop_jump','עצירה פתאומית בשתי רגליים','Two-foot jump stop',45,'footwork',null,{events:[event('takeoff',4),event('landing',14)],technique:['Both feet land together','Hips absorb momentum','Ball gathered without an extra step']}),
  entry('stop_stride','עצירת צעד','One-two stride stop',48,'footwork',null,{events:[event('lead_plant',13,{side:'right'}),event('trail_plant',25,{side:'left'})],technique:['Lead foot brakes','Trail foot restores the base','Weight settles between both feet']}),
  entry('celebrate','חגיגת שחקן','Professional player celebration',72,'expression',null,{events:[event('fist_raise',27)],technique:['Controlled fist pump','Chest opens','Balanced feet remain planted']}),
]);
const CATALOG=Object.fromEntries(TECHNIQUES.map(a=>[a.id,a]));

function blank(m){
  const {h,ankleY,footX,hipsY}=m;
  return {hips:[0,-.055*h,0],hipsRotation:[0,0,0],spine:[.075,0,0],chest:[0,0,0],neck:[0,0,0],head:[-.04,0,0],
    leftFoot:[footX+.025,ankleY,.025],rightFoot:[-footX-.025,ankleY,.075],
    leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftFootRoll:0,rightFootRoll:0,leftSupport:1,rightSupport:1,
    leftKneePole:[footX+.04,hipsY*.5,.75],rightKneePole:[-footX-.04,hipsY*.5,.75],
    left:{wrist:[.17*h,.57*h,.18],normal:[-1,0,.25],fingers:[0,-.5,1],rotation:[0,0,0,0],contact:0,grip:.82,freeGrip:.18,reach:.96,bend:[.08,-.8,-.05],offset:[1,0,0]},
    right:{wrist:[-.17*h,.57*h,.18],normal:[1,0,.25],fingers:[0,-.5,1],rotation:[0,0,0,0],contact:0,grip:.82,freeGrip:.18,reach:.96,bend:[-.08,-.8,-.05],offset:[-1,0,0]},
    ball:[0,.65*h,.31],ballVisible:0,ballRotation:[0,0,0],hipsY,rootTravel:[0,0,0]};
}
function hold(p,m,point=p.ball){
  p.ball=[...point];p.ballVisible=1;
  for(const [side,sign]of [['left',1],['right',-1]]){p[side].contact=1;p[side].offset=norm([sign,-.18,-.14]);p[side].normal=mul(p[side].offset,-1);p[side].fingers=norm([-.12*sign,-.08,1]);}
  return p;
}
function recoverBody(p,m,t,start=.76){
  const s=ramp(t,start,1),b=blank(m);
  for(const key of ['hips','hipsRotation','spine','chest','neck','head'])p[key]=lerp(p[key],b[key],s);
  for(const side of ['left','right']){
    p[side].wrist=lerp(p[side].wrist,b[side].wrist,s);
    p[side].normal=direction(p[side].normal,b[side].normal,s);p[side].fingers=direction(p[side].fingers,b[side].fingers,s);
    p[side].freeGrip=mix(p[side].freeGrip,b[side].freeGrip,s);
  }
  return p;
}
function jumpHeight(seconds,takeoff,landing,height){
  if(seconds<=takeoff||seconds>=landing)return 0;
  const u=(seconds-takeoff)/(landing-takeoff);
  // A compact takeoff/landing easing removes a velocity pop at the contact
  // boundary while preserving a rounded airborne arc and a clear knee drive.
  return height*Math.pow(Math.sin(Math.PI*u),2);
}
function setJump(p,m,seconds,takeoff,landing,height){
  const y=jumpHeight(seconds,takeoff,landing,height),air=seconds>takeoff&&seconds<landing;
  p.hips[1]+=y;
  for(const side of ['left','right']){p[side+'Foot'][1]+=y;p[side+'Support']=air?0:1;}
  return y;
}
/** Final 60 ms supplies a finite hand acceleration and the exact launch
 * derivative. Before release the ball and palms share one target; afterwards
 * the ball is an independent gravity trajectory with the same position/velocity.
 */
function poweredPoint(seconds,release,initial,releasePoint,velocity,{drive=.06,loadPoint=initial,loadAt=.22,initialTime=0}={}){
  const start=release-drive,pre=sub(releasePoint,mul(velocity,drive*.5));
  if(seconds<=loadAt)return lerp(initial,loadPoint,ease((seconds-initialTime)/Math.max(.001,loadAt-initialTime)));
  if(seconds<start)return lerp(loadPoint,pre,ease((seconds-loadAt)/Math.max(.001,start-loadAt)));
  if(seconds<=release){const q=(seconds-start)/drive;return add(pre,mul(velocity,.5*drive*q*q));}
  const dt=seconds-release;return add(releasePoint,[velocity[0]*dt,velocity[1]*dt-4.905*dt*dt,velocity[2]*dt]);
}
function freeFollow(p,m,side,releasePoint,offset,fingers,seconds,release,{flick=false,follow=[0,0,.10]}={}){
  const hand=p[side],s=ease((seconds-release)/.18),start=wrist(m,side,releasePoint,offset,fingers);
  hand.contact=seconds<=release?1:0;hand.offset=norm(offset);
  hand.wrist=add(start,mul(follow,s));
  hand.normal=direction(mul(norm(offset),-1),flick?[0,.75,1]:[side==='left'?1:-1,-.12,.8],s);
  hand.fingers=direction(fingers,flick?[0,-1,.8]:[side==='left'?-.2:.2,-.6,1],s);
  hand.freeGrip=mix(hand.grip,flick?.10:.20,s);
}

function passPose(id,t,m){
  const a=CATALOG[id],seconds=t*a.duration,release=a.releaseFrame/HZ,p=hold(blank(m),m),{h}=m;
  const behind=id.includes('behind_back'),left=id.endsWith('_left'),sign=left?1:-1,overhead=id==='pass_overhead',lob=id==='alley_oop_pass',bounce=id==='pass_bounce',jump=id==='pass_jump';
  const active=left?'left':'right',inactive=left?'right':'left',load=pulse(t,.015,.16,.23,.48),push=ramp(seconds,release-.18,release+.08);
  p.hips[1]-=(bounce?.055:.030)*h*load;p.hips[2]=.045*pulse(t,.13,.42,.58,.92);
  p.spine[0]+=.055*load-(overhead?.04:0)*push;p.chest[1]=behind?-sign*.29*pulse(t,.04,.32,.52,.89):0;
  p.hipsRotation[1]=behind?sign*.09*pulse(t,.04,.28,.60,.90):0;p.head[1]=behind?sign*.13*pulse(t,.04,.28,.60,.90):0;
  let jumpY=0;if(jump)jumpY=setJump(p,m,seconds,14/HZ,44/HZ,.26);
  const jumpRelease=jump?jumpHeight(release,14/HZ,44/HZ,.26):0;
  const chest=id==='pass_chest'||jump,initial=[0,(chest?.72:.65)*h,.31],loadPoint=behind?[sign*.195*h,.66*h,-.24]:overhead?[0,.93*h,.12]:lob?[0,.72*h,.26]:[0,(bounce?.58:chest?.70:.63)*h,.22];
  let releasePoint=behind?[-sign*.025,.69*h,-.23]:overhead?[0,.97*h,.49]:lob?[0,.90*h,.59]:[0,(bounce?.61:chest?.76:.68)*h+jumpRelease,bounce?.58:.65];
  let velocity=behind?[-sign*5.6,1.1,2.8]:overhead?[0,1.4,7.4]:lob?[0,7.1,4.7]:bounce?[0,0,6.2]:[0,.75,7.2];
  if(bounce){const impact=.3;velocity[1]=(m.ballRadius-releasePoint[1]+4.905*impact*impact)/impact;}
  p.ball=poweredPoint(seconds,release,initial,releasePoint,velocity,{loadPoint,loadAt:behind?.40:.22,drive:behind?.07:.06});
  if(bounce&&seconds>release+.3){const impact=.3,dt=seconds-release-impact,vy=-(velocity[1]-9.81*impact)*.78;p.ball=[0,m.ballRadius+vy*dt-4.905*dt*dt,releasePoint[2]+velocity[2]*(impact+dt)];}
  p.ball[1]=Math.max(m.ballRadius,p.ball[1]);p.ballRotation=[-seconds*(bounce?5:3),0,0];
  const offsets=behind?{[active]:norm([sign*.40,-.90,-.05]),[inactive]:norm([-sign,-.12,0])}:{left:norm([.96,-.13,-.14]),right:norm([-.96,-.13,-.14])};
  for(const side of ['left','right']){
    const sgn=side==='left'?1:-1,offset=offsets[side],finger=behind?[0,.12,1]:norm([-sgn*.10,.10,1]);
    p[side].offset=offset;p[side].fingers=finger;p[side].normal=mul(offset,-1);if(behind)p[side].grip=.50;
    freeFollow(p,m,side,releasePoint,offset,finger,seconds,release,{follow:[sgn*.035,bounce?-.06:overhead?.02:0,.08]});
    if(behind&&side===inactive){p[side].contact=1-ramp(seconds,.14,.30);p[side].wrist=[-sign*.22*h,.67*h,.25];p[side].normal=[sign,0,0];p[side].fingers=[0,.5,1];}
  }
  p.ballVisible=seconds<release+.58?1:0;
  return recoverBody(p,m,t,.72);
}

function shotPose(id,t,m){
  const a=CATALOG[id],seconds=t*a.duration,release=a.releaseFrame/HZ,p=hold(blank(m),m),{h}=m;
  const three=id==='shot_three',fade=id==='shot_fadeaway',step=id==='shot_stepback';
  const takeoff=(step?24:fade?18:three?18:17)/HZ,landing=(step?59:fade?53:three?50:48)/HZ,height=fade?.33:three?.31:.29;
  const load=pulse(seconds,step?.52:.015,takeoff-.10,takeoff-.035,takeoff+.13);
  p.hips[1]-=(three?.090:.075)*h*load;p.spine[0]=.075+.055*load;p.chest[1]=-.07*load;p.head=[-.055,0,0];
  let y=setJump(p,m,seconds,takeoff,landing,height),releaseY=jumpHeight(release,takeoff,landing,height);
  const legExtension=pulse(seconds,takeoff,takeoff+.16,landing-.16,landing),releaseExtension=pulse(release,takeoff,takeoff+.16,landing-.16,landing);
  p.hips[1]+=.055*h*legExtension;
  if(step){const hop=jumpHeight(seconds,6/HZ,20/HZ,.13);p.hips[1]+=hop;for(const side of ['left','right']){p[side+'Foot'][1]+=hop;if(hop>0)p[side+'Support']=0;}p.rootTravel[2]=-.43*ramp(seconds,6/HZ,20/HZ);}
  if(fade){p.rootTravel[2]=-.34*ramp(seconds,takeoff,landing);p.spine[0]-=.17*pulse(seconds,takeoff,takeoff+.15,landing-.12,landing);p.hipsRotation[1]=-.08*pulse(seconds,takeoff,takeoff+.14,landing-.1,landing);}
  const palmRise=-(m.rightShotWristDelta?.[1]??-.148);
  const releasePoint=[m.rightShoulderX*.70,m.shoulderY+m.armReach*.945+palmRise-.055*h+releaseY+.055*h*releaseExtension,fade?.09:.14],velocity=[0,three?6.7:fade?6.1:5.9,three?6.6:4.7];
  const initial=[0,.65*h,.31],pocket=[-.055,(three?.60:.63)*h,.30];
  p.ball=poweredPoint(seconds,release,initial,releasePoint,velocity,{loadPoint:pocket,loadAt:step?.48:.26,drive:.075});
  p.ball[1]=Math.max(m.ballRadius,p.ball[1]);p.ballRotation=[-seconds*7.5,0,0];
  const ro=norm([-.08,-1,-.12]),lo=norm([.97,-.10,-.12]),rf=[0,.10,1],lf=[-.10,.10,1];
  freeFollow(p,m,'right',releasePoint,ro,rf,seconds,release,{flick:true,follow:[0,.035,.075]});
  p.right.reach=.97;p.right.bend=[-.035,-.80,.18];
  const guideOff=release-.10;p.left.offset=lo;p.left.contact=1-ramp(seconds,guideOff-.08,guideOff);
  p.left.fingers=lf;p.left.normal=mul(lo,-1);
  const guidePoint=poweredPoint(guideOff,release,initial,releasePoint,velocity,{loadPoint:pocket,loadAt:step?.48:.26,drive:.075});
  p.left.wrist=wrist(m,'left',guidePoint,lo,lf);
  p.left.wrist=add(p.left.wrist,[.08*ramp(seconds,guideOff,release+.12),.015*ramp(seconds,guideOff,release+.12),0]);
  p.left.wrist=lerp(p.left.wrist,[.20*h,.66*h,.23],ramp(seconds,release+.10,release+.42));
  p.left.freeGrip=.12;p.left.bend=[.035,-.80,.18];
  p.ballVisible=seconds<release+.64?1:0;
  return recoverBody(p,m,t,.76);
}

function layupPose(id,t,m){
  const a=CATALOG[id],seconds=t*a.duration,release=a.releaseFrame/HZ,p=hold(blank(m),m),{h}=m,left=id==='layup_left',side=left?'left':'right',other=left?'right':'left',sign=left?1:-1;
  const takeoff=20/HZ,landing=51/HZ,height=.40,y=setJump(p,m,seconds,takeoff,landing,height);
  p.hips[1]-=.040*h*pulse(seconds,.04,.25,.40,.73);p.spine[0]=.085;p.chest[1]=sign*.09*pulse(t,.10,.33,.65,.90);p.head[0]=-.095;
  const drive=pulse(seconds,takeoff-.10,takeoff+.15,landing-.10,landing);
  p[side+'Foot'][1]+=.25*drive;p[side+'Foot'][2]+=.16*drive;p[side+'Support']=drive>.001?0:p[side+'Support'];
  p.rootTravel[2]=.32*ramp(seconds,takeoff,landing);
  const releasePoint=[sign*.095,m.shoulderY+m.armReach-.055*h+jumpHeight(release,takeoff,landing,height),.35],velocity=[0,3.8,2.7];
  p.ball=poweredPoint(seconds,release,[0,.65*h,.31],releasePoint,velocity,{loadPoint:[sign*.055,.69*h,.30],loadAt:.38,drive:.085});
  const offset=norm([sign*.04,-1,-.04]),fingers=[0,.2,1];
  freeFollow(p,m,side,releasePoint,offset,fingers,seconds,release,{flick:true,follow:[0,.07,.05]});
  p[side].reach=.97;p[side].bend=[sign*.03,-.8,.1];
  p[other].contact=1-ramp(seconds,.49,.66);p[other].wrist=[-sign*.25*h,.69*h+y,.32];p[other].normal=[sign,0,0];p[other].fingers=[0,.3,1];
  p.ballVisible=seconds<release+.58?1:0;
  return recoverBody(p,m,t,.78);
}

function dunkPose(t,m){
  const a=CATALOG.alley_oop_dunk,seconds=t*a.duration,release=a.releaseFrame/HZ,catchTime=20/HZ,takeoff=12/HZ,landing=52/HZ,p=blank(m),{h}=m;
  const palmRise=-(m.rightShotWristDelta?.[1]??-.148),releaseArc=Math.sin(Math.PI*(release-takeoff)/(landing-takeoff))**2;
  const height=Math.max(.55,(3.10-(m.shoulderY+m.armReach*.94+palmRise))/releaseArc+.025),y=setJump(p,m,seconds,takeoff,landing,height);
  p.hips[1]+=.055*h*pulse(seconds,takeoff,takeoff+.16,landing-.16,landing);
  p.hips[1]-=.060*h*pulse(seconds,.0,.18,.30,.53);p.spine[0]=.06-.09*pulse(seconds,.50,.80,1.13,1.48);p.head[0]=-.16*pulse(t,.10,.24,.65,.85);
  const catchPoint=[-.075,m.shoulderY+m.armReach+palmRise+jumpHeight(catchTime,takeoff,landing,height)-.08,.24],releasePoint=[-.075,3.10,.20];
  const incoming=[0,-3.6,-1.7],releaseVelocity=[0,-2.25,.15];
  if(seconds<catchTime){const dt=seconds-catchTime;p.ball=add(catchPoint,mul(incoming,dt));}
  else if(seconds<catchTime+.14)p.ball=hermite(catchPoint,add(catchPoint,[0,.035,0]),incoming,[0,0,0],(seconds-catchTime)/.14,.14);
  else p.ball=poweredPoint(seconds,release,add(catchPoint,[0,.035,0]),releasePoint,releaseVelocity,{loadPoint:[-.075,3.22,.24],loadAt:catchTime+.25,initialTime:catchTime+.14,drive:.075});
  p.ball[1]=Math.max(m.ballRadius,p.ball[1]);p.ballVisible=seconds<release+.58?1:0;p.ballRotation=[-seconds*4,0,0];
  const offset=norm([-.28,-.94,-.08]),fingers=[0,.15,1];p.right.grip=.60;
  freeFollow(p,m,'right',releasePoint,offset,fingers,seconds,release,{flick:true,follow:[0,-.12,.03]});
  if(seconds<catchTime){
    p.right.contact=0;const target=wrist(m,'right',catchPoint,offset,fingers),start=add(target,[0,-.28,-.09]),trackingStart=catchTime-.08;
    if(seconds<trackingStart)p.right.wrist=lerp(blank(m).right.wrist,start,ramp(seconds,takeoff-.12,trackingStart));
    else p.right.wrist=hermite(start,target,[0,0,0],incoming,(seconds-trackingStart)/.08,.08);
  }
  else p.right.contact=seconds<=release?1:0;
  p.right.grip=.60;p.right.reach=.97;p.right.bend=[-.03,-.5,.3];
  p.left.wrist=[.23*h,.65*h+y*.65,.26];p.left.normal=[-1,0,0];p.left.fingers=[0,.25,1];p.left.freeGrip=.22;
  const tuck=pulse(seconds,takeoff+.08,takeoff+.25,landing-.17,landing-.015);p.rightFoot[1]+=.17*tuck;p.rightFoot[2]-=.13*tuck;p.leftFoot[1]+=.06*tuck;
  p.rootTravel[2]=.20*ramp(seconds,takeoff,landing);
  return recoverBody(p,m,t,.79);
}

function running(t,m,{duration=.8,withBall=false,side='right'}={}){
  const p=blank(m),{h}=m,speed=2.2,stance=.42,span=speed*duration*stance;
  p.hips=[.010*Math.sin(t*TAU),-.085*h+.012*Math.cos(t*TAU*2),0];p.hipsRotation=[.025,.045*Math.sin(t*TAU),-.012*Math.sin(t*TAU)];
  p.spine=[.13,0,0];p.chest=[.025,-.10*Math.sin(t*TAU),0];p.head=[-.085,.035*Math.sin(t*TAU),0];p.rootTravel=[0,.005,speed*duration*t];
  for(const [key,sign]of [['left',1],['right',-1]]){
    const q=(t+(sign===1?0:.5))%1,support=q<stance,u=support?q/stance:(q-stance)/(1-stance),swingSeconds=duration*(1-stance);
    const z=support?span/2-speed*duration*q:hermite([-span/2],[span/2],[-speed],[-speed],u,swingSeconds)[0];
    p[key+'Foot']=[sign*(m.footX+.025),m.ankleY+(support?0:.17*Math.sin(Math.PI*u)**2),z];p[key+'Support']=support?1:0;
    p[key+'FootRotation']=[support?0:-.28*Math.sin(Math.PI*u)**2,0,0];
    const swing=-Math.cos(t*TAU)*sign;p[key].wrist=[sign*.14*h,h*(.64+.10*Math.max(0,swing)),.12+.24*swing];p[key].bend=[sign*.05,-.25,-.60];p[key].freeGrip=.50;p[key].normal=[-sign,0,0];p[key].fingers=[0,.2,1];
  }
  if(withBall){
    const sign=side==='left'?1:-1,other=side==='left'?'right':'left',bounce=controlledBounce(.51*h,m.ballRadius,t,duration);
    p.ball=[sign*.205*h,bounce.y-.005,.34];p.ballVisible=1;p.ballRotation=[-t*TAU*2,0,0];
    const hand=p[side];hand.offset=[0,1,0];hand.normal=[0,-1,0];hand.fingers=[0,0,1];hand.grip=.30;hand.contact=dribbleContact(t,bounce.push);
    hand.wrist=[sign*.205*h,Math.max(.47*h,bounce.y+.12),.34];hand.bend=[sign*.04,-.8,.0];p[other].freeGrip=.18;
  }
  return p;
}
function controlledBounce(top,radius,phase,period){
  const u=clamp(phase),half=period/2,H=top-radius,g=9.81,push=Math.max(.08*period,half-Math.sqrt(2*H/g)),flight=half-push;
  const acceleration=Math.max(.1,(H-.5*g*flight*flight)/(push*(half-.5*push))),seconds=Math.min(u,1-u)*period;
  const distance=seconds<=push?.5*acceleration*seconds*seconds:.5*acceleration*push*push+acceleration*push*(seconds-push)+.5*g*(seconds-push)**2;
  return {y:Math.max(radius,top-distance),push:push/period};
}
function dribbleContact(u,push){return Math.max(1-ramp(u,push,push+.045),ramp(u,1-push-.045,1-push));}
function dribblePose(id,t,m){
  const a=CATALOG[id];if(id.startsWith('dribble_run_'))return running(t,m,{duration:a.duration,withBall:true,side:id.endsWith('_left')?'left':'right'});
  const p=blank(m),{h}=m,between=id==='dribble_between_legs',behind=id==='dribble_behind_back',twice=t*2,half=Math.min(1,Math.floor(twice)),u=t===1?1:twice-half,sign=half===0?-1:1;
  const bounce=controlledBounce(h*(between?.42:behind?.44:.47),m.ballRadius,u,a.duration/2),x=sign*Math.cos(Math.PI*u)*h*.205;
  const z=behind?-.23-.085*Math.sin(Math.PI*u):between?mix(.30,-.18,ramp(u,.08,.91)):.34;
  p.ball=[x,bounce.y,z];if(between&&half===1)p.ball[2]=mix(-.18,.30,ramp(u,.08,.91));p.ballVisible=1;p.ballRotation=[-t*TAU*2,0,0];
  p.hips=[-.035*h*Math.cos(t*TAU),-(between?.15:.12)*h,0];p.spine=[between?.19:.14,0,0];p.chest=[0,behind?.18*Math.sin(t*TAU):-.055*Math.cos(t*TAU),0];p.head=[-.05,-p.chest[1]*.35,0];
  p.leftFoot=[m.footX+.10,m.ankleY,between?-.13:.025];p.rightFoot=[-m.footX-.10,m.ankleY,between?.17:.075];
  for(const [key,sgn]of [['left',1],['right',-1]]){
    const outgoing=sgn===sign,incoming=!outgoing,hand=p[key];hand.contact=Math.max(outgoing?1-ramp(u,bounce.push,bounce.push+.04):0,incoming?ramp(u,1-bounce.push-.04,1-bounce.push):0);
    hand.offset=[0,1,0];hand.normal=[0,-1,0];hand.fingers=[0,0,1];hand.grip=.28;hand.freeGrip=.12;
    const follow=outgoing?1-ramp(u,.22,.63):ramp(u,.36,.82);
    hand.wrist=[sgn*.205*h,mix(.58*h,Math.max(bounce.y+.12,.43*h),follow),behind?-.21:between?(half===0?(outgoing?.29:-.19):(outgoing?-.19:.29)):.33];
    hand.bend=[sgn*.04,-.9,behind?-.25:0];
  }
  return p;
}

function pivotPose(id,t,m){
  const p=hold(blank(m),m),{h}=m,left=id==='pivot_left',side=left?'left':'right',other=left?'right':'left',sign=left?1:-1;
  const turn=pulse(t,6/54,27/54,40/54,1),yaw=-sign*1.02*turn,footYaw=yaw*.80,toe=.13,anchor=[sign*(m.footX+.025),m.ankleY,(left?.025:.075)+toe];
  p[side+'Foot']=[anchor[0]-Math.sin(footYaw)*toe,m.ankleY,anchor[2]-Math.cos(footYaw)*toe];p[side+'FootRotation']=[0,footYaw,0];
  p[side+'SupportMarker']='ball-of-foot';p[side+'PivotOffset']=[0,0,toe];
  p.hips=[sign*.035,-.085*h,.015];p.hipsRotation[1]=yaw*.72;p.chest[1]=yaw*.28;p.head[1]=-yaw*.20;
  const opening=t>6/54&&t<28/54,closing=t>40/54&&t<1,swingU=opening?(t-6/54)/(22/54):closing?(t-40/54)/(14/54):0,leg=(opening||closing)?Math.sin(Math.PI*swingU)**2:0,swingYaw=yaw*.90;
  const start=blank(m)[other+'Foot'],dx=start[0]-anchor[0],dz=start[2]-anchor[2];
  p[other+'Foot']=[anchor[0]+dx*Math.cos(swingYaw)+dz*Math.sin(swingYaw),m.ankleY+.095*leg,anchor[2]-dx*Math.sin(swingYaw)+dz*Math.cos(swingYaw)];
  p[other+'Support']=opening||closing?0:1;p[other+'FootRotation']=[0,swingYaw,0];
  p.ball=[sign*.09,.64*h,.31];p.ball[0]+=.07*Math.sin(yaw);p.ball[2]+=.08*(1-Math.cos(yaw));
  // The open foot returns through its own airborne swing. The pivot foot keeps
  // its ball-of-foot marker fixed during both the opening and closing turn.
  return recoverBody(p,m,t,.76);
}
function stopPose(id,t,m){
  const a=CATALOG[id],seconds=t*a.duration,p=hold(blank(m),m),{h}=m,stride=id==='stop_stride',travel=.56*ramp(seconds,0,.68),settle=pulse(t,.10,.36,.66,1);
  p.rootTravel=[0,0,travel];p.hips[1]-=.080*h*settle;p.hips[2]-=.055*settle;p.spine[0]-=.15*settle;p.head[0]+=.04*settle;p.chest[1]=-.065*settle;
  const base=blank(m);
  for(const side of ['left','right']){
    const lift=stride?(side==='right'?3/HZ:14/HZ):4/HZ,land=stride?(side==='right'?13/HZ:25/HZ):14/HZ;
    let worldZ=base[side+'Foot'][2],y=0;
    if(seconds>lift){const u=clamp((seconds-lift)/(land-lift));worldZ+=.56*ease(u);y=.10*Math.sin(Math.PI*u)**2;}
    p[side+'Foot']=[base[side+'Foot'][0],m.ankleY+y,worldZ-travel];p[side+'Support']=seconds>lift&&seconds<land?0:1;
  }
  p.ball=[0,.65*h-.045*settle,.31];return recoverBody(p,m,t,.73);
}
function celebratePose(t,m){
  const p=blank(m),{h}=m,raise=pulse(t,.08,.34,.66,.97),pump=.055*Math.sin(Math.PI*ramp(t,.36,.61));
  p.hips[0]=-.025*raise;p.hips[1]+=.012*raise;p.chest[0]=-.06*raise;p.chest[1]=-.12*raise;p.head[0]-=.055*raise;
  p.right.wrist=[-.14*h,.57*h+.40*h*raise-pump,.18];p.right.normal=[1,0,.15];p.right.fingers=[0,1,.08];p.right.freeGrip=mix(.18,.94,raise);
  p.left.wrist=[.18*h,.57*h+.045*h*raise,.20];p.left.freeGrip=mix(.18,.52,raise);
  return recoverBody(p,m,t,.78);
}

export function techniquePose(id,phase,m){
  const t=clamp(phase);
  if(id==='idle')return blank(m);
  if(id==='run')return running(t,m);
  if(!CATALOG[id])throw new Error('Unknown technique: '+id);
  if(id.startsWith('pass_')||id==='alley_oop_pass')return passPose(id,t,m);
  if(id.startsWith('shot_'))return shotPose(id,t,m);
  if(id.startsWith('layup_'))return layupPose(id,t,m);
  if(id==='alley_oop_dunk')return dunkPose(t,m);
  if(id.startsWith('dribble_'))return dribblePose(id,t,m);
  if(id.startsWith('pivot_'))return pivotPose(id,t,m);
  if(id.startsWith('stop_'))return stopPose(id,t,m);
  return celebratePose(t,m);
}
