import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// Shared cold-city ceiling: navigation, scripts, avatar, buildings and both GLBs.
const {ui:{downloadBudget}}=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8'));
const cityDownloadBudgetBytes=downloadBudget.city;
const viewports=process.env.TASK017_WIDTH?[[Number(process.env.TASK017_WIDTH),Number(process.env.TASK017_HEIGHT)||390]]:[[390,844],[844,390]];
if(['diagnostics','profile'].includes(process.env.TASK017_PHASE)){
 await diagnosePilot();
}else if(process.env.TASK017_PHASE){
 await measurePilot();
}else{
const out=fileURLToPath(new URL('../verification/task017/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[],assets={car:'car-a-512.glb',walker:'adult-man-rigged-512.glb'};
try{for(const [width,height] of viewports)for(const failure of ['none','car','walker','both']){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[],outside=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);for(const name of Object.values(assets))if(u.pathname.endsWith('/'+name))requests.push(name);});
 // Successful HTTP with malformed GLB tests parse failure without introducing
 // the browser's own expected 404 console diagnostic.
 if(failure!=='none')await page.route(/\/(car-a|adult-man-rigged)-512\.glb/,route=>{
  const broken=failure==='both'||route.request().url().includes(assets[failure]);
  return broken?route.fulfill({status:200,contentType:'model/gltf-binary',body:'intentional invalid GLB'}):route.continue();
 });
 try{
  await page.goto(process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').tap();
  const result=await page.evaluate(async()=>{
   const T=await import('../island/vendor/three.module.js'),{view,engine,data}=window.__island;
   await Promise.all([view.modelsReady,view.pilotReady]);engine.skipTutorial();data.featureFlags.events=false;view.paused=true;
   engine.state.buildings=[{id:'pilot-home',typeId:'house',level:1,x:4,z:6},{id:'pilot-shop',typeId:'shop',level:1,x:7,z:6},{id:'pilot-hospital',typeId:'hospital',level:1,x:10,z:6},...Array.from({length:9},(_,i)=>({id:'pilot-road-'+i,typeId:'road',level:1,x:3+i,z:5}))];
   view.setWorld(engine.state,true);view.home();view.renderer.render(view.scene,view.camera);
   const {pilot}=view,result={metrics:view.metrics(),car:pilot.car&&{rotationY:pilot.car.children[0].rotation.y,scale:pilot.car.children[0].scale.x,minY:new T.Box3().setFromObject(pilot.car).min.y,surface:pilot.car.position.y},buildingModels:[...view.groups.values()].filter(b=>b.typeId!=='road').map(b=>b.group.userData.modelPath)};
   if(!pilot.walker)return result;
   const first=pilot.walker,second=pilot.createWalker(),source=pilot.models.assets.get(data.config.cityView.meshyPilot.walker.path);
   const bone=(w,name='LeftFoot')=>w.root.getObjectByName('mixamorig'+name);
   const pose=w=>{w.root.updateMatrixWorld(true);return w.root.worldToLocal(bone(w).getWorldPosition(new T.Vector3())).toArray();};
   const route=first.points.map(p=>p.clone());first.setRoute(route);second.setRoute(route);second.wait=.2;
   const heldPose=pose(first),heldPosition=first.root.position.toArray();first.tick(.6);second.tick(.6);
   let skeletonsIndependent=true,skinCount=0;second.root.traverse(o=>{if(o.isSkinnedMesh){skinCount++;const a=first.root.getObjectByName(o.name),s=source.getObjectByName(o.name);skeletonsIndependent&&=o.skeleton!==a.skeleton&&o.skeleton!==s.skeleton&&o.skeleton.bones.every((b,i)=>b!==a.skeleton.bones[i]&&b!==s.skeleton.bones[i]);}});
   result.independence={mixers:first.mixer!==second.mixer,skeletons:skeletonsIndependent,skinCount,firstPose:pose(first),heldPose,secondPose:pose(second),heldPosition,firstPosition:first.root.position.toArray(),secondPosition:second.root.position.toArray(),firstStopped:first.stopped,secondStopped:second.stopped};
   first.tick(1.2);const a=pose(first),positionA=first.root.position.toArray();first.tick(.2);const b=pose(first);result.walking={a,b,positionA,positionB:first.root.position.toArray(),hips:!!bone(first,'Hips'),scale:first.root.children[0].scale.x,rotationY:first.root.children[0].rotation.y};
   const outward=first.root.rotation.y;first.tick(1/first.settings.speed);result.endpoint={stopped:first.stopped,timeScale:first.action.timeScale,time:first.action.time,position:first.root.position.toArray(),end:route[1].toArray(),pose:pose(first)};
   first.tick(.5);result.endpoint.stillPose=pose(first);result.endpoint.stillPosition=first.root.position.toArray();
   // Measure the actual skinned sole vertices, not only the foot bone origins.
   const soles={Left:Infinity,Right:Infinity};first.root.updateMatrixWorld(true);
   first.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();const ids=o.geometry.attributes.skinIndex,weights=o.geometry.attributes.skinWeight;
    for(let v=0;v<ids.count;v++){let best=0;for(let k=1;k<4;k++)if(weights.getComponent(v,k)>weights.getComponent(v,best))best=k;const name=o.skeleton.bones[ids.getComponent(v,best)].name;
     for(const side of ['Left','Right'])if(name.includes(side+'Foot')||name.includes(side+'Toe'))soles[side]=Math.min(soles[side],o.getVertexPosition(v,new T.Vector3()).applyMatrix4(o.matrixWorld).y);
    }
   });
   result.endpoint.soles=soles;result.endpoint.ground=first.root.position.y;
   result.endpoint.armAngle=bone(first,'LeftArm').quaternion.angleTo(source.getObjectByName('mixamorigLeftArm').quaternion);
   first.tick(first.settings.pauseSeconds);result.reverse={yaw:first.root.rotation.y,outward,moving:!first.stopped};
   first.tick(1/first.settings.speed);result.returned={stopped:first.stopped,position:first.root.position.toArray(),start:route[0].toArray()};
   second.dispose();
   // The normal view loop must also advance the rig, independent of manual
   // deterministic checks of arrival and pause boundaries above.
   first.setRoute(route);first.wait=0;window.__task017LiveBefore={pose:pose(first),position:first.root.position.toArray()};view.paused=false;
   return result;
  });
  const carOK=!['car','both'].includes(failure),walkerOK=!['walker','both'].includes(failure);
  assert.equal(result.metrics.pilot.carLoaded,carOK);assert.equal(result.metrics.pilot.walkerLoaded,walkerOK);
  assert.equal(result.metrics.models.loaded,3);assert.equal(result.buildingModels.length,3);assert.ok(result.buildingModels.every(Boolean));
  assert.equal(result.metrics.citizens,walkerOK?14:15);assert.equal(result.metrics.pilot.models.failed,Number(!carOK)+Number(!walkerOK));
  if(carOK){assert.ok(Math.abs(result.car.rotationY+Math.PI/2)<1e-6);assert.equal(result.car.scale,.38);assert.ok(Math.abs(result.car.minY-result.car.surface)<1e-6);}
  if(walkerOK){
   const independent=result.independence;assert.ok(independent.mixers&&independent.skeletons&&independent.skinCount>0);assert.equal(independent.firstStopped,true);assert.equal(independent.secondStopped,false);
   assert.deepEqual(independent.firstPose,independent.heldPose);assert.deepEqual(independent.firstPosition,independent.heldPosition);assert.notDeepEqual(independent.secondPosition,independent.firstPosition);assert.notDeepEqual(independent.secondPose,independent.firstPose);
   assert.ok(result.walking.hips);assert.equal(result.walking.scale,.32);assert.equal(result.walking.rotationY,0);assert.notDeepEqual(result.walking.a,result.walking.b);assert.notDeepEqual(result.walking.positionA,result.walking.positionB);
   const end=result.endpoint;assert.ok(end.stopped);assert.equal(end.timeScale,0);assert.ok(Math.abs(end.time-1/12)<1e-6);assert.deepEqual(end.position,end.end);assert.deepEqual(end.stillPosition,end.position);assert.deepEqual(end.stillPose,end.pose);assert.ok(end.armAngle>.1,'stop pose must differ from A-pose');
   for(const y of Object.values(end.soles))assert.ok(Math.abs(y-end.ground)<.002,'both soles must contact sidewalk');
   assert.ok(result.reverse.moving);assert.ok(Math.abs(Math.abs(result.reverse.yaw-result.reverse.outward)-Math.PI)<1e-6);assert.ok(result.returned.stopped);assert.deepEqual(result.returned.position,result.returned.start);
   await page.waitForTimeout(900);
   result.live=await page.evaluate(async()=>{const T=await import('./vendor/three.module.js'),{view}=window.__island,w=view.pilot.walker;view.paused=true;w.root.updateMatrixWorld(true);return {before:window.__task017LiveBefore,after:{position:w.root.position.toArray(),pose:w.root.worldToLocal(w.root.getObjectByName('mixamorigLeftFoot').getWorldPosition(new T.Vector3())).toArray()}};});
   assert.notDeepEqual(result.live.before.pose,result.live.after.pose);assert.notDeepEqual(result.live.before.position,result.live.after.position);
  }
  // Rebuild, remove and re-add the house: no stale pilot objects or save edits.
  result.lifecycle=await page.evaluate(()=>{const {view,engine}=window.__island,buildings=engine.state.buildings,version=engine.state.version,original=JSON.stringify(buildings);engine.state.buildings=buildings.filter(b=>b.typeId!=='house');view.setWorld(engine.state,true);const hidden=view.pilot.metrics();engine.state.buildings=buildings;view.setWorld(engine.state,true);const restored=view.pilot.metrics();view.renderer.render(view.scene,view.camera);return {hidden,restored,version,unchanged:JSON.stringify(engine.state.buildings)===original};});
  assert.equal(result.lifecycle.hidden.carVisible,false);assert.equal(result.lifecycle.hidden.walkerVisible,false);assert.equal(result.lifecycle.restored.carVisible,carOK);assert.equal(result.lifecycle.restored.walkerVisible,walkerOK);assert.equal(result.lifecycle.version,15);assert.ok(result.lifecycle.unchanged);
  result.download=await page.evaluate(()=>{const resources=performance.getEntriesByType('resource'),navigation=performance.getEntriesByType('navigation')[0];return {bodyBytes:resources.reduce((n,r)=>n+r.encodedBodySize,navigation.encodedBodySize),transferBytes:resources.reduce((n,r)=>n+r.transferSize,navigation.transferSize),models:resources.filter(r=>/\/(car-a|adult-man-rigged)-512\.glb/.test(r.name)).map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize}))};});
  result.download.limitBytes=cityDownloadBudgetBytes;
  assert.ok(result.download.bodyBytes<=cityDownloadBudgetBytes,JSON.stringify(result.download));assert.ok(result.download.transferBytes<=cityDownloadBudgetBytes,JSON.stringify(result.download));
  if(failure==='none')assert.deepEqual(result.download.models.map(r=>r.bytes).sort((a,b)=>a-b),[327664,1218676]);
  assert.equal(new Set(requests).size,2);assert.equal(requests.length,2);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await page.screenshot({path:out+`browser-${width}x${height}-${failure}.png`});reports.push({width,height,failure,result,errors,outside,requests});console.log('TASK-017',width,height,failure,'PASS');
 }finally{await context.close();}
}await writeFile(out+'browser.json',JSON.stringify({browser:'Chromium / ANGLE SwiftShader',reports},null,2)+'\n');}finally{await browser.close();}

}

