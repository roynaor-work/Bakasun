import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames;
function alien(overrides={}){const balance=structuredClone(config.alienDefense);Object.assign(balance.levels[0],{alienSpeed:0,drop:0,boltSeconds:999,seconds:6,waves:1,lives:999},overrides);return createAlienModel({config,balance,level:1,random:seededRandom(12)});}
function kill(m){let guard=200;while(m.aliens.length&&!m.result&&guard--){const a=m.aliens[0];m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage:10000,kind:0});m.update(.00001,{});}assert.ok(guard>0);}
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds/.02)&&!m.result;i++)m.update(.02,{});}
for(const boss of [false,true])test(`G2e final wave cleared with six seconds left completes immediately (boss=${boss})`,()=>{const m=alien({boss});kill(m);assert.equal(m.aliens.length,0);assert.equal(m.result?.outcome,'win');assert.ok(m.remaining>5);});
for(const boss of [false,true])test(`G2e timer completion with living enemies terminates (boss=${boss})`,()=>{const m=alien({boss});advance(m,6.1);assert.equal(m.result?.outcome,'win');});
test('G2e an empty intermediate wave stays empty until its deadline, then offers one upgrade',()=>{const m=alien({waves:2});kill(m);advance(m,1);assert.equal(m.aliens.length,0);assert.equal(m.choosing,false);advance(m,2.1);assert.equal(m.choosing,true);const wave=m.wave;assert.equal(m.chooseUpgrade(0),true);assert.equal(m.wave,wave+1);assert.equal(m.chooseUpgrade(0),false);kill(m);assert.equal(m.result?.outcome,'win');});
for(const route of ['clear','timer'])test(`G2e ${route} result passes the engine contract and grants stars, prize and next stage once`,()=>{const e=createEngine(data,{storage:null}),m=alien();if(route==='clear')kill(m);else advance(m,6.1);assert.ok(m.result);let result,finish;const game=e.registry.minigames.get('alienDefense');e.registry.minigames.set('alienDefense',{...game,start:ctx=>{finish=ctx.finish;return {dispose(){}};}});const money=e.state.money;const run=e.startMinigame('alienDefense',{level:1,onFinish:r=>{result=r;}});assert.equal(run.ok,true);finish(m.result);assert.ok(result.stars>=1);assert.ok(result.money>0);assert.equal(e.state.money,money+result.money);assert.equal(e.state.minigameProgress.alienDefense.stage,2);assert.equal(finish(m.result).ok,false);});

