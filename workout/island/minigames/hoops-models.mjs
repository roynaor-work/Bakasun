/** Basketball presentation assets. Anchors are adapted to the existing court in
 * metres; the simulation's dimensions, collision shapes and result stay intact. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {HoopsDRACOLoader as DRACOLoader} from './hoops-draco.mjs';
import {ballTexture} from './hoops-textures.mjs';

const MODEL='design/models/',ENV='design/environment/textures/';
const materialsOf=o=>o.material?(Array.isArray(o.material)?o.material:[o.material]):[];

function resources(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of materialsOf(o)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 return {geometries,materials,textures};
}
function release(owned,retained){
 for(const kind of ['geometries','materials','textures'])for(const item of owned[kind])if(!retained?.[kind].has(item))item.dispose();
}
function mergeResources(a,b){for(const k of ['geometries','materials','textures'])for(const v of b[k])a[k].add(v);}
function anchor(root,name){
 const node=root.getObjectByName(name);if(!node)throw Error('Basketball asset missing '+name);
 root.updateMatrixWorld(true);return root.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
}
function mappedMaterial(mesh,map,{vertexColors=true,roughness=.85}={}){
 const mat=mesh.material.clone();mat.map=map;mat.vertexColors=vertexColors;mat.color.set(0xffffff);mat.roughness=roughness;mesh.material=mat;return mat;
}

function openBroadcastCanopy(mesh){
 // The live sideline camera is at y=7 m, inside the authored near canopy
 // (local x=12.6..15.4, |z|<=18, y=6.85..7.15). Cut away that canopy,
 // as a broadcast arena does, retaining the far and both end canopies.
 // This happens once at load; no transparency or per-frame raycasts are needed.
 const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.index,keep=[];
 const count=index?index.count:position.count;
 for(let i=0;i<count;i+=3){
  const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
  const near=Math.min(position.getX(a),position.getX(b),position.getX(c))>12;
  const along=Math.max(Math.abs(position.getZ(a)),Math.abs(position.getZ(b)),Math.abs(position.getZ(c)))<18.1;
  if(!near||!along)keep.push(a,b,c);
 }
 geometry.setIndex(keep);geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

/** Return spectator positions on the five authored octagonal seating rings.
 * The spectator atlas remains instanced against quiet, dark seating. */
function crowdSpots(court){
 const spots=[],sx=court.W/15,sz=court.L/28;
 for(let row=0;row<5;row++){
  const x=8.4+row*1.15+.58,z=15+row*1.15+.58,c=1.4+row*.2+.1;
  const corners=[[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],[x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]];
  for(let edge=0;edge<8;edge++){
   const a=corners[edge],b=corners[(edge+1)%8],count=Math.max(1,Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/.64));
   for(let i=0;i<count;i++){
    const u=(i+.5)/count,px=a[0]+(b[0]-a[0])*u,pz=a[1]+(b[1]-a[1])*u;
    // +90 degrees around Y: model +Z -> court +X.
    const wx=pz*sz,wz=-px*sx;
    spots.push({x:wx,y:1.08+row*.85,z:wz,face:Math.atan2(-wx,-wz),row});
   }
  }
 }
 return spots;
}

/** Load before constructing the crowd. Existing arena slots must be named
 * court, court-apron, basket-1/basket--1, stands, arena-shell, arena-ceiling,
 * arena-fixtures and arena-scoreboard. Court overlays and lighting are retained.
 * All loading completes before the visible arena is changed. */
