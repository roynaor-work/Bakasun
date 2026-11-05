/** Sustained real-time rendering, navigation and pool-reuse evidence.
 * Default: 75 minutes after warmup. Never substitutes for physical-phone testing.
 * Usage: node tools/soak-browser.mjs [minutes]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const minutes=Number(process.argv[2]||75);if(!Number.isFinite(minutes)||minutes<1)throw new Error('Invalid duration');
let interrupted=false;process.once('SIGINT',()=>{interrupted=true;});
const html=await fs.readFile(path.join(root,'index.html'),'utf8'),duration=minutes*60_000;
const report={startedAt:new Date().toISOString(),requestedMinutes:minutes,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),mode:'Real-time Chromium/SwiftShader software; offline embedded HTML; no physical phone',samples:[],phases:[],errors:[],externalRequests:[],pass:false};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});const page=await context.newPage();
page.on('pageerror',e=>{report.errors.push(String(e));console.log('ERROR',String(e).slice(0,600));});
page.on('console',m=>{if(m.type()==='error'){report.errors.push(m.text().slice(0,1200));console.log('ERROR',m.text().slice(0,600));}});
page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
await page.setContent(html,{waitUntil:'load'});await page.waitForFunction(()=>window.naval?.ready||window.naval?.error,null,{timeout:60000});
if(await page.evaluate(()=>window.naval.error))throw new Error(await page.evaluate(()=>window.naval.error));
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
const kinds=['corvette','destroyer','cruiser','carrier'];
// Warm every model, fleet, LOD and weather shader before comparing resources.
for(const ship of kinds)for(const fleet of ['tide','ember'])for(const view of ['near','far']){
 await page.evaluate(o=>{window.naval.selectShip(o.ship);window.naval.setFleet(o.fleet);window.naval.setView(o.view);window.naval.setWeather(o.fleet==='tide'?'sunset':'storm');window.naval.quality(o.view==='near'?'balanced':'low');window.naval.setPaused(false);},{ship,fleet,view});
 await page.waitForTimeout(700);
}
await page.evaluate(()=>{window.naval.reset();window.naval.setPaused(false);});
const warm=await page.evaluate(()=>window.naval.metrics());report.warmResources={geometries:warm.geometries,textures:warm.textures,programs:warm.programs};
const started=Date.now();report.renderStartedAt=new Date(started).toISOString();let phase=-1,lastShot=-1;
async function save(){await fs.writeFile(path.join(root,'verification/soak-progress.json'),JSON.stringify({startedAt:report.renderStartedAt,requestedMinutes:minutes,elapsedMinutes:(Date.now()-started)/60_000,phases:report.phases.length,samples:report.samples.length,last:report.samples.at(-1),errors:report.errors.length,externalRequests:report.externalRequests.length},null,2)+'\n');}
try{
 while(Date.now()-started<duration&&!interrupted){
  const nextPhase=Math.floor((Date.now()-started)/60_000);
  if(nextPhase!==phase){
   phase=nextPhase;const viewport=phase%2?[844,390]:[390,844],ship=kinds[phase%4],fleet=Math.floor(phase/4)%2?'ember':'tide',view=phase%3?'near':'far',weather=phase%4===0?'storm':'sunset',quality=phase%12===11?'high':phase%5===4?'low':'balanced';
   await page.setViewportSize({width:viewport[0],height:viewport[1]});
   await page.evaluate(o=>{window.naval.selectShip(o.ship);window.naval.setFleet(o.fleet);window.naval.setView(o.view);window.naval.setWeather(o.weather);if(window.naval.metrics().state.quality!==o.quality)window.naval.quality(o.quality);window.naval.setPaused(false);},{ship,fleet,view,weather,quality});
   const entry={phase,at:new Date().toISOString(),viewport,ship,fleet,view,weather,quality};report.phases.push(entry);console.log('PHASE',JSON.stringify(entry));
  }
  await page.evaluate(()=>{window.naval.shoot();window.naval.effect('splash');});
  await page.waitForTimeout(Math.min(15000,Math.max(50,duration-(Date.now()-started))));
  const metrics=await page.evaluate(()=>window.naval.metrics()),perf=await cdp.send('Performance.getMetrics');
  const heap=perf.metrics.find(m=>m.name==='JSHeapUsedSize')?.value||0;
  const sample={at:new Date().toISOString(),elapsedSeconds:(Date.now()-started)/1000,phase,heapUsedBytes:heap,metrics};report.samples.push(sample);
  if(metrics.effects.active>metrics.effects.capacity||metrics.dracoWorkers>2)throw new Error('Pool or worker bound exceeded');
  if(metrics.geometries>120||metrics.textures>24||metrics.programs>40)throw new Error('Unexpected GPU resource growth');
  const shot=Math.floor((Date.now()-started)/900_000);
  if(shot!==lastShot){lastShot=shot;await page.screenshot({path:path.join(root,`verification/soak-${String(shot).padStart(2,'0')}.png`)});}
  await save();
 }
 report.completedAt=new Date().toISOString();report.actualRenderMinutes=(Date.now()-started)/60_000;
 const peak=key=>Math.max(...report.samples.map(s=>s.metrics[key]));
 const last=report.samples.slice(-20),heaps=last.map(s=>s.heapUsedBytes);
 report.summary={phases:report.phases.length,samples:report.samples.length,peakGeometries:peak('geometries'),peakTextures:peak('textures'),peakPrograms:peak('programs'),lastHeapMinBytes:Math.min(...heaps),lastHeapMaxBytes:Math.max(...heaps),allPoolsBounded:true,allWorkersBounded:true};
 report.interrupted=interrupted;report.pass=!interrupted&&report.actualRenderMinutes>=minutes&&report.errors.length===0&&report.externalRequests.length===0;
}catch(error){report.errors.push(String(error));report.completedAt=new Date().toISOString();console.error(String(error));}
await fs.writeFile(path.join(root,'verification/soak-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
console.log('SOAK COMPLETE',JSON.stringify({pass:report.pass,actualRenderMinutes:report.actualRenderMinutes,summary:report.summary,errors:report.errors,externalRequests:report.externalRequests}));if(!report.pass)process.exitCode=1;
