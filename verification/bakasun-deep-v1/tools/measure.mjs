import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root, label, hash='', runs='3'] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const { server, base } = await serve(root);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const res=[];
for (let i=0;i<+runs;i++){
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, locale:'he-IL', serviceWorkers:'block' });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.abort());
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:200*1024,uploadThroughput:100*1024});
  let n=0,bytes=0,reqs=[];
  cdp.on('Network.requestWillBeSent',e=>{n++;reqs.push(e.request.url)});
  cdp.on('Network.loadingFinished',e=>{bytes+=e.encodedDataLength});
  await page.addInitScript(()=>{window.__lcp=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});});
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(base+'index.html'+hash,{waitUntil:'load',timeout:120000});
  await page.waitForSelector('#app *',{timeout:60000});
  await page.waitForTimeout(1500);
  const m=await page.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0];const fcp=performance.getEntriesByName('first-contentful-paint')[0];return{dcl:nav.domContentLoadedEventEnd,load:nav.loadEventEnd,fcp:fcp&&fcp.startTime,lcp:window.__lcp,js:performance.getEntriesByType('resource').filter(r=>/\.js/.test(r.name)).length,css:performance.getEntriesByType('resource').filter(r=>/\.css/.test(r.name)).length}});
  res.push({...m,reqs:n,kb:Math.round(bytes/1024),errs:errs.length});
  await ctx.close();
}
const med=k=>{const a=res.map(r=>r[k]).sort((x,y)=>x-y);return Math.round(a[Math.floor(a.length/2)])};
console.log(label,hash,JSON.stringify(Object.fromEntries(['reqs','js','css','kb','dcl','fcp','lcp','load','errs'].map(k=>[k,med(k)]))));
await browser.close();server.close();
