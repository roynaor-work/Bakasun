import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const minutes=Number(process.argv[2]||45);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],samples=[],cycles=[],sourceSHA256={},assetSHA256={};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
for(const file of ['app.mjs','world.mjs','loader.mjs','effects.mjs','index.html','style.css'])sourceSHA256[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
async function hashAssets(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())await hashAssets(file);else assetSHA256[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');}}
await hashAssets('assets');await hashAssets('textures');
await page.goto('http://127.0.0.1:8765/workout/island/design/racing-v7/index.html?capture=1&pause=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__racingV7?.state.ready,undefined,{timeout:60000});
const cdp=await context.newCDPSession(page);
// Warm all three environments and every vehicle LOD before the memory baseline.
for(const track of ['coast','neon','ridge'])await page.evaluate(track=>window.__racingV7.inspect({track,mode:'drive',quality:'high',effects:false}),track);
for(const car of ['apex','velour','prism','solis','vector'])for(const lod of [0,1,2])await page.evaluate(options=>window.__racingV7.inspect(options),{car,mode:'garage',quality:'high',forceLOD:lod,effects:false});
await page.evaluate(()=>window.__racingV7.inspect({track:'neon',car:'vector',mode:'drive',quality:'high',effects:true,drift:true,boost:true,contact:true,time:5.8}));
await page.evaluate(()=>window.__racingV7.inspect({track:'coast',car:'apex',mode:'drive',quality:'auto',effects:true}));
await cdp.send('HeapProfiler.collectGarbage');
async function reading(){return{at:new Date().toISOString(),metrics:await page.evaluate(()=>window.__racingV7.metrics()),heap:await cdp.send('Runtime.getHeapUsage')};}
const baseline=await reading();const started=Date.now(),startedAt=new Date(started).toISOString();let cycle=0;
await page.evaluate(()=>window.__racingV7.play());
console.log('SOAK_STARTED',startedAt,minutes,'minutes',JSON.stringify({geometries:baseline.metrics.geometries,textures:baseline.metrics.textures,heapMB:baseline.heap.usedSize/1e6}));
while(Date.now()-started<minutes*60000){
  const track=['coast','neon','ridge'][cycle%3],car=['apex','velour','prism','solis','vector'][cycle%5];
  const viewport=cycle%2?{width:844,height:390}:{width:390,height:844};await page.setViewportSize(viewport);
  await page.evaluate(options=>window.__racingV7.inspect(options),{track,car,mode:'drive',far:cycle%4===3,phase:(cycle*.117+.036)%1,quality:cycle%7===4?'high':'auto',effects:true,drift:cycle%5===2,boost:cycle%7===4});
  await page.evaluate(()=>window.__racingV7.play());
  const cycleStart=Date.now();
  while(Date.now()-cycleStart<55000&&Date.now()-started<minutes*60000){
    await page.waitForTimeout(5000);const sample=await reading();samples.push(sample);
    if(errors.length)break;
  }
  await page.evaluate(()=>window.__racingV7.pause());
  if(cycle%5===4)await cdp.send('HeapProfiler.collectGarbage');
  const last=await reading();cycles.push({cycle,track,car,viewport,last});cycle++;
  const elapsedSeconds=(Date.now()-started)/1000;
  await fs.writeFile(path.join(root,'verification/soak-running.json'),JSON.stringify({status:'running',startedAt,elapsedSeconds,sourceSHA256,assetSHA256,baseline,cycles,samples,errors},null,2)+'\n');
  console.log('SOAK_CYCLE',cycle,track,car,Math.round(elapsedSeconds)+'s',JSON.stringify({fps:Number(last.metrics.fps.toFixed(2)),geometries:last.metrics.geometries,textures:last.metrics.textures,programs:last.metrics.programs,heapMB:Number((last.heap.usedSize/1e6).toFixed(2)),calls:last.metrics.drawCalls,triangles:last.metrics.triangles}));
  if(errors.length)break;
}
await page.evaluate(()=>window.__racingV7.pause());await cdp.send('HeapProfiler.collectGarbage');const final=await reading();
const durationSeconds=(Date.now()-started)/1000;
const limits={maxAdditionalGeometries:25,maxAdditionalTextures:6,maxAdditionalHeapBytes:30000000};
const memoryPass=final.metrics.geometries<=baseline.metrics.geometries+limits.maxAdditionalGeometries&&final.metrics.textures<=baseline.metrics.textures+limits.maxAdditionalTextures&&final.heap.usedSize<=baseline.heap.usedSize+limits.maxAdditionalHeapBytes;
const report={status:'complete',startedAt,finishedAt:new Date().toISOString(),requestedMinutes:minutes,durationSeconds,physicalPhone:false,renderer:baseline.metrics.renderer,sourceSHA256,assetSHA256,baseline,final,limits,memoryPass,cycles,samples,errors,pass:errors.length===0&&memoryPass&&durationSeconds>=minutes*60};
await fs.writeFile(path.join(root,'verification/soak.json'),JSON.stringify(report,null,2)+'\n');
await fs.unlink(path.join(root,'verification/soak-running.json')).catch(()=>{});
console.log('SOAK_FINISHED',JSON.stringify({pass:report.pass,durationSeconds,cycles:cycles.length,memoryPass,errors}));
await browser.close();if(!report.pass)process.exitCode=1;
