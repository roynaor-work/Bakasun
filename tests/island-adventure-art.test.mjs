import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {createNavalModel,navalHullContact} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createNavalProjectiles} from '../workout/island/minigames/naval-projectiles.mjs';
import {createNavalImpacts} from '../workout/island/minigames/naval-impacts.mjs';
import {surfaceTexture,createSpaceBackdrop} from '../workout/island/presentation/surfaces.mjs';
import {watchRelease} from '../workout/island/ui/release-watch.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';
import {Environment} from '../workout/island/view/environment.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames,balance=config.navalDuel,make=()=>createNavalModel({config,balance,level:1,random:seededRandom(17)});

test('combat art draws actual player and enemy shots, keeps simulation intact and releases batches once',()=>{
 const model=make(),scene=new T.Scene(),camera=new T.PerspectiveCamera(),art=createNavalProjectiles(scene,model,balance);
 model.update(.016,{ammoIndex:1});model.update(.016,{firing:true});assert.ok(model.ball.active);const before=JSON.stringify(model.snapshot());art.update(camera);assert.equal(art.metrics().guided,1);assert.ok(art.metrics().trailParticles>=8);assert.equal(JSON.stringify(model.snapshot()),before);
 model.enemyShots.push({x:200,z:20,fromX:340,fromZ:20,targetX:60,targetZ:0,age:.3,duration:.6,kind:2});art.update(camera);assert.equal(art.metrics().torpedoes,1);
 const matrix=new T.Matrix4();for(const mesh of scene.children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
 for(let i=0;i<100;i++)model.extraShots.push({...model.ball,ammo:0});art.update(camera);const m=art.metrics();assert.ok(m.shells+m.guided+m.torpedoes<=m.capacity);assert.ok(m.trailParticles<=m.capacity*10);
 let disposals=0;for(const mesh of scene.children)mesh.geometry.addEventListener('dispose',()=>disposals++);art.dispose();art.dispose();assert.equal(scene.children.length,0);assert.equal(disposals,4);
});
test('impact art follows actual hit state and expires, with finite transforms and no model mutation',()=>{
 const model=make(),scene=new T.Scene(),art=createNavalImpacts(scene,model,config,balance);art.update();assert.equal(art.metrics().particles,0);
 Object.assign(model.blast,{life:config.visuals.blastSeconds*.65,x:340,z:12,hit:true});const before=JSON.stringify(model.snapshot());art.update();assert.equal(art.metrics().particles,32);assert.equal(JSON.stringify(model.snapshot()),before);
 model.blast.life=0;art.update();assert.equal(art.metrics().particles,0);art.dispose();art.dispose();assert.equal(scene.children.length,0);
});
test('farther starting fleet stays visible, targetable and lockable',()=>{
 const model=make(),enemy=model.enemies[0];
 assert.equal(balance.enemyX-balance.shipX,280);assert.ok(balance.enemyX<balance.targeting.maxX);
 const point=model.screenPoint(enemy.x,enemy.z),water=model.targetAt(point.x,point.y);
 assert.ok(point.depth>0&&point.x>0&&point.x<config.width&&point.y>0&&point.y<config.height);
 assert.ok(Math.abs(water.x-enemy.x)<1e-9&&Math.abs(water.z-enemy.z)<1e-9);
 model.beginAim(enemy.index);assert.equal(model.lockedTargetIndex,enemy.index);assert.ok(model.lockedTarget.hp>0);
});

test('real shells that miss every hull land exactly at the calculated wind-adjusted water point',()=>{
 for(const seed of [0,17,93])for(const dt of [.01,.02,.05]){
  const model=createNavalModel({config,balance,level:1,seed,random:seededRandom(seed)}),point={x:65,z:150};
  const flight=balance.targeting.flightSeconds+Math.hypot(point.x-model.playerShip.x,point.z-model.playerShip.z)*balance.targeting.secondsPerRange;
  const drift=balance.aim.wind.driftScale*balance.aim.wind.difficultyMin*flight*flight;
  const expected={x:point.x+model.wind.x*drift,z:point.z+model.wind.z*drift},hp=model.enemies.map(e=>e.hp);
  model.update(dt,{targetX:point.x,targetZ:point.z,firing:true});
  assert.ok(model.ball.active);assert.equal(model.ball.duration,flight);
  assert.equal(model.ball.targetX,expected.x);assert.equal(model.ball.targetZ,expected.z);
  for(let i=0;i<200&&model.ball.active;i++)model.update(dt,{});
  assert.equal(model.ball.active,false);assert.equal(model.ball.age,flight);
  assert.equal(model.ball.x,expected.x);assert.equal(model.ball.z,expected.z);
  assert.equal(model.blast.x,expected.x);assert.equal(model.blast.z,expected.z);
  assert.equal(model.blast.hit,false);assert.equal(model.snapshot().hits,0);assert.equal(model.fired,1);
  assert.deepEqual(model.enemies.map(e=>e.hp),hp);
 }
});

test('real shells hitting a hull explode at the calculated contact point and apply damage once',()=>{
 for(const dt of [.01,.02,.05]){
  const model=make(),enemy=model.enemies[0],hp=enemy.hp;
  model.update(dt,{firing:true});assert.ok(model.ball.active);const launched={...model.ball};let previous;
  // Freeze the ballistic endpoint: a hull collision replaces the live target
  // with its earlier contact point so the rendered blast follows the impact.
  for(let i=0;i<200&&model.ball.active;i++){previous={x:model.ball.x,z:model.ball.z};model.update(dt,{});}
  assert.equal(model.ball.active,false);assert.ok(model.ball.age>launched.duration*.8&&model.ball.age<launched.duration);
  const u=model.ball.age/launched.duration;
  const expected={x:launched.fromX+(launched.targetX-launched.fromX)*u-launched.windOffsetX*u*(1-u),z:launched.fromZ+(launched.targetZ-launched.fromZ)*u-launched.windOffsetZ*u*(1-u)};
  assert.equal(model.ball.x,expected.x);assert.equal(model.ball.z,expected.z);
  assert.equal(model.blast.x,expected.x);assert.equal(model.blast.z,expected.z);
  assert.notEqual(model.blast.x,launched.targetX);assert.equal(model.ball.victim,enemy.index);
  assert.equal(navalHullContact(previous,previous,enemy,balance),false);
  assert.equal(navalHullContact(previous,model.ball,enemy,balance),true);
  assert.equal(model.blast.hit,true);assert.equal(model.snapshot().hits,1);assert.equal(model.fired,1);
  const damage=model.settings.damage*balance.ammo[0].damage*(1+(model.settings.weaponLevel-1)*.1);
  assert.equal(enemy.hp,hp-damage);
  for(let i=0;i<20;i++)model.update(.01,{});
  assert.equal(enemy.hp,hp-damage);assert.equal(model.snapshot().hits,1);
 }
});
test('shared material textures are deterministic, nonuniform and bounded; backdrop disposes',()=>{
 for(const kind of ['grass','sand','clay','asphalt','water']){const a=surfaceTexture(kind,4),b=surfaceTexture(kind,4);assert.deepEqual(a.image.data,b.image.data);assert.equal(a.image.data.length,128*128*4);assert.ok(new Set(a.image.data).size>30);a.dispose();b.dispose();}
 const scene=new T.Scene(),backdrop=createSpaceBackdrop(scene);assert.equal(scene.children.length,3);backdrop.update(100);backdrop.dispose();backdrop.dispose();assert.equal(scene.children.length,0);
});
test('island placement grid is contextual and new terrain resources dispose once; release manifest matches runtime',async()=>{
 const scene=new T.Scene(),environment=new Environment(scene,{});environment.rebuild(16);assert.equal(environment.grid.visible,false);environment.showPlacementGrid(true);assert.equal(environment.grid.visible,true);environment.showPlacementGrid(false);assert.equal(environment.grid.visible,false);
 let disposed=0;environment.grassMap.addEventListener('dispose',()=>disposed++);environment.dispose();environment.dispose();assert.equal(disposed,1);
 assert.equal(JSON.parse(await readFile(new URL('../workout/island/release.json',import.meta.url),'utf8')).version,DATA_VERSION);
});
test('new release waits for an idle island and successful save; refresh is once and offline is harmless',async()=>{
 let safe=false,saves=0,reloads=[],ok=false;const watcher=watchRelease({version:'old',check:async()=>'new-release',canRefresh:()=>safe,save:()=>{saves++;return {ok};},refresh:v=>reloads.push(v),every:()=>7,cancel:id=>assert.equal(id,7)});
 await watcher.poll();assert.equal(saves,0);safe=true;watcher.apply();assert.equal(saves,1);assert.deepEqual(reloads,[]);ok=true;assert.equal(watcher.apply(),true);watcher.apply();await watcher.poll();assert.deepEqual(reloads,['new-release']);watcher.dispose();watcher.dispose();
 const offline=watchRelease({version:'old',check:async()=>{throw Error('offline');},canRefresh:()=>true,save:()=>assert.fail(),refresh:()=>assert.fail(),every:()=>0,cancel:()=>{}});await offline.poll();offline.dispose();
});
test('game library has one entry per game; details, play, help and upgrades open inside',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>({tag,dataset:{},children:[],setAttribute(){},append(...nodes){this.children.push(...nodes);}})};
 try{const games=[...createEngine(data,{storage:null}).registry.minigames.values()],ui=Object.create(ActivityInterface.prototype),opened=[];let dialog;
 Object.assign(ui,{engine:{registry:{minigames:new Map(games.map(g=>[g.id,g]))}},t:s=>s,enabledGames:()=>games,modal:()=>dialog={dataset:{},children:[],append(...nodes){this.children.push(...nodes);}},playButton:(id,action,play)=>({dataset:{action},onclick:play}),stages:id=>opened.push('play:'+id),intro:id=>opened.push('help:'+id),gameUpgrades:id=>opened.push('upgrade:'+id)});
 ui.menu();assert.equal(dialog.dataset.gameLibrary,'true');const grid=dialog.children[0];assert.equal(grid.children.length,games.length);for(const card of grid.children){const buttons=card.children.filter(n=>n.tag==='button');assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.action,'game-enter');}
 assert.equal(grid.children[0].dataset.game,'boarDefense','the newest game leads the library');assert.equal(grid.children[0].dataset.new,'true');assert.equal(grid.children.filter(c=>c.dataset.new).length,1);
 const first=games[0].id;grid.children.find(c=>c.dataset.game===first).children.at(-1).onclick();assert.equal(dialog.dataset.gameHome,first);const actions=dialog.children[1].children;assert.equal(actions.length,3);actions.forEach(b=>b.onclick());assert.deepEqual(opened,['play:'+first,'help:'+first,'upgrade:'+first]);
 }finally{globalThis.document=previous;}
});
