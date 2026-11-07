/**
 * Original CC0 basketball footwork performances, authored for v9.
 * Planted feet are world anchors minus the descriptive reference trajectory.
 * No source animation, motion-capture samples, or v8 performance is reused.
 */
import {basePose,freeHand,contactHand,twoHands,control,ramp,smooth,pulse,mix,add,sub,mul,euler,rotate,hermiteC2,slerp,bakePose,forwardKinematics,dot,norm,TAU,G,SOLE_POINT,HAND_CONTACT_POINT} from './authoring.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const yaw=(p,a)=>rotate(euler(0,a),p);
const v3=(x=0,y=0,z=0)=>[x,y,z];
const sideSign=meta=>meta.side==='left'?1:-1;
const atBody=(p,local)=>add([p.hips[0],.86+p.hips[1],p.hips[2]],yaw(local,p.yaw));
const emptyHands=(p,swing=0,wide=.21)=>{
  p.hands.LeftHand=freeHand(atBody(p,[wide,.045,.06+swing]),yaw([0,0,1],p.yaw),yaw([0,-1,0],p.yaw));
  p.hands.RightHand=freeHand(atBody(p,[-wide,.045,.06-swing]),yaw([0,0,1],p.yaw),yaw([0,-1,0],p.yaw));
  p.phase='empty';p.ball=[0,.12,0];
};
function carry(p,{side=0,height=.30,forward=.29}={}) {
  p.ball=atBody(p,[side,height,forward]);p.hands={LeftHand:contactHand(p.ball,yaw([1,0,-.12],p.yaw),yaw([0,.28,1],p.yaw)),RightHand:contactHand(p.ball,yaw([-1,0,-.12],p.yaw),yaw([0,.28,1],p.yaw))};p.phase='carry';
}
function dribble(p,t,meta,{cycles=1,top=.79}={}) {
  const f=t===1?0:(t*cycles)%1,D=meta.durationSeconds/cycles,s=sideSign(meta),x=s*.30;
  const release=.14,hit=.5,catchAt=.86,flight=(hit-release)*D;
  const yRelease=top-.09,vy=(.12-yRelease+.5*G*flight*flight)/flight;
  let y,held;
  if(f<release){y=hermiteC2([top],[yRelease],[0],[vy],[0],[-G],f/release,release*D)[0];held=true;}
  else if(f<=hit){const sec=(f-release)*D;y=yRelease+vy*sec-.5*G*sec*sec;held=false;}
  else if(f<catchAt){const sec=(f-hit)*D;y=.12+(-vy+G*flight)*sec-.5*G*sec*sec;held=false;}
  else {y=hermiteC2([yRelease],[top],[-vy],[0],[-G],[0],(f-catchAt)/(1-catchAt),(1-catchAt)*D)[0];held=true;}
  const localBall=yaw([x,y,.26],p.yaw);p.ball=[localBall[0]+p.hips[0],y,localBall[2]+p.hips[2]];
  const handName=s>0?'LeftHand':'RightHand',other=s>0?'RightHand':'LeftHand';
  p.hands[other]=freeHand(atBody(p,[-s*.26,.23,.18]),yaw([0,0,1],p.yaw),yaw([0,-.8,.5],p.yaw));
  if(held)p.hands[handName]=contactHand(p.ball,[0,1,0],yaw([0,0,1],p.yaw));
  else {
    const u=(f-release)/(catchAt-release),touch=contactHand([p.ball[0],yRelease,p.ball[2]],[0,1,0],yaw([0,0,1],p.yaw));
    const wait=contactHand([p.ball[0],top,p.ball[2]],[0,1,0],yaw([0,0,1],p.yaw));
    // Release/catch velocities match the ball; hand then waits above its next rise.
    const position=hermiteC2(touch.position,touch.position,[0,vy,0],[0,-vy,0],[0,0,0],[0,0,0],u,(catchAt-release)*D);
    position[1]=Math.max(position[1],wait.position[1]-.11);
    p.hands[handName]=freeHand(position,[0,1,0],yaw([0,0,1],p.yaw));
  }
  p.phase=held?'dribble-contact':'dribble-flight';
}
function idle(meta,t){
  const p=basePose(),s=Math.sin(TAU*t),c=Math.cos(TAU*t),variant=meta.variant;
  p.hips=[variant==='weight_shift'?.025*s:.004*s,-.078+.003*(1-c),variant==='ready'?.008*s:0];
  p.lean=variant==='ready'?.065+.008*s:.018+.006*s;p.roll=variant==='weight_shift'?-.018*s:.003*s;
  p.yaw=.018*s;p.twist=-.026*s;p.headPitch=variant==='ready'?-.025:.018+.006*c;p.headYaw=.025*Math.sin(TAU*t+.4);
  p.feet.LeftFoot={sole:[variant==='ready'?.19:.16,0,.04],yaw:.06};
  p.feet.RightFoot={sole:[variant==='ready'?-.19:-.16,0,-.04],yaw:-.05};
  if(meta.ball)carry(p,{side:variant==='weight_shift'?.035:0,height:.29,forward:.29});else emptyHands(p,.012*s);
  return p;
}
// Put sprint toe-off exactly on the30Hz key grid. A fractional contact
// boundary can interpolate part of the fast swing into a declared plant.
const gaitDuty=meta=>meta.gait==='sprint'?Math.floor(.20*Math.round(meta.durationSeconds*30))/Math.round(meta.durationSeconds*30):({walk:.52,jog:.40,run:.30}[meta.gait||'walk']);
function gait(meta,t){
  const p=basePose(),f=t===1?0:t,D=meta.durationSeconds,g=meta.gait||'walk',dir=meta.direction||[0,1];
  const duty=gaitDuty(meta),height={walk:.055,jog:.13,run:.20,sprint:.27}[g];
  // Uniform30Hz quaternion interpolation follows a short chord below a planted
  // sole. Sub-centimetre/16mm guide clearance keeps that interpolated sole at
  // the floor; all contacts remain inside the independently audited2cm band.
  const clearance={walk:.004,jog:.006,run:.015,sprint:.016}[g];
  const speed=meta.speed,span=speed*D*duty,run=g==='run'||g==='sprint',s=Math.sin(TAU*f),double=Math.cos(2*TAU*f);
  // Shorter stance at higher speed is required by the fixed .78 m canonical legs.
  const hipBase={walk:-.115,jog:-.155,run:-.165,sprint:-.16}[g];
  const bounce={walk:.008,jog:.025,run:.04,sprint:.055}[g];
  const stepPhase=(2*f)%1,groundFraction=Math.min(1,2*duty),bodyLift=stepPhase>groundFraction?bounce*Math.sin(Math.PI*(stepPhase-groundFraction)/(1-groundFraction))**2:0;
  p.hips=[.006*s,hipBase+bodyLift-.006*Math.sin(Math.PI*Math.min(1,stepPhase/groundFraction))**2,.003*s];
  p.yaw=(run?.085:.045)*s;p.twist=-(run?.18:.10)*s;
  p.lean={walk:.035,jog:.10,run:.17,sprint:.23}[g];p.roll=.012*s;p.headPitch=-.01;p.headYaw=-.02*s;
  p.reference=[dir[0]*speed*D*t,0,dir[1]*speed*D*t];
  for(const [side,offset,sgn] of [['Left',0,1],['Right',.5,-1]]){
    const u=(f+offset)%1;let along,lift=0;
    if(u<=duty)along=span/2-speed*D*u;
    else {const q=(u-duty)/(1-duty),T=(1-duty)*D;along=mix(-span/2,span/2,smooth(q))-speed*T*q*(1-q)*(1-2*q)*Math.exp(-q*(1-q)/.018);lift=height*Math.sin(Math.PI*q)**2;}
    p.feet[side+'Foot']={sole:[sgn*.145+dir[0]*along,lift+clearance,dir[1]*along],yaw:sgn*.025,pitch:0};
  }
  if(meta.ball)dribble(p,t,meta,{cycles:g==='walk'?2:1,top:g==='walk'?.81:.83});else emptyHands(p,{walk:.12,jog:.18,run:.23,sprint:.24}[g]*s);
  return p;
}
// Fixed high-resolution integration is deterministic and gives continuous path,
// heading, speed and acceleration without fitting those values to the audit.
const paths=new Map();
function pathFor(meta){
  if(paths.has(meta.id))return paths.get(meta.id);
  const D=meta.durationSeconds,kind=meta.kind,s=sideSign(meta),turn=(meta.angle||60)*Math.PI/180*s,N=2400,dt=D/N;
  function params(seconds){
    const t=clamp(seconds/D,0,1);
    if(kind==='slide')return {heading:0,moveHeading:s*Math.PI/2,speed:meta.speed};
    if(kind==='brake')return {heading:0,speed:meta.speed*(1-ramp(t,.08,.78))};
    if(kind==='cut')return {heading:turn*ramp(t,.28,.70),speed:meta.speed*(1-.52*pulse(t,.12,.43,.82))};
    if(kind==='basket_cut')return {heading:s*.62*(1-ramp(t,.08,.50)),speed:meta.speed*(.55+.45*ramp(t,0,.32))};
    return {heading:s*Math.PI/2,speed:meta.speed};
  }
  const samples=[v3()];
  for(let i=1;i<=N;i++){const m=params((i-.5)*dt),v=[Math.sin(m.moveHeading??m.heading)*m.speed,0,Math.cos(m.moveHeading??m.heading)*m.speed];samples.push(add(samples.at(-1),mul(v,dt)));}
  const evaluate=seconds=>{
    if(seconds<0){const a=params(0);return {position:[Math.sin(a.moveHeading??a.heading)*a.speed*seconds,0,Math.cos(a.moveHeading??a.heading)*a.speed*seconds],...a};}
    if(seconds>D){const a=params(D);return {position:add(samples.at(-1),[Math.sin(a.moveHeading??a.heading)*a.speed*(seconds-D),0,Math.cos(a.moveHeading??a.heading)*a.speed*(seconds-D)]),...a};}
    const f=seconds/dt,i=Math.min(N-1,Math.floor(f));return {position:mix(samples[i],samples[i+1],f-i),...params(seconds)};
  };
  paths.set(meta.id,evaluate);return evaluate;
}
function stepSchedule(meta){
  const kind=meta.kind,D=meta.durationSeconds;
  if(kind==='brake')return {cycle:.5,duty:.56,stop:D*.78};
  if(kind==='slide')return {cycle:D,duty:.60,stop:Infinity};
  return {cycle:kind==='basket_cut'?.6:.65,duty:.54,stop:Infinity};
}
function anchoredFeet(p,meta,t){
  const path=pathFor(meta),D=meta.durationSeconds,sec=t*D,{cycle,duty,stop}=stepSchedule(meta),stance=cycle*duty;
  const width=meta.kind==='slide'?.30:.16;
  for(const [side,phase,sgn] of [['Left',0,1],['Right',.5,-1]]){
    const offset=phase*cycle,last=Number.isFinite(stop)?Math.floor((stop-.08-offset)/cycle)*cycle+offset:Infinity;
    const k=Math.floor((sec-offset+1e-10)/cycle),start=Math.min(k*cycle+offset,last),end=start+stance;
    const anchorAt=startTime=>{const sample=path(startTime+stance*.5),off=yaw([sgn*width,0,0],sample.heading);return {point:add(sample.position,off),heading:sample.heading};};
    const a=anchorAt(start);let world=a.point,lift=0,heading=a.heading;
    if(sec>end&&start<last){const next=anchorAt(start+cycle),u=clamp((sec-end)/(cycle-stance),0,1);world=mix(a.point,next.point,smooth(u));lift=(meta.kind==='slide'?.065:.12)*Math.sin(Math.PI*u)**2;heading=mix(a.heading,next.heading,smooth(u));}
    const clearance={brake:.007,basket_cut:.004,cut:.002,slide:.001}[meta.kind]||0;
    p.feet[side+'Foot']={sole:sub(add(world,[0,lift+clearance,0]),p.reference),yaw:(meta.kind==='cut'?p.yaw:heading)+sgn*.025,pitch:0};
  }
}
function pathPose(meta,t){
  const p=basePose(),D=meta.durationSeconds,path=pathFor(meta),sec=t*D,now=path(sec),kind=meta.kind;
  p.reference=now.position;p.yaw=now.heading;
  p.hips=[0,kind==='brake'?control(t,[[0,-.18],[.27,-.235],[.7,-.19],[1,-.085]]):kind==='slide'?-.25:-.145,0];
  if(kind==='brake')p.hips[1]+=.05*Math.sin(Math.PI*t)**2;
  const h=.008,prev=path(sec-h),next=path(sec+h),vx=(next.position[0]-prev.position[0])/(2*h),vz=(next.position[2]-prev.position[2])/(2*h);
  const ax=(next.position[0]-2*now.position[0]+prev.position[0])/(h*h),az=(next.position[2]-2*now.position[2]+prev.position[2])/(h*h);
  const forward=[Math.sin(now.heading),0,Math.cos(now.heading)],left=[Math.cos(now.heading),0,-Math.sin(now.heading)];
  p.lean=clamp((ax*forward[0]+az*forward[2])*.045,-.20,.20)+(kind==='brake'?.16*(1-ramp(t,0,.13)):.035);
  p.roll=-clamp((ax*left[0]+az*left[2])*.045,-.20,.20);p.twist=.04*Math.sin(TAU*sec/.65);p.headPitch=-.025;
  anchoredFeet(p,meta,t);
  if(meta.ball){
    if(kind==='brake') {
      if(t<.30)dribble(p,t/.30,{...meta,durationSeconds:D*.30},{cycles:1,top:.81});
      else {
        const start=[-.30,.81,.26],finish=atBody(p,[0,.29,.29]);
        p.ball=mix(start,finish,ramp(t,.30,.48));
        const normal=mix([0,1,0],[-1,0,-.12],ramp(t,.30,.48));
        p.hands.RightHand=contactHand(p.ball,normal,[0,.28,1]);
        const target=twoHands(p.ball,.12).LeftHand,waiting=freeHand(atBody(p,[.26,.23,.18]),[0,0,1],[0,-.8,.5]);
        p.hands.LeftHand=t<.42?{...freeHand(mix(waiting.position,target.position,ramp(t,.30,.42)),[1,0,0],[0,.28,1]),orientation:slerp(waiting.orientation,target.orientation,ramp(t,.30,.42))}:target;
        p.phase=t<.48?'gather':'held';
      }
    }else dribble(p,t,meta,{cycles:2,top:.81});
  }else if(kind==='slide'){
    p.hands.LeftHand=freeHand(atBody(p,[.35,.28,.18]),[0,.55,.84],[0,-.84,.55]);p.hands.RightHand=freeHand(atBody(p,[-.35,.28,.18]),[0,.55,.84],[0,-.84,.55]);p.phase='empty';p.ball=[0,.12,0];
  }else emptyHands(p,.13*Math.sin(TAU*sec/.65));
  return p;
}
function pivot(meta,t){
  const p=basePose(),s=sideSign(meta),a=s*1.72*ramp(t,.15,.82),plant=[s*.18,0,.035],hip=sub(plant,yaw([s*.18,0,.035],a));
  p.hips=[hip[0],-.105-.025*pulse(t,.05,.35,.9),hip[2]];p.yaw=a;p.lean=.07;p.twist=-s*.07*pulse(t,.05,.42,.9);p.headYaw=s*.1*pulse(t,.2,.5,1);
  const free=add(plant,yaw([-s*.36,0,-.07],a));free[1]=.07*Math.sin(Math.PI*ramp(t,.15,.82))**2;
  p.feet[s>0?'LeftFoot':'RightFoot']={sole:plant,yaw:a};p.feet[s>0?'RightFoot':'LeftFoot']={sole:free,yaw:a};
  carry(p,{side:-s*.04,height:.29,forward:.30});p.phase='held';return p;
}
/** Heel/toe recovery follows the actual solved shin rather than freezing the
 * shoe horizontally while the knee folds. The sole guide remains the plant
 * anchor; airborne feet naturally point through toe-off and swing recovery. */
