// racing-v24 (Roy after v23 on the phone): the turbo and the noise after every corner, the flip that flips back onto the track, no way back from a slow exit,
// tyre wear and pit stops, every rival a formula car, the brake sound, the ricochet at a contact, no automatic slow-down in a turn, the background hiss.
// Every change has an address flag that brings v23 back; the pure race model keeps v23 unless its config asks for v24 (the session asks by default).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {racingV24Flags,v24PhysicsConfig,playerInput,pitLane,tyreWorn,PIT,RECOVER,OFF_SLOW} from '../workout/island/minigames/racing-v24.mjs';
import {OFF_TRACK,CLEAR_ZONE} from '../workout/island/minigames/racing-offtrack.mjs';
import {pickLod,FA,formulaAllEnabled} from '../workout/island/minigames/racing-formula-all.mjs';
import {createRacingAudio} from '../workout/island/minigames/racing-audio.mjs';
import {createRacingSamples} from '../workout/island/minigames/racing-samples.mjs';
import {V23,V24,pilot,recoverExit,offSlow,cornerTest,bumpTest,pitRace} from '../workout/island/tools/racing-v24-sim.mjs';
import {createTrack} from '../workout/island/minigames/racing-tracks.mjs';

const island=new URL('../workout/island/',import.meta.url),read=f=>readFile(new URL(f,island),'utf8');

test('flags: v24 by default; racingTurbo, racingRecover, racingBrakeAuto, racingBump, racingHiss = v23 and racingOffSlow, racingPit, racingFormulaAll, racingAudioV4 = 0 bring v23 back',()=>{
 assert.deepEqual({...racingV24Flags('')},{turbo:'v24',recover:'v24',offSlow:true,pit:true,formulaAll:true,brakeAuto:'v24',bump:'v24',hiss:'v24',audioV4:true});
 assert.deepEqual({...racingV24Flags('?racingTurbo=v23&racingRecover=v23&racingOffSlow=0&racingPit=0&racingFormulaAll=0&racingBrakeAuto=v23&racingBump=v23&racingHiss=v23&racingAudioV4=0')},
  {turbo:'v23',recover:'v23',offSlow:false,pit:false,formulaAll:false,brakeAuto:'v23',bump:'v23',hiss:'v23',audioV4:false});
 assert.deepEqual(v24PhysicsConfig(racingV24Flags('')),{shiftInput:false,recover:'v24',offSlow:true,pit:true,cornerSlow:false,bump:'v24'});
 assert.deepEqual(V23,{shiftInput:true,recover:'v23',offSlow:false,pit:false,cornerSlow:true,bump:'v23'},'the v23 flags give the pure model its v23 defaults');
 assert.equal(formulaAllEnabled(''),true);assert.equal(formulaAllEnabled('?racingFormulaAll=0'),false);
 // the one touch button sends brake + drift: v24 keeps only the brake, v23 both
 const button={steer:.4,throttle:0,brake:true,drift:true};
 assert.deepEqual(playerInput(button,racingV24Flags('')),{steer:.4,throttle:0,brake:true,drift:false});assert.equal(playerInput(button,racingV24Flags('?racingTurbo=v23')),button);
});

