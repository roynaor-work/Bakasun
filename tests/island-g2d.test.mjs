import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,CURRENT_VERSION,validateSave} from '../workout/island/engine/persistence.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {applyCanvasGesture} from '../workout/island/minigames/canvas-session.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {pilotInput} from '../workout/island/tests/pilot.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames,strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const make=(id,level=1,extra={})=>({navalDuel:createNavalModel,alienDefense:createAlienModel,fireRescue:createFireModel}[id])({config,balance:config[id],level,random:seededRandom(12),...extra});
function advance(m,seconds,input={}){for(let i=0;i<Math.ceil(seconds/.02)&&!m.result;i++)m.update(.02,input);}
function nextChoice(m){const memory={};for(let i=0;i<12000&&!m.choosing&&!m.result;i++)m.update(.04,pilotInput('alienDefense',m,config.alienDefense,memory));assert.equal(m.choosing,true);}

test('G2d naval touch moves the circle; explicit firing alone consumes stage ammunition',()=>{
  const b=config.navalDuel,m=make('navalDuel'),input={x:120,y:30,firing:false},anchor={},supply=m.ammo[0];
  applyCanvasGesture(input,'navalDuel',anchor,b,true);m.update(.02,input);assert.equal(m.phase,'aim');assert.equal(supply,m.settings.ammunition[0]);
  input.x+=20;input.y-=20;applyCanvasGesture(input,'navalDuel',anchor,b);m.update(.02,input);assert.deepEqual(m.aim,{x:140,z:10});assert.equal(m.phase,'aim');assert.equal(m.ammo[0],supply);
  input.firing=true;m.update(.02,input);assert.equal(m.phase,'shot');assert.equal(m.ammo[0],supply-1);
});
test('G2d the sea target clamps within configured range without firing',()=>{
  const b=config.navalDuel,m=make('navalDuel'),input={x:9999,y:9999,firing:false},anchor={},ammo=[...m.ammo];
  applyCanvasGesture(input,'navalDuel',anchor,b,true);m.update(.01,input);assert.deepEqual(m.aim,{x:b.targeting.maxX,z:b.targeting.maxZ});
  input.x=input.y=-9999;applyCanvasGesture(input,'navalDuel',anchor,b);m.update(.01,input);assert.deepEqual(m.aim,{x:b.targeting.minX,z:b.targeting.minZ});assert.equal(input.firing,false);assert.deepEqual(m.ammo,ammo);
});
for(let index=0;index<4;index++)test(`G2d ammunition ${index} is available without purchases, finite with no reload`,()=>{
  const m=make('navalDuel'),b=config.navalDuel,supply=m.ammo[index];assert.ok(supply>0);m.update(.02,{ammoIndex:index});assert.equal(m.ammoIndex,index);assert.equal(m.phase,'aim');
  m.update(.02,{firing:true,ammoIndex:index});if(index===3)assert.equal(m.mines.length,1);else assert.equal(m.ball.ammo,index);assert.equal(m.ammo[index],supply-1);assert.equal(m.cooldowns[index],0);m.update(.02,{ammoIndex:(index+1)%4});assert.equal(m.ammoIndex,(index+1)%4);assert.equal(m.cooldowns[index],0);assert.equal(m.cooldowns[(index+1)%4],0);
});
test('G2d enemies move in distance and position at stage one; several living ships share high stages',()=>{
  const m=make('navalDuel'),x=m.enemyX,z=m.enemies[0].z;advance(m,.8);assert.notEqual(m.enemyX,x);assert.notEqual(m.enemies[0].z,z);
  const high=make('navalDuel',10);high.update(.02,{});assert.equal(high.enemies.filter(e=>e.active&&e.hp>0).length,3);assert.equal(new Set(high.enemies.map(e=>e.kind)).size,4);
});
test('G2d ammunition needs no reload at either firing rank and later encounters have longer budgets',()=>{
  const a=make('navalDuel'),b=make('navalDuel',1,{equipment:{rate:1.6}});for(const m of [a,b])m.update(.02,{firing:true});assert.equal(a.cooldowns[0],0);assert.equal(b.cooldowns[0],0);
  for(const id of ['navalDuel','alienDefense','fireRescue'])for(let i=1;i<10;i++)assert.ok(config[id].levels[i].seconds>config[id].levels[i-1].seconds);
});
test('G2d alien stage one has a sixty-second budget with early clear, and the moving boss arrives at stage ten',()=>{
  const m=make('alienDefense'),memory={};assert.ok(m.settings.seconds>=60);
  for(let i=0;i<8000&&!m.result;i++)m.update(.04,pilotInput('alienDefense',m,config.alienDefense,memory));assert.equal(m.result?.outcome,'win');assert.ok(m.time<=m.settings.seconds+config.maxFrameSeconds);assert.ok(m.result.score<=m.settings.scoreLimit);
  for(const [i,s] of config.alienDefense.levels.entries())assert.equal(s.boss,i===9);
});
test('G2d three distinct random upgrades pause combat; a valid choice stacks and resumes exactly once',()=>{
  const m=make('alienDefense',4);nextChoice(m);assert.equal(m.choices.length,3);assert.equal(new Set(m.choices).size,3);const before=m.snapshot();advance(m,2,{firing:true});assert.deepEqual(m.snapshot(),before);
  assert.equal(m.chooseUpgrade(-1),false);assert.equal(m.chooseUpgrade(99),false);assert.equal(m.chooseUpgrade(.5),false);const id=m.choices[1],wave=m.wave;assert.equal(m.chooseUpgrade(1),true);assert.equal(m.upgrades[id],1);assert.equal(m.wave,wave+1);assert.equal(m.chooseUpgrade(1),false);
});
test('G2d formation geometry progresses through rows, V, circle and dive',()=>{
  // Isolate wave progression from the difficulty calibration covered elsewhere.
  const m=make('alienDefense',4,{power:2}),patterns=[];const memory={};
  for(let i=0;i<30000&&!m.result;i++){if(!patterns.includes(m.pattern))patterns.push(m.pattern);m.update(.04,pilotInput('alienDefense',m,config.alienDefense,memory));}assert.deepEqual(patterns,config.alienDefense.campaign.patterns);assert.equal(m.result?.outcome,'win');
});
test('G2d wing companions follow the ship and fire their own energy shots',()=>{
  const m=make('alienDefense',1,{equipment:{weapon:1}});m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:4});m.update(.001,{});m.update(.02,{firing:true});assert.equal(m.wings.filter(w=>w.active).length,1);assert.ok(m.shots.some(s=>s.damage===config.alienDefense.campaign.wingDamage));const before=m.wings[0].x;m.update(.02,{x:300});m.update(.02,{x:300});assert.ok(m.wings[0].x>before);
});
test('G2d stacked upgrades combine spread, piercing, rate and damage without erasing each other',()=>{
  const m=make('alienDefense');Object.assign(m.upgrades,{laser:1,rapid:1,damage:1,wing:2});m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:0},{x:m.player.x,y:m.player.y,vy:0,kind:4});m.update(.001,{});m.update(.02,{firing:true});assert.equal(m.shots.length,5);assert.equal(m.shots[0].kind,1);assert.equal(m.wings.filter(w=>w.active).length,2);assert.equal(Object.hasOwn(m.upgrades,'spread'),false);assert.equal(m.spreadTime,config.alienDefense.spread.seconds-.02);
});
test('G2d collectible coins/crystals and combo have real score and timeout effects',()=>{
  const m=make('alienDefense',2);m.loot.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:0},{x:m.player.x,y:m.player.y,vx:0,vy:0,kind:1});m.update(.001,{});assert.equal(m.coins,1);assert.equal(m.crystals,1);assert.equal(m.score,config.alienDefense.campaign.coinPoints+config.alienDefense.campaign.crystalPoints);
  for(let i=0;i<5;i++){const a=m.aliens[0];a.hp=1;m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,kind:0});m.update(.001,{});}assert.equal(m.combo,5);assert.ok(m.celebration>0);advance(m,config.alienDefense.campaign.comboSeconds+.1);assert.equal(m.combo,0);
});
test('G2d refill is an explicit choice: the pump restores pressure, filling away from a hydrant is blocked and stops spray',()=>{
  const m=make('fireRescue');advance(m,1,{firing:true,x:350,y:0});const water=m.water,reserve=m.reserve,pressure=m.pressure;advance(m,.3);assert.equal(m.water,water);assert.equal(m.reserve,reserve);assert.equal(m.pressure,pressure);advance(m,.3,{charge:true});assert.ok(m.pressure>pressure);advance(m,.3,{refill:true,firing:true});assert.equal(m.spraying,false);assert.equal(m.water,water);assert.equal(m.reserve,reserve);
});
test('G2d extra hose uses more water, cools faster and rescue walks to the truck',()=>{
  const a=make('fireRescue',3),b=make('fireRescue',3,{equipment:{hose:1}});for(const m of [a,b])advance(m,.2,{firing:true,x:m.flames[0].x,y:m.flames[0].y});assert.ok(b.flames[0].heat<a.flames[0].heat);assert.ok(b.water<a.water);
  parkRescue(b);const r=b.rescue;advance(b,r.seconds+.1,{rescue:true,x:r.x,y:r.y});assert.equal(r.rescued,true);const distance=Math.hypot(r.walkX-config.fireRescue.crew.truckX,r.walkY-config.fireRescue.crew.truckY);advance(b,.5);assert.ok(Math.hypot(r.walkX-config.fireRescue.crew.truckX,r.walkY-config.fireRescue.crew.truckY)<distance);
});
test('G2d v5 → v7 adds hose and permanent alien ranks and preserves city, event, currency, avatar and all earned upgrades',()=>{
  const e=createEngine(data,{storage:null,now:()=>1234}),old=JSON.parse(e.exportJSON());old.version=5;delete old.minigameEquipment.fireRescue.hose;old.minigameEquipment.navalDuel.damage=2;old.money=432;
  old.events.active={id:'event-1',typeId:'aliens',targetId:null,seed:22,phase:'playing',warningUntil:100,deferred:false};old.events.sequence=1;
  const before=structuredClone(old),r=migrateSave(old,data,e.registry);assert.equal(CURRENT_VERSION,15);assert.equal(r.ok,true);assert.equal(r.state.minigameEquipment.fireRescue.hose,0);const expected=structuredClone(before);expected.version=15;expected.minigameEquipment.fireRescue.hose=0;assert.deepEqual(r.state,expected);assert.deepEqual(old,before);assert.equal(validateSave(r.state,data,e.registry).ok,true);
});
for(const rank of [-1,1.5,99,'1'])test(`G2d v6 rejects invalid hose rank ${rank}`,()=>{
  const e=createEngine(data,{storage:null}),save=JSON.parse(e.exportJSON());save.minigameEquipment.fireRescue.hose=rank;assert.equal(migrateSave(save,data,e.registry).ok,false);
});
test('G2d all ten stages name a distinct addition in Hebrew, and upgrade/weapon labels are localized',()=>{
  for(const id of ['navalDuel','alienDefense','fireRescue']){const features=config[id].levels.map(s=>s.feature);assert.equal(new Set(features).size,10);for(const key of features)assert.ok(strings[key]);}
  for(const a of config.navalDuel.ammo)assert.ok(strings[a.title]);for(const id of config.alienDefense.campaign.choiceIds)assert.ok(strings['runUpgrade.'+id]);
});

