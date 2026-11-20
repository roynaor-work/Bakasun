import {assertReleaseReference} from './helpers/island-release.mjs';
// racing-v24.4 (Roy after v24.3 on the phone): the overtake, the idle engine on the grid, the real wheel change (Codex pit sequence v2), no change button, and the
// v5 sounds instead of the annoying noise just off the track and in the pit lane. Every behaviour has an address flag that brings v24.3 back (racing-v24-4.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {racingV244Flags,PIT_SEQ,surfaceAt} from '../workout/island/minigames/racing-v24-4.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {racingV24Flags,v24PhysicsConfig,playerInput,PIT} from '../workout/island/minigames/racing-v24.mjs';
import {createPitUi} from '../workout/island/minigames/racing-pit-ui.mjs';
import {createRacingSamples,V5_SURFACE,V5_BRAKE,V5_PIT,v5Gain,v5PitMix} from '../workout/island/minigames/racing-samples.mjs';
import {createRacingAudio} from '../workout/island/minigames/racing-audio.mjs';
import {seqTime} from '../workout/island/minigames/racing-pit-seq.mjs';
import {samplePitSequence,validateSequence} from '../workout/island/minigames/racing-pit-sequence.mjs';
import {pilot} from '../workout/island/tools/racing-v24-sim.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=p=>readFile(path.join(island,p),'utf8');
const sha=async p=>createHash('sha256').update(await readFile(path.join(island,p))).digest('hex').slice(0,16);

test('flags: every v24.4 change is on by default and each one has its v24.3 address value',()=>{
 assert.deepEqual({...racingV244Flags('')},{pitSeq:true,audioV5:true,idle:true,pass:'v244'});
 assert.equal(racingV244Flags('?racingPitSeq=0').pitSeq,false);
 assert.equal(racingV244Flags('?racingAudioV5=0').audioV5,false);
 assert.equal(racingV244Flags('?racingIdle=0').idle,false);
 assert.equal(racingV244Flags('?racingPass=v24').pass,'v24');
});

test('surface: nothing on the road, on the kerb or in the pit lane; the F1 run-off is asphalt (silent), gravel beyond 4.6 m, grass off a plain circuit',()=>{
 const h=9.75;
 assert.equal(surfaceAt({lateral:3,halfWidth:h,f1:true}),null);
 assert.equal(surfaceAt({lateral:h+.4,halfWidth:h,f1:true}),'kerb','0.4 m off the edge (the physics already calls it off-road) is still the kerb');
 assert.equal(surfaceAt({lateral:-(h+2),halfWidth:h,f1:true}),'runoff');
 assert.equal(surfaceAt({lateral:h+6,halfWidth:h,f1:true}),'gravel');
 assert.equal(surfaceAt({lateral:h+2,halfWidth:h,f1:false}),'grass');
 assert.equal(surfaceAt({lateral:-(h+9),halfWidth:h,f1:true,pit:true}),null,'the pit lane lies beyond the asphalt but is no surface');
});

function race(seq,stage=1){globalThis.location={search:''};return createRacing({stage,seed:3,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(racingV24Flags('')),pitAuto:true,pitSeq:seq}});}
function toPitExit(r){const p=r.state.player,st={},flags=racingV24Flags(''),log=[];
 for(let n=0;n<240*60&&r.state.phase!=='finished';n++){r.step(1/60,p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(r,p,st,{aLat:24,aBrake:20}),flags));
  log.push(...r.state.events.filter(e=>e.car==='player'&&/^pit/.test(e.type)).map(e=>({type:e.type,time:r.state.time,tapped:e.tapped})));
  if(p.pit?.phase==='stop'&&r.pitTap())log.push({type:'tapAccepted'});if(log.some(e=>e.type==='pitExit'))break;}
 return log;}
