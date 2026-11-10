import * as THREE from '../vendor/three.module.js';
import {navalWorldPoint} from './naval-camera.mjs?v=island-v2-20261107-8';
/** Placeholder aircraft: simple solids (plane = fuselage + wings + tail, helicopter = body + tail boom + spinning rotor) and Vulcan tracers.
 * A Codex model/animation set replaces `build` later; the model contract (`model.air`, `model.vulcan`) stays. */
export function createNavalAirView(scene,model,balance){
 const r=balance.render,group=new THREE.Group();scene.add(group);
 const mats={plane:new THREE.MeshStandardMaterial({color:'#7d8b94',roughness:.55,metalness:.3}),heli:new THREE.MeshStandardMaterial({color:'#4d6b57',roughness:.6,metalness:.2}),dark:new THREE.MeshStandardMaterial({color:'#20262b',roughness:.8}),hit:new THREE.MeshBasicMaterial({color:'#ffd9a0'}),trace:new THREE.MeshBasicMaterial({color:'#ffe59a',transparent:true,opacity:.95,depthWrite:false,toneMapped:false})};
 const boxes=new Set(),geos=[];const box=(w,h,d,m,x=0,y=0,z=0,parent)=>{const g=new THREE.BoxGeometry(w,h,d);geos.push(g);const me=new THREE.Mesh(g,m);me.position.set(x,y,z);parent.add(me);return me;};
 function build(kind){const g=new THREE.Group(),m=mats[kind],s=r.worldScale*(kind==='heli'?1.3:1.1);
  if(kind==='plane'){box(.5,.4,3.2,m,0,0,0,g);box(4.2,.12,.9,m,0,0,.2,g);box(1.4,.1,.5,m,0,.1,1.5,g);box(.1,.7,.5,m,0,.35,1.5,g);}
  else{box(1.2,1,2.2,m,0,0,0,g);box(.3,.3,2.2,m,0,.1,2.1,g);const rotor=box(4.4,.06,.3,mats.dark,0,.8,0,g);g.userData.rotor=rotor;box(.1,.7,.1,mats.dark,0,.5,0,g);}
  g.scale.setScalar(s*.9);g.userData.kind=kind;group.add(g);return g;}
 const pool=new Map(),tracers=[];for(let i=0;i<10;i++){const g=new THREE.BoxGeometry(.06,.06,1);geos.push(g);const m=new THREE.Mesh(g,mats.trace);m.visible=false;m.frustumCulled=false;group.add(m);tracers.push(m);}
 const a=new THREE.Vector3(),b=new THREE.Vector3();
 return {
  update(){
   const live=new Set();
   for(const e of model.air||[]){live.add(e.id);let g=pool.get(e.id);if(!g){g=build(e.kind);pool.set(e.id,g);}
    const p=navalWorldPoint(e.x,e.z,balance,e.h*r.worldScale*.35);g.position.set(p.x,p.y,p.z);
    g.rotation.y=Math.atan2(-e.vx,-(-e.vz*.0))+Math.PI;g.rotation.z=e.kind==='plane'?Math.sin(model.time*2+e.id)*.12:0;if(g.userData.rotor)g.userData.rotor.rotation.y=model.time*38;
    g.visible=true;}
   for(const [id,g] of pool)if(!live.has(id)){group.remove(g);pool.delete(id);}
   const v=model.vulcan,list=v?.tracers||[];
   for(let i=0;i<tracers.length;i++){const t=list[i],m=tracers[i];if(!t){m.visible=false;continue;}
    const f=navalWorldPoint(t.fromX,t.fromZ,balance,r.muzzleY??2),to=navalWorldPoint(t.toX,t.toZ,balance,t.h*r.worldScale*.35);a.set(f.x,f.y,f.z);b.set(to.x,to.y,to.z);
    m.position.copy(a).lerp(b,.5);m.scale.z=a.distanceTo(b);m.lookAt(b);m.visible=true;}
  },
  dispose(){scene.remove(group);for(const g of geos)g.dispose();for(const m of Object.values(mats))m.dispose();pool.clear();}
 };
}
