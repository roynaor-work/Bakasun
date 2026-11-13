/** 13/11/2026 (Codex packs naval-air-models-v1 and naval-extras-v1, CC0): the attack plane, the helicopter and the supply buoy are
 * the Codex GLB models instead of procedural boxes. Runtime copies live in assets/game-naval/models (the design folders stay as they
 * were delivered). One load per view, every aircraft or buoy is a clone that shares geometry and material; the helicopter's four still
 * parts are merged into one draw call (body, cockpit, tail, skids), the rotors stay separate to spin, and the buoy's beacon light is
 * dropped (the amber lens is emissive anyway, and a point light would re-light the whole scene). Any failure keeps the procedural
 * shapes. `?navalAssets=0` keeps v22's procedural shapes and loads nothing. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-v2-20261107-11';
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-11';
import {dataURL} from '../release.mjs?v=island-v2-20261107-11';

export const navalAssetsEnabled=search=>polishValue('navalAssets',search)!=='0';
export const NAVAL_ASSET_FILES=Object.freeze({plane:'assets/game-naval/models/plane.glb',heli:'assets/game-naval/models/helicopter.glb',buoy:'assets/game-naval/models/supply_buoy.glb',atlas:'assets/game-naval/models/naval_atlas_1024.png'});
/** The buoy is modelled in metres (1.1 wide, 1.3 tall); the game's buoy is about twice that so it reads next to a 5.7-unit hull. */
export const NAVAL_ASSET_SCALE=Object.freeze({plane:1,heli:1,buoy:2});
const STILL_HELI=['body','cockpit','tail','skids'];

/** Triangles drawn by an object tree (indexed or not), for the budget metrics. */
export function navalTriangles(root){let n=0;root?.traverse?.(o=>{if(!o.isMesh||!o.geometry)return;const g=o.geometry,c=g.index?g.index.count:g.attributes.position?.count||0;n+=Math.floor(c/3)*(o.isInstancedMesh?o.count:1);});return n;}
/** Meshes (draw calls) in an object tree. */
export function navalMeshCount(root){let n=0;root?.traverse?.(o=>{if(o.isMesh)n++;});return n;}

/** Helicopter template: the still parts merged in the model's own space (one draw call), the two rotors kept at their pivots.
 * Returns the template and the geometry it owns (kept out of userData, which every clone copies as JSON). */
export function navalHeliTemplate(scene){
 scene.updateMatrixWorld(true);const parts=[],material=[];let rotor=null,tail=null;
 scene.traverse(o=>{if(!o.isMesh)return;if(o.name==='rotor'||o.parent?.name==='rotor')rotor??=o.name==='rotor'?o:o.parent;else if(o.name==='tailRotor'||o.parent?.name==='tailRotor')tail??=o.name==='tailRotor'?o:o.parent;else if(STILL_HELI.includes(o.name)||STILL_HELI.includes(o.parent?.name)){const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);parts.push(g);material.push(o.material);}});
 if(parts.length<STILL_HELI.length||!rotor||!tail)throw Error('helicopter parts missing');
 const keys=new Set(parts.flatMap(g=>Object.keys(g.attributes)));for(const g of parts)for(const k of keys)if(!g.attributes[k])throw Error('helicopter parts differ in '+k);
 const merged=mergeGeometries(parts,false);for(const g of parts)g.dispose();if(!merged)throw Error('helicopter merge failed');
 const out=new THREE.Group(),still=new THREE.Mesh(merged,material[0]);still.name='heliStill';out.add(still);
 for(const spin of [rotor,tail]){const copy=spin.clone(true);spin.updateMatrixWorld(true);spin.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);out.add(copy);}
 return {template:out,owned:[merged]};
}

export function createNavalAssets({enabled=navalAssetsEnabled(),loader=null}={}){
 const root=new URL('../',import.meta.url),jobs=new Map(),ready=new Map(),owned=new Set(),failed=new Set();let disposed=false,gltf=loader;
 const loaderFor=()=>gltf||(gltf=new GLTFLoader());
 function prepare(kind,scene){
  scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});
  if(kind==='heli'){const {template,owned:mine}=navalHeliTemplate(scene);for(const g of mine)owned.add(g);scene.traverse(o=>{if(o.isMesh){owned.add(o.material);owned.add(o.geometry);}});return template;}
  if(kind==='buoy'){const lights=[];scene.traverse(o=>{if(o.isLight)lights.push(o);});for(const l of lights)l.removeFromParent();scene.traverse(o=>{if(o.isMesh)o.userData.noReflect=true;});}
  scene.traverse(o=>{if(o.isMesh){owned.add(o.geometry);owned.add(o.material);for(const v of Object.values(o.material||{}))if(v?.isTexture)owned.add(v);}});
  return scene;
 }
 /** Start loading a kind (plane, heli, buoy); resolves to the template or null (procedural shapes stay). */
 function load(kind){
  if(!enabled||!NAVAL_ASSET_FILES[kind])return Promise.resolve(null);
  if(!jobs.has(kind))jobs.set(kind,loaderFor().loadAsync(dataURL(NAVAL_ASSET_FILES[kind],root).href).then(g=>{if(disposed)return null;const t=prepare(kind,g.scene);ready.set(kind,t);return t;}).catch(()=>{failed.add(kind);return null;}));
  return jobs.get(kind);
 }
 /** A clone of a loaded template, scaled to the game's units, or null while it is not loaded. Geometry and materials are shared. */
 function instance(kind){
  const t=ready.get(kind);if(!t||disposed)return null;const g=t.clone(true),s=NAVAL_ASSET_SCALE[kind]||1,out=new THREE.Group();g.scale.multiplyScalar(s);out.add(g);
  const meshes=[];out.traverse(o=>{if(o.isMesh){meshes.push(o);o.userData.base=o.material;}});
  out.userData={asset:kind,meshes,prop:out.getObjectByName('propeller')||null,rotor:out.getObjectByName('rotor')||null,tail:out.getObjectByName('tailRotor')||null,lens:out.getObjectByName('light')||null};
  return out;
 }
 return {enabled,load,instance,ready:kind=>ready.has(kind),failed:kind=>failed.has(kind),
  metrics(){return {enabled,ready:[...ready.keys()],failed:[...failed],triangles:Object.fromEntries([...ready].map(([k,t])=>[k,navalTriangles(t)])),meshes:Object.fromEntries([...ready].map(([k,t])=>[k,navalMeshCount(t)]))};},
  dispose(){if(disposed)return;disposed=true;for(const r of owned)r.dispose?.();owned.clear();ready.clear();}};
}
