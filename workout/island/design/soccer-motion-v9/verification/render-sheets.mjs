#!/usr/bin/env node
/** Render every delivered Draco GLB in Chromium. Four photographed phases per
 * 844×390 sheet. Node does not draw a substitute character or rest-pose proxy. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {clips} from '../runtime/catalog.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'verification','contact-sheets');
await fs.mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'soccer-v9-browser-'));
const fontConfig=path.join(profile,'fonts.conf');
await fs.writeFile(fontConfig,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>/usr/share/fonts</dir><cachedir>${profile}/font-cache</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE=fontConfig;
const requireTool=createRequire('/opt/codex/cua_node/lib/node_modules/tooling.cjs');
const sharp=requireTool('sharp');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(root,`.${pathname}`);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const errors=[],network=[],records=[],viewports=[];let brakeDemo;
const inputFiles=['preview.html','preview.css','preview.mjs','runtime/catalog.mjs','runtime/library.mjs','runtime/state-machine.mjs',...clips.map(c=>`runtime/${c.asset}`)];
const inputSHA256=Object.fromEntries(await Promise.all(inputFiles.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
let browser;
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function timesFor(meta){
 const contact=meta.events.find(e=>e.type==='contact'),release=[...meta.events].reverse().find(e=>e.type==='release');
 const times=[0,contact?.time??meta.duration*.33,release&&release.time>(contact?.time??0)+.07?release.time:meta.duration*.68,meta.duration];
 if(Math.abs(times[1]-times[2])<.07)times[2]=Math.min(meta.duration, times[1]+(meta.duration-times[1])*.55);
 if(times[1]<.05)times[1]=meta.duration*.3;
 return times.sort((a,b)=>a-b);
}
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],downloadsPath:profile});
 const page=await browser.newPage({viewport:{width:422,height:660},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>network.push({url:r.url(),error:r.failure()?.errorText}));
 await page.goto(`http://127.0.0.1:${server.address().port}/preview.html?capture`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.__motionV9,{timeout:30000});
 await page.evaluate(()=>window.__motionV9.ready);
 for(const meta of clips){
  const loaded=await page.evaluate(id=>window.__motionV9.select(id),meta.id),times=timesFor(meta),layers=[],samples=[];
  for(let i=0;i<times.length;i++){
   const result=await page.evaluate(time=>window.__motionV9.renderAt(time),times[i]);
   if(!result.framing?.allBodyAndHeldBallVisible)errors.push(`${meta.id}@${times[i]}: body or held ball falls outside viewport`);
   const png=await page.locator('#stage canvas').screenshot();
   const tile=await sharp(png).resize(211,330,{fit:'fill'}).png().toBuffer();
   layers.push({input:tile,left:i*211,top:38});
   samples.push({...result,pngSHA256:sha(png),renderedDrawCalls:result.meshes});
  }
  const labels=times.map((t,i)=>`<text x="${i*211+105.5}" y="382" text-anchor="middle" font-size="10" fill="#bfd0c4">${i+1} / ${t.toFixed(3)} s</text>`).join('');
  const overlay=Buffer.from(`<svg width="844" height="390" xmlns="http://www.w3.org/2000/svg"><rect width="844" height="38" fill="#142722"/><rect y="368" width="844" height="22" fill="#142722"/><text x="16" y="25" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#e4f0d1">${escape(meta.id)}</text><text x="828" y="24" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#bfd0c4">SOCCER V9 · ${meta.duration.toFixed(2)} s · 30 Hz · ${meta.loop?'LOOP':'ACTION'}</text><g font-family="Arial,sans-serif">${labels}</g><g stroke="#698675" stroke-opacity=".4"><path d="M211 38V368M422 38V368M633 38V368"/></g></svg>`);
  layers.push({input:overlay,left:0,top:0});
  const sheet=await sharp({create:{width:844,height:390,channels:4,background:'#28423f'}}).composite(layers).png().toBuffer();
  const filename=`${meta.id}.png`;await fs.writeFile(path.join(output,filename),sheet);
  const bytes=await fs.readFile(path.join(root,'runtime',meta.asset));
  records.push({id:meta.id,file:`contact-sheets/${filename}`,width:844,height:390,glbSHA256:sha(bytes),sheetSHA256:sha(sheet),times,samples,loaded,bounds:await page.evaluate(()=>window.__motionV9.bounds)});
  process.stdout.write(`${records.length}/${clips.length} ${meta.id}\n`);
 }
 const demoRequest=await page.evaluate(()=>window.__motionV9.startBrakeDemo({startTime:.07,playing:false}));
 const demoBefore=await page.evaluate(t=>window.__motionV9.renderBrakeAt(t),demoRequest.switchAt-1/30);
 const demoSwitch=await page.evaluate(t=>window.__motionV9.renderBrakeAt(t),demoRequest.switchAt);
 const demoAfter=await page.evaluate(t=>window.__motionV9.renderBrakeAt(t),demoRequest.switchAt+1/30);
 brakeDemo={...demoSwitch.evidence,beforeState:demoBefore.state,afterState:demoAfter.state,sourceGLBSHA256:sha(await fs.readFile(path.join(root,'runtime','clips/run.glb'))),targetGLBSHA256:sha(await fs.readFile(path.join(root,'runtime','clips/run_brake.glb')))};
 if(brakeDemo.beforeState!=='run'||brakeDemo.afterState!=='run_brake'||brakeDemo.worldPositionJumpM>1e-6||brakeDemo.maxBonePositionJumpM>1e-5||brakeDemo.maxBoneAngleJumpDeg>.005||brakeDemo.velocityDifferenceMps>.01)errors.push(`Run-to-brake continuity failed: ${JSON.stringify(brakeDemo)}`);
 await page.screenshot({path:path.join(root,'verification','run-brake-transition.png')});
 const captureErrors=await page.evaluate(()=>window.__motionV9.state.errors);errors.push(...captureErrors);
 await page.evaluate(()=>window.__motionV9.dispose());
 await page.close();
 // Verify the ordinary controls remain usable in both requested landscape and
 // a narrow phone viewport, without relying on screenshot-mode CSS.
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  const ui=await browser.newPage({viewport,deviceScaleFactor:1});ui.on('pageerror',e=>errors.push(e.message));
  await ui.goto(`http://127.0.0.1:${server.address().port}/preview.html`,{waitUntil:'networkidle'});await ui.evaluate(()=>window.__motionV9.ready);
  await ui.locator('#play').click();await ui.locator('#next').click();await ui.waitForFunction(()=>window.__motionV9.state.id!==window.__motionV9.clips[0].id&&!window.__motionV9.state.pending);
  await ui.locator('#travel').check();await ui.locator('#timeline').evaluate(input=>{input.value='0.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const status=await ui.evaluate(()=>({id:window.__motionV9.state.id,travel:window.__motionV9.state.travel,overflow:document.documentElement.scrollWidth>innerWidth,errors:window.__motionV9.state.errors,canvas:[window.__motionV9.canvas.width,window.__motionV9.canvas.height]}));
  const name=`preview-${viewport.width}x${viewport.height}.png`;await ui.screenshot({path:path.join(root,'verification',name)});viewports.push({...viewport,...status,screenshot:name});errors.push(...status.errors);await ui.evaluate(()=>window.__motionV9.dispose());await ui.close();
 }
 for(const name of inputFiles)if(sha(await fs.readFile(path.join(root,name)))!==inputSHA256[name])errors.push(`Input changed during browser verification: ${name}`);
 const evidence={browserVersion:browser.version(),inputSHA256,format:'soccer-motion-v9-browser-evidence-1',renderedWith:'Chromium WebGL + local THREE.GLTFLoader + LocalDRACOLoader + original embedded textures',allClipsLoaded:records.length===clips.length,clips:records.map(({id})=>({id})),clipCount:clips.length,contactSheetDimensions:[844,390],records,viewports,brakeDemo,errors:[...new Set(errors)],failedRequests:network};
 await fs.writeFile(path.join(root,'verification','browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 if(errors.length||network.length||viewports.some(v=>v.overflow))throw new Error(`Browser verification failed: ${errors.length} errors, ${network.length} failed requests`);
 console.log(`Rendered ${records.length} contact sheets; both normal viewports verified.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true});}
