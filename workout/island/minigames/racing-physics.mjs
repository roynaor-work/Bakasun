import { createTrack, getRacingStage, racingAngle, wrapRacingDistance } from './racing-tracks.mjs?v=island-alpine-20261027-1';

const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const moveToward = (v,target,amount) => v < target ? Math.min(target,v+amount) : Math.max(target,v-amount);
const FIXED_STEP = 1/60;
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
  const skill=difficulty==='hard'?1.06:difficulty==='normal'?1.025:1;
  const names=['אתם','אלמוג','טורקיז','שמש','ברקת'];
  const cars=Array.from({length:1+stage.opponents},(_,index)=>{
    const start=index===0 ? -(stage.grid-1)*4 : -(index<stage.grid?index-1:index)*4;
    const lane=index===0?0:index%2?2.8:-2.8;
    const p=track.sample(start);
    return {id:index===0?'player':`ai-${index}`,name:names[index]||`רוכב ${index}`,isPlayer:index===0,
      x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed:0,steer:0,
      s:p.s,routeS:start,previousS:start,progress:start,checkpoints:0,nextCheckpoint:1,lap:1,rank:1,
      nitro:65*nitroUpgrade,boostTime:0,boosting:false,driftCharge:0,drifting:false,slipAngle:0,offroad:false,
      lateral:lane,offroadTime:0,recoveryTime:0,recoveries:0,finished:false,finishTime:null,
      distanceDriven:0,pickups:0,padCooldown:0,lane,targetLane:lane,laneHold:0,aiBias:(random()-.5)*1.4,
      maxSpeed:stage.aiSpeed*skill*(.96+random()*.075),collisionCooldown:0};
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
  function aiInput(car) {
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
    let targetSpeed=Math.min(car.maxSpeed,Math.sqrt(13.5/Math.max(.003,curvature)));
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
    const before=track.project(car.x,car.z,car.s);
    // Collision separation happens after driving. Include that small physical displacement
    // in the next gate sweep so a bumper nudge cannot silently invalidate a full lap.
    const separationDelta=racingAngle((before.s-car.s)/track.length*Math.PI*2)/(Math.PI*2)*track.length;
    if(Math.abs(separationDelta)<2.6)car.routeS+=separationDelta;
    const steer=clamp(finite(input.steer),-1,1), throttle=input.autoAccelerate!==false?1:clamp(finite(input.throttle),0,1);
    car.steer+= (steer-car.steer)*(1-Math.exp(-dt*11));
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
    if(nitro)car.nitro=Math.max(0,car.nitro-dt*29/nitroUpgrade);
    car.boosting=nitro||car.boostTime>0;
    const maxSpeed=(car.isPlayer?stage.playerSpeed*engine:car.maxSpeed)+(car.boosting?12:0);
    const offLimit=car.offroad?19:Infinity;
    const target= Math.min(offLimit,maxSpeed)*(throttle?1:0);
    const acceleration=car.boosting?17:12.5;
    car.speed=moveToward(car.speed,target,dt*(throttle?acceleration:5));
    if(input.brake&&!drifting)car.speed=Math.max(0,car.speed-dt*27);
    if(drifting)car.speed=Math.max(0,car.speed-dt*2.2);
    if(car.offroad)car.speed=Math.max(0,car.speed-dt*8);
    let yaw=car.steer*steeringRate(car.speed,drifting)*(car.isPlayer?grip:1);
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
    const delta=racingAngle((after.s-before.s)/track.length*Math.PI*2)/ (Math.PI*2)*track.length;
    const maxDelta=Math.max(2,car.speed*dt*2.2);
    const plausible=Math.abs(delta)<=maxDelta;
    if(plausible)car.routeS+=delta;
    car.offroad=Math.abs(after.lateral)>track.width*.5+.4;
    car.offroadTime=car.offroad?car.offroadTime+dt:Math.max(0,car.offroadTime-dt*2);
    const physicalGateDistance=Math.abs(racingAngle((after.s-wrapRacingDistance(car.nextCheckpoint*sector,track.length))/track.length*Math.PI*2))*track.length/(Math.PI*2);
    if(plausible&&delta>0&&physicalGateDistance<maxDelta+1&&car.routeS>=car.nextCheckpoint*sector&&car.previousS<car.nextCheckpoint*sector&&
      Math.abs(before.lateral)<track.width*.64&&Math.abs(after.lateral)<track.width*.64&&Math.abs(racingAngle(after.heading-car.heading))<1.3) {
      car.checkpoints++;car.nextCheckpoint++;
      car.lap=Math.min(stage.laps,1+Math.floor(car.checkpoints/track.checkpoints.length));
      if(car.checkpoints%track.checkpoints.length===0)event('lap',car,{lap:car.lap});
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
    sorted.forEach((car,index)=>{car.rank=index+1;});state.rank=player.rank;
  }
  function conclude() {
    updateRanks();
    const finished=player.finished,rank=player.rank,won=finished&&rank<=stage.targetRank;
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
        const push=(2.55-d)*.48, nx=dx/d,nz=dz/d;
        first.x-=nx*push;first.z-=nz*push;second.x+=nx*push;second.z+=nz*push;
        if(first.collisionCooldown<=0&&second.collisionCooldown<=0){first.speed*=.92;second.speed*=.92;first.collisionCooldown=.6;second.collisionCooldown=.6;event('bump',first);}
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
