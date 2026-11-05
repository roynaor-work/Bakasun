/** Functional, responsive and short performance evidence against the offline HTML. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const report={startedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),rendererMode:'Chromium ANGLE/SwiftShader software; not a physical phone',checks:[],errors:[],externalRequests:[],performance:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true,offline:true});const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,1000));});
page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
const check=(label,pass,details)=>{report.checks.push({label,pass,details});if(!pass)console.log('FAIL',label,details);};
const start=Date.now();await page.setContent(html,{waitUntil:'load'});await page.waitForFunction(()=>window.naval?.ready||window.naval?.error,null,{timeout:60000});
check('Offline startup',await page.evaluate(()=>!!window.naval.ready),{wallMs:Date.now()-start});
await page.waitForTimeout(600);
for(const ship of ['corvette','destroyer','cruiser','carrier'])for(const fleet of ['tide','ember']){
 await page.locator(`[data-ship="${ship}"]`).click();await page.locator(`[data-fleet="${fleet}"]`).click();
 const m=await page.evaluate(()=>window.naval.metrics());check('Selection '+ship+'/'+fleet,m.state.ship===ship&&m.state.fleet===fleet,{triangles:m.triangles});
}
for(const[w,h]of [[390,844],[844,390],[320,568],[360,800],[1440,900]]){
 await page.setViewportSize({width:w,height:h});await page.waitForTimeout(150);
 const r=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,targets:[...document.querySelectorAll('button')].filter(b=>!b.closest('dialog')).map(b=>{const r=b.getBoundingClientRect();return{label:b.getAttribute('aria-label')||b.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height};})}));
 check(`No overflow ${w}×${h}`,r.scrollWidth===r.width,r);
 check(`Touch targets ${w}×${h}`,r.targets.every(b=>b.w>=43.9&&b.h>=43.9&&b.x>=-.1&&b.y>=-.1&&b.x+b.w<=w+.5&&b.y+b.h<=h+.5),r.targets.filter(b=>b.w<43.9||b.h<43.9||b.x<0||b.x+b.w>w+.5));
}
await page.setViewportSize({width:390,height:844});await page.locator('#pause').click();
await page.evaluate(()=>window.naval.setPaused(true));const p0=await page.evaluate(()=>window.naval.metrics().state.time);await page.waitForTimeout(300);const p1=await page.evaluate(()=>window.naval.metrics().state.time);check('Pause freezes simulation',p0===p1,{p0,p1});
await page.locator('#pause').click();await page.waitForTimeout(350);check('Resume advances simulation',await page.evaluate(t=>window.naval.metrics().state.time>t,p1));
await page.locator('#settings').click();check('Native modal opens',await page.locator('#options').evaluate(d=>d.open));await page.keyboard.press('Escape');check('Escape closes modal',!(await page.locator('#options').evaluate(d=>d.open)));
await page.locator('#settings').click();await page.locator('#quality').selectOption('low');check('Low profile changes quality',await page.evaluate(()=>window.naval.metrics().state.quality==='low'));await page.locator('#close-options').click();
await page.locator('#settings').click();await page.locator('#crew-toggle').uncheck();await page.locator('#close-options').click();await page.waitForTimeout(100);check('Crew can be hidden',await page.evaluate(()=>window.naval.metrics().crewInstances===0));
await page.locator('#settings').click();await page.locator('#crew-toggle').check();await page.locator('#close-options').click();
await page.locator('#sea').focus();const a0=await page.evaluate(()=>window.naval.metrics().state.theta);await page.keyboard.press('ArrowLeft');const a1=await page.evaluate(()=>window.naval.metrics().state.theta);check('Keyboard orbit',a1!==a0,{a0,a1});
const z0=await page.evaluate(()=>window.naval.metrics().state.zoom);await page.keyboard.press('+');check('Keyboard zoom',await page.evaluate(z=>window.naval.metrics().state.zoom<z,z0));
const before=await page.evaluate(()=>window.naval.metrics().state.theta);await page.mouse.move(170,420);await page.mouse.down();await page.mouse.move(230,440,{steps:5});await page.mouse.up();check('Pointer orbit',await page.evaluate(a=>window.naval.metrics().state.theta!==a,before));
const touch=await context.newCDPSession(page),pinchStart=await page.evaluate(()=>window.naval.metrics().state.zoom);
const point=(id,x)=>({id,x,y:420,radiusX:8,radiusY:8,force:1});
await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,140),point(2,240)]});
await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,115),point(2,265)]});
await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,80),point(2,300)]});
await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
const pinchEnd=await page.evaluate(()=>window.naval.metrics().state.zoom);check('Real two-contact touch pinch zooms camera',pinchEnd<pinchStart,{pinchStart,pinchEnd});
const touchTheta=await page.evaluate(()=>window.naval.metrics().state.theta);
await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(3,150)]});
await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(3,220)]});
await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
check('One-contact orbit resumes after pinch ends',await page.evaluate(a=>window.naval.metrics().state.theta!==a,touchTheta));await touch.detach();
await page.locator('[data-weather="storm"]').click();check('Storm switch',await page.evaluate(()=>window.naval.metrics().state.weather==='storm'));await page.locator('[data-weather="sunset"]').click();
await page.locator('#salvo').click();await page.waitForTimeout(1800);check('Salvo produces pooled splash',await page.evaluate(()=>window.naval.metrics().effects.active>0));
await page.evaluate(()=>{for(let i=0;i<40;i++)window.naval.effect(i%2?'splash':'explosion');});
const stress=await page.evaluate(()=>window.naval.metrics());check('Particle pool is bounded',stress.effects.active<=stress.effects.capacity,stress.effects);
await page.waitForTimeout(5200);const after=await page.evaluate(()=>window.naval.metrics());check('Particle stress creates no geometry growth',after.geometries===stress.geometries,{before:stress.geometries,after:after.geometries});
for(const profile of ['low','balanced'])for(const[w,h]of [[390,844],[844,390]]){
 await page.setViewportSize({width:w,height:h});
 for(const view of ['near','far']){
  await page.evaluate(({profile,view})=>{window.naval.reset();window.naval.quality(profile);window.naval.setView(view);window.naval.setPaused(false);},{profile,view});
  await page.waitForTimeout(1800);
  const sample=await page.evaluate(()=>new Promise(resolve=>{const t=[];let previous=0,start=0;function tick(s){if(!start)start=s;if(previous)t.push(s-previous);previous=s;if(s-start<4000)requestAnimationFrame(tick);else{const a=t.slice().sort((a,b)=>a-b);resolve({frames:t.length,wallMs:s-start,meanMs:t.reduce((a,b)=>a+b,0)/t.length,p95Ms:a[Math.floor(a.length*.95)],metrics:window.naval.metrics()});}}requestAnimationFrame(tick);}));
  report.performance.push({profile,viewport:[w,h],view,...sample});console.log('PERF',profile,w,h,view,(sample.frames/sample.wallMs*1000).toFixed(1),'fps',sample.metrics.triangles,'tris');
 }
}
await context.close();
const reduce=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',offline:true});const rp=await reduce.newPage();await rp.setContent(html);await rp.waitForFunction(()=>window.naval?.ready,null,{timeout:60000});const rm=await rp.evaluate(()=>window.naval.metrics());check('Reduced motion starts paused',rm.state.paused&&rm.reducedMotion,rm.state);await reduce.close();
const dense=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',offline:true});
const dp=await dense.newPage();dp.on('pageerror',e=>report.errors.push(String(e)));dp.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
await dp.setContent(html);await dp.waitForFunction(()=>window.naval?.ready,null,{timeout:60000});
const caps=await dp.evaluate(()=>['balanced','high','low'].map(profile=>{window.naval.quality(profile);const m=window.naval.metrics();return{profile,dpr:m.viewport.dpr,width:m.viewport.bufferWidth,height:m.viewport.bufferHeight};}));
check('High-density phone DPR respects all profile caps',caps.every(m=>Math.abs(m.dpr-({balanced:1.25,high:1.7,low:.78}[m.profile]))<.001&&m.width<=Math.ceil(390*m.dpr)&&m.height<=Math.ceil(844*m.dpr)),{deviceDpr:3,caps});await dense.close();
report.completedAt=new Date().toISOString();report.pass=report.checks.every(c=>c.pass)&&report.errors.length===0&&report.externalRequests.length===0;
await fs.writeFile(path.join(root,'verification/browser-exercise.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,failures:report.checks.filter(c=>!c.pass),errors:report.errors,externalRequests:report.externalRequests},null,2));if(!report.pass)process.exitCode=1;
