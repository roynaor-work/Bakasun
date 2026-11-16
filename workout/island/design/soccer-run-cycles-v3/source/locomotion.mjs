// SPDX-License-Identifier: CC0-1.0
// Original true-speed canonical18 cycles. Actor travel remains simulation-owned.
import {pose,fk,euler,qm,qi,rotate,add} from './rig.mjs';

export const NATIVE_RATE=120;
const TAU=2*Math.PI,mod=(x,n)=>((x%n)+n)%n;
const smoother=x=>(x=Math.max(0,Math.min(1,x)),x*x*x*(10+x*(-15+6*x)));
export const configs=Object.freeze({
 jog:{period:90/120,stance:30/120,speed:2.6,lift:.21,hip:.745,bob:.016,lean:5,swing:35,width:.108,phase:16/90},
 run:{period:80/120,stance:18/120,speed:4.5,lift:.27,hip:.735,bob:.022,lean:9,swing:42,width:.108,phase:12/80},
 sprint:{period:66/120,stance:10/120,speed:7.2,lift:.18,hip:.745,bob:.02,lean:13,swing:46,width:.108,phase:2/66,recoveryRamp:.025},
 referee_run:{period:80/120,stance:16/120,speed:5,lift:.245,hip:.735,bob:.02,lean:7,swing:39,width:.108,phase:8/80},
});

export function referencePosition(id,time){const c=configs[id];return [0,0,c?c.speed*time:0];}

/** Local swing joins the planted -speed tangent at both ends. Short recovery
 * ramps stop the rearward foot before its reach limit; a long central recovery
 * makes up the actual stride. Scaling the old world-space quintic at7.2m/s
 * would send the ankle outside the canonical leg's .78m sphere. */
export function footTarget(c,time,side){
 const sign=side==='Left'?1:-1;
 const t=mod(time+(c.phase??0)*c.period+(side==='Right'?c.period/2:0),c.period);
 const half=c.speed*c.stance/2;
 let z=half-c.speed*t,y=.084;
 if(t>c.stance){
  const s=t-c.stance,span=c.period-c.stance,u=s/span;
  const ramp=Math.min(c.recoveryRamp??.04,span*.12),outer=half+c.speed*ramp/2;
  if(s<ramp)z=-half-c.speed*s+c.speed*s*s/(2*ramp);
  else if(s>span-ramp){const x=s-(span-ramp);z=outer-c.speed*x*x/(2*ramp);}
  else z=-outer+2*outer*smoother((s-ramp)/(span-2*ramp));
  // Fast heel recovery has C1 zero vertical velocity at toe-off/strike.
  // There is no contact window during this airborne trajectory.
  const rise=Math.min(c.riseSeconds??.085,span*.20),fall=Math.min(c.fallSeconds??.11,span*.24);
  let clearance=1;
  if(s<rise)clearance=.5-.5*Math.cos(Math.PI*s/rise);
  else if(s>span-fall)clearance=.5-.5*Math.cos(Math.PI*(span-s)/fall);
  else clearance=1-.10*Math.sin(Math.PI*(s-rise)/(span-rise-fall))**2;
  y+=c.lift*clearance;
 }
 return [sign*c.width,y,z];
}

export function evaluateIdle(time){
 const phase=TAU*time/4;
 const p=pose({hips:[.003*Math.sin(phase),.82+.003*(1-Math.cos(phase)),0],
  hipPitch:-1.2,spinePitch:-.7-.5*Math.sin(phase),chestPitch:-.5-.4*Math.sin(phase),
  head:.8*Math.sin(phase),leftFoot:[.108,.084,0],rightFoot:[-.108,.084,0]});
 for(const [side,sign] of [['Left',1],['Right',-1]]){
  p.rotations[side+'Arm']=euler(-3+.7*Math.sin(phase),0,sign*7);
  p.rotations[side+'ForeArm']=euler(-55);
  p.rotations[side+'Hand']=euler(-5,sign*4);
 }
 return {hips:p.hips,rotations:p.rotations};
}

