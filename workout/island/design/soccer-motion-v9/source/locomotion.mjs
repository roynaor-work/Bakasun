/** Original procedural soccer locomotion. CC0-1.0; no source motion copied.
 * The foot is solved from its fixed ground anchor throughout each stance.
 * Travel is simulation guidance, separate from canonical native pose loops. */
import {pose,rotate,euler,add,sub,mul,mix,smooth,curve} from './rig.mjs';
const TAU=Math.PI*2, sole=[0,-.08,0], mod=x=>((x%1)+1)%1;
const bounded=(t,end)=>Math.max(0,Math.min(end,t));
const plant=(bone,start,end,anchor)=>({bone,start,end,anchor});
const event=(time,type,bone,local=sole)=>({time,type,bone,local});
const turn=(p,degrees)=>rotate(euler(0,degrees,0),p);
function cfg(c){return {duration:.8,speed:2.2,duty:.38,lift:.16,hip:.75,bob:.025,width:.12,arm:.18,handHeight:.26,toePitch:32,heading:0,axis:[0,0,1],...c};}
export function gaitTravel(t,configuration={}){const c=cfg(configuration);return mul(c.axis,c.speed*t);}
/** Left touchdown phase 0, right touchdown phase .5; one cycle = two steps. */
export function gaitSettings(t,configuration={}){
 const c=cfg(configuration),p=mod(t/c.duration),phase=TAU*p;
 const feet={};
 for(const [side,offset,sign] of [['left',0,1],['right',.5,-1]]){
  const q=mod(t/c.duration+offset),f=c.speed*c.duration*c.duty/2;
  let z,y=.08,pitch=0;
  if(q<=c.duty)z=f-c.speed*c.duration*q;
  else {const u=(q-c.duty)/(1-c.duty);const span=c.speed*c.duration*(1-c.duty),edge=Math.min(.12,.06/span),overshoot=.5*span*edge;if(u<edge)z=-f-span*(u-u*u/(2*edge));else if(u>1-edge){const v=1-u;z=f+span*(v-v*v/(2*edge));}else z=mix(-f-overshoot,f+overshoot,smooth((u-edge)/(1-2*edge)));y+=c.lift*Math.sin(Math.PI*u)**2;pitch=c.toePitch*Math.sin(Math.PI*u)**2;}
  feet[side+'Foot']=add(turn([sign*c.width,0,0],c.heading),add(mul(c.axis,z),[0,y,0]));
  feet[side+'FootYaw']=c.heading;feet[side+'FootPitch']=pitch;
 }
 const pelvis=5.2*Math.sin(phase),hip=c.hip-c.bob*Math.sin(2*phase),swing=c.arm*Math.cos(phase),handY=c.hip+c.handHeight;
 return {hips:turn([.008*Math.sin(phase),hip,0],c.heading),yaw:c.heading,hipYaw:c.heading+pelvis,twist:-pelvis*2.1,lean:c.lean??(c.speed>4?12:c.speed>2?7:3),roll:c.roll??0,
  leftHand:turn([.225,handY+.025*Math.sin(phase),.095-swing],c.heading),rightHand:turn([-.225,handY-.025*Math.sin(phase),.095+swing],c.heading),leftElbow:turn([.06,-.65,-1],c.heading),rightElbow:turn([-.06,-.65,-1],c.heading),...feet};
}
export function gaitSupports(configuration={},totalDuration=configuration.duration){
 const c=cfg(configuration),end=totalDuration??c.duration,result=[],f=c.speed*c.duration*c.duty/2;
 for(const [bone,offset,sign] of [['LeftFoot',0,1],['RightFoot',.5,-1]])for(let k=-1;k<=Math.ceil(end/c.duration)+1;k++){
  const td=(k-offset)*c.duration,start=Math.max(0,td),finish=Math.min(end,td+c.duration*c.duty);
  if(finish-start<1e-8)continue;
  const anchor=add(turn([sign*c.width,0,0],c.heading),mul(c.axis,c.speed*td+f));
  result.push(plant(bone,start,finish,anchor));
 }
 return result.sort((a,b)=>a.start-b.start||a.bone.localeCompare(b.bone));
}
export function makeGait(id,label,configuration={},extra={}){
 const c=cfg(configuration),duration=extra.duration??c.duration,supports=gaitSupports(c,duration);
 return {id,label,category:'free',role:'field',duration,loop:true,sample:t=>pose(gaitSettings(t,c)),travel:t=>gaitTravel(t,c),supports,events:supports.map(s=>event(s.start,'plant',s.bone)),
  notes:'Original analytic alternating gait; every stance has a world-fixed sole anchor. Pelvis and shoulders counter-rotate; compact bent elbows swing opposite the advancing thigh.',
  metricsTargets:{speed:c.speed,stepsPerSecond:2/c.duration,stepLength:c.speed*c.duration/2,stanceDuty:c.duty,heading:c.heading,...extra.metricsTargets},...extra};
}
const idle=(id,label,duration,sample,notes)=>({id,label,category:'free',role:'field',duration,loop:true,sample:t=>pose(sample(t/duration)),supports:[plant('LeftFoot',0,duration,[.13,0,.025]),plant('RightFoot',0,duration,[-.13,0,-.025])],events:[event(0,'plant','LeftFoot'),event(0,'plant','RightFoot')],notes,metricsTargets:{speed:0}});
const base={leftFoot:[.13,.08,.025],rightFoot:[-.13,.08,-.025]};
const idles=[
 idle('idle_relaxed','עמידה רגועה',2.4,u=>({...base,hips:[0,.785+.003*Math.sin(TAU*u),0],leftHand:[.205,.89,.065],rightHand:[-.21,.88,.075],lean:1.5,head:1.5*Math.sin(TAU*u)}),'Quiet breathing, slightly asymmetric low hands, relaxed knees and fixed feet.'),
 idle('idle_scan','עמידה וסריקה',3.2,u=>({...base,hips:[.009*Math.sin(TAU*u),.776+.004*Math.sin(TAU*u),0],hipYaw:3*Math.sin(TAU*u),twist:-2*Math.sin(TAU*u),headYaw:22*Math.sin(TAU*u),leftHand:[.22,.90,.105],rightHand:[-.20,.88,.085],lean:3}),'Eyes and head scan before the chest; arms stay alongside the torso and both soles remain planted.'),
 idle('idle_weight_shift','העברת משקל בעמידה',2.8,u=>({...base,hips:[.038*Math.sin(TAU*u),.763+.004*Math.sin(TAU*u*2),.006*Math.sin(TAU*u)],roll:-2*Math.sin(TAU*u),twist:3*Math.sin(TAU*u),leftHand:[.21,.87,.12],rightHand:[-.215,.88,.105],lean:2}),'Slow lateral transfer of body mass between feet, without replanting or a wide arm pose.')
];
const runConfig={duration:.6,speed:4.5,duty:2/9,lift:.20,hip:.748,bob:.028,arm:.215,lean:12};
const gaits=[
 makeGait('walk','הליכה',{duration:1.2,speed:1.0,duty:7/12,lift:.075,hip:.74,bob:.012,arm:.12,lean:3,toePitch:22}),
 makeGait('jog','ג׳וג',{duration:22/30,speed:2.6,duty:7/22,lift:.16,hip:.746,bob:.024,arm:.175,lean:7}),
 makeGait('run','ריצה',runConfig),
 makeGait('sprint','ספרינט',{duration:16/30,speed:7.2,duty:3/16,lift:.27,hip:.74,bob:.02,arm:.27,lean:18,toePitch:40}),
 makeGait('run_backward','ריצה אחורה',{duration:.8,speed:2.2,duty:1/3,lift:.13,hip:.748,bob:.021,arm:.15,axis:[0,0,-1],lean:-5}),
 makeGait('run_lateral','ריצה צידית',{duration:.8,speed:2.0,duty:.25,lift:.13,hip:.726,bob:.022,width:.205,arm:.12,axis:[1,0,0],lean:2,roll:-7,handHeight:.20})
];
/** World-space swing interpolation between explicit ground supports. */
function footTrack(t,windows,travel,start,end,lift=.16){
 const active=windows.find(w=>t>=w.start-1e-9&&t<=w.end+1e-9);if(active)return add(sub(active.anchor,travel(t)),[0,.08,0]);
 const prev=[...windows].reverse().find(w=>w.end<t),next=windows.find(w=>w.start>t);
 const a=prev?{time:prev.end,p:prev.anchor}:{time:0,p:start},b=next?{time:next.start,p:next.anchor}:{time:end.time,p:end.p};
 const u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1))),p=mix(a.p,b.p,smooth(u));p[1]=.08+lift*Math.sin(Math.PI*u)**2;return sub(p,travel(t));
}
function swingPitch(t,windows,end,maxPitch=34){if(windows.some(s=>t>=s.start&&t<=s.end))return 0;const a=[...windows].reverse().find(s=>s.end<t)?.end??0,b=windows.find(s=>s.start>t)?.start??end,u=Math.max(0,Math.min(1,(t-a)/(b-a||1)));return maxPitch*Math.sin(Math.PI*u);}
// Speed integrates a smooth deceleration after the first 80 ms, preserving the
// actual incoming run velocity and its exact first native pose/30-Hz interval.
const brakeDuration=1.2,brakeSlow=.75,brakeDelay=.08;
function brakeTravel(t){const v=4.5,tt=bounded(t,brakeDuration);if(tt<=brakeDelay)return [0,0,v*tt];const u=Math.min(1,(tt-brakeDelay)/brakeSlow);return [0,0,v*(brakeDelay+brakeSlow*(u-u**3+.5*u**4))];}
const bt=t=>brakeTravel(t)[2],brakeEnd=bt(brakeDuration);
const brakeSupports=[plant('LeftFoot',0,4/30,[.12,0,.30]),plant('RightFoot',4/30,9/30,[-.12,0,bt(4/30)+.36]),plant('LeftFoot',8/30,17/30,[.14,0,bt(8/30)+.30]),plant('RightFoot',16/30,brakeDuration,[-.14,0,bt(16/30)+.18]),plant('LeftFoot',24/30,brakeDuration,[.14,0,brakeEnd+.035])];
const brake={id:'run_brake',label:'בלימה מריצה',category:'free',role:'field',duration:brakeDuration,loop:false,travel:brakeTravel,supports:brakeSupports,events:brakeSupports.map(s=>event(s.start,'plant',s.bone)),
 sample:t=>{const incoming=gaitSettings(t,runConfig),p=t/brakeDuration,w=smooth((t-1/30)/.09),start=gaitSettings(0,runConfig),left=footTrack(t,brakeSupports.filter(s=>s.bone==='LeftFoot'),brakeTravel,[.12,0,.30],{time:brakeDuration,p:[.14,0,brakeEnd+.035]},.13),right=footTrack(t,brakeSupports.filter(s=>s.bone==='RightFoot'),brakeTravel,sub(start.rightFoot,[0,.08,0]),{time:brakeDuration,p:[-.14,0,bt(16/30)+.18]},.15);
  return pose({...incoming,hips:mix(incoming.hips,[0,curve([[0,.748],[.25,.688],[.55,.715],[1,.785]],p),-.018*Math.sin(Math.PI*p)],w),leftFoot:mix(incoming.leftFoot,left,w),rightFoot:mix(incoming.rightFoot,right,w),leftFootPitch:mix(incoming.leftFootPitch,swingPitch(t,brakeSupports.filter(s=>s.bone==='LeftFoot'),brakeDuration),w),rightFootPitch:mix(incoming.rightFootPitch,swingPitch(t,brakeSupports.filter(s=>s.bone==='RightFoot'),brakeDuration),w),leftHand:mix(incoming.leftHand,[.22,.94,.19],w),rightHand:mix(incoming.rightHand,[-.22,.94,.19],w),hipYaw:mix(incoming.hipYaw,0,w),twist:mix(incoming.twist,0,w),lean:mix(12,curve([[0,12],[.25,-9],[.65,-5],[1,2]],p),w)});},
 notes:'Exact run entry pose and first 30-Hz interval; rooted contact steps then shorten as speed falls. A lowered pelvis and rearward torso absorb deceleration before a quiet two-foot stop.',metricsTargets:{entryFrom:'run',entryPhase:0,entrySpeed:4.5,exitSpeed:0,speed:0,brakeTime:.83}}