test('the stop without a button: the player stands PIT_SEQ.stop s, the crew changes the wheels in PIT_SEQ.change s, a tap is refused; without pitSeq the v24 tap and 2 s',()=>{
 const r=race(true),log=toPitExit(r),at=type=>log.find(e=>e.type===type)?.time;
 assert.ok(r.pit.seq);assert.ok(!log.some(e=>e.type==='tapAccepted'),'no tap in the sequence stop');
 assert.ok(Math.abs(at('pitChange')-at('pitStop')-PIT_SEQ.stop)<.04,'settle '+(at('pitChange')-at('pitStop')));
 assert.ok(Math.abs(at('pitDone')-at('pitChange')-PIT_SEQ.change)<.04,'change '+(at('pitDone')-at('pitChange')));
 assert.equal(r.state.player.pits,1);assert.ok(r.state.player.tyre>.95);r.dispose();
 const old=race(false),l2=toPitExit(old);assert.ok(!old.pit.seq);assert.ok(l2.some(e=>e.type==='tapAccepted'),'v24.3: the tap starts the change');
 const t2=type=>l2.find(e=>e.type===type)?.time;assert.ok(Math.abs(t2('pitDone')-t2('pitChange')-PIT.change)<.04);old.dispose();
});

test('sequence time follows the game stop: enter over the last 6 m, stop, change = jack up .. hand signal, leave = exit',()=>{
 assert.equal(seqTime(null),null);assert.equal(seqTime({phase:'lane'},{toBox:40}),null);assert.equal(seqTime({phase:'lane'},{toBox:20}),0);
 assert.ok(Math.abs(seqTime({phase:'lane'},{toBox:3})-.19)<1e-9);
 assert.equal(seqTime({phase:'stop',t:0}),.38);assert.ok(Math.abs(seqTime({phase:'stop',t:.1})-.46)<1e-9);
 assert.equal(seqTime({phase:'change',t:0,dur:2.4}),.46);assert.ok(Math.abs(seqTime({phase:'change',t:2.4,dur:2.4})-2.30)<1e-9);
 assert.ok(Math.abs(seqTime({phase:'leave',t:0})-2.30)<1e-9);assert.equal(seqTime({phase:'leave',t:5}),2.88);
});

test('the Codex sequence: valid, four old wheels go to the racks and four new ones onto the hubs, the car is lifted 16 cm while they work and set down before the release',async()=>{
 const config=JSON.parse(await read('assets/racing-pit-seq-v2/sequence.json'));assert.equal(validateSequence(config).valid,true);
 const mid=samplePitSequence(config,1.3),end=samplePitSequence(config,2.3);
 assert.ok(Math.abs(mid.car.liftMeters-.16)<1e-9);assert.equal(end.car.liftMeters,0);
 for(const w of Object.values(end.wheels)){assert.equal(w.oldState,'rack');assert.equal(w.newState,'hub');assert.equal(w.replaced,true);}
 assert.equal(samplePitSequence(config,.5).light,'red');assert.equal(end.light,'green');
 // the clips the sequence names are in the shipped clip file
 const glb=await readFile(path.join(island,'assets/racing-pit-seq-v2/pit-actions.glb')),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString()),names=new Set(json.animations.map(a=>a.name));
 for(const a of config.actors)for(const t of a.tracks)assert.ok(names.has(t.clip),t.clip);
});

function fakeDoc(){const el=tag=>({tagName:tag,children:[],dataset:{},style:{},attrs:{},hidden:false,setAttribute(k,v){this.attrs[k]=String(v);},append(...n){this.children.push(...n);},addEventListener(){},remove(){},querySelectorAll(){return [];}});return {createElement:el};}
test('pit HUD: changeButton:false never puts the change button on the screen and says that the crew changes the tyres',()=>{
 globalThis.location={search:''};const doc=fakeDoc(),stage=doc.createElement('div'),controls=doc.createElement('div');
 const ui=createPitUi({stage,controls,document:doc,auto:true,changeButton:false});const player={tyre:.5,pits:0,pit:{phase:'stop',t:0},lap:1};
 ui.update({player,laps:2,cars:[player]});assert.equal(controls.children.filter(n=>n.dataset.action==='racing-pit-change').length,0);
 assert.equal(ui.toast({car:'player',type:'pitChange'}),'מחליפים צמיגים');
 const old=createPitUi({stage,controls:doc.createElement('div'),document:doc,auto:true});assert.equal(old.toast({car:'player',type:'pitChange'}),null,'v24.3 has the button instead');
});

