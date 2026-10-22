import * as T from '../vendor/three.module.js';
import {LocalModels} from '../view/local-models.mjs?v=naval-art-20261022-1';
import {alienModelSpecs,alienAppearance} from './alien-assets.mjs';
/** Presentation-only depth view; all collisions and timing remain on the original plane. */
export function createAlienView(ctx,model,adapters={}){
 const {config}=ctx,balance={...ctx.balance,models:alienModelSpecs(ctx.balance)},r=balance.render;let renderer,disposed=false,failed=false,low=false,currentWidth=config.width,currentHeight=config.height;
 try{renderer=adapters.createRenderer?.()||new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'low-power'});}catch{return null;}
 const scene=new T.Scene();scene.background=new T.Color(r.sky);scene.add(new T.HemisphereLight(0xffffff,0x224466,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(8,20,12);scene.add(light);
 const camera=new T.PerspectiveCamera(r.fov,config.width/config.height,.1,180),models=new LocalModels(adapters),entities=new Map(),ownedG=[],ownedM=[],surface=renderer.domElement;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.setPixelRatio(r.dpr);renderer.setSize(r.width,r.height,false);
 const geo=g=>(ownedG.push(g),g),mat=m=>(ownedM.push(m),m),shipG=geo(new T.ConeGeometry(.7,1.8,5)),shipM=mat(new T.MeshStandardMaterial({color:r.pickup}));
 const enemyGeometry=[shipG,geo(new T.BoxGeometry(1.3,.6,1.6)),geo(new T.OctahedronGeometry(.9)),geo(new T.CylinderGeometry(.5,.9,.7,4)),geo(new T.TorusGeometry(.6,.2,6,8))],enemyMaterials=r.enemyColors.map(color=>mat(new T.MeshStandardMaterial({color})));
 const player=new T.Group();scene.add(player);const playerFallback=new T.Mesh(shipG,shipM);playerFallback.rotation.x=Math.PI/2;player.add(playerFallback);let playerLoaded=false;const paint=balance.hangar.paints[model.snapshot().hangar.paint||0];
 const specs=[balance.models.player,...balance.models.enemies],ready=Promise.all(specs.map(s=>models.load(s))).then(()=>{if(disposed)return;const root=models.create(balance.models.player,{length:r.modelHeight});if(root){player.clear();root.traverse(o=>{if(o.isMesh&&o.material?.color){const m=o.material.clone();m.color.set(paint);o.material=m;ownedM.push(m);}});player.add(root);playerLoaded=true;}});
 // Use one battle-angle bake per kind for every enemy. Mixing live models
 // with top-down sprites made identical kinds look different across rows.
 const spriteTextures=(ctx.art?.aliens||[]).map(c=>new T.CanvasTexture(c));let baked=-1;
 const spriteMaterials=spriteTextures.map(map=>mat(new T.SpriteMaterial({map,transparent:true,depthWrite:false})));
 const particleG=geo(new T.SphereGeometry(.12,6,4));const particle=(count,color)=>{const o=new T.InstancedMesh(particleG,mat(new T.MeshBasicMaterial({color})),count);o.frustumCulled=false;scene.add(o);return o;};
 const pickups=particle(balance.pickups.max,r.pickup),wings=particle(balance.campaign.maxWings,r.pickup),dummy=new T.Object3D();
 const starG=geo(new T.BufferGeometry()),starArray=new Float32Array(r.starCount*3);for(let i=0;i<r.starCount;i++){starArray[i*3]=(i*17%71)-35;starArray[i*3+1]=4+i%13;starArray[i*3+2]=-(i*23%r.starDepth);};starG.setAttribute('position',new T.BufferAttribute(starArray,3));scene.add(new T.Points(starG,mat(new T.PointsMaterial({color:r.stars,size:.12}))));
 const mapRay=new T.Raycaster(),mapPointer=new T.Vector2(),mapPoint=new T.Vector3(),plane=new T.Plane(new T.Vector3(0,1,0),-.5);
 const world=(x,y)=>{camera.updateMatrixWorld();mapPointer.set(x/config.width*2-1,1-y/config.height*2);mapRay.setFromCamera(mapPointer,camera);if(mapRay.ray.intersectPlane(plane,mapPoint))return [mapPoint.x,.5,mapPoint.z];return [(x-config.width/2)*r.worldScale,.5,(y-config.height/2)*r.worldScale];};
 function updateParticles(mesh,list,size=1){mesh.count=list.length;for(let i=0;i<list.length;i++){const p=list[i];dummy.position.set(...world(p.x,p.y));dummy.scale.set(size,size*2,size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;}
 function resize(w=currentWidth,h=currentHeight){if(disposed)return;currentWidth=w;currentHeight=h;const aspect=w/h,factor=Math.max(1,.8/aspect);camera.aspect=aspect;camera.position.set(r.camera[0],r.camera[1]*factor,r.camera[2]*factor);camera.lookAt(...r.lookAt);camera.updateProjectionMatrix();renderer.setSize(w*(low?.75:1),h*(low?.75:1),false);}
 function dispose(){if(disposed)return;disposed=true;surface.removeEventListener('webglcontextlost',lost);models.dispose();for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();for(const t of spriteTextures)t.dispose();for(const o of [pickups,wings])o.dispose();scene.clear();renderer.dispose();renderer.forceContextLoss();surface.width=surface.height=0;}
 function lost(e){e.preventDefault();failed=true;dispose();}surface.addEventListener('webglcontextlost',lost);resize();
 return {ready,resize,dispose,get mode(){return failed?'canvas':'three';},metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,models:models.metrics(),playerLoaded,low,disposed,appearances:[...entities.values()].map(e=>({...e.appearance,representation:e.root.isSprite?'sprite':'fallback'})),elevationDegrees:Math.atan2(camera.position.y,camera.position.z-r.lookAt[2])*180/Math.PI};},degrade(fallback=false){if(fallback){failed=true;dispose();}else{low=true;resize();}},
 targetAt(x,y){return {x,y};},
 draw(p){if(disposed||failed)return false;try{
  player.position.set(...world(model.player.x,model.player.y));player.rotation.z=-(model.player.bank||0)*r.bankAngle;
  if(ctx.art?.modelArt?.loaded!==baked){baked=ctx.art?.modelArt?.loaded;for(const texture of spriteTextures)texture.needsUpdate=true;}
  const ids=new Set();for(const a of model.aliens){
   ids.add(a.id);let entry=entities.get(a.id);
   if(!entry){const appearance=alienAppearance(balance,a.kind);entry={root:spriteMaterials[a.kind]?new T.Sprite(spriteMaterials[a.kind]):new T.Mesh(enemyGeometry[a.kind],enemyMaterials[a.kind]),appearance};entities.set(a.id,entry);scene.add(entry.root);}
   entry.root.position.set(...world(a.x,a.y));const l=world(a.x-a.radius,a.y),rr=world(a.x+a.radius,a.y),diameter=Math.hypot(rr[0]-l[0],rr[2]-l[2]);entry.root.scale.setScalar(diameter*Math.min(1,(config.width/config.height)/(currentWidth/currentHeight))*r.shipPixelScale);if(entry.root.isSprite)entry.root.scale.y*=.88;else{entry.root.rotation.x=-Math.PI/2;entry.root.material=enemyMaterials[a.kind];entry.root.rotation.z=Math.sin(a.age*2+a.phase)*.06;}
  }
  for(const [id,e]of entities)if(!ids.has(id)){e.root.removeFromParent();entities.delete(id);}
  updateParticles(pickups,model.pickups,2);updateParticles(wings,model.wings.filter(w=>w.active),2);
  for(let i=0;i<r.starCount;i++)starArray[i*3+2]=-r.starDepth+((i*23+model.time*r.starSpeed)%r.starDepth);starG.attributes.position.needsUpdate=true;
  renderer.render(scene,camera);if(renderer.info.render.triangles>r.maxTriangles||renderer.info.render.calls>r.maxDrawCalls){failed=true;dispose();return false;}p.drawImage(surface,0,0,config.width,config.height);return true;
 }catch{failed=true;dispose();return false;}}
 };
}
