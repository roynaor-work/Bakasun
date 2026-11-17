/** Reproducible real-session touch proof; serves target root without writing it.
 * PHONE_FIX_ROOT=/clean/checkout node AD-browser.mjs before|after|rollback
 * Uses shipped CSP, a real Web Audio context, and the existing full WebGL sessions.
 * Basketball audio cases call the production audio event interface with deterministic engine-shaped events;
 * the screenshot and touch input use the live production match. Racing drives the unmodified race model to its real stop. */
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.PHONE_FIX_ROOT||path.resolve(fileURLToPath(new URL('../../../../../',import.meta.url))),assets=process.env.PHONE_FIX_ASSETS||root;
const label=process.argv[2]||'after',out=process.env.PHONE_FIX_EVIDENCE||fileURLToPath(new URL('../evidence/',import.meta.url));await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const csp=(await readFile(path.join(assets,'workout/island/index.html'),'utf8')).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg','.mp3':'audio/mpeg','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{let rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(rel==='/phone-fix-a-audio.html'){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp});res.end('<!doctype html><html><meta name=viewport content="width=device-width,initial-scale=1"><body><button>בדיקת שמע</button></body></html>');return;}if(rel.endsWith('/'))rel+='index.html';let file=path.resolve(root,'.'+rel);if(!file.startsWith(root+'/'))throw Error('escape');try{if(!(await stat(file)).isFile())throw Error('missing');}catch{file=path.resolve(assets,'.'+rel);if(!file.startsWith(assets+'/'))throw Error('escape');}const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',...(path.extname(file)==='.html'?{'Content-Security-Policy':csp}:{}),'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const results={label,root,viewport:{width:844,height:390},hasTouch:true,isMobile:true,browser:browser.version(),cases:[]};
async function pageFor(game){const context=await browser.newContext({viewport:results.viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[],wasm=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.wasm(?:\?|$)/i.test(r.url()))wasm.push(r.url());});await context.addInitScript(()=>{window.__touches=0;addEventListener('pointerdown',e=>{if(e.pointerType==='touch')window.__touches++;},true);window.__wasmCalls=0;if(typeof WebAssembly==='object')for(const k of ['compile','instantiate','compileStreaming','instantiateStreaming']){const original=WebAssembly[k];if(original)WebAssembly[k]=function(...a){window.__wasmCalls++;return original.apply(this,a);};}});return {context,page,errors,wasm,game};}
try{
 // A: full production match + touch, then controlled production audio cases in the same touch browser.
 const offQuery=game=>label==='rollback'?'&phoneFixes=0':label==='individual'?'&phoneFix'+game+'=0':'';const a=await pageFor('A'),query=offQuery('A');
 await a.page.goto(origin+'/workout/island/tools/perf-hoops.html?dev=1&dur=600&quality=1&hoopsAuto=0&hoopsShow=0'+query,{waitUntil:'networkidle'});
 await a.page.waitForFunction(()=>window.__session?.loadFailed||(window.__session?.ready&&window.__session.snapshot.renderMetrics?.calls>0));const loadError=await a.page.evaluate(()=>window.__session.loadFailed);if(loadError)throw Error('Basketball full-session load: '+loadError);
 await a.page.evaluate(()=>window.__session.debug.hold=true);
 await a.page.evaluate(()=>document.getElementById('perf').hidden=true);const sprint=a.page.locator('[data-hoops-control="sprint"]');await sprint.tap();
 await a.page.screenshot({path:path.join(out,`A-${label}-844x390.png`)});
 const full=await a.page.evaluate(()=>({ready:window.__session.ready,touchControl:'sprint',renderCalls:window.__session.snapshot.renderMetrics.calls,render:window.__session.snapshot.renderMetrics,touches:window.__touches,fullPageWasmCalls:window.__wasmCalls}));
 const noWasm=await pageFor('A-audio-no-wasm');await noWasm.context.addInitScript(()=>Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:true}));await noWasm.page.goto(origin+'/phone-fix-a-audio.html?'+offQuery('A').slice(1));await noWasm.page.locator('button').tap();
 const ar=await noWasm.page.evaluate(async(full)=>{
  const m=await import('/workout/island/minigames/hoops-audio.mjs'),cfg=(await(await fetch('/workout/island/data/config.json')).json()).minigames.streetSlam.audio;
  const AC=window.AudioContext||window.webkitAudioContext,old=AudioBufferSourceNode.prototype.start,played=[];
  AudioBufferSourceNode.prototype.start=function(...args){played.push({seconds:this.buffer?.duration,sampleRate:this.buffer?.sampleRate,channels:this.buffer?.numberOfChannels});return old.apply(this,args);};
  let clock=10;const audio=m.createHoopsAudio({config:cfg,clock:()=>clock});audio.unlock();
  for(let i=0;i<100&&(audio.metrics().buffers<10||audio.metrics().whistle.referee.ready.length<2);i++)await new Promise(r=>setTimeout(r,50));
  if(audio.metrics().whistle.referee.ready.length<2)throw Error('Both real referee whistle buffers must decode before probing');await new Promise(r=>setTimeout(r,600));
  const before=audio.metrics();audio.events([{type:'steal'}]);await new Promise(r=>setTimeout(r,700));clock+=3;
  audio.events([{type:'interception'}]);await new Promise(r=>setTimeout(r,700));clock+=3;
  const possession=audio.metrics();audio.events([{type:'steal'},{type:'foul',kind:'reach'}]);await new Promise(r=>setTimeout(r,1600));clock+=3;
  const foul=audio.metrics();const n=played.length;audio.events([{type:'contact',what:'rim',speed:4}]);await new Promise(r=>setTimeout(r,250));
  const rim=played.slice(n),after=audio.metrics();audio.dispose();AudioBufferSourceNode.prototype.start=old;
  return {viewport:{width:innerWidth,height:innerHeight},...full,audioTouches:window.__touches,wasmCalls:window.__wasmCalls,wasmAvailable:typeof WebAssembly!=='undefined',before:before.played,possession:possession.played,refereeAfterPossession:possession.whistle.referee,refereeAfterImmediateFoul:foul.whistle.referee,rim,rimMetrics:after.rim||null,legacyPass:possession.whistle.referee.steal===2&&foul.whistle.referee.foul===0&&rim.length===1&&rim[0].seconds>.7&&rim[0].seconds<.8,desiredPass:possession.whistle.referee.steal===0&&foul.whistle.referee.foul===1&&rim.length===1&&Math.abs(rim[0].seconds-.18)<.0001};
 },full);results.cases.push({game:'A',...ar,errors:[...a.errors,...noWasm.errors],existingFullSessionWasmRequests:a.wasm,wasmRequests:noWasm.wasm});await noWasm.context.close();await a.context.close();
 // D: the full current race session is driven through its real automatic stop; no race fields are assigned.
 const d=await pageFor('D');await d.page.goto(origin+'/workout/island/tools/perf-racing.html?dev=1&hold=1&frames=100000000&shot=1&stage=1&racingV7=0'+offQuery('D'),{waitUntil:'networkidle'});
 await d.page.waitForFunction(()=>window.__session?.ready||window.__session?.loadFailed);const raceLoadError=await d.page.evaluate(()=>window.__session.loadFailed);if(raceLoadError)throw Error('Racing full-session load: '+raceLoadError);
 try{await d.page.locator('[data-action="racing-intro-go"]').tap({timeout:1000});}catch{await d.page.touchscreen.tap(700,290);}

 await d.page.evaluate(()=>{window.__session.setPaused(true);window.__session.debug.model.resume();});
 const dr=await d.page.evaluate(()=>{
  const r=window.__session.debug.model,p=r.state.player,st={};window.__pitLog=[];
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  window.__drive=until=>{for(let n=0;n<240*60&&r.state.phase!=='finished';n++){
   const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);let vmax=99;
   for(let dist=4;dist<=96;dist+=6){const c=Math.abs(tr.headingAt(pr.s+dist+6)-tr.headingAt(pr.s+dist-2))/8;if(c<.002)continue;vmax=Math.min(vmax,Math.sqrt(24/c+40*Math.max(0,dist-8)));}
   if(!st.braking&&p.speed>vmax+2)st.braking=true;else if(st.braking&&(p.speed<vmax-1||p.speed<9))st.braking=false;
   const input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:{steer:clamp(err*1.7,-1,1),throttle:st.braking?0:1,autoAccelerate:false,brake:!!st.braking,drift:false,nitro:false};r.step(1/60,input);window.__pitLog.push(...r.state.events.map(e=>({...e,time:r.state.time})));if(until())break;
  }};
  window.__drive(()=>p.pitRequest);return {time:r.state.time,pitRequest:p.pitRequest,lap:p.lap};
 });
 await d.page.waitForTimeout(100);const pitButtons=await d.page.locator('[data-action="racing-pit"]').count();await d.page.screenshot({path:path.join(out,`D-${label}-automatic-844x390.png`)});
 const cancel=await d.page.evaluate(()=>window.__session.debug.model.cancelPit());
 let change=null;
 if(!cancel){await d.page.evaluate(()=>window.__drive(()=>window.__session.debug.model.state.player.pit?.phase==='stop'));await d.page.waitForTimeout(150);const changeButton=d.page.locator('[data-action="racing-pit-change"]');const shown=await changeButton.isVisible();await d.page.screenshot({path:path.join(out,`D-${label}-change-844x390.png`)});if(shown)await changeButton.tap();change=await d.page.evaluate(()=>{const r=window.__session.debug.model;window.__drive(()=>window.__pitLog.some(e=>e.car==='player'&&e.type==='pitDone'));return {shown:document.querySelector('[data-action="racing-pit-change"]')!==null,pits:r.state.player.pits,tyre:r.state.player.tyre,log:window.__pitLog.filter(e=>e.car==='player'&&/^pit/.test(e.type))};});}
 const dm=await d.page.evaluate(()=>({touches:window.__touches,wasmCalls:window.__wasmCalls,ready:window.__session.ready,render:window.__session.snapshot.renderMetrics}));results.cases.push({game:'D',graphicsFlag:'racingV7=0',...dr,pitButtons,cancel,change,...dm,errors:d.errors,wasmRequests:d.wasm,legacyPass:pitButtons===1&&cancel===true,desiredPass:pitButtons===0&&cancel===false&&change?.pits===1&&change.tyre>.99});await d.context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,`AD-${label}-browser.json`),JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify(results.cases.map(c=>({game:c.game,desiredPass:c.desiredPass,legacyPass:c.legacyPass,touches:c.touches,errors:c.errors,wasmCalls:c.wasmCalls})),null,2));
if(results.cases.some(c=>!(label==='after'?c.desiredPass:c.legacyPass)||c.errors.length||c.wasmCalls||c.wasmRequests.length))process.exitCode=1;
