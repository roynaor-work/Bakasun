#!/usr/bin/env node
/** Diagnostic only: replace Eyes in memory to distinguish lid occlusion/winding. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'iterations/14/eye-visibility-probe');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const source=await fs.readFile(fileURLToPath(import.meta.url)),served=new Map(),payloads=new Map();
const errors=[],consoleMessages=[],remoteRequests=[],screenshots=[];
await fs.mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    const local=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+local);
    if(!file.startsWith(root+path.sep))throw Error('Outside package');
    if(!served.has(local)){
      const bytes=await fs.readFile(file);served.set(local,{bytes,sha256:hash(bytes)});
      if(local.startsWith('/offline/')){const m=bytes.toString().match(/\[("[^\"]+")\]\s*=\s*"([A-Za-z0-9+/=]+)"/);if(m){const decoded=Buffer.from(m[2],'base64');payloads.set(JSON.parse(m[1]),{bytes:decoded.length,sha256:hash(decoded)});}}
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(served.get(local).bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser,metadata;
try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))remoteRequests.push(r.url());});
  await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort('blockedbyclient'));
  await page.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),ids=new Set();
    let hold=false;
    window.requestAnimationFrame=callback=>{if(hold)return 0;let id;id=request(t=>{ids.delete(id);callback(t);});ids.add(id);return id;};
    window.__pauseEyeProbe=()=>{hold=true;for(const id of ids)cancel(id);ids.clear();};
  });
  await page.goto(origin+'/preview.html?paused&clean&character=player-01&view=face',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>globalThis.soccerV7?.ready,undefined,{timeout:60000});
  await page.evaluate(()=>soccerV7.ready);
  await page.evaluate(async()=>{window.__pauseEyeProbe();soccerV7.setPlaying(false);await soccerV7.setCharacter('player-01');await soccerV7.setView('face');await soccerV7.setLOD(0);soccerV7.setLighting('studio');soccerV7.setOrbit(0);soccerV7.seek(.15);});
  const capture=async name=>{
    const filename=name+'.png',file=path.join(output,filename);await page.screenshot({path:file});
    const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;if(data[i]>180&&data[i+1]<90&&data[i+2]>180){count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
    screenshots.push({file:filename,bytes:(await fs.stat(file)).size,magentaPixels:count,magentaBounds:count?{minX,minY,maxX,maxY}:null});
  };
  await capture('01-baseline-production');
  metadata=await page.evaluate(async origin=>{
    // This separate local r160 import is diagnostic only. A duplicate-instance
    // console warning is recorded; no additional runtime library is exported.
    const THREE=await import(origin+'/vendor/three.module.js');
    const {actors,renderer,scene,camera}=soccerV7.inspect(),rows=[],saved=[];
    for(const actor of actors)actor.model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      rows.push({mesh:mesh.name,skinned:!!mesh.isSkinnedMesh,vertices:mesh.geometry.attributes.position.count,materials:list.map(m=>({name:m.name,type:m.type,side:m.side,depthTest:m.depthTest,depthWrite:m.depthWrite,visible:m.visible,transparent:m.transparent,roughness:m.roughness,map:m.map?.name||null}))});
      if(list.some(m=>/eye/i.test(m.name||''))){
        const replacements=list.map(m=>/eye/i.test(m.name||'')?new THREE.MeshBasicMaterial({name:'DIAGNOSTIC Eyes magenta',color:0xff00ff,side:m.side,depthTest:m.depthTest,depthWrite:m.depthWrite,toneMapped:false}):m);
        saved.push({mesh,original:mesh.material,replacements:replacements.filter(m=>m.name==='DIAGNOSTIC Eyes magenta')});mesh.material=Array.isArray(mesh.material)?replacements:replacements[0];
      }
    });
    globalThis.__eyeProbe={saved,THREE,render:()=>renderer.render(scene,camera)};
    __eyeProbe.render();
    return{state:soccerV7.state(),meshes:rows,eyeMeshCount:saved.length,packageHashes:soccerV7.inspect().data.hashes};
  },origin);
  await capture('02-magenta-original-side-and-depth');
  await page.evaluate(()=>{for(const item of __eyeProbe.saved)for(const m of item.replacements){m.side=__eyeProbe.THREE.DoubleSide;m.needsUpdate=true;}__eyeProbe.render();});
  await capture('03-magenta-double-sided-normal-depth');
  await page.evaluate(()=>{for(const item of __eyeProbe.saved){item.mesh.renderOrder=10000;for(const m of item.replacements){m.depthTest=false;m.depthWrite=false;m.needsUpdate=true;}}__eyeProbe.render();});
  await capture('04-magenta-depth-disabled-overlay');
  await page.evaluate(()=>{for(const item of __eyeProbe.saved){item.mesh.material=item.original;item.mesh.renderOrder=0;for(const m of item.replacements)m.dispose();}__eyeProbe.render();delete globalThis.__eyeProbe;});
}catch(error){errors.push(String(error));}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
const report={schemaVersion:1,kind:'DIAGNOSTIC-ONLY-eye-primitive-visibility',generatedAt:new Date().toISOString(),auditSource:{file:'source/audit-eye-visibility.mjs',sha256:hash(source),bytes:source.length},method:'Actual current bundled player01/LOD0. Production baseline, then Eyes-only pure magenta MeshBasic in memory. Compare original side/depth, DoubleSide, then depth-disabled overlay. No asset or production-viewer source was changed.',viewport:{width:390,height:844,dpr:1},metadata,screenshots,loadedPayloads:Object.fromEntries(payloads),servedResources:[...served].map(([file,v])=>({file,bytes:v.bytes.length,sha256:v.sha256})),errors,consoleMessages,remoteRequests,pass:errors.length===0&&remoteRequests.length===0&&metadata?.eyeMeshCount>0};
await fs.writeFile(path.join(output,'DIAGNOSTIC.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,eyeMeshCount:metadata?.eyeMeshCount,screenshots,errors,remoteRequests,output},null,2));
if(!report.pass)process.exitCode=1;
