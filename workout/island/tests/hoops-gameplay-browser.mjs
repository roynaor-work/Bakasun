// Run against the real island index and its unchanged CSP. This suite reaches the
// engine through trusted touch/keyboard input and controls.consume(), not action APIs.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH may point at a locally bundled browser/runtime.
// HOOPS_GAMEPLAY_OUT must be outside the repository (screenshots are deliverables).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),workout=path.join(repo,'workout');
const output=process.env.HOOPS_GAMEPLAY_OUT;
assert.ok(output&&path.isAbsolute(output),'Set HOOPS_GAMEPLAY_OUT to an absolute output directory outside the repository');
const out=path.resolve(output);
const outputRelative=path.relative(repo,out);assert.ok(outputRelative==='..'||outputRelative.startsWith('..'+path.sep)||path.isAbsolute(outputRelative),'Browser evidence must be saved outside the repository');
await mkdir(out,{recursive:true});
const index=path.join(workout,'island','index.html'),source=await readFile(index,'utf8');
const originalCsp=source.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
assert.ok(originalCsp?.includes("script-src 'self'"),'Expected the real index with script-src self');
const digest=s=>createHash('sha256').update(s).digest('hex'),sourceHash=digest(source);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),name=decodeURIComponent(url.pathname);
  if(name==='/favicon.ico'){res.writeHead(204).end();return;}
  if(!name.startsWith('/workout/')){res.writeHead(404).end();return;}
  let file=path.resolve(workout,name.slice('/workout/'.length)||'.');
  if(file!==workout&&!file.startsWith(workout+path.sep)){res.writeHead(403).end();return;}
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  const bytes=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/workout/island/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const viewports=(process.env.HOOPS_VIEWPORTS||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const report={browser:browser.version(),renderer:'SwiftShader software WebGL',physicalPhone:false,csp:originalCsp,indexSha256:sourceHash,viewports:[],passed:false};

// Reproducible local match fixtures isolate each action; no ratings, balance,
// saves or action implementation is changed. The opponent AI is held at its
// current idle goal so a test press cannot be obscured by an unrelated AI play.
function installFixture(){
 const get=()=>window.__island.games.current.session;
 const debug=get().debug,engine=debug.engine,drain=engine.drainEvents.bind(engine);
 window.__hoopsQA={events:[],keyEvents:[],fixture(kind='attack'){
  const d=get().debug,e=d.engine,S=e.debug.state,a=e.debug.api;
  d.controls.cancel();while(d.controls.held.queued)d.controls.consume();
  S.phase='live';S.phaseT=0;S.pending=null;S.inbound=null;S.ft=null;S.autopilot=false;S.clock=60;S.shotClock=24;S.shotClockOn=true;S.stoppage=null;
  const home=a.onCourt(0),away=a.onCourt(1),side=a.side(0);
  for(const p of [...home,...away]){
   p.act=null;p.actT=0;p.act2=null;p.shot=null;p.move=null;p.fake=null;p.air=-1;p.jumpH=0;p.jumpQueue=null;p.stumble=0;p.energy=.9;p.sprinting=false;
   for(const key of Object.keys(p.cd))p.cd[key]=0;
   p.think=100000;p.goal=null;p.goalSpeed=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};p.vx=p.vz=0;p.paintT=0;
  }
  home.forEach((p,i)=>e.debug.place(p.id,side*(i?10:6),i?i*2-6:0));
  away.forEach((p,i)=>e.debug.place(p.id,-side*7,i*1.2-2.4));
  const selected=home[0],handler=kind==='defense'?away[0]:selected;
  if(kind==='defense'){
   e.debug.place(handler.id,-side*3,0);e.debug.place(selected.id,handler.x+side*4,0);
   for(let i=1;i<home.length;i++)e.debug.place(home[i].id,handler.x+side*(i===1?.85:4+i),i===1?0:i*.5);
  }
  e.debug.give(handler.id);S.controlled=selected.id;S.frontcourtSet=true;S.lastPossessionTick=S.tick;
  d.step(1);this.events.length=0;
  const snap=e.snapshot(),others=snap.players.filter(p=>p.team===0&&p.id!==selected.id);
  const nearest=others.sort((a,b)=>Math.hypot(a.x-handler.x,a.z-handler.z)-Math.hypot(b.x-handler.x,b.z-handler.z))[0];
  return {selected:selected.id,handler:handler.id,nearest:nearest.id,stealRange:a.C.steal.range,energy:selected.energy};
 },snapshot(){return get().snapshot;}};
 window.addEventListener('keydown',e=>window.__hoopsQA.keyEvents.push({type:'down',code:e.code,key:e.key}),true);window.addEventListener('keyup',e=>window.__hoopsQA.keyEvents.push({type:'up',code:e.code,key:e.key}),true);
 engine.drainEvents=()=>{const events=drain();window.__hoopsQA.events.push(...events.map(e=>({...e})));return events;};
}

