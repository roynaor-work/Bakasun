// v24.7: the two Codex city packages (missions and events, staged building and progression)
// are wired from workout/island/assets/, each behind a URL flag that reverts it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {BUILDINGS} from '../workout/island/assets/city-progression-v1/catalog.mjs';
import missionCatalog from '../workout/island/assets/city-missions-v1/catalog.mjs';
import {loadCityMissions,missionStrings} from '../workout/island/assets/city-missions-v1/runtime.mjs';
import {prepareCityProgressData,cityProgressStorage,progressStrings,progressBuildingModel} from '../workout/island/assets/city-progression-v1/island-adapter.mjs';
import {packCityGLB} from '../workout/island/tools/city-buildings-pack.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file),'utf8');
const load=()=>loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const PACKAGES=['assets/city-missions-v1','assets/city-progression-v1'];
const STAGES=['foundation','half-built','complete'];
const memory=()=>{const m=new Map();return {get length(){return m.size;},getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null};};
const texts=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(texts):[];

test('city v24.7: both packages load from assets/ and each has its URL flag in app.mjs',async()=>{
  const app=await read('app.mjs');
  assert.match(app,/import\('\.\/assets\/city-missions-v1\/runtime\.mjs\?v=/);
  assert.match(app,/import\('\.\/assets\/city-progression-v1\/island-adapter\.mjs\?v=/);
  assert.match(app,/query\.get\('cityMissions'\) !== '0'/);
  assert.match(app,/query\.get\('cityProgression'\) === '1'/);
  for(const file of ['app.mjs','engine/engine.mjs','ui/interface.mjs','view/island-view.mjs'])assert.ok(!/design\/city-(?:missions|progression|buildings)/.test(await read(file)),file+' must not load a design/ package (not published)');
});

test('city v24.7: children privacy: no network, CDN, WASM or stored identifiers in the packages',async()=>{
  for(const dir of PACKAGES)for(const name of await readdir(path.join(island,dir))){
    const source=await read(dir+'/'+name);
    for(const banned of ['http://','https://','fetch(','XMLHttpRequest','WebSocket','sendBeacon','.wasm','WebAssembly','importScripts','eval(','new Function','document.cookie','indexedDB','navigator.'])assert.ok(!source.includes(banned),`${dir}/${name}: ${banned}`);
    for(const m of source.matchAll(/from\s+'([^']+)'/g))assert.match(m[1],/^\.{1,2}\//,`${dir}/${name} imports only local modules`);
  }
});

test('city v24.7: Hebrew strings have no exclamation marks and no Arabic letters',async()=>{
  const board=await read('assets/city-missions-v1/board.mjs');
  const literals=[...board.matchAll(/'([^'\n]*[֐-׿][^'\n]*)'|`([^`\n]*[֐-׿][^`\n]*)`/g)].map(m=>m[1]??m[2]);
  assert.ok(literals.length>10,'board strings found');
  const all=[...texts(missionCatalog),...texts(missionStrings),...texts(progressStrings),...texts(BUILDINGS),...literals];
  for(const text of all){assert.ok(!text.includes('!'),text);assert.ok(!/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text),text);}
});

test('city v24.7: packed building models: three stages for every building, small, no decoder needed, in the offline city pack',async()=>{
  const manifest=JSON.parse(await read('offline-manifest.json'));let bytes=0,count=0;
  for(const row of Object.values(BUILDINGS))for(const stage of STAGES){
    const file=`assets/city-buildings-v2/${row.assetId}-${stage}.glb`,glb=await readFile(path.join(island,file));
    assert.equal(glb.toString('ascii',0,4),'glTF',file);assert.equal(glb.readUInt32LE(8),glb.length,file);
    const doc=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
    assert.deepEqual(doc.extensionsRequired,['KHR_mesh_quantization'],file);
    assert.ok(doc.buffers.every(buffer=>!buffer.uri)&&!doc.images&&!doc.textures,file+' is self contained and untextured');
    assert.equal(doc.asset.copyright,'CC0-1.0',file);
    assert.deepEqual(Object.keys(doc.meshes[0].primitives[0].attributes).sort(),['COLOR_0','POSITION'],file);
    const triangles=doc.accessors[doc.meshes[0].primitives[0].indices].count/3;assert.ok(triangles>=200&&triangles<=800,file+' triangles '+triangles);
    assert.ok(manifest.games.city.includes(file),file+' is in the offline city pack');
    bytes+=glb.length;count++;
  }
  assert.equal(count,60);
  assert.equal((await readdir(path.join(island,'assets/city-buildings-v2'))).filter(name=>name.endsWith('.glb')).length,60,'no unused model is shipped');
  assert.ok(bytes<450_000,'models stay under 0.45 MB: '+bytes);
  const spec=progressBuildingModel({cityProgress:{activeSeconds:0,projects:{}}},{id:'b',level:2},{cityProgressAsset:'park',footprint:[2,2]});
  assert.equal(spec.path,'assets/city-buildings-v2/park-complete.glb');
  for(const dir of PACKAGES)assert.ok((await stat(path.join(island,dir))).isDirectory());
});

test('city v24.7: the packer keeps bounds and triangles and refuses smooth shading',()=>{
  // One flat quad (two triangles), float positions, flat normals, byte colours.
  const positions=[[0,0,0],[2,0,0],[2,0,2],[0,0,2]],indices=[0,2,1,0,3,2],bin=Buffer.alloc(48+48+16+12);
  positions.forEach((p,i)=>p.forEach((v,k)=>{bin.writeFloatLE(v,i*12+k*4);bin.writeFloatLE(k===1?1:0,48+i*12+k*4);}));
  for(let i=0;i<16;i++)bin[96+i]=200;indices.forEach((v,i)=>bin.writeUInt16LE(v,112+i*2));
  const doc={asset:{version:'2.0',copyright:'CC0-1.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'quad',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,material:0,mode:4}]}],materials:[{}],buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:48},{buffer:0,byteOffset:48,byteLength:48},{buffer:0,byteOffset:96,byteLength:16},{buffer:0,byteOffset:112,byteLength:12}],
    accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[0,0,0],max:[2,0,2]},{bufferView:1,componentType:5126,count:4,type:'VEC3'},{bufferView:2,componentType:5121,normalized:true,count:4,type:'VEC4'},{bufferView:3,componentType:5123,count:6,type:'SCALAR'}]};
  const glbOf=(document,binary)=>{let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);const head=Buffer.alloc(20),binHead=Buffer.alloc(8);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+binary.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);binHead.writeUInt32LE(binary.length,0);binHead.writeUInt32LE(0x004e4942,4);return Buffer.concat([head,json,binHead,binary]);};
  const packed=packCityGLB(glbOf(doc,bin));
  assert.equal(packed.triangles,2);assert.equal(packed.vertices,4);
  const out=JSON.parse(packed.glb.toString('utf8',20,20+packed.glb.readUInt32LE(12))),node=out.nodes[0],accessor=out.accessors[0];
  for(const k of [0,2]){assert.ok(Math.abs(accessor.min[k]*node.scale[k]+node.translation[k]-0)<1e-3);assert.ok(Math.abs(accessor.max[k]*node.scale[k]+node.translation[k]-2)<1e-3);}
  const smooth=Buffer.from(bin);smooth.writeFloatLE(1,48);smooth.writeFloatLE(0,52);
  assert.throws(()=>packCityGLB(glbOf(doc,smooth)),/flat/);
});

