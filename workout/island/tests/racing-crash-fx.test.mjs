// racing-deep-m7: the crash show. The flip is an arc along the road (Roy: "more impressive, not just a flip on the spot"): 0.5-1.2 s in the air, 1-2 rolls by the strength
// of the hit, height up to 1.6 m, and a landing on the wheels at the restart point (centre line, along the track, 9 m/s) without ever crossing the next gate.
// config.crashFx=false (?racingCrashFx=0) keeps the 0.55 s roll on the spot. The effects pool (debris, tyre) is fixed and reused.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createRacing} from '../minigames/racing-physics.mjs';
import {createTrack} from '../minigames/racing-tracks.mjs';
import {createRacingEffects} from '../minigames/racing-effects.mjs';

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const place=(race,car,s,lane,speed)=>{const p=race.track.sample(s);const sector=race.track.length/16;Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:Math.floor(s/sector),nextCheckpoint:Math.floor(s/sector)+1});return p;};
/** drives one crash and records the flight: returns {crashed, land, peak, maxLat, gateCrossed, trace} */
function flight(race,p,maxSteps=200){
  let t0=null,land=null,peak=0,maxLat=0,gateCrossed=false,trace=[];const sector=race.track.length/16;
  for(let n=0;(n<maxSteps||(t0!==null&&n<maxSteps+90))&&!land;n++){race.step(1/60,{autoAccelerate:true,steer:0});   // a late flip (grind after ~2 s) still gets its 1.2 s window
    for(const e of race.state.events){if(e.type==='crash'&&e.car==='player')t0=race.state.time;if(e.type==='crashRecover'&&e.car==='player')land={t:race.state.time-t0,lateral:p.lateral,speed:p.speed,headingError:wrap(p.heading-race.track.sample(p.s).heading),checkpoints:p.checkpoints};}
    if(p.crashT>0){peak=Math.max(peak,p.crashAir);maxLat=Math.max(maxLat,Math.abs(p.lateral));if(p.routeS>p.nextCheckpoint*sector)gateCrossed=true;trace.push({t:+(race.state.time-t0).toFixed(2),air:+p.crashAir.toFixed(2),speed:+p.speed.toFixed(1),lat:+p.lateral.toFixed(2)});}}
  return {crashed:t0!==null,land,peak,maxLat,gateCrossed,trace};
}
test('a hard wall hit flies 0.5-1.2 s in an arc: height up to 1.6 m, lands at the centre line along the track at 9 m/s, no gate, two rolls for a hard hit',()=>{
  const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false}}),p=race.state.player,tr=race.track;
  const pt=place(race,p,300,tr.width/2-.3,40);p.heading=pt.heading+1.2;const cp=p.checkpoints;
  let strength=null;for(let n=0;n<5;n++){race.step(1/60,{autoAccelerate:true,steer:0});for(const e of race.state.events)if(e.type==='crash')strength=e.strength;}
  assert.ok(p.crashT>0,'flipped');assert.ok(p.crashDur>=.5&&p.crashDur<=1.2,'duration '+p.crashDur);assert.ok(strength>=.5&&strength<=1,'a hard hit: strength '+strength);assert.equal(p.crashSpin,2,'two rolls for a hard hit');
  const f=flight(race,p);
  assert.ok(f.land,'landed');assert.ok(f.land.t>=.5&&f.land.t<=1.2,'flight time '+f.land.t);assert.ok(f.peak>.8&&f.peak<=1.6,'peak height '+f.peak);
  assert.ok(Math.abs(f.land.lateral)<tr.width*.2,'landed near the centre: '+f.land.lateral);assert.ok(Math.abs(f.land.headingError)<.08,'along the track');assert.equal(f.land.speed,9);
  assert.equal(f.land.checkpoints,cp,'no gate from a crash');assert.equal(f.gateCrossed,false,'the arc never passes the next gate');assert.equal(p.crashAir,0);assert.equal(p.offroad,false);
  // the arc moves forward and towards the centre, not on the spot: the lateral shrinks in one direction and the car is never below the road
  const first=f.trace[0],last=f.trace.at(-1);assert.ok(Math.abs(last.lat)<Math.abs(first.lat)*.3,'moved towards the centre');assert.ok(f.trace.every((s,i)=>i===0||Math.abs(s.lat)<=Math.abs(f.trace[i-1].lat)+1e-9),'lateral eases in one direction');
  assert.ok(f.trace.every(s=>s.air>=-1e-9),'never below the road');
});
test('strength scales the show: stuck = a short low hop with one roll; the rival restarts and drives on',()=>{
  const race=createRacing({stage:1,seed:2,config:{countdown:0,extraRivals:0}}),ai=race.state.cars[1];
  for(let n=0;n<60*3;n++)race.step(1/60,{autoAccelerate:false});ai.maxSpeed=0.5;let got=null;
  for(let n=0;n<60*4&&!got;n++){race.step(1/60,{autoAccelerate:false});for(const e of race.state.events)if(e.type==='crash'&&e.car===ai.id)got=e;}
  assert.equal(got.reason,'stuck');assert.ok(got.strength<.1,'stuck strength '+got.strength);assert.equal(ai.crashSpin,1);assert.ok(ai.crashDur>=.5&&ai.crashDur<=.7,'short hop '+ai.crashDur);assert.ok(ai.crashPeak<=.6);
  let peak=0,landed=false;for(let n=0;n<90&&!landed;n++){race.step(1/60,{autoAccelerate:false});peak=Math.max(peak,ai.crashAir);landed=race.state.events.some(e=>e.type==='crashRecover'&&e.car===ai.id);}
  assert.ok(landed&&ai.crashT===0&&ai.speed>=8,'the rival restarted: '+ai.speed);assert.ok(peak>.3&&peak<=.6,'low hop '+peak);
});
test('1,000 random hard hits in 30 stages: every flight ends within 1.2 s on the road (|lateral| < 0.2 width) at 9 m/s, never below the road, never past the next gate',()=>{
  let seed=99;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let flips=0,maxT=0,minT=9,maxPeak=0;
  for(let i=0;i<1000;i++){
    const stage=1+Math.floor(rand()*30),race=createRacing({stage,seed:3,config:{countdown:0,stage:{opponents:0},steeringAssist:false}}),p=race.state.player,tr=race.track,s=rand()*tr.length;
    const pt=place(race,p,s,(rand()<.5?-1:1)*(tr.width/2-.3),30+rand()*18);p.heading=pt.heading+Math.sign(p.lateral)*(.5+rand()*1);const cp=p.checkpoints;
    const f=flight(race,p,170);
    if(!f.crashed)continue;flips++;
    assert.ok(f.land,`stage ${stage}: landed`);maxT=Math.max(maxT,f.land.t);minT=Math.min(minT,f.land.t);maxPeak=Math.max(maxPeak,f.peak);
    assert.ok(f.land.t>=.5&&f.land.t<=1.2,`stage ${stage}: flight ${f.land.t}`);assert.ok(Math.abs(f.land.lateral)<tr.width*.2+1e-9,`stage ${stage}: lateral ${f.land.lateral}`);assert.equal(f.land.speed,9);
    assert.ok(f.maxLat<=tr.width*.5+.3,`stage ${stage}: stayed over the road (${f.maxLat})`);assert.equal(f.gateCrossed,false);assert.ok(p.checkpoints<=cp+1);assert.equal(p.offroad,false);assert.ok(f.trace.every(x=>x.air>=-1e-9));
  }
  assert.ok(flips>100,'hard hits flip: '+flips);assert.ok(maxPeak<=1.6+1e-9,'peak '+maxPeak);assert.ok(minT>=.5&&maxT<=1.2,`flight times ${minT}-${maxT}`);
});
test('ten cars, rivals flip too: every rival crash lands within 1.2 s and the race goes on; the arc fields exist on every car from the start',()=>{
  const race=createRacing({stage:2,seed:5,config:{countdown:0,extraRivals:5}}),p=race.state.player,tr=race.track;
  for(const c of race.state.cars){assert.equal(c.crashAir,0);assert.equal(c.crashDur,0);assert.equal(c.crashSpin,0);}
  const open=new Map();let landed=0;
  for(let n=0;n<60*60;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),autoAccelerate:true});
    if(n===60*5){const ai=race.state.cars[3],q=place(race,ai,ai.routeS,tr.width/2-.3,40);ai.heading=q.heading+1.2;}   // one rival is thrown into the fence
    for(const ev of race.state.events){if(ev.type==='crash')open.set(ev.car,race.state.time);if(ev.type==='crashRecover'){const t=race.state.time-open.get(ev.car);assert.ok(t>=.5&&t<=1.2+1e-9,`${ev.car} flight ${t}`);open.delete(ev.car);landed++;}}}
  assert.ok(landed>=1,'the thrown rival landed');assert.equal(open.size,0,'nobody is left in the air');assert.equal(race.state.phase,'racing');
});
test('config.crashFx=false keeps the previous roll on the spot: 0.55 s, no arc fields',()=>{
  const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false,crashFx:false}}),p=race.state.player,tr=race.track;
  const pt=place(race,p,300,tr.width/2-.3,40);p.heading=pt.heading+1.2;
  const f=flight(race,p);assert.ok(f.land&&f.land.t>=.5&&f.land.t<=.62,'0.55 s: '+f.land?.t);assert.equal(p.crashDur,0);assert.equal(f.peak,0);assert.equal(f.land.speed,9);
});
// effects: the crash pools are fixed and reused; debris and the tyre appear on the crash event and are gone after 1.6 s
function effectsFixture(){
  const resources=new Set(),scene=new T.Scene(),track=createTrack(1),camera=new T.PerspectiveCamera();camera.position.set(0,3,-8);camera.lookAt(0,1,0);
  const context={createRadialGradient(){return {addColorStop(){}};},fillRect(){}};const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement(){return {width:0,height:0,getContext(){return context;}};}}});
  let effects;try{effects=createRacingEffects({T,scene,track,keep:v=>(resources.add(v),v),carColors:['#ff0000','#00ff00']});}finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
  const root=scene.getObjectByName('racing-effects'),byCap=new Map(root.children.map(m=>[m.instanceMatrix.count,m]));
  const pt=track.sample(80),player={...pt,id:'player',isPlayer:true,speed:22,drifting:false,offroad:false,crashT:0,crashDur:0,crashAir:0,lateral:3};
  const state={time:0,events:[],player,cars:[player]};
  return {effects,state,player,resources,debris:byCap.get(24),tyres:byCap.get(4),smoke:byCap.get(32),sparks:byCap.get(20),step(dt=1/60){state.time+=dt;effects.update(state,dt,camera,0);state.events=[];},close(){effects.dispose();}};
}
test('effects: a crash spawns 5 painted debris pieces and one tyre from fixed pools, a trail while flying, dust and sparks on landing; everything is gone after 2 s and no buffer is reallocated',()=>{
  const f=effectsFixture();try{
    const matrices=[f.debris.instanceMatrix.array,f.tyres.instanceMatrix.array],colors=f.debris.instanceColor.array,registered=[...f.resources];
    f.player.crashT=f.player.crashDur=1;f.state.events=[{type:'crash',car:'player',reason:'wall'}];f.step();
    assert.equal(f.effects.metrics().debris,5);assert.equal(f.effects.metrics().tyres,1);assert.deepEqual(f.effects.metrics().capacity,{smoke:32,skidMarks:128,sparks:20,debris:24,tyres:4});
    assert.ok(Math.abs(colors[0]-1)<1e-6&&colors[1]<1e-6,'debris painted in the car colour (red)');
    const smokeBefore=f.effects.metrics().smoke;for(let i=0;i<30;i++){f.player.crashT-=1/60;f.player.crashAir=1;f.step();}assert.ok(f.effects.metrics().smoke>smokeBefore,'a smoke trail while flying');
    f.player.crashT=0;f.player.crashAir=0;f.state.events=[{type:'crashRecover',car:'player'}];f.step();assert.ok(f.effects.metrics().sparks>=8,'landing sparks');
    for(let i=0;i<120;i++)f.step();assert.equal(f.effects.metrics().debris,0);assert.equal(f.effects.metrics().tyres,0);
    // four more crashes cycle through the pools without growing them
    for(let k=0;k<4;k++){f.state.events=[{type:'crash',car:'player'}];f.player.crashT=f.player.crashDur=1;f.step();}
    assert.ok(f.effects.metrics().debris<=24&&f.effects.metrics().tyres<=4);assert.equal(f.debris.instanceMatrix.array,matrices[0]);assert.equal(f.tyres.instanceMatrix.array,matrices[1]);assert.equal(f.debris.instanceColor.array,colors);
    assert.deepEqual([...f.resources],registered,'no new GPU resources after construction');
    // a far rival (beyond 70 m) gets no particles
    f.player.crashT=0;f.player.crashDur=0;const far={...f.player,id:'ai-1',isPlayer:false,x:f.player.x+300,crashT:1,crashDur:1};f.state.cars=[f.player,far];for(let i=0;i<120;i++)f.step();const d0=f.effects.metrics().debris;f.state.events=[{type:'crash',car:'ai-1'}];f.step();assert.equal(f.effects.metrics().debris,d0,'far rival: roll only');
    // crashFx off on the model side (crashDur 0): no debris either
    f.state.cars=[f.player];f.player.crashDur=0;f.player.crashT=.55;for(let i=0;i<120;i++)f.step();f.state.events=[{type:'crash',car:'player'}];f.step();assert.equal(f.effects.metrics().debris,0);
  }finally{f.close();}
});
