/** Island Pro Basketball — loads the hoops v5 venue (design/hoops-v5) into the arena the view already built.
 * Same contract as replaceArenaAssets in hoops-models.mjs: nothing visible changes until every file has loaded and
 * passed validation, so the caller can fall back to the v4/v3 venue untouched; the returned object carries the ball,
 * the dispose hook and the crowd controller. The simulation and the court geometry are never touched. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {HoopsDRACOLoader as DRACOLoader} from './hoops-draco.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {mergeStaticMeshes,resources,release,mergeResources} from './hoops-models.mjs';
import {V5_FILES,V5_REQUIRED,CROWD_LEVELS,crowdKeeps,crowdStartLevel,createCrowdGovernor} from './hoops-v5.mjs';

const FLOOR_Y=0.008;           // the view's overlays (ball shadow, rings, vfx) are calibrated to this floor height
const RIM_Y=3.048;             // rim centre height in hoops.glb (the court config says 3.05)

/** Keep the triangles of `geometry` whose centroid is on one side of x = 0 (`sign` +1 or -1), as a compact geometry
 * (only position, normal, color and uv survive). hoops.glb carries both baskets in each mesh. */
export function sliceByX(geometry,sign){
 const index=geometry.index,pos=geometry.attributes.position,count=index?index.count:pos.count,remap=new Map(),keep=[];
 const names=['position','normal','color','uv'].filter(n=>geometry.attributes[n]);
 for(let t=0;t<count;t+=3){
  const v=[0,1,2].map(k=>index?index.getX(t+k):t+k);
  if(sign*((pos.getX(v[0])+pos.getX(v[1])+pos.getX(v[2]))/3)<=0)continue;
  for(const a of v){if(!remap.has(a))remap.set(a,remap.size);keep.push(remap.get(a));}
 }
 if(!keep.length)return null;
 const out=new THREE.BufferGeometry();
 for(const name of names){
  const src=geometry.attributes[name],size=src.itemSize,array=new Float32Array(remap.size*size);
  for(const [from,to] of remap)for(let k=0;k<size;k++)array[to*size+k]=src.array[from*size+k];
  out.setAttribute(name,new THREE.BufferAttribute(array,size));
 }
 out.setIndex(keep);return out;
}

function lambert(source,extra={}){
 const m=new THREE.MeshLambertMaterial({vertexColors:!!source.vertexColors,color:source.color?.clone?.()||0xffffff,side:THREE.FrontSide,...extra});
 return m;
}

function paintColors(geometry,color){
 const c=geometry.attributes.color;if(!c)return;
 for(let i=0;i<c.count;i++)c.setXYZ(i,color.r,color.g,color.b);c.needsUpdate=true;
}

/** Crowd material: the paired-pose shader of the v5 preview (each card is a seated / cheering pair on the atlas, the pose
 * flips by position and time without any per-spectator CPU work), plus a cheer uniform the view raises on a score. */
function crowdMaterial(source){
 const mat=new THREE.MeshBasicMaterial({map:source.map,vertexColors:true,alphaTest:0.38,side:THREE.DoubleSide,toneMapped:true});
 const uniforms={crowdTime:{value:0},crowdCheer:{value:0}};
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float crowdPhase;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\ncrowdPhase=floor(uv.x*4.0)*3.17+floor(uv.y*6.0)*1.71;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float crowdTime;uniform float crowdCheer;varying float crowdPhase;')
   .replace('#include <map_fragment>',`#ifdef USE_MAP
 vec2 crowdUv=vMapUv;
 float pair=floor(crowdUv.x*4.0);
 float within=fract(crowdUv.x*8.0);
 float cheer=step(.89-crowdCheer*1.55,sin(crowdTime*.62+crowdPhase));
 crowdUv.x=pair*.25+within*.125+cheer*.125;
 vec4 sampledDiffuseColor=texture2D(map,crowdUv);
 diffuseColor*=sampledDiffuseColor;
 #endif`);
 };
 mat.customProgramCacheKey=()=>'hoops-v5-crowd-paired-poses-cheer';
 return {mat,uniforms};
}

