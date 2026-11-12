import * as THREE from '../vendor/three.module.js';
import {navalWorldPoint} from './naval-camera.mjs?v=island-v2-20261107-10';
/** 11/11/2026 supply buoys (ammo limit): an orange float with a white band, a mast and a blinking light, bobbing on the water. Two draw calls each, at most two buoys. */
export function createNavalSupplyView(scene,model,balance){
 const group=new THREE.Group();scene.add(group);
 const mats={float:new THREE.MeshStandardMaterial({color:'#ff8a3d',roughness:.55,metalness:.1}),band:new THREE.MeshStandardMaterial({color:'#f6f2e6',roughness:.6}),light:new THREE.MeshBasicMaterial({color:'#ffe27a',toneMapped:false})};
 const geos=[],keep=g=>{geos.push(g);return g;};
 const body=keep(new THREE.CylinderGeometry(.9,1.1,1.1,10)),band=keep(new THREE.CylinderGeometry(.92,.92,.3,10)),mast=keep(new THREE.CylinderGeometry(.08,.08,1.6,6)),lamp=keep(new THREE.SphereGeometry(.26,8,6));
 const buoys=[];for(let i=0;i<2;i++){const g=new THREE.Group();const b=new THREE.Mesh(body,mats.float),s=new THREE.Mesh(band,mats.band),m=new THREE.Mesh(mast,mats.band),l=new THREE.Mesh(lamp,mats.light);s.position.y=.3;m.position.y=1.3;l.position.y=2.1;g.add(b,s,m,l);g.userData.lamp=l;g.visible=false;for(const c of g.children){c.frustumCulled=false;c.userData.noReflect=true;}group.add(g);buoys.push(g);}
 return {
  update(){const list=model.buoys||[],time=model.time||0;for(let i=0;i<buoys.length;i++){const b=list[i],g=buoys[i];if(!b){g.visible=false;continue;}const p=navalWorldPoint(b.x,b.z,balance,0);g.position.set(p.x,Math.sin(time*2.2+i)*.12+.1,p.z);g.rotation.z=Math.sin(time*1.7+i)*.08;g.rotation.x=Math.cos(time*1.3)*.06;g.userData.lamp.visible=Math.sin(time*6)>-.2;g.visible=true;}},
  metrics(){return {buoys:buoys.filter(g=>g.visible).length};},
  dispose(){scene.remove(group);for(const g of geos)g.dispose();for(const m of Object.values(mats))m.dispose();}
 };
}
