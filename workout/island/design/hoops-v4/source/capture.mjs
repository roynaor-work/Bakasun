#!/usr/bin/env node
// Exercise the actual local WebGL viewer and save reproducible visual evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..'),repo=path.resolve(root,'../../../..');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const sampleHz=Number(option('--sample-hz','120'));
if(!Number.isFinite(sampleHz)||sampleHz<30)throw Error('--sample-hz must be at least30');
const assetFiles=[...['pg','sg','sf','pf','c'].map(r=>`assets/players/${r}.glb`),'assets/arena.glb','assets/ball.glb','assets/hoop.glb'];
const inputFiles=[...assetFiles,'preview.html','preview.css','preview.mjs','assets/players/player-metadata.json',...['capture.mjs','validate.mjs','build_characters.py','character_animations.py','compress_characters.mjs','build_arena.py','compress_arena.mjs'].map(f=>'source/'+f)];
async function inputSnapshot(){return Promise.all(inputFiles.map(async file=>{const bytes=await fs.readFile(path.join(root,file));return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));}
const inputsBefore=await inputSnapshot();
const require=createRequire(path.resolve(option('--playwright','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')));
const {chromium}=require('playwright');
const out=path.join(root,'verification'),pictures=path.join(out,'previews');
await fs.mkdir(pictures,{recursive:true});
await fs.mkdir(path.join(root,'previews'),{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const p=path.resolve(repo,'.'+pathname);
  if(!p.startsWith(repo+path.sep)){res.writeHead(403);res.end();return;}
  const data=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]??'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const port=server.address().port,origin=`http://127.0.0.1:${port}`;
const url=origin+'/workout/island/design/hoops-v4/preview.html';
const browser=await chromium.launch({executablePath:option('--executable','/usr/bin/chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],requests=[],cases=[],screenshots=[],loadedAssets=new Set();
function watch(page){
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 page.on('requestfailed',r=>errors.push(`request failed ${r.url()} ${r.failure()?.errorText}`));
 page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);if(r.status()===200&&new URL(r.url()).pathname.endsWith('.glb'))loadedAssets.add(new URL(r.url()).pathname);});
}
const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();requests.push(u);return route.abort();});
async function open(size,capture=false){
 const page=await context.newPage();watch(page);if(size)await page.setViewportSize(size);
 await page.goto(url+(capture?'?capture=1':''),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__HOOPS_V4__?.ready,{timeout:120000});
 await page.evaluate(async()=>{await window.__HOOPS_V4__.ready;window.__HOOPS_V4__.setPlaying(false);window.__HOOPS_V4__.render();});
 return page;
}
async function call(page,method,...args){
 return page.evaluate(async({method,args})=>{const api=window.__HOOPS_V4__;const result=await api[method](...args);api.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return result;},{method,args});
}
async function diagnostic(page){return page.evaluate(()=>{const a=window.__HOOPS_V4__;return typeof a.diagnostics==='function'?a.diagnostics():a.diagnostics;});}
async function capture(page,name){
 const filename=name+'.png';await page.screenshot({path:path.join(pictures,filename)});
 const data=await fs.readFile(path.join(pictures,filename));screenshots.push({file:'previews/'+filename,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),viewport:page.viewportSize()});
}
let page;
try{
 page=await open(null,true);
 const animatedEnvelope=await page.evaluate(async(sampleHz)=>{
  const THREE=await import('/workout/island/vendor/three.module.js'),a=window.__HOOPS_V4__,results=[];
  a.setPlaying(false);
  for(const clip of ['dribble','shoot','steal','block','run']){
   a.selectClip(clip);
   for(const actor of a.actors){
    const duration=actor.action.getClip().duration,steps=Math.ceil(duration*sampleHz);
    let floorMinimum=Infinity,floorTime=0,maximumHeight=-Infinity;
    const snapshots=[];
    for(let i=0;i<=steps;i++){
     const t=Math.min(duration-1e-6,i/steps*duration);actor.mixer.setTime(t);actor.model.updateMatrixWorld(true);
     actor.model.traverse(n=>{if(n.isSkinnedMesh)n.computeBoundingBox();});
     const b=new THREE.Box3().setFromObject(actor.model);
     if(b.min.y<floorMinimum){floorMinimum=b.min.y;floorTime=t;}maximumHeight=Math.max(maximumHeight,b.max.y);
     if(i===0||i===steps){const pose=[];actor.model.traverse(n=>{if(n.isBone)pose.push({name:n.name,position:n.getWorldPosition(new THREE.Vector3()).toArray(),rotation:n.getWorldQuaternion(new THREE.Quaternion()).toArray()});});snapshots.push(pose);}
    }
    let maxBonePositionSeam=0,maxBoneRotationSeam=0;
    for(let i=0;i<snapshots[0].length;i++){
     const p=snapshots[0][i],q=snapshots[1][i];maxBonePositionSeam=Math.max(maxBonePositionSeam,new THREE.Vector3(...p.position).distanceTo(new THREE.Vector3(...q.position)));maxBoneRotationSeam=Math.max(maxBoneRotationSeam,new THREE.Quaternion(...p.rotation).angleTo(new THREE.Quaternion(...q.rotation)));
    }
    const loopExpected=clip==='dribble'||clip==='run';
    results.push({role:actor.role,clip,durationSeconds:duration,samples:steps+1,floorMinimumMeters:floorMinimum,floorMinimumTimeSeconds:floorTime,maximumVertexYMeters:maximumHeight,floorPass:floorMinimum>=-.01,loopExpected,loopPass:!loopExpected||(maxBonePositionSeam<=.001&&maxBoneRotationSeam<=.01),endToStartMaxBonePositionMeters:maxBonePositionSeam,endToStartMaxBoneRotationRadians:maxBoneRotationSeam});
   }
  }
  a.setTime(0);
  return {scope:`Every delivered athlete and required clip sampled at at least${sampleHz}Hz. Actual skinned-mesh bounding boxes are recomputed from deformed vertices after world-matrix updates. End-to-start compares world bones at0 and duration minus1microsecond; one-shot recovery differences are reported, not called loop failures.`,sampleHz,floorToleranceMeters:.01,loopPositionToleranceMeters:.001,loopRotationToleranceRadians:.01,results};
 },sampleHz);cases.push({name:'animatedEnvelope',pass:animatedEnvelope.results.every(r=>r.floorPass&&r.loopPass),metrics:animatedEnvelope});
 await fs.writeFile(path.join(out,'motion-validation.json'),JSON.stringify(cases.at(-1),null,2)+'\n');
 console.log('Animated floor:',JSON.stringify({pass:cases.at(-1).pass,minimum:Math.min(...animatedEnvelope.results.map(r=>r.floorMinimumMeters)),failures:animatedEnvelope.results.filter(r=>!r.floorPass)}));
 if(process.argv.includes('--motion-only')){if(!cases.at(-1).pass)process.exitCode=1;}else{
 await call(page,'setMode','lineup');await call(page,'selectClip','idle');await call(page,'setTime',0);await call(page,'setView','front');await call(page,'setTeam','home');
 await capture(page,'team-lineup');const lineup=await diagnostic(page);cases.push({name:'lineup',diagnostics:lineup});
 await fs.copyFile(path.join(pictures,'team-lineup.png'),path.join(root,'previews/lineup-front.png'));
 await call(page,'setTeam','away');await capture(page,'team-lineup-away');const away=await diagnostic(page);cases.push({name:'awayPalette',pass:JSON.stringify(lineup.assets?.map(a=>a.materials))!==JSON.stringify(away.assets?.map(a=>a.materials)),diagnostics:away});
 await call(page,'setTeam','home');
 await call(page,'setMode','arena');await capture(page,'arena');cases.push({name:'arena',diagnostics:await diagnostic(page)});
 await call(page,'setMode','props');
 for(const prop of ['ball','hoop']){await call(page,'selectProp',prop);await capture(page,'prop-'+prop);const d=await diagnostic(page);cases.push({name:'prop:'+prop,pass:d.props.some(p=>p.name===prop&&p.loaded&&p.visible),diagnostics:d});}
 await call(page,'setMode','individual');await call(page,'selectRole','pg');
 for(const role of ['pg','sg','sf','pf','c']){
  await call(page,'selectRole',role);await call(page,'selectClip','idle');
  for(const view of ['front','three-quarter','back']){await call(page,'setView',view);await capture(page,`${role}-${view}`);}
 }
 await call(page,'selectRole','sf');await call(page,'setView','three-quarter');
 for(const clip of ['dribble','shoot','steal','block','run']){
  await call(page,'selectClip',clip);
  const d=await diagnostic(page),duration=d.assets.find(a=>a.role==='sf').clips.find(c=>c.name===clip).duration;
  for(const [index,t] of [0,.33,.67].entries()){
   await call(page,'setTime',t*duration);await capture(page,`${clip}-${index}`);
  }
  const frameHashes=screenshots.filter(s=>s.file.startsWith('previews/'+clip+'-')).map(s=>s.sha256);
  cases.push({name:'clip:'+clip,pass:new Set(frameHashes).size===3,diagnostics:await diagnostic(page)});
 }

 const performanceSample=await page.evaluate(async()=>{
  const a=window.__HOOPS_V4__;a.setMode('lineup');a.selectClip('run');a.setPlaying(false);
  for(let i=0;i<20;i++){a.setTime(i/60);a.render();}
  const samples=[];for(let i=0;i<100;i++){const start=performance.now();a.setTime((i+20)/60);samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);return {scope:'Synchronous CPU time for setTime (animation sampling and one render submission); 100 samples after 20 warmup calls. Software rendering in Chromium; excludes display refresh and asynchronous GPU completion.',samplesMs:samples,meanMs:samples.reduce((a,b)=>a+b,0)/100,p95Ms:samples[94],maxMs:samples[99]};
 });cases.push({name:'cpuSubmission',metrics:performanceSample});
 await page.close();
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  page=await open(size,false);await call(page,'setMode','lineup');await capture(page,`viewer-${size.width}x${size.height}`);
  const layout=await page.evaluate(()=>{
   const w=innerWidth,h=innerHeight;
   return {horizontalOverflow:document.documentElement.scrollWidth>w+1,viewport:[w,h],visibleControls:[...document.querySelectorAll('button,select,input')].filter(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.visibility!=='hidden';}).map(n=>({tag:n.tagName,id:n.id,label:n.getAttribute('aria-label')||n.textContent.trim().slice(0,60),bounds:[n.getBoundingClientRect().x,n.getBoundingClientRect().y,n.getBoundingClientRect().width,n.getBoundingClientRect().height]}))};
  });
  cases.push({name:`mobile:${size.width}x${size.height}`,pass:!layout.horizontalOverflow,layout,diagnostics:await diagnostic(page)});
  await call(page,'setMode','individual');await call(page,'selectRole','c');await call(page,'selectClip','block');await call(page,'setTime',.5);await capture(page,`block-${size.width}x${size.height}`);
  // Real pointer/keyboard events exercise UI wiring separately from the capture API.
  await page.locator('[data-mode="individual"]').click();
  for(const role of ['pg','sg','sf','pf','c'])await page.locator(`[data-role="${role}"]`).click();
  await page.locator('[data-team="away"]').click();await page.locator('#clip').selectOption('shoot');
  await page.locator('#speed').selectOption('0.5');await page.locator('#time').fill('0.5');
  await page.locator('#time').dispatchEvent('input');await page.locator('[data-view="back"]').click();
  const ui=await page.evaluate(()=>({role:document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role,team:document.querySelector('[data-team][aria-pressed="true"]')?.dataset.team,clip:document.querySelector('#clip').value,speed:document.querySelector('#speed').value,time:document.querySelector('#time').value,view:document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view}));
  cases.push({name:`controls:${size.width}x${size.height}`,pass:ui.role==='c'&&ui.team==='away'&&ui.clip==='shoot'&&ui.speed==='0.5'&&ui.view==='back',ui,diagnostics:await diagnostic(page)});
  await page.close();
 }
 const convert=spawnSync('python',['-c',`from PIL import Image,ImageOps,ImageDraw\nfrom pathlib import Path\np=Path(${JSON.stringify(pictures)})\nfor f in p.glob('*.png'):\n im=Image.open(f).convert('RGB');im.save(f.with_suffix('.webp'),'WEBP',quality=88,method=6)\nfor group,names in [('roles',[f'{r}-front' for r in ['pg','sg','sf','pf','c']]),('actions',[f'{a}-{i}' for a in ['dribble','shoot','steal','block','run'] for i in range(3)])]:\n cols=5 if group=='roles' else 3;rows=(len(names)+cols-1)//cols;tw,th=480,300\n sheet=Image.new('RGB',(tw*cols,th*rows),(7,16,28));d=ImageDraw.Draw(sheet)\n for j,name in enumerate(names):\n  im=Image.open(p/(name+'.png')).convert('RGB');im.thumbnail((tw,th-26));x=(j%cols)*tw+(tw-im.width)//2;y=(j//cols)*th;sheet.paste(im,(x,y));d.text(((j%cols)*tw+14,y+th-22),name,fill=(229,236,244))\n sheet.save(p/(group+'-contact-sheet.webp'),'WEBP',quality=90,method=6)\n`],{encoding:'utf8'});
 if(convert.status!==0)errors.push('image conversion: '+convert.stderr);
 await fs.copyFile(path.join(pictures,'team-lineup.webp'),path.join(root,'previews/lineup-front.webp'));
 // Keep the requested full-resolution hero PNG; compact evidence uses WebP.
 for(const s of screenshots){const p=path.join(out,s.file.replace(/\.png$/,'.webp')),b=await fs.readFile(p);await fs.unlink(path.join(out,s.file));s.file=s.file.replace(/\.png$/,'.webp');s.bytes=b.length;s.sha256=createHash('sha256').update(b).digest('hex');}
 const sources=[];
 for(const dir of ['source','assets/players'])for(const name of await fs.readdir(path.join(root,dir))){if(!/\.(mjs|py|json)$/.test(name))continue;const f=path.join(root,dir,name),b=await fs.readFile(f);sources.push({file:dir+'/'+name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
 const inputsAfter=await inputSnapshot();
 cases.push({name:'inputIntegrity',pass:JSON.stringify(inputsBefore)===JSON.stringify(inputsAfter),inputsBefore,inputsAfter});
 cases.push({name:'allEightGLBLoads',pass:assetFiles.every(f=>loadedAssets.has('/workout/island/design/hoops-v4/'+f)),loadedPaths:[...loadedAssets].sort(),expectedFiles:assetFiles});
 const result={schemaVersion:1,scope:'Local actual GLB rendering using Chromium SwiftShader at DPR1; synthetic desktop/browser evidence, not physical phone GPU performance.',urlPath:'/workout/island/design/hoops-v4/preview.html',requestsOutsideLocalOrigin:requests,pageErrors:errors,cases,screenshots,sources,pass:errors.length===0&&requests.length===0&&cases.every(c=>c.pass!==false)};
 await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({pass:result.pass,errors,externalRequests:requests,screenshots:screenshots.length,cases:cases.length},null,2));
 if(!result.pass)process.exitCode=1;
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
