// Independent QA round 2 for the boar game (11/11/2026). MODE=after|v20. Smoothness of a slow stick drag, speeds, overshoot, fire-only-from-button regression.
import {serveIsland,islandChromium} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const MODE=process.env.MODE||'after';const out=new URL('./',import.meta.url).pathname;
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(240000);const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const log=(...a)=>console.error('['+MODE+']',...a);
const query='?dev=1&adapt=1'+(MODE==='v20'?'&boarStick=v20':'');
await page.goto(server.url+query,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const box=await frameEl.boundingBox();
const saveBefore=await frame.evaluate(()=>localStorage.getItem('boar-island-v1'));
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
const wait=ms=>page.waitForTimeout(ms);
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {shots:s.shots,frames:s.frames,elapsed:s.elapsed,aim:s.aim,firing:s.firing,stick:s.stick,stickInfo:s.stickInfo,shotsBy:s.shotsBy,stickNoButton:s.stickNoButton,heat:s.heat,mode:s.mode,enemies:s.enemies.length,flags:s.flags,stickR:s.stickR,aimSens:s.aimSens};});
const tillFrames=async(n,ms=60000)=>{const f0=(await st()).frames,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.frames>=f0+n)return s;await wait(40);}return st();};
const tillGame=async(sec,ms=150000)=>{const e0=(await st()).elapsed,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.elapsed>=e0+sec)return s;await wait(40);}return st();};
const cool=async()=>{for(let i=0;i<60;i++){if(((await st()).heat||0)<15)return;await wait(250);}};
const R={mode:MODE,query,steps:{}};
await frame.evaluate(()=>window.__boar.start(1));await wait(1500);
await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);window.__boar.spawn('scout',-28);});
await tillFrames(3);R.flags=(await st()).flags;R.perf0=await frame.evaluate(()=>window.__boar.perf());
// wall-clock frame rate of this container
{const a=await st(),t=Date.now();await wait(2000);const b=await st();R.fps={wall:+((b.frames-a.frames)/((Date.now()-t)/1000)).toFixed(1),gamePerWall:+((b.elapsed-a.elapsed)/((Date.now()-t)/1000)).toFixed(2)};log('fps',R.fps);}
const sd=a=>{const m=a.reduce((s,v)=>s+v,0)/(a.length||1);return {mean:m,sd:Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length||1))};};
// 1) slow continuous drag: 1 px every 40 ms to 30% of the radius, then hold 2 s of game time; per-frame trace
async function smooth(dir){const Rr=(await st()).stickR,N=Math.round(Rr*.3),o={x:150,y:290};
 await frame.evaluate(()=>{window.__boar.aim(-.6,-.3);window.__boar.record(true);});await tillFrames(2);await frame.evaluate(()=>window.__boar.trace());
 await touch('touchStart',[{...o,id:1}]);for(let i=1;i<=N;i++){await touch('touchMove',[{x:o.x+i*dir[0],y:o.y+i*dir[1],id:1}]);await wait(40);}
 const hold0=await st();await tillGame(2);const tr=await frame.evaluate(()=>window.__boar.trace());
 const before=await st();await touch('touchEnd',[{x:o.x+N*dir[0],y:o.y+N*dir[1],id:1}]);
 const rel0=await st();await tillGame(1);const rel1=await st();const trAfter=await frame.evaluate(()=>window.__boar.trace());await frame.evaluate(()=>window.__boar.record(false));
 const W=844,H=390,ax=dir[0]?'x':'y',sc=ax==='x'?W/2:H/2;const fr=tr.filter(f=>f.s);const m0=fr.length?fr[0].m:0;
 const d=[];for(let i=1;i<fr.length;i++){const px=Math.abs(fr[i][ax]-fr[i-1][ax])*sc;d.push({px,dt:fr[i].dt,sp:fr[i].dt>0?px/fr[i].dt:0,newMove:fr[i].m!==fr[i-1].m,moves:fr[i].m-m0,v:fr[i].v,r:fr[i].r,t:fr[i].t});}
 const moving=d.filter(x=>x.px>1e-6);const firstIdx=d.findIndex(x=>x.px>1e-6);
 const dsp=[];for(let i=Math.max(1,firstIdx+1);i<d.length;i++)dsp.push(Math.abs(d[i].sp-d[i-1].sp));
 const dstep=[];for(let i=Math.max(1,firstIdx+1);i<d.length;i++)dstep.push(Math.abs(d[i].px-d[i-1].px));
 // ramp: first motion to the last pointermove. flat = speed unchanged (<0.5%) from the previous frame while the finger keeps moving (a step); drops = speed falling while the tilt grows
 const lastMoveIdx=d.findIndex(x=>x.moves>=N);const ramp=d.slice(firstIdx+1,lastMoveIdx>0?lastMoveIdx:d.length);
 let flat=0,drops=0;for(let i=1;i<ramp.length;i++){const a=ramp[i-1].sp,b=ramp[i].sp;if(a>0&&Math.abs(b-a)/a<.005)flat++;if(b<a*.98)drops++;}
 let stall=0,run=0,stallTotal=0;for(const x of d){if(x.v>.01&&x.px<=1e-6){run++;stallTotal++;stall=Math.max(stall,run);}else run=0;}
 // hold: frames after the last pointermove, skipping 0.2 s of game time for the 45 ms smoothing to settle
 const holdAll=lastMoveIdx>=0?d.slice(lastMoveIdx+1):[];let acc=0;const hold=holdAll.filter(x=>(acc+=x.dt)>.2);
 const hs=sd(hold.map(x=>x.sp)),hp=sd(hold.map(x=>x.px));
 const after=trAfter.filter(f=>f.s===0);const overshoot=after.length?Math.max(...after.map(f=>Math.abs(f[ax]-rel0.aim[ax]))):0;
 return {R:Rr,N,dir,frames:fr.length,sentMoves:N,receivedMoves:fr.length?fr.at(-1).m-m0:0,framesWithNewMove:d.filter(x=>x.newMove).length,
  firstStepPx:firstIdx>=0?+d[firstIdx].px.toFixed(3):null,firstStepAfterMoves:firstIdx>=0?d[firstIdx].moves:null,maxStepPx:moving.length?+Math.max(...moving.map(x=>x.px)).toFixed(3):null,
  maxSpeedChangePxS:dsp.length?+Math.max(...dsp).toFixed(2):null,maxStepChangePx:dstep.length?+Math.max(...dstep).toFixed(3):null,rampFrames:ramp.length,rampFlatFrames:flat,rampSpeedDrops:drops,
  stallMaxRun:stall,stallFrames:stallTotal,framesMovedWithoutNewMove:moving.filter(x=>!x.newMove).length,
  holdFrames:hold.length,holdSpeedMeanPxS:+hs.mean.toFixed(2),holdSpeedSdPxS:+hs.sd.toFixed(3),holdSpeedCv:hs.mean?+(hs.sd/hs.mean).toFixed(4):null,holdStepMeanPx:+hp.mean.toFixed(3),holdStepCv:hp.mean?+(hp.sd/hp.mean).toFixed(4):null,
  holdDtRange:hold.length?[Math.min(...hold.map(x=>x.dt)),Math.max(...hold.map(x=>x.dt))]:null,resChanges:fr.length?fr.at(-1).r-fr[0].r:0,
  overshootUnits:+overshoot.toFixed(5),driftAfterRelease1s:+Math.hypot(rel1.aim.x-rel0.aim.x,rel1.aim.y-rel0.aim.y).toFixed(4),stickAfterRelease:rel0.stickInfo,shots:before.shots-hold0.shots,
  speeds:d.map(x=>+x.sp.toFixed(1)),steps:d.map(x=>+x.px.toFixed(3)),moves:d.map(x=>x.moves),dts:d.map(x=>x.dt)};}
