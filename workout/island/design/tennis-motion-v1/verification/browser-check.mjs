/** Original browser asset verification, CC0-1.0. Uses installed Playwright only as tooling. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const pack=path.resolve(here,'..'), repo=path.resolve(pack,'../../../..');
const imported=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/tmp/tennis-tools/node_modules/playwright/index.mjs'));
const {chromium}=imported;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml'};
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'";
const server=http.createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let filename=path.resolve(repo,'.'+pathname);if(!filename.startsWith(repo+path.sep)){res.writeHead(403);res.end();return;}
  const stat=await fs.stat(filename);if(stat.isDirectory())filename=path.join(filename,'index.html');
  const bytes=await fs.readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Security-Policy':csp,'Cache-Control':'no-store','Content-Length':bytes.length,'Connection':'close'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address(), url=`http://127.0.0.1:${address.port}/workout/island/design/tennis-motion-v1/preview.html`;
let browser;const failures=[],consoleErrors=[],requests=[],clips=[],screenshots=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:940},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  window.__tennisWasmAttempts=0;
  const deny=()=>{window.__tennisWasmAttempts++;throw new Error('WebAssembly disabled by tennis verification');};
  Object.defineProperty(globalThis,'WebAssembly',{configurable:true,value:new Proxy({},{get:()=>deny})});
 });
 const page=await context.newPage();
 page.on('pageerror',e=>consoleErrors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('requestfailed',r=>requests.push({url:r.url(),failure:r.failure()?.errorText}));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))requests.push({url:r.url(),status:r.status()});});
 await page.goto(url,{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>Boolean(window.tennisPreview),{timeout:60000});
 await page.evaluate(()=>window.tennisPreview.ready);
 let loadAll;
 const catalog=JSON.parse(await fs.readFile(path.join(pack,'runtime/catalog.json'),'utf8'));
 for(const clip of catalog.clips){
  const contact=clip.events?.find(e=>e.name==='racket_contact'), seconds=contact?.atSeconds??clip.durationSeconds*.5;
  const state=await page.evaluate(async({id,seconds})=>{await window.tennisPreview.select(id);await window.tennisPreview.sample(seconds);return window.tennisPreview.getState();},{id:clip.id,seconds});
  const selected=state.id??state.clipId;
  if(selected!==clip.id)failures.push(`${clip.id}: preview selected ${selected}`);
  const trail=state.trailPointCount??state.trailPoints??state.trailCount;
  if(typeof trail==='number'&&trail<2)failures.push(`${clip.id}: no racket-head trail`);
  if(typeof trail!=='number')failures.push(`${clip.id}: preview state must expose trailPointCount`);
  const p=state.headWorldMeters??state.racketHeadWorldMeters??state.racketHead;
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))failures.push(`${clip.id}: missing finite actual GLB racket head position`);
  if(contact&&Array.isArray(p)){const error=Math.hypot(...p.map((v,i)=>v-contact.worldPointMeters[i]));if(error>.001)failures.push(`${clip.id}: rendered GLB contact point differs ${error}m from authored event`);}
  clips.push({id:clip.id,sampledSeconds:seconds,trailPointCount:trail,headWorldMeters:p,state});
  await page.waitForTimeout(30);
 }
 loadAll=await page.evaluate(()=>window.tennisPreview.loadAll());
 if(loadAll.length!==catalog.clips.length||loadAll.some(c=>!c.loaded))failures.push('GLTFLoader did not parse all catalog clips');
 const httpBodyChecks=[];
 for(const clip of catalog.clips){
  const expected=await fs.readFile(path.join(pack,'runtime',clip.file));
  const expectedHash=createHash('sha256').update(expected).digest('hex');
  const loaded=await page.evaluate(async file=>{const response=await fetch(new URL('runtime/'+file,location.href));const data=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',data);return {status:response.status,bytes:data.byteLength,sha256:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')};},clip.file);
  const pass=loaded.status===200&&loaded.bytes===expected.length&&loaded.sha256===expectedHash;
  httpBodyChecks.push({id:clip.id,...loaded,pass});if(!pass)failures.push(`${clip.id}: complete browser HTTP body differs from disk`);
 }
 const sequence=[];
 if(await page.evaluate(()=>typeof window.tennisPreview.sampleSequence==='function')){
  const eps=1/3000,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const boundary of [.4,2.2]){
   const states=[];for(const t of [boundary-eps,boundary,boundary+eps])states.push(await page.evaluate(async seconds=>{await window.tennisPreview.sampleSequence(seconds);return window.tennisPreview.getState();},t));
   const [a,b,c]=states;for(const s of states)if(!s.sequence||s.trailPointCount<2)failures.push(`Sequence ${boundary}: missing demo/trail`);
   const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2);
   const velocity=(a,b)=>a.map((v,i)=>(b[i]-v)/eps);
   const rootError=dist(b.rootWorldMeters,midpoint(a.rootWorldMeters,c.rootWorldMeters)),headError=dist(b.headWorldMeters,midpoint(a.headWorldMeters,c.headWorldMeters));
   const rootVelocityChange=dist(velocity(a.rootWorldMeters,b.rootWorldMeters),velocity(b.rootWorldMeters,c.rootWorldMeters));
   const headVelocityChange=dist(velocity(a.headWorldMeters,b.headWorldMeters),velocity(b.headWorldMeters,c.headWorldMeters));
   sequence.push({boundarySeconds:boundary,epsilonSeconds:eps,rootMidpointErrorMeters:rootError,headMidpointErrorMeters:headError,rootVelocityChangeMps:rootVelocityChange,headVelocityChangeMps:headVelocityChange,states});
   if(rootError>.001||headError>.001||rootVelocityChange>.1)failures.push(`Sequence ${boundary}: rendered boundary discontinuity`);
  }
  await page.evaluate(()=>window.tennisPreview.sampleSequence(1.3));await page.waitForTimeout(250);
  await page.screenshot({path:path.join(here,'sequence.png'),fullPage:true});screenshots.push('sequence.png');
 }else failures.push('Preview lacks run-hit-run sequence sampler');
 const wasmAttempts=await page.evaluate(()=>window.__tennisWasmAttempts);
 if(wasmAttempts!==0)failures.push(`WebAssembly accessed ${wasmAttempts} times`);
 const choose=catalog.clips.find(c=>c.id==='forehand_topspin_long')||catalog.clips.find(c=>c.events?.some(e=>e.name==='racket_contact'))||catalog.clips[0];
 await page.evaluate(async id=>{await window.tennisPreview.select(id);const state=window.tennisPreview.getState();return state;},choose.id);
 await page.evaluate(seconds=>window.tennisPreview.sample(seconds),choose.events?.find(e=>e.name==='racket_contact')?.atSeconds||choose.durationSeconds*.5);
 await page.waitForTimeout(250);await page.screenshot({path:path.join(here,'preview-desktop.png'),fullPage:true});screenshots.push('preview-desktop.png');
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(250);await page.screenshot({path:path.join(here,'preview-mobile.png'),fullPage:true});screenshots.push('preview-mobile.png');
 await page.setViewportSize({width:844,height:390});
 await page.waitForTimeout(250);await page.screenshot({path:path.join(here,'preview-landscape.png'),fullPage:true});screenshots.push('preview-landscape.png');
 for(const preferred of ['serve_first_full','serve_second_full','volley_forehand','smash']){
  const clip=catalog.clips.find(c=>c.id===preferred);if(!clip)continue;
  await page.setViewportSize({width:1120,height:800});
  await page.evaluate(async({id,t})=>{await window.tennisPreview.select(id);return window.tennisPreview.sample(t);},{id:clip.id,t:clip.events?.find(e=>e.name==='racket_contact')?.atSeconds||clip.durationSeconds*.5});
  const name=`${clip.id}.png`;await page.screenshot({path:path.join(here,name),fullPage:true});screenshots.push(name);
 }
 if(consoleErrors.length)failures.push(...consoleErrors.map(e=>'Browser error: '+e));
 const recoveredRequestFailures=[],unrecoveredRequestFailures=[];
 for(const request of requests){
  const matched=catalog.clips.find(c=>request.url.endsWith('/runtime/'+c.file));
  const parsed=matched&&loadAll.some(c=>c.id===matched.id&&c.loaded===true);
  const bodyVerified=matched&&httpBodyChecks.some(c=>c.id===matched.id&&c.pass);
  if(request.failure==='net::ERR_ABORTED'&&parsed&&bodyVerified)recoveredRequestFailures.push({...request,verifiedCompleteBody:true,parsedByGltfLoader:true});
  else unrecoveredRequestFailures.push(request);
 }
 if(unrecoveredRequestFailures.length)failures.push(...unrecoveredRequestFailures.map(r=>'Failed request: '+JSON.stringify(r)));
 const result={pass:failures.length===0,clipCount:clips.length,allClipsLoaded:loadAll,webAssemblyDisabled:true,wasmAttempts,csp,consoleErrors,failedRequests:unrecoveredRequestFailures,recoveredRequestFailures,httpBodyChecks,sequence,failures,screenshots,clips};
 await fs.writeFile(path.join(here,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({pass:result.pass,clipCount:result.clipCount,wasmAttempts,failures},null,2));
 if(!result.pass)process.exitCode=1;
}catch(error){console.error(error.stack);process.exitCode=1;await fs.writeFile(path.join(here,'browser.json'),JSON.stringify({pass:false,failures:[error.message],consoleErrors,failedRequests:requests},null,2)+'\n');}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
