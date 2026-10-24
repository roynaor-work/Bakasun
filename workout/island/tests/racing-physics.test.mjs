import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRacing} from '../minigames/racing-physics.mjs';
import {TRACKS,RACING_STAGES,RACING_TRACK_SCALE,createTrack,getRacingStage,racingAngle} from '../minigames/racing-tracks.mjs';
import {racingResult} from '../minigames/racing-result.mjs';

const balance=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.islandRacing;

function advance(race,seconds,input={}) {for(let n=0;n<Math.round(seconds*60);n++)race.step(1/60,input);return race.state;}
function place(race,distance,lateral=0,speed=0,{credited=true}={}) {
  const p=race.track.sample(distance),car=race.state.player;
  Object.assign(car,{x:p.x+p.normal.x*lateral,y:p.y,z:p.z+p.normal.z*lateral,heading:p.heading,speed,s:p.s,
    routeS:distance,previousS:distance,lateral,offroad:Math.abs(lateral)>race.track.width*.5+.4});
  if(credited){car.checkpoints=Math.max(0,Math.floor(distance/(race.track.length/16)));car.nextCheckpoint=car.checkpoints+1;}
  return car;
}
function drivingInput(race) {
  const p=race.state.player,t=race.track,q=t.project(p.x,p.z,p.s),look=10+p.speed*.5,target=t.sample(q.s+look);
  const error=racingAngle(Math.atan2(target.x-p.x,target.z-p.z)-p.heading);
  const rate=1.72*(.2+.8*Math.min(p.speed/12,1))/(1+Math.max(0,p.speed-25)*.016);
  const curvature=Math.abs(racingAngle(t.sample(q.s+22).heading-t.sample(q.s+4).heading))/18;
  const safeSpeed=Math.min(race.stage.playerSpeed,Math.sqrt(16/Math.max(.003,curvature)));
  return {steer:Math.max(-1,Math.min(1,2*Math.sin(error)*Math.max(10,p.speed)/look/rate)),autoAccelerate:false,
    throttle:p.speed<safeSpeed?1:0,brake:p.speed>safeSpeed+2,nitro:p.nitro>.1&&curvature<.018&&p.speed>18};
}
function driveToResult(stage,seed) {
  const race=createRacing({stage,seed,config:{countdown:0,steeringAssist:false}});
  for(let n=0;n<=Math.ceil(race.stage.timeLimit*60)&&race.state.phase!=='finished';n++)race.step(1/60,drivingInput(race));
  return race;
}

test('30 deliberate stage variations use six genuinely distinct closed circuits',()=>{
  assert.equal(TRACKS.length,6);assert.equal(RACING_STAGES.length,30);
  assert.equal(new Set(TRACKS.map(t=>JSON.stringify(t.points))).size,6);
  assert.deepEqual([...new Set(RACING_STAGES.map(s=>s.trackId))],TRACKS.map(t=>t.id));
  assert.equal(getRacingStage(1).laps,2);assert.equal(getRacingStage(12).laps,2);assert.equal(getRacingStage(13).laps,3);assert.equal(getRacingStage(30).laps,3);
  assert.equal(getRacingStage(19).reverse,true);assert.equal(getRacingStage(25).timeOfDay,'night');
  assert.ok(getRacingStage(30).aiSpeed>getRacingStage(1).aiSpeed);
});