function fakeContext(){const made=[],param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(x){this.set=x;},linearRampToValueAtTime(x){(this.ramps||=[]).push(x);},exponentialRampToValueAtTime(x){(this.ramps||=[]).push(x);}});
 const node=(kind,e)=>{const n=Object.assign({kind,connect(){},disconnect(){},start(t){this.started=t;},stop(){}},e);made.push(n);return n;};
 return {made,currentTime:5,destination:{},state:'running',sampleRate:44100,createGain:()=>node('gain',{gain:param(1)}),createOscillator:()=>node('osc',{type:'sine',frequency:param(440),setPeriodicWave(){this.wave=true;}}),
  createBiquadFilter:()=>node('filter',{type:'lowpass',frequency:param(350),Q:param(1)}),createBufferSource:()=>node('src',{playbackRate:param(1),buffer:null,loop:false}),createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),
  createPeriodicWave:()=>({}),createStereoPanner:()=>node('pan',{pan:param(0)}),decodeAudioData:async b=>({duration:2.88,id:b.id}),resume:()=>Promise.resolve(),close:()=>Promise.resolve()};}
async function v5Layer(){const c=fakeContext(),urls=[];const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),v4:true,v5:true,format:'ogg',fetchFn:async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}};}});await layer.load();return {c,layer,urls};}
test('v5 layer: gravel or grass by speed only on that surface, nothing on the kerb or the run-off, the v5 brakes replace v4, the pit lane layers by phase',async()=>{
 const {layer,urls}=await v5Layer();assert.ok(layer.v5Ready);assert.equal(urls.filter(u=>/racing-audio-v5\/.+\.ogg$/.test(u)).length,13);
 const level=()=>layer.levels();
 layer.update({speed:25,surface:'gravel'});let L=level();assert.ok(L.surface['offtrack-gravel-medium']>0);assert.equal(Object.values(L.surface).filter(v=>v>0).length,1,'one loop at a time');
 for(const surface of ['kerb','runoff',null]){layer.update({speed:25,surface});assert.equal(Object.values(level().surface).filter(v=>v>0).length,0,String(surface));}
 layer.update({speed:4,surface:'grass'});assert.equal(Object.values(level().surface).filter(v=>v>0).length,0,'a crawl is silent');
 layer.update({speed:40,surface:'grass'});assert.ok(Math.abs(level().surface['offtrack-grass-high']-v5Gain(-10))<1e-12);
 layer.update({speed:35,brakePedal:true,braking:true});L=level();assert.ok(L.brake5[2]>0);assert.deepEqual(L.brake,[0,0,0],'v4 brake loops stay silent');
 layer.update({speed:20,pitPhase:'lane',toBox:100});L=level();assert.ok(L.pit[0]>0&&L.pit[1]>0);assert.equal(L.pit[2],0);assert.equal(L.brake5.filter(v=>v>0).length,0);
 layer.update({speed:0,pitPhase:'change'});L=level();assert.equal(L.pit[1],0,'no limiter standing');assert.ok(L.pit[2]>0&&L.pit[3]>0);
 layer.update({speed:30});assert.deepEqual(level().pit,[0,0,0,0]);
 assert.deepEqual(v5PitMix('',0),[0,0,0,0]);
 for(const [id,db] of [...V5_SURFACE.gravel,...V5_BRAKE,...Object.entries(V5_PIT)])assert.ok(v5Gain(db)<=.03,id+' under the .03 ceiling');
});
test('pit sounds follow the sequence: guns at the nut, wheels off, wheels on, guns, over the 2.4 s change',async()=>{
 const c=fakeContext();const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),basePit:new URL('http://x/racing-pit-v1/audio/'),pit:true,format:'ogg',fetchFn:async url=>({ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}})});
 await layer.load();const n=c.made.length;layer.pitCue('pitChange',2.4,true);
 const starts=c.made.slice(n).filter(x=>x.kind==='src').map(s=>+(s.started-5).toFixed(2));assert.deepEqual(starts,[.26,.81,1.49,1.6]);
});

