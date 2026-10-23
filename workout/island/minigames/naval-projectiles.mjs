import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {navalProjectileHeight} from './naval-camera.mjs?v=island-art-20261022-3';

const FORWARD=new T.Vector3(0,0,-1);
function projectileGeometry(kind){
  const parts=[];
  function add(geometry,color,z=0){geometry.translate(0,0,z);const c=new T.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.deleteAttribute('uv');parts.push(geometry.index?geometry.toNonIndexed():geometry);if(geometry.index)geometry.dispose();}
  const rocket=kind===1,torpedo=kind===2,radius=torpedo?.2:rocket?.15:.12,length=torpedo?1.8:rocket?1.65:.8;
  const body=new T.CylinderGeometry(radius,radius,length,8);body.rotateX(Math.PI/2);add(body,torpedo?'#4f8799':rocket?'#f2ecd7':'#e7b76d');
  const nose=new T.ConeGeometry(radius,rocket?.5:.34,8);nose.rotateX(-Math.PI/2);add(nose,rocket?'#e9654b':torpedo?'#b8f4e8':'#fff2bd',-length/2-.15);
  if(rocket||torpedo){add(new T.BoxGeometry(radius*4,.055,.5),'#ccd9d3',length*.35);add(new T.BoxGeometry(.055,radius*4,.5),'#ccd9d3',length*.35);}
  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());return geometry;
}
function glowTexture(){const size=32,bytes=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const radius=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=255;bytes[i+3]=Math.round(Math.pow(Math.max(0,1-radius),2.5)*255);}const map=new T.DataTexture(bytes,size,size);map.needsUpdate=true;return map;}

/** Physical shots are only read. Meshes, fins, exhaust and wakes are fixed batches. */
export function createNavalProjectiles(scene,model,balance){
  const capacity=balance.render.effects.maxProjectiles+9,material=new T.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.42}),geometries=[0,1,2].map(projectileGeometry);
  const bodies=geometries.map(geometry=>{const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return mesh;});
  const map=glowTexture(),trailGeometry=new T.PlaneGeometry(1,1),trailMaterial=new T.MeshBasicMaterial({map,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}),trails=new T.InstancedMesh(trailGeometry,trailMaterial,capacity*10);trails.count=0;trails.frustumCulled=false;scene.add(trails);
  const dummy=new T.Object3D(),position=new T.Vector3(),direction=new T.Vector3(),color=new T.Color();let disposed=false,counts=[0,0,0],trailCount=0;
  function add(shot,ammo,camera){
    const kind=ammo===2?2:ammo===1?1:0;if(counts.reduce((a,b)=>a+b,0)>=capacity)return;
    const t=Math.min(1,Math.max(0,shot.age/shot.duration)),height=navalProjectileHeight(ammo,t,model.time,balance),r=balance.render;
    position.set(shot.z*r.enemySpacing/balance.combat.laneSpacing,height,-(shot.x-balance.shipX)*r.worldScale);
    direction.set((shot.targetZ-shot.fromZ)*r.enemySpacing/balance.combat.laneSpacing,(navalProjectileHeight(ammo,t+.005,model.time,balance)-height)/.005,-(shot.targetX-shot.fromX)*r.worldScale);
    if(direction.lengthSq()<.00001)direction.copy(FORWARD);else direction.normalize();
    dummy.position.copy(position);dummy.quaternion.setFromUnitVectors(FORWARD,direction);dummy.scale.setScalar(ammo===4?.9:kind===1?1.6:1.15);dummy.updateMatrix();bodies[kind].setMatrixAt(counts[kind]++,dummy.matrix);
    const length=kind===1?8:kind===2?10:3;
    for(let i=0;i<length&&trailCount<capacity*10;i++){
      dummy.position.copy(position).addScaledVector(direction,-1.2-i*(kind===1?.52:.32));dummy.quaternion.copy(camera.quaternion);const fade=1-i/length;
      dummy.scale.setScalar((kind===1?.48+i*.05:kind===2?.42:.24)*(.6+fade));dummy.updateMatrix();trails.setMatrixAt(trailCount,dummy.matrix);
      color.set(kind===2?'#baf9ec':kind===1?(i<2?'#ffb653':'#e0e9df'):'#fff1c9').multiplyScalar(fade*fade);trails.setColorAt(trailCount++,color);
    }
  }
  return {update(camera){if(disposed)return;counts=[0,0,0];trailCount=0;if(model.ball.active)add(model.ball,model.ball.ammo,camera);for(const shot of model.extraShots)add(shot,shot.ammo,camera);for(const shot of model.enemyShots)add(shot,shot.kind??0,camera);bodies.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;});trails.count=trailCount;trails.instanceMatrix.needsUpdate=true;if(trails.instanceColor)trails.instanceColor.needsUpdate=true;},
    metrics(){return {shells:counts[0],guided:counts[1],torpedoes:counts[2],trailParticles:trailCount,capacity,disposed};},
    dispose(){if(disposed)return;disposed=true;for(const mesh of [...bodies,trails]){scene.remove(mesh);mesh.dispose();}geometries.forEach(g=>g.dispose());material.dispose();map.dispose();trailGeometry.dispose();trailMaterial.dispose();},
  };
}