const brief=o=>({...o,speeds:undefined,steps:undefined,moves:undefined,dts:undefined});
R.steps.smoothRight=await smooth([1,0]);log('smoothRight',JSON.stringify(brief(R.steps.smoothRight)));
R.steps.smoothUp=await smooth([0,-1]);log('smoothUp',JSON.stringify(brief(R.steps.smoothUp)));
// 2) speeds at 20/50/100% tilt (1 s of game time each) and drift after release (1 s of game time)
async function speed(frac){const Rr=(await st()).stickR,o={x:150,y:290};await frame.evaluate(()=>window.__boar.aim(-.9,-.05));
 await touch('touchStart',[{...o,id:1}]);await touch('touchMove',[{x:o.x+Math.round(Rr*frac),y:o.y,id:1}]);await tillGame(.3);
 const s0=await st();const s1=await tillGame(1);await touch('touchEnd',[{x:o.x+Math.round(Rr*frac),y:o.y,id:1}]);const r0=await st();const r1=await tillGame(1);
 const v=(s1.aim.x-s0.aim.x)/(s1.elapsed-s0.elapsed);return {frac,vUnitsPerS:+v.toFixed(4),vPxPerS:+(v*422).toFixed(1),crossScreenS:v>0?+(1.9/v).toFixed(1):null,clamped:Math.abs(s1.aim.x)>=.94,drift:+Math.hypot(r1.aim.x-r0.aim.x,r1.aim.y-r0.aim.y).toFixed(4),stickAfterRelease:r0.stickInfo,shots:s1.shots-s0.shots};}
