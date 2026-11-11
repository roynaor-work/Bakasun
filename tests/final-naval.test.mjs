// 11/11/2026 final fix (Fable), ships: spin aim (reach, smoothness, stop, flags), camera follow for spin, edge hint,
// anti-air model (aircraft fall into the sea, Vulcan start/stop sounds, stages with attacks) and the air audio contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
import {navalAimSpin,navalSpinConfig,navalSpinFine,navalSpinRate,navalSpinStep,navalSpinFollow,navalFollowYaw,navalEdgeHint,navalAimWide,navalAimLegacy} from '../workout/island/minigames/naval-aim-flag.mjs';
import {createNavalAir,navalAirConfig,NAVAL_AIR_LIFT} from '../workout/island/minigames/naval-air.mjs';
import {createNavalAirAudio,NAVAL_AIR_AUDIO_FILES} from '../workout/island/minigames/naval-air-audio.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {navalDangerMarks} from '../workout/island/minigames/naval-hud.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,nb=config.navalDuel,DEG=180/Math.PI;

test('spin aim flag: on by default, off for v1, v19 and v20; the older flags keep their meaning',()=>{
 assert.equal(navalAimSpin('?dev=1'),true);assert.equal(navalAimSpin(''),true);
 for(const v of ['v1','v19','v20'])assert.equal(navalAimSpin(`?navalAim=${v}`),false,v);
 assert.equal(navalAimWide('?navalAim=v20'),true,'v20 keeps the wide gain');assert.equal(navalAimWide('?navalAim=v19'),false);assert.equal(navalAimLegacy('?navalAim=v1'),true);
});

test('spin aim: fine near the start, dead band, then a turn rate that grows with distance to the cap; the config block is read',()=>{
 const c=navalSpinConfig(nb);assert.deepEqual(c,{finePerPx:.12,finePx:22,deadPx:22,spanPx:56,maxRate:150,curve:1.4,maxStep:.1});
 assert.ok(Math.abs(navalSpinFine(10,nb)*DEG-1.2)<1e-9,'0.12 deg/px near the start');assert.ok(Math.abs(navalSpinFine(300,nb)*DEG-22*.12)<1e-9,'the fine part stops at finePx');
 assert.equal(navalSpinRate(0,nb),0);assert.equal(navalSpinRate(22,nb),0);assert.equal(navalSpinRate(-21,nb),0,'inside the dead band nothing turns');
 let last=0;for(let d=23;d<=200;d++){const r=navalSpinRate(d,nb)*DEG;assert.ok(r>last||r===150,`monotone at ${d}`);last=r;assert.ok(Math.abs(navalSpinRate(-d,nb)+navalSpinRate(d,nb))<1e-12,'symmetric');}
 assert.ok(Math.abs(navalSpinRate(78,nb)*DEG-150)<1e-9,'full rate at deadPx+spanPx');assert.ok(Math.abs(navalSpinRate(400,nb)*DEG-150)<1e-9,'capped');
 // From the Fire button only 62 px of screen remain to the right: that still gives a fast turn, and 120 degrees in under 1.5 s.
 const r62=navalSpinRate(62,nb)*DEG;assert.ok(r62>=80&&r62<=110,`62 px gives ${r62.toFixed(1)} deg/s`);
 let spin=0;for(let t=0;t<1.5;t+=1/60)spin=navalSpinStep(spin,62,1/60,nb);assert.ok(spin*DEG+navalSpinFine(62,nb)*DEG>=120,`1.5 s at 62 px reaches ${(spin*DEG).toFixed(0)} deg`);
 assert.equal(navalSpinStep(1,100,0,nb),1,'no time, no turn');assert.ok(Math.abs(navalSpinStep(0,100,5,nb)-navalSpinRate(100,nb)*.1)<1e-12,'a frozen tab counts as one short step');
 assert.equal(navalSpinStep(undefined,100,.1,nb),navalSpinRate(100,nb)*.1);assert.equal(navalSpinRate(NaN,nb),0);
 // Defaults without a config block.
 assert.deepEqual(navalSpinConfig({}),navalSpinConfig(nb));
});