test('city v24.7: without the packages (both flags at 0) the engine is the ordinary city',async()=>{
  const storage=memory(),engine=createEngine(await load(),{storage,now:()=>1000});
  assert.equal(engine.cityMissions,undefined);assert.equal(engine.cityProgress(),null);
  engine.setAvatar({created:true});engine.skipTutorial();engine.tick(5);
  assert.ok(!('cityProgress' in engine.state)&&!('cityMissions' in engine.state));
  assert.ok(storage.getItem('island.v1'));assert.equal(storage.getItem('island.cityProgress.v1'),null);
  assert.ok(!engine.registry.buildings.has('bakery'),'no progression-only building in the ordinary city');
});

test('city v24.7: both packages together: a mission is offered, a staged build pays the mission once, the ordinary save is untouched',async()=>{
  const storage=memory(),plain=createEngine(await load(),{storage,now:()=>1000});
  plain.setAvatar({created:true});plain.skipTutorial();plain.save();
  const ordinary=storage.getItem('island.v1');
  const data=prepareCityProgressData(await load());
  const engine=createEngine(data,{storage:cityProgressStorage(storage),now:()=>1000,createCityMissions:loadCityMissions()});
  assert.ok(engine.cityMissions.ready());
  const active=engine.state.cityMissions.active;assert.ok(active,'one active mission');assert.equal(engine.cityMissions.definition(active).kind,'build');
  assert.equal(engine.cityProgress().day,1);
  // The first free cell the engine accepts (a node engine has no prepared plots).
  const build=typeId=>{for(let z=0;z<engine.state.world.size;z++)for(let x=0;x<engine.state.world.size;x++){const result=engine.place(typeId,x,z);if(result.ok)return result;}return {ok:false};};
  const before=engine.state.money,type=engine.registry.buildings.get(active.target),reward=engine.cityMissions.definition(active).reward;
  let announced=null;const stop=engine.subscribe((_,event)=>{if(event.cityMissionReward)announced=event.cityMissionReward;});
  const built=build(active.target);stop();assert.equal(built.ok,true);
  assert.deepEqual(announced,reward);assert.equal(engine.state.money,before-type.cost+(reward.money??0));
  assert.notEqual(engine.state.cityMissions.active?.token,active.token,'the board moved on');
  const id=build('park').id;assert.ok(id,'park placed');
  const stage=()=>engine.cityProgress().projects.find(row=>row.id===id)?.stage??'complete';
  assert.equal(stage(),'foundation');engine.tick(BUILDINGS.park.stageSeconds/3);assert.equal(stage(),'half-built');
  engine.tick(BUILDINGS.park.stageSeconds);assert.equal(stage(),'complete');
  assert.equal(storage.getItem('island.v1'),ordinary,'?cityProgression=0 opens the city exactly as it was');
  assert.ok(storage.getItem('island.cityProgress.v1'));
});
