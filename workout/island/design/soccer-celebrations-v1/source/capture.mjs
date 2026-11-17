// SPDX-License-Identifier: CC0-1.0
// Render the delivered GLBs. Pillow only arranges unchanged screen captures.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await fs.readFile(path.join(base,'catalog.json'),'utf8'));
const out=path.join(base,'verification'),sheets=path.join(base,'sheets');
await fs.mkdir(out,{recursive:true});await fs.mkdir(sheets,{recursive:true});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'soccer-celebrations-render-'));
const port=Number(process.env.PREVIEW_PORT??8874),origin=`http://127.0.0.1:${port}`;
// Serving only the isolated package proves that no sibling runtime files are required.
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',base],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<40;i++){try{const r=await fetch(`${origin}/catalog.json`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
  await context.addInitScript(()=>{for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw Error('WebAssembly is disabled by the offline verification');};});
  const page=await context.newPage(),errors=[],requests=[],warnings=[],clips=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});
  page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${origin}/preview.html`);await page.waitForFunction(()=>window.celebrationPreview?.current&&document.querySelector('#status').textContent==='');
  await page.evaluate(()=>window.celebrationPreview.pause());
  const desktop=await page.evaluate(()=>({width:innerWidth,height:innerHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,verticalOverflow:document.documentElement.scrollHeight>innerHeight,stage:{width:document.querySelector('#stage').clientWidth,height:document.querySelector('#stage').clientHeight}}));
  await page.screenshot({path:path.join(out,'preview-844x390.png')});
  // The same player, camera fitting and mixer render every frame sheet.
  const style=await page.addStyleTag({content:'body{overflow:hidden!important}#stage{position:fixed!important;inset:0!important;width:512px!important;height:288px!important;min-height:0!important;z-index:50!important}#stage>*:not(canvas){display:none!important}#stage canvas{width:512px!important;height:288px!important}'});
  const frameIndex=[],capturedAssetHashes=new Map();
  for(const c of catalog.clips){
    capturedAssetHashes.set(c.id,createHash('sha256').update(await fs.readFile(path.join(base,c.asset))).digest('hex'));
    await page.evaluate(async id=>{await window.celebrationPreview.load(id);window.celebrationPreview.pause();window.celebrationPreview.setView('three');},c.id);
    await page.waitForTimeout(30);
    const times=[...new Set([0,...(c.events??[]).slice(0,6).map(e=>e.time),c.duration])].sort((a,b)=>a-b),frames=[];
    while(times.length<8){let gap=0,index=0;for(let i=1;i<times.length;i++){if(times[i]-times[i-1]>gap){gap=times[i]-times[i-1];index=i;}}times.splice(index,0,(times[index-1]+times[index])/2);}
    for(const [i,t]of times.entries()){
      await page.evaluate(t=>window.celebrationPreview.seek(t),t);await page.waitForTimeout(16);
      const file=path.join(temporary,`${c.id}-${i}.png`);await page.locator('#stage canvas').screenshot({path:file});
      const bounds=await page.evaluate(()=>window.celebrationPreview.projectedBounds());frames.push({time:t,file,bounds});
    }
    const modelCheck=await page.evaluate(()=>{const p=window.celebrationPreview,roots=p.current.actors.map(a=>p.model.getObjectByName(a.rootNode??`${a.id}_Root`));let meshes=0;const actorNodes={};p.model.traverse(o=>{if(o.isSkinnedMesh)meshes++;for(const a of p.current.actors)if(o.name.startsWith(a.id+'_'))actorNodes[a.id]=(actorNodes[a.id]??0)+1;});const trackNames=p.model.animations?.[0]?.tracks?.map(t=>t.name)??[];return{actors:p.current.actors.length,rootsFound:roots.every(Boolean),skinnedMeshes:meshes,actorNodes,mixerTime:p.mixerTime,displayTime:p.time,bounds:p.bounds()};});
    // Scrubbing back from the terminal frame must change the actual pose.
    const endpoints=await page.evaluate(()=>{const p=window.celebrationPreview;const sample=()=>{const q=[];p.model.traverse(o=>{if(/_(Hips|LeftHand|RightHand)$/.test(o.name))q.push(...o.matrixWorld.elements);});return q;};const end=sample();p.seek(p.current.duration*.37);const mid=sample();return{changes:end.some((v,i)=>Math.abs(v-mid[i])>1e-5),mixerMatches:Math.abs(p.mixerTime-p.time)<1e-6};});
    clips.push({id:c.id,frames:8,times,framing:frames.map(f=>({time:f.time,...f.bounds})),modelCheck,scrubbing:endpoints,passed:frames.every(f=>f.bounds.inside)&&modelCheck.rootsFound&&modelCheck.skinnedMeshes>=c.actors.length&&endpoints.changes&&endpoints.mixerMatches});
    frameIndex.push({id:c.id,label:c.label??c.id,frames,output:path.join(sheets,`${c.id}.webp`)});
  }
  await fs.writeFile(path.join(temporary,'index.json'),JSON.stringify(frameIndex));
  execFileSync('python3',['-c',String.raw`import json,sys,os
