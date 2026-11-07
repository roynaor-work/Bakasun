import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {LocalModels,fitModel} from '../workout/island/view/local-models.mjs';
import {CITY_FILES,CITY_MAP,CITY_CARS,CITY_DIR,CityModels,citySpec,carSpec,cityModelPath,cityModelsEnabled,modelIdFor,FOOTPRINT_MARGIN,MAX_HEIGHT_TILES} from '../workout/island/view/city-models.mjs';

const island=new URL('../workout/island/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('assets/models/city/catalog.json',island),'utf8'));
const buildings=JSON.parse(await readFile(new URL('data/buildings.json',island),'utf8'));
const config=JSON.parse(await readFile(new URL('data/config.json',island),'utf8'));
const footprintOf=id=>buildings.find(b=>b.id===id)?.footprint||config.buildings[id]?.footprint||[1,1];
const levelsOf=id=>buildings.find(b=>b.id===id)?.levels?.length||1;
const measureLoader=new GLTFLoader().register(()=>({name:'MEASURE_GEOMETRY',loadMaterial:()=>Promise.resolve(new T.MeshBasicMaterial())}));
const parse=async path=>{const bytes=await readFile(new URL(path,island));return measureLoader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};

test('58 compressed city models fit the budget and need no WebAssembly decoder', async()=>{
  assert.equal(catalog.models.length,58);let total=0;
  for(const m of catalog.models){
    const size=(await stat(new URL(CITY_DIR+m.file,island))).size;total+=size;
    assert.equal(size,m.bytes,m.file);assert.ok(size<=400_000,`${m.file} ${size}`);
    const bytes=await readFile(new URL(CITY_DIR+m.file,island)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    // The island CSP (script-src 'self') blocks WebAssembly, so meshopt/Draco must not be required.
    assert.deepEqual((json.extensionsRequired||[]).filter(x=>x!=='KHR_mesh_quantization'),[],m.file);
    assert.equal(json.images.length,1);assert.equal(json.images[0].mimeType,'image/jpeg');
  }
  assert.ok(total<=15_000_000,`city models weigh ${total}`);assert.ok(total/58<=300_000,'average above 300 KB');assert.equal(total,catalog.bytes);
  assert.ok(total<137_000_000/8);
});
test('module table matches the catalog and every mapped building is real', () => {
  for(const [id,[file,meters]] of Object.entries(CITY_FILES)){
    const row=catalog.models.find(m=>m.id===Number(id));assert.ok(row,`model ${id}`);
    assert.equal(file+'.glb',row.file);assert.equal(meters,row.suggestedLongestSideM);
  }
  for(const [building,list] of Object.entries(CITY_MAP)){
    assert.ok(buildings.some(b=>b.id===building),building);assert.ok(list.length<=levelsOf(building),`${building} has ${levelsOf(building)} levels`);
    for(const id of list)assert.ok(CITY_FILES[id],`${building}→${id}`);
  }
  for(const id of CITY_CARS)assert.ok(CITY_FILES[id]);
  assert.ok(CITY_FILES[47]&&cityModelPath(49)===null,'49 (fire truck) belongs to the fire game and ships in the catalog only');
  assert.ok(catalog.models.find(m=>m.id===49));
});
test('?cityModels=0 and the featureFlags switch turn the layer off',()=>{
  assert.equal(cityModelsEnabled('',{}),true);assert.equal(cityModelsEnabled('?cityModels=0'),false);assert.equal(cityModelsEnabled('?dev=1&cityModels=0&x=1'),false);
  assert.equal(cityModelsEnabled('?cityModels=1'),true);assert.equal(cityModelsEnabled('',{cityModels:false}),false);
  const off=new CityModels(new LocalModels({loader:{}}),{enabled:false});assert.equal(off.maps('house'),false);assert.equal(off.spec({id:'house',footprint:[2,2]},1),null);
  const record={id:'house',footprint:[2,2],levels:[{}]};assert.equal(off.recordFor(record,1),record);
});
test('levels pick their own model and repeat the last one',()=>{
  assert.deepEqual([1,2,3,4].map(l=>modelIdFor('house',l)),[1,4,5,7]);assert.equal(modelIdFor('hospital',3),30);assert.equal(modelIdFor('road',1),null);assert.equal(modelIdFor('house',9),7);
});
test('every mapped model fits its plot after fitModel: inside the footprint, capped height, base on the ground',async()=>{
  for(const [building,list] of Object.entries(CITY_MAP))for(const [i,id] of list.entries()){
    const record={id:building,footprint:footprintOf(building)},[w,d]=record.footprint,spec=citySpec(record,i+1);
    const gltf=await parse(spec.path),root=fitModel(gltf.scene.clone(true),spec,spec.fit);root.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3());
    assert.ok(size.x<=w*FOOTPRINT_MARGIN+1e-3&&size.z<=d*FOOTPRINT_MARGIN+1e-3,`${building}→${id} ${size.x.toFixed(2)}x${size.z.toFixed(2)} in ${w}x${d}`);
    assert.ok(size.y<=MAX_HEIGHT_TILES+1e-3,`${building}→${id} height ${size.y.toFixed(2)}`);
    assert.ok(Math.abs(box.min.y)<1e-3,`${building}→${id} base ${box.min.y}`);
    const center=box.getCenter(new T.Vector3());assert.ok(Math.abs(center.x)<1e-3&&Math.abs(center.z)<1e-3,`${building}→${id} centred`);
    assert.ok(Math.max(size.x,size.z)<=CITY_FILES[id][1]/6.4+1e-3,`${building}→${id} larger than its real size`);
  }
});
test('cars keep the original length per metre and face the same way',async()=>{
  const old=await parse('assets/models/car-a-512.glb'),oldRoot=fitModel(old.scene.clone(true),{rotationY:-90,scale:.38},{}),a=new T.Box3().setFromObject(oldRoot).getSize(new T.Vector3());
  const spec=carSpec(47),root=fitModel((await parse(spec.path)).scene.clone(true),spec,spec.fit),b=new T.Box3().setFromObject(root).getSize(new T.Vector3());
  assert.equal(spec.rotationY,-90);assert.ok(b.z>b.x,'long axis along Z after the quarter turn');assert.ok(Math.abs(b.z-a.z)<.05,`${b.z} vs ${a.z}`);
});
test('models load only when requested, once, and a failed model falls back to the older one',async()=>{
  const requested=[],oldScene=()=>{const g=new T.Group();g.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial()));return g;};
  const models=new LocalModels({loader:{async loadAsync(url){requested.push(new URL(url).pathname.split('/').pop());if(url.includes('/city/'))throw Error('missing');return {scene:oldScene(),animations:[]};}}});
  const city=new CityModels(models),loaded=[];city.onLoaded=spec=>loaded.push(spec.path);
  const shop={id:'shop',footprint:[2,2],model:{path:'assets/models/shop-corner-512.glb',rotationY:0,scale:.97},levels:[{model:null}]};
  assert.deepEqual(requested,[],'constructing loads nothing');
  assert.equal(city.key(shop,1),'');assert.ok(city.recordFor(shop,1).model.path.endsWith('09-corner-shop.glb'));
  city.request(shop,1);city.request(shop,1);await models.pending.get(CITY_DIR+'09-corner-shop.glb');
  assert.deepEqual(requested,['09-corner-shop.glb','shop-corner-512.glb'],'one request each, the fallback only after the failure');
  assert.deepEqual(loaded,[CITY_DIR+'09-corner-shop.glb']);
  assert.equal(city.key(shop,1),'assets/models/shop-corner-512.glb');
  assert.ok(models.create(city.recordFor(shop,1).model),'the older model is built in its place');
  // A building the city does not map never triggers a request.
  city.request({id:'road',footprint:[1,1]},1);assert.equal(requested.length,2);
});
