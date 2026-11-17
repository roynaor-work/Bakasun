import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMotion16,compareMotion,MOTION_LIMITS} from './motion.mjs';
import {decodeMotion16} from '../runtime/motion16.mjs';
import {seam,audioDifference} from './audio.mjs';
import {compressGLB,nativeIO,assertNative} from './glb.mjs';
import {parseGLB,safeOutput,sourcePath} from './common.mjs';
import {Document} from '@gltf-transform/core';
import sharp from 'sharp';
import {losslessWebP} from './images.mjs';

test('motion16 bounds error while preserving event times, IDs, metadata and large coordinates',()=>{
  const source={states:{run:{durationSeconds:1.033333333,loop:true,events:[{time:0.37654321,id:991}],keyframes:[{time:0.123456789,rotations:{Hips:[0.123456789,0,0,Math.sqrt(1-0.123456789**2)]},hipsOffsetMeters:[0.019876543,-0.1,0.3],referenceRootTranslationMeters:[3000,0,0]}]}}};
  const result=encodeMotion16(source),decoded=decodeMotion16(result.buffer);
  assert.ok(result.safe);assert.ok(result.quality.maxRotationDegrees<MOTION_LIMITS.rotationDegrees);
  assert.deepEqual(decoded.states.run.events,source.states.run.events);
  assert.equal(decoded.states.run.keyframes[0].time,0.123456789);
  assert.deepEqual(decoded.states.run.keyframes[0].referenceRootTranslationMeters,[3000,0,0]);
  assert.throws(()=>compareMotion(source,{states:{}}),/structure/);
});
test('motion16 rejects truncated payloads, invalid offsets and reserved keys',()=>{
  const source={keyframes:[{rotations:{Hips:[0,0,0,1]}}]},result=encodeMotion16(source);
  assert.throws(()=>decodeMotion16(result.buffer.subarray(0,10)),/header/);
  assert.throws(()=>decodeMotion16(result.buffer.subarray(0,result.buffer.length-2)),/vector/);
  assert.throws(()=>encodeMotion16({$islandInt16:[1]}),/Reserved/);
  assert.equal(encodeMotion16({events:[1,2,3]}),null);
});
test('loop gate catches a discontinuous wrap and preserves sample count',()=>{
  assert.equal(seam(new Float32Array([0,0,0,0]),1).pass,true);
  assert.equal(seam(new Float32Array([0,0,0,0.5]),1).pass,false);
  assert.equal(audioDifference(new Float32Array(4),new Float32Array(3)).sameSamples,false);
});
test('native quantization preserves positions/topology and requires no decoder',async()=>{
  const d=new Document(),b=d.createBuffer(),position=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(b),normal=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,0,0,1,0,0,1])).setBuffer(b),uv=d.createAccessor().setType('VEC2').setArray(new Float32Array([0,0,.123456,.567891,1,1])).setBuffer(b),indices=d.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2])).setBuffer(b);
  const mesh=d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',position).setAttribute('NORMAL',normal).setAttribute('TEXCOORD_0',uv).setIndices(indices));d.createScene().addChild(d.createNode('keep').setMesh(mesh));
  const result=await compressGLB(Buffer.from(await(await nativeIO()).writeBinary(d)));
  assert.ok(result.safe);assert.equal(result.requiresWASM,false);assert.equal(result.quality.maxPositionError,0);assert.ok(result.quality.maxUVError<=.5/65535+1e-8);assertNative(parseGLB(result.bytes).json);
});
test('source and output guards refuse paths outside the package/island',async()=>{
  await assert.rejects(safeOutput('../../../assets'),/Output/);
  await assert.rejects(sourcePath('../../package.json'),/escaped/);
});
test('WebP preserves hidden RGB used by straight-alpha texture filtering',async()=>{
  const rgba=Buffer.alloc(64*64*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=255;rgba[i+1]=64;rgba[i+2]=32;rgba[i+3]=i%12?0:128;}
  const png=await sharp(rgba,{raw:{width:64,height:64,channels:4}}).png().toBuffer(),result=await losslessWebP(png);
  assert.equal(result.safe,true);assert.equal(result.quality.maxRGBAError,0);
});
test('native gate refuses forbidden WASM codecs and KTX2',()=>{
  for(const extension of ['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'])assert.throws(()=>assertNative({extensionsUsed:[extension]}),/Forbidden/);
  assert.throws(()=>assertNative({images:[{mimeType:'image/ktx2'}]}),/Forbidden/);
});
