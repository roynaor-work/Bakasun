import * as T from '../vendor/three.module.js';

/** An actual hit feeds a compact hot core, spray crown and broken concentric foam.
 * All three batches are fixed; the flash dies before it can hide the vessel. */
export function createNavalImpacts(scene,model,config,balance){
  const foamG=new T.RingGeometry(.44,1,64),foamM=new T.MeshBasicMaterial({color:'#e7fff4',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),foam=new T.Mesh(foamG,foamM);
  const phase={value:0};
  foamM.onBeforeCompile=shader=>{
    shader.uniforms.impactPhase=phase;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 impactUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nimpactUv=uv*2.0-1.0;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float impactPhase; varying vec2 impactUv;').replace('#include <color_fragment>',`#include <color_fragment>
      float radius=length(impactUv),angle=atan(impactUv.y,impactUv.x);
      float ridge=exp(-pow((radius-.92)*28.0,2.0))*.7+exp(-pow((radius-.59)*22.0,2.0))*.35;
      float broken=.5+.5*sin(angle*27.0+sin(angle*11.0)*1.4+radius*47.0-impactPhase*6.0);
      diffuseColor.a*=ridge*(.24+.76*broken);`);
  };
  foamM.customProgramCacheKey=()=> 'ultra-naval-impact-rings-1';foam.rotation.x=-Math.PI/2;scene.add(foam);
  const dropG=new T.ConeGeometry(.12,.7,4),dropM=new T.MeshBasicMaterial({transparent:true,opacity:1,depthWrite:false,toneMapped:false}),drops=new T.InstancedMesh(dropG,dropM,32);
  drops.frustumCulled=false;drops.count=0;drops.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(drops);
  // A small elongated diamond, rather than an expanding opaque fireball.
  const glowG=new T.OctahedronGeometry(.48,0),glowM=new T.MeshBasicMaterial({color:'#ffe6aa',transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,toneMapped:false}),glow=new T.Mesh(glowG,glowM);glow.renderOrder=6;scene.add(glow);
  // A real hit leaves a local grey smoke plume (#58636A) that outlives the flash (about 1 s).
  const smokeMap=typeof document==='undefined'?null:(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,2,32,32,31);r.addColorStop(0,'rgba(255,255,255,.9)');r.addColorStop(.6,'rgba(255,255,255,.45)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);})();
  const puffG=new T.PlaneGeometry(1,1),puffM=new T.MeshBasicMaterial({map:smokeMap,color:balance.aimLook?.hit?.smoke||'#58636A',transparent:true,depthWrite:false,toneMapped:false}),puffs=new T.InstancedMesh(puffG,puffM,8);puffs.count=0;puffs.frustumCulled=false;puffs.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(puffs);
  let plume=null,lastKey='';
  const dummy=new T.Object3D(),color=new T.Color();let disposed=false;
  return {
    update(camera){
      if(disposed)return;const blast=model.blast,r=balance.render,alive=blast.life>0,t=Math.min(1,Math.max(0,1-blast.life/config.visuals.blastSeconds)),x=blast.z*r.enemySpacing/balance.combat.laneSpacing,z=-(blast.x-balance.shipX)*r.worldScale;
      phase.value=t;foam.visible=alive;foam.position.set(x,.055,z);foam.rotation.z=t*.16;foam.scale.setScalar(.65+Math.sqrt(t)*4.2);foamM.opacity=Math.pow(1-t,1.2)*.82;
      // Offset just the small contact flash toward the visible hull face. The
      // opaque Meshy hull must not bury it; waves retain the actual impact point.
      const facingX=camera?camera.position.x-x:0,facingZ=camera?camera.position.z-z:1,facingLength=Math.hypot(facingX,facingZ)||1;
      // The hit flash and sparks are drawn in screen pixels by the HUD (naval-marks); the 3D core stays off.
      const core=Math.max(0,1-t/.23);glow.visible=false;glow.position.set(x+facingX/facingLength*1.5,1.95,z+facingZ/facingLength*1.5);glow.rotation.set(t*3,.7+t*2,0);glow.scale.set(.7+core*.5,1.2+core*1.9,.7+core*.5);glowM.opacity=core*.9;
      drops.count=alive?32:0;dropM.opacity=Math.pow(1-t,.65);
      for(let i=0;i<drops.count;i++){
        const spark=false,a=i*2.399963,speed=1.5+(i%7)*.24,radial=blast.hit?1.1+Math.sqrt(t)*speed*1.35:t*speed*1.85,rise=Math.sin(t*Math.PI)*(spark?1.6:blast.hit?2:3.1)*(1-i%3*.16),lift=blast.hit?(spark?1.5:1.15):.08;
        dummy.position.set(x+Math.cos(a)*radial,Math.min(3.2,Math.max(.04,rise)+lift),z+Math.sin(a)*radial);
        dummy.rotation.set(Math.sin(a)*(.25+t),a,Math.cos(a)*(.25+t));
        const size=(spark?.55:.8)+(i%3)*.15;dummy.scale.set(size,(spark?.7:1.2)*(1-t)+.25,size);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
        color.set(spark?(i%8===0?'#ffe2a0':'#efb75e'):(i%3===0?'#f0fff8':'#c5ede6'));drops.setColorAt(i,color);
      }
      drops.instanceMatrix.needsUpdate=true;if(drops.instanceColor)drops.instanceColor.needsUpdate=true;
      const key=blast.hit&&alive?blast.x+':'+blast.z:'';if(key&&key!==lastKey)plume={x,z,start:model.time};lastKey=key||lastKey;
      const life=balance.aimLook?.hit?.smokeSeconds??1,age=plume?model.time-plume.start:9;puffs.count=age<life?8:0;
      // Local smoke: grows and fades over about a second and stays smaller than the target hull.
      for(let i=0;i<puffs.count;i++){const u=Math.min(1,age/life),k=(i+1)/8;dummy.position.set(plume.x+Math.sin(i*2.1)*.35*u,1.3+u*(1.1+k*.9),plume.z+Math.cos(i*1.7)*.3*u);if(camera)dummy.quaternion.copy(camera.quaternion);const size=.5+u*(.8+k*.5);dummy.scale.set(size,size,1);dummy.updateMatrix();puffs.setMatrixAt(i,dummy.matrix);}
      puffM.opacity=age<life?Math.min(1,age*8)*(1-age/life)*.8:0;puffs.instanceMatrix.needsUpdate=true;
    },
    metrics(){return {particles:drops.count,capacity:32,smoke:puffs.count,disposed};},
    dispose(){if(disposed)return;disposed=true;scene.remove(foam,drops,glow,puffs);puffs.dispose();puffG.dispose();puffM.dispose();smokeMap?.dispose();drops.dispose();foamG.dispose();foamM.dispose();dropG.dispose();dropM.dispose();glowG.dispose();glowM.dispose();},
  };
}
