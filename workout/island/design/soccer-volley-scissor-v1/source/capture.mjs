// SPDX-License-Identifier: CC0-1.0
// Capture the delivered native GLBs, never a reconstruction of their source poses.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base=fileURLToPath(new URL('../',import.meta.url)),out=path.join(base,'verification'),temp=await fs.mkdtemp(path.join(tmpdir(),'soccer-volley-frames-'));
await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(base,'sheets'),{recursive:true});
const catalog=JSON.parse(await fs.readFile(path.join(base,'catalog.json'),'utf8'));
// Freeze the exact input bytes before launching Chromium; authors may continue working.
const site=path.join(temp,'site');await fs.mkdir(site,{recursive:true});
for(const file of ['preview.html','preview.css','preview.mjs','catalog.json'])await fs.copyFile(path.join(base,file),path.join(site,file));
await fs.cp(path.join(base,'vendor'),path.join(site,'vendor'),{recursive:true});
for(const c of catalog.clips){const bytes=await fs.readFile(path.join(base,c.asset));if(c.sha256&&createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw new Error(`${c.id}: inputs changing; rerun after bake`);await fs.mkdir(path.dirname(path.join(site,c.asset)),{recursive:true});await fs.writeFile(path.join(site,c.asset),bytes);}
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+relative);if(!file.startsWith(site))throw new Error('Invalid path');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/preview.html';
const browserOnly=process.argv.includes('--browser-only');let manifest=[];
let browser;const errors=[],requests=[],checks=[],captures=[];
const check=(name,passed,detail={})=>{checks.push({name,passed,...detail});if(!passed)throw new Error(name+' '+JSON.stringify(detail));};
const at=e=>e.time??e.atSeconds??e.frame/30,type=e=>e.type??e.event??e.name;
function framesFor(c){
 const d=c.durationSeconds??c.duration,count=Math.round(d*30),events=(c.events??[]).filter(e=>Number.isFinite(at(e))),selected=new Map([[0,{stage:'entry',frame:0,time:0}],[count,{stage:'exit',frame:count,time:count/30}]]);
 const priority=['contact','takeoff','land','back_land','getup_start','getup_end','getup_complete','prepare','back','follow','load','recover','ready'];
 for(const eventType of priority){for(const e of events.filter(e=>type(e)===eventType)){const frame=Math.round(at(e)*30);if(selected.size<8&&!selected.has(frame))selected.set(frame,{stage:eventType,frame,time:frame/30});}}
 for(const fraction of [.5,.25,.75,.125,.875,.375,.625]){const frame=Math.round(count*fraction);if(selected.size<8&&!selected.has(frame))selected.set(frame,{stage:'motion',frame,time:frame/30});}
 for(let frame=1;selected.size<8&&frame<count;frame++)if(!selected.has(frame))selected.set(frame,{stage:'motion',frame,time:frame/30});
 return [...selected.values()].sort((a,b)=>a.frame-b.frame);
}
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
 await page.addInitScript(()=>{for(const k of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[k]=()=>{throw new Error('WASM disabled: this package is uncompressed');};});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(url+'?capture=1');await page.waitForFunction(()=>window.__soccerVolley?.ready,null,{timeout:60000});
 if(!browserOnly){
 for(const c of catalog.clips){
  const bytes=await fs.readFile(path.join(site,c.asset)),hash=createHash('sha256').update(bytes).digest('hex');check(`${c.id}: catalog GLB hash matches`,!c.sha256||c.sha256===hash);
  await page.evaluate(id=>window.__soccerVolley.select(id),c.id);const view=c.id.startsWith('scissor')?'side':'three';await page.evaluate(v=>window.__soccerVolley.setView(v),view);
  const frames=framesFor(c);check(`${c.id}: eight distinct sheet frames`,frames.length===8&&new Set(frames.map(f=>f.frame)).size===8);
  const snapshots=[];
  for(const frame of frames){await page.evaluate(t=>window.__soccerVolley.seek(t),frame.time);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const snapshot=await page.evaluate(()=>window.__soccerVolley.snapshot());check(`${c.id}: f${frame.frame} actual 18-bone skin`,snapshot.bones?.length===18);snapshots.push(snapshot);frame.capture=path.join(temp,`${c.id}-${frame.frame}.png`);await page.locator('#stage').screenshot({path:frame.capture});if((c.id==='scissor_backward'&&frame.stage==='contact')||(c.id==='scissor_land_getup'&&frame.stage==='back_land')){await fs.mkdir('/tmp/volley-early-review',{recursive:true});await fs.copyFile(frame.capture,`/tmp/volley-early-review/${c.id}-${frame.stage}.png`);console.log(`Early review: /tmp/volley-early-review/${c.id}-${frame.stage}.png`);}}
  const e=c.events?.find(e=>type(e)==='contact');if(e)check(`${c.id}: exact contact in sheet`,frames.some(f=>f.frame===Math.round(at(e)*30)&&f.stage==='contact'));
  console.log(`Captured ${c.id}`);captures.push({id:c.id,frames,view,sourceAsset:c.asset,sourceAssetSha256:hash,sourceAssetBytes:bytes.length,snapshots});
 }
 const compose=spawnSync(process.env.PYTHON_PATH??'python3',['-c',String.raw`
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=json.load(sys.stdin)
font=lambda size,bold=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size)
for clip in p['clips']:
    w,h,cap=400,300,44
    sheet=Image.new('RGB',(1600,2*(h+cap)+82),'#e8ebde');d=ImageDraw.Draw(sheet)
    d.rectangle((0,0,1600,82),fill='#142b22')
    d.text((22,13),clip['id'].replace('_',' ').upper(),font=font(23,True),fill='#e5eecf')
    d.text((22,47),'SOCCER VOLLEY + SCISSOR  /  30 HZ  /  18 BONES  /  NATIVE GLB',font=font(13),fill='#b2c3aa')
    for i,frame in enumerate(clip['frames']):
        x,y=(i%4)*w,82+(i//4)*(h+cap)
        im=Image.open(frame['capture']).convert('RGB').resize((w,h),Image.Resampling.LANCZOS);sheet.paste(im,(x,y))
        contact=frame['stage']=='contact';d.rectangle((x,y,x+w-1,y+h-1),outline='#e8b95e' if contact else '#74876d',width=3 if contact else 1)
        d.text((x+11,y+h+7),f"{i+1:02d}  {frame['stage'].replace('_',' ').upper()}",font=font(12,True),fill='#765322' if contact else '#294c37')
        t=f"{frame['time']:.3f}s | f{frame['frame']}";b=d.textbbox((0,0),t,font=font(11));d.text((x+w-b[2]-12,y+h+8),t,font=font(11),fill='#5a6b55')
    sheet.save(Path(p['output'])/(clip['id']+'.webp'),'WEBP',quality=94,method=6)
`],{input:JSON.stringify({clips:captures,output:path.join(base,'sheets')}),encoding:'utf8'});
 if(compose.status!==0)throw new Error(compose.stderr);
 for(const c of captures){const filename=`sheets/${c.id}.webp`,bytes=await fs.readFile(path.join(base,filename));manifest.push({...c,sheet:filename,width:1600,height:770,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),frames:c.frames.map(({capture,...f})=>f)});}
 await fs.writeFile(path.join(base,'sheets/manifest.json'),JSON.stringify({schemaVersion:1,nativeRate:30,framesPerClip:8,renderer:'actual delivered GLB AnimationMixer, LINEAR translation and quaternion slerp',clips:manifest},null,2)+'\n');
 }else{manifest=JSON.parse(await fs.readFile(path.join(base,'sheets/manifest.json'),'utf8')).clips;for(const c of manifest){const source=catalog.clips.find(x=>x.id===c.id);check(`${c.id}: reused sheets match current GLB`,source?.sha256===c.sourceAssetSha256);check(`${c.id}: reused eight frames`,c.frames.length===8&&new Set(c.frames.map(f=>f.frame)).size===8);check(`${c.id}: recorded native 18-bone snapshots`,c.snapshots?.length===8&&c.snapshots.every(s=>s.bones?.length===18));const e=source.events?.find(e=>type(e)==='contact');if(e)check(`${c.id}: reused exact contact frame`,c.frames.some(f=>f.frame===Math.round(at(e)*30)&&f.stage==='contact'));}}
 await page.goto(url);await page.waitForFunction(()=>window.__soccerVolley?.ready);await page.evaluate(()=>window.__soccerVolley.seek(0));
 const layouts=[];for(const viewport of [{width:844,height:390},{width:390,height:844},{width:1280,height:800}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,stage:document.getElementById('stage').getBoundingClientRect().toJSON()}));check(`${viewport.width}x${viewport.height}: no overflow`,layout.scrollWidth<=viewport.width&&layout.scrollHeight<=viewport.height,{layout});layouts.push(layout);await page.screenshot({path:path.join(out,`preview-${viewport.width}x${viewport.height}.png`)});}
 await page.setViewportSize({width:844,height:390});
 for(const c of catalog.clips){await page.locator(`[data-clip="${c.id}"]`).click();await page.evaluate(()=>window.__soccerVolley.setPlaying(false));check(`${c.id}: clip button selects actual asset`,(await page.evaluate(()=>window.__soccerVolley.snapshot())).id===c.id);await page.locator('#scrub').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');check(`${c.id}: timeline seeks via keyboard`,(await page.evaluate(()=>window.__soccerVolley.snapshot())).frame===1);}
 for(const view of ['front','side','three']){await page.locator(`[data-view="${view}"]`).click();check(`camera: ${view}`,(await page.evaluate(()=>window.__soccerVolley.snapshot())).view===view);}
 await page.locator('#speed').selectOption('0.5');check('speed control',await page.locator('#speed').inputValue()==='0.5');
 await page.locator('#skeleton').check();check('skeleton control',await page.locator('#skeleton').isChecked());await page.locator('#skeleton').uncheck();
 await page.locator('#sequence').click();await page.evaluate(()=>window.__soccerVolley.setPlaying(false));check('sequence starts with scissor',(await page.evaluate(()=>window.__soccerVolley.snapshot())).id==='scissor_backward');
 const scissor=catalog.clips.find(c=>c.id==='scissor_backward');await page.evaluate(t=>{window.__soccerVolley.seek(t-.01);window.__soccerVolley.setPlaying(true);},scissor.durationSeconds??scissor.duration);await page.waitForFunction(()=>window.__soccerVolley.snapshot().id==='scissor_land_getup',null,{timeout:30000});await page.evaluate(()=>window.__soccerVolley.setPlaying(false));check('sequence continues into landing',(await page.evaluate(()=>window.__soccerVolley.snapshot())).id==='scissor_land_getup');
 const wasmRequests=requests.filter(u=>/\.wasm|draco/i.test(u)),origins=[...new Set(requests.map(u=>new URL(u).origin))];check('offline assets only',origins.length===1&&origins[0]===origin);check('no decoder requests',wasmRequests.length===0);check('no browser errors',errors.length===0,{errors});
 const evidence={schemaVersion:1,passed:checks.every(c=>c.passed),renderer:'Chromium WebGL via SwiftShader; actual delivered GLBs',webAssemblyBlocked:true,networkOrigins:origins,wasmRequests,errors,viewports:layouts,checks,sheets:manifest.map(({snapshots,frames,...c})=>({...c,frames:frames.length}))};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:evidence.passed,sheets:manifest.length,checks:checks.length,errors}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