test('spin aim through the real input path: the Fire control held 62 px right turns the turret past 120 degrees, smoothly, and stops when the thumb comes back',()=>{
 const model=createNavalModel({config,balance:nb,level:3,seed:2,random:seededRandom(2)});
 const listeners=new Map(),on=(t,fn)=>{listeners.set(t,[...(listeners.get(t)||[]),fn]);},fire={setAttribute(){},addEventListener:on,getAttribute:()=>null},node={addEventListener:on,style:{setProperty(){},removeProperty(){}},dataset:{},classList:{toggle(){},remove(){},add(){}},querySelector:s=>s==='#shoot'?fire:null,prepend(){},append(){}};
 const winListeners=new Map();globalThis.window={addEventListener(t,fn){winListeners.set(t,[...(winListeners.get(t)||[]),fn]);}};globalThis.document={addEventListener(){},createElement:undefined};
 try{
  const input=createNavalInput({controls:node,canvas:{addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:844,height:390})},balance:nb,t:k=>k},()=>model,()=>null);
  const emit=(map,type,e)=>{for(const fn of map.get(type)||[])fn(e);};
  const update=raw=>model.update(1/60,input.sample(raw));
  const y0=model.turret.yaw;emit(listeners,'pointerdown',{pointerId:1,clientX:778,clientY:324,timeStamp:0,preventDefault(){}});
  // Nine 8 px moves to +62 then hold 1.5 s.
  const yaws=[];for(let i=1;i<=8;i++){emit(winListeners,'pointermove',{pointerId:1,clientX:778+Math.min(62,i*8),clientY:324,timeStamp:i*16});update({});yaws.push(model.turret.yaw);}
  for(let i=0;i<90;i++){update({});yaws.push(model.turret.yaw);}
  const turned=(model.turret.yaw-y0)*DEG;assert.ok(turned>=120,`turned ${turned.toFixed(1)} deg`);
  let step=0;for(let i=1;i<yaws.length;i++)step=Math.max(step,Math.abs(yaws[i]-yaws[i-1])*DEG);assert.ok(step<=3.5,`largest step per frame ${step.toFixed(2)} deg`);
  assert.ok(model.aiming,'still aiming');
  // Thumb back to the start: the turn stops within the frame.
  emit(winListeners,'pointermove',{pointerId:1,clientX:778,clientY:324,timeStamp:2000});update({});const held=model.turret.yaw;for(let i=0;i<30;i++)update({});assert.ok(Math.abs(model.turret.yaw-held)*DEG<.5,'no drift once the thumb is back');
  // Release fires once, at the turret as it stands (the thumb-lift filter only looks 70 ms back).
  const fired=model.fired;emit(winListeners,'pointerup',{pointerId:1,clientX:778,clientY:324,timeStamp:2600});update({});assert.equal(model.fired,fired+1);assert.ok(Math.abs(model.ball.launch.yaw-held)*DEG<1,'the shell leaves along the held turret');
  // A vertical drag alone never turns the turret.
  const y1=model.turret.yaw;emit(listeners,'pointerdown',{pointerId:2,clientX:778,clientY:324,timeStamp:3000,preventDefault(){}});for(let i=1;i<=10;i++){emit(winListeners,'pointermove',{pointerId:2,clientX:778,clientY:324-i*9,timeStamp:3000+i*16});update({});}for(let i=0;i<30;i++)update({});
  assert.ok(Math.abs(model.turret.yaw-y1)*DEG<1,'vertical drag keeps the yaw');assert.ok(model.turret.elevation>nb.ballistics.defaultElevation,'and raises the barrel');
  emit(winListeners,'pointercancel',{pointerId:2});update({});
  input.dispose();
 }finally{delete globalThis.window;delete globalThis.document;}
});

