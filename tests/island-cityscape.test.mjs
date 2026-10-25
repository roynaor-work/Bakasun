import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../workout/island/vendor/three.module.js';
import {cityRoadNetwork,citySidewalkPoint,createCityTraffic} from '../workout/island/view/city-traffic-model.mjs';
import {CityTraffic} from '../workout/island/view/city-traffic.mjs';
import {CityStreets} from '../workout/island/view/city-streets.mjs';

const definition=id=>id==='road'?{isRoad:true,footprint:[1,1]}:{footprint:[2,2],category:'services',visual:{kind:'house'}};
function roads(){const b=[];for(let x=1;x<20;x++)b.push({id:'h'+x,typeId:'road',x,z:7,level:1});for(let z=1;z<20;z++)if(z!==7)b.push({id:'v'+z,typeId:'road',x:10,z,level:1});return b;}
const network=()=>cityRoadNetwork(roads(),24,definition);
const advance=(model,seconds,dt=1/30)=>{for(let i=0;i<Math.round(seconds/dt);i++)model.step(dt);};

test('pedestrian positions follow connected pavement edges and retain path neighbor indices',()=>{
  const n=network(),cell={x:10,z:7,neighbors:[0,2,4,6]},original=structuredClone(cell),corner=citySidewalkPoint(cell,n);
  assert.deepEqual(corner.neighbors,cell.neighbors);assert.equal(corner.x,9.57);assert.equal(corner.z,6.57);assert.equal(corner.height,.158);
  const horizontal=citySidewalkPoint({x:4,z:7},n);assert.equal(horizontal.x,4);assert.equal(horizontal.z,6.57);
  const footpath=citySidewalkPoint({x:4,z:4},n);assert.equal(footpath.x,4);assert.equal(footpath.z,4);assert.equal(footpath.height,.0365);assert.deepEqual(cell,original);
});

test('city road graph uses actual saved roads, excludes cosmetic paths and never mutates a save',()=>{
  const b=roads();b.push({id:'house',typeId:'house',x:0,z:0,level:1},{id:'outside',typeId:'road',x:30,z:30,level:1});
  const before=JSON.stringify(b);for(const row of b)Object.freeze(row);Object.freeze(b);
  const n=cityRoadNetwork(b,24,definition);assert.equal(n.nodes.length,37);assert.equal(n.byCell.has('0,0'),false);assert.equal(n.byCell.has('30,30'),false);
  assert.equal(n.byCell.get('10,7').neighbors.length,4);assert.equal(n.byCell.get('1,7').neighbors.length,1);
  for(const p of n.nodes)for(const id of p.neighbors){const q=n.byCell.get(id);assert.equal(Math.abs(p.x-q.x)+Math.abs(p.z-q.z),1);assert.ok(q.neighbors.includes(p.id));}
  assert.equal(JSON.stringify(b),before);
});

test('isolated road fragments and empty islands cannot spawn decorative cars in the grass',()=>{
  for(const b of [[],[{typeId:'road',x:3,z:3}],[{typeId:'house',x:3,z:3}]]){
    const model=createCityTraffic(cityRoadNetwork(b,16,definition));advance(model,3);assert.equal(model.cars.length,0);model.dispose();
  }
});

test('traffic negotiates junctions and dead ends for four minutes without permanent deadlock or leaving saved road cells',()=>{
  const n=network(),model=createCityTraffic(n);let minGap=Infinity;
  for(let i=0;i<7200;i++){
    model.step(1/30);
    for(const c of model.cars){assert.ok(n.nodes.some(p=>Math.abs(p.x-c.x)<=.5&&Math.abs(p.z-c.z)<=.5),'car remains inside a real road cell');assert.ok(Number.isFinite(c.heading+c.speed));}
    for(let a=0;a<model.cars.length;a++)for(let b=a+1;b<model.cars.length;b++)minGap=Math.min(minGap,Math.hypot(model.cars[a].x-model.cars[b].x,model.cars[a].z-model.cars[b].z));
  }
  assert.ok(minGap>.2,'vehicles retain separation at a junction');
  for(const c of model.cars){assert.ok(c.travelled>100,'every vehicle continues beyond repeated junctions and U-turns');assert.ok(c.turns>50);}
  assert.ok(model.metrics().moving>0);model.dispose();
});

