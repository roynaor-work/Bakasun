// SPDX-License-Identifier: CC0-1.0
// Original synthetic fixtures; no production or personal data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGLB, readAccessor, sampleGLB} from '../glb.mjs';

function container(json, binary = Buffer.alloc(0)) {
  const body = Buffer.from(JSON.stringify(json));
  const jsonSize = Math.ceil(body.length / 4) * 4;
  const binSize = Math.ceil(binary.length / 4) * 4;
  const result = Buffer.alloc(12 + 8 + jsonSize + 8 + binSize);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonSize, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonSize);
  body.copy(result, 20);
  result.writeUInt32LE(binSize, 20 + jsonSize);
  result.writeUInt32LE(0x004e4942, 24 + jsonSize);
  binary.copy(result, 28 + jsonSize);
  return result;
}

function motion(interpolation = 'LINEAR') {
  const values = interpolation === 'CUBICSPLINE'
    ? [0,0,0, 0,0,0, 2,0,0, 0,0,0, 1,0,0, 0,0,0]
    : [0,0,0, 1,0,0];
  const binary = Buffer.alloc(8 + values.length * 4);
  [0,1,...values].forEach((v, i) => binary.writeFloatLE(v, i * 4));
  const json = {
    asset:{version:'2.0'}, buffers:[{byteLength:binary.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:8}, {buffer:0,byteOffset:8,byteLength:values.length*4}],
    accessors:[{bufferView:0,componentType:5126,count:2,type:'SCALAR'},
      {bufferView:1,componentType:5126,count:values.length/3,type:'VEC3'}],
    nodes:[{name:'Root',children:[1]}, {name:'Hips',translation:[0,1,0],children:[2]},
      {name:'Head',translation:[0,.7,0]}],
    scenes:[{nodes:[0]}],scene:0,
    animations:[{name:'move',samplers:[{input:0,output:1,interpolation}],
      channels:[{sampler:0,target:{node:0,path:'translation'}}]}],
  };
  return {json,binary,bytes:container(json,binary)};
}

function quaternionMotion(times=[0,1]) {
  const values=times.flatMap(t=>[0,0,Math.sin(t*.001/2)*1.00001,Math.cos(t*.001/2)*1.00001]);
  const binary=Buffer.alloc((times.length+values.length)*4);
  [...times,...values].forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const json={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],
    bufferViews:[{buffer:0,byteLength:times.length*4},
      {buffer:0,byteOffset:times.length*4,byteLength:values.length*4}],
    accessors:[{bufferView:0,componentType:5126,count:times.length,type:'SCALAR'},
      {bufferView:1,componentType:5126,count:times.length,type:'VEC4'}],
    nodes:[{name:'Root',children:[1]},{name:'Hips',translation:[0,1,0],children:[2]},
      {name:'Head',translation:[0,.7,0]}],scenes:[{nodes:[0]}],scene:0,
    animations:[{name:'tiny-rotation',samplers:[{input:0,output:1}],
      channels:[{sampler:0,target:{node:0,path:'rotation'}}]}]};
  return container(json,binary);
}

const at = (frames,t) => frames.find(f => Math.abs(f.t-t)<1e-7);
const near = (actual,expected,tolerance=1e-6) => assert.ok(Math.abs(actual-expected)<=tolerance, `${actual} != ${expected}`);

test('GLB reader validates magic, declared size, and truncated chunks', () => {
  const fixture = motion();
  assert.equal(parseGLB(fixture.bytes).json.asset.version,'2.0');
  for (const bytes of [fixture.bytes.subarray(0,10),fixture.bytes.subarray(0,fixture.bytes.length-1)]) {
    assert.throws(() => parseGLB(bytes));
  }
  const badMagic=Buffer.from(fixture.bytes);badMagic.writeUInt32LE(0,0);
  assert.throws(() => parseGLB(badMagic));
  const badChunk=Buffer.from(fixture.bytes);badChunk.writeUInt32LE(fixture.bytes.length,12);
  assert.throws(() => parseGLB(badChunk));
});

test('accessor reader respects interleaved byteStride and accessor offset', () => {
  const binary=Buffer.alloc(32);
  [99,1,2,3,88,4,5,6].forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const json={asset:{version:'2.0'},buffers:[{byteLength:32}],
    bufferViews:[{buffer:0,byteLength:32,byteStride:16}],
    accessors:[{bufferView:0,byteOffset:4,componentType:5126,count:2,type:'VEC3'}]};
  assert.deepEqual(Array.from(readAccessor(parseGLB(container(json,binary)),0)),[1,2,3,4,5,6]);
});