test('closed 3D centre lines have gentle elevation and no crossing at road level',()=>{
  for(const definition of TRACKS) {
    const track=createTrack(definition.id);
    assert.ok(track.length>1300&&track.length<1900,definition.id);
    assert.deepEqual(track.sample(0),track.sample(track.length));
    for(let s=0;s<track.length;s+=5) {
      const p=track.sample(s),ahead=track.sample(s+1);
      assert.ok(Math.abs(ahead.y-p.y)<.24,`${definition.id}: gentle slope`);
      const roundtrip=track.project(p.x+p.normal.x*3,p.z+p.normal.z*3,s);
      assert.ok(Math.abs(roundtrip.lateral-3)<.12,`${definition.id}: projection`);
      assert.ok(Math.abs(racingAngle((roundtrip.s-s)/track.length*Math.PI*2))<.004);
    }
    // Proper segment intersections reveal shortcuts caused by self-crossing splines.
    const sampled=Array.from({length:160},(_,i)=>track.sample(i*track.length/160));
    const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    for(let a=0;a<160;a++)for(let b=a+2;b<160;b++) {
      if(a===0&&b===159)continue;
      const p=sampled[a],q=sampled[(a+1)%160],r=sampled[b],s=sampled[(b+1)%160];
      assert.ok(!(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0),`${definition.id}: crossover`);
    }
  }
});

test('longer circuits scale horizontal distance by 65% while preserving road widths and elevations',()=>{
  // Measured from the original, unscaled circuits with 40 samples per curve.
  const original={
    coast:{length:843.5964000725697,horizontal:843.5108765661502,width:16,y:[1,2,3,4,5,4,2,1,1,2,2]},
    jungle:{length:894.6503590768627,horizontal:894.2645965871109,width:14.5,y:[2,3,6,9,11,8,5,3,4,6,4]},
    volcano:{length:814.6516391859807,horizontal:814.0934869626604,width:15,y:[4,7,11,15,18,15,11,8,5,4]},
    harbor:{length:832.5300455631814,horizontal:832.4806346558165,width:14,y:[2,2,3,4,4,3,3,2,2,3,3,2]},
    summit:{length:884.7916026337554,horizontal:883.8201068009035,width:14.5,y:[3,7,13,18,21,18,12,8,5,4,3]},
    ruins:{length:951.2478403920353,horizontal:951.1354258313588,width:14,y:[2,3,4,5,7,8,6,4,3,3,2,2]}
  };
  assert.equal(RACING_TRACK_SCALE,1.65);
  for(const definition of TRACKS){
    const track=createTrack(definition.id),old=original[definition.id];
    const horizontal=track.points.reduce((sum,p,index)=>{const q=track.points[(index+1)%track.points.length];return sum+Math.hypot(q.x-p.x,q.z-p.z);},0);
    assert.ok(Math.abs(horizontal/old.horizontal-1.65)<1e-9,definition.id+' horizontal scale');
    assert.ok(track.length/old.length>1.648&&track.length/old.length<=1.65,definition.id+' actual 3D length grows about 65%');
    assert.equal(track.width,old.width);assert.deepEqual(definition.points.map(p=>p[1]),old.y);
  }
});

test('every stage has at least two laps, a distance-based generous clock and sparse, separated boosts',()=>{
  for(const stage of RACING_STAGES){
    const track=createTrack(stage),items=[...track.boostPads,...track.pickups];
    assert.equal(stage.laps,stage.tier<2?2:3);assert.ok(stage.laps>=2);
    assert.ok(stage.timeLimit>=track.length*stage.laps/18+24.9);
    assert.ok(stage.timeLimit<balance.maximumSeconds,'the complete race and timeout remain accepted by the app');
    assert.equal(track.checkpoints.length,16);assert.equal(track.boostPads.length,1);assert.equal(track.pickups.length,2);
    assert.equal(track.boostPads[0].length,10,'boost pad length remains metres, not scaled with the circuit');
    for(let a=0;a<items.length;a++)for(let b=a+1;b<items.length;b++){
      const apart=Math.abs(items[a].s-items[b].s),routeDistance=Math.min(apart,track.length-apart);
      assert.ok(routeDistance>=track.length*.26,'items cannot form a dense cluster');
      assert.ok(Math.hypot(items[a].x-items[b].x,items[a].z-items[b].z)>50,'items also remain separated in world space');
    }
  }
});

