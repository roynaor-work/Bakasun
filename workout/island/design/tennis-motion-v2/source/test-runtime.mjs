// SPDX-License-Identifier: CC0-1.0
// Physical endpoint checks: C1 means matching position and angular velocity.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_BONES,createBridge,sampleBridge,quaternionAngularVelocity,applyLocalPose} from '../runtime.mjs';

const axis=(a,r)=>[...a.map(v=>v*Math.sin(r/2)),Math.cos(r/2)];
const multiply=(a,b)=>{
 const [x,y,z,w]=a,[X,Y,Z,W]=b;
 return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
};
const derivative=(q,omega)=>multiply(q,[...omega,0]).map(v=>v*.5);
const pose=(q=[0,0,0,1],omega=[0,0,0])=>({
 hips:[.03,.74,-.02],hipsVelocity:[.1,.02,-.03],
 rotations:Object.fromEntries(CANONICAL_BONES.map(n=>[n,[...q]])),
 rotationDerivatives:Object.fromEntries(CANONICAL_BONES.map(n=>[n,derivative(q,omega)])),leftOpen:.2,leftOpenVelocity:.04
});
const near=(a,b,eps=1e-7)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<eps,`${i}: ${v} != ${b[i]}`));};
const conjugate=q=>[-q[0],-q[1],-q[2],q[3]];
function measuredOmega(a,b,dt){
 let delta=multiply(conjugate(a),b);if(delta[3]<0)delta=delta.map(v=>-v);
 const n=Math.hypot(...delta.slice(0,3));if(n<1e-13)return [0,0,0];
 const angle=2*Math.atan2(n,delta[3]);return delta.slice(0,3).map(v=>v/n*angle/dt);
}

test('a moving bridge joins incoming and outgoing translation and angular velocities',()=>{
 const from=pose(axis([0,1,0],.2),[.4,-.3,.2]);
 const to=pose(axis([1,0,0],.5),[-.2,.6,.1]);
 to.hips=[.15,.77,.1];to.hipsVelocity=[-.05,.04,.2];to.leftOpen=.7;to.leftOpenVelocity=-.08;
 const bridge=createBridge({from,to,duration:.4}),h=1e-6;
 const a=sampleBridge(bridge,0),a1=sampleBridge(bridge,h),b0=sampleBridge(bridge,.4-h),b=sampleBridge(bridge,.4);
 near(a.hips,from.hips);near(b.hips,to.hips);
 near(a.hipsVelocity,from.hipsVelocity);near(b.hipsVelocity,to.hipsVelocity);
 near(a1.hips.map((v,i)=>(v-a.hips[i])/h),from.hipsVelocity,5e-6);
 near(b.hips.map((v,i)=>(v-b0.hips[i])/h),to.hipsVelocity,5e-6);
 for(const name of CANONICAL_BONES){
  near(measuredOmega(a.rotations[name],a1.rotations[name],h),[.4,-.3,.2],2e-5);
  near(measuredOmega(b0.rotations[name],b.rotations[name],h),[-.2,.6,.1],2e-5);
  near(a.angularVelocities[name],[.4,-.3,.2]);near(b.angularVelocities[name],[-.2,.6,.1]);
 }
 assert.ok(Math.abs((a1.leftOpen-a.leftOpen)/h-from.leftOpenVelocity)<2e-5);
 assert.ok(Math.abs((b.leftOpen-b0.leftOpen)/h-to.leftOpenVelocity)<2e-5);
});

test('antipodal endpoint encodings preserve the physical path and nonzero velocity',()=>{
 const from=pose(axis([0,0,1],.3),[0,0,.8]),to=pose(axis([0,0,1],.7),[0,0,-.5]);
 const positive=createBridge({from,to,duration:.5}),negative=structuredClone(to);
 for(const name of CANONICAL_BONES){negative.rotations[name]=negative.rotations[name].map(v=>-v);negative.rotationDerivatives[name]=negative.rotationDerivatives[name].map(v=>-v);}
 const antipodal=createBridge({from,to:negative,duration:.5});
 for(const t of [0,.1,.25,.49,.5]){
  const a=sampleBridge(positive,t),b=sampleBridge(antipodal,t);
  near(a.rotations.RightHand,b.rotations.RightHand);near(a.angularVelocities.RightHand,b.angularVelocities.RightHand);
  assert.ok(Math.abs(Math.hypot(...a.rotations.RightHand)-1)<1e-12);
 }
 near(sampleBridge(antipodal,.5).angularVelocities.RightHand,[0,0,-.5]);
});

