/** Actual characters2 basketball athlete, its verified twenty-bone rig, and all
 * authored motion2/hoops actions. The simulation remains authoritative. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {HoopsDRACOLoader} from './hoops-draco.mjs';
import {bakeV2Motion,createV2MotionPlayer} from './hoops-motion-v2.mjs';
import {applySparseSkinning,createSparseDepthMaterial,applyRegionGloss,glossAttribute} from './hoops-skin-shader.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
const SKINS=['#81513b','#b47c56','#d9a478','#68402c','#9d6548','#edc09b'];
const HAIRS=['#222b38','#17191e','#422c22','#68462e','#28201b','#241c18'];
async function json(path,base){const response=await fetch(new URL(path,base));if(!response.ok)throw Error('Basketball asset unavailable: '+path+' ('+response.status+')');return response.json();}
function releaseScene(scene){const materials=new Set(),geometries=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}}
import {loadPlayerAssetsV1,createAvatarV1} from './hoops-players-v1.mjs';
/** Default (v3, 01/11): the textured motion-capture athletes. `assets.characterVersion: 2`
 * (or ?hoopsCharacters=2) selects the characters2 low-poly athlete with the motion2 clips. */
export async function loadPlayerAssets(cfg,base,onProgress){
 if((cfg.characterVersion??1)!==2)return loadPlayerAssetsV1(cfg,base,onProgress);
 return loadPlayerAssetsV2(cfg,base,onProgress);
}
export async function loadPlayerAssetsV2(cfg,base,onProgress){
 const draco=new HoopsDRACOLoader().setDecoderPath(new URL('vendor/draco/',base).href).setWorkerLimit(1),loader=new GLTFLoader().setDRACOLoader(draco);let character;
 try{
  const manifestPath=cfg.motionManifest||'design/motion2/hoops/manifest.json',manifestURL=new URL(manifestPath,base);
  const pending=await Promise.allSettled([
   loadHoopsGLTF(loader,new URL(cfg.characterModel||'design/hoops/lod/hoops-player-v2-lod.glb',base).href).then(g=>(character=g)),
   json('design/characters/rig.json',base),json('design/viewer/retarget-map.json',base),json('design/characters2/regions.json',base),json('design/motion/hoops.json',base),json(manifestPath,base)
  ]);
  const failure=pending.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  const [loaded,rig,map,regions,baseMotion,manifest]=pending.map(r=>r.value);
  onProgress?.(.15);let loadedClips=0;
  const packages=await Promise.all(manifest.clips.map(async entry=>{const p=await json(entry.file,manifestURL);if(!p.states[entry.clip])throw Error('Basketball manifest state mismatch: '+entry.clip);onProgress?.(.15+.35*++loadedClips/manifest.clips.length);return p;}));
  const baked=await bakeV2Motion(loaded.scene,rig,baseMotion,packages,map,p=>onProgress?.(.5+p*.5));
  let mesh;loaded.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});if(!mesh)throw Error('Basketball v2 has no skinned athlete');
  const prepared=prepareV2Geometry(mesh.geometry,regions);mesh.geometry.dispose();mesh.geometry=prepared.geometry;
  mesh.geometry.computeBoundingBox();const height=mesh.geometry.boundingBox.max.y-mesh.geometry.boundingBox.min.y;
  return {...baked,character:loaded,regions:prepared.regions,sourceColors:prepared.colors,height,manifest,v2:true,dispose(){releaseScene(loaded.scene);draco.dispose();}};
 }catch(error){releaseScene(character?.scene);throw error;}finally{draco.dispose();}
}
/** Keep source topology indexed; the variant viewer's non-indexed preview
 * would triple vertex skinning work in the actual game. */
