import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';
import {createRacingAudio} from '../minigames/racing-audio.mjs';

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function launch(config={},equipment={}){
  const race=createRacing({stage:1,seed:3,config:{countdown:0,walls:false,scrub:false,equipment,stage:{opponents:0,grid:1},...config}}),tr=race.track,p=race.state.player,top=race.stage.playerSpeed*Math.min(1.16,equipment.engine||1);
  const out={t100:null,t98:null,gears:new Set(),shifts:0,rpmMin:1,rpmMax:0};let g=p.gear;
  for(let t=0;t<60*60&&out.t98===null;t++){
    const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
    race.step(1/60,{steer:clamp(err*1.7,-1,1),autoAccelerate:true});const time=(t+1)/60;
    out.gears.add(p.gear);if(p.gear!==g){out.shifts++;g=p.gear;}out.rpmMin=Math.min(out.rpmMin,p.rpm);out.rpmMax=Math.max(out.rpmMax,p.rpm);
    if(out.t100===null&&p.speed*3.6>=100)out.t100=time;if(p.speed>=.98*top)out.t98=time;
  }
  race.dispose();return out;
}
test('gearbox: 0 to 98% of top speed takes 20-30 s on a straight, seven gears, a shift between each (topCap:false: the pure rise)',()=>{
  const r=launch({topCap:false});
  assert.ok(r.t98>=20&&r.t98<=30,'0-top '+r.t98);assert.ok(r.t100>=6&&r.t100<=10,'0-100 km/h '+r.t100);
  assert.deepEqual([...r.gears].sort(),[1,2,3,4,5,6,7]);assert.ok(r.shifts>=6);assert.ok(r.rpmMin>=0&&r.rpmMax<=1);
});
test('the previous model (engine:false) reaches the top in a few seconds and has no gears',()=>{
  const r=launch({engine:false});assert.ok(r.t98<5);assert.equal(r.shifts,0);
});
test('engine upgrade shortens the acceleration (and raises the top speed)',()=>{
  const stock=launch(),up=launch({},{engine:1.12});assert.ok(up.t100<stock.t100,`${up.t100} vs ${stock.t100}`);
});

function audioFixture(){
  const oscillators=[],pans=[],gains=[];
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
  class AudioContext{constructor(){this.state='running';this.currentTime=2;this.destination={};this.sampleRate=44100;}
    createOscillator(){const n=node();oscillators.push(n);return n;}createBiquadFilter(){return node();}createGain(){const n=node();gains.push(n);return n;}createStereoPanner(){const n=node();n.pan=param();pans.push(n);return n;}
    createBuffer(){return {getChannelData:()=>new Float32Array(2048)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}
    resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
  return {oscillators,pans,gains,AudioContext,storage:{getItem:()=>'on'}};
}
test('engine sound: pitch follows rpm and drops after an upshift; extra voices appear only with rpm data',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);audio.unlock();
  const count=f.oscillators.length;audio.sync(20,false);assert.equal(f.oscillators.length,count,'no extra voices without rpm');
  audio.sync(20,false,{rpm:.25,gear:1,throttle:1});assert.ok(f.oscillators.length>count,'sub and rough voices created');
  const main=f.oscillators[0],low=main.frequency.value;
  audio.sync(20,false,{rpm:.95,gear:1,throttle:1});const high=main.frequency.value;assert.ok(high>low*1.8,`${low} -> ${high}`);
  // fundamental stays between about 40 and 190 Hz at the rpm limits
  assert.ok(low>=45&&high<=195);
  audio.sync(30,false,{rpm:.3,gear:2,throttle:1});assert.ok(main.frequency.value<high,'rpm falls after the upshift');assert.equal(audio.engine().gear,2);
  audio.dispose();
});

test('rival engines: at most three live voices plus one shared background voice, nearer cars louder, panned by side',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);audio.unlock();audio.sync(30,false,{rpm:.5,gear:3,throttle:1});
  const before=f.oscillators.length;
  const cars=[{distance:10,pan:-.8,rpm:.6,gear:4},{distance:30,pan:.5,rpm:.4,gear:3},{distance:60,pan:0,rpm:.7,gear:5},{distance:80,pan:.3,rpm:.5,gear:4},{distance:120,pan:-.2,rpm:.3,gear:2}];
  audio.setOpponents(cars);audio.setOpponents(cars);
  assert.equal(f.oscillators.length-before,4,'three rival voices and one background voice, however many cars race');
  assert.equal(audio.engine().rivalVoices,4);
  const rivals=f.oscillators.slice(before,before+3);
  assert.ok(rivals[0].frequency.value>rivals[1].frequency.value-1,'frequencies come from each car rpm');
  const g=f.gains.slice(-4).map(n=>n.gain.value);assert.ok(g[0]>g[1]&&g[1]>g[2],'nearer rivals are louder: '+g.join(','));assert.ok(g.every(v=>v>=0&&v<=.008),'rival gain stays small');
  assert.equal(f.pans.length,4);assert.ok(f.pans[0].pan.value<0&&f.pans[1].pan.value>0);
  audio.setOpponents([]);audio.dispose();
});

