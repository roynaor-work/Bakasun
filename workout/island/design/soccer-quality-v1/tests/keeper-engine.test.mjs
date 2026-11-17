import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {keeperShotFixture} from '../sim/keeper-scenarios.mjs';
const source=process.env.SOCCER_QUALITY_SOURCE||process.env.SOCCER_QUALITY_ROOT;
const root=source?pathToFileURL(source.replace(/\/$/,'')+'/'):new URL('../../../../../',import.meta.url);
const {createSoccer}=await import(new URL('workout/island/minigames/soccer.mjs',root));
const {applySoccerFull}=await import(new URL('workout/island/minigames/soccer-full.mjs',root));
const config=applySoccerFull(JSON.parse(await readFile(new URL('workout/island/data/config.json',root),'utf8')).minigames.soccer,{v241:false});
test('actual 11-a-side keeper starts on the predicted side after a real reaction delay and makes a legal catch',()=>{
 for(const side of [-1,1]){
  const result=keeperShotFixture(createSoccer,config,{quality:true,seed:7,side,speed:20,range:8});
  assert.ok(result.firstDive>=.08&&result.firstDive<=.18);assert.equal(result.correctSide,true);
  assert.equal(result.saved,true);assert.equal(result.goal,false);assert.equal(result.illegalTargets,0);assert.ok(result.targetSamples>0);
 }
});
test('actual close shot can score during the bounded reaction window; restart ownership is never counted as a save',()=>{
 for(const side of [-1,1]){
  const result=keeperShotFixture(createSoccer,config,{quality:true,seed:7,side,speed:30,range:3,height:1.6,category:'extreme'});
  assert.equal(result.saved,false);assert.equal(result.goal,true);assert.equal(result.illegalTargets,0);
 }
});
