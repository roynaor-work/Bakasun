import test from 'node:test';
import assert from 'node:assert/strict';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

/** The soccer asset worker must register under the shipped index CSP (script-src 'self'),
 * download the asset list once on request, and answer the next match from the device
 * cache: no network request for any cached soccer asset. */
test('soccer assets download once into the service worker cache and the next match loads without network',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:360000},async()=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>requests.push(request.url()));
 try{
  await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{const {engine:e,ui}=window.__island;e.setAvatar({name:'בדיקת הורדה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));e.buildReadyPlot(lot.id);}e.save();ui.closeModal();});
  const result=await page.evaluate(async()=>{
   const m=await import('./ui/soccer-card.mjs');const progress=[];
   const done=await m.downloadSoccerAssets((d,t)=>progress.push([d,t]));
   const registration=await navigator.serviceWorker.getRegistration();
   return {done,progress:progress.length,scope:registration?.scope,script:registration?.active?.scriptURL,keys:await caches.keys()};
  });
  assert.deepEqual(result.done.failed,[],'every asset downloaded');
  assert.ok(result.done.total>=40&&result.progress===result.done.total);
  assert.ok(result.script.endsWith('/workout/island/soccer-sw.js?v='+result.done.version),result.script);
  assert.deepEqual(result.keys.filter(k=>k.startsWith('island-soccer-')),['island-soccer-'+result.done.version]);
  // A fresh page in the same context is controlled by the worker: the match's assets come from the cache.
  const match=await context.newPage();match.on('pageerror',error=>errors.push(error.message));
  await match.addInitScript(()=>performance.setResourceTimingBufferSize(4000));
  const served=[];match.on('request',request=>served.push(request.url()));
  await match.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await match.waitForFunction(()=>window.__island&&navigator.serviceWorker.controller);
  await match.evaluate(()=>{const {engine:e,ui}=window.__island;e.setAvatar({name:'בדיקת הורדה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));e.buildReadyPlot(lot.id);}e.save();ui.closeModal();});
  await match.evaluate(()=>window.__island.games.start('soccer',undefined,1));
  if(await match.locator('[data-action=game-understood]').count())await match.locator('[data-action=game-understood]').click();
  await match.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:120000});
  const snapshot=await match.evaluate(()=>window.__island.games.current.session.snapshot);
  assert.equal(snapshot.renderMetrics.assetStats.kind,'design-glb-v2');assert.equal(snapshot.renderMetrics.designScene.status,'ready');
  const report=await match.evaluate(()=>localStorage.getItem('island.soccer.lastLoadReport'));
  assert.match(report,/assets ready · characters design-glb-v2 · scene design/,report);
  const timing=await match.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/design\/(characters2|models2|models|environment|motion2|motion|vfx)\//.test(e.name)).map(e=>({name:e.name.split('/island/')[1],worker:e.workerStart>0,transfer:e.transferSize})));
  assert.ok(timing.length>=8,'the match fetched its design assets from the page: '+timing.length+' of '+await match.evaluate(()=>performance.getEntriesByType('resource').length));
  for(const entry of timing)assert.ok(entry.worker&&entry.transfer===0,`${entry.name} should come from the worker cache, not the network`);
  const fromWorker=await match.evaluate(async()=>{const cache=await caches.open((await caches.keys()).find(k=>k.startsWith('island-soccer-')));return (await cache.keys()).length;});
  assert.ok(fromWorker>=40,'cache still holds the assets after the match');
  assert.deepEqual(errors,[]);await audit.assertClean();
 }finally{await audit.dispose();await context.close();await browser.close();await server.close();}
});
