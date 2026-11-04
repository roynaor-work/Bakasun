import * as T from './vendor/three.module.js';

/** Reusable, bounded VFX. One burst, two lasers, 32 embers; no frame allocations.
 * Coordinates are world metres (+Y up). Shared atlas ownership stays with caller.
 * Call update(dt,camera), then render. One instance can be reused indefinitely.
 */
export class DefenseEffects {
  constructor(scene,atlas=null){
    this.root=new T.Group();this.root.name='DefenseVFX';scene.add(this.root);
    this.age=99;this.duration=1.1;this.scale=1;this.emissions=0;
    this.dummy=new T.Object3D();this.from=new T.Vector3();this.to=new T.Vector3();this.direction=new T.Vector3();this.up=new T.Vector3(0,1,0);
    this.materials=[];this.geometries=[];
    const material=(color,extra={})=>{const m=new T.MeshBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false,...extra});this.materials.push(m);return m;};
    const mesh=(g,m)=>{this.geometries.push(g);const o=new T.Mesh(g,m);this.root.add(o);return o;};
    this.ringMaterial=material('#E6BF68',{side:T.DoubleSide,blending:T.AdditiveBlending,opacity:0});
    this.ring=mesh(new T.RingGeometry(.955,1,56),this.ringMaterial);this.ring.rotation.x=-Math.PI/2;
    this.secondary=mesh(new T.RingGeometry(.975,1,48),material('#F8E9C6',{side:T.DoubleSide,opacity:0}));this.secondary.rotation.x=-Math.PI/2;
    this.core=mesh(new T.SphereGeometry(1,12,8),material('#FFF3D6',{opacity:0}));
    const emberGeo=new T.SphereGeometry(1,6,4);this.geometries.push(emberGeo);
    this.embers=new T.InstancedMesh(emberGeo,material('#EAA276'),32);this.embers.instanceMatrix.setUsage(T.DynamicDrawUsage);this.embers.frustumCulled=false;this.root.add(this.embers);
    this.laserMaterial=material('#B4F8DD',{blending:T.AdditiveBlending,opacity:0});
    this.lasers=[0,1].map(()=>mesh(new T.CylinderGeometry(.018,.018,1,6),this.laserMaterial));
    this.atlas=atlas?.clone();
    if(this.atlas){this.atlas.repeat.set(.25,.25);this.atlas.generateMipmaps=false;this.atlas.minFilter=T.LinearFilter;this.atlas.magFilter=T.LinearFilter;
      this.spriteMaterial=new T.SpriteMaterial({map:this.atlas,transparent:true,depthWrite:false,toneMapped:false,opacity:0});this.materials.push(this.spriteMaterial);
      this.sprite=new T.Sprite(this.spriteMaterial);this.root.add(this.sprite);
    }
    this.root.visible=false;
  }
  burst({position=[0,0,0],scale=1,normal=[0,1,0]}={}){
    this.root.position.fromArray(position);this.root.scale.setScalar(scale);this.scale=scale;this.age=0;this.emissions++;
    this.ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),this.direction.fromArray(normal).normalize());this.secondary.quaternion.copy(this.ring.quaternion);
    return this;
  }
  aimLaser(index,from,to){
    const m=this.lasers[index];if(!m)return this;this.from.fromArray(from);this.to.fromArray(to);
    m.position.copy(this.from).add(this.to).multiplyScalar(.5);
    this.direction.copy(this.to).sub(this.from);m.scale.y=this.direction.length();m.quaternion.setFromUnitVectors(this.up,this.direction.normalize());
    return this;
  }
  setAge(seconds){this.age=seconds;return this;}
  update(dt,camera){
    this.age+=Math.max(0,dt);const u=this.age/this.duration;this.root.visible=u>=0&&u<1;
    if(!this.root.visible)return;
    this.ring.scale.setScalar(.10+u*3.4);this.ringMaterial.opacity=(1-u)**1.4*.8;
    this.secondary.scale.setScalar(.1+u*2.65);this.secondary.material.opacity=(1-u)**2*.45;
    this.core.scale.setScalar(Math.max(.001,.08+Math.sin(Math.min(1,u*3.6)*Math.PI)*.36));this.core.material.opacity=Math.max(0,1-u*4.2);
    this.laserMaterial.opacity=Math.max(0,1-u*5.5);
    for(let i=0;i<32;i++){
      const a=i*2.399963,r=this.age*(1.2+(i%5)*.19);
      this.dummy.position.set(Math.sin(a)*r,.15+Math.cos(i*1.7)*r*.7-this.age*this.age*.5,Math.cos(a)*r);
      this.dummy.scale.setScalar(Math.max(.001,(1-u)*(.022+i%3*.009)));this.dummy.updateMatrix();this.embers.setMatrixAt(i,this.dummy.matrix);
    }
    this.embers.instanceMatrix.needsUpdate=true;
    if(this.sprite){
      const frame=Math.min(15,Math.floor(u*16));this.atlas.offset.set((frame%4)/4,1-(Math.floor(frame/4)+1)/4);
      this.sprite.scale.setScalar(.35+u*2.3);this.sprite.position.y=.12;this.spriteMaterial.opacity=(1-u)*.9;
    }
  }
  reset(){this.age=99;this.root.visible=false;}
  snapshot(){return {active:this.root.visible,age:this.age,duration:this.duration,embers:32,laserPool:2,burstPool:1,emissions:this.emissions};}
  dispose(){this.root.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.atlas?.dispose();}
}
