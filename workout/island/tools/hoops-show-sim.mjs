// Proof run for the basketball presentation M4 (hoopsShow): the real session (hoops-session + view + HUD) on autopilot in
// headless Chromium (SwiftShader), counting dunks, alley-oops, buzzer/winning threes against automatic replays, the replay
// durations on screen, and frames over 33 ms during replays against live play.
// Two modes: `live` runs the RAF loop for `seconds` of wall time (what the phone does); `fast` drives debug.step in bursts
// for `minutes` of game time, letting each replay finish with wall renders, so enough dunks happen to count.
// Usage: node workout/island/tools/hoops-show-sim.mjs [mode=live|fast] [seconds=60] [minutes=12] [seed=4242] [extra=hoopsShow=0] [out=path.json]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const mode=args.mode||'live',seconds=Number(args.seconds||60),minutes=Number(args.minutes||12),seed=Number(args.seed||4242),extra=args.extra||'';
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
let result;
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(600000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 // dpr=0.15: a tiny backing store, so the frame time is the CPU work of the engine, the view and the HUD (what SwiftShader can measure)
 await page.goto(`${base}?dev=1&dur=36000&dpr=0.15&seed=${seed}&hoopsAuto=1&hoopsQuality=1&hoopsProfile=quick${extra?'&'+extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(err);
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;});
 if(mode==='live'){
  // frame timing split by replay state, sampled from the page's own RAF
  await page.evaluate(()=>{const S=window.__sim={live:[],replay:[],last:0,reasons:{}};const raw=requestAnimationFrame.bind(window);const loop=now=>{if(S.last){const s=window.__session.snapshot;(s.replaying?S.replay:S.live).push(now-S.last);const r=s.replayInfo;if(r?.show&&r.reason&&r.wall<0.05)S.reasons[r.reason]=(S.reasons[r.reason]||0)+1;}S.last=now;raw(loop);};raw(loop);});
  await page.waitForTimeout(seconds*1000);
  result=await page.evaluate(()=>{const S=window.__sim,s=window.__session.snapshot,pct=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return +b[Math.min(b.length-1,Math.floor(p*(b.length-1)))].toFixed(1);},over=a=>a.filter(f=>f>33.4).length;
   return {mode:'live',gameClock:s.clock,quarter:s.quarter,steps:s.stepsRun,score:s.score,show:s.show,frames:{live:S.live.length,replay:S.replay.length,over33Live:over(S.live),over33Replay:over(S.replay),p50Live:pct(S.live,.5),p50Replay:pct(S.replay,.5),p95Live:pct(S.live,.95),p95Replay:pct(S.replay,.95)},render:{calls:s.renderMetrics?.calls,triangles:s.renderMetrics?.triangles,frameMs:s.renderMetrics?.frameMs},audio:s.audioMetrics?.played,viewShow:s.renderMetrics?.show};});
 }else{
  // fast: the session's dev hook steps the engine; while a replay runs we render on the wall clock (a 16 ms timer: headless RAF can
  // stall for seconds while the page is driven from outside, which inflated two replay durations to 10-13 s) until it completes,
  // measuring its duration and its render frame times (view.render CPU) against live render frames
  await page.evaluate(()=>{const d=window.__session.debug;d.hold=true;});
  const ticks=Math.round(minutes*60*60);
  result=await page.evaluate(async(ticks)=>{
   const d=window.__session.debug,view=()=>d.view,S={liveMs:[],replayMs:[],durations:[],reasons:{},first:[]};
   const frameMs=()=>window.__session.snapshot.renderMetrics.frameMs;
   let done=0;
   while(done<ticks&&window.__session.snapshot.phase!=='final'){
    // a burst of live steps (one render per call)
    const n=Math.min(30,ticks-done);d.step(n);done+=n;S.liveMs.push(frameMs());
    // the automatic replay is armed by the score event and starts in the HUD update after SHOW.replayDelay: wait it out
    const snap=window.__session.snapshot;
    if(snap.show?.pending){await new Promise(r=>setTimeout(r,1300));d.render();}
    if(view()?.replaying){
     const t0=performance.now();const ri0=window.__session.snapshot.replayInfo;let reason=ri0?.reason;S.plans=(S.plans||[]).concat([ri0&&{frames:ri0.frames,contact:ri0.contact,total:ri0.total}]);
     const trace=[];while(view()?.replaying&&performance.now()-t0<15000){await new Promise(r=>setTimeout(r,16));d.render();S.replayMs.push(frameMs());const ri=window.__session.snapshot.replayInfo;if(trace.length<400)trace.push(ri?+ri.wall.toFixed(2):null);}
     S.traces=(S.traces||[]).concat([trace.length>12?trace.slice(0,6).concat(['…'],trace.slice(-4)):trace]);
     S.durations.push(+((performance.now()-t0)/1000).toFixed(2));if(reason)S.reasons[reason]=(S.reasons[reason]||0)+1;
    }
   }
   const s=window.__session.snapshot,pct=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return +b[Math.min(b.length-1,Math.floor(p*(b.length-1)))].toFixed(1);},over=a=>a.filter(f=>f>33.4).length;
   return {mode:'fast',replayTraces:S.traces||[],replayPlans:S.plans||[],ticks:done,gameMinutes:+(done/3600).toFixed(1),quarter:s.quarter,phase:s.phase,score:s.score,show:s.show,replayDurations:S.durations,replayReasons:S.reasons,render:{liveFrames:S.liveMs.length,replayFrames:S.replayMs.length,over33Live:over(S.liveMs),over33Replay:over(S.replayMs),p50Live:pct(S.liveMs,.5),p50Replay:pct(S.replayMs,.5),p95Live:pct(S.liveMs,.95),p95Replay:pct(S.replayMs,.95),calls:s.renderMetrics?.calls,triangles:s.renderMetrics?.triangles},audio:s.audioMetrics?.played,viewShow:s.renderMetrics?.show};
  },ticks);
 }
 result.errors=errors.filter(e=>!/favicon|manifest|404/.test(e));result.seed=seed;result.extra=extra;
 await context.close();
}finally{await browser.close();server.close();}
console.log(JSON.stringify(result,null,1));
if(args.out)await writeFile(args.out,JSON.stringify(result,null,1));
