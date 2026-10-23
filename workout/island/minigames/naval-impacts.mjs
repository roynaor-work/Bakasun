import * as T from '../vendor/three.module.js';

/** One actual impact feeds foam, spray and sparks. Bounded buffers, no timers. */
export function createNavalImpacts(scene,model,config,balance){
  const foamG=new T.RingGeometry(.8,1,48),foamM=new T.MeshBasicMaterial({color:'#d7fff2',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}),foam=new T.Mesh(foamG,foamM);foam.rotation.x=-Math.PI/2;scene.add(foam);
  const dropG=new T.SphereGeometry(.1,5,4),dropM=new T.MeshBasicMaterial({transparent:true,opacity:1,depthWrite:false}),drops=new T.InstancedMesh(dropG,dropM,32);drops.frustumCulled=false;drops.count=0;scene.add(drops);
  const glowG=new T.SphereGeometry(.5,10,6),glowM=new T.MeshBasicMaterial({color:'#ffbf62',transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}),glow=new T.Mesh(glowG,glowM);scene.add(glow);
  const dummy=new T.Object3D(),color=new T.Color();let disposed=false;
  return {update(){if(disposed)return;const blast=model.blast,r=balance.render,alive=blast.life>0,t=Math.min(1,Math.max(0,1-blast.life/config.visuals.blastSeconds)),x=blast.z*r.enemySpacing/balance.combat.laneSpacing,z=-(blast.x-balance.shipX)*r.worldScale;
    foam.visible=alive;foam.position.set(x,.035,z);foam.scale.setScalar(.7+t*5);foamM.opacity=(1-t)*.7;
    glow.visible=alive&&blast.hit&&t<.4;glow.position.set(x,1.1,z);glow.scale.setScalar(.7+Math.sin(Math.min(1,t/.4)*Math.PI)*1.3);glowM.opacity=Math.max(0,1-t/.4);
    drops.count=alive?32:0;dropM.opacity=1-t;
    for(let i=0;i<drops.count;i++){const a=i*2.399963,speed=1.2+(i%7)*.28,radius=t*speed*2.4,height=Math.max(.03,Math.sin(t*Math.PI)*(blast.hit?1.8:3.6)*(1-i%3*.18));dummy.position.set(x+Math.cos(a)*radius,height+(blast.hit?.7:0),z+Math.sin(a)*radius);dummy.rotation.set(t*4,a,0);dummy.scale.set(.65,2.5*(1-t)+.4,.65);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);color.set(blast.hit&&i%3===0?'#ffc36a':'#b6f5ef');drops.setColorAt(i,color);}drops.instanceMatrix.needsUpdate=true;if(drops.instanceColor)drops.instanceColor.needsUpdate=true;
  },metrics(){return {particles:drops.count,capacity:32,disposed};},dispose(){if(disposed)return;disposed=true;for(const object of [foam,drops,glow])scene.remove(object);drops.dispose();for(const resource of [foamG,foamM,dropG,dropM,glowG,glowM])resource.dispose();}};
}
