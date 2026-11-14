/** Native GLB screenshots and repeatable viewport verification. CC0-1.0.
 * All image tiles are browser screenshots of the actual skinned model. Pillow
 * only lays out those screenshots and draws their frame/time labels.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base=new URL('../',import.meta.url),repo=new URL('../../../../../',import.meta.url);
const modulePath=process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs';
const {chromium}=await import(modulePath);
const out=new URL('verification/',base),sheets=new URL('sheets/',base);await fs.mkdir(out,{recursive:true});await fs.mkdir(sheets,{recursive:true});
const temp=await fs.mkdtemp('/tmp/soccer-tackle-sheets-');
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base))),port=Number(process.env.SOCCER_PREVIEW_PORT??8767);
let server;
if(!process.env.SOCCER_PREVIEW_URL){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:fileURLToPath(repo),stdio:'ignore'});}
const url=process.env.SOCCER_PREVIEW_URL??`http://127.0.0.1:${port}/workout/island/design/soccer-tackle-keeper-v2/preview.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:940},deviceScaleFactor:1}),errors=[],requests=[],checks=[],captures=[];
  await page.addInitScript(()=>{for(const name of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[name]=()=>{throw new Error('WebAssembly disabled during animation verification');};});
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
  let loaded=false;
  for(let i=0;i<25&&!loaded;i++){try{await page.goto(url,{waitUntil:'networkidle',timeout:30000});loaded=true;}catch(error){if(i===24)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
  await page.waitForFunction(()=>window.__review?.ready&&!window.__review.snapshot().pending);
  await page.evaluate(()=>window.__review.play(false));
  await page.evaluate(()=>document.body.classList.add('capture'));await page.setViewportSize({width:640,height:420});
  await page.waitForTimeout(100);
  const tileData=[];
  for(const entry of catalog.clips){
    const duration=entry.duration??entry.durationSeconds??entry.metadata?.duration;
    await page.evaluate(async id=>{await window.__review.select(id);window.__review.play(false);window.__review.view('three');},entry.id);
    const tiles=[];
    for(let i=0;i<8;i++){
      const time=duration*i/7;
      const snapshot=await page.evaluate(t=>window.__review.setTime(t),time);
      if(!snapshot.finite||snapshot.bones.length!==18||snapshot.root?.some(v=>Math.abs(v)>1e-8))errors.push(`Invalid pose ${entry.id} at ${time}`);
      checks.push({id:entry.id,time,finite:snapshot.finite,bones:snapshot.bones.length,root:snapshot.root,modelAsset:snapshot.modelAsset,keeperTint:snapshot.keeperTint});
      const tile=path.join(temp,`${entry.id}-${i}.png`);await page.locator('#stage').screenshot({path:tile});tiles.push({path:tile,time,frame:time*30});
    }
    tileData.push({id:entry.id,label:entry.label??entry.labelHe??entry.id,duration,tiles,output:fileURLToPath(new URL(`${entry.id}.png`,sheets))});
    captures.push(`sheets/${entry.id}.png`);
    console.log(`Eight-frame sheet: ${entry.id}`);
  }
  const layout=path.join(temp,'tiles.json');await fs.writeFile(layout,JSON.stringify(tileData));
  execFileSync('python3',['-c',`import json,sys\nfrom PIL import Image,ImageDraw,ImageFont\nentries=json.load(open(sys.argv[1]))\nfont=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',24)\nsmall=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)\nfor entry in entries:\n tiles=[Image.open(t['path']).convert('RGB') for t in entry['tiles']]\n w,h=tiles[0].size\n gap=12\n header=86\n caption=48\n sheet=Image.new('RGB',(4*w+5*gap,2*(h+caption)+3*gap+header),(17,33,30))\n draw=ImageDraw.Draw(sheet)\n draw.text((gap,16),entry['id'],font=font,fill=(235,244,232))\n draw.text((gap,51),'30 Hz | 18 bones | '+format(entry['duration'],'.3f')+' s | native GLB / no pose correction',font=small,fill=(175,201,179))\n for i,(im,t) in enumerate(zip(tiles,entry['tiles'])):\n  x=gap+(i%4)*(w+gap); y=header+gap+(i//4)*(h+caption+gap)\n  sheet.paste(im,(x,y))\n  draw.text((x+12,y+h+11),str(i+1).zfill(2)+'  /  '+format(t['time'],'.3f')+' s  /  frame '+format(t['frame'],'.2f'),font=small,fill=(209,223,196))\n sheet.save(entry['output'],optimize=True)\n`,layout]);
  await page.evaluate(()=>document.body.classList.remove('capture'));
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const entry of catalog.clips){
      await page.evaluate(async id=>{await window.__review.select(id);window.__review.play(false);},entry.id);
      const duration=entry.duration??entry.durationSeconds??entry.metadata?.duration;
      for(const t of [0,duration*.25,duration*.5,duration*.75,duration]){
        const snapshot=await page.evaluate(t=>window.__review.setTime(t),t);
        if(!snapshot.finite||snapshot.bones.length!==18)errors.push(`Viewport pose invalid ${entry.id} ${viewport.width} ${t}`);
        checks.push({viewport,id:entry.id,time:t,finite:snapshot.finite,bones:snapshot.bones.length,modelAsset:snapshot.modelAsset,keeperTint:snapshot.keeperTint});
      }
    }
    await page.evaluate(async()=>{const id=window.__review.clips.find(c=>c.id==='slide_tackle')?.id??window.__review.clips[0].id;await window.__review.select(id);window.__review.setTime(window.__review.snapshot().duration*.5);});
    const file=`preview-${viewport.width}x${viewport.height}.png`;await page.screenshot({path:fileURLToPath(new URL(file,sheets)),fullPage:true});captures.push(`sheets/${file}`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)errors.push(`Horizontal overflow at ${viewport.width}x${viewport.height}`);
  }
  const disallowed=requests.filter(u=>/draco|\.wasm/i.test(u)),origins=[...new Set(requests.filter(u=>u.startsWith('http')).map(u=>new URL(u).origin))];
  const evidence={method:'Native GLB tracks on the unchanged canonical reference mesh through Three AnimationMixer; no IK or floor correction',clips:catalog.clips.map(c=>c.id),framesPerSheet:8,uniformSampleTimes:true,checks,viewports:[{width:844,height:390},{width:390,height:844}],captures,errors,wasmBlocked:true,disallowedRequests:disallowed,networkOrigins:origins,pass:!errors.length&&!disallowed.length&&origins.length===1};
  await fs.writeFile(new URL('browser.json',out),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({pass:evidence.pass,clips:evidence.clips.length,checks:checks.length,errors}));if(!evidence.pass)process.exitCode=1;
}finally{await browser.close();server?.kill();await fs.rm(temp,{recursive:true,force:true});}
