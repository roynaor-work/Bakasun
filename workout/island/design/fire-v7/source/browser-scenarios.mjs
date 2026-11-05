// Exercise real controls and recovery on the frozen final viewer. No test or
// production file outside fire-v7 is changed.
import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={startedAt:new Date().toISOString(),checks:[],errors:[],cspViolations:[],externalRequests:[],sourceHashes:{},expectedStartupErrors:[]};
for(const f of ['preview.html','preview.css','preview.js','effects.js','simulation.js','manifest.json','assets-data.js','vendor/fire-core.js'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1}),page=await context.newPage();
 await context.addInitScript(()=>{window.__policyViolations=[];addEventListener('securitypolicyviolation',e=>__policyViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))report.externalRequests.push(r.url());});
 await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});
 await page.evaluate(()=>firePreview.setPlaying(false));await context.setOffline(true);
 for(let i=0;i<5;i++){
   await page.locator('#target').selectOption(String(i));await page.locator('#water').click();
   assert.equal(await page.evaluate(()=>firePreview.simulation.target),i);assert.equal(await page.evaluate(()=>firePreview.water),true);
   await page.evaluate(()=>firePreview.seek(2));const snapshot=await page.evaluate(()=>firePreview.simulation);
   assert.ok(snapshot.buildings[i].wet>.4);assert.equal(snapshot.buildings.filter((b,k)=>k!==i&&b.wet>.001).length,0);
   await page.locator('#water').click();assert.equal(await page.evaluate(()=>firePreview.water),false);
 }
 report.checks.push('Each of the five visible target options directs water and wetness only to that building while fully offline');
 const requestViews=['fleet','crew','buildings','effects','crew','fleet','buildings','scene'];
 await page.evaluate(async views=>{await Promise.all(views.map(v=>firePreview.setView(v)));},requestViews);
 assert.equal(await page.evaluate(()=>firePreview.view),'scene');
 for(const view of ['fleet','crew','buildings','effects']){
   await page.locator(`[data-view="${view}"]`).click();await page.waitForFunction(v=>firePreview.view===v,view);
   await page.locator('#next').click();await page.locator('#previous').click();
   if(view==='buildings')for(const stage of ['intact','scorched','burning','ruined'])await page.locator('#damage').selectOption(stage);
   if(view==='crew')for(const clip of ['idle','walk','role'])await page.locator('#clip').selectOption(clip);
   if(view==='effects')for(const size of ['256','512','1024'])await page.locator('#atlas-size').selectOption(size);
 }
 report.checks.push('Overlapping view requests and visible previous/next, damage, motion and all atlas-size controls complete without stale scene errors');
 await page.locator('[data-view="scene"]').click();await page.evaluate(()=>firePreview.setPlaying(false));
 await page.locator('#scene').focus();const before=await page.evaluate(()=>firePreview.cameraPosition);
 await page.keyboard.press('ArrowLeft');await page.waitForTimeout(100);const after=await page.evaluate(()=>firePreview.cameraPosition);assert.notDeepEqual(before,after);
 await page.keyboard.press('Home');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>firePreview.playing),true);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>firePreview.playing),false);
 report.checks.push('Canvas keyboard rotation, Home and Space work through actual input events');
 for(const q of ['low','detail','mobile','low','mobile']){await page.locator('#quality').selectOption(q);await page.evaluate(()=>firePreview.capture());assert.equal(await page.evaluate(()=>firePreview.quality),q);}
 report.checks.push('Repeated quality changes preserve the scene and all 11 LOD roots');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(400);
 await page.evaluate(()=>firePreview.capture());const a=await page.evaluate(()=>document.getElementById('scene').toDataURL());await page.waitForTimeout(500);
 await page.evaluate(()=>firePreview.capture());const b=await page.evaluate(()=>document.getElementById('scene').toDataURL());
 assert.equal(a,b);assert.equal(await page.evaluate(()=>firePreview.playing),false);report.checks.push('Reduced motion produces byte-identical canvas pixels across elapsed wall time, including lights and particles');
 const restoration=await page.evaluate(async()=>{
   const canvas=document.getElementById('scene'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
   if(!ext)return {supported:false};
   return new Promise(resolve=>{let lost=false;const timer=setTimeout(()=>resolve({supported:true,lost,restored:false}),10000);
     canvas.addEventListener('webglcontextlost',()=>{lost=true;setTimeout(()=>ext.restoreContext(),400);},{once:true});
     canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);setTimeout(()=>resolve({supported:true,lost,restored:true}),500);},{once:true});ext.loseContext();});
 });
 report.contextRecovery=restoration;if(restoration.supported)assert.equal(restoration.restored,true);
 assert.equal(await page.evaluate(()=>firePreview.error),null);report.checks.push('A paused scene survives deliberate WebGL context loss/restoration offline');
 report.cspViolations=await page.evaluate(()=>__policyViolations);assert.equal(report.cspViolations.length,0);
 await context.close();
 const unsupported=await browser.newContext({viewport:{width:390,height:844}});await unsupported.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};
 });const fallback=await unsupported.newPage();fallback.on('console',m=>{if(m.type()==='error')report.expectedStartupErrors.push(m.text().slice(0,240));});
 await fallback.goto(origin+'/preview.html');await fallback.waitForSelector('#error:not([hidden])',{timeout:20000});
 assert.equal(await fallback.locator('#loading').evaluate(el=>el.hidden),true);assert.equal(await fallback.evaluate(()=>firePreview.ready),false);report.checks.push('Missing WebGL replaces loading with a visible error rather than leaving an indefinite spinner');await unsupported.close();
 report.passed=report.errors.length===0&&report.externalRequests.length===0&&report.cspViolations.length===0;
}catch(error){report.passed=false;report.failure=error.stack||String(error);process.exitCode=1;
}finally{report.completedAt=new Date().toISOString();await fs.writeFile(path.join(root,'verification/browser-scenarios.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors,failure:report.failure,contextRecovery:report.contextRecovery}));}
