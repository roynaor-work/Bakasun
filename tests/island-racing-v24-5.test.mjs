// racing-v24.5 (Roy after v24.4 on the phone): the control fades with the tyre wear, long round corners with a little inertia slide, a run-off that keeps the speed,
// downshifts before the tight corners (the engine goes up and down through the gears), and no "air" noise while driving. Every behaviour has an address value that
// brings v24.4 back (racing-v24-5.mjs); the circuits are read at import time, so the v24.4 shape is loaded again with a faked location and its own module URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {racingV245Flags,v245PhysicsConfig,TYRE,tyreWear,tyreControl,CARRY,SHOULDER,shoulderOf,GEARS,ROUND} from '../workout/island/minigames/racing-v24-5.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {createTrack,TRACKS} from '../workout/island/minigames/racing-tracks.mjs';
import {racingV24Flags,v24PhysicsConfig,playerInput} from '../workout/island/minigames/racing-v24.mjs';
import {createRacingAudio} from '../workout/island/minigames/racing-audio.mjs';
import {windGain,createRacingSamples,REC} from '../workout/island/minigames/racing-samples.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pilot} from '../workout/island/tools/racing-v24-sim.mjs';

globalThis.location={search:'?racingRound=v244'};
const OLD=await import('../workout/island/minigames/racing-tracks.mjs?round=v244');
delete globalThis.location;

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const BASE={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(racingV24Flags('')),pitAuto:true,pitSeq:true};
const NEW=v245PhysicsConfig(racingV245Flags('')),V244=v245PhysicsConfig(racingV245Flags('?racingTyreFeel=v244&racingCarry=v244&racingShoulder=v244&racingGears=v244'));
const make=(cfg,stage=1,extra={})=>createRacing({stage,seed:5,config:{...BASE,...cfg,...extra,stage:{opponents:0,...(extra.stage||{})}}});
const place=(r,car,s,lane,speed)=>{const p=r.track.sample(s),k=Math.floor(s/(r.track.length/16));Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:k,nextCheckpoint:k+1});};
const kid=(r,p)=>{const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return {steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false};};

test('flags: every v24.5 change is on by default and each one has its v24.4 address value',()=>{
 assert.deepEqual({...racingV245Flags('')},{tyreFeel:true,carry:true,shoulder:true,gears:true,round:true,air:'v245',rec:true});
 assert.equal(racingV245Flags('?racingRec=0').rec,false,'?racingRec=0: the synthesis');
 for(const [key,field,old] of [['racingTyreFeel','tyreFeel',false],['racingCarry','carry',false],['racingShoulder','shoulder',false],['racingGears','gears',false],['racingRound','round',false],['racingAir','air','v244']])
  assert.equal(racingV245Flags(`?${key}=v244`)[field],old,key);
 assert.deepEqual(V244,{tyreFeel:false,carry:false,shoulder:false,gears:false});
 // the pure model without the config keeps v24.4 (the older tests and tools measure what they measured)
 const r=createRacing({stage:1,seed:1,config:{countdown:0}});assert.equal(r.state.player.lifting,false);r.dispose();
});

function yawAfterLock(cfg,tyre){const r=make(cfg),p=r.state.player;place(r,p,r.track.mainStraight.from+20,0,34);p.gearInit=true;p.tyre=tyre;r.state.time=10;const h0=p.heading;let t63=null;
 for(let n=0;n<36;n++){r.step(1/60,{steer:1,throttle:1,autoAccelerate:true});p.speed=34;if(t63===null&&p.steer>=.63)t63=(n+1)/60;}const yaw=wrap(p.heading-h0);r.dispose();return {yaw,t63};}
