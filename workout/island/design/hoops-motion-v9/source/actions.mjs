/**
 * Original CC0-1.0 basketball defensive, recovery and expressive performances.
 * All targets are authored in metres, before the canonical two-bone solve.
 * Ground phases use fixed world anchors, with reference translation removed.
 */
import {basePose,freeHand,twoHands,contactHand,control,ramp,pulse,smooth,mix,add,sub,mul,rotate,euler,qmul,TAU,HAND_CONTACT_POINT,SOLE_POINT,bakePose,forwardKinematics,handFrame,unit,dot,norm,cross,slerp,qinv,I,basisQuaternion} from './authoring.mjs';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ev=(time,name)=>({time,name,domain:'presentation'});
const support=(effector,startTime=0,endTime=1)=>({effector,startTime,endTime,kind:'plant',localPointMeters:SOLE_POINT});
const grip=(effector,startTime=0,endTime=1)=>({effector,startTime,endTime,localPointMeters:HAND_CONTACT_POINT});
const bothSupport=(a=0,b=1)=>['LeftFoot','RightFoot'].map(n=>support(n,a,b));
const bothGrip=(a=0,b=1)=>['LeftHand','RightHand'].map(n=>grip(n,a,b));
// Contact boundaries lie exactly on the delivered 30 Hz sampling grid.
const T={block:{take:16/54,land:37/54},rebound:{take:15/54,land:38/54},reboundLand:{land:13/42},jump:{take:17/72,land:37/72},dive:{take:14/72,contact:45/72,land:56/72},closeout:{r0:2/54,r1:12/54,l0:10/54,l1:20/54,r2:22/54,r3:31/54,l2:31/54,l3:41/54}};

/** Match bakePose's upper-body chain, so reaching targets move with the torso. */
function torso(p) {
  const hq=euler(p.hipsPitch||0,p.yaw,p.hipsRoll||0);
  const sq=qmul(hq,euler(p.lean*.65,0,p.roll*.6));
  const cq=qmul(sq,euler(p.lean*.35,p.twist,p.roll*.4));
  const hip=add([0,.86,0],p.hips);
  const chest=add(add(hip,rotate(hq,[0,.2,0])),rotate(sq,[0,.18,0]));
  return {chest,q:cq};
}
function bodyPoint(p,v) {const f=torso(p);return add(f.chest,rotate(f.q,v));}
function bodyHand(p,v,normal=[0,0,1],fingers=[0,-1,0]) {
  const f=torso(p);
  return freeHand(add(f.chest,rotate(f.q,v)),rotate(f.q,normal),rotate(f.q,fingers));
}
function neutral(p,t=0) {
  p.phase='empty';p.ball=[0,.12,2.5];
  const breathe=.006*Math.sin(TAU*t);
  p.hands={LeftHand:bodyHand(p,[.24,-.34+breathe,.075],[0,0,1]),RightHand:bodyHand(p,[-.24,-.34-breathe,.075],[0,0,1])};
  return p;
}
function defense(p,t=0) {
  const breathe=.007*Math.sin(TAU*t);
  p.hands={LeftHand:bodyHand(p,[.37,-.055+breathe,.27],[.12,0,1],[0,1,0]),RightHand:bodyHand(p,[-.37,-.055-breathe,.27],[-.12,0,1],[0,1,0])};
  return p;
}
function grounded() {
  const p=neutral(basePose());
  p.hips=[0,-.12,0];p.lean=.09;p.headPitch=-.025;
  p.feet.LeftFoot={sole:[.21,0,.055],yaw:.07};
  p.feet.RightFoot={sole:[-.21,0,-.055],yaw:-.07};
  return p;
}
function swingFoot(t,a,b,from,to,lift=.075) {
  if(t<=a)return from.slice();if(t>=b)return to.slice();
  const u=(t-a)/(b-a),v=mix(from,to,smooth(u));
  v[1]+=lift*Math.sin(Math.PI*u)**1.35;return v;
}
function jump(p,t,{take=.30,land=.68,height=.5}={}) {
  const u=clamp((t-take)/(land-take));
  const air=t>take&&t<land;
  const h=air?4*height*u*(1-u):0;
  const tuck=air?.045*Math.sin(Math.PI*u)**2:0;
  p.hips[1]=control(t,[[0,-.12],[take-.10,-.245],[take,-.085],[land,-.085],[land+.09,-.245],[1,-.12]])+h;
  for(const [name,x,z] of [['LeftFoot',.20,.035],['RightFoot',-.20,-.035]])p.feet[name]={sole:[x,h+tuck,z-.025*tuck/.045],yaw:x>0?.055:-.055,pitch:air?.16*Math.sin(Math.PI*u):0};
  return {h,u,air};
}
function jumpDefinition(take,land) {
  return {events:[ev(take,'takeoff'),ev(land,'land')],supportWindows:[...bothSupport(0,take),...bothSupport(land,1)],ballContactWindows:[]};
}

