import {pilotInput} from '../workout/island/tests/pilot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,createInitialState} from '../workout/island/engine/persistence.mjs';
import {seededRandom,gameContext} from '../workout/island/minigames/context.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';

export const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
export function fixture() {
  const values=new Map();let time=1000000;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const engine=createEngine(data,{storage,now:()=>time});
  return {engine,storage,advance:ms=>time+=ms,now:()=>time};
}
test('seeded generator repeats including seed zero, and stages are independent of city expansion',()=>{
  assert.deepEqual(Array.from({length:20},seededRandom(0)),Array.from({length:20},seededRandom(0)));
  const {engine}=fixture();
  for(let stage=0;stage<3;stage++){engine.state.world.stage=stage;assert.equal(gameContext(engine,data.config.minigames,17,'alienDefense').level,1);}
});
test('minigame hooks deny start, settle only once and charge actual minutes on completion or exit',()=>{
  const f=fixture(),{engine}=f;let ctx,starts=0,disposed=0;const charged=[];
  engine.registerMinigame({id:'contractGame',start:c=>{ctx=c;starts++;return {dispose:()=>disposed++};},onResult:r=>r});
  engine.canPlay=()=>false;assert.equal(engine.startMinigame('contractGame').reason,'reason.playTime');assert.equal(starts,0);
  engine.canPlay=()=>true;engine.spendPlayTime=m=>charged.push(m);
  const before=engine.state.money;
  const first=engine.startMinigame('contractGame');assert.equal(first.ok,true);
  assert.equal(engine.startMinigame('contractGame').reason,'reason.gameBusy');
  assert.equal(ctx.finish({outcome:'win',score:NaN,money:50}).ok,false);
  f.advance(90000);assert.equal(ctx.finish({outcome:'win',score:10,money:7}).ok,true);
  assert.equal(ctx.finish({outcome:'win',score:10,money:7}).ok,false);
  assert.equal(engine.state.money,before+7);assert.deepEqual(charged,[1.5]);assert.equal(disposed,1);
  const second=engine.startMinigame('contractGame');f.advance(30000);second.cancel();second.cancel();
  assert.equal(engine.state.money,before+7);assert.deepEqual(charged,[1.5,.5]);assert.equal(disposed,2);
});
test('version two migrates activity defaults without losing money, buildings, character or progress',()=>{
  const {engine}=fixture(),old=createInitialState(data,17);old.version=2;
  for(const key of ['minigameLevels','highScores','minigameWins','instructionsSeen','events'])delete old[key];
  old.money=900;old.avatar.created=true;const snapshot=structuredClone(old);
  const result=migrateSave(old,data,engine.registry);assert.equal(result.ok,true);assert.equal(result.state.version,11);
  for(const key of Object.keys(snapshot).filter(k=>k!=='version'))assert.deepEqual(result.state[key],snapshot[key]);
  assert.deepEqual(result.state.minigameLevels,{alienDefense:1,fireRescue:1,navalDuel:1,soccer:1,tennis:1});assert.equal(result.state.events.active,null);
});
test('activity export/import merges levels and records monotonically and rejects malformed game state',()=>{
  const {engine}=fixture();engine.state.highScores.alienDefense=70;engine.state.minigameLevels.alienDefense=2;
  const old=JSON.parse(engine.exportJSON());old.highScores.alienDefense=30;old.minigameLevels.alienDefense=1;
  assert.equal(engine.importJSON(JSON.stringify(old)).ok,true);assert.equal(engine.state.highScores.alienDefense,70);assert.equal(engine.state.minigameLevels.alienDefense,2);
  old.minigameLevels.alienDefense=99;assert.equal(engine.importJSON(JSON.stringify(old)).ok,false);
  old.minigameLevels.alienDefense=1;old.events.repairs['unknown-building']=100;assert.equal(engine.importJSON(JSON.stringify(old)).ok,false);
});
test('alien waves are playable to victory with real firing, repeat by seed and also allow a loss without world damage',()=>{
  function run(play) {
    const f=fixture(),before=f.engine.exportJSON();
    const model=createAlienModel({...gameContext(f.engine,data.config.minigames,12,'alienDefense',play?1:7),config:data.config.minigames,balance:data.config.minigames.alienDefense});
    const memory={};for(let i=0;i<20000&&!model.result;i++)model.update(.04,play?pilotInput('alienDefense',model,data.config.minigames.alienDefense,memory):{});
    assert.equal(f.engine.exportJSON(),before,'a game model cannot mutate the island');
    assert.ok(model.result);return model.snapshot();
  }
  assert.equal(run(true).result.outcome,'win');assert.deepEqual(run(true),run(true));assert.equal(run(false).result.outcome,'lose');
});

