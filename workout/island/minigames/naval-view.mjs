import {createNavalProjectiles} from './naval-projectiles.mjs?v=island-integration-20261030-1';
import {createNavalImpacts} from './naval-impacts.mjs?v=island-integration-20261030-1';
import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {navalWorldPoint,navalProjectileHeight} from './naval-camera.mjs?v=island-integration-20261030-1';
import {createNavalEffects} from './g6d-effects.mjs?v=island-integration-20261030-1';
import {loadPatrolBoat,disposeBoat} from './patrol-boat.mjs?v=island-integration-20261030-1';
import {createNavalScenery} from './naval-scenery.mjs?v=island-integration-20261030-1';
import {createNavalEnvironment} from './naval-environment.mjs?v=island-integration-20261030-1';
import {createNavalAimArc} from './naval-aim-view.mjs?v=island-integration-20261030-1';
import {createNavalDressing} from './naval-dressing.mjs?v=island-integration-20261030-1';

/** Procedural meshes are isolated here so a GLB vessel can replace this factory.
 * One scene/context per round. All geometry, vectors and effects are warmed once. */
/** Our ship only: the existing texture keeps its detail, but is re-tinted by
 * height into a blue-grey lower hull and a light deck and superstructure, with
 * the texture's own orange parts kept as #E07843 accents. Dirt and blotch
 * contrast drop by about 20%. Shading only: same GLB, mesh, UVs and draw calls. */
