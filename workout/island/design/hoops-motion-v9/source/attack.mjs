/**
 * CC0-1.0 — original v9 basketball attack performances.
 * Targets are authored here, not sampled/retargeted from any existing clip.
 * +Y up, +Z towards basket; 30Hz keys are baked by the package pipeline.
 */
import {basePose,contactHand,freeHand,twoHands,add,sub,mul,mix,control,ramp,pulse,smooth,hermite,hermiteC2,slerp,euler,qmul,qinv,qnorm,axis,basisQuaternion,rotate,dot,cross,norm,unit,G} from './authoring.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const sideOf=m=>m.side==='left'?1:-1;
const hand=s=>s>0?'LeftHand':'RightHand';
const foot=s=>s>0?'LeftFoot':'RightFoot';
const evt=(time,name)=>({time,name,domain:'presentation'});
const support=(effector,startTime,endTime)=>({effector,startTime,endTime,kind:'plant',localPointMeters:[0,-.08,0]});
const touch=(effector,startTime,endTime)=>({effector,startTime,endTime,localPointMeters:[0,-.08,.025]});
const lowHand=(s,y=1.0,z=.22)=>freeHand([s*.29,y,z],[s*.6,0,.8],[0,-.6,.8]);
function ready(){const p=basePose();p.hips=[0,-.12,0];p.lean=.075;p.ball=[0,1.01,.30];p.hands=twoHands(p.ball,.15);p.feet.LeftFoot={sole:[.17,0,.08],yaw:.04};p.feet.RightFoot={sole:[-.17,0,-.08],yaw:-.04};return p;}
// Solve the same two-bone triangle used by the baker, solely to choose an
// anatomical palm orientation. Finger direction follows the forearm projected
// into the palm plane; forearm pronation is never smuggled into wrist swing.
function forearmGeometry(p,sgn,end){
  const hipQ=euler(0,p.yaw),spineQ=qmul(hipQ,euler(p.lean*.65,0,p.roll*.6)),chestQ=qmul(spineQ,euler(p.lean*.35,p.twist,p.roll*.4));
  const hips=add([0,.86,0],p.hips),spine=add(hips,rotate(hipQ,[0,.2,0])),chest=add(spine,rotate(spineQ,[0,.18,0])),origin=add(chest,rotate(chestQ,[sgn*.16,.06,0]));
  const pole=p.armPoles?.[sgn>0?'Left':'Right']||add(origin,rotate(hipQ,[sgn*.38,-.32,-.13])),delta=sub(end,origin),dist=clamp(norm(delta),.025,.50985),direction=unit(delta),v=sub(pole,origin),u=unit(sub(v,mul(direction,dot(v,direction))),[sgn,0,0]);
  const along=(.27**2-.24**2+dist**2)/(2*dist),height=Math.sqrt(Math.max(0,.27**2-along**2)),elbow=add(origin,add(mul(direction,along),mul(u,height)));
  const directionForearm=unit(sub(end,elbow)),x=mul(unit(cross(u,direction)),-1),y=mul(directionForearm,-1),z=unit(cross(x,y));
  const upperQ=basisQuaternion(x,mul(unit(sub(elbow,origin)),-1),unit(cross(x,mul(unit(sub(elbow,origin)),-1))));
  return {axis:directionForearm,rotation:basisQuaternion(x,y,z),reach:Math.max(0,norm(delta)-.50985),origin,elbow,upperLocal:qmul(qinv(chestQ),upperQ),elbowLocal:qmul(qinv(upperQ),basisQuaternion(x,y,z))};
}
const forearmAxis=(p,sgn,end)=>forearmGeometry(p,sgn,end).axis;
const wrapDegrees=a=>((a+540)%360)-180;
function handAxial(q,sgn){
  q=qnorm(q);if(q[3]<0)q=mul(q,-1);
  const angle=2*Math.atan2(q[1],q[3])*180/Math.PI;
  return {angle,deviation:wrapDegrees(angle-(sgn>0?-90:90)),rotation:qnorm([0,q[1],0,q[3]])};
}
function palmNormal(normal,forearm){
  let n=unit(normal),d=dot(n,forearm);
  if(Math.abs(d)>.91){const tangent=unit(sub(n,mul(forearm,d)),[1,0,0]);n=add(mul(tangent,Math.sqrt(1-.91**2)),mul(forearm,Math.sign(d)*.91));}
  return n;
}
function grasp(p,sgn,center,normal,fingers=[0,0,1]){
  let n=unit(normal),best;
  for(let pass=0;pass<2;pass++){
    const u=unit(sub([0,0,1],mul(n,n[2])),[1,0,0]),v=unit(cross(n,u));let aBest=0,score=-Infinity;
    const assess=a=>{const f=add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),h=contactHand(center,n,f),frame=forearmGeometry(p,sgn,h.position),value=dot(f,frame.axis);if(value>score){score=value;aBest=a;best=h;}};
    for(let i=0;i<36;i++)assess(i*Math.PI/18);const around=aBest;for(let i=-4;i<=4;i++)assess(around+i*Math.PI/360);
    const next=palmNormal(n,forearmAxis(p,sgn,best.position));if(norm(sub(next,n))<1e-6)break;n=next;
  }
  return best;
}
function relaxed(p,sgn,position,normal=[0,0,1]){const forearm=forearmAxis(p,sgn,position),n=palmNormal(normal,forearm);return freeHand(position,n,forearm);}
const after=(a,b,c,t)=>t<a?0:t>b?0:Math.sin(Math.PI*(t-a)/(b-a))**c;
function ballistic(a,velocity,seconds){return add(a,[velocity[0]*seconds,velocity[1]*seconds-.5*G*seconds*seconds,velocity[2]*seconds]);}
function bouncingFlight(a,velocity,seconds){
  const hit=(velocity[1]+Math.sqrt(velocity[1]**2+2*G*Math.max(0,a[1]-.12)))/G;
  if(seconds<=hit)return ballistic(a,velocity,seconds);
  const p=ballistic(a,velocity,hit),s=seconds-hit,v=-.58*(velocity[1]-G*hit);
  return [p[0]+velocity[0]*s,.12+Math.max(0,v*s-.5*G*s*s),p[2]+velocity[2]*s];
}
function arc(t,a,b,height){if(t<=a||t>=b)return 0;const u=(t-a)/(b-a);return 4*height*u*(1-u);}
function driftFeet(p,t,root,tracks){
  for(const [name,keys] of Object.entries(tracks)){
    const target=control(t,keys);p.feet[name]={sole:sub(target,root),yaw:name==='LeftFoot'?.025:-.025};
  }
}
function dribblePose(m,t){
  const p=ready(),s=sideOf(m),hes=m.kind==='hesitation',between=m.kind==='between_legs';
  p.hips=[-.065*s+.13*s*ramp(t,.13,.78),-.18-.026*pulse(t,.10,.42,.75),0];
  p.lean=.10+.055*pulse(t,.03,.24,.60)-(hes?.04*pulse(t,.45,.70,.93):0);
  p.yaw=-s*.10*pulse(t,.05,.25,.70);p.twist=s*.18*pulse(t,.1,.45,.9);p.headYaw=s*.12*pulse(t,.08,.32,.8);
  p.feet.LeftFoot.sole=[.235,0,.10];p.feet.RightFoot.sole=[-.235,0,-.10];
  const release=8/42,bounce=19/42,catchAt=31/42;
  const startS=hes?s:-s,endS=s;
  const a=[startS*.31,.76,.31],b=[startS*.31,.66,between?.20:.32],c=[endS*.31,.68,between?-.12:.32],end=[endS*.32,hes?.91:.82,hes?.29:.27];
  const d1=(bounce-release)*m.durationSeconds,d2=(catchAt-bounce)*m.durationSeconds;
  const vyDown=(.12-b[1]+.5*G*d1*d1)/d1,vyUp=(c[1]-.12+.5*G*d2*d2)/d2;
  const floor=[between?0:mix(b[0],c[0],(bounce-release)/(catchAt-release)),.12,between?-.035:.32];
  if(t<=release){p.ball=hermiteC2(a,b,[0,0,0],[(floor[0]-b[0])/d1,vyDown,(floor[2]-b[2])/d1],[0,0,0],[0,-G,0],t/release,release*m.durationSeconds);p.phase='dribble-contact';}
  else if(t<=bounce){const u=(t-release)/(bounce-release),sec=(t-release)*m.durationSeconds;p.ball=mix(b,floor,u);p.ball[1]=b[1]+vyDown*sec-.5*G*sec*sec;p.phase='dribble-flight';}
  else if(t<catchAt){const u=(t-bounce)/(catchAt-bounce),sec=(t-bounce)*m.durationSeconds;p.ball=mix(floor,c,u);p.ball[1]=.12+vyUp*sec-.5*G*sec*sec;p.phase='dribble-flight';}
  else {p.ball=hermite(c,end,[(c[0]-floor[0])/d2,vyUp-G*d2,(c[2]-floor[2])/d2],[0,0,0],(t-catchAt)/(1-catchAt),(1-catchAt)*m.durationSeconds);p.phase='dribble-contact';}
  p.hands={LeftHand:relaxed(p,1,[.29,.93,.20],[.6,0,.8]),RightHand:relaxed(p,-1,[-.29,.93,.20],[-.6,0,.8])};
  if(t<=release)p.hands[hand(startS)]=grasp(p,startS,p.ball,[0,1,0],[0,0,1]);
  else if(t>=catchAt)p.hands[hand(endS)]=grasp(p,endS,p.ball,[0,1,0],[0,0,1]);
  else {
    const outgoing=grasp(p,startS,b,[0,1,0],[0,0,1]);
    const incoming=grasp(p,endS,c,[0,1,0],[0,0,1]);
    const first=hand(startS),second=hand(endS);
    {const u=ramp(t,release,release+.12),rest=relaxed(p,startS,[startS*.31,.89,.22],[0,1,0]);p.hands[first]={...rest,position:mix(outgoing.position,rest.position,u),orientation:slerp(outgoing.orientation,rest.orientation,u)};}
    {const u=ramp(t,catchAt-.16,catchAt),rest=relaxed(p,endS,[endS*.31,.93,.20],[0,1,0]);p.hands[second]={...rest,position:mix(rest.position,incoming.position,u),orientation:slerp(rest.orientation,incoming.orientation,u)};}
  }
  if(hes){
    const lift=after(.40,.68,1.4,t);p.feet[foot(-s)].sole=[-s*.235,.065*lift,mix(-s>0?.10:-.10,.08,ramp(t,.40,.68))];
    p.hips[0]-=s*.04*pulse(t,.4,.68,.95);p.headPitch=-.10*pulse(t,.48,.72,1);
  }
  return p;
}
function dribbleDefinitions(m){
  const s=sideOf(m),a=m.kind==='hesitation'?s:-s,release=8/42,bounce=19/42,catchAt=31/42;
  const supportWindows=[support(foot(s),0,1)];
  if(m.kind==='hesitation')supportWindows.push(support(foot(-s),0,.4),support(foot(-s),.68,1));else supportWindows.push(support(foot(-s),0,1));
  return {events:[evt(release,'release'),evt(bounce,'bounce'),evt(catchAt,'contact')],supportWindows,ballContactWindows:[touch(hand(a),0,release),touch(hand(s),catchAt,1)],phases:[{startTime:0,endTime:release,name:'dribble-contact'},{startTime:release,endTime:catchAt,name:'dribble-flight'},{startTime:catchAt,endTime:1,name:'dribble-contact'}]};
}
function finishingSpec(m){
  const euro=m.kind==='euro',dunk=m.kind.startsWith('dunk_'),layup=m.kind==='layup';
  if(dunk)return {takeoff:24/72,land:59/72,release:42/72,guide:32/72,height:1.61,side:-1,two:m.kind==='dunk_two_hands',moving:true};
  if(euro||layup)return {takeoff:39/72,land:63/72,release:51/72,guide:47/72,height:euro?.72:.77,side:sideOf(m),moving:true};
  if(m.kind==='free_throw')return {takeoff:null,land:null,release:40/72,guide:36/72,height:0,side:-1,moving:false};
  const N=Math.round(m.durationSeconds*30),takeoff=Math.round(.40*N)/N,land=Math.round(.78*N)/N,release=Math.round(.56*N)/N,guide=Math.round(.50*N)/N;
  return {takeoff,land,release,guide,height:m.kind==='floater'?.50:m.kind==='three_point'?.32:.27,side:-1,moving:m.kind==='floater'};
}
function pathSegments(t,keys,duration){
  t=clamp(t);if(t<=keys[0][0])return keys[0][1].slice();
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],seconds=(b[0]-a[0])*duration;return hermiteC2(a[1],b[1],a[2],b[2],[0,0,0],[0,0,0],(t-a[0])/(b[0]-a[0]),seconds);}
  return keys.at(-1)[1].slice();
}
function referencePath(m,t,sp){
  if(!sp.moving)return [0,0,0];
  const s=sp.side,drive=m.kind==='euro'||m.kind==='layup',dunk=m.kind.startsWith('dunk_'),duration=m.durationSeconds;
  let launch,land,middle,middleTime,middleVelocity;
  if(drive){const euro=m.kind==='euro',long=euro?.66:.57,short=euro?.98:.90;launch=[s*(euro?-.045:.035),0,short-.17];land=[s*(euro?-.025:.035),0,short+.20];middle=[s*(euro?.12:.025),0,long*.47];middleTime=.32;middleVelocity=[s*(euro?-.15:.02),0,.85];}
  else if(dunk){launch=[0,0,.35];land=[0,0,.75];middle=[0,0,.10];middleTime=.16;middleVelocity=[0,0,.62];}
  else {launch=[0,0,.18];land=[0,0,.42];middle=[0,0,.045];middleTime=.20;middleVelocity=[0,0,.32];}
  const flightVelocity=mul(sub(land,launch),1/((sp.land-sp.takeoff)*duration)),finish=add(land,mul(flightVelocity,(1-sp.land)*duration*.5));
  // Endpoint accelerations are zero, joining the exact constant-velocity air
  // segment with C2 ground paths. The host remains the owner of this trajectory.
  return pathSegments(t,[[0,[0,0,0],[0,0,0]],[middleTime,middle,middleVelocity],[sp.takeoff,launch,flightVelocity],[sp.land,land,flightVelocity],[1,finish,[0,0,0]]],duration);
}
function accelerationLean(p,m,t,sp){
  if(!sp.moving)return;
  const h=.10/m.durationSeconds,a=referencePath(m,t-h,sp),b=referencePath(m,t,sp),c=referencePath(m,t+h,sp),accel=mul(add(sub(a,b),sub(c,b)),100);
  accel[1]=0;const local=rotate(euler(0,-p.yaw),accel),magnitude=norm(accel),weight=smooth((magnitude-.12)/.28);
  // Positive X rotation tips the torso forwards; positive Z tips it right.
  // Ground braking therefore has a measured backward lean. In unaccelerated
  // flight the launch posture is held; there is no invented horizontal force.
  p.lean=mix(.012,clamp(.075*local[2],-.20,.20),weight);
  p.roll=mix(0,-clamp(.075*local[0],-.20,.20),weight);
}
function bodyFinishing(m,t,spec){
  const p=ready(),s=spec.side,dunk=m.kind.startsWith('dunk_'),drive=m.kind==='euro'||m.kind==='layup';
  const j=spec.takeoff===null?0:arc(t,spec.takeoff,spec.land,spec.height);
  const load=spec.takeoff===null?pulse(t,.03,.25,.52):pulse(t,Math.max(0,spec.takeoff-.22),spec.takeoff-.06,spec.takeoff);
  const absorb=spec.land===null?0:pulse(t,spec.land,Math.min(.94,spec.land+.07),1);
  p.hips=[0,-.10-(m.kind==='layup'?.085:.11)*load+j-.15*absorb,0];p.lean=.055+.09*load-.045*ramp(t,spec.takeoff??.28,spec.release)+.09*absorb;
  p.yaw=s*.06*pulse(t,.05,.34,.72);p.twist=-s*.09*pulse(t,.15,.47,.85);p.headPitch=-.12*ramp(t,.20,.50)*(1-ramp(t,.8,1));
  p.reference=[0,0,0];
  if(drive){
    const euro=m.kind==='euro',long=euro?.66:.57,short=euro?.98:.90;
    p.reference=referencePath(m,t,spec);
    const first=foot(s),second=foot(-s),firstStart=[s*.17,0,s>0?.08:-.08],secondStart=[-s*.17,0,-s>0?.08:-.08];
    const firstPlant=[s*(euro?.27:.17),0,long],secondPlant=[-s*.15,0,short];
    const firstNow=control(t,[[0,firstStart],[.12,firstStart],[.22,[s*(euro?.27:.17),.12,long*.5]],[.32,firstPlant],[.5,firstPlant],[spec.takeoff,firstPlant],[spec.land,[s*.16,0,short+.20]],[1,[s*.16,0,short+.20]]]);
    const secondNow=control(t,[[0,secondStart],[.32,secondStart],[.41,[-s*.15,.11,short*.5]],[.50,secondPlant],[spec.takeoff,secondPlant],[spec.land,[-s*.16,0,short+.20]],[1,[-s*.16,0,short+.20]]]);
    if(t>spec.takeoff&&t<spec.land){
      const tuck=.09*Math.sin(Math.PI*(t-spec.takeoff)/(spec.land-spec.takeoff));firstNow[1]=j+tuck;secondNow[1]=j+tuck*.55;
    }
    p.feet[first]={sole:sub(firstNow,p.reference),yaw:s*.04,pitch:.10*after(.12,.32,1.4,t)};p.feet[second]={sole:sub(secondNow,p.reference),yaw:-s*.04,pitch:.28*after(.32,.50,1.4,t)};
    // A low centre of mass lets the long planted step fit the compact canonical legs.
    p.hips[1]-=.06*(1-ramp(t,.48,.60));p.hips[0]=s*.018*pulse(t,.1,.32,.5);
  } else if(dunk){
    p.reference=referencePath(m,t,spec);
    const launch=[.16,0,.39],launchR=[-.16,0,.25];
    let L=control(t,[[0,[.16,0,.10]],[.04,[.16,0,.10]],[.10,[.16,.065,.18]],[.19,launch],[spec.takeoff,launch],[spec.land,[.16,0,.75]],[1,[.16,0,.75]]]);
    let R=control(t,[[0,[-.16,0,-.08]],[.16,[-.16,0,-.08]],[.24,[-.16,.07,.14]],[.28,launchR],[spec.takeoff,launchR],[spec.land,[-.16,0,.75]],[1,[-.16,0,.75]]]);
    if(t>spec.takeoff&&t<spec.land){const u=(t-spec.takeoff)/(spec.land-spec.takeoff),tuck=.23*Math.sin(Math.PI*u)**1.5;L[1]=j+tuck;R[1]=j+tuck;L[2]=mix(.39,.75,smooth(u));R[2]=mix(.25,.75,smooth(u));}
    p.feet.LeftFoot={sole:sub(L,p.reference),yaw:.03};p.feet.RightFoot={sole:sub(R,p.reference),yaw:-.03};
    p.hips[1]+=.04*ramp(t,spec.takeoff,spec.takeoff+.06)*(1-ramp(t,spec.land-.06,spec.land));
  } else {
    if(spec.moving)p.reference=referencePath(m,t,spec);
    for(const [name,x,z] of [['LeftFoot',.17,.08],['RightFoot',-.17,-.08]]){
      const localz=spec.moving?control(t,[[0,z],[spec.takeoff,z],[spec.land,z+.42],[1,z+.42]])-p.reference[2]:z;
      const tuck=spec.takeoff!==null&&t>spec.takeoff&&t<spec.land?.055*Math.sin(Math.PI*(t-spec.takeoff)/(spec.land-spec.takeoff)):0;
      p.feet[name]={sole:[x,j+tuck,localz],yaw:x>0?.035:-.035};
    }
    if(m.kind==='free_throw')p.hips[1]=-.09-.085*pulse(t,.04,.27,.53)+.045*pulse(t,.44,.57,.80);
  }
  accelerationLean(p,m,t,spec);
  return {p,j};
}
function releaseCenter(m,spec){
  const {p,j}=bodyFinishing(m,spec.release,spec),dunk=m.kind.startsWith('dunk_');
  if(dunk)return [spec.two?0:-.13,(spec.two?1.79:1.84)+j,.13];
  if(m.kind==='euro'||m.kind==='layup')return [spec.side*.17,1.65+j,.30];
  if(m.kind==='floater')return [-.13,1.63+j,.35];
  if(m.kind==='free_throw')return [-.09,1.66,.35];
  return [-.095,(m.kind==='three_point'?1.65:1.67)+j,.34];
}
function grip(center,m,spec,t,p){
  const dunk=m.kind.startsWith('dunk_'),main=hand(spec.side),guide=hand(-spec.side);
  const raised=ramp(t,dunk?.20:m.kind==='euro'||m.kind==='layup'?.38:.27,spec.release-.06);
  if(spec.two&&dunk)return {LeftHand:grasp(p,1,center,[.72,-.70,0],[0,0,1]),RightHand:grasp(p,-1,center,[-.72,-.70,0],[0,0,1])};
  const normal=mix([spec.side,0,-.15],[0,-1,0],raised);
  const result={};result[main]=grasp(p,spec.side,center,normal,[0,.18*(1-raised),1]);
  result[guide]=t<=spec.guide?grasp(p,-spec.side,center,[-spec.side,0,-.10],[0,.28,1]):relaxed(p,-spec.side,[-spec.side*.26,1.1+p.hips[1],.20],[-spec.side,0,-.10]);
  return result;
}
/** Fixed court geometry, defined independently of all ball samples. */
export function courtTarget(m){
  if(!['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(m.kind))return null;
  const sp=finishingSpec(m),ref=referencePath(m,sp.release,sp),drive=m.kind==='euro'||m.kind==='layup',dunk=m.kind.startsWith('dunk_');
  const x=dunk?(sp.two?0:-.13):drive?sp.side*.12:0;
  const z=ref[2]+(dunk?.33:drive?.60:m.kind==='floater'?1.9:m.kind==='free_throw'?4.25:m.kind==='three_point'?6.75:3.2);
  const targetFlightSeconds=dunk?(sp.two?.17:.18):drive?.48:m.kind==='floater'?.66:m.kind==='free_throw'?.97:m.kind==='three_point'?.94:.84;
  return {rimCenterMeters:[x,3.05,z],rimRadiusMeters:.2286,ballRadiusMeters:.12,backboard:{centerMeters:[x,3.60,z+.38],sizeMeters:[1.8,1.05,.06]},targetFlightSeconds};
}
function launchVelocity(m,spec){
  const rel=releaseCenter(m,spec),base=bodyFinishing(m,spec.release,spec),worldRelease=add(rel,base.p.reference),court=courtTarget(m),T=court.targetFlightSeconds,target=court.rimCenterMeters;
  return [(target[0]-worldRelease[0])/T,(target[1]-worldRelease[1]+.5*G*T*T)/T,(target[2]-worldRelease[2])/T];
}
function rawHeldCenter(m,t,spec){
  const {j}=bodyFinishing(m,t,spec),dunk=m.kind.startsWith('dunk_'),drive=m.kind==='euro'||m.kind==='layup',rel=releaseCenter(m,spec),rj=bodyFinishing(m,spec.release,spec).j;
  const start=[0,1.01,.30],dip=[dunk?-.04:drive?spec.side*.07:0,.92,.31],set=[dunk?-.08:drive?spec.side*.13:-.07,dunk?1.48:1.38,dunk?.17:.28];
  const center=control(t,[[0,start],[.15,dip],[dunk?.28:drive?.48:.38,set],[spec.release,[rel[0],rel[1]-rj,rel[2]]]]);
  center[1]+=j;center[1]-=.055*pulse(t,.02,.18,dunk?.19:drive?.34:.26);return center;
}
function drivingGuideRecovery(m,t,spec,p,j){
  const side=-spec.side,name=hand(side),then=bodyFinishing(m,spec.guide,spec),center=rawHeldCenter(m,spec.guide,spec),anchor=grip(center,m,spec,spec.guide,then.p)[name],seconds=.80,u=clamp((t-spec.guide)*m.durationSeconds/seconds),flightU=(spec.guide-spec.takeoff)/(spec.land-spec.takeoff),verticalVelocity=4*spec.height*(1-2*flightU)/((spec.land-spec.takeoff)*m.durationSeconds),rest=[side*.26,.99,.23];
  // A world-space recovery keeps the guide arm's inertia through the landing.
  // Adding the body's entire descent to a fast arm drop made it snap downward.
  const position=hermite(anchor.position,rest,[0,verticalVelocity,0],[0,0,0],u,seconds);
  return relaxed(p,side,position,mix(anchor.normal,[side,0,-.10],smooth(u)));
}
function finishingPose(m,t){
  const spec=finishingSpec(m),{p,j}=bodyFinishing(m,t,spec),dunk=m.kind.startsWith('dunk_'),drive=m.kind==='euro'||m.kind==='layup';
  const rel=releaseCenter(m,spec),baseRel=bodyFinishing(m,spec.release,spec),rj=baseRel.j;
  if(t<=spec.release){
    let center=rawHeldCenter(m,t,spec);
    // The last 100ms is a measured wrist/forearm drive. Match the projectile's
    // release velocity, rather than launching a stationary ball discontinuously.
    const driveStart=spec.release-.10/m.durationSeconds;
    if(t>driveStart){
      const h=1e-5,A=rawHeldCenter(m,driveStart,spec),before=rawHeldCenter(m,driveStart-h,spec),after=rawHeldCenter(m,driveStart+h,spec),vA=mul(sub(after,before),1/(2*h*m.durationSeconds));
      const rb=bodyFinishing(m,spec.release-h,spec).p.reference,ra=bodyFinishing(m,spec.release+h,spec).p.reference,rv=mul(sub(ra,rb),1/(2*h*m.durationSeconds));
      center=hermiteC2(A,rel,vA,sub(launchVelocity(m,spec),rv),[0,0,0],[0,-G,0],(t-driveStart)/(spec.release-driveStart),.10);
    }
    const liftStart=dunk?.19:drive?.34:.26;
    p.ball=center;p.phase=t<liftStart?(t<.12?'gather':'carry'):(dunk?'dunk':'shooting');
    p.hands=grip(center,m,spec,t,p);
    if(t>spec.guide&&!spec.two){
      const guide=hand(-spec.side),then=bodyFinishing(m,spec.guide,spec),centerAtGuide=rawHeldCenter(m,spec.guide,spec),a=grip(centerAtGuide,m,spec,spec.guide,then.p)[guide],u=ramp(t,spec.guide,spec.release),start=add(a.position,[0,j-then.j,0]),rest=relaxed(p,-spec.side,[-spec.side*.26,1.00+j,.20],[-spec.side,0,-.10]);
      p.hands[guide]=drive?drivingGuideRecovery(m,t,spec,p,j):relaxed(p,-spec.side,mix(start,rest.position,u),mix(a.normal,[-spec.side,0,-.10],u));
    }
  } else {
    const refRelease=baseRel.p.reference,worldRelease=add(rel,refRelease),flight=(t-spec.release)*m.durationSeconds,vel=launchVelocity(m,spec);
    p.ball=sub(dunk?bouncingFlight(worldRelease,vel,flight):ballistic(worldRelease,vel,flight),p.reference);p.phase='flight';
    const gh=grip(rel,m,spec,spec.release,baseRel.p),main=hand(spec.side),recover=ramp(t,Math.min(.91,spec.release+.16),1),dy=j-rj;
    p.hands={};
    for(const [name,sgn] of [['LeftHand',1],['RightHand',-1]]){
      if(drive&&name!==main){p.hands[name]=drivingGuideRecovery(m,t,spec,p,j);continue;}
      let follow=add(gh[name].position,[0,dy,0]);
      if(name===main||spec.two)follow[2]+=.035*ramp(t,spec.release,spec.release+.06);else follow=[sgn*.27,1.00+j,.20];
      const rest=[sgn*.25,.99,.23],end=relaxed(p,sgn,rest,[sgn,0,.2]);
      p.hands[name]={...end,position:mix(follow,rest,recover),orientation:slerp((name===main||spec.two)?gh[name].orientation:freeHand([0,0,0],[sgn,0,-.10],[0,-.3,1]).orientation,end.orientation,recover)};
    }
  }
  return p;
}
function finishingDefinitions(m){
  const sp=finishingSpec(m),drive=m.kind==='euro'||m.kind==='layup',dunk=m.kind.startsWith('dunk_'),events=[evt(.10,'gather'),evt(sp.guide,'guide_release'),evt(sp.release,'release')],supportWindows=[];
  if(drive){events.push(evt(.32,'long_step'),evt(.50,'short_step'));supportWindows.push(support(foot(sp.side),0,.12),support(foot(sp.side),.32,sp.takeoff),support(foot(-sp.side),0,.32),support(foot(-sp.side),.50,sp.takeoff));}
  else if(dunk){supportWindows.push(support('LeftFoot',0,.04),support('LeftFoot',.19,sp.takeoff),support('RightFoot',0,.16),support('RightFoot',.28,sp.takeoff));events.push(evt(.19,'left_plant'));}
  else for(const name of ['LeftFoot','RightFoot'])supportWindows.push(support(name,0,sp.takeoff??1));
  if(sp.takeoff!==null){events.push(evt(sp.takeoff,'takeoff'),evt(sp.land,'land'));for(const name of ['LeftFoot','RightFoot'])supportWindows.push(support(name,sp.land,1));}
  const ballContactWindows=sp.two?[touch('LeftHand',0,sp.release),touch('RightHand',0,sp.release)]:[touch(hand(sp.side),0,sp.release),touch(hand(-sp.side),0,sp.guide)];
  if(dunk)events.push(evt(sp.release+.08,'rim_plane'));
  return {courtTarget:courtTarget(m),events:events.sort((a,b)=>a.time-b.time),supportWindows,ballContactWindows,phases:[{startTime:0,endTime:dunk?.19:drive?.34:.26,name:'carry'},{startTime:dunk?.19:drive?.34:.26,endTime:sp.release,name:dunk?'dunk':'shooting'},{startTime:sp.release,endTime:1,name:'flight'}]};
}
const poseCache=new Map();
const qAngle=(a,b)=>2*Math.acos(clamp(Math.abs(dot(a,b)),-1,1));
function localCost(q,goal,wrist,axial,normalError=0){return qAngle(q,goal)**2+.000015*wrist*wrist+.000003*axial*axial+.25*normalError;}
function contactCandidates(p,sgn,h){
  const preferred=h.normal||rotate(h.orientation,[0,0,-1]),normals=[preferred],out=[];
  for(let i=0;i<64;i++){const y=1-2*(i+.5)/64,r=Math.sqrt(1-y*y),a=i*2.399963229728653;normals.push([r*Math.cos(a),y,r*Math.sin(a)]);}
  const u=unit(cross(preferred,Math.abs(preferred[1])<.8?[0,1,0]:[1,0,0])),v=unit(cross(preferred,u));
  for(const deg of [20,40,60])for(let i=0;i<8;i++){const a=i*Math.PI/4,r=deg*Math.PI/180;normals.push(add(mul(preferred,Math.cos(r)),mul(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),Math.sin(r))));}
  for(const n of normals){
    const u=unit(sub([0,0,1],mul(n,n[2])),[1,0,0]),v=unit(cross(n,u)),perNormal=[];
    for(let j=0;j<24;j++){
      const a=j*Math.PI/12,finger=add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),candidate=contactHand(p.ball,n,finger),frame=forearmGeometry(p,sgn,candidate.position);
      if(frame.reach>1e-7)continue;const q=qmul(qinv(frame.rotation),candidate.orientation),axial=handAxial(q,sgn).deviation,wrist=Math.acos(clamp(dot(finger,frame.axis),-1,1))*180/Math.PI;
      if(Math.abs(axial)>116||wrist>94)continue;
      perNormal.push({...candidate,localHand:q,upperLocal:frame.upperLocal,elbowLocal:frame.elbowLocal,axial,cost:localCost(candidate.orientation,h.orientation,wrist,axial,1-dot(n,preferred))});
    }
    perNormal.sort((a,b)=>a.cost-b.cost);if(perNormal.length){out.push(perNormal[0]);const other=perNormal.find(c=>qAngle(c.orientation,perNormal[0].orientation)>.5);if(other)out.push(other);}
  }
  return pruneCandidates(out,h);
}
function freeCandidates(p,sgn,h){
  const frame=forearmGeometry(p,sgn,h.position),out=[];
  for(const dev of [-112,-85,-55,-25,0,25,55,85,112])for(const degrees of [0,30,60,90])for(let i=0;i<(degrees?8:1);i++){
    const a=i*Math.PI/4,swing=axis([Math.cos(a),0,Math.sin(a)],degrees*Math.PI/180),q=qmul(frame.rotation,qmul(swing,axis([0,1,0],((sgn>0?-90:90)+dev)*Math.PI/180)));
    out.push({...h,orientation:q,localHand:qmul(qinv(frame.rotation),q),upperLocal:frame.upperLocal,elbowLocal:frame.elbowLocal,axial:dev,cost:localCost(q,h.orientation,degrees,dev)});
  }
  return pruneCandidates(out,h);
}
function pruneCandidates(items,h){
  if(!items.length)throw new Error('No anatomical hand target for '+JSON.stringify(h.position));
  items.sort((a,b)=>a.cost-b.cost);const out=[];
  for(const candidate of items){if(out.every(c=>qAngle(c.orientation,candidate.orientation)>.14))out.push(candidate);if(out.length>=72)break;}
  return out;
}
function solveHandPath(poses,sgn){
  const name=hand(sgn),states=poses.map(p=>p.hands[name].contact?contactCandidates(p,sgn,p.hands[name]):freeCandidates(p,sgn,p.hands[name])),back=[];
  let previous=states[0].map(c=>c.cost);
  for(let i=1;i<states.length;i++){
    const current=new Float64Array(states[i].length),choices=new Int16Array(states[i].length);
    for(let b=0;b<states[i].length;b++){
      const B=states[i][b];let best=Infinity,index=0;
      for(let a=0;a<states[i-1].length;a++){
        const A=states[i-1][a],angle=qAngle(A.orientation,B.orientation),distance=norm(sub(add(A.position,poses[i-1].reference),add(B.position,poses[i].reference))),cost=previous[a]+8*angle*angle+18*distance*distance+12*qAngle(A.localHand,B.localHand)**2+8*qAngle(A.upperLocal,B.upperLocal)**2+4*qAngle(A.elbowLocal,B.elbowLocal)**2+(A.axial*B.axial<0&&Math.abs(A.axial)+Math.abs(B.axial)>120?1000:0)+(angle>1.1?200*(angle-1.1)**2:0);
        if(cost<best){best=cost;index=a;}
      }
      current[b]=best+B.cost;choices[b]=index;
    }
    previous=current;back.push(choices);
  }
  let index=Array.from(previous).reduce((best,value,i)=>value<previous[best]?i:best,0),path=new Array(states.length);
  for(let i=states.length-1;i>=0;i--){path[i]=states[i][index];if(i)index=back[i-1][index];}
  return path;
}
function rawPose(meta,t){return ['crossover','between_legs','hesitation'].includes(meta.kind)?dribblePose(meta,t):finishingPose(meta,t);}
function getPosePath(meta){
  if(!poseCache.has(meta.id)){
    const n=Math.round(meta.durationSeconds*30),poses=Array.from({length:n+1},(_,i)=>rawPose(meta,i/n));
    for(const p of poses)for(const [name,sgn] of [['LeftHand',1],['RightHand',-1]])if(!p.hands[name].contact){const h=p.hands[name],o=forearmGeometry(p,sgn,h.position).origin,d=sub(h.position,o);if(norm(d)>.495)h.position=add(o,mul(unit(d),.495));}
    // The path is solved as a whole, independent of query order. Candidate
    // hands satisfy the actual IK wrist/axial constraints; transition cost keeps
    // palms on one continuous anatomical branch at the delivered 30Hz keys.
    const paths={LeftHand:solveHandPath(poses,1),RightHand:solveHandPath(poses,-1)};poseCache.set(meta.id,{n,poses,paths});
  }
  return poseCache.get(meta.id);
}
export function pose(meta,t){
  const path=getPosePath(meta),x=clamp(t)*path.n,a=Math.min(path.n-1,Math.floor(x)),u=x-a,p=Math.abs(x-Math.round(x))<1e-10?structuredClone(path.poses[Math.round(x)]):rawPose(meta,t);
  for(const name of ['LeftHand','RightHand']){
    const A=path.paths[name][a],B=path.paths[name][a+1],orientation=slerp(A.orientation,B.orientation,u),position=p.hands[name].contact?sub(p.ball,rotate(orientation,[0,-.08,.145])):mix(A.position,B.position,u);
    p.hands[name]={...p.hands[name],orientation,position,normal:rotate(orientation,[0,0,-1])};
  }
  return p;
}
export function definitions(meta){if(['crossover','between_legs','hesitation'].includes(meta.kind))return dribbleDefinitions(meta);return finishingDefinitions(meta);}
