// Cold-load comparison of two island checkouts (before/after the racing league): boot resources, bytes, and time until window.__island exists.
// Usage: node tools/racing-league-coldload.mjs <islandRootA> <islandRootB> [runs]   (roots are .../workout/island directories)
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.woff2':'font/woff2','.wasm':'application/wasm'};
async function serve(root){const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(root,'.'+p);if(!f.startsWith(root)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');const body=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return server;}
const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const [a,b,runs=5]=[path.resolve(process.argv[2]),path.resolve(process.argv[3]),Number(process.argv[4]||5)];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const out={};
for(const [name,root] of [['before',a],['after',b]]){const server=await serve(root),rows=[];
 for(let i=0;i<runs;i++){const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),page=await ctx.newPage();await page.addInitScript(()=>performance.setResourceTimingBufferSize(5000));const urls=new Set();page.on('request',r=>urls.add(new URL(r.url()).pathname));
  const t0=Date.now();await page.goto(`http://127.0.0.1:${server.address().port}/?dev=1`,{waitUntil:'load'});await page.waitForFunction(()=>window.__island,null,{timeout:120000});const ready=Date.now()-t0;
  const res=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\.(mjs|js|css)(\?|$)/.test(e.name)).reduce((o,e)=>({n:o.n+1,bytes:o.bytes+(e.decodedBodySize||0)}),{n:0,bytes:0}));
  rows.push({ready,...res,league:[...urls].filter(u=>/racing-league/.test(u)).map(u=>u.split('/').pop())});await ctx.close();}
 out[name]={readyMedianMs:med(rows.map(r=>r.ready)),readyAll:rows.map(r=>r.ready),codeFiles:rows[0].n,codeBytes:rows[0].bytes,leagueFilesLoadedAtBoot:rows[0].league};server.close();}
await browser.close();console.log(JSON.stringify(out,null,1));
