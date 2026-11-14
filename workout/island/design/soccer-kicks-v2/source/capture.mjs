// SPDX-License-Identifier: CC0-1.0
// Deterministic eight-frame sheets and browser verification of delivered GLBs.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assembleSheets} from './sheets.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=fileURLToPath(new URL('../',import.meta.url)), repo=path.resolve(base,'../../../..');
const out=path.join(base,'verification'), temp=await fs.mkdtemp(path.join(tmpdir(),'soccer-kicks-frames-'));
await fs.mkdir(out,{recursive:true});
const catalog=JSON.parse(await fs.readFile(path.join(base,'runtime/catalog.json'),'utf8'));
const filterArg=process.argv.find(a=>a.startsWith('--clips='));
const selected=filterArg?new Set(filterArg.slice('--clips='.length).split(',')):null;
if(selected&&[...selected].some(id=>!catalog.clips.some(c=>c.id===id)))throw new Error('Unknown --clips id');
const previous=selected?JSON.parse(await fs.readFile(path.join(base,'sheets/manifest.json'),'utf8')):null;
const sourceAssets=new Map();
for(const clip of catalog.clips){
  const relative=`runtime/${clip.asset??`clips/${clip.id}.glb`}`, bytes=await fs.readFile(path.join(base,relative));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(clip.sha256&&clip.sha256!==sha256)throw new Error(`${clip.id}: GLB hash differs from catalog`);
  sourceAssets.set(clip.id,{sourceAsset:relative,sourceAssetSha256:sha256,declaredSourceAssetSha256:clip.sha256,sourceAssetBytes:bytes.length});
}
// A partial refresh may preserve only captures tied to the current GLB bytes.
if(selected)for(const clip of catalog.clips.filter(c=>!selected.has(c.id))){
  const old=previous.clips.find(c=>c.id===clip.id);
  if(old?.sourceAssetSha256!==sourceAssets.get(clip.id).sourceAssetSha256)throw new Error(`${clip.id}: stale or missing capture; include in --clips or run all clips`);
}
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    const filepath=path.resolve(repo,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!filepath.startsWith(repo+path.sep))throw new Error('Invalid request');
    const body=await fs.readFile(filepath);res.writeHead(200,{'Content-Type':mime[path.extname(filepath)]??'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,url=`${origin}/workout/island/design/soccer-kicks-v2/preview.html`;
let browser;
const errors=[],requests=[],captures=[];
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  await page.addInitScript(()=>{
    for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw new Error('WebAssembly disabled for uncompressed GLB review');};
  });
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(url+'?capture=1');
  await page.waitForFunction(()=>window.__soccerKicks?.ready,{timeout:60000});
  for(const clip of catalog.clips.filter(c=>!selected||selected.has(c.id))){
    const duration=clip.durationSeconds??clip.duration;
    const count=Math.round(duration*30), events=clip.events??[];
    const event=name=>events.find(e=>(e.type??e.event??e.name)===name);
    const at=e=>e?.time??e?.atSeconds??(e?.frame??0)/30;
    const back=at(event('back')), contact=at(event('contact'));
    if(!event('back')||!event('contact'))throw new Error(`${clip.id}: back and contact required for sheet`);
    const landing=event('land'), earlyLanding=landing && at(landing)<back;
    const follow=event('follow')?at(event('follow')):Math.min(duration,contact+.2);
    const choices=earlyLanding
      ? [['entry',0],['airborne',(at(event('takeoff'))+at(landing))/2],['landing',at(landing)],['backswing',back],['contact',contact],['follow',follow],['recovery',contact+(duration-contact)*.6],['exit',duration]]
      : [['entry',0],['preparation',back*.45],['backswing',back],['approach',(back+contact)/2],['contact',contact],['follow',follow],
        [landing?'landing':'recovery',landing?at(landing):contact+(duration-contact)*.55],['exit',duration]];
    const used=new Set();const frames=[];
    for(const [stage,t] of choices){
      let frame=Math.max(0,Math.min(count,Math.round(t*30)));
      // Keep exact event frames; fill only duplicated non-event slots if needed.
      if(used.has(frame)){let offset=1;while(used.has(frame+offset)&&used.has(frame-offset))offset++;frame=frame+offset<=count&&!used.has(frame+offset)?frame+offset:Math.max(0,frame-offset);}
      used.add(frame);frames.push({stage,time:frame/30,frame});
    }
    frames.sort((a,b)=>a.frame-b.frame);
    await page.evaluate(id=>window.__soccerKicks.select(id),clip.id);
    const view=clip.id==='scissors'?'side':'three';
    await page.evaluate(view=>window.__soccerKicks.setView(view),view);
    for(const frame of frames){
      await page.evaluate(t=>window.__soccerKicks.seek(t),frame.time);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      frame.capture=path.join(temp,`${clip.id}-${frame.frame}.png`);
      await page.locator('#stage').screenshot({path:frame.capture});
    }
    captures.push({id:clip.id,view,frames,...sourceAssets.get(clip.id)});
  }
  const refreshed=await assembleSheets({clips:captures,output:path.join(base,'sheets')});
  const sheets=catalog.clips.map(c=>refreshed.find(s=>s.id===c.id)??previous?.clips.find(s=>s.id===c.id));
  if(sheets.some(c=>!c))throw new Error('Incomplete sheet library');
  await fs.writeFile(path.join(base,'sheets/manifest.json'),JSON.stringify({schemaVersion:1,renderer:'actual GLB AnimationMixer with LINEAR/slerp',nativeRate:30,framesPerClip:8,clips:sheets},null,2)+'\n');
  await page.goto(url);await page.waitForFunction(()=>window.__soccerKicks?.ready);
  await page.evaluate(()=>window.__soccerKicks.seek(0));
  await page.screenshot({path:path.join(out,'preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'preview-mobile.png'),fullPage:true});
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const wasmRequests=requests.filter(u=>/\.wasm|draco/i.test(u));
  const evidence={clipsLoaded:sheets.map(c=>c.id),refreshedClips:captures.map(c=>c.id),sheets:sheets.map(s=>({id:s.id,sheet:s.sheet,frames:s.frames.length,sha256:s.sha256,sourceAsset:s.sourceAsset,sourceAssetSha256:s.sourceAssetSha256,declaredSourceAssetSha256:s.declaredSourceAssetSha256})),viewports:[{width:1280,height:900},{width:390,height:844}],errors,mobileOverflow,webAssemblyBlocked:true,wasmRequests,networkOrigins:[...new Set(requests.map(u=>new URL(u).origin))],passed:sheets.length===14&&!errors.length&&!mobileOverflow&&!wasmRequests.length};
  await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({sheets:sheets.length,errors,mobileOverflow,wasmRequests,passed:evidence.passed},null,2));
  if(!evidence.passed)process.exitCode=1;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