test('turbo after every corner (root cause): the brake button drifted, the release gave a drift boost and the boost end played the blow-off; v24 brakes only',()=>{
 // a child's corner on the six circuits: the brake button held from the brake point through the corner, released at the exit
 const kid=(cfg,flags)=>{let boosts=0,boostSteps=0,crashes=0;for(const stage of [1,2,3,4,5,6]){const race=createRacing({stage,seed:7,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),p=race.state.player,st={};
  for(let n=0;n<45*60;n++){race.step(1/60,playerInput(pilot(race,p,st),flags));if(p.boosting)boostSteps++;for(const e of race.state.events)if(e.car==='player'){if(e.type==='driftBoost')boosts++;if(e.type==='crash')crashes++;}}race.dispose();}
  return {boosts,boostSeconds:boostSteps/60,crashes};};
 const before=kid(V23,racingV24Flags('?racingTurbo=v23')),after=kid(V24,racingV24Flags(''));
 assert.ok(before.boosts>=6&&before.boostSeconds>3,'v23: a drift boost after the braked corners '+JSON.stringify(before));
 assert.equal(after.boosts,0,'v24: no drift boost');assert.ok(after.boostSeconds<before.boostSeconds/4,'v24: only the painted boost pad (once a lap) is left: '+after.boostSeconds+' s against '+before.boostSeconds);
});

test('no forced gear change from the steering: v24 shift points do not move with the wheel or the brake (v23: just under a shift point the wheel alone shifts up)',()=>{
 const run=cfg=>{const race=createRacing({stage:1,seed:2,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),p=race.state.player,tr=race.track;
  for(let n=0;n<5*60;n++)race.step(1/60,{brake:true,autoAccelerate:false});
  // the speed held 0.4% of the top under the 5->6 shift point (GEAR_BOUNDS .76 times the circuit's scale); the wheel goes left and right (the car stays on the road)
  const scale=1-.12*Math.min(1,tr.cornerFraction/.5),speed=race.stage.playerSpeed*(.76*scale-.004),q=tr.sample(40);
  Object.assign(p,{x:q.x,z:q.z,heading:q.heading,s:q.s,routeS:40,previousS:40,progress:40,lateral:0,speed,gearInit:false,recoveryTime:0});
  let changes=0,g=null,maxLat=0;for(let n=0;n<3*60;n++){const steer=n>40&&n<140?(Math.floor(n/15)%2?.6:-.6):0;race.step(1/60,{steer,throttle:0,autoAccelerate:false});p.speed=speed;if(g!==null&&p.gear!==g)changes++;g=p.gear;maxLat=Math.max(maxLat,Math.abs(p.lateral));}
  race.dispose();return {changes,maxLat,half:tr.width/2};};
 const a=run(V23),b=run(V24);assert.ok(a.maxLat<a.half&&b.maxLat<b.half,'on the road the whole time');
 assert.ok(a.changes>=1,'v23: the wheel alone shifts '+JSON.stringify(a));assert.equal(b.changes,0,'v24: no gear change from the wheel '+JSON.stringify(b));
});

test('the blow-off at the end of a boost: v23 plays it (the "noise" after the corner turbo), v24 does not; the shift sound a stays the default',()=>{
 const mock=()=>{const param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}),node=e=>Object.assign({connect(){},disconnect(){},start(){},stop(){}},e);
  return class{constructor(){this.state='running';this.currentTime=1;this.destination={};this.sampleRate=44100;}createOscillator(){return node({type:'sine',frequency:param(440)});}createBiquadFilter(){return node({type:'lowpass',frequency:param(350),Q:param(1)});}
   createGain(){return node({gain:param(1)});}createBuffer(){return {getChannelData:()=>new Float32Array(64)};}createBufferSource(){return node({playbackRate:param(1),buffer:null});}resume(){return Promise.resolve();}close(){return Promise.resolve();}};};
 for(const [blowoff,expect] of [[true,1],[false,0]]){const C=mock();let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=new C();return ctx;},storage:{getItem:()=>'on'},blowoff});audio.unlock();
  for(const [t,b] of [[1,true],[1.1,true],[1.2,false],[1.3,false]]){ctx.currentTime=t;audio.sync(30,b,{rpm:.6,gear:4,throttle:1});}
  assert.equal(audio.engine().blowoffs,expect,'blow-off '+blowoff);assert.equal(audio.engine().shiftStyle,'a','the gear sound Roy chose stays');}
});

test('recover v24, 1,000 hard exits over the 30 stages: one roll where the car left, no rolling back in, a short vanish, a soft drop, the centre line at speed 0, no gate',()=>{
 let w=99;const r=()=>((w=(Math.imul(w,1664525)+1013904223)>>>0)/4294967296),rows=[];
 for(let i=0;i<1000;i++)rows.push(recoverExit(1+(i%30),1+Math.floor(r()*9999),{drive:1+r()*4,side:r()<.5?-1:1,lock:.55+r()*.45}));
 const bad=rows.filter(a=>!a.landing||a.nan||a.secondRolls>0||a.latAtTrigger-a.minAbsLatWhileRolling>1.2||a.dropRises>0||Math.abs(a.dropMax-RECOVER.dropHeight)>.02||Math.abs(a.hidden-RECOVER.vanish)>.05
  ||a.landing.speed>.01||Math.abs(a.landing.lateral)>1e-6||Math.abs(a.landing.headingError)>1e-6||a.landing.gateGranted||!a.landing.beforeNextGate||!a.landing.soft||a.maxBeyond>RECOVER.maxBeyond+.05||a.speedAfter3s<8);
 assert.deepEqual(bad.slice(0,3),[],`${bad.length} of 1000 exits went wrong`);
 assert.ok(Math.max(...rows.map(a=>a.maxBeyond))<CLEAR_ZONE-1,'the roll never reaches a trackside object');
 assert.ok(rows.every(a=>a.phases==='tumble>rest>vanish>drop>done'),'every exit: tumble, rest, vanish, drop');
 const total=rows.map(a=>a.total);assert.ok(Math.min(...total)>1.6&&Math.max(...total)<2.2,'the whole return takes 1.6-2.2 s: '+Math.min(...total)+'..'+Math.max(...total));
});

