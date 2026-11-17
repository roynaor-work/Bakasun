// SPDX-License-Identifier: CC0-1.0
// Run from any directory. Requires Playwright and an installed Chromium.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
let playwright;
try{playwright=await import('playwright');}
catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const filename=path.resolve(repo,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!filename.startsWith(repo+path.sep))throw new Error('outside root');
    const body=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
const port=server.address().port;
const browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
const errors=[],failures=[],external=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>failures.push({url:request.url(),error:request.failure()?.errorText}));
page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${port}/`)&&!request.url().startsWith('data:'))external.push(request.url());});
const evidence=path.join(root,'verification');await mkdir(evidence,{recursive:true});
const shots=[];
try{
  await page.goto(`http://127.0.0.1:${port}/workout/island/design/city-citizens-v1/preview.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.cityPreview),{timeout:45000});
  await page.evaluate(async()=>{await window.cityPreview.ready;});
  const initial=await page.evaluate(()=>window.cityPreview.snapshot());
  assert.equal(initial.ready,true,'preview readiness');
  assert.equal(initial.loadedHumans,12,'loaded human identities');
  assert.equal(initial.loadedAnimals,6,'loaded animals');
  assert.deepEqual(initial.errors,[],'preview asset load errors');
  async function capture(name){await page.screenshot({path:path.join(evidence,name),type:'webp',quality:78});shots.push(name);}
  await capture('city-844x390.webp');
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  const humans=manifest.people||manifest.citizens||manifest.characters||manifest.humans;
  const animals=manifest.animals;
  assert.equal(humans.length,12);assert.equal(animals.length,6);
  const snapshots=[];
  function compact(s){return {selected:s.selected,clip:s.clip,variant:s.variant,mode:s.mode,errors:s.errors,ready:s.ready};}
  for(const person of humans){
    await page.evaluate(async id=>{await window.cityPreview.select(id);await window.cityPreview.setMode('focus');},person.id);
    for(const clip of ['idle','walk','wave','sit','talk','run']){
      await page.evaluate(async clip=>{await window.cityPreview.setClip(clip);},clip);
      const snapshot=await page.evaluate(()=>window.cityPreview.snapshot());
      assert.equal(snapshot.selected,person.id,'selected identity');
      assert.equal(snapshot.clip,clip,'selected clip');
      assert.deepEqual(snapshot.errors,[]);
      snapshots.push(compact(snapshot));
    }
    for(const variant of [0,1,2]){
      await page.evaluate(async v=>{await window.cityPreview.setVariant(v);},variant);
      assert.equal(await page.evaluate(()=>window.cityPreview.snapshot().variant),variant,'applied palette');
    }
  }
  await page.evaluate(async()=>{await window.cityPreview.setClip('wave');await window.cityPreview.setVariant(1);});
  await page.evaluate(()=>{window.cityPreview.setPlaying(false);window.cityPreview.seek(1.1);});
  await capture('wave-844x390.webp');
  await page.evaluate(async()=>{await window.cityPreview.setClip('sit');});
  await page.evaluate(()=>window.cityPreview.seek(2));
  await capture('sit-844x390.webp');
  for(const animal of animals){
    await page.evaluate(async id=>{await window.cityPreview.select(id);},animal.id);
    const snapshot=await page.evaluate(()=>window.cityPreview.snapshot());
    assert.equal(snapshot.selected,animal.id);assert.deepEqual(snapshot.errors,[]);
    snapshots.push(compact(snapshot));
  }
  await capture('animal-844x390.webp');
  await page.evaluate(async id=>{await window.cityPreview.select(id);await window.cityPreview.setClip('idle');await window.cityPreview.setMode('lineup');},humans[0].id);
  await capture('lineup-844x390.webp');
  const landscape=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvas:[...document.querySelectorAll('canvas')].map(x=>({width:x.width,height:x.height,visible:!!x.clientWidth}))}));
  assert.equal(landscape.scrollWidth,844,'landscape horizontal overflow');
  assert.equal(landscape.scrollHeight,390,'landscape vertical overflow');
  await page.setViewportSize({width:390,height:844});
  const portrait=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assert.equal(portrait.scrollWidth,390,'portrait horizontal overflow');
  await capture('portrait-390x844.webp');
  assert.deepEqual(errors,[],'browser exceptions');assert.deepEqual(failures,[],'failed requests');assert.deepEqual(external,[],'unexpected external requests');
  const inputs=[];
  for(const file of ['preview.html','preview.css','preview.mjs','manifest.json',...manifest.assets.map(a=>a.path||a.file)]){
    const data=await readFile(path.join(root,file));inputs.push({file,sha256:createHash('sha256').update(data).digest('hex')});
  }
  const report={passed:true,viewport:[844,390],inputs,initial,landscape,portrait,humansExercised:humans.length,humanClipSelections:humans.length*6,paletteSelections:humans.length*3,animalsExercised:animals.length,snapshots,errors,failures,external,shots,limitations:['Software WebGL in headless Chromium; physical phone performance has not been measured.']};
  await writeFile(path.join(evidence,'browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,humans:humans.length,clips:humans.length*6,animals:animals.length,shots}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
