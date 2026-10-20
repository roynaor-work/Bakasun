import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {navalWorldPoint,navalProjectileHeight} from './naval-camera.mjs?v=g9-20261020-1';
import {createNavalEffects} from './g6d-effects.mjs?v=g9-20261020-1';
import {loadPatrolBoat,disposeBoat} from './patrol-boat.mjs?v=g9-20261020-1';

/** Procedural meshes are isolated here so a GLB vessel can replace this factory.
 * One scene/context per round. All geometry, vectors and effects are warmed once. */
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
  const barrel=box(.18,.2,1.8,colors.metal,0,.18,-.85,turret);
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
  const shield=mesh(new THREE.SphereGeometry(4,12,8),colors.glass,0,1,0,root);shield.material=new THREE.MeshBasicMaterial({color:colors.glass,wireframe:true,transparent:true,opacity:.1});shield.visible=(equipment.shield||0)>0;
  const foam=mesh(new THREE.RingGeometry(2.2,2.35,20),colors.foam,0,-.12,1,root);foam.rotation.x=-Math.PI/2;foam.scale.set(.7,2.7,1);
  const reflection=mesh(new THREE.PlaneGeometry(2.5,7),colors.hull,0,-.15,0,root);reflection.rotation.x=-Math.PI/2;reflection.material=new THREE.MeshBasicMaterial({color:colors.hull,transparent:true,opacity:.18});
  const shadow=mesh(new THREE.CircleGeometry(2.5,16),colors.metal,0,-.13,.1,root);shadow.rotation.x=-Math.PI/2;shadow.scale.set(.65,1.6,1);shadow.material=new THREE.MeshBasicMaterial({color:colors.metal,transparent:true,opacity:.18});
  // Smoke was a growing faceted balloon. Fire and soft water effects carry damage feedback.
  const smoke=new THREE.Group();root.add(smoke);
  const flame=mesh(new THREE.SphereGeometry(.32,8,6),colors.flame,0,2,.9,root);flame.material=new THREE.MeshBasicMaterial({color:colors.flame});flame.visible=false;
  let model,modelLength,disposed=false;const modelStatus={requested:Boolean(playerModel),loaded:false,failed:false};
  const ready=playerModel?loadPatrolBoat(playerModel,adapters).then(loaded=>{
    if(disposed){if(loaded)disposeBoat(loaded);return;}
    if(!loaded){modelStatus.failed=true;return;}
    model=loaded;root.add(model);staticParts.visible=false;modelStatus.loaded=true;modelLength=playerModel.length*playerModel.scale*root.scale.x;
    turret.position.fromArray(playerModel.cannonPivot);
  }).catch(()=>{if(!disposed)modelStatus.failed=true;}):Promise.resolve();
  return {root,turret,barrel,flag,funnel,shield,foam,smoke,flame,ready,modelStatus,get modelLength(){return modelLength;},dispose(){if(disposed)return;disposed=true;if(model){disposeBoat(model);model=null;}for(const g of geometries)g.dispose();const all=new Set(materials.values());root.traverse(o=>{if(o.material)all.add(o.material);});for(const m of all)m.dispose();}};
}

/** Both Meshy boats have a -X bow, normalized to -Z by the same rotation.
 * Yaw follows displacement without reflecting the asymmetric gunboat. */
export function vesselHeading(v,x,z,time) {
  if(v.lastTime!==undefined&&time>v.lastTime){const dx=x-v.lastX,dz=z-v.lastZ;if(dx*dx+dz*dz>1e-10)v.root.rotation.y=Math.atan2(-dx,-dz);}
  v.lastX=x;v.lastZ=z;v.lastTime=time;
}

