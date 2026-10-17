import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const label=process.env.TASK017_PHASE||'after',out=fileURLToPath(new URL('../verification/task017/',import.meta.url));await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const reports=[];
 try {for(const [width,height] of [[390,844],[844,390]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[],outside=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!new URL(r.url()).pathname.startsWith('/workout/island/'))outside.push(r.url())});
 // Cold context. Fixed random stream makes the decorative island reproducible.
 await page.addInitScript(()=>{let seed=17017;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);});
 await page.goto(process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').tap();
 await page.evaluate(async()=>{const {view,engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;await view.modelsReady;if(view.pilotReady)await view.pilotReady;
 const buildings=[{id:'pilot-home',typeId:'house',level:1,x:4,z:6},{id:'pilot-shop',typeId:'shop',level:1,x:7,z:6},{id:'pilot-hospital',typeId:'hospital',level:1,x:10,z:6},...Array.from({length:9},(_,i)=>({id:'pilot-road-'+i,typeId:'road',level:1,x:3+i,z:5}))];
 view.started=Infinity;window.__task017ReadyMs=performance.now();engine.state.buildings=buildings;view.setWorld(engine.state,true);view.home();window.__task017Scenario=buildings;});
 if(await page.locator('.build-dock').getAttribute('data-open')==='true')await page.locator('[data-action=toggle-build]').tap();
 await page.waitForTimeout(1200);
 const report=await page.evaluate(()=>{const {view}=window.__island,entries=performance.getEntriesByType('resource'),nav=performance.getEntriesByType('navigation')[0];return {metrics:view.metrics(),camera:{position:view.camera.position.toArray(),target:view.target.toArray(),left:view.camera.left,right:view.camera.right,top:view.camera.top,bottom:view.camera.bottom},loadMs:nav.loadEventEnd,readyMs:window.__task017ReadyMs,downloadedBytes:entries.reduce((s,e)=>s+e.encodedBodySize,nav.encodedBodySize),transferBytes:entries.reduce((s,e)=>s+e.transferSize,nav.transferSize),resources:entries.map(e=>({path:new URL(e.name).pathname,bytes:e.encodedBodySize})),pilot:view.pilot?.metrics()};});
 // Measure actual rAF delivery over a real 2-second window (no mock clock).
 report.fps=await page.evaluate(()=>new Promise(resolve=>{let n=0;const start=performance.now();function frame(now){n++;if(now-start>=2000)resolve(n*1000/(now-start));else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));
 await page.screenshot({path:out+label+'-'+width+'x'+height+'.png'});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);if(label!=='before')assert.equal(report.pilot.walkerLoaded&&report.pilot.carLoaded,true);reports.push({width,height,...report,errors,outside});console.log(label,width,height,JSON.stringify({metrics:report.metrics,fps:report.fps,bytes:report.downloadedBytes,errors,outside}));await context.close();
 }await fs.writeFile(out+label+'.json',JSON.stringify({label,browser:'Chromium / ANGLE SwiftShader (software WebGL), DPR 1, cold context',scenario:'house L1 (4,6), shop (7,6), hospital (10,6), road x=3..11 z=5; default home camera; 2s real rAF',reports},null,2)+'\n');}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
