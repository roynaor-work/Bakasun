import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {IslandView} from '../workout/island/view/island-view.mjs';
import {CityOcclusion} from '../workout/island/view/city-occlusion.mjs';
import {CityStreets} from '../workout/island/view/city-streets.mjs';
import {LocalModels} from '../workout/island/view/local-models.mjs';
import {distributedStreetSites} from '../workout/island/view/street-distribution.mjs';
import {streetSurfaces} from '../workout/island/view/street-surfaces.mjs';
import {plotLandscape} from '../workout/island/view/plot-landscape.mjs';

function cameraView(){
  const v=Object.create(IslandView.prototype);Object.assign(v,{size:32,angle:.69,elevation:.76,zoom:1,target:new T.Vector3(0,.4,0),camera:new T.OrthographicCamera(-16,16,9,-9,.1,180),ray:new T.Raycaster(),plane:new T.Plane(new T.Vector3(0,1,0),-.34),pointer:new T.Vector2(),hit:new T.Vector3(),canvas:{getBoundingClientRect:()=>({left:20,top:30,width:1280,height:720})}});
  v.resize=()=>{Object.assign(v.camera,{left:-25/v.zoom,right:25/v.zoom,top:14/v.zoom,bottom:-14/v.zoom});v.camera.updateProjectionMatrix();v.updateCamera();};v.resize();return v;
}
test('closer city zoom preserves the ground under the cursor, clamps extremes and roundtrips',()=>{
  for(const p of [[260,240],[800,500],[1000,200]]){
    const v=cameraView(),target=v.target.clone(),before=v.groundAt(...p);v.zoomAt(100,...p);assert.equal(v.zoom,4.8);assert.ok(v.groundAt(...p).distanceTo(before)<1e-8);
    v.zoomAt(1/4.8,...p);assert.equal(v.zoom,1);assert.ok(v.target.distanceTo(target)<1e-8);
    v.zoomAt(.00001,...p);assert.equal(v.zoom,.68);assert.ok(v.groundAt(...p).distanceTo(before)<1e-8);
  }
});
test('two-finger midpoint translation pans the anchored ground rather than rotating it or building',()=>{
  const v=cameraView(),before=v.groundAt(500,300),angle=v.angle,elevation=v.elevation;let builds=0;
  Object.assign(v.canvas,{style:{},setPointerCapture(){},addEventListener(){}});Object.assign(v,{handlers:{},pointers:new Map(),onCell:()=>builds++,onHover(){}});v.bindEvents();
  v.handlers.pointerdown({pointerId:1,clientX:400,clientY:300});v.handlers.pointerdown({pointerId:2,clientX:600,clientY:300});
  v.handlers.pointermove({pointerId:1,clientX:440,clientY:330});v.handlers.pointermove({pointerId:2,clientX:640,clientY:330});
  assert.ok(v.groundAt(540,330).distanceTo(before)<1e-8);assert.equal(v.angle,angle);assert.equal(v.elevation,elevation);assert.ok(v.target.length()>1);
  v.handlers.pointerup({pointerId:1,clientX:440,clientY:330});v.handlers.pointerup({pointerId:2,clientX:640,clientY:330});assert.equal(builds,0);assert.equal(v.pointers.size,0);
});

test('street details use all available city quarters with bounded, order-independent selection',()=>{
  const nodes=[];for(let x=0;x<32;x+=3)for(let z=0;z<32;z+=3)nodes.push({id:`${x},${z}`,x,z});const before=structuredClone(nodes);
  for(const cap of [6,8,16,20]){
    const sites=distributedStreetSites(nodes,32,cap),counts=[0,0,0,0];assert.equal(sites.length,cap);assert.equal(new Set(sites.map(p=>p.id)).size,cap);
    for(const p of sites)counts[(p.x>=16?1:0)+(p.z>=16?2:0)]++;
    assert.ok(Math.max(...counts)-Math.min(...counts)<=1);assert.deepEqual(sites,distributedStreetSites([...nodes].reverse(),32,cap));
  }
  assert.deepEqual(nodes,before);assert.deepEqual(distributedStreetSites([],32,20),[]);assert.deepEqual(distributedStreetSites(nodes,32,0),[]);
});

