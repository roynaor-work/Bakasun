import * as T from '../vendor/three.module.js';
import {LocalModels} from '../view/local-models.mjs?v=island-c2-20261025-1';
import {alienModelSpecs,alienAppearance} from './alien-assets.mjs';
import {alienEnvironment} from './ultra-alien-environment.mjs';
import {modelTriangles,fleetModel,liveFleetIds,bakeFleet} from './ultra-alien-fleet.mjs';

/** Every transform projects the unchanged collision plane. Source GLBs retain
 * their geometry, texture resolution, proportions and authored material maps. */
export function createAlienView(ctx,model,adapters={}){
 const {config}=ctx,balance={...ctx.balance,models:alienModelSpecs(ctx.balance)},r=balance.render;
 let renderer,disposed=false,failed=false,low=false,currentWidth=config.width,currentHeight=config.height;
 try{renderer=adapters.createRenderer?.()||new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{return null;}
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(r.fov,config.width/config.height,.1,180),surface=renderer.domElement;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
 renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.setSize(r.width,r.height,false);
 const environment=alienEnvironment(scene),models=new LocalModels(adapters),entities=new Map(),ownedG=[],ownedM=[],impostors=[];
 const geo=g=>(ownedG.push(g),g),mat=m=>(ownedM.push(m),m);
 const fallbackTextures=(ctx.art?.aliens||[]).map(c=>new T.CanvasTexture(c));
 const fallbackMaterials=fallbackTextures.map(map=>mat(new T.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false})));
 const player=new T.Group(),wingModels=[];scene.add(player);let playerLoaded=false,loaded=false,liveCount=0,lodCount=0;
 const specs=[balance.models.player,...balance.models.enemies],costs=[];
 const mapRay=new T.Raycaster(),mapPointer=new T.Vector2(),mapPoint=new T.Vector3(),plane=new T.Plane(new T.Vector3(0,1,0),0);
 const world=(x,y)=>{mapPointer.set(x/config.width*2-1,1-y/config.height*2);mapRay.setFromCamera(mapPointer,camera);if(mapRay.ray.intersectPlane(plane,mapPoint))return [mapPoint.x,0,mapPoint.z];return [0,0,0];};
 const worldLength=(x,y,pixels)=>{const a=world(x,y),b=world(x+pixels*config.width/currentWidth,y);return Math.hypot(b[0]-a[0],b[2]-a[2]);};
 const fallbackPlayer=ctx.art?.player?new T.Sprite(mat(new T.SpriteMaterial({map:new T.CanvasTexture(ctx.art.player),transparent:true,depthWrite:false,toneMapped:false}))):null;
 if(fallbackPlayer)player.add(fallbackPlayer);
 const ready=Promise.all(specs.map(s=>models.load(s))).then(()=>{
  if(disposed)return;const root=fleetModel(models,balance.models.player);
  if(root){player.clear();player.add(root);playerLoaded=true;}
  for(let i=0;i<balance.campaign.maxWings;i++){const wing=fleetModel(models,balance.models.player);if(wing){wing.visible=false;wingModels.push(wing);scene.add(wing);}}
  for(let i=0;i<balance.models.enemies.length;i++)costs[i]=modelTriangles(models.assets.get(balance.models.enemies[i].path));
  // A dedicated 512px dense-row LOD. The shared baker and other games stay as is.
  impostors.push(...bakeFleet(renderer,scene,camera,models,balance.models.enemies));loaded=true;
 });
 const shieldG=geo(new T.SphereGeometry(.5,12,8)),shieldM=mat(new T.MeshBasicMaterial({color:'#83deff',transparent:true,opacity:.075,wireframe:true,depthWrite:false}));
 const playerShield=new T.Mesh(shieldG,shieldM);scene.add(playerShield);
 const enemyShields=new T.InstancedMesh(shieldG,shieldM,balance.maxAliens),shieldTransform=new T.Object3D();enemyShields.count=0;enemyShields.frustumCulled=false;scene.add(enemyShields);
 function resize(w=currentWidth,h=currentHeight){
  if(disposed)return;currentWidth=w;currentHeight=h;camera.aspect=w/h;
  camera.position.set(0,34,35);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  renderer.setPixelRatio(low?1:Math.min(globalThis.devicePixelRatio||1,1.5));renderer.setSize(w*(low?.8:1),h*(low?.8:1),false);
 }
 function dispose(){
  if(disposed)return;disposed=true;surface.removeEventListener('webglcontextlost',lost);environment.dispose();models.dispose();
  for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();for(const t of fallbackTextures)t.dispose();
  fallbackPlayer?.material.map.dispose();for(const i of impostors)if(i){i.material.dispose();i.texture.dispose();}
  enemyShields.dispose();scene.clear();player.clear();wingModels.length=0;entities.clear();renderer.dispose();renderer.forceContextLoss();surface.width=surface.height=0;
 }
 function lost(e){e.preventDefault();failed=true;dispose();}surface.addEventListener('webglcontextlost',lost);resize();
 function entryFor(a,live){
  let e=entities.get(a.id);const representation=live?'model':loaded&&impostors[a.kind]?'impostor':'loading';
  if(e?.representation===representation)return e;
  if(e)e.root.removeFromParent();
  const root=live?fleetModel(models,balance.models.enemies[a.kind]):new T.Sprite(impostors[a.kind]?.material||fallbackMaterials[a.kind]);
  if(!root)return null;scene.add(root);
  e={root,representation,appearance:alienAppearance(balance,a.kind)};entities.set(a.id,e);return e;
 }
 return {ready,resize,dispose,get mode(){return failed?'canvas':'three';},
  metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,memory:{...renderer.info.memory},models:models.metrics(),playerLoaded,liveModels:liveCount,impostors:lodCount,sourceTexturesUnmodified:true,lodTextureSize:512,low,disposed,appearances:[...entities.values()].map(e=>({...e.appearance,representation:e.representation})),elevationDegrees:Math.atan2(camera.position.y,camera.position.z)*180/Math.PI};},
  degrade(fallback=false){if(fallback){failed=true;dispose();}else{low=true;resize();}},targetAt(x,y){return {x,y};},
  draw(p){if(disposed||failed)return false;try{
   environment.update(model.time,currentWidth/currentHeight);
   const fit=(x,y,pixels)=>worldLength(x,y,pixels),playerPixels=Math.min(76,currentHeight*.18);
   player.position.set(...world(model.player.x,model.player.y));player.scale.setScalar(fit(model.player.x,model.player.y,playerPixels));
   player.rotation.z=-(model.player.bank||0)*.25;player.rotation.y=(model.player.bank||0)*.18;
   player.visible=!model.invulnerable||Math.floor(model.time*12)%2===0;
   playerShield.position.copy(player.position);playerShield.scale.setScalar(fit(model.player.x,model.player.y,playerPixels*1.18));playerShield.visible=model.powerup===3||model.invulnerable>0;
   const visible=model.aliens.filter(a=>a.y+a.radius>0&&a.y-a.radius<config.height);
   const activeWings=model.wings.filter(w=>w.active);
   for(let i=0;i<wingModels.length;i++){const wing=wingModels[i],state=activeWings[i];wing.visible=Boolean(state);if(state){wing.position.set(...world(state.x,state.y));wing.scale.setScalar(fit(state.x,state.y,playerPixels*.52));wing.rotation.y=Math.sin(model.time*2+i)*.08;}}
   const ids=liveFleetIds(visible,r.maxTriangles-8500-activeWings.length*5000,costs,low?8:16);liveCount=lodCount=0;
   let shields=0;const active=new Set();for(const a of visible){active.add(a.id);const live=loaded&&ids.has(a.id)&&models.assets.has(balance.models.enemies[a.kind].path),e=entryFor(a,live);if(!e)continue;
    const pixels=Math.min(a.boss?100:62,a.radius*2*currentHeight/config.height*1.65),scale=fit(a.x,a.y,pixels);
    e.root.position.set(...world(a.x,a.y));e.root.scale.setScalar(scale);
    if(e.root.isSprite){e.root.scale.multiplyScalar(1.44);lodCount++;}else{e.root.rotation.y=Math.sin(a.age*1.7+a.phase)*.06;e.root.rotation.z=Math.sin(a.age*2+a.phase)*.055+(a.diveAge>=0?Math.sin(a.diveAge*4)*.17:0);liveCount++;}
    if(a.shield>0){shieldTransform.position.copy(e.root.position);shieldTransform.scale.setScalar(scale*1.12);shieldTransform.updateMatrix();enemyShields.setMatrixAt(shields++,shieldTransform.matrix);}
   }
   enemyShields.count=shields;enemyShields.instanceMatrix.needsUpdate=true;
   for(const [id,e]of entities)if(!active.has(id)){e.root.removeFromParent();entities.delete(id);}
   renderer.render(scene,camera);
   if(renderer.info.render.triangles>r.maxTriangles||renderer.info.render.calls>r.maxDrawCalls){failed=true;dispose();return false;}
   p.drawImage(surface,0,0,config.width,config.height);return true;
  }catch{failed=true;dispose();return false;}}
 };
}
