// Serve the preview with exactly the current game's HTML CSP, without changing
// the game or relaxing its policy. External classic workers receive JS MIME.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {filesUnder} from '../tests/audit-helpers.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),iteration=process.argv[2]||'13';
if(!/^\d{2}$/.test(iteration))throw new Error('Iteration must have two digits');
const gameHTML=await fs.readFile(new URL('../../../index.html',import.meta.url),'utf8');
const policy=gameHTML.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
if(!policy)throw new Error('Unable to read the real game policy');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
    const data=await fs.readFile(file),headers={'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'};
    if(file.endsWith('.html'))headers['content-security-policy']=policy;
    res.writeHead(200,headers);res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`,errors=[],workers=[],requests=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let metrics,violations=[],loadedRuntime=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('worker',worker=>workers.push(worker.url()));page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(()=>{
    window.__stadiumCSP=[];addEventListener('securitypolicyviolation',event=>window.__stadiumCSP.push(event.effectiveDirective+': '+event.blockedURI));
  });
  await page.goto(base+'/preview.html?capture=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready||document.documentElement.dataset.failed,{timeout:45_000});
  const result=await page.evaluate(()=>({ready:document.documentElement.dataset.ready,violations:window.__stadiumCSP,metrics:window.stadiumReview?.metrics()}));
  violations=result.violations;metrics=result.metrics;
  if(!result.ready)errors.push('The preview failed to decode under the real game CSP');
  if(!workers.length||workers.some(url=>!url.startsWith(base+'/runtime/draco-worker.js')))errors.push('Decoder must use static same-origin workers');
  if(requests.some(url=>/^https?:/.test(url)&&!url.startsWith(base+'/')))errors.push('External network request');
  const expected=(await filesUnder(path.join(root,'runtime'))).map(file=>'/runtime/'+path.relative(path.join(root,'runtime'),file).split(path.sep).join('/')).sort();
  loadedRuntime=[...new Set(requests.map(url=>new URL(url).pathname).filter(name=>name.startsWith('/runtime/')))].sort();
  if(expected.join('\n')!==loadedRuntime.join('\n'))errors.push('runtime/ must contain exactly the local files loaded by the preview');
  await page.evaluate(()=>window.stadiumReview?.dispose());
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const lines=[`Existing game CSP: ${errors.length||violations.length?'FAIL':'PASS'}`,policy,
  `Static decoder workers: ${workers.length}`,`CSP violations: ${violations.length}`,`Runtime triangles: ${metrics?.runtime.total??'unavailable'}`,`Requests: ${requests.length}`,`Exact runtime load files: ${loadedRuntime.length}`, ...loadedRuntime,...violations,...errors];
await fs.mkdir(path.join(root,'iterations',iteration),{recursive:true});await fs.writeFile(path.join(root,'iterations',iteration,'csp.txt'),lines.join('\n')+'\n');
console.log(lines.slice(0,6).join('\n'));if(errors.length||violations.length)throw new Error('Existing game CSP check failed');