/** Shared before/after benchmark; functional cases run when TASK017_PHASE is unset. */
async function measurePilot(){
 const label=process.env.TASK017_PHASE||'after',out=fileURLToPath(new URL('../verification/task017/',import.meta.url));await mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const reports=[];
 try {for(const [width,height] of viewports){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[],outside=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!new URL(r.url()).pathname.startsWith('/workout/island/'))outside.push(r.url())});
 // Cold context. Fixed random stream makes the decorative island reproducible.
 await page.addInitScript(()=>{let seed=17017;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);});
 await page.goto(process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').tap();
 await page.evaluate(async()=>{const {view,engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;await view.modelsReady;if(view.pilotReady)await view.pilotReady;
 const buildings=[{id:'pilot-home',typeId:'house',level:1,x:4,z:6},{id:'pilot-shop',typeId:'shop',level:1,x:7,z:6},{id:'pilot-hospital',typeId:'hospital',level:1,x:10,z:6},...Array.from({length:9},(_,i)=>({id:'pilot-road-'+i,typeId:'road',level:1,x:3+i,z:5}))];
 view.started=Infinity;window.__task017ReadyMs=performance.now();engine.state.buildings=buildings;view.setWorld(engine.state,true);view.home();window.__task017Scenario=buildings;});
 if(await page.locator('.build-dock').getAttribute('data-open')==='true')await page.locator('[data-action=toggle-build]').tap();
 await page.waitForTimeout(1200);
 const report=await page.evaluate(()=>{const {view}=window.__island,entries=performance.getEntriesByType('resource'),nav=performance.getEntriesByType('navigation')[0];return {metrics:view.metrics(),camera:{position:view.camera.position.toArray(),target:view.target.toArray(),left:view.camera.left,right:view.camera.right,top:view.camera.top,bottom:view.camera.bottom},loadMs:nav.loadEventEnd,readyMs:window.__task017ReadyMs,downloadedBytes:entries.reduce((s,e)=>s+e.encodedBodySize,nav.encodedBodySize),transferBytes:entries.reduce((s,e)=>s+e.transferSize,nav.transferSize),resources:entries.map(e=>({path:new URL(e.name).pathname,bytes:e.encodedBodySize})),pilot:view.pilot?.metrics()};});
 // Measure actual rAF delivery over a real 2-second window (no mock clock).
 report.fps=await page.evaluate(()=>new Promise(resolve=>{let n=0;const start=performance.now();function frame(now){n++;if(now-start>=2000)resolve(n*1000/(now-start));else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));
 report.downloadBudget={limitBytes:cityDownloadBudgetBytes,bodyBytes:report.downloadedBytes,transferBytes:report.transferBytes};
 assert.ok(report.downloadedBytes<=cityDownloadBudgetBytes,JSON.stringify(report.downloadBudget));assert.ok(report.transferBytes<=cityDownloadBudgetBytes,JSON.stringify(report.downloadBudget));
 await page.screenshot({path:out+label+'-'+width+'x'+height+'.png'});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);if(label!=='before')assert.equal(report.pilot.walkerLoaded&&report.pilot.carLoaded,true);reports.push({width,height,...report,errors,outside});console.log(label,width,height,JSON.stringify({metrics:report.metrics,fps:report.fps,bytes:report.downloadedBytes,errors,outside}));await context.close();
 }await writeFile(out+label+'.json',JSON.stringify({label,browser:'Chromium / ANGLE SwiftShader (software WebGL), DPR 1, cold context',scenario:'house L1 (4,6), shop (7,6), hospital (10,6), road x=3..11 z=5; default home camera; 2s real rAF',reports},null,2)+'\n');}finally{await browser.close()}
}

