import { createTrack, getRacingStage, racingAngle, wrapRacingDistance, RACING_LOOK } from './racing-tracks.mjs?v=island-v2-20261107-8';

const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const moveToward = (v,target,amount) => v < target ? Math.min(target,v+amount) : Math.max(target,v-amount);
const FIXED_STEP = 1/60;
const LAT_CAP = 44;
// Crash: impact is speed x how directly the wall is hit (m/s); a restart speed of 9 m/s is an ordinary slow start.
const CRASH_TIME = 0.55, CRASH_IMPACT = 24, CRASH_RESTART = 9, STUCK_TIME = 1.4;
// racing-deep-m2: grinding along the fence (pressed against it while still moving) for GRIND_TIME seconds counts as "stuck at the side for too long" (Roy) and flips the car too.
const GRIND_TIME = 2.2;
// racing-deep-m2: car numbers (no real teams, no brands); slot 0 is the player. Shared with the view and the leaderboard.
export const RACING_NUMBERS = Object.freeze([1, 16, 44, 63, 11, 4, 27, 55, 81, 14, 22, 31]);
// Energy recovery rates, meter units per second (the meter is 0-100, boosting spends 29 per second).
const ERS = { brake: 14, corner: 0.75, cornerMax: 8, drift: 3, line: 0.8 };
// Gearbox (racing-v11). Shift points as fractions of the car's top speed; ENGINE_TAU is the time constant of the pull towards it.
const GEARS = 7, GEAR_BOUNDS = [0, .15, .31, .47, .62, .76, .89], SHIFT_CUT = .16, ENGINE_TAU = 5.0;
// racing-deep-m3: on the throttle alone gear 7 pulls to TOP_CAP of the car's maximum and keeps creeping towards it; the last few percent (the note that sat
// "stuck" at the limiter) come only with the slipstream, a boost pad or the ERS push (config.topCap=false / ?racingTopCap=0 restores 100% on throttle).
// REV_PULL: at the top of a gear (last 20% of its band) the pull grows up to +35% so the box reaches the shift point a little sooner at high revs
// (Roy: "with more revs, shift up a bit faster"; config.revShift=false / ?racingRevShift=0 keeps the flat pull).
const TOP_CAP = .965, REV_PULL = .35;
function randomSource(seed) {
  let value=Number(seed)>>>0;
  return () => { value=(Math.imul(value,1664525)+1013904223)>>>0; return value/4294967296; };
}
function finite(value,fallback=0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

/** Deterministic race simulation, independent of DOM/WebGL and persistent game state.
 * input: {steer:-1..1, throttle:0..1, autoAccelerate:true, brake, drift, nitro}.
 * Session owns visibility. pause()/resume() preserve both race and countdown clocks.
 */
export function createRacing({stage: stageValue=1,seed=1,difficulty='easy',config={}}={}) {
  const stage={...getRacingStage(stageValue),...(config.stage||{})};
  const seedUint=Number(seed)>>>0;
  const track=createTrack(stage), random=randomSource(seedUint), sector=track.length/track.checkpoints.length;
  const equipment=config.equipment||{};
  const engine=clamp(finite(equipment.engine,1),1,1.16), grip=clamp(finite(equipment.grip,1),1,1.16), nitroUpgrade=clamp(finite(equipment.nitro,1),1,1.16);
  // racing-v9 league upgrades (default 1 = no change): brakes, steering and aero (downforce raises the high-speed cornering cap and the slipstream).
  const brakeUp=clamp(finite(equipment.brakes,1),1,1.3), steerUp=clamp(finite(equipment.steer,1),1,1.12), aeroUp=clamp(finite(equipment.aero,1),1,1.25);
  const drivers=Array.isArray(config.drivers)?config.drivers:null;
  // config.walls=false (or ?racingWalls=0) restores the old open shoulders.
  const shiftMapOn=config.shiftMap!==false,engineModel=config.engine!==false,ersOn=config.ers!==false,topCapOn=config.topCap!==false,revShiftOn=config.revShift!==false,engineUp=clamp(finite(equipment.engine,1),1,1.16),walls=config.walls!==false,wallLimit=track.width*.5+.2;
  const skill=difficulty==='hard'?1.06:difficulty==='normal'?1.025:1;
  const names=['אתם','אלמוג','טורקיז','שמש','ברקת'];
  // racing-grid-v1: extraRivals more cars share the grid with the player and the four scoring drivers (league standings, rank contract and result stay on those five).
  const extra=Math.max(0,Math.min(11,Math.floor(finite(config.extraRivals,0)))),crashOn=config.crash!==false;
  const EXTRA_NAMES=['נועה','רום','דור','ים','אור','שקד','גל','טל','לב','עמית','פז'];
  // racing-deep-m2: a staggered two-by-N grid on the main straight (track.gridSlots); the player's slot is stage.grid (3rd or 5th). config.grid=false (?racingGrid=0) keeps the old line-up.
  const gridOn=config.grid!==false,count=1+stage.opponents+extra,slots=gridOn?track.gridSlots(count):null,playerSlot=Math.min(count-1,stage.grid-1);
  const aiOn=config.ai!==false;
  const cars=Array.from({length:count},(_,index)=>{
    const slot=gridOn?(index===0?playerSlot:index<=playerSlot?index-1:index):0;
    const start=gridOn?slots[slot].s:index===0 ? -(stage.grid-1)*4 : -(index<stage.grid?index-1:index)*4-(index>stage.opponents?(index-stage.opponents)*3:0);
    const lane=gridOn?slots[slot].lane:index===0?0:index%2?2.8:-2.8;
    const p=track.sample(start);
    return {id:index===0?'player':`ai-${index}`,name:index>stage.opponents?EXTRA_NAMES[(index-stage.opponents-1)%EXTRA_NAMES.length]:drivers&&index>0&&drivers[index-1]?drivers[index-1].name:names[index]||`רוכב ${index}`,isPlayer:index===0,scoring:index<=stage.opponents,crashT:0,stuckT:0,crashes:0,
      x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed:0,steer:0,
      s:p.s,routeS:start,previousS:start,progress:start,checkpoints:0,nextCheckpoint:1,lap:1,rank:1,
      nitro:65*nitroUpgrade,boostTime:0,boosting:false,driftCharge:0,drifting:false,slipAngle:0,offroad:false,
      lateral:lane,offroadTime:0,recoveryTime:0,recoveries:0,finished:false,finishTime:null,
      distanceDriven:0,wallHits:0,wallCooldown:0,draft:0,lapTimes:[],gear:1,gearT:1,gearInit:false,rpm:.2,shiftT:0,charging:0,ersRate:0,ersUsed:0,ersHarvested:0,pickups:0,padCooldown:0,lane,targetLane:lane,laneHold:0,aiBias:(random()-.5)*1.4,
      number:RACING_NUMBERS[index%RACING_NUMBERS.length],gridSlot:slot,grindT:0,passing:null,passes:0,braking:false,aiStyle:random(),
      maxSpeed:stage.aiSpeed*skill*(index>stage.opponents?.93+random()*.07:drivers&&index>0&&drivers[index-1]?drivers[index-1].rating:.96+random()*.075),collisionCooldown:0};
  });
  const player=cars[0];
  const state={phase:config.countdown===0?'racing':'countdown',countdown:config.countdown===0?0:3,time:0,elapsed:0,
    seed:seedUint,stage:stage.id,laps:stage.laps,player,cars,rank:stage.grid,result:null,events:[],
    collectibles:track.pickups.map(p=>({...p,active:true,respawnAt:0})),disposed:false};
  let accumulator=0,pausedPhase='racing',serial=0;
  function event(type,car=player,details={}) { state.events.push({type,car:car.id,time:state.time,id:++serial,...details}); }
  function recoverCar(car,manual=false) {
    // Return immediately after the last VERIFIED gate. Recovery never grants a gate.
    const safeS=car.checkpoints*sector+Math.min(4,sector*.08);
    const p=track.sample(safeS), lane=car.isPlayer?0:car.targetLane;
    car.x=p.x+p.normal.x*lane; car.y=p.y; car.z=p.z+p.normal.z*lane; car.heading=p.heading;
    car.s=p.s;car.routeS=safeS;car.previousS=safeS;car.progress=safeS;car.speed=Math.max(8,Math.min(car.speed*.45,15));
    car.steer=0;car.offroadTime=0;car.offroad=false;car.lateral=lane;car.recoveryTime=1.8;car.driftCharge=0;car.drifting=false;car.slipAngle=0;car.recoveries++;
    event('recovery',car,{manual});
  }
  // racing-grid-v1 crash: a severe wall hit, or being stuck for too long (wall, rivals), flips the car for 0.5 s and then puts it back on the centre line,
  // pointing along the track, at a low restart speed. Same rule for the player and the computer drivers. config.crash=false (or ?racingCrash=0) removes it.
  function startCrash(car,reason) {
    if(!crashOn||car.crashT>0||car.finished)return;
    car.crashT=CRASH_TIME;car.crashes++;car.drifting=false;car.driftCharge=0;car.boosting=false;car.boostTime=0;car.stuckT=0;car.grindT=0;car.passing=null;car.laneHold=0;
    event('crash',car,{reason,speed:car.speed});
  }
  function endCrash(car) {
    const p=track.sample(car.routeS),lane=clamp(car.isPlayer?0:car.lane*.5,-track.width*.2,track.width*.2);
    car.x=p.x+p.normal.x*lane;car.y=p.y;car.z=p.z+p.normal.z*lane;car.heading=p.heading;car.s=p.s;car.previousS=car.routeS;car.lateral=lane;
    car.speed=CRASH_RESTART;car.steer=0;car.slipAngle=0;car.gearInit=false;car.gearT=1;car.rpm=.3;car.offroad=false;car.offroadTime=0;car.recoveryTime=1.2;car.wallCooldown=.5;car.crashT=0;
    event('crashRecover',car);
  }
  function aiInput(car){return aiOn?aiInput2(car):aiInputV1(car);}
  /* racing-deep-m2 computer drivers (config.ai=false or ?racingAi=0 restores aiInputV1).
   * Reference, one line each (good phone racers: Real Racing 3, Asphalt 9, F1 Mobile): overtaking = pick the side with more free road, commit for 1.5-2.5 s, only with a
   * speed advantage or a tow, otherwise follow at a gap; braking = brake point from the corner speed and the braking distance, earlier behind traffic; line = wide on entry,
   * inside at the apex; defending = the leader covers the inside when a rival is within a second; contact = both cars move apart at once, the car behind loses more. */
  function aiInput2(car) {
    const p=track.project(car.x,car.z,car.s), look=10+car.speed*.5, W=track.width, edge=W*.5-2.3, dt=FIXED_STEP;
    car.laneHold=Math.max(0,car.laneHold-dt);
    // corner geometry ahead (rad per metre; positive = the road bends toward +lateral, so the inside is +lateral)
    const turnAt=(a,b)=>(track.headingAt(p.s+b)-track.headingAt(p.s+a))/(b-a);
    const here=turnAt(0,14),near=turnAt(10,42),inCorner=Math.min(1,Math.abs(here)*170),entering=Math.min(1,Math.abs(near)*140)*(1-inCorner);
    const k=W*.26,insideNear=Math.sign(near)||1;
    // racing line: apex inside, wide before the corner, the driver's own lane on straights
    const line=clamp(Math.sign(here)*inCorner*k-insideNear*entering*k*.85+car.aiBias*W*.18*(1-inCorner)*(1-entering),-edge,edge);
    // traffic: nearest car ahead in my corridor, a close rival behind, anyone alongside
    let ahead=null,behind=null,alongside=0;
    for(const o of cars){
      if(o===car||o.finished)continue;
      const g=wrapRacingDistance(o.s-car.s,track.length),gap=g>track.length/2?g-track.length:g,dl=o.lateral-car.lateral;
      if(gap>0&&gap<40&&Math.abs(o.lateral-car.targetLane)<4&&(!ahead||gap<ahead.gap))ahead={o,gap,dl};
      if(gap<0&&gap>-14&&Math.abs(dl)<4.5&&o.speed>car.speed-1&&(!behind||gap>behind.gap))behind={o,gap,dl};
      if(Math.abs(gap)<5&&Math.abs(dl)<3.4&&Math.abs(dl)>.2)alongside+=Math.sign(dl);
    }
    if(car.passing&&!cars.some(o=>o.id===car.passing&&!o.finished&&wrapRacingDistance(o.s-car.s,track.length)<track.length/2))car.passing=null;
    // overtaking: with a speed advantage, a tow or a crawling car ahead, pick the side with more free room (the inside of the next corner counts extra)
    if(ahead&&ahead.gap<26&&car.laneHold<=0&&(car.maxSpeed>ahead.o.speed*1.01||car.draft>.3||ahead.o.speed<6||ahead.o.crashT>0)){
      const room=side=>{const lat=ahead.o.lateral+side*3.8;if(Math.abs(lat)>edge)return -1;
        for(const o of cars){if(o===car||o===ahead.o||o.finished)continue;const g=wrapRacingDistance(o.s-car.s,track.length),gap=g>track.length/2?g-track.length:g;if(Math.abs(gap)<16&&Math.abs(o.lateral-lat)<3.2)return -1;}
        return edge-Math.abs(lat)+(Math.sign(lat)===insideNear&&entering>.3?3:0)+(side===Math.sign(car.aiStyle-.5)?.5:0);};
      const L=room(-1),R=room(1);
      if(L>=0||R>=0){car.targetLane=clamp(ahead.o.lateral+(R>L?1:-1)*3.8,-edge,edge);car.laneHold=1.5+random();car.passing=ahead.o.id;event('overtake',car,{target:ahead.o.id});}
    }
    if(car.laneHold<=0){
      car.targetLane=moveToward(car.targetLane,line,dt*3);
      // defending: a rival close behind and a corner coming: cover the inside
      if(behind&&entering>.25)car.targetLane=moveToward(car.targetLane,insideNear*k,dt*4);
    }
    // never lean into a car alongside
    if(alongside)car.targetLane=clamp(car.targetLane-Math.sign(alongside)*dt*5,-edge,edge);
    car.targetLane=clamp(car.targetLane,-edge,edge);
    const target=track.sample(p.s+look);
    const tx=target.x+target.normal.x*car.targetLane,tz=target.z+target.normal.z*car.targetLane;
    const error=racingAngle(Math.atan2(tx-car.x,tz-car.z)-car.heading);
    const turnRate=2*Math.sin(error)*Math.max(10,car.speed)/Math.max(8,look);
    // corner speed with a braking distance: the sharpest corner within 100 m limits the speed now (brake point), the closest one the speed in it
    const aLat=stage.aiCorner||13.5,aBrake=15+2*car.aiStyle;
    let targetSpeed=car.maxSpeed;
    for(let d=4;d<=104;d+=10){const c=Math.abs(track.headingAt(p.s+d+9)-track.headingAt(p.s+d-3))/12;if(c<.0025)continue;const vc=Math.sqrt(aLat/c),allowed=Math.sqrt(vc*vc+2*aBrake*Math.max(0,d-6));targetSpeed=Math.min(targetSpeed,allowed);}
    // following: no running into the car ahead unless this is the pass; keep about 0.4 s of gap
    if(ahead&&car.passing!==ahead.o.id&&Math.abs(ahead.dl)<3){const g=ahead.gap-4.2;if(g<car.speed*.45)targetSpeed=Math.min(targetSpeed,Math.max(6,ahead.o.speed-(g<2.5?4:0)));}
    const brake=car.speed>targetSpeed+2.5;car.braking=brake;
    const steer=clamp(turnRate/steeringRate(car.speed,false),-1,1);
    return {steer,throttle:car.speed<targetSpeed?1:0,autoAccelerate:false,brake,
      drift:false,nitro:car.nitro>60&&Math.abs(near)<.006&&car.speed>22&&car.recoveryTime<=0&&(!ahead||ahead.gap>12||car.passing===ahead.o.id),targetSpeed};
  }
  function aiInputV1(car) {
    const p=track.project(car.x,car.z,car.s), look=10+car.speed*.5;
    car.laneHold=Math.max(0,car.laneHold-FIXED_STEP);
    let blocked=null;
    for(const other of cars) {
      if(other===car||other.finished)continue;
      const ahead=wrapRacingDistance(other.s-car.s,track.length);
      if(ahead>0&&ahead<18&&Math.abs(other.lateral-car.targetLane)<3.4&&(!blocked||ahead<blocked.ahead))blocked={other,ahead};
    }
    if(blocked&&car.laneHold<=0) {
      const choices=[-track.width*.25,0,track.width*.25];
      choices.sort((a,b)=>Math.abs(b-blocked.other.lateral)-Math.abs(a-blocked.other.lateral));
      car.targetLane=choices[0];car.laneHold=1.2+random()*.9;
      event('overtake',car);
    }
    if(!blocked&&car.laneHold<=0)car.targetLane=moveToward(car.targetLane,car.aiBias,FIXED_STEP*1.6);
    const target=track.sample(p.s+look);
    const tx=target.x+target.normal.x*car.targetLane,tz=target.z+target.normal.z*car.targetLane;
    const error=racingAngle(Math.atan2(tx-car.x,tz-car.z)-car.heading);
    const turnRate=2*Math.sin(error)*Math.max(10,car.speed)/Math.max(8,look);
    const curvature=Math.abs(racingAngle(track.sample(p.s+22).heading-track.sample(p.s+4).heading))/18;
    let targetSpeed=Math.min(car.maxSpeed,Math.sqrt((stage.aiCorner||13.5)/Math.max(.003,curvature)));
    if(blocked&&blocked.ahead<7&&Math.abs(car.lateral-blocked.other.lateral)<2.8)targetSpeed=Math.min(targetSpeed,blocked.other.speed*.94);
    const steer=clamp(turnRate/steeringRate(car.speed,false),-1,1);
    return {steer,throttle:car.speed<targetSpeed?1:0,autoAccelerate:false,brake:car.speed>targetSpeed+2,
      drift:false,nitro:car.nitro>60&&curvature<.009&&car.speed>22&&car.recoveryTime<=0,targetSpeed};
  }
  function steeringRate(speed,drifting) {
    return 1.72*(.2+.8*Math.min(speed/12,1))/(1+Math.max(0,speed-25)*.016)*(drifting?1.22:1);
  }
  function integrate(car,input,dt) {
    if(car.finished) {car.speed=moveToward(car.speed,0,dt*12);return;}
    if(!Number.isFinite(car.x+car.z+car.heading+car.speed))recoverCar(car);
    if(car.crashT>0){
      // flipping: the car slides on and stops (no wall or gate logic), then endCrash() restarts it on the track
      car.crashT=Math.max(0,car.crashT-dt);car.speed*=Math.exp(-dt*4.5);car.x+=Math.sin(car.heading)*car.speed*dt;car.z+=Math.cos(car.heading)*car.speed*dt;
      const slide=track.project(car.x,car.z,car.s);car.lateral=slide.lateral;car.s=slide.s;car.y=slide.y;
      if(walls&&Math.abs(slide.lateral)>wallLimit){const side=Math.sign(slide.lateral),inside=wallLimit-.12;car.x=slide.x+slide.normal.x*side*inside;car.z=slide.z+slide.normal.z*side*inside;car.lateral=side*inside;car.speed*=.3;}
      if(car.crashT<=0)endCrash(car);return;
    }
    const before=track.project(car.x,car.z,car.s);
    // Collision separation happens after driving. Include that small physical displacement
    // in the next gate sweep so a bumper nudge cannot silently invalidate a full lap.
    const separationDelta=racingAngle((before.s-car.s)/track.length*Math.PI*2)/(Math.PI*2)*track.length;
    if(Math.abs(separationDelta)<2.6)car.routeS+=separationDelta;
    const steer=clamp(finite(input.steer),-1,1), throttle=input.autoAccelerate!==false?1:clamp(finite(input.throttle),0,1);
    // racing-v9 feel (player only; AI tuning untouched, ?racingFeel=0 via config.feel=false): faster response, gentler small inputs at speed.
    const feel=car.isPlayer&&config.feel!==false,speedF=clamp((car.speed-28)/17,0,1);
    const steerIn=feel?steer*(1-.3*speedF*(1-Math.abs(steer))):steer;
    car.steer+= (steerIn-car.steer)*(1-Math.exp(-dt*(feel?16:11)));
    car.recoveryTime=Math.max(0,car.recoveryTime-dt);car.collisionCooldown=Math.max(0,car.collisionCooldown-dt);
    car.padCooldown=Math.max(0,car.padCooldown-dt);car.boostTime=Math.max(0,car.boostTime-dt);
    const drifting=!!input.drift&&car.speed>12&&!car.offroad&&Math.abs(car.steer)>.16;
    if(drifting)car.driftCharge=clamp(car.driftCharge+dt*(.55+Math.abs(car.steer)*.55),0,2.7);
    else if(car.drifting) {
      if(car.driftCharge>.32){car.boostTime=Math.max(car.boostTime,Math.min(1.9,car.driftCharge*.8));event('driftBoost',car,{charge:car.driftCharge});}
      car.driftCharge=0;
    }
    car.drifting=drifting;
    const nitro=!!input.nitro&&car.nitro>.1&&car.speed>3&&!car.offroad;
    if(nitro){const use=Math.min(car.nitro,dt*29/nitroUpgrade);car.nitro-=use;car.ersUsed+=use;}
    car.boosting=nitro||car.boostTime>0;
    // racing-v9 slipstream: 5-22 m behind another car, nearly in its line, gives up to +7% top speed and stronger pull (config.draft=false disables).
    let draft=0;
    if(config.draft!==false&&!car.finished)for(const other of cars){
      if(other===car||other.finished)continue;
      const gap=wrapRacingDistance(other.s-car.s,track.length);
      if(gap>3&&gap<22&&Math.abs(other.lateral-car.lateral)<2.4&&other.speed>car.speed*.7)draft=Math.max(draft,(1-(gap-3)/19)*(1-Math.abs(other.lateral-car.lateral)/2.4));
    }
    car.draft+=(draft-car.draft)*(1-Math.exp(-dt*(draft>car.draft?2.2:4)));
    const maxSpeed=(car.isPlayer?stage.playerSpeed*engine:car.maxSpeed)*(1+.07*car.draft*aeroUp)+(car.boosting?12:0);
    const offLimit=car.offroad?19:Infinity;
    const target= Math.min(offLimit,maxSpeed)*(throttle?1:0);
    const acceleration=(car.boosting?17:12.5)*(1+.4*car.draft);
    if(engineModel){
      // racing-v11 gearbox: seven gears share the speed range. Thrust is highest at the start of each gear and fades towards the next shift,
      // every shift cuts the drive for a moment, and the pull weakens as the speed nears the top: reaching the top takes about 20-25 s.
      const top=Math.max(8,(car.isPlayer?stage.playerSpeed*engine:car.maxSpeed)),ratio=clamp(car.speed/top,0,.999);
      // racing-ers-v1: shifts have hysteresis and a dwell time. Without them a speed hovering at a shift point flipped gears several times a second
      // (6>7>6 within 0.1 s in the player run), every flip played a shift sound and cut the drive: the "unclear noise" at shifts.
      // racing-grid-v1: more corners = earlier upshifts (up to 12% lower shift points on a twisty circuit, a little more while steering or braking); the sound is unchanged,
      // only the speed at which each gear is left moves. config.shiftMap=false (or ?racingShiftMap=0) keeps the fixed points.
      const scale=shiftMapOn?1-.12*clamp(track.cornerFraction/.5,0,1)-(car.isPlayer?.04*Math.min(1,Math.abs(car.steer))+(input.brake?.03:0):0):1,B=GEAR_BOUNDS;
      let up=1;while(up<GEARS&&ratio>=B[up]*scale)up++;
      let down=1;while(down<GEARS&&ratio+.035>=B[down]*scale)down++;
      car.gearT+=dt;let g=car.gear;
      if(!car.gearInit){g=up;car.gearInit=true;}
      else if(up>g&&car.gearT>=.35){g++;car.gearT=0;}
      else if(down<g&&car.gearT>=.6){g--;car.gearT=0;}
      // gear 7 ends at the natural top (TOP_CAP) so the revs read near the limiter there; beyond it (slipstream, boost) the rpm stays at the limiter
      const lo=B[g-1]*scale,hi=g<GEARS?B[g]*scale:(topCapOn?TOP_CAP:1),frac=clamp((ratio-lo)/(hi-lo),0,1);
      if(g>car.gear&&throttle&&car.speed>1)car.shiftT=SHIFT_CUT;
      car.gear=g;car.shiftT=Math.max(0,car.shiftT-dt);
      const shape=(1.4-.75*frac)*(revShiftOn&&g<GEARS&&frac>.8?1+REV_PULL*(frac-.8)/.2:1),cut=car.shiftT>0?.06:1;
      const goal=topCapOn?Math.min(target,(top*TOP_CAP*(1+.07*car.draft*aeroUp)+(car.boosting?12:0))*(throttle?1:0)):target;
      if(throttle&&car.speed<goal){
        // gears 1-6 pull towards the full top as before (the rise is unchanged); gear 7 pulls towards the natural top, so the car keeps creeping up to it
        const pull=((g>=GEARS?goal:target)-car.speed)/ENGINE_TAU*shape*cut*(1+.4*car.draft)*(car.boosting?2.1:1)*(car.isPlayer?engineUp:1);
        car.speed=Math.min(goal,car.speed+pull*dt);
      } else car.speed=moveToward(car.speed,goal,dt*5);
      const rpmTarget=throttle?.2+.8*frac:Math.max(.12,.14+.5*frac);
      car.rpm+=(rpmTarget-car.rpm)*(1-Math.exp(-dt*(car.shiftT>0?30:12)));
    } else car.speed=moveToward(car.speed,target,dt*(throttle?acceleration:5));
    if(input.brake&&!drifting)car.speed=Math.max(0,car.speed-dt*27*(car.isPlayer?brakeUp:1));
    if(drifting)car.speed=Math.max(0,car.speed-dt*2.2);
    if(car.offroad)car.speed=Math.max(0,car.speed-dt*8);
    let yaw=car.steer*steeringRate(car.speed,drifting)*(car.isPlayer?grip*steerUp:1);
    // Soft cap on cornering force at speed (about 4 g): full lock stops snapping the car around at 40+ m/s but keeps its authority.
    if(feel&&car.speed>10&&!drifting){const limit=LAT_CAP*aeroUp/car.speed;yaw=limit*Math.tanh(yaw/limit);}
    // racing-look-v1 cornering scrub (player only; ?racingLook=0 or config.scrub=false removes it): lateral acceleration above 20 m/s^2 bleeds speed (a drift bleeds at half the rate),
    // so a corner of radius R settles near sqrt(20 R). Without it the car held top speed round every bend (Roy: the engine sound stuck at the top).
    let scrubbed=0;
    if(RACING_LOOK&&config.scrub!==false&&car.isPlayer&&!car.offroad){const over=Math.abs(yaw)*car.speed-20;if(over>0){car.speed=Math.max(8,car.speed-over*(drifting?.35:.4)*dt);scrubbed=over;}}
    // racing-ers-v1 energy recovery (the player only; config.ers=false or ?racingErs=0 removes it): braking, the energy a corner scrubs, drifting and a clean centred
    // line charge the same meter nitro spends. Like an F1 ERS the car recharges while it drives and spends the charge on demand.
    if(ersOn&&car.isPlayer){
      let rate=0;
      if(input.brake&&!drifting&&car.speed>12)rate+=ERS.brake;
      rate+=Math.min(ERS.cornerMax,scrubbed*ERS.corner);
      if(drifting)rate+=ERS.drift;
      if(car.speed>22&&!car.offroad&&car.recoveryTime<=0&&Math.abs(before.lateral)<track.width*.2&&Math.abs(car.steer)<.15)rate+=ERS.line;
      if(car.boosting&&input.nitro)rate=0;
      const cap=100*nitroUpgrade,wasFull=car.nitro>=cap-.5,gain=Math.max(0,Math.min(cap-car.nitro,rate*dt));car.nitro+=gain;car.ersHarvested+=gain;
      car.ersRate+=(rate-car.ersRate)*(1-Math.exp(-dt*8));car.charging=car.ersRate>1.2&&car.nitro<cap-.5?1:0;
      // racing-deep-m3: one 'ersFull' event per fill (HUD: "ERS מלא" once, a short buzz); the next one needs a spend first
      if(!wasFull&&gain>0&&car.nitro>=cap-.5)event('ersFull',car);
    }
    if(car.isPlayer&&Math.abs(steer)<.065&&config.steeringAssist!==false&&!car.offroad) {
      // Small guidance softens a released steering pad. It cannot negotiate a lap by itself.
      const look=track.sample(before.s+12), error=racingAngle(look.heading-car.heading);
      yaw+=clamp(error*.65,-.26,.26);
    }
    car.heading=racingAngle(car.heading+yaw*dt);
    // Heading is the physical body orientation; slip is its angle to the velocity.
    // Tyre grip builds and returns progressively instead of snapping on button release.
    const targetSlip=drifting?car.steer*.29:0;
    car.slipAngle+=(targetSlip-car.slipAngle)*(1-Math.exp(-dt*(drifting?5.5:3.8)));
    const motionHeading=car.heading-car.slipAngle;
    car.x+=Math.sin(motionHeading)*car.speed*dt;car.z+=Math.cos(motionHeading)*car.speed*dt;
    car.distanceDriven+=car.speed*dt;
    const after=track.project(car.x,car.z,before.s);
    car.y=after.y;car.s=after.s;car.lateral=after.lateral;
    // racing-v9: fences along the whole road. A hit pushes the car back inside, scrubs 25-45% of its speed
    // (more for a straight hit and for more speed) and turns it toward the road direction; it never leaves the circuit.
    car.wallCooldown=Math.max(0,car.wallCooldown-dt);
    if(walls&&Math.abs(after.lateral)>wallLimit) {
      const side=Math.sign(after.lateral),inside=wallLimit-.12;
      car.x=after.x+after.normal.x*side*inside;car.z=after.z+after.normal.z*side*inside;car.lateral=side*inside;
      const dx=Math.sin(motionHeading),dz=Math.cos(motionHeading),into=clamp(side*(dx*after.normal.x+dz*after.normal.z),0,1);
      if(into>.02&&car.wallCooldown<=0) {
        const angleF=Math.min(1,into/.6),speedF=clamp((car.speed-8)/32,0,1),loss=.25+.2*(.7*angleF+.3*speedF);
        event('wall',car,{intensity:into,loss,speed:car.speed});
        const impact=car.speed*into;
        car.speed*=1-loss;car.wallHits++;car.wallCooldown=.3;car.drifting=false;car.driftCharge=0;
        if(crashOn&&impact>CRASH_IMPACT)startCrash(car,'wall');
      } else if(car.wallCooldown>0)car.speed=Math.max(0,car.speed-dt*3);
      const error=racingAngle(car.heading-after.heading);car.heading=racingAngle(after.heading+error*(into>.02?.4:.8));
      car.slipAngle=0;car.steer*=.5;
    }
    // racing-deep-m2 grind: riding the fence (within 0.6 m of it, still moving) for GRIND_TIME seconds flips the car: "stuck at the side for too long" (config.grind=false or ?racingGrind=0 removes it)
    if(walls&&Math.abs(car.lateral)>wallLimit-.6&&car.speed>3){if(crashOn&&config.grind!==false&&state.phase==='racing'&&car.recoveryTime<=0&&car.crashT<=0){car.grindT+=dt;if(car.grindT>GRIND_TIME)startCrash(car,'grind');}}
    else car.grindT=Math.max(0,car.grindT-dt*1.5);
    const delta=racingAngle((after.s-before.s)/track.length*Math.PI*2)/ (Math.PI*2)*track.length;
    const maxDelta=Math.max(2,car.speed*dt*2.2);
    const plausible=Math.abs(delta)<=maxDelta;
    if(plausible)car.routeS+=delta;
    car.offroad=Math.abs(car.lateral)>track.width*.5+.4;
    if(crashOn&&state.phase==='racing'&&state.time>4&&car.recoveryTime<=0&&car.crashT<=0){
      const trying=!car.isPlayer||input.autoAccelerate!==false||finite(input.throttle)>0||input.nitro;
      if(trying&&car.speed<2.5)car.stuckT+=dt;else car.stuckT=Math.max(0,car.stuckT-dt*2);
      if(car.stuckT>STUCK_TIME)startCrash(car,'stuck');
    }
    car.offroadTime=car.offroad?car.offroadTime+dt:Math.max(0,car.offroadTime-dt*2);
    const physicalGateDistance=Math.abs(racingAngle((after.s-wrapRacingDistance(car.nextCheckpoint*sector,track.length))/track.length*Math.PI*2))*track.length/(Math.PI*2);
    if(plausible&&delta>0&&physicalGateDistance<maxDelta+1&&car.routeS>=car.nextCheckpoint*sector&&car.previousS<car.nextCheckpoint*sector&&
      Math.abs(before.lateral)<track.width*.64&&Math.abs(after.lateral)<track.width*.64&&Math.abs(racingAngle(after.heading-car.heading))<1.3) {
      car.checkpoints++;car.nextCheckpoint++;
      car.lap=Math.min(stage.laps,1+Math.floor(car.checkpoints/track.checkpoints.length));
      if(car.checkpoints%track.checkpoints.length===0){const lapTime=state.time-(car.lapStart||0);car.lapStart=state.time;car.lapTimes.push(lapTime);event('lap',car,{lap:car.lap,lapTime});}
      if(car.checkpoints>=track.checkpoints.length*stage.laps){car.finished=true;car.finishTime=state.time;event('finish',car);}
    }
    car.previousS=car.routeS;
    car.progress=car.checkpoints*sector+clamp(car.routeS-car.checkpoints*sector,-sector,sector-.01);
    if(car.offroadTime>3.5||Math.abs(after.lateral)>track.width*2.8||car.routeS>car.nextCheckpoint*sector+sector*.8)recoverCar(car);
    if(car.padCooldown<=0&&!car.offroad&&car.recoveryTime<=0)for(const pad of track.boostPads) {
      const distance=Math.abs(racingAngle((after.s-pad.s)/track.length*Math.PI*2))*track.length/(Math.PI*2);
      if(distance<pad.length*.5&&Math.abs(car.lateral)<track.width*.36){car.boostTime=Math.max(car.boostTime,1.1);car.padCooldown=2;event('boostPad',car);break;}
    }
    if(!car.offroad&&car.recoveryTime<=0)for(const pickup of state.collectibles) {
      const px=pickup.x+pickup.normal.x*pickup.lane,pz=pickup.z+pickup.normal.z*pickup.lane;
      if(pickup.active&&Math.hypot(car.x-px,car.z-pz)<3.4){pickup.active=false;pickup.respawnAt=state.time+8;car.nitro=Math.min(100*nitroUpgrade,car.nitro+31);car.pickups++;event('pickup',car,{pickup:pickup.id});}
    }
  }
  function updateRanks() {
    const sorted=[...cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);
    sorted.forEach((car,index)=>{if(state.phase==='racing'&&index+1<car.rank&&!car.finished){car.passes++;event('pass',car,{rank:index+1});}car.rank=index+1;});state.rank=player.rank;
  }
  function conclude() {
    updateRanks();
    // the result contract and the league see the five scoring cars only (extra rivals are traffic)
    const order=[...cars].filter(c=>c.scoring!==false).sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress),
      finished=player.finished,rank=order.indexOf(player)+1,won=finished&&rank<=stage.targetRank;
    state.result={won,stars:won?Math.max(0,4-rank):0,rank,stage:stage.id,seed:state.seed,durationSeconds:state.time,
      laps:Math.floor(player.checkpoints/track.checkpoints.length),checkpoints:player.checkpoints,
      requiredCheckpoints:track.checkpoints.length*stage.laps,finished:true};
    state.phase='finished';event('result',player,{won});
  }
  function tick(input) {
    if(state.phase==='countdown') {state.countdown=Math.max(0,state.countdown-FIXED_STEP);state.elapsed+=FIXED_STEP;if(state.countdown<=.000001){state.countdown=0;state.phase='racing';event('start');}return;}
    state.time+=FIXED_STEP;state.elapsed+=FIXED_STEP;
    for(const pickup of state.collectibles)if(!pickup.active&&state.time>=pickup.respawnAt)pickup.active=true;
    integrate(player,input,FIXED_STEP);
    for(let index=1;index<cars.length;index++)integrate(cars[index],aiInput(cars[index]),FIXED_STEP);
    for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++) {
      const first=cars[a],second=cars[b],dx=second.x-first.x,dz=second.z-first.z,d=Math.hypot(dx,dz);
      if(d>0.01&&d<2.55&&!first.finished&&!second.finished) {
        const nx=dx/d,nz=dz/d;
        if(aiOn){
          // racing-deep-m2 contact: the two cars move apart at once (the whole overlap, more of it on the car behind), a rear-end hit costs the car behind its speed and
          // nudges the leader on; two cars pressed together sideways slide apart along the road normal, so no pair can stay locked (both free within a second).
          const rear=wrapRacingDistance(second.s-first.s,track.length)<track.length/2?first:second,front=rear===first?second:first,sign=rear===first?-1:1;
          const overlap=2.55-d,pr=overlap*.7,pf=overlap*.35;
          rear.x+=sign*nx*pr;rear.z+=sign*nz*pr;front.x-=sign*nx*pf;front.z-=sign*nz*pf;
          const tan=track.sample(front.s),along=Math.abs(nx*tan.tangent.x+nz*tan.tangent.z);
          if(first.collisionCooldown<=0&&second.collisionCooldown<=0){
            if(along>.7){rear.speed*=.88;front.speed=Math.min(front.speed+1.2,front.maxSpeed||front.speed+1.2);}else{first.speed*=.95;second.speed*=.95;}
            first.collisionCooldown=.5;second.collisionCooldown=.5;event('bump',first,{with:second.id,along});
          }
          if(first.speed<4&&second.speed<4){const side=Math.sign((second.lateral-first.lateral)||(first.id<second.id?1:-1));
            first.x-=tan.normal.x*side*.05;first.z-=tan.normal.z*side*.05;second.x+=tan.normal.x*side*.05;second.z+=tan.normal.z*side*.05;}
        } else {
          const push=(2.55-d)*.48;
          first.x-=nx*push;first.z-=nz*push;second.x+=nx*push;second.z+=nz*push;
          if(first.collisionCooldown<=0&&second.collisionCooldown<=0){first.speed*=.92;second.speed*=.92;first.collisionCooldown=.6;second.collisionCooldown=.6;event('bump',first);}
        }
      }
    }
    updateRanks();if(player.finished||state.time>=stage.timeLimit)conclude();
  }
  updateRanks();
  return {state,track,stage,
    step(dt,input={}) {
      state.events=[];
      if(state.disposed||state.phase==='paused'||state.phase==='finished')return state;
      accumulator+=clamp(finite(dt),0,.25);
      while(accumulator+1e-10>=FIXED_STEP&&state.phase!=='finished'){accumulator-=FIXED_STEP;tick(input);}
      return state;
    },
    pause(){if(state.phase==='racing'||state.phase==='countdown'){pausedPhase=state.phase;state.phase='paused';}return state;},
    resume(){if(state.phase==='paused')state.phase=pausedPhase;return state;},
    recover(){if(state.phase==='racing'&&player.recoveryTime<=0)recoverCar(player,true);return state;},
    dispose(){state.disposed=true;state.events=[];accumulator=0;}
  };
}
