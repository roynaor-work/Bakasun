import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
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
test('farther starting fleet stays targetable; real shells still land at the calculated point',()=>{
 const model=make();assert.equal(balance.enemyX-balance.shipX,280);assert.ok(balance.enemyX<balance.targeting.maxX);model.update(.01,{firing:true});assert.ok(model.ball.active);const target={x:model.ball.targetX,z:model.ball.targetZ};for(let i=0;i<200&&model.ball.active;i++)model.update(.01,{});assert.equal(model.blast.x,target.x);assert.equal(model.blast.z,target.z);
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
 const first=games[0].id;grid.children[0].children.at(-1).onclick();assert.equal(dialog.dataset.gameHome,first);const actions=dialog.children[1].children;assert.equal(actions.length,3);actions.forEach(b=>b.onclick());assert.deepEqual(opened,['play:'+first,'help:'+first,'upgrade:'+first]);
 }finally{globalThis.document=previous;}
});
