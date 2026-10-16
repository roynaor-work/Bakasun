import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {drawHealthBar} from './art.mjs?v=g2g-20261016-1';

/** Procedural meshes are isolated here so a GLB vessel can replace this factory.
 * One scene/context per round. All geometry, vectors and effects are warmed once. */
export function createVessel(THREE, colors, equipment={},variant={}) {
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
  const flag=box(.8,.44,.035,colors.hull,.44,3.8,.55,root);
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
  const smoke=mesh(new THREE.IcosahedronGeometry(.65,0),colors.smoke,0,3.1,1.5,root);
  const flame=mesh(new THREE.ConeGeometry(.5,1.8,6),colors.flame,0,2,.9,root);flame.material=new THREE.MeshBasicMaterial({color:colors.flame});
  return {root,turret,barrel,flag,funnel,shield,foam,smoke,flame,dispose(){for(const g of geometries)g.dispose();const all=new Set(materials.values());root.traverse(o=>{if(o.material)all.add(o.material);});for(const m of all)m.dispose();}};
}

export function createNavalView(ctx,model) {
  const {config,balance,t}=ctx,r=balance.render;
  let renderer,failed=false,disposed=false,low=false;
  const canvas=document.createElement('canvas');
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power'});}
  catch{return null;}
  renderer.setSize(r.width,r.height,false);renderer.setPixelRatio(r.dpr);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(r.sky);scene.fog=new THREE.Fog(r.sky,r.fogNear,r.fogFar);
  const camera=new THREE.PerspectiveCamera(48,r.width/r.height,.1,220);camera.position.fromArray(r.camera);camera.lookAt(...r.lookAt);
  scene.add(new THREE.HemisphereLight(r.sun,r.sea,r.hemisphereIntensity));const sunLight=new THREE.DirectionalLight(r.sun,r.sunIntensity);sunLight.position.set(-15,25,-25);scene.add(sunLight);
  const seaGeometry=new THREE.PlaneGeometry(r.seaSize,r.seaSize,r.waterSegments,r.waterSegments);seaGeometry.rotateX(-Math.PI/2);
  const seaMaterial=new THREE.MeshStandardMaterial({color:r.sea,roughness:.36,metalness:.35,flatShading:true});const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.position.set(0,-.25,-35);scene.add(sea);
  const sunGeometry=new THREE.SphereGeometry(7,16,8),sunMaterial=new THREE.MeshBasicMaterial({color:r.sun}),sun=new THREE.Mesh(sunGeometry,sunMaterial);sun.position.set(-22,12,-95);scene.add(sun);
  const player=createVessel(THREE,r,model.equipment);player.root.scale.setScalar(r.playerScale);scene.add(player.root);
  const vessels=model.enemies.map(e=>{const type=balance.shipTypes[e.kind],variant=e.boss?balance.boss:type;const v=createVessel(THREE,{...r,hull:variant.hull},{},variant);v.root.rotation.y=Math.PI;v.root.scale.setScalar(balance.shipTypes[e.kind].scale*(e.boss?balance.boss.scale:1));scene.add(v.root);return v;});
  const shotGeometry=new THREE.SphereGeometry(.24,8,6),shotMaterial=new THREE.MeshBasicMaterial({color:r.sun}),shot=new THREE.Mesh(shotGeometry,shotMaterial);scene.add(shot);const secondShot=new THREE.Mesh(shotGeometry,shotMaterial);scene.add(secondShot);
  const aimGeometry=new THREE.BufferGeometry(),aimArray=new Float32Array(18*3);aimGeometry.setAttribute('position',new THREE.BufferAttribute(aimArray,3));const aimMaterial=new THREE.LineBasicMaterial({color:r.foam}),aimLine=new THREE.LineSegments(aimGeometry,aimMaterial);scene.add(aimLine);
  const splashGeometry=new THREE.ConeGeometry(.12,.8,5),splashMaterial=new THREE.MeshBasicMaterial({color:r.foam});const splash=[];for(let i=0;i<12;i++){const drop=new THREE.Mesh(splashGeometry,splashMaterial);scene.add(drop);splash.push(drop);}
  const burstGeometry=new THREE.SphereGeometry(.5,8,6),burstMaterial=new THREE.MeshBasicMaterial({color:r.flame,transparent:true,opacity:0}),burst=new THREE.Mesh(burstGeometry,burstMaterial);scene.add(burst);
  const projected=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),intersection=new THREE.Vector3();camera.updateMatrixWorld();const positions=seaGeometry.attributes.position;
  const labelNames=model.enemies.map(e=>t(e.boss?'naval.boss':balance.shipTypes[e.kind].name));
  const onLost=event=>{event.preventDefault();failed=true;};canvas.addEventListener('webglcontextlost',onLost);
  function animateVessel(v,e,x,z,enemy){
    const sink=e.hp<=0?model.sinkProgress:0;v.root.position.set(x,Math.sin(model.time*1.6+(e.index||0))*.12-sink*4,z);v.root.rotation.z=Math.sin(model.time*1.9+x)*.035+sink*.3;
    v.turret.rotation.y=enemy?.2:-Math.atan2(model.aim.z,model.aim.x-balance.shipX);v.barrel.rotation.x=model.ammoIndex===2?0:.35;v.barrel.position.z=-.85+e.recoil;
    v.flag.rotation.y=Math.sin(model.time*4)*.2;v.shield.visible=e.shield>0;v.smoke.visible=e.hp<e.maxHp;v.flame.visible=e.hp<e.maxHp;
    v.smoke.position.y=3+(model.time%2);v.smoke.scale.setScalar(.6+(model.time%2)*.5);v.flame.scale.y=.75+Math.sin(model.time*12)*.2;v.foam.scale.y=2.5+Math.sin(model.time*2)*.3;
  }
  function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);player.dispose();for(const v of vessels)v.dispose();for(const g of [seaGeometry,sunGeometry,shotGeometry,aimGeometry,splashGeometry,burstGeometry])g.dispose();for(const m of [seaMaterial,sunMaterial,shotMaterial,aimMaterial,splashMaterial,burstMaterial])m.dispose();renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;}
  return {get mode(){return failed?'perspective':'three';},degrade(fallback=false){if(fallback){failed=true;dispose();}else if(!low){low=true;renderer.setSize(r.width*.75,r.height*.75,false);}},dispose,
    resize(){if(failed||disposed)return;camera.aspect=config.width/config.height;camera.updateProjectionMatrix();renderer.setSize(r.width,config.height*(low?.75:1),false);},
    projectTarget(x,z){if(failed||disposed)return null;projected.set(z*r.enemySpacing/balance.combat.laneSpacing,0,-(x-balance.shipX)*r.worldScale).project(camera);return {x:(projected.x+1)*config.width/2,y:(1-projected.y)*config.height/2};},
    targetAt(x,y){if(failed||disposed)return null;pointer.set(x/config.width*2-1,1-y/config.height*2);raycaster.setFromCamera(pointer,camera);if(!raycaster.ray.intersectPlane(seaPlane,intersection))return null;return {x:balance.shipX-intersection.z/r.worldScale,z:intersection.x/r.enemySpacing*balance.combat.laneSpacing};},
    draw(p){
      if(failed||disposed)return false;
      try{
        for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,Math.sin(x*.32+model.time*r.waveSpeed)*Math.cos(z*.2+model.time)*r.waveHeight);}positions.needsUpdate=true;
        animateVessel(player,model.playerShip,0,0,false);
        for(let i=0;i<vessels.length;i++){const e=model.enemies[i],v=vessels[i];v.root.visible=e.active;if(e.active)animateVessel(v,e,e.z*r.enemySpacing/balance.combat.laneSpacing,-(e.x-balance.shipX)*r.worldScale,true);}
        shot.visible=model.phase==='shot';shot.position.set(model.ball.z*r.enemySpacing/balance.combat.laneSpacing,Math.max(.25,(balance.shipY-model.ball.y)*r.worldScale),-(model.ball.x-balance.shipX)*r.worldScale);shot.scale.set(1,1,model.ball.ammo===2?4:1);secondShot.visible=shot.visible&&model.ball.ammo===1;secondShot.position.copy(shot.position);secondShot.position.x+=.6;
        aimLine.visible=false;
        for(let i=0;i<splash.length;i++){const d=splash[i],age=1-model.blast.life/config.visuals.blastSeconds;d.visible=model.blast.life>0;d.position.set(model.blast.z*r.enemySpacing/balance.combat.laneSpacing+Math.cos(i*2.4)*age*3,Math.sin(age*Math.PI)*2,-(model.blast.x-balance.shipX)*r.worldScale+Math.sin(i*2.4)*age*3);}
        burst.visible=model.blast.hit&&model.blast.life>0;if(burst.visible){const age=1-model.blast.life/config.visuals.blastSeconds;burst.position.set(model.blast.z*r.enemySpacing/balance.combat.laneSpacing,1,-(model.blast.x-balance.shipX)*r.worldScale);burst.position.y=1;burst.scale.setScalar(1+age*5);burstMaterial.opacity=(1-age)*.8;}
        renderer.render(scene,camera);p.drawImage(canvas,0,0,config.width,config.height);
        p.font=r.nameFont;p.textAlign='center';
        for(const e of model.enemies)if(e.active){const v=vessels[e.index];projected.set(v.root.position.x,v.root.position.y+4,v.root.position.z).project(camera);const x=(projected.x+1)*config.width/2,y=Math.max(r.fleetMeterY+25,x>config.width-r.mapSize-40?r.mapY+r.mapSize+25:0,(1-projected.y)*config.height/2)+(e.index-model.wave+1)%model.settings.concurrent*r.enemyLabelStep;p.fillStyle=r.foam;p.fillText(labelNames[e.index],x,y-9);drawHealthBar(p,x-r.enemyBarWidth/2,y,r.enemyBarWidth,4,e.hp,e.maxHp,config);}
        return true;
      }catch{failed=true;dispose();return false;}
    }
  };
}