test('parked-car bays remain inside the real frontage and clear the entrance for every orientation',()=>{
  for(const [w,d]of [[2,2],[3,2]])for(const [dx,dz]of [[0,1],[0,-1],[1,0],[-1,0]]){
    const b={x:5,z:8},layout=plotLandscape(b,{id:'shop',footprint:[w,d],category:'basic'},{dx,dz});assert.equal(layout.parkingBays.length,2);
    for(const p of layout.parkingBays){
      assert.ok(p.x-.135>=b.x-.5&&p.x+.135<=b.x+w-.5);assert.ok(p.z-.135>=b.z-.5&&p.z+.135<=b.z+d-.5);
      const u=(p.x-(b.x+(w-1)/2))*dz-(p.z-(b.z+(d-1)/2))*dx;assert.ok(Math.abs(u)>.6);assert.ok(Number.isFinite(p.heading));
    }
  }
});

test('street cars and park palms reuse original geometry/materials, obey low budgets and release their owners once',async()=>{
  const geometry=new T.BoxGeometry(.3,.3,.8),material=new T.MeshStandardMaterial({color:'red'}),source=new T.Group();source.add(new T.Mesh(geometry,material));
  const palmGeometry=new T.BoxGeometry(.2,3.8,.2),palmMaterial=new T.MeshStandardMaterial({color:'green'}),palmSource=new T.Group();palmSource.add(new T.Mesh(palmGeometry,palmMaterial));
  const models=new LocalModels({loader:{async loadAsync(url){return {scene:String(url).includes('palm-tree')?palmSource:source};}}}),carSpec={path:'assets/models/car-a-512.glb',scale:.38,rotationY:-90};await models.load(carSpec);await models.load('assets/models/palm-tree-512.glb');
  const types=new Map([['shop',{id:'shop',footprint:[2,2],category:'basic',requiresRoad:true}],['park',{id:'park',footprint:[2,2],visual:{kind:'park'},category:'basic',requiresRoad:true}],['road',{id:'road',isRoad:true,footprint:[1,1]}]]);
  const buildings=[{id:'s',typeId:'shop',x:3,z:3},{id:'p',typeId:'park',x:6,z:3},...Array.from({length:8},(_,x)=>({id:'r'+x,typeId:'road',x,z:5}))],before=structuredClone(buildings),scene=new T.Scene(),streets=new CityStreets(scene,.34,models,{vehicleModels:models,carSpec});
  streets.rebuild(buildings,16,id=>types.get(id));assert.equal(streets.metrics().parkedCars,2);assert.ok(streets.metrics().streetTrees>=3);assert.equal(streets.parked.length,1);
  for(const mesh of streets.parked){assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);}for(const mesh of streets.palms){assert.equal(mesh.geometry,palmGeometry);assert.equal(mesh.material,palmMaterial);}
  const paving=streets.batches.find(m=>m.name==='City paving');assert.equal(paving.geometry.attributes.streetSurface.count,paving.count);assert.ok([...paving.geometry.attributes.streetSurface.array].includes(1));assert.ok([...paving.geometry.attributes.streetSurface.array].includes(2));
  streets.quality='low';streets.rebuild(buildings,16,id=>types.get(id));assert.ok(streets.metrics().parkedCars<=2);assert.ok(streets.parked.every(mesh=>!mesh.castShadow));assert.deepEqual(buildings,before);
  let releases=0;for(const r of [geometry,material,palmGeometry,palmMaterial])r.addEventListener('dispose',()=>releases++);streets.dispose();streets.dispose();assert.equal(releases,0);assert.equal(scene.children.length,0);models.dispose();assert.equal(releases,4);
});

test('photographic street maps tolerate failure and late completion, with idempotent owned cleanup',async()=>{
  const pending=[],surfaces=streetSurfaces({load(url,ok,progress,fail){pending.push({url,ok,fail});}});assert.equal(pending.length,2);let releases=0;surfaces.material.addEventListener('dispose',()=>releases++);surfaces.dispose();surfaces.dispose();
  for(const p of pending){const map=new T.Texture();map.addEventListener('dispose',()=>releases++);p.ok(map);}assert.equal(await surfaces.ready,false);assert.equal(releases,3);
  const failed=streetSurfaces({load(url,ok,progress,fail){fail();}});assert.equal(await failed.ready,false);failed.dispose();
});