/** Controlled browser-only substitutions isolate draw submission, CPU mixer,
 * skinning and texture sampling. No asset or production setting is changed. */
async function diagnosePilot(){
 const synchronous=process.env.TASK017_PHASE==='profile';
 const out=fileURLToPath(new URL('../verification/task017/',import.meta.url));await mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']}),reports=[];
 const variants=['baseline','two-empty-calls','pilot','frozen-mixer','baked-rig','without-textures','car-only','walker-only'];
 try{for(const [width,height] of viewports){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
  try{
   await page.addInitScript(()=>{let seed=17017;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);});
   await page.goto(process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').tap();
   const assets=await page.evaluate(async()=>{
    const T=await import('./vendor/three.module.js'),{view,engine,data}=window.__island;
    await Promise.all([view.modelsReady,view.pilotReady]);engine.skipTutorial();data.featureFlags.events=false;view.started=Infinity;
    engine.state.buildings=[{id:'pilot-home',typeId:'house',level:1,x:4,z:6},{id:'pilot-shop',typeId:'shop',level:1,x:7,z:6},{id:'pilot-hospital',typeId:'hospital',level:1,x:10,z:6},...Array.from({length:9},(_,i)=>({id:'pilot-road-'+i,typeId:'road',level:1,x:3+i,z:5}))];
    view.setWorld(engine.state,true);view.home();
    const {pilot}=view,w=pilot.walker,route=w.points.map(p=>p.clone()),tick=pilot.tick,meshes=[],baked=[],materialPairs=new Map(),textures=[];
    w.setRoute(route);w.root.updateMatrixWorld(true);
    for(const root of [pilot.car,w.root])root.traverse(o=>{if(o.isMesh){
     meshes.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!materialPairs.has(m)){
      const plain=m.clone();for(const key of Object.keys(plain))if(plain[key]?.isTexture){const texture=plain[key];textures.push({slot:key,width:texture.image?.width,height:texture.image?.height});plain[key]=null;}
      plain.needsUpdate=true;materialPairs.set(m,plain);
     }
    }});
    w.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();
     const geometry=o.geometry.clone(),positions=new Float32Array(geometry.attributes.position.count*3),v=new T.Vector3();
     for(let i=0;i<geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.toArray(positions,i*3);}
     geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeBoundingSphere();
     const mesh=new T.Mesh(geometry,o.material);mesh.position.copy(o.position);mesh.quaternion.copy(o.quaternion);mesh.scale.copy(o.scale);mesh.castShadow=o.castShadow;mesh.receiveShadow=o.receiveShadow;mesh.frustumCulled=o.frustumCulled;mesh.visible=false;baked.push({original:o,mesh});
    });
    // Add outside traverse so the new static meshes are not traversed again.
    for(const pair of baked)pair.original.parent.add(pair.mesh);
    const empty=new T.Group(),emptyGeometry=new T.BufferGeometry();emptyGeometry.setAttribute('position',new T.Float32BufferAttribute([0,3,0,0,3,0,0,3,0],3));
    const emptyMaterial=new T.MeshBasicMaterial();for(let i=0;i<2;i++){const mesh=new T.Mesh(emptyGeometry,emptyMaterial);mesh.frustumCulled=false;empty.add(mesh);}empty.visible=false;view.scene.add(empty);
    window.__task017Diagnostics={
     set(name){
      for(const o of meshes){const list=Array.isArray(o.material)?o.material:[o.material];o.material=Array.isArray(o.material)?list.map(m=>[...materialPairs].find(([a,b])=>m===a||m===b)?.[0]||m):[...materialPairs].find(([a,b])=>o.material===a||o.material===b)?.[0]||o.material;}
      for(const pair of baked){pair.original.visible=name!=='baked-rig';pair.mesh.visible=name==='baked-rig';}
      const car=!['baseline','two-empty-calls','walker-only'].includes(name),walker=!['baseline','two-empty-calls','car-only'].includes(name);
      pilot.car.visible=car;w.root.visible=walker;empty.visible=name==='two-empty-calls';
      view.citizens.setPoints(view.walkPoints,walker?14:15);w.setRoute(route);w.wait=0;
      pilot.tick=['frozen-mixer','baked-rig'].includes(name)?()=>{}:tick;
      if(name==='without-textures')for(const o of meshes)o.material=Array.isArray(o.material)?o.material.map(m=>materialPairs.get(m)):materialPairs.get(o.material);
     },
     dispose(){pilot.tick=tick;for(const pair of baked){pair.mesh.removeFromParent();pair.mesh.geometry.dispose();}for(const m of materialPairs.values())m.dispose();empty.removeFromParent();emptyGeometry.dispose();emptyMaterial.dispose();}
    };
    return {textures,bones:baked[0]?.original.skeleton.bones.length,baseCitizenCount:15};
   });
   if(await page.locator('.build-dock').getAttribute('data-open')==='true')await page.locator('[data-action=toggle-build]').tap();
   let results=[];
   if(synchronous){
    // Exclude shader compilation, then interleave variants in alternating order.
    // gl.finish includes completed GPU work; rAF scheduling noise is excluded.
    await page.evaluate(names=>{const {view}=window.__island;view.paused=true;for(const name of names){window.__task017Diagnostics.set(name);view.citizens.tick(0,0);view.renderer.render(view.scene,view.camera);view.renderer.getContext().finish();}},variants);
    const samples=Object.fromEntries(variants.map(name=>[name,[]]));
    for(let round=0;round<7;round++)for(const variant of round%2?[...variants].reverse():variants){
     samples[variant].push(await page.evaluate(name=>{
      const {view}=window.__island;window.__task017Diagnostics.set(name);view.citizens.tick(0,0);
      const cpuStart=performance.now();view.pilot.tick(1/60);const cpuPilotMs=performance.now()-cpuStart;
      const start=performance.now();view.renderer.render(view.scene,view.camera);view.renderer.getContext().finish();const renderMs=performance.now()-start,m=view.metrics();
      return {renderMs,cpuPilotMs,triangles:m.triangles,calls:m.calls,quality:m.quality,pixelRatio:m.pixelRatio};
     },variant));
    }
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
    results=variants.map(variant=>{const rows=samples[variant],{triangles,calls,quality,pixelRatio}=rows[0];return {variant,samples:rows,medianRenderMs:median(rows.map(r=>r.renderMs)),medianCpuPilotMs:median(rows.map(r=>r.cpuPilotMs)),triangles,calls,quality,pixelRatio};});
    for(const row of results)console.log('TASK-017 profile',width,height,row.variant,row.medianRenderMs.toFixed(2),'render ms',row.medianCpuPilotMs.toFixed(3),'pilot CPU ms',row.calls);
   }else for(const variant of variants){
    await page.evaluate(name=>window.__task017Diagnostics.set(name),variant);await page.waitForTimeout(700);
    const samples=[];
    for(let repeat=0;repeat<2;repeat++)samples.push(await page.evaluate(()=>new Promise(resolve=>{let frames=0;const start=performance.now();function frame(now){frames++;if(now-start>=2000)resolve(frames*1000/(now-start));else requestAnimationFrame(frame);}requestAnimationFrame(frame);})));
    const metrics=await page.evaluate(()=>{const m=window.__island.view.metrics();return {triangles:m.triangles,calls:m.calls,quality:m.quality,pixelRatio:m.pixelRatio};});
    const fps=samples.reduce((a,b)=>a+b,0)/samples.length;results.push({variant,samples,fps,...metrics});console.log('TASK-017 diagnostics',width,height,variant,fps.toFixed(2),metrics.calls);
   }
   const byName=Object.fromEntries(results.map(r=>[r.variant,r]));
   for(const name of ['frozen-mixer','baked-rig','without-textures']){assert.equal(byName[name].calls,byName.pilot.calls);assert.equal(byName[name].triangles,byName.pilot.triangles);}
   assert.equal(byName['two-empty-calls'].calls,byName.baseline.calls+2);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
   reports.push({width,height,assets,results,errors,outside});await page.evaluate(()=>window.__task017Diagnostics.dispose());
  }finally{await context.close();}
 }await writeFile(out+(synchronous?'profile.json':'diagnostics.json'),JSON.stringify({browser:'Chromium / ANGLE SwiftShader',method:synchronous?'seven interleaved synchronous render+gl.finish timings per variant, alternating order after shader warmup; pilot CPU tick measured separately':'two real 2-second rAF samples per variant, high quality/shadows, identical camera and city; temporary in-memory material/geometry substitutions only',reports},null,2)+'\n');}finally{await browser.close();}
}
