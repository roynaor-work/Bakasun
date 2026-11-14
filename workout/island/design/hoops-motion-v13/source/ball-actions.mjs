// SPDX-License-Identifier: CC0-1.0
// Original basketball ball actions, authored in metres/seconds on the existing canonical rig.
// Ball flight is an independent trajectory. IK follows its surface only at the declared hand contacts.
import {bones,I,pose,fk,solve,euler,qm,rotate,add,sub,mul,slerp} from '../../soccer-header-v1/source/rig.mjs';
import {configs,scenario,gait,idlePose,createLocomotion} from './locomotion.mjs';

const TAU=2*Math.PI,R=.12,PALM=[0,-.08,.025];
const clamp=x=>Math.max(0,Math.min(1,x));
const S=x=>(x=clamp(x),x*x*x*(10+x*(-15+6*x)));
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const mod=(a,b)=>((a%b)+b)%b;
const blendPose=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
const curve=(keys,t)=>{if(t<=keys[0][0])return [...keys[0][1]];for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],S((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return [...keys.at(-1)[1]];};
const noTravel=D=>({samples:[{time:0,position:[0,0,0],yawRadians:0},{time:D,position:[0,0,0],yawRadians:0}]});
const feet=D=>['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:D,local:[0,-.08,0]}));
function entry(id,label,D,sample,{loop=false,category='ball_action',supports=feet(D),events=[],ball,referenceTravel=noTravel(D),locomotion=false,speedMps=0,...metadata}={}){
 const frames=Array.from({length:Math.round(D*30)+1},(_,i)=>{const time=i/30,p=sample(time);return {time,hips:p.hips,rotations:p.rotations};});
 return {id,label,duration:D,durationSeconds:D,loop,nativeRate:30,frameCount:frames.length,category,locomotion,speedMps,rootMotion:false,symmetryMode:'structural',events,supports,referenceTravel,...metadata,frames,...(ball?{ball:{radius:R,samples:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:ball(i/120)}))}}:{})};
}
function plant(p){for(const [side,s] of [['Left',1],['Right',-1]])solve(p,side+'UpLeg',side+'Leg',side+'Foot',[s*.108,.08,0],[0,0,1],I);return p;}
function hand(p,side,surface,amount=1){
 const before=structuredClone(p.rotations),sign=side==='Left'?1:-1;
 const solved=solve(p,side+'Arm',side+'ForeArm',side+'Hand',sub(surface,PALM),[sign*.16,-.55,-.6],I);
 if(amount<1)for(const name of [side+'Arm',side+'ForeArm',side+'Hand'])p.rotations[name]=slerp(before[name],p.rotations[name],amount);
 return solved.error;
}
function standing(t,{lower=.035,twist=0,lean=4}={}){
 const p=idlePose(0),u=.5-.5*Math.cos(TAU*t/.8);
 p.hips[0]=.003*Math.sin(TAU*t/.8);
 p.hips[1]-=lower+.008*u;
 p.rotations.Hips=euler(lean*.45,twist*.3,0);p.rotations.Spine=euler(lean*.3,twist*.3,0);p.rotations.Chest=euler(lean*.25,twist*.4,0);
 return plant(p);
}
function dribbleHeight(t,T,h){const u=mod(t,T)/T;return R+(h-R)*(u<=.5?1-4*u*u:1-4*(1-u)*(1-u));}

