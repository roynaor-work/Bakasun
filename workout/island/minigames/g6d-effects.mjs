import * as THREE from '../vendor/three.module.js';
import {navalWorldPoint} from './naval-camera.mjs?v=naval-art-20261022-2';
/** All scenery/effect instances are allocated once; six fixed batches at most. */
export function createNavalEffects(scene,seaMaterial,model,balance){
 const r=balance.render,objects=[],resources=[],dummy=new THREE.Object3D(),color=new THREE.Color();
 const batch=(geometry,material,count)=>{const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;scene.add(mesh);objects.push(mesh);resources.push(geometry,material);return mesh;};
 const time={value:0};seaMaterial.roughness=.27;seaMaterial.metalness=.32;seaMaterial.onBeforeCompile=shader=>{
  shader.uniforms.g6dTime=time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 g6dWater;').replace('#include <begin_vertex>','#include <begin_vertex>\ng6dWater=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float g6dTime; varying vec3 g6dWater;').replace('#include <color_fragment>',`#include <color_fragment>
   vec2 p=g6dWater.xz;float t=g6dTime;
   float swell=sin(p.x*.75+t*1.6+cos(p.y*.35+t))*.5+.5;
   float ripple=sin(p.x*5.3+p.y*3.8+t*2.5)*sin(p.y*6.1-t*1.7);
   float glint=pow(max(0.,ripple),18.)*(.25+.75*pow(max(0.,sin(p.x*.12+p.y*.18)),4.));
   diffuseColor.rgb=mix(vec3(.025,.27,.41),vec3(.06,.55,.66),swell*.58+.2);
   diffuseColor.rgb+=vec3(.42,.65,.67)*glint*.65;`);
 };
 seaMaterial.customProgramCacheKey=()=> 'g6d-water-1';
 const texture=document.createElement('canvas');texture.width=texture.height=64;const p=texture.getContext('2d'),g=p.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffffcc');g.addColorStop(.4,'#ffffff77');g.addColorStop(1,'#ffffff00');p.fillStyle=g;p.fillRect(0,0,64,64);const map=new THREE.CanvasTexture(texture);resources.push(map);
 const foam=batch(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map,color:r.foam,transparent:true,opacity:.85,depthWrite:false}),64);foam.count=0;
 const smoke=batch(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map,color:r.smoke,transparent:true,opacity:.65,depthWrite:false}),40);smoke.count=0;
 let lastFoam=0,damaged=0;
 return {update(camera){time.value=model.time;
  let n=0;for(const point of model.trail){const age=model.time-point.time,u=age/2.8,w=navalWorldPoint(point.x,point.z,balance);dummy.position.set(w.x-Math.sin(point.heading)*5.8,.18,w.z+Math.cos(point.heading)*5.8);dummy.rotation.set(-Math.PI/2,0,point.heading);dummy.scale.set((1.7+u*5)*(point.speed/32),1.6+u*3,1);dummy.updateMatrix();foam.setMatrixAt(n++,dummy.matrix);}
  if(model.moving&&model.playerShip.speed>1){const ship=model.playerShip,w=navalWorldPoint(ship.x,ship.z,balance);for(let i=0;i<12;i++){const side=i%2?1:-1,j=Math.floor(i/2),forward=5.6-j*.28,lateral=side*(.5+j*.28),a=ship.heading;dummy.position.set(w.x+Math.sin(a)*forward+Math.cos(a)*lateral,.25+Math.sin(model.time*8+j)*.04,w.z-Math.cos(a)*forward+Math.sin(a)*lateral);dummy.rotation.set(-Math.PI/2,0,a);dummy.scale.set(.65+j*.08,1.1,1);dummy.updateMatrix();foam.setMatrixAt(n++,dummy.matrix);}}
  foam.count=n;foam.instanceMatrix.needsUpdate=true;lastFoam=n;
  n=0;damaged=0;for(const ship of [model.playerShip,...model.enemies]){if(ship.hp>=ship.maxHp||ship.active===false||ship.hp<=0&&model.sinkProgress>.8)continue;damaged++;const w=navalWorldPoint(ship.x,ship.z,balance);for(let i=0;i<8;i++){const age=(model.time*.45+i/8)%1;dummy.position.set(w.x+Math.sin(age*5+i)*age*.8,2.8+age*8.5,w.z+1+age*1.4);dummy.quaternion.copy(camera.quaternion);dummy.scale.setScalar(1.2+age*3.5);dummy.updateMatrix();smoke.setMatrixAt(n,dummy.matrix);color.setScalar(.38+age*.5);smoke.setColorAt(n++,color);}}smoke.count=n;smoke.instanceMatrix.needsUpdate=true;if(smoke.instanceColor)smoke.instanceColor.needsUpdate=true;
 },metrics(){return {foamInstances:lastFoam,smokeInstances:smoke.count,damagedShips:damaged,cloudPuffs:0,trees:0,waterTime:time.value};},dispose(){for(const object of objects)scene.remove(object);for(const resource of resources)resource.dispose();}};
}
