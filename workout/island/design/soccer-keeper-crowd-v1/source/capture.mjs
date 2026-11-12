// SPDX-License-Identifier: CC0-1.0. Render the actual skinned keeper, eight poses per requested clip.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const root=new URL('../',import.meta.url),url=process.env.KEEPER_PREVIEW_URL??'http://127.0.0.1:8765/workout/island/design/soccer-keeper-crowd-v1/preview.html';
await mkdir(new URL('sheets/',root),{recursive:true});
const browser=await chromium.launch({executablePath:process.env.KEEPER_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const results={url,engine:'Chromium + three.js r160, native GLTFLoader / AnimationMixer; no Draco or WebAssembly',viewports:[],sheets:[]},errors=[],requests=[];
try{
 const page=await browser.newPage({viewport:{width:1120,height:920},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>requests.push(r.url()));
 // A throwing WebAssembly constructor makes accidental decoding observable.
 await page.addInitScript(()=>{WebAssembly.instantiate=()=>{throw Error('WebAssembly forbidden in this preview');};WebAssembly.compile=()=>{throw Error('WebAssembly forbidden in this preview');};});
 await page.goto(url);await page.waitForFunction(()=>window.keeperPreview?.ready);await page.evaluate(()=>keeperPreview.pause());
 for(const[width,height]of[[844,390],[390,844]]){
  await page.setViewportSize({width,height});const checks=[];
  for(const id of['keeper_after_goal','disappointed','keeper_celebrate']){
   await page.evaluate(async id=>{await keeperPreview.select(id);keeperPreview.setTime(0);},id);
   for(const fraction of[0,.25,.5,.75,1]){checks.push(await page.evaluate(f=>{const c=keeperPreview.catalog.clips.find(c=>c.id===document.getElementById('clip').value);keeperPreview.setTime(c.duration*f);return {id:c.id,time:c.duration*f,bones:keeperPreview.matrices.length,finite:keeperPreview.matrices.every(b=>b.matrix.every(Number.isFinite))};},fraction));}
  }
  await page.evaluate(()=>keeperPreview.select('keeper_after_goal'));await page.evaluate(()=>keeperPreview.setTime(.9));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),pairs=await page.locator('.crowd-pair').count();
  if(overflow||pairs!==16||checks.some(c=>!c.finite||c.bones!==18))throw Error('Browser validation failed');
  await page.screenshot({path:fileURLToPath(new URL(`sheets/preview-${width}x${height}.png`,root)),fullPage:true});
  results.viewports.push({width,height,horizontalOverflow:overflow,crowdPairs:pairs,checks});
 }
 await page.setViewportSize({width:640,height:820});
 await page.addStyleTag({content:'#stage{width:320px;margin:auto}canvas{width:320px!important;height:340px!important}#time{display:none}'});
 const samples={keeper_after_goal:[0,.35,.65,.9,1.2,1.6,2.05,2.5],disappointed:[0,.37,.58,.73,1,1.315,1.63,2],keeper_celebrate:[0,.3,.5,.7,.9,1.05,1.35,1.8]};
 for(const[id,times]of Object.entries(samples)){
  await page.evaluate(async id=>{await keeperPreview.select(id);keeperPreview.setView('threeQuarter');keeperPreview.pause();},id);
  const layers=[];
  for(const[i,t]of times.entries()){
   await page.evaluate(t=>keeperPreview.setTime(t),t);
   const shot=await page.locator('canvas').screenshot(),x=i%4*320,y=Math.floor(i/4)*370;
   layers.push({input:shot,left:x,top:y});
   const caption=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="30"><rect width="320" height="30" fill="#14252c"/><text x="160" y="20" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#e6efdf">${i+1} / 8 · ${t.toFixed(2)} s</text></svg>`);
   layers.push({input:caption,left:x,top:y+340});
  }
  await sharp({create:{width:1280,height:740,channels:4,background:'#14252c'}}).composite(layers).png().toFile(fileURLToPath(new URL(`sheets/${id}.png`,root)));
  results.sheets.push({id,file:`sheets/${id}.png`,frames:8,times,width:1280,height:740,kind:'actual canonical keeper mesh, native serialized animation'});
 }
 const external=requests.filter(u=>!u.startsWith('data:')&&new URL(u).origin!==new URL(url).origin);
 if(errors.length||external.length||requests.some(u=>/\.wasm|draco/i.test(u)))throw Error(JSON.stringify({errors,external}));
 results.errors=errors;results.externalRequests=external;results.requestCount=requests.length;results.pass=true;
 await writeFile(new URL('qa/browser.json',root),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({pass:true,viewports:results.viewports.length,sheets:results.sheets.length}));
}finally{await browser.close();}
