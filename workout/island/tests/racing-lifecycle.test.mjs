import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../engine/load-data.mjs';
import {createEngine} from '../engine/engine.mjs';
import {gameContext} from '../minigames/context.mjs';
import {createRacingAudio} from '../minigames/racing-audio.mjs';

const root=new URL('../',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));

function fixture() {
  // This storage is entirely synthetic. No browser profile or existing save is read.
  const entries=new Map([['unrelated-app','preserve-me']]),writes=[],charges=[];let now=1000000;
  const storage={getItem:key=>entries.get(key)??null,setItem(key,value){writes.push(key);entries.set(key,String(value));}};
  const engine=createEngine(data,{storage,now:()=>now});
  engine.spendPlayTime=minutes=>charges.push(minutes);
  return {engine,entries,writes,charges,advance:ms=>now+=ms};
}

for(const [stage,seed]of [[1,0],[15,17],[30,42]])test(`real racing extension stage ${stage} pauses, resumes, cancels once and releases the engine`,()=>{
  const f=fixture(),{engine}=f,finishes=[];
  engine.state.minigameProgress.islandRacing={stage,stars:Array.from({length:30},(_,index)=>index<stage-1?3:0)};
  const before=structuredClone(engine.state),entriesBefore=[...f.entries];
  const context=gameContext(engine,data.config.minigames,seed,'islandRacing',stage);
  // Use the registered extension itself: no replacement of game.start or its session.
  const run=engine.startMinigame('islandRacing',{...context,onFinish:result=>finishes.push(result)});
  assert.equal(run.ok,true);assert.equal(engine.isMinigameActive(),true);
  assert.equal(run.session.snapshot.stage,stage);assert.equal(run.session.snapshot.phase,'countdown');
  assert.equal(run.session.snapshot.cars.length,5);assert.equal(run.session.snapshot.audioMetrics.unlocked,false);
  assert.equal(engine.startMinigame('islandRacing',context).reason,'reason.gameBusy');
  const cars=run.session.snapshot.cars,time=run.session.snapshot.time;
  run.session.setPaused(true);assert.equal(run.session.snapshot.phase,'paused');
  assert.equal(run.session.snapshot.paused,true);assert.equal(run.session.snapshot.audioMetrics.paused,true);
  run.session.setPaused(true);assert.deepEqual(run.session.snapshot.cars,cars);
  assert.equal(run.session.snapshot.time,time);
  run.session.setPaused(false);assert.equal(run.session.snapshot.phase,'countdown');
  assert.equal(run.session.snapshot.paused,false);assert.equal(run.session.snapshot.audioMetrics.paused,false);
  assert.deepEqual(run.session.snapshot.cars,cars);
  const exported=run.session.snapshot;exported.player.speed=999;exported.cars[0].x=999;
  assert.notEqual(run.session.snapshot.player.speed,999);assert.notEqual(run.session.snapshot.cars[0].x,999);
  f.advance(45000);assert.deepEqual(run.cancel(),{ok:true,cancelled:true});
  assert.equal(run.session.snapshot.disposed,true);assert.equal(run.session.snapshot.audioMetrics.disposed,true);
  assert.equal(engine.isMinigameActive(),false);assert.deepEqual(finishes,[{cancelled:true}]);
  assert.deepEqual(f.charges,[.75]);assert.equal(run.cancel().reason,'reason.duplicate');
  assert.doesNotThrow(()=>run.session.dispose());assert.deepEqual(f.charges,[.75]);
  assert.deepEqual(engine.state,before,'pausing and exiting cannot alter currency, stars, equipment, studies or buildings');
  assert.deepEqual([...f.entries],entriesBefore);assert.deepEqual(f.writes,[]);
  const again=engine.startMinigame('islandRacing',context);assert.ok(again.ok);
  assert.equal(again.session.snapshot.disposed,false);assert.equal(again.session.snapshot.phase,'countdown');
  assert.ok(again.cancel().ok);assert.equal(engine.isMinigameActive(),false);
  assert.equal(f.entries.get('unrelated-app'),'preserve-me');
});

test('real racing extension respects the existing play-time hook and locked-stage gate before creating a session',()=>{
  const f=fixture(),before=structuredClone(f.engine.state);
  f.engine.canPlay=()=>false;
  assert.equal(f.engine.startMinigame('islandRacing',{seed:42,level:1}).reason,'reason.playTime');
  assert.equal(f.engine.isMinigameActive(),false);
  f.engine.canPlay=()=>true;
  assert.equal(f.engine.startMinigame('islandRacing',{seed:42,level:2}).reason,'minigame.stageLockedReason');
  assert.equal(f.engine.isMinigameActive(),false);assert.deepEqual(f.engine.state,before);
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.charges,[]);
});

