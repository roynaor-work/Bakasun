/** Island Pro Basketball — the hoops v8 arena (GPT package design/hoops-arena-v8, 06/11) in the arena the view already built.
 * Same contract as replaceArenaAssetsV5: nothing visible changes until every file has loaded and passed validation, so the caller
 * can fall back to the v5/v4/v3 venue untouched. The package's own Three.js, Draco and Worker copies are not used: the game's loaders
 * decode the three Draco shells (15K, 13K and 7K triangles with the whole crowd and seats) and the five textures (about 0.65 MB).
 * The scoreboard faces and the shot clocks show the engine's canvases (the view's drawDisplays), so the numbers are the game's.
 * The simulation and the court geometry are never touched. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {HoopsDRACOLoader as DRACOLoader} from './hoops-draco.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {resources,release,mergeResources} from './hoops-models.mjs';
import {ballTexture} from './hoops-textures.mjs';

const FLOOR_Y=0.008;
export const V8_FILES=Object.freeze(['arena-lod0.glb','arena-lod1.glb','arena-lod2.glb']);
export const V8_LOD_DISTANCES=Object.freeze([0,38,60]);
/** Parts the venue code relies on (a level lacking one throws, and the caller falls back). */
export const V8_REQUIRED=Object.freeze(['court__parquet','basket-home__net','basket-away__net','basket-home__rim','basket-away__rim','scoreboard__black']);
/** ?hoopsV8Lod=0|1|2 pins the level of detail (captures, tests); anything else is automatic. */
export function v8LodFromParams(params){const q=params?.get?.('hoopsV8Lod');return q==='0'||q==='1'||q==='2'?Number(q):'auto';}

/** Seat and spectator positions for one level: two tiers around the court, aisles between blocks, curved corners.
 * (The package's layout, evaluated at load: 2,084 / 1,936 / 1,000 spectators.) */
export function seatingLayout(level=0){
 const out=[];
 for(let tier=0;tier<2;tier++){
  const rows=tier?5:7;
  for(let row=0;row<rows;row++){
   const depth=(tier?6.1:0)+row*.88,y=(tier?4.9:.38)+row*.51,x=17.25+depth,z=10.65+depth,step=level===2?2:1;
   for(const side of [-1,1]){
    for(let col=-23;col<=23;col+=step){if(Math.abs(col)%12===0)continue;out.push({x:col*.68,y,z:side*z,angle:side>0?Math.PI:0,row,tier,id:out.length});}
    for(let col=-12;col<=12;col+=step){if(Math.abs(col)%8===0)continue;out.push({x:side*x,y,z:col*.71,angle:side>0?-Math.PI/2:Math.PI/2,row,tier,id:out.length});}
   }
   for(const sx of [-1,1])for(const sz of [-1,1]){
    const r=depth+.90,full=Math.max(2,Math.floor(r*1.9)),count=level===2?Math.max(1,Math.ceil(full/3)):level===1?Math.max(2,Math.ceil(full*.65)):full;
    for(let k=0;k<count;k++){const a=(k+.5)/count*Math.PI/2;out.push({x:sx*(16.65+r*Math.cos(a)),y,z:sz*(10.05+r*Math.sin(a)),angle:Math.atan2(-sx*Math.cos(a),-sz*Math.sin(a)),row,tier,id:out.length});}
   }
  }
 }
 return out;
}

/** A copy with every attribute as plain float32 (Draco hands out quantised or integer arrays that do not merge) and a 32-bit index. */
function floatGeometry(source){
 const g=new THREE.BufferGeometry();
 for(const [name,a] of Object.entries(source.attributes)){
  const out=new Float32Array(a.count*a.itemSize);
  for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)out[i*a.itemSize+k]=k===0?a.getX(i):k===1?a.getY(i):k===2?a.getZ(i):a.getW(i);
  g.setAttribute(name,new THREE.BufferAttribute(out,a.itemSize));
 }
 if(source.index)g.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array),1));
 return g;
}
/** The shell has about forty meshes; the ones that share a material (bowl, steel, rims, stands, baskets) become one draw call each.
 * Roof, lighting and walls stay apart (the cutaway hides them by name), as do the floor, the nets (they swing), the glass and the
 * hanging scoreboard (hidden in portrait). Geometry is baked into the shell's space. Returns the number of draw calls saved. */
