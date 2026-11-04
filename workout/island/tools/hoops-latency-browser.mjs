// Real-Chromium (SwiftShader) measurement of the basketball joystick: touch -> sim -> rendered motion,
// plus the layout position of the stick zone and the actions (screenshots when HOOPS_LAT_OUT is set).
// Reuses the fixture of tests/hoops-gameplay-browser.mjs. Usage: PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... \
//   HOOPS_LAT_OUT=/abs/dir node workout/island/tools/hoops-latency-browser.mjs [json-out]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),shots=process.env.HOOPS_LAT_OUT;
if(shots)mkdirSync(shots,{recursive:true});
const testSrc=readFileSync(path.join(here,'../tests/hoops-gameplay-browser.mjs'),'utf8');
const fixtureSrc=testSrc.match(/function installFixture\(\)\{[\s\S]*?\n\}\n\ntry\{/)[0].replace(/\n\ntry\{$/,'');
const server=await serveIsland('/workout/island/'),base=server.url;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const results=[];
for(const stub of [true,false])for(const [width,height] of [[844,390],[390,844]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
 await page.goto(base+'?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:240000});
 await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;});
 await page.evaluate(()=>window.__island.games.stages('streetSlam'));
 await page.locator('[data-action=hoops-play-next]').click();
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session?.snapshot;return s?.error||s?.renderMetrics?.calls>0&&s.renderMetrics.players===10;},null,{timeout:240000});
 await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});
 await page.evaluate(`(${fixtureSrc})()`);
 await page.evaluate(stub=>{ // instrumentation: raw pointer times, consumed frames, interpolated render position of the controlled player
  const d=window.__island.games.current.session.debug,Q=window.__hoopsQA;Q.lat={ptr:[],frame:[],render:[]};
  for(const t of ['pointerdown','pointermove','pointerup'])window.addEventListener(t,e=>Q.lat.ptr.push({t,at:performance.now(),x:e.clientX,y:e.clientY,id:e.pointerId}),true);
  const c=d.controls.consume;d.controls.consume=()=>{const f=c();Q.lat.frame.push({at:performance.now(),mx:f.move.x,mz:f.move.z,sprint:f.sprint,shootDown:f.shootDown,passPress:f.passPress});return f;};
  const v=d.view,r0=v.render.bind(v),r=stub?()=>undefined:r0;v.render=(prev,cur,a,dt)=>{const o=r(prev,cur,a,dt);const id=cur.controlled,p=prev.players.find(q=>q.id===id),q=cur.players.find(q=>q.id===id);
   if(p&&q)Q.lat.render.push({at:performance.now(),x:p.x+(q.x-p.x)*a,z:p.z+(q.z-p.z)*a,cx:q.x,cz:q.z});return o;};
  Q.lat.render.length=0;
 },stub);
 const cdp=await context.newCDPSession(page),send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const geo=await page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};const s=document.querySelector('.game-screen[data-game=streetSlam]');
  return {zone:r(s.querySelector('.hoops-stick-zone')),ring:r(s.querySelector('.hoops-stick')),actions:[...s.querySelectorAll('[data-hoops-control]')].filter(b=>!b.closest('[hidden]')&&b.getClientRects().length).map(b=>({key:b.dataset.hoopsControl,...r(b)}))};});
 const reach=await page.evaluate(()=>{const s=document.querySelector('.game-screen[data-game=streetSlam]'),sel=['[data-action=game-pause]','.hoops-kit-trigger','[data-hoops-control]'];const out=[];for(const q of sel)for(const e of s.querySelectorAll(q)){if(e.closest('[hidden]')||!e.getClientRects().length)continue;const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);out.push({el:e.dataset.hoopsControl||e.dataset.action||e.className,reachable:!!hit&&(e===hit||e.contains(hit))});}return out;});
 const trials=[],runLoop=()=>page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.hold=false;});
 // trial: touch inside the left thumb area, wait, drag 36 px right, measure
 const touchPoint={x:Math.round(geo.ring.x+geo.ring.w/2),y:Math.round(geo.ring.y+geo.ring.h/2)};
 if(shots&&!stub)await page.screenshot({path:path.join(shots,`${width}x${height}-idle.png`)});
 if(shots&&!stub){await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});const fp={x:Math.round(geo.zone.x+geo.zone.w*.55),y:Math.round(geo.zone.y+geo.zone.h*.3)};await send('touchStart',[{id:7,x:fp.x,y:fp.y}]);await page.waitForTimeout(150);await send('touchMove',[{id:7,x:fp.x-30,y:fp.y+22}]);await page.waitForTimeout(150);await page.screenshot({path:path.join(shots,`${width}x${height}-floating.png`)});const fr=await page.evaluate(()=>{const r=document.querySelector('.hoops-stick').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});geo.floating={touch:fp,ringCenter:{x:Math.round(fr.x),y:Math.round(fr.y)}};await send('touchEnd',[]);}
 for(let i=0;i<8;i++){
  await page.evaluate(()=>window.__hoopsQA.fixture('attack'));await page.evaluate(()=>{const Q=window.__hoopsQA;Q.lat.ptr.length=Q.lat.frame.length=Q.lat.render.length=0;});
  await runLoop();await page.waitForTimeout(400);
  await send('touchStart',[{id:1,x:touchPoint.x,y:touchPoint.y}]);await page.waitForTimeout(150);
  await page.evaluate(()=>{const Q=window.__hoopsQA;Q.lat.ptr.length=Q.lat.frame.length=0;Q.lat.render.length=0;});
  await send('touchMove',[{id:1,x:touchPoint.x+36,y:touchPoint.y}]);await page.waitForTimeout(500);
  if(shots&&!stub&&i===0)await page.screenshot({path:path.join(shots,`${width}x${height}-active.png`)});
  const r=await page.evaluate(()=>{const L=window.__hoopsQA.lat,mv=L.ptr.find(p=>p.t==='pointermove');if(!mv)return null;
   const base=L.render.find(x=>x.at<=mv.at)||L.render[0],after=L.render.filter(x=>x.at>=mv.at),first=L.frame.find(f=>f.at>=mv.at&&Math.hypot(f.mx,f.mz)>0);
   const x0=(L.render.filter(x=>x.at<mv.at).pop()||L.render[0]).x,z0=(L.render.filter(x=>x.at<mv.at).pop()||L.render[0]).z,dist=x=>Math.hypot(x.x-x0,x.z-z0);
   const t=th=>{const h=after.find(x=>dist(x)>=th);return h?+(h.at-mv.at).toFixed(1):null;};
   const frames=L.render.map(x=>x.at),gaps=frames.slice(1).map((v,i)=>v-frames[i]).sort((a,b)=>a-b);
   return {eventToConsume:first?+(first.at-mv.at).toFixed(1):null,eventToRender2cm:t(.02),eventToRender5cm:t(.05),frameMedian:+gaps[gaps.length>>1].toFixed(1),frameP95:+gaps[Math.floor(gaps.length*.95)].toFixed(1)};});
  await send('touchEnd',[]);await page.waitForTimeout(100);
  await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});
  if(r)trials.push(r);
 }
 const med=k=>{const v=trials.map(t=>t[k]).filter(x=>x!=null).sort((a,b)=>a-b);return v.length?v[v.length>>1]:null;};
 results.push({renderer:stub?'render stubbed (input+sim path at 60 Hz rAF)':'full SwiftShader render (software GL, slow frames)',viewport:`${width}x${height}`,geometry:geo,reach,trials:trials.length,median:Object.fromEntries(['eventToConsume','eventToRender2cm','eventToRender5cm','frameMedian','frameP95'].map(k=>[k,med(k)])),errors});
 await context.close();
}
await browser.close();server.close();
console.log(JSON.stringify(results,null,1));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(results,null,1));
