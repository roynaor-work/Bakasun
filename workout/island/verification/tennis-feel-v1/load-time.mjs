import {createRequire} from 'node:module';
import {serveIsland} from '/home/user/Bakasun/tests/helpers/island-browser.mjs';
const require=createRequire('/home/user/Bakasun/workout/island/tools/x.mjs'),{chromium}=require('/opt/node22/lib/node_modules/playwright');
const server=await serveIsland();
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const runs=[];
for(let i=0;i<3;i++){
 const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});const p=await ctx.newPage();
 const cdp=await ctx.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:90,downloadThroughput:1.2*1024*1024/8*8,uploadThroughput:1024*1024,connectionType:'cellular4g'});
 const t0=Date.now();const reqs=[];p.on('requestfinished',r=>reqs.push([Date.now()-t0,new URL(r.url()).pathname.split('/').slice(-2).join('/')]));
 await p.goto(server.url+'tools/perf-tennis.html?dur=3600&tennisV7=1',{waitUntil:'load'});
 await p.waitForFunction(()=>window.__tennis||window.__perf?.error,null,{timeout:200000});
 runs.push(Date.now()-t0);if(i===0)console.log(JSON.stringify(reqs.filter((_,k)=>k%3===0)));
 await ctx.close();
}
console.log('time to ready (ms), 4G-like:',runs.join(', '));
await b.close();await server.close?.();
