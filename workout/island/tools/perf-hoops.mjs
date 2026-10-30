// Runs tools/perf-hoops.html in headless Chromium (SwiftShader software WebGL) for each phone
// viewport and prints one table: FPS, frame p95, frames over 33 ms, tick CPU, render, allocations.
// Software WebGL: the numbers are CPU cost, not what the phone's GPU does.
// Usage: node workout/island/tools/perf-hoops.mjs [seconds=30] [viewports=844x390,390x844] [extra query]
//        PERF_OUT=path.json saves the raw results.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const seconds=Number(process.argv[2]||30),viewports=(process.argv[3]||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};}),extra=process.argv[4]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info','--autoplay-policy=no-user-gesture-required']});
const results=[];
for(const viewport of viewports){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}?dur=${seconds}${extra?'&'+extra:''}`,{waitUntil:'load'});
 const res=await page.waitForFunction(()=>window.__perf,null,{timeout:(seconds+240)*1000}).then(h=>h.jsonValue());
 res.errors=errors.filter(e=>!/favicon/.test(e));res.viewportLabel=`${viewport.width}x${viewport.height}`;
 results.push(res);
 if(res.error)console.log(res.viewportLabel,'FAILED',res.error);
 else if(res.bench)console.log(res.viewportLabel,`BENCH load ${res.loadMs} ms | ${res.steps} steps ${res.stepsPerSec}/s | step avg ${res.stepMs.avg} p95 ${res.stepMs.p95} p99 ${res.stepMs.p99} max ${res.stepMs.max} | engine ${res.parts.step.avg} snap ${res.parts.snap.avg} render ${res.parts.render.avg} (p95 ${res.parts.render.p95}) rest ${res.parts.rest.avg} | alloc ${res.allocKBperStep} KB/step ${JSON.stringify(res.allocParts)} gcs ${res.gcs} | calls ${res.render.calls} tris ${res.render.triangles} | phase ${res.phase} replays ${res.replays}`);
 else console.log(res.viewportLabel,`load ${res.loadMs} ms | fps ${res.fps} | frame p50 ${res.frameMs.p50} p95 ${res.frameMs.p95} p99 ${res.frameMs.p99} | >33ms ${res.over33}/${res.frames} >50ms ${res.over50} | tick avg ${res.tickMs.avg} p95 ${res.tickMs.p95} | render avg ${res.renderMs.avg} p95 ${res.renderMs.p95} | alloc ${res.allocMBps} MB/s gcs ${res.gcs} | long ${res.longTasks} | calls ${res.render?.calls} tris ${res.render?.triangles} | steps ${res.steps} replays ${res.replays}`);
 if(res.errors.length)console.log(res.viewportLabel,'console errors:',res.errors.slice(0,5));
 await context.close();
}
if(process.env.PERF_OUT)await writeFile(process.env.PERF_OUT,JSON.stringify(results,null,1));
await browser.close();server.close();