test('?racingRecover=v23: the old flight back to the centre line while rolling (what Roy saw as a second flip)',()=>{
 const a=recoverExit(1,5,{cfg:{...V24,recover:'v23'},drive:2});
 assert.ok(a.landing,'it lands');assert.ok(a.latAtTrigger-a.minAbsLatWhileRolling>5,'v23 rolls all the way back across the run-off: '+(a.latAtTrigger-a.minAbsLatWhileRolling));
 const b=recoverExit(1,5,{cfg:V24,drive:2});assert.ok(b.latAtTrigger-b.minAbsLatWhileRolling<1.2,'v24 rolls where it left');
});

test('slow exit: from 1.5-8 m off the asphalt, standing, the gas and the wheel always bring the car back (v24), the v23 grass held it; left alone it comes back softly in 5-8 s',()=>{
 for(const stage of [1,2,3,4,5,6])for(const beyond of [1.5,3,4.5,6,8]){
  const v24=offSlow(stage,beyond,{cfg:V24,mode:'drive'});assert.ok(v24.back!==null&&v24.back<5,`v24 stage ${stage}, ${beyond} m: back on the road by itself: `+JSON.stringify(v24));assert.equal(v24.flip,null,'no flip');
  const alone=offSlow(stage,beyond,{cfg:V24,mode:'alone',seconds:10});assert.ok(alone.soft&&alone.soft.t>=5&&alone.soft.t<=8,`alone: a soft return in 5-8 s: `+JSON.stringify(alone));assert.equal(alone.flip,null,'alone: no flip');
 }
 const old=offSlow(1,4.5,{cfg:V23,mode:'drive'});assert.ok(old.back===null&&old.maxSpeed<3,'v23: the grass holds a standing car (8 m/s^2 of drag beat the engine): '+JSON.stringify(old));
});

test('no automatic slow-down in a turn (v24): full lock at 38 m/s for half a second (on the asphalt) keeps the speed; v23 bled 2+ m/s; the brake is the brake; ERS still charges',()=>{
 const a=cornerTest(V23),b=cornerTest(V24);assert.ok(a.turn.maxLateral<a.turn.half&&b.turn.maxLateral<b.turn.half,'both stayed on the asphalt: the loss is the turn itself');
 assert.ok(a.turn.loss>1.5,'v23: the turn itself took '+a.turn.loss);assert.ok(Math.abs(b.turn.loss)<.3,'v24: the turn keeps the speed: '+b.turn.loss);
 assert.ok(b.turn.ers>0,'v24: the corner still charges the ERS');assert.ok(Math.abs(a.brake.decel-b.brake.decel)<.5&&b.brake.decel>20,'the brake is unchanged: '+b.brake.decel);
});

test('contact (v24): the cars bounce apart with a knock and both pay speed; v23 only nudged; the player hears and feels it whichever car it was',()=>{
 const s23=bumpTest(V23,{kind:'side'}),s24=bumpTest(V24,{kind:'side'}),r23=bumpTest(V23,{kind:'rear'}),r24=bumpTest(V24,{kind:'rear'});
 assert.ok(s24.bumps>=1&&s23.bumps>=1);
 assert.ok(s24.gapAfter0_3s>s23.gapAfter0_3s+.6,'side: a real ricochet, the cars 0.3 s later '+s23.gapAfter0_3s+' -> '+s24.gapAfter0_3s+' m apart');
 assert.ok(s24.atContact.lossPct.a+s24.atContact.lossPct.b>s23.atContact.lossPct.a+s23.atContact.lossPct.b+2,'side: both lose more at the contact '+JSON.stringify([s23.atContact,s24.atContact]));
 assert.ok(r24.atContact.lossPct.a>r23.atContact.lossPct.a+8,'rear: the car behind pays more '+r23.atContact.lossPct.a+'% -> '+r24.atContact.lossPct.a+'%');assert.ok(r24.gapAfter0_3s>r23.gapAfter0_3s+1.5,'rear: they bounce apart '+r23.gapAfter0_3s+' -> '+r24.gapAfter0_3s);
 assert.ok(s24.first.intensity>0&&s24.first.intensity<=1,'the event carries an intensity for the sound and the camera');
});

