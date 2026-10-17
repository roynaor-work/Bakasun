import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=fileURLToPath(new URL('../verification/task017/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[],assets={car:'car-a-512.glb',walker:'adult-man-rigged-512.glb'};
try{for(const [width,height] of [[390,844],[844,390]])for(const failure of ['none','car','walker','both']){
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
  assert.equal(new Set(requests).size,2);assert.equal(requests.length,2);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await page.screenshot({path:out+`browser-${width}x${height}-${failure}.png`});reports.push({width,height,failure,result,errors,outside,requests});console.log('TASK-017',width,height,failure,'PASS');
 }finally{await context.close();}
}await writeFile(out+'browser.json',JSON.stringify({browser:'Chromium / ANGLE SwiftShader',reports},null,2)+'\n');}finally{await browser.close();}
