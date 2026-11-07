/** Soccer v8 before/after harness. Starts a real league match in headless Chromium (SwiftShader),
 * moves the ball and the controlled player to a few spots and saves WebP-ready PNGs plus metrics.
 * Usage: node tools/soccer-v8-shots.mjs <outDir> <label> [query]   (query e.g. soccerV8=0)
 * Needs CHROMIUM_PATH or the Playwright default browser. Evidence only, never loaded by the game. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

const [outDir,label='run',extra='']=process.argv.slice(2);
if(!outDir)throw Error('usage: soccer-v8-shots.mjs <outDir> <label> [query]');
await mkdir(outDir,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const spots=[['close',-3,2],['far',22,-13],['goal',22,0],['goalW',-22,0],['corner',-22,13],['cornerE',22,13]];
const report={label,query:extra,runs:[]};
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  try{
   await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
   if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   const t0=Date.now();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:240000});
   const loadMs=Date.now()-t0;
   const moveTo=(x,z)=>page.evaluate(([x,z])=>{const s=window.__island.games.current.session.debug.model.getState();s.ball.x=x;s.ball.z=z;s.ball.vx=s.ball.vz=0;s.ball.owner=null;const p=s.players[s.controlled];p.x=x;p.z=z;},[x,z]);
   const run={viewport:`${viewport.width}x${viewport.height}`,loadMs,spots:{}};
   for(const [name,x,z] of spots){
    await moveTo(x,z);await page.waitForTimeout(2600);
    const file=`${label}-${viewport.width}x${viewport.height}-${name}.png`;await page.screenshot({path:path.join(outDir,file)});
    run.spots[name]=await page.evaluate(()=>{const v=window.__island.games.current.session.debug.view.metrics();return {tri:v.triangles,calls:v.drawCalls,quality:v.quality,programs:v.programs,geometries:v.geometries,textures:v.textures};});
   }
   run.errors=errors;report.runs.push(run);
  }finally{await context.close();}
 }
}finally{await browser.close();await server.close();}
await writeFile(path.join(outDir,`${label}-metrics.json`),JSON.stringify(report,null,1));
console.log(JSON.stringify(report.runs.map(r=>({vp:r.viewport,loadMs:r.loadMs,spots:Object.fromEntries(Object.entries(r.spots).map(([k,v])=>[k,`${v.tri}tri/${v.calls}c/q${v.quality}`])),errors:r.errors})),null,1));
