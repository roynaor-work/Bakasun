#!/usr/bin/env node
/** Capture the actual local offline runtime at both requested phone sizes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import http from 'node:http';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const iteration=process.argv[2]||'01';
if(!/^\d{2}$/.test(iteration))throw Error('Expected a two-digit iteration');
const output=path.join(root,'iterations',iteration);
const dpr=Number(process.env.CAPTURE_DPR||(Number(iteration)>=13?1.5:1));
if(![1,1.5].includes(dpr))throw Error('Capture DPR must match an explicit production/reference setting');
const packageFiles=['vendor/data.js','vendor/viewer-runtime.js'];
const initialPackage=await Promise.all(packageFiles.map(p=>fs.readFile(path.join(root,p))));
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr});
const page=await context.newPage();
const errors=[],remoteRequests=[],localRequests=[];
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const local=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+local);
    if(!file.startsWith(root+path.sep))throw Error('Outside package');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
page.on('pageerror',e=>errors.push(String(e)));
page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))remoteRequests.push(r.url());else localRequests.push(r.url());});
await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort('blockedbyclient'));
const url=new URL(origin+'/preview.html?paused&clean');
const startedAt=new Date().toISOString();
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try{
  await page.goto(url.href,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});
  await page.evaluate(()=>soccerV7.ready);
  await page.evaluate(()=>soccerV7.setPlaying(false));
  if(process.env.CHARACTER_ID)await page.evaluate(id=>soccerV7.setCharacter(id),process.env.CHARACTER_ID);
  const states=[];
  for(const size of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    for(const view of ['face','body','cloth']){
      await page.evaluate(async view=>{await soccerV7.setView(view);soccerV7.setClip('idle');soccerV7.seek(.15);soccerV7.setOrbit(.13);},view);
      await settle();
      await page.screenshot({scale:'css',path:path.join(output,view+'-'+size.width+'x'+size.height+'.png')});
      states.push({view,size,state:await page.evaluate(()=>soccerV7.state())});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{await soccerV7.setView('face');soccerV7.setOrbit(-.7);});
  await settle();
  await page.screenshot({scale:'css',path:path.join(output,'face-profile-390x844.png')});
  await page.evaluate(async()=>{await soccerV7.setView('body');soccerV7.setClean(false);});
  await settle();
  await page.screenshot({scale:'css',path:path.join(output,'interface-390x844.png')});
  await page.setViewportSize({width:844,height:390});
  await settle();
  await page.screenshot({scale:'css',path:path.join(output,'interface-844x390.png')});
  const inputs={};
  for(const p of ['asset-manifest.json','animations.json','preview.js','preview.css','source/scene.js','source/character_build.py','source/character_atlas.py']){
    const b=await fs.readFile(path.join(root,p));inputs[p]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};
  }
  for(let i=0;i<packageFiles.length;i++)if(!(await fs.readFile(path.join(root,packageFiles[i]))).equals(initialPackage[i]))throw Error('Packed input changed during capture: '+packageFiles[i]);
  const loadedPackageHashes=await page.evaluate(()=>soccerV7.inspect().data.hashes||null);
  await fs.writeFile(path.join(output,'capture.json'),JSON.stringify({schemaVersion:1,iteration,startedAt,finishedAt:new Date().toISOString(),runtimeURL:'http://127.0.0.1:<ephemeral>/preview.html',offline:true,deviceScaleFactor:dpr,screenshotScale:'css',runtimeSha256:crypto.createHash('sha256').update(initialPackage[1]).digest('hex'),dataSha256:crypto.createHash('sha256').update(initialPackage[0]).digest('hex'),fileProtocolTest:'Blocked by managed Chromium administrator policy; actual test uses local classic scripts and embedded assets, with external HTTP blocked.',remoteRequests,localRequests:localRequests.map(u=>u.replace(origin,'<package>')),errors,states,loadedPackageHashes,inputs},null,2)+'\n');
  if(errors.length||remoteRequests.length)throw Error(JSON.stringify({errors,remoteRequests}));
  console.log(JSON.stringify({iteration,screenshots:9,errors,remoteRequests,states:states.map(s=>({view:s.view,size:s.size,models:s.state.models,triangles:s.state.triangles}))},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