R.steps.speeds={p20:await speed(.2),p50:await speed(.5),p100:await speed(1)};log('speeds',JSON.stringify(R.steps.speeds));
// 3) regression: 3 scene taps, 2 s stick drag with enemies in range: 0 shots; button hold: shots, all from the button
const sumBy=o=>Object.values(o).reduce((x,y)=>x+y,0);
await frame.evaluate(()=>{window.__boar.aim(0,-.05);window.__boar.spawn('scout',-18);window.__boar.spawn('scout',-22);});
{const a=await st();for(const [x,y] of [[422,195],[600,150],[520,80]]){await touch('touchStart',[{x,y,id:3}]);await wait(120);await touch('touchEnd',[{x,y,id:3}]);await wait(200);}await tillFrames(4);const b=await st();R.steps.sceneTaps={shots:b.shots-a.shots,frames:b.frames-a.frames,enemies:b.enemies};}
{const a=await st();const o={x:150,y:290};await touch('touchStart',[{...o,id:1}]);const t=Date.now();let i=0;while(Date.now()-t<2000){i++;await touch('touchMove',[{x:o.x+((i%8)-4)*8,y:o.y-30+((i%5)-2)*6,id:1}]);await wait(60);}await touch('touchEnd',[{x:o.x,y:o.y,id:1}]);await tillFrames(3);const b=await st();
 R.steps.stickDrag2s={shots:b.shots-a.shots,frames:b.frames-a.frames,game:+(b.elapsed-a.elapsed).toFixed(2),aimMoved:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(3),enemies:b.enemies};}
await cool();
{const fb=await frame.evaluate(()=>{const r=document.getElementById('fire-btn').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});const a=await st();await touch('touchStart',[{x:fb[0],y:fb[1],id:2}]);await tillGame(1);const h=await st();await touch('touchEnd',[{x:fb[0],y:fb[1],id:2}]);await tillFrames(3);const b=await st();await tillFrames(5);const c=await st();
 R.steps.fireButtonHold={shots:h.shots-a.shots,byButton:h.shotsBy.button-a.shotsBy.button,totalBy:sumBy(h.shotsBy)-sumBy(a.shotsBy),firingHeld:h.firing,firingAfter:b.firing,shotsAfterRelease:c.shots-b.shots};}
log('regress',JSON.stringify({sceneTaps:R.steps.sceneTaps,stickDrag2s:R.steps.stickDrag2s,fireButtonHold:R.steps.fireButtonHold}));
R.perf=await frame.evaluate(()=>window.__boar.perf());R.traceAfterOff=await frame.evaluate(()=>window.__boar.trace().length);
R.final=await st();R.errors=errors;
R.save={before:saveBefore?Object.keys(JSON.parse(saveBefore)).sort():null,after:await frame.evaluate(()=>{const v=localStorage.getItem('boar-island-v1');return v?Object.keys(JSON.parse(v)).sort():null;}),
 weaponsKeys:await frame.evaluate(()=>{const v=localStorage.getItem('boar-island-v1');return v?Object.keys(JSON.parse(v).weapons||{}).sort():null;}),otherKeys:await frame.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('boar')).sort())};
await writeFile(out+`qa2-${MODE}.json`,JSON.stringify(R,null,1));log('done errors',errors.length,JSON.stringify(R.save));
await browser.close();await server.close();