export function mergeShellStatic(shell,solid){
 shell.updateMatrixWorld(true);
 const inverse=new THREE.Matrix4().copy(shell.matrixWorld).invert(),groups=new Map(),plain=[];
 shell.traverse(o=>{
  if(!o.isMesh||/^wall-/.test(o.name)||o.name==='court_surface'||/__net$/.test(o.name)||o.material.name==='glass')return;
  const m=o.material,flat=!m.map&&!m.normalMap&&!m.emissiveMap&&!(m.emissive&&m.emissive.getHex());
  const part=/^(roof|lighting|scoreboard)__/.exec(o.name)?.[1]||'',key=part+(solid&&flat&&!m.transparent?'/solid':'/'+(m.name||m.uuid));
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
 });
 let saved=0;
 for(const [key,meshes] of groups){
  if(meshes.length<2)continue;
  const sig=m=>Object.keys(m.geometry.attributes).filter(n=>n!=='color'&&n!=='uv').sort().join(),same=meshes.every(m=>sig(m)===sig(meshes[0])&&!!m.geometry.index===!!meshes[0].geometry.index);
  if(!same)continue;
  const parts=meshes.map(m=>{
   const g=floatGeometry(m.geometry);g.deleteAttribute('uv');g.deleteAttribute('color');
   g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld));
   if(key.endsWith('/solid')){const n=g.attributes.position.count,c=new Float32Array(n*3),col=m.material.color||new THREE.Color(1,1,1);for(let i=0;i<n;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));}
   return g;});
  const merged=mergeGeometries(parts,false);for(const g of parts)g.dispose();if(!merged)continue;
  const material=key.endsWith('/solid')?solid:meshes[0].material,part=key.split('/')[0];
  const mesh=new THREE.Mesh(merged,material);mesh.name=(part||'merged')+'__merged-'+key.split('/')[1];mesh.frustumCulled=false;shell.add(mesh);
  for(const m of meshes){m.parent.remove(m);m.geometry.dispose();}
  saved+=meshes.length-1;
 }
 return saved;
}