test('G2d procedural vessels keep finite geometry, merged static materials and visible equipment',async()=>{
  const THREE=await import('../workout/island/vendor/three.module.js'),{createVessel}=await import('../workout/island/minigames/naval-view.mjs'),colors=config.navalDuel.render;
  const base=createVessel(THREE,colors),upgraded=createVessel(THREE,colors,{shield:2,hull:1.3,rate:1.4,damage:1.4,ammo:2});
  assert.equal(base.shield.visible,false);assert.equal(upgraded.shield.visible,true);assert.ok(base.root.children[0].children.length<=8,'static parts merge by material');
  let baseVertices=0,upgradedVertices=0;
  for(const [v,high]of [[base,false],[upgraded,true]])v.root.traverse(o=>{if(!o.isMesh)return;for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));if(high)upgradedVertices+=o.geometry.attributes.position.count;else baseVertices+=o.geometry.attributes.position.count;});
  assert.ok(upgradedVertices>baseVertices);base.dispose();upgraded.dispose();
});
test('G2d naval round/time limits cannot silently award undefeated ships',()=>{
  const b=structuredClone(config.navalDuel);b.levels[0].seconds=.01;const m=make('navalDuel',1,{balance:b});m.update(.02,{});advance(m,b.sinkSeconds+.1);assert.equal(m.result?.outcome,'lose');assert.equal(m.enemyLives,m.enemyShip.maxHp);
});