;
// Turn-in-place lifts each foot rather than rotating a planted sole.
const turnDuration=1.6,turnTravel=()=>[0,0,0],turnYaw=t=>90*smooth(t/turnDuration);
const turnSupports=[{...plant('RightFoot',0,15/30,[-.13,0,-.025]),heading:0},{...plant('LeftFoot',0,5/30,[.13,0,.025]),heading:0},{...plant('LeftFoot',15/30,34/30,turn([.13,0,.025],55)),heading:55},{...plant('RightFoot',27/30,turnDuration,turn([-.13,0,-.025],90)),heading:90},{...plant('LeftFoot',42/30,turnDuration,turn([.13,0,.025],90)),heading:90}];
function turnFootHeading(t,bone){const windows=turnSupports.filter(s=>s.bone===bone),active=windows.find(s=>t>=s.start&&t<=s.end);if(active)return active.heading;const prev=[...windows].reverse().find(s=>s.end<t),next=windows.find(s=>s.start>t),a=prev?.end??0,b=next?.start??turnDuration;return mix(prev?.heading??0,next?.heading??90,smooth((t-a)/(b-a||1)));}
const pivot={id:'turn_in_place',label:'פנייה במקום',category:'free',role:'field',duration:turnDuration,loop:false,travel:turnTravel,supports:turnSupports,events:turnSupports.map(s=>event(s.start,'plant',s.bone)),sample:t=>{
 const u=t/turnDuration,yaw=turnYaw(t),lf=footTrack(t,turnSupports.filter(s=>s.bone==='LeftFoot'),turnTravel,[.13,0,.025],{time:turnDuration,p:turn([.13,0,.025],90)},.11),rf=footTrack(t,turnSupports.filter(s=>s.bone==='RightFoot'),turnTravel,[-.13,0,-.025],{time:turnDuration,p:turn([-.13,0,-.025],90)},.10);
 const leftHeading=turnFootHeading(t,'LeftFoot'),rightHeading=turnFootHeading(t,'RightFoot');
 return pose({hips:[.012*Math.sin(Math.PI*u),.758,0],yaw,hipYaw:yaw,twist:7*Math.sin(Math.PI*u),headYaw:9*Math.sin(Math.PI*u),leftFoot:lf,rightFoot:rf,leftFootYaw:leftHeading,rightFootYaw:rightHeading,leftKnee:turn([0,0,1],leftHeading),rightKnee:turn([0,0,1],rightHeading),leftFootPitch:swingPitch(t,turnSupports.filter(s=>s.bone==='LeftFoot'),turnDuration,20),rightFootPitch:swingPitch(t,turnSupports.filter(s=>s.bone==='RightFoot'),turnDuration,20),leftHand:turn([.22,.91,.12],yaw),rightHand:turn([-.22,.91,.12],yaw),lean:3});},notes:'A 90-degree change of facing through three lifted repositioning steps; head leads the pelvis and no planted foot spins.',metricsTargets:{turnDegrees:90}};
