/** Naval v7 ships (GPT package, original CC0 art). One Draco decoder, one GLB per
 * ship kind, and ONE atlas per fleet shared by every instance. Everything is optional:
 * any failure rejects the promise and the caller keeps the earlier Meshy boats.
 * Off switch: ?navalV7=0 in the page address, or adapters.navalV7===false. */
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {HoopsDRACOLoader} from './hoops-draco.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {dataURL} from '../release.mjs?v=island-v2-20261107-5';

export const NAVAL_V7={
  // Player: LOD0 destroyer (articulated turret). Enemies: LOD1, one draw call each.
  ships:{destroyer:{file:'assets/naval-v7/ships/destroyer-lod0.glb',turret:true},corvette:{file:'assets/naval-v7/ships/corvette-lod1.glb'},carrier:{file:'assets/naval-v7/ships/carrier-lod1.glb'},cruiser:{file:'assets/naval-v7/ships/cruiser-lod1.glb'}},
  fleets:{tide:'assets/naval-v7/textures/fleet-tide-1024.png',ember:'assets/naval-v7/textures/fleet-ember-1024.png'},
  // Which v7 hull stands in for which existing ship type (index in balance.shipTypes) and the boss.
  kinds:{player:'destroyer',0:'corvette',1:'carrier',2:'corvette',boss:'cruiser'}
};
const BLANK=new URL('../assets/naval-v7/textures/blank-1.png',import.meta.url).href; // 1px stub, same origin (CSP connect-src 'self')

export function navalV7Enabled(search=globalThis.location?.search||'',adapters={}) {
  if(adapters.navalV7===false)return false;
  try{return new URLSearchParams(search).get('navalV7')!=='0';}catch{return true;}
}

export function createNavalV7(adapters={}) {
  const root=new URL('../',import.meta.url);
  const manager=new T.LoadingManager();
  // The GLBs name their atlas; the two atlases are loaded once below, so every other image request is answered with a 1px stub file.
  manager.setURLModifier(path=>{if(path.startsWith('data:')||path.startsWith('blob:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local naval resources only');return /\.(png|jpe?g|webp)$/i.test(url.pathname)?BLANK:url.href;});
  let draco=null,loader=null,disposed=false;
  const glbs=new Map(),atlases=new Map(),geometries=new Set(),stubTextures=new Set(),ownedMaterials=new Set();
  function gltfLoader(){
    if(loader)return loader;
    draco=new HoopsDRACOLoader(manager);draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
    loader=adapters.loader||new GLTFLoader(manager).setDRACOLoader(draco);return loader;
  }
  function atlas(fleet){
    if(!atlases.has(fleet)){
      const path=NAVAL_V7.fleets[fleet];
      atlases.set(fleet,new Promise((resolve,reject)=>{
        if(!path)return reject(Error('unknown fleet '+fleet));
        new T.TextureLoader().load(dataURL(path,root).href,tex=>{tex.flipY=false;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;tex.generateMipmaps=true;tex.minFilter=T.LinearMipmapLinearFilter;resolve(tex);},undefined,()=>reject(Error('naval atlas '+fleet)));
      }));
    }
    return atlases.get(fleet);
  }
  function glb(name){
    if(!glbs.has(name)){
      const spec=NAVAL_V7.ships[name];
      glbs.set(name,spec?loadHoopsGLTF(gltfLoader(),dataURL(spec.file,root).href).then(g=>{g.scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of [].concat(n.material||[]))for(const v of Object.values(m))if(v?.isTexture)stubTextures.add(v);});return g.scene;}):Promise.reject(Error('unknown ship '+name)));
    }
    return glbs.get(name);
  }
  /** A ready-to-add Group, bow on -Z, waterline at Y=0, scaled to `length` world units.
   * Geometry and the atlas are shared; materials are per instance (so damage tint stays per ship). */
  async function ship(name,{fleet='tide',length=7.6}={}) {
    if(disposed)throw Error('naval v7 disposed');
    const [src,map]=await Promise.all([glb(name),atlas(fleet)]);
    if(disposed)throw Error('naval v7 disposed');
    const model=src.clone(true),materials=[],clones=new Map();
    model.traverse(n=>{if(!n.isMesh)return;const old=n.material;if(!clones.has(old)){const m=old.clone();m.map=map;m.color?.set('#ffffff');m.needsUpdate=true;clones.set(old,m);materials.push(m);ownedMaterials.add(m);}n.material=clones.get(old);n.castShadow=false;n.receiveShadow=false;});
    const wrap=new T.Group();wrap.rotation.y=Math.PI; // v7 bow is +Z, the game's is -Z
    wrap.add(model);wrap.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(wrap),size=box.getSize(new T.Vector3());
    if(!Number.isFinite(size.z)||size.z<=0)throw Error('invalid naval v7 bounds');
    const k=length/size.z,out=new T.Group();out.scale.setScalar(k);out.add(wrap);out.updateMatrixWorld(true);
    let turret=null;const pivot=new T.Vector3(0,1.8,-2.1);
    if(NAVAL_V7.ships[name].turret){turret=model.getObjectByName('turret_0')||null;if(turret){turret.getWorldPosition(pivot);/* out sits at the vessel origin, so world = vessel space */}}
    return {root:out,turret,pivot,materials,length,dispose(){out.removeFromParent();for(const m of materials){m.dispose();ownedMaterials.delete(m);}}};
  }
  return {ship,get disposed(){return disposed;},
    dispose(){if(disposed)return;disposed=true;for(const m of ownedMaterials)m.dispose();for(const g of geometries)g.dispose();for(const t of stubTextures)t.dispose();for(const p of atlases.values())p.then(t=>t.dispose(),()=>{});draco?.dispose();}};
}
