// SPDX-License-Identifier: CC0-1.0
// Renders native GLB poses into eight-frame PNG sheets. Playwright is external.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=new URL('../',import.meta.url),out=new URL('verification/',base),sheets=new URL('sheets/',out);
await fs.mkdir(sheets,{recursive:true});
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base))),clips=catalog.clips;
const root=path.resolve(fileURLToPath(new URL('../../../../',base)));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain'};
let server;
let url=process.env.HOOPS_MOTION_PREVIEW_URL;
if(!url){
  server=http.createServer(async(req,res)=>{
    try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(root,'.'+relative);if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/workout/island/design/hoops-motion-v13/preview.html`;
}
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1024}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{for(const key of['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw new Error('WebAssembly disabled for uncompressed-GLB verification');};});
  await page.goto(url);await page.waitForFunction(()=>window.hoopsMotionPreview?.ready);
  await page.evaluate(()=>window.hoopsMotionPreview.setPlaying(false));
  const captures=[],clipEvidence=[];
  for(const clip of clips){
    const id=clip.id??clip.name,duration=clip.durationSeconds??clip.duration,totalFrames=Math.round(duration*30);
    await page.evaluate(id=>window.hoopsMotionPreview.select(id),id);
    const times=Array.from({length:8},(_,i)=>Math.round(totalFrames*i/(clip.loop?8:7))/30);
    const data=await page.evaluate(async({id,times,turn})=>{
      const api=window.hoopsMotionPreview;api.setView(id.startsWith('strafe')?'front':'three');api.setPlaying(false);
      const sheet=document.createElement('canvas');sheet.width=1600;sheet.height=1030;const ctx=sheet.getContext('2d');ctx.fillStyle='#f4f3ec';ctx.fillRect(0,0,sheet.width,sheet.height);
      ctx.fillStyle='#15342f';ctx.font='bold 25px Arial';ctx.textAlign='left';ctx.fillText(id,22,37);ctx.font='13px Arial';ctx.fillStyle='#69786e';ctx.fillText('30 Hz · canonical 18-bone athlete · 8 native GLB samples',22,62);
      ctx.textAlign='right';ctx.fillText(turn?'Native pose + external actor heading':'Native pose + external actor travel',1576,38);
      for(let i=0;i<times.length;i++){
        api.seek(times[i]);const image=new Image();const data=api.snapshot(394,420);await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data;});
        const x=10+(i%4)*398,y=82+Math.floor(i/4)*464;ctx.drawImage(image,x,y,394,420);ctx.fillStyle='#15342f';ctx.textAlign='left';ctx.font='bold 13px Arial';ctx.fillText(`${String(i+1).padStart(2,'0')} / ${times[i].toFixed(3)} s`,x+8,y+443);ctx.font='12px Arial';ctx.textAlign='right';ctx.fillStyle='#69786e';ctx.fillText(`frame ${Math.round(times[i]*30)}`,x+386,y+443);
      }
      ctx.textAlign='left';ctx.font='12px Arial';ctx.fillStyle='#69786e';ctx.fillText('Original motion: CC0-1.0 · Skinned mesh and motion rendered together; no compression decoder.',22,1020);return sheet.toDataURL('image/png');
    },{id,times,turn:id.startsWith('turn_')});
    const name=`sheets/${id}.png`;await fs.writeFile(new URL(name,out),Buffer.from(data.split(',')[1],'base64'));captures.push(name);
    const assetPath=clip.file??clip.asset??`clips/${id}.glb`;const asset=await fs.readFile(new URL(assetPath.startsWith('runtime/')?assetPath.slice(8):assetPath,new URL('runtime/catalog.json',base)));
    clipEvidence.push({id,frames:times.map(t=>Math.round(t*30)),timesSeconds:times,sheet:name,glbSha256:createHash('sha256').update(asset).digest('hex'),referenceHeading:id.startsWith('turn_')});
  }
  await page.evaluate(async()=>{const api=window.hoopsMotionPreview;await api.select('run');api.seek(.133333333333);api.setView('three');api.setPlaying(true);});
  const playbackBefore=await page.locator('#frame').innerText();await page.waitForTimeout(350);const playbackAfter=await page.locator('#frame').innerText();
  const bridgeSmoke=[];for(const source of['idle','run']){await page.evaluate(source=>window.hoopsMotionPreview.bridgeFrom(source),source);const started=await page.evaluate(()=>window.hoopsMotionPreview.bridgeActive);await page.waitForFunction(()=>!window.hoopsMotionPreview.bridgeActive);bridgeSmoke.push({source,target:'run',started,completed:true});}
  for(const target of['idle','run']){const source=await page.evaluate(()=>window.hoopsMotionPreview.current.id);await page.evaluate(target=>window.hoopsMotionPreview.bridgeTo(target),target);const started=await page.evaluate(()=>window.hoopsMotionPreview.bridgeActive);await page.waitForFunction(()=>!window.hoopsMotionPreview.bridgeActive);bridgeSmoke.push({source,target,started,completed:true});}
  await page.evaluate(()=>{const api=window.hoopsMotionPreview;api.seek(.133333333333);api.setView('three');});
  await page.screenshot({path:new URL('preview-desktop.png',out).pathname,fullPage:true});captures.push('preview-desktop.png');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  await page.screenshot({path:new URL('preview-mobile.png',out).pathname,fullPage:true});captures.push('preview-mobile.png');
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const wasmRequests=requests.filter(u=>/\.wasm|draco/i.test(u));
  const model=await fs.readFile(new URL('runtime/reference/athlete.glb',base));
  const evidence={sharedModelSha256:createHash('sha256').update(model).digest('hex'),realPlayback:{before:playbackBefore,after:playbackAfter,advanced:playbackBefore!==playbackAfter},bridgeSmoke,clipsLoaded:clipEvidence,clipCount:clips.length,framesPerSheet:8,viewports:[{width:1440,height:1024},{width:390,height:844}],captures,errors:[...new Set(errors)],mobileOverflow,webAssemblyBlocked:true,wasmRequests,networkOrigins:[...new Set(requests.filter(u=>u.startsWith('http')).map(u=>new URL(u).origin))],passed:!errors.length&&!mobileOverflow&&!wasmRequests.length&&playbackBefore!==playbackAfter&&bridgeSmoke.every(b=>b.started&&b.completed)};
  await fs.writeFile(new URL('browser.json',out),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({clipCount:evidence.clipCount,framesPerSheet:8,errors:evidence.errors,mobileOverflow,passed:evidence.passed},null,2));if(!evidence.passed)process.exitCode=1;
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
// The same capture command also records actual joint transforms after wallclock
// animation; this detects a rendered actor that remains frozen while UI time moves.
await import('./playback-proof.mjs');
