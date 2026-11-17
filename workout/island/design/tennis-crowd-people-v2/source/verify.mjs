// Independent checks of the delivered binary files, not the intermediate meshes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/tennis-people-tools/package.json');
const validator=require('gltf-validator');
const T=require('three');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
function parse(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const bin=bytes.subarray(28+jsonLength);
  function accessor(index) {
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const size={5121:1,5123:2,5126:4}[a.componentType];
    const offset=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??width*size;
    const read={5121:'readUInt8',5123:'readUInt16LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>bin[read](offset+i*stride+k*size)));
  }
  return {doc,bin,accessor};
}
assert.equal(manifest.models.length,14);
assert.equal(new Set(manifest.models.map(m=>m.sha256)).size,14);
const reports=[];
for(const item of manifest.models) {
  const bytes=await fs.readFile(path.join(root,item.file));
  assert.equal(sha(bytes),item.sha256);assert.equal(bytes.length,item.bytes);
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:item.file,maxIssues:1000});
  await fs.writeFile(path.join(root,'verification',item.id+'-khronos.json'),JSON.stringify({
    validatorVersion:report.validatorVersion,uri:item.file,sha256:sha(bytes),issues:report.issues},null,2)+'\n');
  assert.equal(report.issues.numErrors,0,`${item.file}: validator errors`);
  assert.equal(report.issues.numWarnings,0,`${item.file}: validator warnings`);
  assert.equal(report.issues.numInfos,0,`${item.file}: validator information`);
  const {doc,bin,accessor}=parse(bytes);
  assert.equal(doc.scene,0);assert.equal(doc.scenes.length,3);assert.equal(doc.meshes.length,3);
  assert.equal(doc.skins.length,3);assert.equal(doc.animations.length,5);
  assert.equal(doc.extensionsRequired,undefined);assert.equal(doc.extensionsUsed,undefined);
  assert.equal(doc.images.length,1);assert.equal(doc.images[0].mimeType,'image/png');
  const imageView=doc.bufferViews[doc.images[0].bufferView],image=bin.subarray(imageView.byteOffset,imageView.byteOffset+imageView.byteLength);
  assert.equal(image.readUInt32BE(16),256);assert.equal(image.readUInt32BE(20),256);
  const lods=[];
  for(let lod=0;lod<3;lod++) {
    const p=doc.meshes[lod].primitives[0];
    const positions=accessor(p.attributes.POSITION),normals=accessor(p.attributes.NORMAL);
    const weights=accessor(p.attributes.WEIGHTS_0),joints=accessor(p.attributes.JOINTS_0);
    assert.equal(positions.length/3,[210,90,24][lod]);
    for(let i=0;i<positions.length;i++) {
      assert(positions[i].every(Number.isFinite));
      assert(Math.abs(Math.hypot(...normals[i])-1)<1e-5);
      assert(Math.abs(weights[i].reduce((a,b)=>a+b,0)-1)<1e-6);
      assert(joints[i].every(j=>j>=0&&j<17));
    }
    let minimumArea=Infinity;
    for(let i=0;i<positions.length;i+=3) {
      const a=new T.Vector3(...positions[i]),b=new T.Vector3(...positions[i+1]),c=new T.Vector3(...positions[i+2]);
      const area=b.sub(a).cross(c.sub(a)).length()/2;
      minimumArea=Math.min(minimumArea,area);assert(area>1e-10,`${item.id} LOD${lod}: degenerate triangle`);
    }
    const roots=doc.scenes[lod].nodes;
    assert.equal(roots.length,2);
    assert.equal(doc.nodes[roots[1]].skin,lod);
    assert.equal(doc.skins[lod].joints.length,17);
    const bounds={min:[0,1,2].map(k=>Math.min(...positions.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...positions.map(p=>p[k])))};
    lods.push({lod,triangles:positions.length/3,minimumTriangleAreaM2:minimumArea,bounds});
  }
  const animations=[];
  for(const animation of doc.animations) {
    assert.equal(animation.channels.length,54);
    let seam=0;
    for(const s of animation.samplers) {
      const times=accessor(s.input).flat(),values=accessor(s.output);
      assert.equal(times[0],0);assert(times.at(-1)>0);
      for(let i=1;i<times.length;i++)assert(times[i]>times[i-1]);
      seam=Math.max(seam,...values[0].map((x,k)=>Math.abs(x-values.at(-1)[k])));
      if(values[0].length===4)for(const q of values)assert(Math.abs(Math.hypot(...q)-1)<1e-5);
    }
    assert(seam<1e-6,`${item.id}/${animation.name}: loop seam ${seam}`);
    const channels=animation.channels.filter(c=>c.target.node<17);
    const firstTime=accessor(animation.samplers[0].input).flat();
    let maxFootDrift=0,minHandDistance=Infinity,headYawSpan=0,hipsMin=Infinity,hipsMax=-Infinity;
    const footHistory=[[],[]],headYaw=[];
    for(let frame=0;frame<firstTime.length;frame++) {
      const local=doc.nodes.slice(0,17).map(node=>new T.Matrix4().compose(new T.Vector3(...node.translation),new T.Quaternion(),new T.Vector3(1,1,1)));
      const translations=doc.nodes.slice(0,17).map(node=>new T.Vector3(...node.translation));
      const rotations=doc.nodes.slice(0,17).map(()=>new T.Quaternion());
      for(const channel of channels) {
        const value=accessor(animation.samplers[channel.sampler].output)[frame];
        if(channel.target.path==='rotation')rotations[channel.target.node].fromArray(value);
        if(channel.target.path==='translation')translations[channel.target.node].fromArray(value);
      }
      const world=[];
      for(let j=0;j<17;j++) {
        local[j].compose(translations[j],rotations[j],new T.Vector3(1,1,1));
        world[j]=manifest.rig.parents[j]>=0?new T.Matrix4().multiplyMatrices(world[manifest.rig.parents[j]],local[j]):local[j];
      }
      const position=j=>new T.Vector3().setFromMatrixPosition(world[j]);
      [13,16].forEach((j,i)=>footHistory[i].push(position(j)));
      minHandDistance=Math.min(minHandDistance,position(7).distanceTo(position(10)));
      hipsMin=Math.min(hipsMin,position(0).y);hipsMax=Math.max(hipsMax,position(0).y);
      headYaw.push(new T.Euler().setFromRotationMatrix(world[4],'YXZ').y);
    }
    for(const foot of footHistory)for(const p of foot)maxFootDrift=Math.max(maxFootDrift,p.distanceTo(foot[0]));
    headYawSpan=Math.max(...headYaw)-Math.min(...headYaw);
    assert(maxFootDrift<.012,`${item.id}/${animation.name}: foot drift ${maxFootDrift}`);
    if(animation.name==='polite_applause')assert(minHandDistance>.035&&minHandDistance<.065);
    if(animation.name==='track_ball')assert(headYawSpan>.9);
    if(animation.name==='stand_up')assert(hipsMax-hipsMin>.30);
    animations.push({name:animation.name,durationSeconds:firstTime.at(-1),samples:firstTime.length,
      loopSeamMaximum:seam,maximumFootJointDriftMeters:maxFootDrift,
      minimumHandJointSeparationMeters:minHandDistance,headYawSpanRadians:headYawSpan,
      hipsVerticalTravelMeters:hipsMax-hipsMin});
  }
  reports.push({id:item.id,bytes:bytes.length,sha256:sha(bytes),khronos:{errors:0,warnings:0,infos:0},lods,animations});
  console.log(item.id,'Khronos clean / 210,90,24 / 5 loops / feet stable');
}
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify({
  validatorVersion:validator.version(),models:reports,
  note:'Values decoded independently from the final GLB binary. Foot tests measure joint centers, not physical collision or a motion-capture reference.'},null,2)+'\n');
