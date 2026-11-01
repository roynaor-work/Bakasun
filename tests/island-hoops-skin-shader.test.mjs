import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {applySparseSkinning,createSparseDepthMaterial,SPARSE_SKINBASE_VERTEX} from '../workout/island/minigames/hoops-skin-shader.mjs';

test('sparse basketball skinning patches only its material and preserves earlier compile hooks',()=>{
 const originalChunk=THREE.ShaderChunk.skinbase_vertex,material=new THREE.MeshStandardMaterial();let called=0;
 material.onBeforeCompile=shader=>{called++;shader.fragmentShader+='\n// existing uniform customization';};material.customProgramCacheKey=()=> 'existing-jersey-key';
 applySparseSkinning(material);const installed=material.onBeforeCompile;assert.equal(applySparseSkinning(material).onBeforeCompile,installed,'idempotent installation');
 const shader={vertexShader:'#include <skinbase_vertex>\n#include <skinning_vertex>\n#include <skinnormal_vertex>',fragmentShader:'void main(){}'};material.onBeforeCompile(shader);
 assert.equal(called,1);assert.ok(shader.vertexShader.includes(SPARSE_SKINBASE_VERTEX));assert.ok(shader.vertexShader.includes('#include <skinning_vertex>'));assert.ok(shader.vertexShader.includes('#include <skinnormal_vertex>'));assert.ok(shader.fragmentShader.includes('existing uniform customization'));assert.equal(material.customProgramCacheKey(),'existing-jersey-key|hoops-sparse-skin-v1');assert.equal(THREE.ShaderChunk.skinbase_vertex,originalChunk);
 const untouched=new THREE.MeshStandardMaterial(),baseline={vertexShader:'#include <skinbase_vertex>',fragmentShader:''};untouched.onBeforeCompile(baseline);assert.equal(baseline.vertexShader,'#include <skinbase_vertex>');material.dispose();untouched.dispose();
});

test('custom depth pass uses the same sparse influence conditions and original opaque front-face depth packing',()=>{
 const depth=createSparseDepthMaterial(),shader={vertexShader:'#include <skinbase_vertex>',fragmentShader:''};depth.onBeforeCompile(shader);
 assert.equal(depth.depthPacking,THREE.RGBADepthPacking);assert.equal(depth.side,THREE.FrontSide);assert.equal(depth.transparent,false);
 for(const channel of ['y','z','w'])assert.ok(shader.vertexShader.includes(`if ( skinWeight.${channel} != 0.0 ) boneMat${channel.toUpperCase()} = getBoneMatrix( skinIndex.${channel} );`));depth.dispose();
});

test('skipping zero-weight bone matrices exactly preserves real v2 vertex positions and normals',async()=>{
 const bytes=await readFile(new URL('../workout/island/design/hoops/lod/hoops-player-v2-lod.glb',import.meta.url)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
 const matrices=Array.from({length:20},(_,i)=>new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(i)*.4,Math.cos(i)*.3,i*.01),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.03,-i*.07,i*.02)),new THREE.Vector3(1,1,1))),a=mesh.geometry.attributes,source=new THREE.Vector4(),normal=new THREE.Vector4(),transformed=new THREE.Vector4();let sparseFetches=0,denseFetches=0;
 for(let i=0;i<a.position.count;i++){
  source.set(a.position.getX(i),a.position.getY(i),a.position.getZ(i),1);normal.set(a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i),0);
  for(const input of [source,normal]){
   const dense=new THREE.Vector4(0,0,0,0),sparse=new THREE.Vector4(0,0,0,0);
   for(let k=0;k<4;k++){const method=['getX','getY','getZ','getW'][k],weight=a.skinWeight[method](i),matrix=matrices[a.skinIndex[method](i)];transformed.copy(input).applyMatrix4(matrix).multiplyScalar(weight);dense.add(transformed);denseFetches++;if(k===0||weight!==0){sparse.add(transformed);sparseFetches++;}}
   assert.deepEqual(sparse.toArray(),dense.toArray(),'zero-weight fetch removal preserves every weighted vertex/normal component');
  }
 }
 assert.ok(sparseFetches/denseFetches<.32,'the actual v2 influence distribution removes at least 68% of matrix fetches');mesh.geometry.dispose();mesh.material.dispose();
});
