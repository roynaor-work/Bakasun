#!/usr/bin/env node
/** Capture actual decoded GLB poses: 8 frames per clip, local Chromium only.
 * node workout/island/design/hoops-technique-v1/source/capture.mjs
 * Optional --modules /tmp/hoops-technique-tools --only shot_jump
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(path.resolve(arg('--modules','/tmp/hoops-technique-tools'),'package.json'));
const {chromium}=require('playwright');
const sharp=require('sharp');
const only=arg('--only',null);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.md':'text/plain'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    const file=path.resolve(directory,'.'+pathname);
    if(file!==directory&&!file.startsWith(directory+path.sep)){res.writeHead(403).end();return;}
    const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:arg('--executable','/usr/bin/chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
page.setDefaultTimeout(120000);
const errors=[],externalRequests=[],failedRequests=[],captures=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();externalRequests.push(url);return route.abort();});
const escape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputHashes=[];
async function recordInput(file){const bytes=await fs.readFile(path.join(directory,file));inputHashes.push({file,bytes:bytes.length,sha256:sha(bytes)});}
try{
  await fs.mkdir(path.join(directory,'contact-sheets'),{recursive:true});
  await fs.mkdir(path.join(directory,'verification'),{recursive:true});
  await page.goto(origin+'/preview.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__preview);
  await page.evaluate(()=>window.__preview.ready);
  const catalog=await page.evaluate(()=>window.__preview.catalog);
  await recordInput('catalog.json');
  for(const file of ['preview.html','source/preview.mjs','source/capture.mjs','vendor/three.module.js','vendor/GLTFLoader.js','vendor/DRACOLoader.js','vendor/meshopt_decoder.module.js'])await recordInput(file);
  for(const file of [...new Set(catalog.clips.flatMap(clip=>[clip.glb||catalog.glb||'models/athlete.glb',clip.contacts].filter(Boolean)))])await recordInput(file);
  const clips=only?catalog.clips.filter(c=>c.id===only):catalog.clips;
  if(!clips.length)throw Error('No matching clips');
  const first=clips.find(c=>c.id==='shot_jump')||clips[0];
  await page.evaluate(async id=>{await window.__preview.select(id);const clip=window.__preview.currentClip;window.__preview.seek((clip.duration??clip.durationSeconds)*.39);},first.id);
  await page.screenshot({path:path.join(directory,'preview844x390.png'),timeout:120000});
  const layout=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],clips:document.querySelectorAll('.clip-item').length,canvas:[window.__preview.renderer.domElement.width,window.__preview.renderer.domElement.height],title:document.getElementById('clip-title').textContent}));
  checks.push({name:'844x390 layout fits viewport',pass:layout.scroll[0]<=844&&layout.scroll[1]<=390,actual:layout});
  await page.locator('[data-view="side"]').click();
  await page.locator('[data-view="front"]').click();
  await page.locator('[data-view="three-quarter"]').click();
  await page.locator('#speed').selectOption('0.5');
  await page.locator('#play').click();
  const playing=await page.locator('#play').getAttribute('aria-pressed');
  await page.locator('#play').click();
  checks.push({name:'play pause and camera controls',pass:playing==='true'&&(await page.locator('#play').getAttribute('aria-pressed'))==='false'});
  await page.locator('#speed').selectOption('1');
  if(catalog.bridges?.length){
    const chosen=[catalog.bridges[0],catalog.bridges.at(-1)];
    for(const bridge of chosen){await page.locator('#bridge').selectOption(bridge.id);await page.waitForFunction(id=>window.__preview.currentClip.id===id,bridge.id);await page.evaluate(()=>{window.__preview.seek(window.__preview.currentClip.duration*.5);});}
    const bridgeState=await page.evaluate(()=>({id:window.__preview.currentClip.id,finite:window.__preview.root.getObjectByName('Head').getWorldPosition(new window.__preview.THREE.Vector3()).toArray().every(Number.isFinite)}));
    checks.push({name:'standing and running bridge selection renders actual GLB',pass:bridgeState.id===chosen.at(-1).id&&bridgeState.finite,actual:bridgeState});
  }
  // Contact sheets use the same viewer and GLB, with only its editor chrome
  // removed. A portrait stage gives the athlete useful per-frame resolution.
  await page.addStyleTag({content:'.app{display:block!important;height:100vh!important;min-height:0!important}.top,.sidebar,.transport,.overlay-title,.view-controls,.contact-key,.phase-pill{display:none!important}.workspace,.stage{display:block!important;width:100vw!important;height:100vh!important}.stage canvas{width:100%!important;height:100%!important}'});
  await page.setViewportSize({width:360,height:420});
  await page.evaluate(()=>window.__preview.resize());
  for(const clip of clips){
    await page.evaluate(id=>window.__preview.select(id),clip.id);
    const duration=Number(clip.duration??clip.durationSeconds),last=Math.round(duration*30);
    const eventFrame=e=>e.frame??Math.round((e.time??e.timeSeconds??0)*30);
    const findFrame=regex=>{const event=(clip.events||[]).find(e=>regex.test(e.type||''));return event?eventFrame(event):null;};
    const release=findFrame(/release/),load=findFrame(/load|max_bend|compression/),gather=findFrame(/gather|catch/),guide=findFrame(/guide|separation/),follow=findFrame(/follow/),land=findFrame(/landing|^land$/);
    const suggested=[0,load??Math.round(.15*last),gather??Math.round(.3*last),guide??(release!==null?release-1:Math.round(.42*last)),release??Math.round(.52*last),follow??(release!==null?release+4:Math.round(.65*last)),land??Math.round(.82*last),last];
    const frames=(clip.sheetFrames||clip.contactSheetFrames||suggested).slice(0,8).map(f=>Math.max(0,Math.min(last,f)));
    const unique=[...new Set(frames)];
    // Fill duplicate semantic events with the largest uncovered time gap.
    while(unique.length<8){unique.sort((a,b)=>a-b);let gap=-1,next=-1;for(let i=1;i<unique.length;i++){const width=unique[i]-unique[i-1];if(width>gap){gap=width;next=Math.round((unique[i]+unique[i-1])/2);}}if(next<0||unique.includes(next))break;unique.push(next);}
    unique.sort((a,b)=>a-b);
    if(unique.length!==8)throw Error(`${clip.id}: cannot select eight distinct frames`);
    const layers=[];const recorded=[];
    for(let i=0;i<8;i++){
      const frame=unique[i],time=frame/30;
      await page.evaluate(t=>window.__preview.seek(t),time);
      const bytes=await page.locator('canvas').screenshot({timeout:120000});
      const normalized=await sharp(bytes).resize(360,420).png().toBuffer();
      const x=(i%4)*360,y=Math.floor(i/4)*454;
      layers.push({input:normalized,left:x,top:y+34});
      const near=(clip.events||[]).find(e=>(e.frame??Math.round((e.time??e.timeSeconds??0)*30))===frame);
      const label=`${String(frame).padStart(3,'0')}  /  ${time.toFixed(2)} s${near?'  ·  '+String(near.type).replaceAll('_',' '):''}`;
      const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="34"><rect width="360" height="34" fill="#18231c"/><text x="13" y="22" fill="#e5ebdc" font-family="Arial,sans-serif" font-size="12">${escape(label)}</text></svg>`);
      layers.push({input:svg,left:x,top:y});recorded.push({frame,timeSeconds:time});
    }
    const file=`contact-sheets/${clip.id}.webp`;
    const output=await sharp({create:{width:1440,height:908,channels:3,background:'#18231c'}}).composite(layers).webp({quality:87}).toBuffer();
    await fs.writeFile(path.join(directory,file),output);
    captures.push({id:clip.id,file,frameCount:8,frames:recorded,bytes:output.length,sha256:sha(output)});
    console.log(JSON.stringify({id:clip.id,frames:8,bytes:output.length}));
  }
  checks.push({name:'all requested clips have eight actual rendered frames',pass:captures.length===clips.length&&captures.every(c=>c.frameCount===8),actual:captures.length});
  checks.push({name:'local assets only and no browser errors',pass:!errors.length&&!externalRequests.length&&!failedRequests.length,errors,externalRequests,failedRequests});
  const changedDuringCapture=[];for(const input of inputHashes){const bytes=await fs.readFile(path.join(directory,input.file));if(sha(bytes)!==input.sha256)changedDuringCapture.push(input.file);}
  checks.push({name:'input assets remained unchanged during capture',pass:!changedDuringCapture.length,changedDuringCapture});
  const report={schemaVersion:1,kind:'actual-glb-preview-capture',generatedAtUTC:new Date().toISOString(),viewport:[844,390],renderer:'Chromium ANGLE SwiftShader; AnimationMixer GLB playback',inputHashes,checks,captures,pass:checks.every(c=>c.pass)};
  await fs.writeFile(path.join(directory,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  if(!report.pass)throw Error('Preview verification failed; see verification/browser.json');
  console.log(JSON.stringify({pass:report.pass,clips:captures.length,frames:captures.length*8}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
