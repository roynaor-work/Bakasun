// Runs tools/perf-tennis.html in headless Chromium (SwiftShader software WebGL) for each phone viewport and
// each variant, then prints one table: triangles, draw calls, median frame, JS render time, load time and the MB a
// cold start downloads (every response body of the page, measured by the browser, nothing cached).
// Software WebGL: relative numbers only, never a phone's FPS.
// Usage: node workout/island/tools/perf-tennis.mjs [seconds=20] [viewports=844x390,390x844] [variants=tennisV7=0,tennisV7=1] [extra query]
//        PERF_OUT=path.json saves the raw results. PLAYWRIGHT_MODULE / CHROMIUM_PATH select the browser.
//        A variant is a query string; use "a=1&b=2" with a plus sign for several, e.g. "tennisV7=1+dpr=0.15".
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const seconds=Number(process.argv[2]||20),viewports=(process.argv[3]||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const variants=(process.argv[4]||'tennisV7=0,tennisV7=1').split(',').map(v=>v.replaceAll('+','&')),extra=process.argv[5]||'';
const server=await serveIsland();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const results=[];
for(const variant of variants)for(const viewport of viewports){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfinished',r=>requests.push(r));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname.replace(/^.*\/island\//,''));});
 await page.goto(`${server.url}tools/perf-tennis.html?dur=${seconds}&${variant}${extra?'&'+extra:''}`,{waitUntil:'load'});
 const res=await page.waitForFunction(()=>window.__perf,null,{timeout:(seconds+240)*1000}).then(h=>h.jsonValue());
 let bytes=0,assetBytes=0,files=0;const assets=[];
 for(const r of requests){const s=await r.sizes().catch(()=>null);if(!s)continue;const n=s.responseBodySize+s.responseHeadersSize;bytes+=n;files++;if(/\.(glb|jpg|jpeg|png|webp|wasm|ogg)(\?|$)/.test(r.url())){assetBytes+=s.responseBodySize;assets.push([new URL(r.url()).pathname.replace(/^.*\/island\//,''),s.responseBodySize]);}}
 res.errors=errors.filter(e=>!/favicon/.test(e));res.variant=variant;res.viewportLabel=`${viewport.width}x${viewport.height}`;res.coldMB=+(bytes/1048576).toFixed(2);res.assetMB=+(assetBytes/1048576).toFixed(2);res.requests=files;res.assets=assets;
 results.push(res);
 if(res.error)console.log(variant,res.viewportLabel,'FAILED',res.error);
 else console.log(`${variant.padEnd(34)} ${res.viewportLabel} | load ${res.loadMs} ms | frame p50 ${res.frameMs.p50} p95 ${res.frameMs.p95} | render js ${res.renderMs.avg} ms | tris ${res.render.triangles} calls ${res.render.drawCalls} geo ${res.render.geometries} tex ${res.render.textures} | cold ${res.coldMB} MB (${files} req, assets ${res.assetMB} MB) | q${res.quality} crowd ${res.render.crowd} v7 ${res.render.tennisV7} hits ${res.hits}`);
 if(res.errors.length)console.log(variant,res.viewportLabel,'console errors:',res.errors.slice(0,5));
 await context.close();
}
if(process.env.PERF_OUT)await writeFile(process.env.PERF_OUT,JSON.stringify(results,null,1));
await browser.close();await server.close();