test('tyre feel: the wheel turns the car less and answers slower as the tyre wears, from the first metre; v24.4 barely changes',()=>{
 assert.equal(tyreWear(1),0);assert.equal(tyreWear(1-TYRE.full),1);assert.equal(tyreWear(0),1);assert.ok(Math.abs(tyreControl(.35)-(1-TYRE.steer))<1e-12);assert.equal(tyreWear(undefined),0,'no pits: new tyres');
 const n1=yawAfterLock(NEW,1),n8=yawAfterLock(NEW,.8),n35=yawAfterLock(NEW,.35),o1=yawAfterLock(V244,1),o35=yawAfterLock(V244,.35);
 const plain=yawAfterLock({...NEW,tyreFeel:false},1).yaw;assert.ok(Math.abs(n1.yaw-plain)<plain*.005,'a new tyre turns as without the tyre feel (it wears from the first metre: 0.6 s of lock is a few thousandths)');
 assert.ok(n8.yaw<n1.yaw*.93,`80% tyre: ${n8.yaw.toFixed(3)} vs ${n1.yaw.toFixed(3)}`);assert.ok(n35.yaw<n1.yaw*.7,`35% tyre: ${n35.yaw.toFixed(3)}`);
 assert.ok(n35.t63>n1.t63*1.6,`the wheel answers slower: ${n35.t63} vs ${n1.t63}`);
 assert.ok(o35.yaw>o1.yaw*.9,'v24.4: a worn tyre turns almost as much');assert.equal(o35.t63,o1.t63);
});

function shoulderRun(cfg,beyond){const r=make(cfg),p=r.state.player;place(r,p,r.track.mainStraight.from+15,r.track.width/2+beyond,38);r.state.time=10;
 for(let n=0;n<120;n++){const pr=r.track.project(p.x,p.z,p.s);p.heading=pr.heading;r.step(1/60,{steer:0,throttle:1,autoAccelerate:true});}const out={speed:p.speed,offroad:p.offroad};r.dispose();return out;}
test('shoulder: up to SHOULDER m beyond the asphalt the speed holds; deeper the gravel slows the car; v24.4 slowed it from 0.4 m',()=>{
 assert.ok(SHOULDER.f1<4.6,'inside the painted asphalt run-off (gravel from 4.6 m)');assert.equal(shoulderOf({f1:true}),SHOULDER.f1);assert.equal(shoulderOf({}),SHOULDER.plain);
 for(const beyond of [1,2.5,3.5]){const a=shoulderRun(NEW,beyond),b=shoulderRun(V244,beyond);assert.ok(a.speed>37&&!a.offroad,`${beyond} m: ${a.speed.toFixed(1)}`);assert.ok(b.speed<20&&b.offroad,`v24.4 ${beyond} m: ${b.speed.toFixed(1)}`);}
 const deep=shoulderRun(NEW,5);assert.ok(deep.offroad&&deep.speed<20,'5 m out is the gravel: '+deep.speed.toFixed(1));
});

test('carry: a long steady corner builds a small slip angle (the path runs wide of the nose), more on worn tyres, gone after the corner, no speed lost; v24.4 none',()=>{
 const run=(cfg,tyre,steer=.45)=>{const r=make(cfg),p=r.state.player;place(r,p,r.track.mainStraight.from+15,0,32);p.gearInit=true;p.tyre=tyre;r.state.time=10;let maxSlip=0,early=0;const v=[];
  for(let n=0;n<150;n++){r.step(1/60,{steer,throttle:1,autoAccelerate:true});if(n===20)early=Math.abs(p.slipAngle);maxSlip=Math.max(maxSlip,Math.abs(p.slipAngle));v.push(p.offroad||p.crashT>0||p.offFlight?NaN:p.speed);}
  for(let n=0;n<90;n++)r.step(1/60,{steer:0,throttle:1,autoAccelerate:true});const after=Math.abs(p.slipAngle);r.dispose();return {maxSlip,early,after,v};};
 // the worn tyre turns the car less, so the child steers more for the same corner: the same yaw (steer / tyreControl)
 const fresh=run(NEW,1),worn=run(NEW,.35,.45/tyreControl(.35)),old=run(V244,1),oldWorn=run(V244,.35),still=run({...NEW,carry:false},1);
 assert.ok(fresh.maxSlip>.4*Math.PI/180&&fresh.maxSlip<=CARRY.max+1e-9,`slip ${(fresh.maxSlip*180/Math.PI).toFixed(2)} deg`);
 assert.ok(fresh.early<fresh.maxSlip*.5,'it builds over the corner, not at once');
 assert.ok(worn.maxSlip>fresh.maxSlip*1.15&&worn.maxSlip<=CARRY.max*(1+TYRE.carry)+1e-9,`worn ${(worn.maxSlip*180/Math.PI).toFixed(2)} deg`);
 assert.ok(fresh.after<fresh.maxSlip*.1,'gone after the corner');assert.equal(old.maxSlip,0);
 // the same turn without the carry: the same speed at every step while both cars are on the asphalt or the run-off
 const both=fresh.v.map((x,i)=>[x,still.v[i]]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b));assert.ok(both.length>60);
 assert.ok(both.every(([a,b])=>Math.abs(a-b)<.05),'no speed lost by the slide');
 assert.ok(oldWorn.maxSlip===0);
});

