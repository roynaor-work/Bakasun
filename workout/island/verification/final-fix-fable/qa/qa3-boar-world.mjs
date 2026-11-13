// QA round 3 (boar): does the AIM POINT IN THE WORLD keep moving after the thumb is lifted? The crosshair stops on screen at once,
// but the camera follows the crosshair with its own smoothing (game.js frame(): camera.rotation.y=damp(...,-pointer.x*.1,.12,dt)), so the sea and the boars
// may keep sliding under a crosshair that already stopped. Real touch through the island, per-frame read-out of the camera yaw (window.__three, read only).
// MODE=after|v20. Output qa3-boar-world-<MODE>.json.
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const MODE=process.env.MODE||'after',FLAGS={after:'',v20:'&boarFire=v20&boarHud=v20&boarStick=v20'}[MODE];
const out=new URL('./',import.meta.url).pathname,W=844,H=390;const t0=Date.now(),log=(...a)=>console.error(`[qa3-world ${MODE} ${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:W,height:H},hasTouch:true,isMobile:true,deviceScaleFactor:1});const csp=await installIslandCspMonitor(ctx);
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.goto(server.url+'index.html?dev=1&adapt=1'+FLAGS,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();const frame=await (await frameEl.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x,y:p.y,id:p.id??1}))});
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {mode:s.mode,frames:s.frames,elapsed:s.elapsed,aim:s.aim,stick:s.stick,stickR:s.stickR||62};});
const tillGame=async(sec,ms=300000)=>{const e0=(await st()).elapsed,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.elapsed>=e0+sec)return s;await page.waitForTimeout(30);}return st();};
{const r=await frame.evaluate(()=>{const b=document.getElementById('start').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});await touch('touchStart',[{x:r[0],y:r[1],id:9}]);await page.waitForTimeout(90);await touch('touchEnd',[{x:r[0],y:r[1],id:9}]);}
await frame.waitForFunction(()=>window.__boar.state.mode==='battle',null,{timeout:120000});
// per-frame recorder (reads only): camera yaw, fov, aspect, crosshair x
await frame.evaluate(()=>{window.__qa3w=[];const loop=()=>{const c=window.__three.camera,s=window.__boar.state;window.__qa3w.push({e:s.elapsed,f:s.frames,yaw:c.rotation.y,fov:c.fov,aspect:c.aspect,x:s.aim.x,stick:s.stick});if(window.__qa3w.length<20000)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
const R0=(await st()).stickR,P0=[110,320],rows=[];
for(const [label,d] of [['full tilt',R0+15],['half tilt',Math.round(R0/2)],['20% tilt',Math.round(R0*.2)+1]]){
  await frame.evaluate(()=>window.__boar.aim(-.6,-.05));await tillGame(1.2);// let the camera settle on the new aim
  await frame.evaluate(()=>{window.__qa3w.length=0;});
  await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await touch('touchMove',[{x:P0[0]+d,y:P0[1],id:1}]);await tillGame(.6);
  const rel=await st();await touch('touchEnd',[{x:P0[0]+d,y:P0[1],id:1}]);await tillGame(1.0);
  const rec=await frame.evaluate(()=>window.__qa3w.slice());const after=rec.filter(r=>!r.stick&&r.e>=rel.elapsed);
  if(after.length<3){rows.push({label,error:'too few frames',n:after.length});continue;}
  const T=Math.tan(after[0].fov*Math.PI/360)*after[0].aspect;// tan(horizontal fov / 2)
  const a0=after[0],aimYaw0=a0.yaw-Math.atan(a0.x*T);
  const slip=after.map(r=>({dt:+(r.e-a0.e).toFixed(3),crossPx:+((r.x-a0.x)*W/2).toFixed(2),worldSlipPx:+((Math.tan(r.yaw-aimYaw0)/T*-1-(-a0.x))*W/2*-1).toFixed(2)}));
  const end=slip.at(-1),maxSlip=Math.max(...slip.map(s=>Math.abs(s.worldSlipPx)));
  rows.push({label,thumbPx:d,crosshairSpeedUnitsPerS:null,releaseAt:rel.elapsed,crosshairMovedAfterReleasePx:end.crossPx,aimPointSlipAfterReleasePx:{max:+maxSlip.toFixed(1),after1s:end.worldSlipPx,at100ms:slip.find(s=>s.dt>=.1)?.worldSlipPx??null,at300ms:slip.find(s=>s.dt>=.3)?.worldSlipPx??null},samples:slip.length});
  log(label,JSON.stringify(rows.at(-1)));
}
// direction: the thumb pushes up-right at 45 degrees (28,28 px = 40 px); which way does the crosshair really move on screen, and where does the arrow on the crosshair point?
let diagonal=null;try{await frame.evaluate(()=>window.__boar.aim(-.6,-.6));await tillGame(.3);
  await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await touch('touchMove',[{x:P0[0]+28,y:P0[1]-28,id:1}]);await tillGame(.3);
  const s0=await st();const s1=await tillGame(.5);const arrow=await frame.evaluate(()=>document.getElementById('crosshair').style.getPropertyValue('--dir')||null);
  await touch('touchEnd',[{x:P0[0]+28,y:P0[1]-28,id:1}]);await tillGame(.2);
  const dxPx=(s1.aim.x-s0.aim.x)*W/2,dyPx=(s1.aim.y-s0.aim.y)*H/2,dt=s1.elapsed-s0.elapsed;
  diagonal={thumb:'45 degrees up-right, 40 px',crosshairDegAboveHorizontal:+(Math.atan2(dyPx,dxPx)*180/Math.PI).toFixed(1),arrowDegFromUp:arrow,pxPerS:{right:+(dxPx/dt).toFixed(1),up:+(dyPx/dt).toFixed(1)}};log('diagonal',JSON.stringify(diagonal));}catch(e){diagonal={error:e.message.split('\n')[0]};}
const res={mode:MODE,diagonal,cameraLineUnchanged:'camera.rotation.y=damp(camera.rotation.y,-pointer.x*.1,.12,dt) (game.js frame())',rows,errors};
try{await csp.assertClean();res.csp='clean';}catch(e){res.csp=String(e.message).slice(0,400);}
await writeFile(out+`qa3-boar-world-${MODE}.json`,JSON.stringify(res,null,1)+'\n');log('done',errors.length,res.csp);
await csp.dispose().catch(()=>{});await browser.close();await server.close();
