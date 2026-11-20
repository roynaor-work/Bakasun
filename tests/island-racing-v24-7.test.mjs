// racing-v24.7 (Roy after v24.6, 20/11/2026: "I do not want the race to lower the speed by itself ... I want it to be necessary to lower the speed in some of the
// corners"), the Codex v3 circuits and the Codex v6 sounds. Every change has an address flag (racing-v24-7.mjs); the v24.6 audio fixes stay as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {racingV247Flags,v247PhysicsConfig,BRAKE_DOWN,TIGHT,V3_STAGES,racingStageFeature,v3StageOn} from '../workout/island/minigames/racing-v24-7.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {TRACKS,TRACKS_V3,V3_LAP,RACING_STAGES,getRacingStage,createTrack} from '../workout/island/minigames/racing-tracks.mjs';
import {racingV24Flags,v24PhysicsConfig,playerInput,PIT_AUTO} from '../workout/island/minigames/racing-v24.mjs';
import {racingV245Flags,v245PhysicsConfig} from '../workout/island/minigames/racing-v24-5.mjs';
import {createRacingSamples,V6,V6_IDS,v5Gain} from '../workout/island/minigames/racing-samples.mjs';
import {createRacingAudio} from '../workout/island/minigames/racing-audio.mjs';
import {v3LookOf,v3Placements} from '../workout/island/minigames/racing-tracks-v3-env.mjs';
import {CLEAR_ZONE} from '../workout/island/minigames/racing-offtrack.mjs';
import {pilot} from '../workout/island/tools/racing-v24-sim.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=p=>readFile(path.join(island,p),'utf8');
const sha=async p=>createHash('sha256').update(await readFile(path.join(island,p))).digest('hex');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const f24=racingV24Flags(''),BASE={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(f24),pitAuto:true,pitSeq:true,...v245PhysicsConfig(racingV245Flags(''))};
const cfg=(query='')=>({...BASE,...v247PhysicsConfig(racingV247Flags(query),true)});
const place=(r,car,s,lane,speed)=>{const p=r.track.sample(s),k=Math.floor(s/(r.track.length/16));Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:k,nextCheckpoint:k+1,gearInit:false});};
/** the child: gas always on, the wheel follows the centre line, never the brake */
const kid=(r,p)=>{const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return {steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false};};
/** a two-lap race alone on the circuit: mode 'kid' or 'driver' (brakes before the corners the tyres cannot take) */
function solo(stage,mode,query=''){
 const r=createRacing({stage,seed:5,config:{...cfg(query),stage:{opponents:0,laps:2,timeLimit:400}}}),p=r.state.player,half=r.track.width/2,st={};let lifts=0,autoSlow=0,beyond=0,gravel=0,scrub=0;
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){
  const input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:mode==='kid'?kid(r,p):playerInput(pilot(r,p,st,{aLat:30,aBrake:25}),f24),v0=p.speed,was=p.offroad;r.step(1/60,input);
  if(!input.brake&&!p.pit&&!was&&!p.offroad&&p.crashT<=0&&p.recoveryTime<=0&&p.speed<v0-.02&&v0>15)autoSlow+=1/60;
  for(const e of r.state.events)if(e.car==='player'&&e.type==='lift')lifts++;
  if(!p.pit&&Math.abs(p.lateral)>half)beyond+=1/60;if(p.offroad&&!p.pit)gravel+=1/60;if(p.wide>.5)scrub+=1/60;
 }
 const out={finished:p.finished,time:r.state.time,lifts,autoSlow,beyond,gravel,scrub,flips:p.offTracks};r.dispose();return out;
}

test('flags: no automatic lift, tight corners, the v3 circuits and the v6 sounds by default; each one has its address value',()=>{
 assert.deepEqual({...racingV247Flags('')},{autoLift:false,tight:true,tightA:TIGHT.aLat,tracksV3:true,audioV6:true});
 assert.equal(racingV247Flags('?racingAutoLift=1').autoLift,true);assert.equal(racingV247Flags('?racingTight=0').tight,false);
 assert.equal(racingV247Flags('?racingTracksV3=0').tracksV3,false);assert.equal(racingV247Flags('?racingAudioV6=0').audioV6,false);
 assert.deepEqual(v247PhysicsConfig(racingV247Flags(''),true),{gears:false,brakeDown:true,tight:TIGHT.aLat},'the v24.5 lift is off even though ?racingGears is not v244');
 assert.deepEqual(v247PhysicsConfig(racingV247Flags('?racingAutoLift=1'),true),{gears:true,brakeDown:false,tight:TIGHT.aLat});
 assert.equal(v247PhysicsConfig(racingV247Flags('?racingAutoLift=1'),false).gears,false,'?racingGears=v244 still wins');
 assert.equal(v247PhysicsConfig(racingV247Flags('?racingTight=0'),true).tight,0);
});