function kidRace(cfg,stage){const r=make(cfg,stage,{stage:{laps:2,timeLimit:400}}),p=r.state.player;let prev=p.gear,downs=0,ups=0,lifts=0,off=0,maxGear=0;
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){r.step(1/60,p.pit?{steer:0,throttle:0,autoAccelerate:false}:kid(r,p));if(p.gear<prev)downs++;else if(p.gear>prev)ups++;prev=p.gear;maxGear=Math.max(maxGear,p.gear);
  for(const e of r.state.events)if(e.car==='player'&&e.type==='lift')lifts++;if(p.offroad)off++;}
 const out={finished:p.finished,downs,ups,lifts,off:off/60,flips:p.offTracks,maxGear};r.dispose();return out;}
test('gears: a child on the automatic gas who never brakes hears the box come down before the tight corners and go up again (and stays on the road); v24.4 sat in the top gears',()=>{
 for(const stage of [1,4]){const a=kidRace(NEW,stage),b=kidRace(V244,stage);
  assert.ok(a.finished&&b.finished);assert.ok(a.lifts>=8,`stage ${stage}: ${a.lifts} lifts`);assert.equal(b.lifts,0);
  assert.ok(a.downs>=2*b.downs&&a.downs>=20,`stage ${stage}: downshifts ${a.downs} (v24.4 ${b.downs})`);assert.ok(Math.abs(a.ups-a.downs)<=7,'every downshift is shifted up again');
  assert.equal(a.maxGear,7,'the main straight still reaches 7th');assert.ok(a.off<=b.off,`off the road ${a.off.toFixed(1)} s (v24.4 ${b.off.toFixed(1)} s)`);assert.equal(a.flips,0);}
 assert.ok(GEARS.downDwell<.6&&GEARS.aLat>0);
});
test('gears: the lift is the player\'s on the gas only: not under the brake, not off-road, not the computer drivers',()=>{
 const r=make(NEW,1,{extraRivals:3}),p=r.state.player,st={},flags=racingV24Flags('');let liftsBraking=0;
 for(let n=0;n<70*60;n++){const input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(r,p,st,{aLat:22,aBrake:20}),flags);r.step(1/60,input);if(input.brake&&p.lifting)liftsBraking++;}
 assert.equal(liftsBraking,0);for(const c of r.state.cars.slice(1))assert.equal(c.lifting,false,c.id);r.dispose();
});