export function createNavalView(ctx,model,adapters={}) {
  const {config,balance}=ctx,r=balance.render;
  let renderer,failed=false,disposed=false,low=false;
  const canvas=adapters.canvas||document.createElement('canvas');
  try{renderer=(adapters.createRenderer||((options)=>new THREE.WebGLRenderer(options)))({canvas,antialias:false,alpha:false,powerPreference:'low-power'});}
  catch{return null;}
  renderer.setSize(r.width,r.height,false);renderer.setPixelRatio(r.dpr);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(r.sky);scene.fog=new THREE.Fog(r.sky,r.fogNear,r.fogFar);
  const camera=new THREE.PerspectiveCamera(r.follow.fov,r.width/r.height,r.follow.near,r.follow.far);
  function syncCamera(){const c=model.camera;camera.position.set(c.position.x,c.position.y,c.position.z);camera.lookAt(c.focus.x,c.focus.y,c.focus.z);camera.fov=c.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  syncCamera();
  scene.add(new THREE.HemisphereLight(r.sun,r.sea,r.hemisphereIntensity));const sunLight=new THREE.DirectionalLight(r.sun,r.sunIntensity);sunLight.position.set(-15,25,-25);scene.add(sunLight);
  const seaGeometry=new THREE.PlaneGeometry(r.seaSize,r.seaSize,r.waterSegments,r.waterSegments);seaGeometry.rotateX(-Math.PI/2);
  const seaMaterial=new THREE.MeshStandardMaterial({color:r.sea,roughness:.8,metalness:.05,flatShading:true});const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.position.set(0,-.25,-35);scene.add(sea);
  const sunGeometry=new THREE.SphereGeometry(7,16,8),sunMaterial=new THREE.MeshBasicMaterial({color:r.sun}),sun=new THREE.Mesh(sunGeometry,sunMaterial);sun.position.set(-22,12,-95);scene.add(sun);
  const player=createVessel(THREE,r,model.equipment,{},balance.playerModel);player.root.scale.setScalar(r.playerScale);scene.add(player.root);
  const vessels=model.enemies.map(e=>{const type=balance.shipTypes[e.kind],variant=e.boss?balance.boss:type,scale=type.scale*(e.boss?balance.boss.scale:1),spec=variant.modelSpec||(type.model&&balance.enemyModel&&{...balance.enemyModel,length:(balance.playerModel?.length??balance.enemyModel.length)*r.playerScale/scale});const v=type.submarine?createSubmarine(r,r.effects):createVessel(THREE,{...r,hull:variant.hull},{},variant,spec);v.root.rotation.y=Math.PI;v.root.scale.setScalar(scale);scene.add(v.root);return v;});
  const scenery=createNavalEffects(scene,seaMaterial,model,balance);
  const shotGeometry=new THREE.SphereGeometry(.24,8,6),shotMaterial=new THREE.MeshBasicMaterial({color:r.sun}),shot=new THREE.Mesh(shotGeometry,shotMaterial);scene.add(shot);const secondShot=new THREE.Mesh(shotGeometry,shotMaterial);scene.add(secondShot);const wakes=new THREE.InstancedMesh(new THREE.CircleGeometry(.45,10),new THREE.MeshBasicMaterial({color:r.foam,transparent:true,opacity:.65,depthWrite:false}),12);wakes.rotation.x=-Math.PI/2;scene.add(wakes);const wakeMatrix=new THREE.Matrix4();const extraVisuals=new THREE.InstancedMesh(shotGeometry,shotMaterial,r.effects.maxProjectiles);extraVisuals.frustumCulled=false;extraVisuals.count=0;scene.add(extraVisuals);const effectMatrix=new THREE.Matrix4(),effectScale=new THREE.Vector3();
  const aimGeometry=new THREE.BufferGeometry(),aimArray=new Float32Array(18*3);aimGeometry.setAttribute('position',new THREE.BufferAttribute(aimArray,3));const aimMaterial=new THREE.LineBasicMaterial({color:r.foam}),aimLine=new THREE.LineSegments(aimGeometry,aimMaterial);scene.add(aimLine);
  const splashGeometry=new THREE.ConeGeometry(.12,.8,5),splashMaterial=new THREE.MeshBasicMaterial({color:r.foam});const splash=new THREE.InstancedMesh(splashGeometry,splashMaterial,r.effects.splashCount);splash.frustumCulled=false;splash.count=0;scene.add(splash);
  const burstGeometry=new THREE.SphereGeometry(.5,8,6),burstMaterial=new THREE.MeshBasicMaterial({color:r.flame,transparent:true,opacity:0}),burst=new THREE.Mesh(burstGeometry,burstMaterial);scene.add(burst);
  const projected=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),intersection=new THREE.Vector3();camera.updateMatrixWorld();const positions=seaGeometry.attributes.position;

  const fx=r.effects,flashGeometry=new THREE.SphereGeometry(fx.flashSize,8,6),flashMaterial=new THREE.MeshBasicMaterial({color:r.flame,transparent:true,depthWrite:false}),flash=new THREE.Mesh(flashGeometry,flashMaterial);scene.add(flash);
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;const brush=smokeCanvas.getContext('2d'),gradient=brush.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#e0e3dfaa');gradient.addColorStop(1,'#e0e3df00');brush.fillStyle=gradient;brush.fillRect(0,0,64,64);const smokeTexture=new THREE.CanvasTexture(smokeCanvas),smokeMaterial=new THREE.SpriteMaterial({map:smokeTexture,transparent:true,depthWrite:false}),muzzleSmoke=new THREE.Sprite(smokeMaterial);scene.add(muzzleSmoke);
  const plumeMaterial=new THREE.SpriteMaterial({map:smokeTexture,color:r.foam,transparent:true,depthWrite:false}),waterPlume=new THREE.Sprite(plumeMaterial);scene.add(waterPlume);
  const gatling=new THREE.Group(),gatlingGeometry=new THREE.CylinderGeometry(fx.subTube/3,fx.subTube/3,fx.vulcanLength,6),gatlingMaterial=new THREE.MeshStandardMaterial({color:r.metal});
  for(let i=0;i<fx.vulcanBarrels;i++){const barrel=new THREE.Mesh(gatlingGeometry,gatlingMaterial),a=i*Math.PI*2/fx.vulcanBarrels;barrel.rotation.x=Math.PI/2;barrel.position.set(Math.cos(a)*fx.vulcanRadius,Math.sin(a)*fx.vulcanRadius,0);gatling.add(barrel);}gatling.position.set(0,.18,-1);player.turret.add(gatling);
  const muzzle=new THREE.Vector3();let lastFire=-Infinity,lastFired=0;

  const onLost=event=>{event.preventDefault();failed=true;};canvas.addEventListener('webglcontextlost',onLost);
  function animateVessel(v,e,x,z,enemy){
    if(enemy)vesselHeading(v,x,z,model.time);else v.root.rotation.y=-model.playerShip.heading;
    const sink=e.hp<=0?model.sinkProgress:0;v.root.position.set(x,Math.sin(model.time*1.6+(e.index||0))*.12-sink*4,z);v.root.rotation.z=Math.sin(model.time*1.9+x)*.035+sink*.3;
    const target=enemy?navalWorldPoint(model.playerShip.x,model.playerShip.z,balance):navalWorldPoint(model.aim.x,model.aim.z,balance);v.turret.rotation.y=Math.atan2(x-target.x,z-target.z)-v.root.rotation.y;v.barrel.rotation.x=model.ammoIndex===2?0:.35;v.barrel.position.z=-.85+e.recoil;
    v.flag.visible=false;v.flag.rotation.y=Math.sin(model.time*4)*.2;v.shield.visible=e.shield>0;v.smoke.visible=e.hp<e.maxHp;v.flame.visible=e.hp<e.maxHp;
    v.smoke.position.y=3+(model.time%2);v.smoke.scale.setScalar(.6+(model.time%2)*.5);v.flame.position.set(.7,.85,.9);v.flame.scale.y=1.4+Math.sin(model.time*12)*.3;v.foam.visible=false;
  }
  function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);player.dispose();for(const v of vessels)v.dispose();wakes.geometry.dispose();wakes.material.dispose();scenery.dispose();smokeTexture.dispose();smokeMaterial.dispose();plumeMaterial.dispose();flashMaterial.dispose();gatlingMaterial.dispose();for(const g of [seaGeometry,sunGeometry,shotGeometry,aimGeometry,splashGeometry,burstGeometry,flashGeometry,gatlingGeometry])g.dispose();for(const m of [seaMaterial,sunMaterial,shotMaterial,aimMaterial,splashMaterial,burstMaterial])m.dispose();renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;}
  return {get mode(){return failed?'perspective':'three';},metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,playerModel:{...player.modelStatus},disposed,
    models:{requested:Number(Boolean(balance.playerModel))+Number(vessels.some(v=>v.modelStatus.requested)),loaded:Number(player.modelStatus.loaded)+Number(vessels.some(v=>v.modelStatus.loaded)),failed:Number(player.modelStatus.failed)+Number(vessels.some(v=>v.modelStatus.failed))},
    playerMarkers:{flag:player.flag.visible,flame:player.flame.visible,flameY:player.flame.position.y},effects:scenery.metrics(),camera:JSON.parse(JSON.stringify(model.camera)),quality:low?'low':'full',playerLoaded:player.modelStatus.loaded,enemiesLoaded:vessels.filter(v=>v.modelStatus.loaded).length,playerLength:player.modelLength,enemyLengths:vessels.map(v=>v.modelLength),headings:vessels.map(v=>v.root.rotation.y),periscopes:vessels.map(v=>Boolean(v.periscope?.visible))};},degrade(fallback=false){if(fallback){failed=true;dispose();}else if(!low){low=true;renderer.setSize(r.width*.75,r.height*.75,false);}},dispose,
    resize(){if(failed||disposed)return;camera.aspect=config.width/config.height;camera.updateProjectionMatrix();renderer.setSize(Math.min(config.width,r.width)*(low?.75:1),Math.min(config.width,r.width)*config.height/config.width*(low?.75:1),false);},
    projectTarget(x,z,y=0){if(failed||disposed)return null;return model.screenPoint(x,z,y);},
    targetAt(x,y){if(failed||disposed)return null;pointer.set(x/config.width*2-1,1-y/config.height*2);raycaster.setFromCamera(pointer,camera);if(!raycaster.ray.intersectPlane(seaPlane,intersection))return null;return {x:balance.shipX-intersection.z/r.worldScale,z:intersection.x/r.enemySpacing*balance.combat.laneSpacing};},
    draw(p){
      if(failed||disposed)return false;
      try{
        for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,Math.sin(x*.32+model.time*r.waveSpeed)*Math.cos(z*.2+model.time)*r.waveHeight);}positions.needsUpdate=true;seaGeometry.computeVertexNormals();
        const px=model.playerShip.z*r.enemySpacing/balance.combat.laneSpacing,pz=-(model.playerShip.x-balance.shipX)*r.worldScale;animateVessel(player,model.playerShip,px,pz,false);syncCamera();scenery.update(camera);
        if(model.fired!==lastFired){lastFired=model.fired;lastFire=model.time;}const fireAge=model.time-lastFire;
        gatling.visible=model.ammoIndex===4;player.barrel.visible=!gatling.visible;gatling.rotation.z=model.time*fx.vulcanSpin;
        player.root.updateMatrixWorld(true);muzzle.set(0,.18,-fx.muzzleForward);player.turret.localToWorld(muzzle);
        flash.visible=fireAge<fx.flashSeconds;flash.position.copy(muzzle);flash.scale.setScalar(1+fireAge/fx.flashSeconds);flashMaterial.opacity=Math.max(0,1-fireAge/fx.flashSeconds);
        muzzleSmoke.visible=fireAge<fx.smokeSeconds;muzzleSmoke.position.copy(muzzle);muzzleSmoke.position.y+=fireAge*fx.smokeSize;smokeMaterial.opacity=Math.max(0,1-fireAge/fx.smokeSeconds);muzzleSmoke.scale.setScalar(fx.smokeSize+fireAge*fx.smokeSize*4);

        for(let i=0;i<vessels.length;i++){const e=model.enemies[i],v=vessels[i];v.root.visible=e.active;if(e.active){animateVessel(v,e,e.z*r.enemySpacing/balance.combat.laneSpacing,-(e.x-balance.shipX)*r.worldScale,true);if(balance.shipTypes[e.kind].submarine){v.root.position.y-=e.depth*fx.submergedY;v.periscope.visible=e.hp>0;}}}
        shot.visible=model.phase==='shot';shot.position.set(model.ball.z*r.enemySpacing/balance.combat.laneSpacing,navalProjectileHeight(model.ball.ammo,model.ball.age/model.ball.duration,model.time,balance),-(model.ball.x-balance.shipX)*r.worldScale);shot.scale.set(1,1,model.ball.ammo===2?4:1);secondShot.visible=shot.visible&&model.ball.ammo===1;secondShot.position.copy(shot.position);secondShot.position.x+=.6;
        extraVisuals.count=Math.min(model.extraShots.length,r.effects.maxProjectiles);for(let i=0;i<extraVisuals.count;i++){const p=model.extraShots[i];effectMatrix.makeRotationY(Math.atan2((p.targetZ-p.fromZ)*r.enemySpacing/balance.combat.laneSpacing,-(p.targetX-p.fromX)*r.worldScale));effectMatrix.scale(effectScale.set(1,1,p.ammo===2?4:1));effectMatrix.setPosition(p.z*r.enemySpacing/balance.combat.laneSpacing,navalProjectileHeight(p.ammo,p.age/p.duration,model.time,balance),-(p.x-balance.shipX)*r.worldScale);extraVisuals.setMatrixAt(i,effectMatrix);}extraVisuals.instanceMatrix.needsUpdate=true;
        wakes.visible=shot.visible&&model.ball.ammo===2;for(let i=0;i<12;i++){const u=Math.max(0,model.ball.age/model.ball.duration-i*.008),x=model.ball.fromZ+(model.ball.targetZ-model.ball.fromZ)*u,z=model.ball.fromX+(model.ball.targetX-model.ball.fromX)*u;wakeMatrix.makeScale(1+i*.12,1+i*.1,1);wakeMatrix.setPosition(x*r.enemySpacing/balance.combat.laneSpacing,(z-balance.shipX)*r.worldScale,fx.torpedoHeight);wakes.setMatrixAt(i,wakeMatrix);}wakes.instanceMatrix.needsUpdate=true;
        aimLine.visible=false;
        splash.count=model.blast.life>0?r.effects.splashCount:0;for(let i=0;i<splash.count;i++){const age=1-model.blast.life/config.visuals.blastSeconds;const height=Math.sin(age*Math.PI)*(model.blast.hit?2:4+i%4);effectMatrix.makeScale(model.blast.hit?1:2,height/.8,model.blast.hit?1:2);effectMatrix.setPosition(model.blast.z*r.enemySpacing/balance.combat.laneSpacing+Math.cos(i*2.4)*age*3,height/2,-(model.blast.x-balance.shipX)*r.worldScale+Math.sin(i*2.4)*age*3);splash.setMatrixAt(i,effectMatrix);}splash.instanceMatrix.needsUpdate=true;
        waterPlume.visible=model.blast.life>0&&!model.blast.hit;if(waterPlume.visible){const age=1-model.blast.life/config.visuals.blastSeconds;waterPlume.position.set(model.blast.z*r.enemySpacing/balance.combat.laneSpacing,Math.sin(age*Math.PI)*3,-(model.blast.x-balance.shipX)*r.worldScale);waterPlume.scale.set(6+age*4,7+Math.sin(age*Math.PI)*13,1);plumeMaterial.opacity=(1-age)*.85;}
        burst.visible=model.blast.hit&&model.blast.life>0;if(burst.visible){const age=1-model.blast.life/config.visuals.blastSeconds;burst.position.set(model.blast.z*r.enemySpacing/balance.combat.laneSpacing,1,-(model.blast.x-balance.shipX)*r.worldScale);burst.position.y=1;burst.scale.setScalar(1+age*5);burstMaterial.opacity=(1-age)*.8;}
        renderer.render(scene,camera);p.drawImage(canvas,0,0,config.width,config.height);
        return true;
      }catch{failed=true;dispose();return false;}
    }
  };
}