function screenPose(t) {
  const p=grounded(),breath=Math.sin(TAU*t);
  p.hips=[.008*breath,-.16+.004*(1-Math.cos(TAU*t)),0];p.lean=.075;p.headYaw=.035*breath;
  p.feet.LeftFoot.sole=[.235,0,0];p.feet.RightFoot.sole=[-.235,0,0];
  p.hands={LeftHand:bodyHand(p,[.105,-.325,.16],[-1,0,-.2],[0,-1,0]),RightHand:bodyHand(p,[-.105,-.325,.16],[1,0,-.2],[0,-1,0])};
  return p;
}
function defensivePose(t) {
  const p=grounded();p.hips=[.009*Math.sin(TAU*t),-.215+.004*(1-Math.cos(TAU*t)),0];p.lean=.155;p.headPitch=-.04;
  p.feet.LeftFoot.sole=[.27,0,.035];p.feet.RightFoot.sole=[-.27,0,-.035];
  return defense(p,t);
}
function closeoutPose(t) {
  const p=grounded(),c=T.closeout,ref=.90*ramp(t,0,.67);p.reference=[0,0,ref];
  let l=swingFoot(t,c.l0,c.l1,[.19,0,.10],[.22,0,.75],.09);
  if(t>c.l2)l=swingFoot(t,c.l2,c.l3,[.22,0,.75],[.25,0,.96],.045);
  let r=swingFoot(t,c.r0,c.r1,[-.19,0,-.10],[-.20,0,.40],.095);
  if(t>c.r2)r=swingFoot(t,c.r2,c.r3,[-.20,0,.40],[-.25,0,.99],.065);
  p.feet.LeftFoot={sole:sub(l,p.reference),yaw:.07};p.feet.RightFoot={sole:sub(r,p.reference),yaw:-.07};
  p.hips=[.012*Math.sin(6*Math.PI*t)*(1-ramp(t,.55,.8)),control(t,[[0,-.12],[.20,-.115],[.53,-.15],[.72,-.23],[1,-.205]]),0];
  const travel=u=>.90*ramp(u,0,.67),h=.10/1.8,acceleration=(travel(t-h)-2*travel(t)+travel(t+h))*100;
  p.lean=.18*Math.tanh(.5*acceleration)+.15*ramp(t,.74,.85);p.twist=.055*Math.sin(6*Math.PI*t)*(1-ramp(t,.52,.75));
  const f=torso(p),raise=ramp(t,.28,.60);
  p.hands={};
  for(const [side,s] of [['Left',1],['Right',-1]]){
    const running=[s*.245,-.20,.12+.12*Math.sin(6*Math.PI*t+(s<0?Math.PI:0))];
    const target=[s*.35,.13,.24];
    p.hands[side+'Hand']=bodyHand(p,mix(running,target,raise),[0,0,1],[0,1,0]);
  }
  p.phase='empty';return p;
}
function blockPose(t) {
  const p=grounded();jump(p,t,{...T.block,height:.50});p.lean=.045;p.headPitch=-.12;
  const reach=pulse(t,.12,.39,.82);
  p.hands={LeftHand:bodyHand(p,mix([.27,-.12,.25],[.23,.40,.14],reach),[0,0,1],[0,1,0]),RightHand:bodyHand(p,mix([-.27,-.12,.25],[-.23,.40,.14],reach),[0,0,1],[0,1,0])};
  p.phase='empty';return p;
}
function stealPose(t) {
  const p=grounded(),jab=pulse(t,.15,.43,.73);p.hips=[-.035*jab,-.17-.09*jab,.015*jab];p.lean=.13+.09*jab;p.twist=-.16*jab;
  defense(p);
  p.hands.RightHand=bodyHand(p,mix([-.30,-.08,.25],[-.35,-.25,.285],jab),[0,.2,1],[1,0,0]);
  p.headYaw=-.075*jab;return p;
}
function deflectPose(meta,t) {
  const p=grounded(),s=meta.side==='left'?1:-1,reach=pulse(t,.08,.42,.80);
  p.hips=[s*.035*reach,-.16-.025*reach,0];p.twist=s*.19*reach;p.roll=-s*.04*reach;p.lean=.10;
  defense(p);
  const side=s>0?'Left':'Right',other=s>0?'Right':'Left';
  p.hands[side+'Hand']=bodyHand(p,mix([s*.33,-.08,.24],[s*.50,.11,.20],reach),[s*.4,0,1],[0,1,0]);
  p.hands[other+'Hand']=bodyHand(p,[-s*.27,-.10,.24],[0,0,1],[0,1,0]);p.headYaw=s*.14*reach;
  return p;
}
function reboundHands(centre,lower) {
  const fingers=mix([0,1,.12],[0,.28,1],lower);
  return {LeftHand:contactHand(centre,[1,0,-.08],fingers),RightHand:contactHand(centre,[-1,0,-.08],fingers)};
}
function reboundPose(t) {
  const p=grounded();jump(p,t,{...T.rebound,height:.55});p.lean=.035;p.headPitch=-.13*(1-ramp(t,.65,.85));
  const lower=ramp(t,.56,.87),high=bodyPoint(p,[0,.355,.155]),low=bodyPoint(p,[0,-.09,.29]);
  const centre=mix(high,low,lower);
  const catching=.5;
  if(t<catching) {
    const at=grounded();jump(at,catching,{...T.rebound,height:.55});at.lean=.035;
    const catchCentre=bodyPoint(at,[0,.355,.155]);
    p.ball=add(catchCentre,[(catching-t)*.08,(catching-t)*.75,(catching-t)*.75]);
    p.hands=reboundHands(centre,lower);
    for(const h of Object.values(p.hands))h.contact=false;
    p.phase='flight';
  }else {p.ball=centre;p.hands=reboundHands(centre,lower);p.phase=t<.77?'rebound':'gather';}
  return p;
}
function reboundLandPose(t) {
  const p=grounded(),h=.27*(1-ramp(t,0,T.reboundLand.land));
  p.hips=[0,control(t,[[0,-.085],[T.reboundLand.land,-.085],[.46,-.25],[.8,-.16],[1,-.12]])+h,0];p.lean=.10+.08*pulse(t,.3,.48,.80);
  p.feet.LeftFoot={sole:[.205,h,.04],yaw:.06};p.feet.RightFoot={sole:[-.205,h,-.04],yaw:-.06};
  p.ball=bodyPoint(p,[0,-.08,.29]);p.hands=twoHands(p.ball,.12);p.phase='gather';return p;
}
function divePose(meta,t) {
  const p=grounded(),s=meta.side==='left'?1:-1,go=ramp(t,.16,.76);
  p.reference=[s*.76*go,0,.42*go];
  p.yaw=s*.32*ramp(t,T.dive.take,.72);p.hipsPitch=1.31*ramp(t,.22,.74);p.hipsRoll=-s*.16*pulse(t,.28,.67,.94);
  p.lean=.08-.035*ramp(t,.25,.8);p.roll=0;p.twist=-s*.07*pulse(t,.15,.57,.86);p.headPitch=-.07;
  p.hips=[0,control(t,[[0,-.16],[.16,-.25],[.27,-.09],[.40,-.13],[.61,-.50],[T.dive.land,-.62],[1,-.63]]),0];
  for(const [side,sgn,z] of [['Left',1,.055],['Right',-1,-.055]]) {
    const from=[sgn*.21,0,z],a=rotate(euler(0,p.yaw),[sgn*.14,.42,-.67]);
    const f=mix(sub(from,p.reference),a,ramp(t,T.dive.take,.72));
    if(t>T.dive.take&&t<.72)f[1]+=.11*Math.sin(Math.PI*(t-T.dive.take)/(.72-T.dive.take));
    p.feet[side+'Foot']={sole:f,yaw:p.yaw+sgn*.07,pitch:1.22*ramp(t,.25,.72)};
  }
  p.armPoles={Left:[.43,.36,.31],Right:[-.43,.36,.31]};
  const looseWorld=[s*1.00,.16,1.10],caught=[s*.24,.16,.68];
  const catchGo=ramp(T.dive.contact,.16,.76),catchCentre=sub(looseWorld,[s*.76*catchGo,0,.42*catchGo]);
  const centre=t<T.dive.contact?sub(looseWorld,p.reference):mix(catchCentre,caught,ramp(t,T.dive.contact,.82));
  p.ball=centre;
  const reaching=twoHands(centre,.1),anticipate=ramp(t,.28,T.dive.contact);
  p.hands={};for(const [side,sgn] of [['Left',1],['Right',-1]]) {
    const a=bodyHand(p,[sgn*.25,-.2,.18]);const target=reaching[side+'Hand'];
    if(t<T.dive.contact)p.hands[side+'Hand']={...target,position:mix(a.position,target.position,anticipate),contact:false};
    else p.hands[side+'Hand']=target;
  }
  p.phase=t<T.dive.contact?'flight':'gather';return p;
}
function getUpPose(meta,t) {
  const p=grounded(),back=meta.id.endsWith('back');
  p.hips=[(back?-.045:.035)*pulse(t,.08,.37,.74),control(t,back?[[0,-.63],[.18,-.59],[.36,-.47],[.57,-.32],[.78,-.18],[1,-.10]]:[[0,-.63],[.18,-.54],[.36,-.38],[.57,-.28],[.78,-.18],[1,-.10]]),0];
  p.hipsPitch=back?control(t,[[0,-1.31],[.16,-1.15],[.34,-.50],[.48,-.15],[.65,.25],[.8,.14],[1,0]]):control(t,[[0,1.31],[.18,1.12],[.40,.70],[.69,.22],[1,0]]);
  p.hipsRoll=back?-.40*pulse(t,.04,.25,.62):.06*pulse(t,0,.28,.65);
  p.lean=.06+.10*pulse(t,.42,.70,.92);p.headPitch=-.025;p.twist=back?-.12*pulse(t,.08,.3,.64):.025;
  const startZ=back?.52:-.67,startY=back?.065:.42;
  const r=swingFoot(t,.28,.50,[-.15,startY,startZ],[-.21,0,back?.06:-.08],.13);
  const l=swingFoot(t,.50,.75,[.15,startY,startZ],[.21,0,.08],.13);
  p.feet.RightFoot={sole:r,yaw:-.08,pitch:(back?-1.18:1.18)*(1-ramp(t,.28,.50))};
  p.feet.LeftFoot={sole:l,yaw:.08,pitch:(back?-1.18:1.18)*(1-ramp(t,.50,.75))};
  p.hands={};
  for(const [side,sgn,begin,end] of [['Left',1,.18,.64],['Right',-1,.12,.55]]) {
    const floor=[sgn*.265,.04,back?-.24:.33],ready=bodyHand(p,[sgn*.24,-.34,.075]);
    const lift=ramp(t,begin,end);
    p.hands[side+'Hand']=freeHand(mix(floor,ready.position,lift),mix([0,1,0],[0,0,1],lift),mix([0,0,1],[0,-1,0],lift));
  }
  if(back) {
    // Early supine support keeps the elbows lateral to the ribs before the
    // hands leave the floor; the pole returns to upright anatomy as we rise.
    const weight=1-ramp(t,.12,.50),hipQ=euler(p.hipsPitch||0,p.yaw,p.hipsRoll||0);
    p.armPoles={};
    for(const [side,sgn]of [['Left',1],['Right',-1]])p.armPoles[side]=add(bodyPoint(p,[sgn*.16,.06,0]),rotate(hipQ,[sgn*.38,mix(-.32,-.10,weight),mix(-.13,-.10,weight)]));
  }
  p.phase='empty';return p;
}
function celebrationPose(meta,t) {
  const p=grounded(),v=meta.variant;
  p.hips[0]=.018*Math.sin(Math.PI*t)**2;p.twist=.07*Math.sin(TAU*t)*Math.sin(Math.PI*t);p.headPitch=-.035;
  neutral(p,t);
  if(v==='fist') {
    const raise=pulse(t,.05,.32,.90);
    p.hands.RightHand=bodyHand(p,mix([-.24,-.34,.075],[-.28,.31,.14],raise),[0,0,1],[0,1,0]);
    p.lean=.07-.035*raise;p.roll=.025*raise;p.headYaw=-.08*raise;
  }else if(v==='jump') {
    jump(p,t,{...T.jump,height:.50});
    const raise=pulse(t,.08,.31,.78);
    for(const [side,s] of [['Left',1],['Right',-1]])p.hands[side+'Hand']=bodyHand(p,mix([s*.24,-.34,.075],[s*.27,.355,.12],raise),[0,0,1],[0,1,0]);
    p.headPitch=-.09*raise;
  }else if(v==='chest') {
    const tap=pulse(t,.10,.31,.47)+pulse(t,.48,.61,.84);
    p.hands.RightHand=bodyHand(p,mix([-.24,-.34,.075],[.055,.015,.145],tap),[0,0,-1],[0,1,0]);
    p.hips[1]=-.12-.012*Math.sin(2*Math.PI*t)**2;p.headYaw=.06*pulse(t,.13,.4,.85);
  }else {
    const reach=pulse(t,.08,.40,.91);
    p.hands.RightHand=bodyHand(p,mix([-.24,-.34,.075],[-.50,.13,.25],reach),[0,0,1],[0,1,0]);
    p.twist=-.12*reach;p.headYaw=-.22*reach;p.lean=.07;
  }
  return p;
}
function disappointedPose(t) {
  const p=grounded(),drop=ramp(t,.07,.47);
  p.hips=[.025*drop,-.12-.045*drop,0];p.lean=.09+.14*drop;p.headPitch=.02+.32*drop;p.headYaw=.025*Math.sin(TAU*t)*drop;
  p.hands={LeftHand:bodyHand(p,[.245,-.34,.11],[0,0,1]),RightHand:bodyHand(p,[-.245,-.34,.11],[0,0,1])};
  p.phase='empty';return p;
}
function hipsPose(t) {
  const p=grounded(),breath=.004*Math.sin(TAU*t);p.hips=[.008*Math.sin(TAU*t),-.10+breath,0];p.lean=.04;p.headYaw=.04*Math.sin(TAU*t);
  p.hands={LeftHand:bodyHand(p,[.225,-.34,-.035],[-1,0,0],[0,-1,0]),RightHand:bodyHand(p,[-.225,-.34,-.035],[1,0,0],[0,-1,0])};
  p.phase='empty';return p;
}

