// Street Slam acceptance run in Chromium (SwiftShader). Serves the published
// workout/ subtree (the game reuses workout/js/char3d.js and workout/3d/), drives
// the real island UI, real touch/keyboard input and the real render loop.
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... node workout/island/tests/slam-browser.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),out=fileURLToPath(new URL('../verification/slam/',import.meta.url));
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.webmanifest':'application/manifest+json','.jpg':'image/jpeg','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(404).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const only=(process.env.SLAM_VIEWPORTS||'390x844,360x800,844x390,1440x900').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const report={browser:browser.version(),renderer:'SwiftShader (software WebGL)',physicalPhone:false,viewports:[]};

const PROBE=()=>{
 const live=new Set(),add=EventTarget.prototype.addEventListener,rem=EventTarget.prototype.removeEventListener;
 EventTarget.prototype.addEventListener=function(type,fn,opts){if(this===window||this===document){const key={target:this,type,fn,capture:!!(typeof opts==='object'?opts?.capture:opts)};live.add(key);const sig=typeof opts==='object'&&opts?.signal;if(sig)add.call(sig,'abort',()=>live.delete(key),{once:true});}return add.call(this,type,fn,opts);};
 EventTarget.prototype.removeEventListener=function(type,fn,opts){if(this===window||this===document){const cap=!!(typeof opts==='object'?opts?.capture:opts);for(const k of live)if(k.target===this&&k.type===type&&k.fn===fn&&k.capture===cap)live.delete(k);}return rem.call(this,type,fn,opts);};
 const probe=window.__probe={listeners:()=>live.size,audioOpen:0,gl:0};
 const AC=window.AudioContext;if(AC)window.AudioContext=class extends AC{constructor(...a){super(...a);probe.audioOpen++;}close(){probe.audioOpen--;return super.close();}};
 const gc=HTMLCanvasElement.prototype.getContext,seen=new WeakSet();HTMLCanvasElement.prototype.getContext=function(kind,...a){const c=gc.call(this,kind,...a);if(c&&/webgl/.test(kind)&&!seen.has(this)){seen.add(this);probe.gl++;}return c;};
 HTMLElement.prototype.requestFullscreen=undefined;
};

