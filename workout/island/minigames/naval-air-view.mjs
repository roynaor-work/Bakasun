import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {navalWorldPoint} from './naval-camera.mjs?v=island-v2-20261107-9';
import {NAVAL_AIR_LIFT} from './naval-air.mjs';
/** 11/11/2026: attack aircraft at hull scale (the v20 boxes were a tenth of the hull and sat at mast height), one merged
 * geometry per airframe plus spinning rotors, a hit flash, a smoke trail and a nose-over fall when shot down; Vulcan tracers
 * as bright instanced streaks from the ship's mount with sparks where they strike. A Codex model set can replace `build`
 * later; the model contract (`model.air`, `model.vulcan`) stays. Draw calls: plane 2, helicopter 3, plus 4 shared. */
export function createNavalAirView(scene,model,balance){
 const r=balance.render,group=new THREE.Group();scene.add(group);
 const mats={plane:new THREE.MeshStandardMaterial({color:'#8d9aa3',roughness:.5,metalness:.35}),heli:new THREE.MeshStandardMaterial({color:'#5a7a63',roughness:.6,metalness:.2}),glass:new THREE.MeshStandardMaterial({color:'#8fd6ff',roughness:.2,metalness:.6}),dark:new THREE.MeshStandardMaterial({color:'#20262b',roughness:.8}),
  hit:new THREE.MeshBasicMaterial({color:'#fff1c2',toneMapped:false}),trace:new THREE.MeshBasicMaterial({color:'#ffe27a',transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}),
  spark:new THREE.MeshBasicMaterial({color:'#fff5d6',transparent:true,opacity:.9,depthWrite:false,toneMapped:false}),smoke:new THREE.MeshBasicMaterial({color:'#3c3f44',transparent:true,opacity:.5,depthWrite:false}),flash:new THREE.MeshBasicMaterial({color:'#fff0b0',transparent:true,opacity:.85,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending})};
 const geos=[],keep=g=>{geos.push(g);return g;};
 const part=(w,h,d,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const g=new THREE.BoxGeometry(w,h,d);g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);return g;};
 const merged=list=>{const g=mergeGeometries(list,false);for(const l of list)l.dispose();return keep(g);};
 // Nose along +z (Object3D.lookAt points +z at the target). Sizes in world units: the player hull is about 5.7 long.
 const frames={
  // Planes come at the ship nose-on, so the wings are thick and the fuselage wide enough to read from the front.
  plane:merged([part(1.3,1.1,5.6),part(.8,.7,1.4,0,.05,3.4),part(8.6,.34,1.8,0,-.05,.1),part(3.2,.22,1.1,0,.2,-2.4),part(.2,1.4,1.1,0,.85,-2.4,.3),part(.7,.7,1,-3.6,-.25,.1),part(.7,.7,1,3.6,-.25,.1)]),
  cockpit:keep(part(.8,.55,1.6,0,.68,.9)),
  heli:merged([part(2.2,1.8,4.4),part(.6,.6,4.4,0,.2,-3.9),part(.16,1.4,.9,0,.8,-5.7),part(.18,.8,.18,0,1.3,0),part(.16,.4,3.1,-1,-1.25,0),part(.16,.4,3.1,1,-1.25,0),part(.1,.7,.1,-1,-.9,1.2),part(.1,.7,.1,1,-.9,1.2),part(.1,.7,.1,-1,-.9,-1.2),part(.1,.7,.1,1,-.9,-1.2)]),
  heliGlass:keep(part(1.7,1,1.3,0,.3,1.7)),
  rotor:merged([part(7.6,.09,.44),part(.44,.09,7.6)]),
  tailRotor:keep(part(.08,1.6,.26)),
 };
 const smokeGeometry=keep(new THREE.SphereGeometry(1,6,4)),sparkGeometry=keep(new THREE.SphereGeometry(1,6,4)),traceGeometry=keep(new THREE.BoxGeometry(.3,.3,1)),flashGeometry=keep(new THREE.SphereGeometry(.32,8,6));
 const tracers=new THREE.InstancedMesh(traceGeometry,mats.trace,12),sparks=new THREE.InstancedMesh(sparkGeometry,mats.spark,12),smoke=new THREE.InstancedMesh(smokeGeometry,mats.smoke,24),flash=new THREE.Mesh(flashGeometry,mats.flash);
 for(const m of [tracers,sparks,smoke,flash]){m.frustumCulled=false;m.userData.noReflect=true;group.add(m);}tracers.count=sparks.count=smoke.count=0;flash.visible=false;
 function build(kind){const g=new THREE.Group();g.userData.kind=kind;
  if(kind==='plane'){const body=new THREE.Mesh(frames.plane,mats.plane),glass=new THREE.Mesh(frames.cockpit,mats.glass);g.add(body,glass);g.userData.body=body;}
  else{const body=new THREE.Mesh(frames.heli,mats.heli),glass=new THREE.Mesh(frames.heliGlass,mats.glass),rotor=new THREE.Mesh(frames.rotor,mats.dark),tail=new THREE.Mesh(frames.tailRotor,mats.dark);rotor.position.y=1.72;tail.position.set(.38,.95,-5.7);g.add(body,glass,rotor,tail);g.userData.body=body;g.userData.rotor=rotor;g.userData.tail=tail;}
  for(const c of g.children)c.frustumCulled=false;group.add(g);return g;}
 const pool=new Map(),puffs=[],dummy=new THREE.Object3D(),a=new THREE.Vector3(),b=new THREE.Vector3(),look=new THREE.Vector3();let lastTime=-1,puffClock=0;
 const world=(x,z,h)=>navalWorldPoint(x,z,balance,h*NAVAL_AIR_LIFT);
 const velocity=e=>({x:(e.vz||0)*r.enemySpacing/balance.combat.laneSpacing,z:-(e.vx||0)*r.worldScale});
 return {
  update(){
   const time=model.time||0,dt=lastTime<0?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;const live=new Set();
   for(const e of model.air||[]){live.add(e.id);let g=pool.get(e.id);if(!g){g=build(e.kind);pool.set(e.id,g);}
    const p=world(e.x,e.z,Math.max(0,e.h)),v=velocity(e);g.position.set(p.x,p.y,p.z);look.set(p.x+v.x,p.y,p.z+v.z);if(Math.hypot(v.x,v.z)>1e-4)g.lookAt(look);
    if(e.state==='down'){g.rotateX(-Math.min(1.1,(time-(e.downAt??time))*.9));g.rotateZ(e.roll||0);}
    else g.rotateZ(e.kind==='plane'?Math.sin(time*1.6+e.id)*.32:Math.sin(time*1.3+e.id)*.06);
    if(g.userData.rotor){g.userData.rotor.rotation.y=time*(e.state==='down'?9:38);g.userData.tail.rotation.x=time*44;}
    g.userData.body.material=e.hit>0?mats.hit:mats[e.kind];g.visible=true;
    // Smoke: a puff every 80 ms while falling, and thin smoke once below half health.
    if(e.state==='down'||e.hp<e.maxHp*.5){puffClock+=dt;if(puffClock>=.08||e.state==='down'&&e.hit>.25){puffClock=0;puffs.push({x:p.x,y:p.y+.3,z:p.z,t:time,big:e.state==='down'});if(puffs.length>24)puffs.shift();}}
   }
   for(const [id,g] of pool)if(!live.has(id)){group.remove(g);pool.delete(id);}
   let n=0;for(const puff of puffs){const age=time-puff.t;if(age>1.6)continue;dummy.position.set(puff.x,puff.y+age*.9,puff.z);dummy.scale.setScalar((puff.big?.45:.25)+age*.6);dummy.rotation.set(0,0,0);dummy.updateMatrix();smoke.setMatrixAt(n++,dummy.matrix);}
   smoke.count=n;smoke.instanceMatrix.needsUpdate=true;while(puffs.length&&time-puffs[0].t>1.6)puffs.shift();
   const vulcan=model.vulcan,list=vulcan?.tracers||[],player=model.playerShip,mount=navalWorldPoint(player.x,player.z,balance,(r.effects?.muzzleY??1.95)*(r.playerScale||1)+.4);
   let t=0,s=0;for(const tr of list){const to=world(tr.toX,tr.toZ,tr.h);a.set(mount.x,mount.y,mount.z);b.set(to.x,to.y,to.z);const len=a.distanceTo(b);if(len<.1)continue;
    const u=Math.min(1,(time-tr.t)/.14);dummy.position.copy(a).lerp(b,.15+u*.6);dummy.lookAt(b);dummy.scale.set(1,1,Math.max(1,len*.32));dummy.updateMatrix();tracers.setMatrixAt(t++,dummy.matrix);
    if(tr.hit&&u>.5){dummy.position.copy(b);dummy.scale.setScalar(.22+(1-u)*.3);dummy.rotation.set(0,0,0);dummy.updateMatrix();sparks.setMatrixAt(s++,dummy.matrix);}}
   tracers.count=t;sparks.count=s;tracers.instanceMatrix.needsUpdate=true;sparks.instanceMatrix.needsUpdate=true;
   flash.visible=Boolean(vulcan?.firing);if(flash.visible){flash.position.set(mount.x,mount.y,mount.z);flash.scale.setScalar(.8+Math.abs(Math.sin(time*57))*.7);}
  },
  metrics(){return {aircraft:pool.size,tracers:tracers.count,sparks:sparks.count,smoke:smoke.count,flash:flash.visible};},
  dispose(){scene.remove(group);for(const g of geos)g.dispose();for(const m of Object.values(mats))m.dispose();tracers.dispose();sparks.dispose();smoke.dispose();pool.clear();}
 };
}