/** Infinite periodic evaluation supports C1 transition endpoint sampling. */
export function evaluateLocomotion(id,time){
 if(id==='idle_relaxed'||id==='referee_idle')return evaluateIdle(time);
 const c=configs[id];if(!c)throw Error('Unknown locomotion '+id);
 const phase=TAU*(time/c.period+(c.phase??0));
 // Compression peaks at midstance; the body rises through each flight interval.
 const bouncePhase=phase-TAU*c.stance/(2*c.period);
 const p=pose({hips:[.004*Math.sin(phase),c.hip-c.bob*Math.cos(2*bouncePhase),0],
  hipPitch:c.lean*.48,spinePitch:c.lean*.28,chestPitch:c.lean*.24,
  hipYaw:3*Math.sin(phase),twist:-6*Math.sin(phase),head:-c.lean*.55,
  headYaw:-3*Math.sin(phase),leftFoot:footTarget(c,time,'Left'),
  rightFoot:footTarget(c,time,'Right'),leftKnee:[0,0,1],rightKnee:[0,0,1]});
 for(const [side,sign] of [['Left',1],['Right',-1]]){
  // Anatomical forward left leg is paired with backward left upper arm.
  // True-speed stance lengths differ from v2: align the arm's neutral crossing
  // with the leg's actual midstance and midswing, rather than an old duty cycle.
  const armPhase=phase+TAU*(.25-c.stance/(2*c.period));
  p.rotations[side+'Arm']=euler(sign*c.swing*Math.cos(armPhase),sign*3,sign*3);
  p.rotations[side+'ForeArm']=euler(-90);
  p.rotations[side+'Hand']=euler(-4,sign*3,sign*2);
  const t=mod(time+(c.phase??0)*c.period+(side==='Right'?c.period/2:0),c.period);
  if(t>c.stance){
   const u=(t-c.stance)/(c.period-c.stance),pitch=18*Math.sin(TAU*u)*Math.sin(Math.PI*u);
   const w=fk(p);p.rotations[side+'Foot']=qm(qi(w[side+'Leg'].rotation),euler(pitch));
  }
 }
 return {hips:p.hips,rotations:p.rotations};
}

function makeClip(id,label){
 const c=configs[id],duration=c.period,frames=[],supports=[],events=[];
 for(let i=0;i<=Math.round(duration*NATIVE_RATE);i++){
  const time=i/NATIVE_RATE;frames.push({time,...evaluateLocomotion(id,time)});
 }
 for(const [side,shift] of [['Left',c.phase??0],['Right',.5+(c.phase??0)]])for(let k=-1;k<3;k++){
  const start=(k-shift)*duration,end=start+c.stance,a=Math.max(0,start),b=Math.min(duration,end);
  if(b-a>1e-7){
   const anchor=[(side==='Left'?1:-1)*c.width,.004,c.speed*(start+c.stance/2)];
   supports.push({bone:side+'Foot',start:a,end:b,local:[0,-.08,0],anchorMeters:anchor});
   if(start>=0&&start<duration-1e-7)events.push({type:'footstrike',bone:side+'Foot',time:start});
  }
 }
 const referenceTravel={coordinateSpace:'simulation-owned world scenario; not baked Root motion',samples:frames.map(f=>({time:f.time,position:referencePosition(id,f.time),yawRadians:0}))};
 return {id,label,duration,durationSeconds:duration,loop:true,nativeRate:NATIVE_RATE,
  frameCount:frames.length,speedMps:c.speed,gaitKind:id==='referee_run'?'run':id,
  category:id==='referee_run'?'referee':'locomotion',role:id==='referee_run'?'referee':'field',
  locomotion:true,rootMotion:false,symmetryMode:'gait',events,supports,referenceTravel,
  cadenceStepsPerSecond:2/c.period,stanceDurationSeconds:c.stance,
  strideLengthMeters:c.speed*c.period,armStyle:'soccer-locomotion-v2 counter-swing; 90deg elbow hinge',
  ...(id==='referee_run'?{speedRangeMps:[4,6],playbackRateRange:[.8,1.2],
   playbackSpeedRule:'rate=worldSpeedMps/5; apply this rate to clip time, events, and support windows'}:{}),frames};
}

export function buildLocomotion(){
 const duration=4,frames=Array.from({length:duration*NATIVE_RATE+1},(_,i)=>({time:i/NATIVE_RATE,...evaluateIdle(i/NATIVE_RATE)}));
 const idle={id:'idle_relaxed',label:'עמידה רגועה ונשימה',duration,durationSeconds:duration,
  loop:true,nativeRate:NATIVE_RATE,frameCount:frames.length,speedMps:0,category:'idle',
  role:'field',locomotion:false,rootMotion:false,symmetryMode:'structural',events:[],
  supports:['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:duration,local:[0,-.08,0]})),
  referenceTravel:{samples:[{time:0,position:[0,0,0],yawRadians:0},{time:duration,position:[0,0,0],yawRadians:0}]},frames};
 const refereeIdle={...structuredClone(idle),id:'referee_idle',label:'עמידת שופט רגועה',role:'referee'};
 return [idle,refereeIdle,makeClip('jog','ג׳וג · 2.6 מ׳/ש׳'),makeClip('run','ריצה · 4.5 מ׳/ש׳'),
  makeClip('sprint','ספרינט · 7.2 מ׳/ש׳'),makeClip('referee_run','ריצת שופט · 4–6 מ׳/ש׳')];
}