function authoredPose(meta,t) {
  if(meta.kind==='screen')return screenPose(t);
  if(meta.kind==='defensive_stance')return defensivePose(t);
  if(meta.kind==='closeout')return closeoutPose(t);
  if(meta.kind==='block')return blockPose(t);
  if(meta.kind==='steal')return stealPose(t);
  if(meta.kind==='deflect')return deflectPose(meta,t);
  if(meta.kind==='rebound')return reboundPose(t);
  if(meta.kind==='rebound_land')return reboundLandPose(t);
  if(meta.kind==='dive')return divePose(meta,t);
  if(meta.kind==='get_up')return getUpPose(meta,t);
  if(meta.kind==='celebrate')return celebrationPose(meta,t);
  if(meta.kind==='disappointed')return disappointedPose(t);
  if(meta.kind==='hands_on_hips')return hipsPose(t);
  throw new RangeError(`Unknown auxiliary action: ${meta.id}`);
}
/** Relax free ankles with the calf, then roll the sole flat before each plant. */
function relaxedFreeFeet(p,t,meta) {
  for(let pass=0;pass<6;pass++) {
    const fk=forwardKinematics(bakePose(p,t));
    for(const [side,start,end] of [['Right',.28,.50],['Left',.50,.75]]) {
      const diving=meta.kind==='dive';
      if(diving?t<=T.dive.take:t>=end)continue;
      const shank=unit(sub(fk[side+'Foot'].position,fk[side+'Leg'].position));
      const y=mul(shank,-1),right=[1,0,0];
      const x=unit(sub(right,mul(y,dot(right,y))));
      const z=unit(cross(x,y));
      const neutral=basisQuaternion(x,y,z),flat=euler(0,p.feet[side+'Foot'].yaw||0);
      p.feet[side+'Foot'].orientation=diving?slerp(euler(p.feet[side+'Foot'].pitch||0,p.feet[side+'Foot'].yaw||0),neutral,ramp(t,T.dive.take,T.dive.take+.08)):slerp(neutral,flat,ramp(t,end-.06,end));
    }
  }
  return p;
}
/** Stable forearm-relative wrist frames avoid frame flips during large arm arcs. */
const wristFrames=new Map();
function wristFrame(meta,side) {
  const key=meta.id+side;
  if(wristFrames.has(key))return wristFrames.get(key);
  let at=0;
  if(meta.kind==='closeout')at=1;
  if(meta.kind==='block')at=.47;
  if(meta.kind==='celebrate')at=meta.variant==='chest'?.31:meta.variant==='jump'?.31:meta.variant==='fist'?.32:.4;
  const p=authoredPose(meta,at),fk=forwardKinematics(bakePose(p,at));
  const local=qmul(qinv(fk[side+'ForeArm'].rotation),p.hands[side+'Hand'].orientation);
  const forearm=unit(sub(fk[side+'Hand'].position,fk[side+'ForeArm'].position));
  const fingers=rotate(p.hands[side+'Hand'].orientation,[0,-1,0]);
  const bend=Math.acos(clamp(dot(forearm,fingers),-1,1));
  const total=2*Math.acos(clamp(Math.abs(local[3]),-1,1));
  const scale=Math.min(1,(80*Math.PI/180)/(bend||1),(100*Math.PI/180)/(total||1));
  const result=slerp(I,local,scale);wristFrames.set(key,result);return result;
}
function medialWrist(local,side) {
  const q=local[3]<0?mul(local,-1):local,length=Math.hypot(q[1],q[3]);
  if(length<1e-9)return local;
  const twist=[0,q[1]/length,0,q[3]/length],neutral=side==='Left'?-90:90;
  let deviation=2*Math.atan2(twist[1],twist[3])*180/Math.PI-neutral;
  while(deviation>180)deviation-=360;while(deviation< -180)deviation+=360;
  // Smoothly return extreme hand-roll targets to medial anatomical neutral.
  // Right multiplication preserves the complete finger axis and wrist bend.
  const relaxed=deviation*(1-smooth((Math.abs(deviation)-80)/75));
  return qmul(qmul(q,qinv(twist)),euler(0,(neutral+relaxed)*Math.PI/180));
}
export function pose(meta,t) {
  const p=authoredPose(meta,t);
  if(['get_up','dive'].includes(meta.kind))relaxedFreeFeet(p,t,meta);
  // Reaching hands already share their future grip frame, ensuring a smooth catch.
  if(meta.ball)return p;
  const fk=forwardKinematics(bakePose(p,t));
  let amount=1;
  if(meta.kind==='closeout')amount=ramp(t,.22,.65);
  else if(meta.kind==='block')amount=pulse(t,.12,.40,.85);
  else if(meta.kind==='celebrate')amount=pulse(t,.06,meta.variant==='chest'?.31:.36,.91);
  else if(meta.kind==='get_up')amount=1-ramp(t,.18,.72);
  for(const side of ['Left','Right']) {
    const hand=p.hands[side+'Hand'];if(hand.contact)continue;
    hand.orientation=qmul(fk[side+'ForeArm'].rotation,medialWrist(slerp(I,wristFrame(meta,side),amount),side));
  }
  return p;
}
export function definitions(meta) {
  let d={events:[],supportWindows:bothSupport(),ballContactWindows:[]};
  if(meta.kind==='closeout'){const c=T.closeout;d={events:[ev(c.r1,'right_plant'),ev(c.l1,'left_plant'),ev(c.r3,'right_plant'),ev(c.l3,'left_plant'),ev(c.l3,'brake_complete')],supportWindows:[support('LeftFoot',0,c.l0),support('LeftFoot',c.l1,c.l2),support('LeftFoot',c.l3,1),support('RightFoot',0,c.r0),support('RightFoot',c.r1,c.r2),support('RightFoot',c.r3,1)],ballContactWindows:[]};}
  else if(meta.kind==='block')d={...jumpDefinition(T.block.take,T.block.land),events:[ev(T.block.take,'takeoff'),ev(.47,'contest'),ev(T.block.land,'land')]};
  else if(meta.kind==='steal')d.events=[ev(.43,'poke'),ev(.73,'recover')];
  else if(meta.kind==='deflect')d.events=[ev(.42,'contact'),ev(.80,'recover')];
  else if(meta.kind==='rebound')d={...jumpDefinition(T.rebound.take,T.rebound.land),events:[ev(T.rebound.take,'takeoff'),ev(.50,'contact'),ev(T.rebound.land,'land'),ev(.87,'secure')],ballContactWindows:bothGrip(.5,1),phases:[{startTime:0,endTime:.5,name:'flight'},{startTime:.5,endTime:.77,name:'rebound'},{startTime:.77,endTime:1,name:'gather'}]};
  else if(meta.kind==='rebound_land')d={events:[ev(T.reboundLand.land,'land'),ev(.80,'secure')],supportWindows:bothSupport(T.reboundLand.land,1),ballContactWindows:bothGrip()};
  else if(meta.kind==='dive')d={events:[ev(T.dive.take,'takeoff'),ev(T.dive.contact,'contact'),ev(T.dive.land,'land')],supportWindows:bothSupport(0,T.dive.take),ballContactWindows:bothGrip(T.dive.contact,1),phases:[{startTime:0,endTime:T.dive.contact,name:'flight'},{startTime:T.dive.contact,endTime:1,name:'gather'}]};
  else if(meta.kind==='get_up')d={events:[ev(.18,'push_up'),ev(.50,'right_plant'),ev(.75,'left_plant'),ev(1,'standing')],supportWindows:[support('RightFoot',.50,1),support('LeftFoot',.75,1)],ballContactWindows:[]};
  else if(meta.kind==='celebrate'&&meta.variant==='jump')d=jumpDefinition(T.jump.take,T.jump.land);
  else if(meta.kind==='celebrate')d.events=[ev(meta.variant==='chest'?.31:.40,'gesture'),...(meta.variant==='chest'?[ev(.61,'gesture')]:[])];
  return d;
}