function audioWith(opts){let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=fakeContext();return ctx;},storage:{getItem:()=>'on'},...opts});audio.unlock();return {audio,ctx:()=>ctx};}
test('idle engine: heard standing on the grid (revs held while the lights come on), gone at speed and after the finish; ?racingIdle=0 never builds it',()=>{
 const {audio,ctx}=audioWith({idle:true});
 audio.sync(0,false,{rpm:.1,gear:1,throttle:0,grid:true,lamps:0});let e=audio.engine().idle;assert.equal(e.level,1);assert.ok(e.hz>=70&&e.hz<=110,'an idle at '+e.hz);
 ctx().currentTime=6;audio.sync(0,false,{rpm:.1,gear:1,throttle:0,grid:true,lamps:5});e=audio.engine().idle;assert.ok(e.rev>.55&&e.hz>140,'revs on the lights '+e.hz);
 audio.sync(30,false,{rpm:.6,gear:3,throttle:1});assert.equal(audio.engine().idle.level,0,'driving: the engine voice alone');
 audio.sync(0,false,{throttle:0});assert.equal(audio.engine().idle.level,0,'the finish (no rpm) stays silent');
 const off=audioWith({idle:false});off.audio.sync(0,false,{rpm:.1,gear:1,throttle:0,grid:true});assert.equal(off.audio.engine().idle,null);
 assert.equal(off.ctx().made.filter(n=>n.wave).length,1,'only the driving engine voice, no idle voice');assert.equal(ctx().made.filter(n=>n.wave).length,2);
});
test('off-track: the white-noise gravel bed is gone with v5 (it was the loudest layer 0.4 m off the edge); v24.3 keeps it',()=>{
 for(const [v5,expect] of [[true,false],[false,true]]){const {audio}=audioWith({v5});audio.sync(20,false,{rpm:.5,gear:3,throttle:1,offroad:true});const noise=audio.engine().noise;assert.equal(noise>=.2,expect,`v5=${v5}: ${noise}`);}
});
test('overtake: the passed car sweeps by (pitch falls, pan follows, nothing bright, under the ceiling); ?racingPass=v24 keeps the old whoosh',()=>{
 const {audio,ctx}=audioWith({pass:'v244'});const n=ctx().made.length;audio.event('pass',{pan:.6,rpm:.8});
 const made=ctx().made.slice(n),oscs=made.filter(x=>x.kind==='osc');assert.equal(oscs.length,2);
 const f=40+.8*150;assert.ok(Math.abs(oscs[0].frequency.set-f*1.07)<1e-6);assert.ok(oscs[0].frequency.ramps.at(-1)<oscs[0].frequency.set,'the pitch falls');
 const pan=made.find(x=>x.kind==='pan');assert.equal(pan.pan.set,.6);assert.ok(Math.abs(pan.pan.ramps.at(-1)-.18)<1e-9);
 const lp=made.find(x=>x.kind==='filter');assert.ok(lp.frequency.set<=1400&&lp.frequency.ramps.at(-1)<=500);
 const gains=made.filter(x=>x.kind==='gain').flatMap(g=>g.gain.ramps||[]);assert.ok(Math.max(...gains)<=.03);assert.equal(audio.engine().passes,1);
 const old=audioWith({pass:'v24'}),m=old.ctx().made.length;old.audio.event('pass',{});assert.equal(old.ctx().made.slice(m).filter(x=>x.kind==='osc').length,0,'v24: the noise whoosh, no engine sweep');
});
test('rival engines carry the doppler of their approach speed (capped at 10%); v24 keeps a fixed pitch',()=>{
 for(const mode of ['v244','v24']){const {audio,ctx}=audioWith({pass:mode});const list=d=>[{rpm:.5,distance:d,pan:0,throttle:1}];
  audio.setOpponents(list(40));ctx().currentTime=5.1;audio.setOpponents(list(38));   // closing at 20 m/s
  const voice=ctx().made.filter(x=>x.kind==='osc').find(o=>o.type==='sawtooth'&&Math.abs(o.frequency.value-115)<20);const f=voice.frequency.value;
  if(mode==='v24')assert.ok(Math.abs(f-115)<1e-9);else{assert.ok(f>115&&f<=115*1.1+1e-9,'approaching = higher '+f);}}
});

