import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../../tests/shell-ready.mjs';

// Focused acceptance harness for the current game library. The older G3b
// harness is run separately, unchanged, against both main and this branch.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=process.env.ISLAND_CSP_AUDIT_DIR?process.env.ISLAND_CSP_AUDIT_DIR.replace(/[\\/]$/,'')+'/soccer-athlete/':fileURLToPath(new URL('./',import.meta.url));await mkdir(directory,{recursive:true});
const config=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url),'utf8'));
const server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={physicalPhone:false,physical120Hz:false,approvedSource:'910ea28d90f8e16e23dc1ff92ffc435b591a2fa8',graphicsV3:false,budgets:config.ui.downloadBudget,cases:[]};
const viewports=[{width:844,height:390},{width:390,height:844}].filter(v=>!process.env.SOCCER_QA_WIDTH||v.width===Number(process.env.SOCCER_QA_WIDTH));
const reportFile=process.env.SOCCER_QA_WIDTH?`acceptance-${process.env.SOCCER_QA_WIDTH}.json`:'acceptance.json';
try{
 for(const viewport of viewports){
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
  context.setDefaultTimeout(60000);
  const errors=[],warnings=[],downloads=[],pending=new Set();let phase='city',current={viewport};report.cases.push(current);
  const phases=new Map();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());else if(message.type()==='warning')warnings.push(message.text());});
  page.on('request',request=>phases.set(request,phase));
  page.on('requestfinished',request=>{
   if(!request.url().startsWith(server.url))return;
   const task=request.sizes().then(size=>downloads.push({url:request.url(),phase:phases.get(request),bytes:size.responseBodySize+size.responseHeadersSize}));
   pending.add(task);task.finally(()=>pending.delete(task));
  });
  const snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
  const tick=ms=>page.clock.runFor(ms);
  const screenshot=async name=>{const file=`${viewport.width}-${name}.png`;await page.screenshot({path:directory+file});return file;};
  async function launchFromLibrary(){
   await page.evaluate(()=>window.__island.games.menu());
   await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();
   await page.locator('[data-action="game-play"]').click();
   await page.locator('[data-stage="1"]').click();
   if(await page.locator('[data-action="game-understood"]').count()){await tick(32);await page.locator('[data-action="game-understood"]').click();}
   await waitForGameStart(page);await page.waitForLoadState('networkidle');await tick(100);
   const s=await snap();assert.equal(s.renderMetrics.assetStatus,'ready');assert.equal(s.renderMetrics.assetStats.kind,'athlete');
   assert.equal(s.renderMetrics.modelCount,8);assert.equal(s.renderMetrics.fallbackCount,0);assert.equal(s.renderMetrics.assetStats.clips.length,13);return s;
  }
  let suiteError=null;
  try{
   await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await csp.assertClean();
   await page.waitForFunction(()=>Boolean(window.__island));
   console.log('island loaded',viewport.width);
   const setup=await page.evaluate(async()=>{
    const {engine:e,ui,data}=window.__island;
    const {validateSave}=await import('./engine/persistence.mjs?v=island-soccer-athlete-20261029-1');
    const check=(result,label)=>{if(!result?.ok)throw Error(label+': '+result?.reason);return result;};
    check(e.setAvatar({name:'בדיקת כדורגל',created:true}),'avatar');check(e.skipTutorial(),'tutorial');
    // Disposable browser-context fixture only: production gates and balances
    // are unchanged. Build through the real ready-plot command and validate.
    e.state.money=100000;e.state.learning.required=false;
    if(!e.state.buildings.some(b=>b.typeId==='soccer')){check(e.enableReadyBuilding(),'ready buildings');const lot=e.readyPlotForType('soccer');check(lot,'soccer lot');check(e.buildReadyPlot(lot.id),'build soccer');}
    check(e.setSoccerDifficulty('normal'),'difficulty');check(validateSave(e.state,data,e.registry),'validate save');
    check(e.importJSON(e.exportJSON()),'roundtrip');check(e.save(),'save');ui.closeModal();
    return {valid:true,building:e.state.buildings.find(b=>b.typeId==='soccer')?.id,dailyLocked:e.learningStatus().locked};
   });assert.equal(setup.dailyLocked,false);current.setup=setup;
   await Promise.all([...pending]);current.cityBytes=downloads.filter(d=>d.phase==='city').reduce((sum,d)=>sum+d.bytes,0);
   phase='soccer';let s=await launchFromLibrary();current.initialMetrics=s.renderMetrics;console.log('eight athletes loaded',viewport.width);
   if(viewport.height>viewport.width){
    assert.equal(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'true');
    const before=s;await tick(600);const after=await snap();assert.deepEqual(after.renderMetrics.poses,before.renderMetrics.poses);assert.deepEqual(after.ball,before.ball);
    current.portrait={rotationRequired:true,paused:true,screenshot:await screenshot('portrait-rotation')};
    await page.setViewportSize({width:844,height:390});
    // Native resize delivery follows the viewport command asynchronously.
    await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.orientationBlocked==='false');await tick(100);
    assert.equal(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'false');
   }
   await tick(1200);await page.locator('.game-screen canvas').focus();s=await snap();const id=s.controlled,start=s.players[id];
   await page.keyboard.down('ArrowRight');await tick(900);await page.keyboard.up('ArrowRight');s=await snap();
   current.movement=Math.hypot(s.players[id].x-start.x,s.players[id].z-start.z);assert.ok(current.movement>.5,'actual keyboard input moves the registered game player');
   await page.locator('[data-action="game-pause"]').click();await tick(32);const pauseA=await snap();
   const a=await page.locator('.game-screen canvas').screenshot({path:directory+`${viewport.width}-pause-canvas-a.png`});
   await tick(2000);const pauseB=await snap();const b=await page.locator('.game-screen canvas').screenshot({path:directory+`${viewport.width}-pause-canvas-b.png`});
   assert.deepEqual(pauseB.renderMetrics.poses,pauseA.renderMetrics.poses);assert.deepEqual(pauseB.ball,pauseA.ball);assert.equal(pauseB.elapsed,pauseA.elapsed);
   current.pause={posesStable:true,ballStable:true,elapsedStable:true,canvasPngIdentical:a.equals(b),screenshot:await screenshot('paused')};
   await page.locator('[data-action="game-resume"]').click();await tick(700);s=await snap();assert.ok(s.elapsed>pauseB.elapsed);assert.notDeepEqual(s.renderMetrics.poses,pauseB.renderMetrics.poses);
   current.resumed=true;current.metrics=s.renderMetrics;current.playViewport=page.viewportSize();current.playScreenshot=await screenshot('playing');
   assert.ok(s.renderMetrics.triangles<=config.minigames.soccer.view.maxTriangles);assert.ok(s.renderMetrics.drawCalls<=config.minigames.soccer.view.maxDrawCalls);
   await Promise.all([...pending]);
   current.gameAdditionalBytes=downloads.filter(d=>d.phase==='soccer').reduce((sum,d)=>sum+d.bytes,0);
   // The existing limit is per cold game entry. A fresh second session on this
   // no-store server downloads its assets again; measure that entry separately.
   phase='reopen';
   await page.locator('[data-action="game-pause"]').click();await page.locator('[data-action="game-exit"]').click();
   assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);
   s=await launchFromLibrary();current.reopened=s.renderMetrics.assetStats.kind==='athlete';
   await page.locator('[data-action="game-pause"]').click();await page.locator('[data-action="game-exit"]').click();
   current.closed=true;assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);
   await Promise.all([...pending]);current.reopenBytes=downloads.filter(d=>d.phase==='reopen').reduce((sum,d)=>sum+d.bytes,0);
   current.downloads=downloads;current.gameWithinBudget=current.gameAdditionalBytes<=config.ui.downloadBudget.gameAdditional;
   assert.ok(current.gameWithinBudget,`additional soccer download ${current.gameAdditionalBytes}`);
   assert.ok(current.reopenBytes<=config.ui.downloadBudget.gameAdditional,`reopened soccer download ${current.reopenBytes}`);
   const family=downloads.filter(d=>new URL(d.url).pathname.includes('/assets/athlete/'));current.athleteUrls=[...new Set(family.map(d=>d.url))];
   assert.equal(current.athleteUrls.length,11,'GLB and every external texture loaded');
   await csp.assertClean();assert.deepEqual(errors,[]);current.csp=csp.snapshot();current.errors=errors;current.warnings=warnings;current.pass=true;console.log('soccer acceptance passed',viewport.width,current.gameAdditionalBytes);
  }catch(error){suiteError=error;current.pass=false;current.failure=error.message;current.errors=errors;current.warnings=warnings;current.downloads=downloads;current.csp=csp.snapshot();await screenshot('failure').catch(()=>{});throw error;}
  finally{
   let auditError=null;const failed=(error,field)=>{auditError??=error;current.pass=false;current[field]=error.message;current.failure??=error.message;};
   try{await csp.assertClean();}catch(error){failed(error,'cspFailure');}
   try{await context.close();await csp.assertClean();}catch(error){failed(error,'cspAfterCloseFailure');}
   current.csp=csp.snapshot();
   try{await writeFile(directory+reportFile,JSON.stringify(report,null,2)+'\n');}finally{await csp.dispose();}
   if(!suiteError&&auditError)throw auditError;
  }
 }
}finally{await browser.close();await server.close();}
