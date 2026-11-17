// Independently audits the delivered bytes, FK, skinning, clearance and budget.
// npm install --prefix /tmp/catch-city-tools --cache /tmp/catch-city-cache gltf-validator@2.0.0-dev.3.10
// node source/validate.mjs --modules /tmp/catch-city-tools
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion,Ray} from '../vendor/three.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--modules');
if(i<0||!process.argv[i+1])throw Error('Pass --modules /absolute/path/to/tooling (gltf-validator).');
const require=createRequire(path.resolve(process.argv[i+1],'package.json'));
const validator=require('gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const skeleton=JSON.parse(await fs.readFile(path.join(root,'skeleton.json'),'utf8'));
const canonicalSource=await fs.readFile(path.join(root,'../motion2/soccer.json'));
assert.deepEqual(skeleton,JSON.parse(canonicalSource).skeleton,'Canonical contract changed');
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(canonicalSource),manifest.canonicalSkeleton.sourceSha256);
const allNames=skeleton.bones.map(b=>b.name),boneIndex=Object.fromEntries(allNames.map((n,i)=>[n,i]));
assert.equal(allNames.length,18);
assert.equal(manifest.assets.length,29);
assert.equal(new Set(manifest.assets.map(a=>a.id)).size,29);
for(const [category,count]of [['building',8],['vehicle',5],['pedestrian',3],['infrastructure',4],['vegetation',3],['prop',4],['ground',2]])
  assert.equal(manifest.assets.filter(a=>a.category===category).length,count,category);
assert.deepEqual((await fs.readdir(path.join(root,'models'))).sort(),manifest.assets.map(a=>a.id+'.glb').sort());

function parse(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const size=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+size));
  const data=bytes.subarray(28+size);
  function acc(index){
    const a=g.accessors[index],v=g.bufferViews[a.bufferView];
    const width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const [size,read]={5126:[4,'readFloatLE'],5123:[2,'readUInt16LE'],5121:[1,'readUInt8']}[a.componentType];
    const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*width,out=[];
    for(let j=0;j<a.count;j++)for(let k=0;k<width;k++)out.push(data[read](offset+j*stride+k*size));
    return out;
  }
  return {g,acc};
}

function boundsOf(pos){return [0,1,2].map(k=>[Math.min(...pos.filter((_,i)=>i%3===k)),Math.max(...pos.filter((_,i)=>i%3===k))]);}
const records=[],documents=new Map();
for(const a of manifest.assets){
  assert(!a.path.includes('..')&&a.path===`models/${a.id}.glb`);
  const bytes=await fs.readFile(path.join(root,a.path));
  assert.equal(bytes.length,a.bytes,a.id+' byte count');assert.equal(hash(bytes),a.sha256,a.id+' hash');
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:a.path,maxIssues:0});
  // Khronos clean means errors, warnings, infos AND hints are all zero here.
  for(const field of ['numErrors','numWarnings','numInfos','numHints'])assert.equal(report.issues[field],0,`${a.id}: ${field}: ${JSON.stringify(report.issues.messages)}`);
  const d=parse(bytes),{g,acc}=d;documents.set(a.id,d);
  assert.equal(g.asset.version,'2.0');assert(!g.extensionsUsed?.length);assert(!g.extensionsRequired?.length);
  assert(!g.images?.length&&!g.textures?.length);assert(g.buffers.every(b=>!b.uri));
  let triangles=0,vertices=0,minArea=Infinity,maxNormalError=0;
  for(const mesh of g.meshes)for(const p of mesh.primitives){
    assert.equal(p.mode,4);const pos=acc(p.attributes.POSITION),norm=acc(p.attributes.NORMAL),color=acc(p.attributes.COLOR_0),indices=acc(p.indices);
    triangles+=indices.length/3;vertices+=pos.length/3;
    assert.equal(norm.length,pos.length);assert.equal(color.length,pos.length);
    assert(pos.every(Number.isFinite)&&norm.every(Number.isFinite));assert(color.every(v=>v>=0&&v<=1));
    assert(indices.every(v=>v>=0&&v<pos.length/3));
    const bounds=boundsOf(pos);
    bounds.forEach(([min,max],k)=>{assert(Math.abs(min-a.boundsMeters[0][k])<2e-5);assert(Math.abs(max-a.boundsMeters[1][k])<2e-5);});
    const v=idx=>new Vector3().fromArray(pos,idx*3);
    for(let t=0;t<indices.length;t+=3){
      const [i,j,k]=indices.slice(t,t+3),ab=v(j).sub(v(i)),ac=v(k).sub(v(i)),cross=ab.cross(ac);
      minArea=Math.min(minArea,cross.length()/2);assert(cross.length()>1e-9,a.id+' degenerate triangle');
      const n=cross.normalize();
      for(const index of [i,j,k]){
        const stored=new Vector3().fromArray(norm,index*3);maxNormalError=Math.max(maxNormalError,Math.abs(stored.length()-1));
        assert(n.dot(stored)>.9999,a.id+' reversed or invalid normal');
      }
    }
  }
  assert.equal(triangles,a.triangles);assert(minArea>0);assert(maxNormalError<1e-5);
  if(a.category==='building')assert(triangles>=50&&triangles<=400,a.id+' triangle budget');
  if(a.category==='vehicle')assert(a.civilian===true&&!g.animations?.length);
  records.push({id:a.id,bytes:bytes.length,sha256:hash(bytes),triangles,vertices,
    khronos:{errors:0,warnings:0,infos:0,hints:0},minTriangleAreaMetersSquared:minArea,maxNormalLengthError:maxNormalError});
}