test('camera follow for spin: faster and with a smaller lead than v20, so a turret turning at full rate keeps the landing near the middle',()=>{
 const f=navalSpinFollow(nb);assert.equal(f.rate,7);assert.equal(f.maxLeadDegrees,30);assert.equal(f.yawFixed,.12,'other follow fields are kept');
 const cfg={aimControls:{...nb.aimControls,follow:f}};let cam=0,yaw=0;const rate=150/DEG;
 for(let i=0;i<300;i++){yaw+=rate/60;cam=navalFollowYaw(cam,yaw,1/60,cfg,true);}
 const lead=Math.atan2(Math.sin(yaw-cam),Math.cos(yaw-cam))*DEG;assert.ok(lead>0&&lead<=30,`lead ${lead.toFixed(1)} deg behind a 150 deg/s turn`);
 const v20=navalFollowYaw(0,2,1/60,nb,true);assert.ok(Math.abs(2-v20)*DEG<=34+1e-9,'v20 cap unchanged');
 assert.deepEqual(navalSpinFollow({}),{rate:7,maxLeadDegrees:30});
});

test('edge hint: null on screen, an arrow on the border toward a point outside, flipped for a point behind the camera',()=>{
 assert.equal(navalEdgeHint({x:400,y:200,depth:5},844,390),null);assert.equal(navalEdgeHint(null,844,390),null);assert.equal(navalEdgeHint({x:NaN,y:1,depth:1},844,390),null);
 const right=navalEdgeHint({x:1200,y:195,depth:5},844,390);assert.ok(Math.abs(right.x-818)<1e-9&&Math.abs(right.angle)<.02&&!right.behind);
 const top=navalEdgeHint({x:430,y:-80,depth:5},844,390);assert.ok(Math.abs(top.y-26)<1e-9&&top.angle<-1.4);
 const behind=navalEdgeHint({x:100,y:200,depth:-2},844,390);assert.ok(behind.behind&&behind.x>422,'behind the camera: the arrow points the other way');
 const inset=navalEdgeHint({x:10,y:200,depth:5},844,390,26);assert.ok(inset&&inset.x===26);
});

test('anti-air model: a hit aircraft falls into the sea instead of vanishing, the Vulcan reports start and stop once each, kills and splashes are counted',()=>{
 const cfg=navalAirConfig({air:{from:0,every:99,count:1,kinds:['plane']},damage:1},nb),sim=createNavalAir(cfg,nb),random=seededRandom(3),sounds=[],shots=[];
 const player={x:60,z:0},ctx=t=>({time:t,dt:.02,random,player,enemyShots:shots,settings:{damage:1},sound:n=>sounds.push(n),score(){}});
 let t=0,down=null,maxH=0,minH=Infinity;for(let i=0;i<3000;i++){t+=.02;sim.step(ctx(t));const a=sim.air[0];if(a){maxH=Math.max(maxH,a.h);if(a.state==='down'){down??={t,h:a.h};minH=Math.min(minH,a.h);}}if(sim.state.splashes>0)break;}
 assert.ok(sim.state.kills===1,'one kill');assert.ok(down,'the aircraft entered the falling state');assert.ok(down.h>5,'it started to fall from height');assert.equal(sim.state.splashes,1,'and splashed');assert.equal(sim.air.length,0,'then left the sea');
 assert.ok(sounds.includes('splash')&&sounds.includes('explosion'));void minH;
 const starts=sounds.filter(n=>n==='vulcanStart').length,stops=sounds.filter(n=>n==='vulcanStop').length;assert.ok(starts>=1&&stops>=1&&Math.abs(starts-stops)<=1,`start/stop pairs (${starts}/${stops})`);
 assert.ok(sim.tracers.every(tr=>typeof tr.hit==='boolean'&&Number.isFinite(tr.h)),'tracers carry a hit flag and a height');
 assert.equal(NAVAL_AIR_LIFT,.32);
});

