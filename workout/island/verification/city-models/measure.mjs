// Cold-load and city measurements, with and without the city models (?cityModels=0).
// Run from the repo root: CHROMIUM_PATH=<chrome> node workout/island/verification/city-models/measure.mjs <outDir> [width height]
import {serveIsland,islandChromium} from '../../../../tests/helpers/island-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]||'.'),W=+process.argv[3]||844,H=+process.argv[4]||390;
await mkdir(out,{recursive:true});
const server=await serveIsland(),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
// type, level, x, z (2x2 unless noted); two road rows at z=7 and z=12
const LAYOUT=[['house',1,0,5],['house',2,2,5],['house',3,4,5],['house',4,6,5],['shop',1,8,5],['factory',2,10,5],['park',2,12,5],['fireStation',1,14,5],
 ['waterTower',1,0,8],['hospital',1,2,8],['school',1,5,8],['police',1,8,8],['library',1,10,8],['mathLab',1,12,8],['cityHall',1,14,8],
 ['powerPlant',1,0,10],['soccer',1,3,10],['factory',1,6,10],['factory',3,8,10],['park',1,10,10],['house',2,12,10],['house',1,14,10]];
const results={};
for(const flag of ['on','off']){
  for(const scenario of ['cold','cold2','cold3','city']){
    const context=await browser.newContext({viewport:{width:W,height:H},hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Jerusalem'});
    await context.route('**/data/featureFlags.json*',async route=>{const r=await route.fetch();await route.fulfill({response:r,json:{...await r.json(),events:false}});});
    const page=await context.newPage(),bytes={total:0,glb:0,city:0,files:[]},errors=[];
    page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('requestfinished',async r=>{try{const n=(await r.sizes()).responseBodySize,u=r.url().split('?')[0];bytes.total+=n;if(/\.glb$/.test(u)){bytes.glb+=n;if(/models\/city\//.test(u))bytes.city+=n;bytes.files.push(u.split('/').pop()+':'+n);}if(/\.(mjs|js)$/.test(u))bytes.code=(bytes.code||0)+n;}catch{}});
    const collect=async()=>{await page.waitForTimeout(400);return {...bytes,files:[...bytes.files]};};
    const t0=Date.now();
    await page.goto(server.url+'?dev=1'+(flag==='off'?'&cityModels=0':''),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
    const ready=Date.now()-t0;await page.locator('[data-action=avatar-start]').tap();
    const row={flag,scenario,readyMs:ready,bytesAtReady:await collect()};
    if(scenario==='city'){
      const placed=await page.evaluate(layout=>{
        const {engine:e,ui,view}=window.__island;e.skipTutorial();window.cityRealTick=e.tick;e.tick=()=>({ok:true});
        e.state.buildings=[...Array.from({length:16},(_,x)=>({id:`r${x}`,typeId:'road',x,z:7,level:1})),...Array.from({length:16},(_,x)=>({id:`q${x}`,typeId:'road',x,z:12,level:1})),...layout.map(([typeId,level,x,z],i)=>({id:`b${i}`,typeId,level,x,z}))];
        ui.closeInfo();ui.closeDetails();ui.setDockOpen(false);view.setWorld(e.state,true);view.home();return e.state.buildings.length;
      },LAYOUT);
      await page.waitForTimeout(6000);
      row.placed=placed;row.after=await collect();row.metrics=await page.evaluate(()=>{const m=window.__island.view.metrics();return {triangles:m.triangles,calls:m.calls,models:m.models,traffic:m.traffic};});
      await page.screenshot({path:path.join(out,`city-${flag}.png`)});
      for(const [name,x,z] of [['north',5,6],['middle',9,9],['south',4,11]]){await page.evaluate(([x,z])=>window.__island.view.flyToCell(x,z,4.4),[x,z]);await page.waitForTimeout(7000);await page.screenshot({path:path.join(out,`zoom-${name}-${flag}.png`)});}
    }
    row.errors=errors;results[`${scenario}-${flag}`]=row;await context.close();
  }
}
await writeFile(path.join(out,'measure.json'),JSON.stringify(results,null,1));
for(const [k,r] of Object.entries(results))console.log(k,'ready',r.readyMs,'ms total',r.bytesAtReady.total,'glb',r.bytesAtReady.glb,r.after?`| after city total ${r.after.total} glb ${r.after.glb} cityGlb ${r.after.city} tris ${r.metrics.triangles} calls ${r.metrics.calls}`:'',r.errors.length?'ERRORS '+r.errors.slice(0,3).join(' | '):'');
await browser.close();await server.close();