function skeletalAudit(a){
  const {g,acc}=documents.get(a.id),skin=g.skins[0];
  assert.equal(g.skins.length,1);assert.equal(skin.joints.length,18);assert.equal(skin.skeleton,0);
  assert.deepEqual(skin.joints.map(j=>g.nodes[j].name),allNames);
  const worldRest=[];
  for(let i=0;i<18;i++){
    const node=g.nodes[i],bone=skeleton.bones[i];assert.equal(node.name,bone.name);
    assert.deepEqual(node.translation,bone.restTranslationMeters);
    assert.deepEqual(node.rotation||[0,0,0,1],[0,0,0,1]);assert.deepEqual(node.scale||[1,1,1],[1,1,1]);
    assert.deepEqual(node.children||[],skeleton.bones.flatMap((b,j)=>b.parent===bone.name?[j]:[]));
    const local=new Matrix4().makeTranslation(...node.translation),parent=bone.parent===null?null:worldRest[boneIndex[bone.parent]];
    worldRest.push(parent?new Matrix4().multiplyMatrices(parent,local):local);
  }
  const inverse=acc(skin.inverseBindMatrices),identity=new Matrix4(),inverses=[];
  for(let i=0;i<18;i++){
    const inv=new Matrix4().fromArray(inverse,i*16);inverses.push(inv);
    const product=worldRest[i].clone().multiply(inv);assert(product.elements.every((v,k)=>Math.abs(v-identity.elements[k])<1e-6),'inverse bind');
  }
  const meshNode=g.nodes.find(n=>n.skin===0),primitive=g.meshes[meshNode.mesh].primitives[0];
  const pos=acc(primitive.attributes.POSITION),joints=acc(primitive.attributes.JOINTS_0),weights=acc(primitive.attributes.WEIGHTS_0);
  for(let v=0;v<pos.length/3;v++){
    assert(joints.slice(v*4,v*4+4).every(j=>j>=0&&j<18));
    assert(Math.abs(weights.slice(v*4,v*4+4).reduce((a,b)=>a+b,0)-1)<1e-6);
  }
  assert.equal(g.animations.length,1);const clip=g.animations[0];assert.equal(clip.name,'walk');
  assert.equal(clip.channels.length,19);assert.equal(clip.extras.sampleHz,30);assert(clip.extras.loop&&clip.extras.inPlace);
  const tracks=clip.channels.map(c=>{
    const s=clip.samplers[c.sampler],times=acc(s.input),values=acc(s.output),width=c.target.path==='rotation'?4:3;
    assert.equal(times.length,33);assert.equal(s.interpolation,'LINEAR');
    times.forEach((t,i)=>assert(Math.abs(t-i/30)<6e-8,'30Hz time grid'));
    assert.deepEqual(values.slice(0,width),values.slice(-width),'loop seam');
    if(width===4)for(let i=0;i<values.length;i+=4)assert(Math.abs(Math.hypot(...values.slice(i,i+4))-1)<1e-6,'quaternion unit length');
    return {node:c.target.node,path:c.target.path,times,values,width};
  });
  assert.deepEqual(tracks.filter(t=>t.path==='rotation').map(t=>g.nodes[t.node].name),allNames);
  const rootTrack=tracks.find(t=>t.node===0);assert(rootTrack.values.every((v,k)=>v===(k%4===3?1:0)),'in-place Root');
  let minSkinnedY=Infinity,maxFootTargetError=0,maxStanceSoleError=0,maxSeamDistance=0,maxFootLift=0;
  let seamStart;
  const duration=32/30,speed=.9,samples=129;
  for(let sample=0;sample<samples;sample++){
    const t=sample/120,phase=(t/duration)%1;
    const translations=g.nodes.slice(0,18).map(n=>new Vector3().fromArray(n.translation));
    const rotations=Array.from({length:18},()=>new Quaternion());
    for(const tr of tracks){
      let k=Math.min(31,Math.floor(t*30+1e-8));
      const u=Math.max(0,Math.min(1,(t-tr.times[k])/(tr.times[k+1]-tr.times[k])));
      if(tr.path==='rotation')rotations[tr.node].fromArray(tr.values,k*4).slerp(new Quaternion().fromArray(tr.values,(k+1)*4),u);
      else translations[tr.node].fromArray(tr.values,k*3).lerp(new Vector3().fromArray(tr.values,(k+1)*3),u);
    }
    const world=[],skinMats=[];
    for(let i=0;i<18;i++){
      const local=new Matrix4().compose(translations[i],rotations[i],new Vector3(1,1,1));
      world[i]=skeleton.bones[i].parent===null?local:world[boneIndex[skeleton.bones[i].parent]].clone().multiply(local);
      skinMats.push(world[i].clone().multiply(inverses[i]));
    }
    const frame=[];
    for(let v=0;v<pos.length/3;v++){
      const p=new Vector3();
      for(let k=0;k<4;k++)if(weights[v*4+k])p.add(new Vector3().fromArray(pos,v*3).applyMatrix4(skinMats[joints[v*4+k]]).multiplyScalar(weights[v*4+k]));
      frame.push(p);minSkinnedY=Math.min(minSkinnedY,p.y);
    }
    if(sample===0)seamStart=frame;
    if(sample===samples-1)frame.forEach((p,i)=>{maxSeamDistance=Math.max(maxSeamDistance,p.distanceTo(seamStart[i]));});
    for(const [side,offset,x]of [['Left',0,.1],['Right',.5,-.1]]){
      const foot=new Vector3().setFromMatrixPosition(world[boneIndex[side+'Foot']]);
      const p=(phase+offset)%1,half=speed*duration*.6/2;
      let expectedY=.08,expectedZ=half-speed*duration*p;
      if(p>=.6){const u=(p-.6)/.4;expectedZ=-half+2*half*u*u*(3-2*u)-speed*duration*.4*(2*u**3-3*u*u+u);expectedY=.08+.13*Math.sin(Math.PI*u)**2;}
      maxFootTargetError=Math.max(maxFootTargetError,foot.distanceTo(new Vector3(x,expectedY,expectedZ)));
      maxFootLift=Math.max(maxFootLift,foot.y-.08);
      if(p<.6){
        for(let v=0;v<frame.length;v++)if(joints[v*4]===boneIndex[side+'Foot']&&pos[v*3+1]<1e-6)
          maxStanceSoleError=Math.max(maxStanceSoleError,Math.abs(frame[v].y));
      }
    }
  }
  assert(minSkinnedY>=-.003,`${a.id}: floor penetration ${minSkinnedY}`);
  assert(maxStanceSoleError<=.003,`${a.id}: stance sole error ${maxStanceSoleError}`);
  assert(maxFootTargetError<=.005,`${a.id}: foot target error ${maxFootTargetError}`);
  assert(maxSeamDistance<=1e-6,`${a.id}: mesh seam ${maxSeamDistance}`);
  assert(maxFootLift>=.12,'No swing clearance');
  return {id:a.id,joints:18,clip:'walk',sampleHz:30,keyframes:33,durationSeconds:duration,
    independentPlaybackSamples:samples,playbackSampleHz:120,minSkinnedYMeters:minSkinnedY,
    maxStanceSoleErrorMeters:maxStanceSoleError,maxFootTargetErrorMeters:maxFootTargetError,
    maxLoopMeshDistanceMeters:maxSeamDistance,maxFootLiftMeters:maxFootLift,
    note:'In-place stance paths are linear at -0.90 m/s; translate actor +Z at 0.90 m/s for ground contact.'};
}
const motion=manifest.assets.filter(a=>a.category==='pedestrian').map(skeletalAudit);

