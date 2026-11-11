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
 assert.equal(audio.metrics().loaded.length,3);assert.ok(fetched.every(u=>u.includes('assets/game-naval/audio/')&&u.includes('?v=island-v2-20261107-9')),'tagged asset urls');
 assert.equal(audio.play('cannon'),false,'other names are ignored');
 assert.equal(audio.play('vulcanStart'),true);assert.ok(audio.metrics().looping);assert.equal(audio.play('vulcanStart'),false,'already looping');
 assert.equal(audio.play('vulcanStop'),true);assert.ok(!audio.metrics().looping);assert.equal(audio.play('vulcanStop'),false,'nothing to stop');
 assert.ok(nodes.some(n=>n.loop&&n.stopped),'the loop node was stopped');
 flag='off';assert.equal(audio.play('vulcanStart'),false,'muted by the island toggle');flag='on';
 audio.play('vulcanStart');audio.setPaused(true);assert.ok(!audio.metrics().looping,'pause ends the loop');assert.equal(audio.play('vulcanStart'),false);audio.setPaused(false);
 audio.dispose();assert.equal(audio.metrics().disposed,true);assert.equal(audio.play('vulcanStart'),false);
});