test('accessor reader cannot read beyond its declared bufferView', () => {
  const fixture=motion();
  fixture.json.accessors[1].count=500;
  assert.throws(()=>readAccessor(parseGLB(container(fixture.json,fixture.binary)),1));
});

test('sparse accessors apply indexed overrides to implicit zero values', () => {
  const binary=Buffer.alloc(8);
  binary.writeUInt8(1,0);binary.writeFloatLE(9,4);
  const json={asset:{version:'2.0'},buffers:[{byteLength:8}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:1},{buffer:0,byteOffset:4,byteLength:4}],
    accessors:[{componentType:5126,count:3,type:'SCALAR',sparse:{count:1,
      indices:{bufferView:0,componentType:5121},values:{bufferView:1}}}]};
  assert.deepEqual(Array.from(readAccessor(parseGLB(container(json,binary)),0)),[0,9,0]);
  binary.writeUInt8(3,0);
  assert.throws(()=>readAccessor(parseGLB(container(json,binary)),0));
});

test('normalized integer accessors preserve signed limits',()=>{
  const binary=Buffer.from([128,0,127,0]);
  const json={asset:{version:'2.0'},buffers:[{byteLength:4}],
    bufferViews:[{buffer:0,byteLength:3}],
    accessors:[{bufferView:0,componentType:5120,count:3,type:'SCALAR',normalized:true}]};
  assert.deepEqual(Array.from(readAccessor(parseGLB(container(json,binary)),0)),[-1,0,1]);
});

test('linear animation samples parent world transforms and exact endpoint', () => {
  const {frames,duration}=sampleGLB(motion().bytes,{animation:'move',fps:2,extraTimes:[.125]});
  near(duration,1);
  near(at(frames,0).joints.Hips[0],0);
  near(at(frames,.125).joints.Hips[0],.125);
  near(at(frames,.5).joints.Hips[0],.5);
  near(at(frames,1).joints.Hips[0],1);
  near(at(frames,.5).joints.Head[1],1.7);
});

test('STEP animation holds each pose until its next key', () => {
  const {frames}=sampleGLB(motion('STEP').bytes,{animation:'move',fps:2});
  near(at(frames,.5).joints.Hips[0],0);
  near(at(frames,1).joints.Hips[0],1);
});

test('CUBICSPLINE uses glTF tangents, including segment duration', () => {
  const fixture=motion('CUBICSPLINE');
  fixture.binary.writeFloatLE(2,4);
  fixture.binary.writeFloatLE(1,8+6*4);
  const {frames}=sampleGLB(container(fixture.json,fixture.binary),{animation:'move',fps:1});
  near(at(frames,1).joints.Hips[0],.75);
  near(at(frames,2).joints.Hips[0],1);
});

test('unknown animation names fail visibly', () => {
  assert.throws(()=>sampleGLB(motion().bytes,{animation:'absent'}));
});

test('animation data is sampled without WebAssembly', () => {
  const previous=globalThis.WebAssembly;
  globalThis.WebAssembly=undefined;
  try { assert.ok(sampleGLB(motion().bytes,{fps:2}).frames.length>=3); }
  finally {globalThis.WebAssembly=previous;}
});

test('slightly nonunit Float32 quaternions interpolate before normalization',()=>{
  const {frames}=sampleGLB(quaternionMotion(),{fps:2});
  const midpoint=at(frames,.5).rotations.Root;
  near(midpoint[2],Math.sin(.0005/2),1e-7);
  near(Math.hypot(...midpoint),1);
});

test('uniform and Float32 key times merge within one microsecond',()=>{
  const {frames}=sampleGLB(quaternionMotion([0,.50000012,1]),{fps:2,extraTimes:[.50000013]});
  assert.equal(frames.filter(frame=>Math.abs(frame.t-.5)<1e-6).length,1);
  assert.ok(frames.every((frame,i)=>i===0||frame.t-frames[i-1].t>1e-6));
  for(let i=1;i<frames.length;i++) {
    const delta=frames[i].rotations.Root[2]-frames[i-1].rotations.Root[2];
    const speed=delta/(frames[i].t-frames[i-1].t);
    near(speed,.0005,1e-7);
  }
});

export {container,motion};