const V5_SHA={"pit-engine-slow.ogg":"7de5c24da54c1861","pit-engine-slow.mp3":"34febae2a668e7a9","pit-limiter.ogg":"9f12e18e01b28c56","pit-limiter.mp3":"57d2855305548876","pit-bay-proximity.ogg":"e38fc5d69cd26849","pit-bay-proximity.mp3":"60d75171589f7bc4","pit-crew-background.ogg":"19ccfde9f433d589","pit-crew-background.mp3":"9d987dcab9e13aa5","offtrack-gravel-low.ogg":"c2e7a04a59538002","offtrack-gravel-low.mp3":"dbcf0349ebd7272c","offtrack-gravel-medium.ogg":"816ea0cabc9ae119","offtrack-gravel-medium.mp3":"b7bf4db0a0e5042e","offtrack-gravel-high.ogg":"66c595aec2984eea","offtrack-gravel-high.mp3":"f085fb19b385b71b","offtrack-grass-low.ogg":"6328b9881393eccd","offtrack-grass-low.mp3":"b202707171b32910","offtrack-grass-medium.ogg":"291b616b0e93774f","offtrack-grass-medium.mp3":"997e02f99d3a7f5f","offtrack-grass-high.ogg":"06aa8ccfd60186f9","offtrack-grass-high.mp3":"3775ccd7d4ba2f40","brake-low.ogg":"46a67c26c3889c51","brake-low.mp3":"30281633ae53f69e","brake-medium.ogg":"d600e8dde11ebd4f","brake-medium.mp3":"f6dd08fa64708c45","brake-high.ogg":"f8ff0aaab08c449e","brake-high.mp3":"798392ce7085791d"};
const SEQ_SHA={"jack.glb":"5cff483e929bca10","pit-actions.glb":"c1e2311c90527dda","sequence.json":"d7741dc51177c3e3","spare_wheel.glb":"06612121e956c036","wheel_gun.glb":"2de3c1cd3d4030c6"};
test('assets: the 26 v5 sounds (the package manifest\'s SHA-256) and the 5 pit sequence files, byte for byte, licences beside them, all in the offline list (sorted)',async()=>{
 for(const [f,h] of Object.entries(V5_SHA))assert.equal(await sha('assets/racing-audio-v5/'+f),h,f);
 for(const [f,h] of Object.entries(SEQ_SHA))assert.equal(await sha('assets/racing-pit-seq-v2/'+f),h,f);
 assert.match(await read('assets/racing-audio-v5/LICENSE.txt'),/CC0/);assert.match(await read('assets/racing-pit-seq-v2/LICENSES.md'),/CC0/);
 const m=JSON.parse(await read('offline-manifest.json')),r=m.games.racing;assert.deepEqual(r,[...r].sort(),'the racing list stays sorted');
 for(const f of [...Object.keys(V5_SHA).map(f=>'assets/racing-audio-v5/'+f),...Object.keys(SEQ_SHA).map(f=>'assets/racing-pit-seq-v2/'+f)])assert.ok(r.includes(f),f);
 for(const f of ['minigames/racing-v24-4.mjs','minigames/racing-pit-seq.mjs','minigames/racing-pit-sequence.mjs'])assert.ok(m.shell.includes(f),f);
});
test('wiring: the session sends the flags, the view loads the sequence on the formula car and falls back to the v1 crew, new code carries the current version tag',async()=>{
 const session=await read('minigames/racing-session.mjs'),view=await read('minigames/racing-view.mjs'),seq=await read('minigames/racing-pit-seq.mjs'),audio=await read('minigames/racing-audio.mjs');
 assert.match(session,/pitSeq:v244\.pitSeq/);assert.match(session,/changeButton:!model\.pit\.seq/);assert.match(session,/v5:v244\.audioV5,idle:v244\.idle&&engineOn,pass:v244\.pass/);
 assert.match(session,/kerb:v244\.audioV5\?0:/,'the kerb rumble (also all along the pit lane) is off with v5');
 assert.match(view,/import\('\.\/racing-pit-seq\.mjs\?v=/);assertReleaseReference(view,'./racing-pit-seq.mjs');assert.match(view,/crewV1\(\);\}\);/);assert.match(view,/get\('racingPitSeq'\)!=='0'/);
 assertReleaseReference(seq,'racing-pit-sequence.mjs');assert.match(audio,/base5:new URL\('\.\.\/assets\/racing-audio-v5\/'/);
});
