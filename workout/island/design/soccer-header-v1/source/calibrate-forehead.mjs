// SPDX-License-Identifier: CC0-1.0
// Locate an actual skin-surface landmark above the eyes, fully bound to Head.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Triangle,Vector3,Matrix4} from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {unpack,readAccessor} from './glb.mjs';
const base=new URL('../',import.meta.url),file='runtime/reference/idle_relaxed.glb';
const bytes=await fs.readFile(new URL(file,base)),g=unpack(bytes),d=g.document;
const head=d.nodes.findIndex(n=>n.name==='Head'),skin=d.skins[0],joint=skin.joints.indexOf(head);
const primitive=d.meshes[0].primitives.find(p=>d.materials[p.material].name==='Skin');
const positions=readAccessor(g,primitive.attributes.POSITION).values,indices=readAccessor(g,primitive.indices).values;
const joints=readAccessor(g,primitive.attributes.JOINTS_0).values,weights=readAccessor(g,primitive.attributes.WEIGHTS_0).values;
const inverseBind=readAccessor(g,skin.inverseBindMatrices).values.slice(joint*16,joint*16+16);
// Authored anatomical landmark: centered forehead, above eye/cornea geometry
// around Y=1.60m in the reference mesh, below the hairline. Snap to skin.
const target=new Vector3(0,1.65,.115),probe=new Vector3();let best;
for(let i=0;i<indices.length;i+=3){
  const ids=indices.slice(i,i+3),vertices=ids.map(k=>new Vector3(...positions.slice(k*3,k*3+3)));
  if(vertices.some(v=>v.y<1.60||v.y>1.70))continue;
  const headWeights=ids.map(k=>joints.slice(k*4,k*4+4).reduce((s,j,c)=>s+(j===joint?weights[k*4+c]:0),0));
  if(headWeights.some(w=>Math.abs(w-1)>1e-6))continue;
  const triangle=new Triangle(...vertices);triangle.closestPointToPoint(target,probe);
  const distance=probe.distanceTo(target);
  if(!best||distance<best.snapDistanceMeters){
    best={triangle:i/3,vertexIndices:ids,vertexHeadWeights:headWeights,bindPointMeters:probe.toArray(),
      localPointMeters:probe.clone().applyMatrix4(new Matrix4().fromArray(inverseBind)).toArray(),
      barycentric:triangle.getBarycoord(probe,new Vector3()).toArray(),snapDistanceMeters:distance};
  }
}
if(!best||best.snapDistanceMeters>.01)throw new Error('Unable to calibrate the actual forehead surface.');
const evidence={source:file,sourceSha256:createHash('sha256').update(bytes).digest('hex'),
  method:'Closest point on the actual uncompressed Skin triangle to the authored forehead landmark, above eye geometry; all three vertices have Head weight 1. Head-local point uses the actual inverse bind matrix.',
  targetBindMeters:target.toArray(),bone:'Head',...best};
await fs.writeFile(new URL('verification/contact-surface.json',base),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
