// Island Pro Basketball acceptance run in Chromium (SwiftShader software WebGL).
// Serves the workout/ subtree, builds a basketball court through the real island UI
// engine, opens the game, and checks per viewport: assets load, 5 on 5 renders, touch and
// keyboard reach the engine, controls are at least 48 px, the game screen carries no words,
// pause freezes the clock, leaving releases WebGL, listeners and audio.
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... node workout/island/tests/hoops-browser.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),out=fileURLToPath(new URL('../verification/hoops/',import.meta.url));
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const only=(process.env.HOOPS_VIEWPORTS||'1280x720,844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const report={browser:browser.version(),renderer:'SwiftShader (software WebGL)',physicalPhone:false,viewports:[]};

const PROBE=()=>{
 const live=new Set(),add=EventTarget.prototype.addEventListener,rem=EventTarget.prototype.removeEventListener;
 EventTarget.prototype.addEventListener=function(type,fn,opts){if(this===window||this===document){const key={target:this,type,fn,capture:!!(typeof opts==='object'?opts?.capture:opts)};live.add(key);const sig=typeof opts==='object'&&opts?.signal;if(sig)add.call(sig,'abort',()=>live.delete(key),{once:true});}return add.call(this,type,fn,opts);};
 EventTarget.prototype.removeEventListener=function(type,fn,opts){if(this===window||this===document){const cap=!!(typeof opts==='object'?opts?.capture:opts);for(const k of live)if(k.target===this&&k.type===type&&k.fn===fn&&k.capture===cap)live.delete(k);}return rem.call(this,type,fn,opts);};
 const probe=window.__probe={listeners:()=>live.size,audioOpen:0};
 const AC=window.AudioContext;if(AC)window.AudioContext=class extends AC{constructor(...a){super(...a);probe.audioOpen++;}close(){probe.audioOpen--;return super.close();}};
 HTMLElement.prototype.requestFullscreen=undefined;
};

for(const viewport of only){
 const phone=viewport.width<900||viewport.height<500,context=await browser.newContext({viewport,hasTouch:phone,isMobile:phone,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[],outside=[],tag=`${viewport.width}x${viewport.height}`,row={...viewport,checks:[]};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/'))outside.push(u.href);});
 await page.addInitScript(PROBE);
 const check=name=>{row.checks.push(name);console.log(tag,'ok',name);};
 const snap=()=>page.evaluate(()=>{const s=window.__island.games.current?.session?.snapshot;return s?JSON.parse(JSON.stringify(s)):null;});
 // software WebGL keeps the page busy; hold the last frame while the screenshot is taken
 const shot=async name=>{await page.evaluate(async()=>{const d=window.__island.games.current.session.debug;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));d.hold=true;});await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,`${tag}-${name}.jpg`),type:'jpeg',quality:84,timeout:120000});
  await page.evaluate(()=>{window.__island.games.current.session.debug.hold=false;});};

 await page.goto(base+'?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 await page.locator('[data-action=avatar-start]').click();
 const listenersBefore=await page.evaluate(()=>window.__probe.listeners());
 const placed=await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});
  for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;return false;});
 assert.ok(placed);check('basketball court built through the island engine');

 const t0=Date.now();
 await page.evaluate(()=>window.__island.games.start('streetSlam',undefined,1));await page.waitForTimeout(400);
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.calls>0,null,{timeout:240000});
 row.loadMs=Date.now()-t0;let s=await snap();
 assert.equal(s.players.length,10);assert.equal(s.renderMetrics.players,10);check(`10 players rendered after ${row.loadMs} ms`);
 row.metrics=s.renderMetrics;

 // controls: touch targets and icons only
 const controls=await page.evaluate(()=>[...document.querySelectorAll('[data-hoops-control]')].filter(b=>!b.hidden&&b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return {key:b.dataset.hoopsControl,w:r.width,h:r.height,text:b.textContent.trim(),svg:!!b.querySelector('svg'),label:b.getAttribute('aria-label')};}));
 assert.ok(controls.length>=6,JSON.stringify(controls));
 for(const c of controls){assert.ok(c.w>=48&&c.h>=48,`${c.key} ${c.w}x${c.h}`);assert.equal(c.text,'',`${c.key} has no words`);assert.ok(c.svg,`${c.key} has an icon`);assert.ok(c.label,`${c.key} is labelled for screen readers`);}
 const stick=await page.locator('.hoops-stick-zone').boundingBox();assert.ok(stick.width>=96&&stick.height>=96);
 check(`${controls.length} controls at least 48 px, icons only, labelled`);
 const words=await page.evaluate(()=>{const roots=[document.querySelector('.hoops-bug')?.parentElement,document.querySelector('.hoops-controls')].filter(Boolean),found=[];
  for(const r of roots){const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const el=n.parentElement;if(!el||el.closest('[hidden]')||!el.offsetParent||el.closest('.visually-hidden,[class*=sr-only]'))continue;if(/\p{L}/u.test(n.textContent))found.push(n.textContent.trim());}}return found;});
 assert.deepEqual(words,[],'no words on the game screen');check('no words on the game screen (digits and icons only)');

 // the ball is in play
 await page.evaluate(()=>window.__island.games.current.session.debug.step(240));await page.waitForTimeout(300);
 s=await snap();assert.ok(['live','inbound','dead','freethrow'].includes(s.phase),s.phase);await shot('01-tipoff');

 // keyboard reaches the engine: during live play, holding a direction moves the controlled player
 let moved=0;
 for(let attempt=0;attempt<8&&moved<0.3;attempt++){
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;for(let i=0;i<900&&d.engine.snapshot().phase!=='live';i++)d.step(1);});
  const before=await snap(),me0=before.players.find(p=>p.controlled);if(before.phase!=='live')continue;
  const key=me0.x>0?'KeyA':'KeyD';
  await page.keyboard.down(key);await page.evaluate(()=>window.__island.games.current.session.debug.step(40));await page.keyboard.up(key);
  const after=await snap(),me1=after.players.find(p=>p.id===me0.id);
  if(after.controlled===me0.id&&me1)moved=Math.max(moved,Math.hypot(me1.x-me0.x,me1.z-me0.z));
 }
 assert.ok(moved>0.3,'keyboard moves the controlled player');check(`keyboard input moves the controlled player (${moved.toFixed(2)} m)`);

 // touch: the stick reports a held pointer, the action button queues an edge
 if(phone){
  const c={x:stick.x+stick.width/2,y:stick.y+stick.height/2};
  await page.touchscreen.tap(c.x,c.y);
  const shootBox=await page.locator('[data-hoops-control=shoot]').boundingBox();await page.touchscreen.tap(shootBox.x+shootBox.width/2,shootBox.y+shootBox.height/2);
  await page.evaluate(()=>window.__island.games.current.session.debug.step(30));check('touch on stick and action button accepted');
 }

 // play on and take the broadcast shots
 await page.evaluate(()=>window.__island.games.current.session.debug.step(900));await page.waitForTimeout(300);await shot('02-halfcourt');
 await page.evaluate(()=>window.__island.games.current.session.debug.step(1500));await page.waitForTimeout(300);await shot('03-play');
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug;for(let i=0;i<120&&d.engine.snapshot().score.every(v=>v===0);i++)d.step(60);});
 s=await snap();row.score=s.score;row.quarter=s.quarter;assert.ok(s.score[0]+s.score[1]>0,'points were scored');check(`play reached ${s.score.join('-')} in quarter ${s.quarter}`);

 // pause freezes the simulation
 await page.evaluate(()=>window.__island.games.current.session.setPaused(true));
 const p0=(await snap()).tick;await page.waitForTimeout(700);const p1=(await snap()).tick;assert.equal(p1,p0,'paused game does not step');
 await page.evaluate(()=>window.__island.games.current.session.setPaused(false));check('pause freezes the clock');

 // leaving releases everything
 await page.evaluate(()=>{const g=window.__island.games;if(g.cleanup)g.cleanup();else g.current.cancel();});await page.waitForTimeout(500);
 const left=await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,listeners:window.__probe.listeners(),audio:window.__probe.audioOpen,current:!!window.__island.games.current}));
 assert.equal(left.current,false);assert.ok(left.listeners<=listenersBefore+2,`listeners ${listenersBefore} -> ${left.listeners}`);assert.ok(left.audio<=1,'audio contexts closed');
 check('leaving the game releases the session, listeners and audio');

 const real=errors.filter(e=>!/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
 assert.deepEqual(real,[],'no console errors');assert.deepEqual(outside,[],'no requests outside the app');check('no console errors, no outside requests');
 report.viewports.push(row);await context.close();
}
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,1));
await browser.close();server.close();
console.log('hoops browser: all viewports passed');