const corners=tr=>{const out=[];let cur=null;for(let s=0;s<tr.length;s+=4){const k=Math.abs(tr.headingAt(s+6)-tr.headingAt(s-6))/12;if(k>1/120){if(!cur)cur={len:0,peak:0};cur.len+=4;cur.peak=Math.max(cur.peak,k);}else if(cur){out.push(cur);cur=null;}}if(cur)out.push(cur);return out;};
test('round corners: the hairpins opened into long round corners and the chicane wiggles gone, same lap length, main straight and clearance; ?racingRound=v244 is the v24.4 shape',()=>{
 assert.ok(ROUND.sigma>0);
 for(const t of TRACKS){const tr=createTrack(t.id),old=OLD.createTrack(t.id),c=corners(tr),o=corners(old);
  const tight=c.filter(x=>1/x.peak<25).length,oldTight=o.filter(x=>1/x.peak<25).length,long=c.filter(x=>x.len>=60).length,oldLong=o.filter(x=>x.len>=60).length;
  assert.ok(tight<=6&&oldTight>=15,`${t.id}: corners under 25 m ${tight} (v24.4 ${oldTight})`);assert.ok(long>=5&&long>oldLong+3,`${t.id}: corners 60 m long ${long} (v24.4 ${oldLong})`);
  assert.ok(c.length<o.length*.75,`${t.id}: ${c.length} corners (v24.4 ${o.length})`);
  assert.ok(Math.abs(tr.length-old.length)<old.length*.01,`${t.id}: lap ${tr.length.toFixed(0)} (v24.4 ${old.length.toFixed(0)})`);
  assert.ok(tr.mainStraight.length>=old.mainStraight.length-8,`${t.id}: main straight ${tr.mainStraight.length}`);assert.equal(tr.straights.filter(s=>s.length>=200).length,1,t.id+': one long straight');
  const m=tr.mainStraight;assert.ok((m.from<=tr.length&&m.to>tr.length)||(m.from<=0&&m.to>0),t.id+': the start line on the main straight');
  let worst=0;for(let s=0;s<tr.length;s+=2)worst=Math.max(worst,Math.abs(wrap(tr.sample(s+4).heading-tr.sample(s).heading))/4);assert.ok(1/worst>8,`${t.id}: tightest ${(1/worst).toFixed(1)} m`);
  let min=1e9;for(let s=0;s<tr.length;s+=8){const p=tr.sample(s);for(let u=s+4*tr.width;u<tr.length+s-4*tr.width;u+=8){const q=tr.sample(u%tr.length);min=Math.min(min,Math.hypot(p.x-q.x,p.z-q.z));}}
  assert.ok(min>2.2*tr.width,`${t.id}: closest far-apart legs ${min.toFixed(1)} m`);}
});

function fakeContext(){const made=[],param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(x){this.set=x;},linearRampToValueAtTime(x){(this.ramps||=[]).push(x);},exponentialRampToValueAtTime(x){(this.ramps||=[]).push(x);}});
 const node=(kind,e)=>{const n=Object.assign({kind,connect(){},disconnect(){},start(t){this.started=t;},stop(){}},e);made.push(n);return n;};
 return {made,currentTime:5,destination:{},state:'running',sampleRate:44100,createGain:()=>node('gain',{gain:param(1)}),createOscillator:()=>node('osc',{type:'sine',frequency:param(440),setPeriodicWave(){this.wave=true;}}),
  createBiquadFilter:()=>node('filter',{type:'lowpass',frequency:param(350),Q:param(1)}),createBufferSource:()=>node('src',{playbackRate:param(1),buffer:null,loop:false}),createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),
  createPeriodicWave:()=>({}),createStereoPanner:()=>node('pan',{pan:param(0)}),decodeAudioData:async b=>({duration:2.88,id:b.id}),resume:()=>Promise.resolve(),close:()=>Promise.resolve()};}