function createPopulation(level,texture){
 const layout=seatingLayout(level),group=new THREE.Group();group.name='instanced-population-lod'+level;
 const back=new THREE.PlaneGeometry(.50,.48);back.translate(0,.31,-.19);
 const seatGeo=mergeGeometries([back]);seatGeo.computeVertexNormals();
 const seatMat=new THREE.MeshLambertMaterial({color:0x324657,side:THREE.DoubleSide});seatMat.forceSinglePass=true;
 const seats=new THREE.InstancedMesh(seatGeo,seatMat,layout.length);seats.name='seats';
 const crowdGeo=new THREE.PlaneGeometry(.66,1.10);crowdGeo.translate(0,.54,.04);
 const variant=new Float32Array(layout.length),phase=new Float32Array(layout.length);
 const crowdMat=new THREE.MeshLambertMaterial({map:texture,alphaTest:.46,side:THREE.DoubleSide,depthWrite:true});crowdMat.forceSinglePass=true;
 const uniforms={arenaTime:{value:0},arenaCheer:{value:0}};
 crowdMat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float spectatorTile;attribute float spectatorPhase;\nuniform float arenaTime;uniform float arenaCheer;\nvarying float vSpectatorTile;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvSpectatorTile=spectatorTile;\nfloat upper=smoothstep(0.20,0.85,position.y);\ntransformed.x+=sin(arenaTime*1.4+spectatorPhase)*0.018*upper;\ntransformed.y+=sin(arenaTime*2.2+spectatorPhase)*0.009*upper*(1.0+arenaCheer*3.0);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSpectatorTile;')
   .replace('#include <map_fragment>','#ifdef USE_MAP\nvec2 tile=vec2(mod(vSpectatorTile,8.0),3.0-floor(vSpectatorTile/8.0));\nvec2 atlasUv=(tile+vec2(0.018)+vMapUv*0.964)/vec2(8.0,4.0);\nvec4 sampledDiffuseColor=texture2D(map,atlasUv);\ndiffuseColor*=sampledDiffuseColor;\n#endif');
 };
 crowdMat.customProgramCacheKey=()=>'hoops-v8-crowd-atlas-1';
 const crowd=new THREE.InstancedMesh(crowdGeo,crowdMat,layout.length);crowd.name='spectators';
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 layout.forEach((p,i)=>{
  dummy.position.set(p.x,p.y+.13,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix);
  dummy.position.y=p.y+.08;dummy.scale.setScalar(.93+(i*17%11)*.012);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);
  color.setHex(p.tier?0x36404b:i%13<6?0x284753:0x3a4650);seats.setColorAt(i,color);
  color.setRGB(.75+(i%7)*.025,.75+(i%7)*.025,.75+(i%7)*.025);crowd.setColorAt(i,color);
  variant[i]=(i*13+Math.floor(i/9)*7)%32;phase[i]=i*2.39996;
 });
 crowdGeo.setAttribute('spectatorTile',new THREE.InstancedBufferAttribute(variant,1));crowdGeo.setAttribute('spectatorPhase',new THREE.InstancedBufferAttribute(phase,1));
 for(const m of [seats,crowd]){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();m.frustumCulled=true;m.castShadow=false;m.receiveShadow=false;}
 group.add(seats,crowd);
 return {group,count:layout.length,update(time,cheer=0){uniforms.arenaTime.value=time;uniforms.arenaCheer.value=cheer;},dispose(){seatGeo.dispose();crowdGeo.dispose();seatMat.dispose();crowdMat.dispose();}};
}

/** Scoreboard faces over the court and the two shot clocks behind the baskets, textured with the engine's canvases. The faces on the ends are
 * narrower than the canvas, so only its centre shows. */
function createScoreSurfaces(board,shot){
 const group=new THREE.Group();group.name='live-score-surfaces';
 const plane=(w,h,mat,name,p,ry=0,crop=null)=>{const g=new THREE.PlaneGeometry(w,h);if(crop){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,crop[0]+uv.getX(i)*crop[1]);}const m=new THREE.Mesh(g,mat);m.name=name;m.position.set(...p);m.rotation.y=ry;group.add(m);return m;};
 const faces=[];
 for(const side of [-1,1]){
  faces.push(plane(4.48,2.12,board,'video-face-long',[0,10.7,side*1.331],side<0?Math.PI:0));
  faces.push(plane(2.48,2.12,board,'video-face-end',[side*2.331,10.7,0],side*Math.PI/2,[.225,.55]));
  for(const face of [-1,1])plane(.61,.36,shot,'shot-clock',[side*13.2+face*.116,4.24,0],face*Math.PI/2,[.183,.633]);
 }
 return {group,faces};
}

