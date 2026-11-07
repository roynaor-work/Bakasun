import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {AlpineDracoLoader} from './alpine-draco.mjs';
import {dataURL} from '../release.mjs';

/** Fire v7 (GPT/Codex): engine, crew, bystanders, hydrant and buildings by damage stage as Draco GLBs under
 * assets/fire-v7/ (runtime copies; nothing points at design/), plus 256px particle atlases.
 * Off: ?fireV7=0 or globalThis.__fireV7=false. Every piece is optional: a failed load leaves the earlier
 * art for that piece in place (fire-view.mjs falls back per piece). v7 files face +Z, metres, Y up.
 * Weight policy (design/fire-v7/WEIGHTS): buildings are merged per material (3-4 draw calls instead of 5-8),
 * all atlases of one family are one GPU texture, opaque PBR becomes Lambert, LOD1 files carry the far/steady
 * look and LOD0 is fetched lazily only for a burning lot close to the camera. */
export const V7_BASE='assets/fire-v7/';
export const TYPE_OF=Object.freeze({house:'row-house',apartment:'apartment',shop:'corner-store',cafe:'workshop',station:'warehouse'});
export const STAGES=Object.freeze(['intact','burning','scorched']);
/** LOD0 only exists for the burning stage in the runtime set (the focal state); all other stages are the -lod files. */
export const hasNear=stage=>stage==='burning';
export const buildingFile=(type,stage,near)=>`models/${type}-${stage}${near&&hasNear(stage)?'':'-lod'}.glb`;
export const NEAR_ENTER=9,NEAR_EXIT=10.5,CREW_FAR=24,CREW_FAR_EXIT=26.9; // metres from the camera focus, ±12% hysteresis
export const ATLAS_FILES=Object.freeze({flames:'particles/flame-256.png',smoke:'particles/smoke-256.png',embers:'particles/ember-256.png',drops:'particles/water-256.png',mist:'particles/steam-256.png'});

export function fireV7Enabled(search=globalThis.location?.search||'',flag=globalThis.__fireV7){
  if(flag===false)return false;
  return new URLSearchParams(search).get('fireV7')!=='0';
}
/** Pure LOD rule with hysteresis: `near` stays near until the distance passes `exit`, becomes near below `enter`. */
export function lodNear(distance,wasNear,enter=NEAR_ENTER,exit=NEAR_EXIT){return wasNear?distance<exit:distance<enter;}
/** Which damage stage a lot shows: burning while a flame near it is active, scorched afterwards, intact before. */
export function lotStage(flames,sites,lot,burned,radius=8){
  let nearest=-1,best=radius;
  for(let i=0;i<flames.length;i++){const s=sites[i];if(!s)continue;const d=Math.hypot(s[0]-lot.x,s[2]-lot.z);if(d<best){best=d;nearest=i;}}
  if(nearest<0)return burned?'scorched':'intact';
  const f=flames[nearest];
  if(f.active&&f.heat>0)return 'burning';
  return burned?'scorched':'intact';
}

const FAMILY=file=>/crew-/.test(file)?'crew':/engine-/.test(file)?'vehicle':'environment';

