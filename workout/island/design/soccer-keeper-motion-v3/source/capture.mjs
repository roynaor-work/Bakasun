// SPDX-License-Identifier: CC0-1.0
// Eight native 30 Hz GLB frames per clip, plus compact browser interaction checks.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=new URL('../',import.meta.url),verification=new URL('verification/',base),sheets=new URL('sheets/',base);
await fs.mkdir(verification,{recursive:true});await fs.mkdir(sheets,{recursive:true});
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base))),clips=catalog.clips;
function sheetTimes(clip){
  const duration=clip.durationSeconds??clip.duration,last=Math.round(duration*30);
  if(clip.loop)return Array.from({length:8},(_,i)=>Math.round(last*i/8)/30);
  const priority={contact:0,save:0,release:1,drop:1,takeoff:2,body_land:3,land:3,recover:4,clap:4};
  const events=[...(clip.events??[])].sort((a,b)=>(priority[a.type??a.name]??8)-(priority[b.type??b.name]??8));
  const frames=new Set([0,last]);
  for(const e of events){if(frames.size===8)break;const time=e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/30;if(Number.isFinite(time))frames.add(Math.max(0,Math.min(last,Math.round(time*30))));}
  while(frames.size<8){const sorted=[...frames].sort((a,b)=>a-b);let gap=0,mid=0;for(let i=1;i<sorted.length;i++){if(sorted[i]-sorted[i-1]>gap){gap=sorted[i]-sorted[i-1];mid=Math.round((sorted[i]+sorted[i-1])/2);}}if(gap<2)throw Error(`Too few native frames for eight samples: ${clip.id}`);frames.add(mid);}
  return[...frames].sort((a,b)=>a-b).map(frame=>frame/30);
}
const root=path.resolve(fileURLToPath(new URL('../../../../',base)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain'};
let server,url=process.env.SOCCER_KEEPER_PREVIEW_URL;
if(!url){server=http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(root,'.'+relative);if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/workout/island/design/soccer-keeper-motion-v3/preview.html`;}
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{for(const name of['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[name]=()=>{throw Error('WebAssembly disabled for uncompressed motion preview');};});
  await page.goto(url);await page.waitForFunction(()=>window.keeperPreview?.ready);await page.evaluate(()=>window.keeperPreview.setPlaying(false));
  const evidence=[];
  for(const c of clips){
    const times=sheetTimes(c);
    await page.evaluate(id=>window.keeperPreview.select(id),c.id);
    const captured=await page.evaluate(async({id,label,times})=>{
      const api=window.keeperPreview;api.setView(id==='keeper_shuffle'?'front':'three');api.setPlaying(false);
      const sheet=document.createElement('canvas');sheet.width=1600;sheet.height=1030;const ctx=sheet.getContext('2d');
      ctx.fillStyle='#101a1a';ctx.fillRect(0,0,sheet.width,sheet.height);ctx.textAlign='left';ctx.fillStyle='#d7ed9e';ctx.font='bold 25px Arial';ctx.fillText(id,22,37);ctx.font='13px Arial';ctx.fillStyle='#9caba5';ctx.fillText('30 Hz · 18 canonical joints · 8 native GLB samples',22,62);ctx.textAlign='right';ctx.fillText(label,1577,38);
      const inspected=[];
      for(let i=0;i<times.length;i++){
        api.seek(times[i]);inspected.push({time:times[i],...api.inspect()});const image=new Image(),data=api.snapshot(394,420);await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data;});
        const x=10+i%4*398,y=82+Math.floor(i/4)*464;ctx.drawImage(image,x,y,394,420);ctx.fillStyle='#d7ed9e';ctx.textAlign='left';ctx.font='bold 13px Arial';ctx.fillText(`${String(i+1).padStart(2,'0')} / ${times[i].toFixed(3)} s`,x+8,y+443);ctx.fillStyle='#9caba5';ctx.textAlign='right';ctx.font='12px Arial';ctx.fillText(`frame ${Math.round(times[i]*30)}`,x+385,y+443);
      }
      ctx.textAlign='left';ctx.font='12px Arial';ctx.fillStyle='#9caba5';ctx.fillText('CC0-1.0 · Original skinned mesh with native animation · Actor scenario applied once · Fixed camera per clip',22,1020);
      return{data:sheet.toDataURL('image/png'),samples:inspected};
    },{id:c.id,label:c.label??c.labelHe??c.id,times});
    const bytes=Buffer.from(captured.data.split(',')[1],'base64'),sheet=`sheets/${c.id}.png`;await fs.writeFile(new URL(sheet,base),bytes);
    const glb=await fs.readFile(new URL(c.asset??`clips/${c.id}.glb`,base));
    evidence.push({id:c.id,sheet,sheetSha256:createHash('sha256').update(bytes).digest('hex'),glbSha256:createHash('sha256').update(glb).digest('hex'),timesSeconds:times,frames:times.map(t=>Math.round(t*30)),samples:captured.samples});
  }
  const first=clips.find(c=>c.id==='keeper_dive_high')??clips[0];
  await page.evaluate(async id=>{const api=window.keeperPreview;await api.select(id);api.seek((api.current.events?.find(e=>(e.type??e.name)==='contact')?.time??api.current.duration*.4));api.setView('three');},first.id);
  await page.screenshot({path:new URL('preview-844x390.png',verification).pathname,fullPage:false});
  const landscape=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,stage:(()=>{const r=document.getElementById('stage').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()}));
  // Exercise actual controls after all fourteen native assets have been loaded.
  await page.locator('[data-view="side"]').click();
  const viewWorks=await page.locator('[data-view="side"]').getAttribute('aria-pressed')==='true';
  await page.locator('#speed').selectOption('0.5');
  await page.locator('#scrub').focus();await page.keyboard.press('Home');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');
  const scrubWorks=await page.evaluate(()=>window.keeperPreview.inspect().nativeFrame===5);
  await page.locator('#play').click();await page.waitForTimeout(150);await page.locator('#play').click();
  const playbackWorks=await page.evaluate(()=>window.keeperPreview.inspect().nativeFrame>5);
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const api=window.keeperPreview;await api.select('field_group_celebrate');api.seek(api.current.duration*.45);api.setView('front');});
  await page.screenshot({path:new URL('preview-390x844.png',verification).pathname,fullPage:true});
  const portrait=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,actorCount:window.keeperPreview.inspect().actorCount}));
  // Force two earlier native loads to finish after a later selection commits.
  // Observe the actual Three.js dispose methods, not a viewer bookkeeping flag.
  const held=[];let heldResolve;const heldReady=new Promise(resolve=>{heldResolve=resolve;});
  await page.route('**/clips/*.glb',route=>{
    if(/\/(keeper_ready|keeper_punch)\.glb$/.test(new URL(route.request().url()).pathname)){held.push(route);if(held.length===2)heldResolve();}
    else return route.continue();
  });
  await page.evaluate(()=>{window.__keeperPendingSelections=Promise.all([window.keeperPreview.select('keeper_ready'),window.keeperPreview.select('keeper_punch')]);});
  await heldReady;
  await page.evaluate(()=>window.keeperPreview.select('field_clap'));
  await page.evaluate(async()=>{
    const THREE=await import('../soccer-motion-v8/runtime/vendor/three.module.js');
    window.__keeperDisposalCalls=[];window.__keeperRestoreDisposal=[];
    for(const[name,constructor]of Object.entries({geometry:THREE.BufferGeometry,material:THREE.Material,texture:THREE.Texture,skeleton:THREE.Skeleton})){
      const original=constructor.prototype.dispose;
      constructor.prototype.dispose=function(...args){window.__keeperDisposalCalls.push({kind:name,id:this.uuid??this.id});return original.apply(this,args);};
      window.__keeperRestoreDisposal.push(()=>{constructor.prototype.dispose=original;});
    }
  });
  await Promise.all(held.map(route=>route.continue()));
  const rapidSwitch=await page.evaluate(async()=>{
    await window.__keeperPendingSelections;
    const calls=window.__keeperDisposalCalls,counts={},keys=new Set();let duplicateDisposals=0;
    for(const call of calls){counts[call.kind]=(counts[call.kind]??0)+1;const key=`${call.kind}:${call.id}`;if(keys.has(key))duplicateDisposals++;keys.add(key);}
    window.__keeperRestoreDisposal.forEach(restore=>restore());
    const api=window.keeperPreview;api.seek(.5);const pose=api.inspect();
    return{delayedNativeLoads:2,currentClip:api.current.id,ready:api.ready,actualDisposeCalls:counts,duplicateDisposals,activeActorFinite:pose.finite,activeSkins:pose.skins.length,
      passed:api.ready&&api.current.id==='field_clap'&&pose.finite&&pose.skins.length>0&&(counts.geometry??0)>=2&&(counts.material??0)>=2&&(counts.skeleton??0)>=2&&duplicateDisposals===0};
  });
  await page.unroute('**/clips/*.glb');
  const wasmRequests=requests.filter(v=>/\.wasm(?:[?#]|$)|\/draco\//i.test(v));
  const passed=!errors.length&&landscape.scrollWidth<=844&&landscape.scrollHeight<=390&&portrait.scrollWidth<=390&&portrait.actorCount===3&&viewWorks&&scrubWorks&&playbackWorks&&rapidSwitch.passed&&!wasmRequests.length&&evidence.every(e=>e.samples.length===8&&e.samples.every(s=>s.finite&&s.skins.length&&s.skins.every(k=>k.joints===18)));
  const result={clipCount:clips.length,framesPerSheet:8,framesRendered:evidence.length*8,sheetSampling:'Native frames at endpoints and declared event landmarks, then subdivide widest uncovered intervals; cyclic ready pose sampled uniformly.',viewports:[landscape,portrait],webAssemblyBlocked:true,wasmRequests,errors:[...new Set(errors)],controls:{viewWorks,scrubWorks,playbackWorks},rapidSwitch,externalActorTransform:'referenceTravel applied once; native Root stays unchanged',team:'independent cloned skins with catalog offsets and phaseOffsetsSeconds',networkOrigins:[...new Set(requests.filter(u=>u.startsWith('http')).map(u=>new URL(u).origin))],clips:evidence,passed};
  await fs.writeFile(new URL('browser.json',verification),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({clipCount:result.clipCount,framesRendered:result.framesRendered,errors:result.errors,landscape,portrait,controls:result.controls,rapidSwitch,passed},null,2));if(!passed)process.exitCode=1;
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
