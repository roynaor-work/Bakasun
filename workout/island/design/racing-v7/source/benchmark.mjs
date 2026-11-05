import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashRuntime} from './evidence.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceSHA256=await hashRuntime(root);
const label=process.argv[2]||'baseline',seconds=Number(process.argv[3]||10);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.goto('http://127.0.0.1:8765/workout/island/design/racing-v7/index.html?capture=1&pause=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__racingV7?.state.ready,{timeout:60000});
const start=new Date().toISOString(),records=[];
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const track of ['coast','neon','ridge'])for(const quality of ['high','low']){
    await page.evaluate(options=>window.__racingV7.inspect(options),{track,car:'apex',mode:'drive',far:false,quality,effects:true,drift:true,boost:true,contact:true,time:8,phase:.036});
    await page.evaluate(()=>window.__racingV7.play());
    await page.waitForTimeout(1500);
    const before=await page.evaluate(()=>({time:performance.now(),metrics:window.__racingV7.metrics()}));
    const samples=[];
    for(let i=0;i<seconds;i++){
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(()=>window.__racingV7.metrics()));
      if((i+1)%30===0)console.log('BENCH_PROGRESS',`${viewport.width}x${viewport.height}`,track,quality,`${i+1}/${seconds}`,'samples',samples.at(-1).frames-before.metrics.frames,'rendered frames');
    }
    const after=await page.evaluate(()=>{window.__racingV7.pause();return{time:performance.now(),metrics:window.__racingV7.metrics()};});
    const elapsed=(after.time-before.time)/1000,frames=after.metrics.frames-before.metrics.frames;
    const record={viewport,track,quality,effects:{boost:true,drift:true,contactBurstAtStart:true},elapsedSeconds:elapsed,renderedFrames:frames,fps:frames/elapsed,last:after.metrics,samples};
    records.push(record);console.log(track,`${viewport.width}x${viewport.height}`,quality,record.fps.toFixed(1),'fps',after.metrics.triangles,'triangles');
    await fs.writeFile(path.join(root,'verification',`performance-${label}-running.json`),JSON.stringify({status:'running',startedAt:start,sourceSHA256,secondsPerCase:seconds,physicalPhone:false,deviceScaleFactor:2,records,errors},null,2)+'\n');
  }
}
const gl=await page.evaluate(()=>{const c=document.querySelector('#world canvas'),gl=c.getContext('webgl2')||c.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'',renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
const report={label,startedAt:start,finishedAt:new Date().toISOString(),sourceSHA256,secondsPerCase:seconds,browser:await browser.version(),gl,physicalPhone:false,deviceScaleFactor:2,deviceEmulation:'viewport, pixel density and touch only; no claim of physical mobile GPU equivalence',records,errors};
await fs.writeFile(path.join(root,'verification',`performance-${label}.json`),JSON.stringify(report,null,2)+'\n');
await fs.rm(path.join(root,'verification',`performance-${label}-running.json`),{force:true});
await browser.close();if(errors.length)process.exitCode=1;