function freeAnkleFollow(p,t,supports){
 // An airborne foot follows the shin rather than insisting on a horizontal sole.
 // This changes only the ankle orientation; every leg target remains unchanged.
 for(const name of ['LeftFoot','RightFoot'])if(!supports.some(s=>s.bone===name&&t>=s.start&&t<=s.end)){const [x,y,z,w]=p.rotations[name],degrees=180/Math.PI,rx=Math.atan2(2*(x*w-y*z),1-2*(x*x+y*y))*degrees,ry=Math.asin(Math.max(-1,Math.min(1,2*(x*z+y*w))))*degrees,rz=Math.atan2(2*(z*w-x*y),1-2*(y*y+z*z))*degrees;p.rotations[name]=euler(Math.max(-65,Math.min(65,rx)),Math.max(-35,Math.min(35,ry)),Math.max(-35,Math.min(35,rz)));}
 return p;
}
function makeCut(degrees){
 const duration=1.4,angle=degrees*Math.PI/180,heading=t=>degrees*smooth((t-.30)/.62),speed=t=>curve([[0,1.8],[.24,1.6],[.45,.42],[.62,.75],[1,1.8]],t/duration);
 // Deterministic fine integration defines travel independently of the animation.
 const integration=420,positions=[[0,0,0]],dt=duration/integration;
 for(let i=1;i<=integration;i++){const t=(i-.5)*dt,h=heading(t)*Math.PI/180,v=speed(t);positions.push(add(positions.at(-1),[Math.sin(h)*v*dt,0,Math.cos(h)*v*dt]));}
 const travel=t=>{const x=bounded(t,duration)/dt,i=Math.min(integration-1,Math.floor(x));return mix(positions[i],positions[i+1],x-i);};
 const anchor=(t,side,z,yaw=heading(t))=>add(travel(t),turn([side*.145,0,z],yaw));
 const supports=[{...plant('RightFoot',0,.20,[-.145,0,.13]),heading:0},{...plant('LeftFoot',8/30,19/30,anchor(8/30,1,.20,degrees*.25)),heading:degrees*.25},{...plant('RightFoot',18/30,1.20,anchor(18/30,-1,.20,degrees*.75)),heading:degrees*.75},{...plant('LeftFoot',1.10,duration,anchor(1.10,1,.18)),heading:degrees}];
 const footYaw=(t,bone)=>{const windows=supports.filter(s=>s.bone===bone),active=windows.find(s=>t>=s.start&&t<=s.end);if(active)return active.heading;const prev=[...windows].reverse().find(s=>s.end<t),next=windows.find(s=>s.start>t);return mix(prev?.heading??0,next?.heading??degrees,smooth((t-(prev?.end??0))/((next?.start??duration)-(prev?.end??0))));};
 const acceleration=t=>{const delta=.001,a=Math.max(0,t-delta),b=Math.min(duration,t+delta),velocity=q=>{const h=heading(q)*Math.PI/180;return [Math.sin(h)*speed(q),0,Math.cos(h)*speed(q)];};return mul(sub(velocity(b),velocity(a)),1/(b-a||1));};
 return {id:`cut_${degrees}`,label:`חיתוך כיוון ${degrees}°`,category:'free',role:'field',duration,loop:false,travel,supports,events:supports.map(s=>event(s.start,'plant',s.bone)),sample:t=>{
  const u=t/duration,yaw=heading(t),lf=footTrack(t,supports.filter(s=>s.bone==='LeftFoot'),travel,[.145,0,-.16],{time:duration,p:anchor(1.10,1,.18)},.17),rf=footTrack(t,supports.filter(s=>s.bone==='RightFoot'),travel,[-.145,0,.13],{time:duration,p:anchor(duration,-1,.15)},.17),load=Math.sin(Math.PI*smooth((t-.14)/.98));
  const sideShift=.028*Math.sin(angle/2)*load,hip=[sideShift,.735-.06*load,0],arms=turn([.24,.935,.13],yaw),other=turn([-.24,.935,.17],yaw),a=turn(acceleration(t),-yaw),limit=x=>Math.max(-18,Math.min(18,x)),lean=limit(Math.atan2(a[2],9.81)*180/Math.PI),roll=limit(-Math.atan2(a[0],9.81)*180/Math.PI);
  return freeAnkleFollow(pose({hips:hip,yaw,hipYaw:yaw-6*load,twist:12*load,leftFoot:lf,rightFoot:rf,leftFootYaw:footYaw(t,'LeftFoot'),rightFootYaw:footYaw(t,'RightFoot'),leftKnee:turn([0,0,1],(yaw+footYaw(t,'LeftFoot'))/2),rightKnee:turn([0,0,1],(yaw+footYaw(t,'RightFoot'))/2),leftFootPitch:swingPitch(t,supports.filter(s=>s.bone==='LeftFoot'),duration,50),rightFootPitch:swingPitch(t,supports.filter(s=>s.bone==='RightFoot'),duration,50),leftHand:arms,rightHand:other,lean,roll,headYaw:8*load}),t,supports);},
  notes:`Original ${degrees}-degree cut: outside-foot approach, prolonged left plant, pelvis lowers and changes load before the exit step. The torso turns after head anticipation; the planted foot retains its heading.`,metricsTargets:{cutDegrees:degrees,entrySpeed:1.8,exitSpeed:1.8,minimumSpeed:.42,plantStart:8/30,plantEnd:19/30}};
}
export const definitions=[...idles,...gaits,brake,pivot,...[45,90,135,180].map(makeCut)];