test('top speed is alive: over 10 s at the rev limit the pitch hunts, drops at the limiter and the level rattles; off with topVar:false',()=>{
  // clock-controlled fixture
  const make=()=>{const f=audioFixture();const original=f.AudioContext;let clock=2;f.AudioContext=class extends original{get currentTime(){return clock;}set currentTime(v){}};f.setClock=v=>{clock=v;};return f;};
  const collect=topVar=>{const f=make(),audio=createRacingAudio(f);audio.unlock();const pitches=[],levels=[];
    for(let step=0;step<200;step++){f.setClock(2+step*.05);audio.sync(40,false,{rpm:.98,gear:7,throttle:1,topVar});pitches.push(f.oscillators[0].frequency.value);levels.push(f.gains[0].gain.value);}
    audio.dispose();return {pitches:pitches.slice(10),levels:levels.slice(10)};};  // the first half second holds the gear-change dip
  const range=a=>Math.max(...a)-Math.min(...a);
  const on=collect(true),off=collect(false);
  assert.ok(range(on.pitches)>8,'pitch range with variation: '+range(on.pitches).toFixed(2)+' Hz');
  assert.ok(range(off.pitches)<2.5,'static without it: '+range(off.pitches).toFixed(2)+' Hz');
  assert.ok(range(on.levels)>range(off.levels)*3+1e-6,'level varies (limiter cut + rattle)');
  assert.ok(new Set(on.pitches.map(v=>Math.round(v*4))).size>25,'many distinct pitches over 10 s');
});

/** racing-deep-m3: in gear 7 the throttle alone pulls the car to about 96.5% of its maximum and keeps creeping up; the last few percent (the "stuck at the
 * top" note) come only with the slipstream, a boost pad or the ERS push. config.topCap=false (?racingTopCap=0) restores the old 100% on throttle. */
function pursuit(config,seconds,input={},each=()=>{}){
  const race=createRacing({stage:1,seed:3,config:{countdown:0,walls:false,scrub:false,stage:{opponents:0,grid:1},...config}}),tr=race.track,p=race.state.player,speeds=[],plain=[],shifts=[];let g=p.gear,lastBoost=-999;
  for(let n=0;n<60*seconds;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),a=Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading,err=Math.atan2(Math.sin(a),Math.cos(a));
    each(p);race.step(1/60,{steer:Math.max(-1,Math.min(1,err*1.7)),autoAccelerate:true,...input});speeds.push(p.speed);if(p.boosting)lastBoost=n;plain.push(n-lastBoost<180?0:p.speed);if(p.gear!==g){shifts.push(n/60);g=p.gear;}}
  const rpm=p.rpm;race.dispose();return {top:race.stage.playerSpeed,speeds,plain,shifts,rpm};  // plain: speed outside boost pads / nitro (0 while boosting)
}
test('gear 7 top cap: throttle alone settles under 97% of the maximum and still accelerates there; nitro reaches the full top; topCap:false restores 100%',()=>{
  const capped=pursuit({},50),ratio=Math.max(...capped.plain)/capped.top;
  assert.ok(ratio>.93&&ratio<.97,'throttle alone settles just under the top: '+ratio.toFixed(3));
  assert.ok(capped.speeds[60*30]>capped.speeds[60*20]+.3,'still creeping up between 20 s and 30 s: '+capped.speeds[60*20].toFixed(2)+' -> '+capped.speeds[60*30].toFixed(2));
  assert.ok(capped.speeds[60*21]/capped.top>=.90,'the rise Roy liked is unchanged: 90% by 21 s');
  const boosted=pursuit({},50,{nitro:true},p=>{p.nitro=100;});assert.ok(Math.max(...boosted.speeds)>capped.top*1.1,'the ERS push goes well past the top: '+Math.max(...boosted.speeds).toFixed(1));
  const old=pursuit({topCap:false},50);assert.ok(Math.max(...old.plain)/old.top>=.98,'topCap:false reaches 98%+: '+(Math.max(...old.plain)/old.top).toFixed(3));
  assert.ok(capped.rpm>.9,'rpm near the limiter at the natural top (the top-speed sound variation plays there): '+capped.rpm.toFixed(2));
});
test('at high revs the box reaches the shift point a little sooner (quicker upshifts at the top of a gear); revShift:false keeps the old pull',()=>{
  const quick=pursuit({},30).shifts,slow=pursuit({revShift:false},30).shifts;
  assert.equal(quick.length,6);assert.equal(slow.length,6);
  assert.ok(quick[5]<slow[5],'the sixth upshift comes sooner: '+quick[5]+' < '+slow[5]);assert.ok(slow[5]-quick[5]<2.5,'but only a little');
});
