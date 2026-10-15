import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,CURRENT_VERSION,STORAGE_KEY} from '../workout/island/engine/persistence.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {equipmentOffer,equipmentValues} from '../workout/island/activity/equipment.mjs';
import {recordStageWin} from '../workout/island/activity/progress.mjs';
import {seededRandom,gameContext} from '../workout/island/minigames/context.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {drawHealthBar} from '../workout/island/minigames/art.mjs';
import {pilotInput} from './helpers/island-pilot.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames,models={alienDefense:createAlienModel,fireRescue:createFireModel,navalDuel:createNavalModel};
function fixture(){const values=new Map([['other-app','keep']]);const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};const engine=createEngine(data,{storage,now:()=>1000000});return {engine,storage,values,activity:createActivity(engine,{now:()=>1000000})};}
const make=(id,level=1,extra={})=>models[id]({config,balance:config[id],level,random:seededRandom(12),...extra});
function advance(m,seconds,input={}){for(let i=0;i<Math.ceil(seconds/.02)&&!m.result;i++)m.update(.02,input);}
function shotAt(m,a,damage=99,kind=0){m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:kind===1?4:1,lastHit:-1,kind});a.hp=damage;}
function navalHit(m,b,ammo=0){m.ball.x=m.enemyX;m.ball.y=b.shipY;m.ball.vx=0;m.ball.vy=1;m.ball.owner='player';m.ball.ammo=ammo;m.update(.02,{});}

