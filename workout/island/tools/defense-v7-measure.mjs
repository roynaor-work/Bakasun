/* Before/after capture for Defense v7 (alien flight). Usage: node workout/island/tools/defense-v7-measure.mjs <outDir>
 * Real model + view under the production CSP at 844x390. before = ?defenseV7=0. */
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.argv[2]||'workout/island/verification/gpt-v7-naval-fire-defense/';mkdirSync(out,{recursive:true});
const server=await serveIsland(),chromium=await islandChromium();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results={};
for(const [name,qs] of [['before','?defenseV7=0&level=5'],['after','?level=5'],['before-boss','?defenseV7=0&level=10'],['after-boss','?level=10']]){
  const context=await browser.newContext({viewport:{width:844,height:390}}),csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
  let bytes=0;const files=[];page.on('response',async r=>{const u=r.url();if(/\.(glb|wasm)(\?|$)/.test(u)){try{const n=(await r.body()).length;bytes+=n;files.push([u.replace(server.url,''),n]);}catch{}}});
  page.on('pageerror',e=>console.log('pageerror',e.message));
  await page.goto(server.url+'tools/defense-v7.html'+qs);
  await page.waitForFunction(()=>window.__defense,null,{timeout:30000});
  await page.evaluate(()=>window.__defense.ready);
  await page.evaluate(()=>window.__defense.step(300));
  let ok=false;for(let i=0;i<4;i++)ok=await page.evaluate(()=>window.__defense.draw());
  const metrics=await page.evaluate(()=>window.__defense.metrics());
  await page.screenshot({path:out+name+'-defense.png'});
  await csp.assertClean();
  results[name]={drew:ok,metrics,glbWasmBytes:bytes,files};await context.close();
}
writeFileSync(out+'defense-measure.json',JSON.stringify(results,null,1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{drew:v.drew,tri:v.metrics?.triangles,calls:v.metrics?.drawCalls,v7:v.metrics?.defenseV7,mode:v.metrics?.models,bytes:v.glbWasmBytes}])),null,1));
await browser.close();await server.close();
