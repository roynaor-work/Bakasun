// Measure every final decoded numeral against the animated jersey triangles.
// This is a geometric fitting check, not just a comparison of joint names.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {root,io,json,writeJSON,sha} from './common.mjs';
const kits=await json('kits.json'),bodyBytes=await fs.readFile(path.join(root,kits.kits[0].file));
const numberBytes=await fs.readFile(path.join(root,kits.numberLibrary.file));
const doc=await io.readBinary(bodyBytes),library=await io.readBinary(numberBytes);
const body=doc.getRoot().listNodes().find(n=>n.getMesh()?.getExtras().role==='canonical-footballer');
const p=body.getMesh().listPrimitives()[0],skin=body.getSkin(),bones=skin.listJoints();
const inverse=Array.from({length:18},(_,i)=>new T.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
const bind=bones.map(n=>({n,t:n.getTranslation().slice(),r:n.getRotation().slice(),s:n.getScale().slice()}));
const run=doc.getRoot().listAnimations()[0],channels=run.listChannels();
const duration=Math.max(...channels.map(c=>c.getSampler().getInput().getArray().at(-1)));
function pose(time){
  for(const b of bind)b.n.setTranslation(b.t).setRotation(b.r).setScale(b.s);
  for(const c of channels){
    const sampler=c.getSampler(),times=sampler.getInput().getArray(),out=sampler.getOutput();
    assert.equal(sampler.getInterpolation(),'LINEAR');
    let hi=0;while(hi<times.length-1&&times[hi]<time)hi++;
    const lo=Math.max(0,hi-1),t=times[hi]===times[lo]?0:(time-times[lo])/(times[hi]-times[lo]);
    const a=out.getElement(lo,[]),b=out.getElement(hi,[]),node=c.getTargetNode();
    if(c.getTargetPath()==='rotation')node.setRotation(new T.Quaternion().fromArray(a).slerp(new T.Quaternion().fromArray(b),t).normalize().toArray());
    else if(c.getTargetPath()==='translation')node.setTranslation(a.map((v,i)=>v*(1-t)+b[i]*t));
    else throw Error('Unexpected animation target property.');
  }
  return bones.map((b,i)=>new T.Matrix4().fromArray(b.getWorldMatrix()).multiply(inverse[i]));
}
function skinned(primitive,i,matrices){
  const pos=new T.Vector3().fromArray(primitive.getAttribute('POSITION').getElement(i,[]));
  const joints=primitive.getAttribute('JOINTS_0').getElement(i,[]),weights=primitive.getAttribute('WEIGHTS_0').getElement(i,[]);
  const result=new T.Vector3();
  for(let j=0;j<4;j++)if(weights[j])result.addScaledVector(pos.clone().applyMatrix4(matrices[joints[j]]),weights[j]);
  return result;
}
const backFaces=[],indices=p.getIndices().getArray();
for(let first=0;first<indices.length;first+=3){
  const ids=Array.from(indices.slice(first,first+3)),points=ids.map(i=>p.getAttribute('POSITION').getElement(i,[]));
  if(points.every(q=>q[1]>.72&&q[1]<1.04&&Math.abs(q[0])<.2&&q[2]<.01))backFaces.push(ids);
}
assert.ok(backFaces.length>30,'Expected a real back-garment surface.');
const meshes=library.getRoot().listNodes().filter(n=>n.getMesh());
const report={schemaVersion:1,passed:false,method:'CPU linear-blend skinning of final decoded COLOR_0 GLBs; closest point on animated back-garment triangles.',
  limitMeters:.008,authoredOffsetMeters:.0018,samples:[],
  inputs:[{file:kits.kits[0].file,sha256:sha(bodyBytes)},{file:kits.numberLibrary.file,sha256:sha(numberBytes)}]};
let globalMax=0;
for(const fraction of[0,.13,.29,.51,.77,.93]){
  const time=fraction*duration,matrices=pose(time);
  const posed=Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>skinned(p,i,matrices));
  const triangles=backFaces.map(face=>new T.Triangle(...face.map(i=>posed[i])));
  const closest=new T.Vector3();
  for(const node of meshes){
    const number=node.getExtras().number,primitive=node.getMesh().listPrimitives()[0];let max=0,sum=0;
    for(let i=0;i<primitive.getAttribute('POSITION').getCount();i++){
      const point=skinned(primitive,i,matrices);let distance=Infinity;
      for(const triangle of triangles)distance=Math.min(distance,triangle.closestPointToPoint(point,closest).distanceTo(point));
      max=Math.max(max,distance);sum+=distance;
    }
    assert.ok(max<=report.limitMeters,`Number ${number} at ${time}: garment distance ${max}`);
    globalMax=Math.max(globalMax,max);
    report.samples.push({number,timeSeconds:time,maximumDistanceMeters:max,meanDistanceMeters:sum/primitive.getAttribute('POSITION').getCount()});
  }
}
report.maximumDistanceMeters=globalMax;report.passed=true;
await writeJSON('verification/number-fit.json',report);
console.log(JSON.stringify({passed:true,samples:report.samples.length,maximumDistanceMeters:globalMax,limitMeters:report.limitMeters}));