test('the speed is never lowered automatically: no lift before a corner and no speed lost on the asphalt without the brake; ?racingAutoLift=1 brings the assist back',()=>{
 const now=solo(1,'kid'),old=solo(1,'kid','?racingAutoLift=1&racingTight=0');
 assert.equal(now.lifts,0,'no lift event');assert.ok(now.autoSlow<1,'the speed fell on the asphalt with the gas on for '+now.autoSlow.toFixed(2)+' s');
 assert.ok(old.lifts>=10,'v24.5 lifted '+old.lifts+' times');assert.ok(old.autoSlow>8,'v24.5 slowed the car by itself for '+old.autoSlow.toFixed(1)+' s');
});

test('the brake brings the gears down: a gear every BRAKE_DOWN s while the player brakes (0.6 s without the rule)',()=>{
 const downs=query=>{const r=createRacing({stage:1,seed:3,config:{...cfg(query),stage:{opponents:0}}}),p=r.state.player,m=r.track.mainStraight;place(r,p,m.from+20,0,39);r.state.time=10;
  for(let n=0;n<60;n++)r.step(1/60,{steer:0,throttle:1,autoAccelerate:true});const g0=p.gear;
  for(let n=0;n<54;n++)r.step(1/60,{steer:0,throttle:0,autoAccelerate:false,brake:true});const out={g0,g1:p.gear,speed:p.speed};r.dispose();return out;};
 const now=downs(''),old=downs('?racingAutoLift=1');
 assert.ok(now.g0>=6,'top gears on the straight: '+now.g0);assert.ok(now.g0-now.g1>=3,'0.9 s of braking: '+now.g0+' -> '+now.g1);assert.ok(now.g0-now.g1>old.g0-old.g1,'more than without the rule ('+(old.g0-old.g1)+')');
 assert.ok(BRAKE_DOWN<.6);
});

test('tight: at speed the car cannot turn tighter than its grip (yaw rate <= aLat / speed), it scrubs wide, and the rule takes no speed; ?racingTight=0 keeps v24.6',()=>{
 const turn=query=>{const r=createRacing({stage:1,seed:3,config:{...cfg(query),stage:{opponents:0}}}),p=r.state.player,m=r.track.mainStraight;place(r,p,m.from+20,0,38);p.gearInit=true;r.state.time=10;
  let wide=0,h=p.heading,maxYaw=0;for(let n=0;n<30;n++){p.speed=38;r.step(1/60,{steer:1,throttle:1,autoAccelerate:true});maxYaw=Math.max(maxYaw,Math.abs(wrap(p.heading-h))*60);h=p.heading;wide=Math.max(wide,p.wide);}
  const out={maxYaw,wide,speed:p.speed};r.dispose();return out;};
 const now=turn(''),old=turn('?racingTight=0');
 assert.ok(now.maxYaw<=TIGHT.aLat/37.5+.02,'yaw '+now.maxYaw.toFixed(3)+' rad/s at 38 m/s');assert.ok(now.wide>.5,'the tyres scrub: '+now.wide);
 assert.ok(old.maxYaw>now.maxYaw*1.15,'v24.6 turned tighter: '+old.maxYaw.toFixed(3));assert.equal(old.wide,0);
 assert.ok(now.speed>37.5,'no speed taken away by the rule');
});

