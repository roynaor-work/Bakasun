import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {navalProjectileHeight} from './naval-camera.mjs?v=island-alpine-20261027-1';
import {navalEffectAtlas,navalParticleGeometry,navalParticleMaterial,writeNavalParticle,finishNavalParticles} from './ultra-naval-effects.mjs?v=island-alpine-20261027-1';

const FORWARD=new T.Vector3(0,0,-1);
function projectileGeometry(kind){
  const parts=[];
  function add(geometry,color,x=0,y=0,z=0){
    geometry.translate(x,y,z);const c=new T.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.deleteAttribute('uv');parts.push(geometry.index?geometry.toNonIndexed():geometry);if(geometry.index)geometry.dispose();
  }
  function tube(radius,length,color,z){const g=new T.CylinderGeometry(radius,radius,length,12);g.rotateX(Math.PI/2);add(g,color,0,0,z);}
  const rocket=kind===1,torpedo=kind===2,radius=torpedo?.19:rocket?.135:.115,length=torpedo?1.95:rocket?1.8:.86;
  tube(radius,length,torpedo?'#426779':rocket?'#e9e7d8':'#b78037',0);
  const nose=new T.ConeGeometry(radius,torpedo?.4:rocket?.48:.32,12);nose.rotateX(-Math.PI/2);add(nose,rocket?'#b94634':torpedo?'#aab9af':'#f4cf83',0,0,-length/2-.13);
  tube(radius*1.035,.09,rocket?'#385b69':torpedo?'#d7d5b2':'#5e472c',-length*.22);
  tube(radius*1.045,.07,'#516573',length*.25);
  if(rocket||torpedo){
    // Tapered swept fins retain a readable silhouette at a few mobile pixels.
    for(let i=0;i<4;i++){
      const fin=new T.BufferGeometry();fin.setAttribute('position',new T.Float32BufferAttribute([0,0,0,radius*3.4,0,.39,radius*3.4,0,.62,0,0,.57,0,0,0,radius*3.4,0,.62],3));fin.computeVertexNormals();fin.rotateZ(i*Math.PI/2);add(fin,torpedo?'#849994':'#b6c6c5',0,0,length*.18);
    }
    tube(radius*.62,.16,'#263b47',length*.54);
    if(rocket)tube(radius*.38,.035,'#ffe7aa',length*.63);
    if(torpedo){const propeller=new T.BoxGeometry(radius*3.4,.035,.08);add(propeller,'#b7a46c',0,0,length*.64);const cross=new T.BoxGeometry(.035,radius*3.4,.08);add(cross,'#b7a46c',0,0,length*.64);}
  }
  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());return geometry;
}