function audioFixture() {
  const contexts=[],storageReads=[];let preference='on';
  const param=()=>({value:0,targets:[],setTargetAtTime(value,time,constant){this.value=value;this.targets.push({value,time,constant});}});
  const node=()=>({frequency:param(),gain:param(),connections:[],starts:0,stops:0,disconnects:0,
    connect(target){this.connections.push(target);},disconnect(){this.disconnects++;},start(){this.starts++;},stop(){this.stops++;}});
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=2;this.destination={};this.resumes=0;this.suspends=0;this.closes=0;contexts.push(this);}
    createOscillator(){return this.voice=node();}
    createBiquadFilter(){return this.filter=node();}
    createGain(){return this.gain=node();}
    resume(){this.resumes++;this.state='running';return Promise.resolve();}
    suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
    close(){this.closes++;this.state='closed';return Promise.resolve();}
  }
  const storage={getItem:key=>{storageReads.push(key);return preference;}};
  return {contexts,storageReads,AudioContext,storage,mute:value=>preference=value?'off':'on'};
}

test('racing audio waits for a user unlock, builds one voice and follows speed with restrained gain',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);
  audio.sync(40,true);assert.equal(f.contexts.length,0);assert.equal(audio.metrics().unlocked,false);
  audio.unlock();audio.unlock();assert.equal(f.contexts.length,1);
  const ctx=f.contexts[0];assert.equal(ctx.voice.starts,1);
  assert.deepEqual(ctx.voice.connections,[ctx.filter]);assert.deepEqual(ctx.filter.connections,[ctx.gain]);
  assert.deepEqual(ctx.gain.connections,[ctx.destination]);
  audio.sync(10,false);const idlePitch=ctx.voice.frequency.value;
  assert.ok(ctx.gain.gain.value>0&&ctx.gain.gain.value<.03);
  audio.sync(40,false);assert.ok(ctx.voice.frequency.value>idlePitch);const fastPitch=ctx.voice.frequency.value;
  audio.sync(40,true);assert.ok(ctx.voice.frequency.value>fastPitch);
  assert.ok(ctx.gain.gain.value<.03);assert.equal(audio.metrics().muted,false);
  assert.ok(f.storageReads.every(key=>key==='island.sound'));audio.dispose();
});

test('racing audio cannot unlock while paused and resumes its existing context after pause',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);
  audio.setPaused(true);audio.unlock();assert.equal(f.contexts.length,0);
  audio.setPaused(false);assert.equal(f.contexts.length,0);audio.unlock();audio.sync(30);
  const ctx=f.contexts[0];assert.equal(ctx.state,'running');assert.ok(ctx.gain.gain.value>0);
  audio.setPaused(true);assert.equal(ctx.state,'suspended');assert.equal(ctx.gain.gain.value,0);
  const resumes=ctx.resumes;audio.unlock();audio.sync(50,true);
  assert.equal(ctx.resumes,resumes);assert.equal(ctx.gain.gain.value,0);assert.equal(audio.metrics().paused,true);
  audio.setPaused(false);audio.sync(20);assert.equal(ctx.state,'running');
  assert.equal(ctx.resumes,resumes+1);assert.equal(f.contexts.length,1);assert.ok(ctx.gain.gain.value>0);
  assert.equal(audio.metrics().paused,false);audio.dispose();
});

test('racing audio obeys the shared mute preference immediately, including while paused',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);audio.unlock();audio.sync(30);
  const ctx=f.contexts[0];assert.ok(ctx.gain.gain.value>0);
  f.mute(true);audio.sync(30,true);assert.equal(ctx.gain.gain.value,0);assert.equal(audio.metrics().muted,true);
  audio.setPaused(true);f.mute(false);audio.sync(30);assert.equal(ctx.gain.gain.value,0);
  assert.equal(audio.metrics().muted,false);assert.equal(ctx.state,'suspended');
  audio.setPaused(false);audio.sync(30);assert.ok(ctx.gain.gain.value>0);
  assert.ok(f.storageReads.every(key=>key==='island.sound'));audio.dispose();
});

test('racing audio disposal stops and disconnects each node once and prevents future unlocks',()=>{
  const f=audioFixture(),audio=createRacingAudio(f);audio.unlock();audio.sync(30);
  const ctx=f.contexts[0];audio.dispose();audio.dispose();
  assert.equal(ctx.voice.stops,1);assert.equal(ctx.voice.disconnects,1);assert.equal(ctx.filter.disconnects,1);
  assert.equal(ctx.gain.disconnects,1);assert.equal(ctx.closes,1);assert.equal(ctx.state,'closed');
  const resumes=ctx.resumes;audio.unlock();audio.setPaused(false);audio.sync(40,true);
  assert.equal(ctx.resumes,resumes);assert.equal(f.contexts.length,1);assert.equal(ctx.gain.gain.value,0);
  assert.deepEqual(audio.metrics(),{unlocked:true,paused:false,muted:false,disposed:true});
});

test('racing audio can pause, mute and dispose without an available audio context',()=>{
  const audio=createRacingAudio({AudioContext:null,storage:{getItem:()=> 'off'}});
  assert.doesNotThrow(()=>{audio.sync(30);audio.unlock();audio.setPaused(true);audio.setPaused(false);audio.dispose();audio.dispose();});
  assert.deepEqual(audio.metrics(),{unlocked:false,paused:false,muted:true,disposed:true});
});