test('countdown, pause and resume preserve all clocks and controls',()=>{
  const race=createRacing();advance(race,1);assert.equal(race.state.phase,'countdown');
  const snapshot=JSON.stringify(race.state.cars),countdown=race.state.countdown;
  race.pause();advance(race,4,{steer:1,nitro:true});assert.equal(race.state.countdown,countdown);
  assert.equal(JSON.stringify(race.state.cars),snapshot);race.resume();advance(race,2);
  assert.equal(race.state.phase,'racing');assert.equal(race.state.time,0);
  advance(race,.5);race.pause();const time=race.state.time;advance(race,5);assert.equal(race.state.time,time);
  race.resume();advance(race,.5);assert.ok(race.state.time>time);
});

test('manual throttle remains stopped, auto acceleration moves, steering and braking act',()=>{
  const idle=createRacing({config:{countdown:0}});advance(idle,1,{autoAccelerate:false});assert.equal(idle.state.player.speed,0);
  const race=createRacing({config:{countdown:0,steeringAssist:false}});advance(race,1);const speed=race.state.player.speed;
  assert.ok(speed>11);const heading=race.state.player.heading;advance(race,.3,{steer:.8});
  assert.ok(racingAngle(race.state.player.heading-heading)>.15);
  advance(race,.3,{autoAccelerate:false,brake:true});assert.ok(race.state.player.speed<speed);
});

test('drift builds charge while turning and releases a finite boost',()=>{
  const race=createRacing({config:{countdown:0,steeringAssist:false}});const p=place(race,18,0,25);
  advance(race,.6,{steer:.35,drift:true});assert.equal(p.drifting,true);assert.ok(p.driftCharge>.32);
  race.step(1/60,{steer:0});assert.equal(p.driftCharge,0);assert.ok(p.boostTime>0);
  assert.ok(race.state.events.some(e=>e.type==='driftBoost'));
  advance(race,3,{autoAccelerate:false,brake:true});assert.equal(p.boostTime,0);
});

test('drift slip changes actual movement smoothly and tyre grip returns after release',()=>{
  const race=createRacing({config:{countdown:0,steeringAssist:false,stage:{opponents:0}}});const p=place(race,18,0,25);
  for(let n=0;n<12&&!p.drifting;n++)race.step(1/60,{steer:.35,drift:true});
  assert.equal(p.drifting,true);assert.ok(p.slipAngle>0&&p.slipAngle<p.steer*.29);
  advance(race,.5,{steer:.35,drift:true});const heldSlip=p.slipAngle;
  assert.ok(heldSlip>.04&&heldSlip<.29);const previous={x:p.x,z:p.z};
  race.step(1/60,{steer:.35,drift:true});
  const movementHeading=Math.atan2(p.x-previous.x,p.z-previous.z);
  assert.ok(Math.abs(racingAngle(p.heading-movementHeading)-p.slipAngle)<.000001,'slip affects velocity, not only the rendered car');
  const releaseSlip=p.slipAngle;race.step(1/60,{steer:.35});
  assert.ok(p.slipAngle>releaseSlip*.9&&p.slipAngle<releaseSlip,'release preserves momentum without a snap');
  advance(race,1,{autoAccelerate:false,brake:true});assert.ok(p.slipAngle<releaseSlip*.03);
});

test('ordinary steering has no slip and recovery clears existing drift momentum',()=>{
  const race=createRacing({config:{countdown:0,steeringAssist:false,stage:{opponents:0}}});const p=place(race,18,0,25);
  const before={x:p.x,z:p.z};race.step(1/60,{steer:.6});
  assert.equal(p.slipAngle,0);assert.ok(Math.abs(racingAngle(Math.atan2(p.x-before.x,p.z-before.z)-p.heading))<.000001);
  p.slipAngle=.2;race.recover();assert.equal(p.slipAngle,0);
});

