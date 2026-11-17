// Run: node source/validate.mjs --modules /tmp/boars-world-tools/package.json
// npm install --prefix /tmp/boars-world-tools --cache /tmp/boars-npm-cache gltf-validator@2.0.0-dev.3.10
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=process.argv.indexOf('--modules');assert.ok(arg>=0,'Pass --modules /path/to/temporary/package.json');
const validator=createRequire(path.resolve(process.argv[arg+1]))('gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'))),skeleton=JSON.parse(await fs.readFile(path.join(root,'skeleton.json')));
const report={validator:'Khronos glTF Validator',version:validator.version(),errors:0,warnings:0,infos:0,assets:[],animations:[],checks:{},scope:{folder:'workout/island/design/boars-world-v1/',maxBytes:4000000}};
const hash=b=>createHash('sha256').update(b).digest('hex');
function decode(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n).toString()),bin=bytes.subarray(28+n);
  function read(i){
    const a=j.accessors[i],v=j.bufferViews[a.bufferView],sizes={SCALAR:1,VEC3:3,VEC4:4,MAT4:16},C={5121:Uint8Array,5123:Uint16Array,5126:Float32Array}[a.componentType];
    const start=bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0);return new C(bin.buffer,start,a.count*sizes[a.type]);
  }return {j,read};
}
const glbs=(await fs.readdir(path.join(root,'models'))).filter(f=>f.endsWith('.glb'));
assert.equal(glbs.length,21);assert.equal(manifest.assets.filter(a=>a.category==='boar').length,5);assert.equal(manifest.assets.filter(a=>['tree','bush'].includes(a.category)).length,6);assert.equal(manifest.assets.filter(a=>a.category==='sky').length,3);
const skeletons=[];
for(const spec of manifest.assets){
  const bytes=await fs.readFile(path.join(root,spec.file));assert.equal(bytes.length,spec.bytes);assert.equal(hash(bytes),spec.sha256);
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:spec.file,maxIssues:0});
  const issues=result.issues;report.errors+=issues.numErrors;report.warnings+=issues.numWarnings;report.infos+=issues.numInfos;
  assert.equal(issues.numErrors+issues.numWarnings,0,`${spec.id}: ${JSON.stringify(issues.messages)}`);
  const {j,read}=decode(bytes),p=j.meshes[0].primitives[0],positions=read(p.attributes.POSITION),normals=read(p.attributes.NORMAL);
  assert.equal(positions.length/9,spec.triangles);assert.ok([...positions,...normals].every(Number.isFinite));
  assert.ok(!j.buffers.some(b=>b.uri),'No external buffer');assert.ok(!j.images,'No textures');
  for(let i=0;i<normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...normals.subarray(i,i+3))-1)<1e-5,'Unit normals');
  report.assets.push({id:spec.id,triangles:spec.triangles,bytes:bytes.length,sha256:hash(bytes),errors:issues.numErrors,warnings:issues.numWarnings,infos:issues.numInfos});
  if(spec.category!=='boar')continue;
  assert.ok(spec.triangles>=500&&spec.triangles<=900);assert.equal(j.meshes.length,1);assert.equal(j.meshes[0].primitives.length,1);
  const skin=j.skins[0],joint=read(p.attributes.JOINTS_0),weight=read(p.attributes.WEIGHTS_0),inverse=read(skin.inverseBindMatrices);
  assert.equal(skin.joints.length,14);assert.equal(j.nodes[1].skin,0);assert.ok(j.scenes[0].nodes.includes(1),'Skinned mesh is at scene root');
  assert.deepEqual(skin.joints.map(i=>j.nodes[i].name),skeleton.joints.map(b=>b.name));
  skeletons.push(skin.joints.map(i=>({name:j.nodes[i].name,translation:j.nodes[i].translation,children:j.nodes[i].children||[]})));
  let blended=0;const influenced=new Set();
  for(let i=0;i<joint.length;i+=4){assert.equal(weight[i]+weight[i+1]+weight[i+2]+weight[i+3],255);let n=0;
    for(let k=0;k<4;k++){assert.ok(joint[i+k]<14);if(weight[i+k]){n++;influenced.add(joint[i+k]);}}if(n>1)blended++;assert.ok(n<=2);
  }
  assert.ok(blended>100,'A real blended skin is required');for(let k=1;k<14;k++)assert.ok(influenced.has(k),'Unweighted bone '+k);
  assert.deepEqual(j.animations.map(a=>a.name),['walk','run','fall','panic']);
  for(const animation of j.animations){
    const clip=manifest.animations.clips.find(c=>c.name===animation.name),times=read(animation.samplers[0].input);
    assert.equal(times.length,clip.frames);assert.ok(Math.abs(times.at(-1)-clip.duration)<1e-6);
    for(let i=1;i<times.length;i++)assert.ok(Math.abs(times[i]-times[i-1]-1/30)<1e-6,'30 Hz');
    for(const s of animation.samplers){assert.deepEqual(read(s.input),times);assert.equal(s.interpolation,'LINEAR');}
    const tracks=animation.channels.map(c=>({...c,values:read(animation.samplers[c.sampler].output)}));
    for(const t of tracks.filter(c=>c.target.path==='rotation'))for(let i=0;i<t.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...t.values.subarray(i,i+4))-1)<1e-6,'Unit quaternion');
    if(clip.loop)for(const t of tracks){const n=t.target.path==='rotation'?4:3;for(let k=0;k<n;k++)assert.ok(Math.abs(t.values[k]-t.values[t.values.length-n+k])<1e-6,'Seamless loop endpoints');}
    let minGround=Infinity,maxGround=-Infinity,maxMotion=0;const first=[];
    const inverseMatrices=skin.joints.map((_,i)=>new T.Matrix4().fromArray(inverse,i*16));
    // Independently decode the shipped file. Sample keyframes AND their midpoints.
    for(let f=0;f<times.length*2-1;f++){
      const i=Math.floor(f/2),v=f%2*.5,local=j.nodes.map(n=>({p:[...(n.translation||[0,0,0])],q:[0,0,0,1]}));
      for(const track of tracks){const n=track.target.path==='rotation'?4:3,key=track.target.path==='rotation'?'q':'p',dst=local[track.target.node];
        if(key==='q')dst.q=new T.Quaternion().fromArray(track.values,i*n).slerp(new T.Quaternion().fromArray(track.values,Math.min(i+1,times.length-1)*n),v).toArray();
        else dst.p=Array.from({length:n},(_,k)=>track.values[i*n+k]*(1-v)+track.values[Math.min(i+1,times.length-1)*n+k]*v);
      }
      const matrices=[];
      for(const [k,nodeIndex]of skin.joints.entries()){
        const b=skeleton.joints[k],value=local[nodeIndex],m=new T.Matrix4().compose(new T.Vector3(...value.p),new T.Quaternion(...value.q),new T.Vector3(1,1,1));
        matrices.push(b.parent<0?m:matrices[b.parent].clone().multiply(m));
      }
      const skinned=matrices.map((m,k)=>m.clone().multiply(inverseMatrices[k])),point=new T.Vector3(),sum=new T.Vector3();let floor=Infinity;
      for(let k=0;k<positions.length/3;k++){
        sum.set(0,0,0);for(let s=0;s<4;s++){const w=weight[k*4+s]/255;if(w)sum.addScaledVector(point.fromArray(positions,k*3).applyMatrix4(skinned[joint[k*4+s]]),w);}
        floor=Math.min(floor,sum.y);if(f===0)first.push(sum.clone());else maxMotion=Math.max(maxMotion,sum.distanceTo(first[k]));
      }
      minGround=Math.min(minGround,floor);maxGround=Math.max(maxGround,floor);
    }
    assert.ok(minGround>-.010,`${spec.id}/${animation.name}: ground penetration ${minGround}`);assert.ok(maxMotion>.08,'Animation must visibly move vertices');
    report.animations.push({id:spec.id,clip:clip.name,hz:30,keyframes:times.length,poseSamples:times.length*2-1,loop:clip.loop,minVertexY:+minGround.toFixed(6),maxLowestVertexY:+maxGround.toFixed(6),maxVertexMotionMeters:+maxMotion.toFixed(4),blendedVertices:blended});
  }
}
for(const value of skeletons.slice(1))assert.deepEqual(value,skeletons[0]);
async function inventory(dir,prefix=''){
  const files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink(),'No symlinks');const relative=prefix+entry.name;
    if(entry.isDirectory())files.push(...await inventory(path.join(dir,entry.name),relative+'/'));else files.push({file:relative,bytes:(await fs.stat(path.join(dir,entry.name))).size});}
  return files;
}
const files=await inventory(root);report.package={files:files.length,bytesAtValidation:files.reduce((n,f)=>n+f.bytes,0),note:'Final all-file byte total, including this report, is in verification/package.json.'};
assert.ok(report.package.bytesAtValidation<4000000,'Whole folder must remain below 4,000,000 bytes');
report.checks={all21GLBsClean:true,allFiveTriangleBudgets:true,all20ClipsAt30Hz:true,all13DeformingBonesWeighted:true,blendedSkin:true,identicalSkeletons:true,
  noExternalGLBResources:true,allNormalsAndQuaternionsUnit:true,loopEndpointsMatch:true,actualSkinnedVerticesChecked:true,groundToleranceMeters:.010,wholeFolderUnder4MB:true};
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification/validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({validator:report.version,errors:report.errors,warnings:report.warnings,infos:report.infos,assets:report.assets.length,animations:report.animations.length,poseSamples:report.animations.reduce((n,a)=>n+a.poseSamples,0),minGround:Math.min(...report.animations.map(a=>a.minVertexY)),bytesAtValidation:report.package.bytesAtValidation},null,2));