test('normalization removes radial derivatives while preserving tangent motion',()=>{
 const from=pose(),to=pose();
 from.rotations.RightHand=[0,0,0,2];from.rotationDerivatives.RightHand=[.4,0,0,5];
 const result=sampleBridge(createBridge({from,to}),0);
 near(result.rotations.RightHand,[0,0,0,1]);near(result.rotationDerivatives.RightHand,[.2,0,0,0]);
 near(quaternionAngularVelocity(result.rotations.RightHand,result.rotationDerivatives.RightHand),[.4,0,0]);
});

test('clamped times never extrapolate or alter caller-owned poses',()=>{
 const from=pose(),to=pose(axis([0,1,0],.6)),copy=structuredClone({from,to});
 const bridge=createBridge({from,to,duration:.3});
 from.hips[0]=99;to.rotations.RightHand[0]=99;
 near(sampleBridge(bridge,-2).hips,copy.from.hips);near(sampleBridge(bridge,5).hips,copy.to.hips);
 near(sampleBridge(bridge,-2).hipsVelocity,[0,0,0]);near(sampleBridge(bridge,5).angularVelocities.RightHand,[0,0,0]);
 assert.equal(sampleBridge(bridge,0).finished,false);assert.equal(sampleBridge(bridge,.3).finished,true);
});

test('invalid durations, quaternions, derivative values and equipment tracks fail early',()=>{
 for(const duration of [0,-.3,NaN,Infinity])assert.throws(()=>createBridge({from:pose(),to:pose(),duration}),RangeError);
 const missing=pose();delete missing.rotations.Chest;assert.throws(()=>createBridge({from:missing,to:pose()}),TypeError);
 const invalid=pose();invalid.rotations.RightHand=[0,0,0,0];assert.throws(()=>createBridge({from:invalid,to:pose()}),RangeError);
 const equipment=pose();equipment.rotations.racket_mount=[0,0,0,1];assert.throws(()=>createBridge({from:equipment,to:pose()}),/body bones only/);
 const derivativeBad=pose();derivativeBad.rotationDerivatives.Head=[0,0,Infinity,0];assert.throws(()=>createBridge({from:derivativeBad,to:pose()}),TypeError);
 assert.throws(()=>sampleBridge(createBridge({from:pose(),to:pose()}),NaN),TypeError);
});

test('applying a bridge modifies exactly the canonical body and left hand morph',()=>{
 const calls=[],nodes=Object.fromEntries([...CANONICAL_BONES,'racket_mount','grip_hand_L'].map(name=>[name,{name,position:{fromArray:v=>calls.push([name,'position',v])},quaternion:{fromArray:v=>calls.push([name,'rotation',v])}}]));
 nodes.grip_hand_L.morphTargetInfluences=[0];
 const root={getObjectByName:n=>nodes[n],updateMatrixWorld:()=>{}};
 const state=sampleBridge(createBridge({from:pose(),to:pose()}),.1);applyLocalPose(root,state);
 assert.equal(calls.filter(c=>c[1]==='rotation').length,18);assert.equal(calls.filter(c=>c[1]==='position').length,1);
 assert.equal(calls.some(c=>c[0]==='racket_mount'),false);assert.equal(nodes.grip_hand_L.morphTargetInfluences[0],state.leftOpen);
 const partial={getObjectByName:n=>n==='Head'?undefined:nodes[n]};calls.length=0;
 assert.throws(()=>applyLocalPose(partial,pose()),/Missing canonical bone Head/);assert.equal(calls.length,0);
});
