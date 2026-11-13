// 13/11/2026 v23 (Roy, after v22 on the phone): lock-on for the ships. A long press on an enemy hull locks it, the turret turns by itself
// onto a solution that meets the hull where it will be (forecast fleet, wind), all the way round whatever the hull's heading, and one tap
// on Fire fires; another long press or the sinking ends the lock. `?navalLock=0` restores v22 (held spin aim only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel,navalTargetable} from '../workout/island/minigames/naval.mjs';
import {createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
import {navalLockOn,navalLockConfig,navalLockPick,navalHullScreenDistance,navalLockSolve,navalLockSlew,navalLockAligned,navalLockStatus,NAVAL_LOCK_DEFAULTS} from '../workout/island/minigames/naval-lockon.mjs';
import {drawNavalLockHud,navalLockBox,NAVAL_LOCK_WORDS} from '../workout/island/minigames/naval-lockon-hud.mjs';
import {navalLaunch} from '../workout/island/minigames/naval-ballistics.mjs';
import {navalForecast} from '../workout/island/minigames/naval-forecast.mjs';
import {navalStagePressure} from '../workout/island/minigames/naval-campaign.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,nb=config.navalDuel,DEG=180/Math.PI;
const phone={...config,width:844,height:390};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** The model under a search string (the flags read location.search). */
function make(stage,seed,search=''){globalThis.location={search};try{return createNavalModel({config:phone,balance:nb,level:stage,seed,random:seededRandom(seed),difficulty:stage});}finally{delete globalThis.location;}}
const run=(m,frames,input={})=>{for(let i=0;i<frames&&!m.result;i++)m.update(1/60,typeof input==='function'?input(m,i):input);};
const context=m=>({time:m.time,player:m.playerShip,concurrent:m.settings.concurrent,fleetLength:m.enemies.filter(e=>!e.structure).length,drift:m.settings.drift});
const solve=(m,e,kind=0)=>navalLockSolve({ship:m.playerShip,target:e,enemies:m.enemies,wind:m.wind,kind,pressure:navalStagePressure(m.settings.difficulty),context:context(m),targetable:x=>x.active&&x.hp>0&&navalTargetable(x,kind,nb)},nb,navalLockConfig(nb));
/** Fly a solution through the same forecast the arc uses: which hull does it meet? */
const flown=(m,s,kind=0)=>navalForecast(navalLaunch({ship:m.playerShip,yaw:s.yaw,elevation:s.elevation,power:s.power,wind:m.wind,ammo:kind,pressure:navalStagePressure(m.settings.difficulty)},nb),m.enemies,{...context(m),targetable:x=>x.active&&x.hp>0&&navalTargetable(x,kind,nb)},nb).contact?.index??null;

test('lock-on flag: on by default, off with ?navalLock=0 only; the defaults are read and can be tuned from the balance',()=>{
 assert.equal(navalLockOn(''),true);assert.equal(navalLockOn('?dev=1'),true);assert.equal(navalLockOn('?navalLock=0'),false);assert.equal(navalLockOn('?navalLock=1'),true);assert.equal(navalLockOn('?navalAim=v20'),true,'independent of the aim flags');
 const c=navalLockConfig(nb);assert.equal(c.holdSeconds,.45);assert.equal(c.movePixels,12);assert.equal(c.slew.maxYawDeg,240);assert.deepEqual([...c.powers],[1,.86,.74,.64,.55,.47]);
 assert.equal(navalLockConfig({lockOn:{holdSeconds:.6,slew:{rate:8}}}).holdSeconds,.6);assert.equal(navalLockConfig({lockOn:{slew:{rate:8}}}).slew.maxYawDeg,240,'nested defaults kept');
});

test('pick: a finger on the hull line or on its bar picks the hull, open water picks nothing, the nearest hull wins, hulls behind the camera or sunk are skipped',()=>{
 assert.equal(navalHullScreenDistance({x:50,y:100},{x:0,y:100},{x:100,y:100}),0);assert.equal(navalHullScreenDistance({x:50,y:80},{x:0,y:100},{x:100,y:100},26),0,'above the line counts up to the lift');
 assert.equal(navalHullScreenDistance({x:50,y:120},{x:0,y:100},{x:100,y:100},26),20,'below the line does not');assert.equal(navalHullScreenDistance({x:130,y:100},{x:0,y:100},{x:100,y:100}),30);
 const m=make(10,1);run(m,30);const project=(x,z,y)=>m.screenPoint(x,z,y),live=m.enemies.filter(e=>e.active&&e.hp>0);assert.ok(live.length>=3);
 for(const e of live){const q=project(e.x,e.z,1.5);assert.equal(navalLockPick(m.enemies,project,q,844,390,null,nb),e.index,`hull ${e.index} under the finger`);assert.equal(navalLockPick(m.enemies,project,{x:q.x,y:q.y-22},844,390,null,nb),e.index,'on its bar');}
 assert.equal(navalLockPick(m.enemies,project,{x:420,y:330},844,390,null,nb),null,'open water near our own ship');assert.equal(navalLockPick(m.enemies,project,{x:NaN,y:1},844,390,null,nb),null);
 const e=live[0],q=project(e.x,e.z,1.5);e.hp=0;assert.notEqual(navalLockPick(m.enemies,project,q,844,390,null,nb),e.index,'a sunk hull is not picked');
 assert.equal(navalLockPick(m.enemies,()=>({x:400,y:200,depth:-1}),{x:400,y:200},844,390,null,nb),null,'behind the camera');
});

test('solver: a ready solution meets the locked hull in the forecast, on moving fleets of every stage; far, blocked and diving hulls say so honestly',()=>{
 const tally={ready:0,readyHit:0,far:0,blocked:0,miss:0};
 for(const stage of [1,3,6,10,14,20,26,30])for(const seed of [1,2]){
  const m=make(stage,seed);run(m,90);
  for(const e of m.enemies.filter(e=>e.active&&e.hp>0&&!e.structure)){const s=solve(m,e);tally[s.status]++;
   assert.ok(Number.isFinite(s.yaw)&&Number.isFinite(s.elevation)&&s.power>=nb.ballistics.minPower&&s.power<=1,'real turret settings');
   if(s.status==='ready'){assert.equal(flown(m,s),e.index,`stage ${stage} hull ${e.index}: the solution meets the hull`);tally.readyHit++;}
   if(s.status==='far')assert.equal(s.reachable,false);
   if(s.status==='miss')assert.ok(nb.shipTypes[e.kind].submarine&&e.depth>0,'a miss here is a submarine under water');}
 }
 assert.ok(tally.ready>=20,JSON.stringify(tally));assert.equal(tally.readyHit,tally.ready);
 // Far: the ship is pulled back out of reach (a shell flies about 335 units).
 const far=make(3,1);run(far,30);far.playerShip.x=-200;const fs=solve(far,far.enemies[0]);assert.equal(fs.status,'far');assert.equal(fs.reachable,false);
 // Guided missile and repair need no ballistic solution: bearing only.
 const g=solve(far,far.enemies[0],1);assert.equal(g.status,'ready');assert.ok(Math.abs(g.yaw-Math.atan2(far.enemies[0].z-far.playerShip.z,far.enemies[0].x-far.playerShip.x))<1e-12);
});

test('solver on a shore base: when the flat arc meets a structure in front, a steeper arc (lower power) drops onto the locked one',()=>{
 let steeper=0,checked=0;
 for(const stage of [5,15,25])for(const seed of [1,2,3]){
  const m=make(stage,seed);run(m,30);
  for(const e of m.enemies.filter(e=>e.structure)){m.playerShip.x=Math.max(60,e.x-220);m.playerShip.z=e.z+(seed%2?40:-40);const s=solve(m,e);checked++;
   if(s.status==='ready'){assert.equal(flown(m,s),e.index,`stage ${stage} ${e.structure}`);if(s.power<1)steeper++;}
   else assert.ok(['blocked','far'].includes(s.status),s.status);}
 }
 assert.ok(checked>=20);assert.ok(steeper>=1,`at least one structure needed the steeper arc (${steeper})`);
});

test('torpedo and mine: the torpedo runs on the water to the hull, the mine is laid where the hull will be',()=>{
 const m=make(3,2);run(m,60);const e=m.enemies.find(e=>e.active&&e.hp>0);m.playerShip.x=e.x-200;
 const t=solve(m,e,2);assert.equal(t.elevation,0);if(t.status==='ready')assert.equal(flown(m,t,2),e.index);
 const mine=solve(m,e,3);assert.equal(mine.status,'ready');assert.equal(mine.contact.mine,true);assert.ok(mine.end&&Math.hypot(mine.end.x-e.x,mine.end.z-e.z)<60,'the mine lands by the hull');
});

test('slew: exponential with a speed cap, the short way round, converges; aligned and status words',()=>{
 const c=navalLockConfig(nb);let t={yaw:0,elevation:14,power:1};const sol={yaw:Math.PI*.95,elevation:20,power:.86};
 const step=navalLockSlew(t,sol,1/60,c);assert.ok(Math.abs(step.yaw-t.yaw)*DEG<=240/60+1e-9,'capped at 240 deg/s');
 let frames=0;while(!navalLockAligned(t,sol,c)&&frames<200){t=navalLockSlew(t,sol,1/60,c);frames++;}
 assert.ok(frames<=75,`a 171 degree swing settles in ${frames} frames`);assert.ok(Math.abs(wrap(sol.yaw-t.yaw))*DEG<=.5);
 const across=navalLockSlew({yaw:Math.PI-.05,elevation:10,power:1},{yaw:-Math.PI+.05,elevation:10,power:1},1/60,c);assert.ok(across.yaw>Math.PI-.05,'turns through 180, not back across 0');
 assert.equal(navalLockAligned({yaw:0,elevation:10,power:1},{yaw:.4/DEG,elevation:10.3,power:1},c),true);assert.equal(navalLockAligned({yaw:0,elevation:10,power:1},{yaw:.7/DEG,elevation:10,power:1},c),false);
 assert.equal(navalLockAligned({yaw:0,elevation:3,power:.6},{yaw:0,elevation:0,power:.6},c,2),true,'a torpedo ignores elevation');
 assert.equal(navalLockStatus(true,{status:'ready'}),'ready');assert.equal(navalLockStatus(false,{status:'ready'}),'turning');assert.equal(navalLockStatus(true,{status:'far'}),'far');assert.equal(navalLockStatus(true,null),'turning');
});

test('model: a lock turns the turret by itself onto a moving hull, a tap fires once with the solution and hits; aim input is ignored while locked',()=>{
 for(const [stage,seed] of [[3,1],[10,2],[20,3]]){
  const m=make(stage,seed);run(m,60);const e=m.enemies.find(e=>e.active&&e.hp>0&&!e.structure&&navalTargetable(e,0,nb));
  m.update(1/60,{lockTarget:e.index});assert.equal(m.homing.index,e.index);assert.equal(m.selectedTargetIndex,e.index);assert.equal(m.locksMade,1);
  let frames=0;while(m.homing.status==='turning'&&frames<120){m.update(1/60,{aimYaw:m.turret.yaw+1,aimElevation:30,aimPower:.4});frames++;}
  assert.equal(m.homing.status,'ready',`stage ${stage}: on target after ${frames} frames`);assert.ok(Math.abs(wrap(m.homing.solution.yaw-m.turret.yaw))*DEG<=.5,'the aim input did not move the turret');
  // Follows: a second of the hull sailing on, the turret stays on the solution.
  let worst=0;for(let i=0;i<60;i++){m.update(1/60,{});worst=Math.max(worst,Math.abs(wrap(m.homing.solution.yaw-m.turret.yaw))*DEG);}assert.ok(worst<=.6,`turret error while following ${worst.toFixed(2)} deg`);
  const hp=e.hp,fired=m.fired;m.update(1/60,{quickShot:true});assert.equal(m.fired,fired+1,'one tap, one shell');assert.equal(m.homing?.queued,false);
  run(m,200,()=>({}));assert.ok(e.hp<hp,`stage ${stage}: the shell hit the locked hull`);assert.equal(m.lastShot.actual.victim,e.index);
 }
});

test('model: behind the bow, the turret swings round and the shell hits; a tap during the swing waits for the turret and then fires',()=>{
 const m=make(3,2);run(m,60);const e=m.enemies.find(e=>e.active&&e.hp>0);
 // The ship heads straight away from the hull: the target is 180 degrees off the bow.
 m.playerShip.heading=Math.atan2(m.playerShip.z-e.z,m.playerShip.x-e.x);m.update(1/60,{aimYaw:m.playerShip.heading,aimElevation:14,aimPower:1});
 const rel=()=>Math.abs(wrap(Math.atan2(e.z-m.playerShip.z,e.x-m.playerShip.x)-m.playerShip.heading))*DEG;assert.ok(rel()>170);
 m.update(1/60,{lockTarget:e.index});const fired=m.fired,hp=e.hp;m.update(1/60,{quickShot:true});assert.equal(m.fired,fired,'the tap waits while the turret swings');assert.equal(m.homing.queued,true);
 let frames=0;while(m.fired===fired&&frames<120){m.update(1/60,{});frames++;}
 assert.equal(m.fired,fired+1);assert.ok(frames<=72,`fired ${frames} frames after the tap (swing of ${rel().toFixed(0)} degrees)`);
 const turretOffBow=Math.abs(wrap(m.turret.yaw-m.playerShip.heading))*DEG;assert.ok(turretOffBow>150,`the turret points ${turretOffBow.toFixed(0)} degrees off the bow`);
 run(m,200);assert.ok(e.hp<hp,'hit behind the bow');
});

test('model: the lock ends with another long press, a clear, or the sinking; a tap during the reload is fired when the gun is ready; an empty magazine never queues',()=>{
 const m=make(1,1);run(m,30);const e=m.enemies[0];
 m.update(1/60,{lockTarget:e.index});assert.ok(m.homing);m.update(1/60,{lockTarget:e.index});assert.equal(m.homing,null,'a second long press on the same hull unlocks');assert.equal(m.unlocked.reason,'toggle');
 m.update(1/60,{lockTarget:e.index});m.update(1/60,{lockClear:true});assert.equal(m.homing,null);
 m.update(1/60,{lockTarget:e.index});run(m,40);const f0=m.fired;m.update(1/60,{quickShot:true});assert.equal(m.fired,f0+1);
 m.update(1/60,{quickShot:true});assert.equal(m.fired,f0+1,'reloading: queued');assert.equal(m.homing.queued,true);let n=0;while(m.fired===f0+1&&n<60){m.update(1/60,{});n++;}assert.equal(m.fired,f0+2);assert.ok(n<=24,`fired as soon as the gun reloaded (${n} frames)`);
 run(m,400);assert.ok(e.hp<=0,'the hull sank');assert.equal(m.homing,null,'and the lock ended');assert.equal(m.unlocked.reason,'sunk');
 // An empty magazine (the hull is kept afloat here so the stage does not end): the tap does not fire and nothing waits to fire later.
 const empty=make(1,2);run(empty,30);empty.update(1/60,{lockTarget:0});run(empty,30);const hull=empty.enemies[0];for(let i=0;i<40&&empty.loaded>0;i++){hull.hp=hull.maxHp;empty.update(1/60,{quickShot:true});run(empty,24);}
 assert.equal(empty.loaded,0);const f1=empty.fired;empty.update(1/60,{quickShot:true});assert.equal(empty.fired,f1);assert.equal(empty.homing?.queued??false,false,'nothing loaded: no queued shot');
});

test('?navalLock=0: lock input is ignored and a scripted v22 run gives the same game as with lock-on when nobody locks',()=>{
 const off=make(3,4,'?navalLock=0');assert.equal(off.lockEnabled,false);off.update(1/60,{lockTarget:0,lockPress:{index:0,progress:.5}});assert.equal(off.homing,null);assert.equal(off.lockPress,null);assert.equal(off.locksMade,0);
 const script=(m,i)=>i===20?{aimHeld:true,aimYaw:.05,aimElevation:12,aimPower:1}:i>20&&i<60?{aimHeld:true,aimYaw:.05+(i-20)*.002,aimElevation:12+(i-20)*.05,aimPower:1}:i===60?{fireRelease:true,aimYaw:.13,aimElevation:14,aimPower:1}:i===200?{quickShot:true}:{moveX:i>100&&i<160?.6:0,moveZ:0};
 const a=make(6,5,'?navalLock=0'),b=make(6,5);run(a,420,script);run(b,420,script);
 const strip=s=>JSON.stringify({...s,homing:null,lockPress:null,locksMade:0,lockEnabled:null,unlocked:null});
 assert.equal(strip(a.snapshot()),strip(b.snapshot()),'identical game without a lock');assert.ok(a.fired>=2);
});

/** The real input layer on a fake DOM: elements with listeners, window listeners by phase. */
function fakeInput(m,search=''){
 const els=new Map(),el=name=>{const e={name,dataset:{},style:{setProperty(){},removeProperty(){}},listeners:new Map(),setAttribute(){},getAttribute:()=>null,addEventListener(t,fn){e.listeners.set(t,[...(e.listeners.get(t)||[]),fn]);},closest:s=>name==='fire'&&/button/.test(s)?e:null,getBoundingClientRect:()=>name==='fire'?{left:734,right:822,top:280,bottom:368,width:88,height:88}:{left:0,top:0,right:844,bottom:390,width:844,height:390},setPointerCapture(){}};els.set(name,e);return e;};
 const fire=el('fire'),canvas=el('canvas'),controls={addEventListener(){},style:{setProperty(){},removeProperty(){}},dataset:{},classList:{toggle(){},remove(){},add(){}},querySelector:s=>s==='#shoot'?fire:null,prepend(){},append(){}};
 const win={bubble:new Map(),capture:new Map()};globalThis.window={addEventListener(t,fn,o){const map=o?.capture?win.capture:win.bubble;map.set(t,[...(map.get(t)||[]),fn]);}};globalThis.document={addEventListener(){},createElement:undefined};globalThis.location={search};
 const input=createNavalInput({controls,canvas,balance:nb,t:k=>k},()=>m,()=>null);let ms=0;
 const fireEvent=(type,id,x,y,target)=>{const e={pointerId:id,clientX:x,clientY:y,timeStamp:ms,button:0,target,preventDefault(){}};for(const fn of win.capture.get(type)||[])fn(e);for(const fn of target?.listeners?.get(type)||[])fn(e);for(const fn of win.bubble.get(type)||[])fn(e);};
 return {input,controls,fire,canvas,win,down:(id,x,y,t)=>fireEvent('pointerdown',id,x,y,t),move:(id,x,y)=>fireEvent('pointermove',id,x,y,null),up:(id,x,y)=>fireEvent('pointerup',id,x,y,null),
  step(n=1,raw={}){const outs=[];for(let i=0;i<n;i++){ms+=1000/60;const out=input.sample(raw);outs.push(out);m.update(1/60,out);}return outs;},
  dispose(){input.dispose();delete globalThis.window;delete globalThis.document;delete globalThis.location;}};
}

test('input layer: a finger resting on a hull locks it after the hold (the ring fills on the way), a moving finger or a button never locks, a second hold unlocks',()=>{
 const m=make(3,1);run(m,30);const f=fakeInput(m);
 try{
  const e=m.enemies[0],q=m.screenPoint(e.x,e.z,1.5);
  f.down(1,q.x,q.y,f.canvas);const outs=f.step(40);const progress=outs.map(o=>o.lockPress?.progress??0);const at=outs.findIndex(o=>o.lockTarget===e.index);
  assert.ok(at>0,'lockTarget emitted');assert.ok(Math.abs((at+1)/60-NAVAL_LOCK_DEFAULTS.holdSeconds)<=3/60,`after ${(at+1)/60} s of hold`);
  assert.ok(progress.slice(0,at).some(p=>p>0)&&progress.slice(0,at).every((p,i,a)=>!i||p>=a[i-1]),'the ring fills monotonically');assert.equal(m.homing.index,e.index);assert.equal(f.controls.dataset.lock,m.homing.status);
  f.up(1,q.x,q.y);f.step(2);assert.ok(m.homing,'lifting keeps the lock');
  // A drag past the slop is steering or aiming, not a lock.
  const m2=make(3,1);run(m2,30);f.dispose();const g=fakeInput(m2),q2=m2.screenPoint(m2.enemies[0].x,m2.enemies[0].z,1.5);
  g.down(2,q2.x,q2.y,g.canvas);g.step(5);g.move(2,q2.x+NAVAL_LOCK_DEFAULTS.movePixels+3,q2.y);assert.ok(g.step(40).every(o=>o.lockTarget==null),'a moving finger never locks');assert.equal(m2.homing,null);g.up(2,q2.x,q2.y);
  // A press that starts on the Fire button is the Fire gesture, never a lock, even over a hull.
  g.down(3,q2.x,q2.y,g.fire);assert.ok(g.step(40).every(o=>o.lockTarget==null));g.up(3,q2.x,q2.y);g.step(2);
  // Lock, then hold on the same hull again: unlock.
  g.down(4,q2.x,q2.y,g.canvas);g.step(32);g.up(4,q2.x,q2.y);g.step(1);assert.ok(m2.homing);const q3=m2.screenPoint(m2.enemies[0].x,m2.enemies[0].z,1.5);g.down(5,q3.x,q3.y,g.canvas);g.step(32);g.up(5,q3.x,q3.y);g.step(1);assert.equal(m2.homing,null,'second hold unlocks');
  g.dispose();
 }finally{delete globalThis.window;delete globalThis.document;delete globalThis.location;}
});

test('input layer while locked: a tap on Fire fires the lock (no aim values sent), a drag from Fire does not move the turret, release on nothing else; flag off emits nothing',()=>{
 const m=make(3,2);run(m,30);const f=fakeInput(m);
 try{
  m.update(1/60,{lockTarget:0});f.step(40);assert.equal(m.homing.status,'ready');
  f.down(6,778,324,f.fire);let outs=f.step(3);f.move(6,778-60,324-40);outs=outs.concat(f.step(20));assert.ok(outs.every(o=>o.aimYaw===undefined&&o.aimElevation===undefined),'locked: the gesture sends no aim');
  assert.ok(Math.abs(wrap(m.homing.solution.yaw-m.turret.yaw))*DEG<=.6,'the drag did not move the turret');
  const fired=m.fired;f.up(6,778-60,324-40);f.step(3);assert.equal(m.fired,fired+1,'release fires the lock');
  f.dispose();
  const off=make(3,2,'?navalLock=0');run(off,30);const g=fakeInput(off,'?navalLock=0');const e=off.enemies[0],q=off.screenPoint(e.x,e.z,1.5);
  g.down(7,q.x,q.y,g.canvas);const o2=g.step(40);assert.ok(o2.every(o=>!('lockTarget' in o)&&!('lockPress' in o)),'no lock fields with ?navalLock=0');assert.equal(g.controls.dataset.lock,undefined);assert.equal(off.homing,null);assert.ok(!g.win.capture.has('pointerdown')&&!g.win.capture.has('pointermove'),'no long-press listeners with ?navalLock=0');
  g.dispose();
 }finally{delete globalThis.window;delete globalThis.document;delete globalThis.location;}
});

test('HUD: the filling ring, the brackets and padlock in the status colour, the reason word, the off-screen arrow and the first-lock hint; nothing when lock-on is off',()=>{
 const calls=[];const p=new Proxy({},{get:(t,k)=>k in t?t[k]:typeof k==='string'&&/^(save|restore|beginPath|moveTo|lineTo|arc|stroke|fill|translate|rotate|scale|closePath|roundRect|fillText|setLineDash|ellipse)$/.test(k)?(...a)=>calls.push([k,...a]):k==='measureText'?(s)=>({width:String(s).length*6}):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 const enemy={index:2,active:true,hp:1,x:300,z:0,heading:Math.PI/2,hullScale:1},project=(x,z,y=0)=>({x:420+(z-0)*.8,y:180-(x-300)*.05-y*2,depth:5});
 const base={lockEnabled:true,enemies:[enemy],time:2,locksMade:1,aiming:false,selectedTargetIndex:2};
 assert.equal(drawNavalLockHud(p,{...base,lockEnabled:false,homing:{index:2,status:'ready',at:0}},nb,project,844,390),null,'off: nothing');
 const box=navalLockBox(enemy,project,nb);assert.ok(box.w>=64&&box.h>=38);
 const press=drawNavalLockHud(p,{...base,lockPress:{index:2,progress:.5}},nb,project,844,390);assert.equal(press.press.index,2);assert.equal(press.press.progress,.5);
 const ready=drawNavalLockHud(p,{...base,homing:{index:2,status:'ready',at:1}},nb,project,844,390);assert.equal(ready.lock.status,'ready');assert.equal(ready.lock.offscreen,false);assert.equal(ready.word,undefined,'ready needs no word');
 const far=drawNavalLockHud(p,{...base,homing:{index:2,status:'far',at:1}},nb,project,844,390);assert.equal(far.word.text,NAVAL_LOCK_WORDS.far);
 const away=drawNavalLockHud(p,{...base,homing:{index:2,status:'turning',at:1}},nb,(x,z,y=0)=>({x:1400,y:180,depth:5}),844,390);assert.equal(away.lock.offscreen,true);assert.ok(away.lock.arrow&&away.lock.arrow.x>780,'an arrow on the right edge');
 const hint=drawNavalLockHud(p,{...base,locksMade:0,time:1},nb,project,844,390);assert.ok(hint.hint,'first-lock hint');assert.equal(drawNavalLockHud(p,{...base,locksMade:0,time:12},nb,project,844,390),null,'the hint goes after the first seconds');
 assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===NAVAL_LOCK_WORDS.hint));
});

test('wiring: the arc, the marks and the landing arrow show while locked; the Fire button styles; the offline shell lists the new modules',async()=>{
 const read=f=>readFile(new URL(`../workout/island/${f}`,import.meta.url),'utf8');
 assert.match(await read('minigames/naval-aim-view.mjs'),/active=\(model\.aiming\|\|model\.homing\)&&p&&!model\.result/);
 assert.match(await read('minigames/naval-marks.mjs'),/if\(!\(m\.aiming\|\|m\.homing\)\|\|!pr\|\|pr\.guided\)return null;/);
 const hud=await read('minigames/naval-hud.mjs');assert.match(hud,/const lock=drawNavalLockHud\(p,m,balance,project,width,height\);if\(lock\)shown\.lock=lock;/);assert.match(hud,/if\(chosen&&!m\.homing\)/);
 const css=await read('minigames/naval-aim.css');for(const s of ['ready','turning'])assert.ok(css.includes(`[data-lock=${s}] #shoot`),s);assert.ok(css.includes('[data-lock=dive]'));
 const shell=JSON.parse(await read('offline-manifest.json')).shell;for(const f of ['minigames/naval-lockon.mjs','minigames/naval-lockon-hud.mjs'])assert.ok(shell.includes(f),f);
 const tag=JSON.parse(await read('release.json')).version;for(const f of ['minigames/naval-lockon.mjs','minigames/naval-lockon-hud.mjs']){const text=await read(f);for(const m of text.matchAll(/from '([^']+)'/g))assert.ok(m[1].endsWith(`?v=${tag}`),`${f}: ${m[1]} carries the release tag`);}
});
