// Stills for the basketball presentation M4 (hoopsShow): the live baseline cut right after a dunk, the celebration (scorer,
// nearest teammate, dunked-on defender), the crowd standing on the dunk against the same stands at rest, the automatic replay's
// two angles with the "שידור חוזר" tag, and the shot-clock warning. Software WebGL (SwiftShader): poses, framing and HUD, not speed.
// Usage: node workout/island/tools/hoops-show-shots.mjs out=/tmp/show-shots [seed=4242] [viewport=844x390] [dpr=1] [extra=hoopsShow=0]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-show-shots'),seed=Number(args.seed||4242),dpr=Number(args.dpr||1),extra=args.extra||'';
const [vw,vh]=(args.viewport||'844x390').split('x').map(Number);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const log={};
try{
 const context=await browser.newContext({viewport:{width:vw,height:vh},hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(600000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}?dev=1&dur=36000&seed=${seed}&hoopsAuto=1&hoopsQuality=1&hoopsProfile=quick${extra?'&'+extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(err);
 // hold: the RAF loop keeps the last frame; holdReplay: the armed automatic replay waits until the live stills are taken
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;window.__session.debug.holdReplay=true;});
 const shot=async(name)=>{await page.evaluate(async()=>{const d=window.__session.debug;d.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.waitForTimeout(200);await page.screenshot({path:path.join(out,`${name}.jpg`),type:'jpeg',quality:86,timeout:120000,animations:'disabled'});console.log('shot',name);};
 const override=(pos,look,fov)=>page.evaluate(([pos,look,fov])=>window.__session.debug.view.setCameraOverride(pos,look,fov),[pos,look,fov]);
 const court=await page.evaluate(()=>{const c=window.__session.debug.engine.court;return {rimX:c.rimX,hx:c.hx,hz:c.hz,rimY:c.rimY};});
 // the stands at rest, from a fixed seat-side camera (the same framing is used again on the dunk)
 const standsCam=[{x:0,y:3.2,z:-2},{x:0,y:4.5,z:14},34];
 await page.evaluate(()=>{const d=window.__session.debug;d.view.snapCamera();d.step(120);});
 await override(...standsCam);await shot('01-crowd-rest');await override(null,null,0);
 // step one tick at a time until a dunk by the home team is made (the automatic replay is armed by that score)
 // bursts of 20 ticks (one software render per burst): a dunk is noticed within a third of a second of game time
 page.on('console',m=>{if(m.type()==='log'&&/^search/.test(m.text()))console.log(m.text());});
 const found=await page.evaluate(()=>{const d=window.__session.debug;let tries=0,away=null,lastTick=-1;for(let i=0;i<60*60*20;i+=20){d.step(20);const s=window.__session.snapshot;if(s.phase==='final')return {final:true,i};if(i%3600===0)console.log('search',i/3600,'min',JSON.stringify(s.show));const ls=s.lastScore;if(ls&&ls.tick!==lastTick){lastTick=ls.tick;if(ls.type==='dunk'){if(ls.team===0||++tries>0)return {i,lastScore:ls,show:s.show};away=ls;}}}return {none:true,away};});
 log.found=found;console.log('dunk',JSON.stringify(found));
 if(found.lastScore){
  const scorer=await page.evaluate(id=>{const s=window.__session.debug.engine.snapshot(),p=s.players.find(p=>p.id===id);return {x:p.x,z:p.z,face:p.face,team:p.team,side:s.dir[p.team]};},found.lastScore.shooter);
  // the live camera's 0.4 s cut to the baseline angle (broadcast mode, no override)
  await shot('02-live-cut');
  // 0.25 s later: the scorer celebrates, the nearest teammate reacts, the dunked-on defender is disappointed
  await page.evaluate(()=>window.__session.debug.step(15));
  const cel=await page.evaluate(id=>{const d=window.__session.debug,s=d.engine.snapshot(),p=s.players.find(p=>p.id===id);return {x:p.x,z:p.z,motion:[...d.view.avatars.values()].filter(a=>a.root.visible).map(a=>a.card.id+':'+a.motionState),show:window.__session.snapshot.renderMetrics.show};},found.lastScore.shooter);
  log.celebration=cel;console.log('motion',cel.motion.join(' '));
  await override({x:cel.x-scorer.side*4.2,y:1.7,z:cel.z+(cel.z>=0?-3.6:3.6)},{x:cel.x,y:1.2,z:cel.z},44);await shot('03-celebration');
  // one second after the make: the dunked-on defender's delayed 'disappointed' has started
  await page.waitForTimeout(800);
  const cel2=await page.evaluate(id=>{const d=window.__session.debug;d.step(45);const s=d.engine.snapshot(),p=s.players.find(p=>p.id===id);return {x:p.x,z:p.z,motion:[...d.view.avatars.values()].filter(a=>a.root.visible).map(a=>a.card.id+':'+a.motionState)};},found.lastScore.shooter);
  log.celebration2=cel2;console.log('motion+1s',cel2.motion.join(' '));
  await override({x:cel2.x-scorer.side*4.2,y:1.7,z:cel2.z+(cel2.z>=0?-3.6:3.6)},{x:cel2.x,y:1.2,z:cel2.z},44);await shot('03b-celebration-1s');
  // the stands on the dunk (standing, wave), same camera as the rest shot
  await override(...standsCam);await shot('04-crowd-dunk');await override(null,null,0);
  // release the armed automatic replay (SHOW.replayDelay has long passed on the wall clock), render once to start it
  const started=await page.evaluate(async()=>{const d=window.__session.debug;d.holdReplay=false;d.render();await new Promise(r=>requestAnimationFrame(r));d.render();return window.__session.snapshot.replayInfo;});
  log.replayStart=started;console.log('replay',JSON.stringify(started));
  const runFor=async ms=>page.evaluate(async ms=>{const d=window.__session.debug,t0=performance.now();while(performance.now()-t0<ms){await new Promise(r=>requestAnimationFrame(r));d.render();}return window.__session.snapshot.replayInfo;},ms);
  // the cut on the wall clock: baseline 0..1.6 s, chase 1.6..3.2 s (0.5x), blend back after; stills cost wall time, so read the phase each time
  log.baseline=await runFor(400);await shot('05-replay-baseline');
  log.chase=await runFor(900);await shot('06-replay-chase');
  log.back=await runFor(1100);await shot('07-replay-back');
  log.after=await runFor(1500);
  log.tagHidden=await page.evaluate(()=>document.querySelector('.hoops-replay-tag').hidden);
  // a home dunk is rare in one autopilot game (about one a game): the home crowd's standing reaction is shown by feeding the view
  // a synthetic home dunk score event on the live snapshot (the mapping itself is unit tested), same stands camera as 01/04
  const homeDunk=await page.evaluate(()=>{const d=window.__session.debug,s=d.engine.snapshot(),p=s.players.find(p=>p.team===0);d.view.effects([{type:'score',team:0,points:2,playerId:p.id,shotType:'dunk',shotId:-1,score:s.score}],s);d.step(10);return window.__session.snapshot.renderMetrics.show;});
  log.homeDunk=homeDunk;await override(...standsCam);await shot('04b-crowd-home-dunk-synthetic');await override(null,null,0);
  console.log('replay phases',JSON.stringify([log.baseline,log.chase,log.back,log.after]),'tag hidden after',log.tagHidden);
 }
 // the shot-clock warning: step until the shot clock is under five seconds in live play
 // bursts of 10 ticks (a sixth of a second): the warning window is five seconds wide
 // the autopilot shoots long before five seconds: set the shot clock by the engine's dev hook on a live held ball
 const low=await page.evaluate(()=>{const d=window.__session.debug;for(let i=0;i<60*60*3;i+=10){d.step(10);const s=window.__session.snapshot;if(s.phase==='live'&&s.ball.state==='held'&&s.shotClockOn&&!s.replaying&&!s.show?.pending){d.engine.debug.setClock(null,4.2);d.step(1);return {i,shotClock:window.__session.snapshot.shotClock,low:document.querySelector('.hoops-shotclock').dataset.low};}}return null;});
 log.shotClock=low;if(low){await page.evaluate(()=>window.__session.debug.view.snapCamera());await shot('08-hud-shotclock');}
 log.errors=errors.filter(e=>!/favicon|manifest|404/.test(e));
 await context.close();
}finally{await browser.close();server.close();}
await writeFile(path.join(out,'log.json'),JSON.stringify(log,null,1));
console.log(JSON.stringify(log,null,1));