test('anti-air stages: the stage data names attacks on 3, 4, 6, 8, 9 and the v20 stages; stages 1, 2, 5, 10 and 11 stay clear; the game model exposes them',()=>{
 const withAir=nb.levels.map((l,i)=>l.air?i+1:null).filter(Boolean);
 assert.deepEqual(withAir,[3,4,6,8,9,12,14,16,18,20,22,24,26,27,29]);
 for(const n of withAir){const a=nb.levels[n-1].air;assert.ok(a.from>=10&&a.every>=24&&a.count>=1&&a.count<=3&&a.kinds.every(k=>['plane','heli'].includes(k)),`stage ${n} block`);}
 assert.equal(navalAirConfig(nb.levels[0],nb),null);assert.ok(navalAirConfig(nb.levels[2],nb).vulcan.rate===22);
 const m=createNavalModel({config,balance:nb,level:3,seed:4,random:seededRandom(4)});assert.ok(m.vulcan,'stage 3 has the Vulcan');
 let seen=0,kills=0;for(let i=0;i<4500&&!m.result;i++){m.update(.02,{});seen=Math.max(seen,m.air.length);kills=m.vulcan.kills;}
 assert.ok(seen>=1,'aircraft appeared on stage 3');assert.ok(kills>=1,'and the Vulcan shot one down within 90 s');
 const marks=navalDangerMarks({enemies:[],air:m.air,enemyShots:[],time:m.time,playerShip:m.playerShip},nb,(x,z)=>({x:400,y:200,depth:1}),844,390);assert.ok(Array.isArray(marks));
 assert.equal(createNavalModel({config,balance:nb,level:5,seed:1,random:seededRandom(1)}).vulcan,null);
});

