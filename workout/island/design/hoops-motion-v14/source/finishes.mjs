// SPDX-License-Identifier: CC0-1.0
// Finishing, aerial defence and sprint steals on the canonical eighteen bones.
// v13 supplies the immutable loaded steps, planting and shooting choreography;
// this revision authors handed finishes, two-hand rim grips and a reverse turn.
import {createShotActions} from '../../hoops-motion-v13/source/shot-actions.mjs';
import {configs,gait,scenario} from '../../hoops-motion-v13/source/locomotion.mjs';
import {bones,I,point,fk,solve,euler,qm,rotate,add,sub,mul,slerp,mix} from '../../soccer-header-v1/source/rig.mjs';

const R=.12,PALM=[0,-.08,.025],SOLE=[0,-.08,0],RIM_Y=3.05,RIM_R=.225;
const S=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const lerp=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const yaw=(p,a)=>rotate(euler(0,a*180/Math.PI),p);
const travelAt=(c,t)=>track(c.referenceTravel.samples,t);
function track(keys,t){
 if(t<=keys[0].time)return structuredClone(keys[0]);
 for(let i=1;i<keys.length;i++)if(t<=keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time);return {time:t,position:lerp(a.position,b.position,u),yawRadians:(a.yawRadians??0)+((b.yawRadians??0)-(a.yawRadians??0))*u};}
 return structuredClone(keys.at(-1));
}
function sample(c,t){
 const f=Math.max(0,Math.min(c.frames.length-1,t*30)),i=Math.floor(f),a=c.frames[i],b=c.frames[Math.min(c.frames.length-1,i+1)],u=f-i;
 return {hips:lerp(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))};
}
const flight=(t,a,b,h)=>t<a||t>b?0:4*h*((t-a)/(b-a))*(1-(t-a)/(b-a));
function resample(c,fn){c.frames=Array.from({length:Math.round(c.duration*30)+1},(_,i)=>({time:i/30,...fn(i/30)}));c.frameCount=c.frames.length;return c;}
function ballTrack(c,fn){c.ball={radius:R,samples:Array.from({length:Math.round(c.duration*120)+1},(_,i)=>({time:i/120,position:fn(i/120)}))};}
function projectile(p,v,dt){
 let q=[...p],w=[...v],left=Math.max(0,dt);
 while(left>1e-9){const hit=(w[1]+Math.sqrt(w[1]*w[1]+19.62*Math.max(0,q[1]-R)))/9.81,h=Math.min(left,hit>1e-8?hit:left);q=add(q,mul(w,h));q[1]-=4.905*h*h;w[1]-=9.81*h;left-=h;if(left>1e-9){q[1]=R;w[1]=Math.abs(w[1])*.62;w[0]*=.8;w[2]*=.8;}}
 q[1]=Math.max(R,q[1]);return q;
}
function world(c,local,t){const a=travelAt(c,t);return add(yaw(local,a.yawRadians??0),a.position);}
function local(c,world,t){const a=travelAt(c,t);return yaw(sub(world,a.position),-(a.yawRadians??0));}
function annotate(c){
 for(const e of c.events??[]){const t=e.time??e.timeSeconds??0;
  if(e.bone){const p=world(c,point(sample(c,t),e.bone,e.local??PALM),t);e.heightMeters=p[1];e.positionMeters=p;e.coordinateSpace='world';if(c.ball)e.ballCenterHeightMeters=world(c,track(c.ball.samples,t).position,t)[1];}
  else if(e.position){e.heightMeters=e.position[1];e.positionMeters=[...e.position];e.coordinateSpace=e.coordinateSpace??'world';}
 }
 c.nativeRate=30;c.rootMotion=false;c.symmetryMode='structural';c.license='CC0-1.0';
 c.entry={reference:'idle',phase:0,blendSeconds:.35,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'};
 c.exit={reference:'idle',phase:0,blendSeconds:.45,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'};
 return c;
}
function crossing(center,v,height,descending=true){const disc=v[1]*v[1]-19.62*(height-center[1]);if(disc<0)throw Error('Ball never reaches rim height');return (v[1]+(descending?1:-1)*Math.sqrt(disc))/9.81;}
function rimAt(c,t,center){
 const p=world(c,center,t);c.rim={center:[p[0],RIM_Y,p[2]],radius:RIM_R,coordinateSpace:'world',heightMeters:RIM_Y};
 c.actionGeometry={...c.actionGeometry,rimCenterMeters:[...c.rim.center],rimHeightMeters:RIM_Y};
 c.events.push({type:'rim_crossing',time:t,position:[...c.rim.center],heightMeters:RIM_Y,surface:'rim-plane',coordinateSpace:'world',clearanceRadiusMeters:RIM_R-R});
}
function layup(source){
 const c=structuredClone(source);c.id='layup_right';c.label='לייאפ מימין';c.kind=c.id;c.category='shot';
 const a=1.4,b=2.4,release=1.8,extra=.34,v=[0,4.1,2.0];
 const center=add(track(source.ball.samples,release).position,[0,flight(release,a,b,extra),0]);
 resample(c,t=>{const p=sample(source,t);p.hips[1]+=flight(t,a,b,extra);return p;});
 ballTrack(c,t=>t<=release?add(track(source.ball.samples,t).position,[0,flight(t,a,b,extra),0]):projectile(center,v,t-release));
 c.phases=[{name:'approach',start:0,end:a},{name:'jump',start:a,end:release},{name:'finish',start:release,end:b},{name:'recovery',start:b,end:c.duration}];
 c.actionGeometry={...c.actionGeometry,jumpHeightMeters:.70,releaseBallCenterMeters:center,releasePalmPointMeters:sub(center,[0,R,0]),ballisticVelocityMetersPerSecond:v,shootingHand:'RightHand',takeoffFoot:'LeftFoot'};
 const cross=release+crossing(center,v,RIM_Y);rimAt(c,cross,projectile(center,v,cross-release));
 c.notes='Right-handed approach gather, left-foot push and asymmetric knee drive; higher finish calibrated to pass through the 3.05 m rim plane on descent, followed by a supported two-foot landing.';
 return annotate(c);
}
function mirror(c){
 const out=structuredClone(c),side=n=>n.startsWith('Left')?'Right'+n.slice(4):n.startsWith('Right')?'Left'+n.slice(5):n,m=p=>[-p[0],p[1],p[2]];
 out.id='layup_left';out.label='לייאפ משמאל';out.kind=out.id;
 for(const f of out.frames){f.hips=m(f.hips);const before=f.rotations;f.rotations=Object.fromEntries(bones.map(({name})=>{const q=before[side(name)];return [name,[q[0],-q[1],-q[2],q[3]]];}));}
 for(const s of out.supports){s.bone=side(s.bone);if(s.local)s.local=m(s.local);if(s.anchor)s.anchor=m(s.anchor);}
 for(const e of out.events){if(e.bone)e.bone=side(e.bone);if(e.bones)e.bones=e.bones.map(side);for(const k of ['local','position','positionMeters'])if(e[k])e[k]=m(e[k]);}
 for(const s of out.ball.samples)s.position=m(s.position);
 for(const s of out.referenceTravel.samples){s.position=m(s.position);s.yawRadians=-(s.yawRadians??0);}
 out.rim.center=m(out.rim.center);
 for(const k of ['releaseBallCenterMeters','releasePalmPointMeters','travelEndMeters','ballisticVelocityMetersPerSecond','rimCenterMeters'])if(out.actionGeometry[k])out.actionGeometry[k]=m(out.actionGeometry[k]);
 out.actionGeometry.shootingHand='LeftHand';out.actionGeometry.takeoffFoot='RightFoot';out.notes='Exact anatomical mirror of the right layup: left shooting palm, right-foot takeoff, reflected body twist, ball and rim. All world support anchors and event probes are mirrored together.';
 return annotate(out);
}
function dunk(source,reverse){
 const c=structuredClone(source),release=2,D=c.duration,turn=t=>reverse?Math.PI*S((t-1.4)/.5):0;
 c.id=reverse?'dunk_reverse':'dunk_two_hand';c.label=reverse?'הטבעה אחורית':'הטבעה בשתי ידיים';c.kind=c.id;c.category='shot';
 // The sphere descends through an actual fixed hoop; actor yaw is applied once.
 const center=track(source.ball.samples,release).position.map((v,i)=>i===0?0:v),v=[0,-2,1.2],cross=release+crossing(center,v,RIM_Y);
 const baseBall=t=>t<=release?track(source.ball.samples,t).position.map((v,i)=>i===0?0:v):projectile(center,v,t-release);
 c.referenceTravel.samples=c.referenceTravel.samples.map(s=>({...s,yawRadians:turn(s.time)}));
 ballTrack(c,t=>yaw(baseBall(t),-turn(t)));
 rimAt(c,cross,yaw(baseBall(cross),-turn(cross)));
 const rim=c.rim.center,gripStart=2.10,gripEnd=2.14;
 const q=euler(180),offset=rotate(q,PALM);
 resample(c,t=>{
  const p=sample(source,t),before=structuredClone(p.rotations),a=turn(t),activation=Math.min(S(t/.35),S((D-t)/.45));
  if(reverse){const arch=S((t-1.35)/.4)*(1-S((t-2.35)/.35));p.rotations.Chest=qm(p.rotations.Chest,euler(-8*arch));p.rotations.Head=qm(p.rotations.Head,euler(-18*arch));}
  for(const [side,sign]of [['Left',1],['Right',-1]]){
   const original=point(sample(source,t),side+'Hand',PALM);
   let surface;
   if(!reverse){const ball=baseBall(Math.min(t,release));surface=add(ball,[sign*.08,-Math.sqrt(R*R-.08*.08),0]);}
   else if(side==='Right'){const ball=yaw(baseBall(Math.min(t,release)),-a);surface=sub(ball,[0,R,0]);}
   else surface=original;
   const gripWorld=[rim[0]+(reverse?-sign:sign)*RIM_R,RIM_Y,rim[2]],grip=local(c,gripWorld,t);
   const reach=S((t-release)/.1)*(1-S((t-gripEnd)/.20));
   if(!reverse||side==='Right')surface=lerp(surface,grip,reach);
   const recover=S((t-2.35)/.5);surface=lerp(surface,original,recover);
   solve(p,side+'Arm',side+'ForeArm',side+'Hand',sub(surface,offset),[sign*.7,-.05,-.3],q);
   for(const n of [side+'Arm',side+'ForeArm',side+'Hand'])p.rotations[n]=slerp(before[n],p.rotations[n],activation);
  }
  return p;
 });
 c.events=c.events.filter(e=>e.type!=='release');
 c.events.push({type:'release',time:release,bone:'RightHand',local:PALM});
 if(!reverse)c.events.push({type:'contact',time:release,bone:'LeftHand',local:PALM});
 for(const side of reverse?['Right']:['Left','Right'])c.events.push({type:'rim_contact',time:gripStart,bone:side+'Hand',local:PALM,surface:'rim',targetHeightMeters:RIM_Y,ringRadiusMeters:RIM_R});
 if(reverse){
  for(const s of c.supports)if(s.start>=2.6-1e-8&&s.anchor)s.anchor=[-s.anchor[0],s.anchor[1],s.anchor[2]];
 }
 c.phases=[{name:'approach',start:0,end:1.4},{name:reverse?'reverse-turn':'two-hand-lift',start:1.4,end:release},{name:'dunk-and-rim-grip',start:release,end:2.14},{name:'landing',start:2.14,end:2.6},{name:'recovery',start:2.6,end:D}];
 const releasePalm=point(sample(c,release),'RightHand',PALM);
 c.actionGeometry={...c.actionGeometry,releaseBallCenterMeters:yaw(center,-turn(release)),releasePalmPointMeters:releasePalm,palmClearanceAtReleaseMeters:releasePalm[1]-RIM_Y,ballisticVelocityMetersPerSecond:yaw(v,-turn(release)),ballisticCoordinateSpace:'actor local at release',shootingHands:reverse?['RightHand']:['LeftHand','RightHand'],finishFacingYawRadians:turn(release),rimCenterMeters:[...rim],rimHeightMeters:RIM_Y,rimGripTimeSeconds:gripStart};
 c.notes=reverse?'Airborne 180-degree reverse finish: simulation heading turns after takeoff, right palm controls the sphere behind the facing direction, one hand meets the regulation rim, and the actor lands facing back. Local leg poses and yawed landing anchors remain coherent.':'Two-handed gather and finish with both palms on the lower sphere surface, a measured two-hand rim grip at 3.05 m and two-foot landing absorption.';
 return annotate(c);
}
function block(source,reach){
 const c=structuredClone(source),a=1.4,b=2.4,contact=1.9;
 c.id=reach?'block_reach':'block_jump';c.label=reach?'חסימה בשלוחת יד':'חסימה בקפיצה';c.kind=c.id;c.category='block';
 if(reach){
  resample(c,t=>{const p=sample(source,t),activation=S((t-.35)/.45)*(1-S((t-2.4)/.9));p.hips[1]-=flight(t,a,b,.42);
   for(const[side,sign]of[['Left',1],['Right',-1]])solve(p,side+'UpLeg',side+'Leg',side+'Foot',[sign*.108,.08,0],[0,0,1],I);
   const old=structuredClone(p.rotations);solve(p,'LeftArm','LeftForeArm','LeftHand',[.26,p.hips[1]+.30,.23],[.6,-.3,-.3],euler(-70));
   for(const name of ['LeftArm','LeftForeArm','LeftHand'])p.rotations[name]=slerp(old[name],p.rotations[name],activation);return p;});
  c.supports=['Left','Right'].map((side,i)=>({bone:side+'Foot',start:0,end:c.duration,local:SOLE,anchor:[i?-.108:.108,0,0]}));
  c.events=c.events.filter(e=>!['takeoff','land'].includes(e.type));
 }
 const palm=point(sample(c,contact),'RightHand',PALM),center=add(palm,[0,0,R]),v=[-1.5,1,-2.1];
 ballTrack(c,t=>t<=contact?add(center,mul([.1,-.6,-2],t-contact)):projectile(center,v,t-contact));
 c.actionGeometry={...c.actionGeometry,releasePalmPointMeters:palm,releaseBallCenterMeters:center,jumpHeightMeters:reach?0:.42,contactHeightMeters:palm[1],blockHand:'RightHand'};
 c.phases=[{name:'load',start:0,end:1.4},{name:reach?'extend':'jump',start:1.4,end:contact},{name:'deflect',start:contact,end:2.4},{name:'recover',start:2.4,end:c.duration}];
 c.notes=reach?'Grounded reach contest: right arm extends to an incoming ball while the opposite arm balances lower at chest height. Both soles remain fixed through the whole clip.':'Vertical block with leg loading, a two-arm jump contest, independent incoming sphere, timed right-palm deflection and supported two-foot landing.';
 return annotate(c);
}
function sprintSteal(){
 const c={...configs.sprint},D=8/3,contact=1.5,travel=scenario(c,D),samplePose=t=>{
  const p=gait(c,travel,t),a=S((t-.85)/.45)*(1-S((t-1.62)/.42));
  const old=structuredClone(p.rotations);p.rotations.Chest=qm(p.rotations.Chest,euler(3*a,-8*a));
  const target=[-.28,p.hips[1]+.12,.52];solve(p,'RightArm','RightForeArm','RightHand',target,[-.45,-.5,-.6],euler(-65,0,-10));
  for(const n of ['RightArm','RightForeArm','RightHand'])p.rotations[n]=slerp(old[n],p.rotations[n],a);
  return p;
 };
 const clip={id:'steal_sprint',label:'גנבה בשיא ריצה',kind:'steal_sprint',category:'steal',role:'field',duration:D,durationSeconds:D,frameCount:81,nativeRate:30,loop:false,rootMotion:false,locomotion:true,speedMps:c.speed,symmetryMode:'structural',events:[{type:'contact',time:contact,bone:'RightHand',local:PALM},{type:'sprint_peak',time:contact,speedMetersPerSecond:c.speed,flightPhase:true}],supports:[],referenceTravel:{coordinateSpace:'simulation-owned demonstration world; never embedded Root translation',samples:Array.from({length:321},(_,i)=>({time:i/120,position:travel.position(i/120),yawRadians:0}))},frames:[],coreRange:{start:0,end:D},actionGeometry:{contactTimeSeconds:contact,sprintSpeedMetersPerSecond:c.speed,locomotionPeriodSeconds:c.period,reachHand:'RightHand'},notes:'Four complete maximum-speed sprint cycles. A brief right-palm poke occurs during an airborne recovery interval at 3.2 m/s; the opposite arm keeps counterbalance and the sprint resumes without a pause.'};
 resample(clip,samplePose);
 for(const[side,shift]of[['Left',c.phase],['Right',.5+c.phase]])for(let k=-2;k<7;k++){const a=(k-shift)*c.period,b=a+c.duty*c.period,start=Math.max(0,a),end=Math.min(D,b);if(end-start>.025){clip.supports.push({bone:side+'Foot',start,end,local:SOLE});if(a>=0&&a<D)clip.events.push({type:'footstrike',time:a,bone:side+'Foot',local:SOLE});}}
 const palm=point(samplePose(contact),'RightHand',PALM),center=add(palm,[0,0,R]),v=[2.1,-.25,.7];
 ballTrack(clip,t=>t<=contact?add(center,mul([.2,-.2,-.65],t-contact)):projectile(center,v,t-contact));
 clip.actionGeometry.contactPalmMeters=palm;clip.actionGeometry.contactBallCenterMeters=center;
 return annotate(clip);
}
export function createFinishes(){
 const byId=Object.fromEntries(createShotActions().map(c=>[c.id,c])),right=layup(byId.layup),fade=structuredClone(byId.fadeaway);
 fade.label='זריקה בנפילה אחורה';fade.phases=[{name:'load',start:0,end:1.4},{name:'backward-flight',start:1.4,end:1.8},{name:'release',start:1.8,end:2.4},{name:'landing-recovery',start:2.4,end:4.2}];
 return [right,mirror(right),dunk(byId.dunk,false),dunk(byId.dunk,true),block(byId.block,false),block(byId.block,true),sprintSteal(),annotate(fade)];
}