test('tyres: 1 when new, wear with distance, grip and top speed fade gradually, nothing changes without pits',()=>{
 assert.equal(tyreWorn(1),0);assert.equal(tyreWorn(PIT.wornAt),0);assert.ok(tyreWorn(.4)>0&&tyreWorn(.4)<tyreWorn(.2)&&tyreWorn(0)===1);
 const race=createRacing({stage:13,seed:3,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...V24}}),p=race.state.player,st={};assert.ok(race.pit.on,'3 laps: pits on');
 for(let n=0;n<70*60&&p.lap<2;n++)race.step(1/60,playerInput(pilot(race,p,st),racingV24Flags('')));
 assert.ok(p.tyre>.6&&p.tyre<.85,'about a quarter of the tyre per lap: '+p.tyre);race.dispose();
 const off=createRacing({stage:13,seed:3,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...V23}});assert.equal(off.pit.on,false);
 for(let n=0;n<30*60;n++)off.step(1/60,{steer:0,throttle:1,autoAccelerate:true});assert.equal(off.state.player.tyre,1,'racingPit=0: no wear');off.dispose();
 const two=createRacing({stage:1,seed:3,config:{countdown:0,extraRivals:0,...V24}});assert.equal(two.pit.on,false,'a 2-lap race has no pits');two.dispose();
});

test('pit stops over 6 league-length races (3 laps, 12 cars, the six circuits): every car stops once, 2-3 s in the box, 20 m/s in the lane, fresh tyres, the order changes, the race ends in time',()=>{
 const rows=[];for(const stage of [13,14,15,16,17,18])rows.push(pitRace(stage,stage===17?11:3,{extra:7}));
 for(const r of rows){
  assert.equal(r.phase,'finished',`stage ${r.stage}: the race ends`);assert.ok(r.time<295,`stage ${r.stage}: under the 295 s clock (${r.time})`);
  assert.equal(r.carsStopped,r.cars,`stage ${r.stage} seed ${r.seed}: every car stopped `+JSON.stringify(r.pitLaps));
  for(const s of r.stops){assert.ok(s.stopped>=1.95&&s.stopped<=3.05,'2-3 s in the box: '+JSON.stringify(s));assert.ok(s.lap<r.laps,'never on the last lap');}
  assert.ok(r.maxPitLaneSpeed<=PIT.speed+.01,'pit lane speed '+r.maxPitLaneSpeed);
 }
 const laps=rows.flatMap(r=>r.pitLaps.flat());assert.ok(laps.includes(1)&&laps.includes(2),'the computer drivers stop on different laps: '+[...new Set(laps)]);
 assert.ok(rows.some(r=>r.stops.some(s=>s.rankOut>s.rankIn)),'a stop costs places for a while (the order changes)');
});

test('the player: the pit button asks for the stop at the next entry, a tap starts the change at once (2 s), without a tap it starts after 0.8 s; no stop on the last lap',()=>{
 const tapped=pitRace(13,3,{extra:0,tapAt:15}),p1=tapped.stops.find(s=>s.car==='player');assert.ok(p1&&p1.lap===1,'requested on lap 1: the stop at the end of lap 1 '+JSON.stringify(tapped.stops));
 assert.ok(p1.stopped>=1.95&&p1.stopped<=2.6,'the tap: about 2 s in the box: '+p1.stopped);
 const auto=pitRace(13,3,{extra:0}),p2=auto.stops.find(s=>s.car==='player');assert.ok(p2,'the automatic stop (worn tyres or the last chance)');assert.ok(p2.lap===2,'on lap 2 of 3: '+p2.lap);
 const race=createRacing({stage:13,seed:3,config:{countdown:0,extraRivals:0,...V24}});race.state.player.lap=3;assert.equal(race.requestPit(),false,'no stop asked on the last lap');race.dispose();
 const lane=pitLane(createTrack(13));assert.ok(lane.entry<lane.lane0&&lane.lane0<lane.boxS(0,12)&&lane.boxS(11,12)<lane.lane1&&lane.lane1<lane.exit,'entry, lane, boxes, exit in order');
 assert.ok(lane.lat<-(createTrack(13).width/2+4.8)&&lane.boxLat<lane.lat,'in the painted pit lane, the boxes on the far side');
});

