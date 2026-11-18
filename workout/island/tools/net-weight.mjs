// Bytes fetched by a game until its perf page reports, grouped by folder (what a phone downloads once, before the service worker caches it).
// Usage: PLAYWRIGHT_MODULE=... node workout/island/tools/net-weight.mjs <hoops|soccer> <extraQuery>
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),game=process.argv[2],extra=process.argv[3]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg'};
const sizes={};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if((await stat(f)).isDirectory())f=path.join(f,'index.html');const body=await readFile(f);const rel=path.relative(workout+'/island',f);sizes[rel]=(sizes[rel]||0)+body.length;res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/`;
const url=game==='hoops'?`${base}perf-hoops.html?dur=4${extra?'&'+extra:''}`:`${base}perf-soccer.html?auto=1&seconds=5&warmup=0${extra?'&'+extra:''}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const page=await (await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1})).newPage();
await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.__perf&&(window.__perf.done===true||window.__perf.fps!==undefined||window.__perf.error),null,{timeout:300000});
const groups={};let total=0;for(const [k,v] of Object.entries(sizes)){const g=k.startsWith('assets/')?k.split('/').slice(0,2).join('/'):k.startsWith('design/')?k.split('/').slice(0,3).join('/'):path.extname(k)==='.mjs'?'code (.mjs)':k.split('/')[0];groups[g]=(groups[g]||0)+v;total+=v;}
const mb=n=>+(n/1048576).toFixed(2);
console.log(JSON.stringify({game,extra,totalMB:mb(total),files:Object.keys(sizes).length,groups:Object.fromEntries(Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,mb(v)]))}));
await browser.close();server.close();
