import * as T from '../vendor/three.module.js';
import {navalWorldPoint} from './naval-camera.mjs?v=island-ski-20261031-1';
import {navalBallisticPoint} from './naval-ballistics.mjs?v=island-ski-20261031-1';
import {navalMarkKind,navalArcColor} from './naval-marks.mjs?v=island-ski-20261031-1';

/** The archery-style arc, drawn from the model's own prediction: a continuous
 * camera-facing ribbon with a dark outline, stopping at the first predicted
 * contact, plus small markers travelling along it. Width is in screen pixels.
 * Landing rings and diamonds are drawn in the 2D HUD, also in screen pixels.
 * The core takes the mark's colour (29/10/2026): green hit, gold centre,
 * pale miss, so the whole path tells the truth, not only its end.
 * Three fixed draws; buffers are allocated once. */
export function createNavalAimArc(scene,model,balance){
 const look=balance.aimLook||{},samples=40,r=balance.render;
 function ribbon(color,opacity,order){
  const geometry=new T.BufferGeometry(),positions=new Float32Array(samples*2*3),index=[];
  for(let i=0;i<samples-1;i++){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
  geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setIndex(index);geometry.setDrawRange(0,0);
  const material=new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:T.DoubleSide,toneMapped:false}),mesh=new T.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.renderOrder=order;mesh.visible=false;mesh.userData.noReflect=true;scene.add(mesh);return {geometry,material,mesh,positions};
 }
 const outline=ribbon(look.arcOutline||'#103847',look.arcOpacity??.9,5),core=ribbon(look.arc||'#B8F6FF',look.arcOpacity??.9,6);
 const moverGeometry=new T.SphereGeometry(1,8,6),moverMaterial=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false}),movers=new T.InstancedMesh(moverGeometry,moverMaterial,Math.max(1,look.movers??3));
 movers.count=0;movers.frustumCulled=false;movers.instanceMatrix.setUsage(T.DynamicDrawUsage);movers.renderOrder=7;movers.userData.noReflect=true;scene.add(movers);
 const points=Array.from({length:samples},()=>new T.Vector3()),view=new T.Vector3(),tangent=new T.Vector3(),side=new T.Vector3(),toCamera=new T.Vector3(),dummy=new T.Object3D();
 let disposed=false,shown=0,visible=false,kind='water';
 const world=p=>navalWorldPoint(p.x,p.z,balance,(p.h||0)*r.worldScale+.05);
 // World size of n screen pixels at a point (390 is the logical canvas height).
 const pixels=(camera,point,n)=>{view.copy(point).applyMatrix4(camera.matrixWorldInverse);return n*2*Math.max(.5,-view.z)*Math.tan(camera.fov*Math.PI/360)/390;};
 function write(target,camera,count,widthPixels){
  for(let i=0;i<count;i++){
   const p=points[i];tangent.copy(points[Math.min(count-1,i+1)]).sub(points[Math.max(0,i-1)]).normalize();toCamera.copy(camera.position).sub(p);side.crossVectors(tangent,toCamera).normalize().multiplyScalar(pixels(camera,p,widthPixels)/2);
   target.positions.set([p.x+side.x,p.y+side.y,p.z+side.z,p.x-side.x,p.y-side.y,p.z-side.z],i*6);
  }
  target.geometry.attributes.position.needsUpdate=true;target.geometry.setDrawRange(0,Math.max(0,count-1)*6);target.mesh.visible=count>1;
 }
 return {
  update(camera){
   if(disposed)return;const p=model.prediction,active=model.aiming&&p&&!model.result;
   shown=0;visible=false;outline.mesh.visible=core.mesh.visible=false;movers.count=0;if(!active)return;
   const now=navalMarkKind(p);if(now!==kind){kind=now;core.material.color.set(navalArcColor(kind,look));}
   // Sample the shared ballistic launch up to the first contact (or the landing).
   const end=p.end?.t??p.flight;let count=samples;
   if(p.launch)for(let i=0;i<samples;i++){const q=navalBallisticPoint(p.launch,end*i/(samples-1)),w=world(q);points[i].set(w.x,w.y,w.z);}
   else{const a=world(p.points[0]),b=world(p.points.at(-1));for(let i=0;i<samples;i++)points[i].set(a.x+(b.x-a.x)*i/(samples-1),a.y+(b.y-a.y)*i/(samples-1),a.z+(b.z-a.z)*i/(samples-1));}
   write(outline,camera,count,look.outlinePixels??5);write(core,camera,count,look.arcPixels??3);
   const n=movers.instanceMatrix.count;for(let k=0;k<n;k++){const u=((model.time*.9+k/n)%1)*(count-1),i=Math.floor(u),f=u-i,q=points[i].clone().lerp(points[Math.min(count-1,i+1)],f);dummy.position.copy(q);dummy.scale.setScalar(pixels(camera,q,2.2));dummy.updateMatrix();movers.setMatrixAt(k,dummy.matrix);}
   movers.count=n;movers.instanceMatrix.needsUpdate=true;shown=count;visible=true;
  },
  metrics(){return {points:shown,visible,movers:movers.count,disposed,kind,color:`#${core.material.color.getHexString().toUpperCase()}`};},
  dispose(){if(disposed)return;disposed=true;for(const item of [outline,core]){scene.remove(item.mesh);item.geometry.dispose();item.material.dispose();}scene.remove(movers);movers.dispose();moverGeometry.dispose();moverMaterial.dispose();},
 };
}
