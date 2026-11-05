import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashRuntime} from './evidence.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceSHA256=await hashRuntime(root);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));
const start=new Date().toISOString();
function check(pass,description){checks.push({pass:!!pass,description});if(!pass)console.log('FAIL',description);}
async function state(){return page.evaluate(()=>({...window.__racingV7.state}));}
await page.goto('http://127.0.0.1:8765/workout/island/design/racing-v7/index.html?capture=1&pause=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__racingV7?.state.ready,undefined,{timeout:60000});
for(const track of ['neon','ridge','coast']){
  await page.locator(`[data-track="${track}"]`).click();await page.waitForFunction(track=>window.__racingV7.state.track===track,track);
  check(await page.locator(`[data-track="${track}"]`).getAttribute('aria-pressed')==='true',`${track}: active destination control`);
}
for(const car of ['velour','prism','solis','vector','apex']){
  await page.locator(`[data-car="${car}"]`).click();await page.waitForFunction(car=>window.__racingV7.state.car===car,car);
  check(await page.locator(`[data-car="${car}"]`).getAttribute('aria-pressed')==='true',`${car}: active car control`);
}
for(const color of ['#ef6c32','#8b5cf6','#e8dfc4','#c2e940','#14c6b8']){
  await page.locator(`[data-color="${color}"]`).click();
  const actual=await page.evaluate(()=>window.__racingV7.hero.userData.paint[0].color.getHexString());
  check(actual===color.slice(1),`${color}: visible paint material matches selected swatch`);
}
const cameraBefore=await page.evaluate(()=>window.__racingV7.camera.position.toArray());
await page.locator('#distanceButton').click();
const cameraAfter=await page.evaluate(()=>window.__racingV7.camera.position.toArray());
check(Math.hypot(...cameraAfter.map((v,i)=>v-cameraBefore[i]))>5,'distance control moves the camera');
await page.locator('#distanceButton').click();
await page.locator('#pauseButton').click();const timeBefore=(await state()).time;
const advanced=await page.waitForFunction(before=>window.__racingV7.state.time>before,timeBefore,{timeout:15000}).then(()=>true,()=>false);
check(advanced,'play advances displayed time');
await page.locator('#pauseButton').click();const pausedTime=(await state()).time;await page.waitForTimeout(400);
check((await state()).time===pausedTime,'pause freezes displayed time');
await page.locator('#boostButton').click();check((await state()).boost,'boost control activates');await page.locator('#boostButton').click();
await page.locator('#driftButton').click();check((await state()).drift,'drift control activates');await page.locator('#driftButton').click();
await page.locator('#infoButton').click();check(await page.locator('#infoDialog').evaluate(d=>d.open),'information dialog opens');
await page.locator('#qualitySelect').selectOption('low');check((await page.evaluate(()=>window.__racingV7.metrics())).lowBudget,'low quality uses the shared reduced budget path');
await page.locator('#paceRange').focus();await page.keyboard.press('End');check((await state()).speed===240,'native range keyboard updates pace');
await page.locator('#motionToggle').uncheck();check(!(await state()).effects,'motion control disables velocity effects');await page.locator('#motionToggle').check();
await page.screenshot({path:path.join(root,'verification/ui-settings-390x844.jpg'),type:'jpeg',quality:91});
await page.keyboard.press('Escape');check(!(await page.locator('#infoDialog').evaluate(d=>d.open)),'Escape closes the dialog');
await page.locator('#overviewButton').click();check((await state()).mode==='overview'&&(await state()).paused,'full circuit view pauses animation');
await page.locator('#overviewButton').click();check((await state()).mode==='drive'&&(await state()).paused,'return from circuit view preserves previous pause');
await page.locator('#pauseButton').click();await page.locator('#overviewButton').click();await page.locator('#overviewButton').click();check(!(await state()).paused,'return from circuit view resumes previous playback');
await page.locator('#pauseButton').click();
await page.locator('#garageButton').click();const orbitBefore=(await state()).orbit;
await page.mouse.move(190,450);await page.mouse.down();await page.mouse.move(270,470,{steps:6});await page.mouse.up();
check(Math.abs((await state()).orbit-orbitBefore)>.1,'dragging orbits around the car');
const cdp=await context.newCDPSession(page),zoomBefore=(await state()).orbitZoom;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:450,id:1},{x:220,y:450,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:450,id:1},{x:240,y:450,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130,y:450,id:1},{x:260,y:450,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
check((await state()).orbitZoom<zoomBefore,'native two-touch pinch changes zoom');
await page.keyboard.press('d');check((await state()).mode==='drive','D returns to driving');
for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  const outside=await page.locator('#app button').evaluateAll(buttons=>buttons.filter(el=>!el.closest('dialog')).map(el=>({label:el.getAttribute('aria-label')||el.textContent.trim(),r:el.getBoundingClientRect()})).filter(({r})=>r.width>0&&r.height>0&&(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)).map(x=>x.label));
  check(outside.length===0,`${size.width}x${size.height}: every visible control stays inside the viewport`);
}
// Rapid selections exercise cancellation and clean-up across asynchronous loads.
await page.evaluate(()=>{for(const id of ['neon','ridge','coast'])document.querySelector(`[data-track="${id}"]`).click();});
await page.waitForFunction(()=>window.__racingV7.state.track==='coast');await page.waitForTimeout(600);
check((await state()).track==='coast'&&(await state()).ready,'rapid environment selection finishes on the last requested scene');
await page.evaluate(()=>{const c=document.querySelector('#world canvas'),g=c.getContext('webgl2')||c.getContext('webgl');g.getExtension('WEBGL_lose_context').loseContext();});
await page.waitForTimeout(300);check(!(await state()).ready,'context loss stops the renderer and exposes the reload message');
await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__racingV7?.state.ready,undefined,{timeout:60000});check((await state()).ready,'reload recovers from a lost graphics context');
const report={startedAt:start,finishedAt:new Date().toISOString(),sourceSHA256,checks,errors,pass:checks.every(c=>c.pass)&&errors.length===0};
await fs.writeFile(path.join(root,'verification/interactions.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:checks.length,failures:checks.filter(c=>!c.pass),errors}));
await browser.close();if(!report.pass)process.exitCode=1;