test('G2d later fire stages add a second/third civilian and wind affects the actual spray impact',()=>{
  assert.equal(make('fireRescue',1).rescues.length,0);assert.equal(make('fireRescue',2).rescues.length,0);assert.equal(make('fireRescue',3).rescues.length,1);assert.equal(make('fireRescue',6).rescues.length,2);const m=make('fireRescue',10);assert.equal(m.rescues.length,3);assert.equal(m.rescue,m.rescues[0]);advance(m,.4,{x:180,y:250,firing:true});assert.notEqual(m.impact.x,m.aim.x);assert.ok(Math.hypot(m.impact.x-config.fireRescue.nozzleX,m.impact.y-config.fireRescue.nozzleY)<=m.range+.001);
});
test('G2d late bosses fire a separate moving three-bolt fan',()=>{
  const balance=structuredClone(config.alienDefense);Object.assign(balance.levels[0],{waves:1,boss:true,bossShots:2});const m=make('alienDefense',1,{balance,random:()=>.999});advance(m,balance.formation.entrySeconds+.02);assert.equal(m.bolts.length,3);assert.ok(m.bolts.some(b=>b.vx!==0));
});
test('G2d concurrently visible naval enemies fire on independent timers',()=>{const b=config.navalDuel,m=make('navalDuel',10),supply=[...m.ammo];advance(m,b.combat.enemyFireSeconds+b.combat.enemyStagger*2+.1);for(const e of m.enemies.filter(e=>e.active))assert.ok(e.fired>=1);assert.deepEqual(m.ammo,supply);assert.ok(m.enemyFired>=3);});
test('G2d longer alien rounds preserve earned score while bounding their coin payout',()=>{
  const e=createEngine(data,{storage:null}),b=config.alienDefense,s=b.levels[0],result=e.registry.minigames.get('alienDefense').onResult({outcome:'win',score:s.scoreLimit,performance:1},{engine:e,config,level:1});assert.ok(result);assert.equal(result.score,s.scoreLimit);assert.equal(result.money,Math.floor(s.rewardScoreLimit/b.pointsPerCoin)+s.winMoney);assert.equal(result.stars,3);
});

