// Deterministic UI and timeline checks against the delivered assets and real DOM.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain','.md':'text/plain'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root+sep)&&path!==root){res.writeHead(403).end();return;}const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/preview.html`;
const errors=[],remote=[],checks=[],screenshots=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1});
context.on('request',req=>{if(!req.url().startsWith(`http://127.0.0.1:${server.address().port}/`))remote.push(req.url());});
const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
const snapshot=()=>page.evaluate(()=>window.tennisFxSnapshot());
const click=selector=>page.locator(selector).dispatchEvent('click');
const range=async(id,value)=>{await page.locator(`#${id}`).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
const record=name=>checks.push(name);
const shot=async name=>{await page.screenshot({path:resolve(root,'verification',name),type:'webp',quality:88});screenshots.push(name);};
try {
  await page.clock.install({time:new Date('2026-11-14T12:00:00Z')});
  await page.goto(url);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.clock.pauseAt(new Date('2026-11-14T12:00:01Z'));
  assert.equal((await snapshot()).rafActive,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
  const rect=await page.locator('.stage').boundingBox();assert.deepEqual(rect,{x:0,y:0,width:844,height:390});
  const small=await page.locator('.stage button').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width<48||r.height<48;}).map(n=>n.id));assert.deepEqual(small,[]);
  await shot('preview-844x390.webp');
  record('844×390: exact court bounds, no horizontal overflow, every scene touch target ≥48px, idle RAF stopped');

  await page.locator('#move-left').click();assert.equal((await snapshot()).serve,0);assert.equal(await page.locator('#move-left').isDisabled(),true);
  await page.keyboard.press('ArrowLeft');assert.equal((await snapshot()).serve,0);
  await page.keyboard.press('ArrowRight');assert.equal((await snapshot()).serve,1);
  await page.keyboard.press('ArrowRight');assert.equal((await snapshot()).serve,2);
  await page.keyboard.press('ArrowRight');assert.equal((await snapshot()).serve,2);assert.equal(await page.locator('#move-right').isDisabled(),true);
  await page.clock.runFor(200);
  assert.equal(await page.locator('#serve-arrow').evaluate(n=>n.style.left),'511px');
  await page.keyboard.press('ArrowLeft');record('Serve: real clicks + keyboard; left/center/right, physical directions in RTL, clamped endpoints');

  await click('[data-event="out"]:visible');const outStart=await snapshot();
  assert.equal(await page.locator('#sign-text').textContent(),'אאוט');assert.equal(await page.locator('#cross').isVisible(),true);
  const fixed=await page.locator('#cross').evaluate(n=>({left:n.style.left,top:n.style.top,opacity:getComputedStyle(n).opacity}));
  await page.clock.runFor(1490);assert.equal((await snapshot()).active.out,true);
  assert.deepEqual(await page.locator('#cross').evaluate(n=>({left:n.style.left,top:n.style.top,opacity:getComputedStyle(n).opacity})),fixed);
  await page.clock.runFor(35);assert.equal((await snapshot()).active.out,false);assert.equal(await page.locator('#cross').isVisible(),false);
  const outEnd=await snapshot();record('Out: anchored and fully opaque through 1490ms, cleared on first rendered frame after 1500ms');

  await click('[data-event="out"]:visible');await page.clock.runFor(400);await click('#pause');const paused=await snapshot();
  await page.clock.runFor(5000);assert.deepEqual(await snapshot(),paused);assert.equal(paused.paused,true);
  await click('#pause');await page.clock.runFor(1150);assert.equal((await snapshot()).active.out,false);
  await page.clock.runFor(40000);await click('[data-event="out"]:visible');await page.clock.runFor(30);assert.equal((await snapshot()).active.out,true);
  record('Simulation clock: pause freezes timers and RAF; resumes remaining duration; new effects survive long idle gaps');

  await click('[data-event="dust"]:visible');await page.clock.runFor(25);const seen=[];
  for(let i=0;i<6;i++){const snap=await snapshot();seen.push(snap.dustFrame);assert.equal(snap.dustFrame,i);if(i<5)await page.clock.runFor(60);}
  await page.clock.runFor(60);assert.equal((await snapshot()).active.dust,false);
  record('Dust: all six actual exported frames 0..5 at 60ms intervals, cleared after 360ms, no loop');
  await click('[data-event="line"]:visible');await page.clock.runFor(100);assert.equal((await snapshot()).active.line,true);
  await page.clock.runFor(470);assert.equal((await snapshot()).active.line,false);record('Line contact: 550ms one-shot ring plus clay landing');

  const shadowSamples=[];
  for(const h of [0,.75,1.5,2.25,3]){
    await range('height',h);
    const values=await page.locator('.shadow').evaluateAll(nodes=>nodes.map(n=>({opacity:Number(n.style.opacity),left:n.style.left,top:n.style.top})));
    assert.ok(Math.abs(values.reduce((s,v)=>s+v.opacity,0)-1)<1e-6);assert.ok(values.every(v=>v.left==='447px'&&v.top==='242px'));
    shadowSamples.push({height:h,weights:values.map(v=>v.opacity)});
  }
  assert.deepEqual(shadowSamples.map(s=>s.weights),[[1,0,0],[.5,.5,0],[0,1,0],[0,.5,.5],[0,0,1]]);
  record('Shadow: 0–3m continuous crossfade, weights sum to one, all shadows stay on the same ground point');

  const powerSamples=[];
  for(const p of [0,.42,1]){await range('power',p);powerSamples.push(await page.locator('#power-fill').evaluate(n=>n.style.clipPath));assert.equal((await snapshot()).power,p);}
  assert.equal(powerSamples[0],'inset(86.7188% 0px 13.2812%)');assert.equal(powerSamples[2],'inset(12.5% 0px 13.2812%)');
  await range('power',.2);const hold=page.locator('#drop-hold');await hold.focus();await page.keyboard.down(' ');await page.clock.runFor(300);assert.ok((await snapshot()).power>.35);await page.keyboard.up(' ');assert.equal((await snapshot()).active.flight,true);
  await page.clock.runFor(1550);assert.equal((await snapshot()).height,0);
  assert.deepEqual(await page.locator('#shadow-low').evaluate(n=>[n.style.left,n.style.top,n.style.opacity]),['472px','276px','1']);
  const box=await hold.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.clock.runFor(180);assert.equal(await hold.evaluate(n=>n.classList.contains('charging')),true);await page.mouse.up();assert.equal(await hold.evaluate(n=>n.classList.contains('charging')),false);
  await page.clock.runFor(1550);record('Drop power: 0/42/100% bottom-up clip; keyboard hold and real pointer capture charge/release, landing and dust');

  for(const format of ['256','512','svg']){
    await page.selectOption('#format',format);await page.waitForFunction(v=>window.tennisFxSnapshot().format===v,format);
    await page.waitForFunction(()=>Array.from(document.images).every(n=>n.complete&&n.naturalWidth>0));
    const srcs=await page.locator('img[data-asset]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
    assert.ok(srcs.every(src=>format==='svg'?src.startsWith('svg/'):src.startsWith(`png/${format}/`)));
    assert.equal(await page.locator('#cross').evaluate(n=>n.style.left),fixed.left);
  }
  record('Every image loads in SVG, PNG-256 and PNG-512; identical dimensions and anchoring across formats');

  await click('[data-event="net"]:visible');assert.equal(await page.locator('#sign-text').textContent(),'נטו');
  await page.locator('#sign-text').evaluate(n=>{n.textContent='בדיקה';});assert.equal(await page.locator('#sign-art').getAttribute('data-asset'),'sign-net');
  record('Signs: live Hebrew DOM text, out/net icons, aria-live event announcement; image unchanged when text changes');
  await page.clock.runFor(1600);await range('height',1.2);await range('power',.42);
  await click('[data-event="out"]:visible');await click('[data-event="line"]:visible');await click('[data-event="dust"]:visible');await page.clock.runFor(145);await click('#pause');
  await page.evaluate(()=>document.activeElement.blur());await shot('effects-844x390.webp');
  await page.setViewportSize({width:1200,height:1800});await page.clock.runFor(32);
  const desktop=await page.locator('.stage').boundingBox();assert.equal(desktop.x,0);assert.equal(desktop.y,0);assert.equal(desktop.width,1200);assert.ok(Math.abs(desktop.height-1200*390/844)<.01);
  await page.screenshot({path:resolve(root,'verification/overview-1200.webp'),type:'webp',quality:85,fullPage:true});screenshots.push('overview-1200.webp');
  record('Desktop 1200px: stage scales from the top-left with all edges and controls inside the frame');

  await page.setViewportSize({width:390,height:844});await page.clock.runFor(32);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  const portraitTargets=await page.locator('.compact-controls button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height];}));assert.ok(portraitTargets.every(([w,h])=>w>=48&&h>=48));
  await page.locator('.compact-controls [data-serve="-1"]').tap();assert.equal((await snapshot()).serve,0);
  await page.locator('.compact-controls [data-serve="1"]').tap();assert.equal((await snapshot()).serve,1);
  await page.evaluate(()=>window.scrollTo(0,0));await shot('preview-390x844.webp');record('390×844: no horizontal overflow, separate ≥48px touch controls, real touch moves the selector');

  await page.setViewportSize({width:844,height:390});await page.emulateMedia({reducedMotion:'reduce'});await click('#pause');
  await click('[data-event="dust"]:visible');assert.equal((await snapshot()).dustFrame,2);await page.clock.runFor(150);assert.equal((await snapshot()).dustFrame,2);await page.clock.runFor(50);assert.equal((await snapshot()).active.dust,false);
  assert.equal(await page.locator('#serve-arrow').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
  await click('[data-event="out"]:visible');await page.clock.runFor(1490);assert.equal((await snapshot()).active.out,true);await page.clock.runFor(35);assert.equal((await snapshot()).active.out,false);
  record('Reduced motion: static dust frame 3 for 180ms, no arrow transition, full 1500ms out lifetime retained');

  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  record('No console errors, failed resources or remote network requests');
  const report={status:'pass',browser:await browser.version(),device:'Chromium viewport/touch emulation; no physical-phone performance claim',checks,outBoundary:{startTime:outStart.time,endTime:outEnd.time,presentAtMs:1490,absentAtMs:1525},dustFramesSeen:seen,shadowSamples,powerClipSamples:powerSamples,errors,remoteRequests:remote,screenshots};
  await writeFile(resolve(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
