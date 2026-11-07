/** Original CC0-1.0. Browser loading, strict no-WASM execution and review evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.HOOPS_TALL_TOOLS||'/tmp/hoops-tall-tools','package.json'));
const {chromium}=require('playwright');
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(base,'verification');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const url=process.env.PREVIEW_URL||'http://127.0.0.1:8765/workout/island/design/hoops-tall-v1/preview.html';
const errors=[],failures=[],external=[],wasmRequests=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(url).origin)external.push(r.url());if(/\.wasm(?:$|\?)/.test(r.url()))wasmRequests.push(r.url());});
  // CSP has no wasm-unsafe-eval. Remove the API too, so an accidental decoder
  // dependency cannot silently pass this verification.
  await page.addInitScript(()=>Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:false}));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__tallPreview?.ready,null,{timeout:60000});
  await page.evaluate(()=>window.__tallPreview.pause());
  const rows=await page.evaluate(()=>window.__tallPreview.catalog);
  const samples=[];
  for(const row of rows){
    samples.push(await page.evaluate(async row=>{
      const api=window.__tallPreview;await api.selectClip(row.library,row.id);api.pause();
      const results=[];
      for(const time of [0,.25,.5,.5694444444,.75,1]){
        api.setTime(time);
        results.push({time,actors:api.actors.map(a=>{
          const q=Object.values(a.bones).flatMap(b=>b.quaternion.toArray());
          return {id:a.profile.id,finite:q.every(Number.isFinite),boneCount:Object.keys(a.bones).length};
        })});
      }
      return {library:row.library,id:row.id,frames:results};
    },row));
  }
  const critical=[['dribble_forward','כדרור'],['layup_right','צעד וחצי'],['dunk_one_hand','הטבעה ביד אחת'],['dunk_two_hands','הטבעה בשתי ידיים'],['defensive_stance','הגנה'],['rebound_jump','ריבאונד']];
  for(const [id] of critical){
    await page.evaluate(async id=>{const a=window.__tallPreview;await a.selectClip('v9',id);a.pause();a.setTime(a.metrics[0].peakTime);},id);
    await page.locator('#stage').screenshot({path:path.join(out,`${id}.png`)});
  }
  await page.evaluate(async()=>{const a=window.__tallPreview;await a.selectClip('v9','dunk_two_hands');a.pause();a.setTime(a.metrics[0].peakTime);});
  await page.screenshot({path:path.join(out,'preview-desktop.png'),fullPage:true});
  const calibrated=await page.evaluate(()=>window.__tallPreview.metrics);
  await page.evaluate(()=>window.__tallPreview.setSourceJump(true));
  const source=await page.evaluate(()=>window.__tallPreview.metrics);
  await page.locator('#stage').screenshot({path:path.join(out,'dunk-source-comparison.png')});
  await page.evaluate(()=>{window.__tallPreview.setSourceJump(false);window.__tallPreview.setColorway(1);});
  await page.locator('#stage').screenshot({path:path.join(out,'dunk-ember.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'preview-mobile.png'),fullPage:true});
  const mobile=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,webAssemblyAvailable:typeof WebAssembly!=='undefined'}));
  const pass=!errors.length&&!failures.length&&!external.length&&!wasmRequests.length&&mobile.documentWidth<=mobile.viewport&&samples.every(c=>c.frames.every(f=>f.actors.length===3&&f.actors.every(a=>a.finite&&a.boneCount===18)))&&calibrated.every(m=>m.pass)&&source.every(m=>m.peakHipsLift>1.54);
  const result={pass,engine:await browser.version(),viewport:{desktop:[1440,1100],mobile:[390,844]},clipCount:rows.length,actorClipLoads:rows.length*3,poseSamples:samples.length*6*3,noWASM:true,errors,failures,externalRequests:external,wasmRequests,mobile,calibrated,source,samples};
  await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({pass,clipCount:rows.length,actorClipLoads:rows.length*3,errors,failures,mobile}));
  if(!pass)process.exitCode=1;
} finally {await browser.close();}
