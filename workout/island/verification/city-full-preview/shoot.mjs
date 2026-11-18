// Run from repo root: CHROMIUM_PATH=/opt/pw-browsers/chromium node workout/island/verification/city-full-preview/shoot.mjs <outDir> [mode] [tag]
// Loads ?cityPreview=<mode> at 844x390, checks the save is untouched, measures load + fps + triangles, takes shots.
import {serveIsland,islandChromium} from '../../../../tests/helpers/island-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'full',tag=process.argv[4]||mode;
await mkdir(out,{recursive:true});
const server=await serveIsland(),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Jerusalem'});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
// A made-up "real" save so we can prove it is not touched.
await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.evaluate(()=>{window.__island.engine.save();});
const probe=await context.newPage();await probe.goto(server.url+'release.json');
const snap=async()=>{await page.goto('about:blank');return probe.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));};
// Leave the first page (its pagehide writes the save once), then take the reference snapshot on a quiet same-origin page.
const before=await snap();
const t0=Date.now();
await page.goto(server.url+`?dev=1&cityPreview=${mode}${process.env.EXTRA||''}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__cityPreview);
const ready=Date.now()-t0;
await page.waitForTimeout(+process.env.SETTLE||8000);
const fps=await page.evaluate(()=>new Promise(res=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<6000)requestAnimationFrame(f);else res(n/6);};requestAnimationFrame(f);}));
const m=await page.evaluate(()=>{const v=window.__island.view,x=v.metrics();return {triangles:x.triangles,calls:x.calls,traffic:x.traffic,buildings:window.__cityPreview.count,models:x.models};});
const views=[['overview',null],['zoom-ne',[22,8,3]],['zoom-centre',[14,14,3.4]],['zoom-industry',[26,22,3]],['zoom-sw',[6,24,3]]];
for(const [name,spec] of views.filter(v=>!process.env.VIEWS||process.env.VIEWS.split(',').includes(v[0]))){
  await page.evaluate(spec=>{const v=window.__island.view;if(!spec)v.home();else v.flyToCell(...spec);},spec);
  await page.waitForTimeout(5000);await page.screenshot({path:path.join(out,`${tag}-${name}.png`)});
}
for(const a of process.env.NOANGLE?[]:[.2,1.2,2.4,3.6]){await page.evaluate(a=>{const v=window.__island.view;v.home();v.angle=a;v.updateCamera();},a);await page.waitForTimeout(2500);await page.screenshot({path:path.join(out,`${tag}-angle-${a}.png`)});}
// leave and re-enter the real city: the save must be byte-identical
const after=await snap();
await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
const back=await snap();
const diff=(a,b)=>Object.keys({...a,...b}).filter(k=>a[k]!==b[k]);
const result={mode,readyMs:ready,fps,...m,errors,saveKeys:Object.keys(before),changedDuringPreview:diff(before,after),changedAfterExit:diff(before,back)};
await writeFile(path.join(out,`${tag}.json`),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
await browser.close();await server.close();