test('G2c v4 → v5 adds only equipment and leaves input, city, stars, event and money untouched',()=>{
  const f=fixture(),old=JSON.parse(f.engine.exportJSON());old.version=4;delete old.minigameEquipment;
  old.money=321;old.minigameLevels.alienDefense=3;recordStageWin(old,data,'alienDefense',1,3);
  old.events.active={id:'event-1',typeId:'aliens',targetId:null,seed:42,phase:'playing',warningUntil:0,deferred:false};old.events.sequence=1;
  const before=structuredClone(old),r=migrateSave(old,data,f.engine.registry);assert.equal(r.ok,true);assert.equal(CURRENT_VERSION,6);assert.equal(r.state.version,6);assert.equal(STORAGE_KEY,'island.v1');
  for(const key of Object.keys(old).filter(k=>k!=='version'))assert.deepEqual(r.state[key],old[key],key);
  assert.deepEqual(old,before);for(const tracks of Object.values(r.state.minigameEquipment))assert.ok(Object.values(tracks).every(n=>n===0));
  f.storage.setItem(STORAGE_KEY,JSON.stringify(old));const loaded=createEngine(data,{storage:f.storage});assert.equal(loaded.state.money,321);assert.equal(loaded.state.minigameProgress.alienDefense.stars[0],3);assert.equal(f.values.get('other-app'),'keep');
});
for(const bad of [-1,1.5,999,'1',null])test(`G2c invalid equipment rank ${JSON.stringify(bad)} is rejected without altering the live state`,()=>{
  const f=fixture(),old=f.engine.exportJSON(),save=JSON.parse(old);save.minigameEquipment.alienDefense.damage=bad;
  assert.equal(f.engine.importJSON(save).ok,false);assert.equal(f.engine.exportJSON(),old);
});
test('G2c missing/unknown equipment and future versions cannot silently reset upgrades',()=>{
  const f=fixture();for(const mutate of [s=>delete s.minigameEquipment,s=>s.minigameEquipment.bad={},s=>s.minigameEquipment.navalDuel.bad=1,s=>s.version=7]){
    const save=JSON.parse(f.engine.exportJSON());mutate(save);assert.equal(migrateSave(save,data,f.engine.registry).ok,false);
  }
});
for(const [id,b]of Object.entries(config).filter(([,b])=>b.equipment))test(`G2c ${id} purchases use coins and stars, merge monotonically and reach the actual model`,()=>{
  const f=fixture();f.engine.state.money=5000;
  for(const [key,track]of Object.entries(b.equipment)){
    let money=f.engine.state.money;
    assert.equal(f.activity.upgrade(id,key).ok,true);assert.equal(f.engine.state.money,money-track.levels[0].cost);
    assert.equal(gameContext(f.engine,config,12,id).equipment[key],track.levels[0].value);
    assert.equal(f.activity.upgrade(id,key).reason,'equipment.starsReason');
  }
  for(let stage=1;stage<=4;stage++)recordStageWin(f.engine.state,data,id,stage,3);
  for(const [key,track]of Object.entries(b.equipment))for(let rank=1;rank<track.levels.length;rank++)assert.equal(f.activity.upgrade(id,key).ok,true);
  const raw=f.engine.exportJSON(),poor=fixture();assert.equal(poor.engine.importJSON(raw).ok,true);assert.equal(poor.engine.importJSON(raw).ok,true);assert.deepEqual(poor.engine.state.minigameEquipment,f.engine.state.minigameEquipment);
  assert.equal(f.engine.importJSON(fixture().engine.exportJSON()).ok,true);assert.deepEqual(f.engine.state.minigameEquipment,poor.engine.state.minigameEquipment);
  const reloaded=createEngine(data,{storage:f.storage});assert.deepEqual(reloaded.state.minigameEquipment,f.engine.state.minigameEquipment);assert.equal(validateSave(reloaded.state,data,reloaded.registry).ok,true);
  const upgraded=make(id,1,{equipment:equipmentValues(f.engine.state,data,id)}),base=make(id);
  if(id==='alienDefense')assert.ok(upgraded.maxLives>base.maxLives);else if(id==='fireRescue'){assert.ok(upgraded.maxWater>base.maxWater);assert.ok(upgraded.maxPressure>base.maxPressure);assert.ok(upgraded.range>base.range);}else{assert.ok(upgraded.maxLives>base.maxLives);assert.ok(upgraded.playerShip.shield>0);assert.ok(upgraded.ammo[3]>0);}
});
test('G2c purchases cannot charge for locked/maxed/unknown equipment, insufficient money or mid-round',()=>{
  const f=fixture();f.engine.state.money=0;assert.equal(f.activity.upgrade('alienDefense','damage').reason,'reason.money');assert.equal(f.activity.upgrade('unknown','damage').ok,false);assert.equal(f.activity.upgrade('alienDefense','constructor').ok,false);
  f.engine.state.money=500;f.engine.registry.minigames.set('alienDefense',{...f.engine.registry.minigames.get('alienDefense'),start:()=>({dispose(){}})});
  const session=f.engine.startMinigame('alienDefense'),before=f.engine.state.money;assert.equal(f.activity.upgrade('alienDefense','shield').reason,'reason.gameBusy');assert.equal(f.engine.state.money,before);session.cancel();
});
test('G2c five aliens have distinct speed/health and real zigzag, circle and dive trajectories',()=>{
  const m=make('alienDefense',10),before=m.aliens.map(a=>({x:a.x,y:a.y}));assert.equal(new Set(m.aliens.map(a=>a.kind)).size,5);
  advance(m,.5);assert.ok(m.aliens.some((a,i)=>Math.abs(a.y-before[i].y)>1));assert.ok(m.aliens.some(a=>a.x!==a.baseX));
  assert.ok(config.alienDefense.enemyTypes[1].hp>config.alienDefense.enemyTypes[0].hp);assert.ok(config.alienDefense.enemyTypes[1].speed<config.alienDefense.enemyTypes[0].speed);
});
test('G2c splitter children are bounded, weaker, and do not inflate island rewards',()=>{
  const m=make('alienDefense',8),splitter=m.aliens.find(a=>a.kind===3),before=m.aliens.length,maxHp=splitter.maxHp;
  shotAt(m,splitter,1);m.update(.001,{});assert.equal(m.aliens.length,before+1);const children=m.aliens.filter(a=>a.child);assert.equal(children.length,2);assert.ok(children.every(a=>a.reward===0&&a.maxHp<maxHp));assert.equal(m.score,m.settings.points);
});
test('G2c carriers launch a finite budget of mini-ships, and bosses arrive at the final wave',()=>{
  const m=make('alienDefense',10),carrier=m.aliens.find(a=>a.kind===4);carrier.launchTime=.01;m.update(.02,{});assert.ok(m.aliens.some(a=>a.child));
  const born=m.aliens.filter(a=>a.child).length;for(const a of m.aliens)if(a.kind===4)a.launchTime=0;m.update(.02,{});assert.ok(m.aliens.filter(a=>a.child).length<=m.settings.spawnBudget);assert.ok(born>0);
  const boss=make('alienDefense',5),memory={};for(let i=0;i<20000&&boss.wave<boss.settings.waves&&!boss.result;i++)boss.update(.04,pilotInput('alienDefense',boss,config.alienDefense,memory));assert.equal(boss.wave,boss.settings.waves);assert.equal(boss.aliens.filter(a=>a.boss).length,1);
});
test('G2c kills drop collectible capsules with a repeatable four-upgrade cycle',()=>{
  const m=make('alienDefense',10),b=config.alienDefense;
  for(let i=0;i<8;i++){const a=m.aliens.find(a=>!a.child&&a.kind!==3);shotAt(m,a,1);m.update(.001,{});}
  assert.equal(m.pickups.length,4);assert.deepEqual(m.pickups.map(d=>b.pickups.kinds[d.kind]),b.pickups.kinds);
});
for(let kind=0;kind<4;kind++)test(`G2c temporary ${config.alienDefense.pickups.kinds[kind]} collects, changes play and expires`,()=>{
  const m=make('alienDefense',1);m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind});m.update(.001,{});assert.equal(m.powerup,kind);assert.equal(m.powerTime,config.alienDefense.pickups.seconds);
  m.update(.02,{firing:true});assert.equal(m.shots.length,kind===0?3:1);if(kind===1)assert.equal(m.shots[0].hp,config.alienDefense.pickups.laserPierce);
  if(kind===2){advance(m,.5,{firing:true});assert.ok(m.shots.length>2);}
  if(kind===3){const lives=m.lives;m.bolts.push({x:m.player.x,y:m.player.y,kind:0});m.update(.001,{});assert.equal(m.lives,lives);}
  m.shots.length=0;m.pickups.length=0;advance(m,config.alienDefense.pickups.seconds+.1);assert.equal(m.powerup,-1);
});
test('G2c nova flies to a chosen area, preserves distant enemies, shows a light wave and has finite charges',()=>{
  const m=make('alienDefense',10),a=m.aliens[0],far=m.aliens.at(-1);a.hp=1;const farHp=far.hp;
  m.update(.001,{nova:true,x:a.x,y:a.y});assert.equal(m.novaCharges,config.alienDefense.nova.charges-1);assert.ok(m.nova.flight>0);assert.equal(m.score,0);
  advance(m,config.alienDefense.nova.throwSeconds+.02,{nova:true});assert.ok(m.nova.life>0);assert.ok(m.score>0);assert.equal(far.hp,farHp);assert.equal(m.novaCharges,1);
  m.update(.001,{});m.update(.001,{nova:true});assert.equal(m.novaCharges,1,'no lost charge during the light wave');
  advance(m,config.alienDefense.nova.seconds+.02);m.update(.001,{nova:true});assert.equal(m.novaCharges,0);advance(m,2);assert.equal(m.nova.life,0);m.update(.001,{nova:true});assert.equal(m.novaCharges,0);
});
test('G2c permanent weapon, damage and rate affect actual projectiles rather than just labels',()=>{
  const base=make('alienDefense'),strong=make('alienDefense',1,{equipment:{weapon:2,damage:1.8,rate:1.5}});
  base.update(.02,{firing:true});strong.update(.02,{firing:true});assert.equal(strong.shots.length,5);assert.equal(strong.shots[0].kind,1);
  const a=strong.aliens[0];a.hp=2;shotAt(strong,a,2);strong.update(.001,{});assert.ok(a.hp<1);
  advance(base,.4,{firing:true});advance(strong,.4,{firing:true});assert.ok(strong.shots.length>base.shots.length);
});
test('G2c fires occupy homes, roof, tree, car and warehouse; high stages add resistant and spreading fire',()=>{
  const m=make('fireRescue',10);assert.equal(new Set(m.flames.map(f=>f.kind)).size,5);assert.equal(new Set(m.flames.map(f=>f.type)).size,3);assert.equal(make('fireRescue').settings.fireKinds,1);
  const f=m.flames[0],heat=f.heat;advance(m,.2,{});assert.ok(f.heat>heat);advance(m,11,{});assert.equal(m.flames.filter(f=>f.active).length,9);
});
test('G2c aiming misses, visible water uses the same clamped impact, and refill is finite',()=>{
  const m=make('fireRescue'),f=m.flames[0],before=m.water;advance(m,.3,{firing:true,x:350,y:0});assert.ok(m.water<before);assert.ok(f.heat>0);
  assert.ok(Math.hypot(m.impact.x-config.fireRescue.nozzleX,m.impact.y-config.fireRescue.nozzleY)<=m.range+.001);
  const water=m.water,reserve=m.reserve;advance(m,.4,{refill:true,firing:true});assert.equal(m.spraying,false);assert.ok(m.water>water);assert.ok(m.reserve<reserve);
  const heat=f.heat;advance(m,.2,{x:f.x,y:f.y,firing:true});assert.ok(f.heat<heat);
});
test('G2c charged water and pressure equipment extinguish faster; charging does not secretly spray',()=>{
  const a=make('fireRescue'),b=make('fireRescue',1,{equipment:{pressure:1.3}}),f=a.flames[0],g=b.flames[0];advance(b,config.fireRescue.chargeSeconds,{charge:true,firing:true});assert.equal(b.spraying,false);assert.equal(b.charge,1);
  advance(a,.2,{x:f.x,y:f.y,firing:true});advance(b,.2,{x:g.x,y:g.y,firing:true});assert.ok(g.heat<f.heat);
});
test('G2c a rescued friend awards water and score once, is optional, and resets each round',()=>{
  const m=make('fireRescue'),r=m.rescue,reserve=m.reserve;advance(m,r.seconds+.1,{firing:true,x:r.x,y:r.y});assert.equal(r.rescued,true);assert.equal(m.score,r.points);assert.ok(m.reserve>=reserve);const score=m.score;advance(m,1,{firing:true,x:r.x,y:r.y});assert.equal(m.score,score);assert.equal(make('fireRescue').rescue.rescued,false);
});
test('G2c naval HP tracks each ship and the entire remaining fleet; bars clamp at zero/full',()=>{
  const m=make('navalDuel',10);assert.ok(m.maxEnemyFleet>m.enemyLives);const total=m.enemyFleetHp; m.update(.02,{firing:true});navalHit(m,config.navalDuel);assert.ok(m.enemyLives<m.enemyShip.maxHp);assert.ok(m.enemyFleetHp<total);
  const widths=[],p={fillRect:(x,y,w)=>widths.push(w)};drawHealthBar(p,0,0,100,6,-2,10,config);assert.equal(widths[1],0);drawHealthBar(p,0,0,100,6,20,10,config);assert.equal(widths[3],100);
});
for(const index of [1,2,3])test(`G2c special naval ${config.navalDuel.ammo[index].id} has a gameplay effect and finite per-round ammunition`,()=>{
  const m=make('navalDuel',10,{equipment:{ammo:3}}),b=config.navalDuel;
  for(let i=0;i<index;i++){m.update(.001,{ammo:true});m.update(.001,{});}assert.equal(m.ammoIndex,index);
  const supply=m.ammo[index];m.update(.001,{firing:true});assert.equal(m.ammo[index],supply-1);assert.equal(m.ball.ammo,index);
  const hp=m.enemyLives;m.playerShip.hp-=3;const lives=m.lives;navalHit(m,b,index);assert.ok(m.enemyLives<hp);if(index===3)assert.ok(m.lives>lives);if(index===2)assert.equal(m.ball.vy,1);
});
test('G2c shields absorb real hits, upgraded hull survives longer, and bosses have more HP',()=>{
  const m=make('navalDuel',1,{equipment:{shield:2,hull:1.3}}),b=config.navalDuel;m.update(.01,{firing:true});m.ball.owner='enemy';m.ball.x=b.shipX;m.ball.y=b.shipY;m.ball.vy=1;m.ball.vx=0;const hp=m.lives;m.update(.01,{});assert.equal(m.lives,hp);assert.ok(m.playerShip.shield<2);assert.ok(m.maxLives>make('navalDuel').maxLives);
  const boss=make('navalDuel',10);while(boss.wave<boss.settings.waves){boss.enemyShip.hp=0;boss.update(.01,{firing:true});navalHit(boss,b);advance(boss,b.sinkSeconds+.1);}assert.equal(boss.boss,true);assert.ok(boss.enemyShip.maxHp>b.levels[9].enemyLives*b.shipTypes[2].hp);
});
for(const id of Object.keys(models))for(const level of [1,10])test(`G2c ${id} stage ${level} remains winnable, repeatable, and settles fair bounded rewards`,()=>{
  const run=()=>{const m=make(id,level,{power:level===1?1:1.45}),memory={};for(let i=0;i<40000&&!m.result;i++)m.update(.04,pilotInput(id,m,config[id],memory));return m;};
  const m=run();assert.equal(m.result?.outcome,'win');assert.deepEqual(m.snapshot(),run().snapshot());const f=fixture(),r=f.engine.registry.minigames.get(id).onResult(m.result,{engine:f.engine,level,config});assert.ok(r);assert.ok(r.money>=config[id].levels[level-1].winMoney);assert.ok(r.stars>=1&&r.stars<=3);
});

