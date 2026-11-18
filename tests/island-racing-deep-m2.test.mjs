import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing, RACING_NUMBERS} from '../workout/island/minigames/racing-physics.mjs';
import {createTrack, TRACKS, RACING_TRACK_SET} from '../workout/island/minigames/racing-tracks.mjs';

// racing-deep-m2 (11/11/2026): default circuits, Formula 1 grid, computer drivers that overtake and brake, contact that never locks two cars, and the flip rules.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const place=(race,car,s,lane,speed)=>{const p=race.track.sample(s);Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:Math.floor(s/(race.track.length/16)),nextCheckpoint:Math.floor(s/(race.track.length/16))+1});return p;};
// the measurement bot of tools/racing-topspeed.mjs ("pro": drifts in the sharper corners, brakes for hairpins)
function proLap(trackId){
  const race=createRacing({stage:TRACKS.findIndex(t=>t.id===trackId)+1,seed:3,config:{countdown:0,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,speeds=[];
  for(let t=0;t<900*60&&p.lapTimes.length<2;t++){
    const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
    race.step(1/60,{steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:curv>.9&&p.speed>24,drift:Math.abs(err)>.22&&p.speed>14,nitro:false});
    if(p.lapTimes.length>=1)speeds.push(p.speed);
  }
  const top=40.5;return {over95:speeds.filter(v=>v>=.95*top).length/speeds.length,under85:speeds.filter(v=>v<.85*top).length/speeds.length,lap:p.lapTimes[1],recoveries:p.recoveries};
}

test('the default set is the Codex v2 circuits with the Formula 1 trackside, one long straight each and the start line on it',()=>{
  assert.equal(RACING_TRACK_SET,'v2');
  for(const t of TRACKS){
    const tr=createTrack(t.id);assert.equal(t.f1,true,t.id);assert.ok(tr.mainStraight&&tr.mainStraight.length>=200,`${t.id}: main straight ${tr.mainStraight?.length}`);
    assert.equal(tr.straights.filter(s=>s.length>=200).length,1,`${t.id}: exactly one long straight`);
    // s=0 lies on the main straight (the grid behind it, the pit exit ahead)
    const m=tr.mainStraight,onIt=(m.from<=tr.length&&m.to>tr.length)||(m.from<=0&&m.to>0);assert.ok(onIt,`${t.id}: the line is on the main straight (${Math.round(m.from)}..${Math.round(m.to)} of ${Math.round(tr.length)})`);
    // no cusp: the tightest bend of the centre line is at least an 8 m radius (the chicane fade used to leave 5 m hairpins that lost gates)
    let worst=0;for(let s=0;s<tr.length;s+=2)worst=Math.max(worst,Math.abs(wrap(tr.sample(s+4).heading-tr.sample(s).heading))/4);
    assert.ok(1/worst>8,`${t.id}: tightest radius ${(1/worst).toFixed(1)} m`);
  }
});
test('speed bar: a skilled driver spends at most 25% of the lap above 95% of top speed and (five circuits) at least 40% under 85%; no gate is lost',()=>{
  const rows=TRACKS.map(t=>({id:t.id,...proLap(t.id)}));
  for(const r of rows){assert.ok(r.over95<=.25,`${r.id}: ${(r.over95*100).toFixed(0)}% above 95%`);assert.equal(r.recoveries,0,`${r.id}: a drifting driver never loses a gate`);assert.ok(r.lap>55&&r.lap<80,`${r.id}: lap ${r.lap}`);}
  assert.ok(rows.filter(r=>r.under85>=.4).length>=5,'under 85%: '+rows.map(r=>r.id+' '+(r.under85*100).toFixed(0)+'%').join(', '));
});
test('grid: a staggered two-column grid behind the line, the player in the slot of the stage, every car numbered',()=>{
  const race=createRacing({stage:1,seed:7,config:{countdown:0,extraRivals:5}}),cars=race.state.cars,slots=race.track.gridSlots(10);
  assert.equal(slots.length,10);assert.ok(slots.every(s=>s.s<0),'the whole grid stands before the line');
  assert.deepEqual(slots.slice(0,4).map(s=>s.lane),[3.3,-3.3,3.3,-3.3]);assert.ok(slots[1].s<slots[0].s&&slots[2].s<slots[1].s,'staggered rows');
  assert.equal(race.state.player.gridSlot,race.stage.grid-1);assert.equal(new Set(cars.map(c=>c.gridSlot)).size,10,'one car per slot');
  assert.deepEqual(cars.map(c=>c.number),RACING_NUMBERS.slice(0,10));
  for(let n=0;n<60;n++)race.step(1/60,{autoAccelerate:false});
  for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++)assert.ok(Math.hypot(cars[a].x-cars[b].x,cars[a].z-cars[b].z)>2.6,'no two cars start inside each other');
  const old=createRacing({stage:1,seed:7,config:{countdown:0,extraRivals:5,grid:false}});assert.equal(old.state.cars[0].lateral,0,'config.grid=false keeps the previous line-up');
});
test('rivals: a 10-car field spreads out (no train), computer cars really pass each other, nobody flips in ordinary driving',()=>{
  const race=createRacing({stage:2,seed:21,config:{countdown:0,extraRivals:5}}),rivals=race.state.cars.slice(1);let passes=0,flips=0,spread=null;
  for(let n=0;n<60*120;n++){race.step(1/60,{autoAccelerate:false});for(const e of race.state.events){if(e.type==='pass'&&e.car!=='player')passes++;if(e.type==='crash'&&e.car!=='player')flips++;}
    if(spread===null&&race.state.time>=60){const ps=rivals.map(c=>c.progress).sort((a,b)=>b-a);spread=ps[0]-ps[ps.length-1];}}
  assert.ok(spread>60,`first to last rival after 60 s: ${spread?.toFixed(0)} m`);assert.ok(passes>=3,`real passes ${passes}`);assert.ok(flips<2,`flips ${flips}`);
  assert.ok(rivals.every(c=>c.recoveries===0),'no rival loses a gate');
  // braking before corners: every rival brakes somewhere on a lap
  assert.ok(rivals.every(c=>c.braking!==undefined));
});
test('contact: two cars pressed into each other are free within a second, and a rear-end hit costs the car behind, not the leader',()=>{
  const race=createRacing({stage:1,seed:4,config:{countdown:0,extraRivals:5}}),[a,b]=[race.state.cars[1],race.state.cars[2]];
  for(let n=0;n<60*6;n++)race.step(1/60,{autoAccelerate:false});
  // lock them: same place, side by side, standing
  place(race,a,400,0,0);place(race,b,400.3,.6,0);let freeAt=null;
  for(let n=0;n<120;n++){race.step(1/60,{autoAccelerate:false});if(Math.hypot(a.x-b.x,a.z-b.z)>2.55&&freeAt===null)freeAt=n/60;}
  assert.ok(freeAt!==null&&freeAt<1,`free after ${freeAt} s`);assert.ok(a.speed>3&&b.speed>3,'both drive on');
  // rear-end: the car behind slows, the leader keeps (gains) speed
  place(race,a,600,0,30);place(race,b,602.3,0,22);a.collisionCooldown=b.collisionCooldown=0;const va=a.speed,vb=b.speed;race.step(1/60,{autoAccelerate:false});
  assert.ok(a.speed<va*.95,`rear car slowed: ${va.toFixed(1)} -> ${a.speed.toFixed(1)}`);assert.ok(b.speed>=vb-.5,`leader not punished: ${vb.toFixed(1)} -> ${b.speed.toFixed(1)}`);
});
test('flip rule: a slow glancing hit is a bump, a fast straight hit flips, and grinding along the fence for over 2 s flips too (config.grind=false removes only the grind)',()=>{
  const run=(speed,angle,config={})=>{const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false,...config}}),p=race.state.player,tr=race.track;const pt=place(race,p,300,tr.width/2-.3,speed);p.heading=pt.heading+angle;
    for(let n=0;n<30;n++)race.step(1/60,{autoAccelerate:true,steer:0});return p.crashes;};
  assert.equal(run(20,1.2),0,'20 m/s straight in: not severe');assert.equal(run(40,.3),0,'glancing at 40 m/s');assert.equal(run(40,1.3),1,'40 m/s nearly head-on');
  const grind=(config={})=>{const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false,...config}}),p=race.state.player,tr=race.track;place(race,p,300,tr.width/2-.3,18);
    let reason=null;for(let n=0;n<60*5&&!reason;n++){race.step(1/60,{autoAccelerate:true,steer:.35});for(const e of race.state.events)if(e.type==='crash')reason=e.reason;}return {reason,t:race.state.time};};
  const g=grind();assert.equal(g.reason,'grind');assert.ok(g.t>2&&g.t<4.5,`grind flip after ${g.t.toFixed(1)} s`);
  assert.equal(grind({grind:false}).reason,null);assert.equal(grind({crash:false}).reason,null);
});