export function prepareV2Geometry(source,definition){
 const geometry=source.clone(),color=geometry.attributes.color,position=geometry.attributes.position,uv=new Float32Array(position.count*2),regions=[],colors=Float32Array.from(color.array),model=definition.models['basketball-player'],atlas=definition.atlas;
 for(let i=0;i<position.count;i++){
  const rgb=[color.getX(i),color.getY(i),color.getZ(i)],entry=model.sources.find(s=>s.linearRGB.every((n,k)=>Math.abs(n-rgb[k])<(definition.maxColorError||.00001)*2)),region=entry?.rules[0].region||'preserve';regions.push(region);let px=208,py=192;
  if(region==='shirt'||region==='shorts'){
   const projection=atlas.uvProjection[region],x=position.getX(i),y=position.getY(i),shorts=region==='shorts';px=THREE.MathUtils.clamp(x*projection.xScale+projection.xOffset,2,253)/2;
   if(position.getZ(i)<0)px=128-px;px+=shorts?128:0;py=THREE.MathUtils.clamp(y*projection.yScale+projection.yOffset,2,253)/2;
  }else{const swatch=atlas.swatches.indexOf(region);if(swatch>=0){px=swatch*32+16;py=192;}}
  uv[i*2]=px/256;uv[i*2+1]=1-py/256;
 }
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));return {geometry,regions,colors};
}
function uniformAtlas(card,look){
 const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(512,512):Object.assign(document.createElement('canvas'),{width:512,height:512}),context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const shade=(hex,k)=>{const c=new THREE.Color(hex);c.r=Math.min(1,c.r*k);c.g=Math.min(1,c.g*k);c.b=Math.min(1,c.b*k);return '#'+c.getHexString();};
 function draw(kit={}){
  const primary=kit.base||look.primary||'#5b38c9',accent=kit.accent||look.trim||'#f4d377',secondary=kit.accent||look.secondary||accent,g=context;
  g.save();g.scale(2,2);g.fillStyle='#ffffff';g.fillRect(0,0,256,256);
  // jersey (left 128) and shorts (right 128): base colour with a vertical knit gradient
  for(const [x0,top,bottom] of [[0,shade(primary,1.08),shade(primary,.86)],[128,shade(primary,1.04),shade(primary,.8)]]){const gr=g.createLinearGradient(0,0,0,128);if(gr?.addColorStop){gr.addColorStop(0,top);gr.addColorStop(1,bottom);}g.fillStyle=gr?.addColorStop?gr:primary;g.fillRect(x0,0,128,128);}
  // mesh-knit texture: fine dark and light dots in a staggered grid (reads as fabric close up, vanishes far away)
  g.save();g.scale(.5,.5);g.globalAlpha=.07;for(let y=0;y<256;y+=3){for(let x=(y/3%2)*1.5;x<512;x+=3){g.fillStyle=(x+y)%6<3?'#000000':'#ffffff';g.fillRect(x,y,1,1);}}g.restore();
  // side panels on both garments, trimmed with the accent piping and a darker inner seam
  g.fillStyle=secondary;g.fillRect(0,0,23,128);g.fillRect(105,0,23,128);g.fillRect(128,0,20,128);g.fillRect(236,0,20,128);
  g.fillStyle=shade(secondary,.72);g.fillRect(21,0,2,128);g.fillRect(105,0,2,128);g.fillRect(146,0,2,128);g.fillRect(236,0,2,128);
  g.fillStyle=accent;g.fillRect(19,0,3,128);g.fillRect(106,0,3,128);g.fillRect(128,3,128,5);g.fillRect(128,115,128,4);
  // collar and armholes piping across the jersey top, waistband on the shorts
  g.fillStyle=accent;g.fillRect(23,0,82,3);g.fillStyle=shade(primary,.7);g.fillRect(23,3,82,2);g.fillStyle=shade(primary,.62);g.fillRect(148,0,88,6);
  if(kit.pattern==='stripes'){g.globalAlpha=.2;for(let x=29;x<104;x+=12)g.fillRect(x,0,3,128);g.globalAlpha=1;}
  const ink=look.darkText?'#172136':'#ffffff';g.fillStyle=ink;g.strokeStyle=shade(primary,.55);g.lineWidth=2;g.textAlign='center';g.textBaseline='middle';
  g.font='bold 13px "Heebo","Arial Hebrew",sans-serif';g.strokeText(String(look.wordmark||'ISLAND').slice(0,12),64,52,70);g.fillText(String(look.wordmark||'ISLAND').slice(0,12),64,52,70);
  g.font='900 46px "Oswald","Arial Narrow",Arial,sans-serif';g.lineWidth=3;g.strokeText(String(card.number??0),64,92,72);g.fillText(String(card.number??0),64,92,72);
  // small number on the shorts leg
  g.font='900 14px "Oswald","Arial Narrow",Arial,sans-serif';g.lineWidth=1.5;g.strokeText(String(card.number??0),164,60,28);g.fillText(String(card.number??0),164,60,28);
  // swatches: socks, shoes (upper), soles, gloves, helmet, equipment, white, accent
  const swatches=['#eee8de',look.shoe||'#eeeef3','#d8d2c8','#ffffff','#ffffff','#ffffff','#ffffff',accent];for(let i=0;i<8;i++){g.fillStyle=swatches[i];g.fillRect(i*32,128,32,128);}
  // shoe upper: a darker toe cap band and a lace strip read as sneaker detail at any distance
  g.fillStyle=shade(look.shoe||'#eeeef3',.78);g.fillRect(32,128,32,10);g.fillRect(32,246,32,10);g.fillStyle=primary;g.fillRect(44,150,8,90);
  g.restore();texture.needsUpdate=true;
 }
 draw();return {texture,draw};
}
export function createAvatar(assets,card,teamLook,opts={}){
 if(!assets.v2)return createAvatarV1(assets,card,teamLook,opts);
 return createAvatarV2(assets,card,teamLook,opts);
}
export function createAvatarV2(assets,card,teamLook,opts={}){
 const root=cloneSkinned(assets.character.scene);root.name='player-'+card.id;root.userData.characterVersion=2;
 const mats=[],geometries=[],variant=Math.abs(card.look?.skin??card.number??0),skin=new THREE.Color(SKINS[variant%SKINS.length]),hair=new THREE.Color(card.look?.hairTint||HAIRS[variant%HAIRS.length]),atlas=uniformAtlas(card,teamLook);
 root.traverse(o=>{if(!o.isMesh)return;
  const geometry=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(o.geometry.attributes))geometry.setAttribute(name,name==='color'?attribute.clone():attribute);geometry.setIndex(o.geometry.index);geometry.boundingBox=o.geometry.boundingBox?.clone();geometry.boundingSphere=o.geometry.boundingSphere?.clone();o.geometry=geometry;geometries.push(geometry);
  const colors=geometry.attributes.color;
  for(let i=0;i<colors.count;i++){const region=assets.regions[i];if(['shirt','shorts','socks','shoes','soles','accent'].includes(region))colors.setXYZ(i,1,1,1);else if(region==='skin')colors.setXYZ(i,skin.r,skin.g,skin.b);else if(region==='hair')colors.setXYZ(i,hair.r,hair.g,hair.b);}colors.needsUpdate=true;
  // One Blinn-Phong draw per athlete keeps sculpted normals and all arena lights without
  // environment sampling; the per-vertex gloss attribute gives sweaty skin, matte mesh
  // jerseys and glossy sneakers their own highlights, and a rim term separates the
  // silhouette from the floor (broadcast look, 01/11).
  geometry.setAttribute('gloss',glossAttribute(assets.regions));
  const material=applyRegionGloss(applySparseSkinning(new THREE.MeshPhongMaterial({map:atlas.texture,vertexColors:true,shininess:36,specular:0x8f98a8,side:THREE.FrontSide})),{rimColor:0x8fa6d8,rimPower:3.2});material.shadowSide=THREE.FrontSide;o.material=material;mats.push(material);o.customDepthMaterial=createSparseDepthMaterial();mats.push(o.customDepthMaterial);o.castShadow=true;o.receiveShadow=true;
  // Deliberately broad, fixed local bounds cover every authored pose (tested
  // below) without CPU skinning bounds each frame or hiding a raised hand.
  o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,assets.height/2,0),1.35);geometry.boundingSphere=o.boundingSphere.clone();o.frustumCulled=true;
 });
 const scale=(card.ratings?.height||200)/100/assets.height;root.scale.setScalar(scale);const motion=createV2MotionPlayer(root,assets),hands={r:bone(root,'RightHand'),l:bone(root,'LeftHand')};hands.rIdx=hands.r;hands.lIdx=hands.l;let disposed=false;
 return {root,hands,mixer:motion.mixer,actions:motion.actions,mats,card,kind:'characters2',scale,pose(p,ctx,dt){motion.step(p,ctx,dt);},event(e){motion.event(e);},applyKit(kit){atlas.draw(kit);},get motionState(){return motion.state;},get motionTime(){return motion.time;},get motionPhase(){return motion.phase;},get motionContacts(){return motion.contacts;},get motionPivot(){return motion.pivot;},dispose(){if(disposed)return;disposed=true;motion.dispose();for(const m of mats)m.dispose();for(const g of geometries)g.dispose();atlas.texture.dispose();root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});}};
}
function bone(root,name){let result=null;root.traverse(o=>{if(!result&&o.isBone&&o.name===name)result=o;});return result;}
export {bone};
