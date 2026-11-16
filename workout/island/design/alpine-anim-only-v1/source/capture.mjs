// CC0. Run an HTTP server from repo root; NODE_PATH is unnecessary.
// ALPINE_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node .../source/capture.mjs
import {mkdir,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL(process.env.ALPINE_PLAYWRIGHT_MODULE||'/tmp/alpine-tools/node_modules/playwright-core/index.mjs').href);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
const errors=[],failed=[],external=[],base=process.env.ALPINE_PREVIEW_URL||'http://127.0.0.1:8765/workout/island/design/alpine-anim-only-v1/preview.html';
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});
page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
page.on('request',r=>{if(!r.url().startsWith(new URL(base).origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
const dir=await mkdtemp(join(tmpdir(),'alpine-frames-'));
try{
  await page.goto(base);await page.waitForFunction(()=>window.__alpine?.ready,undefined,{timeout:60000});
  const clips=await page.evaluate(()=>window.__alpine.clips.map(c=>({id:c.name,duration:c.duration})));
  const results=[];
  await page.evaluate(()=>document.querySelectorAll('.badge,#status').forEach(el=>el.style.visibility='hidden'));
  for(const c of clips){
    await page.selectOption('#clip',c.id);await page.locator('#play').click();
    const hashes=[];
    for(const time of [0,c.duration*.5,c.duration]){
      await page.evaluate(({id,time})=>window.__alpine.seek(id,time),{id:c.id,time});
      hashes.push(createHash('sha256').update(await page.locator('#canvas').screenshot()).digest('hex'));
    }
    if(new Set(hashes).size<2)throw Error(`No visible animation: ${c.id}`);
    const times=Array.from({length:8},(_,i)=>Math.round(c.duration*i/7*30)/30);
    for(let i=0;i<8;i++){
      await page.evaluate(({id,time})=>{
        const p=window.__alpine;p.seek(id,time);p.view(id==='snowplow_brake'?'front':'three');
        p.scene.children.filter(o=>o.type==='GridHelper').forEach(o=>o.visible=false);
        const air=id.startsWith('air_');p.camera.position.set(...(air?[2.5,1.4,3.1]:id==='snowplow_brake'?[0,.9,2.8]:[2.0,1.05,2.35]));
        p.camera.lookAt(0,air?1.0:.55,0);p.render();
      },{id:c.id,time:times[i]});
      await page.locator('#canvas').screenshot({path:join(dir,`${c.id}-${i}.png`)});
    }
    results.push({...c,times,uniqueRenderedSamples:new Set(hashes).size});
  }
  await page.locator('[data-view="side"]').click();
  if(await page.evaluate(()=>window.__alpine.state.view)!=='side')throw Error('View control failed');
  await page.locator('#bones').check();if(!await page.evaluate(()=>window.__alpine.skeleton.visible))throw Error('Skeleton control failed');await page.locator('#bones').uncheck();
  await page.selectOption('#speed','0.5');if(await page.evaluate(()=>window.__alpine.state.speed)!==.5)throw Error('Speed control failed');
  await page.evaluate(()=>{window.__alpine.seek('snowplow_brake',1);window.__alpine.view('three');});
  await page.locator('#play').click();await page.waitForFunction(()=>window.__alpine.state.playing&&window.__alpine.state.time!==1,undefined,{timeout:5000});
  if(!await page.evaluate(()=>window.__alpine.state.playing))throw Error('Play control failed');await page.locator('#play').click();
  await page.locator('#scrub').evaluate(el=>{el.value='0.5';el.dispatchEvent(new Event('input',{bubbles:true}));});if(Math.abs(await page.evaluate(()=>window.__alpine.state.time)-.5)>.001)throw Error('Scrub control failed');
  const bounds=await page.locator('footer').boundingBox();if(!bounds||bounds.y+bounds.height>390)throw Error('Controls overflow 844x390');
  await page.evaluate(()=>{const p=window.__alpine;p.seek('snowplow_brake',1);p.view('three');p.scene.children.filter(o=>o.type==='GridHelper').forEach(o=>o.visible=true);});
  await page.evaluate(()=>document.querySelectorAll('.badge,#status').forEach(el=>el.style.visibility=''));
  await page.screenshot({path:join(dir,'preview.png')});
  await mkdir(join(root,'sheets'),{recursive:true});await mkdir(join(root,'verification'),{recursive:true});
  await writeFile(join(dir,'frames.json'),JSON.stringify(results));
  const python=String.raw`import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
frames=Path(sys.argv[1]);out=Path(sys.argv[2]);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12);sheets=[]
for clip in json.loads((frames/'frames.json').read_text()):
 sheet=Image.new('RGB',(576,286),'#102033');d=ImageDraw.Draw(sheet);d.text((8,4),clip['id']+'   /   v7 original skier   /   30 Hz',fill='#c8e2e9',font=font)
 for i,t in enumerate(clip['times']):
  im=Image.open(frames/(clip['id']+'-'+str(i)+'.png')).convert('RGB');w,h=im.size
  # Centered crop keeps the actor large enough for eight-frame review.
  cropw=min(w,round(h*144/114));im=im.crop(((w-cropw)//2,0,(w+cropw)//2,h)).resize((144,114),Image.Resampling.LANCZOS)
  x=(i%4)*144;y=26+(i//4)*130;sheet.paste(im,(x,y));d.text((x+5,y+114),f'{i+1:02} / {t:.2f}s',fill='#9edacb',font=font)
 sheets.append((clip['id'],sheet))
for quality in [24,20,16,12,8]:
 for id,sheet in sheets:sheet.save(out/'sheets'/(id+'.webp'),'WEBP',quality=quality,method=6)
 if sum((out/'sheets'/(id+'.webp')).stat().st_size for id,_ in sheets)<=40000:break
`;
  execFileSync('python3',['-c',python,dir,root]);
  const report={clipSha256:createHash('sha256').update(await readFile(join(root,'clips.glb'))).digest('hex'),viewport:[844,390],sheetDimensions:[576,286],sampleHz:30,browser:'Chromium / SwiftShader',clips:results.map(c=>({id:c.id,frames:8,times:c.times,uniqueSamples:c.uniqueRenderedSamples})),controls:['clip','play/pause','scrub','speed','front/side/three','skeleton'],consoleErrors:errors,failedRequests:failed,externalRequests:external,passed:clips.length===7&&!errors.length&&!failed.length&&!external.length};
  await writeFile(join(root,'verification','browser.json'),JSON.stringify(report));
  console.log(JSON.stringify(report));console.log('Review screenshot: '+join(dir,'preview.png'));if(!report.passed)throw Error('Browser QA failed');
}finally{await browser.close();}
