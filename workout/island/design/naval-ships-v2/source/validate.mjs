import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../vendor/three.module.js';

const require = createRequire(import.meta.url);
const validator = require(process.env.NAVAL_VALIDATOR_PATH || 'gltf-validator');
const root = new URL('../',import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
assert.equal(manifest.models.length,12);
const reports=[];
const pairGeometry=new Map();
for (const model of manifest.models) {
  const bytes=await readFile(new URL(model.file,root));
  assert.equal(bytes.length,model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const d=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
  assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942);
  const bin=bytes.subarray(28+jsonLength);
  assert.equal(d.scenes.length,1);
  assert.equal(d.scene,0);
  assert.equal(d.buffers.length,1);
  assert(!d.buffers[0].uri);
  assert(!d.extensionsUsed?.length && !d.extensionsRequired?.length);
  assert(!d.images?.length && !d.textures?.length);
  assert.equal(d.asset.copyright,'CC0-1.0');
  function accessor(index) {
    const a=d.accessors[index],v=d.bufferViews[a.bufferView];
    const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const size=a.componentType===5126?4:2;
    assert([5123,5126].includes(a.componentType));
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>{
      const offset=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+j*size;
      return a.componentType===5126?bin.readFloatLE(offset):bin.readUInt16LE(offset);
    }));
  }
  let triangles=0,draws=0,minimumArea=Infinity,maximumNormalError=0;
  const bounds=new THREE.Box3();
  const visited=new Set(),seenMeshes=new Set(),names=new Map();
  const geometryHash=createHash('sha256');
  function walk(i,parentMatrix=new THREE.Matrix4()) {
    assert(!visited.has(i),'Every node must occur exactly once in the default scene');
    visited.add(i);
    const n=d.nodes[i];assert(!names.has(n.name));names.set(n.name,i);
    const local=new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),
      new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));
    const matrix=parentMatrix.clone().multiply(local);
    if (n.mesh!==undefined) {
      seenMeshes.add(n.mesh);
      for (const p of d.meshes[n.mesh].primitives) {
        assert.equal(p.mode,4);
        const positions=accessor(p.attributes.POSITION),normals=accessor(p.attributes.NORMAL);
        const indices=accessor(p.indices).flat();
        assert.equal(indices.length%3,0);
        triangles+=indices.length/3;draws++;
        geometryHash.update(JSON.stringify({positions,normals,indices}));
        for (const point of positions) {
          assert(point.every(Number.isFinite));
          bounds.expandByPoint(new THREE.Vector3(...point).applyMatrix4(matrix));
        }
        for (const normal of normals) {
          const error=Math.abs(Math.hypot(...normal)-1);
          maximumNormalError=Math.max(maximumNormalError,error);assert(error<1e-5);
        }
        for (let t=0;t<indices.length;t+=3) {
          const a=new THREE.Vector3(...positions[indices[t]]);
          const b=new THREE.Vector3(...positions[indices[t+1]]).sub(a);
          const c=new THREE.Vector3(...positions[indices[t+2]]).sub(a);
          const geometric=b.cross(c),area=geometric.length()/2;
          minimumArea=Math.min(minimumArea,area);assert(area>1e-10,'No degenerate triangles');
          geometric.normalize();
          for (const j of indices.slice(t,t+3)) assert(geometric.dot(new THREE.Vector3(...normals[j]))>.99999,'Normals must face the winding');
        }
        if (p.attributes.COLOR_0!==undefined) {
          for (const c of accessor(p.attributes.COLOR_0)) assert(c.every(v=>v>=0 && v<=1));
        }
      }
    }
    for (const child of n.children||[]) walk(child,matrix);
  }
  for (const i of d.scenes[0].nodes) walk(i);
  assert.equal(visited.size,d.nodes.length,'No hidden scenes or unused nodes');
  assert.equal(seenMeshes.size,d.meshes.length);
  assert.equal(triangles,model.triangles);
  assert(triangles>=600 && triangles<=1500);
  assert.equal(draws,model.drawCalls);
  for (const [key,values] of [['min',bounds.min.toArray()],['max',bounds.max.toArray()],['size',bounds.getSize(new THREE.Vector3()).toArray()]]) {
    values.forEach((v,i)=>assert(Math.abs(v-model.boundsMetres[key][i])<.00002,`Bounds ${key}`));
  }
  for (const name of ['hull','turret','barrel','muzzle','funnel','radar','lights','port_light','starboard_light','stern_light','mast_light','exhaust','bow','wake']) assert(names.has(name),name);
  const node=name=>d.nodes[names.get(name)];
  assert(node('turret').children.includes(names.get('barrel')));
  assert(node('barrel').children.includes(names.get('muzzle')));
  for (const name of ['turret','funnel','radar','lights']) assert(d.nodes[0].children.includes(names.get(name)));
  assert.equal(node('lights').children.length,4);
  assert(node('port_light').translation[0]<0 && node('starboard_light').translation[0]>0);
  for (const name of ['port_light','starboard_light','stern_light','mast_light']) {
    const m=d.materials[d.meshes[node(name).mesh].primitives[0].material];
    assert(m.emissiveFactor.some(v=>v>0));
  }
  assert.equal(d.animations.length,1);
  const clip=d.animations[0]; assert.equal(clip.name,'radar_spin');
  assert.equal(clip.channels.length,1);
  assert.equal(clip.channels[0].target.node,names.get('radar'));
  assert.equal(clip.channels[0].target.path,'rotation');
  const sampler=clip.samplers[0],times=accessor(sampler.input).flat(),quats=accessor(sampler.output);
  assert.deepEqual(times,[0,1,2,3,4]);
  quats.forEach(q=>assert(Math.abs(Math.hypot(...q)-1)<1e-6 && q[0]===0 && q[2]===0));
  assert(Math.abs(quats[0].reduce((s,v,i)=>s+v*quats.at(-1)[i],0))>.999999,'Seamless loop');
  const hash=geometryHash.digest('hex');
  if(pairGeometry.has(model.ship)) assert.equal(hash,pairGeometry.get(model.ship),'Team variants must have identical geometry');
  else pairGeometry.set(model.ship,hash);
  const khronos=await validator.validateBytes(new Uint8Array(bytes),{uri:model.file,maxIssues:1000});
  assert.equal(khronos.issues.numErrors,0);
  assert.equal(khronos.issues.numWarnings,0);
  assert.equal(khronos.issues.numInfos,0);
  assert.equal(khronos.issues.numHints,0);
  reports.push({file:model.file,triangles,drawCalls:draws,bytes:bytes.length,sha256:model.sha256,
    boundsMetres:model.boundsMetres,minimumTriangleArea:minimumArea,maximumNormalError,
    checks:{completeScene:true,budget:true,rig:true,teamGeometryMatch:true,unitNormals:true,
      winding:true,noDegenerates:true,noExternalResources:true,radarLoop:true},khronos});
  console.log(`${model.id}: ${triangles} triangles; Khronos 0/0/0/0`);
}
assert.equal(pairGeometry.size,6);
await mkdir(new URL('verification/',root),{recursive:true});
await writeFile(new URL('verification/validation.json',root),JSON.stringify({
  validatorVersion:validator.version(),models:reports,pass:true},null,2)+'\n');
console.log(`Validated ${reports.length} GLBs in ${fileURLToPath(root)}`);
