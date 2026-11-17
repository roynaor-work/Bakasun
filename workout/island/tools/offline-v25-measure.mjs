// Offline v25 before/after measurements in a real Chromium (swiftshader), phone viewport 844x390:
//  1. time to the first game frame, cold over an emulated slow 4G (worker blocked, so the throttle
//     really applies) against warm from the device cache (same throttle, worker serving);
//  2. network requests on open, cold against warm;
//  3. full download time and size (local server, no throttle);
//  4. partial update (one changed file) against a full download, in bytes fetched.
// Writes verification/offline-v25/measurements.json and prints a markdown table.
// Run: ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chromium> node workout/island/tools/offline-v25-measure.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

const island=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8'));
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const SLOW_4G={offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8};
const GAMES=process.env.MEASURE_GAMES?.split(',')||['soccer','streetSlam','alpineRush'];
const out={at:new Date().toISOString(),version:manifest.schema,games:{},open:{},download:{},update:{}};

async function context(browser,{blockWorker=false}={}){
 const c=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:blockWorker?'block':'allow'});
 const page=await c.newPage();page.setDefaultTimeout(600000);
 return {c,page};
}
async function throttle(page,on){const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',on?SLOW_4G:{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});return cdp;}
async function boot(page,url,query){
 const t0=Date.now();let network=0,sw=0;const onResponse=r=>{if(!r.url().startsWith(url))return;r.fromServiceWorker()?sw++:network++;};page.on('response',onResponse);
 await page.goto(url+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:600000});
 const ms=Date.now()-t0;page.off('response',onResponse);
 if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;
  for(const t of ['basketball','soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size;x++)if(e.place(t,x,z).ok){done=true;break;}}});
 return {ms,network,sw};
}
async function play(page,id,url){
 let network=0,sw=0,bytes=0;const onResponse=async r=>{if(!r.url().startsWith(url))return;if(r.fromServiceWorker())sw++;else{network++;try{bytes+=(await r.body()).length;}catch{}}};page.on('response',onResponse);
 await page.evaluate(id=>{const e=window.__island.engine;if(!e.state.instructionsSeen.includes(id))e.state.instructionsSeen.push(id);window.__island.ui.activityInterface.launch(id,undefined,1);},id);
 await page.waitForTimeout(300);if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 const t0=Date.now();
 await page.waitForFunction(()=>{const s=window.__island.games?.current?.session?.snapshot;return s&&(s.renderMetrics?.calls>0||s.renderMetrics?.drawCalls>0||s.loaded||s.renderMetrics?.assetStatus==='ready');},null,{timeout:600000});
 const ms=Date.now()-t0;await page.waitForTimeout(1500);page.off('response',onResponse);
 await page.evaluate(()=>{window.__island.games.cleanup?.();window.__island.ui.closeModal?.();});await page.waitForTimeout(500);
 return {ms,network,sw,bytes};
}
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
try{
 // Cold: fresh profile, no worker, slow 4G.
 {const {c,page}=await context(browser,{blockWorker:true});await throttle(page,true);
  out.open.cold=await boot(page,server.url,'?dev=1&autodownload=0');console.log('cold open',out.open.cold);
  for(const id of GAMES){out.games[id]={cold:await play(page,id,server.url)};console.log('cold',id,out.games[id].cold);}
  await c.close();}
 // Warm: fresh profile, full download from the page (local, no throttle), then slow 4G and the worker serving.
 {const {c,page}=await context(browser);
  await boot(page,server.url,'?dev=1&autodownload=0');
  out.download.full=await page.evaluate(async()=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);const t0=performance.now();const r=await m.downloadGames();return {ms:Math.round(performance.now()-t0),files:r.total,failed:r.failed.length,mb:Math.round(r.bytes/1048576*10)/10};});
  console.log('full download',out.download.full);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const cdp=await throttle(page,true);
  out.open.warm=await boot(page,server.url,'?dev=1&autodownload=0');console.log('warm open',out.open.warm);
  for(const id of GAMES){out.games[id].warm=await play(page,id,server.url);console.log('warm',id,out.games[id].warm);}
  await throttle(page,false);await cdp.detach().catch(()=>{});
  // Partial update: one changed soccer texture, next manifest and release.json served by routes.
  const NEXT='island-v2-measure-next',changedPath=manifest.games.soccer.find(p=>/\.webp$/.test(p)&&manifest.files[p][1]<200000);
  const original=await readFile(new URL(changedPath,island)),modified=Buffer.concat([original,Buffer.from('v25-changed')]);
  const next=structuredClone(manifest);next.files[changedPath]=[createHash('sha256').update(modified).digest('hex').slice(0,16),modified.length];
  await c.route(u=>/release\.json/.test(u.pathname),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:NEXT})}));
  await c.route(u=>/offline-manifest\.json$/.test(u.pathname)&&u.searchParams.get('v')===NEXT,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(next)}));
  await c.route(u=>u.pathname.endsWith('/'+changedPath),route=>route.fulfill({status:200,contentType:'image/webp',body:modified}));
  out.update=await page.evaluate(async NEXT=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);const t0=performance.now();const r=await m.prefetchRelease(NEXT);return {ms:Math.round(performance.now()-t0),files:r.total,copied:r.copied,copiedMb:Math.round(r.copiedBytes/1048576*10)/10,downloadedFiles:r.downloaded.total,downloadedKb:Math.round(r.downloaded.bytes/1024),failed:r.downloaded.failed.length};},NEXT);
  console.log('partial update',out.update);
  await c.close();}
}finally{await browser.close();await server.close();}
const dir=new URL('../verification/offline-v25/',import.meta.url);await mkdir(dir,{recursive:true});
await writeFile(new URL('measurements.json',dir),JSON.stringify(out,null,1)+'\n');
const row=(k,a,b)=>`| ${k} | ${a} | ${b} |`;
console.log('\n| מדד | לפני (רשת, 4G איטי) | אחרי (מהמכשיר) |\n|---|---|---|');
console.log(row('פתיחת האי: זמן עד העיר',out.open.cold.ms+' ms',out.open.warm.ms+' ms'));
console.log(row('פתיחת האי: בקשות לרשת',out.open.cold.network,out.open.warm.network+' (מהעובד: '+out.open.warm.sw+')'));
for(const id of GAMES)console.log(row(id+': פריים ראשון',out.games[id].cold.ms+' ms, '+out.games[id].cold.network+' בקשות, '+Math.round(out.games[id].cold.bytes/1048576*10)/10+' MB',out.games[id].warm.ms+' ms, '+out.games[id].warm.network+' בקשות לרשת'));
console.log(row('הורדה מלאה (שרת מקומי)',out.download.full.mb+' MB, '+out.download.full.files+' קבצים',out.download.full.ms+' ms'));
console.log(row('עדכון גרסה, קובץ אחד שונה',out.download.full.mb+' MB (מלא)',out.update.downloadedKb+' KB ב-'+out.update.downloadedFiles+' קבצים, '+out.update.copied+' הועתקו ('+out.update.copiedMb+' MB) ב-'+out.update.ms+' ms'));