for(const stage of [1,10])test(`stage ${stage}: a driver who never brakes runs off in the tight corners and loses to one who brakes before them, who stays clean`,()=>{
 const child=solo(stage,'kid'),driver=solo(stage,'driver');
 assert.ok(child.finished&&driver.finished);
 assert.equal(driver.flips,0,'the braking driver never flips');assert.ok(driver.gravel<.5,'and stays off the gravel ('+driver.gravel.toFixed(1)+' s)');assert.equal(driver.lifts,0);
 assert.ok(child.flips>=2,'never braking: '+child.flips+' flips');assert.ok(child.beyond>5,'beyond the asphalt for '+child.beyond.toFixed(1)+' s');assert.ok(child.scrub>3,'tyres scrubbing for '+child.scrub.toFixed(1)+' s');
 assert.ok(driver.time<child.time,'braking is faster: '+driver.time.toFixed(1)+' s against '+child.time.toFixed(1)+' s');
 // most of the lap is still flat out: the child is on the asphalt for most of the race
 assert.ok(child.beyond<child.time*.2);
});

test('tracks v3: six Codex circuits on stages 7-12 and 19-24, scaled to a 2.1 km lap, closed, with a pit straight; the v2 circuits keep the other stages',()=>{
 assert.equal(TRACKS.length,6);assert.equal(TRACKS_V3.length,6);
 assert.deepEqual(TRACKS_V3.map(t=>t.name),V3_STAGES.map(s=>s[0]));assert.deepEqual(TRACKS_V3.map(t=>t.v3.label),V3_STAGES.map(s=>s[1]));
 for(let i=0;i<30;i++){const tier=Math.floor(i/6),stage=RACING_STAGES[i],expected=tier%2?TRACKS_V3[i%6]:TRACKS[i%6];assert.equal(stage.trackId,expected.id,'stage '+(i+1));assert.equal(stage.name,expected.name);}
 assert.equal(getRacingStage(10).timeOfDay,'night','the night city has its own light');assert.equal(getRacingStage(7).timeOfDay,'day');assert.equal(getRacingStage(25).timeOfDay,'night');
 for(const [i,def] of TRACKS_V3.entries()){
  const t=createTrack(7+i);assert.equal(t.id,def.id);assert.ok(Math.abs(t.length-V3_LAP)<12,def.id+' lap '+t.length.toFixed(1));assert.ok(2*t.length>=PIT_AUTO.distance,'long enough for the automatic stop');
  assert.ok(t.mainStraight.length>=380,def.id+' pit straight '+t.mainStraight.length);assert.ok(t.width>=15&&t.width<=18);assert.equal(t.f1,true);assert.ok(v3LookOf(t));
  assert.ok(def.v3.corners.length>=12&&def.v3.corners.some(c=>c.radius<=30)&&def.v3.corners.some(c=>c.radius>=38),'tight and open corners');
  // closed and smooth: no step in position or heading across the start line
  const a=t.sample(t.length-.5),b=t.sample(.5);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1.2);assert.ok(Math.abs(wrap(a.heading-b.heading))<.05);
  const rev=createTrack(19+i);assert.equal(rev.id,def.id);assert.equal(rev.stage.reverse,true);
 }
 assert.equal(createTrack('neon-quay').id,'neon-quay');
});

test('the stage picker names the v3 circuit on its stages (and the v2 circuit with the flag off or another track set)',()=>{
 const line='מפרץ הדקלים · 2 הקפות · אור זהוב · יעד מקום 2';
 assert.equal(racingStageFeature(7,line,''),'מפרץ המגדלור · 2 הקפות · חוף · יעד מקום 2');
 assert.equal(racingStageFeature(22,'רציף המרינה · 3 הקפות · שקיעה · כיוון הפוך · יעד ניצחון',''),'רציף ניאון · 3 הקפות · עיר בלילה · כיוון הפוך · יעד ניצחון');
 for(const s of [1,6,13,18,25,30])assert.equal(racingStageFeature(s,line,''),line);
 assert.equal(racingStageFeature(7,line,'?racingTracksV3=0'),line);assert.equal(racingStageFeature(7,line,'?racingTracks=f1'),line);
 assert.equal(v3StageOn(12,''),true);assert.equal(v3StageOn(13,''),false);
});

test('v3 trackside: eight models a circuit, each one whole beyond the clear zone (also on the reversed stage), behind the pits and stands on the main straight',()=>{
 for(const stage of [7,8,9,10,11,12,19,22]){
  const t=createTrack(stage),half=t.width/2,placed=v3Placements(t,{clear:CLEAR_ZONE,reverse:!!t.stage.reverse,shore:{x:0,z:0,r:900,k:.85}});assert.equal(placed.length,8,t.id);
  for(const p of placed){const d=t.project(p.x,p.z).distance;assert.ok(d-p.r>=half+CLEAR_ZONE-.6,`${t.id} ${p.id}: ${d.toFixed(1)} m from the centre line, radius ${p.r}`);assert.ok(Number.isFinite(p.yaw));}
 }
 assert.deepEqual(v3Placements(createTrack(1)),[]);
});