export function createBallActions(){
 const clips=[];
 const run=createLocomotion().find(c=>c.id==='run');
 for(const [id,label] of [['dribble_stand','כדרור בעמידה'],['dribble_run','כדרור בריצה'],['dribble_cross','כדרור מוצלב'],['dribble_behind','כדרור מאחורי הגב'],['dribble_spin','כדרור בסיבוב'],['dribble_low','כדרור נמוך']]){
  const moving=id==='dribble_run',spin=id==='dribble_spin',cross=/cross|behind/.test(id),low=id==='dribble_low';
  const T=moving?run.durationSeconds:.8,D=moving?T:1.6,h=low?.55:.92;
  const c={...configs.jog,period:T,duty:.48,speed:.35,lift:.13,hip:.75,lean:6,phase:0};
  const travel=spin?scenario(c,D,TAU):null;
  const ball=t=>{
   const u=t/T,x=cross?-.29*Math.cos(Math.PI*u):-.29+.018*Math.sin(TAU*u);
   const z=id==='dribble_behind'?.26*Math.cos(TAU*u):.29+.025*Math.sin(TAU*u);
   return [x,dribbleHeight(t,T,h),z];
  };
  const sample=t=>{
   let p;
   if(moving){const f=run.frames[Math.min(run.frames.length-1,Math.round(t*30))];p={hips:[...f.hips],rotations:structuredClone(f.rotations)};}
   else if(spin)p=gait(c,travel,t,{angle:TAU,duration:D});
   else p=standing(t,{lower:low?.13:.045,twist:cross?10*Math.sin(Math.PI*t/T):3*Math.sin(TAU*t/T),lean:low?12:5});
   const center=ball(t),softFloor=low?.72:.91,raw=center[1]+R+.08;
   const wristY=.5*(raw+softFloor+Math.sqrt((raw-softFloor)**2+.000001));
   const surface=[center[0],wristY-.08,center[2]];
   if(cross){
    const right=.5+.5*Math.cos(Math.PI*t/T),left=1-right;
    hand(p,'Right',surface,right);hand(p,'Left',surface,left);
   }else hand(p,'Right',surface);
   if(!moving&&!spin){p.rotations.Head=euler(-3+.8*Math.sin(TAU*t/T),-4*Math.sin(Math.PI*t/T),0);}
   return p;
  };
  const events=[];
  for(let k=0;k<=Math.round(D/T);k++){
   const t=k*T;if(t>D+1e-8)continue;
   events.push({type:'contact',time:t,bone:cross&&k%2?'LeftHand':'RightHand',local:PALM});
   if(t+T/2<D)events.push({type:'bounce',time:t+T/2,position:ball(t+T/2),surface:'floor',ballRadiusMeters:R});
  }
  let supports=feet(D),referenceTravel=noTravel(D);
  if(moving){supports=structuredClone(run.supports);referenceTravel=structuredClone(run.referenceTravel);}
  if(spin){
   supports=[];
   for(const [side,shift]of[['Left',0],['Right',.5]])for(let k=-1;k<4;k++){
    const a=Math.max(0,(k-shift)*T),b=Math.min(D,(k-shift+c.duty)*T);
    if(b-a>.025)supports.push({bone:side+'Foot',start:a,end:b,local:[0,-.08,0]});
   }
   referenceTravel={samples:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:travel.position(i/120),yawRadians:travel.yaw(i/120)}))};
  }
  clips.push(entry(id,label,D,sample,{loop:!spin,category:'dribble',events,ball,supports,referenceTravel,locomotion:moving,speedMps:moving?run.speedMps:0,
   gameplay:'Ballistic bounce, hand push/reception, opposite free arm; root heading belongs to the consumer.',
   handContactConvention:'PALM [0,-0.08,0.025], regulated sphere radius 0.12 m; apex events measured from independent ball trajectory.'}));
 }

 // Passes contain neutral handles and a visible gather, extension, release and recovery.
 // The receiver endpoint is a declared demonstration target, outside this actor's rig.
 for(const [id,label]of[['pass_chest','מסירה מהחזה'],['pass_bounce','מסירת הקפצה'],['pass_overhead','מסירה מעל הראש'],['pass_behind','מסירה מאחורי הגב']]){
  const behind=id==='pass_behind',overhead=id==='pass_overhead',bounce=id==='pass_bounce';
  const D=2.8,release=1.2,flight=.6;
  const start=[-.19,.94,.20],gather=behind?[-.20,1.0,-.17]:overhead?[0,1.50,.14]:[0,1.03,.27];
  const atRelease=behind?[.07,1.0,-.26]:overhead?[0,1.53,.29]:[0,1.10,.43];
  const destination=behind?[2.6,1.0,-1.0]:[0,1.10,3.2],bounceTime=release+.3;
  const ball=t=>{
   if(t<=release)return curve([[0,start],[.35,start],...(behind?[[.55,[-.36,.92,0]]]:[]),[.80,gather],[release,atRelease]],t);
   const u=clamp((t-release)/flight);
   if(bounce){
    const phase=(t-release)/(flight/2),x=0,z=atRelease[2]+(destination[2]-atRelease[2])*u;
    const dt=flight/2,g=9.81;
    let y;
    if(phase<=1){const q=(t-release),v=(R-atRelease[1]+.5*g*dt*dt)/dt;y=atRelease[1]+v*q-.5*g*q*q;}
    else{const q=Math.min(dt,t-release-dt),v=(destination[1]-R+.5*g*dt*dt)/dt;y=R+v*q-.5*g*q*q;}
    return [x,y,z];
   }
   const p=mix(atRelease,destination,u);p[1]+=.22*4*u*(1-u);return p;
  };
  const sample=t=>{
   const activation=S((t-.15)/.4)*(1-S((t-1.55)/.8));
   const p=idlePose(0);p.hips[1]-=.035*activation;
   p.rotations.Hips=slerp(p.rotations.Hips,euler(behind?2:4,behind?14:0,0),activation);
   p.rotations.Spine=slerp(p.rotations.Spine,euler(4,behind?16:0,0),activation);
   p.rotations.Chest=slerp(p.rotations.Chest,euler(3,behind?20:0,0),activation);
   plant(p);
   const contact=ball(Math.min(t,release));
   const recovery=1-S((t-release)/.85),engage=S((t-.15)/.4)*recovery;
   if(behind){hand(p,'Right',add(contact,[0,0,R]),engage);p.rotations.LeftArm=slerp(p.rotations.LeftArm,euler(-20,10,12),activation);}
   else for(const [side,sign]of[['Left',1],['Right',-1]])hand(p,side,add(contact,[sign*R,0,0]),engage);
   p.rotations.Head=euler(-5*activation,behind?20*activation:0,0);
   return p;
  };
  const events=[{type:'release',time:release,bone:'RightHand',local:PALM}];
  if(!behind)events.push({type:'contact',time:release,bone:'LeftHand',local:PALM});
  if(bounce)events.push({type:'bounce',time:bounceTime,position:ball(bounceTime),surface:'floor',ballRadiusMeters:R});
  clips.push(entry(id,label,D,sample,{category:'pass',events,ball,coreRange:{start:.35,end:1.9},neutralHandles:{entry:[0,.15],exit:[2.35,D]},receiver:{position:destination,arrivalTime:release+flight},ballContacts:(behind?['RightHand']:['LeftHand','RightHand']).map(bone=>({bone,start:.8,end:release,local:PALM}))}));
 }

 for(const [id,label]of[['celebrate_short','חגיגה קצרה'],['disappointed','תגובה לאכזבה']]){
  const D=3.2,celebrate=id==='celebrate_short';
  const sample=t=>{
   const a=S((t-.35)/.65)*(1-S((t-2.1)/.7)),p=idlePose(0);
   p.hips[0]=.014*Math.sin(TAU*(t-.35)/1.1)*a;p.hips[1]+=(celebrate?-.015:-.08)*a;
   p.rotations.Hips=slerp(p.rotations.Hips,euler(celebrate?0:4,5*Math.sin(TAU*t/1.4),0),a);
   p.rotations.Spine=slerp(p.rotations.Spine,euler(celebrate?-7:12,celebrate?6*Math.sin(TAU*t/1.4):0,0),a);
   p.rotations.Chest=slerp(p.rotations.Chest,euler(celebrate?-5:7,0,0),a);
   p.rotations.Head=euler(celebrate?-10*a:24*a,celebrate?9*a*Math.sin(TAU*t/1.4):-10*a,0);
   for(const[side,sign]of[['Left',1],['Right',-1]]){
    const qArm=celebrate?euler(-145+sign*9*Math.sin(TAU*t/1.2),0,sign*18):euler(9,0,sign*7);
    const qFore=celebrate?euler(-82):euler(-22);
    p.rotations[side+'Arm']=slerp(p.rotations[side+'Arm'],qArm,a);p.rotations[side+'ForeArm']=slerp(p.rotations[side+'ForeArm'],qFore,a);
   }
   return plant(p);
  };
  clips.push(entry(id,label,D,sample,{category:'reaction',coreRange:{start:.35,end:2.8},neutralHandles:{entry:[0,.35],exit:[2.8,D]}}));
 }
 return clips;
}
