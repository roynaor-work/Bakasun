// SPDX-License-Identifier: CC0-1.0
// Render eight native GLB samples per clip and verify the844×390 preview.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

async function playwright(){
  const candidates=[process.env.PLAYWRIGHT_MODULE,'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs','/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for(const candidate of candidates){try{await fs.access(candidate);return import(pathToFileURL(candidate).href);}catch{}}
  return import('playwright');
}
const {chromium}=await playwright();
const base=new URL('../',import.meta.url),verification=new URL('verification/',base),sheets=new URL('sheets/',base);
await fs.mkdir(sheets,{recursive:true});await fs.mkdir(verification,{recursive:true});
const catalogBytes=await fs.readFile(new URL('catalog.json',base)),catalog=JSON.parse(catalogBytes),clips=catalog.clips;
const smoke=process.argv.includes('--smoke');
const onlyArgument=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7)??(process.argv.includes('--only')?process.argv[process.argv.indexOf('--only')+1]:null);
const only=onlyArgument?.split(',').filter(Boolean),renderClips=smoke?[]:only?clips.filter(clip=>only.includes(clip.id)):clips;
if(only?.some(id=>!clips.some(clip=>clip.id===id)))throw Error('Unknown --only clip ID');
const root=path.resolve(fileURLToPath(new URL('../../../../',base)));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let server,url=process.env.SOCCER_RUN_CYCLES_PREVIEW_URL;
if(!url){
  server=http.createServer(async(req,res)=>{
    try{const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(root,'.'+requestPath);if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/workout/island/design/soccer-run-cycles-v3/preview.html?paused=1`;
}
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>requests.push(request.url()));page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(()=>{for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw Error('WebAssembly disabled: native uncompressed assets must load directly');};});
  await page.goto(url);await page.waitForFunction(()=>window.__preview?.ready,null,{timeout:90000});
  await page.evaluate(()=>window.__preview.setPlaying(false));
  const clipEvidence=[];
  for(const clip of renderClips){
    const duration=clip.durationSeconds??clip.duration,rate=clip.nativeRate??120,totalFrames=Math.round(duration*rate),times=Array.from({length:8},(_,i)=>Math.round(totalFrames*i/(clip.loop?8:7))/rate);
    await page.evaluate(id=>window.__preview.select(id),clip.id);
    const png=await page.evaluate(async({id,label,times,rate,isKeeper,loop})=>{
      const api=window.__preview;api.setPlaying(false);api.setView(isKeeper?'front':'three');api.setWorldTravel(true);
      const sheet=document.createElement('canvas');sheet.width=1600;sheet.height=1030;const ctx=sheet.getContext('2d');ctx.direction='ltr';ctx.fillStyle='#f2f3e9';ctx.fillRect(0,0,1600,1030);
      ctx.textAlign='left';ctx.fillStyle='#203a28';ctx.font='bold 23px Arial';ctx.fillText(id,18,31);ctx.font='12px Arial';ctx.fillStyle='#5d725d';ctx.fillText(`${rate} Hz · 18 canonical bones · 8 native GLB samples · ${loop?'cycle endpoint omitted':'both endpoints included'}`,18,54);
      ctx.textAlign='right';ctx.direction='rtl';ctx.font='bold 18px Arial';ctx.fillStyle='#203a28';ctx.fillText(label,1580,31);ctx.direction='ltr';ctx.font='12px Arial';ctx.fillStyle='#5d725d';ctx.fillText('GLB animation + external actor travel',1580,54);
      for(let i=0;i<8;i++){
        api.seek(times[i]);const image=new Image(),data=api.snapshot(394,420);await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data;});
        const x=6+i%4*398,y=76+Math.floor(i/4)*466;ctx.drawImage(image,x,y,394,420);
        ctx.fillStyle='#203a28';ctx.textAlign='left';ctx.font='bold 13px Arial';ctx.fillText(`${String(i+1).padStart(2,'0')} · ${times[i].toFixed(3)} s`,x+8,y+441);ctx.textAlign='right';ctx.font='12px Arial';ctx.fillStyle='#5d725d';ctx.fillText(`frame ${Math.round(times[i]*rate)}`,x+386,y+441);
      }
      ctx.textAlign='left';ctx.font='11px Arial';ctx.fillStyle='#5d725d';ctx.fillText('Native skinned mesh and original motion rendered together. CC0-1.0. Support rings use declared world anchors.',18,1021);return sheet.toDataURL('image/png');
    },{id:clip.id,label:clip.label??clip.id,times,rate,isKeeper:clip.id.startsWith('keeper'),loop:!!clip.loop});
    const sheetBytes=Buffer.from(png.split(',')[1],'base64'),sheet=`sheets/${clip.id}.png`;await fs.writeFile(new URL(sheet,base),sheetBytes);
    const asset=await fs.readFile(new URL(clip.asset,base));
    if(clip.sha256&&clip.sha256!==hash(asset))throw Error(`Catalog/GLB hash mismatch during capture: ${clip.id}`);
    clipEvidence.push({id:clip.id,timesSeconds:times,frames:times.map(t=>Math.round(t*rate)),sheet,framesPerSheet:8,sheetSha256:hash(sheetBytes),glbSha256:hash(asset),nativeRate:rate,worldTravelAppliedOnce:true});
    console.log(`Rendered ${clip.id}: 8 frames`);
  }
  const selected=clips.find(c=>c.id==='run')??clips[0];
  await page.evaluate(async id=>{const api=window.__preview;await api.select(id);api.seek(api.current.durationSeconds*.25);api.setView('three');},selected.id);
  const viewports=[];
  for(const size of [{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(size);await page.waitForTimeout(150);
    const overflow=await page.evaluate(()=>({horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight,stageRect:(()=>{const r=document.getElementById('stage').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()}));
    const name=`preview-${size.width}x${size.height}.png`;await page.screenshot({path:new URL(name,verification).pathname});viewports.push({...size,...overflow,screenshot:`verification/${name}`});
  }
  await page.setViewportSize({width:844,height:390});
  const controls={};
  await page.locator('[data-view="side"]').click();controls.sideView=await page.evaluate(()=>window.__preview.state().view==='side');
  await page.locator('#speed').selectOption('0.5');controls.rate=await page.locator('#speed').inputValue()==='0.5';
  await page.locator('#travel').uncheck();controls.inPlace=await page.evaluate(()=>!window.__preview.state().worldTravel&&window.__preview.state().actor.every(v=>v===0));
  await page.locator('#travel').check();controls.world=await page.evaluate(()=>window.__preview.state().worldTravel);
  await page.locator('#restart').click();controls.restart=await page.evaluate(()=>window.__preview.state().time===0);
  await page.locator('#play').click();await page.waitForFunction(()=>window.__preview.state().time>0);controls.play=await page.evaluate(()=>window.__preview.state().playing);
  await page.locator('#play').click();const pausedTime=await page.evaluate(()=>window.__preview.state().time);await page.waitForTimeout(150);controls.pause=await page.evaluate(t=>!window.__preview.state().playing&&window.__preview.state().time===t,pausedTime);
  controls.scrub=await page.evaluate(()=>{const input=document.getElementById('scrub'),api=window.__preview;input.value=String(Math.floor(Number(input.max)/2));input.dispatchEvent(new Event('input',{bubbles:true}));return Math.abs(api.state().time-Number(input.value)/api.state().nativeRate)<1e-8;});
  const second=clips.find(c=>c.id==='sprint')??clips.at(-1);await page.locator(`[data-clip="${second.id}"]`).click();await page.waitForFunction(id=>window.__preview.ready&&window.__preview.current.id===id,second.id);controls.selection=true;
  const wasmRequests=requests.filter(request=>/\.wasm|draco/i.test(request)),origins=[...new Set(requests.filter(u=>u.startsWith('http')).map(u=>new URL(u).origin))];
  const sources=await Promise.all(['preview.html','preview.css','preview.mjs','source/capture.mjs'].map(async file=>{const bytes=await fs.readFile(new URL(file,base));return{file,bytes:bytes.length,sha256:hash(bytes)};}));
  if(hash(await fs.readFile(new URL('catalog.json',base)))!==hash(catalogBytes))throw Error('Catalog changed during capture; rerun on the final build.');
  const evidence={schemaVersion:1,catalogSha256:hash(catalogBytes),sources,clipCount:clips.length,renderedClipCount:clipEvidence.length,smoke,only:only??null,framesPerSheet:8,clips:clipEvidence,viewports,controls,errors:[...new Set(errors)],webAssemblyBlocked:true,wasmRequests,networkOrigins:origins,passed:!errors.length&&!wasmRequests.length&&origins.length===1&&viewports.every(v=>!v.horizontal&&!v.vertical)&&Object.values(controls).every(Boolean)};
  await fs.writeFile(new URL(smoke?'browser-smoke.json':only?'browser-partial.json':'browser.json',verification),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({clipCount:evidence.clipCount,renderedClipCount:evidence.renderedClipCount,errors:evidence.errors,viewports,controls,passed:evidence.passed},null,2));if(!evidence.passed)process.exitCode=1;
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
