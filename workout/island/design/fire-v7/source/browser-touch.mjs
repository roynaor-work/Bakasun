// Real touch input through Chromium's device emulation, including DPR=3.
// This checks input and pixel budgets; it does not emulate a phone GPU.
import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={startedAt:new Date().toISOString(),deviceScaleFactor:3,physicalPhone:false,checks:[],pixelBudgets:[],errors:[],externalRequests:[],httpResources:[],sourceHashes:{}};
for(const f of ['preview.html','preview.css','preview.js','effects.js','simulation.js','manifest.json','assets-data.js','vendor/fire-core.js'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('request',r=>{if(/^https?:/.test(r.url())){report.httpResources.push(new URL(r.url()).pathname);if(!r.url().startsWith(origin))report.externalRequests.push(r.url());}});
 await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});await page.evaluate(()=>firePreview.setPlaying(false));await context.setOffline(true);
 const cdp=await context.newCDPSession(page),snapshot=()=>page.evaluate(()=>({camera:firePreview.cameraPosition,target:firePreview.target}));
 const distance=s=>Math.hypot(...s.camera.map((v,i)=>v-s.target[i]));
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i+1,radiusX:1,radiusY:1,force:1}))});
 const start=await snapshot();await touch('touchStart',[[170,320]]);
 for(let i=1;i<=5;i++){await touch('touchMove',[[170+i*12,320+i*4]]);await page.waitForTimeout(40);}
 await touch('touchEnd',[]);await page.waitForTimeout(500);await page.evaluate(()=>firePreview.capture());const rotated=await snapshot();
 assert.ok(Math.hypot(...start.camera.map((v,i)=>v-rotated.camera[i]))>.2);report.drag={before:start,after:rotated};report.checks.push('A one-finger canvas drag rotates the camera through actual touch events');
 await touch('touchStart',[[145,360],[245,360]]);
 for(let i=1;i<=5;i++){await touch('touchMove',[[145-i*7,360],[245+i*7,360]]);await page.waitForTimeout(40);}
 await touch('touchEnd',[]);await page.waitForTimeout(500);await page.evaluate(()=>firePreview.capture());const zoomed=await snapshot();
 report.pinch={beforeDistance:distance(rotated),afterDistance:distance(zoomed)};assert.ok(report.pinch.afterDistance<report.pinch.beforeDistance*.95);report.checks.push('A two-finger outward pinch decreases camera distance without scrolling the document');
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.locator('[data-view="scene"]').tap();
  await page.locator('#far').tap();assert.equal(await page.evaluate(()=>firePreview.camera),'far');
  await page.locator('#water').tap();assert.equal(await page.evaluate(()=>firePreview.water),true);await page.locator('#water').tap();
  await page.locator('[data-view="crew"]').tap();await page.waitForFunction(()=>firePreview.view==='crew');await page.locator('#next').tap();await page.waitForFunction(()=>firePreview.index===1);
  await page.locator('#previous').tap();await page.waitForFunction(()=>firePreview.index===0);
  await page.locator('#info').tap();assert.equal(await page.locator('#about').evaluate(el=>el.open),true);await page.locator('#close-info').tap();
  for(const [quality,cap]of [['mobile',1.25],['low',.75],['detail',1.75]]){
   await page.locator('#quality').selectOption(quality);await page.evaluate(()=>firePreview.capture());
   const dimensions=await page.evaluate(()=>({css:[innerWidth,innerHeight],buffer:[document.getElementById('scene').width,document.getElementById('scene').height],scale:firePreview.renderScale,deviceDpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,scrollY}));
   assert.equal(dimensions.deviceDpr,3);assert.equal(dimensions.scale,cap);assert.equal(dimensions.overflow,false);assert.equal(dimensions.scrollY,0);
   for(let i=0;i<2;i++)assert.equal(dimensions.buffer[i],Math.floor(dimensions.css[i]*cap));report.pixelBudgets.push({viewport,quality,...dimensions});
  }
 }
 report.checks.push('Water, camera, crew navigation and the information dialog respond to taps in both orientations');
 report.checks.push('DPR=3 is capped to 1.25 / 0.75 / 1.75 in mobile / low / detail; canvas dimensions match, with no scroll overflow');
 assert.equal(report.httpResources.filter(p=>/\.(png|jpe?g|glb|wasm)$/i.test(p)).length,0);report.checks.push('No HTTP image, model or WASM fetches: all binary resources are embedded data');
 await context.close();report.passed=report.errors.length===0&&report.externalRequests.length===0;
}catch(error){report.passed=false;report.failure=error.stack||String(error);process.exitCode=1;
}finally{report.completedAt=new Date().toISOString();await fs.writeFile(path.join(root,'verification/browser-touch.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors,failure:report.failure}));}