test('air audio: ignores other sound names, needs an unlocked context, start then stop toggles the loop, honours the sound toggle and the pause',async()=>{
 assert.deepEqual([...NAVAL_AIR_AUDIO_FILES],['vulcan-spin-up','vulcan-fire-loop','vulcan-spin-down']);
 const nodes=[];class FakeContext{constructor(){this.state='running';this.currentTime=0;this.destination={};}createGain(){const g={gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}};return g;}createBufferSource(){const n={buffer:null,loop:false,playbackRate:{value:1},connect(){},disconnect(){},start(){n.started=true;},stop(){n.stopped=true;}};nodes.push(n);return n;}decodeAudioData(bytes){return Promise.resolve({length:bytes.byteLength});}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const fetched=[],fetcher=async url=>{fetched.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 let flag='on';const storage={getItem:k=>k==='island.sound'?flag:null};
 const audio=createNavalAirAudio({storage,AudioContext:FakeContext,fetch:fetcher});
 assert.equal(audio.play('vulcanStart'),false,'locked: nothing plays');audio.unlock();await new Promise(r=>setTimeout(r,5));
 assert.equal(audio.metrics().loaded.length,3);assert.ok(fetched.every(u=>u.includes('assets/game-naval/audio/')&&u.includes('?v=island-v2-20261107-8')),'tagged asset urls');
 assert.equal(audio.play('cannon'),false,'other names are ignored');
 assert.equal(audio.play('vulcanStart'),true);assert.ok(audio.metrics().looping);assert.equal(audio.play('vulcanStart'),false,'already looping');
 assert.equal(audio.play('vulcanStop'),true);assert.ok(!audio.metrics().looping);assert.equal(audio.play('vulcanStop'),false,'nothing to stop');
 assert.ok(nodes.some(n=>n.loop&&n.stopped),'the loop node was stopped');
 flag='off';assert.equal(audio.play('vulcanStart'),false,'muted by the island toggle');flag='on';
 audio.play('vulcanStart');audio.setPaused(true);assert.ok(!audio.metrics().looping,'pause ends the loop');assert.equal(audio.play('vulcanStart'),false);audio.setPaused(false);
 audio.dispose();assert.equal(audio.metrics().disposed,true);assert.equal(audio.play('vulcanStart'),false);
});

// ---- 11/11/2026 phase 2 (Roy, phone): ammo limit and manual Vulcan ----
import {navalAmmoLimit,navalMagazines,navalLoad,navalSupplyNeeded,navalBuoySpot,navalCollect,navalBuoyReached,navalBuoyDrift,navalAmmoState,navalSupplyConfig} from '../workout/island/minigames/naval-supply.mjs';
import {navalAirManual,navalSkyAngles,navalSkyError,navalSkyPoint} from '../workout/island/minigames/naval-air.mjs';

test('ammo limit: flag, magazines from the stage stock (12 to 24 loaded shells), belt, state levels, buoy spot inside the bounds, collect reloads from stock',()=>{
 assert.equal(navalAmmoLimit('?dev=1'),true);assert.equal(navalAmmoLimit('?navalAmmo=0'),false);
 const m1=navalMagazines(nb.levels[0],nb),m3=navalMagazines(nb.levels[2],nb),m12=navalMagazines(nb.levels[11],nb);
 assert.deepEqual(m1.ammo,[13,3,10,6,8,3]);assert.equal(m3.ammo[0],17);assert.equal(m12.ammo[0],18);assert.equal(m1.belt,160);
 assert.equal(navalMagazines({ammunition:[4,0,0,0,0,0]},nb).ammo[0],12,'never below the minimum');assert.equal(navalMagazines({ammunition:[90,0,0,0,0,0]},nb).ammo[0],24,'never above the maximum');
 assert.equal(navalLoad(28,13),13);assert.equal(navalLoad(5,13),5,'a stock smaller than the magazine loads what there is');assert.equal(navalLoad(0,13),0);
 assert.deepEqual(navalAmmoState(13,13,3),{fraction:1,level:'ok'});assert.equal(navalAmmoState(3,13,3).level,'low');assert.equal(navalAmmoState(0,13,3).level,'empty');
 const c=navalSupplyConfig(nb);assert.equal(c.lowShells,3);assert.equal(c.collect,16);assert.deepEqual(c.refill,{guided:1,torpedo:4,mine:2,salvo:2});
 assert.equal(navalSupplyNeeded(13,28,160,m1,[],nb),false);assert.equal(navalSupplyNeeded(3,15,160,m1,[],nb),true,'low shells');assert.equal(navalSupplyNeeded(3,3,160,m1,[],nb),true,'low shells even with no stock: the buoy brings fresh shells');
 assert.equal(navalSupplyNeeded(13,28,30,m1,[],nb),true,'low belt');assert.equal(navalSupplyNeeded(3,15,160,m1,[{x:0,z:0}],nb),false,'one buoy at a time');
 assert.equal(navalSupplyNeeded(7,28,160,m1,[],nb,true),true,'after a sinking below the wave share');assert.equal(navalSupplyNeeded(9,28,160,m1,[],nb,true),false);
 const r=seededRandom(7);for(let i=0;i<50;i++){const b=navalBuoySpot({x:60,z:0,heading:Math.PI/2},r,nb.movement,nb);assert.ok(b.x>=nb.movement.minX&&b.x<=nb.movement.maxX&&b.z>=nb.movement.minZ&&b.z<=nb.movement.maxZ);const d=Math.hypot(b.x-60,b.z);assert.ok(d>=30&&d<=70.01,`distance ${d}`);}
 const ammo=[2,0,3,6,8,3],got=navalCollect(ammo,2,20,m1,nb.levels[0],nb);assert.equal(got.loaded,13,'a full magazine of fresh shells');assert.deepEqual(ammo,[13,1,7,6,8,3],'the stock grew by the 11 missing rounds');assert.deepEqual(got.added,[11,1,4,0,0,0]);assert.equal(got.belt,140);
 assert.equal(navalBuoyReached({x:60,z:0},{x:70,z:10},nb),true);assert.equal(navalBuoyReached({x:60,z:0},{x:80,z:0},nb),false);
 const buoy={x:120,z:0,born:0};assert.equal(navalBuoyDrift(buoy,{x:60,z:0},0,.5,1,nb),false,'waits driftAfter');assert.equal(navalBuoyDrift(buoy,{x:60,z:0},5,.5,10,nb),false,'does not drift while shells are loaded');
 assert.equal(navalBuoyDrift(buoy,{x:60,z:0},0,.5,10,nb),true);assert.ok(Math.abs(buoy.x-112)<1e-9&&buoy.drifting);
});

test('ammo limit in the model: the stock keeps the stage counts, the magazine empties and a buoy appears, sailing into it reloads, a stranded ship gets the buoy drifted to it; v20 counts with the flag off',()=>{
 const m=createNavalModel({config,balance:nb,level:1,seed:3,random:seededRandom(3)});
 assert.deepEqual(m.ammo,nb.levels[0].ammunition,'stock unchanged');assert.equal(m.loaded,13);assert.equal(m.belt,null,'no Vulcan on stage 1, no belt');assert.equal(m.ammoState.level,'ok');
 let shots=0;for(let i=0;i<2000&&m.loaded>3;i++){m.update(.02,m.cooldowns[0]<=0?{ammoIndex:0,aimYaw:1.2,aimElevation:30,aimPower:1,fireRelease:true}:{});}
 m.update(.02,{});shots=nb.levels[0].ammunition[0]-m.ammo[0];assert.equal(m.loaded,3);assert.equal(shots,10);assert.equal(m.buoys.length,1,'a buoy at the low mark (checked on the next frame)');assert.equal(m.lastFeedback.kind,'supply');
 for(let i=0;i<400&&m.loaded>0;i++)m.update(.02,m.cooldowns[0]<=0?{ammoIndex:0,aimYaw:1.2,aimElevation:30,aimPower:1,fireRelease:true}:{});
 assert.equal(m.loaded,0);assert.equal(m.ammoState.level,'empty');const fired=m.fired;m.update(.02,{ammoIndex:0,aimYaw:1.2,aimElevation:30,aimPower:1,fireRelease:true});assert.equal(m.fired,fired,'nothing loaded, nothing fires');
 // Passive ship: the buoy drifts over within a few seconds and reloads from the stock.
 for(let i=0;i<400&&m.loaded<=0;i++)m.update(.02,{});
 assert.ok(m.loaded>0,'reloaded');assert.equal(m.supplies,1);assert.equal(m.buoys.length,0);assert.equal(m.lastAction.type,'supply');assert.equal(m.loaded,13);assert.ok(m.ammo[0]>=13,'the stock holds the fresh magazine');
 assert.equal(createNavalModel({config,balance:nb,level:1,seed:3,random:seededRandom(3)}).magazines.ammo[0],13);
});

test('manual Vulcan: flag, sky angles, cone error, crosshair point; the model fires only while held and the headless drive keeps the automatic gun',()=>{
 assert.equal(navalAirManual('?dev=1'),true);assert.equal(navalAirManual('?navalAirAim=auto'),false);
 const player={x:60,z:0},a={x:160,z:0,h:22};const t=navalSkyAngles(player,a,nb);assert.ok(Math.abs(t.yaw)<1e-9&&t.dist===100&&t.pitch>.3&&t.pitch<.6,JSON.stringify(t));
 assert.ok(Math.abs(navalSkyError({yaw:0,pitch:t.pitch},t))<1e-9);assert.ok(Math.abs(navalSkyError({yaw:6*Math.PI/180,pitch:t.pitch},t)-6)<1e-9);assert.ok(Math.abs(navalSkyError({yaw:Math.PI*2-.1,pitch:t.pitch},{yaw:.1,pitch:t.pitch})-.2*180/Math.PI)<1e-9,'wraps');
 const p=navalSkyPoint(player,{yaw:0,pitch:t.pitch},100,nb);assert.ok(Math.abs(p.x-160)<1e-9&&Math.abs(p.h-22)<1e-6,'the crosshair point at the aircraft distance is the aircraft');
 const make=()=>createNavalModel({config,balance:nb,level:3,seed:4,random:seededRandom(4)});
 // Headless: no input layer, the gun stays automatic (v20 contract).
 const auto=make();for(let i=0;i<4500&&!auto.vulcan.kills;i++)auto.update(.02,{});assert.ok(auto.vulcan.kills>=1);assert.equal(auto.vulcan.manual,false);
 // Manual, never held: zero shots; held with the crosshair on the aircraft: shots, hits and a kill within a few seconds; held off target: shots but no hits.
 const idle=make();for(let i=0;i<4500;i++)idle.update(.02,{skyMode:'manual'});assert.equal(idle.vulcan.shots,0,'no shots without the button');assert.equal(idle.vulcan.manual,true);assert.ok(idle.vulcan.spawned>=1);
 const held=make();let first=null,down=null;for(let i=0;i<4500&&down===null;i++){const a=held.air.find(a=>a.state!=='down');const input={skyMode:'manual'};if(a){first??=held.time;const tt=navalSkyAngles(held.playerShip,a,nb);Object.assign(input,{skyHeld:true,skyYaw:tt.yaw,skyPitch:tt.pitch});}held.update(.02,input);if(held.vulcan.kills)down=held.time;}
 assert.ok(down!==null&&down-first<4,`downed in ${(down-first).toFixed(1)} s`);assert.ok(held.vulcan.hits>0&&held.belt<160,'belt spent');
 const off=make();for(let i=0;i<3000;i++){const a=off.air.find(a=>a.state!=='down');const input={skyMode:'manual'};if(a){const tt=navalSkyAngles(off.playerShip,a,nb);Object.assign(input,{skyHeld:true,skyYaw:tt.yaw+Math.PI/2,skyPitch:tt.pitch});}off.update(.02,input);}
 assert.ok(off.vulcan.shots>0&&off.vulcan.hits===0,'firing 90 degrees off hits nothing');assert.equal(off.vulcan.onTarget,false);
});

// ---- 11/11/2026 phase 2 (C): enemy base every 5 stages ----
import {navalBaseRows,navalBaseEnabled,NAVAL_BASE_DEFAULTS,navalCampaignStage} from '../workout/island/minigames/naval-campaign.mjs';

test('enemy base: flag, rows per block (guns fire, towers optional, gate, depot with chain, pen on subpen), armour scales hp, stages 5/15/25 carry a block (10, 20, 30 stay fleets for the v20 pilot tests); the campaign roster is unchanged',()=>{
 assert.equal(navalBaseEnabled('?dev=1'),true);assert.equal(navalBaseEnabled('?navalBase=0'),false);assert.deepEqual(navalBaseRows(null),[]);
 const withBase=nb.levels.map((l,i)=>l.base?i+1:null).filter(Boolean);assert.deepEqual(withBase,[5,15,25]);
 for(const n of withBase){const b=nb.levels[n-1].base;assert.ok(['coast','palace','subpen'].includes(b.variant));assert.ok(b.guns>=2&&b.guns<=5&&b.armor>=1&&b.armor<=1.6,`stage ${n} block`);}
 assert.deepEqual(withBase.map(n=>nb.levels[n-1].base.variant),['coast','palace','subpen'],'three looks');
 const rows=navalBaseRows(nb.levels[4].base,5,nb);assert.deepEqual(rows.map(r=>r.structure),['gun','gun','tower','depot']);
 for(const r of rows){assert.equal(r.behavior,'base');assert.equal(r.kind,1);assert.ok(r.x>=60&&r.x<=130&&Math.abs(r.z)<=120,`offset ${r.x}`);assert.equal(r.variant,'coast');}
 assert.ok(rows[0].cannons===1&&rows[2].cannons===0&&rows[2].main===false&&rows[3].chain===true&&rows[3].main===true);
 const r25=navalBaseRows(nb.levels[24].base,25,nb);assert.equal(r25.filter(r=>r.structure==='gun').length,4);assert.ok(r25.some(r=>r.structure==='gate'));
 assert.ok(r25.find(r=>r.structure==='gun').hpScale>rows.find(r=>r.structure==='gun').hpScale,'armour grows with the stage');
 assert.ok(r25.some(r=>r.structure==='pen'),'subpen variant adds the pen');assert.ok(!navalBaseRows(nb.levels[14].base,15,nb).some(r=>r.structure==='pen'));
 assert.equal(NAVAL_BASE_DEFAULTS.chainRadius,75);
 // The campaign's own roster and mission keep the v20 contract (roster length = waves, mission id unchanged).
 const c=navalCampaignStage(nb,5,1);assert.equal(c.fleet.length,c.settings.waves);assert.equal(c.mission.id,'fleet');assert.ok(!c.fleet.some(r=>r.structure));
});

test('enemy base in the model: structures join the roster, guns telegraph and fire, the objective needs the fleet and the main targets, the depot explosion damages its neighbours, the base bar reads the state',()=>{
 const m=createNavalModel({config,balance:nb,level:5,seed:2,random:seededRandom(2)});
 const st=m.enemies.filter(e=>e.structure);assert.equal(st.length,4);assert.ok(st.every(e=>e.active&&e.x>nb.enemyX&&e.behavior==='base'));assert.equal(m.mission.base,'coast');
 assert.deepEqual(m.missionState.base,{completed:0,total:3});assert.equal(m.baseHealth.total,3);assert.equal(m.baseHealth.left,3);
 // Guns telegraph before they fire.
 let warned=false,fired=0;for(let i=0;i<1500&&!(warned&&fired>0);i++){m.playerShip.hp=m.playerShip.maxHp;m.update(.02,{});if(st.some(e=>e.structure==='gun'&&e.attack))warned=true;fired=m.enemyFired;}
 assert.ok(warned,'a gun shows its landing mark');assert.ok(fired>0,'and fires');
 // Sink the whole fleet: not complete while the base's main targets stand.
 m.playerShip.hp=m.playerShip.maxHp;for(const e of m.enemies)if(!e.structure){e.hp=0;e.sunkAt=m.time;}m.update(.02,{});assert.equal(m.missionState.fleet.complete,true);assert.equal(m.missionState.complete,false);assert.equal(m.result,undefined);
 // Depot explosion: the neighbours lose 60% of their max health (the tower, 70 units away, is inside the chain radius).
 const depot=st.find(e=>e.structure==='depot'),before=st.filter(e=>e!==depot).map(e=>e.hp);
 // The base stands past the fleet, so the ship sails closer first (the shell's range is about 335 units).
 // From the flank, so the line of fire clears the guns in front of the depot.
 m.playerShip.x=300;m.playerShip.z=depot.z+80;m.update(.02,{ammoIndex:0,targetX:depot.x,targetZ:depot.z,fireRelease:true});assert.equal(m.prediction?.contact?.index,depot.index,'the solved shot meets the depot hull (the target box reaches it)');depot.hp=.01;for(let i=0;i<300&&depot.hp>0;i++){m.playerShip.hp=m.playerShip.maxHp;m.update(.02,{});}
 assert.ok(depot.hp<=0,'the depot went down');assert.ok(m.chainBlast,'chain blast recorded');
 const after=st.filter(e=>e!==depot).map(e=>e.hp);assert.ok(after.some((hp,i)=>hp<before[i]),'a neighbour was damaged by the explosion');
 // Clear the rest: the stage is won.
 for(const e of st)if(e.hp>0){e.hp=0;e.sunkAt=m.time;}for(let i=0;i<200&&!m.result;i++)m.update(.02,{});assert.equal(m.result?.outcome,'win');
 // Stage 10 keeps its moving fleet (no base), stage 1 is clean.
 assert.equal(createNavalModel({config,balance:nb,level:10,seed:1,random:seededRandom(1)}).enemies.some(e=>e.structure),false);
 assert.equal(createNavalModel({config,balance:nb,level:1,seed:1,random:seededRandom(1)}).baseHealth,null);
});