function intersections(id,origin,direction,maxDistance){
  const {g,acc}=documents.get(id),ray=new Ray(new Vector3(...origin),new Vector3(...direction).normalize()),result=[];
  for(const m of g.meshes)for(const p of m.primitives){
    const pos=acc(p.attributes.POSITION),indices=acc(p.indices);
    for(let i=0;i<indices.length;i+=3){
      const tri=indices.slice(i,i+3).map(j=>new Vector3().fromArray(pos,j*3));
      const hit=ray.intersectTriangle(...tri,false,new Vector3());if(hit&&hit.distanceTo(ray.origin)<maxDistance)result.push(hit.toArray());
    }
  }return result;
}
let tunnelClearanceRays=0;
for(const x of [-1.8,0,1.8])for(const y of [.30,1.20,2]){
  assert.equal(intersections('tunnel-segment',[x,y,-3.5],[0,0,1],7).length,0,'Blocked tunnel bore');tunnelClearanceRays++;
}
assert(intersections('tunnel-segment',[0,.8,0],[1,0,0],3).length>0,'Missing tunnel wall');
assert(intersections('tunnel-segment',[0,1,0],[0,1,0],4).length>0,'Missing tunnel ceiling');
assert.equal(intersections('bridge-span',[-3.5,.4,0],[1,0,0],7).length,0,'Blocked bridge underpass');
assert.equal(intersections('bridge-span',[0,1.3,-5],[0,0,1],10).length,0,'Blocked bridge road');
assert(intersections('bridge-span',[0,2,0],[0,-1,0],1.3).length>0,'Missing bridge deck');

