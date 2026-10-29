import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {migrateSave,validateSave} from '../workout/island/engine/persistence.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));

test('Boar Island is a separately enabled campaign with the usual play-time and daily-learning gates',()=>{
  const engine=createEngine(data,{storage:null}),game=engine.registry.minigames.get('boarDefense');
  assert.ok(game);assert.equal(game.featureFlag,'boarDefense');assert.equal(data.featureFlags.boarDefense,true);
  assert.equal(data.config.gameShell.games.boarDefense.orientation,'any');
  assert.equal(data.config.minigames.boarDefense.embeddedCampaign,true);
  let prompted=0;
  assert.equal(ActivityInterface.prototype.requireDaily.call({engine:{learningStatus:()=>({locked:true})},ui:{learningInterface:{daily(){prompted++;}}}},'boarDefense'),true);
  assert.equal(prompted,1);
  const disabled={...data,featureFlags:{...data.featureFlags,boarDefense:false}};
  assert.equal(createEngine(disabled,{storage:null}).startMinigame('boarDefense').ok,false);
});

test('enter, pause and cancel preserve the island, awards and active-game guard',()=>{
  const engine=createEngine(data,{storage:null});engine.skipTutorial();
  const before=engine.exportJSON(),context=gameContext(engine,data.config.minigames,7,'boarDefense',1),finished=[];
  const run=engine.startMinigame('boarDefense',{...context,onFinish:r=>finished.push(r)});
  assert.equal(run.ok,true);assert.equal(engine.isMinigameActive(),true);
  assert.equal(engine.startMinigame('boarDefense',context).ok,false);
  run.session.setPaused(true);assert.equal(run.session.snapshot.paused,true);
  run.session.setPaused(false);assert.equal(run.session.snapshot.paused,false);
  assert.equal(run.cancel().ok,true);assert.equal(run.session.snapshot.disposed,true);
  assert.equal(engine.isMinigameActive(),false);assert.deepEqual(finished,[{cancelled:true}]);
  assert.equal(engine.exportJSON(),before);assert.equal(run.cancel().ok,false);
});

test('existing schema-18 city saves remain byte-for-byte valid without adding fake campaign rewards',()=>{
  const engine=createEngine(data,{storage:null}),old=JSON.parse(engine.exportJSON());
  const migrated=migrateSave(old,data,engine.registry);
  assert.equal(migrated.ok,true);assert.equal(validateSave(migrated.state,data,engine.registry).ok,true);
  assert.deepEqual(migrated.state,old);
  assert.equal(Object.hasOwn(migrated.state.minigameProgress,'boarDefense'),false);
});

test('the imported weapons, wave logic, artwork generators and Three runtime preserve the shipped source bytes',async()=>{
  const base=new URL('minigames/boar-island/',root),source=JSON.parse(await readFile(new URL('source.json',base)));
  assert.equal(source.commit,'4d6674b9ceebc63b08886009cf9ae727bd0cfed3');
  for(const [path,original] of Object.entries(source.originalFiles)){
    if(['game.js','style.css'].includes(path))continue;
    const bytes=await readFile(new URL(path,base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),original.sha256,path);
  }
});
