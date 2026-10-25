import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../engine/load-data.mjs';
import {createEngine} from '../engine/engine.mjs';
import {createInitialState,migrateSave,validateSave} from '../engine/persistence.mjs';
import {createActivity} from '../activity/runtime.mjs';
import {gameAvailability} from '../activity/availability.mjs';
import {ActivityInterface} from '../ui/activity.mjs';
import {gameArtwork} from '../ui/adventure-emblems.mjs';
import {getRacingStage,RACING_STAGES,TRACKS} from '../minigames/racing-tracks.mjs';
import {racingResult} from '../minigames/racing-result.mjs';

const root=new URL('../',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const balance=data.config.minigames.islandRacing;
const initial=()=>createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
const result=(stage=1,rank=1,completed=true)=>{
  const row=getRacingStage(stage),required=row.laps*16,checkpoints=completed?required:8,won=completed&&rank<=row.targetRank;
  return {won,stars:won?4-rank:0,rank,stage,seed:42,durationSeconds:completed?row.laps*35:row.timeLimit,
    laps:Math.floor(checkpoints/16),checkpoints,requiredCheckpoints:required,finished:true};
};
const envelope=r=>({outcome:r.won?'win':'lose',score:r.checkpoints===r.requiredCheckpoints?6-r.rank:0,racing:r});
const context=stage=>({seed:42,level:stage});

test('racing is registered in the real application manifest and open without a new building',()=>{
  const engine=initial(),game=engine.registry.minigames.get('islandRacing');
  assert.ok(game);assert.equal(game.featureFlag,'islandRacing');assert.equal(data.featureFlags.islandRacing,true);
  assert.equal(game.title,'minigame.islandRacing.title');assert.equal(gameArtwork('islandRacing').file,'racing.webp');
  assert.equal(data.config.gameShell.games.islandRacing.orientation,'landscape');
  assert.deepEqual(gameAvailability(engine.state,data.config,'islandRacing'),{ok:true});
  assert.equal(engine.state.buildings.some(row=>row.typeId==='islandRacing'),false);
});

test('racing uses the existing daily study gate, then opens normally',()=>{
  let shown=0,locked=true;
  const ui={engine:{learningStatus:()=>({locked})},ui:{learningInterface:{daily:()=>shown++}}};
  assert.equal(ActivityInterface.prototype.requireDaily.call(ui,'islandRacing'),true);assert.equal(shown,1);
  locked=false;assert.equal(ActivityInterface.prototype.requireDaily.call(ui,'islandRacing'),false);assert.equal(shown,1);
});

test('racing stage entries cover 30 stages and six original track layouts',async()=>{
  assert.equal(balance.levels.length,30);assert.equal(TRACKS.length,6);
  assert.equal(new Set(TRACKS.map(row=>JSON.stringify(row.points))).size,6);
  const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
  for(const [index,row]of balance.levels.entries()){
    const stage=getRacingStage(index+1);assert.equal(row.stage,index+1);assert.equal(row.trackId,stage.trackId);
    assert.equal(row.laps,stage.laps);assert.ok(strings[row.feature]);assert.ok(strings[row.feature].includes(`${stage.laps} הקפות`));assert.ok(row.winMoney>0);
  }
  assert.deepEqual(new Set(balance.levels.map(row=>row.trackId)),new Set(TRACKS.map(row=>row.id)));
  assert.ok(RACING_STAGES.some(row=>row.reverse));assert.ok(RACING_STAGES.some(row=>row.timeOfDay==='night'));
});

test('every registered race requires multiple laps and a single-lap summary cannot award a win',()=>{
  for(const stage of RACING_STAGES){
    assert.ok(stage.laps>=2);assert.equal(balance.levels[stage.id-1].laps,stage.laps);
    assert.ok(stage.timeLimit<balance.maximumSeconds,'distance-based timeout fits the app result envelope');
    const forged={...result(stage.id),laps:1,checkpoints:16};
    assert.equal(racingResult(envelope(forged),context(stage.id),balance),null,'one lap cannot complete stage'+stage.id);
  }
});

for(const stage of [1,6,7,15,19,24,30])test(`racing stage ${stage} accepts only completed ordered laps for a win`,()=>{
  const row=getRacingStage(stage),win=result(stage,row.targetRank),settled=racingResult(envelope(win),context(stage),balance);
  assert.ok(settled);assert.equal(settled.outcome,'win');assert.equal(settled.stars,4-row.targetRank);
  const timeout=result(stage,5,false),loss=racingResult(envelope(timeout),context(stage),balance);
  assert.deepEqual(loss,{outcome:'lose',score:0,stars:0,money:0});
  assert.equal(racingResult(envelope({...win,checkpoints:win.requiredCheckpoints-1}),context(stage),balance),null);
});

for(const [key,value]of [['stage',2],['seed',43],['rank',0],['rank',6],['stars',0],['won',false],['durationSeconds',0],['durationSeconds',1000],['laps',0],['checkpoints',15],['requiredCheckpoints',15],['finished',false]]){
  test(`racing rejects an invalid ${key} before awarding currency or stars (${value})`,()=>{
    const r={...result(),[key]:value};assert.equal(racingResult(envelope(r),context(1),balance),null);
  });
}

test('racing rejects changed score, outcome, extra result fields and swapped stage context',()=>{
  const r=result(),raw=envelope(r);
  assert.equal(racingResult({...raw,score:500},context(1),balance),null);
  assert.equal(racingResult({...raw,outcome:'lose'},context(1),balance),null);
  assert.equal(racingResult(envelope({...r,extra:1}),context(1),balance),null);
  assert.equal(racingResult(raw,context(2),balance),null);
});

test('racing settles once through the common engine and changes only its own progress and rewards',()=>{
  const engine=initial(),before=structuredClone(engine.state);let finish,disposed=0;
  engine.registry.minigames.set('islandRacing',{...engine.registry.minigames.get('islandRacing'),start:ctx=>{finish=ctx.finish;return {dispose(){disposed++;}};}});
  const run=engine.startMinigame('islandRacing',context(1));assert.ok(run.ok);
  const settled=finish(envelope(result()));assert.ok(settled.ok);assert.equal(disposed,1);
  assert.equal(engine.state.money,before.money+settled.result.money);assert.equal(engine.state.minigameProgress.islandRacing.stage,2);
  assert.equal(engine.state.minigameProgress.islandRacing.stars[0],3);assert.equal(engine.state.minigameWins.islandRacing,1);
  assert.equal(finish(envelope(result())).ok,false);assert.equal(disposed,1);
  for(const id of ['soccer','tennis','navalDuel','fireRescue','alienDefense']){
    assert.deepEqual(engine.state.minigameProgress[id],before.minigameProgress[id]);
    assert.deepEqual(engine.state.minigameEquipment[id],before.minigameEquipment[id]);
  }
  for(const key of ['resources','buildings','avatar','team','players','learning'])assert.deepEqual(engine.state[key],before[key]);
  assert.ok(validateSave(engine.state,data,engine.registry).ok);
});

test('racing cancellation disposes once, awards nothing and preserves all stages',()=>{
  const engine=initial(),before=structuredClone(engine.state);let disposed=0;
  engine.registry.minigames.set('islandRacing',{...engine.registry.minigames.get('islandRacing'),start:()=>({dispose(){disposed++;}})});
  const run=engine.startMinigame('islandRacing',context(1));assert.ok(run.ok);run.cancel();run.cancel();
  assert.equal(disposed,1);assert.equal(engine.state.money,before.money);
  assert.deepEqual(engine.state.minigameProgress,before.minigameProgress);assert.deepEqual(engine.state.minigameEquipment,before.minigameEquipment);
});

test('racing equipment, stars and records survive an export/import without replacing other games',()=>{
  const engine=initial(),activity=createActivity(engine,{now:()=>1000000});
  for(const key of ['engine','grip','nitro'])assert.ok(activity.upgrade('islandRacing',key).ok);
  engine.state.minigameProgress.islandRacing={stage:3,stars:[3,2,...Array(28).fill(0)]};
  engine.state.highScores.islandRacing=5;engine.state.minigameWins.islandRacing=2;
  const target=initial();assert.ok(target.importJSON(engine.exportJSON()).ok);
  for(const key of ['minigameEquipment','minigameProgress','highScores','minigameWins'])assert.deepEqual(target.state[key],engine.state[key]);
  activity.dispose();
});

test('a synthetic version-16 save gains racing while preserving currency, buildings, equipment, stars and studies',()=>{
  const oldData=structuredClone({...data,extensionInstallers:[]});
  delete oldData.config.minigames.islandRacing;delete oldData.config.minigameLevels.islandRacing;
  for(const id of Object.keys(oldData.config.minigameLevels))oldData.config.minigames[id].levels=oldData.config.minigames[id].levels.slice(0,10);
  const old=createInitialState(oldData,1000);old.version=16;old.money=1943;old.parts.general=7;
  old.buildings.push({id:'synthetic-house',typeId:'house',x:4,z:5,level:2});
  old.minigameEquipment.tennis.hit=2;old.minigameLevels.tennis=2;
  old.minigameProgress.tennis={stage:3,stars:[3,2,...Array(8).fill(0)]};
  old.highScores.tennis=4;old.minigameWins.tennis=2;old.instructionsSeen=['tennis'];
  old.learning.stations.language.stars=9;
  const before=structuredClone(old),engine=initial(),loaded=migrateSave(old,data,engine.registry);
  assert.ok(loaded.ok,'shared content normalization must add missing racing equipment as well as levels/progress');
  assert.deepEqual(old,before,'loading never mutates the supplied save');
  assert.deepEqual(loaded.state.minigameEquipment.islandRacing,{engine:0,grip:0,nitro:0});
  assert.deepEqual(loaded.state.minigameProgress.islandRacing,{stage:1,stars:Array(30).fill(0)});
  assert.equal(loaded.state.minigameLevels.islandRacing,1);
  for(const [id,progress]of Object.entries(before.minigameProgress)){
    const current=loaded.state.minigameProgress[id];assert.equal(current.stage,progress.stage);
    assert.deepEqual(current.stars.slice(0,progress.stars.length),progress.stars,id+' earned stars remain intact');
    assert.ok(current.stars.slice(progress.stars.length).every(stars=>stars===0),id+' new stages begin unearned');
  }
  assert.equal(loaded.state.version,18);
  assert.deepEqual(loaded.state.fireCertificates,[...before.fireCertificates,...Array(data.config.minigames.fireRescue.levels.length-before.fireCertificates.length).fill(null)]);
  for(const key of Object.keys(before)){
    if(['minigameProgress','version','fireCertificates'].includes(key))continue;
    const expected=structuredClone(loaded.state[key]);
    if(['minigameEquipment','minigameLevels'].includes(key))delete expected.islandRacing;
    assert.deepEqual(expected,before[key],key+' remains intact');
  }
});