test('nitro consumes its meter and improves acceleration without becoming unlimited',()=>{
  const boosted=createRacing({config:{countdown:0}}),plain=createRacing({config:{countdown:0}});
  place(boosted,10,0,15);place(plain,10,0,15);
  advance(boosted,.8,{nitro:true});advance(plain,.8);
  assert.ok(boosted.state.player.speed>plain.state.player.speed+2);assert.ok(boosted.state.player.nitro<65);
  const race=createRacing({config:{countdown:0,stage:{opponents:0}}});const p=place(race,15,0,12);p.nitro=.2;
  advance(race,.1,{nitro:true});assert.equal(p.nitro,0);assert.equal(p.boosting,false);
});

test('collectibles refill nitro once and boost pads have a cooldown',()=>{
  const race=createRacing({config:{countdown:0,stage:{opponents:0}}}),item=race.state.collectibles[0];
  const p=place(race,item.s,item.lane,0);p.nitro=5;race.step(1/60);
  assert.equal(item.active,false);assert.equal(p.pickups,1);assert.equal(p.nitro,36);
  race.step(1/60);assert.equal(p.pickups,1);
  const pad=race.track.boostPads[0];place(race,pad.s,0,5);race.step(1/60);
  assert.ok(p.boostTime>0);assert.ok(p.padCooldown>0);
});

test('off-road loses speed; fair recovery returns to the last earned checkpoint',()=>{
  const race=createRacing({config:{countdown:0,stage:{opponents:0}}});const p=place(race,35,17,35);
  advance(race,1);assert.ok(p.speed<25);assert.ok(p.offroad);
  p.checkpoints=2;p.nextCheckpoint=3;p.x+=1000;race.step(1/60);
  const safe=race.track.sample(race.track.length/16*2+4);
  assert.equal(p.checkpoints,2);assert.equal(p.recoveries,1);assert.ok(Math.hypot(p.x-safe.x,p.z-safe.z)<.01);
  assert.ok(p.speed>=8&&p.speed<=15);race.recover();assert.equal(p.recoveries,1,'recovery cooldown');
});

test('skipping checkpoints or driving backwards across the finish never wins',()=>{
  const race=createRacing({config:{countdown:0,stage:{opponents:0}}});const p=place(race,race.track.length-1,0,20,{credited:false});
  p.routeS=-1;p.previousS=-1;advance(race,.3);
  assert.equal(p.checkpoints,0);assert.equal(p.finished,false);assert.equal(race.state.result,null);
  place(race,1,0,12,{credited:false});p.heading=racingAngle(p.heading+Math.PI);p.routeS=1;p.previousS=1;
  advance(race,.3);assert.equal(p.checkpoints,0);
});

test('a missed off-road gate cannot award the next gate or finish and recovers fairly',()=>{
  const race=createRacing({config:{countdown:0,stage:{opponents:0}}}),sector=race.track.length/16;
  const p=place(race,sector-1,race.track.width*.85,18,{credited:false});
  advance(race,.4);assert.equal(p.checkpoints,0);
  place(race,sector*2+1,0,10,{credited:false});race.step(1/60);
  assert.equal(p.checkpoints,0);assert.ok(p.recoveries>=1);assert.ok(p.routeS<sector);
});

test('simulation is deterministic for equal seeds and fixed versus grouped frame timing',()=>{
  const a=createRacing({stage:7,seed:812}),b=createRacing({stage:7,seed:812});
  for(let n=0;n<600;n++)a.step(1/60,{steer:.1});for(let n=0;n<300;n++)b.step(1/30,{steer:.1});
  assert.deepEqual(a.state.cars,b.state.cars);assert.equal(a.state.time,b.state.time);
  assert.deepEqual(a.state.collectibles,b.state.collectibles);
  const c=createRacing({stage:7,seed:813});assert.notEqual(c.state.cars[1].maxSpeed,a.state.cars[1].maxSpeed);
});

