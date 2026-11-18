// 13/11/2026: the Codex plane, helicopter (naval-air-models-v1) and supply buoy (naval-extras-v1) replace the procedural shapes in the
// ships game, behind `?navalAssets=0`. Runtime copies are byte-identical to the delivered packs and are in the offline list; the
// helicopter's still parts are merged to one draw call; the buoy's point light is dropped; the views fall back to the boxes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {createNavalAssets,navalAssetsEnabled,navalHeliTemplate,navalTriangles,navalMeshCount,NAVAL_ASSET_FILES,NAVAL_ASSET_SCALE} from '../workout/island/minigames/naval-assets.mjs';
import {createNavalAirView} from '../workout/island/minigames/naval-air-view.mjs';
import {createNavalSupplyView} from '../workout/island/minigames/naval-supply-view.mjs';

// GLTFLoader's texture path reads `self` (a browser global); in node the atlas image itself cannot load, and the loader goes on without it.
globalThis.self??=globalThis;
const island=new URL('../workout/island/',import.meta.url),read=f=>readFile(new URL(f,island));
const balance=JSON.parse(await readFile(new URL('data/config.json',island),'utf8')).minigames.navalDuel;
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=async file=>{const b=await read(file),ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);const errors=console.error;console.error=()=>{};try{return await new Promise((res,rej)=>new GLTFLoader().parse(ab,'',res,rej));}finally{console.error=errors;}};
/** A loader that parses the runtime copies from disk (no network in node; the atlas image cannot load here, which the buoy survives). */
const diskLoader=(calls=[])=>({loadAsync:async url=>{calls.push(url);const name=Object.values(NAVAL_ASSET_FILES).find(f=>url.includes(f.split('/').pop()));if(!name)throw Error('unknown '+url);return parse(name);}});

test('flag: on by default, off with ?navalAssets=0 only',()=>{
 assert.equal(navalAssetsEnabled(''),true);assert.equal(navalAssetsEnabled('?dev=1&navalLock=0'),true);assert.equal(navalAssetsEnabled('?navalAssets=0'),false);
});

test('runtime copies: byte-identical to the Codex packs (the design folders are untouched), listed for offline, licensed',async()=>{
 const pairs={'assets/game-naval/models/plane.glb':'design/naval-air-models-v1/plane.glb','assets/game-naval/models/helicopter.glb':'design/naval-air-models-v1/helicopter.glb','assets/game-naval/models/supply_buoy.glb':'design/naval-extras-v1/supply_buoy.glb','assets/game-naval/models/naval_atlas_1024.png':'design/naval-extras-v1/naval_atlas_1024.png'};
 for(const [run,src] of Object.entries(pairs))assert.equal(sha(await read(run)),sha(await read(src)),run);
 const extras=JSON.parse(await read('design/naval-extras-v1/manifest.json'));assert.equal(sha(await read('assets/game-naval/models/supply_buoy.glb')),extras.models.find(m=>m.id==='supply_buoy').sha256,'the manifest hash of the buoy');
 const offline=JSON.parse(await read('offline-manifest.json'));for(const f of Object.values(NAVAL_ASSET_FILES))assert.ok(offline.games.naval.includes(f),f);assert.ok(offline.shell.includes('minigames/naval-assets.mjs'));
 const licenses=String(await read('assets/game-naval/LICENSES.md'));for(const f of ['plane.glb','helicopter.glb','supply_buoy.glb','naval_atlas_1024.png'])assert.ok(licenses.includes(f),f);
});

test('models: within the Codex triangle budgets; the helicopter merges its still parts into one draw call and keeps both rotors at their pivots',async()=>{
 const plane=await parse(NAVAL_ASSET_FILES.plane),heli=await parse(NAVAL_ASSET_FILES.heli);
 assert.equal(navalTriangles(plane.scene),1096);assert.equal(navalMeshCount(plane.scene),2);assert.ok(plane.scene.getObjectByName('propeller'));
 assert.equal(navalTriangles(heli.scene),1480);assert.equal(navalMeshCount(heli.scene),6);
 const {template,owned}=navalHeliTemplate(heli.scene);assert.equal(navalMeshCount(template),3,'still parts + rotor + tail rotor');assert.equal(navalTriangles(template),1480,'no triangle lost');assert.equal(owned.length,1);
 const size=new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-7.6)<.05&&Math.abs(size.z-7.6)<.05,'rotor 7.6 wide, the game\'s units');
 for(const name of ['rotor','tailRotor']){const a=template.getObjectByName(name),b=heli.scene.getObjectByName(name);const pa=a.getWorldPosition(new THREE.Vector3()),pb=b.getWorldPosition(new THREE.Vector3());assert.ok(pa.distanceTo(pb)<1e-6,name+' pivot kept');}
 const p=new THREE.Box3().setFromObject(plane.scene).getSize(new THREE.Vector3());assert.ok(Math.abs(p.z-5.6)<.2&&Math.abs(p.x-8.6)<.05,`plane ${p.x.toFixed(2)} x ${p.z.toFixed(2)}`);
});