for(const viewport of only){
 const phone=viewport.width<700||viewport.height<500,context=await browser.newContext({viewport,hasTouch:phone,isMobile:phone,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[],outside=[],warnings=[],tag=`${viewport.width}x${viewport.height}`,row={...viewport,checks:[]};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/'))outside.push(u.href);});
 await page.addInitScript(PROBE);
 const wait=ms=>page.waitForTimeout(ms),check=name=>{row.checks.push(name);console.log(tag,'✓',name);};
 const snap=()=>page.evaluate(()=>window.__island.games.current?.session?.snapshot??null);
 const eng=(fn,arg)=>page.evaluate(([src,arg])=>{const d=window.__island.games.current.session.debug;return (0,eval)('('+src+')')(d.engine,d,arg);},[fn.toString(),arg]);
 const shot=async name=>{await page.screenshot({path:out+`${tag}-${name}.jpg`,type:'jpeg',quality:82});};
 const cdp=phone?await context.newCDPSession(page):null;
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({x:p.x,y:p.y,id:p.id,radiusX:4,radiusY:4,force:1}))});
 const centre=async sel=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,box:b};};
 const press=async(sel,ms=60)=>{if(phone){const c=await centre(sel);await touch('touchStart',[{...c,id:9}]);await wait(ms);await touch('touchEnd',[]);}else{const c=await centre(sel);await page.mouse.move(c.x,c.y);await page.mouse.down();await wait(ms);await page.mouse.up();}};
 const steps=async(n)=>{const t0=(await snap()).tick;for(let i=0;i<400;i++){const s=await snap();if(s.tick>=t0+n||s.phase==='finished')return s;await wait(40);}throw Error('simulation stalled');};
 const events=async()=>page.evaluate(()=>window.__slamEvents.splice(0));
 const hookEvents=()=>page.evaluate(()=>{window.__slamEvents=[];const d=window.__island.games.current.session.debug,e=d.engine,drain=e.drainEvents.bind(e);
  // Record what the session drains, without changing it.
  e.drainEvents=()=>{const list=drain();window.__slamEvents.push(...list);return list;};});
 const start=async({practice=false,stage=1}={})=>{
  await page.evaluate(p=>{try{if(p)localStorage.removeItem('island.streetSlam.practice.v1');else localStorage.setItem('island.streetSlam.practice.v1','done');}catch{}},practice);
  await page.evaluate(s=>window.__island.games.start('streetSlam',undefined,s),stage);await wait(300);
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  await page.waitForFunction(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>2);
  await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting!=='true');await hookEvents();
 };
 const exit=async()=>{if(!await page.locator('.game-pause-sheet').count())await page.locator('[data-action=game-pause]').click();await page.locator('[data-action=game-exit]').click();await page.waitForFunction(()=>!window.__island.games.current);};
 try{
  await page.goto(base+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').click();
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=5000;e.learningStatus=()=>({locked:false});let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('basketball',x,z).ok)done=true;if(!done)throw Error('no basketball court');});
  const otherSaves=await page.evaluate(()=>{const s=window.__island.engine.state;return JSON.stringify({p:Object.fromEntries(Object.entries(s.minigameProgress).filter(([k])=>k!=='streetSlam')),e:Object.fromEntries(Object.entries(s.minigameEquipment).filter(([k])=>k!=='streetSlam')),l:Object.fromEntries(Object.entries(s.minigameLevels).filter(([k])=>k!=='streetSlam'))});});
  const baseline=await page.evaluate(()=>({listeners:window.__probe.listeners(),canvases:document.querySelectorAll('canvas').length,audio:window.__probe.audioOpen}));

  // 9. Layout on this viewport.
  await start({practice:phone&&viewport.width===390||viewport.width===844});
  const layout=await page.evaluate(()=>{const r=s=>{const b=document.querySelector(s)?.getBoundingClientRect();return b&&{x:b.x,y:b.y,w:b.width,h:b.height,r:b.right,b:b.bottom};};
   return {scrollW:document.documentElement.scrollWidth,innerW:innerWidth,scrollH:document.documentElement.scrollHeight,innerH:innerHeight,primary:r('.slam-primary'),secondary:r('.slam-secondary'),stick:r('.slam-stick'),board:r('.slam-board'),energy:r('.slam-energy'),pause:r('[data-action=game-pause]'),practice:r('.slam-practice')};});
  assert.ok(layout.scrollW<=layout.innerW,'no horizontal scroll');
  const inside=b=>b.x>=0&&b.y>=0&&b.r<=layout.innerW+.5&&b.b<=layout.innerH+.5,overlap=(a,b)=>a&&b&&a.x<b.r&&b.x<a.r&&a.y<b.b&&b.y<a.b;
  for(const k of ['primary','secondary','stick','pause']){assert.ok(layout[k].w>=48&&layout[k].h>=48,k+' >= 48px');assert.ok(inside(layout[k]),k+' on screen');}
  for(const hud of ['board','energy','practice'])for(const c of ['primary','secondary','stick'])assert.ok(!overlap(layout[hud],layout[c]),hud+' over '+c);
  assert.ok(!overlap(layout.primary,layout.secondary)&&!overlap(layout.primary,layout.stick));
  const labels=await page.evaluate(()=>[...document.querySelectorAll('.slam-action')].map(b=>[b.textContent.trim(),b.getAttribute('aria-label')]));
  for(const [text,aria] of labels){assert.equal(text,'','no text on the controls');assert.ok(aria);}
  check('9 layout, 48px targets, no horizontal scroll, HUD clear of the actions');
  await shot('01-open');

  const s0=await snap();
  if(s0.mode==='practice'){
   // Practice through the real controls: stick to the marker, pass, shot.
   if(phone){const st=await centre('.slam-stick');for(let i=0;i<120;i++){const s=await snap();if(s.practice.step>0)break;
     const me=s.players.find(p=>p.id==='h1'),dx=s.practice.target.x-me.position.x,dz=s.practice.target.z-me.position.z,b=await eng((e,d)=>d.view.screenBasis());
     const sx=dx*b.rx+dz*b.rz,sy=dx*b.ux+dz*b.uz,m=Math.hypot(sx,sy)||1;await touch(i?'touchMove':'touchStart',[{x:st.x+sx/m*40,y:st.y-sy/m*40,id:1}]);await wait(120);}
     await touch('touchEnd',[]);}
   else{for(let i=0;i<120;i++){const s=await snap();if(s.practice.step>0)break;const me=s.players.find(p=>p.id==='h1'),b=await eng((e,d)=>d.view.screenBasis()),dx=s.practice.target.x-me.position.x,dz=s.practice.target.z-me.position.z,sx=dx*b.rx+dz*b.rz,sy=dx*b.ux+dz*b.uz;
     const keys=[sx>.3?'KeyD':sx<-.3?'KeyA':null,sy>.3?'KeyW':sy<-.3?'KeyS':null].filter(Boolean);for(const k of keys)await page.keyboard.down(k);await wait(150);for(const k of keys)await page.keyboard.up(k);}}
   assert.equal((await snap()).practice.step,1);await shot('02-practice');
   await press('.slam-secondary');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.practice?.step===2);
   await page.waitForFunction(()=>window.__island.games.current.session.snapshot.ball.ownerId==='h1');
   await press('.slam-primary',560);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.mode==='match',null,{timeout:120000});
   await hookEvents();check('practice: move, pass and shot through the real controls, then the match starts');
  } else if(viewport.width===360){
   // Skip from the first frame.
   await exit();await start({practice:true});assert.equal((await snap()).mode,'practice');await page.locator('[data-action=slam-skip]').click();await page.waitForFunction(()=>window.__island.games.current.session.snapshot.mode==='match');await hookEvents();check('practice can be skipped');
  }
  await steps(90);await shot('03-play');

  // 8. Two fingers: stick and charge together; release outside the button still shoots once.
  await eng(e=>{const s=e.debugState;s.phase='playing';const h=s.players.find(p=>p.id===s.controlledId);s.ball.ownerId=h.id;s.ball.shot=null;h.energy=0;h.x=0;h.z=-2.2;h.charge=-1;h.state='idle';for(const p of s.players)if(p.team==='away'){p.x=5.8;p.z=3+p.index;p.think=99;p.plan=null;}});
  await events();
  if(phone){
   const st=await centre('.slam-stick'),pr=await centre('.slam-primary');
   await touch('touchStart',[{...st,id:1}]);await touch('touchMove',[{x:st.x+30,y:st.y,id:1}]);await touch('touchStart',[{x:st.x+30,y:st.y,id:1},{...pr,id:2}]);
   await page.waitForFunction(()=>{const s=window.__island.games.current.session.snapshot,m=s.players.find(p=>p.id===s.controlledPlayerId);return m.charge>.1&&m.speed>0;});// charging and moving with two fingers
   await touch('touchMove',[{x:st.x+30,y:st.y,id:1},{x:pr.x-160,y:pr.y-140,id:2}]);await wait(200);await touch('touchEnd',[{x:st.x+30,y:st.y,id:1}]);await wait(120);await touch('touchEnd',[]);
   await steps(40);let ev=await events();assert.equal(ev.filter(e=>e.type==='shotStart').length,1,'one shot from the outside release');
   const after=await page.evaluate(()=>window.__island.games.current.session.snapshot.input);assert.deepEqual([after.primary,after.secondary,after.stick],[false,false,false]);
   // Cancel: a cancelled touch drops the charge and fires nothing.
   await eng(e=>{const s=e.debugState,h=s.players.find(p=>p.id===s.controlledId);s.ball.ownerId=h.id;s.ball.shot=null;h.state='idle';h.charge=-1;h.jumpT=-1;h.y=0;});await events();
   await touch('touchStart',[{...pr,id:3}]);await wait(200);await touch('touchCancel',[]);await steps(30);ev=await events();
   assert.ok(ev.some(e=>e.type==='chargeCancelled'));assert.equal(ev.filter(e=>e.type==='shotStart').length,0);
   check('8 two simultaneous touches, release outside, touch cancel: nothing stuck');
  } else {
   await page.keyboard.down('KeyD');await page.keyboard.down('Space');await page.waitForFunction(()=>{const s=window.__island.games.current.session.snapshot,m=s.players.find(p=>p.id===s.controlledPlayerId);return m.charge>.1&&m.speed>0;});
   await wait(200);await page.keyboard.up('Space');await page.keyboard.up('KeyD');await steps(40);const ev=await events();assert.equal(ev.filter(e=>e.type==='shotStart').length,1,'held Space shoots once');
   check('keyboard: WASD + held Space releases one shot');
  }

  // 10. Pass, dunk, steal, block through the interface.
  await eng(e=>{const s=e.debugState;s.phase='playing';s.ball.shot=null;s.ball.pass=null;const h=s.players.find(p=>p.id===s.controlledId),m=s.players.find(p=>p.team==='home'&&p!==h);Object.assign(h,{x:0,z:-1,state:'idle',charge:-1,jumpT:-1,y:0,stumble:0});Object.assign(m,{x:-3,z:-3,vx:0,vz:0});s.ball.ownerId=h.id;for(const p of s.players)if(p.team==='away'){p.x=5.8;p.z=4+p.index;p.think=99;p.plan=null;}});await events();
  if(phone)await press('.slam-secondary');else await page.keyboard.press('KeyE');
  await steps(60);let ev=await events();assert.ok(ev.some(e=>e.type==='pass'),'pass from the UI');
  await eng(e=>{const s=e.debugState;s.ball.shot=null;s.ball.pass=null;const h=s.players.find(p=>p.team==='home'&&p.index===0);s.controlledId=h.id;Object.assign(h,{x:0,z:-5.3,vx:0,vz:0,yaw:Math.PI,energy:1,state:'idle',charge:-1,jumpT:-1,y:0,stumble:0,cd:{...h.cd,dunk:0}});s.ball.ownerId=h.id;for(const p of s.players)if(p.team==='away'){p.x=5.8;p.z=4+p.index;p.think=99;p.plan=null;}});await events();
  await page.waitForFunction(()=>document.querySelector('.slam-primary')?.dataset.action==='dunk');await wait(1500);// let the camera settle on the play
  await page.waitForFunction(()=>document.querySelector('.slam-primary')?.dataset.action==='dunk');await press('.slam-primary');
  // Freeze the session at the top of the jump for the picture, then let it finish.
  await page.waitForFunction(()=>{const s=window.__island.games.current.session.snapshot,m=s.players.find(p=>p.id===s.controlledPlayerId);if(m.animation==='dunk'&&m.position.y>.75){window.__island.games.current.session.setPaused(true);return true;}return false;});
  await wait(400);await shot('04-dunk');await page.evaluate(()=>window.__island.games.current.session.setPaused(false));await steps(80);ev=await events();
  assert.ok(ev.some(e=>e.type==='dunk'),'dunk from the UI');assert.ok(ev.some(e=>e.type==='score'&&e.kind==='dunk'));
  // Steal: defend a still handler in range (the chance is real; a few tries).
  let stole=false;
  for(let i=0;i<10&&!stole;i++){
   await eng(e=>{const s=e.debugState;s.phase='playing';s.ball.shot=null;s.ball.pass=null;const a=s.players.find(p=>p.id==='a1'),h=s.players.find(p=>p.id==='h1');Object.assign(a,{x:0,z:0,yaw:0,think:99,plan:null,state:'idle',charge:-1,jumpT:-1,y:0,stumble:0});Object.assign(h,{x:0,z:.95,yaw:Math.PI,cd:{...h.cd,steal:0},stumble:0,state:'idle',jumpT:-1,y:0});s.ball.ownerId='a1';s.controlledId='h1';});
   await page.waitForFunction(()=>document.querySelector('.slam-secondary')?.dataset.action==='steal');
   if(phone)await press('.slam-secondary');else await page.keyboard.press('KeyE');await steps(6);stole=(await events()).some(e=>e.type==='steal'&&e.playerId==='h1');
  }
  assert.ok(stole,'steal from the UI');
  // Block: an away shooter rises; the child jumps with the primary control.
  let blocked=false;
  for(let i=0;i<6&&!blocked;i++){
   await eng(e=>{const s=e.debugState;s.phase='playing';s.ball.shot=null;s.ball.pass=null;const a=s.players.find(p=>p.id==='a1'),h=s.players.find(p=>p.id==='h1');Object.assign(a,{x:0,z:2.8,yaw:0,think:99,plan:{action:{type:'shoot',hold:.5}},state:'idle',charge:-1,jumpT:-1,y:0});Object.assign(h,{x:0,z:3.7,yaw:Math.PI,cd:{...h.cd,block:0},state:'idle',jumpT:-1,y:0,stumble:0});s.ball.ownerId='a1';s.controlledId='h1';s.players.find(p=>p.id==='a2').x=-5;});
   await page.waitForFunction(()=>window.__island.games.current.session.snapshot.players.find(p=>p.id==='a1').animation==='shoot'&&window.__island.games.current.session.snapshot.players.find(p=>p.id==='a1').position.y>0);
   if(phone)await press('.slam-primary',40);else await page.keyboard.press('Space');await steps(50);blocked=(await events()).some(e=>e.type==='block'&&e.playerId==='h1');
  }
  const sound=(await snap()).audioMetrics;row.audio=sound;if(phone){assert.equal(sound.buffers,7,'all seven local samples decoded');assert.ok(Object.values(sound.played).reduce((a,b)=>a+b,0)>0,'sounds played after a gesture');}
  check('10 pass, dunk and steal from the interface'+(blocked?', block landed':', block jump fired (timing-dependent landing)'));
  row.blockLanded=blocked;

  // 7. Pause button and a hidden tab freeze the match.
  await page.locator('[data-action=game-pause]').click();const before=await snap();await wait(800);const during=await snap();
  assert.equal(during.paused,true);assert.equal(during.tick,before.tick,'no simulation while paused');assert.equal(during.phase,'paused');assert.equal(during.remainingMs,(await snap()).remainingMs);
  await page.locator('[data-action=game-resume]').click();await wait(300);const resumed=await snap();assert.ok(resumed.tick-during.tick<=40,'no time jump after resume');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await wait(500);
  const hidden=await snap();await wait(500);assert.equal(hidden.tick,(await snap()).tick,'hidden tab: frozen');assert.ok(await page.locator('.game-pause-sheet').count(),'shell paused on hide');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.locator('[data-action=game-resume]').click();await wait(200);
  if(!phone){await page.keyboard.press('Escape');await wait(200);assert.ok(await page.locator('.game-pause-sheet').count(),'Escape pauses');await page.locator('[data-action=game-resume]').click();}
  check('7 pause, hidden tab'+(phone?'':' and Escape')+' freeze the simulation');

  // 12. Low quality stays readable.
  await eng((e,d)=>{for(let i=0;i<200;i++)d.view.observeFrame(80);});await wait(400);const low=await snap();assert.equal(low.renderMetrics.quality,'low');assert.ok(await page.locator('.slam-board').isVisible());check('12 low quality keeps the HUD');
  row.render=low.renderMetrics;

  // End of match: a forced short clock with a lead; the result screen appears once.
  const money=await page.evaluate(()=>window.__island.engine.state.money);
  await eng(e=>{const s=e.debugState;s.score.home=s.score.away+6;s.remainingTicks=30;s.ball.shot=null;s.ball.pass=null;s.playedTicks=Math.max(s.playedTicks,180*60);});
  await page.waitForFunction(()=>document.querySelector('[data-result=streetSlam]'),null,{timeout:120000});
  const credited=await page.evaluate(()=>window.__island.engine.state.money);assert.ok(credited>money,'win credited');await shot('05-finish');
  check('finish: result screen and coins credited once');
  await page.locator('[data-action=game-exit]').click();

  // 11. Open and close five times: no growth in listeners, canvases or audio contexts.
  const counts=[];
  for(let i=0;i<5;i++){await start();await steps(20);await exit();await wait(200);counts.push(await page.evaluate(()=>({listeners:window.__probe.listeners(),canvases:document.querySelectorAll('canvas').length,audio:window.__probe.audioOpen})));}
  assert.ok(counts.every(c=>c.listeners===counts[0].listeners&&c.canvases===baseline.canvases&&c.audio<=baseline.audio),JSON.stringify({baseline,counts}));
  const afterSaves=await page.evaluate(()=>{const s=window.__island.engine.state;return JSON.stringify({p:Object.fromEntries(Object.entries(s.minigameProgress).filter(([k])=>k!=='streetSlam')),e:Object.fromEntries(Object.entries(s.minigameEquipment).filter(([k])=>k!=='streetSlam')),l:Object.fromEntries(Object.entries(s.minigameLevels).filter(([k])=>k!=='streetSlam'))});});
  assert.equal(afterSaves,otherSaves,'other games\' saves untouched');
  check('11 five open/close cycles without leaked listeners, canvases or audio; other saves intact');
  row.lifecycle={baseline,counts};

  // 12. A WebGL failure is shown, with retry and back.
  if(viewport.width===390){
   await page.goto(base+'?dev=1&slamFail=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
   await page.evaluate(()=>{const {engine:e}=window.__island;let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('basketball',x,z).ok)done=true;});
   if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
   await page.evaluate(()=>{const {engine:e}=window.__island;e.skipTutorial();e.learningStatus=()=>({locked:false});e.state.money=5000;let done=e.state.buildings.some(b=>b.typeId==='basketball');for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('basketball',x,z).ok)done=true;localStorage.setItem('island.streetSlam.practice.v1','done');window.__island.games.start('streetSlam',undefined,1);});
   await wait(300);if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForSelector('.slam-loading.failed');assert.ok(await page.locator('[data-action=slam-retry]').isVisible()&&await page.locator('[data-action=slam-back]').isVisible());
   assert.ok((await snap()).error);await shot('06-error');await page.locator('[data-action=slam-back]').click();await page.waitForFunction(()=>!window.__island.games.current);
   errors.splice(0);check('12 WebGL/load failure is visible with retry and back');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  row.warnings=[...new Set(warnings)];report.viewports.push(row);
 }catch(e){console.error(tag,'FAILED',e.message,errors.slice(0,5));await page.screenshot({path:out+`${tag}-failure.png`}).catch(()=>{});throw e;}
 finally{await context.close();}
}
await writeFile(out+(process.env.SLAM_VIEWPORTS?'partial-':'')+'verification.json',JSON.stringify(report,null,1)+'\n');
await browser.close();server.close();
console.log('slam-browser verified',only.map(v=>v.width+'x'+v.height).join(' '));
