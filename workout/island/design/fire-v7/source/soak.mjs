// Sustained browser exercise: thirty minutes per mobile orientation by default.
// Each cycle visits cold, spreading, wet, ruined and reset states, then samples
// frame delivery, GPU resource counts and JS heap without hiding slow frames.
import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),seconds=Number(process.argv[2]||1800);
if(!Number.isFinite(seconds)||seconds<60)throw Error('Duration per orientation must be at least 60 seconds');
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--enable-precise-memory-info']});
const report={startedAt:new Date().toISOString(),requestedSecondsPerOrientation:seconds,browser:browser.version(),renderer:'SwiftShader CPU rendering; not a physical phone',runs:[],errors:[],externalRequests:[],sourceHashes:{}};
for(const f of ['preview.html','preview.css','preview.js','effects.js','simulation.js','manifest.json','assets-data.js','vendor/fire-core.js'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
const save=()=>fs.writeFile(path.join(root,'verification/soak-progress.json'),JSON.stringify(report,null,2)+'\n');
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>report.errors.push({viewport,error:e.stack||e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({viewport,error:m.text()});});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))report.externalRequests.push(r.url());});
  await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});await context.setOffline(true);
  await page.evaluate(async()=>{firePreview.setQuality('mobile');await firePreview.seek(35);firePreview.setWater(true);firePreview.setPlaying(true);});
  // Warm all damage variants before the retained-heap baseline.
  await page.evaluate(async()=>{await firePreview.seek(120);await firePreview.reset();await firePreview.seek(35);firePreview.setPlaying(true);});
  await cdp.send('HeapProfiler.collectGarbage');const heapStart=await cdp.send('Runtime.getHeapUsage');
  const run={viewport,startedAt:new Date().toISOString(),heapStart,samples:[],cycles:0};report.runs.push(run);await save();
  const started=Date.now();let tick=0,lastFrames=0,lastTime=0;
  while((Date.now()-started)/1000<seconds){
    const elapsed=(Date.now()-started)/1000,cycle=Math.floor(elapsed/120),phase=Math.floor(elapsed%120/10);
    if(tick===0||phase!==run.lastPhase){
      if(phase===0){await page.evaluate(()=>firePreview.reset());run.cycles++;}
      if(phase===1)await page.evaluate(()=>firePreview.seek(10));
      if(phase===3)await page.evaluate(async()=>{firePreview.setWater(false);await firePreview.seek(35);});
      if(phase===5){await page.locator('#target').selectOption(String(cycle%5));await page.evaluate(()=>firePreview.setWater(true));}
      if(phase===7)await page.evaluate(async()=>{firePreview.setWater(false);await firePreview.seek(65);firePreview.setWater(true);});
      if(phase===9)await page.evaluate(async()=>{firePreview.setWater(false);await firePreview.seek(115);});
      if(phase===11)await page.evaluate(()=>firePreview.reset());
      if(phase===2||phase===8)await page.locator('#far').click();
      if(phase===4||phase===10)await page.locator('#near').click();
      run.lastPhase=phase;
    }
    const snap=await page.evaluate(()=>({time:firePreview.time,frames:firePreview.frames,triangles:firePreview.triangles,drawCalls:firePreview.drawCalls,particles:firePreview.particles,
      memory:firePreview.memory,lod:firePreview.lod,loadedAssets:firePreview.loadedAssets.length,burning:firePreview.simulation.buildings.filter(b=>b.burning).length,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,error:firePreview.error}));
    const heap=await cdp.send('Runtime.getHeapUsage');
    run.samples.push({elapsedSeconds:elapsed,...snap,observedFps:tick?(snap.frames-lastFrames)/(elapsed-lastTime):null,heapBytes:heap.usedSize});lastFrames=snap.frames;lastTime=elapsed;
    if(snap.error||snap.horizontalOverflow||snap.lod.high+snap.lod.low!==11)throw Error('Sustained-run invariant failed: '+JSON.stringify(snap));
    if(tick%3===0){console.log(JSON.stringify({viewport,elapsed:Math.round(elapsed),cycles:run.cycles,triangles:snap.triangles,drawCalls:snap.drawCalls,particles:snap.particles,geometry:snap.memory.geometries,textures:snap.memory.textures,heapMB:Number((heap.usedSize/1e6).toFixed(1))}));await save();}
    tick++;await page.waitForTimeout(10000);
  }
  await page.evaluate(async()=>{await firePreview.reset();firePreview.setPlaying(false);firePreview.capture();});await cdp.send('HeapProfiler.collectGarbage');
  run.heapEnd=await cdp.send('Runtime.getHeapUsage');run.elapsedSeconds=(Date.now()-started)/1000;run.completedAt=new Date().toISOString();
  const resources=run.samples.map(s=>s.memory);run.resourceBounds={minGeometries:Math.min(...resources.map(s=>s.geometries)),maxGeometries:Math.max(...resources.map(s=>s.geometries)),minTextures:Math.min(...resources.map(s=>s.textures)),maxTextures:Math.max(...resources.map(s=>s.textures))};
  const steady=run.samples.filter(s=>s.elapsedSeconds>=Math.min(240,seconds*.25));
  run.steadyResourceBounds={minGeometries:Math.min(...steady.map(s=>s.memory.geometries)),maxGeometries:Math.max(...steady.map(s=>s.memory.geometries)),minTextures:Math.min(...steady.map(s=>s.memory.textures)),maxTextures:Math.max(...steady.map(s=>s.memory.textures))};
  run.resourceBudgetPassed=run.steadyResourceBounds.maxGeometries-run.steadyResourceBounds.minGeometries<=8&&run.steadyResourceBounds.maxTextures-run.steadyResourceBounds.minTextures<=4&&run.heapEnd.usedSize<64*1024*1024;
  if(!run.resourceBudgetPassed)throw Error('Sustained resource budget failed: '+JSON.stringify(run.steadyResourceBounds));
  delete run.lastPhase;await context.close();await save();
 }
 report.passed=report.errors.length===0&&report.externalRequests.length===0;report.completedAt=new Date().toISOString();
 await fs.writeFile(path.join(root,'verification/soak.json'),JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
}catch(error){report.passed=false;report.failure=error.stack||String(error);await save();console.log(report.failure);process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:report.passed,runs:report.runs.length,errors:report.errors.length}));}
