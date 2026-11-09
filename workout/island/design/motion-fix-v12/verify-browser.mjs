/** Original CC0-1.0. Browser verification uses external Playwright only for QA. */
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const packagePath=process.env.MOTION_PLAYWRIGHT??'/tmp/motion-fix-deps/node_modules/playwright-core/index.mjs';
const {chromium}=await import(pathToFileURL(packagePath));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const csp="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'none'; object-src 'none'";
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(repo,'.'+pathname);
  if(!target.startsWith(repo+path.sep)){res.writeHead(403).end();return;}
  const s=await stat(target),file=s.isDirectory()?path.join(target,'index.html'):target,data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Content-Length':String(data.length),'Content-Security-Policy':csp,'Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/workout/island/design/motion-fix-v12/`;
const browser=await chromium.launch({executablePath:process.env.MOTION_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],requests=[],screens=[];let result,wasmBlocked=false,wasmAttempts=0,showcase=null,manifestEntries=0,stage='preview-loading',networkBodies=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 // The CSP omits wasm-unsafe-eval; the guard also catches accidental decoder use.
 await context.addInitScript(()=>{const fail=()=>{window.__motionWasmAttempts=(window.__motionWasmAttempts??0)+1;throw new Error('WebAssembly is blocked for motion-fix-v12 verification');};Object.defineProperty(window,'WebAssembly',{value:{compile:fail,instantiate:fail,compileStreaming:fail,instantiateStreaming:fail,Module:fail,Instance:fail},configurable:false});});
 // Observe the actual reader consumed by Three.FileLoader. No replacement data,
 // retries, fallback loaders, or synthetic success is supplied to the preview.
 await context.addInitScript(()=>{
  window.__motionFetchBodies=[];const nativeFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(!new URL(response.url,location.href).pathname.endsWith('.glb')||!response.body)return response;
   const record={url:response.url,status:response.status,expectedBytes:Number(response.headers.get('content-length')),bytesRead:0,complete:false,sha256:null};window.__motionFetchBodies.push(record);
   const nativeGetReader=response.body.getReader.bind(response.body);
   response.body.getReader=(...readerArgs)=>{const reader=nativeGetReader(...readerArgs),nativeRead=reader.read.bind(reader),chunks=[];
    reader.read=async(...readArgs)=>{try{const value=await nativeRead(...readArgs);if(value.value){record.bytesRead+=value.value.byteLength;chunks.push(value.value);}if(value.done){record.complete=true;record.completedAt=Date.now();const all=new Uint8Array(record.bytesRead);let cursor=0;for(const chunk of chunks){all.set(chunk,cursor);cursor+=chunk.byteLength;}chunks.length=0;record.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',all))).map(v=>v.toString(16).padStart(2,'0')).join('');}return value;}catch(error){record.error=String(error);throw error;}};return reader;};return response;};
 });
 const page=await context.newPage();
 const requestedStages=new WeakMap(),responses=new WeakMap();
 page.on('request',r=>requestedStages.set(r,stage));
 page.on('response',r=>responses.set(r.request(),{status:r.status(),contentLength:r.headers()['content-length']??null}));
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText,resourceType:r.resourceType(),requestedStage:requestedStages.get(r),failureStage:stage,failureAt:Date.now(),response:responses.get(r)??null}));
 await page.goto(base+'preview.html',{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>window.motionFixPreview?.state.ready&&window.motionFixPreview?.manifest?.clips?.length,null,{timeout:60000});
 wasmBlocked=await page.evaluate(()=>{try{WebAssembly.compile(new Uint8Array());return false;}catch{return true;}});
 stage='native-asset-sweep';result=await page.evaluate(async()=>await window.motionFixPreview.verifyAll());
 await page.waitForLoadState('networkidle',{timeout:60000});
 networkBodies=await page.evaluate(()=>window.__motionFetchBodies);
 wasmAttempts=await page.evaluate(()=>Math.max(0,(window.__motionWasmAttempts??0)-1));
 manifestEntries=await page.evaluate(()=>window.motionFixPreview.manifest.clips.length);
 stage='showcase';showcase=await page.evaluate(async()=>{const p=window.motionFixPreview,c=p.manifest.clips.filter(c=>!c.blocked&&c.status!=='blocked'&&c.status!=='unchanged').sort((a,b)=>(a.before?.score??100)-(b.before?.score??100))[0]??p.manifest.clips[0];const key=c.key??`${c.library}/${c.id}`;await p.select(key);p.seek(p.state.duration*.5);return {key,poseTime:p.state.time,characters:p.state.characters,diagnostic:p.state.diagnostic};});
 await page.waitForLoadState('networkidle',{timeout:60000});
 await mkdir(path.join(here,'verification'),{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.screenshot({path:path.join(here,`verification/preview-${viewport.width}x${viewport.height}.png`),fullPage:true});screens.push(`preview-${viewport.width}x${viewport.height}.png`);
 }
 stage='report-navigation';await page.goto(base+'report.html',{waitUntil:'networkidle',timeout:60000});
 await page.screenshot({path:path.join(here,'verification/report-390x844.png'),fullPage:false});screens.push('report-390x844.png');
}catch(error){errors.push(error.stack??error.message);}finally{stage='closing';await browser.close();await new Promise(resolve=>server.close(resolve));}
const manifest=JSON.parse(await readFile(path.join(here,'manifest.json'),'utf8')),entries=new Map(manifest.clips.map(e=>[e.key??`${e.library}/${e.id}`,e])),boundAssets=new Map();
const descriptor=x=>typeof x==='string'?{asset:x}:x??{};
for(const r of result?.results??[])if(r.status==='passed'&&!r.diagnostic&&r.boundTracks>0){const entry=entries.get(r.key),character=(entry.characters??manifest.characters??[]).find(c=>c.id===r.character)??{},override=descriptor(character[r.side]),d={...descriptor(entry[r.side]),...override};if(r.side==='after'){d.asset=override.asset??character.model??d.asset??d.model;d.animation=override.animation??character.animation??d.animation;}else d.asset=override.asset??character.beforeModel??character.model??d.asset??d.model;for(const file of [d.asset,d.animation].filter(Boolean)){const url=new URL(file,base).href;boundAssets.set(url,(boundAssets.get(url)??0)+1);}}
const transportClassifications=[],unresolvedRequestFailures=[];
for(const event of requests){const body=networkBodies.find(r=>r.url===event.url&&r.complete&&r.sha256),boundCases=boundAssets.get(event.url)??0;let sha256=null;if(body){const file=path.resolve(repo,'.'+new URL(event.url).pathname);if(file.startsWith(repo+path.sep))sha256=createHash('sha256').update(await readFile(file)).digest('hex');}
 const validated=event.error==='net::ERR_ABORTED'&&event.resourceType==='fetch'&&event.response?.status===200&&body?.status===200&&body.complete&&body.bytesRead===body.expectedBytes&&body.expectedBytes>0&&body.sha256===sha256&&boundCases>0;
 if(validated)transportClassifications.push({event,classification:'fully-validated-body-abort',reason:'Original request event retained: actual Three.FileLoader reader consumed the complete body; SHA-256 matches the local GLB and native tracks were successfully bound and replayed. No retry, fallback data or request failure blanket exemption.',body,boundNativeCases:boundCases,localSha256:sha256});else unresolvedRequestFailures.push(event);
}
const pass=wasmBlocked&&wasmAttempts===0&&errors.length===0&&unresolvedRequestFailures.length===0&&result?.count>0&&result?.failed===0;
const output={generatedAt:new Date().toISOString(),pass,csp,wasmBlocked,unexpectedWebAssemblyAttempts:wasmAttempts,manifestEntries,showcase,coverage:{nativeAfter:result?.results?.filter(r=>r.side==='after'&&r.status==='passed'&&!r.diagnostic).length??0,diagnosticBefore:result?.results?.filter(r=>r.side==='before'&&r.status==='passed'&&r.diagnostic).length??0,boundAnimationTracks:result?.results?.reduce((n,r)=>n+(r.boundTracks??0),0)??0},errors,requests,networkBodies,transportClassifications,unresolvedRequestFailures,result,screens};
await mkdir(path.join(here,'verification'),{recursive:true});await writeFile(path.join(here,'verification/browser.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({pass,wasmBlocked,unexpectedWebAssemblyAttempts:wasmAttempts,manifestEntries,count:result?.count,passed:result?.passed,failed:result?.failed,blocked:result?.blocked,coverage:output.coverage,errors,rawRequestEvents:requests.length,fullyValidatedBodyAborts:transportClassifications.length,unresolvedRequestFailures:unresolvedRequestFailures.length,requestSamples:unresolvedRequestFailures.slice(0,8),failures:result?.results?.filter(r=>r.status==='failed').slice(0,12)}));if(!pass)process.exitCode=1;
