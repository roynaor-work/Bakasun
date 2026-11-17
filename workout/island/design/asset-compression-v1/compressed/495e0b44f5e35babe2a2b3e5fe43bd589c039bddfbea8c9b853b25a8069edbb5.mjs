import * as T from '../vendor/three.module.js';

/** Short ground cues identify new buildings without editing the original models. */
export class CityGrowth{
  constructor(scene,ground,{reducedMotion=false}={}){
    this.ground=ground;this.reducedMotion=reducedMotion;this.cues=[];
    this.geometry=new T.RingGeometry(.84,1,40);this.material=new T.MeshBasicMaterial({transparent:true,opacity:.78,side:T.DoubleSide,depthWrite:false,toneMapped:false});
    this.mesh=new T.InstancedMesh(this.geometry,this.material,8);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=3;scene.add(this.mesh);
  }
  highlight(buildings,size,definition){
    for(const row of buildings){const type=definition(row.typeId),[w,d]=type.footprint;this.cues=this.cues.filter(cue=>cue.id!==row.id);this.cues.push({id:row.id,x:row.x+(w-1)/2-(size-1)/2,z:row.z+(d-1)/2-(size-1)/2,radius:Math.hypot(w,d)*.57,age:0});}
    this.cues=this.cues.slice(-8);this.update(0);
  }
  update(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return;
    if(!this.cues.length){this.mesh.count=0;return;}
    this.cues=this.cues.filter(cue=>(cue.age+=seconds)<3);this.mesh.count=this.cues.length;const dummy=new T.Object3D();
    for(const [index,cue]of this.cues.entries()){
      const scale=cue.radius*(this.reducedMotion?1:1+Math.sin(cue.age*Math.PI*2)*.06+cue.age*.1);
      dummy.position.set(cue.x,this.ground+.18,cue.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(scale,scale,1);dummy.updateMatrix();this.mesh.setMatrixAt(index,dummy.matrix);
      this.mesh.setColorAt(index,new T.Color('#f4cb69').lerp(new T.Color('#5da777'),cue.age/3));
    }
    this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  dispose(){this.cues=[];this.mesh.count=0;this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();}
}
