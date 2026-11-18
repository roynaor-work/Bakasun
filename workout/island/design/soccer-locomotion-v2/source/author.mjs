// SPDX-License-Identifier: CC0-1.0
// Original trajectory-first soccer locomotion. Metres, seconds, +Y up, +Z forward.
// Actor travel is evidence/consumer metadata, never a Root animation track.
import fs from 'node:fs/promises';
import {bones,I,pose,fk,solve,euler,qm,rotate,add,sub,mul,slerp} from '../../soccer-header-v1/source/rig.mjs';

const base=new URL('../',import.meta.url),tau=2*Math.PI;
const S=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const mod=(a,b)=>((a%b)+b)%b;
const yawRotate=(a,y)=>rotate(euler(0,y*180/Math.PI,0),a);
function hermite(a,av,b,bv,u,span){return a.map((v,i)=>(2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*span*av[i]+(-2*u**3+3*u*u)*b[i]+(u**3-u*u)*span*bv[i]);}
const configs={
 walk:{period:32/30,duty:.60,speed:1.0,lift:.105,hip:.755,bob:.008,lean:2,swing:27,elbow:92},
 jog:{period:26/30,duty:.46,speed:1.65,lift:.19,hip:.745,bob:.016,lean:5,swing:35,elbow:90},
 run:{period:22/30,duty:.40,speed:2.2,lift:.25,hip:.745,bob:.018,lean:9,swing:42,elbow:90,phase:4/22},
 sprint:{period:20/30,duty:.32,speed:3.2,lift:.27,hip:.745,bob:.022,lean:13,swing:46,elbow:90,phase:3/20},
};
function scenario(c,duration,angle=0,direction=[0,0,1]){
 const yaw=t=>{const u=Math.max(0,Math.min(1,t/duration)),r=.12;
  return angle*(u<r?u*u/(2*r*(1-r)):u>1-r?1-(1-u)**2/(2*r*(1-r)):(u-r/2)/(1-r));};
 // Dense deterministic quadrature: the path is independent of skeletal samples.
 const step=1/1200,n=Math.ceil(duration/step),dt=duration/n,points=[[0,0,0]];
 for(let i=0;i<n;i++){const v=yawRotate(mul(direction,c.speed),yaw((i+.5)*dt));points.push(add(points.at(-1),mul(v,dt)));}
 const position=t=>{
  if(t<0)return mul(yawRotate(direction,yaw(0)),t*c.speed);
  if(t>duration)return add(points.at(-1),mul(yawRotate(direction,yaw(duration)),(t-duration)*c.speed));
  const f=t/dt,i=Math.min(n-1,Math.floor(f));return mix(points[i],points[i+1],Math.min(1,f-i));
 };
 return {position,yaw};
}
function targets(c,travel,t,side,direction=[0,0,1]){
 const shift=(side==='Left'?0:.5)+(c.phase??0),sign=side==='Left'?1:-1;
 const phase=t/c.period+shift,cycle=Math.floor(phase),start=(cycle-shift)*c.period;
 const stance=c.period*c.duty,stride=c.speed*stance;
 const touchdown=s=>add(travel.position(s),yawRotate(add([sign*(c.width??.108),.084,0],mul(direction,stride/2)),travel.yaw(s)));
 let world;
 if(t-start<=stance+1e-9)world=touchdown(start);
 else{
  const a=start+stance,b=start+c.period,u=(t-a)/(b-a);
  world=mix(touchdown(start),touchdown(b),S(u));
  // Zero velocity at strike/toe-off. Heel recovery peaks before swing midpoint.
  world[1]=.084+c.lift*Math.sin(Math.PI*u)**2;
 }
 return yawRotate(sub(world,travel.position(t)),-travel.yaw(t));
}
function arms(p,c,t,{balance=0,idle=false}={}){
 const phase=tau*(t/c.period+(c.phase??0));
 for(const [side,sign] of [['Left',1],['Right',-1]]){
  // Left leg forward means right arm forward. Elbows flex in the sagittal plane.
  const swing=c.swing*sign*Math.cos(phase)*(c.backwards?-1:1);
  p.rotations[side+'Arm']=euler(swing,sign*3,sign*(3+balance));
  p.rotations[side+'ForeArm']=euler(-(180-c.elbow)+sign*4*Math.sin(phase));
  p.rotations[side+'Hand']=euler(-4,sign*3,sign*2);
 }
}
function gait(c,travel,t,{angle=0,duration=c.period,direction=[0,0,1],dribble=false}={}){
 const phase=tau*(t/c.period+(c.phase??0)),bank=angle?Math.sign(angle)*13*Math.sin(Math.PI*t/duration)**2:0;
 const p=pose({hips:[.006*Math.sin(phase),c.hip-c.bob*Math.cos(2*phase),0],
  hipPitch:c.lean*.48,spinePitch:c.lean*.28,chestPitch:c.lean*.24,
  hipYaw:3*Math.sin(phase),twist:-6*Math.sin(phase),roll:-bank,
  leftFoot:targets(c,travel,t,'Left',direction),rightFoot:targets(c,travel,t,'Right',direction),
  leftKnee:[0,0,1],rightKnee:[0,0,1],head:-c.lean*.55,headYaw:-3*Math.sin(phase)});
 arms(p,c,t,{balance:dribble?2:0});
 // The planted foot orientation is flat; ankle articulation belongs to swing only.
 for(const side of ['Left','Right']){
  const shift=(side==='Left'?0:.5)+(c.phase??0),u=mod(t/c.period+shift,1);
  if(u>c.duty){const s=(u-c.duty)/(1-c.duty),pitch=18*Math.sin(tau*s)*Math.sin(Math.PI*s);const w=fk(p);p.rotations[side+'Foot']=qm([-w[side+'Leg'].rotation[0],-w[side+'Leg'].rotation[1],-w[side+'Leg'].rotation[2],w[side+'Leg'].rotation[3]],euler(pitch));}
 }
 return p;
}
function idle(t,variant=0){
 const phase=tau*t/4,breathe=.003*(1-Math.cos(phase));
 const p=pose({hips:[variant===1?.012*Math.sin(phase):.003*Math.sin(phase),.835+breathe,0],
  hipPitch:-1.2,spinePitch:-.7-.5*Math.sin(phase),chestPitch:-.5-.4*Math.sin(phase),
  hipYaw:variant===2?2*Math.sin(phase):0,headYaw:variant===2?10*Math.sin(phase):0,
  head:.8*Math.sin(phase),leftFoot:[.108,.08,0],rightFoot:[-.108,.08,0]});
 for(const [side,sign] of [['Left',1],['Right',-1]]){
  p.rotations[side+'Arm']=euler(-3+Math.sin(phase)*.7,0,sign*7);
  p.rotations[side+'ForeArm']=euler(-40-(variant===1?sign*3*Math.sin(phase):0));
  p.rotations[side+'Hand']=euler(-5,sign*4,0);
 }
 return p;
}
const clips=[];
function writeClip(id,label,c,duration,{angle=0,direction=[0,0,1],loop=true,category='locomotion',dribble=false}={}){
 const travel=scenario(c,duration,angle,direction),frames=[],supports=[],events=[];
 for(let i=0;i<=Math.round(duration*30);i++){
  const time=i/30,p=gait(c,travel,time,{angle,duration,direction,dribble});
  frames.push({time,hips:p.hips,rotations:p.rotations});
 }
 for(const [side,shift] of [['Left',c.phase??0],['Right',.5+(c.phase??0)]])for(let k=-2;k<Math.ceil(duration/c.period)+2;k++){
  const start=(k-shift)*c.period,end=start+c.duty*c.period,a=Math.max(0,start),b=Math.min(duration,end);
  if(b-a>.025){supports.push({bone:side+'Foot',start:a,end:b,local:[0,-.08,0]});if(start>=0&&start<duration)events.push({type:'footstrike',bone:side+'Foot',time:start});}
 }
 const referenceTravel={coordinateSpace:'simulation-owned world scenario; not baked Root motion',samples:[]};
 for(let i=0;i<=Math.round(duration*120);i++){const time=i/120;referenceTravel.samples.push({time,position:travel.position(time),yawRadians:travel.yaw(time)});}
 const entry={id,label,durationSeconds:duration,duration,loop,nativeRate:30,frameCount:frames.length,speedMps:c.speed,gaitKind:category==='strafe'?'jog':(id in configs?id:'run'),category,locomotion:true,rootMotion:false,
  symmetryMode:angle||category==='strafe'||dribble?'structural':'gait',events,supports,referenceTravel,frames};
 if(dribble){
  // Independent rolling trajectory, alternating instep nudges once per step.
  const radius=.105,samples=[],contacts=[];
  for(let i=0;i<=Math.round(duration*120);i++){
   const time=i/120,phase=time/c.period,x=.055*Math.cos(tau*phase),z=.36+.055*Math.sin(2*tau*phase);
   samples.push({time,position:[x,radius,z]});
  }
  // Exact declared instep contacts; fit independent ball curve through physical surface points.
  for(const [side,time] of [['Right',c.period*(.5-(c.phase??0))],['Left',c.period*(1-(c.phase??0))]]){
   const p=gait(c,travel,time,{dribble:true}),w=fk(p),local=[0,-.025,.18],contact=add(w[side+'Foot'].position,rotate(w[side+'Foot'].rotation,local));
   const y=radius,dx=0,dz=Math.sqrt(Math.max(0,radius*radius-(contact[1]-y)**2));
   const center=[contact[0]+dx,y,contact[2]+dz];contacts.push({time,bone:side+'Foot',local,center});
  }
  const keypoints=[{time:0,position:[.055,radius,.55]},...contacts.map(c=>({time:c.time,position:c.center})),{time:duration,position:[.055,radius,.55]}];
  for(const sample of samples){let j=1;while(j<keypoints.length-1&&keypoints[j].time<sample.time)j++;const a=keypoints[j-1],b=keypoints[j];sample.position=mix(a.position,b.position,S((sample.time-a.time)/(b.time-a.time)));}
  entry.ball={radius,samples};entry.events.push(...contacts.map(({time,bone,local})=>({type:'contact',time,bone,local})));
 }
 clips.push(entry);
}
for(const [i,id,label] of [[0,'idle_relaxed','עמידה רגועה ונשימה'],[1,'idle_weight_shift','העברת משקל רגועה'],[2,'idle_scan','עמידה ומבט סביב']]){
 const frames=Array.from({length:121},(_,f)=>{const time=f/30,p=idle(time,i);return {time,hips:p.hips,rotations:p.rotations};});
 clips.push({id,label,durationSeconds:4,duration:4,loop:true,nativeRate:30,frameCount:121,speedMps:0,category:'idle',locomotion:false,rootMotion:false,symmetryMode:'structural',events:[],supports:['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:4,local:[0,-.08,0]})),referenceTravel:{samples:[{time:0,position:[0,0,0],yawRadians:0},{time:4,position:[0,0,0],yawRadians:0}]},frames});
}
for(const [id,c] of Object.entries(configs))writeClip(id,{walk:'הליכה',jog:'ריצה קלה',run:'ריצה',sprint:'ספרינט'}[id],c,c.period);
for(const degrees of [45,90,180])for(const [side,sign] of [['left',1],['right',-1]]){
 const c={...configs.run,speed:degrees===180?1.8:2.15},duration=c.period*(degrees===180?3:2);
 writeClip(`turn_${side}_${degrees}`,`פנייה ${degrees}° ${sign===1?'שמאלה':'ימינה'}`,c,duration,{angle:degrees*Math.PI/180*sign,loop:false,category:'turn'});
}
for(const [side,sign] of [['left',1],['right',-1]]){
 const c={...configs.jog,speed:.8,lift:.10,hip:.72,lean:5.5,swing:34,width:.22};
 writeClip('strafe_'+side,'צעדי צד '+(sign===1?'שמאלה':'ימינה'),c,c.period,{direction:[sign,0,0],category:'strafe'});
}
writeClip('run_backward','ריצה אחורה',{...configs.run,speed:1.2,lift:.16,lean:10,swing:37,backwards:true},configs.run.period,{direction:[0,0,-1],category:'backward'});
writeClip('run_ball','ריצה עם כדור',{...configs.run,speed:1.9,lift:.19,swing:40},configs.run.period,{dribble:true});

// Authored 0.3–0.5 s start/stop. World foot anchors are kept
// during initial/final support; swing arcs connect to the actual gait phase.
// The first/last native intervals extend the real adjoining 30 Hz tracks,
// including their Float32 time spacing, for direct pose/velocity continuity.
for(const accelerate of [true,false]){
 const duration=accelerate?.5:14/30,c=configs.run,brakeDuration=duration-1/30,launchDuration=duration-1/30,travel={yaw:()=>0,position:t=>{
  const u=Math.min(1,(accelerate?Math.max(0,t-1/30):t)/(accelerate?launchDuration:brakeDuration));
  return [0,0,c.speed*(accelerate?launchDuration*(u*u-u**3/3):brakeDuration*(u-u**3/3))];
 }};
 const a=accelerate?idle(0):gait(c,scenario(c,c.period),0),b=accelerate?gait(c,scenario(c,c.period),0):idle(0);
 const frames=[],supports=[],footPaths={};
 for(const side of ['Left','Right']){
  const start=fk(a)[side+'Foot'].position,end=add(fk(b)[side+'Foot'].position,travel.position(duration));
  // Millimetre clearance covers interpolation of the canonical sole probe;
  // the exact native idle endpoint/tangent is restored below.
  if(!accelerate)end[1]+=.001;
  const lift=accelerate?.12:(side==='Left'?.07:.015);
  const leave=accelerate?(side==='Left'?2/30:10/30):(side==='Left'?2/30:0),land=accelerate?(side==='Left'?11/30:duration):(side==='Left'?7/30:5/30);
  let endVelocity=[0,0,0];
  if(accelerate){const h=1e-5,w1=fk(gait(c,scenario(c,c.period),h))[side+'Foot'].position,w0=fk(b)[side+'Foot'].position;endVelocity=add(mul(sub(w1,w0),1/h),[0,0,c.speed]);}
  footPaths[side]=t=>{
   if(t<=leave)return start;
   if(t>=land)return accelerate&&side==='Right'?add(end,mul(endVelocity,t-land)):end;
   const u=(t-leave)/(land-leave),p=hermite(start,[0,0,0],end,endVelocity,u,land-leave);p[1]+=lift*Math.sin(Math.PI*u)**2;return p;
  };
  if(leave>.025)supports.push({bone:side+'Foot',start:0,end:leave,local:[0,-.08,0]});
  if(!accelerate||side==='Left')supports.push({bone:side+'Foot',start:land,end:duration,local:[0,-.08,0]});
 }
 for(let i=0;i<=Math.round(duration*30);i++){
  const time=i/30,u=S(time/duration),p={hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))};
  for(const side of ['Left','Right'])solve(p,side+'UpLeg',side+'Leg',side+'Foot',sub(footPaths[side](time),travel.position(time)),[0,0,1],I);
  frames.push({time,...p});
 }
 const source=clips.find(c=>c.id===(accelerate?'idle_relaxed':'run'));
 const target=clips.find(c=>c.id===(accelerate?'run':'idle_relaxed'));
 // Match the bake's normalization/Float32 accessors without reading old outputs.
 // Normalize again as the native quaternion sampler does after decoding.
 const serialized=f=>({hips:f.hips.map(Math.fround),rotations:Object.fromEntries(bones.map(({name})=>{
  const q=f.rotations[name],n=Math.hypot(...q),raw=q.map(v=>Math.fround(v/n)),r=Math.hypot(...raw);return [name,raw.map(v=>v/r)];
 }))});
 const previous=serialized(source.frames.at(-2)),start=serialized(source.frames[0]);
 const end=serialized(target.frames[0]),next=serialized(target.frames[1]);
 const sourceDt=Math.fround(source.frames.at(-1).time)-Math.fround(source.frames.at(-2).time);
 const targetDt=Math.fround(target.frames[1].time)-Math.fround(target.frames[0].time);
 const firstDt=Math.fround(frames[1].time)-Math.fround(frames[0].time);
 const lastDt=Math.fround(frames.at(-1).time)-Math.fround(frames.at(-2).time);
 const extrapolate=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
 // IK must not overwrite these constrained tangent intervals. Their support
 // residual is measured from the serialized GLB against the actor scenario.
 Object.assign(frames[0],{hips:[...source.frames[0].hips],rotations:structuredClone(source.frames[0].rotations)});
 Object.assign(frames[1],extrapolate(previous,start,1+firstDt/sourceDt));
 Object.assign(frames.at(-2),extrapolate(end,next,-lastDt/targetDt));
 Object.assign(frames.at(-1),{hips:[...target.frames[0].hips],rotations:structuredClone(target.frames[0].rotations)});
 clips.push({id:accelerate?'idle_to_run':'run_to_idle',label:accelerate?'האצה מעמידה לריצה':'האטה מריצה לעמידה',duration,durationSeconds:duration,loop:false,nativeRate:30,frameCount:Math.round(duration*30)+1,speedMps:travel.position(duration)[2]/duration,startSpeedMps:accelerate?0:c.speed,endSpeedMps:accelerate?c.speed:0,category:'transition',locomotion:true,rootMotion:false,events:[],supports,symmetryMode:'structural',nativeHandoff:{source:source.id,sourcePhaseSeconds:0,target:target.id,targetPhaseSeconds:0,continuity:'C1 native LINEAR/slerp endpoint intervals'},referenceTravel:{samples:Array.from({length:Math.round(duration*120)+1},(_,i)=>({time:i/120,position:travel.position(i/120),yawRadians:0}))},frames});
}
// Right turns and right shuffles start on the opposite foot: exact anatomical
// reflection, including supports and the independent actor scenario.
const mirrorName=name=>name.startsWith('Left')?name.replace('Left','Right'):name.startsWith('Right')?name.replace('Right','Left'):name;
for(let i=0;i<clips.length;i++)if(clips[i].id.includes('right')){
 const original=clips[i],left=clips.find(c=>c.id===original.id.replace('right','left')),right=structuredClone(left);
 right.id=original.id;right.label=original.label;
 for(const f of right.frames){f.hips[0]*=-1;f.rotations=Object.fromEntries(Object.entries(f.rotations).map(([name,q])=>[mirrorName(name),[q[0],-q[1],-q[2],q[3]]]));}
 for(const group of [right.events,right.supports])for(const e of group){if(e.bone)e.bone=mirrorName(e.bone);if(e.local)e.local[0]*=-1;}
 for(const s of right.referenceTravel.samples){s.position[0]*=-1;s.yawRadians*=-1;}
 clips[i]=right;
}
await fs.writeFile(new URL('runtime/motions.json',base),JSON.stringify({schemaVersion:1,version:'soccer-locomotion-v2',fps:30,units:'metres',hipsConvention:'absolute local translation (athletes-core requires subtraction of .86)',rootMotion:false,skeleton:bones,clips})+'\n');
console.log(`Authored ${clips.length} original 30 Hz clips.`);