try{
for(const viewport of viewports){
 const tag=`${viewport.width}x${viewport.height}`,row={...viewport,checks:[],layouts:[],screenshots:[]},context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
 context.setDefaultTimeout(120000);const page=await context.newPage(),errors=[],outside=[],httpErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
 page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.origin!==origin)outside.push(u.href);});
 page.on('response',r=>{if(r.status()>=400)httpErrors.push({status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
 const check=name=>{row.checks.push(name);console.log(tag,'ok',name);};
 const snap=()=>page.evaluate(()=>window.__hoopsQA.snapshot());
 const fixture=kind=>page.evaluate(k=>window.__hoopsQA.fixture(k),kind);
 const step=n=>page.evaluate(n=>window.__island.games.current.session.debug.step(n),n);
 const button=key=>page.locator(`[data-hoops-control=${key}]`);
 const center=async locator=>{const r=await locator.boundingBox();assert.ok(r,'control is visible');return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const tap=async key=>{const p=await center(button(key));await page.touchscreen.tap(p.x,p.y);};
 const shot=async name=>{
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.hold=true;d.render();});
  await page.waitForTimeout(150);const filename=`${tag}-${name}.png`;
  await page.screenshot({path:path.join(out,filename),timeout:120000,animations:'disabled'});row.screenshots.push(filename);
 };
 try{
  await page.goto(base+'?dev=1',{waitUntil:'networkidle'});
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),originalCsp);
  await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:240000});
  await page.locator('[data-action=avatar-start]').click();
  const placed=await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});
   for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;return false;});
  assert.ok(placed,'court built through the island engine');
  await page.evaluate(()=>window.__island.games.stages('streetSlam'));
  await page.locator('[data-action=hoops-play-next]').click();
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session?.snapshot;return s?.error||s?.renderMetrics?.calls>0;},null,{timeout:240000});
  const loaded=await page.evaluate(()=>window.__island.games.current.session.snapshot);assert.equal(loaded.error,null);assert.equal(loaded.renderMetrics.players,10);await page.locator('.hoops-kit-trigger').waitFor({state:'visible'});
  await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});await page.evaluate(installFixture);
  const cdp=await context.newCDPSession(page),point=(id,p)=>({id,x:p.x,y:p.y,radiusX:1,radiusY:1,force:1});
  const touches=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  check('real island UI, original CSP, 10 players and production controls loaded');

  // Bounding boxes for every visible action and both thumb regions in both UI
  // directions. A 24 px safe inset is injected through the production CSS vars.
  for(const safe of [0,24])for(const dir of ['rtl','ltr'])for(const mode of ['attack','defense']){
   await fixture(mode);
   const layout=await page.evaluate(({safe,dir})=>{
    document.documentElement.dir=dir;const screen=document.querySelector('.game-screen[data-game=streetSlam]');screen.dir=dir;
    for(const side of ['top','right','bottom','left'])screen.style.setProperty('--ih-safe-'+side,safe+'px');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
    const visible=e=>!e.hidden&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const buttons=[...screen.querySelectorAll('button')].filter(visible).map(e=>({key:e.dataset.hoopsControl||e.dataset.action||e.className,rect:rect(e),label:e.getAttribute('aria-label'),text:e.textContent.trim()}));
    return {buttons,stick:rect(screen.querySelector('.hoops-stick-zone')),actions:rect(screen.querySelector('.hoops-actions')),width:innerWidth,height:innerHeight};
   },{safe,dir});
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
   for(const b of layout.buttons){const r=b.rect;assert.ok(r.w>=48&&r.h>=48,`${tag}/${safe}/${dir}/${mode} ${b.key} touch target ${r.w}x${r.h}`);assert.ok(b.label,`${b.key} has an accessible name`);assert.ok(r.x>=safe-.5&&r.y>=safe-.5&&r.right<=viewport.width-safe+.5&&r.bottom<=viewport.height-safe+.5,`${tag}/${safe}/${dir}/${mode} ${b.key} enters safe inset: ${JSON.stringify(r)}`);assert.ok(!overlap(r,layout.stick),`${b.key} overlaps left thumb region`);}
   for(let i=0;i<layout.buttons.length;i++)for(let j=i+1;j<layout.buttons.length;j++)assert.ok(!overlap(layout.buttons[i].rect,layout.buttons[j].rect),`${tag}/${safe}/${dir}/${mode}: ${layout.buttons[i].key} overlaps ${layout.buttons[j].key}`);
   for(const [name,r] of [['stick',layout.stick],['actions',layout.actions]])assert.ok(r.x>=safe-.5&&r.y>=safe-.5&&r.right<=viewport.width-safe+.5&&r.bottom<=viewport.height-safe+.5,`${name} outside safe region`);
   assert.ok(!overlap(layout.stick,layout.actions),'left and right thumb regions do not overlap');
   const keys=layout.buttons.map(b=>b.key);assert.ok(keys.includes('game-pause'),'shell pause is covered');assert.ok(keys.includes('hoops-kit-trigger'),'kit picker is covered');for(const key of mode==='attack'?['shoot','pass','move','fake','sprint','timeout']:['block','steal','switch','sprint','timeout'])assert.ok(keys.includes(key),`${mode} exposes ${key}`);
   row.layouts.push({safe,dir,mode,...layout});
  }
  check('all buttons >=48 px, no overlaps and both thumb areas inside safe insets: RTL/LTR × 0/24 px');
  await page.evaluate(()=>{document.documentElement.dir='rtl';const s=document.querySelector('.game-screen');s.dir='rtl';for(const p of ['top','right','bottom','left'])s.style.setProperty('--ih-safe-'+p,'0px');});

  // Genuine touch actions and keyboard alternatives consume the same controls
  // queue. Each engine observation refers to the preselected player by id.
  let f=await fixture('defense');await shot('defense');await tap('switch');await step(1);let s=await snap();
  assert.notEqual(s.controlled,f.selected);assert.equal(s.controlled,f.nearest);check('touch switch selects another defender nearest to the opponent handler');
  f=await fixture('defense');await page.keyboard.press('KeyQ');await step(1);s=await snap();assert.equal(s.controlled,f.nearest);check('keyboard Q switches to the same nearest defender');
  f=await fixture('defense');await tap('steal');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'steal');
  await step(10);const reach=await page.evaluate(()=>({events:window.__hoopsQA.events,owner:window.__hoopsQA.snapshot().ball.owner}));
  assert.equal(reach.events.filter(e=>e.type==='stealTry'&&e.playerId===f.selected).length,1);const miss=reach.events.find(e=>e.type==='stealMiss'&&e.playerId===f.selected);assert.equal(miss?.reason,'range');assert.equal(miss.range,f.stealRange);assert.ok(miss.distance>miss.range);assert.equal(reach.owner,f.handler);check('touch steal starts one reach and the unchanged metre range rejects a distant handler');
  f=await fixture('defense');await tap('block');await step(1);s=await snap();const jumper=s.players.find(p=>p.id===f.selected);assert.equal(jumper.act,'block');assert.equal(jumper.air,true);check('touch block starts the controlled defender jump');
  f=await fixture('defense');await page.keyboard.press('Space');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).air,true);check('keyboard Space also blocks');

  f=await fixture('attack');await shot('offense');await tap('move');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'cross');await step(8);await shot('cross');check('touch move tap crosses over');
  f=await fixture('attack');const moveAt=await center(button('move'));await touches('touchStart',[point(4,moveAt)]);await page.waitForTimeout(360);await touches('touchEnd',[]);await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'spin');check('holding the move control beyond 320 ms spins');
  f=await fixture('attack');await page.keyboard.press('KeyR');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'spin');check('keyboard R spins immediately');
  f=await fixture('attack');await tap('fake');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'fake');assert.equal(s.ball.owner,f.selected);assert.equal(s.ball.state,'held');assert.equal(s.players.find(p=>p.id===f.selected).shotType,null);await step(12);s=await snap();assert.equal(s.ball.owner,f.selected);assert.equal(s.ball.state,'held');assert.equal(await page.evaluate(()=>window.__hoopsQA.events.some(e=>e.type==='release')),false);await shot('fake');check('touch fake keeps ownership and creates no shot or release');
  f=await fixture('attack');await page.keyboard.press('KeyF');await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).act,'fake');check('keyboard F fakes');

  f=await fixture('attack');await page.keyboard.down('KeyD');await page.keyboard.down('ShiftLeft');await step(40);s=await snap();let runner=s.players.find(p=>p.id===f.selected);assert.equal(s.phase,'live');assert.equal(s.ball.owner,f.selected,'sprint fixture keeps the same ball handler');assert.equal(runner.sprinting,true);assert.ok(runner.energy<f.energy-.002);await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyD');await step(1);s=await snap();row.keyboardSprintRelease={phase:s.phase,ball:s.ball,controlled:s.controlled,player:s.players.find(p=>p.id===f.selected),held:s.input,debug:await page.evaluate(id=>{const d=window.__island.games.current.session.debug;return {frame:d.controls.consume(),intent:d.engine.debug.api.byId(id).intent,keys:window.__hoopsQA.keyEvents};},f.selected)};assert.equal(s.players.find(p=>p.id===f.selected).sprinting,false,JSON.stringify(row.keyboardSprintRelease));check('keyboard held sprint with movement consumes energy and clears on release');

  // CDP produces trusted independent touch pointers, including OS-style cancel.
  f=await fixture('attack');const zone=await page.locator('.hoops-stick-zone').boundingBox(),stickAt={x:zone.x+zone.width/2,y:zone.y+zone.height/2},movedAt={x:stickAt.x+32,y:stickAt.y},sprintAt=await center(button('sprint'));
  await touches('touchStart',[point(1,stickAt)]);await touches('touchMove',[point(1,movedAt)]);await touches('touchStart',[point(1,movedAt),point(2,sprintAt)]);await step(40);
  s=await snap();runner=s.players.find(p=>p.id===f.selected);assert.equal(s.input.stick,true);assert.equal(s.input.sprint,true);assert.equal(runner.sprinting,true);row.touchSprint={player:runner,held:s.input,energyBefore:f.energy};assert.ok(runner.energy<f.energy,JSON.stringify(row.touchSprint));
  // Chromium dispatches pointerup to the named ending point; keep id1 active.
  await touches('touchEnd',[point(2,sprintAt)]);await step(1);s=await snap();assert.equal(s.input.stick,true);assert.equal(s.input.sprint,false);assert.equal(s.players.find(p=>p.id===f.selected).sprinting,false);
  await touches('touchEnd',[]);assert.equal((await snap()).input.stick,false);check('two independent touch pointers: sprint release preserves the moving stick');

  f=await fixture('attack');const shootAt=await center(button('shoot'));await touches('touchStart',[point(3,shootAt)]);await step(1);s=await snap();assert.equal(s.players.find(p=>p.id===f.selected).shotHeld,true);
  await touches('touchCancel',[]);await step(1);s=await snap();assert.notEqual(s.players.find(p=>p.id===f.selected).act,'shoot');await step(80);s=await snap();assert.equal(s.ball.owner,f.selected);assert.equal(s.ball.state,'held');
  const cancelled=await page.evaluate(()=>window.__hoopsQA.events);assert.equal(cancelled.filter(e=>e.type==='shotCancel').length,1);assert.equal(cancelled.some(e=>e.type==='release'),false);check('trusted touch cancellation cancels the charged shot without a later release');
  await cdp.detach();

  // Pause button is part of the real shell, including focus and input lifecycle.
  await fixture('attack');await page.locator('[data-action=game-pause]').click();assert.equal((await snap()).paused,true);await page.evaluate(()=>{window.__island.games.current.session.debug.hold=false;});const pausedTick=(await snap()).tick;await page.waitForTimeout(200);assert.equal((await snap()).tick,pausedTick);await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});await page.locator('[data-action=game-resume]').click();assert.equal((await snap()).paused,false);check('real shell pause/resume reaches the session');
  await page.evaluate(()=>window.__island.games.cleanup());assert.equal(await page.evaluate(()=>!!window.__island.games.current),false);check('leaving the game disposes the active session');
  assert.deepEqual(errors,[],'every console/page/request error fails');assert.deepEqual(httpErrors,[],'every HTTP error fails');assert.deepEqual(outside,[],'no external network requests');
  row.errors=errors;row.httpErrors=httpErrors;row.externalRequests=outside;row.passed=true;
 }catch(error){row.passed=false;row.error=error.stack;row.errors=errors;row.httpErrors=httpErrors;row.externalRequests=outside;try{await page.screenshot({path:path.join(out,`${tag}-failure.png`),timeout:30000});}catch{}throw error;}
 finally{report.viewports.push(row);await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));await context.close();}
}
assert.equal(digest(await readFile(index,'utf8')),sourceHash,'real index source and CSP remained unchanged');report.passed=true;
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
console.log('hoops gameplay browser: all requested viewports passed');







