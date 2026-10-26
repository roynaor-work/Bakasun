import * as T from '../vendor/three.module.js';
import {LocalModels} from './local-models.mjs?v=island-alpine-20261026-1';

const PALM='assets/models/palm-tree-512.glb';
/** Preserve the supplied Meshy geometry, maps and material. All palms share a draw. */
export class IslandFlora{
  constructor(parent){this.parent=parent;this.models=new LocalModels();this.instances=[];this.placements=[];this.disposed=false;this.ready=this.models.load(PALM).then(ok=>{if(ok&&!this.disposed)this.rebuild(this.placements);return ok;});}
  rebuild(placements){
    this.placements=placements;for(const mesh of this.instances){mesh.removeFromParent();mesh.dispose();}this.instances=[];
    if(this.disposed||!placements.length)return;
    const fitted=this.models.create(PALM,{height:3.8});if(!fitted)return;fitted.updateMatrixWorld(true);
    const dummy=new T.Object3D(),matrix=new T.Matrix4();
    fitted.traverse(source=>{
      if(!source.isMesh)return;const mesh=new T.InstancedMesh(source.geometry,source.material,placements.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Meshy coastal palms';
      for(let i=0;i<placements.length;i++){const p=placements[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle||0,0);dummy.scale.setScalar(p.scale||1);dummy.updateMatrix();matrix.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,matrix);}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.instances.push(mesh);this.parent.add(mesh);
    });
  }
  metrics(){return {palms:this.instances.length?this.placements.length:0,draws:this.instances.length,...this.models.metrics()};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const mesh of this.instances){mesh.removeFromParent();mesh.dispose();}this.instances=[];this.models.dispose();}
}