export async function replaceArenaAssetsV8(arena,dyn,court,{assetBase,quality=2,anisotropy=4,v8,params}={}){
 const base=assetBase||new URL('../',import.meta.url),cfg=v8.arena,dir=cfg.base,files=cfg.files||V8_FILES,tex=cfg.textures;
 const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const owned={geometries:new Set(),materials:new Set(),textures:new Set()};
 let disposed=false,shells,images;
 try{
  const textureLoader=new THREE.TextureLoader(),image=(name,srgb)=>textureLoader.loadAsync(new URL(dir+name,base).href).then(t=>{if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,anisotropy*2);return t;});
  const all=await Promise.allSettled([...files.map(f=>loadHoopsGLTF(loader,new URL(dir+f,base).href)),image(tex.parquet,true),image(tex.orm,false),image(tex.normal,false),image(tex.crowd,true),image(tex.ceiling,false)]);
  all.forEach(r=>{if(r.status==='fulfilled'){if(r.value.isTexture)owned.textures.add(r.value);else mergeResources(owned,resources(r.value.scene));}});
  const failed=all.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  shells=all.slice(0,files.length).map(r=>r.value.scene);images=all.slice(files.length).map(r=>r.value);
  shells.forEach((s,i)=>{for(const need of V8_REQUIRED)if(!s.getObjectByName(need))throw Error('Basketball v8 arena level '+i+' lacks '+need);});
 }catch(error){release(owned);throw error;}finally{draco.dispose();}

 try{
  const [color,orm,normal,crowdAtlas,env]=images;
  env.mapping=THREE.CubeUVReflectionMapping;env.colorSpace=THREE.LinearSRGBColorSpace;env.flipY=false;env.generateMipmaps=false;env.minFilter=env.magFilter=THREE.LinearFilter;env.needsUpdate=true;
  // lacquered maple: the package's baked ceiling reflection instead of a live mirror pass of the players (quality 1: no clearcoat)
  const floorMat=new THREE.MeshPhysicalMaterial({map:color,roughnessMap:orm,normalMap:normal,normalScale:new THREE.Vector2(.18,.18),roughness:.63,metalness:0,clearcoat:quality>=2?.38:0,clearcoatRoughness:.2,envMap:env,envMapIntensity:.85});
  owned.materials.add(floorMat);
  const group=new THREE.Group();group.name='hoops-arena-v8';
  const boardMat=new THREE.MeshBasicMaterial({map:dyn.scoreboard.texture,toneMapped:false}),shotMat=new THREE.MeshBasicMaterial({map:dyn.shotClocks[0].texture,toneMapped:false});
  owned.materials.add(boardMat);owned.materials.add(shotMat);
  const nets=[],boards=[];
  for(const shell of shells){
   shell.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=false;o.receiveShadow=false;
    if(o.material.name==='parquet'){o.material=floorMat;o.name='court_surface';o.receiveShadow=true;}
    else if(o.material.name==='glass'){o.material.depthWrite=false;o.material.forceSinglePass=true;}
    // the nets live in their rim groups (rim-local, hanging down from y = 0): the view's swing moves their vertices
    if(/^basket-(home|away)__net$/.test(o.name)){const side=o.name.includes('home')?-1:1;nets.push({mesh:o,side,swing:0,base:o.geometry.attributes.position.array.slice()});}
   });
  }
  const solidMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.68,metalness:.12});owned.materials.add(solidMat);
  for(const shell of shells)mergeShellStatic(shell,solidMat);
  for(const shell of shells)shell.traverse(o=>{if(o.isMesh&&o.name.startsWith('scoreboard__'))boards.push(o);});
  const populations=shells.map((s,i)=>createPopulation(i,crowdAtlas)),levels=shells.map((s,i)=>{const g=new THREE.Group();g.name='level-'+i;g.add(s,populations[i].group);group.add(g);return g;});
  for(const p of populations)owned.materials.add(p.group.children[0].material),owned.materials.add(p.group.children[1].material);
  const surfaces=createScoreSurfaces(boardMat,shotMat);surfaces.group.name='live-score-surfaces';group.add(surfaces.group);
  // a warm fill so the lacquer and the stands read; the game's own key light (with shadows) is kept for the players
  const hemi=new THREE.HemisphereLight(0xb0c6df,0x4a3925,.9);hemi.name='bowl-ambient';group.add(hemi);

  // ---------- ball ----------
  const ballMap=ballTexture(512);ballMap.anisotropy=Math.min(4,anisotropy);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(court.ballR,28,20),new THREE.MeshStandardMaterial({map:ballMap,roughness:.58,metalness:0,envMapIntensity:.7}));
  ball.name='broadcast-basketball';ball.castShadow=quality>=1;ball.frustumCulled=false;
  owned.geometries.add(ball.geometry);owned.materials.add(ball.material);owned.textures.add(ballMap);

  // ---------- level of detail ----------
  let current=0,forced=v8LodFromParams(params),slow=0,fast=0,penalty=0;
  const show=n=>{current=n;levels.forEach((g,i)=>g.visible=i===n);};
  show(forced==='auto'?0:forced);
  const cam=new THREE.Vector3(),origin=new THREE.Vector3();
  function prepareView(camera){
   // roof and walls next to a camera above the roof (replay, wide shots) are cut away; indoor cameras keep the trusses
   const w=camera.getWorldPosition(cam),cutaway=w.y>12;
   levels[current].traverse(o=>{
    if(!o.isMesh)return;
    if(o.name.startsWith('roof__')||o.name.startsWith('lighting__'))o.visible=!cutaway;
    if(o.name.startsWith('wall-'))o.visible=!(cutaway&&((o.name.startsWith('wall-east')&&w.x>25)||(o.name.startsWith('wall-west')&&w.x<-25)||(o.name.startsWith('wall-south')&&w.z>19)||(o.name.startsWith('wall-north')&&w.z<-19)));
   });
  }
  const api={
   get lod(){return current;},get crowdCount(){return populations[current].count;},
   /** Distance picks the level; two seconds under about 28 fps step it down, twelve good seconds step it back. */
   update(camera,time,delta,cheer=0){
    if(disposed)return;
    if(forced==='auto'){
     const distance=camera.getWorldPosition(cam).distanceTo(group.getWorldPosition(origin));
     let desired=distance>=V8_LOD_DISTANCES[2]?2:distance>=V8_LOD_DISTANCES[1]?1:0;
     if(delta>1/28&&delta<.25){slow+=delta;fast=0;}else{slow=Math.max(0,slow-delta);fast+=delta;}
     if(slow>2){penalty=Math.min(2,penalty+1);slow=0;}
     if(fast>12){penalty=Math.max(0,penalty-1);fast=0;}
     desired=Math.min(2,desired+penalty);
     if(desired!==current&&(penalty||Math.abs(distance-V8_LOD_DISTANCES[Math.max(desired,current)])>3))show(desired);
    }
    prepareView(camera);populations[current].update(time,cheer);
   },
   prepareView,
   /** The hanging scoreboard is hidden in portrait (the close camera is inside it), like the earlier venues. */
   setHangingBoard(visible){for(const m of boards)m.visible=visible;for(const m of surfaces.faces)m.visible=visible;},
  };

  // ---------- swap (nothing below can fail) ----------
  const removed=new THREE.Group();
  for(const o of [...arena.children]){
   const hide=['court','court-apron','basket-1','basket--1','stands','arena-shell','arena-ceiling','arena-fixtures','arena-scoreboard','crowd','v5-court','v5-arena'].includes(o.name)||(o.isMesh&&!o.name&&Math.abs(o.position.y)<.01);
   if(hide)removed.add(o);
  }
  group.position.y=FLOOR_Y-FLOOR_Y; // the package's parquet top sits at Y = 0.008 itself
  arena.add(group);dyn.crowdSpots=[];dyn.nets=nets;dyn.led={offset:{x:0}};
  mergeResources(owned,resources(group));
  release(resources(removed),resources(arena));
  return {ball,baked:[],version:4,crowd3d:true,crowdV5:null,arenaV8:api,venue:dir,v8:true,
   dispose(){if(disposed)return;disposed=true;for(const p of populations)p.dispose();release(owned);},
   anchors:{rims:[1,-1].map(side=>({side,position:[side*court.rimX,court.rimY,0]}))}};
 }catch(error){release(owned);throw error;}
}