import {DATA_VERSION,dataURL} from '../workout/island/release.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';
import {applyCanvasGesture} from '../workout/island/minigames/canvas-session.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {localModelURL} from '../workout/island/minigames/model-art.mjs';
const naval=(level=1,extra={})=>createNavalModel({config,balance:config.navalDuel,level,random:seededRandom(12),...extra});
const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
test('G2e every bundled JSON request, including episode files and manifests, carries the release version',async()=>{
  const urls=[];await loadData(new URL('../workout/island/',import.meta.url),async url=>{urls.push(url);return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};});
  assert.ok(urls.length>14);for(const url of urls)assert.equal(url.searchParams.get('v'),DATA_VERSION);
  assert.equal(dataURL('data/strings.he.json').searchParams.get('v'),DATA_VERSION);
  const html=await readFile(new URL('../workout/island/index.html',import.meta.url),'utf8');assert.ok(html.includes('app.mjs?v='+DATA_VERSION));assert.ok(html.includes('styles.css?v='+DATA_VERSION));
});
test('G2e missing t() is an error, never a raw key; all game literal and dynamic keys exist',async()=>{
  const errors=[],t=createTranslator(strings,id=>errors.push(id));assert.equal(t('minigame.missing'),'…');assert.equal(t('minigame.missing'),'…');assert.deepEqual(errors,['minigame.missing','minigame.missing']);
  const keys=['minigame.waveClock','minigame.combo','minigame.loot',...config.alienDefense.pickups.kinds.map(k=>'powerup.'+k),...config.alienDefense.campaign.choiceIds.map(k=>'runUpgrade.'+k),...config.alienDefense.campaign.patterns.map(k=>'pattern.'+k),...config.navalDuel.ammo.map(a=>a.title),...config.navalDuel.shipTypes.map(a=>a.name)];
  for(const file of ['ui/activity.mjs','minigames/canvas-session.mjs']){const source=await readFile(new URL('../workout/island/'+file,import.meta.url),'utf8');for(const [,key]of source.matchAll(/\bt\('([^']+)'[),]/g))keys.push(key);}
  for(const key of keys)assert.ok(Object.hasOwn(strings,key),key);assert.match(t('minigame.waveClock',{seconds:6,pattern:'שורות'}),/6/);
});
test('G2e bonus every ten kills, exactly one on screen, queued thresholds and configurable rotation',()=>{
  const m=alien({waves:2,rows:1,columns:45,seconds:999,boss:false}),b=config.alienDefense;assert.equal(m.settings.killsPerBonus,10);const rotation=[];for(const a of m.aliens)a.baseX=a.x=180;
  for(let i=1;i<=40;i++){
    const a=m.aliens[0];m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage:10000,kind:0});m.update(.00001,{});
    assert.equal(m.snapshot().kills,i);assert.ok(m.pickups.length<=1);
    if(i%10===0){assert.equal(m.pickups.length,1);rotation.push(m.pickups[0].kind);if(i===10){continue;}}
    if(i===20){assert.equal(m.snapshot().pendingBonuses,1);const d=m.pickups[0];d.x=m.player.x;d.y=m.player.y;m.update(.00001,{});rotation.push(m.pickups[0].kind);}
    if(i===20||i===30||i===40){const d=m.pickups[0];d.x=m.player.x;d.y=m.player.y;m.update(.00001,{});}
  }
  // Ten and twenty initially show the same first capsule; the queued second
  // appears immediately after collection, without losing a threshold.
  assert.deepEqual(rotation,[b.pickups.rotation[0],b.pickups.rotation[0],...b.pickups.rotation.slice(1)]);
  assert.equal(m.snapshot().bonusesDropped,4);assert.ok(config.alienDefense.levels.some(s=>s.killsPerBonus!==10));
  const custom=alien({killsPerBonus:12,rows:1,columns:20,waves:2,seconds:999,boss:false});for(const a of custom.aliens)a.baseX=a.x=180;for(let i=1;i<=12;i++){const a=custom.aliens[0];custom.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage:10000,kind:0});custom.update(.00001,{});assert.equal(custom.pickups.length,i<12?0:1);}
});
test('G2e regular aliens never drop currency; special aliens and bosses do, with a bounded pool',()=>{
  const m=alien({waves:2,boss:false});kill(m);assert.equal(m.loot.length,0);
  const special=alien({waves:2,boss:true,enemyKinds:5});kill(special);assert.ok(special.loot.length>0);assert.ok(special.loot.length<=config.alienDefense.campaign.maxLoot);
});
test('G2e yaw and elevation axes clamp independently, preserve force and never fire on drag',()=>{
  const b=config.navalDuel,input={x:100,y:100,yaw:0,angle:45,power:37,firing:false},anchor={};applyCanvasGesture(input,'navalDuel',anchor,b,true);input.x=10000;applyCanvasGesture(input,'navalDuel',anchor,b);assert.equal(input.yaw,90);assert.equal(input.angle,45);input.x=-10000;input.y=-10000;applyCanvasGesture(input,'navalDuel',anchor,b);assert.equal(input.yaw,-90);assert.equal(input.angle,90);input.y=10000;applyCanvasGesture(input,'navalDuel',anchor,b);assert.equal(input.angle,0);assert.equal(input.power,37);assert.equal(input.firing,false);
});
test('G2e torpedo ignores elevation, respects yaw, and unavailable selected weapons do not fire',()=>{
  const m=naval();m.update(.01,{ammoIndex:2,yaw:30,angle:88,firing:true});assert.equal(m.ball.vy,0);assert.ok(m.ball.vz>0);assert.ok(Math.abs(m.ball.vz/m.ball.vx-Math.tan(Math.PI/6))<1e-8);assert.equal(m.aim.angle,config.navalDuel.defaultAngle);
  const empty=naval();empty.ammo[1]=0;empty.update(.01,{ammoIndex:1,firing:true});assert.equal(empty.phase,'aim');assert.equal(empty.ammoIndex,1);assert.equal(empty.ammo[0],config.navalDuel.ammo[0].charges);
  const reload=naval();reload.cooldowns[2]=5;reload.update(.01,{ammoIndex:2,firing:true});assert.equal(reload.phase,'aim');assert.equal(reload.ammo[2],config.navalDuel.ammo[2].charges);
});
test('G2e yaw can hit a concurrent second ship; sinking it leaves the first alive and advances only on fleet defeat',()=>{
  const b=config.navalDuel,m=naval(10,{equipment:{damage:100}});m.update(.01,{ammoIndex:2,yaw:Math.atan2(b.combat.laneSpacing,b.enemyX-b.shipX)*180/Math.PI,firing:true});const first=m.enemies[0].hp;advance(m,2);assert.equal(m.enemies[0].hp,first);assert.equal(m.enemies[1].hp,0);advance(m,b.sinkSeconds+.1);assert.equal(m.result,undefined);assert.equal(m.wave,1);assert.equal(m.phase,'aim');m.update(.01,{});assert.equal(m.enemies.filter(e=>e.active&&e.hp>0).length,3);
});
test('G2e each naval ship class has independent speed, armament, hull shape and HP',()=>{const m=naval(10),types=config.navalDuel.shipTypes;assert.equal(new Set(types.map(t=>t.speed)).size,3);assert.equal(new Set(types.map(t=>t.attack)).size,3);assert.equal(new Set(types.map(t=>t.beam+':'+t.length)).size,3);advance(m,.5);const fleet=m.enemies.filter(e=>e.active);assert.equal(fleet.length,3);assert.equal(new Set(fleet.map(e=>e.maxHp)).size,3);});
test('G2e optional model paths stay inside the published island and retain code fallback when absent',()=>{
  for(const p of [null,undefined,'https://example.com/a.glb','../outside.glb','assets/a.png'])assert.equal(localModelURL(p),null);assert.ok(localModelURL('assets/kid-full.glb').pathname.endsWith('/assets/kid-full.glb'));assert.equal(localModelURL('assets/kid-full.glb').searchParams.get('v'),DATA_VERSION);assert.equal(config.alienDefense.models.player,null);
});
test('G2e temporary wing expires and a nova capsule replenishes a real charge',()=>{
  const m=alien({seconds:99}),b=config.alienDefense,charges=m.novaCharges;
  m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:4});m.update(.001,{});m.update(.001,{});assert.equal(m.wings.filter(w=>w.active).length,1);advance(m,b.pickups.seconds+.1);assert.equal(m.wings.filter(w=>w.active).length,0);
  m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:5});m.update(.001,{});assert.equal(m.novaCharges,charges+1);
});
test('G2e all vessel factories create distinct finite hulls and actual turret counts',async()=>{
  const THREE=await import('../workout/island/vendor/three.module.js'),{createVessel}=await import('../workout/island/minigames/naval-view.mjs'),b=config.navalDuel,lengths=[],turrets=[];
  for(const type of [...b.shipTypes,b.boss]){const v=createVessel(THREE,b.render,{},type),bounds=new THREE.Box3().setFromObject(v.root.children[0]);lengths.push(Math.round((bounds.max.z-bounds.min.z)*100));turrets.push(v.turret.children.length);v.root.traverse(o=>{if(o.geometry)for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));});v.dispose();}
  assert.equal(new Set(lengths).size,4);assert.equal(new Set(turrets).size,4);
});
