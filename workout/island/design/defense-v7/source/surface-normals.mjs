import {T,acc} from './mesh.mjs';

/** Repair isolated smoothing inversions on inherited guards and simplified LODs.
 * Triangle winding remains unchanged. Original generated tubes are corrected
 * in their generator instead; this does not conceal their topology error.
 * All skin/atlas attributes are copied per corner before welding again.
 */
export function repairSurfaceNormals(doc){
 let repaired=0;
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const p=primitive.getAttribute('POSITION'),n=primitive.getAttribute('NORMAL'),index=primitive.getIndices();
  const data=new Map(primitive.listSemantics().map(s=>[s,[]]));let changes=0;
  const count=index?.getCount()||p.getCount();
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(k=>index?index.getScalar(i+k):i+k),v=ids.map(j=>new T.Vector3().fromArray(p.getElement(j,[])));
   const face=new T.Vector3().crossVectors(v[1].clone().sub(v[0]),v[2].clone().sub(v[0]));
   const mean=ids.reduce((sum,j)=>sum.add(new T.Vector3().fromArray(n.getElement(j,[]))),new T.Vector3()).normalize();
   const fix=face.lengthSq()>1e-16&&face.normalize().dot(mean)<-.15;
   if(fix)changes++;
   for(const id of ids)for(const [semantic,values]of data)values.push(...(fix&&semantic==='NORMAL'?face.toArray():primitive.getAttribute(semantic).getElement(id,[])));
  }
  if(!changes)continue;repaired+=changes;
  for(const [semantic,values]of data){const old=primitive.getAttribute(semantic),Type=old.getNormalized()?Float32Array:old.getArray().constructor;primitive.setAttribute(semantic,acc(doc,semantic,old.getType(),new Type(values)));}
  primitive.setIndices(acc(doc,'Surface corner indices','SCALAR',new Uint32Array(Array.from({length:count},(_,i)=>i))));
 }
 return repaired;
}