/** Local-only GLB loader with the island's static Draco worker (script-src 'self'). Adapters: {v7Loader:{loadAsync,dispose}}. */
export function createV7Loader(adapters={}){
  if(adapters.v7Loader)return adapters.v7Loader;
  const root=new URL('../',import.meta.url),manager=new T.LoadingManager();
  manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local fire resources only');return url.href;});
  const draco=new AlpineDracoLoader(manager).setDecoderPath(new URL('../vendor/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
  const loader=new GLTFLoader(manager).setDRACOLoader(draco);
  return {loadAsync:url=>loader.loadAsync(url),dispose(){draco.dispose();}};
}

const matKey=(m,g)=>[m.type,m.map?.uuid||'',m.color?.getHex?.()||0,m.vertexColors?1:0,m.transparent?1:0,m.opacity,m.alphaTest,m.side,m.depthWrite?1:0,m.blending,m.emissive?.getHex?.()||0,Object.keys(g.attributes).sort().join()].join('|');
/** Opaque/alpha PBR → Lambert (same map, colour, vertex colours, emissive); unlit Basic materials stay as the loader made them. */
function cheaper(m){
  if(!m.isMeshStandardMaterial)return m;
  const l=new T.MeshLambertMaterial({map:m.map,color:m.color,vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,side:m.side,depthWrite:m.depthWrite,emissive:m.emissive,emissiveMap:m.emissiveMap,emissiveIntensity:m.emissiveIntensity});
  l.name=m.name;m.dispose();return l;
}

/** One v7 runtime: loads files, shares atlases, bakes static pieces, owns every resource it makes. */
export function createFireV7({scene,balance,model,adapters={},canAdd=()=>true,lotBases=[],metricsOf=()=>({})}){
  const city=balance.city,r=balance.render,loader=createV7Loader(adapters),root=new T.Group();root.name='fire-v7';scene.add(root);
  const geometries=new Set(),materials=new Set(),textures=new Set(),families=new Map(),files=new Map(),templates=new Map();
  const stats={requested:0,loaded:0,failed:0,swaps:0,rejected:0,atlas:0,bytesNote:'see assets/fire-v7'};
  let disposed=false;
  const url=file=>dataURL(V7_BASE+file,new URL('../',import.meta.url)).href;
  function shareAtlas(file,object){
    // Every GLB embeds its own copy of the family atlas; keep the first and let the rest reuse it (1 GPU texture per family).
    const key=FAMILY(file);
    object.traverse(o=>{
      if(!o.material)return;
      for(const m of [].concat(o.material)){
        if(!m.map)continue;
        const first=families.get(key);
        if(!first){families.set(key,m.map);textures.add(m.map);m.map.anisotropy=1;stats.atlas++;}
        else if(first!==m.map){if(!textures.has(m.map))m.map.dispose();m.map=first;}
      }
    });
  }
  function fetchGlb(file){
    if(files.has(file))return files.get(file);
    stats.requested++;
    const p=(async()=>{
      try{
        const gltf=await loader.loadAsync(url(file));
        if(disposed){return null;}
        shareAtlas(file,gltf.scene);
        gltf.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)o.material=Array.isArray(o.material)?o.material.map(cheaper):cheaper(o.material);for(const m of [].concat(o.material||[]))materials.add(m);});
        stats.loaded++;return gltf;
      }catch{stats.failed++;return null;}
    })();
    files.set(file,p);return p;
  }
  /** Merge every static mesh of a loaded scene by material: a few draw calls per building instead of one per primitive. */
  function bake(file,gltf){
    const group=new T.Group();gltf.scene.updateMatrixWorld(true);
    const buckets=new Map(),kept=[];
    gltf.scene.traverse(o=>{
      if(!o.isMesh||o.isSkinnedMesh)return;
      if(Array.isArray(o.material)){kept.push(o);return;}
      const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
      const key=matKey(o.material,g),b=buckets.get(key)||{material:o.material,list:[]};b.list.push(g);buckets.set(key,b);
    });
    for(const {material,list} of buckets.values()){
      const merged=list.length>1?mergeGeometries(list,false):list[0];
      const parts=merged?[merged]:list; // incompatible primitives: keep them separate rather than fail
      if(merged&&list.length>1)for(const g of list)g.dispose();
      for(const g of parts){geometries.add(g);const mesh=new T.Mesh(g,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;group.add(mesh);}
    }
    for(const o of kept){const c=o.clone();group.add(c);}
    // The loaded scene's own geometries are superseded by the baked copies.
    gltf.scene.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh&&!Array.isArray(o.material)&&geometries.has(o.geometry)){geometries.delete(o.geometry);o.geometry.dispose();}});
    const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3());
    // Anchor at floor centre (v7 convention) and measure for the fit.
    return {group,size,box,file};
  }
  async function template(file){
    if(templates.has(file))return templates.get(file);
    const p=fetchGlb(file).then(g=>g&&!disposed?bake(file,g):null);
    templates.set(file,p);return p;
  }
  const readyTemplates=new Map();
  function instance(t){ // shares geometry and materials; only Mesh objects are new
    const g=new T.Group();for(const m of t.group.children){const c=new T.Mesh(m.geometry,m.material);c.castShadow=m.castShadow;c.receiveShadow=m.receiveShadow;g.add(c);}return g;
  }

  // ---- buildings ---------------------------------------------------------------------------------------------
  const lots=[];
  function setupLots(){
    const sites=r.sites;
    for(const i of city.modelLots){
      const lot=city.buildings[i],type=TYPE_OF[lot.style];if(!type)continue;
      lots.push({i,lot,type,holder:new T.Group(),stage:null,near:false,wanted:'intact',burned:false,shown:null,pending:null,fit:null,ready:false});
    }
    for(const l of lots){l.holder.position.set(l.lot.x,.16,l.lot.z);root.add(l.holder);}
    return sites;
  }
  function fitFor(t,lot){const s=t.size;return Math.min(1,lot.width/Math.max(s.x,.01),lot.depth/Math.max(s.z,.01),lot.height/Math.max(s.y,.01));}
  function apply(l,t,file){
    const inst=instance(t),k=fitFor(t,l.lot);inst.scale.setScalar(k);
    // centre on the lot, floor at 0
    const c=t.box.getCenter(new T.Vector3());inst.position.set(-c.x*k,-t.box.min.y*k,-c.z*k);
    const previous=l.holder.children[0];
    l.holder.add(inst);
    const m=metricsOf();
    if(!canAdd(m)){l.holder.remove(inst);stats.rejected++;return false;}
    if(previous)l.holder.remove(previous);
    stats.swaps++;l.shown=file;
    if(lotBases[l.i])lotBases[l.i].visible=false;
    return true;
  }
  function wantFile(l){return buildingFile(l.type,l.wanted,l.near);}
  function refreshLot(l){
    const file=wantFile(l);
    if(l.shown===file||l.pending===file)return;
    l.pending=file;
    template(file).then(t=>{
      if(l.pending===file)l.pending=null;
      if(!t||disposed)return;
      readyTemplates.set(file,t);
      if(wantFile(l)===file)apply(l,t,file);
    });
  }
  /** Per frame: choose stage and LOD from the model, request or swap. Cheap: no allocation when nothing changes. */
  function update(focus){
    if(disposed)return;
    for(const l of lots){
      const stage=lotStage(model.flames,r.sites,l.lot,l.burned);
      if(stage==='burning')l.burned=true;
      l.wanted=stage;
      l.near=lodNear(Math.hypot(l.lot.x-focus.x,l.lot.z-focus.z),l.near);
      const file=wantFile(l),ready=readyTemplates.get(file);
      if(l.shown!==file){if(ready&&l.pending!==file)apply(l,ready,file);else refreshLot(l);}
    }
    crewLod(focus);
  }
  async function loadBuildings(focus){
    setupLots();
    // First paint: every lot's intact LOD1 (small), in order; stages and LOD0 arrive lazily from update().
    await Promise.all(lots.map(async l=>{const file=buildingFile(l.type,'intact',false),t=await template(file);if(!t||disposed)return;readyTemplates.set(file,t);if(l.shown===null||l.shown===file)apply(l,t,file);}));
    if(focus)update(focus);
    return lots.filter(l=>l.shown).length;
  }

  // ---- crew and bystanders ----------------------------------------------------------------------------------
  let crew=null,citizens=[],citizenLod=[];
  async function loadCrew(){
    const gltf=await fetchGlb('models/crew-nozzle.glb');if(!gltf||disposed)return null;
    const clips={};for(const c of gltf.animations||[])clips[c.name]=c;
    const object=gltf.scene,box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),k=city.crewHeight/Math.max(size.y,.01);
    const wrap=new T.Group();wrap.add(object);object.scale.setScalar(k);object.position.set(-(box.min.x+box.max.x)/2*k,-box.min.y*k,-(box.min.z+box.max.z)/2*k);
    object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
    root.add(wrap);
    if(!canAdd(metricsOf())){root.remove(wrap);stats.rejected++;return null;}
    crew={visual:wrap,rig:createCrewRig(object,clips)};
    return crew;
  }
  function createCrewRig(object,clips){
    const mixer=new T.AnimationMixer(object),actions={};
    for(const [name,clip]of Object.entries(clips))actions[name]=mixer.clipAction(clip);
    let hand=null;object.traverse(o=>{if(o.isBone&&o.name==='RightHand')hand=o;});
    let current=null;const play=name=>{const a=actions[name]||actions.idle;if(!a||a===current)return;a.reset().fadeIn(.18).play();current?.fadeOut(.18);current=a;};
    play('idle');
    return {
      update(dt,exiting,spraying){play(exiting?'walk':spraying?'hose':'idle');mixer.update(dt);},
      hand(out){if(!hand)return false;object.updateMatrixWorld(true);hand.getWorldPosition(out);return true;},
      dispose(){mixer.stopAllAction();mixer.uncacheRoot(object);}
    };
  }
  function crewLod(){/* the crew model is one rig that always stays inside the camera: no LOD file is loaded for it */}
  async function loadCitizens(count){
    const [near,far]=await Promise.all([template('models/bystander.glb'),template('models/bystander-lod.glb')]);
    if(!near||!far||disposed)return [];
    for(let j=0;j<count;j++){
      const holder=new T.Group();root.add(holder);
      const make=t=>{const g=instance(t),k=city.citizenHeight/Math.max(t.size.y,.01);g.scale.setScalar(k);const c=t.box.getCenter(new T.Vector3());g.position.set(-c.x*k,-t.box.min.y*k,-c.z*k);return g;};
      holder.add(make(near));
      if(!canAdd(metricsOf())){root.remove(holder);stats.rejected++;continue;}
      citizens.push({visual:holder,far:null,near:holder.children[0],isNear:true,build:()=>make(far)});
    }
    return citizens;
  }
  /** Swap a citizen to the cheaper bystander-lod once it is far from the camera focus (hysteresis, shared geometry). */
  function citizenDetail(index,distance){
    const c=citizens[index];if(!c)return;
    const wantNear=lodNear(distance,c.isNear,CREW_FAR,CREW_FAR_EXIT);
    if(wantNear===c.isNear)return;
    c.isNear=wantNear;
    if(!wantNear&&!c.far)c.far=c.build();
    c.visual.remove(...c.visual.children);c.visual.add(wantNear?c.near:c.far);
  }

  // ---- hydrants ---------------------------------------------------------------------------------------------
  let hydrants=[];
  async function loadHydrants(spec){
    const t=await template('models/hydrant.glb');if(!t||disposed)return 0;
    for(const p of city.hydrants){
      const g=instance(t),k=spec.height/Math.max(t.size.y,.01);g.scale.setScalar(k);const c=t.box.getCenter(new T.Vector3());
      const holder=new T.Group();g.position.set(-c.x*k,-t.box.min.y*k,-c.z*k);holder.add(g);holder.position.fromArray(p);root.add(holder);
      if(!canAdd(metricsOf())){root.remove(holder);stats.rejected++;continue;}
      hydrants.push(holder);
    }
    return hydrants.length;
  }

  // ---- fire engine (matches fire-truck.mjs's visual contract) -----------------------------------------------
  async function loadTruck(){
    const gltf=await fetchGlb('models/engine-pumper.glb');if(!gltf||disposed)return null;
    const object=gltf.scene,box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),k=balance.vehicle.length/Math.max(size.x,size.z,.01);
    const rootGroup=new T.Group(),turret=new T.Group(),muzzle=new T.Object3D(),inner=new T.Group();
    inner.add(object);object.scale.setScalar(k);object.position.set(-(box.min.x+box.max.x)/2*k,-box.min.y*k,-(box.min.z+box.max.z)/2*k);
    // v7 engine's nose is +X in its file (waterOutlet x +1.45); the game's engine faces +Z at yaw 0.
    inner.rotation.y=-Math.PI/2;rootGroup.add(inner);
    let outlet=new T.Vector3(0,1.3,1.5);
    object.updateWorldMatrix(true,true);const node=object.getObjectByName('waterOutlet');
    if(node){inner.updateMatrixWorld(true);rootGroup.updateMatrixWorld(true);node.getWorldPosition(outlet);}
    // The pumper has no turret: the nozzle origin stays on the real outlet and the aim yaw only turns an empty pivot.
    turret.position.copy(outlet);rootGroup.add(turret);turret.add(muzzle);muzzle.position.set(0,0,.35);
    object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return {root:rootGroup,turret,muzzle,wheels:[],cannonFaces:1,height:size.y*k,dispose(){rootGroup.removeFromParent();rootGroup.clear();}};
  }

  // ---- particle atlases -------------------------------------------------------------------------------------
  async function loadAtlases(){
    if(adapters.atlases)return adapters.atlases;
    if(!globalThis.document)return null;
    const loader2=new T.TextureLoader(),out={};
    try{
      await Promise.all(Object.entries(ATLAS_FILES).map(async([kind,file])=>{const t=await loader2.loadAsync(url(file));t.colorSpace=T.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=T.LinearFilter;t.magFilter=T.LinearFilter;t.anisotropy=1;textures.add(t);out[kind]=t;}));
    }catch{return null;}
    return disposed?null:out;
  }

  function dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();crew?.rig.dispose();
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
    root.clear();loader.dispose?.();geometries.clear();materials.clear();textures.clear();lots.length=0;citizens.length=0;hydrants=[];
  }
  return {loadBuildings,loadCrew,loadCitizens,loadHydrants,loadTruck,loadAtlases,update,citizenDetail,dispose,
    get crew(){return crew;},get citizens(){return citizens;},get hydrants(){return hydrants;},
    metrics(){return {...stats,lots:lots.map(l=>({index:l.i,style:l.lot.style,stage:l.wanted,file:l.shown,near:l.near})),crew:Boolean(crew),citizens:citizens.length,hydrants:hydrants.length,atlasTextures:families.size,disposed};}};
}
