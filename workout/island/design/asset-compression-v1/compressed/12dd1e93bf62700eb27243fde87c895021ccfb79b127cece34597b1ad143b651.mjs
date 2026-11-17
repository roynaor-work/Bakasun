import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** Static road pieces retain their original baked vertex colors and geometry.
 * The original groups remain the picking targets; the renderer sees one batch.
 * Textured, animated or custom material roads keep their individual rendering. */
export class IslandRoadBatch{
  constructor(scene){this.scene=scene;this.hidden=[];this.disposed=false;this.signature=null;}
  rebuild(entries,isRoad,force=false){
    if(this.disposed)return;
    const roads=entries.filter(item=>isRoad(item.typeId));
    const signature=roads.map(item=>[item.group.uuid,item.level,...item.group.position.toArray(),item.group.rotation.y].join(':')).join('|');
    if(!force&&this.signature===signature)return;this.clear();this.signature=signature;
    const geometries=[];let sourceMaterial=null;
    for(const item of roads){
      const meshes=[];let compatible=true;item.group.updateMatrixWorld(true);
      item.group.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.isSkinnedMesh||mesh.isInstancedMesh||Array.isArray(mesh.material)||mesh.material.constructor!==T.MeshStandardMaterial||mesh.material.onBeforeCompile!==T.Material.prototype.onBeforeCompile||!mesh.material.vertexColors||Object.values(mesh.material).some(value=>value?.isTexture)||!mesh.geometry.attributes.color||!mesh.geometry.attributes.normal){compatible=false;return;}meshes.push(mesh);});
      const reference=sourceMaterial||meshes[0]?.material;
      if(meshes.some(mesh=>mesh.material!==reference))compatible=false;
      if(!compatible||!meshes.length)continue;
      for(const mesh of meshes){
        const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);
        // Baked road pieces have exactly these attributes. Other formats are
        // excluded above, keeping all original texture details intact.
        for(const key of Object.keys(geometry.attributes))if(!['position','normal','color'].includes(key))geometry.deleteAttribute(key);
        geometries.push(geometry);sourceMaterial??=mesh.material;
      }
      item.group.visible=false;this.hidden.push(item.group);
    }
    if(!geometries.length)return;
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(!geometry){for(const group of this.hidden)group.visible=true;this.hidden=[];return;}
    const material=sourceMaterial.clone();this.mesh=new T.Mesh(geometry,material);this.mesh.name='island static road batch';this.mesh.castShadow=this.mesh.receiveShadow=true;this.scene.add(this.mesh);
  }
  clear(){for(const group of this.hidden)group.visible=true;this.hidden=[];if(this.mesh){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh=null;}}
  metrics(){return {pieces:this.hidden.length,draws:this.mesh?1:0};}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;}
}
