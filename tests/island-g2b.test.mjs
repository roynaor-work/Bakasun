import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave} from '../workout/island/engine/persistence.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {recordStageWin} from '../workout/island/activity/progress.mjs';
import {seededRandom,gameContext} from '../workout/island/minigames/context.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {pilotInput} from '../workout/island/tests/pilot.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const models={alienDefense:createAlienModel,fireRescue:createFireModel,navalDuel:createNavalModel};
function fixture() {
  const values=new Map();let time=1000000;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const engine=createEngine(data,{storage,now:()=>time});
  return {engine,storage,now:()=>time,advance:ms=>time+=ms};
}

function facilities(e){e.state.buildings.push({id:'test-airbase',typeId:'airbase',x:12,z:0,level:1},{id:'test-fire-station',typeId:'fireStation',x:12,z:3,level:1});}
function ready(f) {f.engine.setAvatar({created:true});f.engine.skipTutorial();}
function eventCity(f) {
  ready(f);facilities(f.engine);f.engine.state.world={size:20,stage:1};f.engine.state.buildings.push({id:'harbor-test',typeId:'harbor',x:0,z:6,level:1});f.engine.place('house',4,5);
}
for(const [id,make]of Object.entries(models)) {
  test(`G2b ${id}: actual difficulty and rewards increase across all ten stages`,()=>{
    const b=data.config.minigames[id];assert.equal(b.levels.length,10);let last=0;
    for(const [i,s]of b.levels.entries()) {
      assert.equal(s.difficulty,i+1);if(i){assert.ok(s.winMoney>b.levels[i-1].winMoney);assert.ok(s.winParts>=b.levels[i-1].winParts);}
      let threat;
      if(id==='alienDefense') {
        let hp=0;for(let row=0;row<s.rows;row++)for(let col=0;col<s.columns;col++)hp+=b.enemyTypes[(row+col)%s.enemyKinds].hp;
        threat=(hp*s.waves+(s.boss?s.bossLives:0))*(s.alienSpeed+s.boltSpeed)/s.boltSeconds;
        assert.equal(s.boss,i===9);
      }else if(id==='fireRescue')threat=(s.flames+s.spreadCount)*(1+s.growthPerSecond)/(s.seconds*(s.water+s.refillWater)*s.spreadSeconds*s.eruptionSeconds);
      else {let hp=0;for(let w=0;w<s.waves;w++)hp+=s.enemyLives*b.shipTypes[w%s.shipKinds].hp;threat=hp*(1+s.drift)/s.enemyAimError;}
      assert.ok(threat>last,`${i+1}: ${threat} > ${last}`);last=threat;
    }
  });
  for(let level=1;level<=10;level++)test(`G2b ${id} stage ${level}: seeded victory with equipment ${level<4?1:level<7?2:3}`,()=>{
    const b=data.config.minigames[id],power=level<4?1:level<7?1.2:1.45;
    const run=()=>{const m=make({config:data.config.minigames,balance:b,level,power,random:seededRandom(12)}),memory={};
      for(let i=0;i<40000&&!m.result;i++)m.update(.04,pilotInput(id,m,b,memory));return m;};
    const a=run(),again=run();assert.equal(a.result?.outcome,(id==='fireRescue'&&level>=9||id==='alienDefense'&&level===10)?'lose':'win');assert.deepEqual(a.snapshot(),again.snapshot());
    const f=fixture(),ctx={engine:f.engine,level,config:data.config.minigames};
    const result=f.engine.registry.minigames.get(id).onResult(a.result,ctx);assert.ok(result);assert.ok(a.result.outcome==='win'?result.stars>=1&&result.stars<=3:result.stars===0);
  });
}
test('G2b v3 to v4 adds only stage/star defaults, preserves the input, and survives reload',()=>{
  const f=fixture();eventCity(f);const old=JSON.parse(f.engine.exportJSON());old.version=3;delete old.minigameProgress;
  old.minigameLevels.alienDefense=3;old.highScores.alienDefense=1234;old.minigameWins.alienDefense=12;
  const before=structuredClone(old),r=migrateSave(old,data,f.engine.registry);assert.equal(r.ok,true);assert.equal(r.state.version,11);
  for(const key of Object.keys(old).filter(k=>k!=='version'))assert.deepEqual(r.state[key],old[key]);
  assert.deepEqual(old,before);
  for(const p of Object.values(r.state.minigameProgress))assert.deepEqual(p,{stage:1,stars:Array(10).fill(0)});
  f.storage.setItem('island.v1',JSON.stringify(old));const loaded=createEngine(data,{storage:f.storage,now:f.now});assert.deepEqual(loaded.state,r.state);
});
test('G2b stages cannot be skipped by context, by loss, by exit or by malformed import',()=>{
  for(const id of Object.keys(models)) {
    const f=fixture(),e=f.engine;facilities(e);e.state.buildings.push({id:'test-harbor',typeId:'harbor',x:0,z:8,level:1});let ctx;e.registry.minigames.set(id,{...e.registry.minigames.get(id),start:c=>{ctx=c;return {dispose(){}};}});
    const before=e.exportJSON();assert.equal(e.startMinigame(id,{level:2}).reason,'minigame.stageLockedReason');assert.equal(e.exportJSON(),before);
    for(const bad of [0,-1,1.5,NaN,Infinity,11])assert.equal(e.startMinigame(id,{level:bad}).ok,false);
    e.startMinigame(id,{level:1});ctx.finish({outcome:'lose',score:0});assert.equal(e.state.minigameProgress[id].stage,1);
    e.startMinigame(id).cancel();assert.equal(e.state.minigameProgress[id].stage,1);
    e.startMinigame(id,{level:1});assert.equal(ctx.finish({outcome:'win',score:0,performance:1}).ok,true);assert.equal(e.state.minigameProgress[id].stage,2);
    const raw=JSON.parse(e.exportJSON());raw.minigameProgress[id].stage=4;assert.equal(e.importJSON(raw).ok,false);
    assert.equal(gameContext(e,data.config.minigames,12,id).level,2);
    e.startMinigame(id,{level:1});ctx.finish({outcome:'win',score:0,performance:0});assert.equal(e.state.minigameProgress[id].stage,2);assert.equal(e.state.minigameProgress[id].stars[0],3);
  }
});
test('G2b stars, staged parts, duplicate settlement and free equipment bonuses persist and merge upward',()=>{
  const f=fixture(),e=f.engine,id='fireRescue';facilities(e);e.state.buildings.push({id:'test-harbor',typeId:'harbor',x:0,z:8,level:1});let ctx;e.registry.minigames.set(id,{...e.registry.minigames.get(id),start:c=>{ctx=c;return {dispose(){}};}});
  for(let level=1;level<=6;level++){e.startMinigame(id,{level});ctx.finish({outcome:'win',score:0,performance:1});assert.equal(ctx.finish({outcome:'win',score:0}).ok,false);}
  assert.equal(e.state.minigameLevels[id],3);assert.deepEqual(e.state.minigameProgress[id].stars,[3,3,3,3,3,3,0,0,0,0]);
  assert.equal(e.state.parts.general,5); // Three stage parts and two periodic parts.
  const lower=fixture();recordStageWin(lower.engine.state,data,id,1,1);
  const raw=e.exportJSON(),money=e.state.money;assert.equal(e.importJSON(lower.engine.exportJSON()).ok,true);assert.equal(e.state.money,money);
  assert.equal(lower.engine.importJSON(raw).ok,true);assert.deepEqual(lower.engine.state.minigameProgress,e.state.minigameProgress);
  assert.equal(lower.engine.state.minigameLevels[id],3);assert.equal(lower.engine.importJSON(raw).ok,true);assert.equal(lower.engine.state.parts.general,5);
  assert.equal(validateSave(e.state,data,e.registry).ok,true);
});
test('G2b a warning auto-launches only when unblocked, retains one defer, and cancellation has no reward or loss',()=>{
  const f=fixture();eventCity(f);let blocked=false;const launches=[];
  const a=createActivity(f.engine,{now:f.now,blocked:()=>blocked,onLaunch:c=>launches.push(c),random:seededRandom(12)});
  a.prepare('fire');const id=f.engine.state.events.active.id;assert.equal(a.choose('defer').ok,true);assert.equal(a.choose('defer').ok,false);
  f.advance(data.config.events.warningMs+data.config.events.deferMs);blocked=true;a.tick();assert.equal(launches.length,0);
  blocked=false;a.tick();assert.equal(launches.length,1);assert.equal(f.engine.state.events.active.phase,'playing');a.tick();assert.equal(launches.length,1);
  const {money,minigameProgress,minigameWins}=structuredClone(f.engine.state);a.cancel(id);
  assert.equal(f.engine.state.events.active,null);assert.equal(f.engine.state.money,money);assert.deepEqual(f.engine.state.minigameProgress,minigameProgress);assert.deepEqual(f.engine.state.minigameWins,minigameWins);assert.deepEqual(f.engine.state.events.repairs,{});
});
test('G2b no event interrupts tutorial, avatar, a modal or another engine minigame',()=>{
  const f=fixture(),launches=[];let blocked=false;const a=createActivity(f.engine,{now:f.now,blocked:()=>blocked,onLaunch:c=>launches.push(c)});
  f.engine.place('house',4,5);assert.equal(a.prepare('fire').ok,false);f.engine.skipTutorial();assert.equal(a.prepare('fire').ok,false);f.engine.setAvatar({created:true});
  blocked=true;assert.equal(a.prepare('fire').ok,false);blocked=false;assert.equal(a.prepare('fire').ok,true);
  f.engine.registerMinigame({id:'other',start:()=>({dispose(){}}),onResult:r=>r});const session=f.engine.startMinigame('other');
  f.advance(data.config.events.warningMs);a.tick();assert.equal(launches.length,0);session.cancel();facilities(f.engine);a.tick();assert.equal(launches.length,1);
});
test('G2b eligibility, weighted selection and never repeating an event survive saving and additive import',()=>{
  const f=fixture();ready(f);let a=createActivity(f.engine,{now:f.now,random:seededRandom(2)});
  for(const id of ['fire','aliens','ship'])assert.equal(a.prepare(id).ok,false);
  eventCity(f);let previous;
  for(let i=0;i<40;i++) {
    f.advance(1000000);a.tick();const event=f.engine.state.events.active;assert.ok(event);assert.notEqual(event.typeId,previous);previous=event.typeId;
    f.advance(data.config.events.warningMs);a.tick();a.choose('auto');
    if(i===20){a.dispose();const saved=createEngine(data,{storage:f.storage,now:f.now});assert.equal(saved.importJSON(f.engine.exportJSON()).ok,true);f.engine=saved;a=createActivity(saved,{now:f.now,random:seededRandom(2)});}
    assert.equal(a.prepare(previous).ok,false);
  }
});
test('G2b weights are used and ineligible choices never consume a scheduling slot',()=>{
  const f=fixture();eventCity(f);const original=structuredClone(data.config.events.types);
  try {
    data.config.events.types.fire.weight=0;data.config.events.types.aliens.weight=0;
    const a=createActivity(f.engine,{now:f.now,random:seededRandom(2)});f.advance(1000000);a.tick();assert.equal(f.engine.state.events.active.typeId,'ship');
    a.cancel(f.engine.state.events.active.id);f.engine.state.buildings=f.engine.state.buildings.filter(b=>b.typeId!=='harbor');f.advance(1000000);a.tick();assert.equal(f.engine.state.events.active,null);
  }finally {Object.assign(data.config.events.types,original);}
});
test('G2b fire really spreads and hydrant reserve remains available; aliens and ships use their kinds',()=>{
  const fire=createFireModel({config:data.config.minigames,balance:data.config.minigames.fireRescue,level:5,power:1,random:seededRandom(12)});
  const active=fire.flames.filter(f=>f.active).length;for(let i=0;i<400&&!fire.result;i++)fire.update(.04,{});assert.ok(fire.flames.filter(f=>f.active).length>active);
  for(let i=0;i<10000&&!fire.result;i++)fire.update(.04,{firing:i%2===0,refill:i%2!==0,x:0,y:0});assert.equal(fire.reserve,data.config.minigames.fireRescue.levels[4].refillWater);
  const alien=createAlienModel({config:data.config.minigames,balance:data.config.minigames.alienDefense,level:10,power:1.45,random:seededRandom(12)});assert.equal(new Set(alien.aliens.map(a=>a.kind)).size,data.config.minigames.alienDefense.levels[9].enemyKinds);
});
test('G2b all three star ratings use data thresholds and import keeps the best star in each stage',()=>{
  for(const [performance,stars]of [[0,1],[data.config.minigames.starThresholds[0],2],[data.config.minigames.starThresholds[1],3]]) {
    const e=fixture().engine;facilities(e);e.state.buildings.push({id:'test-harbor',typeId:'harbor',x:0,z:8,level:1});let ctx;e.registry.minigames.set('fireRescue',{...e.registry.minigames.get('fireRescue'),start:c=>{ctx=c;return {dispose(){}};}});
    e.startMinigame('fireRescue');ctx.finish({outcome:'win',score:0,performance});assert.equal(e.state.minigameProgress.fireRescue.stars[0],stars);
  }
  const a=fixture().engine,b=fixture().engine,id='fireRescue';
  recordStageWin(a.state,data,id,1,3);recordStageWin(a.state,data,id,2,1);
  recordStageWin(b.state,data,id,1,1);recordStageWin(b.state,data,id,2,3);recordStageWin(b.state,data,id,3,2);
  assert.equal(a.importJSON(b.exportJSON()).ok,true);assert.deepEqual(a.state.minigameProgress[id],{stage:4,stars:[3,3,2,0,0,0,0,0,0,0]});assert.equal(a.state.minigameLevels[id],2);
});
test('G2b an event selects the highest opened stage or the configured nearby stage, including bounds',async()=>{
  const {ActivityInterface}=await import('../workout/island/ui/activity.mjs');
  const f=fixture();for(let stage=1;stage<6;stage++)recordStageWin(f.engine.state,data,'fireRescue',stage,1);
  const old=data.config.events.eventStageOffset;const launches=[];
  const ui={engine:f.engine,data,launch:(...args)=>launches.push(args)};
  try {
    for(const offset of [0,-2,-99,99]){data.config.events.eventStageOffset=offset;ActivityInterface.prototype.autoLaunch.call(ui,{gameId:'fireRescue',eventId:'event-1'});}
    assert.deepEqual(launches.map(args=>args[2]),[6,4,1,6]);
  }finally {data.config.events.eventStageOffset=old;}
});
