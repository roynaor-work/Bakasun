import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames;
function alien(overrides={},options={}){const {level=1,completion='waves',roundChoices=false,...extra}=options,balance=structuredClone(config.alienDefense),settings=balance.levels[level-1];Object.assign(settings,{alienSpeed:0,drop:0,boltSeconds:999,seconds:6,waves:1,lives:999},overrides);if(settings.boss&&!settings.bossLives)settings.bossLives=config.alienDefense.levels.find(s=>s.boss).bossLives;return createAlienModel({config,balance,level,random:seededRandom(12),completion,roundChoices,...extra});}
function killOne(m){const a=m.aliens[0];m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage:10000,kind:0});m.update(.00001,{});}
function kill(m){let guard=10000;while(m.aliens.length&&!m.result&&guard--){const a=m.aliens[0];if(a.boss&&(a.entry>0||a.guardActive))m.update(.02,{});else killOne(m);}assert.ok(guard>0);}
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds/.02)&&!m.result;i++)m.update(.02,{});}
for(const boss of [false,true])test(`G2e final wave clears immediately after its real boss guards, with six seconds left (boss=${boss})`,()=>{const seconds=boss?2+config.alienDefense.balance.minBossSeconds+6.5:6,m=alien({boss,seconds});assert.equal(m.aliens.some(a=>a.boss),boss);kill(m);assert.equal(m.aliens.length,0);assert.equal(m.result?.outcome,'win');assert.ok(m.remaining>6-.1);if(boss)assert.ok(m.time>=2+config.alienDefense.balance.minBossSeconds);});
for(const boss of [false,true])test(`G2e campaign timeout with living enemies loses and preserves the undefeated fleet (boss=${boss})`,()=>{const m=alien({boss});assert.equal(m.aliens.some(a=>a.boss),boss);advance(m,6.1);assert.equal(m.result?.outcome,'lose');assert.ok(m.aliens.length>0);if(boss)assert.ok(m.aliens.some(a=>a.boss&&a.hp>0));});
// 25/10/2026 archery aiming: a sea point solves real turret settings; the aim is the predicted landing.
const near=(a,b,eps=.5)=>assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<eps,JSON.stringify({a,b}));
test('G2e explicit legacy survival completes only a non-boss clock, while a live boss still loses',()=>{for(const boss of [false,true]){const m=alien({boss},{completion:'survival'});advance(m,6.1);assert.equal(m.result?.outcome,boss?'lose':'win');}});
test('G2e an empty intermediate wave offers one upgrade within the short G2f pause',()=>{const m=alien({waves:2},{roundChoices:true});kill(m);advance(m,.1);assert.equal(m.aliens.length,0);assert.equal(m.choosing,false);advance(m,config.alienDefense.wavePauseSeconds+.02);assert.ok(m.time<1.5);assert.equal(m.choosing,true);const wave=m.wave;assert.equal(m.chooseUpgrade(0),true);assert.equal(m.wave,wave+1);assert.equal(m.chooseUpgrade(0),false);kill(m);assert.equal(m.result?.outcome,'win');});
for(const route of ['clear','timeout'])test(`G2e ${route} result settles once through the engine; only a win grants stars and unlocks the next stage`,()=>{const e=createEngine(data,{storage:null}),m=alien();if(route==='clear')kill(m);else advance(m,6.1);assert.equal(m.result?.outcome,route==='clear'?'win':'lose');let result,finish;const game=e.registry.minigames.get('alienDefense');e.registry.minigames.set('alienDefense',{...game,start:ctx=>{finish=ctx.finish;return {dispose(){}};}});e.state.buildings.push({id:'airbase-test',typeId:'airbase',x:12,z:0,level:1});const money=e.state.money;const run=e.startMinigame('alienDefense',{level:1,onFinish:r=>{result=r;}});assert.equal(run.ok,true);assert.equal(finish(m.result).ok,true);if(route==='clear'){assert.ok(result.stars>=1);assert.ok(result.money>0);assert.equal(e.state.minigameProgress.alienDefense.stage,2);}else{assert.equal(result.stars,0);assert.equal(result.money,0);assert.equal(e.state.minigameProgress.alienDefense.stage,1);}assert.equal(e.state.money,money+result.money);const settled=structuredClone(e.state);assert.equal(finish(m.result).ok,false);assert.deepEqual(e.state,settled);});