test('air: no white-noise bed while driving (road and exhaust hiss, top-speed wind, the wind loop); the road is a low rumble; ?racingAir=v244 keeps it',()=>{
 const drive=air=>{let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=fakeContext();return ctx;},storage:{getItem:()=>'on'},air});audio.unlock();
  audio.sync(40,false,{rpm:.97,gear:7,throttle:1,topVar:true});const quiet=audio.engine().noise,band=ctx.made.find(n=>n.kind==='filter'&&n.type==='bandpass').frequency.value;
  audio.sync(40,true,{rpm:.97,gear:7,throttle:1});const boost=audio.engine().noise;audio.dispose();return {quiet,band,boost};};
 const now=drive('v245'),old=drive('v244');
 assert.ok(old.quiet>.05,'v24.4 hissed at top speed: '+old.quiet);assert.ok(now.quiet<=.007,'v24.5: '+now.quiet);assert.ok(now.band<=300,`the rumble sits at ${now.band} Hz`);assert.ok(old.band>1000);
 assert.ok(old.boost>.3&&now.boost<.06,`boost ${now.boost} (v24.4 ${old.boost})`);
 for(const v of [0,12,25,40,60])assert.equal(windGain(v,'v24','v245'),0);assert.ok(windGain(40,'v24','v244')>.01);
});
test('air: the wind loop of the sample layer stays silent with air v245',async()=>{
 const c=fakeContext();const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),hiss:'v24',air:'v245',format:'ogg',fetchFn:async url=>({ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}})});
 await layer.load();layer.update({speed:45,rpm:.9,throttle:1});assert.equal(layer.levels().wind,0);layer.dispose();
});

test('round corners: still nothing solid within 9 m of the asphalt on any of the 30 stages (no walls; a mound keeps its whole footprint out)',async()=>{
 const {measureStage}=await import('../workout/island/tools/racing-clear-zone.mjs');const {CLEAR_ZONE}=await import('../workout/island/minigames/racing-offtrack.mjs');
 let nearest=Infinity,worst=null;for(let stage=1;stage<=30;stage++){const r=measureStage(stage,{clear:CLEAR_ZONE});for(const x of r.rows)if(!x.span&&x.beyond<nearest){nearest=x.beyond;worst={stage,...x};}}
 assert.ok(nearest>=9,'nearest solid object '+JSON.stringify(worst));
});

