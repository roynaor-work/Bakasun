/** Offline cold-load, context-loss/recovery and explicit disposal cycles.
 * Usage: node tools/reload-browser.mjs [minutes=45] [artifact-prefix=reload]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const minutes=Number(process.argv[2]||45),prefix=process.argv[3]||'reload';
if(!Number.isFinite(minutes)||minutes<=0||!/^[a-z0-9-]+$/.test(prefix))throw new Error('Invalid arguments');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const report={startedAt:new Date().toISOString(),requestedMinutes:minutes,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),offline:true,rendererMode:'Chromium/SwiftShader software; not a physical phone',cycles:[],errors:[],externalRequests:[],pass:false};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const begun=Date.now(),deadline=begun+minutes*60000;const kinds=['corvette','destroyer','cruiser','carrier'];
try{
 for(let i=0;Date.now()<deadline;i++){
  const cycleStart=Date.now(),landscape=Math.floor(i/4)%2===1,viewport=landscape?{width:844,height:390}:{width:390,height:844};
  const context=await browser.newContext({viewport,deviceScaleFactor:1,offline:true,hasTouch:true,isMobile:true});const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,1200));});page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
  const loaded=Date.now();await page.setContent(html);await page.waitForFunction(()=>window.naval?.ready||window.naval?.error,null,{timeout:60000});
  if(await page.evaluate(()=>window.naval.error))throw new Error(await page.evaluate(()=>window.naval.error));
  const entry={cycle:i,startedAt:new Date(cycleStart).toISOString(),viewport,ship:kinds[i%4],fleet:(i+Math.floor(i/4))%2?'ember':'tide',weather:Math.floor(i/8)%2?'storm':'sunset',coldLoadMs:Date.now()-loaded,contextLoss:null,lifecycleFreeze:false};
  await page.evaluate(o=>{window.naval.selectShip(o.ship);window.naval.setFleet(o.fleet);window.naval.setWeather(o.weather);window.naval.setView(o.cycle%3?'near':'far');window.naval.setPaused(false);},entry);
  await page.waitForTimeout(5000);
  if(i%3===0){
   entry.contextLoss=await page.evaluate(async()=>{
    const canvas=document.querySelector('#sea'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)return{supported:false};
    const events=[];canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();events.push('lost');},{once:true});canvas.addEventListener('webglcontextrestored',()=>events.push('restored'),{once:true});
    const before=window.naval.metrics().state.time;ext.loseContext();await new Promise(r=>setTimeout(r,350));ext.restoreContext();
    const deadline=performance.now()+10000;while(!events.includes('restored')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,600));return{supported:true,events,before,after:window.naval.metrics().state.time,triangles:window.naval.metrics().triangles};
   });
   if(entry.contextLoss.supported&&(!entry.contextLoss.events.includes('restored')||entry.contextLoss.triangles<=0||entry.contextLoss.after<=entry.contextLoss.before))throw new Error('WebGL context did not recover and resume animation');
  }
  if(i%4===0){
   const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');
   const before=await page.evaluate(()=>window.naval.metrics().state.time);
   await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await page.waitForTimeout(450);
   await cdp.send('Page.setWebLifecycleState',{state:'active'});await page.waitForTimeout(500);
   const after=await page.evaluate(()=>window.naval.metrics().state.time);
   await cdp.detach();entry.lifecycleFreeze=true;entry.lifecycleTime={before,after};
   if(after<=before)throw new Error('Animation did not resume after lifecycle freeze');
  }
  const until=Math.min(cycleStart+55000,deadline);
  while(Date.now()<until){await page.evaluate(()=>{window.naval.shoot();window.naval.effect('splash');});await page.waitForTimeout(Math.min(8000,Math.max(20,until-Date.now())));}
  entry.beforeDispose=await page.evaluate(()=>window.naval.metrics());
  if(i%15===0)await page.screenshot({path:path.join(root,`verification/${prefix}-${String(i).padStart(2,'0')}.png`)});
  entry.afterDispose=await page.evaluate(()=>{window.naval.dispose();const m=window.naval.metrics();return{geometries:m.geometries,textures:m.textures,programMetadataCount:m.programs};});
  entry.completedAt=new Date().toISOString();report.cycles.push(entry);
  if(entry.afterDispose.geometries!==0||entry.afterDispose.textures!==0)throw new Error('GPU geometry/texture counters did not clear');
  if(entry.beforeDispose.effects.active>entry.beforeDispose.effects.capacity)throw new Error('Particle pool exceeded its bound');
  await context.close();
  await fs.writeFile(path.join(root,`verification/${prefix}-progress.json`),JSON.stringify({startedAt:report.startedAt,requestedMinutes:minutes,elapsedMinutes:(Date.now()-begun)/60000,cycles:report.cycles.length,last:entry,errors:report.errors.length,externalRequests:report.externalRequests.length},null,2)+'\n');
  console.log('CYCLE',i,entry.ship,entry.fleet,'load',entry.coldLoadMs,'ms; recovered',entry.contextLoss?.events?.join('/'),'disposed',JSON.stringify(entry.afterDispose));
 }
 report.completedAt=new Date().toISOString();report.actualMinutes=(Date.now()-begun)/60000;
 report.summary={cycles:report.cycles.length,contextLosses:report.cycles.filter(c=>c.contextLoss?.supported).length,recoveries:report.cycles.filter(c=>c.contextLoss?.events?.includes('restored')).length,lifecycleFreezes:report.cycles.filter(c=>c.lifecycleFreeze).length,allDisposalsClear:report.cycles.every(c=>c.afterDispose.geometries===0&&c.afterDispose.textures===0),coldLoadMeanMs:report.cycles.reduce((a,c)=>a+c.coldLoadMs,0)/Math.max(1,report.cycles.length)};
 report.pass=report.actualMinutes>=minutes&&report.errors.length===0&&report.externalRequests.length===0;
}catch(error){report.errors.push(String(error));report.completedAt=new Date().toISOString();console.error(String(error));}
await fs.writeFile(path.join(root,`verification/${prefix}-report.json`),JSON.stringify(report,null,2)+'\n');await browser.close();console.log('RELOAD COMPLETE',JSON.stringify({pass:report.pass,actualMinutes:report.actualMinutes,summary:report.summary,errors:report.errors}));if(!report.pass)process.exitCode=1;