import {DATA_VERSION,dataURL} from '../workout/island/release.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';
import {applyCanvasGesture} from '../workout/island/minigames/canvas-session.mjs';
import {createNavalModel,navalLead} from '../workout/island/minigames/naval.mjs';
import {localModelURL} from '../workout/island/minigames/model-art.mjs';
const naval=(level=1,extra={})=>createNavalModel({config,balance:config.navalDuel,level,random:seededRandom(12),...extra});
const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
test('G2e every bundled JSON request, including episode files and manifests, carries the release version',async()=>{
  const urls=[];await loadData(new URL('../workout/island/',import.meta.url),async url=>{urls.push(url);return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};});
  assert.ok(urls.length>14);for(const url of urls)assert.equal(url.searchParams.get('v'),DATA_VERSION);
  assert.equal(dataURL('data/strings.he.json').searchParams.get('v'),DATA_VERSION);
  for(const file of ['app.mjs','engine/load-data.mjs','ui/activity.mjs','minigames/canvas-session.mjs','minigames/aliens.mjs','minigames/fire.mjs','minigames/naval.mjs','minigames/naval-view.mjs','minigames/model-art.mjs','extensions/alien-defense.mjs','extensions/fire-rescue.mjs','extensions/naval-duel.mjs']){const source=await readFile(new URL('../workout/island/'+file,import.meta.url),'utf8');for(const [,version]of source.matchAll(/\.mjs\?v=([^'"]+)/g))assert.equal(version,DATA_VERSION,file);}
  const app=await readFile(new URL('../workout/island/app.mjs',import.meta.url),'utf8');assert.ok(app.includes('load-data.mjs?v='+DATA_VERSION));
  const html=await readFile(new URL('../workout/island/index.html',import.meta.url),'utf8');assert.ok(html.includes('app.mjs?v='+DATA_VERSION));assert.ok(html.includes('styles.css?v='+DATA_VERSION));
});
test('G2e missing t() is an error, never a raw key; all game literal and dynamic keys exist',async()=>{
  const errors=[],t=createTranslator(strings,id=>errors.push(id));assert.equal(t('minigame.missing'),'…');assert.equal(t('minigame.missing'),'…');assert.deepEqual(errors,['minigame.missing','minigame.missing']);
  const keys=['minigame.waveClock','minigame.combo','minigame.loot',...config.alienDefense.pickups.kinds.map(k=>'powerup.'+k),...config.alienDefense.campaign.choiceIds.map(k=>'runUpgrade.'+k),...config.alienDefense.campaign.patterns.map(k=>'pattern.'+k),...config.navalDuel.ammo.map(a=>a.title),...config.navalDuel.shipTypes.map(a=>a.name)];
  for(const file of ['ui/activity.mjs','minigames/canvas-session.mjs']){const source=await readFile(new URL('../workout/island/'+file,import.meta.url),'utf8');for(const [,key]of source.matchAll(/\bt\('([^']+)'[),]/g))keys.push(key);}
  for(const key of keys)assert.ok(Object.hasOwn(strings,key),key);assert.match(t('minigame.waveClock',{seconds:6,pattern:'שורות'}),/6/);
});
test('G2e every kill threshold queues one capsule, cycles all six kinds and wraps across a real wave',()=>{
  const m=alien({waves:2,rows:8,columns:6,seconds:999,boss:false,enemyKinds:1,enemyRoster:[0]}),b=config.alienDefense;assert.equal(m.settings.killsPerBonus,10);const rotation=[];
  for(let i=1;i<=70;i++){
    if(!m.aliens.length)advance(m,b.wavePauseSeconds+.02);
    killOne(m);
    assert.equal(m.snapshot().kills,i);assert.ok(m.pickups.length<=1);
    if(i%10===0){assert.equal(m.pickups.length,1);rotation.push(m.pickups[0].kind);if(i===10){continue;}}
    if(i===20){assert.equal(m.snapshot().pendingBonuses,1);const d=m.pickups[0];d.x=m.player.x;d.y=m.player.y;m.update(.00001,{});rotation.push(m.pickups[0].kind);}
    if(i%10===0&&i>=20){const d=m.pickups[0];d.x=m.player.x;d.y=m.player.y;m.update(.00001,{});}
  }
  // Ten and twenty initially show the same first capsule; the queued second
  // appears immediately after collection, without losing a threshold.
  assert.deepEqual(rotation,[b.pickups.rotation[0],...b.pickups.rotation,b.pickups.rotation[0]]);
  assert.equal(m.wave,2);assert.equal(m.snapshot().bonusesDropped,7);assert.equal(m.snapshot().pendingBonuses,0);assert.equal(m.pickups.length,0);assert.ok(config.alienDefense.levels.some(s=>s.killsPerBonus!==10));
  const custom=alien({killsPerBonus:12,rows:4,columns:5,waves:2,seconds:999,boss:false,enemyKinds:1,enemyRoster:[0]});for(let i=1;i<=12;i++){killOne(custom);assert.equal(custom.pickups.length,i<12?0:1);}
});
test('G2e regular aliens never drop currency; special aliens and bosses do, with a bounded pool',()=>{
  const m=alien({waves:2,boss:false,enemyKinds:1,enemyRoster:[0]});kill(m);assert.equal(m.loot.length,0);
  const special=alien({waves:2,rows:8,columns:6,boss:false,enemyKinds:1,enemyRoster:[1]});kill(special);assert.equal(special.loot.length,Math.min(48,config.alienDefense.campaign.maxLoot));assert.ok(special.loot.every(d=>d.kind===0));
  const carrier=alien({rows:1,columns:1,boss:false,enemyKinds:1,enemyRoster:[4]});kill(carrier);assert.equal(carrier.loot.length,1);assert.equal(carrier.loot[0].kind,1);
  const boss=alien({rows:0,columns:0,boss:true,seconds:30});assert.ok(boss.aliens[0].boss);kill(boss);assert.equal(boss.result?.outcome,'win');assert.equal(boss.loot.length,1);assert.equal(boss.loot[0].kind,1);
});
test('G2e dragging supplies one target and never fires or consumes ammunition',()=>{
  const b=config.navalDuel,m=naval(),input={x:100,y:100,firing:false},anchor={},ammo=[...m.ammo];
  applyCanvasGesture(input,'navalDuel',anchor,b,true);assert.deepEqual([input.targetX,input.targetZ],[100,100]);
  input.x=250;input.y=-30;applyCanvasGesture(input,'navalDuel',anchor,b);m.update(.01,input);
  near(m.aim,{x:250,z:-30});assert.equal(input.firing,false);assert.equal(m.phase,'aim');assert.deepEqual(m.ammo,ammo);
});
test('G2e torpedo follows the selected sea point with brief recovery; an empty weapon cannot fire',()=>{
  const m=naval();m.update(.01,{ammoIndex:2,targetX:240,targetZ:45,firing:true});advance(m,.1);assert.equal(m.ball.y,config.navalDuel.shipY);assert.equal(m.ball.launch.kind,'water');assert.ok(m.ball.z>0);near({x:m.ball.targetX,z:m.ball.targetZ},{x:240,z:45});
  const empty=naval();empty.ammo[1]=0;empty.update(.01,{ammoIndex:1,firing:true});assert.equal(empty.phase,'aim');assert.equal(empty.ammoIndex,1);assert.equal(empty.ammo[0],config.navalDuel.levels[0].ammunition[0]);
  const ready=naval(),supply=ready.ammo[2];assert.equal(ready.cooldowns[2],0);ready.update(.01,{ammoIndex:2,firing:true});assert.equal(ready.phase,'shot');assert.equal(ready.ammo[2],supply-1);assert.ok(ready.cooldowns[2]>0&&ready.cooldowns[2]<=1);advance(ready,1.1);assert.equal(ready.cooldowns[2],0);
});
test('G2e the target circle can hit a concurrent second ship; sinking it leaves the first alive and advances only on fleet defeat',()=>{
  const b=config.navalDuel,m=naval(10,{equipment:{damage:100}});advance(m,.1);const point=navalLead(m.playerShip,m.enemies[1],b,2);m.update(.01,{ammoIndex:2,targetX:point.x,targetZ:point.z,firing:true});const first=m.enemies[0].hp;advance(m,2);assert.equal(m.enemies[0].hp,first);assert.equal(m.enemies[1].hp,0);advance(m,b.sinkSeconds+.1);assert.equal(m.result,undefined);assert.equal(m.wave,1);assert.equal(m.phase,'aim');m.update(.01,{});assert.equal(m.enemies.filter(e=>e.active&&e.hp>0).length,3);
});
test('G2e each naval ship class has independent speed, armament, hull shape and HP',()=>{const m=naval(10),types=config.navalDuel.shipTypes;assert.equal(new Set(types.map(t=>t.speed)).size,4);assert.equal(new Set(types.map(t=>t.attack)).size,4);assert.equal(new Set(types.map(t=>t.beam+':'+t.length)).size,4);advance(m,.5);const fleet=m.enemies.filter(e=>e.active);assert.equal(fleet.length,3);assert.equal(new Set(fleet.map(e=>e.maxHp)).size,3);});
test('G2e optional model paths stay inside the published island and retain code fallback when absent',()=>{
  for(const p of [null,undefined,'https://example.com/a.glb','../outside.glb','assets/a.png'])assert.equal(localModelURL(p),null);assert.ok(localModelURL('assets/kid-full.glb').pathname.endsWith('/assets/kid-full.glb'));assert.equal(localModelURL('assets/kid-full.glb').searchParams.get('v'),DATA_VERSION);assert.equal(config.alienDefense.models.player.path,'assets/models/ship-player.glb');
});
test('G2e temporary wing expires and a nova capsule replenishes a real charge',()=>{
  const m=alien({seconds:99}),b=config.alienDefense,charges=m.novaCharges;
  m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:4});m.update(.001,{});m.update(.001,{});assert.equal(m.wings.filter(w=>w.active).length,1);advance(m,b.pickups.seconds+.1);assert.equal(m.wings.filter(w=>w.active).length,0);
  m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:3});m.update(.001,{});m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:5});m.update(.001,{});assert.equal(m.novaCharges,charges+1);assert.equal(m.powerup,3,'a single-use nova does not replace a timed shield');assert.ok(m.powerTime>0);
});
test('G2e all vessel factories create distinct finite hulls and actual turret counts',async()=>{
  const THREE=await import('../workout/island/vendor/three.module.js'),{createVessel}=await import('../workout/island/minigames/naval-view.mjs'),b=config.navalDuel,lengths=[],turrets=[];
  for(const type of [...b.shipTypes,b.boss]){const v=createVessel(THREE,b.render,{},type),bounds=new THREE.Box3().setFromObject(v.root.children[0]);lengths.push(Math.round((bounds.max.z-bounds.min.z)*100));turrets.push(v.turret.children.length);v.root.traverse(o=>{if(o.geometry)for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));});v.dispose();}
  assert.equal(new Set(lengths).size,5);assert.equal(new Set(turrets).size,4);
});
test('G2e timer expiry takes precedence when an empty intermediate wave would open an upgrade in the same frame',()=>{
  for(const completion of ['waves','survival']){const balance=structuredClone(config.alienDefense);Object.assign(balance.levels[0],{rows:0,columns:0,waves:2,seconds:6});balance.wavePauseSeconds=6;
   const m=createAlienModel({config,balance,level:1,random:seededRandom(12),completion});advance(m,6.1);assert.equal(m.result?.outcome,completion==='waves'?'lose':'win');assert.equal(m.choosing,false);
  }
});
