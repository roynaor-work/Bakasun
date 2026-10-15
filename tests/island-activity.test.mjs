import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,createInitialState} from '../workout/island/engine/persistence.mjs';
import {seededRandom,gameContext} from '../workout/island/minigames/context.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';

export const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
export function fixture() {
  const values=new Map();let time=1000000;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const engine=createEngine(data,{storage,now:()=>time});
  return {engine,storage,advance:ms=>time+=ms,now:()=>time};
}
test('seeded generator repeats including seed zero, and every city has one of three difficulties',()=>{
  assert.deepEqual(Array.from({length:20},seededRandom(0)),Array.from({length:20},seededRandom(0)));
  const {engine}=fixture();
  for(let stage=0;stage<3;stage++){engine.state.world.stage=stage;assert.equal(gameContext(engine,data.config.minigames,17).level,stage+1);}
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
  const result=migrateSave(old,data,engine.registry);assert.equal(result.ok,true);assert.equal(result.state.version,3);
  for(const key of Object.keys(snapshot).filter(k=>k!=='version'))assert.deepEqual(result.state[key],snapshot[key]);
  assert.deepEqual(result.state.minigameLevels,{alienDefense:1,fireRescue:1,navalDuel:1});assert.equal(result.state.events.active,null);
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
    const model=createAlienModel({...gameContext(f.engine,data.config.minigames,12),config:data.config.minigames,balance:data.config.minigames.alienDefense});
    for(let i=0;i<20000&&!model.result;i++)model.update(.04,play?{firing:true,x:model.aliens.at(-1)?.x??180}:{});
    assert.equal(f.engine.exportJSON(),before,'a game model cannot mutate the island');
    assert.ok(model.result);return model.snapshot();
  }
  assert.equal(run(true).result.outcome,'win');assert.deepEqual(run(true),run(true));assert.equal(run(false).result.outcome,'lose');
});
