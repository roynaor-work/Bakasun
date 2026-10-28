import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import {createFireModel,drawFire} from '../workout/island/minigames/fire.mjs';
import {createFireScene,createFireView} from '../workout/island/minigames/fire-view.mjs';
import {localModelURL,loadOptionalArt,modelTargets} from '../workout/island/minigames/model-art.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {SOUND_EVENTS} from '../workout/island/minigames/sound.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';
import * as T from '../workout/island/vendor/three.module.js';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),config=data.config.minigames;
const make=(level=3,extra={})=>createFireModel({config,balance:config.fireRescue,level,random:seededRandom(2026),...extra});
const advance=(m,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.01)&&!m.result;i++)m.update(.01,input);};
const sceneContext={config,balance:config.fireRescue,t:id=>data.strings?.[id]||id};
function paint(){return new Proxy({},{get:(o,k)=>o[k]??(()=>{})});}
function fakeRenderer(){const domElement=new EventTarget(),sizes=[];return {domElement,sizes,disposed:0,lost:0,setPixelRatio(){},setSize(w,h){sizes.push([w,h]);domElement.width=w;domElement.height=h;},render(){},dispose(){this.disposed++;},forceContextLoss(){this.lost++;}};}

for(let level=1;level<=10;level++)test(`G2g civilian count and burning window match stage ${level}`,()=>{
 const m=make(level);assert.equal(m.rescues.length,level<3?0:level<6?1:level<10?2:3);
 for(const rescue of m.rescues){assert.ok(m.flames[rescue.fireIndex].active);assert.ok(m.flames[rescue.fireIndex].heat>0);assert.ok(rescue.world[1]>2);assert.equal(rescue.remaining,config.fireRescue.rescue.timeoutSeconds);}
 if(level<3){assert.equal(m.rescue,undefined);assert.equal(m.rescueProgress,0);assert.equal(m.snapshot().rescue,null);}
});
test('G2g holding Rescue at a window awards existing score and water once, without consuming hose supplies',()=>{
 const events=[],m=parkRescue(make(3,{sound:e=>events.push(e)})),r=m.rescue,water=m.water,reserve=m.reserve,pressure=m.pressure;
 advance(m,r.seconds+.1,{rescue:true,firing:true,x:r.x,y:r.y});assert.equal(r.rescued,true);assert.equal(m.spraying,false);assert.equal(m.score,r.points);assert.equal(m.reserve,reserve+r.waterReward);assert.equal(m.water,water);assert.equal(m.pressure,pressure);
 advance(m,r.descentSeconds+1,{rescue:true,x:r.x,y:r.y});assert.equal(r.descent,1);assert.equal(m.score,r.points);assert.equal(m.reserve,reserve+r.waterReward);assert.equal(events.filter(e=>e==='ladder').length,1);assert.equal(events.filter(e=>e==='rescue').length,1);
 assert.equal(make().rescue.rescued,false);
});
test('G2g rescue forgives a short release and reticle placement but still requires a safe nearby window',()=>{
 for(const action of [{},{firing:true},{charge:true},{rescue:true,charge:true}]){
  const m=parkRescue(make()),r=m.rescue;advance(m,.3,{...action,x:r.x,y:r.y});assert.equal(r.progress,0);assert.equal(r.rescued,false);
 }
 const m=parkRescue(make()),r=m.rescue;advance(m,.5,{rescue:true,x:r.x,y:r.y});const held=r.progress;assert.ok(held>0&&held<r.seconds);
 advance(m,.12);assert.equal(r.progress,held,'a brief finger release keeps the existing ladder progress');
 advance(m,.3);assert.ok(r.progress>0&&r.progress<held,'a longer interruption first decays the progress rather than discarding it at once');
 advance(m,1);assert.equal(r.progress,0);
 advance(m,r.seconds+.1,{rescue:true,x:-10000,y:-10000});assert.equal(r.rescued,true,'a safe nearby rescue locks to the window independently of the reticle');
 const unsafe=parkRescue(make()),u=unsafe.rescue;unsafe.flames[u.fireIndex].heat=config.fireRescue.rescue.safeHeat+.2;
 advance(unsafe,u.seconds+.1,{rescue:true,x:u.x,y:u.y});assert.equal(u.progress,0);assert.equal(u.rescued,false);
 const distant=make(),d=distant.rescue;distant.flames[d.fireIndex].heat=0;assert.ok(Math.hypot(distant.truck.x-d.world[0],distant.truck.z-d.world[2])>config.fireRescue.rescue.truckRadius);
 advance(distant,d.seconds+.1,{rescue:true,x:d.x,y:d.y});assert.equal(d.progress,0);assert.equal(d.rescued,false);
});
test('G2g timeout hides the civilian in smoke, loses only its bonus, and cannot later award it',()=>{
 const balance=structuredClone(config.fireRescue),events=[];Object.assign(balance.levels[2],{growthPerSecond:0,spreadSeconds:0,eruptionSeconds:999});
 const m=make(3,{balance,sound:e=>events.push(e)}),r=m.rescue,heat=m.flames.map(f=>f.heat),supplies=[m.water,m.pressure,m.reserve];
 m.update(0,{rescue:true,x:r.x,y:r.y});assert.equal(r.remaining,r.timeoutSeconds);advance(m,r.timeoutSeconds+.1);
 assert.equal(r.remaining,0);assert.equal(r.expired,true);assert.equal(r.rescued,false);assert.ok(r.feedback>0);assert.equal(m.result,undefined);assert.equal(m.score,0);assert.deepEqual(m.flames.map(f=>f.heat),heat);assert.deepEqual([m.water,m.pressure,m.reserve],supplies);
 advance(m,3,{rescue:true,x:r.x,y:r.y});assert.equal(m.score,0);assert.equal(events.filter(e=>e==='timeout').length,1);assert.equal(events.includes('rescue'),false);
});
test('G2g optional rescue remains available after extinguishing and finishing preserves, stars and the single-award engine contract',()=>{
 for(const rescueFirst of [false,true]){
  const m=parkRescue(make());if(rescueFirst)advance(m,m.rescue.seconds+.1,{rescue:true,x:m.rescue.x,y:m.rescue.y});
  const v=config.fireRescue.vehicle;Object.assign(m.truck,{x:v.x,z:v.z,targetX:v.x,targetZ:v.z});for(const f of m.flames)if(f.active)f.heat=.00001;
  for(const f of m.flames)if(f.active&&f.heat>0)m.update(.02,{firing:true,x:f.x,y:f.y});
  if(!m.result){assert.ok(m.firesOut);m.update(.02,{finish:true});}assert.equal(m.result.outcome,'win');assert.deepEqual(m.result.summary,{out:config.fireRescue.levels[2].flames,rescued:Number(rescueFirst),water:Math.floor(m.water)});
  const engine=createEngine(data,{storage:null});engine.state.minigameProgress.fireRescue.stage=3;let finish,disposed=0,result;
  const game=engine.registry.minigames.get('fireRescue');engine.registry.minigames.set('fireRescue',{...game,start:ctx=>{finish=ctx.finish;return {dispose(){disposed++;}};}});
  engine.state.buildings.push({id:'fire-station-test',typeId:'fireStation',x:12,z:0,level:1});const money=engine.state.money;assert.equal(engine.startMinigame('fireRescue',{level:3,onFinish:r=>{result=r;}}).ok,true);assert.equal(finish(m.result).ok,true);assert.ok(result.stars>=1&&result.stars<=3);assert.equal(result.money,Math.floor(m.score/config.fireRescue.pointsPerCoin)+m.settings.winMoney);assert.equal(engine.state.money,money+result.money);assert.equal(disposed,1);assert.equal(finish(m.result).ok,false);assert.equal(CURRENT_VERSION,18);
 }
});
test('G2g all ten scene variants remain within triangle/draw budgets with fixed pools and finite vertices',()=>{
 for(let level=1;level<=10;level++){
  const m=make(level),world=createFireScene(sceneContext,m),geometries=[];world.scene.traverse(o=>{if(o.geometry)geometries.push(o.geometry);});const before=world.metrics();
  assert.ok(before.triangles<=config.fireRescue.render.maxTriangles);assert.ok(before.drawCalls<=config.fireRescue.render.maxDrawCalls);
  for(let i=0;i<90;i++){m.update(.01,{firing:true,x:350,y:450});world.animate();}
  const after=[];world.scene.traverse(o=>{if(o.geometry){after.push(o.geometry);for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}});assert.deepEqual(after,geometries);assert.equal(world.metrics().geometries,before.geometries);world.dispose();
 }
});
test('G2g geometry, textures, materials and instance buffers dispose once, including repeated exit',()=>{
 const world=createFireScene(sceneContext,make(10)),resources=new Set();world.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.isInstancedMesh)resources.add(o);for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat){resources.add(mat);if(mat.map)resources.add(mat.map);}});
 const counts=new Map();for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
 world.dispose();world.dispose();for(const count of counts.values())assert.equal(count,1);assert.deepEqual(world.metrics(),{triangles:0,drawCalls:0,geometries:0,materials:0,textures:0,disposed:true});
});
test('G2g projected targets round-trip to fire/window coordinates and hit the same logical impact',()=>{
 const model=make(),renderer=fakeRenderer(),view=createFireView(sceneContext,model,()=>renderer);
 for(const target of [...model.flames,model.rescue]){const screen=view.projectTarget(target.x,target.y),logical=view.targetAt(screen.x,screen.y);assert.deepEqual(logical,{x:target.x,y:target.y});model.update(.001,{...logical,firing:true});if(model.inRange)assert.ok(Math.hypot(model.impact.x-target.x,model.impact.y-target.y)<.01);else{assert.ok(Math.abs(Math.hypot(model.impact.x-model.nozzle.x,model.impact.y-model.nozzle.y)-model.range)<.01);assert.ok(Math.hypot(model.impact.x-target.x,model.impact.y-target.y)>0);}}
 view.dispose();
});
test('G2g quality lowers resolution first, then releases WebGL and preserves model state for Canvas2D',()=>{
 const model=make(),renderer=fakeRenderer(),view=createFireView(sceneContext,model,()=>renderer),before=model.snapshot();assert.equal(view.draw(paint()),true);
 view.degrade();assert.equal(view.mode,'three');assert.deepEqual(renderer.sizes.at(-1),[270,360]);view.degrade(true);assert.equal(view.mode,'canvas');assert.equal(view.draw(paint()),false);assert.equal(renderer.disposed,1);assert.equal(renderer.lost,1);assert.deepEqual(model.snapshot(),before);view.dispose();assert.equal(renderer.disposed,1);
 assert.equal(createFireView(sceneContext,model,()=>{throw Error('no GPU');}),null);
 // Exercise the retained G2f renderer after the WebGL view stops drawing.
 drawFire(paint(),model,{...sceneContext,quality:{low:true},art:{backdrop:{},truck:{}},view});
});
test('G2g WebGL context loss cleans resources and immediately exposes the canvas fallback',()=>{
 const renderer=fakeRenderer(),view=createFireView(sceneContext,make(),()=>renderer),event=new Event('webglcontextlost',{cancelable:true});renderer.domElement.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(view.mode,'canvas');assert.equal(view.metrics().disposed,true);assert.equal(renderer.disposed,1);view.dispose();assert.equal(renderer.disposed,1);
});
function sprites(){const clears=[],draws=[],sprite=()=>{let x=50,y=44;const saved=[],p={save(){saved.push([x,y]);},setTransform(a,b,c,d,e,f){x=e;y=f;},restore(){[x,y]=saved.pop();},clearRect:(cx,cy)=>clears.push([cx+x,cy+y]),drawImage:(image,dx,dy)=>draws.push([dx+x,dy+y])};return {width:100,height:100,getContext:()=>p};};return {art:{player:sprite(),aliens:Array.from({length:5},sprite)},clears,draws};}
function fakeObject(){const root=new T.Group(),geometry=new T.BoxGeometry(3,1,2),material=new T.MeshBasicMaterial();root.add(new T.Mesh(geometry,material));return root;}
function adapters(load){const renderer=fakeRenderer();renderer.render=(scene,camera)=>{const object=scene.children.find(o=>o.isGroup);if(object){renderer.rotation=object.rotation.y;renderer.bounds=new T.Box3().setFromObject(object);renderer.camera=camera;}};return {renderer,createRenderer:()=>renderer,createLoader:()=>({loadAsync:load})};}
test('G2g six unchanged local Meshy GLBs have the requested orientations and relative sizes',async()=>{
 const b=config.alienDefense,{art}=sprites(),targets=modelTargets(art,b.models);assert.equal(targets.length,6);assert.equal(b.models.enemies[3].path,'assets/models/alien-d-512.glb');assert.deepEqual(targets.map(t=>t.spec.scale),[1.15,.92,.86,1.08,.95,2.4]);assert.deepEqual(targets.map(t=>t.spec.rotationY),[-90,90,90,90,90,90]);
 const expected=[382476,326784,340240,358472,274880,329348];
 for(let i=0;i<targets.length;i++){const url=localModelURL(targets[i].spec.path),buffer=await readFile(url);assert.equal((await stat(url)).size,expected[i]);assert.equal(buffer.toString('ascii',0,4),'glTF');const json=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));assert.ok(json.meshes.length);assert.ok((json.buffers||[]).every(b=>!b.uri));assert.ok((json.images||[]).every(image=>image.bufferView!==undefined));}
});
test('G2g real local file loads replace exactly six sprites, orient their noses, and release the bake renderer',async()=>{
 const {art,draws}=sprites(),b=config.alienDefense,seen=[];const a=adapters(async url=>{await readFile(new URL(url));seen.push(url);return {scene:fakeObject()};});await loadOptionalArt(art,b,()=>false,a);
 assert.deepEqual(art.modelArt,{requested:6,loaded:6,failed:0});assert.deepEqual(draws,Array.from({length:6},()=>[0,0]));assert.deepEqual(art.modelScales,{player:1.15,enemies:[.92,.86,1.08,.95,2.4]});assert.equal(a.renderer.rotation,Math.PI/2);assert.ok(Math.abs(a.renderer.bounds.getCenter(new T.Vector3()).length())<1e-6);assert.equal(a.renderer.camera.up.z,-1);assert.equal(a.renderer.disposed,1);assert.equal(a.renderer.lost,1);for(const url of seen)assert.ok(new URL(url).pathname.startsWith(root.pathname));
});
test('G2g missing model and null slots preserve the code sprite without aborting the game',async()=>{
 const {art,draws,clears}=sprites(),b=structuredClone(config.alienDefense);b.models={player:{path:'assets/models/missing.glb',rotationY:0,scale:1},enemies:[null]};await loadOptionalArt(art,b,()=>false,adapters(async url=>({scene:await readFile(new URL(url))})));
 assert.deepEqual(art.modelArt,{requested:1,loaded:0,failed:1});assert.equal(draws.length,0);assert.equal(clears.length,0);
 b.models.player=null;await loadOptionalArt(art,b,()=>false,{createRenderer(){throw Error('should not create');}});assert.deepEqual(art.modelArt,{requested:0,loaded:0,failed:0});
});
test('G2g external, traversal and malformed model paths cannot cause a load',async()=>{
 for(const path of ['https://example.com/a.glb','//example.com/a.glb','../a.glb','assets/%2e%2e/%2e%2e/%2e%2e/outside.glb','assets/%2e%2e%2f%2e%2e%2foutside.glb','data:x.glb','assets\\a.glb','assets/a.png'])assert.equal(localModelURL(path),null);
 const {art}=sprites(),b=structuredClone(config.alienDefense);b.models={player:{path:'https://example.com/a.glb',rotationY:0,scale:1},enemies:[null]};await loadOptionalArt(art,b,()=>false,{createRenderer(){assert.fail('external path reached GPU');}});assert.equal(art.modelArt.requested,0);
 b.models.player={path:'assets/models/ship-player.glb',rotationY:0,scale:1};const a=adapters(async()=>({scene:fakeObject()}));a.createLoader=manager=>({async loadAsync(){manager.resolveURL('https://example.com/texture.png');return {scene:fakeObject()};}});await loadOptionalArt(art,b,()=>false,a);assert.equal(art.modelArt.failed,1);
});
test('G2g closing during an asynchronous model load releases late geometry without writing freed sprites',async()=>{
 const {art,draws}=sprites(),b=structuredClone(config.alienDefense);b.models.enemies=[];let closed=false,released=0;const object=fakeObject();object.children[0].geometry.addEventListener('dispose',()=>released++);
 await loadOptionalArt(art,b,()=>closed,adapters(async()=>{closed=true;return {scene:object};}));assert.equal(draws.length,0);assert.equal(released,1);assert.equal(art.modelArt.loaded,0);
});
test('G2g unsupported WebGL preserves procedural model sprites and reports failed optional loads',async()=>{
 const {art,draws}=sprites();await loadOptionalArt(art,config.alienDefense,()=>false,{createRenderer(){throw Error('no WebGL');}});assert.equal(art.modelArt.failed,6);assert.equal(draws.length,0);
});
test('G2g release and new sounds are present; all runtime versioned imports use the same release',async()=>{
 assert.equal(DATA_VERSION,'island-alpine-20261028-1');for(const event of ['crackle','spray','refill','ladder','rescue','timeout'])assert.ok(SOUND_EVENTS.includes(event));
 async function walk(url){for(const entry of await readdir(url,{withFileTypes:true})){if(['vendor','verification'].includes(entry.name))continue;const next=new URL(entry.name+(entry.isDirectory()?'/':''),url);if(entry.isDirectory())await walk(next);else if(/\.(mjs|html)$/.test(entry.name)){const source=await readFile(next,'utf8');for(const [,v]of source.matchAll(/(?:\.mjs|\.css)\?v=([^'"\s]+)/g))assert.equal(v,DATA_VERSION,next.pathname);}}}await walk(root);
});

import {createTruckVisual,loadFireTruck} from '../workout/island/minigames/fire-truck.mjs';
function fakeTruck(){const root=new T.Group(),material=new T.MeshBasicMaterial(),body=new T.Mesh(new T.BoxGeometry(3,1,2),material),barrel=new T.Mesh(new T.BoxGeometry(2,.2,.3),material);body.position.y=.5;barrel.position.y=1.5;root.add(body,barrel);return root;}
test('G2g the player truck moves at bounded speed, clamps to the street, and leaves the reticle fixed',()=>{
 const m=make(),aim={...m.aim},initial={...m.truck},speed=config.fireRescue.vehicle.speed;m.update(.02,{truckX:999,truckZ:999});assert.ok(Math.hypot(m.truck.x-initial.x,m.truck.z-initial.z)<=speed*.02+1e-8);advance(m,5,{truckX:999,truckZ:999});assert.equal(m.truck.x,config.fireRescue.vehicle.maxX);assert.equal(m.truck.z,config.fireRescue.vehicle.maxZ);assert.deepEqual(m.aim,aim);assert.equal(m.spraying,false);assert.equal(m.water,m.maxWater);assert.equal(m.pressure,m.maxPressure);assert.notEqual(m.nozzle.x,config.fireRescue.nozzleX);
 advance(m,5,{truckX:-999,truckZ:-999});assert.equal(m.truck.x,config.fireRescue.vehicle.minX);assert.equal(m.truck.z,config.fireRescue.vehicle.minZ);
});
test('G2g the truck cannon follows aim and its moving muzzle supplies the real 3D stream',()=>{
 const m=make(),world=createFireScene(sceneContext,m),first=world.truckMetrics();m.update(.02,{x:300,y:170,firing:true});world.animate();const turned=world.truckMetrics();assert.notEqual(turned.yaw,first.yaw);assert.notDeepEqual(turned.muzzle,first.muzzle);assert.ok(Math.hypot(turned.muzzle.x-m.truck.x,turned.muzzle.z-m.truck.z)>.5);m.update(.04,{truckX:1,truckZ:12});world.animate();assert.notDeepEqual(world.truckMetrics().muzzle,turned.muzzle);world.dispose();
});
test('G2g a single local textured truck mesh partitions once into body and rotating roof cannon',()=>{
 const object=fakeTruck(),visual=createTruckVisual(object,config.fireRescue);assert.ok(visual.cannonFaces>0);const geometry=visual.turret.children.find(o=>o.isMesh).geometry,before=geometry.attributes.position.array.slice();visual.turret.rotation.y=1;visual.root.updateMatrixWorld(true);assert.deepEqual(geometry.attributes.position.array,before);assert.ok(visual.muzzle.getWorldPosition(new T.Vector3()).length()>0);let released=0;geometry.addEventListener('dispose',()=>released++);visual.dispose();visual.dispose();assert.equal(released,1);
});
test('G2g optional truck failure and late completion preserve procedural rendering; the patrol boat is configured locally',async()=>{
 const b=structuredClone(config.fireRescue);b.vehicle.model=null;assert.equal(await loadFireTruck(b),null);b.vehicle.model='assets/models/missing.glb';await assert.rejects(loadFireTruck(b,{loader:{async loadAsync(url){await readFile(new URL(url));}}}));
 const world=createFireScene(sceneContext,make()),visual=createTruckVisual(fakeTruck(),config.fireRescue);world.dispose();assert.equal(world.setTruck(visual),false);assert.equal(visual.root.children.length,0);assert.equal(config.navalDuel.playerModel.path,'assets/models/boat-patrol-512.glb');
});

async function localMesh(path){
 const bytes=await readFile(new URL(path,root)),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binary=bytes.subarray(28+jsonLength),primitive=json.meshes[0].primitives[0],g=new T.BufferGeometry();
 for(const [key,attribute]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']])if(primitive.attributes[key]!==undefined){const accessor=json.accessors[primitive.attributes[key]],view=json.bufferViews[accessor.bufferView],count=accessor.type==='VEC2'?2:3,array=new Float32Array(accessor.count*count);for(let i=0;i<array.length;i++)array[i]=binary.readFloatLE((view.byteOffset||0)+(accessor.byteOffset||0)+i*4);g.setAttribute(attribute,new T.BufferAttribute(array,count));}
 const accessor=json.accessors[primitive.indices],view=json.bufferViews[accessor.bufferView],indices=[];for(let i=0;i<accessor.count;i++)indices.push(binary.readUInt32LE((view.byteOffset||0)+(accessor.byteOffset||0)+i*4));g.setIndex(indices);const object=new T.Group();object.add(new T.Mesh(g,new T.MeshBasicMaterial()));return {object,bytes,json,faces:indices.length/3};
}
test('G2g the real 512 truck loads locally, preserves 4587 faces, isolates only the cannon and aligns its muzzle',async()=>{
 const mesh=await localMesh('assets/models/fire-truck-512.glb'),before=Buffer.from(mesh.bytes);assert.equal(mesh.bytes.length,316456);assert.equal(mesh.faces,4587);const visual=await loadFireTruck(config.fireRescue,{loader:{async loadAsync(url){assert.ok(url.endsWith('fire-truck-512.glb?v='+DATA_VERSION));return {scene:mesh.object};}}});assert.equal(visual.cannonFaces,585);
 let faces=0;visual.root.traverse(o=>{if(o.isMesh)faces+=o.geometry.attributes.position.count/3;});assert.equal(faces,4587);const cannon=visual.turret.children.find(o=>o.isMesh).geometry;assert.ok(cannon.boundingBox.max.x<config.fireRescue.vehicle.cannonHalfWidth);assert.ok(cannon.boundingBox.min.x>-config.fireRescue.vehicle.cannonHalfWidth);assert.ok(cannon.boundingBox.min.y>0);
 visual.root.updateMatrixWorld(true);const muzzle=visual.muzzle.getWorldPosition(new T.Vector3()),vertex=new T.Vector3();let nearest=Infinity;for(let i=0;i<cannon.attributes.position.count;i++){vertex.fromBufferAttribute(cannon.attributes.position,i).applyMatrix4(visual.turret.matrixWorld);nearest=Math.min(nearest,vertex.distanceTo(muzzle));}assert.ok(nearest<.25,'muzzle must sit at the modeled opening');
 const world=createFireScene(sceneContext,make(10));assert.equal(world.setTruck(visual),true);assert.ok(world.metrics().triangles+15152<60000);assert.ok(world.metrics().drawCalls+7<40);world.dispose();assert.deepEqual(await readFile(new URL('assets/models/fire-truck-512.glb',root)),before);
});
test('G2g the patrol boat is a local 4905-triangle asset and the naval model uses its 512 version',async()=>{
 const boat=await localMesh('assets/models/boat-patrol-512.glb');assert.equal(boat.bytes.length,282084);assert.equal(boat.faces,4905);boat.object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 assert.equal(config.navalDuel.playerModel.path,'assets/models/boat-patrol-512.glb');assert.equal(JSON.stringify(config).includes('fire-truck.glb'),false);assert.match(config.fireRescue.vehicle.model,/-512\.glb$/);
});

import {createAlienModel,drawAliens} from '../workout/island/minigames/aliens.mjs';
test('G2g a real baked boss uses scale 2.40 once; regular carriers stay readable and code fallback retains its size',()=>{
 const balance=config.alienDefense,m=createAlienModel({config,balance,level:10,random:seededRandom(12)}),sprite={},art={backdrop:{},player:{},aliens:[{},{},{},{},sprite],modelScales:{player:1.15,enemies:[.92,.86,1.08,.95,2.4]}},widths=[],p=paint();p.drawImage=(image,x,y,w)=>{if(image===sprite)widths.push(w);};
 const entity={x:180,y:100,kind:4,shield:0,maxHp:1,age:0,phase:0,hitTime:0,scale:1,boss:false};m.aliens.splice(0,m.aliens.length,entity);drawAliens(p,m,{config,balance,art,quality:{low:true}});assert.equal(widths.pop(),balance.alienRadius*3);
 entity.boss=true;entity.scale=balance.bossScale;drawAliens(p,m,{config,balance,art,quality:{low:true}});assert.equal(widths.pop(),balance.alienRadius*3*2.4);
 delete art.modelScales;drawAliens(p,m,{config,balance,art,quality:{low:true}});assert.equal(widths.pop(),balance.alienRadius*3*balance.bossScale);
});

function parkRescue(m){const b=config.fireRescue,r=m.rescue;Object.assign(m.truck,{x:r.world[0],z:r.world[2],targetX:r.world[0],targetZ:r.world[2]});m.flames[r.fireIndex].heat=Math.min(m.flames[r.fireIndex].heat,b.rescue.safeHeat/2);m.update(.001,{});return m;}
