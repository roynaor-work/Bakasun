// racing-v24 recovery after leaving the track (Roy after v23: "the flip is good, but then it flips back onto the track"). In v23 the roll happened while the car
// flew back from the gravel to the centre line, so the one flip read as a flip out and a second flip back in. Now (config.recover='v24', ?racingRecover=v23 keeps
// the old flight):
//  tumble  the same impressive m7 flip (crashT / crashDur / crashSpin / crashAir: one or two rolls, debris, the tyre, smoke) WHERE the car left the road: it slides on
//          along its own direction, its sideways speed dies fast and it never goes past RECOVER.maxBeyond (the clear zone starts at 10.6 m), so it never rolls back in
//  rest    it lies on its wheels for a moment (dust and sparks: event 'crashRest')
//  vanish  it disappears (car.hidden) while its position glides to the nearest centre-line point, so the chase camera follows without a cut
//  drop    it reappears on the centre line, along the road, and settles 35 cm onto its wheels (car.dropY), no rotation at all; speed 0, first gear, idle revs;
//          for RECOVER.ghost seconds after it the traffic passes through it (car.ghostT), so a car set down at speed 0 on the racing line is not rear-ended at once
// A slow car that is lost off the track (config.offSlow) gets the same return without the flip: rest, vanish, drop (startSoft).
// The landing point never passes the next gate, so a recovery never grants one. Pure: positions, timers and events only.
import {RECOVER} from './racing-v24.mjs?v=island-v2-20261107-20';
import {racingAngle} from './racing-tracks.mjs?v=island-v2-20261107-20';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createRecovery({track,sector,event,restartLane,crashFx=true,minStrength=.5,fx={min:.6,max:1.1,peak:1.6,time:.55}}){
 const half=()=>track.width/2;
 const nextGate=car=>car.nextCheckpoint*sector-.5;
 function reset(car){car.drifting=false;car.driftCharge=0;car.boosting=false;car.boostTime=0;car.stuckT=0;car.grindT=0;car.farT=0;car.passing=null;car.laneHold=0;car.offroad=false;car.steer=0;car.slipAngle=0;car.gear=1;car.gearT=1;car.slowOffT=0;car.kx=0;car.kz=0;}
 /** the big flip where the car is (reason 'offtrack', why = hard | far | long) */
 function startTumble(car,why){
  const k=Math.max(minStrength,clamp((car.speed-4)/26,0,1)),q=track.project(car.x,car.z,car.s),mh=car.heading-(car.slipAngle||0),vx=Math.sin(mh)*car.speed,vz=Math.cos(mh)*car.speed;
  const along=Math.max(0,vx*q.tangent.x+vz*q.tangent.z),side=vx*q.normal.x+vz*q.normal.z,dur=crashFx?fx.min+(fx.max-fx.min)*k:fx.time;
  const speed0=car.speed;car.crashes++;car.offTracks++;reset(car);
  car.crashT=dur;car.crashDur=crashFx?dur:0;car.crashSpin=k>.45?2:1;car.crashPeak=crashFx?.5+(fx.peak-.5)*k:0;car.crashAir=0;
  car.offFlight={v24:true,phase:'tumble',dur,t:0,along,side,lat:q.lateral,h0:car.heading};
  event('crash',car,{reason:'offtrack',why,speed:speed0,strength:+k.toFixed(2),lateral:+car.lateral.toFixed(2),recover:'v24'});
 }
 /** back to the road without a flip: a slow car lost off the track (why = slow | stuck | edge) */
 function startSoft(car,why){
  reset(car);car.speed=0;car.crashT=0;car.crashDur=0;car.crashAir=0;
  car.offFlight={v24:true,phase:'rest',t:0,soft:true,why,lat:car.lateral,h0:car.heading};
  event('softReturn',car,{reason:'offtrack',why});
 }
 function place(car,f){
  // the nearest centre-line point to where the car lies, as a race distance in routeS's own lap, never past the next gate
  const q=track.project(car.x,car.z,car.s),near=racingAngle((q.s-car.routeS)/track.length*Math.PI*2)/(Math.PI*2)*track.length;
  const r1=Math.min(nextGate(car),car.routeS+near),lane=restartLane(car),p=track.sample(r1);
  Object.assign(f,{x0:car.x,z0:car.z,h0:car.heading,r0:car.routeS,r1,lane,x1:p.x+p.normal.x*lane,z1:p.z+p.normal.z*lane,h1:p.heading});
 }
 /** one fixed step of an active recovery; false when the car is not recovering */
 function step(car,dt){
  const f=car.offFlight;if(!f||!f.v24)return false;f.t+=dt;car.rpm+=(.2-car.rpm)*(1-Math.exp(-dt*6));car.speed*=Math.exp(-dt*5);
  if(f.phase==='tumble'){
   car.crashT=Math.max(0,car.crashT-dt);const u=clamp(1-car.crashT/f.dur,0,1);
   f.along*=Math.exp(-RECOVER.alongDecay*dt);f.side*=Math.exp(-RECOVER.sideDecay*dt);
   const gate=nextGate(car),ds=Math.min(f.along*dt,Math.max(0,gate-car.routeS));car.routeS+=ds;
   const limit=half()+RECOVER.maxBeyond;f.lat+=f.side*dt;if(Math.abs(f.lat)>limit){f.lat=Math.sign(f.lat)*limit;f.side=0;}
   const p=track.sample(car.routeS);car.x=p.x+p.normal.x*f.lat;car.z=p.z+p.normal.z*f.lat;car.y=p.y;car.s=p.s;car.lateral=f.lat;
   car.speed=Math.hypot(f.along,f.side);car.crashAir=crashFx?4*car.crashPeak*u*(1-u):0;
   if(car.crashT<=0){car.crashT=0;car.crashDur=0;car.crashAir=0;car.speed=0;f.phase='rest';f.t=0;event('crashRest',car,{reason:'offtrack'});}
   return true;
  }
  if(f.phase==='rest'){car.speed=0;if(f.t>=RECOVER.rest){f.phase='vanish';f.t=0;place(car,f);car.hidden=true;}return true;}
  if(f.phase==='vanish'){
   const u=clamp(f.t/RECOVER.vanish,0,1),e=u*u*(3-2*u);car.speed=0;
   car.x=f.x0+(f.x1-f.x0)*e;car.z=f.z0+(f.z1-f.z0)*e;car.heading=racingAngle(f.h0+racingAngle(f.h1-f.h0)*e);car.routeS=f.r0+(f.r1-f.r0)*e;
   const q=track.project(car.x,car.z,car.s);car.s=q.s;car.y=q.y;car.lateral=q.lateral;
   if(u>=1){f.phase='drop';f.t=0;car.hidden=false;car.x=f.x1;car.z=f.z1;car.heading=f.h1;car.routeS=f.r1;const p=track.sample(f.r1);car.s=p.s;car.y=p.y;car.lateral=f.lane;car.dropY=RECOVER.dropHeight;}
   return true;
  }
  if(f.phase==='drop'){
   const u=clamp(f.t/RECOVER.drop,0,1);car.speed=0;car.dropY=RECOVER.dropHeight*(1-u*u);   // falls like a dropped car: slow first, 2.3 m/s at the touch-down
   if(u>=1){car.dropY=0;car.hidden=false;car.previousS=car.routeS;car.speed=0;car.steer=0;car.slipAngle=0;car.gear=1;car.gearT=1;car.gearInit=true;car.rpm=Math.min(car.rpm,.22);car.shiftT=0;
    car.offroad=false;car.offroadTime=0;car.farT=0;car.stuckT=0;car.slowOffT=0;car.recoveryTime=1.2;car.wallCooldown=.5;car.crashT=0;car.crashAir=0;car.crashDur=0;car.offFlight=null;car.ghostT=RECOVER.ghost;
    event('crashRecover',car,{reason:'offtrack',soft:true,recover:'v24',why:f.why||null});}
   return true;
  }
  return true;
 }
 return {startTumble,startSoft,step,active:car=>!!car.offFlight?.v24};
}