function crowdController(mesh,clip,uniforms,{level,pinned,onLevel}){
 const geometry=mesh.geometry,full=geometry.index,array=full.array,cards=Math.floor(full.count/6);
 const indices=CROWD_LEVELS.map(({level:l})=>{
  if(l>=2)return full;
  const kept=[];for(let c=0;c<cards;c++)if(crowdKeeps(l,c))for(let k=0;k<6;k++)kept.push(array[c*6+k]);
  return new THREE.BufferAttribute(array instanceof Uint32Array?new Uint32Array(kept):new Uint16Array(kept),1);
 });
 const governor=createCrowdGovernor({level,pinned});
 const mixer=clip?new THREE.AnimationMixer(mesh.parent||mesh):null,action=clip&&mixer.clipAction(clip);if(action)action.play();
 let cur=-1,time=0,sway=true;
 const apply=l=>{if(l===cur)return;cur=l;geometry.setIndex(indices[l]);sway=CROWD_LEVELS[l].sway;if(!sway&&mixer)mixer.setTime(0.9);onLevel?.(l);};
 apply(level);
 return {
  get level(){return cur;},get count(){return Math.floor(indices[cur].count/6);},cards,governor,
  setLevel:apply,
  /** Called every rendered frame with the real frame time and the cheer amount (0..1). */
  update(dt,cheer){
   const next=governor.observe(dt);if(next!=null)apply(next);
   time+=dt*(1+cheer*2.5);uniforms.crowdTime.value=time;uniforms.crowdCheer.value=cheer;
   if(sway&&mixer)mixer.update(dt*(1+cheer*1.5));
  },
 };
}

