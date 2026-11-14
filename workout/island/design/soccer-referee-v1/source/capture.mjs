// SPDX-License-Identifier: CC0-1.0
// Usage: node workout/island/design/soccer-referee-v1/source/capture.mjs [preview URL]
// Optional environment: PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const repositoryRoot=resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
const out=resolve(packageRoot,'verification');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png'};
let server;
let previewUrl=process.argv[2];
if(!previewUrl){
  server=createServer(async(request,response)=>{
    try{
      const path=resolve(repositoryRoot,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
      if(!path.startsWith(repositoryRoot+sep)||!(await stat(path)).isFile()){response.writeHead(404).end();return}
      response.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
      response.end(await readFile(path));
    }catch{response.writeHead(404).end()}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  previewUrl=`http://127.0.0.1:${server.address().port}/workout/island/design/soccer-referee-v1/preview.html`;
}
const executable=process.env.CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const page=await context.newPage();
const errors=[];
const requests=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`)});
page.on('requestfailed',request=>errors.push(`${request.failure()?.errorText} ${request.url()}`));
page.on('request',request=>requests.push(request.url()));
await context.addInitScript(()=>{
  // Explicitly reject any accidental compressed/WASM dependency during the browser check.
  for(const method of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[method]=()=>{throw new Error('Unexpected WebAssembly dependency')};
});
const result={viewport:{width:844,height:390},engine:'Chromium; local three.js r160, native GLTFLoader and AnimationMixer; WebAssembly disabled',files:{},samples:[],captures:[],interactions:[],errors,requests};
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
for(const file of ['preview.html','preview.css','preview.mjs','models/referee.glb','models/assistant-left.glb','models/assistant-right.glb']){
  const data=await readFile(resolve(packageRoot,file));result.files[file]={bytes:data.length,sha256:sha(data)};
}
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function sample(clip,time){
  const value=await page.evaluate(({clip,time})=>{
    const p=window.__refereePreview;p.select(clip);p.seek(time);
    return {clip,time:p.inspect().state.time,duration:p.inspect().state.duration,actors:p.actors.map(actor=>({name:actor.name,active:actor.action.getClip().name,finite:actor.model.getObjectsByProperty('isBone',true).every(bone=>bone.matrixWorld.elements.every(Number.isFinite)),bones:actor.model.getObjectsByProperty('isBone',true).length})),props:p.inspect().actors.map(a=>({name:a.name,props:a.props}))};
  },{clip,time});
  assert(value.actors.every(a=>a.finite&&a.bones===18),`${clip}@${time}: invalid skeleton`);
  return value;
}
async function capture(file,extra={}){
  await frame();
  await page.screenshot({path:resolve(out,file),type:'png'});
  const bytes=await readFile(resolve(out,file));
  const state=await page.evaluate(()=>window.__refereePreview.inspect().state);
  result.captures.push({file,width:(await page.viewportSize()).width,height:(await page.viewportSize()).height,bytes:bytes.length,sha256:sha(bytes),state,...extra});
}
async function tap(selector){
  const box=await page.locator(selector).boundingBox();assert(box,`Missing ${selector}`);
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await frame();
}
try{
  await page.goto(previewUrl,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__refereePreview?.ready,{timeout:30000});
  await page.evaluate(()=>window.__refereePreview.pause());
  result.initial=await page.evaluate(()=>window.__refereePreview.inspect());
  assert.equal(result.initial.actors.length,3);
  const clips=result.initial.clips;
  for(const clip of clips){
    const duration=await page.evaluate(name=>{window.__refereePreview.select(name);return window.__refereePreview.inspect().state.duration},clip);
    for(const ratio of [0,.25,.5,.75,1,0,.5])result.samples.push(await sample(clip,duration*ratio));
    const hold=clip.includes('card')?2.4:duration*.55;
    const value=await sample(clip,hold);
    if(clip==='yellow_card'||clip==='red_card'){
      const expected=clip==='yellow_card'?'YellowCard':'RedCard';
      const props=value.props.find(x=>x.name==='referee').props;
      assert(props.find(p=>p.name===expected)?.scale.every(n=>n>.9),`${expected} not visible`);
      assert(props.find(p=>p.name===(expected==='YellowCard'?'RedCard':'YellowCard'))?.scale.every(n=>n<.01),'Other card visible');
    }
    await capture(`844x390-${clip}.png`);
  }
  const runDuration=await page.evaluate(()=>{window.__refereePreview.select('assistant_run');return window.__refereePreview.inspect().state.duration});
  await sample('assistant_run',0);
  const travelStart=await page.evaluate(()=>window.__refereePreview.inspect().actors.map(a=>a.placement));
  await sample('assistant_run',runDuration);
  const travelEnd=await page.evaluate(()=>window.__refereePreview.inspect().actors.map(a=>a.placement));
  for(let i=1;i<3;i++)assert(Math.abs(travelEnd[i][2]-travelStart[i][2]-runDuration*1.15)<1e-6,'Assistant host travel mismatch');
  result.interactions.push({name:'assistant touchline world travel',metersPerSecond:1.15,duration:runDuration,start:travelStart,end:travelEnd,passed:true});
  // A real touch on the clip buttons, timeline, transport, color and context controls.
  await tap('[data-clip="whistle"]');
  assert.equal(await page.evaluate(()=>window.__refereePreview.inspect().state.clip),'whistle');
  const track=await page.locator('#seek').boundingBox();
  await page.touchscreen.tap(track.x+track.width*.25,track.y+track.height/2);await frame();
  const t1=await page.evaluate(()=>window.__refereePreview.inspect().state.time);
  await page.touchscreen.tap(track.x+track.width*.75,track.y+track.height/2);await frame();
  const t2=await page.evaluate(()=>window.__refereePreview.inspect().state.time);
  assert(t2>t1+.1,'Touch seek did not advance');
  await tap('#play');await page.waitForTimeout(150);
  const running=await page.evaluate(()=>window.__refereePreview.inspect().state);
  assert(running.playing,'Play touch failed');
  await tap('#play');const stopped=await page.evaluate(()=>window.__refereePreview.inspect().state);
  assert(!stopped.playing,'Pause touch failed');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__refereePreview.inspect().state.time),stopped.time);
  assert(await page.locator('#play-icon').isVisible(),'Paused transport icon is incorrect');
  result.interactions.push({name:'touch playback and scrub',before:t1,after:t2,running,stopped,passed:true});
  await tap('[data-shirt="black"]');
  const black=await page.evaluate(()=>window.__refereePreview.inspect().shirts);
  assert(black.length>0&&black.every(m=>m.color==='#20262d'),'Black shirt toggle failed');
  await sample('yellow_card',2.4);
  await capture('844x390-black-shirt.png');
  await tap('[data-shirt="yellow"]');
  assert((await page.evaluate(()=>window.__refereePreview.inspect().shirts)).every(m=>m.color!=='#20262d'),'Yellow shirt restore failed');
  await tap('#context');
  const match=await page.evaluate(()=>window.__refereePreview.inspect());
  assert(match.state.context&&match.contextPlayers===22,'11v11 context toggle failed');
  await capture('844x390-11v11.png');
  await tap('#context');
  result.interactions.push({name:'touch shirt yellow/black and 11v11 context',shirts:black,contextPlayers:match.contextPlayers,passed:true});
  await page.evaluate(()=>window.__refereePreview.setView('threeQuarter'));
  await sample('whistle',1.4);
  await capture('844x390-whistle-angle.png');
  await sample('yellow_card',2.4);
  await capture('844x390-card-angle.png');
  // Close views use the same GLB transform and camera; the standard scene remains unchanged.
  for(const [clip,time,file] of [['whistle',1.4,'detail-whistle.png'],['yellow_card',2.4,'detail-yellow-card.png']]){
    await sample(clip,time);
    const cameraState=await page.evaluate(()=>{
      const {camera}=window.__refereePreview;const before={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,position:camera.position.toArray(),quaternion:camera.quaternion.toArray()};
      camera.left=-1.35;camera.right=1.35;camera.top=.66;camera.bottom=-.66;camera.position.set(2,2.8,8);camera.lookAt(-.07,1.85,.9);camera.updateProjectionMatrix();return before;
    });
    await capture(file,{purpose:'GLB prop placement detail'});
    await page.evaluate(before=>{const {camera}=window.__refereePreview;camera.left=before.left;camera.right=before.right;camera.top=before.top;camera.bottom=before.bottom;camera.position.fromArray(before.position);camera.quaternion.fromArray(before.quaternion);camera.updateProjectionMatrix()},cameraState);
  }
  await page.evaluate(()=>window.__refereePreview.setView('front'));
  await page.setViewportSize({width:390,height:844});
  await sample('yellow_card',2.4);
  await capture('390x844-yellow-card.png');
  const portrait=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('[data-clip]')].map(x=>({clip:x.dataset.clip,visible:x.getBoundingClientRect().bottom<=innerHeight}))}));
  assert.equal(portrait.scrollWidth,390,'Portrait horizontal overflow');
  assert(portrait.controls.every(x=>x.visible),'Portrait clips not visible');
  result.portrait=portrait;
  const reducedPage=await context.newPage();
  reducedPage.on('pageerror',error=>errors.push(String(error)));
  reducedPage.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`)});
  reducedPage.on('requestfailed',request=>errors.push(`${request.failure()?.errorText} ${request.url()}`));
  reducedPage.on('request',request=>requests.push(request.url()));
  await reducedPage.emulateMedia({reducedMotion:'reduce'});
  await reducedPage.goto(previewUrl,{waitUntil:'networkidle'});
  await reducedPage.waitForFunction(()=>window.__refereePreview?.ready,{timeout:30000});
  const reduced=await reducedPage.evaluate(()=>window.__refereePreview.inspect().state);
  assert(!reduced.playing,'Reduced-motion autoplay should pause');
  result.interactions.push({name:'prefers-reduced-motion',state:reduced,passed:true});
  result.externalRequests=requests.filter(url=>new URL(url).origin!==new URL(previewUrl).origin);
  assert.equal(result.externalRequests.length,0,'Unexpected external browser request');
  assert.equal(errors.length,0,'Browser errors');
  result.passed=true;
} catch(error){
  result.passed=false;result.failure=String(error.stack||error);
  throw error;
} finally{
  await writeFile(resolve(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
  await browser.close();
  await new Promise(done=>server?server.close(done):done());
}
console.log(JSON.stringify({passed:result.passed,samples:result.samples.length,captures:result.captures.length,errors:errors.length,externalRequests:result.externalRequests?.length}));