test('v3 and v6 runtime files are the Codex package files, unchanged, CC0, and only what the game uses was copied',async()=>{
 const props=[];for(const dir of await readdir(path.join(island,'assets/racing-tracks-v3/props')))for(const f of await readdir(path.join(island,'assets/racing-tracks-v3/props',dir)))props.push('props/'+dir+'/'+f);
 assert.equal(props.length,48);const skies=(await readdir(path.join(island,'assets/racing-tracks-v3/skies'))).map(f=>'skies/'+f);assert.equal(skies.length,6);
 for(const f of [...props,...skies])assert.equal(await sha('assets/racing-tracks-v3/'+f),await sha('design/racing-tracks-v3/assets/'+f),f);
 for(const t of TRACKS_V3){assert.ok(skies.includes(t.v3.sky));for(const p of t.v3.props)assert.ok(props.includes(p.asset),p.asset);
  const src=JSON.parse(await read('design/racing-tracks-v3/tracks/'+t.id+'.json'));assert.equal(src.points.length,t.points.length);assert.equal(src.width,t.width);}
 assert.match(await read('assets/racing-tracks-v3/LICENSES.md'),/CC0-1\.0/);assert.match(await read('assets/racing-audio-v6/LICENSE.txt'),/CC0 1\.0 Universal/);
 const audio=(await readdir(path.join(island,'assets/racing-audio-v6'))).filter(f=>/\.(ogg|mp3)$/.test(f)).sort();
 assert.deepEqual(audio,V6_IDS.flatMap(id=>[id+'.mp3',id+'.ogg']).sort(),'three sounds, two formats');assert.deepEqual([...V6_IDS],['pit-limiter','brake','tire-scrub']);
 for(const f of audio)assert.equal(await sha('assets/racing-audio-v6/'+f),await sha('design/racing-audio-v6/assets/'+f),f);
 // left out on purpose: the engine loops (a gear step baked in), the grid idle and the start sounds (Roy's recording, "the start is fine"), the pit air bed,
 // the kerb loop (v24.4 made the kerb silent) and the overtakes (Roy's recorded take is the overtake)
 for(const id of ['engine-low','engine-medium','engine-high','launch-idle','start-lights','launch','pit-ambience','track-edge','overtake-near','overtake-wide','overtake-fast'])assert.ok(!V6_IDS.includes(id)&&!audio.includes(id+'.ogg'),id);
});

function fakeContext(){const made=[],param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(x){this.set=x;},linearRampToValueAtTime(x){(this.ramps||=[]).push(x);},exponentialRampToValueAtTime(x){(this.ramps||=[]).push(x);}});
 const node=(kind,e)=>{const n=Object.assign({kind,connect(){},disconnect(){},start(t){this.started=t;},stop(){}},e);made.push(n);return n;};
 return {made,currentTime:5,destination:{},state:'running',sampleRate:44100,createGain:()=>node('gain',{gain:param(1)}),createOscillator:()=>node('osc',{type:'sine',frequency:param(440),setPeriodicWave(){this.wave=true;}}),
  createBiquadFilter:()=>node('filter',{type:'lowpass',frequency:param(350),Q:param(1)}),createBufferSource:()=>node('src',{playbackRate:param(1),buffer:null,loop:false}),createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),
  createPeriodicWave:()=>({}),createStereoPanner:()=>node('pan',{pan:param(0)}),decodeAudioData:async b=>({duration:2.88,id:b.id}),resume:()=>Promise.resolve(),close:()=>Promise.resolve()};}
async function layerOf({v6=true,fail=null}={}){const c=fakeContext(),urls=[];const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),v4:true,v5:true,v6,format:'ogg',fetchFn:async url=>{urls.push(url);return {ok:!(fail&&fail.test(url)),arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}};}});await layer.load();return {c,layer,urls};}
const shots=(c,id)=>c.made.filter(n=>n.kind==='src'&&!n.loop&&n.started!==undefined&&String(n.buffer?.id||'').includes('/'+id+'.')).length;

