#!/usr/bin/env node
/** Real Chromium/WebGL evidence; all images originate in delivered Draco GLBs.
 * npm install --prefix /tmp/hoops-v9-browser playwright@1.56.1
 * node source/capture.mjs [--all-sheets] [--only id,id]
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CATALOG} from '../runtime/catalog.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const {chromium}=await import(pathToFileURL(process.env.HOOPS_PLAYWRIGHT_PATH||'/tmp/hoops-v9-browser/node_modules/playwright/index.mjs'));
const args=process.argv.slice(2),allSheets=args.includes('--all-sheets');
const onlyIndex=args.indexOf('--only');
const only=onlyIndex<0?null:new Set((args[onlyIndex+1]||'').split(',').filter(Boolean));
const entries=CATALOG.filter(c=>!only||only.has(c.id));
if(!entries.length)throw new Error('No clips selected');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary','.gz':'application/gzip','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const local=path.resolve(root,'.'+pathname);if(local!==root&&!local.startsWith(root+path.sep)){res.writeHead(403).end();return;}const bytes=await fs.readFile(local.endsWith(path.sep)?path.join(local,'preview.html'):local);res.writeHead(200,{'Content-Type':mime[path.extname(local)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; img-src 'self' data:; connect-src 'self'"});res.end(bytes);}catch{res.writeHead(404).end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({executablePath:process.env.HOOPS_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
const browserErrors=[],failedRequests=[];
page.on('pageerror',error=>browserErrors.push(error.message));
page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()?.errorText}));
const output=path.join(root,'verification');
await fs.mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[];
const selectedFrames=[['euro_left',.18,'Euro · gather'],['euro_left',.36,'Euro · long step'],['euro_left',.53,'Euro · short step'],['euro_left',.70,'Euro · release'],['dunk_two_hands',.59,'Two-hand dunk'],['run',.22,'Run · counterrotation'],['defensive_stance',.35,'Defensive stance'],['rebound_land',.58,'Rebound · landing']];
async function frame(id,normalized){await page.evaluate(async id=>{await window.motionPreview.load(id);},id);return page.evaluate(normalized=>{const app=window.motionPreview;app.seek(app.current.duration*normalized);return app.snapshot();},normalized);}
async function sheet(frames,filename,title){const dataURL=await page.evaluate(async({frames,title})=>{const canvas=document.createElement('canvas');canvas.width=844;canvas.height=390;const ctx=canvas.getContext('2d');ctx.fillStyle='#f2f4ed';ctx.fillRect(0,0,844,390);for(let i=0;i<frames.length;i++){const image=new Image();image.src=frames[i].image;await image.decode();const x=(i%4)*211,y=Math.floor(i/4)*195;ctx.drawImage(image,x,y,211,166);ctx.fillStyle='#fbfcf8';ctx.fillRect(x,y+166,211,29);ctx.fillStyle='#233f33';ctx.font='10px Arial';ctx.textAlign='left';ctx.fillText(frames[i].label,x+9,y+179);ctx.fillStyle='#8b9b8f';ctx.font='8px Arial';ctx.fillText(frames[i].time,x+9,y+190);ctx.strokeStyle='#d8e1d5';ctx.strokeRect(x+.5,y+.5,210,194);}return canvas.toDataURL('image/png');},{frames,title});const bytes=Buffer.from(dataURL.split(',')[1],'base64');await fs.writeFile(path.join(root,filename),bytes);return{file:filename,width:844,height:390,bytes:bytes.length,sha256:sha(bytes),frames:frames.map(({image,...rest})=>rest)};}
try{
 await page.goto(`http://127.0.0.1:${port}/preview.html?clip=${encodeURIComponent(entries[0].id)}`,{waitUntil:'networkidle'});
 await page.evaluate(()=>window.motionPreview.ready);
 const desktop=await page.screenshot({path:path.join(output,'preview-844x390.png')});
 await page.evaluate(()=>{window.motionPreview.setCaptureMode(true);window.motionPreview.setPlaying(false);});
 await page.setViewportSize({width:211,height:166});
 await page.evaluate(()=>window.motionPreview.resize());
 for(const entry of entries){const started=Date.now();await page.evaluate(async id=>{await window.motionPreview.load(id);},entry.id);const info=await page.evaluate(()=>{const app=window.motionPreview;const current=app.current;let positions=[];for(const t of [0,.2,.4,.6,.8,1]){app.seek(current.duration*t);const hip=current.scene.getObjectByName('Hips');const p=new app.THREE.Vector3();hip.getWorldPosition(p);positions.push(p.toArray());}app.seek(0);const context=app.renderer.getContext();return{id:current.id,animation:current.animation.name,duration:current.duration,tracks:current.animation.tracks.length,frames:current.data.keyframes.length,glError:context.getError(),positions,errors:[...app.errors]};});if(info.glError!==0||info.errors.length||info.id!==entry.id||!info.tracks)throw new Error(`${entry.id}: browser evidence failed: ${JSON.stringify(info)}`);const glb=await fs.readFile(path.join(root,entry.glb));rows.push({...info,bytes:glb.length,sha256:sha(glb),loadAndProbeMilliseconds:Date.now()-started});console.log(`${entry.id}: GLTFLoader + Draco + WebGL PASS`);}
 // Verify the viewer's real playback path: events cross, one-shots replay,
 // native loops wrap, then captures are explicitly paused at chosen times.
 await page.evaluate(async()=>{window.__motionReplayCount=0;window.__motionPresented=[];addEventListener('motion-replay-boundary',()=>window.__motionReplayCount++);addEventListener('motion-presentation-event',e=>window.__motionPresented.push(e.detail));await window.motionPreview.load('euro_left',{autoplay:true});});
 await page.selectOption('#speed','1.5',{force:true});
 await page.waitForFunction(()=>window.__motionReplayCount>0,{},{timeout:7000});
 const replayCheck=await page.evaluate(()=>({oneShotReplays:window.__motionReplayCount,presentationEvents:window.__motionPresented.map(e=>({name:e.name,domain:e.domain,clipId:e.clipId})),time:motionPreview.current.time}));
 if(!replayCheck.presentationEvents.length||replayCheck.presentationEvents.some(e=>e.domain!=='presentation'))throw new Error('Presentation markers did not cross during real playback');
 await page.evaluate(async()=>{await window.motionPreview.load('run');motionPreview.seek(motionPreview.current.duration*.95);motionPreview.setPlaying(true);});
 await page.waitForFunction(()=>motionPreview.current.id==='run'&&motionPreview.current.time<motionPreview.current.duration*.5,{},{timeout:3000});
 const loopCheck=await page.evaluate(()=>{motionPreview.setPlaying(false);return{clipId:motionPreview.current.id,time:motionPreview.current.time,duration:motionPreview.current.duration,wrapped:true};});
 await page.selectOption('#speed','1',{force:true});
 const selected=[];for(const [id,t,label] of selectedFrames){if(only&&!only.has(id))continue;selected.push({image:await frame(id,t),label,time:`${id} / ${(CATALOG.find(c=>c.id===id).durationSeconds*t).toFixed(2)}s`});}
 let contactSheet=null;if(selected.length)contactSheet=await sheet(selected,'contact-sheet.png','HOOPS MOTION V9');
 const perClip=[];if(allSheets){await fs.mkdir(path.join(output,'sheets'),{recursive:true});for(const entry of entries){const frames=[];await page.evaluate(async id=>{await window.motionPreview.load(id);},entry.id);for(let i=0;i<8;i++){const t=i/7;const image=await page.evaluate(t=>{const app=window.motionPreview;app.seek(app.current.duration*t);return app.snapshot();},t);frames.push({image,label:entry.id,time:`${(entry.durationSeconds*t).toFixed(2)}s / ${entry.durationSeconds.toFixed(2)}s`});}perClip.push(await sheet(frames,`verification/sheets/${entry.id}-844x390.png`,entry.id));}}
 await page.evaluate(()=>window.motionPreview.setCaptureMode(false));
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{await window.motionPreview.load('idle_ready');});
 const mobileOverflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 await page.screenshot({path:path.join(output,'preview-390x844.png'),fullPage:false});
 if(mobileOverflow.scrollWidth>mobileOverflow.width)throw new Error('Mobile preview has horizontal overflow');
 if(browserErrors.length||failedRequests.length)throw new Error(`Browser errors: ${JSON.stringify({browserErrors,failedRequests})}`);
 const evidence={schemaVersion:1,kind:'real-chromium-gltf-draco-webgl-evidence',pass:true,viewport:{width:844,height:390},mobileViewport:{width:390,height:844},mobileOverflow,replayCheck,loopCheck,browser:await browser.version(),capturedAt:new Date().toISOString(),allClipsLoaded:rows.length,totalCatalogClips:CATALOG.length,browserErrors,failedRequests,desktopPreview:{file:'verification/preview-844x390.png',bytes:desktop.length,sha256:sha(desktop)},contactSheet,perClipSheets:perClip,clips:rows};
 await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(`PASS ${rows.length} GLBs; real WebGL contact sheet ${contactSheet?.width}×${contactSheet?.height}`);
}finally{await page.evaluate(()=>window.motionPreview?.dispose()).catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve));}
