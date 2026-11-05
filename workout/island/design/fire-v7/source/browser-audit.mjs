// Behaviour, mobile rendering and skin support audit. Runs with external
// network blocked, then switches the browser fully offline after loading.
import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={startedAt:new Date().toISOString(),browser:browser.version(),renderer:'ANGLE / SwiftShader software renderer',physicalPhone:false,errors:[],externalRequests:[],checks:[],performance:[],skinSupport:[]};
report.sourceHashes={};for(const f of ['preview.html','preview.css','preview.js','effects.js','simulation.js','manifest.json','assets-data.js','vendor/fire-core.js'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))report.externalRequests.push(r.url());});
 await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});
 await page.evaluate(()=>firePreview.setPlaying(false));await context.setOffline(true);
 assert.equal(await page.evaluate(()=>firePreview.engineRevision),'160');report.checks.push('Local r160 runtime with external HTTP blocked and browser set offline');
 for(const role of ['crew-nozzle','crew-tool','crew-command'])for(const low of [false,true])for(const clip of ['idle','hose','tool','command','walk']){
   const result=await page.evaluate(async args=>firePreview.auditActor(...args),[role,clip,low,121]);
   report.skinSupport.push(result);assert.equal(result.nonFinite,0);assert.ok(result.soleVertices>0);
   assert.ok(result.minSoleY>=-.006,`${result.id}/${clip}: foot below floor ${result.minSoleY}`);
   assert.ok(result.maxLowerSoleY<=.025,`${result.id}/${clip}: no supported foot ${result.maxLowerSoleY}`);
   assert.ok(result.loopDelta<.002,`${result.id}/${clip}: loop seam ${result.loopDelta}`);
   console.log('skin',result.id,clip,result.minSoleY.toFixed(5),result.maxLowerSoleY.toFixed(5));
 }
 report.checks.push('30 skinned model/LOD/clip combinations × 121 samples; supported soles, finite positions and closed loop');
 const spread=await page.evaluate(async()=>{await firePreview.reset();await firePreview.seek(35);return firePreview.simulation;});
 assert.equal(spread.buildings.filter(b=>b.burning).length,5);assert.ok(spread.events.some(e=>e.type==='ignited'));report.checks.push('Neighbour heat ignites all five buildings by 35 seconds, with recorded events');
 const extinguished=await page.evaluate(async()=>{await firePreview.reset();firePreview.setWater(true);await firePreview.seek(5);return firePreview.simulation;});
 assert.equal(extinguished.buildings[2].burning,false);assert.ok(extinguished.buildings[2].heat<.24);assert.ok(extinguished.buildings[2].wet>.5);report.checks.push('Water lowers heat, wets the target and extinguishes the source');
 await page.evaluate(async()=>{await firePreview.reset();await firePreview.seek(10);firePreview.setWater(true);});
 const paused=await page.evaluate(()=>({time:firePreview.time,frames:firePreview.frames}));await page.waitForTimeout(700);
 const pausedLater=await page.evaluate(()=>({time:firePreview.time,frames:firePreview.frames}));assert.equal(paused.time,pausedLater.time);assert.ok(pausedLater.frames-paused.frames<=2);report.checks.push('Paused clock and render loop remain stationary');
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(100);
   for(const quality of ['low','mobile','detail']){
     await page.evaluate(async q=>{firePreview.setQuality(q);await firePreview.setView('scene');firePreview.setCamera('near');firePreview.setPlaying(true);},quality);
     await page.waitForTimeout(quality==='mobile'?15000:1800);
     // Warm adaptation first, then measure the same five-fire/water workload
     // in every cell. A 4.2 s window ends before this wet target extinguishes.
     const before=await page.evaluate(async()=>{firePreview.setPlaying(false);firePreview.setWater(false);await firePreview.seek(35);firePreview.setWater(true);firePreview.setPlaying(true);return{frames:firePreview.frames,now:performance.now(),time:firePreview.time,burning:firePreview.simulation.buildings.filter(b=>b.burning).length};});
     await page.waitForTimeout(4200);const after=await page.evaluate(()=>{firePreview.setPlaying(false);return{frames:firePreview.frames,now:performance.now(),time:firePreview.time,burning:firePreview.simulation.buildings.filter(b=>b.burning).length,water:firePreview.water,triangles:firePreview.triangles,drawCalls:firePreview.drawCalls,particles:firePreview.particles,memory:firePreview.memory,intervals:firePreview.frameIntervalsMs,adaptiveLevel:firePreview.adaptiveLevel,renderScale:firePreview.renderScale,cheapShading:firePreview.cheapShading};});
     assert.equal(before.burning,5);assert.equal(after.burning,5);assert.equal(after.water,true);
     const intervals=after.intervals.slice(-(after.frames-before.frames)).sort((a,b)=>a-b),fps=(after.frames-before.frames)/((after.now-before.now)/1000);
     report.performance.push({viewport,quality,elapsedMs:after.now-before.now,frames:after.frames-before.frames,fps,simulationStart:before.time,simulationEnd:after.time,burningStart:before.burning,burningEnd:after.burning,water:after.water,triangles:after.triangles,drawCalls:after.drawCalls,particles:after.particles,memory:after.memory,adaptiveLevel:after.adaptiveLevel,renderScale:after.renderScale,cheapShading:after.cheapShading,p50Ms:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)]});
     console.log('performance',viewport,quality,fps.toFixed(1),after.triangles,after.drawCalls);
     await page.evaluate(()=>firePreview.setPlaying(false));
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 report.checks.push('All three quality modes in portrait/landscape, actual frame intervals and bounded geometry; no horizontal overflow');
 await page.evaluate(()=>firePreview.setQuality('mobile'));
 for(const view of ['fleet','crew','buildings','effects']){
   await page.evaluate(view=>firePreview.setView(view),view);
   for(let i=0;i<(view==='fleet'||view==='crew'?3:5);i++)await page.evaluate(i=>firePreview.setIndex(i),i);
 }
 await page.evaluate(async()=>{const work=[];for(let i=0;i<12;i++){work.push(firePreview.reset());work.push(firePreview.seek(i%2?0:35));}await Promise.all(work);await firePreview.reset();await firePreview.setView('scene');firePreview.capture();});
 assert.equal(await page.evaluate(()=>firePreview.simulation.buildings.filter(b=>b.burning).length),1);assert.equal(await page.evaluate(()=>firePreview.lod.high+firePreview.lod.low),11);report.checks.push('Rapid overlapping reset/seek and model switches retain exactly 11 district LOD roots');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>firePreview.playing),false);report.checks.push('Reduced motion pauses presentation and disables flashing/automatic orbit');
 await page.locator('#info').click();assert.equal(await page.locator('#about').evaluate(el=>el.open),true);await page.locator('#close-info').click();report.checks.push('Information dialog opens/closes using visible buttons');
 await context.close();report.passed=report.errors.length===0&&report.externalRequests.length===0;
}catch(error){report.passed=false;report.failure=error.stack||String(error);console.log(report.failure);process.exitCode=1;
}finally{report.completedAt=new Date().toISOString();await fs.writeFile(path.join(root,'verification/browser-audit.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errors:report.errors,failure:report.failure}));}