function createSubmarine(r,fx){
 const root=new THREE.Group(),turret=new THREE.Group(),barrel=new THREE.Object3D(),flag=new THREE.Object3D(),smoke=new THREE.Group(),flame=new THREE.Object3D(),foam=new THREE.Object3D(),shield=new THREE.Object3D();turret.add(barrel);root.add(turret,flag,smoke,flame,foam,shield);
 const material=new THREE.MeshStandardMaterial({color:r.metal,roughness:.55}),hullGeometry=new THREE.CapsuleGeometry(fx.subBeam,fx.subLength-fx.subBeam*2,4,8),hull=new THREE.Mesh(hullGeometry,material);hull.rotation.x=Math.PI/2;root.add(hull);
 const towerGeometry=new THREE.CylinderGeometry(fx.subBeam*.6,fx.subBeam,fx.subBeam*2,8),tower=new THREE.Mesh(towerGeometry,material);tower.position.y=fx.subBeam;root.add(tower);
 const scopeGeometry=new THREE.CylinderGeometry(fx.periscopeBeam,fx.periscopeBeam,fx.periscopeHeight,6),scopeMaterial=new THREE.MeshStandardMaterial({color:r.foam,roughness:.4}),periscope=new THREE.Group(),stem=new THREE.Mesh(scopeGeometry,scopeMaterial),head=new THREE.Mesh(scopeGeometry,scopeMaterial);stem.position.y=fx.periscopeHeight/2;head.rotation.z=Math.PI/2;head.scale.y=fx.periscopeBeam;head.position.set(fx.periscopeBeam,fx.periscopeHeight,0);periscope.add(stem,head);root.add(periscope);
 return {root,turret,barrel,flag,smoke,flame,foam,shield,periscope,ready:Promise.resolve(),modelStatus:{requested:false,loaded:false,failed:false},dispose(){for(const g of [hullGeometry,towerGeometry,scopeGeometry])g.dispose();material.dispose();scopeMaterial.dispose();}};
}
