import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-v2-20261107-10';
import {navalWorldPoint} from './naval-camera.mjs?v=island-v2-20261107-10';
/** 11/11/2026 enemy base (Roy): shore structures as merged procedural geometry, in three looks (coast: sand and concrete bunkers;
 * palace: white walls, gold roofs, blue domes; subpen: dark concrete and steel). 12/11: every rigid body is ONE vertex-coloured mesh
 * (one material per structure): a gun is two draw calls (bunker, turret with its barrel), every other structure and the ground plate one,
 * and the structures stay out of the 12 Hz water-reflection pass (`noReflect`), which drew them twice on capture frames and broke the
 * 70-call budget on stage 5 (profile 12/11: 39 calls on a normal frame, 71 on a capture frame, 81 with a shell and its impact).
 * The returned object matches the vessel interface the view animates (root, turret, barrel, flag, smoke, flame, foam, shield, ready,
 * modelStatus, dispose), plus `structure:true` and `animate(e,x,z,time,camera,player)` for its own motion: guns track the ship, hit
 * structures smoke, destroyed ones collapse into the ground instead of sinking. `createNavalBasePlate` is the ground under the whole base. */
const LOOKS={
 coast:{wall:'#b9b6a6',roof:'#8f8a7a',trim:'#6f6d63',ground:'#d9c58f',rock:'#8f8f86',tank:'#c9532d'},
 palace:{wall:'#f1ede4',roof:'#d8bd7a',trim:'#3d6fa8',ground:'#e8dcc0',rock:'#a8a49a',tank:'#c9532d'},
 subpen:{wall:'#6f7a80',roof:'#4f5a60',trim:'#2d363c',ground:'#8d9397',rock:'#5f6568',tank:'#b44a2a'},
};
const DARK='#2b2f33';
/** A box or cylinder part, moved into place and painted with one colour as a vertex-colour attribute (so parts of different colours merge into one mesh). */
const paint=(g,hex)=>{const c=new THREE.Color(hex),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;};
const part=(hex,w,h,d,x=0,y=0,z=0,ry=0)=>{const g=new THREE.BoxGeometry(w,h,d);g.rotateY(ry);g.translate(x,y,z);return paint(g,hex);};
const cyl=(hex,r1,r2,h,x=0,y=0,z=0,seg=10,rz=0)=>{const g=new THREE.CylinderGeometry(r1,r2,h,seg);g.rotateZ(rz);g.translate(x,y,z);return paint(g,hex);};
const dome=(hex,r,y)=>{const g=new THREE.SphereGeometry(r,12,8,0,Math.PI*2,0,Math.PI/2);g.translate(0,y,0);return paint(g,hex);};
const merged=list=>{const g=mergeGeometries(list,false);for(const l of list)l.dispose();return g;};
function material(extra={}){return new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.75,metalness:.08,...extra});}
export function navalBaseLook(variant){return LOOKS[variant]||LOOKS.coast;}
export function createNavalStructure(r,row,fx){
 const look=navalBaseLook(row.variant),root=new THREE.Group(),turret=new THREE.Group(),barrel=new THREE.Object3D(),flag=new THREE.Object3D(),smoke=new THREE.Group(),flame=new THREE.Object3D(),foam=new THREE.Object3D(),shield=new THREE.Object3D();
 const geos=[],mat=material(),add=(parts,parent=root)=>{const g=merged(parts);geos.push(g);const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;parent.add(mesh);return mesh;};
 const {wall,roof,trim,tank}=look;let length=10,gunMesh=null;
 if(row.structure==='gun'){
  add([part(wall,7,2.4,5.5,0,1.2,0),part(wall,8,.6,6.5,0,.3,0),part(wall,1.2,1.2,1.2,-2.6,3,-1.4),part(wall,1.2,1.2,1.2,2.6,3,-1.4)]);
  // Turret ring and barrel in one mesh; the recoil moves the whole turret mesh a little (the ring's half unit is not visible from the sea).
  const tilt=g=>{g.rotateX(-.22);g.translate(0,1.5,0);return g;};gunMesh=add([cyl(trim,1.7,1.9,1.4,0,.7,0,12),tilt(part(DARK,.7,.7,4.2,0,0,1.6)),tilt(part(DARK,.95,.95,1.2,0,0,.2))],turret);barrel.position.set(0,1.5+Math.sin(.22)*3.7,Math.cos(.22)*3.7);turret.add(barrel);turret.position.set(0,2.4,.4);root.add(turret);length=8;
 }else if(row.structure==='tower'){
  const parts=[cyl(wall,2.2,2.6,9,0,4.5,0,12),part(wall,6,.5,6,0,9.2,0),part(wall,.5,1.1,6,-2.9,10,0),part(wall,.5,1.1,6,2.9,10,0),part(wall,6,1.1,.5,0,10,-2.9),part(wall,6,1.1,.5,0,10,2.9)];
  parts.push(row.variant==='palace'?dome(trim,2.4,9.4):cyl(roof,0,2.8,2.6,0,10.7,0,8));add(parts);length=6;
 }else if(row.structure==='gate'){
  add([part(wall,6,5,2.4,-7,2.5,0),part(wall,6,5,2.4,7,2.5,0),part(wall,20,1.2,2.6,0,6.2,0),part(wall,2.6,8,2.8,-10.5,4,0),part(wall,2.6,8,2.8,10.5,4,0),part(wall,1,1,2.8,-10.5,8.8,0),part(wall,1,1,2.8,10.5,8.8,0),
   part(roof,2.8,.8,3,-10.5,8.3,0),part(roof,2.8,.8,3,10.5,8.3,0),part(roof,20,.5,.6,0,6.9,1.2),part(trim,7.6,4.6,.5,0,2.3,0)]);length=22;
 }else if(row.structure==='depot'){
  add([cyl(tank,1.3,1.3,5,-2.2,1.3,0,10,Math.PI/2),cyl(tank,1.3,1.3,5,0,1.3,-2.3,10,Math.PI/2),cyl(tank,1.3,1.3,5,2.2,1.3,0,10,Math.PI/2),
   part(wall,1.6,1.6,1.6,-3.6,.8,3),part(wall,1.6,1.6,1.6,-1.8,.8,3.2),part(wall,1.6,1.6,1.6,-2.7,2.4,3.1),part(wall,9,.4,9,0,.2,0)]);length=10;
 }else{// submarine pen
  add([part(wall,12,6,10,0,3,0),part(wall,12,1,10.5,0,6.5,0),part(wall,1.5,6,10,-5.3,3,0),part(wall,1.5,6,10,5.3,3,0),cyl(DARK,1.1,1.1,8,0,1.2,1,10,Math.PI/2),cyl(DARK,.6,.8,1.6,0,2.6,.5,8)]);length=12;
 }
 root.add(flag,smoke,flame,foam,shield);root.userData.noReflect=true;
 const s=(row.scale||1)*(r.playerScale||1)*.95;root.scale.setScalar(s);
 const api={root,turret,barrel,flag,smoke,flame,foam,shield,ready:Promise.resolve(),modelStatus:{requested:false,loaded:true,failed:false},structure:true,kind:row.structure,modelLength:length*s,lastHp:undefined,
  animate(e,x,z,time,camera,player){
   const down=e.hp<=0,age=down?Math.min(1,(time-(e.sunkAt??time))/.65):0;
   root.position.set(x,-age*1.6,z);root.rotation.set(down?age*.18:0,Math.PI,down?age*.12:0);root.scale.set(s,s*(1-age*.6),s);
   if(row.structure==='gun'&&player){const dx=player.x-x,dz=player.z-z;turret.rotation.y=Math.atan2(dx,dz)-Math.PI;if(gunMesh)gunMesh.position.z=(e.recoil||0)*.5;}
   smoke.visible=e.hp<e.maxHp;flame.visible=e.hp<e.maxHp&&!down;flag.visible=false;shield.visible=false;foam.visible=false;
   if(camera){flame.position.set(0,3.2,0);flame.quaternion.copy(root.quaternion).invert().multiply(camera.quaternion);flame.scale.set(.8,1.8+Math.sin(time*12)*.2,1);}
   smoke.position.y=4+(time%2);smoke.scale.setScalar(.8+(time%2)*.5);
  },
  dispose(){for(const g of geos)g.dispose();mat.dispose();}};
 return api;
}
/** Ground under the base: a flat plate with a shore step and a few rocks (one vertex-coloured mesh), centred on the structures' mean position. */
export function createNavalBasePlate(scene,balance,rows){
 if(!rows.length)return null;const look=navalBaseLook(rows[0].variant),r=balance.render;
 const cx=rows.reduce((a,e)=>a+e.x,0)/rows.length,cz=rows.reduce((a,e)=>a+e.z,0)/rows.length,p=navalWorldPoint(cx,cz,balance,0);
 const spanZ=Math.max(40,...rows.map(e=>Math.abs(e.z-cz)*2+30))*r.enemySpacing/balance.combat.laneSpacing,spanX=Math.max(30,...rows.map(e=>Math.abs(e.x-cx)*2+30))*r.worldScale*1.6;
 const mat=material({roughness:.9});
 const g=merged([part(look.ground,spanZ+6,1.2,spanX+6,0,.3,0),part(look.ground,spanZ+10,.5,spanX+10,0,-.1,0),cyl(look.rock,2.5,3.5,2.6,-spanZ/2+2,1.2,-spanX/2+2,7),cyl(look.rock,1.8,2.8,2,spanZ/2-3,1,spanX/2-2,7),cyl(look.rock,2.2,3.2,2.8,spanZ/2-4,1.3,-spanX/2+3,7)]);
 const plate=new THREE.Mesh(g,mat);plate.position.set(p.x,0,p.z);plate.frustumCulled=false;plate.userData.noReflect=true;scene.add(plate);
 return {update(){},metrics(){return {plate:true,width:+spanZ.toFixed(1),depth:+spanX.toFixed(1)};},dispose(){scene.remove(plate);g.dispose();mat.dispose();}};
}
