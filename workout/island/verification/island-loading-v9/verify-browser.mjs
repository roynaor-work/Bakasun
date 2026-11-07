import {chromium} from '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT='/home/user/Bakasun/workout/island/verification/island-loading-v9/';
const URL_='http://localhost:8765/workout/island/index.html';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const res={};
const slow=async(ctx,p,kb=300)=>{const c=await ctx.newCDPSession(p);await c.send('Network.enable');await c.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:kb*1024,uploadThroughput:100*1024});};
const state=p=>p.evaluate(()=>{const s=document.querySelector('[data-boot-splash]');return s?{clip:s.dataset.clip||null,state:s.dataset.state||null,video:!!s.querySelector('video'),t:performance.now()|0,paused:s.querySelector('video')?.paused,ct:s.querySelector('video')?.currentTime}:null;});
// 1 slow network: clip plays
{const ctx=await b.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});const p=await ctx.newPage();await slow(ctx,p);
 await p.goto(URL_,{waitUntil:'commit'});await p.waitForSelector('[data-boot-splash]');await p.waitForTimeout(4500);res.slowPlaying=await state(p);await p.screenshot({path:OUT+'1-slow-playing.png'});
 await p.waitForTimeout(1200);await p.screenshot({path:OUT+'1b-slow-playing-later.png'});
 await p.waitForFunction(()=>!document.querySelector('[data-boot-splash]'),null,{timeout:90000});res.slowEnded=await p.evaluate(()=>({splash:!!document.querySelector('[data-boot-splash]'),ariaHidden:document.querySelector('#interface').getAttribute('aria-hidden'),children:document.querySelector('#interface').childElementCount}));
 await p.screenshot({path:OUT+'2-after-ready.png'});await ctx.close();}
// 2 reduced motion
{const ctx=await b.newContext({viewport:{width:844,height:390},serviceWorkers:'block',reducedMotion:'reduce'});const p=await ctx.newPage();await slow(ctx,p);let vid=0;p.on('request',r=>{if(/\.mp4/.test(r.url()))vid++;});
 await p.goto(URL_,{waitUntil:'commit'});await p.waitForSelector('[data-boot-splash]');await p.waitForTimeout(3000);res.reduced={...await state(p),clipRequests:vid};await p.screenshot({path:OUT+'3-reduced-motion-static.png'});await ctx.close();}
// 3 clip missing -> silent static fallback
{const ctx=await b.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});const p=await ctx.newPage();await slow(ctx,p);await p.route('**/boot-montage.mp4',r=>r.fulfill({status:404,body:'no'}));
 await p.goto(URL_,{waitUntil:'commit'});await p.waitForSelector('[data-boot-splash]');await p.waitForTimeout(3500);res.missing=await state(p);await p.screenshot({path:OUT+'4-clip-missing-static.png'});await ctx.close();}
// 4 phone portrait
{const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await ctx.newPage();await slow(ctx,p);
 await p.goto(URL_,{waitUntil:'commit'});await p.waitForSelector('[data-boot-splash]');await p.waitForTimeout(3500);res.portrait=await state(p);await p.screenshot({path:OUT+'5-portrait-playing.png'});await ctx.close();}
// 5 fast load: no clip request at all
{const ctx=await b.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});const p=await ctx.newPage();let vid=0;p.on('request',r=>{if(/\.mp4/.test(r.url()))vid++;});
 await p.goto(URL_);await p.waitForFunction(()=>!document.querySelector('[data-boot-splash]'),null,{timeout:30000});await p.waitForTimeout(500);res.fastClipRequests=vid;await ctx.close();}
// 6 offline: cached clip answers byte ranges (206) through the worker
{const ctx=await b.newContext({viewport:{width:844,height:390}});const p=await ctx.newPage();await p.goto(URL_+'?bootVideo=0');
 await p.waitForFunction(()=>navigator.serviceWorker.controller||navigator.serviceWorker.getRegistration().then(r=>r?.active),null,{timeout:20000}).catch(()=>{});
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForTimeout(1500);
 const out=await p.evaluate(async()=>{const clip=new URL('assets/boot/boot-montage.mp4',location.href).href;const names=await caches.keys();const name=names.find(n=>n.startsWith('island-assets-'));if(!name)return {noCache:names};
  const cache=await caches.open(name);await cache.put(clip,await fetch(clip));return {name};});
 await ctx.setOffline(true);
 const r=await p.evaluate(async()=>{const clip=new URL('assets/boot/boot-montage.mp4',location.href).href+'?x='+Date.now();const a=await fetch(clip,{headers:{Range:'bytes=0-99'}});const bf=await a.arrayBuffer();const f=await fetch(clip);const full=await f.arrayBuffer();return {rangeStatus:a.status,rangeLen:bf.byteLength,cr:a.headers.get('content-range'),fullStatus:f.status,fullLen:full.byteLength};});
 res.offline={...out,...r};await ctx.close();}
console.log(JSON.stringify(res,null,1));await b.close();
