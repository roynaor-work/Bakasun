#!/usr/bin/env node
// Timed live playback on this renderer. It never labels software FPS as phone FPS.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-v7-tools/package.json'),{chromium}=require('playwright');
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const seconds=Math.max(3,Number(option('--seconds',6))),warmup=Math.max(1,Number(option('--warmup',2)));
const frozen=await fs.mkdtemp('/tmp/hoops-v7-benchmark-'),inputs=[];
async function freeze(folder=root,rel=''){for(const e of await fs.readdir(folder,{withFileTypes:true})){if(['iterations','verification','standalone.html'].includes(e.name))continue;const n=path.join(rel,e.name),p=path.join(folder,e.name),q=path.join(frozen,n);if(e.isDirectory()){await fs.mkdir(q,{recursive:true});await freeze(p,n);}else{const b=await fs.readFile(p);await fs.writeFile(q,b);inputs.push({file:n,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}}
await freeze();
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{const u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const p=path.resolve(frozen,'.'+(u==='/'?'/index.html':u));if(!p.startsWith(frozen+path.sep))throw Error('path');const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,errors=[],externalRequests=[],records=[];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();externalRequests.push(u);return route.abort();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
const startedAtUtc=new Date().toISOString();
try{
 await page.goto(origin+'/index.html?capture=1');await page.waitForFunction(()=>!!window.__hoopsLab,null,{timeout:120000});
 await page.evaluate(async()=>{await window.__hoopsLab.ready;window.__hoopsLab.pause(true);});
 const graphics=await page.evaluate(()=>{const gl=window.__hoopsLab.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};});
 for(const viewport of[{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const scenario of[{view:'near',crowd:false},{view:'far',crowd:true}]){
   const actions=await page.evaluate(()=>window.__hoopsLab.actions);
   for(const action of actions){
    await page.evaluate(({action,scenario})=>{
     const a=window.__hoopsLab;a.pause(true);a.selectRole('pg');a.setLOD('auto');a.setCrowd(scenario.crowd);a.selectAction(action,{immediate:true});a.seek(0);a.setView(scenario.view);a.setSpeed(1);a.setPlaying(true);
     // Keep single actions playing during the measurement window. A one-second
     // external poll would otherwise count long pauses as slow rendering.
     const restart=()=>{if(a.actors.find(x=>x.id==='pg').controller.getDiagnostics().phase>=.999){a.selectAction(action,{immediate:true});a.seek(0);a.setPlaying(true);}window.__benchmarkRestart=requestAnimationFrame(restart);};
     window.__benchmarkRestart=requestAnimationFrame(restart);
    },{action:action.id,scenario});
    // Individual waits stay bounded; benchmark progress is streamed every case.
    await page.waitForTimeout(warmup*1000);
    const before=await page.evaluate(()=>({clock:performance.now(),diagnostics:window.__hoopsLab.diagnostics()}));
    for(let tick=0;tick<seconds;tick++){
     await page.waitForTimeout(1000);
    }
    const after=await page.evaluate(()=>({clock:performance.now(),diagnostics:window.__hoopsLab.diagnostics()}));
    await page.evaluate(()=>{cancelAnimationFrame(window.__benchmarkRestart);window.__hoopsLab.pause(true);});
    const wall=(after.clock-before.clock)/1000,frames=(after.diagnostics.performance?.playbackFrames??0)-(before.diagnostics.performance?.playbackFrames??0);
    const record={viewport,scenario,action:action.id,wallSeconds:wall,frames,fps:frames/wall,diagnostics:after.diagnostics};
    records.push(record);
    // Persist outside the measured playback window so a long run remains
    // inspectable even if it is deliberately stopped before completion.
    await fs.appendFile(path.join(frozen,'progress.ndjson'),JSON.stringify(record)+'\n');
    console.log(JSON.stringify({case:records.length,viewport:`${viewport.width}x${viewport.height}`,view:scenario.view,action:action.id,fps:frames/wall}));
   }
  }
 }
 const report={schemaVersion:1,startedAtUtc,finishedAtUtc:new Date().toISOString(),frozenSourceDirectory:frozen,scope:'Live wall-clock playback, every action in near and six-actor/crowd views in both phone viewports. Emulated mobile touch/DPR2; renderer caps raster DPR at1.5. Benchmark harness restarts one-shot actions on the next animation frame so stopped playback is not counted as slow rendering. This is not an authored seamless loop. Chromium ANGLE SwiftShader, software renderer. CPU submission times are not GPU timings. No physical phone FPS claim.',graphics,inputs,records,errors,externalRequests,pass:records.length===108&&errors.length===0&&externalRequests.length===0};
 await fs.writeFile(path.join(root,'verification/benchmark.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pass:report.pass,cases:records.length,minFps:Math.min(...records.map(r=>r.fps)),maxFps:Math.max(...records.map(r=>r.fps)),errors,externalRequests}));
 if(!report.pass)process.exitCode=1;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
