import * as T from '../vendor/three.module.js';
import {LocalModels} from './local-models.mjs?v=island-hoops-r3-20261029-1';

const PALM='assets/models/palm-tree-512.glb';
/** Preserve the supplied Meshy geometry, maps and material. All palms share a draw. */
export class IslandFlora{
  constructor(parent){this.parent=parent;this.models=new LocalModels();this.instances=[];this.placements=[];this.disposed=false;this.ready=this.models.load(PALM).then(ok=>{if(ok&&!this.disposed)this.rebuild(this.placements);return ok;});}
  // A single soft contact batch keeps the original trees rooted when the
  // adaptive phone renderer turns off the expensive directional shadow map.
  rebuildContacts(placements){
    this.contacts?.removeFromParent();this.contacts?.dispose();this.contacts=null;
    if(!placements.length)return;
    if(!this.contactMaterial){
      const n=64,bytes=new Uint8Array(n*n*4);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const r=Math.hypot((x+.5)/n*2-1,(y+.5)/n*2-1),i=(y*n+x)*4;
        bytes[i]=24;bytes[i+1]=42;bytes[i+2]=32;bytes[i+3]=Math.round(Math.max(0,1-r)**2*98);
      }
      const map=new T.DataTexture(bytes,n,n);map.needsUpdate=true;
      this.contactGeometry=new T.PlaneGeometry(1,1);
      this.contactMaterial=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
    }
    const mesh=new T.InstancedMesh(this.contactGeometry,this.contactMaterial,placements.length),dummy=new T.Object3D();
    mesh.name='Palm ambient contacts';
    for(const [i,p]of placements.entries()){
      const scale=p.scale||1;
      dummy.position.set(p.x,p.y+.035,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(2.3*scale,1.8*scale,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.contacts=mesh;this.parent.add(mesh);
  }
  rebuild(placements){
    this.placements=placements;for(const mesh of this.instances){mesh.removeFromParent();mesh.dispose();}this.instances=[];
    this.rebuildContacts([]);
    if(this.disposed||!placements.length)return;
    const fitted=this.models.create(PALM,{height:3.8});if(!fitted)return;fitted.updateMatrixWorld(true);this.rebuildContacts(placements);
    const dummy=new T.Object3D(),matrix=new T.Matrix4();
    fitted.traverse(source=>{
      if(!source.isMesh)return;const mesh=new T.InstancedMesh(source.geometry,source.material,placements.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Meshy coastal palms';
      for(let i=0;i<placements.length;i++){const p=placements[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle||0,0);dummy.scale.setScalar(p.scale||1);dummy.updateMatrix();matrix.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,matrix);}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.instances.push(mesh);this.parent.add(mesh);
    });
  }
  metrics(){return {palms:this.instances.length?this.placements.length:0,draws:this.instances.length+(this.contacts?1:0),...this.models.metrics()};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const mesh of this.instances){mesh.removeFromParent();mesh.dispose();}this.instances=[];this.rebuildContacts([]);this.contactGeometry?.dispose();this.contactMaterial?.map.dispose();this.contactMaterial?.dispose();this.models.dispose();}
}
