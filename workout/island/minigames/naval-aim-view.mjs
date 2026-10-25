import * as T from '../vendor/three.module.js';
import {NAVAL_WEAPON_COLORS} from './naval-icons.mjs?v=island-ready-plots-20261026-1';
import {navalWorldPoint} from './naval-camera.mjs?v=island-ready-plots-20261026-1';

/** The blue-arc idea from archery games, drawn from the model's own prediction:
 * a dotted arc from the muzzle, a landing ring on the water and a contact mark
 * where the shell would meet a hull. Three fixed draws, no per-frame allocation. */
export function createNavalAimArc(scene,model,balance){
 const capacity=40,dotGeometry=new T.SphereGeometry(1,6,4),dotMaterial=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false}),dots=new T.InstancedMesh(dotGeometry,dotMaterial,capacity);
 dots.count=0;dots.frustumCulled=false;dots.instanceMatrix.setUsage(T.DynamicDrawUsage);dots.renderOrder=5;scene.add(dots);
 const ringGeometry=new T.RingGeometry(.78,1,40);ringGeometry.rotateX(-Math.PI/2);
 const ringMaterial=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide,toneMapped:false}),ring=new T.Mesh(ringGeometry,ringMaterial);ring.renderOrder=5;ring.visible=false;scene.add(ring);
 const markGeometry=new T.OctahedronGeometry(1,0),markMaterial=new T.MeshBasicMaterial({color:'#fff3c4',transparent:true,opacity:.95,depthWrite:false,depthTest:false,toneMapped:false}),mark=new T.Mesh(markGeometry,markMaterial);mark.renderOrder=7;mark.visible=false;scene.add(mark);
 const dummy=new T.Object3D(),view=new T.Vector3(),color=new T.Color();let disposed=false,shown=0;
 const r=balance.render,world=(p,lift=0)=>navalWorldPoint(p.x,p.z,balance,(p.h||0)*r.worldScale+lift);
 const pixelSize=(camera,position,pixels)=>{view.copy(position).applyMatrix4(camera.matrixWorldInverse);const depth=Math.max(.5,-view.z);return pixels*2*depth*Math.tan(camera.fov*Math.PI/360)/390;};
 return {
  update(camera){
   if(disposed)return;const p=model.prediction,active=model.aiming&&p&&!model.result;
   dots.count=0;ring.visible=mark.visible=false;shown=0;if(!active)return;
   const weapon=NAVAL_WEAPON_COLORS[model.ammoIndex]||'#ffd36e',hit=Boolean(p.contact);color.set(weapon);dotMaterial.color.copy(color);
   const points=p.points,last=p.contact?Math.max(1,Math.ceil(p.contact.t/Math.max(1e-6,p.launch?.duration||p.flight)*(points.length-1))):points.length-1;
   for(let i=1;i<=last&&dots.count<capacity;i++){
    const q=world(points[i],.04),size=pixelSize(camera,dummy.position.set(q.x,q.y,q.z),i===last?4.6:3.4);
    dummy.scale.setScalar(Math.max(.05,size));dummy.updateMatrix();dots.setMatrixAt(dots.count++,dummy.matrix);
   }
   dots.instanceMatrix.needsUpdate=true;shown=dots.count;
   const end=world({...p.landing,h:0},.06),width=Math.max(1.1,(balance.aim.hullBeam*.55)*r.worldScale);
   ring.visible=!p.guided;ring.position.set(end.x,end.y,end.z);ring.scale.setScalar(width);ringMaterial.color.set(hit?'#fff3c4':weapon);ringMaterial.opacity=hit?.95:.8;
   if(hit){const q=world(p.contact,.1),size=pixelSize(camera,mark.position.set(q.x,q.y+.3,q.z),p.contact.critical?9:6.5);mark.visible=true;mark.scale.set(size,size*1.6,size);mark.rotation.y=model.time*3;markMaterial.color.set(p.contact.critical?'#ffe27a':'#fff3c4');}
  },
  metrics(){return {dots:shown,ring:ring.visible,contact:mark.visible,disposed};},
  dispose(){if(disposed)return;disposed=true;scene.remove(dots,ring,mark);dots.dispose();for(const g of [dotGeometry,ringGeometry,markGeometry])g.dispose();for(const m of [dotMaterial,ringMaterial,markMaterial])m.dispose();},
 };
}
