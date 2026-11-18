// QA round 3 (boar), probe: confirms the island flow and the CDP multi-touch semantics on this Chromium before the real scenario.
// Run: ISLAND_PLAYWRIGHT=... CHROMIUM_PATH=... node workout/island/verification/final-fix-fable/qa/qa3-boar-probe.mjs
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const csp=await installIslandCspMonitor(ctx);
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(300000);const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const t0=Date.now(),log=(...a)=>console.error(`[probe ${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
await page.goto(server.url+'index.html?dev=1&adapt=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);log('island loaded');
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
const intro=await page.evaluate(()=>[...document.querySelectorAll('.game-help-lines p')].map(p=>p.textContent));log('intro',JSON.stringify(intro));
if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);log('frame ready',frame.url());
const box=await frameEl.boundingBox();log('box',JSON.stringify(box));
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {mode:s.mode,frames:s.frames,elapsed:s.elapsed,stick:s.stick,fireHeld:s.fireHeld,firing:s.firing,shots:s.shots,aim:s.aim,current:s.current,stickInfo:s.stickInfo};});
const tillFrames=async(n,ms=120000)=>{const f0=(await st()).frames,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.frames>=f0+n)return s;await page.waitForTimeout(30);}return st();};
// start the wave with a real tap on the game's start button
const sb=await frame.evaluate(()=>{const r=document.getElementById('start').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
await touch('touchStart',[{x:sb[0],y:sb[1],id:9}]);await page.waitForTimeout(80);await touch('touchEnd',[]);
await frame.waitForFunction(()=>window.__boar.state.mode==='battle');log('battle');
{const a=await st();const t=Date.now();await page.waitForTimeout(3000);const b=await st();log('rate',JSON.stringify({framesPerWallS:+((b.frames-a.frames)/((Date.now()-t)/1000)).toFixed(2),gamePerWall:+((b.elapsed-a.elapsed)/((Date.now()-t)/1000)).toFixed(3)}));}
const R={};
const fb=await frame.evaluate(()=>{const r=document.getElementById('fire-btn').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
// semantics A: touchEnd WITH a point listed
await touch('touchStart',[{x:150,y:300,id:1}]);await tillFrames(2);
await touch('touchStart',[{x:150,y:300,id:1},{x:fb[0],y:fb[1],id:2}]);await tillFrames(2);R.bothDown=await st();
try{await touch('touchEnd',[{x:fb[0],y:fb[1],id:2}]);R.touchEndWithPoint='accepted';}catch(e){R.touchEndWithPoint='rejected: '+String(e.message).split('\n')[0];}
await tillFrames(2);R.afterEndListed=await st();
await touch('touchEnd',[]);await tillFrames(2);R.afterEndEmpty=await st();
// semantics B: touchMove listing only the remaining finger releases the missing one
await touch('touchStart',[{x:150,y:300,id:1}]);await tillFrames(2);
await touch('touchStart',[{x:150,y:300,id:1},{x:fb[0],y:fb[1],id:2}]);await tillFrames(2);R.bothDown2=await st();
await touch('touchMove',[{x:160,y:300,id:1}]);await tillFrames(2);R.afterMoveOnlyStick=await st();
await touch('touchEnd',[]);await tillFrames(2);R.afterEndEmpty2=await st();
log(JSON.stringify(R,null,1));
await csp.assertClean().then(()=>{R.csp='clean';}).catch(e=>{R.csp=String(e.message).slice(0,400);});
R.errors=errors;R.intro=intro;
await writeFile(out+'qa3-boar-probe.json',JSON.stringify(R,null,1));log('errors',errors.length,'csp',R.csp);
await csp.dispose();await browser.close();await server.close();
