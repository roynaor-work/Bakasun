// SPDX-License-Identifier: CC0-1.0
// Render actual GLB animation frames in Chromium, with WASM deliberately blocked.
import fs from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=new URL('../',import.meta.url),out=new URL('verification/',base);
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base)));
await fs.mkdir(new URL('sheets/',out),{recursive:true});
const temp=mkdtempSync(`${tmpdir()}/soccer-clips-v13-frames-`);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[],requests=[];
await page.addInitScript(()=>{
  for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw new Error('WASM disabled for asset verification');};
});
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>requests.push(r.url()));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.goto(process.env.SOCCER_CLIPS_PREVIEW_URL??'http://127.0.0.1:8765/workout/island/design/soccer-clips-v13/preview.html');
await page.waitForFunction(()=>window.soccerClips?.ready());
const captures=[];
for(const clip of catalog.clips){
  await page.evaluate(id=>window.soccerClips.select(id),clip.id);
  await page.evaluate(()=>window.soccerClips.view('three'));
  const times=Array.from({length:8},(_,i)=>Math.round(clip.duration*30*i/7)/30);
  const hit=clip.events.find(e=>['contact','release','receive','celebrate'].includes(e.type));
  if(hit){let best=1;for(let i=2;i<7;i++)if(Math.abs(times[i]-hit.time)<Math.abs(times[best]-hit.time))best=i;times[best]=hit.time;}
  times.sort((a,b)=>a-b);
  for(let i=0;i<times.length;i++){
    await page.evaluate(t=>{window.soccerClips.seek(t);window.soccerClips.render();},times[i]);
    await page.locator('#stage').screenshot({path:`${temp}/${clip.id}-${i}.png`});
  }
  captures.push({id:clip.id,times,frames:8,path:`sheets/${clip.id}.png`});
}
await fs.writeFile(`${temp}/captures.json`,JSON.stringify(captures));
const compose=spawnSync(process.env.PYTHON??'python3',[fileURLToPath(new URL('compose-sheets.py',import.meta.url)),temp,fileURLToPath(new URL('sheets/',out))],{encoding:'utf8'});
if(compose.status!==0)throw new Error(`Sheet composition: ${compose.stderr}`);
await page.screenshot({path:fileURLToPath(new URL('preview-desktop.png',out)),fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:fileURLToPath(new URL('preview-mobile.png',out)),fullPage:true});
const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
const wasmRequests=requests.filter(url=>/\.wasm|draco/i.test(url));
const evidence={clipsLoaded:catalog.clips.map(c=>c.id),captures,viewports:[{width:1400,height:1000},{width:390,height:844}],errors,mobileOverflow,webAssemblyBlocked:true,wasmRequests,networkOrigins:[...new Set(requests.map(url=>new URL(url).origin))],passed:!errors.length&&!mobileOverflow&&!wasmRequests.length};
await fs.writeFile(new URL('browser.json',out),JSON.stringify(evidence,null,2)+'\n');
await browser.close();
console.log(JSON.stringify(evidence,null,2));
if(!evidence.passed)process.exitCode=1;