test('traffic follows equal seeded motion across 30, 60 and grouped rendering frames',()=>{
  const a=createCityTraffic(network()),b=createCityTraffic(network()),c=createCityTraffic(network());
  advance(a,20,1/30);advance(b,20,1/60);advance(c,20,1/10);
  assert.deepEqual(a.cars,b.cars);assert.deepEqual(a.cars,c.cars);
  a.dispose();b.dispose();c.dispose();
});

test('zero or invalid time cannot move traffic and disposal is idempotent',()=>{
  const model=createCityTraffic(network()),before=structuredClone(model.cars);
  for(const dt of [0,-1,NaN,Infinity])model.step(dt);assert.deepEqual(model.cars,before);
  model.dispose();model.dispose();advance(model,2);assert.equal(model.cars.length,0);assert.equal(model.metrics().disposed,true);
});

function sourceFixture(){
  const geometry=new T.BoxGeometry(.25,.18,.5),texture=new T.DataTexture(new Uint8Array([255,180,90,255]),1,1),material=new T.MeshStandardMaterial({map:texture,color:'#ad6344'}),source=new T.Group();
  source.add(new T.Mesh(geometry,material));let releases=0;geometry.addEventListener('dispose',()=>releases++);material.addEventListener('dispose',()=>releases++);texture.addEventListener('dispose',()=>releases++);
  return {source,geometry,material,texture,models:{create:()=>source.clone(true)},get releases(){return releases;},dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}

test('moving city vehicles preserve original shared model resources through edits, quality changes and closure',()=>{
  const f=sourceFixture(),scene=new T.Scene(),view=new CityTraffic(scene,f.models,{},.34),b=roads();
  const vertices=Array.from(f.geometry.attributes.position.array),map=f.material.map,color=f.material.color.getHex();
  view.sync(b,24,definition);assert.equal(view.metrics().cars,7);assert.equal(view.metrics().draws,1);
  const mesh=view.batches[0].mesh;view.update(.2);assert.equal(mesh.geometry,f.geometry);assert.equal(mesh.material,f.material);
  view.sync(b,24,definition);assert.equal(view.batches[0].mesh,mesh,'unrelated economy refresh retains all batches');
  view.quality='low';view.sync(b,24,definition);assert.equal(view.metrics().cars,3);assert.equal(view.batches[0].mesh.castShadow,false);
  view.sync([],24,definition);assert.equal(view.metrics().cars,0);assert.equal(scene.children.length,0);
  view.dispose();view.dispose();assert.equal(f.releases,0,'the owning model cache retains its materials, texture and geometry');
  assert.deepEqual(Array.from(f.geometry.attributes.position.array),vertices);assert.equal(f.material.map,map);assert.equal(f.material.color.getHex(),color);f.dispose();
});

test('street decoration follows topology, changes quality without changing placements, and releases owned resources once',()=>{
  const scene=new T.Scene(),streets=new CityStreets(scene,.34,{create:()=>null}),b=[...roads(),{id:'house',typeId:'house',x:4,z:4,level:1}],before=structuredClone(b);
  streets.rebuild(b,24,definition);assert.equal(streets.metrics().roads,37);assert.equal(streets.metrics().plots,1);assert.ok(streets.metrics().crossings>=4);assert.ok(streets.metrics().lamps>0);assert.ok(streets.metrics().draws<=3);
  const meshes=[...streets.batches],lamps=streets.metrics().lamps;streets.rebuild(b,24,definition);assert.deepEqual(streets.batches,meshes);
  streets.quality='low';streets.rebuild(b,24,definition);assert.ok(streets.metrics().lamps<=lamps);assert.ok(streets.batches.every(m=>!m.castShadow));assert.deepEqual(b,before);
  let releases=0;for(const resource of [streets.planeGeometry,streets.boxGeometry,streets.shrubGeometry,streets.material,streets.texture])resource.addEventListener('dispose',()=>releases++);
  streets.rebuild([],16,definition);assert.equal(streets.metrics().roads,0);assert.equal(scene.children.length,0);
  streets.dispose();streets.dispose();assert.equal(releases,5);assert.equal(streets.metrics().disposed,true);assert.equal(streets.metrics().draws,0);
});

test('street trees share the original Meshy geometry and material and leave their owner responsible for disposal',()=>{
  const f=sourceFixture(),streets=new CityStreets(new T.Scene(),.34,f.models);streets.rebuild(roads(),24,definition);
  assert.ok(streets.palms.length);assert.equal(streets.palms[0].geometry,f.geometry);assert.equal(streets.palms[0].material,f.material);
  streets.dispose();assert.equal(f.releases,0);f.dispose();
});