export async function replaceArenaAssets(arena,dyn,court,{assetBase,quality=2,anisotropy=4}={}){
 const base=assetBase||new URL('../',import.meta.url);
 const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const textureLoader=new THREE.TextureLoader();
 const owned={geometries:new Set(),materials:new Set(),textures:new Set()};
 let disposed=false;
 const loadModel=async name=>{const g=await loader.loadAsync(new URL(MODEL+name+'.glb',base).href);mergeResources(owned,resources(g.scene));return g.scene;};
 const loadTexture=async name=>{const t=await textureLoader.loadAsync(new URL(ENV+name+'.webp',base).href);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(4,anisotropy);owned.textures.add(t);return t;};
 let venue,hoopSource,concrete;
 try{
  // Wait for every load, including failures, before releasing partially loaded assets.
  const all=await Promise.allSettled([loadModel('basketball-arena'),loadModel('basketball-hoop'),loadTexture('stand-concrete')]);
  const failed=all.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  [venue,hoopSource,concrete]=all.map(r=>r.value);
 }catch(error){release(owned);throw error;}finally{draco.dispose();}
 try{
  venue.name='design-basketball-arena';
  venue.scale.set(court.W/15,1,court.L/28);venue.rotation.y=Math.PI/2;
  openBroadcastCanopy(venue.getObjectByName('roof'));
  for(const name of ['court_markings','basket_frame','backboard','rim']){
   const mesh=venue.getObjectByName(name);if(mesh)mesh.visible=false;
  }
  const floor=venue.getObjectByName('court_surface');
  
  const originalFloor=arena.getObjectByName('court');
  const parquet=new THREE.MeshStandardMaterial({map:originalFloor.material.map,color:originalFloor.material.color.clone(),roughness:.38,metalness:.03,envMapIntensity:.7});floor.material=parquet;originalFloor.material.dispose();originalFloor.material=parquet;floor.visible=false;owned.materials.add(parquet);floor.receiveShadow=true;
  concrete.repeat.set(4,4);
  owned.materials.add(mappedMaterial(venue.getObjectByName('arena_shell'),concrete,{roughness:.95}));
  const seating=venue.getObjectByName('seating');seating.material=seating.material.clone();seating.material.map=null;seating.material.vertexColors=false;seating.material.color.set('#1a2030');seating.material.roughness=.96;owned.materials.add(seating.material);

  // The supplied scoreboard includes static 00:00 geometry. Cover its face with
  // the existing live display, keeping the design frame and the score contract.
  const sbAnchor=anchor(venue,'anchor_scoreboard_center');
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(4.9,1.72),new THREE.MeshBasicMaterial({map:dyn.scoreboard.texture,toneMapped:false}));
  owned.geometries.add(screen.geometry);owned.materials.add(screen.material);
  screen.name='design-live-scoreboard';screen.position.copy(sbAnchor);screen.position.z+=.18;venue.add(screen);

  const baskets=[],nets=[],clocks=[];
  for(const side of [1,-1]){
   const hoop=hoopSource.clone(true);hoop.name='design-basket-'+side;
   const rim=anchor(hoop,'anchor_rim_center');
   hoop.rotation.y=-side*Math.PI/2;
   const offset=rim.clone().applyAxisAngle(new THREE.Vector3(0,1,0),hoop.rotation.y);
   hoop.position.set(side*court.rimX-offset.x,court.rimY-offset.y,-offset.z);
   for(const name of ['base','base_pad','post_pad']){const mesh=hoop.getObjectByName(name);if(mesh){mesh.material=mesh.material.clone();mesh.material.vertexColors=false;mesh.material.color.set(name==='base'?'#333b49':'#1d2840');mesh.material.roughness=.86;owned.materials.add(mesh.material);}}
   const net=hoop.getObjectByName('net');
   // The view's inexpensive net deformation uses rim-local vertices and y<=0.
   net.geometry=net.geometry.clone();owned.geometries.add(net.geometry);net.geometry.translate(-rim.x,-rim.y,-rim.z);net.position.add(rim);
   nets.push({mesh:net,side,swing:0,base:net.geometry.attributes.position.array.slice()});
   const glass=hoop.getObjectByName('backboard');glass.material=glass.material.clone();owned.materials.add(glass.material);glass.material.transparent=true;glass.material.opacity=.3;glass.material.depthWrite=false;glass.material.roughness=.15;
   // Retain both the live shot-clock face and its backing from each old basket.
   const old=arena.getObjectByName('basket-'+side);
   if(old)for(const child of [...old.children]){
    const p=child.geometry?.parameters;
    if(materialsOf(child).some(m=>dyn.shotClocks.some(c=>c.texture===m.map))||(p?.width===.16&&p?.height===.36&&p?.depth===.9))clocks.push(child);
   }
   hoop.traverse(o=>{if(o.isMesh){o.castShadow=quality>=1&&o.name!=='net'&&o.name!=='backboard';o.receiveShadow=true;}});
   baskets.push(hoop);
  }

  // Centre the design ball inside a separate pivot so rotation never orbits its
  // ground-origin authoring root. Engine positions continue to mean ball centre.
  const ballMap=ballTexture(512);ballMap.anisotropy=Math.min(4,anisotropy);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(court.ballR,24,16),new THREE.MeshStandardMaterial({map:ballMap,roughness:.72,metalness:0}));ball.name='broadcast-basketball';ball.castShadow=quality>=1;
  owned.geometries.add(ball.geometry);owned.materials.add(ball.material);owned.textures.add(ballMap);
  // The original leather surface is retained at the authoritative ball radius.

  const removed=new THREE.Group();
  for(const clock of clocks)arena.attach(clock);
  for(const name of ['basket-1','basket--1','stands','arena-shell','arena-ceiling','arena-fixtures','arena-scoreboard']){
   const o=arena.getObjectByName(name);if(o)removed.add(o);
  }
  // The apron remains under the authored surface and retains team tinting.
  const apron=arena.getObjectByName('court-apron');
  arena.add(venue,...baskets);dyn.nets=nets;dyn.crowdSpots=crowdSpots(court);
  mergeResources(owned,resources(venue));for(const b of baskets)mergeResources(owned,resources(b));mergeResources(owned,resources(ball));
  if(apron)mergeResources(owned,resources(apron));
  release(resources(removed),resources(arena));
  return {ball,dispose(){if(disposed)return;disposed=true;release(owned);},anchors:{rims:baskets.map((b,i)=>({side:[1,-1][i],position:b.getObjectByName('anchor_rim_center').getWorldPosition(new THREE.Vector3()).toArray()}))}};
 }catch(error){release(owned);throw error;}
}