test('v6 layer: one pit lane loop while moving, one brake sound per press instead of the v5 loops, a tyre scrub when pushed wide; the kerb stays silent',async()=>{
 const {c,layer,urls}=await layerOf();assert.ok(layer.v6Ready&&layer.v5Ready);
 assert.deepEqual(urls.filter(u=>/racing-audio-v6\//.test(u)).map(u=>u.split('/').pop()).sort(),V6_IDS.map(id=>id+'.ogg').sort());
 const loops=()=>c.made.filter(n=>n.kind==='src'&&n.loop&&String(n.buffer?.id||'').includes('racing-audio-v6/')).length;assert.equal(loops(),1,'one v6 loop (the pit limiter)');
 layer.update({speed:30,surface:'kerb'});let L=layer.levels();assert.equal(Object.values(L.surface).filter(v=>v>0).length,0,'nothing on the kerb, as in v24.4');assert.equal(L.limiter6,0);
 // the brake: one shot on the press, none while held, the v5 and v4 brake loops silent
 layer.update({speed:35,brakePedal:true,braking:true});layer.update({speed:30,brakePedal:true,braking:true});L=layer.levels();
 assert.equal(shots(c,'brake'),1);assert.equal(L.brakes6,1);assert.deepEqual(L.brake5,[0,0,0]);assert.deepEqual(L.brake,[0,0,0]);
 layer.update({speed:25});layer.update({speed:8,brakePedal:true});assert.equal(shots(c,'brake'),1,'no brake sound at a crawl');layer.update({speed:8});
 // the scrub: on the way over the grip, not again within the gap
 layer.update({speed:34,wide:.9});layer.update({speed:34,wide:0});layer.update({speed:34,wide:.9});assert.equal(shots(c,'tire-scrub'),1);assert.equal(layer.levels().scrubs6,1);
 c.currentTime+=V6.scrubGap+.1;layer.update({speed:34,wide:0});layer.update({speed:34,wide:1});assert.equal(shots(c,'tire-scrub'),2);
 layer.update({speed:34,wide:0});c.currentTime+=3;layer.update({speed:10,wide:1});assert.equal(shots(c,'tire-scrub'),2,'not at low speed');
 // the pit lane: moving = the v6 loop alone; standing at the box = v5 as before
 layer.update({speed:20,pitPhase:'lane',toBox:100});L=layer.levels();assert.ok(Math.abs(L.limiter6-v5Gain(V6.limiter[1]))<1e-12,'the package gain');assert.equal(L.pit[0],0);assert.equal(L.pit[1],0);
 layer.update({speed:0,pitPhase:'change'});L=layer.levels();assert.equal(L.limiter6,0);assert.ok(L.pit[0]>0&&L.pit[2]>0&&L.pit[3]>0);
 assert.equal(layer.v6Pass,undefined,'no v6 overtake: Roy\'s recording is the overtake');
});

test('v6 off or missing: nothing is fetched with the flag off; a missing file leaves v5 exactly as it was',async()=>{
 const off=await layerOf({v6:false});assert.equal(off.layer.v6Ready,false);assert.equal(off.urls.filter(u=>/racing-audio-v6/.test(u)).length,0);
 off.layer.update({speed:35,brakePedal:true,braking:true});assert.ok(off.layer.levels().brake5[2]>0,'the v5 brake loop');
 const broken=await layerOf({fail:/tire-scrub/});assert.equal(broken.layer.v6Ready,false);assert.ok(broken.layer.v5Ready);
 broken.layer.update({speed:35,brakePedal:true,braking:true,wide:1,surface:'kerb'});assert.ok(broken.layer.levels().brake5[2]>0);assert.equal(shots(broken.c,'brake'),0);
});

test('v6 does not touch the v24.6 fixes or Roy\'s recordings: no backfire, no blip, no road noise, his take is the overtake',()=>{
 const clock={t:5};let ctx;const param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const fake=()=>{const made=[],node=(kind,e)=>{const n=Object.assign({kind,connect(){},disconnect(){},start(t){this.started=t;},stop(){}},e);made.push(n);return n;};
  return {made,get currentTime(){return clock.t;},destination:{},state:'running',sampleRate:44100,createGain:()=>node('gain',{gain:param(1)}),createOscillator:()=>node('osc',{type:'sine',frequency:param(440),setPeriodicWave(){}}),createBiquadFilter:()=>node('filter',{type:'lowpass',frequency:param(350),Q:param(1)}),
   createBufferSource:()=>node('src',{playbackRate:param(1),buffer:null,loop:false}),createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),createPeriodicWave:()=>({}),createStereoPanner:()=>node('pan',{pan:param(0)}),resume:()=>Promise.resolve(),close:()=>Promise.resolve()};};
 const calls={backfire:0,shiftDown:0,recPass:0,v6Pass:0,updates:[]};
 const layer={ready:true,recReady:true,v6Ready:true,update(o){calls.updates.push(o);},backfire(){calls.backfire++;},shiftDown(){calls.shiftDown++;},shiftDownSoft(){calls.shiftDown++;},shiftBeep(){},recIdle:()=>true,recPass(){calls.recPass++;return true;},v6Pass(){calls.v6Pass++;return true;},dispose(){},levels:()=>({})};
 const audio=createRacingAudio({AudioContext:function(){ctx=fake();return ctx;},storage:{getItem:()=>'on'},air:'v245',pass:'v244',rec:true,v246:true,v6:true,layer});audio.unlock();
 const at=(dt,speed,extras)=>{clock.t+=dt;audio.sync(speed,false,extras);};
 for(let i=0;i<30;i++)at(1/60,60,{rpm:.9,gear:7,throttle:1,wide:.8});
 assert.equal(audio.engine().noise,0,'no road noise at 60 m/s');assert.equal(calls.updates.at(-1).wide,.8,'the scrub level reaches the sample layer');
 at(1/60,58,{rpm:.85,gear:7,throttle:.15});let gear=7;for(let k=0;k<3;k++){for(let i=0;i<19;i++)at(1/60,52-k*6,{rpm:.6,gear,throttle:.15});gear--;at(1/60,50-k*6,{rpm:.8,gear,throttle:.15});}
 const e=audio.engine();assert.equal(e.backfires,0);assert.equal(e.blips,0);assert.equal(calls.backfire,0);assert.equal(calls.shiftDown,0);assert.equal(e.v246,true);assert.equal(e.v6,true);
 audio.event('pass',{pan:.4});assert.equal(calls.recPass,1,'Roy\'s recorded engine driving away');assert.equal(calls.v6Pass,0,'no v6 overtake');
 audio.dispose();
 const plain=createRacingAudio({AudioContext:function(){return fake();},storage:null});plain.unlock();assert.equal(plain.engine().v6,false,'off unless the session asks');plain.dispose();
});

test('the session passes the flags; the offline list has the 60 runtime files and the shell the new modules; the design packages are not published',async()=>{
 const session=await read('minigames/racing-session.mjs');
 assert.match(session,/racingV247Flags\(\)/);assert.match(session,/\.\.\.v245PhysicsConfig\(v245\),\.\.\.v247PhysicsConfig\(v247,v245\.gears\)/);assert.match(session,/v6:v247\.audioV6/);assert.match(session,/wide:p\.wide\|\|0/);
 assert.match(session,/v246:v246\.audio/,'the v24.6 audio flag is still passed');
 const manifest=JSON.parse(await read('offline-manifest.json')),list=manifest.games.racing.filter(p=>/^assets\/(racing-audio-v6|racing-tracks-v3)\//.test(p));
 assert.equal(list.length,60);assert.equal(list.filter(p=>/racing-audio-v6/.test(p)).length,6);assert.equal(list.filter(p=>/\.glb$/.test(p)).length,48);assert.equal(list.filter(p=>/\.webp$/.test(p)).length,6);
 const bytes=list.reduce((n,p)=>n+manifest.files[p][1],0);assert.ok(bytes<1.0e6,'the two packages add '+(bytes/1048576).toFixed(2)+' MB to the offline download');
 for(const m of ['minigames/racing-v24-7.mjs','minigames/racing-tracks-v3-env.mjs','assets/racing-tracks-v3/tracks.mjs'])assert.ok(manifest.shell.includes(m),m);
 const pages=await readFile(path.join(island,'../../.github/workflows/pages.yml'),'utf8');assert.match(pages,/ racing-audio-v6 /);assert.match(pages,/ racing-tracks-v3[ ;]/);
});
