/** Browser verification. Tools stay outside the repository.
 * PREVIEW_TOOLS_DIR=/tmp/hoops-preview-tools node source/check-preview.mjs
 * Serve the repository root on port 8765 first. Override BASE_URL if needed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(process.env.PREVIEW_TOOLS_DIR||'/tmp/hoops-preview-tools','package.json'));
const {chromium}=require('playwright-core');
const base=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,'');
const url=base+'/workout/island/design/hoops-realism-v2/preview.html';
const output=path.join(root,'verification');await fs.mkdir(output,{recursive:true});
const checks=[],errors=[],requests=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let result;
try{
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()}: ${response.url()}`);});
  page.on('request',request=>requests.push(request.url()));
  page.on('requestfailed',request=>errors.push(`Request failed: ${request.url()}`));
  let releaseCatalog;
  const catalogGate=new Promise(resolve=>{releaseCatalog=resolve;});
  await page.route('**/crowd/catalog.json',async route=>{await catalogGate;await route.continue();});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__hoopsPreview&&!window.__hoopsPreview.ready);
  assert.equal(await page.locator('#clip').isDisabled(),true);
  assert.equal(await page.locator('#lod').isDisabled(),true);
  assert.equal(await page.locator('#play-sound').isDisabled(),true);
  const early=await page.evaluate(async()=>{
    __hoopsPreview.setClip('clap');
    await __hoopsPreview.setLOD(2);
    await __hoopsPreview.playSound('rim-hit-01');
    return __hoopsPreview.getState();
  });
  assert.equal(early.ready,false);assert.deepEqual(errors,[]);
  checks.push({name:'asset controls and public API are safe during delayed initial loading',pass:true});
  releaseCatalog();await page.waitForFunction(()=>window.__hoopsPreview?.ready,null,{timeout:60000});
  await page.evaluate(()=>{__hoopsPreview.setPaused(true);__hoopsPreview.render(.4);});
  const initial=await page.evaluate(()=>__hoopsPreview.getState());
  assert.equal(initial.players.length,4);assert.equal(initial.crowdLoaded,16);assert.equal(initial.loadedModels,20);
  checks.push({name:'initial local model loading',players:4,crowd:16,pass:true});
  // A slow response for an old selection must not overwrite a newer selection.
  let releaseLOD;
  const lodGate=new Promise(resolve=>{releaseLOD=resolve;});
  await page.route('**/*-lod1.glb',async route=>{await lodGate;await route.continue();});
  await page.evaluate(()=>{window.__pendingOldLOD=__hoopsPreview.setLOD(1);});
  await page.evaluate(()=>__hoopsPreview.setLOD(2));
  assert.equal((await page.evaluate(()=>__hoopsPreview.getState())).lod,2);
  releaseLOD();await page.evaluate(()=>window.__pendingOldLOD);
  assert.equal((await page.evaluate(()=>__hoopsPreview.getState())).lod,2);
  assert.equal(await page.locator('#lod').isDisabled(),false);
  checks.push({name:'newer LOD choice survives delayed completion of older request',pass:true});
  await page.evaluate(()=>__hoopsPreview.setLOD(0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'lineup-844x390.png')});
  const canvas=page.locator('#view');
  const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
  const paletteHashes=[];
  for(const team of ['mint','purple','blue']){
    await page.locator(`[data-team="${team}"]`).click();
    await page.evaluate(()=>__hoopsPreview.render(.4));
    paletteHashes.push(hash(await canvas.screenshot()));
  }
  assert.equal(new Set(paletteHashes).size,3);
  checks.push({name:'three team palettes change rendered uniforms',pass:true,canvasHashes:paletteHashes});
  await page.locator('[data-team="mint"]').click();
  await page.locator('[data-mode="crowd"]').click();
  const clips=['sit','stand','clap','jump','disappointed','shout'];
  for(const lod of [0,1,2]){
    await page.locator('#lod').selectOption(String(lod));
    await page.waitForFunction(level=>__hoopsPreview.getState().lod===level&&__hoopsPreview.getState().crowdLoaded===16,lod);
    for(const clip of clips){
      await page.locator('#clip').selectOption(clip);
      await page.evaluate(()=>__hoopsPreview.render(.4));
      const state=await page.evaluate(()=>__hoopsPreview.getState());
      assert.equal(state.clip,clip);assert.equal(state.lod,lod);assert.deepEqual(state.errors,[]);
      checks.push({name:'crowd clip/LOD render',clip,lod,pass:true});
    }
  }
  await page.evaluate(async()=>{await __hoopsPreview.setLOD(0);__hoopsPreview.setClip('stand');__hoopsPreview.render(.4);});
  await page.screenshot({path:path.join(output,'crowd-844x390.png')});
  await page.locator('[data-mode="closeup"]').click();
  await page.evaluate(()=>__hoopsPreview.render(.4));
  await page.screenshot({path:path.join(output,'face-844x390.png')});
  for(let i=0;i<4;i++){
    const state=await page.evaluate(i=>__hoopsPreview.selectPlayer(i),i);
    assert.equal(state.player,i);
  }
  checks.push({name:'all four player closeups selectable',pass:true});
  const audio=await page.evaluate(async()=>{
    const catalog=await (await fetch('./audio/catalog.json')).json();
    const context=new AudioContext(),rows=[];
    try{for(const asset of catalog.assets)for(const format of ['ogg','mp3']){
      const file=asset.files[format],response=await fetch(file.path);
      if(!response.ok)throw Error(`Audio HTTP ${response.status}: ${file.path}`);
      const pcm=await context.decodeAudioData(await response.arrayBuffer());
      rows.push({id:asset.id,format,channels:pcm.numberOfChannels,sampleRate:pcm.sampleRate,duration:pcm.duration});
    }}finally{await context.close();}return rows;
  });
  assert.equal(audio.length,14);assert(audio.every(row=>row.channels===1&&row.duration>.08&&row.duration<1));
  checks.push({name:'browser decodes every OGG and MP3',pass:true,files:audio});
  await page.locator('#sound').selectOption('rim-hit-01');
  await page.locator('#play-sound').click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-mode="lineup"]').click();
  await page.evaluate(()=>__hoopsPreview.render(.4));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'lineup-390x844.png')});
  checks.push({name:'portrait layout without horizontal overflow',pass:true,viewport:[390,844]});
  const remote=requests.filter(value=>!value.startsWith(base+'/')&&!value.startsWith('data:')&&!value.startsWith('blob:'));
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  checks.push({name:'no remote requests, console errors, missing files, or page errors',pass:true});
  result={pass:true,browser:await browser.version(),renderer:'Chromium headless / SwiftShader',targetViewport:[844,390],
    checks,errors,requests:[...new Set(requests)].sort(),finalState:await page.evaluate(()=>__hoopsPreview.getState()),
    limitation:'Software rendering is functional verification; this is not a physical-phone frame-rate measurement.'};
}catch(error){result={pass:false,checks,errors,failure:String(error.stack||error)};process.exitCode=1;}
finally{await browser.close();}
await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,checks:checks.length,errors,output},null,2));
if(!result.pass)console.error(result.failure);
