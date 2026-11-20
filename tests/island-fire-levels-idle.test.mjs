import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {fireLevelsEnabled} from '../workout/island/minigames/fire-levels-v1.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({
  ok:true,
  json:async()=>JSON.parse(await readFile(url,'utf8')),
}));
const config=data.config.minigames,balance=config.fireRescue;

function playToTimeout(level,fireLevels,initialInput={}){
  const model=createFireModel({config,balance,level,fireLevels,random:seededRandom(12)});
  model.update(.05,initialInput);
  for(let frame=0;frame<10000&&!model.result;frame++)model.update(.05,{charge:true});
  assert.ok(model.result);
  return model.result;
}

test('fire levels switch is on by default and can coexist with the v23 switch',()=>{
  assert.equal(fireLevelsEnabled(''),true);
  assert.equal(fireLevelsEnabled('?fireLevels=1'),true);
  assert.equal(fireLevelsEnabled('?fireFlow=v23'),true);
  assert.equal(fireLevelsEnabled('?fireFlow=v23&fireLevels=0'),false);
});

test('autopump is idle, while spray and deliberate steering count as activity',()=>{
  for(const stage of [1,3,30]){
    const idle=playToTimeout(stage,true);
    assert.equal(idle.outcome,'lose');
    assert.equal(idle.score,0);
    assert.equal(idle.reason,'fireIdle');
    assert.equal(idle.certificate,undefined);
    assert.notEqual(playToTimeout(stage,false).reason,'fireIdle');
  }
  assert.notEqual(playToTimeout(1,true,{firing:true}).reason,'fireIdle');
  assert.notEqual(playToTimeout(1,true,{moveX:1}).reason,'fireIdle');
});

test('the real result contract shows one star for idle without awarding a win or certificate',()=>{
  const engine=createEngine(data,{storage:null});
  engine.state.buildings.push({id:'fire-idle-fixture',typeId:'fireStation',x:12,z:0,level:1});
  const game=engine.registry.minigames.get('fireRescue');
  let finish;
  engine.registry.minigames.set('fireRescue',{...game,start:ctx=>{finish=ctx.finish;return {dispose(){}};}});
  const before=structuredClone(engine.state.minigameProgress.fireRescue);
  const money=engine.state.money,wins=engine.state.minigameWins.fireRescue;
  for(const [fireLevels,stars] of [[true,1],[false,0]]){
    assert.ok(engine.startMinigame('fireRescue',{level:1}).ok);
    const r=finish(playToTimeout(1,fireLevels));
    assert.equal(r.result.outcome,'lose');
    assert.equal(r.result.stars,stars);
    assert.equal(r.result.money,0);
    assert.equal(r.result.parts,0);
    assert.equal(engine.state.fireCertificates[0]?.stars??0,0);
    assert.equal(engine.state.money,money);
    assert.equal(engine.state.minigameWins.fireRescue,wins);
    assert.deepEqual(engine.state.minigameProgress.fireRescue,before);
  }
});
