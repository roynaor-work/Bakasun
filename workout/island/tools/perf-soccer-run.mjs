// Drives tools/perf-soccer.html?auto=1 in headless Chromium (SwiftShader: CPU cost, not the phone's GPU).
// Usage: PLAYWRIGHT_MODULE=... node workout/island/tools/perf-soccer-run.mjs <seconds> <extraQuery> [out.json]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),seconds=Number(process.argv[2]||25),extra=process.argv[3]||'',out=process.argv[4];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.ktx2':'image/ktx2','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-soccer.html?auto=1&seconds=${seconds}${extra?'&'+extra:''}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(400000);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(url,{waitUntil:'load'});
await page.waitForFunction(()=>window.__perf&&window.__perf.done===true,null,{timeout:(seconds+300)*1000});const res=await page.evaluate(()=>window.__perf);
if(!res.result)console.log("perf keys",JSON.stringify(res).slice(0,600));const r=res.result;if(r){r.extra=extra;r.consoleErrors=errors.filter(e=>!/favicon/.test(e));
console.log(JSON.stringify({extra,fps:r.fps,frameP50:r.frameMs.p50,frameP95:r.frameMs.p95,over33:r.over33,frames:r.frames,tick:r.tickMs.avg,render:r.renderMs.avg,gl:r.glMs.avg,anim:r.animMs.avg,assetReadyMs:r.assetReadyMs,quality:r.quality,heapMBps:r.heap?.allocatedMBPerSecond,longTasks:r.longTasks,errors:r.consoleErrors.length}));}
else console.log('FAILED',res.error);
if(out)await writeFile(out,JSON.stringify(res,null,1));
await browser.close();server.close();