test('formula for every rival: three Codex levels picked by distance with hysteresis, the files and their triangle counts',async()=>{
 assert.equal(pickLod(5),0);assert.equal(pickLod(30),1);assert.equal(pickLod(80),2);
 assert.equal(pickLod(19,0),0,'inside the band: stays');assert.equal(pickLod(22,0),1,'past the band: changes');assert.equal(pickLod(16,1),1);assert.equal(pickLod(14,1),0);assert.equal(pickLod(43,1),1);assert.equal(pickLod(46,1),2);
 assert.equal(pickLod(5,-1,{minLod:1}),1,'a weak device never draws level 0');assert.equal(pickLod(NaN),2);
 for(const [level,tris] of [[0,4608],[1,1604],[2,472]]){const b=Buffer.from(await readFile(new URL(`assets/racing-formula-cars-v1/formula-lod${level}.glb`,island)));const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  let n=0;for(const m of json.meshes)for(const p of m.primitives)n+=json.accessors[p.indices].count/3;assert.equal(n,tris,'level '+level);assert.equal(FA.triangles[level],tris);
  assert.ok(json.materials.map(m=>m.name).join()==='body_team,wing_team,secondary,tire,alloy,helmet,visor','the paint parts');}
 const view=await read('minigames/racing-view.mjs');assert.match(view,/formulaAllEnabled\(\)/);assert.match(view,/attachFormulaAll\(/);assert.match(view,/formulaAll\?\.update\(camera,data,dt\)/);
});

test('brake and bump sounds (Codex v4): braking plays one brake loop by speed, never the v3 brake squeal or the v2 tyre squeal; a hard contact the hard bump; v23 keeps the squeals',async()=>{
 const ctx=()=>({currentTime:1,destination:{},src:[],createGain(){const g={gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}};return g;},
  createBufferSource(){const s={playbackRate:{value:1,setTargetAtTime(v){this.value=v;}},connect(g){this.g=g;},disconnect(){},start(){},stop(){},loop:false,buffer:null};this.src.push(s);return s;},decodeAudioData:async b=>({duration:1,id:b.id})});
 const make=async v4=>{const c=ctx(),urls=[];const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),base3:new URL('http://x/racing-audio-v3/'),base4:new URL('http://x/racing-audio-v4/'),v3:true,v4,format:'ogg',
  fetchFn:async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}};}});await layer.load();return {c,layer,urls};};
 const on=await make(true);assert.ok(on.layer.v4Ready,'v4 loaded');assert.ok(on.urls.some(u=>/racing-audio-v4\/brake-loop-hard\.ogg$/.test(u)));
 on.layer.update({rpm:.5,speed:36,braking:true});let l=on.layer.levels();assert.ok(l.brake[2]>0&&l.brake[0]===0&&l.brake[1]===0,'hard braking at speed: the hard loop only '+JSON.stringify(l));assert.equal(l.brakeSqueal,0);assert.equal(l.squeal,0);
 on.layer.update({rpm:.4,speed:14,braking:true});l=on.layer.levels();assert.ok(l.brake[0]>0&&l.brake[2]===0,'light braking: the light loop');
 on.layer.update({rpm:.4,speed:30,braking:false});l=on.layer.levels();assert.ok(l.brake.every(v=>v===0),'off the brake: silent');
 const n0=on.c.src.length;on.layer.event('bump',.9,{side:true});const shot=on.c.src.slice(n0);assert.equal(shot.length,2,'a hard side contact: the hard bump and the side scrape');
 const off=await make(false);off.layer.update({rpm:.5,speed:36,braking:true});const lo=off.layer.levels();assert.ok(lo.brakeSqueal>0||lo.squeal>0,'v23: the old squeal under braking');
});