async function folderBytes(dir){let bytes=0,files=0;for(const e of await fs.readdir(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);if(e.isDirectory()){const r=await folderBytes(p);bytes+=r.bytes;files+=r.files;}
  else{assert(e.isFile(),'No symlinks in delivery');bytes+=(await fs.stat(p)).size;files++;}
}return {bytes,files};}
const total=await folderBytes(root);assert(total.bytes<3000000,'Folder exceeds 3,000,000 bytes');
assert.equal(records.reduce((s,a)=>s+a.bytes,0),manifest.glbBytes);
const summary={pass:true,validatorVersion:validator.version(),budgetBytes:3000000,
  folderAtValidation:total,glbBytes:manifest.glbBytes,assetCount:records.length,
  khronosTotals:{errors:0,warnings:0,infos:0,hints:0},
  buildings:{count:8,minTriangles:Math.min(...manifest.assets.filter(a=>a.category==='building').map(a=>a.triangles)),maxTriangles:Math.max(...manifest.assets.filter(a=>a.category==='building').map(a=>a.triangles))},
  canonicalContractMatchesSource:true,motion,
  clearance:{tunnelClearanceRays,tunnelWallsAndCeilingPresent:true,bridgeRoadClear:true,bridgeUnderpassClear:true,bridgeDeckPresent:true},assets:records};
await fs.mkdir(path.join(root,'verification'),{recursive:true});
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,assets:undefined},null,2));
