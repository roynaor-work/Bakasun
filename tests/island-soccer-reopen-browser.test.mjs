import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

test('soccer reopens after a real worker failure under the shipped index CSP',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:360000},async t=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const reports=[],out=process.env.ISLAND_SOCCER_AUDIT_DIR;
 try{for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const start=async()=>{
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
   if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  };
  const ready=async()=>{
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:90000});
   return page.evaluate(()=>window.__island.games.current.session.snapshot);
  };
  const exit=async()=>{await page.locator('[data-action=game-pause]').click();await page.locator('[data-action=game-exit]').click();};
  try{
   await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e,ui}=window.__island;e.setAvatar({name:'בדיקת טעינה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));e.buildReadyPlot(lot.id);}e.save();ui.closeModal();});
   await start();const first=await ready();assert.equal(first.renderMetrics.designScene.status,'ready');await exit();
   // The exact failure that used to leave DRACO callbacks pending forever:
   // an ordinary same-origin worker throws while assets await its decode.
   await context.route('**/minigames/soccer-draco-worker.mjs',route=>route.fulfill({contentType:'text/javascript',body:"throw new Error('soccer-worker-failure-fixture');"}));
   await start();const failure=await ready();assert.equal(failure.renderMetrics.designScene.status,'fallback');
   assert.ok(errors.includes('soccer-worker-failure-fixture'),'the browser really executed the failing worker');
   assert.ok(errors.every(error=>error==='soccer-worker-failure-fixture'));await exit();errors.length=0;
   await context.unroute('**/minigames/soccer-draco-worker.mjs');await start();const recovered=await ready();
   assert.equal(recovered.renderMetrics.designScene.status,'ready');assert.equal(recovered.renderMetrics.assetStats.kind,'design-glb-v2');assert.equal(recovered.renderMetrics.modelCount,12);assert.equal(recovered.players.length,12);
   await page.waitForFunction(()=>window.__island.games.current.session.snapshot.elapsed>.1);
   await page.evaluate(()=>window.__island.games.current.session.setPaused(true));
   if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}-recovered.png`)});}
   assert.deepEqual(errors,[]);await audit.assertClean();
   reports.push({viewport,normal:first.renderMetrics.assetStatus,failingWorker:failure.renderMetrics.designScene.status,recovered:recovered.renderMetrics.assetStatus,contractsStatus:recovered.contractsStatus,assetKind:recovered.renderMetrics.assetStats.kind,models:recovered.renderMetrics.modelCount,csp:audit.snapshot()});
  }finally{await audit.dispose();await context.close();}
 });}finally{await browser.close();await server.close();if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,'soccer-reopen-browser.json'),JSON.stringify(reports,null,2));}}
});
