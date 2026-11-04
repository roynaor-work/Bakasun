// Real-Chromium layout check of the basketball stick area vs the actions: several phone sizes, a
// mid-game rotation, pause/resume, a second touch and a new game. Fails when the stick area leaves the
// left half, touches an action, or sits above an action. Usage: HOOPS_LAT_OUT=/abs/dir node this.mjs
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const shots=process.env.HOOPS_LAT_OUT;if(shots)mkdirSync(shots,{recursive:true});
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
const page=await context.newPage();await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:240000});
await page.locator('[data-action=avatar-start]').click();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;});
const launch=async()=>{await page.evaluate(()=>window.__island.games.stages('streetSlam'));await page.locator('[data-action=hoops-play-next]').click();if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session?.snapshot;return s?.error||s?.renderMetrics?.calls>0&&s.renderMetrics.players===10;},null,{timeout:240000});};
await launch();
const rows=[];
const measure=async label=>{
 const r=await page.evaluate(()=>{const s=document.querySelector('.game-screen[data-game=streetSlam]'),box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,r:b.right,b:b.bottom};},zone=s.querySelector('.hoops-stick-zone'),ring=s.querySelector('.hoops-stick'),z=+getComputedStyle(zone).zIndex;
  const acts=[...s.querySelectorAll('[data-hoops-control]')].filter(e=>!e.closest('[hidden]')&&e.getClientRects().length).map(e=>({key:e.dataset.hoopsControl,...box(e),z:+getComputedStyle(e.closest('.hoops-actions,.hoops-topbar')).zIndex}));
  return {w:innerWidth,h:innerHeight,zone:box(zone),ring:box(ring),zoneZ:z,acts};});
 const hit=(a,b)=>Math.min(a.r,b.r)-Math.max(a.x,b.x)>.5&&Math.min(a.b,b.b)-Math.max(a.y,b.y)>.5;
 assert.ok(r.zone.r<=r.w/2+.5,`${label}: stick area stays in the left half (${r.zone.r} of ${r.w})`);
 assert.ok(r.ring.r<=r.zone.r+.5&&r.ring.x>=r.zone.x-.5,`${label}: ring inside its area`);
 for(const a of r.acts){assert.ok(!hit(r.zone,a),`${label}: stick area overlaps ${a.key}`);assert.ok(a.z>r.zoneZ,`${label}: ${a.key} above the stick layer`);}
 rows.push({label,viewport:r.w+'x'+r.h,zone:r.zone,actions:r.acts.length});console.log('ok',label,r.w+'x'+r.h,'zone right',Math.round(r.zone.r));
};
for(const [w,h] of [[390,844],[844,390],[360,740],[320,568],[740,360],[568,320]]){await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);await measure('size');if(shots)await page.screenshot({path:path.join(shots,`layout-${w}x${h}.png`)});}
// second touch while the first holds the stick, then a touch in the far right (outside the area) must not move it
const cdp=await context.newCDPSession(page),send=(t,p)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:p});
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
const z=await page.evaluate(()=>{const b=document.querySelector('.hoops-stick-zone').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};});
await send('touchStart',[{id:1,x:z.x+z.w-2,y:z.y+z.h/2}]);await page.waitForTimeout(100);
const edge=await page.evaluate(()=>{const b=document.querySelector('.hoops-stick').getBoundingClientRect(),zz=document.querySelector('.hoops-stick-zone').getBoundingClientRect();return {ringRight:b.right,zoneRight:zz.right};});
assert.ok(edge.ringRight<=edge.zoneRight+.5,'touch at the zone edge: ring is clamped inside');
await send('touchStart',[{id:1,x:z.x+z.w-2,y:z.y+z.h/2},{id:2,x:800,y:300}]);await page.waitForTimeout(100);await measure('second touch on the right');
await send('touchEnd',[]);
// rotation while the stick is held, pause/resume, new game
await send('touchStart',[{id:1,x:z.x+60,y:z.y+z.h/2}]);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await measure('rotation with the stick held');await send('touchEnd',[]);
await page.evaluate(()=>{try{localStorage.setItem('island.soccer.handed','left');localStorage.setItem('island.hoops.hand','right');}catch{}});
await page.locator('[data-action=game-pause]').click();await page.waitForTimeout(300);await page.keyboard.press('Escape').catch(()=>{});
await page.evaluate(()=>{const b=document.querySelector('[data-action=game-resume]');b?.click();});await page.waitForTimeout(400);await measure('after pause and resume with saved side values set');
await page.evaluate(()=>window.__island.games.current?.cancel?.());await page.waitForTimeout(500);
await launch();await measure('new game');
console.log(JSON.stringify(rows.length)+' layout checks passed');
await browser.close();server.close();
