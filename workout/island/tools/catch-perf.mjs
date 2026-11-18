// Cost of "תפוס את הפושע" per stage: draw calls, triangles, textures and the time of one view.update
// (JS plus the software GL of Chromium without a GPU, so only the relative size is meaningful).
//   node workout/island/tools/catch-perf.mjs [stages=1,5,8,10] [baseUrl=http://127.0.0.1:8765/workout/island/]
// Needs a static server on the repo root and Playwright (ISLAND_PLAYWRIGHT=/path/to/playwright/index.mjs).
import {pathToFileURL} from 'node:url';
const [,,stagesArg='1,5,8,10',base='http://127.0.0.1:8765/workout/island/']=process.argv;
const {chromium}=await import(process.env.ISLAND_PLAYWRIGHT?pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-proxy-server']});
const rows=[];
for(const stage of stagesArg.split(',').map(Number)){
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  await page.goto(`${base}tools/catch-harness.html?stage=${stage}&dev=1`);await page.waitForFunction('window.done===true',null,{timeout:120000});
  const sample=await page.evaluate(()=>{
    const d=session.debug,v=d.view(),r=v.renderer,out={};
    const time=(label,fn)=>{for(let i=0;i<10;i++)fn();const t0=performance.now();for(let i=0;i<90;i++)fn();out[label]=+((performance.now()-t0)/90).toFixed(2);};
    for(let i=0;i<60*3;i++)d.stepChase(1/60);
    time('chaseMs',()=>{d.stepChase(1/60);v.update(1/60,{});});
    out.chaseCalls=r.info.render.calls;out.chaseTris=r.info.render.triangles;
    d.skipChase();return new Promise(res=>setTimeout(()=>{
      time('throwMs',()=>{d.step(1/60);v.update(1/60,{});});
      out.throwCalls=r.info.render.calls;out.throwTris=r.info.render.triangles;out.textures=r.info.memory.textures;out.geometries=r.info.memory.geometries;res(out);},2600));
  });
  rows.push({stage,...sample});await page.close();
}
console.log('stage  chase ms  calls  tris     throw ms  calls  tris     textures geometries');
for(const r of rows)console.log(String(r.stage).padStart(3),String(r.chaseMs).padStart(10),String(r.chaseCalls).padStart(6),String(r.chaseTris).padStart(8),String(r.throwMs).padStart(10),String(r.throwCalls).padStart(6),String(r.throwTris).padStart(8),String(r.textures).padStart(9),String(r.geometries).padStart(9));
console.log(JSON.stringify(rows));
await browser.close();
