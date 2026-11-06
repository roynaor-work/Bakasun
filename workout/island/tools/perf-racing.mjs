// Runs tools/perf-racing.html in headless Chromium (SwiftShader software WebGL) for each phone viewport
// and prints one table: triangles, draw calls, median frame time, MB transferred on a cold load.
// Software WebGL: the numbers are relative only (this machine's CPU rasteriser), not a phone's GPU.
// Usage: node workout/island/tools/perf-racing.mjs [seconds=20] [viewports=844x390,390x844] [extra query, e.g. racingV7=0&dpr=0.15]
//        PERF_OUT=path.json saves the raw results. PLAYWRIGHT_MODULE / CHROMIUM_PATH override the defaults.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const seconds=Number(process.argv[2]||20),viewports=(process.argv[3]||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};}),extra=process.argv[4]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}
 let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}
 if((await stat(f)).isDirectory())f=path.join(f,'index.html');
 const body=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','content-length':body.length,'cache-control':'no-store'}).end(body);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-racing.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info','--autoplay-policy=no-user-gesture-required','--ignore-certificate-errors']});
const results=[],MB=n=>Math.round(n/1048576*100)/100;
for(const viewport of viewports){
 // a fresh context per viewport = a cold cache: every byte the game asks for is counted
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[],files=new Map();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);});
 page.on('requestfinished',async r=>{try{const s=await r.sizes();const u=new URL(r.url());files.set(u.pathname,(files.get(u.pathname)||0)+s.responseBodySize+s.responseHeadersSize);}catch{}});
 await page.goto(`${base}?dur=${seconds}${extra?'&'+extra:''}`,{waitUntil:'load'});
 const res=await page.waitForFunction(()=>window.__perf,null,{timeout:(seconds+240)*1000}).then(h=>h.jsonValue());
 const total=[...files.entries()].filter(([p])=>!/perf-racing/.test(p)),sum=list=>list.reduce((n,[,b])=>n+b,0);
 const assets=total.filter(([p])=>/\/(assets|design)\/|\/vendor\/draco\//.test(p));
 res.transfer={totalMB:MB(sum(total)),assetsMB:MB(sum(assets)),files:total.length,assetFiles:assets.length,byFile:Object.fromEntries(assets.map(([p,b])=>[p.replace('/workout/island/',''),b]))};
 res.errors=errors.filter(e=>!/favicon/.test(e));res.viewportLabel=`${viewport.width}x${viewport.height}`;
 results.push(res);
 if(res.error)console.log(res.viewportLabel,'FAILED',res.error);
 else console.log(res.viewportLabel,`load ${res.loadMs} ms | frame p50 ${res.frameMs.p50} p95 ${res.frameMs.p95} ms (${res.frames} frames/${res.seconds}s) | tick ${res.tickMs.avg} ms | calls ${res.calls.avg} | tris ${res.triangles.avg} | cold MB ${res.transfer.totalMB} (assets ${res.transfer.assetsMB}, ${res.transfer.assetFiles} files) | car ${res.render?.carAsset} v7 ${res.render?.v7?.active??'-'}`);
 if(res.errors.length)console.log(res.viewportLabel,'console errors:',res.errors.slice(0,5));
 await context.close();
}
if(process.env.PERF_OUT)await writeFile(process.env.PERF_OUT,JSON.stringify(results,null,1));
await browser.close();server.close();