export const PLAYER_PAINT={low:'#536F80',deck:'#B9C9CC',accent:'#E07843',contrast:.8,split:[.37,.41]};
// Same orange test as the shader, on linear colour; used to measure the accent share.
const orangeWeight=(r,g,b)=>Math.min(1,Math.max(0,(r-g*1.35)/.12))*Math.min(1,Math.max(0,(g-b*1.2)/.04))*Math.min(1,Math.max(0,(r-.18)/.1));
function textureStats(map){
 try{const img=map?.image;if(!img||typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,64,64);const d=g.getImageData(0,0,64,64).data,lin=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  let lum=0,accent=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<8)continue;const r=lin(d[i]),gg=lin(d[i+1]),b=lin(d[i+2]);lum+=.2126*r+.7152*gg+.0722*b;accent+=orangeWeight(r,gg,b);n++;}
  return n?{meanLum:lum/n,accentShare:accent/n}:null;}catch{return null;}
}
function playerPaint(node,mat,model,stats){
 if(!node.geometry?.attributes?.position||mat.userData.hullBands)return null;
 const toBoat=new THREE.Matrix4();for(let o=node;o;o=o.parent){o.updateMatrix();toBoat.premultiply(o.matrix);if(o===model)break;}
 node.geometry.computeBoundingBox();const box=node.geometry.boundingBox.clone().applyMatrix4(toBoat),range=new THREE.Vector2(box.min.y,box.max.y);
 const info=textureStats(mat.map)||{meanLum:.5,accentShare:null},u={uToBoat:{value:toBoat},uHullRange:{value:range},uLow:{value:new THREE.Color(PLAYER_PAINT.low)},uDeck:{value:new THREE.Color(PLAYER_PAINT.deck)},uAccent:{value:new THREE.Color(PLAYER_PAINT.accent)},uMeanLum:{value:Math.max(.05,info.meanLum)},uContrast:{value:PLAYER_PAINT.contrast}};
 if(mat.color)mat.color.set('#ffffff');mat.userData.hullBands=true;mat.customProgramCacheKey=()=>'naval-player-paint';
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,u);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToBoat;uniform vec2 uHullRange;varying float vHullY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvHullY=clamp(((uToBoat*vec4(transformed,1.)).y-uHullRange.x)/max(1e-4,uHullRange.y-uHullRange.x),0.,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vHullY;uniform vec3 uLow;uniform vec3 uDeck;uniform vec3 uAccent;uniform float uMeanLum;uniform float uContrast;').replace('#include <map_fragment>',`#include <map_fragment>
 vec3 tex=diffuseColor.rgb;float lum=dot(tex,vec3(.2126,.7152,.0722));
 float detail=clamp(mix(uMeanLum,lum,uContrast)/uMeanLum,.45,1.45);
 float orange=clamp((tex.r-tex.g*1.35)/.12,0.,1.)*clamp((tex.g-tex.b*1.2)/.04,0.,1.)*clamp((tex.r-.18)/.1,0.,1.);
 float low=1.-smoothstep(${PLAYER_PAINT.split[0].toFixed(2)},${PLAYER_PAINT.split[1].toFixed(2)},vHullY);
 float waterline=smoothstep(.25,.27,vHullY)*(1.-smoothstep(.30,.32,vHullY));
 vec3 base=mix(mix(uDeck,uLow,low),uAccent,orange);
 diffuseColor.rgb=base*mix(detail,1.,orange*.5)*(1.-.3*waterline);`);
 };
 return info;
}
/** Shading-only separation of hull, waterline and deck on the existing GLB
 * material: a cooler, darker lower hull, a thin dark waterline and a slightly
 * warmer deck, by height in the boat's own upright frame. No new geometry,
 * texture or draw call; the mesh and its UVs are untouched. */
function hullBands(node,mat,model){
 if(!node.geometry?.attributes?.position||mat.userData.hullBands)return;
 const toBoat=new THREE.Matrix4();for(let o=node;o;o=o.parent){o.updateMatrix();toBoat.premultiply(o.matrix);if(o===model)break;}
 node.geometry.computeBoundingBox();const box=node.geometry.boundingBox.clone().applyMatrix4(toBoat),range=new THREE.Vector2(box.min.y,box.max.y);
 mat.userData.hullBands=true;mat.customProgramCacheKey=()=>'naval-hull-bands';
 mat.onBeforeCompile=shader=>{
  shader.uniforms.uToBoat={value:toBoat};shader.uniforms.uHullRange={value:range};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToBoat;uniform vec2 uHullRange;varying float vHullY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvHullY=clamp(((uToBoat*vec4(transformed,1.)).y-uHullRange.x)/max(1e-4,uHullRange.y-uHullRange.x),0.,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vHullY;').replace('#include <map_fragment>',`#include <map_fragment>
 float hullBand=1.-smoothstep(.27,.36,vHullY);
 float waterline=smoothstep(.25,.27,vHullY)*(1.-smoothstep(.30,.32,vHullY));
 float deckBand=smoothstep(.38,.46,vHullY)*(1.-smoothstep(.62,.72,vHullY));
 diffuseColor.rgb*=mix(vec3(1.),vec3(.52,.61,.74),hullBand*.9);
 diffuseColor.rgb*=1.-.42*waterline;
 diffuseColor.rgb*=mix(vec3(1.),vec3(1.07,1.,.88),deckBand);`);
 };
}
export function createVessel(THREE, colors, equipment={},variant={},playerModel=null,adapters={}) {
  const root=new THREE.Group(),staticParts=new THREE.Group(),turret=new THREE.Group();root.add(staticParts,turret);
  const materials=new Map(),geometries=new Set();
  function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.16}));return materials.get(color);}
  function mesh(geo,color,x,y,z,parent=staticParts){geometries.add(geo);const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);parent.add(m);return m;}
  function box(w,h,d,color,x,y,z,parent){return mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);}
  // Closed, pointed hull with a broad stern and sloped sides, rather than a box.
  const shape=new THREE.Shape();shape.moveTo(-1.25,2.9);shape.lineTo(1.25,2.9);shape.quadraticCurveTo(1.7,-1.2,0,-4.7);shape.quadraticCurveTo(-1.7,-1.2,-1.25,2.9);
  const hull=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:true,bevelSize:.24,bevelThickness:.32,bevelSegments:1,steps:1,curveSegments:6});hull.rotateX(Math.PI/2);
  hull.scale(variant.beam||1,1,variant.length||1);
  mesh(hull,colors.hull,0,.5,0);const deck=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false,curveSegments:6});deck.rotateX(Math.PI/2);deck.scale(variant.beam||1,1,variant.length||1);mesh(deck,colors.deck,0,.68,0);
  box(1.6,.85,2.15,colors.metal,0,1.15,.3);box(1.9,.24,2.4,colors.deck,0,1.65,.3);
  box(1.5,.65,1.15,colors.hull,0,2.05,.15);box(1.55,.28,.06,colors.glass,0,2.15,-.45);
  for(let side=-1;side<=1;side+=2){box(.05,.28,.85,colors.glass,side*.8,2.15,.1);for(let i=0;i<4;i++)box(.06,.15,.22,colors.deck,side*1.35,.1,i*.95-1.2);}
  const funnel=mesh(new THREE.CylinderGeometry(.3,.38,1,8),colors.metal,0,2,1.5);box(.74,.14,.74,colors.deck,0,2.45,1.5);
  box(.09,2.2,.09,colors.metal,0,3,.55);box(1.4,.06,.06,colors.deck,0,3.7,.55);
  const flag=new THREE.Object3D();root.add(flag);
  turret.position.set(0,.85,-2.1);mesh(new THREE.CylinderGeometry(.54,.67,.35,10),colors.metal,0,0,0,turret);
  // The barrel geometry starts at its breech, so elevation pivots like a real gun.
  const barrelTube=new THREE.CylinderGeometry(.1,.12,1.8,10);barrelTube.rotateX(Math.PI/2);barrelTube.translate(0,0,-.9);const muzzleRing=new THREE.TorusGeometry(.12,.045,6,12);muzzleRing.translate(0,0,-1.78);
  const barrelGeometry=mergeGeometries([barrelTube.toNonIndexed(),muzzleRing.toNonIndexed()]);barrelTube.dispose();muzzleRing.dispose();const barrel=mesh(barrelGeometry,colors.metal,0,.2,.05,turret);
  // A sloped gun shield and trunnion cheeks make the turret read at phone size.
  const shieldGeometry=new THREE.CylinderGeometry(.5,.62,.5,10,1,false,Math.PI*.15,Math.PI*1.7);shieldGeometry.translate(0,.3,.02);mesh(shieldGeometry,colors.metal,0,0,0,turret);
  for(const side of [-1,1])box(.1,.32,.42,colors.metal,side*.24,.26,-.12,turret);

  for(let i=1;i<(variant.turrets||1);i++){mesh(new THREE.CylinderGeometry(.42,.55,.3,8),colors.metal,0,0,2+i*.85,turret);box(.16,.18,1.5,colors.metal,0,.16,1.3+i*.85,turret);}
  if((equipment.damage||1)>1)box(.18,.2,1.8,colors.metal,.35,.18,-.85,turret);
  if((equipment.hull||1)>1)for(let side=-1;side<=1;side+=2)box(.17,.55,4.6,colors.metal,side*1.36,.25,.3);
  if((equipment.ammo||0)>0)for(let i=0;i<3;i++)box(.35,.42,.65,colors.deck,.7,1.02,1+i*.45);
  if((equipment.rate||1)>1)box(.4,.3,.8,colors.glass,0,1,-1.7);
  // Railing, lifebuoys, vent fins, deck ribs and a radar make the silhouette readable.
  for(let side=-1;side<=1;side+=2){
    for(let i=0;i<5;i++)box(.045,.45,.045,colors.metal,side*1.16,.95,2.5-i*.85);
    box(.045,.045,3.5,colors.metal,side*1.16,1.16,.8);
    const ring=mesh(new THREE.TorusGeometry(.26,.065,5,12),colors.flame,side*1.38,.68,1.7);ring.rotation.y=Math.PI/2;
    for(let i=0;i<4;i++)box(.16,.04,.18,colors.deck,side*.85,1.45,.7+i*.19);
  }
  for(let i=0;i<6;i++)box(2,.018,.025,colors.metal,0,.7,2.5-i*.2);
  box(.7,.08,.18,colors.glass,0,3.9,.55);
  // Merge immovable parts by material once. Articulation/effects remain separate.
  const batches=new Map();
  for(const part of staticParts.children){part.updateMatrix();const baked=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();baked.applyMatrix4(part.matrix);baked.deleteAttribute('uv');if(!batches.has(part.material))batches.set(part.material,[]);batches.get(part.material).push(baked);geometries.delete(part.geometry);part.geometry.dispose();}
  staticParts.clear();
  for(const [mat,parts]of batches){const combined=mergeGeometries(parts);for(const part of parts)part.dispose();geometries.add(combined);staticParts.add(new THREE.Mesh(combined,mat));}
  // While the full GLB loads, omit only the temporary fallback hull from
  // the low-resolution mirror. It remains visible in the main camera.
  if(playerModel)staticParts.traverse(node=>{if(node.isMesh)node.layers.set(1);});
  // Each articulated turret keeps its moving barrel. All remaining metal
  // retains the same triangles and normals in one draw per material.
  function batchTurret(){const turretBatches=new Map();
  for(const part of [...turret.children]){if(part===barrel||!part.isMesh)continue;part.updateMatrix();const baked=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();baked.applyMatrix4(part.matrix);baked.deleteAttribute('uv');if(!turretBatches.has(part.material))turretBatches.set(part.material,[]);turretBatches.get(part.material).push(baked);geometries.delete(part.geometry);part.geometry.dispose();part.removeFromParent();}
  for(const [mat,parts]of turretBatches){const combined=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometries.add(combined);turret.add(new THREE.Mesh(combined,mat));}}
  if(playerModel)batchTurret();
  const shield=mesh(new THREE.SphereGeometry(4,12,8),colors.glass,0,1,0,root);shield.material=new THREE.MeshBasicMaterial({color:colors.glass,wireframe:true,transparent:true,opacity:.1});shield.visible=(equipment.shield||0)>0;
  const foam=mesh(new THREE.RingGeometry(2.2,2.35,20),colors.foam,0,-.12,1,root);foam.rotation.x=-Math.PI/2;foam.scale.set(.7,2.7,1);
  const reflection=mesh(new THREE.PlaneGeometry(2.5,7),colors.hull,0,-.15,0,root);reflection.rotation.x=-Math.PI/2;reflection.material=new THREE.MeshBasicMaterial({color:colors.hull,transparent:true,opacity:.18});
  // Reflective water supplies the real hull reflection; the old rectangular
  // decal only added an underwater draw and a dark straight edge.
  reflection.visible=false;
  const shadow=mesh(new THREE.CircleGeometry(2.5,16),colors.metal,0,-.13,.1,root);shadow.rotation.x=-Math.PI/2;shadow.scale.set(.65,1.6,1);shadow.material=new THREE.MeshBasicMaterial({color:colors.metal,transparent:true,opacity:.18});
  // A narrow, soft flame preserves the silhouette and the original deck texture.
  const smoke=new THREE.Group();root.add(smoke);
  const flameMap=typeof document==='undefined'?null:(()=>{const c=document.createElement('canvas');c.width=64;c.height=128;const b=c.getContext('2d'),g=b.createRadialGradient(32,92,2,32,77,48);g.addColorStop(0,'#ffeab5');g.addColorStop(.2,'#ffd46bea');g.addColorStop(.5,'#ff8b2dd6');g.addColorStop(1,'#e5702300');b.fillStyle=g;b.beginPath();b.moveTo(32,4);b.bezierCurveTo(27,55,5,75,13,103);b.bezierCurveTo(18,126,50,125,53,100);b.bezierCurveTo(59,79,38,60,32,4);b.fill();return new THREE.CanvasTexture(c);})();
  const flameGeometry=new THREE.PlaneGeometry(1,1);geometries.add(flameGeometry);const flame=new THREE.Mesh(flameGeometry,new THREE.MeshBasicMaterial({map:flameMap,color:'#ffffff',transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,blending:THREE.NormalBlending,toneMapped:false}));flame.position.set(.7,.85,.9);flame.scale.set(.48,1.1,1);root.add(flame);flame.visible=false;
  let model,modelLength,disposed=false,paintInfo=null;const tinted=[],scorched=new THREE.Color('#2f2b28');
  // Our turret and gun shield read as the lightest part (#DDE6E5); enemy turrets keep gunmetal.
  for(const [color,mat] of materials)if(color===colors.metal){mat.roughness=variant.player?.4:.36;mat.metalness=variant.player?.32:.58;if(variant.player)mat.color.set('#DDE6E5');}const modelStatus={requested:Boolean(playerModel),loaded:false,failed:false};
  const ready=playerModel?loadPatrolBoat(playerModel,adapters).then(loaded=>{
    if(disposed){if(loaded)disposeBoat(loaded);return;}
    if(!loaded){modelStatus.failed=true;return;}
    model=loaded;
    // Keep every Meshy vertex, UV and source texel. The finish only controls
    // how the existing paint responds to daylight; it does not recolor it.
    // Slightly warmer paint and a little more sheen separate hull, deck and the gunmetal turret.
    model.traverse(node=>{if(!node.isMesh)return;for(const mat of Array.isArray(node.material)?node.material:[node.material]){mat.roughness=.55;mat.metalness=.14;if(mat.color)mat.color.set(variant.paint||'#f6efe2');if(mat.map)mat.map.anisotropy=4;if(variant.player){const info=playerPaint(node,mat,model);if(info)paintInfo=info;}else hullBands(node,mat,model);mat.needsUpdate=true;tinted.push({mat,base:mat.color?.clone()});}});
    root.add(model);staticParts.visible=false;modelStatus.loaded=true;modelLength=playerModel.length*playerModel.scale*root.scale.x;
    turret.position.fromArray(playerModel.cannonPivot);
  }).catch(()=>{if(!disposed)modelStatus.failed=true;}):Promise.resolve();
  return {root,turret,barrel,flag,funnel,shield,foam,smoke,flame,ready,modelStatus,get body(){return model||staticParts;},setDamage(amount){for(const {mat,base} of tinted)if(base)mat.color.copy(base).lerp(scorched,Math.max(0,Math.min(1,amount))*.42);},get modelLength(){return modelLength;},get paint(){return paintInfo;},dispose(){if(disposed)return;disposed=true;if(model){disposeBoat(model);model=null;}flameMap?.dispose();for(const g of geometries)g.dispose();const all=new Set(materials.values());root.traverse(o=>{if(o.material)all.add(o.material);});for(const m of all)m.dispose();}};
}

/** Both Meshy boats have a -X bow, normalized to -Z by the same rotation.
 * Yaw follows displacement without reflecting the asymmetric gunboat. */
export function vesselHeading(v,x,z,time) {
  if(v.lastTime!==undefined&&time>v.lastTime){const dx=x-v.lastX,dz=z-v.lastZ;if(dx*dx+dz*dz>1e-10)v.root.rotation.y=Math.atan2(-dx,-dz);}
  v.lastX=x;v.lastZ=z;v.lastTime=time;
}

export function createNavalView(ctx,model,adapters={}) {
  const {config,balance}=ctx,r=balance.render;
  let renderer,failed=false,disposed=false,low=false,peakTriangles=0,peakDrawCalls=0;
  const canvas=adapters.canvas||document.createElement('canvas');
  try{renderer=(adapters.createRenderer||((options)=>new THREE.WebGLRenderer(options)))({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch{return null;}
  renderer.info.autoReset=false;
  renderer.setSize(r.width,r.height,false);renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(r.sky);scene.fog=new THREE.Fog(r.sky,r.fogNear,r.fogFar);
  const camera=new THREE.PerspectiveCamera(r.follow.fov,r.width/r.height,r.follow.near,r.follow.far);
  // Preserve full Meshy palms in the main view. Their distant reflection is
  // omitted from the 256px mirror; islands and all vessels still reflect.
  camera.layers.enable(1);
  function syncCamera(){const c=model.camera;camera.position.set(c.position.x,c.position.y,c.position.z);camera.lookAt(c.focus.x,c.focus.y,c.focus.z);camera.fov=c.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  syncCamera();
  const seaGeometry=new THREE.PlaneGeometry(r.seaSize,r.seaSize,r.waterSegments,r.waterSegments);seaGeometry.rotateX(-Math.PI/2);
  const seaMaterial=new THREE.MeshStandardMaterial({color:r.sea,roughness:.8,metalness:.05,flatShading:true});const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.position.set(0,-.25,-35);sea.scale.set(900/r.seaSize,1,900/r.seaSize);scene.add(sea);
  const sunGeometry=new THREE.SphereGeometry(7,16,8),sunMaterial=new THREE.MeshBasicMaterial({color:r.sun}),sun=new THREE.Mesh(sunGeometry,sunMaterial);sun.position.set(-22,12,-95);scene.add(sun);
  const environment=createNavalEnvironment(scene,renderer,sea,sun);
  const player=createVessel(THREE,r,model.equipment,{player:true},balance.playerModel);player.root.scale.setScalar(r.playerScale);scene.add(player.root);
  const vessels=model.enemies.map(e=>{const type=balance.shipTypes[e.kind],variant=e.boss?balance.boss:type,scale=type.scale*(e.boss?balance.boss.scale:1),spec=variant.modelSpec||(balance.enemyModel&&{...balance.enemyModel,length:(balance.playerModel?.length??balance.enemyModel.length)*r.playerScale/scale});const v=type.submarine?createSubmarine(r,r.effects):createVessel(THREE,{...r,hull:variant.hull},{},variant,spec);v.root.rotation.y=Math.PI;v.root.scale.setScalar(scale);scene.add(v.root);return v;});
  const scenery=createNavalEffects(scene,seaMaterial,model,balance),adventure=createNavalScenery(scene,model,balance,adapters);
  const projectiles=createNavalProjectiles(scene,model,balance),impacts=createNavalImpacts(scene,model,config,balance);
  const aimGeometry=new THREE.BufferGeometry(),aimArray=new Float32Array(18*3);aimGeometry.setAttribute('position',new THREE.BufferAttribute(aimArray,3));const aimMaterial=new THREE.LineBasicMaterial({color:r.foam}),aimLine=new THREE.LineSegments(aimGeometry,aimMaterial);aimLine.userData.noReflect=true;scene.add(aimLine);
  const arc=createNavalAimArc(scene,model,balance),dressing=createNavalDressing(scene,balance,{maxShips:model.enemies.length+1});
  const projected=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),intersection=new THREE.Vector3();camera.updateMatrixWorld();const positions=seaGeometry.attributes.position;

  const fx=r.effects,flashGeometry=new THREE.PlaneGeometry(fx.flashSize*2.4,fx.flashSize*2.4),flashMaterial=new THREE.MeshBasicMaterial({color:r.flame,transparent:true,depthWrite:false}),flash=new THREE.Mesh(flashGeometry,flashMaterial);flash.userData.noReflect=true;scene.add(flash);
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;const brush=smokeCanvas.getContext('2d'),gradient=brush.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#e0e3dfaa');gradient.addColorStop(1,'#e0e3df00');brush.fillStyle=gradient;brush.fillRect(0,0,64,64);const smokeTexture=new THREE.CanvasTexture(smokeCanvas),smokeMaterial=new THREE.MeshBasicMaterial({map:smokeTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}),muzzleSmokeGeometry=new THREE.PlaneGeometry(1,1),muzzleSmoke=new THREE.Mesh(muzzleSmokeGeometry,smokeMaterial);muzzleSmoke.userData.noReflect=true;scene.add(muzzleSmoke);
  flashMaterial.map=smokeTexture;flashMaterial.blending=THREE.AdditiveBlending;flashMaterial.toneMapped=false;
  const gatling=new THREE.Group(),gatlingGeometry=new THREE.CylinderGeometry(fx.subTube/3,fx.subTube/3,fx.salvoLength,6),gatlingMaterial=new THREE.MeshStandardMaterial({color:r.metal});
  const salvoParts=[];for(let i=0;i<3;i++){const g=gatlingGeometry.clone(),a=i*Math.PI*2/fx.salvoBarrels;g.rotateX(Math.PI/2);g.translate(Math.cos(a)*fx.salvoRadius,Math.sin(a)*fx.salvoRadius,0);salvoParts.push(g);}const salvoGeometry=mergeGeometries(salvoParts);salvoParts.forEach(g=>g.dispose());gatling.add(new THREE.Mesh(salvoGeometry,gatlingMaterial));gatling.position.set(0,.18,-1);player.turret.add(gatling);
  const muzzle=new THREE.Vector3();let lastFire=-Infinity,lastFired=0;

  const onLost=event=>{event.preventDefault();failed=true;};canvas.addEventListener('webglcontextlost',onLost);
  function animateVessel(v,e,x,z,enemy){
    if(enemy)vesselHeading(v,x,z,model.time);else v.root.rotation.y=-model.playerShip.heading;
    const sink=e.hp<=0?Math.min(1,(model.time-(e.sunkAt??model.time))/balance.sinkSeconds):0;
    // Presentation-only hit reaction: a short shove away from the shooter and a roll that settles.
    if(enemy){if(v.lastHp!==undefined&&e.hp<v.lastHp){const p=navalWorldPoint(model.playerShip.x,model.playerShip.z,balance),dx=x-p.x,dz=z-p.z,len=Math.hypot(dx,dz)||1;v.hitAt=model.time;v.hitX=dx/len;v.hitZ=dz/len;}v.lastHp=e.hp;v.setDamage?.(1-Math.max(0,e.hp)/e.maxHp);}
    const age=v.hitAt===undefined?9:model.time-v.hitAt,kick=age<1.2?Math.exp(-age*4.5):0;
    v.root.position.set(x+(v.hitX||0)*.55*kick*Math.min(1,age*12),Math.sin(model.time*1.6+(e.index||0))*.12-sink*4-kick*.12,z+(v.hitZ||0)*.55*kick*Math.min(1,age*12));v.root.rotation.z=Math.sin(model.time*1.9+x)*.035+sink*.3+Math.sin(age*16)*.16*kick;
    // The player's turret shows the real firing yaw and barrel elevation; enemies face the player.
    if(enemy){const target=navalWorldPoint(model.playerShip.x,model.playerShip.z,balance);v.turret.rotation.y=Math.atan2(x-target.x,z-target.z)-v.root.rotation.y;v.barrel.rotation.x=.3;}
    else{v.turret.rotation.y=-((model.yaw??0)-(model.playerShip.heading||0));v.barrel.rotation.x=model.ammoIndex===2?0:(model.elevation??10)*Math.PI/180;}
    v.barrel.position.z=.05+e.recoil*.6;
    v.flag.visible=false;v.flag.rotation.y=Math.sin(model.time*4)*.2;v.shield.visible=e.shield>0;v.smoke.visible=e.hp<e.maxHp;v.flame.visible=e.hp<e.maxHp;
    v.smoke.position.y=3+(model.time%2);v.smoke.scale.setScalar(.6+(model.time%2)*.5);v.flame.position.set(.95,e.hp<e.maxHp?2.6:.85,1.35);v.flame.quaternion.copy(v.root.quaternion).invert().multiply(camera.quaternion);v.flame.scale.set(.6+Math.sin(model.time*17)*.05,1.6+Math.sin(model.time*12)*.18,1);v.foam.visible=false;
  }
  function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);arc.dispose();dressing.dispose();environment.dispose();adventure.dispose();player.dispose();for(const v of vessels)v.dispose();projectiles.dispose();impacts.dispose();scenery.dispose();smokeTexture.dispose();smokeMaterial.dispose();flashMaterial.dispose();gatlingMaterial.dispose();for(const g of [seaGeometry,sunGeometry,aimGeometry,flashGeometry,gatlingGeometry,salvoGeometry,muzzleSmokeGeometry])g.dispose();for(const m of [seaMaterial,sunMaterial,aimMaterial])m.dispose();renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;}
  /** Share of the screen height the player's hull occupies (aim framing target). */
  const frameBox=new THREE.Box3(),corner=new THREE.Vector3();
  // Measured from the hull's actual vertices (every 4th), not its bounding box.
  function playerBox(){if(failed||disposed)return null;let min=Infinity,max=-Infinity,minX=Infinity,maxX=-Infinity;player.root.updateMatrixWorld(true);player.body.traverse(node=>{if(!node.isMesh||!node.geometry?.attributes?.position)return;const pos=node.geometry.attributes.position;for(let i=0;i<pos.count;i+=4){corner.fromBufferAttribute(pos,i).applyMatrix4(node.matrixWorld).project(camera);min=Math.min(min,corner.y);max=Math.max(max,corner.y);minX=Math.min(minX,corner.x);maxX=Math.max(maxX,corner.x);}});if(!Number.isFinite(min))return null;return {height:(Math.min(1,max)-Math.max(-1,min))/2,top:(1-Math.min(1,max))/2,bottom:(1-Math.max(-1,min))/2,left:(Math.max(-1,minX)+1)/2,right:(Math.min(1,maxX)+1)/2};}
  return {get mode(){return failed?'perspective':'three';},resetPeak(){peakTriangles=0;peakDrawCalls=0;},capturePreview(){if(failed||disposed)return null;renderer.info.reset();renderer.render(scene,camera);return canvas.toDataURL('image/png');},metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,peak:{triangles:peakTriangles,drawCalls:peakDrawCalls},playerModel:{...player.modelStatus},disposed,
    environment:environment.metrics(),models:{requested:Number(Boolean(balance.playerModel))+Number(vessels.some(v=>v.modelStatus.requested)),loaded:Number(player.modelStatus.loaded)+Number(vessels.some(v=>v.modelStatus.loaded)),failed:Number(player.modelStatus.failed)+Number(vessels.some(v=>v.modelStatus.failed))},
    playerMarkers:{flag:player.flag.visible,flame:player.flame.visible,flameY:player.flame.position.y},effects:scenery.metrics(),playerBox:playerBox(),playerPaint:player.paint,aimArc:arc.metrics(),dressing:dressing.metrics(),projectiles:projectiles.metrics(),impacts:impacts.metrics(),scenery:adventure.metrics(),camera:JSON.parse(JSON.stringify(model.camera)),gpu:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length||0},quality:low?'low':'full',playerLoaded:player.modelStatus.loaded,enemiesLoaded:vessels.filter(v=>v.modelStatus.loaded).length,playerLength:player.modelLength,enemyLengths:vessels.map(v=>v.modelLength),headings:vessels.map(v=>v.root.rotation.y),periscopes:vessels.map(v=>Boolean(v.periscope?.visible))};},degrade(fallback=false){if(fallback){failed=true;dispose();}else if(!low){low=true;environment.degrade();dressing.degrade();renderer.setSize(r.width*.75,r.height*.75,false);}},dispose,
    resize(){if(failed||disposed)return;camera.aspect=config.width/config.height;camera.updateProjectionMatrix();renderer.setSize(Math.min(config.width,1280)*(low?.75:1),Math.min(config.width,r.width)*config.height/config.width*(low?.75:1),false);},
    projectTarget(x,z,y=0){if(failed||disposed)return null;return model.screenPoint(x,z,y);},
    targetAt(x,y){if(failed||disposed)return null;pointer.set(x/config.width*2-1,1-y/config.height*2);raycaster.setFromCamera(pointer,camera);if(!raycaster.ray.intersectPlane(seaPlane,intersection))return null;return {x:balance.shipX-intersection.z/r.worldScale,z:intersection.x/r.enemySpacing*balance.combat.laneSpacing};},
    draw(p){
      if(failed||disposed)return false;
      try{
        if(sea.visible){for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,Math.sin(x*.32+model.time*r.waveSpeed)*Math.cos(z*.2+model.time)*r.waveHeight);}positions.needsUpdate=true;seaGeometry.computeVertexNormals();}
        const px=model.playerShip.z*r.enemySpacing/balance.combat.laneSpacing,pz=-(model.playerShip.x-balance.shipX)*r.worldScale;animateVessel(player,model.playerShip,px,pz,false);syncCamera();environment.update(model.time,camera);scenery.update(camera);adventure.update(player.root,camera);
        if(model.fired!==lastFired){lastFired=model.fired;lastFire=['mine','repair'].includes(model.lastAction?.type)?-Infinity:model.time;}const fireAge=model.time-lastFire;
        gatling.visible=model.ammoIndex===4;player.barrel.visible=!gatling.visible;gatling.rotation.z=0;
        gatling.rotation.x=player.barrel.rotation.x;player.root.updateMatrixWorld(true);muzzle.set(0,0,-1.85);player.barrel.localToWorld(muzzle);
        flash.visible=fireAge<fx.flashSeconds;flash.position.copy(muzzle);flash.quaternion.copy(camera.quaternion);flash.scale.setScalar(1+fireAge/fx.flashSeconds);flashMaterial.opacity=Math.max(0,1-fireAge/fx.flashSeconds);
        muzzleSmoke.visible=fireAge<fx.smokeSeconds;muzzleSmoke.quaternion.copy(camera.quaternion);muzzleSmoke.position.copy(muzzle);muzzleSmoke.position.y+=fireAge*fx.smokeSize;smokeMaterial.opacity=Math.max(0,1-fireAge/fx.smokeSeconds);muzzleSmoke.scale.setScalar(fx.smokeSize+fireAge*fx.smokeSize*4);

        for(let i=0;i<vessels.length;i++){const e=model.enemies[i],v=vessels[i];v.root.visible=e.active;if(e.active){animateVessel(v,e,e.z*r.enemySpacing/balance.combat.laneSpacing,-(e.x-balance.shipX)*r.worldScale,true);if(balance.shipTypes[e.kind].submarine){v.root.position.y-=e.depth*fx.submergedY;v.periscope.visible=e.hp>0;}}}
        const hulls=[{x:player.root.position.x,z:player.root.position.z,yaw:player.root.rotation.y,length:player.modelLength||11,speed:(model.playerShip.speed||0)*r.worldScale,visible:true}];
        for(let i=0;i<vessels.length;i++){const e=model.enemies[i],v=vessels[i];hulls.push({x:v.root.position.x,z:v.root.position.z,yaw:v.root.rotation.y,length:v.modelLength||9*(e.hullScale||1),speed:Math.hypot(e.vx||0,e.vz||0)*r.worldScale,visible:e.active&&e.hp>0&&!(balance.shipTypes[e.kind].submarine&&e.depth>0)});}
        const b=model.blast;dressing.update(hulls,model.time,{life:b.life,critical:b.critical,wx:b.z*r.enemySpacing/balance.combat.laneSpacing,wz:-(b.x-balance.shipX)*r.worldScale},config.visuals.blastSeconds);
        projectiles.update(camera);impacts.update(camera);arc.update(camera);
        aimLine.visible=false;
        renderer.info.reset();renderer.render(scene,camera);peakTriangles=Math.max(peakTriangles,renderer.info.render.triangles);peakDrawCalls=Math.max(peakDrawCalls,renderer.info.render.calls);p.drawImage(canvas,0,0,config.width,config.height);
        return true;
      }catch{failed=true;dispose();return false;}
    }
  };
}

function createSubmarine(r,fx){
 const root=new THREE.Group(),turret=new THREE.Group(),barrel=new THREE.Object3D(),flag=new THREE.Object3D(),smoke=new THREE.Group(),flame=new THREE.Object3D(),foam=new THREE.Object3D(),shield=new THREE.Object3D();turret.add(barrel);root.add(turret,flag,smoke,flame,foam,shield);
 const material=new THREE.MeshStandardMaterial({color:'#344b53',roughness:.48,metalness:.35}),hullGeometry=new THREE.CapsuleGeometry(fx.subBeam,fx.subLength-fx.subBeam*2,6,12),hull=new THREE.Mesh(hullGeometry,material);hull.rotation.x=Math.PI/2;root.add(hull);
 const towerGeometry=new THREE.CylinderGeometry(fx.subBeam*.6,fx.subBeam,fx.subBeam*2,8),tower=new THREE.Mesh(towerGeometry,material);tower.position.y=fx.subBeam;root.add(tower);
 const scopeGeometry=new THREE.CylinderGeometry(fx.periscopeBeam,fx.periscopeBeam,fx.periscopeHeight,6),scopeMaterial=new THREE.MeshStandardMaterial({color:r.foam,roughness:.4}),periscope=new THREE.Group(),stem=new THREE.Mesh(scopeGeometry,scopeMaterial),head=new THREE.Mesh(scopeGeometry,scopeMaterial);stem.position.y=fx.periscopeHeight/2;head.rotation.z=Math.PI/2;head.scale.y=fx.periscopeBeam;head.position.set(fx.periscopeBeam,fx.periscopeHeight,0);periscope.add(stem,head);root.add(periscope);
 // The existing code-built submarine has no Meshy asset. Add casing seams,
 // hydroplanes and launch tubes as one batch rather than replacing any vessel.
 const detailParts=[],detailMaterial=new THREE.MeshStandardMaterial({color:'#607b7d',roughness:.52,metalness:.32});
 function detail(geometry,x,y,z,rotation=0){geometry.rotateY(rotation);geometry.translate(x,y,z);detailParts.push(geometry.toNonIndexed());geometry.dispose();}
 detail(new THREE.BoxGeometry(.82,.14,4.7),0,fx.subBeam*.83,.15);
 for(const side of [-1,1]){detail(new THREE.BoxGeometry(.95,.075,.65),side*.84,0,-2.5,.18*side);detail(new THREE.BoxGeometry(.82,.065,.62),side*.75,.05,2.9,-.2*side);for(const z of [-1.65,-.75,.15,1.05,1.95])detail(new THREE.BoxGeometry(.05,.045,.25),side*.44,fx.subBeam*.96,z);}
 for(const x of [-.27,.27]){const tube=new THREE.CylinderGeometry(.12,.12,1.2,10);tube.rotateX(Math.PI/2);detail(tube,x,-.16,-2.45);}
 detail(new THREE.BoxGeometry(.07,.7,.72),0,.48,2.9);
 const detailGeometry=mergeGeometries(detailParts);detailParts.forEach(g=>g.dispose());root.add(new THREE.Mesh(detailGeometry,detailMaterial));
 return {root,turret,barrel,flag,smoke,flame,foam,shield,periscope,ready:Promise.resolve(),modelStatus:{requested:false,loaded:false,failed:false},dispose(){for(const g of [hullGeometry,towerGeometry,scopeGeometry,detailGeometry])g.dispose();material.dispose();scopeMaterial.dispose();detailMaterial.dispose();}};
}
