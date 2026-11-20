// racing-v24 tyres and pit stops (Roy after v23: "also on long tracks every competitor should have to come in after, say, the second lap to change tyres, like the
// real races"). Pure: no DOM, no randomness of its own (the race model's seeded random), fixed steps. On in races of PIT.minLaps laps or more when the model's
// config.pit is set (the session sets it unless ?racingPit=0).
//  wear   every car's tyre goes 1 -> 0 with the metres it drives, more in hard corners and under braking (about 27% a lap); a worn tyre costs top speed and grip
//         gradually (tyreWorn: from 75% down), so a car that never stops is clearly slower on its third lap
//  plan   every computer driver makes one stop: most at the end of lap 2, about a quarter a lap early (an undercut), longer races spread by style; a driver whose
//         tyres are finished comes in at once, and one whose rival just ahead pitted may follow it in a lap early
//  player the pit button asks for a stop at the next pit entry; tyres under 30% (or the last lap on which a stop is still possible) ask for it automatically
//  stop   kinematic and identical for everybody: the entry ramp from the end of the last corner into the pit lane (fast lane 6.2 m beyond the asphalt) at 20 m/s, the
//         car's own box (working lane, 9 m out), a 2.2-2.8 s stop for the computer; the player taps the tyre change (2 s; it starts by itself after 0.8 s), then the
//         lane and the exit ramp back onto the road. The line is crossed inside the pit lane, gates count as usual; a stop never starts on the last lap.
import {PIT,PIT_AUTO,autoStopLap,pitLane,tyreWorn,ease,easeSlope} from './racing-v24.mjs?v=island-v2-20261107-21';
import {PIT_SEQ} from './racing-v24-4.mjs?v=island-v2-20261107-21';
const phoneFixDEnabled=()=>{try{const p=new URLSearchParams(globalThis.location?.search||'');return p.get('phoneFixes')!=='0'&&p.get('phoneFixD')!=='0';}catch{return true;}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// racing-v24.1 (`auto`: the model's config.pitAuto, which the session sets unless ?racingPitAuto=0): stops in every race of PIT_AUTO.distance metres or more (two
// laps are enough; a two-lap race stops at the end of lap 1, the computer drivers too), and the player's car is pitted at the end of autoStopLap(laps) without a
// tap: armed once from the start of that lap (event pitRequest auto), cancelled by the pit button until the car is committed 80 m before the entry (pitCancel).
// Without `auto` everything below is v24: races of PIT.minLaps laps or more, the player's stop when asked or at the last possible lap.
// racing-v24.4 (`seq`: the model's config.pitSeq, which the session sets unless ?racingPitSeq=0): the player's stop has no tap any more (Roy: "remove the change button");
// it settles PIT_SEQ.stop s and the crew changes the four wheels in PIT_SEQ.change s (the Codex sequence in the view). Without `seq` the v24 tap wait and 2 s change.
export function createPitCrew({track,stage,cars,random,event,passGates,sector,enabled=true,auto=false,seq:seqOption=false,phoneFix=phoneFixDEnabled()}){
 let seq=!!seqOption;
 const lane=pitLane(track),laps=stage.laps,L=track.length,n=cars.length,on=!!enabled&&(auto?laps>=2&&laps*L>=PIT_AUTO.distance:laps>=PIT.minLaps),stopLap=autoStopLap(laps);
 const planLap=car=>{if(auto&&laps===2)return 1;if(laps<=3)return random()<.25?1:2;const mid=Math.max(1,Math.floor(laps/2));return clamp(mid+(car.aiStyle>.62?0:car.aiStyle<.3?1:random()<.5?0:1),1,laps-1);};
 cars.forEach((car,i)=>{car.tyre=1;car.pits=0;car.pitLaps=[];car.pit=null;car.pitRequest=false;car.pitAuto=false;car.pitCancelled=false;car.pitPlan=on&&!car.isPlayer?planLap(car):0;car.boxIndex=i;car.pitEntryAt=null;});
 const entryAhead=car=>lane.entry+Math.ceil((car.routeS-lane.entry+1e-6)/L)*L;   // the next pit entry at or after the car, in the car's own unwrapped metres
 /** per fixed step, for a car on the road: tyre wear */
 function wear(car,{yaw=0,brake=false},dt){
  if(!on||car.finished)return;const lat=Math.min(1,Math.abs(yaw*car.speed)/30);
  car.tyre=Math.max(0,car.tyre-dt*car.speed*PIT.wear*(1+PIT.cornerWear*lat+(brake?PIT.brakeWear:0)));
 }
 const topOf=car=>on?1-PIT.topLoss*tyreWorn(car.tyre):1,gripOf=car=>on?1-PIT.gripLoss*tyreWorn(car.tyre):1,aiCornerOf=car=>on?1-PIT.aiCornerLoss*tyreWorn(car.tyre):1;
 /** does this car come in at the entry ahead? (decided once per entry, in the last 80 m before it) */
 function wants(car){
  if(car.lap>=laps||car.finished)return false;
  if(car.isPlayer){
   if(auto)return car.pitRequest;   // racing-v24.1: armed at the start of the stop lap (arm) or asked with the button, and a cancel holds
   if(!car.pitRequest&&car.pits===0&&(car.tyre<PIT.autoTyre||car.lap===laps-1)){car.pitRequest=true;car.pitAuto=true;event('pitRequest',car,{auto:true});}
   return car.pitRequest;}
  if(car.tyre<PIT.autoTyre)return true;
  if(car.pits>0)return false;
  if(car.lap>=car.pitPlan)return true;
  // cover an undercut: the rival just ahead turned in on this lap, my stop is next lap anyway and my tyres are past their best
  if(car.lap===car.pitPlan-1&&car.tyre<.65)for(const o of cars){if(o===car||!o.pit||o.pitEntryLap!==car.lap)continue;const gap=((o.routeS-car.routeS)%L+L)%L;if(gap<40)return true;}
  return false;
 }
 /** per fixed step, after the car moved on the road: decide once per entry (in the last 80 m before it), start the stop inside the entry window. The decided entry is
  * kept (car.pitEntryAt): recomputing "the next entry" every step jumped a lap ahead the moment the car passed the entry, and a car at 40 m/s (0.67 m a step) could
  * step over a 0.5 m window and miss its stop. A stop missed because the car was flipping or off the track is decided again at the next entry. */
 /** racing-v24.1: the player's automatic stop is asked for once, from the start of its lap and after the start (PIT_AUTO.armAfter s of race time) */
 function arm(car,time){
  if(!auto||!car.isPlayer||car.pitRequest||car.pitCancelled||car.pits>0||car.lap!==stopLap||car.lap>=laps||!(time>=PIT_AUTO.armAfter))return;
  car.pitRequest=true;car.pitAuto=true;event('pitRequest',car,{auto:true,lap:car.lap});
 }
 function watch(car,time=Infinity){
  if(!on||car.pit||car.finished||car.crashT>0||car.offFlight)return;
  arm(car,time);
  const target=car.pitEntryAt;
  if(car.pitGo&&target!=null&&car.routeS>=target-.5){
   if(car.routeS<target+lane.lane0-lane.entry){
    const base=target-lane.entry,lat0=car.lateral;car.pitGo=false;
    car.pit={phase:'entry',t:0,base,lat0,lat:lat0,box:base+lane.boxS(car.boxIndex,n),stop:car.isPlayer?0:PIT.stopAI[0]+(PIT.stopAI[1]-PIT.stopAI[0])*random(),tapped:false};
    car.pitEntryLap=car.lap;car.pitRequest=false;car.drifting=false;car.driftCharge=0;car.boosting=false;car.boostTime=0;car.stuckT=0;car.farT=0;car.slowOffT=0;car.passing=null;car.laneHold=0;
    event('pitIn',car,{lap:car.lap,auto:!!car.pitAuto});car.pitAuto=false;return;
   }
   car.pitGo=false;
  }
  const at=entryAhead(car);
  if(car.pitEntryAt!==at&&car.routeS>=at-80&&!(car.pitGo&&target!=null&&car.routeS<target)){car.pitEntryAt=at;car.pitGo=wants(car);}
 }
 function pose(car,lat,slope){
  const p=track.sample(car.routeS);car.x=p.x+p.normal.x*lat;car.z=p.z+p.normal.z*lat;car.y=p.y;car.s=p.s;car.lateral=lat;
  car.heading=Math.atan2(p.tangent.x+p.normal.x*slope,p.tangent.z+p.normal.z*slope);
 }
 /** one fixed step of a car in the pits (the model calls this instead of driving); true while the stop lasts */
 function drive(car,dt){
  const P=car.pit;if(!P)return false;P.t+=dt;const rel=car.routeS-P.base;let v=car.speed,lat=P.lat,slope=0;
  // the car ahead in the fast lane (not one standing in its box): keep 7 m
  // only a car that is still in the fast lane counts (one turning into its box, standing in it or leaving it is in the working lane, 2.8 m further out)
  let room=Infinity;for(const o of cars){if(o===car||!o.pit||['stop','change'].includes(o.pit.phase)||Math.abs(o.lateral-lane.lat)>1.2)continue;const gap=o.routeS-car.routeS;if(gap>0&&gap<30)room=Math.min(room,gap-7);}
  const exitLat=car.isPlayer?0:clamp(car.targetLane||0,-track.width*.2,track.width*.2);
  if(P.phase==='entry'){
   v=v>PIT.speed?Math.max(PIT.speed,v-PIT.entryDecel*dt):Math.min(PIT.speed,v+PIT.leaveAccel*dt);
   const u=(rel-lane.entry)/(lane.lane0-lane.entry);lat=P.lat0+(lane.lat-P.lat0)*ease(u);slope=(lane.lat-P.lat0)*easeSlope(u)/(lane.lane0-lane.entry);
   if(rel>=lane.lane0)P.phase='lane';
  }else if(P.phase==='lane'){
   const toBox=P.box-car.routeS;v=Math.min(PIT.speed,Math.sqrt(2*PIT.stopDecel*Math.max(0,toBox)),v+PIT.leaveAccel*dt);
   const u=1-clamp(toBox/12,0,1);lat=lane.lat+(lane.boxLat-lane.lat)*ease(u);slope=toBox<12?(lane.boxLat-lane.lat)*easeSlope(u)/12:0;
   if(toBox<=.06||(v<.15&&toBox<.6)){car.routeS=P.box;v=0;lat=lane.boxLat;slope=0;P.phase='stop';P.t=0;event('pitStop',car,{lap:car.lap});}
  }else if(P.phase==='stop'){
   v=0;lat=lane.boxLat;
   if(!car.isPlayer||P.tapped||P.t>=(seq?PIT_SEQ.stop:PIT.tapWait)){P.phase='change';P.t=0;P.dur=car.isPlayer?(seq?PIT_SEQ.change:PIT.change):P.stop;event('pitChange',car,{tapped:!!P.tapped});}
  }else if(P.phase==='change'){
   v=0;lat=lane.boxLat;
   if(P.t>=P.dur){car.tyre=1;car.pits++;car.pitLaps.push(car.pitEntryLap);P.phase='leave';P.t=0;P.from=car.routeS;event('pitDone',car,{lap:car.lap});}
  }else if(P.phase==='leave'){
   v=Math.min(PIT.speed,v+PIT.leaveAccel*dt);const d=car.routeS-P.from,u=clamp(d/12,0,1);lat=lane.boxLat+(lane.lat-lane.boxLat)*ease(u);slope=d<12?(lane.lat-lane.boxLat)*easeSlope(u)/12:0;
   if(rel>=lane.lane1)P.phase='exit';
  }else if(P.phase==='exit'){
   v=Math.min(32,v+PIT.exitAccel*dt);const u=(rel-lane.lane1)/(lane.exit-lane.lane1);lat=lane.lat+(exitLat-lane.lat)*ease(u);slope=(exitLat-lane.lat)*easeSlope(u)/(lane.exit-lane.lane1);
   if(rel>=lane.exit){pose(car,exitLat,0);car.pit=null;car.previousS=car.routeS;car.gearInit=false;car.gearT=1;car.steer=0;car.slipAngle=0;car.offroad=false;car.offroadTime=0;car.recoveryTime=.4;car.wallCooldown=.3;car.speed=v;
    car.progress=car.checkpoints*sector+clamp(car.routeS-car.checkpoints*sector,-sector,sector-.01);event('pitExit',car,{lap:car.lap});return true;}
  }
  if(room<Infinity&&!['stop','change'].includes(P.phase))v=Math.min(v,Math.max(0,room*2));
  car.speed=v;P.lat=lat;car.routeS+=v*dt;pose(car,lat,slope);passGates(car);
  car.steer=clamp(slope*6,-1,1);car.slipAngle=0;car.drifting=false;car.boosting=false;car.offroad=false;car.offroadTime=0;car.farT=0;car.stuckT=0;car.braking=v<PIT.speed-.5&&P.phase!=='leave'&&P.phase!=='exit';
  const g=v<9?1:v<16?2:3,lo=[0,0,9,16][g],hi=[0,9,16,32][g];car.gear=g;car.gearInit=true;car.rpm=['stop','change'].includes(P.phase)?.2:.25+.6*clamp((v-lo)/(hi-lo),0,1);
  car.progress=car.checkpoints*sector+clamp(car.routeS-car.checkpoints*sector,-sector,sector-.01);
  return true;
 }
 return {on,lane,wear,watch,drive,topOf,gripOf,aiCornerOf,
  /** racing-v24.4: the player's stop without a tap (set once, before the race) */
  useSequence(on=true){seq=!!on;},
  /** the pit button: a stop at the next pit entry (not on the last lap; one request at a time) */
  request(car){if(!on||car.pit||car.finished||car.lap>=laps||car.pitRequest)return false;car.pitRequest=true;event('pitRequest',car,{auto:false});return true;},
  /** racing-v24.1: the pit button while a stop is asked for: cancel it (an automatic one is not asked again in this race) until the car is committed to its entry */
  cancel(car){if(phoneFix||!auto||!on||!car.pitRequest||car.pit||car.pitGo)return false;car.pitRequest=false;if(car.pitAuto)car.pitCancelled=true;car.pitAuto=false;event('pitCancel',car,{lap:car.lap});return true;},
  /** the tyre-change tap while the player's car stands in its box */
  tap(car){if(seq||!car.pit||car.pit.phase!=='stop')return false;car.pit.tapped=true;return true;},
  info:()=>({on,laps,auto,seq,stopLap:auto?stopLap:null,lane:{...lane}})};
}
