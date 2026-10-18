import {waitForGameStart,prepareGameBuildings} from './shell-ready.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/task016/',import.meta.url)),target=process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']}),reports=[];
const broken=/\/(alien-d|enemy-gunboat|hydrant|house-a|hospital|shop-corner)-512\.glb/;
try{for(const width of (process.env.TASK016_WIDTH?[Number(process.env.TASK016_WIDTH)]:[390,360]))for(const failure of [false,true]){
 const context=await browser.newContext({viewport:{width,height:Number(process.env.TASK016_HEIGHT)||(width===390?844:740)},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[],outside=[],requests=[];
 context.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.includes('/workout/island/'))outside.push(u.href);if(broken.test(u.pathname))requests.push(u.pathname);});
 if(failure)await page.route(broken,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:'invalid GLB for intentional fallback test'}));
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
 async function start(id){await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await page.locator('[data-action=game-understood]').tap();}await waitForGameStart(page);await tick(50);}
 async function exit(){if(!await page.locator('[data-action=game-exit]').count())await page.locator('[data-action=game-pause]').tap();await page.locator('[data-action=game-exit]').tap();}
 try{
  await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').tap();
  await page.evaluate(()=>{const {data,engine}=window.__island;engine.skipTutorial();data.featureFlags.events=false;data.config.minigames.slowFrameMs=10000;for(const id of ['fireRescue','navalDuel'])data.config.minigames[id].render.fallbackFrameMs=10000;});
  await page.evaluate(()=>window.__island.view.modelsReady);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await prepareGameBuildings(page);
  await page.evaluate(()=>window.__island.ui.setDockOpen(true));await tick(320);await page.locator('[data-action=category][data-category=basic]').tap();const shopCard=page.locator('[data-action=select-building][data-building=shop]');assert.match(await shopCard.innerText(),/חנות פינתית/);assert.equal(await shopCard.isEnabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:directory+width+'-shop-catalog-'+(failure?'fallback':'models')+'.png'});await shopCard.tap();assert.equal(await page.evaluate(()=>window.__island.view.ghost?.userData.modelPath),failure?undefined:'assets/models/shop-corner-512.glb');await page.locator('[data-action=cancel]').tap();if(await page.locator('.build-dock').getAttribute('data-open')==='true')await page.locator('[data-action=toggle-build]').tap();
  const city=await page.evaluate(async()=>{
   const T=await import('./vendor/three.module.js'),{view,engine}=window.__island,state=engine.state;
   const buildings=[{id:'test-home',typeId:'house',level:1,x:4,z:6},{id:'test-shop',typeId:'shop',level:1,x:7,z:6},{id:'test-hospital',typeId:'hospital',level:1,x:10,z:6}];
   view.setWorld({...state,buildings},true);view.renderer.render(view.scene,view.camera);
   const result={metrics:view.metrics(),buildings:[...view.groups.values()].map(({group,typeId})=>{const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3());return {typeId,model:group.userData.modelPath,position:group.position.toArray(),minY:box.min.y,size:size.toArray()};})};
   const record=view.definition('house');view.setGhost(record,2,2,true);result.ghostModel=view.ghost.userData.modelPath;view.clearGhost();return result;
  });
  if(!failure){assert.equal(city.metrics.models.loaded,3);for(const b of city.buildings){assert.ok(b.model);assert.ok(Math.abs(b.minY-b.position[1])<1e-5);}assert.ok(city.ghostModel);}
  else{assert.equal(city.metrics.models.loaded,0);assert.equal(city.metrics.models.failed,3);for(const b of city.buildings)assert.equal(b.model,undefined);}
  await page.screenshot({path:directory+width+'-city-'+(failure?'fallback':'models')+'.png'});
  city.populatedCity=await page.evaluate(()=>{const {view,engine}=window.__island,buildings=Array.from({length:6},(_,i)=>({id:'stress-home-'+i,typeId:'house',level:1,x:1+i%3*3,z:2+Math.floor(i/3)*3}));buildings.push({id:'stress-shop',typeId:'shop',level:1,x:10,z:5},{id:'stress-hospital',typeId:'hospital',level:1,x:10,z:2});view.setWorld({...engine.state,buildings},true);view.renderer.render(view.scene,view.camera);const metrics=view.metrics();view.setWorld(engine.state,true);return {description:'six houses, one shop, one hospital; fixed camera, shadows enabled',...metrics};});
  await start('fireRescue');await page.waitForFunction(failure=>{const h=window.__island.games.current.session.snapshot.renderMetrics.hydrant;return failure?h.art.failed===1:h.loaded;},failure,{polling:100});await tick(50);const fire=await snap();assert.equal(fire.renderMode,'three');assert.equal(fire.renderMetrics.hydrant.loaded,!failure);await exit();
  // Seed zero selects the GLB-backed scout; other ship classes are procedural.
  await page.evaluate(()=>window.__island.games.now=()=>0);await start('navalDuel');await page.waitForFunction(failure=>{const m=window.__island.games.current.session.snapshot.renderMetrics.models;return failure?m.loaded===1&&m.failed===1:m.loaded===2;},failure,{polling:100});await tick(50);const naval=await snap();assert.equal(naval.renderMode,'three');assert.equal(naval.renderMetrics.playerLoaded,true);const modelEnemies=await page.evaluate(()=>{const {data,games}=window.__island;return games.current.session.snapshot.enemies.filter(e=>data.config.minigames.navalDuel.shipTypes[e.kind].model).length;});assert.equal(naval.renderMetrics.enemiesLoaded,failure?0:modelEnemies);if(naval.renderMetrics.models.failed===0)for(const length of naval.renderMetrics.enemyLengths.filter(n=>n>0))assert.ok(Math.abs(length-naval.renderMetrics.playerLength)<1e-5);await exit();
  await start('alienDefense');await page.waitForFunction(failure=>{const m=window.__island.games.current.session.snapshot.artModels;return m&&m.loaded===(failure?5:6)&&m.failed===(failure?1:0);},failure,{polling:100});await tick(50);const aliens=await snap();await exit();
  assert.equal(new Set(requests).size,6);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({width,intentionallyCorruptSixGLBs:failure,city,fire:fire.renderMetrics,naval:naval.renderMetrics,aliens:aliens.artModels,errors,outside});console.log('TASK-016 models/fallback',width,failure);
 }finally{await context.close();}
}await writeFile(directory+'models-and-fallback.json',JSON.stringify({browser:'Chromium / ANGLE SwiftShader',reports},null,2)+'\n');}finally{await browser.close();}