test('loader: one load per kind, clones share geometry and material, the buoy drops its point light and is scaled to the game; disabled loads nothing',async()=>{
 const calls=[],a=createNavalAssets({enabled:true,loader:diskLoader(calls)});
 assert.equal(a.instance('plane'),null,'nothing before the load');const [p,h,b]=await Promise.all([a.load('plane'),a.load('heli'),a.load('buoy')]);await a.load('plane');
 assert.ok(p&&h&&b);assert.equal(calls.length,3,'each file once');assert.ok(calls.every(u=>/\?v=island-v2-/.test(u)),'versioned urls');
 const one=a.instance('heli'),two=a.instance('heli');assert.equal(one.userData.meshes[0].geometry,two.userData.meshes[0].geometry);assert.ok(one.userData.rotor&&one.userData.tail);
 const buoy=a.instance('buoy');let lights=0;buoy.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0,'no point light in the scene');assert.ok(buoy.userData.meshes.every(m=>m.userData.noReflect),'kept out of the reflection pass');
 assert.equal(buoy.children[0].scale.x,NAVAL_ASSET_SCALE.buoy);assert.ok(buoy.userData.lens,'the amber lens can blink');assert.equal(navalMeshCount(buoy),2);
 assert.deepEqual(a.metrics().meshes,{plane:2,heli:3,buoy:2});a.dispose();assert.equal(a.instance('plane'),null,'nothing after dispose');
 const off=createNavalAssets({enabled:false,loader:{loadAsync(){throw Error('must not load');}}});assert.equal(await off.load('plane'),null);assert.equal(off.instance('plane'),null);
 const broken=createNavalAssets({enabled:true,loader:{loadAsync:async()=>{throw Error('404');}}});assert.equal(await broken.load('heli'),null);assert.equal(broken.failed('heli'),true);
});

test('views: the boxes until the models load, then the models (hit flash, spinning rotors, blinking lens); falling back keeps the boxes',async()=>{
 const scene=new THREE.Scene(),assets=createNavalAssets({enabled:true,loader:diskLoader()});
 const air=[{id:1,kind:'heli',x:200,z:10,h:20,vx:-10,vz:0,hp:2,maxHp:2,hit:0,state:'fly'},{id:2,kind:'plane',x:220,z:-30,h:22,vx:-20,vz:1,hp:2,maxHp:2,hit:.2,state:'fly'}];
 const model={vulcan:{tracers:[]},air,time:1,playerShip:{x:60,z:0},buoys:[{x:90,z:5}],magazines:{ammo:[13]}};
 const view=createNavalAirView(scene,model,balance,{assets}),buoys=createNavalSupplyView(scene,model,balance,{assets});
 view.update();buoys.update();assert.deepEqual(view.metrics().models,{glb:0,procedural:2},'boxes while loading');assert.equal(buoys.metrics().model,'procedural');
 await Promise.all([assets.load('plane'),assets.load('heli'),assets.load('buoy')]);
 model.time=1.2;view.update();buoys.update();assert.deepEqual(view.metrics().models,{glb:2,procedural:0},'the models replace the boxes');assert.equal(buoys.metrics().model,'glb');
 let flashed=0,rotor=null;scene.traverse(o=>{if(o.isMesh&&o.material.isMeshBasicMaterial&&o.material.color.getHexString()==='fff1c2')flashed++;if(o.name==='rotor')rotor=o;});assert.ok(flashed>=2,'the hit plane flashes on every mesh');
 const r0=rotor.rotation.y;model.time=1.3;view.update();assert.notEqual(rotor.rotation.y,r0,'the rotor spins');
 view.dispose();buoys.dispose();
 const fallback=createNavalAssets({enabled:true,loader:{loadAsync:async()=>{throw Error('offline');}}}),scene2=new THREE.Scene(),v2=createNavalAirView(scene2,{...model,time:1},balance,{assets:fallback});
 await fallback.load('heli');v2.update();assert.deepEqual(v2.metrics().models,{glb:0,procedural:2},'a failed load keeps the boxes');v2.dispose();
});