test('four AI steer through the physical course, change passing lanes and finish',()=>{
  const race=createRacing({stage:13,seed:70,config:{countdown:0}});let passes=0;
  for(let n=0;n<Math.ceil(race.stage.timeLimit*60)&&!race.state.cars.slice(1).every(car=>car.finished);n++){race.step(1/60,{autoAccelerate:false});passes+=race.state.events.filter(e=>e.type==='overtake').length;}
  assert.equal(race.state.cars.length,5);assert.ok(passes>0);
  for(const ai of race.state.cars.slice(1)){assert.equal(ai.finished,true);assert.equal(ai.checkpoints,16*race.stage.laps);assert.equal(ai.recoveries,0);}
  assert.ok(new Set(race.state.cars.slice(1).map(ai=>ai.finishTime)).size>1);
});

test('gentle released-steering assistance cannot win a race without driving',()=>{
  const race=createRacing({stage:1,seed:7,config:{countdown:0}});
  advance(race,race.stage.timeLimit+.1);
  assert.equal(race.state.phase,'finished');assert.equal(race.state.result.won,false);
  assert.ok(race.state.player.checkpoints<race.state.result.requiredCheckpoints);
});

for(const [stage,seed] of [[1,7],[1,91],[2,11],[3,19],[4,13],[5,17],[6,3],[13,19],[18,29],[19,31],[24,79],[25,17],[30,19],[30,71]]) {
  test(`complete race stage ${stage}, seed ${seed}: legal checkpoints and skilled driving beat AI`,()=>{
    const race=driveToResult(stage,seed),result=race.state.result;
    assert.ok(result);assert.equal(result.won,true);assert.equal(result.finished,true);assert.equal(result.stars,3);
    assert.equal(result.checkpoints,16*race.stage.laps);assert.equal(result.requiredCheckpoints,result.checkpoints);
    assert.equal(result.laps,race.stage.laps);assert.equal(race.state.player.recoveries,0);
    assert.ok(result.durationSeconds<race.stage.timeLimit);assert.equal(race.state.phase,'finished');
    const accepted=racingResult({outcome:result.won?'win':'lose',score:result.checkpoints===result.requiredCheckpoints?6-result.rank:0,racing:result},{level:stage,seed},balance);
    assert.ok(accepted,'actual simulation result is accepted by the app reward contract');
    assert.equal(accepted.stars,result.stars);assert.ok(accepted.money>0);
    const time=race.state.time;race.step(.25,{nitro:true});assert.equal(race.state.time,time);
  });
}

test('timeout reports loss honestly and disposal releases simulation work',()=>{
  const race=createRacing({seed:5,config:{countdown:0,stage:{timeLimit:.5}}});advance(race,1,{autoAccelerate:false});
  assert.equal(race.state.phase,'finished');assert.equal(race.state.result.won,false);assert.equal(race.state.result.stars,0);
  assert.equal(race.state.result.finished,true);assert.equal(race.state.result.laps,0);assert.equal(race.state.result.checkpoints,0);
  assert.equal(Object.keys(race.state.result).length,10);
  const active=createRacing({config:{countdown:0}});active.dispose();advance(active,3);assert.equal(active.state.time,0);assert.equal(active.state.disposed,true);
});

test('seed zero and large session seeds normalize without changing the result contract',()=>{
  for(const seed of [0,4294967297,1792750000000]) {
    const race=createRacing({seed,config:{countdown:0,stage:{timeLimit:.05}}});advance(race,.1,{autoAccelerate:false});
    assert.equal(race.state.result.seed,seed>>>0);
    assert.ok(racingResult({outcome:'lose',score:0,racing:race.state.result},{level:1,seed},balance));
  }
});

test('equipment changes only this new simulation and clamps imported values',()=>{
  const base=createRacing({config:{countdown:0}}),upgraded=createRacing({config:{countdown:0,equipment:{engine:2,grip:1.12,nitro:1.16}}});
  assert.equal(base.state.player.nitro,65);assert.ok(upgraded.state.player.nitro>65);
  place(base,25,0,40);place(upgraded,25,0,40);advance(base,.3);advance(upgraded,.3);
  assert.ok(upgraded.state.player.speed>base.state.player.speed);
  assert.equal(getRacingStage(1).playerSpeed,40,'immutable shared definitions');
});