test('background hiss (v24): standing still the wind loop and the engine noise layer are silent, they come in only with real speed; v23 hissed even at a standstill',async()=>{
 const ctx=()=>({currentTime:1,destination:{},createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}};},
  createBufferSource(){return {playbackRate:{value:1,setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){},start(){},stop(){},loop:false};},decodeAudioData:async()=>({duration:1})});
 const level=async(hiss,speed)=>{const layer=createRacingSamples({context:ctx(),base:new URL('http://x/a/'),format:'ogg',hiss,fetchFn:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});await layer.load();layer.update({rpm:.2,speed,throttle:0});return layer.levels().wind;};
 assert.ok(await level('v23',0)>.01,'v23: wind at a standstill');assert.equal(await level('v24',0),0,'v24: no wind standing still');assert.equal(await level('v24',8),0,'v24: none at walking pace');
 assert.ok(await level('v24',45)>0&&await level('v24',45)<await level('v23',45),'v24: some wind at speed, under the v23 level');
});

test('Codex pit pack (design/racing-pit-v1): the crew files carry the ten clips and the team mask, the pit sounds play in order over the change, the wear icons follow the tyre',async()=>{
 const {CREW,pitCrewEnabled}=await import('../workout/island/minigames/racing-pit-crew.mjs');const {wearStep}=await import('../workout/island/minigames/racing-pit-ui.mjs');
 assert.equal(pitCrewEnabled(''),true);assert.equal(pitCrewEnabled('?racingPitCrew=0'),false);assert.equal(CREW.length,6,'four wheel changers, the jack operator, the light controller');
 for(const c of CREW){const b=Buffer.from(await readFile(new URL(`assets/racing-pit-v1/models/${c.id}.glb`,island)));const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const names=json.animations.map(a=>a.name);for(const clip of ['idle_wait','rush_in','remove_wheel','mount_wheel','jack_up','jack_down','thumbs_up','step_back','signal_release'])assert.ok(names.includes(clip),c.id+' '+clip);
  assert.ok('_TEAM_MASK' in json.meshes[0].primitives[0].attributes,c.id+' team mask');assert.equal(json.skins.length,1);}
 assert.deepEqual([1,.8,.74,.5,.26,.2,0].map(wearStep),[0,0,1,2,2,3,3],'the four steps of the icons');
 // the sounds: the jack at the stop, guns/wheel/wheel/guns spread over the change, cheer and engine at the end
 const c={currentTime:5,destination:{},src:[],createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}};},
  createBufferSource(){const s={playbackRate:{value:1,setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){},start(t){this.started=t;},stop(){},loop:false,buffer:null};this.src.push(s);return s;},decodeAudioData:async b=>({duration:1,id:b.id})};
 const urls=[];const layer=createRacingSamples({context:c,base:new URL('http://x/racing-audio-v2/'),basePit:new URL('http://x/racing-pit-v1/audio/'),pit:true,format:'ogg',fetchFn:async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>{const a=new ArrayBuffer(8);a.id=url;return a;}};}});
 await layer.load();assert.ok(layer.pitReady);assert.ok(urls.some(u=>/racing-pit-v1\/audio\/wheel_gun_loosen\.ogg$/.test(u)));
 const n0=c.src.length;assert.equal(layer.pitCue('pitStop'),true);assert.equal(c.src.length,n0+1,'the jack');
 const n1=c.src.length;layer.pitCue('pitChange',2);const change=c.src.slice(n1).map(s=>+(s.started-5).toFixed(2));assert.deepEqual(change,[0,.5,1.04,1.32],'guns, wheel off, wheel on, guns over the 2 s change');
 const n2=c.src.length;layer.pitCue('pitDone');assert.equal(c.src.length,n2+2,'the cheer and the engine');
 const view=await read('minigames/racing-view.mjs');assert.match(view,/pitCrewEnabled\(\)\?m\.loadPitCrew\(/);assert.match(view,/pitCrew\?\.update\(state,dt\)/);assert.match(view,/if\(!lite\)import\('\.\/racing-pit-crew\.mjs/);
});

test('session, view, effects and offline list carry v24',async()=>{
 const session=await read('minigames/racing-session.mjs');
 assert.match(session,/v24PhysicsConfig\(v24\)/);assert.match(session,/lastInput=playerInput\(input\.sample\(\),v24\)/);assert.match(session,/createPitUi\(/);assert.match(session,/racing-v24\.css/);
 assert.match(session,/blowoff:v24\.turbo==='v23'/);
 const view=await read('minigames/racing-view.mjs');assert.match(view,/&&!c\.hidden/);assert.match(view,/car\.body\.position\.y=c\.dropY\|\|0/);
 const effects=await read('minigames/racing-effects.mjs');assert.match(effects,/crashRest/);
 const m=JSON.parse(await read('offline-manifest.json'));for(const f of ['minigames/racing-v24.mjs','minigames/racing-recover.mjs','minigames/racing-pit.mjs','minigames/racing-pit-ui.mjs','minigames/racing-pit-view.mjs','minigames/racing-pit-crew.mjs','minigames/racing-formula-all.mjs','minigames/racing-v24.css'])assert.ok(m.shell.includes(f),f);
 for(const f of ['assets/racing-pit-v1/models/wheel_front_left.glb','assets/racing-pit-v1/audio/crew_cheer.ogg','assets/racing-pit-v1/icons/tire_wear_3.svg','assets/racing-formula-cars-v1/formula-lod0.glb','assets/racing-formula-cars-v1/formula-lod1.glb','assets/racing-formula-cars-v1/formula-lod2.glb','assets/racing-audio-v4/brake-loop-hard.ogg','assets/racing-audio-v4/car-bump-hard.mp3','assets/racing-audio-v4/side-scrape.ogg'])
  {assert.ok(m.games.racing.includes(f),f);await access(new URL(f,island));}
});

// the three v24 Codex packages, one by one: the offline racing group carries exactly these runtime files (racing-v7.test.mjs counts them as a block), each byte-identical
// to the Codex original in design/, and the licence text travels with each package
const V24_PACKS={
 'racing-audio-v4':{design:'design/racing-audio-v4/',files:['brake-loop-hard','brake-loop-light','brake-loop-medium','car-bump-hard','car-bump-soft','side-scrape'].flatMap(f=>[f+'.mp3',f+'.ogg']),licence:['LICENSE.txt','DEDICATION.txt']},
 'racing-formula-cars-v1':{design:'design/racing-formula-cars-v1/assets/',files:['formula-lod0.glb','formula-lod1.glb','formula-lod2.glb'],licence:['LICENSES.md'],licenceDesign:'design/racing-formula-cars-v1/'},
 'racing-pit-v1':{design:'design/racing-pit-v1/',files:[...['crew_cheer','engine_exit','jack','wheel_attach','wheel_drop','wheel_gun_loosen','wheel_gun_tighten'].flatMap(f=>['audio/'+f+'.mp3','audio/'+f+'.ogg']),
  ...['pit_entry','tire_wear_0','tire_wear_1','tire_wear_2','tire_wear_3','wheel_change'].map(f=>'icons/'+f+'.svg'),
  ...['jack_operator','light_controller','pit_light_exit','tire_stack','wheel_front_left','wheel_front_right','wheel_rear_left','wheel_rear_right'].map(f=>'models/'+f+'.glb')],licence:['LICENSES.md']}
};
test('offline: the v24 packages are listed one by one, each file byte-identical to its Codex original, with the licence',async()=>{
 const m=JSON.parse(await read('offline-manifest.json')),listed=m.games.racing.filter(p=>/^assets\/(racing-audio-v4|racing-formula-cars-v1|racing-pit-v1)\//.test(p)).sort();
 const expected=Object.entries(V24_PACKS).flatMap(([dir,p])=>p.files.map(f=>`assets/${dir}/${f}`)).sort();
 assert.equal(expected.length,43);assert.deepEqual(listed,expected,'exactly the runtime files, no licence text and no review files');
 for(const [dir,p] of Object.entries(V24_PACKS)){
  for(const f of p.files)assert.ok((await readFile(new URL(`assets/${dir}/${f}`,island))).equals(await readFile(new URL(p.design+f,island))),`${dir}/${f} differs from ${p.design}${f}`);
  for(const f of p.licence)assert.ok((await readFile(new URL(`assets/${dir}/${f}`,island))).equals(await readFile(new URL((p.licenceDesign||p.design)+f,island))),`${dir}/${f}`);
 }
});
