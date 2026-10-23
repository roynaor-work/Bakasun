import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {segmentContact} from '../workout/island/minigames/alien-flight-combat.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
const make=(options={})=>createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',roundChoices:false,...options});
const advance=(m,t,input={})=>{for(let i=0;i<Math.ceil(t/.02)&&!m.result;i++)m.update(.02,input);};

test('flight swept collision catches fast crossings, rejects near misses and orders first contact',()=>{
 assert.equal(segmentContact(0,0,0,100,0,40,10),.3);assert.equal(segmentContact(0,0,0,100,20,40,10),null);
 assert.ok(segmentContact(0,0,0,100,0,40,10)<segmentContact(0,0,0,100,0,80,10));
 assert.equal(segmentContact(0,0,0,0,0,0,10),0);
});
test('flight no idle fire, early enemy shots follow a visible warning and respect the stage cap',()=>{
 const m=make();let warned=false,firstShot=false;for(let i=0;i<1000;i++){m.update(.02,{});warned||=m.telegraphs.some(t=>t.kind==='shot'&&t.maxLife>=.45);if(m.bolts.length){firstShot=true;assert.ok(warned);break;}}
 assert.ok(firstShot);assert.equal(m.shots.length,0);assert.equal(m.snapshot().fired,0);assert.ok(m.bolts.length<=m.behavior.bulletCap);
});
test('flight all six pickups announce their identity and alter their intended capability',()=>{
 for(let kind=0;kind<6;kind++){const m=make(),charges=m.novaCharges;m.pickups.push({kind,x:m.player.x,y:m.player.y,vy:0});m.update(.02,{firing:true});assert.equal(m.feedback.kind,'pickup');assert.equal(m.feedback.value,kind);
  if(kind===0)assert.ok(m.spreadTime>0);else if(kind===5)assert.equal(m.novaCharges,charges+1);else assert.equal(m.powerup,kind);
  advance(m,.5,{firing:true});if(kind===1)assert.ok(m.shots.some(s=>s.kind===1));if(kind===4)assert.ok(m.wings.some(w=>w.active));
 }
});
test('flight purchased weapons and earned wings remain active beyond a temporary pickup duration',()=>{
 const m=make({equipment:{weapon:2}});advance(m,balance.pickups.seconds+1,{firing:true});assert.ok(m.wings.some(w=>w.active));assert.ok(m.shots.some(s=>s.kind===1));
 const n=make({permanentUpgrades:{wing:1}});advance(n,balance.pickups.seconds+1,{});assert.equal(n.wings.filter(w=>w.active).length,1);
});
test('flight a burst costs one life, invulnerability is visible, and shield prevents life loss',()=>{
 const m=make(),lives=m.lives;for(let i=0;i<3;i++)m.bolts.push({x:m.player.x,y:m.player.y,vx:0,vy:1});m.update(.02,{});assert.equal(m.lives,lives-1);assert.ok(m.invulnerable>0);assert.equal(m.feedback.kind,'player-hit');
 const n=make();n.pickups.push({kind:3,x:n.player.x,y:n.player.y,vy:0});n.update(.02,{});n.bolts.push({x:n.player.x,y:n.player.y,vx:0,vy:1});n.update(.02,{});assert.equal(n.lives,n.maxLives);
});
test('flight boss enters fully inside the field and changes attack phase at HP thresholds',()=>{
 const b=structuredClone(balance);b.levels[29].waves=1;const m=make({level:30,balance:b});
 const boss=m.aliens.find(a=>a.boss);assert.ok(boss);advance(m,2.1);assert.ok(boss.y-boss.radius>0);assert.ok(boss.y+boss.radius<m.player.y-100);advance(m,b.balance.minBossSeconds/3);boss.hp=boss.maxHp*.6;m.update(.02,{});assert.equal(boss.bossPhase,2);assert.equal(m.feedback.kind,'boss-phase');
});
test('flight pause input reset permits a fresh missile edge without consuming an idle frame',()=>{
 const m=make();advance(m,2);m.update(.02,{nova:true});advance(m,1.5,{nova:true});const before=m.novaCharges;m.resetInput();m.update(.02,{nova:true});assert.equal(m.novaCharges,before-1);
});
test('flight honors saved equipment/hangar without mutating it and retains the result contract',()=>{
 const hangar={rapid:3,shield:1,damage:1,paint:2,coins:19},equipment={damage:1.5,rate:1.3,shield:2,weapon:1},saved=structuredClone({hangar,equipment});
 const m=make({hangar,equipment});assert.equal(m.lives,m.maxLives-1);m.aliens.splice(0);while(!m.result){m.update(.04,{});m.aliens.splice(0);}
 assert.deepEqual({hangar,equipment},saved);assert.deepEqual(Object.keys(m.result).sort(),['damage','outcome','performance','score']);assert.equal(m.result.outcome,'win');assert.ok(m.result.performance>=0&&m.result.performance<=1);
});

test('flight every authored stage and boss-wave fixture enters continuously on its first frame',()=>{
 for(let level=1;level<=balance.levels.length;level++)for(const bossWave of balance.levels[level-1].boss?[false,true]:[false]){
  const fixture=bossWave?structuredClone(balance):balance;if(bossWave)fixture.levels[level-1].waves=1;
  const m=make({level,balance:fixture}),before=new Map(m.aliens.map(a=>[a.id,{x:a.x,y:a.y}]));
  if(bossWave)assert.ok(m.aliens.some(a=>a.boss));
  m.update(.01,{});
  for(const a of m.aliens){const previous=before.get(a.id),step=Math.hypot(a.x-previous.x,a.y-previous.y);assert.ok(step<3,JSON.stringify({level,bossWave,id:a.id,boss:a.boss,step,previous,current:{x:a.x,y:a.y},entry:a.entry,formation:a.formation}));}
 }
});
