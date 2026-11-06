#!/usr/bin/env node
/** Real Chromium/WebGL evidence of delivered Draco GLB animation. Dev tools stay in /tmp.
 * npm install --prefix /tmp/hoops-motion-v8-browser --cache /tmp/hoops-motion-v8-npm-cache playwright@1.56.1
 * HOOPS_PLAYWRIGHT_PATH=/tmp/hoops-motion-v8-browser/node_modules/playwright/index.mjs node source/capture.mjs --iteration 01
 * Optional --clips pass_chest,pass_jump --label concise_ascii_note
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=(key,fallback='')=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const iteration=option('--iteration'),label=option('--label'),only=option('--clips').split(',').filter(Boolean);
if(!/^\d{2}$/.test(iteration||''))throw Error('Use --iteration NN');
if(label&&!/^[a-z0-9_-]+$/.test(label))throw Error('Label must be a short ASCII identifier');
const output=path.join(root,'iterations',iteration);
await fs.mkdir(output,{recursive:true});
const reportFile=path.join(output,'capture.json.gz');
try{await fs.access(reportFile);throw Error('Capture already exists; choose a new iteration');}catch(e){if(e.code!=='ENOENT')throw e;}
const playwrightPath=process.env.HOOPS_PLAYWRIGHT_PATH||'/tmp/hoops-motion-v8-browser/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const require=createRequire(process.env.HOOPS_IMAGE_TOOLS_PACKAGE||'/tmp/hoops-motion-v8-tools/package.json');
const sharp=require('sharp');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.gz':'application/gzip','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'};
const freezeStartedAtUTC=new Date().toISOString();
const frozen=await fs.mkdtemp('/tmp/hoops-motion-v8-capture-');
for(const file of ['index.html','preview.css','preview.mjs','runtime'])await fs.cp(path.join(root,file),path.join(frozen,file),{recursive:true});
const freezeCompletedAtUTC=new Date().toISOString();
// Exact policy copied from workout/island/index.html; this package remains standalone.
const expectedCSP="default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
const frozenHTML=await fs.readFile(path.join(frozen,'index.html'),'utf8');
const enforcedPolicy=/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(frozenHTML)?.[1];
if(enforcedPolicy!==expectedCSP)throw Error('Preview must enforce the exact Island Content-Security-Policy');
const csp={policy:enforcedPolicy,violations:[],workerUrls:[]};
const requests=new Set(),errors=[],external=[],failedRequests=[],framing=[],files=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputParity=[];
for(const name of (await fs.readdir(path.join(frozen,'runtime/clips'))).filter(name=>name.endsWith('.glb')).sort()){
 const id=name.slice(0,-4),glb=await fs.readFile(path.join(frozen,'runtime/clips',name));
 const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'));
 const gzip=await fs.readFile(path.join(frozen,'runtime/keyframes',id+'.json.gz'));
 const actual=hash(gzip),expected=json.extras?.keyframeSha256;
 inputParity.push({id,embeddedKeyframeSha256:expected,actualKeyframeSha256:actual,match:actual===expected});
 if(!expected||actual!==expected)throw Error(`Frozen GLB/gzip snapshot mismatch for ${id}; source retained at ${frozen}`);
}
const captureToolSha256=hash(await fs.readFile(fileURLToPath(import.meta.url)));
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}const filename=path.resolve(frozen,'.'+(pathname==='/'?'/index.html':pathname));if(!filename.startsWith(frozen+path.sep))throw Error('Invalid path');const bytes=await fs.readFile(filename);requests.add(path.relative(frozen,filename));res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch(e){res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,startedAtUTC=new Date().toISOString();
const browser=await chromium.launch({executablePath:process.env.HOOPS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
await page.addInitScript(()=>{window.__hoopsCspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.__hoopsCspViolations.push({blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective,violatedDirective:event.violatedDirective,originalPolicy:event.originalPolicy,disposition:event.disposition,sourceFile:event.sourceFile,lineNumber:event.lineNumber,columnNumber:event.columnNumber}));});
page.on('worker',worker=>{const url=worker.url();csp.workerUrls.push(url.startsWith(origin+'/')?url.slice(origin.length):url);});
page.on('pageerror',e=>errors.push(String(e)));
page.on('requestfailed',request=>failedRequests.push({url:request.url().replace(origin,''),error:request.failure()?.errorText||'unknown'}));
await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();external.push(url);return route.abort();});
const escapeXML=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const put=async(name,bytes,meta={})=>{await fs.writeFile(path.join(output,name),bytes);files.push({file:name,bytes:bytes.length,sha256:hash(bytes),...meta});};
const findings=[],playbackChecks=[];
try{
 await page.goto(origin+'/index.html?capture=1',{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.__hoops,null,{timeout:120000});
 await page.evaluate(()=>window.__hoops.ready);
 const all=await page.evaluate(()=>window.__hoops.clips),clips=all.filter(c=>!only.length||only.includes(c.id));
 if(!clips.length)throw Error('No clips selected');
 for(const clip of clips){
  const id=clip.id,expectLoop=!!clip.loop;
  const check=await page.evaluate(async({id,expectLoop})=>{
   await window.__hoops.select(id);window.__hoops.seek(.98);window.__hoops.setSpeed(1);
   const start=window.__hoops.diagnostics(),started=performance.now(),samples=[{time:start.time,normalized:start.normalized,elapsedMilliseconds:0}];
   window.__hoops.play();
   return new Promise(resolve=>{
    let previous=start;
    const inspect=()=>{
     const state=window.__hoops.diagnostics(),elapsedMilliseconds=performance.now()-started;
     samples.push({time:state.time,normalized:state.normalized,playing:state.playing,elapsedMilliseconds});
     const rewound=!expectLoop&&state.time<previous.time-1e-7;
     const wrapped=expectLoop&&previous.normalized>.8&&state.normalized<.2&&state.playing;
     const held=!expectLoop&&!state.playing&&state.normalized>=1-1e-8;
     if(rewound||wrapped||held||elapsedMilliseconds>5000){
      window.__hoops.pause();
      resolve({pass:!rewound&&(wrapped||held),reason:rewound?'timeline moved backwards':wrapped?'loop wrapped':held?'final pose held':'no required animation frame observed within 5s',time:state.time,duration:state.duration,normalized:state.normalized,playing:state.playing,elapsedMilliseconds,samples});
     }else{previous=state;requestAnimationFrame(inspect);}
    };
    requestAnimationFrame(inspect);
   });
  },{id,expectLoop});
  playbackChecks.push({id,expectLoop,...check});
  if(!check.pass)findings.push(`${id}: ${check.reason}`);
 }
 const views=[{width:390,height:844},{width:844,height:390}];
 for(const viewport of views){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(const view of ['near','far']){
   for(const clip of clips){
    await page.evaluate(async({id,view})=>{await window.__hoops.select(id);window.__hoops.setDistance(view);window.__hoops.pause();},{id:clip.id,view});
    const times=await page.evaluate(()=>window.__hoops.frameTimes);
    if(times.length!==8)throw Error(`${clip.id} does not supply eight frames`);
    const captures=await page.evaluate(view=>{const canvas=document.getElementById('canvas');return window.__hoops.captureFrames({width:canvas.clientWidth,height:canvas.clientHeight,distance:view});},view);
    const tiles=[];const tileW=174,tileH=148,captionH=24;
    for(let i=0;i<times.length;i++){
     const diagnostic=captures[i].diagnostics;
     const entry={...diagnostic,clip:clip.id,frame:i,distance:view,captureViewport:`${viewport.width}x${viewport.height}`};framing.push(entry);
     if(!diagnostic.bodyInFrame)findings.push(`${clip.id} ${entry.captureViewport} ${view} frame${i}: body outside frame`);
     if(view==='far'&&!diagnostic.ballInFrame)findings.push(`${clip.id} ${entry.captureViewport} far frame${i}: ball outside frame`);
     if(!diagnostic.ballNode)findings.push(`${clip.id}: missing real Ball node`);
     if(diagnostic.horizontalOverflow)findings.push(`${clip.id} ${entry.captureViewport}: horizontal overflow`);
     const shot=Buffer.from(captures[i].dataURL.split(',')[1],'base64');
     const image=await sharp(shot).resize(tileW,tileH,{fit:'contain',background:'#344347'}).png().toBuffer();
     const caption=Buffer.from(`<svg width="${tileW}" height="${captionH}"><rect width="100%" height="100%" fill="#172024"/><text x="8" y="15" fill="#c3d5c3" font-size="9" font-family="monospace">${String(i+1).padStart(2,'0')} / ${diagnostic.time.toFixed(3)} s</text><text x="${tileW-8}" y="15" text-anchor="end" fill="#f4a064" font-size="8" font-family="monospace">${Math.round(times[i]*100)}%</text></svg>`);
     const tile=await sharp({create:{width:tileW,height:tileH+captionH,channels:3,background:'#172024'}}).composite([{input:image,left:0,top:0},{input:caption,left:0,top:tileH}]).png().toBuffer();tiles.push(tile);
    }
    const headH=26,head=Buffer.from(`<svg width="${tileW*8}" height="${headH}"><rect width="100%" height="100%" fill="#172024"/><text x="10" y="17" fill="#c3d5c3" font-family="monospace" font-size="10">${escapeXML(clip.id)} / ${viewport.width}x${viewport.height} / ${view} / actual Draco GLB AnimationMixer</text></svg>`);
    const sheet=await sharp({create:{width:tileW*8,height:tileH+captionH+headH,channels:3,background:'#172024'}}).composite([{input:head,left:0,top:0},...tiles.map((input,i)=>({input,left:i*tileW,top:headH}))]).webp({quality:83,effort:5}).toBuffer();
    await put(`sheet-${clip.id}-${viewport.width}x${viewport.height}-${view}.webp`,sheet,{kind:'8-frame-contact-sheet',clip:clip.id,distance:view,viewport});
   }
   const hero=clips.some(c=>c.id==='pass_jump')?'pass_jump':clips[0].id;
   await page.evaluate(async({id,view})=>{await window.__hoops.select(id);window.__hoops.setDistance(view);window.__hoops.seek(.52);window.__hoops.render();},{id:hero,view});
   const image=await sharp(await page.screenshot({animations:'disabled'})).webp({quality:88,effort:5}).toBuffer();
   await put(`preview-${viewport.width}x${viewport.height}-${view}.webp`,image,{kind:'full-page',clip:hero,distance:view,viewport});
  }
 }
 csp.violations=await page.evaluate(()=>window.__hoopsCspViolations||[]);
 if(csp.violations.length)findings.push(`Content-Security-Policy violations: ${csp.violations.length}`);
 if(!csp.workerUrls.length||csp.workerUrls.some(url=>!/^\/runtime\/.+\.(?:js|mjs)(?:\?.*)?$/.test(url)))findings.push('Workers must use nonempty same-origin static JavaScript URLs; blob workers are forbidden');
 const sources=[];for(const filename of [...requests].sort()){const bytes=await fs.readFile(path.join(frozen,filename));sources.push({file:filename,bytes:bytes.length,sha256:hash(bytes)});}
 const evidence={iteration,label,freezeStartedAtUTC,freezeCompletedAtUTC,frozenSnapshot:frozen,captureToolSha256,inputParity,csp,startedAtUTC,completedAtUTC:new Date().toISOString(),renderer:'Chromium / WebGL / ANGLE SwiftShader (software rendering)',animationSource:'Delivered Draco-compressed GLB animation, THREE.AnimationMixer, delivered Ball node. No surrogate avatar or ball.',clips:clips.map(c=>c.id),viewports:views,distances:['near','far'],framesPerClipPerView:8,playbackChecks,errors,externalRequests:external,failedRequests,findings:[...new Set(findings)],sources,files,framing};
 await fs.writeFile(reportFile,gzipSync(JSON.stringify(evidence),{level:9}));
 const totalBytes=files.reduce((n,f)=>n+f.bytes,0);
 const report=`# Browser capture ${iteration}\n\n${label||'Rendered review'} · ${startedAtUTC}\n\nActual delivered Draco GLBs were decoded locally and played with THREE.AnimationMixer. The Ball node is part of each delivered clip. Every sheet contains eight real browser WebGL captures. Chromium used ANGLE SwiftShader; this is visual and framing evidence, not a physical-phone GPU benchmark.\n\n| Check | Result |\n|---|---|\n| Clips | ${clips.length} |\n| Frozen GLB / gzip SHA parity | ${inputParity.filter(c=>c.match).length}/${inputParity.length} |\n| Exact Island CSP | Enforced |\n| CSP violations | ${csp.violations.length} |\n| Same-origin static workers | ${csp.workerUrls.length} |\n| Viewports | 390×844, 844×390 |\n| Distances | near, far |\n| Timeline frames checked | ${framing.length} |\n| Actual playback checks | ${playbackChecks.filter(c=>c.pass).length}/${playbackChecks.length} |\n| Contact sheets | ${files.filter(f=>f.kind==='8-frame-contact-sheet').length} |\n| Full page captures | 4 |\n| External requests | ${external.length} |\n| Page errors | ${errors.length} |\n| Failed requests | ${failedRequests.length} |\n| Capture findings | ${[...new Set(findings)].length} |\n| Image bytes | ${totalBytes.toLocaleString('en-US')} |\n\nSource paths, SHA-256, exact frame times, projected body/ball positions, the enforced CSP string, securitypolicyviolation events and actual worker URLs are in [capture.json.gz](capture.json.gz).\n\n${findings.length?'## Findings\n\n'+[...new Set(findings)].map(f=>'- '+f).join('\n'):'All sampled near-body and far-ball framing checks passed. No horizontal overflow.'}\n`;
 await fs.writeFile(path.join(output,'CAPTURE.md'),report);
 console.log(`Captured iteration ${iteration}: ${clips.length} clips, ${framing.length} real GLB frames, ${totalBytes} image bytes, ${findings.length} findings, ${errors.length} page errors.`);
 if(totalBytes>5_000_000)throw Error('Iteration exceeds 5 MB image budget');
 if(errors.length||external.length||failedRequests.length||findings.length)process.exitCode=1;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));console.log(`Frozen source retained for parity verification: ${frozen}`);}