test('fire hose aims at cartoon flames, refills water and pressure, and repeats by seed',()=>{
  const make=()=>createFireModel({config:data.config.minigames,balance:data.config.minigames.fireRescue,level:1,random:seededRandom(42)});
  const a=make(),b=make();assert.deepEqual(a.snapshot(),b.snapshot());
  for(const model of [a,b]){const memory={};for(let i=0;i<3000&&!model.result;i++)model.update(.04,pilotInput('fireRescue',model,data.config.minigames.fireRescue,memory));}
  assert.equal(a.result.outcome,'win');assert.deepEqual(a.snapshot(),b.snapshot());
  const dry=make();for(let i=0;i<100;i++)dry.update(.04,{firing:true,x:0,y:0});const water=dry.water,pressure=dry.pressure;
  for(let i=0;i<100;i++)dry.update(.04,{refill:true,charge:true});assert.equal(dry.water,water);assert.ok(dry.pressure>pressure);
  for(let i=0;i<2000&&!dry.result;i++)dry.update(.04,{});assert.equal(dry.result.outcome,'lose');
});
test('naval duel uses a sea target and alternating turns, is winnable and deterministic with a seed',()=>{
  function play(){
    const balance=data.config.minigames.navalDuel,model=createNavalModel({config:data.config.minigames,balance,level:1,random:seededRandom(5)});
    const memory={},phases=new Set();
    for(let i=0;i<10000&&!model.result;i++){phases.add(model.phase);model.update(.04,pilotInput('navalDuel',model,balance,memory));}
    assert.ok(phases.has('enemy'));assert.equal(model.result.outcome,'win');return model.snapshot();
  }assert.deepEqual(play(),play());
});
function eventCity(f){f.engine.state.buildings.push({id:'test-airbase',typeId:'airbase',x:16,z:0,level:1});f.engine.state.world={stage:1,size:20};f.engine.state.buildings.push({id:'test-harbor',typeId:'harbor',x:0,z:6,level:1});}
function playable(f){eventCity(f);f.engine.setAvatar({created:true});f.engine.skipTutorial();return createActivity(f.engine,{now:f.now,random:seededRandom(9)});}
test('each seeded event warns before starting, respects its cooldown, defers once and cannot stack',()=>{
  for(const type of ['fire','aliens','ship']){
    const f=fixture();f.engine.place('house',4,5);const activity=playable(f);
    const first=activity.prepare(type);assert.equal(first.ok,true);assert.equal(first.event.phase,'warning');
    assert.equal(activity.prepare('ship').ok,false);assert.equal(activity.choose('play').ok,false);assert.equal(activity.choose('auto').ok,false);
    const prepared=structuredClone(first.event);const second=fixture();second.engine.place('house',4,5);const again=playable(second);assert.deepEqual(again.prepare(type).event,prepared);
    assert.equal(activity.choose('defer').ok,true);assert.equal(activity.choose('defer').ok,false);
    f.advance(data.config.events.warningMs);activity.tick();assert.equal(f.engine.state.events.active.phase,'warning');
    f.advance(data.config.events.deferMs);activity.tick();assert.equal(f.engine.state.events.active.phase,'ready');
    assert.equal(activity.choose('auto').ok,true);assert.equal(f.engine.state.events.active,null);assert.equal(activity.prepare(type).ok,false);
  }
});
test('events pause for tutorial and avatar dialogs and restore a saved game as a retry',()=>{
  const f=fixture();eventCity(f);let blocked=false;const activity=createActivity(f.engine,{now:f.now,random:seededRandom(3),blocked:()=>blocked});
  f.advance(data.config.events.initialDelayMs);activity.tick();assert.equal(f.engine.state.events.active,null);
  f.engine.skipTutorial();f.engine.setAvatar({created:true});blocked=true;activity.tick();assert.equal(f.engine.state.events.active,null);
  blocked=false;assert.equal(activity.prepare('ship').ok,true);f.advance(data.config.events.warningMs);blocked=true;activity.tick();assert.equal(f.engine.state.events.active.phase,'warning');
  blocked=false;activity.tick();activity.choose('play');assert.equal(f.engine.state.events.active.phase,'playing');
  const loaded=createEngine(data,{storage:f.storage,now:f.now});createActivity(loaded,{now:f.now});assert.equal(loaded.state.events.active.phase,'ready');
});
test('fire loss only pauses a building income; it repairs automatically or for the configured small fee',()=>{
  const f=fixture();const placed=f.engine.place('house',4,5);f.engine.place('fireStation',7,5);const activity=playable(f);
  const beforeBuildings=structuredClone(f.engine.state.buildings),money=f.engine.state.money;
  activity.prepare('fire');const event=f.engine.state.events.active;
  const bonuses=activity.bonuses();assert.equal(bonuses.fireWater,data.config.events.fireWaterBonus);assert.equal(bonuses.fireTime,data.config.events.fireTimeBonus);
  f.advance(data.config.events.warningMs);activity.tick();activity.choose('play');activity.resolve(event.id,{outcome:'lose'});
  assert.deepEqual(f.engine.state.buildings,beforeBuildings);assert.equal(f.engine.state.money,money);assert.equal(f.engine.state.events.active.phase,'ready');
  const before=f.engine.incomePerMinute();assert.ok(f.engine.state.events.repairs[placed.id]);
  f.advance(data.config.events.repairMs);activity.tick();assert.equal(f.engine.state.events.repairs[placed.id],undefined);assert.ok(f.engine.incomePerMinute()>before);
  activity.choose('play');activity.resolve(event.id,{outcome:'lose'});assert.equal(activity.repair(placed.id).ok,true);assert.equal(f.engine.state.money,money-data.config.events.repairCost);
  assert.deepEqual(f.engine.state.buildings,beforeBuildings);
});
test('new registered income, purchased upgrades, high scores and occasional parts persist through additive import',()=>{
  const f=fixture(),activity=playable(f);f.engine.place('house',4,5);f.engine.place('fireStation',7,5);f.engine.place('park',10,5);
  const sources=f.engine.income().sources;assert.ok(sources.some(s=>s.id==='island-tourism'&&s.amount>0));assert.ok(sources.some(s=>s.id==='island-security'&&s.amount>0));
  const money=f.engine.state.money;assert.equal(activity.upgrade('alienDefense').ok,true);assert.equal(f.engine.state.money,money-data.config.minigameLevels.alienDefense[1].cost);
  // Use the registered result contract while replacing only its canvas adapter.
  const record=f.engine.registry.minigames.get('alienDefense');let ctx;
  f.engine.registry.minigames.set('alienDefense',{...record,start:c=>{ctx=c;return {dispose(){}};}});
  const parts=f.engine.state.parts.general;
  for(let i=0;i<data.config.minigames.partEveryWins;i++){f.engine.startMinigame('alienDefense',{level:1});ctx.finish({outcome:'win',score:80});}
  assert.equal(f.engine.state.parts.general,parts+data.config.minigames.winParts);assert.equal(f.engine.state.highScores.alienDefense,80);
  const raw=f.engine.exportJSON();assert.equal(f.engine.importJSON(raw).ok,true);assert.equal(f.engine.importJSON(raw).ok,true);assert.equal(f.engine.state.parts.general,parts+data.config.minigames.winParts);
  const loaded=createEngine(data,{storage:f.storage,now:f.now});assert.deepEqual(loaded.state.minigameLevels,f.engine.state.minigameLevels);assert.deepEqual(loaded.state.highScores,f.engine.state.highScores);
});
test('each game and event flag suppresses that feature while episodes remain disabled',()=>{
  const f=fixture(),activity=playable(f);assert.equal(data.featureFlags.episodes,false);
  for(const id of ['alienDefense','fireRescue','navalDuel']){const old=data.featureFlags[id];data.featureFlags[id]=false;assert.equal(f.engine.startMinigame(id).ok,false);data.featureFlags[id]=old;}
  for(const [id,type]of Object.entries(data.config.events.types)){const old=data.featureFlags[type.featureFlag];data.featureFlags[type.featureFlag]=false;assert.equal(activity.prepare(id).ok,false);data.featureFlags[type.featureFlag]=old;}
});
test('fire bonus uses the existing radius boundary and ignores a station under repair',()=>{
  const f=fixture();const home=f.engine.place('house',4,5),station=f.engine.place('fireStation',7,5),activity=playable(f);
  const event={typeId:'fire',targetId:home.id};assert.ok(activity.bonuses(event).fireWater);
  f.engine.state.events.repairs[station.id]=f.now()+1000;assert.deepEqual(activity.bonuses(event),{});delete f.engine.state.events.repairs[station.id];
  f.engine.state.buildings.find(b=>b.id===station.id).x=13;assert.deepEqual(activity.bonuses(event),{});
});
test('removing an event target or importing an interrupted game cannot leave an invalid or stuck save',()=>{
  const f=fixture(),home=f.engine.place('house',4,5),activity=playable(f);
  activity.prepare('fire');const active=f.engine.state.events.active;active.targetId=home.id;
  f.engine.remove(home.id);assert.equal(f.engine.state.events.active,null);
  assert.equal(createEngine(data,{storage:f.storage,now:f.now}).storageStatus.ok,true);
  f.advance(data.config.events.types.ship.cooldownMs);activity.prepare('ship');f.advance(data.config.events.warningMs);activity.tick();activity.choose('play');const raw=f.engine.exportJSON();activity.choose('auto');
  assert.equal(f.engine.importJSON(raw).ok,true);assert.equal(f.engine.state.events.active.phase,'ready');
});
