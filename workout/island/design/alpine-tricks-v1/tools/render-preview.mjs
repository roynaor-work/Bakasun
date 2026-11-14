// Independent browser playback evidence. Writes exclusively into this pack.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO=path.resolve(ROOT,'../../../..');
const require=createRequire('/tmp/alpine-tricks-tools/package.json');
const sharp=require('sharp');
const {chromium}=await import('/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const catalog=JSON.parse(await fs.readFile(path.join(ROOT,'catalog.json'),'utf8'));
await fs.access(path.join(ROOT,'alpine-tricks.glb'));
await fs.mkdir(path.join(ROOT,'sheets'),{recursive:true});await fs.mkdir(path.join(ROOT,'verification'),{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
const requests=[],errors=[];
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(REPO,'.'+pathname);
    if(!file.startsWith(REPO+path.sep))throw Error('outside repository');
    // Only the new asset package and existing local Three/Draco runtime are served.
    const vendor=path.join(REPO,'workout/island/vendor')+path.sep;
    if(!file.startsWith(ROOT+path.sep)&&!file.startsWith(vendor))throw Error('outside preview assets');
    res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));
  }catch(e){res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/workout/island/design/alpine-tricks-v1/preview.html';
const launch={headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
const executable=option('--chromium',process.env.PLAYWRIGHT_EXECUTABLE_PATH);if(executable)launch.executablePath=executable;
let browser;
const escapeXML=text=>String(text).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  browser=await chromium.launch(launch);
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
  await context.route('**/*',async route=>{if(!route.request().url().startsWith(origin+'/')){errors.push({type:'external-request',url:route.request().url()});await route.abort();}else await route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('console',msg=>{if(msg.type()==='error')errors.push({type:'console',message:msg.text()});});
  page.on('requestfailed',req=>errors.push({type:'requestfailed',url:req.url(),message:req.failure()?.errorText}));
  page.on('response',res=>{requests.push({url:res.url().slice(origin.length),status:res.status()});if(res.status()>=400)errors.push({type:'http',url:res.url(),status:res.status()});});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__alpinePreview?.ready===true,null,{timeout:90000});
  await page.evaluate(()=>window.__alpinePreview.setPlaying(false));
  const visibleClips=await page.locator('#clip-select option').count();if(visibleClips!==catalog.clips.length)throw Error('Viewer does not expose every catalog clip');
  await page.screenshot({path:path.join(ROOT,'verification/preview-844x390.png')});
  const controls=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],body:[document.body.scrollWidth,document.body.scrollHeight],canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],clipCount:document.querySelectorAll('#clip-select option').length}));
  if(controls.body[0]>844||controls.body[1]>390)throw Error('844x390 preview overflows the viewport');
  await page.locator('#play').click();await page.waitForTimeout(110);const played=await page.evaluate(()=>window.__alpinePreview.getState().time);if(played<=0)throw Error('Play button did not advance animation');
  await page.locator('#play').click();await page.locator('[data-speed="0.5"]').click();await page.locator('[data-view="side"]').click();
  const interactive=await page.evaluate(()=>window.__alpinePreview.getState());if(interactive.speed!==.5||interactive.view!=='side'||interactive.playing)throw Error('Playback controls failed');
  // Reuse the loaded actor when entering capture mode. Navigating away would
  // deliberately abort pending decoder/cache requests and pollute network QA.
  await page.evaluate(()=>{window.__alpinePreview.setPlaying(false);document.documentElement.classList.add('capture');window.__alpinePreview.setView('three-quarter');});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const clips=[];
  for(const clip of catalog.clips){
    const frames=[],tiles=[];await page.evaluate(id=>window.__alpinePreview.setClip(id),clip.id);
    for(let i=0;i<8;i++){
      const time=clip.durationSeconds*i/7;await page.evaluate(t=>window.__alpinePreview.seek(t),time);
      const screenshot=await page.screenshot(),frame=await sharp(screenshot).resize(422,195).png().toBuffer();
      const caption=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="422" height="25"><rect width="422" height="25" fill="#f6fafb"/><text x="12" y="17" font-family="Arial,sans-serif" font-size="11" fill="#526f79">${String(i+1).padStart(2,'0')} / 08 · ${time.toFixed(3)}s</text><text x="410" y="17" text-anchor="end" font-family="Arial,sans-serif" font-size="10" fill="#526f79">${escapeXML(clip.id)}</text></svg>`);
      const left=(i%4)*422,top=Math.floor(i/4)*220;tiles.push({input:frame,left,top},{input:caption,left,top:top+195});frames.push({index:i,timeSeconds:time,renderedSha256:sha(screenshot)});
    }
    const output=path.join(ROOT,clip.contactSheet??`sheets/${clip.id}.webp`);if(!output.startsWith(ROOT+path.sep))throw Error('Contact sheet output escaped package');
    const sheet=await sharp({create:{width:1688,height:440,channels:3,background:'#e2edf2'}}).composite(tiles).webp({quality:88}).toBuffer();await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,sheet);
    clips.push({id:clip.id,kind:clip.kind,contactSheet:path.relative(ROOT,output),sheetSha256:sha(sheet),frames});
    console.log(`${clip.id}: 8 frames → ${path.relative(ROOT,output)}`);
  }
  // Dedicated side evidence for equipment/landing/fall inspection.
  const evidence=[];
  for(const clip of catalog.clips.filter(c=>c.kind==='motion'&&/jump|180|360|land|fall|victory|celebrat/i.test(c.id))){
    await page.evaluate(({id,t})=>{window.__alpinePreview.setClip(id);window.__alpinePreview.setView('side');window.__alpinePreview.seek(t);},{id:clip.id,t:clip.durationSeconds*.5});
    const dest=`verification/side-${clip.id}.png`;await page.screenshot({path:path.join(ROOT,dest)});evidence.push(dest);
  }
  const report={schemaVersion:1,assetSha256:catalog.assetSha256,pass:errors.length===0,viewport:{width:844,height:390},framesPerClip:8,clipCount:clips.length,renderedFrames:clips.length*8,allClipsSelectable:visibleClips===catalog.clips.length,controls,interactive,externalRequests:errors.filter(e=>e.type==='external-request').length,errors,requests:[...new Map(requests.map(r=>[r.url,r])).values()],clips,evidence};
  await fs.writeFile(path.join(ROOT,'verification/browser-report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw Error(`Browser evidence failed: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({pass:true,clips:clips.length,frames:clips.length*8,viewport:'844x390'}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
