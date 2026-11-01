import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../workout/island/vendor/three.module.js';
import {reflectCamera,applyFloorReflection,REFLECTION_LAYER} from '../workout/island/minigames/hoops-reflection.mjs';

test('the mirrored camera sits under the floor, keeps the lens and maps floor points to the same screen spot',()=>{
 const camera=new THREE.PerspectiveCamera(30,844/390,0.1,200);camera.position.set(3,6.4,-16);camera.lookAt(2,1.45,0);camera.updateMatrixWorld();
 const virtual=new THREE.PerspectiveCamera(),matrix=reflectCamera(camera,0.008,virtual);
 assert.ok(Math.abs(virtual.position.y-(2*0.008-6.4))<1e-9,'position reflected in y = 0.008');assert.equal(virtual.position.x,3);assert.equal(virtual.position.z,-16);
 assert.equal(virtual.fov,30);assert.ok(Math.abs(virtual.aspect-844/390)<1e-12);
 // a point on the floor projects to the same height through both cameras, mirrored left-right
 // (the reflected up vector flips the image; the texture matrix below reads it back the same way)
 const floorPoint=new THREE.Vector3(1.5,0.008,-2),a=floorPoint.clone().project(camera),b=floorPoint.clone().project(virtual);
 assert.ok(Math.abs(a.x+b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6,`floor point agrees: ${a.toArray()} vs ${b.toArray()}`);
 // a head above the floor through the virtual camera lands where its mirror image lands through the real one
 const head=new THREE.Vector3(1.5,1.9,-2),mirrored=new THREE.Vector3(1.5,2*0.008-1.9,-2),c=head.clone().project(virtual),d=mirrored.clone().project(camera);
 assert.ok(Math.abs(c.x+d.x)<1e-6&&Math.abs(c.y-d.y)<1e-6,'mirror image');
 // the texture matrix turns a floor point into 0..1 UVs that match the virtual projection
 const uv=new THREE.Vector4(floorPoint.x,floorPoint.y,floorPoint.z,1).applyMatrix4(matrix);
 assert.ok(Math.abs(uv.x/uv.w-(b.x+1)/2)<1e-6&&Math.abs(uv.y/uv.w-(b.y+1)/2)<1e-6);
 // the winding stays right-handed: the virtual camera is a rigid transform (determinant +1)
 const m=new THREE.Matrix3().setFromMatrix4(virtual.matrixWorld);assert.ok(m.determinant()>0.999);
});

test('the floor patch layers on existing compile hooks and keeps the sampled reflection behind one uniform set',()=>{
 const material=new THREE.MeshStandardMaterial({roughness:.3});let earlier=0;material.onBeforeCompile=()=>{earlier++;};material.customProgramCacheKey=()=>'parquet';
 const uniforms=applyFloorReflection(material,{strength:.5});
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <opaque_fragment>'};material.onBeforeCompile(shader);
 assert.equal(earlier,1);assert.equal(shader.uniforms.reflStrength.value,.5);assert.ok(shader.vertexShader.includes('vReflUv=reflMatrix*reflWorld'));assert.ok(shader.fragmentShader.includes('texture2DProj(reflMap,vReflUv)'));assert.ok(shader.fragmentShader.includes('#include <opaque_fragment>'));
 assert.equal(material.customProgramCacheKey(),'parquet|hoops-floor-reflection-v1');assert.equal(material.userData.hoopsFloorReflection,uniforms);assert.equal(REFLECTION_LAYER,1);material.dispose();
});