test('G2c a piercing beam hits separate enemies once each, even when they overlap',()=>{
  const m=make('alienDefense',10),a=m.aliens[0],b=m.aliens[1];a.baseX=b.baseX=150;a.baseY=b.baseY=100;a.phase=b.phase=0;a.hp=b.hp=10;for(const other of m.aliens)if(other!==a&&other!==b)other.baseY=250;
  m.shots.push({x:150,y:100,vx:0,vy:0,kind:1,hp:4,hitLo:0,hitHi:0});
  advance(m,.06,{});assert.equal(a.hp,9);assert.equal(b.hp,9);assert.equal(m.shots[0].hp,2);
});
test('G2c nova light stays at the detonation point while the next aim moves',()=>{
  const m=make('alienDefense');m.update(.01,{nova:true,x:10,y:10});m.update(.01,{x:330,y:180});assert.deepEqual([m.nova.x,m.nova.y],[10,10]);assert.deepEqual([m.novaAim.x,m.novaAim.y],[330,180]);
});
test('G2c stubborn fire resists water and spreading fire grows faster at equal starting heat',()=>{
  const b=config.fireRescue,a=make('fireRescue',10),c=make('fireRescue',10),d=make('fireRescue',10);for(const m of [a,c,d]){m.flames[0].heat=.5;m.flames[0].type=0;}
  c.flames[0].type=1;d.flames[0].type=2;
  advance(a,.1,{firing:true,x:a.flames[0].x,y:a.flames[0].y});advance(c,.1,{firing:true,x:c.flames[0].x,y:c.flames[0].y});assert.ok(a.flames[0].heat<c.flames[0].heat);
  a.flames[0].heat=.5;advance(a,.1);advance(d,.1);assert.ok(d.flames[0].heat>a.flames[0].heat);assert.ok(b.fireTypes[2].growth>1);
});
test('G2c depleted special ammunition falls back without going negative, and rate reduces the actual turn wait',()=>{
  const b=config.navalDuel,m=make('navalDuel',10,{equipment:{ammo:1}});m.update(.001,{ammo:true});m.ammo[1]=0;m.update(.001,{firing:true});assert.equal(m.phase,'shot');assert.equal(m.ball.ammo,0);assert.equal(m.ammo[1],0);
  const normal=make('navalDuel',10),fast=make('navalDuel',10,{equipment:{rate:1.6}});
  for(const ship of [normal,fast]){ship.update(.01,{firing:true});navalHit(ship,b);}
  advance(fast,b.turnPauseSeconds/1.6+.02);advance(normal,b.turnPauseSeconds/1.6+.02);assert.equal(fast.phase,'shot');assert.equal(normal.phase,'enemy');
});
for(const id of Object.keys(models))test(`G2c ${id} stage-10 threat and rewards exceed stage 1 with identical equipment`,()=>{
  const low=make(id,1),high=make(id,10);assert.ok(high.settings.winMoney>low.settings.winMoney);assert.ok(high.settings.winParts>low.settings.winParts);
  if(id==='alienDefense'){assert.ok(high.aliens.reduce((s,a)=>s+a.hp,0)>low.aliens.reduce((s,a)=>s+a.hp,0));assert.ok(high.settings.boltSpeed>low.settings.boltSpeed);assert.ok(high.settings.waves>low.settings.waves);}
  else if(id==='fireRescue'){assert.ok(high.flames.filter(f=>f.active).length>low.flames.filter(f=>f.active).length);assert.ok(high.remaining>low.remaining);assert.ok(high.water+high.reserve<low.water+low.reserve);assert.ok(high.settings.growthPerSecond>low.settings.growthPerSecond);}
  else{assert.ok(high.maxEnemyFleet>low.maxEnemyFleet);assert.ok(high.settings.enemyAimError<low.settings.enemyAimError);assert.ok(high.settings.drift>low.settings.drift);}
});
