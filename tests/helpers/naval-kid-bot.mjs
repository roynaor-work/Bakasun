// Ships v24 (14/11/2026): a headless "child" for the naval model, with human noise. Used by tests/island-aliens-naval-v24.test.mjs and the
// calibration in workout/island/verification/aliens-naval-v24 (numbers in the session report). It plays through the model's real inputs
// (the same fields the touch layer sends), reads the model only, and never edits its state.
//  - sees an incoming shot (a decal) with probability `notice` after a reaction of 0.45-1.0 s, and then turns across its course and
//    sails out for about 1.3 s; otherwise it wanders (sails in a random direction 55% of the time, changes every 1.5-4 s), and when the
//    lock says "too far" it sails toward the locked hull;
//  - aim style: 'lockButton' (v24: taps the Lock button), 'tapShip' (taps the ship: a lock in v24, a selection and quick shots in v23),
//    'longPress' (v23's long press, 0.45 s), 'quick' (no lock: quick shots where the turret points); it taps Fire every 0.5-1.6 s
//    whether the lock is green or not (a child does not wait), and now and then (`forget`) taps Fire with no lock at all;
//  - holds the Vulcan while an aircraft is up, with its crosshair 6-20 degrees off (the v24 magnet may pull it on);
//  - uses the Torpedo button against a diving submarine (v24), and sails to a supply buoy when its magazine is low.
import {navalSkyAngles} from '../../workout/island/minigames/naval-air.mjs';
import {seededRandom} from '../../workout/island/minigames/context.mjs';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function kidBot({seed=1,balance,style='lockButton',notice=.7,forget=.15,vulcanErrorDeg=[6,20],skill=1}={}){
 const r=seededRandom(seed*977+13),between=(a,b)=>a+(b-a)*r();
 let wanderUntil=0,wanderHeading=null,dodge=null,seen=new Set(),nextFire=between(1,2),lockAt=between(.6,1.6),lockedOnce=false,press=null,pressUntil=0,skyErr=null,torpAt=0,lastLockIndex=null,tapAt=0;
 const stats={fireTaps:0,lockTaps:0,dodges:0,torpedoTaps:0,vulcanHeld:0};
 function steer(m,heading){const cam=m.camera?.heading||0,d=wrap(heading-cam);return {moveX:Math.sin(d),moveZ:-Math.cos(d)};}
 function step(m){
  const t=m.time,ship=m.playerShip,input={};
  // 1. Dodge: notice each new incoming shot (or a hull's attack) once, react after a human delay, turn across the course and sail out.
  const threats=[];for(const e of m.enemies||[])if(e.active&&e.hp>0&&e.attack)for(const q of (e.attack.points||[e.attack]))threats.push({id:`${e.index}:${e.attack.fireTime.toFixed(2)}:${q.x.toFixed(0)}`,x:q.x,z:q.z,at:e.attack.fireTime});
  for(const e of m.enemies||[])for(const a of e.attacks||[])threats.push({id:`b${e.index}:${a.fireTime.toFixed(2)}:${a.x.toFixed(0)}`,x:a.x,z:a.z,at:a.fireTime});
  for(const a of m.air||[])if(a.attack)threats.push({id:`a${a.id}:${a.attack.fireTime.toFixed(2)}`,x:a.attack.x,z:a.attack.z,at:a.attack.fireTime});
  for(const th of threats){if(seen.has(th.id))continue;seen.add(th.id);if(r()<notice*skill){const near=Math.hypot(th.x-ship.x,th.z-ship.z)<42;if(near&&(!dodge||dodge.until<t))dodge={from:t+between(.45,1),until:t+between(.45,1)+between(1.1,1.6),x:th.x,z:th.z};}}
  if(dodge&&t>=dodge.from&&t<dodge.until){const away=Math.atan2(ship.z-dodge.z,ship.x-dodge.x),across=[ship.heading+Math.PI/2,ship.heading-Math.PI/2].sort((a,b)=>Math.abs(wrap(a-away))-Math.abs(wrap(b-away)))[0];Object.assign(input,steer(m,across));if(!dodge.counted){dodge.counted=true;stats.dodges++;}}
  else{
   // 2. Wander (or sail to a buoy when the magazine is low).
   // v24.1 radar: "out of the radar's range" (a refused or lost lock, shown for a moment) reads like "too far": the child sails toward that hull.
   const outOfRange=m.radarOn&&m.radarLost&&t-m.radarLost.time<2.5&&(m.enemies||[]).find(e=>e.index===m.radarLost.index&&e.active&&e.hp>0);
   const buoy=(m.buoys||[])[0],far=(m.homing?.status==='far'&&(m.enemies||[]).find(e=>e.index===m.homing.index))||outOfRange,near=m.homing?.status==='near'&&(m.enemies||[]).find(e=>e.index===m.homing.index);
   if(buoy&&(m.loaded??99)<=4){Object.assign(input,steer(m,Math.atan2(buoy.z-ship.z,buoy.x-ship.x)));}
   // The lock says "too far, get closer": the child sails toward it.
   else if(far){Object.assign(input,steer(m,Math.atan2(far.z-ship.z,far.x-ship.x)));}
   // "Too close, back off": the child sails away from it.
   else if(near){Object.assign(input,steer(m,Math.atan2(ship.z-near.z,ship.x-near.x)));}
   else{if(t>=wanderUntil){wanderUntil=t+between(1.5,4);wanderHeading=r()<.55?between(-Math.PI,Math.PI):null;}
    if(wanderHeading!==null){let h=wanderHeading;if(ship.x<60)h=0;else if(ship.x>360)h=Math.PI;if(ship.z<-150)h=Math.PI/2;else if(ship.z>150)h=-Math.PI/2;Object.assign(input,steer(m,h));}}
  }
  // 3. Lock (by style), after a human delay; re-lock after a sinking if the model does not do it.
  const live=(m.enemies||[]).filter(e=>e.active&&e.hp>0);
  // v24.1 radar: while the gauge fills (m.radar) the child waits for it, as it waits for the lock itself.
  if(style==='lockButton'&&!m.homing&&!m.radar&&t>=lockAt&&live.length&&m.aimV24){input.lockSmart=true;stats.lockTaps++;lockAt=t+between(.8,1.8);lockedOnce=true;}
  if(style==='tapShip'&&live.length&&t>=lockAt&&(!m.homing||!m.aimV24)&&!m.radar){
   const target=live.sort((a,b)=>Math.hypot(a.x-ship.x,a.z-ship.z)-Math.hypot(b.x-ship.x,b.z-ship.z))[0];
   if(m.aimV24)input.lockTap=target.index;else input.selectTargetIndex=target.index;stats.lockTaps++;lockAt=t+between(1,2.2);
  }
  if(style==='longPress'&&!m.homing&&live.length&&t>=lockAt){
   if(!press){const target=live.sort((a,b)=>Math.hypot(a.x-ship.x,a.z-ship.z)-Math.hypot(b.x-ship.x,b.z-ship.z))[0];press={index:target.index,at:t};}
   if(t-press.at>=.47){input.lockTarget=press.index;press=null;stats.lockTaps++;lockAt=t+between(.8,1.8);}else input.lockPress={index:press.index,progress:(t-press.at)/.45};
  }
  // 4. Fire taps at a child's rhythm (the lock fires when its turret comes on, v23 and v24 alike).
  if(t>=nextFire&&live.length){nextFire=t+between(.5,1.6);const noLock=!m.homing;
   if(noLock&&style!=='quick'&&r()>forget){/* waits for its lock */}
   else{input.quickShot=true;stats.fireTaps++;}}
  // 5. Vulcan while an aircraft is up: the crosshair is off by a child's error (the v24 magnet may pull it on).
  const up=(m.air||[]).filter(a=>a.state!=='down');
  if(up.length){const a=up.sort((x,y)=>Math.hypot(x.x-ship.x,x.z-ship.z)-Math.hypot(y.x-ship.x,y.z-ship.z))[0],ang=navalSkyAngles(ship,a,balance);if(skyErr===null||r()<.02)skyErr={yaw:(r()<.5?-1:1)*between(...vulcanErrorDeg)*Math.PI/180,pitch:(r()-.5)*8*Math.PI/180};
   input.skyMode='manual';input.skyHeld=true;input.skyYaw=ang.yaw+skyErr.yaw;input.skyPitch=Math.max(0,ang.pitch+skyErr.pitch);stats.vulcanHeld++;}
  else{input.skyMode='manual';skyErr=null;}
  // 6. Torpedo against a diving submarine (v24).
  const diver=live.find(e=>e.subMode==='v24'&&e.depth>0);if(diver&&m.subV24&&(m.torpedoes??0)>0&&t>=torpAt){input.torpedoShot=true;torpAt=t+between(2.5,4.5);stats.torpedoTaps++;}
  return input;
 }
 return {step,stats};
}
/** Play one stage with the bot. Returns the outcome and the measured numbers. */
export function playStage(make,stage,seed,opts={},maxSeconds=420){
 const m=make(stage,seed),bot=kidBot({seed,...opts}),dt=1/30;let frames=0;if(!opts.balance)throw Error('playStage needs opts.balance');
 while(!m.result&&m.time<maxSeconds&&frames<maxSeconds*30){m.update(dt,bot.step(m));frames++;}
 const s=m.snapshot(),ls=s.lastShot;
 return {stage,seed,outcome:m.result?.outcome||'timeout',seconds:+m.time.toFixed(1),fired:m.fired,hits:s.hits,hitPercent:m.fired?Math.round(100*s.hits/m.fired):null,enemyFired:m.enemyFired,enemyPerMinute:+(60*m.enemyFired/Math.max(1,m.time)).toFixed(1),hpLeft:+(m.lives/m.maxLives).toFixed(2),stats:bot.stats,vulcan:m.vulcan?{shots:m.vulcan.shots,hits:m.vulcan.hits,kills:m.vulcan.kills}:null,torpedoes:s.v24?.torpedoesFired??0,underwater:s.v24?.underwaterHits??0};
}
