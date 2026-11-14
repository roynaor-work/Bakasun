// Tennis load time, before/after, measured the same way on the same machine at the same time (A/B interleaved, cold page each run).
// Real clock (no fake timers), a phone-like link (CDP: 9 Mbit/s down, 85 ms round trip) and a 4x slower CPU, service worker blocked so every
// file really comes over the link. From games.start('tennis') to: the first frame (session.ready), the player models, the 3D crowd.
//   BEFORE=<island folder of the old code> [AFTER=<this island>] [ROUNDS=3] [CPU=4] [NET=4g|none] [SEARCH_B=&tennisLoad=v24] node workout/island/tools/tennis-load-ab.mjs
// Writes the rows and the medians to OUT (default verification/tennis-aliens-v24-1/tennis-load.json).
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),island=path.resolve(here,'..');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ROUNDS=Number(process.env.ROUNDS||3),CPU=Number(process.env.CPU||4),NET=process.env.NET||'4g';
const OUT=process.env.OUT||path.join(island,'verification/tennis-aliens-v24-1/tennis-load.json');
const variants=[{name:'before',root:process.env.BEFORE,search:process.env.SEARCH_A||''},{name:'after',root:process.env.AFTER||island,search:process.env.SEARCH_B||''}].filter(v=>v.root);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
async function serve(root,prefix='/workout/island/'){
 const html=await readFile(path.join(root,'index.html'),'utf8'),meta=html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i)?.[0]||'',csp=(meta.match(/content="([^"]*)"/)||[])[1]?.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
 const server=createServer(async(req,res)=>{try{const pn=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!pn.startsWith(prefix)){res.writeHead(404).end();return;}let file=path.resolve(root,pn.slice(prefix.length)||'.');if((await stat(file)).isDirectory())file=path.join(file,'index.html');const body=await readFile(file);const h={'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'};if(file.endsWith('.html')&&csp)h['content-security-policy']=csp;res.writeHead(200,h);res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${server.address().port}${prefix}`,close:()=>{server.closeAllConnections();return new Promise(r=>server.close(r));}};
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];
async function measure(v){
 const server=await serve(v.root),context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{performance.setResourceTimingBufferSize(20000);window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true});}catch{}HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const cdp=await context.newCDPSession(page);if(NET==='4g'){await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:85,downloadThroughput:9e6/8,uploadThroughput:2e6/8});}
 try{
  await page.goto(server.url+'?dev=1&autodownload=0'+v.search,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded,null,{timeout:300000});
  await page.locator('[data-action=avatar-start]').tap();await page.waitForTimeout(300);
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('tennis',x,z).ok)done=true;});
  if(CPU>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:CPU});
  const t0=await page.evaluate(()=>{const t=performance.now();window.__island.games.start('tennis',undefined,1);return t;});
  const marks={};const started=Date.now();
  while(Date.now()-started<240000){
   const s=await page.evaluate(t0=>{const u=document.querySelector('[data-action=game-understood]');if(u&&u.offsetParent)u.click();const g=window.__island.games.current,sess=g?.session,m=sess?.snapshot?.renderMetrics;
    return {now:performance.now()-t0,ready:Boolean(sess?.ready),frames:m?.frames||0,crowd:m?.stadium12?.crowd||null,crowdLate:m?.stadium12?.crowdLate||null,motion:Boolean(m?.motion?.loaded),progress:document.querySelector('[data-load-progress]')?.textContent||''};},t0);
   if(s.ready&&marks.ready===undefined)marks.ready=Math.round(s.now);
   if(s.frames>0&&marks.firstFrame===undefined)marks.firstFrame=Math.round(s.now);
   if(s.crowd==='3d-lod'&&marks.crowd3d===undefined)marks.crowd3d=Math.round(s.now);
   if(s.motion&&marks.motion===undefined)marks.motion=Math.round(s.now);
   if(s.progress)marks.progress=s.progress;
   if(marks.ready!==undefined&&(marks.crowd3d!==undefined||s.crowdLate==='failed'||s.now-marks.ready>6000))break;
   await page.waitForTimeout(40);
  }
  if(CPU>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const res=await page.evaluate(t0=>performance.getEntriesByType('resource').filter(e=>e.startTime>=t0).map(e=>({name:e.name.replace(/^.*\/workout\/island\//,'').replace(/\?v=[^&]+/,''),start:Math.round(e.startTime-t0),end:Math.round(e.responseEnd-t0),bytes:e.encodedBodySize})),t0);
  const beforeReady=res.filter(r=>r.end<=marks.ready),longs=await page.evaluate(t0=>window.__long.filter(([s])=>s>=t0).map(([s,d])=>[Math.round(s-t0),Math.round(d)]),t0);
  const pick=n=>{const r=res.find(x=>x.name.endsWith(n));return r?[r.start,r.end]:null;};
  const metrics=await page.evaluate(()=>{const m=window.__island.games.current?.session.snapshot.renderMetrics;return m&&{load:m.load||null,triangles:m.triangles,drawCalls:m.drawCalls,crowd:m.stadium12?.crowd,grip:m.grip||null};});
  return {variant:v.name,search:v.search,...marks,filesBeforeReady:beforeReady.length,mbBeforeReady:+(beforeReady.reduce((n,r)=>n+(r.bytes||0),0)/1048576).toFixed(2),filesTotal:res.length,
   kidModel:pick('assets/kid-full.glb'),court:pick('court-clay.glb'),stand:pick('stand-10m.glb'),lastFan:res.filter(r=>/tennis-crowd-v22\/runtime/.test(r.name)).reduce((m,r)=>Math.max(m,r.end),0)||null,
   longestTaskMs:longs.reduce((m,[,d])=>Math.max(m,d),0),longTasksMs:longs.reduce((n,[,d])=>n+d,0),metrics,errors};
 }finally{await context.close();await server.close();}
}
try{
 for(let round=0;round<ROUNDS;round++)for(const v of (round%2?[...variants].reverse():variants)){const row=await measure(v);rows.push({round,...row});console.log(JSON.stringify({round,variant:row.variant,ready:row.ready,crowd3d:row.crowd3d,kid:row.kidModel,court:row.court,stand:row.stand,lastFan:row.lastFan,mbBeforeReady:row.mbBeforeReady,longest:row.longestTaskMs,errors:row.errors.length}));}
}finally{await browser.close();}
const median=list=>{const a=list.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)/2)]:null;};
const summary=Object.fromEntries(variants.map(v=>{const r=rows.filter(x=>x.variant===v.name);return [v.name,{runs:r.length,readyMs:median(r.map(x=>x.ready)),crowd3dMs:median(r.map(x=>x.crowd3d)),kidModelStartMs:median(r.map(x=>x.kidModel?.[0])),mbBeforeReady:median(r.map(x=>x.mbBeforeReady)),longestTaskMs:median(r.map(x=>x.longestTaskMs))}];}));
console.log(JSON.stringify(summary,null,1));
await mkdir(path.dirname(OUT),{recursive:true});await writeFile(OUT,JSON.stringify({link:NET==='4g'?'9 Mbit/s, 85 ms RTT (CDP)':'none',cpuSlowdown:CPU,browser:'Chromium / SwiftShader, 844x390 mobile, service worker blocked',note:'machine shared with other jobs: A/B interleaved, medians',summary,rows},null,1)+'\n');