export async function replaceArenaAssetsV5(arena,dyn,court,{assetBase,quality=2,anisotropy=4,v5,params,looks}={}){
 const base=assetBase||new URL('../',import.meta.url),dir=v5.base||'design/hoops-v5/models/',files={...V5_FILES,...(v5.files||{})};
 const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const owned={geometries:new Set(),materials:new Set(),textures:new Set()};
 let disposed=false,gltf;
 try{
  const names=Object.keys(V5_FILES);
  const all=await Promise.allSettled(names.map(n=>loadHoopsGLTF(loader,new URL(dir+files[n],base).href)));
  const failed=all.find(r=>r.status==='rejected');
  all.forEach(r=>{if(r.status==='fulfilled')mergeResources(owned,resources(r.value.scene));});
  if(failed)throw failed.reason;
  gltf=Object.fromEntries(names.map((n,i)=>[n,all[i].value]));
  for(const [file,need] of Object.entries(V5_REQUIRED))for(const name of need)if(!gltf[file].scene.getObjectByName(name))throw Error('Basketball v5 '+file+' lacks '+name);
 }catch(error){release(owned);throw error;}finally{draco.dispose();}

 try{
  const home=new THREE.Color(looks?.[0]?.primary||'#1f6f78');

  // ---------- court ----------
  const courtRoot=gltf.court.scene;courtRoot.name='v5-court';courtRoot.position.y=FLOOR_Y;
  const floor=courtRoot.getObjectByName('court-surface');floor.name='court_surface';floor.receiveShadow=true;floor.renderOrder=-2;
  const maple=floor.material;maple.vertexColors=false;maple.roughness=1;
  if(maple.map)maple.map.anisotropy=Math.min(8,anisotropy*2);
  if(quality<2){maple.clearcoat=0;maple.clearcoatRoughness=0;}
  const apron=courtRoot.getObjectByName('court-apron');apron.position.y=-0.012;apron.receiveShadow=true;
  // the team's colours stay on the floor: the painted keys and the centre disc take the home primary
  for(const n of ['painted-keys','center-mark']){const m=courtRoot.getObjectByName(n);if(m)paintColors(m.geometry,home);}
  // the gold inner mark lies in the same plane as the disc under it: lift it 2 mm so it never z-fights
  const gold=courtRoot.getObjectByName('center-mark001');if(gold)gold.position.y=.002;
  courtRoot.traverse(o=>{if(o.isMesh&&o!==floor)o.receiveShadow=true;});
  for(const n of ['court-lines']){const m=courtRoot.getObjectByName(n);if(m){m.material=lambert(m.material);owned.materials.add(m.material);}}

  // ---------- venue ----------
  const venue=gltf.arena.scene;venue.name='v5-arena';
  const display=new THREE.MeshBasicMaterial({map:dyn.scoreboard.texture,toneMapped:false});owned.materials.add(display);
  for(const n of ['scoreboard-screen','scoreboard-ends','end-screens']){const m=venue.getObjectByName(n);m.material=display;}
  // the hanging board in one group: the portrait camera sits inside it and the view hides it by that name
  const board=new THREE.Group();board.name='live-hanging-scoreboard';
  const boardStatic=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.FrontSide});owned.materials.add(boardStatic);
  const mergedBoard=mergeStaticMeshes(venue,['scoreboard-housing','scoreboard-trim','scoreboard-cables'],boardStatic,{name:'scoreboard-static',receiveShadow:false});
  if(mergedBoard){venue.remove(mergedBoard);board.add(mergedBoard);}
  for(const n of ['scoreboard-screen','scoreboard-ends']){const m=venue.getObjectByName(n);board.add(m);}
  venue.add(board);
  // every static, vertex-coloured part shares one matte material: one draw call for the stands, roof and benches
  const staticMat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.FrontSide});owned.materials.add(staticMat);
  const staticNames=['stand-treads','stand-risers','seats','seat-legs','arena-shell','roof','roof-columns','roof-trusses','fixture-housings','fixture-cables','end-displays','bench-cushions','bench-backs','bench-frames','bench-towels','coolers','bench-cushions001','bench-backs001','scorer-table','table-monitors','courtside-barrier'];
  const mergedVenue=mergeStaticMeshes(venue,staticNames,staticMat,{name:'venue-static',receiveShadow:false});
  if(mergedVenue)owned.geometries.add(mergedVenue.geometry);
  // the rig's practicals and the LED ribbons stay emissive and unlit; the ribbon scrolls through dyn.led
  for(const n of ['light-panels','led-ribbons','table-ribbon']){
   const m=venue.getObjectByName(n);if(!m)continue;
   const old=m.material,basic=new THREE.MeshBasicMaterial({map:old.map||null,vertexColors:!!m.geometry.attributes.color,color:n==='light-panels'?0xe8f0ff:0xffffff,toneMapped:false});
   m.material=basic;owned.materials.add(basic);
  }
  const ribbon=venue.getObjectByName('led-ribbons').material.map;
  if(ribbon)ribbon.wrapS=ribbon.wrapT=THREE.RepeatWrapping;
  venue.traverse(o=>{if(o.isMesh){o.castShadow=false;o.matrixAutoUpdate=false;o.updateMatrix();}});

  // ---------- baskets ----------
  const hoopsRoot=gltf.hoops.scene,hoopMeshes=name=>hoopsRoot.getObjectByName(name);
  const stanchion=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.3});owned.materials.add(stanchion);
  const baskets=[],nets=[],clocks=[];
  for(const [i,side] of [1,-1].entries()){
   const g=new THREE.Group();g.name='v5-basket-'+side;
   const parts=['stanchion-pads','basket-support','basket-brace','board-frame','board-target','rim','shot-clock-case'].map(n=>sliceByX(hoopMeshes(n).geometry,side)).filter(Boolean);
   for(const p of parts)for(const key of Object.keys(p.attributes))if(!['position','normal','color'].includes(key))p.deleteAttribute(key);
   const merged=new THREE.Mesh(mergeGeometries(parts,false),stanchion);merged.name='basket-static';merged.castShadow=quality>=1;merged.receiveShadow=true;owned.geometries.add(merged.geometry);g.add(merged);
   const glassSource=hoopMeshes('backboard-glass'),glass=new THREE.Mesh(sliceByX(glassSource.geometry,side),glassSource.material.clone());
   glass.name='backboard';glass.material.transparent=true;glass.material.opacity=.3;glass.material.depthWrite=false;glass.material.roughness=.15;glass.material.forceSinglePass=true;glass.material.side=THREE.DoubleSide;owned.geometries.add(glass.geometry);owned.materials.add(glass.material);g.add(glass);
   // the net is rim-local (y <= 0) so the view's swing keeps working
   const netGeometry=sliceByX(hoopMeshes('net').geometry,side);netGeometry.translate(-side*court.rimX,-RIM_Y,0);owned.geometries.add(netGeometry);
   const netMat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});owned.materials.add(netMat);
   const net=new THREE.Mesh(netGeometry,netMat);net.name='net-'+side;net.position.set(side*court.rimX,RIM_Y,0);g.add(net);
   nets.push({mesh:net,side,swing:0,base:netGeometry.attributes.position.array.slice()});
   // the shot clock shows the engine's number: the canvas is wider than the glass, so only its centre is sampled
   const screenGeometry=sliceByX(hoopMeshes('shot-clock-screen').geometry,side),clock=dyn.shotClocks[i];
   clocks.push(clock);
   const screen=new THREE.Mesh(screenGeometry,new THREE.MeshBasicMaterial({map:clock.texture,toneMapped:false}));screen.name='shot-clock-'+side;owned.geometries.add(screen.geometry);owned.materials.add(screen.material);g.add(screen);
   baskets.push(g);
  }

  // ---------- crowd ----------
  const crowdRoot=gltf.crowd.scene;crowdRoot.name='v5-crowd';
  const crowdMesh=crowdRoot.getObjectByName('crowd-cards'),{mat:crowdMat,uniforms}=crowdMaterial(crowdMesh.material);
  if(crowdMat.map)crowdMat.map.anisotropy=Math.min(4,anisotropy);
  crowdMesh.material=crowdMat;crowdMesh.frustumCulled=false;crowdMesh.castShadow=false;crowdMesh.receiveShadow=false;owned.materials.add(crowdMat);
  if(crowdMat.map)owned.textures.add(crowdMat.map);
  const start=crowdStartLevel(quality,params);
  const crowd=crowdController(crowdMesh,gltf.crowd.animations[0],uniforms,{level:start.level,pinned:start.pinned});

  // ---------- ball ----------
  const ball=gltf.ball.scene.getObjectByName('basketball');ball.parent?.remove(ball);ball.position.set(0,0,0);ball.rotation.set(0,0,0);ball.scale.setScalar(court.ballR/0.12);
  ball.name='broadcast-basketball';ball.castShadow=quality>=1;ball.receiveShadow=false;ball.frustumCulled=false;
  if(ball.material.map)ball.material.map.anisotropy=Math.min(4,anisotropy);
  ball.material.envMapIntensity=.7;

  // ---------- swap (nothing below can fail) ----------
  const removed=new THREE.Group();
  for(const o of [...arena.children]){
   const hide=['court','court-apron','basket-1','basket--1','stands','arena-shell','arena-ceiling','arena-fixtures','arena-scoreboard'].includes(o.name)||(o.isMesh&&!o.name&&Math.abs(o.position.y)<.01);
   if(hide)removed.add(o);
  }
  // the engine's canvases feed glTF UVs (v runs from the top); the shot-clock canvas is wider than the glass, so only its centre shows
  dyn.scoreboard.texture.flipY=false;dyn.scoreboard.texture.needsUpdate=true;
  for(const clock of clocks){clock.texture.flipY=false;clock.texture.repeat.set(.55,1);clock.texture.offset.set(.225,0);clock.texture.needsUpdate=true;}
  arena.add(courtRoot,venue,...baskets,crowdRoot);dyn.crowdSpots=[];dyn.nets=nets;if(ribbon)dyn.led=ribbon;
  mergeResources(owned,resources(courtRoot));mergeResources(owned,resources(venue));for(const b of baskets)mergeResources(owned,resources(b));mergeResources(owned,resources(crowdRoot));mergeResources(owned,resources(ball));
  release(resources(removed),resources(arena));
  return {ball,baked:[],version:3,crowd3d:true,crowdV5:crowd,venue:'design/hoops-v5/models/',v5:true,
   dispose(){if(disposed)return;disposed=true;release(owned);},
   anchors:{rims:[1,-1].map(side=>({side,position:[side*court.rimX,court.rimY,0]}))}};
 }catch(error){release(owned);throw error;}
}
