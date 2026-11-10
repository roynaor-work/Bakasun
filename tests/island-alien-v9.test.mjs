globalThis.__alienV10=false;globalThis.__alienV11=false;globalThis.__alienV12=false;globalThis.__alienV14=false; // v9 behaviour; v10 is covered in island-alien-v10.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createAlienFlightState} from '../workout/island/minigames/alien-flight-input.mjs';
import {alienV9Enabled} from '../workout/island/minigames/alien-v9.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
const make=(level=1,off=false)=>{globalThis.__alienV9=off?false:undefined;const m=createAlienModel({config,balance,level,random:seededRandom(3),completion:'waves',roundChoices:false});globalThis.__alienV9=undefined;return m;};

test('v9 flag: on by default, ?alienV9=0 and the global switch restore the old behaviour',()=>{
 assert.equal(alienV9Enabled('',undefined),true);assert.equal(alienV9Enabled('?alienV9=0',undefined),false);assert.equal(alienV9Enabled('',false),false);
});
test('v9 touch/pen drag never auto-fires; the legacy flag still does',()=>{
 for(const type of ['touch','pen','mouse']){
  const s=createAlienFlightState();s.begin({pointerId:1,clientX:300,pointerType:type},{playerX:400,modelWidth:844,cssWidth:844,mode:'drag'});assert.equal(s.sample().autoFire,false);
  const legacy=createAlienFlightState({autoFire:true});legacy.begin({pointerId:1,clientX:300,pointerType:type},{playerX:400,modelWidth:844,cssWidth:844,mode:'drag'});assert.equal(legacy.sample().autoFire,type!=='mouse');
 }
});
test('v9 zero shots while moving without the fire button, shots only while it is pressed',()=>{
 const m=make();for(let i=0;i<30*20;i++)m.update(1/30,{moveX:Math.sin(i/20),firing:false});
 assert.equal(m.snapshot().fired,0);
 for(let i=0;i<30;i++)m.update(1/30,{moveX:0,firing:true});assert.ok(m.snapshot().fired>0);
});
test('v9 aliens need more hits, more waves and bonuses are rarer; off flag matches the old numbers',()=>{
 const on=make(1),off=make(1,true);
 assert.ok(Math.min(...on.aliens.map(a=>a.hp))>=3,'stage 1 scout needs 3 hits');assert.equal(Math.max(...off.aliens.map(a=>a.hp)),1);
 assert.equal(on.settings.waves,off.settings.waves+balance.v9.extraWaves);
 const bonusesFor=(m)=>{for(let i=0;i<30*400&&!m.result;i++){const t=m.aliens.sort((a,b)=>b.y-a.y)[0];m.update(1/30,{moveX:t?Math.max(-1,Math.min(1,(t.x-m.player.x)/30)):0,firing:true});}return m.snapshot().bonusesDropped;};
 assert.ok(bonusesFor(make(1))<=2);assert.ok(bonusesFor(make(1,true))>=3);
});
// Stage-1 duration is now covered by island-alien-v11.test.mjs (the config values moved on in v11).
