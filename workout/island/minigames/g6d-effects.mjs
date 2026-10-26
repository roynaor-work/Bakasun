import * as THREE from '../vendor/three.module.js';
import {navalEffectAtlas,navalParticleGeometry,navalParticleMaterial,writeNavalParticle,finishNavalParticles} from './ultra-naval-effects.mjs?v=island-people-scale-20261026-1';

/** Persistent V wakes follow the recorded course; narrow damage smoke leaves hulls readable.
 * Two fixed atlas batches. Water shading belongs to the naval environment. */
export function createNavalEffects(scene,seaMaterial,model,balance){
  const r=balance.render,foamCapacity=160,smokeCapacity=40,map=navalEffectAtlas(),dummy=new THREE.Object3D(),color=new THREE.Color();
  const foamG=navalParticleGeometry(foamCapacity),foamM=navalParticleMaterial(map),foam=new THREE.InstancedMesh(foamG,foamM,foamCapacity);
  const smokeG=navalParticleGeometry(smokeCapacity),smokeM=navalParticleMaterial(map),smoke=new THREE.InstancedMesh(smokeG,smokeM,smokeCapacity);
  for(const mesh of [foam,smoke]){mesh.frustumCulled=false;mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
  let lastFoam=0,damaged=0,disposed=false;
  const worldX=z=>z*r.enemySpacing/balance.combat.laneSpacing,worldZ=x=>-(x-balance.shipX)*r.worldScale;
  function foamParticle(n,x,z,heading,width,length,opacity){
    if(n>=foamCapacity)return n;dummy.position.set(x,.075,z);dummy.rotation.set(-Math.PI/2,0,heading);dummy.scale.set(width,length,1);color.set('#e6fff6');writeNavalParticle(foam,n++,dummy,color,2,opacity);return n;
  }
  function smokeShip(ship,camera,n){
    if(ship.hp>=ship.maxHp||ship.active===false||ship.hp<=0&&model.sinkProgress>.8||n>=smokeCapacity)return n;
    damaged++;const damage=1-Math.max(0,ship.hp)/ship.maxHp,x=worldX(ship.z),z=worldZ(ship.x),heading=ship.heading||0;
    for(let i=0;i<8&&n<smokeCapacity;i++){
      const age=(model.time*.55+i/8)%1,size=.38+age*(.85+damage*.65),drift=age*age;
      dummy.position.set(x+Math.cos(heading)*.45+drift*.95+Math.sin(i*3.7+age*4)*.12,4.45+age*(3.6+damage*1.2),z+.45+drift*.65);
      dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(Math.sin(i*2.3+age)*.35);dummy.scale.set(size,size*1.3,1);
      color.set(i%2?'#8c9690':'#697770');writeNavalParticle(smoke,n++,dummy,color,1,(.5+damage*.3)*Math.sin(age*Math.PI)*Math.pow(1-age,.45));
    }
    return n;
  }
  return {
    update(camera){
      if(disposed)return;let n=0;
      for(const point of model.trail){
        const age=model.time-point.time,u=Math.min(1,Math.max(0,age/2.8)),speed=Math.min(1,Math.max(0,point.speed/32)),a=point.heading;
        const x=worldX(point.z)-Math.sin(a)*(4.7+u*.75),z=worldZ(point.x)+Math.cos(a)*(4.7+u*.75),width=.4+u*.8,lateral=.6+age*1.35;
        const fade=Math.pow(1-u,1.8)*speed;
        n=foamParticle(n,x+Math.cos(a)*lateral,z+Math.sin(a)*lateral,a-.3,width,1.1+u*1.1,fade*.53);
        n=foamParticle(n,x-Math.cos(a)*lateral,z-Math.sin(a)*lateral,a+.3,width,1.1+u*1.1,fade*.53);
        if(u<.66)n=foamParticle(n,x,z,a,1.05+u*.65,1.55,fade*.3);
      }
      if(model.moving&&model.playerShip.speed>1){
        const ship=model.playerShip,a=ship.heading,x=worldX(ship.z),z=worldZ(ship.x),speed=Math.min(1,ship.speed/32);
        for(let i=0;i<12;i++){
          const side=i%2?1:-1,j=Math.floor(i/2),forward=4.6-j*.45,lateral=side*(.48+j*.19);
          n=foamParticle(n,x+Math.sin(a)*forward+Math.cos(a)*lateral,z-Math.cos(a)*forward+Math.sin(a)*lateral,a+side*.3,.32+j*.035,.7+j*.1,speed*(.7-j*.07));
        }
      }
      finishNavalParticles(foam,n);lastFoam=n;damaged=0;n=smokeShip(model.playerShip,camera,0);for(const ship of model.enemies)n=smokeShip(ship,camera,n);finishNavalParticles(smoke,n);
    },
    metrics(){return {foamInstances:lastFoam,smokeInstances:smoke.count,damagedShips:damaged,cloudPuffs:0,trees:0,waterTime:model.time,disposed};},
    dispose(){if(disposed)return;disposed=true;scene.remove(foam,smoke);foam.dispose();smoke.dispose();foamG.dispose();smokeG.dispose();foamM.dispose();smokeM.dispose();map.dispose();},
  };
}