/** Read-only presentation. Three body batches and one atlas batch, warmed once. */
export function createNavalProjectiles(scene,model,balance){
  const capacity=balance.render.effects.maxProjectiles+9,trailCapacity=capacity*10;
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.34,metalness:.55}),geometries=[0,1,2].map(projectileGeometry);
  const bodies=geometries.map(geometry=>{const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);return mesh;});
  const map=navalEffectAtlas(),trailGeometry=navalParticleGeometry(trailCapacity),trailMaterial=navalParticleMaterial(map),trails=new T.InstancedMesh(trailGeometry,trailMaterial,trailCapacity);
  trails.count=0;trails.frustumCulled=false;trails.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(trails);
  const dummy=new T.Object3D(),position=new T.Vector3(),viewPosition=new T.Vector3(),direction=new T.Vector3(),color=new T.Color(),counts=[0,0,0];
  let disposed=false,trailCount=0,total=0;
  function add(shot,ammo,camera){
    if(total>=capacity)return;const kind=ammo===2?2:ammo===1?1:0,r=balance.render;
    const t=Math.min(1,Math.max(0,shot.age/shot.duration)),height=navalProjectileHeight(ammo,t,model.time,balance);
    position.set(shot.z*r.enemySpacing/balance.combat.laneSpacing,height,-(shot.x-balance.shipX)*r.worldScale);
    // Tangent follows the actual visual arc. Simulation and projectile positions are untouched.
    direction.set((shot.targetZ-shot.fromZ)*r.enemySpacing/balance.combat.laneSpacing,(navalProjectileHeight(ammo,Math.min(1,t+.002),model.time,balance)-height)/.002,-(shot.targetX-shot.fromX)*r.worldScale);
    if(direction.lengthSq()<.00001)direction.copy(FORWARD);else direction.normalize();
    // Optical size only: tiny tail-on ammunition must remain legible at 390px high.
    // Cross-section scales independently, keeping missile length and trails restrained.
    viewPosition.copy(position).applyMatrix4(camera.matrixWorldInverse);
    const depth=Math.max(1,-viewPosition.z),worldPerPixel=2*depth*Math.tan(camera.fov*Math.PI/360)/390;
    const baseScale=ammo===4?.82:kind===1?1.42:1.12,diameter=kind===1?.27:kind===2?.38:.23,minPixels=kind===1?5.5:kind===2?6:4.5;
    const optical=Math.min(kind===0?4.2:kind===1?3.6:3.2,Math.max(1,minPixels*worldPerPixel/(diameter*baseScale))),bodyScaleZ=baseScale*Math.min(1.8,Math.sqrt(optical));
    dummy.position.copy(position);dummy.quaternion.setFromUnitVectors(FORWARD,direction);dummy.scale.set(baseScale*optical,baseScale*optical,bodyScaleZ);dummy.updateMatrix();bodies[kind].setMatrixAt(counts[kind]++,dummy.matrix);total++;
    const length=kind===0?3:10;
    for(let i=0;i<length&&trailCount<trailCapacity;i++){
      const fade=1-i/length,offset=(kind===1?1.1:kind===2?1.2:.5)*bodyScaleZ+i*(kind===1?.32:kind===2?.43:.24);
      dummy.position.copy(position).addScaledVector(direction,-offset);let style=0,opacity=fade*.7;
      if(kind===2){
        // Flat, broken white wake, distinct from exhaust above the water.
        const side=i%2?1:-1,lateral=i*.045;dummy.position.x+=direction.z*side*lateral;dummy.position.z-=direction.x*side*lateral;dummy.position.y=.075;
        dummy.rotation.set(-Math.PI/2,0,Math.atan2(-direction.x,-direction.z));dummy.scale.set(.34+i*.055,.68+i*.06,1);color.set('#e4fff2');style=2;opacity=fade*.72;
      }else{
        dummy.quaternion.copy(camera.quaternion);
        if(kind===1&&i>1){const drift=Math.sin(i*2.17+model.time*2)*.018*i,width=Math.max(.34+i*.03,Math.min(.68,worldPerPixel*3.8));dummy.position.x+=drift;dummy.position.y+=i*.018;dummy.scale.set(width,width*1.35,1);style=1;opacity=fade*.65;color.set('#d5ded5');}
        else{const width=Math.max(kind===1?.24:.16,Math.min(.48,worldPerPixel*(kind===1?3.2:2)));dummy.scale.set(width,kind===1?.55:.3,1);color.set(kind===1?(i===0?'#fff1c3':'#ffbd57'):'#ffe0a1');opacity=fade*.88;}
      }
      writeNavalParticle(trails,trailCount++,dummy,color,style,opacity);
    }
  }
  return {
    update(camera){if(disposed)return;counts.fill(0);trailCount=0;total=0;if(model.ball.active)add(model.ball,model.ball.ammo,camera);for(const shot of model.extraShots)add(shot,shot.ammo,camera);for(const shot of model.enemyShots)add(shot,shot.kind??0,camera);for(let i=0;i<3;i++){bodies[i].count=counts[i];bodies[i].instanceMatrix.needsUpdate=true;}finishNavalParticles(trails,trailCount);},
    metrics(){return {shells:counts[0],guided:counts[1],torpedoes:counts[2],trailParticles:trailCount,capacity,disposed};},
    dispose(){if(disposed)return;disposed=true;for(const mesh of bodies){scene.remove(mesh);mesh.dispose();}scene.remove(trails);trails.dispose();geometries.forEach(g=>g.dispose());material.dispose();map.dispose();trailGeometry.dispose();trailMaterial.dispose();},
  };
}