test('G2d repeat laser choices increase piercing while spread stays temporary and equipped wings are not offered',()=>{
  const a=make('alienDefense'),b=make('alienDefense');a.upgrades.laser=1;b.upgrades.laser=2;for(const m of [a,b]){m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:0});m.update(.001,{});m.update(.02,{firing:true});}assert.equal(a.shots.length,3);assert.equal(b.shots.length,3);assert.ok(b.shots[0].hp>a.shots[0].hp);assert.equal(a.spreadTime,config.alienDefense.spread.seconds-.02);assert.equal(b.spreadTime,config.alienDefense.spread.seconds-.02);assert.equal(Object.hasOwn(b.upgrades,'spread'),false);
  const equipped=make('alienDefense',1,{equipment:{weapon:2}});nextChoice(equipped);assert.equal(equipped.choices.includes('wing'),false);
});

test('G2d fully upgraded naval hull and weapons can settle a long fleet victory',()=>{
  const b=config.navalDuel,equipment=Object.fromEntries(Object.entries(b.equipment).map(([id,track])=>[id,track.levels.at(-1).value])),m=make('navalDuel',10,{power:1.45,equipment}),memory={};
  for(let i=0;i<20000&&!m.result;i++)m.update(.04,pilotInput('navalDuel',m,b,memory));assert.equal(m.result?.outcome,'win');assert.ok(m.score<=b.maximumScore);
  const e=createEngine(data,{storage:null}),result=e.registry.minigames.get('navalDuel').onResult(m.result,{engine:e,config,level:10});assert.ok(result,'a legitimate upgraded victory must pass score validation');assert.ok(result.stars>=1);
});

function parkRescue(m){const b=config.fireRescue,r=m.rescue;Object.assign(m.truck,{x:r.world[0],z:r.world[2],targetX:r.world[0],targetZ:r.world[2]});m.flames[r.fireIndex].heat=Math.min(m.flames[r.fireIndex].heat,b.rescue.safeHeat/2);m.update(.001,{});return m;}
