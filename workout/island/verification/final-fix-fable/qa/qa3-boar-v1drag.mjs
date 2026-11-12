// QA round 3 (boar), `?boar=v1` (the code before 06/11, what Roy's phone ran first): does a finger dragged on the open scene aim AND fire?
// Real touch through the island; per touch: what element is under the finger, scene pointer events received, firing state while held, shots, aim.
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname,W=844,H=390;const t0=Date.now(),log=(...a)=>console.error(`[qa3-v1drag ${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:W,height:H},hasTouch:true,isMobile:true,deviceScaleFactor:1});const csp=await installIslandCspMonitor(ctx);
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.goto(server.url+'index.html?dev=1&adapt=1&boar=v1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();const frame=await (await frameEl.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x,y:p.y,id:p.id??1}))});
await frame.evaluate(()=>{window.__qa3={raf:0,ev:{}};const t=()=>{window.__qa3.raf++;requestAnimationFrame(t);};requestAnimationFrame(t);
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.getElementById('scene').addEventListener(type,()=>{window.__qa3.ev[type]=(window.__qa3.ev[type]||0)+1;},true);});
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {mode:s.mode,frames:s.frames,elapsed:s.elapsed,aim:s.aim,firing:s.firing,shots:s.shots,shotsBy:s.shotsBy,flags:s.flags,ev:{...window.__qa3.ev}};});
const tillFrames=async n=>{await frame.evaluate(n=>new Promise(r=>{const a=window.__qa3.raf;const c=()=>window.__qa3.raf>=a+n?r():requestAnimationFrame(c);requestAnimationFrame(c);}),n);return st();};
{const r=await frame.evaluate(()=>{const b=document.getElementById('start').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});await touch('touchStart',[{x:r[0],y:r[1],id:9}]);await page.waitForTimeout(90);await touch('touchEnd',[{x:r[0],y:r[1],id:9}]);}
await frame.waitForFunction(()=>window.__boar.state.mode==='battle',null,{timeout:120000});
await frame.evaluate(()=>{window.__boar.sandbox(1);window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);});
await frame.waitForFunction(()=>getComputedStyle(document.getElementById('banner')).opacity==='0',null,{timeout:300000}).catch(()=>{});
const res={flags:(await st()).flags,gestures:[]};
const at=(x,y)=>frame.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button')?.id||e.id||e.className||e.tagName):null;},[x,y]);
for(const [label,from,to] of [['tap on the sea',[300,240],[300,240]],['drag on the sea, left half',[150,250],[260,215]],['drag on the sea, right half',[560,240],[680,200]],['drag where the v20 stick rests',[90,250],[180,215]]]){
  await frame.evaluate(()=>window.__boar.aim(0,-.05));await tillFrames(2);const a=await st();const under=await at(from[0],from[1]);
  await touch('touchStart',[{x:from[0],y:from[1],id:2}]);await tillFrames(2);const h0=await st();
  for(let i=1;i<=8;i++){await touch('touchMove',[{x:from[0]+(to[0]-from[0])*i/8,y:from[1]+(to[1]-from[1])*i/8,id:2}]);await tillFrames(1);}
  await tillFrames(3);const h1=await st();await touch('touchEnd',[{x:to[0],y:to[1],id:2}]);await tillFrames(4);const b=await st();
  const evd=k=>(b.ev[k]||0)-(a.ev[k]||0);
  res.gestures.push({label,from,to,under,sceneEvents:{down:evd('pointerdown'),move:evd('pointermove'),up:evd('pointerup'),cancel:evd('pointercancel')},firingWhileHeld:h0.firing||h1.firing,shots:b.shots-a.shots,shotsBy:b.shotsBy,aimMove:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(4),aimTo:b.aim});
  log(label,JSON.stringify(res.gestures.at(-1)));if(label.startsWith('drag on the sea, left'))await page.screenshot({path:out+'qa3-boar-v1-drag.jpg',type:'jpeg',quality:82});}
res.errors=errors;try{await csp.assertClean();res.csp='clean';}catch(e){res.csp=String(e.message).slice(0,400);}
await writeFile(out+'qa3-boar-v1drag.json',JSON.stringify(res,null,1)+'\n');log('done',errors.length,res.csp);
await csp.dispose().catch(()=>{});await browser.close();await server.close();