from PIL import Image,ImageDraw,ImageFont
index=json.load(open(sys.argv[1]));overview=[]
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
for item in index:
 sheet=Image.new('RGB',(2048,654),'#061319');d=ImageDraw.Draw(sheet)
 d.text((18,12),item['id'],font=font,fill='#e7f5ef')
 d.text((1825,15),'30 Hz / 8 frames',font=small,fill='#62e5bb')
 for n,fr in enumerate(item['frames']):
  im=Image.open(fr['file']).convert('RGB');x=(n%4)*512;y=42+(n//4)*306
  sheet.paste(im,(x,y));d.rectangle((x,y+268,x+90,y+288),fill='#061319');d.text((x+9,y+271),f"{fr['time']:.3f} s",font=small,fill='#edca79')
 sheet.save(item['output'],'WEBP',quality=88,method=6)
 thumb=sheet.resize((640,204));overview.append((item['id'],thumb))
result=Image.new('RGB',(1280,((len(overview)+1)//2)*230),'#061319');d=ImageDraw.Draw(result)
for n,(name,im) in enumerate(overview):
 x=n%2*640;y=n//2*230;result.paste(im,(x,y));d.text((x+10,y+208),name,font=small,fill='#b5d1c9')
result.save(sys.argv[2],'WEBP',quality=84,method=6)
`,path.join(temporary,'index.json'),path.join(sheets,'overview.webp')]);
  await style.evaluate(el=>el.remove());await page.setViewportSize({width:844,height:390});
  const showcase=catalog.clips.find(c=>c.actors.length===5)??catalog.clips[0];
  await page.evaluate(async id=>{await window.celebrationPreview.load(id);window.celebrationPreview.seek(window.celebrationPreview.current.duration*.5);},showcase.id);await page.waitForTimeout(50);await page.screenshot({path:path.join(out,'preview-844x390.png')});
  await page.locator('[data-view="side"]').click();const sidePassed=await page.locator('[data-view="side"]').getAttribute('aria-pressed')==='true';await page.locator('[data-view="three"]').click();
  await page.locator('#play').click();const before=await page.evaluate(()=>window.celebrationPreview.time);await page.waitForTimeout(180);const after=await page.evaluate(()=>window.celebrationPreview.time);await page.locator('#play').click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(40);const portraitOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await page.screenshot({path:path.join(out,'preview-390x844.png')});
  const forbidden=requests.filter(u=>/\.(?:wasm|ktx2)(?:$|\?)|draco|meshopt/i.test(u)),external=requests.filter(u=>!u.startsWith(origin)&&!u.startsWith('blob:')&&!u.startsWith('data:'));
  const assets=[];for(const c of catalog.clips){const bytes=await fs.readFile(path.join(base,c.asset));const sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==capturedAssetHashes.get(c.id))throw Error(`Asset changed during capture: ${c.id}`);assets.push({id:c.id,file:c.asset,sha256});}
  for(const clip of clips){const asset=assets.find(a=>a.id===clip.id);clip.assetSha256=asset.sha256;clip.sheet=`sheets/${clip.id}.webp`;clip.sheetSha256=createHash('sha256').update(await fs.readFile(path.join(base,clip.sheet))).digest('hex');}
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),viewport:desktop,portrait:{width:390,height:844,horizontalOverflow:portraitOverflow},webAssemblyDisabled:true,servedRoot:'soccer-celebrations-v1 only',forbiddenRequests:forbidden,externalRequests:external,errors,warnings,clips,assets,sheets:{count:frameIndex.length,framesPerClip:8,frameWidth:512,frameHeight:288,layout:'4 × 2',sampling:'exact event times and endpoints, then largest-gap subdivisions',width:2048,height:654},controls:{viewSwitch:sidePassed,playAdvanced:after!==before},requestCount:requests.length,passed:clips.length===catalog.clips.length&&clips.every(c=>c.passed)&&!desktop.horizontalOverflow&&!desktop.verticalOverflow&&!portraitOverflow&&!forbidden.length&&!external.length&&!errors.length&&sidePassed&&after!==before};
  await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,clips:clips.length,sheets:frameIndex.length,errors,forbidden,external},null,2));if(!report.passed)process.exitCode=1;
}finally{await browser?.close();server.kill();await fs.rm(temporary,{recursive:true,force:true});}
