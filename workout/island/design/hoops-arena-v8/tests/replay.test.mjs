import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../runtime/vendor/three.module.js';
import {createReplayRecorder} from '../runtime/replay.mjs';
function close(a,b){assert(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);}
test('Replay keeps only its bounded window and interpolates past transforms without changing live state',()=>{
  const a=new THREE.Object3D(),b=new THREE.Object3D();const r=createReplayRecorder([a,b],{seconds:2,rate:10});
  for(let i=0;i<=60;i++){a.position.x=i/10;b.position.z=-i/5;a.scale.y=1+i/100;r.record(i/10);}
  assert.equal(r.size,21);assert(r.start());close(r.duration,2);
  const before=a.position.clone(),scale=a.scale.clone();
  r.render(1.05,()=>{close(a.position.x,5.05);close(b.position.z,-10.1);close(a.scale.y,1.505);});
  assert(a.position.equals(before));assert(a.scale.equals(scale));
  assert.throws(()=>r.render(1,()=>{a.position.set(999,999,999);throw Error('draw failed');}),/draw failed/);assert(a.position.equals(before));
  const bytes=r.memoryBytes;for(let i=61;i<6000;i++){a.position.x=i/10;r.record(i/10);}assert.equal(r.memoryBytes,bytes);assert.equal(r.size,21);
  r.render(0,()=>close(a.position.x,4)); // Replay snapshot stays frozen while live recording continues.
  r.stop();assert.throws(()=>r.render(0,()=>{}),/Start/);assert(r.memoryBytes<bytes);
});
test('Quaternion interpolation takes the short arc, including equivalent antipodal endpoints',()=>{
  const o=new THREE.Object3D(),r=createReplayRecorder([o],{seconds:1,rate:1});r.record(0);o.quaternion.set(0,0,0,-1);r.record(1);assert(r.start());
  r.render(.5,()=>{close(Math.abs(o.quaternion.w),1);close(o.quaternion.length(),1);});close(o.quaternion.w,-1);
});
test('Recorder validates inputs, handles one frame and samples at the requested rate',()=>{
  assert.throws(()=>createReplayRecorder([]),/Track/);assert.throws(()=>createReplayRecorder([{}]),/Track/);const o=new THREE.Object3D();assert.throws(()=>createReplayRecorder([o],{seconds:500}),/Replay/);
  const r=createReplayRecorder([o],{rate:10});assert.equal(r.start(),false);assert(r.record(0));assert(!r.record(.01));assert.equal(r.start(),false);assert(r.record(.1));assert(r.start());
  assert.throws(()=>r.record(-1),/increase/);assert.throws(()=>r.record(NaN),/Finite/);r.render(-100,()=>{});close(r.cursor,0);r.render(100,()=>{});close(r.cursor,r.duration);
});

test('Replay owns a stable tracked set and rejects a non-finite playback cursor',()=>{
  const o=new THREE.Object3D(),tracked=[o],r=createReplayRecorder(tracked,{seconds:1,rate:1});
  tracked.push(new THREE.Object3D());r.record(0);o.position.x=1;r.record(1);assert(r.start());
  r.render(.5,()=>close(o.position.x,.5));close(o.position.x,1);
  assert.throws(()=>r.render(NaN,()=>{}),/Finite replay cursor/);close(o.position.x,1);
});
