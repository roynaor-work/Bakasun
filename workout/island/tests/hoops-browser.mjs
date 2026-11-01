// Island Pro Basketball acceptance run in Chromium (SwiftShader software WebGL).
// Serves the workout/ subtree, builds a basketball court through the real island UI
// engine, opens the game, and checks per viewport: assets load, 5 on 5 renders, touch and
// keyboard reach the engine, controls are at least 48 px with authored Hebrew labels and LTR role badges,
// pause freezes the clock, leaving releases WebGL, listeners and audio. Feel round (27/10):
// one-button start card, floating stick with dead zone and auto sprint, tap/hold passes,
// a shot meter with green and yellow zones.
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... node workout/island/tests/hoops-browser.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.HOOPS_TEST_OUT||(process.env.ISLAND_CSP_AUDIT_DIR?path.join(process.env.ISLAND_CSP_AUDIT_DIR,'hoops'):fileURLToPath(new URL('../verification/hoops/',import.meta.url)));
await mkdir(out,{recursive:true});
const server=await serveIsland('/workout/island/'),base=server.url;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const only=(process.env.HOOPS_VIEWPORTS||'1280x720,844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const report={browser:browser.version(),renderer:'SwiftShader (software WebGL)',physicalPhone:false,viewports:[]};
const controlsProfile=JSON.parse(await readFile(new URL('../design/controls/hoops.json',import.meta.url),'utf8')),interaction=JSON.parse(await readFile(new URL('../design/controls/interaction.json',import.meta.url),'utf8'));
const approvedLabels=new Set([...Object.values(controlsProfile.controls).map(c=>c.label),'פייק','פסק זמן','מסירה קצרה','מסירה רחוקה','קפיצה לריבאונד','בקשת כדור']);
const approvedGameText=new Set([...approvedLabels,'PG','SG','SF','PF','C','מסירה: נגיעה לקרוב · החזקה לרחוק','מסירה: קצרה בנגיעה · רחוקה בהחזקה']);
const expectedControlsByMode={ball:['shoot','pass','move','fake','sprint','timeout'],offense:['pass','sprint','fake','move','timeout'],defense:['block','steal','switch','sprint','timeout'],inbound:['pass','move','timeout'],free_throw:['shoot','timeout']};

const PROBE=()=>{
 const live=new Set(),add=EventTarget.prototype.addEventListener,rem=EventTarget.prototype.removeEventListener;
 EventTarget.prototype.addEventListener=function(type,fn,opts){if(this===window||this===document){const key={target:this,type,fn,capture:!!(typeof opts==='object'?opts?.capture:opts)};live.add(key);const sig=typeof opts==='object'&&opts?.signal;if(sig)add.call(sig,'abort',()=>live.delete(key),{once:true});}return add.call(this,type,fn,opts);};
 EventTarget.prototype.removeEventListener=function(type,fn,opts){if(this===window||this===document){const cap=!!(typeof opts==='object'?opts?.capture:opts);for(const k of live)if(k.target===this&&k.type===type&&k.fn===fn&&k.capture===cap)live.delete(k);}return rem.call(this,type,fn,opts);};
 const probe=window.__probe={listeners:()=>live.size,audioOpen:0};
 const AC=window.AudioContext;if(AC)window.AudioContext=class extends AC{constructor(...a){super(...a);probe.audioOpen++;}close(){probe.audioOpen--;return super.close();}};
 HTMLElement.prototype.requestFullscreen=undefined;
};

try{for(const viewport of only){
 const phone=viewport.width<900||viewport.height<500,context=await browser.newContext({viewport,hasTouch:phone,isMobile:phone,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],outside=[],tag=`${viewport.width}x${viewport.height}`,row={...viewport,checks:[]};await csp.attachPage(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/'))outside.push(u.href);});
 await page.addInitScript(PROBE);
 const check=name=>{row.checks.push(name);console.log(tag,'ok',name);};
 const snap=()=>page.evaluate(()=>{const s=window.__island.games.current?.session?.snapshot;return s?JSON.parse(JSON.stringify(s)):null;});
 // software WebGL keeps the page busy; hold the last frame while the screenshot is taken
 const shot=async name=>{await page.evaluate(async()=>{const d=window.__island.games.current.session.debug;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));d.hold=true;});await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,`${tag}-${name}.jpg`),type:'jpeg',quality:84,timeout:120000});
  await page.evaluate(()=>{window.__island.games.current.session.debug.hold=false;});};

 let suiteError=null;
 try{await page.goto(base+'?dev=1',{waitUntil:'networkidle'});await csp.assertClean();
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 await page.locator('[data-action=avatar-start]').click();
 const listenersBefore=await page.evaluate(()=>window.__probe.listeners());
 const placed=await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});
  for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;return false;});
 assert.ok(placed);check('basketball court built through the island engine');

 // the start is one card and one button; the club, settings and stages are folded away
 await page.evaluate(()=>window.__island.games.stages('streetSlam'));await page.waitForTimeout(300);
 const start=await page.evaluate(()=>{const vis=el=>!!el&&!el.closest('details:not([open])')&&(el.checkVisibility?.()??true)&&!!el.offsetParent&&el.getBoundingClientRect().height>0;const go=document.querySelector('[data-action=hoops-play-next]'),more=document.querySelector('[data-hoops-more]');
  return {card:vis(document.querySelector('[data-hoops-start]')),go:vis(go),goH:go?.getBoundingClientRect().height||0,more:!!more,open:!!more?.open,club:vis(document.querySelector('[data-hoops-club]')),stage:vis(document.querySelector('[data-action=stage-play]')),
   visibleButtons:[...document.querySelectorAll('[data-stage-map] button')].filter(vis).map(b=>b.dataset.action||b.textContent.trim())};});
 assert.ok(start.card&&start.go&&start.goH>=48,JSON.stringify(start));assert.ok(start.more&&!start.open&&!start.club&&!start.stage,'club and stages folded: '+JSON.stringify(start));
 assert.ok(start.visibleButtons.length<=5,'a few buttons only: '+start.visibleButtons);console.log(tag,'start buttons',start.visibleButtons.join(' | '));
 await page.screenshot({path:path.join(out,`${tag}-00-start.jpg`),type:'jpeg',quality:84});check(`start card: one play button, ${start.visibleButtons.length} visible buttons, club folded`);
 const t0=Date.now();
 await page.locator('[data-action=hoops-play-next]').click();await page.waitForTimeout(400);
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.calls>0,null,{timeout:240000});
 row.loadMs=Date.now()-t0;let s=await snap();
 assert.equal(s.players.length,10);assert.equal(s.renderMetrics.players,10);check(`10 players rendered after ${row.loadMs} ms`);
 row.metrics=s.renderMetrics;

 // Authored visible labels, contextual actions, icons and accessible hit targets.
 const controls=await page.evaluate(()=>[...document.querySelectorAll('[data-hoops-control]')].filter(b=>!b.hidden&&b.offsetParent).map(b=>{const r=b.getBoundingClientRect(),span=b.querySelector('.ih-action-label'),range=document.createRange();if(span)range.selectNodeContents(span);const text=span&&range.getBoundingClientRect(),style=span&&getComputedStyle(span);return {key:b.dataset.hoopsControl,w:r.width,h:r.height,text:span?.textContent.trim()||'',textWidth:text?.width||0,textHeight:text?.height||0,textFont:style?parseFloat(style.fontSize):0,textVisible:style?.visibility==='visible'&&Number(style.opacity)>0,svg:!!b.querySelector('svg'),label:b.getAttribute('aria-label')};}));
 const controlMode=await page.locator('.hoops-controls').getAttribute('data-hoops-mode');
 const expectedControls=expectedControlsByMode[controlMode];
 assert.ok(expectedControls,'one of the five authored control states');
 assert.deepEqual(controls.map(c=>c.key).sort(),expectedControls.sort(),'explicit contextual actions and hold sprint: '+JSON.stringify(controls));
 for(const c of controls){assert.ok(c.w>=48&&c.h>=48,`${c.key} ${c.w}x${c.h}`);assert.ok(approvedLabels.has(c.text),`${c.key} has an approved visible Hebrew label: ${c.text}`);assert.match(c.text,/[א-ת]/u);assert.ok(c.textVisible&&c.textWidth>=8&&c.textHeight>=9&&c.textFont>=10,`${c.key} Hebrew label is actually painted: ${JSON.stringify(c)}`);assert.ok(c.svg,`${c.key} has an icon`);assert.ok(c.label,`${c.key} is labelled for screen readers`);}
 const stick=await page.locator('.hoops-stick-zone').boundingBox();assert.ok(stick.width>=96&&stick.height>=96);
 check(`${controls.length} controls at least 48 px, visible Hebrew labels and icons`);
 const words=await page.evaluate(()=>{const roots=[document.querySelector('.hoops-bug')?.parentElement,document.querySelector('.hoops-controls')].filter(Boolean),found=[];
  for(const r of roots){const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const el=n.parentElement;if(!el||el.closest('[hidden]')||!el.offsetParent||el.closest('.visually-hidden,[class*=sr-only]'))continue;if(/\p{L}/u.test(n.textContent))found.push(n.textContent.trim());}}return found;});
 assert.deepEqual(words.filter(text=>!approvedGameText.has(text)),[],'visible game text is restricted to authored Hebrew actions, role badges and digits');check('visible text is allowlisted Hebrew actions, LTR position codes and digits');

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
  const primary=page.locator('[data-hoops-control=shoot]:visible,[data-hoops-control=block]:visible');const shootBox=await (await primary.count()?primary.first():page.locator('[data-hoops-control=pass]:visible')).boundingBox();assert.ok(shootBox,'the current mode exposes a primary touch action');await page.touchscreen.tap(shootBox.x+shootBox.width/2,shootBox.y+shootBox.height/2);
  await page.evaluate(()=>window.__island.games.current.session.debug.step(30));check('touch on stick and action button accepted');
 }

 // floating stick, dead zone, soft curve and sprint at full tilt; tap = short pass, hold = long pass
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.hold=true;d.controls.cancel();d.controls.setMode('ball');while(d.controls.held.queued)d.controls.consume();});
 const zoneBox=await page.locator('.hoops-stick-zone').boundingBox(),P={x:zoneBox.x+zoneBox.width/2,y:zoneBox.y+zoneBox.height/2};
 const readStick=()=>page.evaluate(()=>{const c=window.__island.games.current.session.debug.controls,r=c.elements.ring.getBoundingClientRect(),f=c.consume();return {ring:{x:r.x+r.width/2,y:r.y+r.height/2},held:c.held.stick,m:Math.hypot(f.move.x,f.move.z),sprint:f.sprint};});
 await page.mouse.move(P.x,P.y);await page.mouse.down();
 const s0=await readStick();assert.ok(s0.held&&Math.hypot(s0.ring.x-P.x,s0.ring.y-P.y)<3,'the stick appears under the thumb: '+JSON.stringify(s0));assert.equal(s0.m,0,'dead zone at the touch point');
 await page.mouse.move(P.x+14,P.y);const s1=await readStick();assert.ok(s1.m>0.05&&s1.m<0.45&&!s1.sprint,'a small push is a slow walk: '+JSON.stringify(s1));
 await page.mouse.move(P.x+70,P.y);const beforeHold=await readStick();assert.ok(beforeHold.m>.97&&!beforeHold.sprint,'full tilt waits for the authored hold threshold: '+JSON.stringify(beforeHold));await page.waitForTimeout(interaction.gesture_thresholds.one_finger_sprint_hold_ms+40);const s2=await readStick();assert.ok(s2.m>0.97&&s2.sprint,'held full tilt sprints: '+JSON.stringify(s2));
 await page.mouse.up();const s3=await readStick();assert.ok(!s3.held&&s3.m===0);
 check(`authored stick: centred under the thumb, dead zone, ${s1.m.toFixed(2)} at a small push, sprint at full tilt`);
 const passBox=await page.locator('[data-hoops-control=pass]').boundingBox(),PC={x:passBox.x+passBox.width/2,y:passBox.y+passBox.height/2};
 const passRead=async(mode,ms)=>{await page.evaluate(m=>{const c=window.__island.games.current.session.debug.controls;c.setMode(m);while(c.held.queued)c.consume();},mode);
  await page.mouse.move(PC.x,PC.y);await page.mouse.down();const during=await page.evaluate(()=>window.__island.games.current.session.debug.controls.held.queued);await page.waitForTimeout(ms);await page.mouse.up();
  return page.evaluate(d=>{const f=window.__island.games.current.session.debug.controls.consume();return {during:d,press:f.passPress,long:f.passLong};},during);};
 const tap=await passRead('ball',60),long=await passRead('ball',480),steal=await passRead('defense',60);
 assert.ok(tap.press&&!tap.long&&tap.during===0,'tap = short pass on release: '+JSON.stringify(tap));
 assert.ok(long.press&&long.long,'hold = long pass: '+JSON.stringify(long));
 assert.ok(steal.press&&!steal.long&&steal.during===1,'on defence the button steals at once: '+JSON.stringify(steal));
 await page.evaluate(()=>{window.__island.games.current.session.debug.hold=false;});check('pass: tap short, hold long, steal at once on defence');

 // shot meter: red, yellow and green zones above the shooter while the shot is held
 const meter=await page.evaluate(()=>{const d=window.__island.games.current.session.debug,e=d.engine,S=e.debug.state,a=e.debug.api;
  // The preceding gesture checks deliberately leave the controls in defence mode.
  // Isolate this held-shot fixture from their cancellation edges and from RAF play.
  d.hold=true;d.controls.setMode('ball');d.controls.cancel();while(d.controls.held.queued)d.controls.consume();
  const inp=o=>({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null,...o});
  for(let i=0;i<900&&e.snapshot().phase!=='live';i++)d.step(1,inp({}));
  const me=a.onCourt(0)[0],side=a.side(0),rim=e.court.rim(side);
  // Giving a player the ball does not clear an action from the earlier live play.
  me.act=null;me.actT=0;me.act2=null;me.shot=null;me.air=-1;me.jumpH=0;me.stumble=0;
  e.debug.give(me.id);S.controlled=me.id;e.debug.place(me.id,rim.x-side*6.2,0.4);S.shotClock=24;
  d.controls.setMode('ball');d.controls.cancel();while(d.controls.held.queued)d.controls.consume();
  for(const p of a.onCourt(1))e.debug.place(p.id,-side*12,p.z);
  d.step(1,inp({shootDown:true}));const dbg={phase:e.snapshot().phase,act:me.act,actT:me.actT,shotType:me.shot?.type,held:me.shot?.held,ctl:S.controlled===me.id,own:S.ball.owner===me.id,ball:S.ball.state,auto:S.autopilot,user:S.userTeam};d.step(30,inp({}));
  const m=document.querySelector('.hoops-meter'),y=m.querySelector('.hoops-meter-yellow').getBoundingClientRect(),g=m.querySelector('.hoops-meter-win').getBoundingClientRect();
  return {dbg,shown:!m.hidden,held:e.snapshot().players.find(p=>p.id===me.id).shotHeld,yH:y.height,gH:g.height,yTop:y.top,gTop:g.top,yBottom:y.bottom,gBottom:g.bottom};});
 assert.ok(meter.shown&&meter.held,'meter shows while the shot is held: '+JSON.stringify(meter));
 assert.ok(meter.yH>meter.gH*1.6&&meter.yTop<meter.gTop&&meter.yBottom>meter.gBottom,'yellow wraps the green zone: '+JSON.stringify(meter));
 // software WebGL needs a moment after the burst of steps
 await page.waitForTimeout(1500);await shot('04-meter');
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.step(1,{move:{x:0,z:0},sprint:false,shootDown:false,shootUp:true,passPress:false,passLong:false,passDir:null,altPress:false,switchPress:false,timeoutPress:false,call:null});});
 check(`shot meter: yellow ${meter.yH.toFixed(0)} px around green ${meter.gH.toFixed(0)} px`);

 // play on and take the broadcast shots
 await page.evaluate(()=>window.__island.games.current.session.debug.step(900));await page.waitForTimeout(300);await shot('02-halfcourt');
 await page.evaluate(()=>window.__island.games.current.session.debug.step(1500));await page.waitForTimeout(300);await shot('03-play');
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug;for(let i=0;i<120&&d.engine.snapshot().score.every(v=>v===0);i++)d.step(60);});
 s=await snap();row.score=s.score;row.quarter=s.quarter;assert.ok(s.score[0]+s.score[1]>0,'points were scored');check(`play reached ${s.score.join('-')} in quarter ${s.quarter}`);

 // pause freezes the simulation
 // A screenshot hold must never make this pause assertion pass by itself.
 const beforePause=await page.evaluate(()=>{const session=window.__island.games.current.session;session.debug.hold=false;return session.snapshot.tick;});
 await page.waitForFunction(tick=>window.__island.games.current.session.snapshot.tick>tick,beforePause,{timeout:30000});
 check('RAF advances the engine before pause');
 await page.evaluate(()=>window.__island.games.current.session.setPaused(true));
 const p0=(await snap()).tick;await page.waitForTimeout(700);const p1=(await snap()).tick;assert.equal(p1,p0,'paused game does not step');
 await page.evaluate(()=>window.__island.games.current.session.setPaused(false));check('pause freezes the clock');

 // leaving releases everything
 await page.evaluate(()=>{const g=window.__island.games;if(g.cleanup)g.cleanup();else g.current.cancel();});await page.waitForTimeout(500);
 const left=await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,listeners:window.__probe.listeners(),audio:window.__probe.audioOpen,current:!!window.__island.games.current}));
 assert.equal(left.current,false);assert.ok(left.listeners<=listenersBefore+2,`listeners ${listenersBefore} -> ${left.listeners}`);assert.ok(left.audio<=1,'audio contexts closed');
 check('leaving the game releases the session, listeners and audio');

 const real=errors.filter(e=>!/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
 await csp.assertClean();assert.deepEqual(real,[],'no console errors');assert.deepEqual(outside,[],'no requests outside the app');check('no console errors, no outside requests');
 row.csp=csp.snapshot();report.viewports.push(row);
 }catch(error){suiteError=error;row.failed=true;row.error=error.stack||error.message;row.errors=errors;row.outside=outside;row.csp=csp.snapshot();report.viewports.push(row);throw error;}
 finally{
  let auditError=null;const failed=(error,field)=>{auditError??=error;row.failed=true;row[field]=error.stack||error.message;row.error??=error.stack||error.message;};
  try{await csp.assertClean();}catch(error){failed(error,'cspFailure');}
  try{await context.close();await csp.assertClean();}catch(error){failed(error,'cspAfterCloseFailure');}
  row.csp=csp.snapshot();
  try{await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,1));}finally{await csp.dispose();}
  if(!suiteError&&auditError)throw auditError;
 }
}
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,1));
console.log('hoops browser: all viewports passed');
}finally{await browser.close();await server.close();}
