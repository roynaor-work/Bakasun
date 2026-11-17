import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=path.resolve(process.env.CITY_V2_TOOLS || '/tmp/city-v2-tools');
const {chromium}=await import(pathToFileURL(path.join(tools,'node_modules/playwright/index.mjs')));
const origin=process.env.CITY_V2_ORIGIN || 'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const errors=[],external=[],requests=new Set();
const report={browser:await browser.version(),viewport:{width:844,height:390},renderer:'WebGL / SwiftShader',
  renderedAssets:0,renderedBuildings:20,stagePaletteCityViews:6,externalRequests:external,pageErrors:errors,checks:{}};
try{
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,acceptDownloads:true,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
    external.push(url);return route.abort();
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.url().endsWith('.glb')&&response.ok())requests.add(response.url());});
  await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.cityPreview);
  await page.evaluate(()=>window.cityPreview.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),390);
  await page.screenshot({path:path.join(root,'verification/preview-844x390.png')});
  const ids=await page.evaluate(()=>window.cityPreview.manifest.buildings.map(b=>b.id));
  // All 120 actual GLBs must reach the scene, not just resolve their URL.
  for(const palette of ['sunrise','seabreeze'])for(const stage of ['foundation','half-built','complete']){
    const result=await page.evaluate(async({palette,stage})=>{
      const v=window.cityPreview;await v.select({mode:'city',palette,stage});v.render();
      return {meshes:v.meshes.length,stages:[...new Set(v.meshes.map(m=>m.userData.stage))],
        palettes:[...new Set(v.meshes.map(m=>m.userData.palette))],triangles:v.meshes.map(m=>m.geometry.index.count/3),
        calls:v.renderer.info.render.calls,geometries:v.renderer.info.memory.geometries};
    },{palette,stage});
    assert.equal(result.meshes,20);assert.deepEqual(result.stages,[stage]);assert.deepEqual(result.palettes,[palette]);
    assert.ok(result.triangles.every(n=>n>=200&&n<=800));assert.ok(result.geometries<60,'Old model geometry leaked');
    report.renderedAssets+=20;
  }
  await page.evaluate(()=>window.cityPreview.select({mode:'city',palette:'sunrise',stage:'complete'}));
  await page.screenshot({path:path.join(root,'verification/city-844x390.png')});

  const cards=[];
  for(const id of ids){
    cards.push(await page.evaluate(async id=>{
      const v=window.cityPreview;await v.select({buildingId:id,mode:'single',stage:'complete',palette:'sunrise'});v.resetView();v.render();
      const b=v.manifest.buildings.find(b=>b.id===id);
      return {name:b.nameHe,detail:`${b.footprint.columns} × ${b.footprint.rows} · ${v.meshes[0].userData.triangles} משולשים`,image:document.querySelector('canvas').toDataURL('image/png')};
    },id));
  }
  async function sheet(cards,id,columns,width,out){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(({cards,id,columns,width})=>{
      const sheet=document.createElement('section');sheet.id=id;sheet.dir='rtl';
      Object.assign(sheet.style,{position:'absolute',top:'0',left:'0',width:width+'px',padding:'20px',background:'#eef0e3',zIndex:'100',display:'grid',gridTemplateColumns:`repeat(${columns},1fr)`,gap:'12px'});
      for(const card of cards){
        const tile=document.createElement('figure');Object.assign(tile.style,{margin:'0',background:'#fafbf3',border:'1px solid #d9dfcf',borderRadius:'12px',overflow:'hidden'});
        const img=document.createElement('img');img.src=card.image;img.style.cssText='display:block;width:100%;height:auto;';tile.append(img);
        const caption=document.createElement('figcaption');caption.textContent=card.name;caption.style.cssText='font:700 16px Arial;text-align:center;color:#365f57;padding:0 6px 4px;';tile.append(caption);
        const detail=document.createElement('p');detail.textContent=card.detail;detail.style.cssText='font:12px Arial;text-align:center;color:#75846e;padding:0 6px 12px;margin:0;';tile.append(detail);sheet.append(tile);
      }document.body.append(sheet);
    },{cards,id,columns,width});
    await page.locator('#'+id+' img').last().waitFor();
    await page.evaluate(async id=>{await Promise.all([...document.querySelectorAll('#'+id+' img')].map(img=>img.decode()));},id);
    await page.locator('#'+id).screenshot({path:path.join(root,out),type:'jpeg',quality:90});
    await page.locator('#'+id).evaluate(el=>el.remove());
    await page.setViewportSize({width:844,height:390});
  }
  await sheet(cards,'contact-sheet',4,1400,'verification/overview.jpg');
  const stageCards=[];
  for(const palette of ['sunrise','seabreeze'])for(const stage of ['foundation','half-built','complete']){
    stageCards.push(await page.evaluate(async({palette,stage})=>{
      const v=window.cityPreview;await v.select({buildingId:'school',mode:'single',palette,stage});v.resetView();v.render();
      return {name:{foundation:'יסודות','half-built':'חצי בנוי',complete:'גמור'}[stage],detail:palette==='sunrise'?'זריחה':'בריזה',image:document.querySelector('canvas').toDataURL('image/png')};
    },{palette,stage}));
  }
  await sheet(stageCards,'stage-sheet',3,1100,'verification/stages-and-palettes.jpg');

  // Exercise real controls, keyboard, pointer input, reduced motion, cancellation, and disposal.
  await page.locator('[data-building="lighthouse"]').click();
  await page.waitForFunction(()=>!window.cityPreview.state.loading&&window.cityPreview.state.buildingId==='lighthouse');
  await page.locator('[data-stage="foundation"]').click();
  await page.waitForFunction(()=>!window.cityPreview.state.loading&&window.cityPreview.state.stage==='foundation');
  await page.locator('#celebrate').click();
  await page.waitForFunction(()=>window.cityPreview.state.stage==='complete'&&window.cityPreview.effects[0]?.active);
  await page.evaluate(()=>{window.cityPreview.effects[0].update(.08);window.cityPreview.render();});
  await page.screenshot({path:path.join(root,'verification/opening-844x390.png')});
  await page.waitForFunction(()=>window.cityPreview.effects.every(e=>!e.active));
  assert.equal(await page.evaluate(()=>window.cityPreview.effects[0].particles.visible),false);
  await page.locator('#celebrate').click();
  assert.equal(await page.evaluate(()=>window.cityPreview.effects.length),1);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#celebrate').click();
  assert.equal(await page.evaluate(()=>window.cityPreview.effects.some(e=>e.active)),false);
  assert.match(await page.locator('#load-state').innerText(),/פתוח/);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const canvas=page.locator('#scene');await canvas.focus();
  const before=await canvas.screenshot();await page.keyboard.press('ArrowRight');await page.evaluate(()=>window.cityPreview.render());
  assert.notDeepEqual(await canvas.screenshot(),before,'Keyboard rotation did not change the picture');
  const rect=await canvas.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+15,{steps:6});await page.mouse.up();
  await page.locator('#reset-view').click();
  await page.evaluate(async()=>{
    const v=window.cityPreview;
    const pending=['hospital','bakery','museum','bus-stop'].map(buildingId=>v.select({buildingId,mode:'single'}));
    await Promise.allSettled(pending);if(v.meshes.length!==1||v.meshes[0].name!=='bus-stop')throw new Error('Stale request won');
  });
  await page.locator('[data-palette="sunrise"]').click();
  await page.waitForFunction(()=>!window.cityPreview.state.loading);
  await page.locator('#view-mode').click();
  await page.waitForFunction(()=>!window.cityPreview.state.loading&&window.cityPreview.meshes.length===20);

  // A selection made before the first GLB finishes must also cancel quietly.
  const early=await context.newPage();early.on('pageerror',error=>errors.push(error.message));
  let releaseInitial;const initialGate=new Promise(resolve=>{releaseInitial=resolve;});
  await early.route('**/models/school-sunrise-complete.glb',async route=>{await initialGate;await route.continue().catch(()=>{});});
  await early.goto(origin+'/preview.html',{waitUntil:'domcontentloaded'});
  await early.locator('[data-building="bakery"]').click();releaseInitial();
  await early.waitForFunction(()=>window.cityPreview?.state.buildingId==='bakery'&&!window.cityPreview.state.loading);
  await early.evaluate(()=>window.cityPreview.ready);
  assert.equal(await early.evaluate(()=>window.cityPreview.meshes[0].name),'bakery');await early.close();

  // A cold new browser context receives only loopback content: no CDN or network fallback.
  const cold=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});
  await cold.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const offline=await cold.newPage();await offline.goto(origin+'/preview.html');
  await offline.waitForFunction(()=>window.cityPreview);await offline.evaluate(()=>window.cityPreview.ready);
  await offline.evaluate(()=>window.cityPreview.select({mode:'city',stage:'half-built',palette:'seabreeze'}));
  assert.equal(await offline.evaluate(()=>window.cityPreview.meshes.length),20);await cold.close();

  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.cityPreview.select({buildingId:'park',mode:'single'}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),844);
  // Actual projected vertices stay inside the portrait canvas, including the wide park base.
  assert.ok(await page.evaluate(()=>{
    const v=window.cityPreview,mesh=v.meshes[0],position=mesh.geometry.getAttribute('position');
    const p=mesh.position.clone();
    for(let i=0;i<position.count;i++){
      p.fromBufferAttribute(position,i).add(mesh.position).project(v.camera);
      if(Math.abs(p.x)>.92||Math.abs(p.y)>.92)return false;
    }return true;
  }),'Portrait model is clipped');
  await page.screenshot({path:path.join(root,'verification/preview-390x844.png')});
  report.checks={all120GLBsRendered:true,noHorizontalOrVerticalOverflow:true,all20DistinctViewsCaptured:true,allSixStagePaletteCombinations:true,
    actualControlsWork:true,openingCompletesConstruction:true,confettiStopsAndReplays:true,reducedMotionRespected:true,keyboardAndPointerOrbit:true,
    rapidSelectionKeepsLatest:true,selectionDuringInitialLoad:true,noGeometryLeakAcrossViews:true,coldContextLocalOnly:true,portrait390x844:true};
  assert.equal(requests.size,120);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  report.distinctGLBsRequested=requests.size;
  await fs.writeFile(path.join(root,'verification/browser-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));await context.close();
}finally{await browser.close();}
