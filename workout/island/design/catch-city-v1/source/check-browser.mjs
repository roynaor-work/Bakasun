// Self-contained HTTP preview check with native GLTFLoader / AnimationMixer.
// node source/check-browser.mjs --playwright /absolute/path/to/playwright/index.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=process.argv.indexOf('--playwright'),modulePath=process.argv[arg+1];
if(arg<0||!modulePath)throw Error('Pass --playwright /absolute/path/to/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(modulePath));
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname),p=path.resolve(root,'.'+requestPath);
    if(!p.startsWith(root+path.sep))throw Error('Out of scope');
    const data=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
  const externalRequests=[],failedRequests=[],errors=[],requests=[];
  await context.route('**/*',route=>{
    const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();
    externalRequests.push(url);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()}));
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
  await page.goto(base+'/preview.html');
  await page.waitForFunction(()=>window.__catchCity?.ready||window.__catchCity?.error,null,{timeout:30000});
  assert(await page.evaluate(()=>__catchCity.ready),'Preview failed to load');
  assert.equal(await page.evaluate(()=>__catchCity.loadedAssets),29);
  await page.evaluate(()=>{__catchCity.setPaused(true);__catchCity.setTime(.18);});
  const modes=[];
  await fs.mkdir(path.join(root,'verification'),{recursive:true});
  for(const mode of ['city','building','vehicle','pedestrian','street']){
    await page.locator(`[data-mode="${mode}"]`).click();
    await page.evaluate(()=>__catchCity.setTime(.18));
    await page.waitForTimeout(90);
    const state=await page.evaluate(()=>__catchCity.snapshot());assert.equal(state.mode,mode);assert(state.drawCalls>0&&state.triangles>0);
    assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
    modes.push(state);
    if(['city','building','pedestrian'].includes(mode))await page.screenshot({path:path.join(root,`verification/${mode}-844x390.png`)});
  }
  const ids=await page.evaluate(()=>__catchCity.manifest.assets.map(a=>a.id));
  for(const id of ids){
    await page.evaluate(id=>__catchCity.inspect(id),id);await page.evaluate(()=>__catchCity.setTime(.21));
    assert.equal(await page.evaluate(()=>__catchCity.selected),id);
    assert(await page.locator('#selection').isVisible());
    assert(await page.evaluate(()=>__catchCity.snapshot().triangles>0));
  }
  // Inspect navigation and actual canvas selection are exercised through UI.
  await page.evaluate(()=>__catchCity.setMode('building'));await page.evaluate(()=>__catchCity.inspect('house-coral'));
  await page.locator('#next').click();assert.equal(await page.evaluate(()=>__catchCity.selected),'shop-mint');
  await page.locator('#previous').click();assert.equal(await page.evaluate(()=>__catchCity.selected),'house-coral');
  await page.locator('#close').click();assert.equal(await page.evaluate(()=>__catchCity.selected),null);
  const clickPoint=await page.evaluate(()=>{
    // Aim at the center of the visible house; selection uses the actual raycaster.
    let mesh;__catchCity.scene.traverse(n=>{if(!mesh&&n.isMesh&&n.userData.assetId==='house-coral')mesh=n;});
    mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);__catchCity.camera.updateMatrixWorld();
    const p=mesh.geometry.boundingBox.getCenter(mesh.position.clone());
    mesh.localToWorld(p);p.project(__catchCity.camera);
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  });
  await page.mouse.click(clickPoint.x,clickPoint.y);
  assert.equal(await page.evaluate(()=>__catchCity.selected),'house-coral');await page.locator('#close').click();
  // Drag and wheel are independent of hit picking; test camera movement directly.
  const before=await page.evaluate(()=>__catchCity.camera.position.toArray());
  await page.mouse.move(360,230);await page.mouse.down();await page.mouse.move(405,245,{steps:5});await page.mouse.up();
  const after=await page.evaluate(()=>__catchCity.camera.position.toArray());assert.notDeepEqual(after,before);
  const topBefore=await page.evaluate(()=>__catchCity.camera.top);await page.mouse.wheel(0,-120);await page.waitForTimeout(90);
  assert(await page.evaluate(()=>__catchCity.camera.top)<topBefore);
  await page.locator('#reset').click();await page.locator('#city').focus();
  await page.keyboard.press('ArrowLeft');assert.notDeepEqual(await page.evaluate(()=>__catchCity.camera.position.toArray()),before);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__catchCity.selected),null);
  await page.locator('#pause').click();assert.equal(await page.evaluate(()=>__catchCity.paused),false);
  const t0=await page.evaluate(()=>__catchCity.snapshot().time);await page.waitForTimeout(180);
  assert(await page.evaluate(()=>__catchCity.snapshot().time)>t0);
  await page.locator('#pause').click();const t1=await page.evaluate(()=>__catchCity.snapshot().time);await page.waitForTimeout(90);
  assert.equal(await page.evaluate(()=>__catchCity.snapshot().time),t1);

  // Compare all 33 exported samples with real Three.js bone playback.
  const nativePlayback=[];
  for(const id of ids.filter(id=>id.startsWith('pedestrian-'))){
    const bytes=await fs.readFile(path.join(root,'models',id+'.glb'));
    const jsSize=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jsSize)),bin=bytes.subarray(28+jsSize);
    const read=index=>{const a=g.accessors[index],view=g.bufferViews[a.bufferView],n={VEC3:3,VEC4:4}[a.type];
      return Array.from({length:a.count*n},(_,i)=>bin.readFloatLE((view.byteOffset||0)+i*4));};
    const channels=g.animations[0].channels.map(c=>({name:g.nodes[c.target.node].name,path:c.target.path,values:read(g.animations[0].samplers[c.sampler].output)}));
    await page.evaluate(id=>__catchCity.inspect(id),id);
    const result=await page.evaluate(channels=>{
      let maxError=0;const bones=new Map();__catchCity.scene.traverse(n=>{if(n.isBone)bones.set(n.name,n);});
      for(let frame=0;frame<33;frame++){
        __catchCity.setTime(frame/30);
        for(const c of channels){const bone=bones.get(c.name),actual=(c.path==='rotation'?bone.quaternion:bone.position).toArray(),width=actual.length;
          actual.forEach((v,k)=>{maxError=Math.max(maxError,Math.abs(v-c.values[frame*width+k]));});}
      }return {bones:bones.size,frames:33,maxComponentError:maxError};
    },channels);
    assert.equal(result.bones,18);assert(result.maxComponentError<2e-6,JSON.stringify(result));nativePlayback.push({id,...result});
  }
  await page.evaluate(()=>{__catchCity.setMode('city');__catchCity.setTime(.18);});
  // Portrait is a layout/load smoke check; the delivery target is 844x390.
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth===390));
  await page.locator('[data-mode="pedestrian"]').click();
  assert.equal(await page.evaluate(()=>__catchCity.mode),'pedestrian');
  const reduced=await browser.newContext({viewport:{width:844,height:390},reducedMotion:'reduce'});
  const reducedPage=await reduced.newPage();await reducedPage.goto(base+'/preview.html');
  await reducedPage.waitForFunction(()=>__catchCity.ready);assert(await reducedPage.evaluate(()=>__catchCity.paused));await reduced.close();

  // Deterministic failure state: missing GLB produces a visible error.
  const failure=await browser.newContext({viewport:{width:844,height:390}});
  await failure.route('**/models/house-coral.glb',r=>r.fulfill({status:404,body:'missing'}));
  const failurePage=await failure.newPage();await failurePage.goto(base+'/preview.html');
  await failurePage.waitForFunction(()=>window.__catchCity?.error);assert(await failurePage.locator('#error').isVisible());await failure.close();

  assert.equal(externalRequests.length,0);assert.equal(failedRequests.length,0);assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(new Set(requests.filter(u=>u.endsWith('.glb'))).size,29);
  const report={pass:true,browser:await browser.version(),renderer:'Chromium ANGLE SwiftShader (software)',
    targetViewport:[844,390],additionalLayoutViewport:[390,844],loadedAssets:29,externalRequests,failedRequests,errors,
    selfContainedFolderServer:true,modes,inspectedAssets:ids.length,nativePlayback,
    controls:{categoryTabs:true,previousNext:true,close:true,canvasPicking:true,dragOrbit:true,wheelZoom:true,keyboardOrbit:true,reset:true,pauseResume:true},
    reducedMotionStartsPaused:true,missingAssetShowsError:true,
    screenshots:['city-844x390.png','building-844x390.png','pedestrian-844x390.png'],
    limits:'No physical phone or GPU timing claim. Portrait was checked for overflow and navigation, not full-scene framing.'};
  await fs.writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