function relaxAnkles(p,t){
  for(let iteration=0;iteration<2;iteration++){
    const fk=forwardKinematics(bakePose(p,t));
    for(const side of ['Left','Right']){
      const foot=side+'Foot',shank=sub(fk[side+'Leg'].position,fk[foot].position),forward=rotate(fk[foot].rotation,[0,0,1]);
      const angle=Math.asin(clamp(dot(shank,forward)/norm(shank),-1,1)),limit=61.5*Math.PI/180;
      p.feet[foot].pitch=(p.feet[foot].pitch||0)+Math.sign(angle)*Math.max(0,Math.abs(angle)-limit);
    }
  }
  return p;
}
export function pose(meta,t){
  const p=meta.kind==='idle'?idle(meta,t):meta.kind==='gait'?gait(meta,t):meta.kind==='pivot'?pivot(meta,t):pathPose(meta,t);
  return relaxAnkles(p,t);
}
const support=(effector,startTime,endTime,kind='plant')=>({effector,startTime,endTime,kind,localPointMeters:SOLE_POINT});
const contact=(effector,startTime,endTime)=>({effector,startTime,endTime,localPointMeters:HAND_CONTACT_POINT});
export function definitions(meta){
  const D=meta.durationSeconds,events=[],supportWindows=[],ballContactWindows=[],phases=[];
  if(meta.kind==='idle'){
    for(const side of ['Left','Right'])supportWindows.push(support(side+'Foot',0,1));
    if(meta.ball)for(const side of ['Left','Right'])ballContactWindows.push(contact(side+'Hand',0,1));
  } else if(meta.kind==='gait'){
    const duty=gaitDuty(meta);
    for(const [side,offset] of [['Left',0],['Right',.5]])for(let k=-1;k<=1;k++){
      const a=k-offset,b=a+duty;if(b>=0&&a<=1)supportWindows.push(support(side+'Foot',Math.max(0,a),Math.min(1,b)));
    }
  }else if(meta.kind==='pivot'){
    const plant=sideSign(meta)>0?'Left':'Right',free=plant==='Left'?'Right':'Left';
    supportWindows.push(support(plant+'Foot',0,1,'pivot'),support(free+'Foot',0,.15),support(free+'Foot',.82,1));
    for(const side of ['Left','Right'])ballContactWindows.push(contact(side+'Hand',0,1));
    events.push({time:.15,name:'pivot_start',domain:'presentation'},{time:.82,name:'right_plant',domain:'presentation'});
  }else{
    const {cycle,duty,stop}=stepSchedule(meta),stance=cycle*duty;
    for(const [side,phase] of [['Left',0],['Right',.5]]){
      const offset=phase*cycle,last=Number.isFinite(stop)?Math.floor((stop-.08-offset)/cycle)*cycle+offset:Infinity;
      for(let k=-2;k<=Math.ceil(D/cycle);k++){
        const a=k*cycle+offset;if(a>last+1e-8)continue;const b=a===last?D:a+stance;
        if(b>=0&&a<=D)supportWindows.push(support(side+'Foot',Math.max(0,a/D),Math.min(1,b/D),meta.kind==='cut'?'pivot':'plant'));
      }
    }
    if(meta.kind==='brake')events.push({time:.08,name:'brake_start',domain:'presentation'},{time:.30,name:'contact',domain:'presentation'},{time:.48,name:'secure',domain:'presentation'},{time:.78,name:'stop',domain:'presentation'});
    if(meta.kind==='cut')events.push({time:.28,name:'cut_plant',domain:'presentation'},{time:.7,name:'cut_exit',domain:'presentation'});
    if(meta.kind==='brake'&&meta.ball){ballContactWindows.push(contact('RightHand',.30,1),contact('LeftHand',.42,1));}
  }
  // Dribble windows are exact pressure/catch intervals, distinct from shot release.
  if(meta.ball&&!['idle','pivot'].includes(meta.kind)){
    const brake=meta.kind==='brake',end=brake?.30:1,cycles=meta.kind==='gait'?(meta.gait==='walk'?2:1):brake?1:2;
    const hand=sideSign(meta)>0?'LeftHand':'RightHand';
    for(let k=0;k<cycles;k++){
      const a=k/cycles*end,b=(k+.14)/cycles*end,c=(k+.86)/cycles*end,d=(k+1)/cycles*end;
      ballContactWindows.push(contact(hand,a,b),contact(hand,c,d));
      events.push({time:b,name:'release',domain:'presentation',dribble:true},{time:(k+.5)/cycles*end,name:'bounce',domain:'presentation'},{time:c,name:'contact',domain:'presentation'});
    }
  }
  return {events:events.sort((a,b)=>a.time-b.time),supportWindows:supportWindows.filter(w=>w.endTime-w.startTime>1e-5),ballContactWindows};
}
