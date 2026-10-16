import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {localModelURL} from './model-art.mjs?v=g3e-20261017-1';

/** Normalize the local Meshy model without changing its GLB. Meshy's single
 * textured mesh is partitioned once at the roof into body and rotating cannon;
 * authored separate cannon nodes use the same world-space partition. */
export function createTruckVisual(object,balance) {
  const v=balance.vehicle,root=new T.Group(),turret=new T.Group(),geometries=new Set(),materials=new Set(),textures=new Set();root.add(turret);
  object.rotation.y=T.MathUtils.degToRad(v.rotationY);object.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=v.length/Math.max(size.x,size.z,.001);
  const matrix=new T.Matrix4().makeScale(scale,scale,scale),offset=new T.Matrix4().makeTranslation(-center.x*scale,-bounds.min.y*scale,-center.z*scale);matrix.premultiply(offset);
  const height=size.y*scale,cut=height*v.cannonHeightRatio,pivot=new T.Vector3(...v.cannonPivot);pivot.y=cut;turret.position.copy(pivot);
  let cannonFaces=0,disposed=false;
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry.clone();g.applyMatrix4(mesh.matrixWorld);g.applyMatrix4(matrix);const positions=g.attributes.position,source=g.index?.array,body=[],cannon=[];
    for(let i=0;i<(source?.length||positions.count);i+=3){const a=source?source[i]:i,b=source?source[i+1]:i+1,c=source?source[i+2]:i+2,above=Math.min(positions.getY(a),positions.getY(b),positions.getY(c))>cut&&Math.max(Math.abs(positions.getX(a)-pivot.x),Math.abs(positions.getX(b)-pivot.x),Math.abs(positions.getX(c)-pivot.x))<v.cannonHalfWidth;(above?cannon:body).push(a,b,c);}
    for(const [indices,parent]of [[body,root],[cannon,turret]])if(indices.length){let piece=g.clone();piece.setIndex(indices);const compact=piece.toNonIndexed();piece.dispose();piece=compact;if(parent===turret){piece.translate(-pivot.x,-pivot.y,-pivot.z);cannonFaces+=indices.length/3;}piece.computeBoundingBox();geometries.add(piece);parent.add(new T.Mesh(piece,mesh.material));}
    g.dispose();mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}
  });
  // Marker follows the articulated cannon, rather than the old firefighter hose.
  const muzzle=new T.Object3D();muzzle.position.fromArray(v.muzzleOffset);turret.add(muzzle);
  return {root,turret,muzzle,cannonFaces,height,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();root.clear();}};
}
export async function loadFireTruck(balance,adapters={}){
  const url=localModelURL(balance.vehicle.model);if(!url)return null;
  const root=new URL('../',import.meta.url),manager=new T.LoadingManager();manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local truck resources only');return url.href;});
  const loader=adapters.loader||new GLTFLoader(manager);const gltf=await loader.loadAsync(url.href);return createTruckVisual(gltf.scene,balance);
}