// ---------- Roy's recordings (assets/racing-rec) ----------
const island=new URL('../workout/island/',import.meta.url);
const okFetch=urls=>async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}};};
test('rec: the idle loop and the two driving-away takes load (all or nothing) on their own low-passed bus; the accelerate-and-shift take is not loaded',async()=>{
 const c=fakeContext(),urls=[];const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),rec:true,format:'ogg',fetchFn:okFetch(urls)});await layer.load();
 assert.ok(layer.recReady);assert.deepEqual(urls.filter(u=>/racing-rec\//.test(u)).map(u=>u.split('/').pop()).sort(),['engine-away-1.ogg','engine-away-2.ogg','engine-idle-loop.ogg']);
 const idle=c.made.find(n=>n.kind==='src'&&n.loop&&String(n.buffer?.id).includes('engine-idle-loop'));assert.ok(idle,'the idle take loops');
 assert.ok(c.made.some(n=>n.kind==='filter'&&n.type==='lowpass'&&n.frequency.value===REC.lowpass),'low-passed (no air)');
 layer.recIdle(1,1.3);assert.ok(Math.abs(layer.levels().recIdle-REC.idleGain)<1e-12);assert.equal(idle.playbackRate.value,1.3);layer.recIdle(0);assert.equal(layer.levels().recIdle,0);
 const n=c.made.length;layer.recPass({pan:.8});layer.recPass({pan:-.8});const shots=c.made.slice(n).filter(x=>x.kind==='src');assert.equal(shots.length,2);
 assert.deepEqual(shots.map(x=>String(x.buffer.id).split('/').pop()),['engine-away-1.ogg','engine-away-2.ogg'],'the two takes in turn');
 const gain=c.made.slice(n).find(x=>x.kind==='gain');assert.equal(gain.gain.set,0,'starts from silence (no click)');assert.equal(gain.gain.ramps.at(-1),0,'ends in silence');
 const off=createRacingSamples({context:fakeContext(),base:new URL('http://x/racing-audio-v2/'),format:'ogg',fetchFn:okFetch([])});await off.load();assert.equal(off.recReady,false);assert.equal(off.recPass(),false);
 const bad=createRacingSamples({context:fakeContext(),base:new URL('http://x/racing-audio-v2/'),rec:true,format:'ogg',fetchFn:async url=>/engine-away-2/.test(url)?{ok:false}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}});await bad.load();
 assert.equal(bad.recReady,false,'all or nothing');assert.ok(bad.ready,'the rest of the layer still plays');
});
test('rec: with the takes ready the grid idle is Roy\'s (the synthesized idle silent) and an overtake plays a driving-away take instead of the synthesized doppler; ?racingRec=0 keeps the synthesis',()=>{
 for(const rec of [true,false]){const calls={idle:[],pass:0};
  const layer={ready:true,recReady:true,recIdle:(l,r)=>{calls.idle.push([l,r]);return true;},recPass:()=>{calls.pass++;return true;},update(){},levels:()=>({}),pass(){},event(){},dispose(){}};
  let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=fakeContext();return ctx;},storage:{getItem:()=>'on'},idle:true,pass:'v244',rec,layer});audio.unlock();
  audio.sync(0,false,{rpm:.1,gear:1,throttle:0,grid:true,lamps:0});
  const synthIdle=ctx.made.filter(n=>n.kind==='gain').map(g=>g.gain.value);const before=ctx.made.length;audio.event('pass',{pan:.5,rpm:.8});const synthPass=ctx.made.slice(before).filter(n=>n.kind==='osc').length;
  if(rec){assert.ok(calls.idle.length>0&&calls.idle[0][0]>.5,'the recorded idle is driven');assert.equal(calls.pass,1,'the recorded overtake');assert.equal(synthPass,0,'no synthesized doppler');assert.equal(audio.engine().rec,true);}
  else{assert.equal(calls.idle.length,0);assert.equal(calls.pass,0);assert.ok(synthPass>=2,'the synthesized doppler');assert.equal(audio.engine().rec,false);}
  assert.equal(audio.engine().idle.level,1);audio.dispose();}
});
test('rec: the takes in the repo byte for byte, README "הקלטות של רועי", the offline racing list (sorted) has the six used files and not the unused take; wired with the version tag',async()=>{
 const SHA={'engine-idle-loop.ogg':'ae0e40f4ee111854','engine-idle-loop.mp3':'b682b69e00d53a72','engine-away-1.ogg':'886121952dca6e57','engine-away-1.mp3':'b5d78a11f21844c0','engine-away-2.ogg':'c2a9b829854b7be7','engine-away-2.mp3':'8924d2c54977f87d'};
 for(const [f,h] of Object.entries(SHA))assert.equal(createHash('sha256').update(await readFile(new URL('assets/racing-rec/'+f,island))).digest('hex').slice(0,16),h,f);
 assert.match(await readFile(new URL('assets/racing-rec/README.md',island),'utf8'),/הקלטות של רועי/);
 const m=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8')),r=m.games.racing;assert.deepEqual(r,[...r].sort(),'the racing list stays sorted');
 for(const f of Object.keys(SHA)){assert.ok(r.includes('assets/racing-rec/'+f),f);assert.equal(m.files['assets/racing-rec/'+f]?.[0],SHA[f],'hashed '+f);}
 assert.ok(!r.some(f=>/engine-accel-shifts/.test(f)),'the unused take is not downloaded');
 const audio=await readFile(new URL('minigames/racing-audio.mjs',island),'utf8'),session=await readFile(new URL('minigames/racing-session.mjs',island),'utf8');
 assert.match(audio,/baseRec:new URL\('\.\.\/assets\/racing-rec\/'/);assert.match(session,/rec:v245\.rec/);assert.match(session,/racing-v24-5\.mjs\?v=island-v2-20261107-23/);
 assert.ok(m.shell.includes('minigames/racing-v24-5.mjs'));
});