function rendererFixture(){
  const calls=[],info={autoReset:true,render:{calls:0},reset(){this.render.calls=0;}};let target=null;
  return {calls,info,capabilities:{isWebGL2:true,maxSamples:4},extensions:{has:()=>true},getDrawingBufferSize:v=>v.set(2560,1440),getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},render(scene,camera){if(info.autoReset)info.reset();info.render.calls++;calls.push({scene,camera,target});}};
}
test('depth occlusion bounds render memory, preserves source materials and skips low/unsupported devices',()=>{
  const renderer=rendererFixture(),fx=new CityOcclusion(renderer),scene=new T.Scene(),source=new T.MeshStandardMaterial(),mesh=new T.Mesh(new T.BoxGeometry(),source),camera=new T.OrthographicCamera(-25,25,14,-14,.1,180);scene.add(mesh);
  assert.equal(fx.render(scene,camera),true);assert.equal(renderer.calls.length,2);assert.equal(renderer.info.render.calls,2);assert.equal(renderer.getRenderTarget(),null);assert.equal(renderer.info.autoReset,true);assert.equal(mesh.material,source);assert.ok(fx.target.width<=1440&&fx.target.height<=1440);
  assert.equal(fx.render(scene,camera,'low'),false);assert.equal(fx.metrics().extraPasses,0);assert.equal(renderer.calls.length,2);
  let releases=0;for(const r of [fx.target,fx.target.depthTexture,fx.geometry,fx.material])r.addEventListener('dispose',()=>releases++);fx.dispose();fx.dispose();assert.equal(releases,4);assert.equal(fx.render(scene,camera),false);
  const unsupported=new CityOcclusion({capabilities:{isWebGL2:false}});assert.equal(unsupported.render(scene,camera),false);unsupported.dispose();source.dispose();mesh.geometry.dispose();
});
test('failed final pass restores the renderer target and frame statistics policy',()=>{
  const renderer=rendererFixture(),fx=new CityOcclusion(renderer),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1),originalRender=renderer.render;let frames=0;
  renderer.render=(...args)=>{if(++frames===2)throw Error('simulated context failure');originalRender(...args);};assert.throws(()=>fx.render(scene,camera),/simulated/);assert.equal(renderer.getRenderTarget(),null);assert.equal(renderer.info.autoReset,true);fx.dispose();
});
test('a failed optional pass is disposed and the unchanged scene still renders directly',()=>{
  const renderer=rendererFixture(),fx=new CityOcclusion(renderer),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1),originalRender=renderer.render;let frames=0;
  renderer.render=(...args)=>{if(++frames===2)throw Error('optional effect unavailable');originalRender(...args);};
  assert.doesNotThrow(()=>IslandView.prototype.renderWorld.call({renderer,occlusion:fx,scene,camera,quality:'high'}));assert.equal(fx.disposed,true);assert.equal(renderer.getRenderTarget(),null);assert.equal(renderer.calls.at(-1).scene,scene);assert.equal(renderer.info.autoReset,true);
});
test('building contact shadows follow the actual rotated model bounds rather than a larger saved plot',()=>{
  const group=new T.Group(),source=new T.Mesh(new T.BoxGeometry(2,1,3),new T.MeshStandardMaterial());group.add(source);group.position.set(10,.34,12);group.rotation.y=Math.PI/2;
  const mesh=new T.InstancedMesh(new T.PlaneGeometry(),new T.MeshBasicMaterial(),2),v={contactShadows:mesh,groups:new Map([['home',{group}]]),definition:()=>({footprint:[4,4]})};
  IslandView.prototype.updateContactShadows.call(v,[{id:'home',typeId:'house',x:1,z:1}]);assert.equal(mesh.count,1);const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3();mesh.getMatrixAt(0,m);m.decompose(p,new T.Quaternion(),s);
  assert.ok(Math.abs(p.x-10)<1e-6&&Math.abs(p.z-12)<1e-6);assert.ok(Math.abs(s.x-3.35)<1e-6&&Math.abs(s.y-2.35)<1e-6);source.geometry.dispose();source.material.dispose();mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});

test('the two new street photographs fit a 500KB download budget with CC0 provenance',async()=>{
  const root=new URL('../workout/island/assets/textures/',import.meta.url);let total=0;
  for(const file of ['city-asphalt.jpg','city-pavers.jpg'])total+=(await stat(new URL(file,root))).size;
  assert.ok(total<500000);const source=await readFile(new URL('STREET-SOURCES.txt',root),'utf8');assert.match(source,/CC0/);assert.match(source,/polyhaven.com\/a\/pavement_05/);
});
