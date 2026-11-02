// v4 (02/11): the steal animation of the broadcast athletes. Before, a local rotateX on the
// MakeHuman arm swung the hand behind the back; now the reach is a world-space aim at the ball,
// timed like the motion2 steal clips (steal_fail / steal_success).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../workout/island/vendor/three.module.js';
import {stealLayer,aimLimb} from '../workout/island/minigames/hoops-players-v1.mjs';
import {chooseV2Motion} from '../workout/island/minigames/hoops-motion-v2.mjs';
const steal={reachAt:0.14,duration:0.4};

test('steal timeline: the hand goes out to the ball by the contact, a miss comes back empty, a success gathers to the chest',()=>{
 const miss=t=>stealLayer(t,'stealMiss',steal),open=t=>stealLayer(t,null,steal),win=t=>stealLayer(t,'steal',steal);
 assert.equal(open(0).clip,'steal_fail','until the engine verdict the reach follows the failing clip');assert.equal(miss(0.2).clip,'steal_fail');assert.equal(win(0.2).clip,'steal_success');
 assert.equal(open(0).reach,0);assert.ok(open(0.07).reach>0.4&&open(0.07).reach<0.6);assert.equal(open(0.14).reach,1,'fully extended at the engine contact');
 assert.ok(miss(0.4).reach<0.05,'a miss has withdrawn by the end of the act');assert.equal(miss(0.3).gather,0);
 assert.ok(win(0.4).gather>=0.99&&win(0.4).reach<0.05,'a success ends with the ball gathered to the chest');assert.ok(win(0.2).gather>0&&win(0.2).gather<0.4);
 for(const t of [0.05,0.14,0.25,0.35]){assert.ok(open(t).reach>=0&&open(t).reach<=1);assert.ok(open(t).lunge>=0&&open(t).lunge<=1);assert.ok(open(t).crouch>=0);}
 assert.ok(open(0.2).lunge>0.9,'the step peaks mid act');assert.equal(open(0).lunge,0);
});

test('clip choice: the characters2 player picks steal_success only after the engine reports a steal, otherwise steal_fail',()=>{
 assert.equal(chooseV2Motion({act:'steal'},{},null),'steal_fail');assert.equal(chooseV2Motion({act:'steal'},{},'steal_success'),'steal_success');
});

test('world-space aim: the arm turns toward the target in front, never behind, whatever the local axes of the bone',()=>{
 for(const twist of [0,1.2,-2.4]){
  const root=new THREE.Object3D(),shoulder=new THREE.Bone(),elbow=new THREE.Bone(),hand=new THREE.Bone();
  root.add(shoulder);shoulder.add(elbow);elbow.add(hand);shoulder.position.set(0.2,1.4,0);
  // an arm hanging down with an arbitrary roll about its own length
  shoulder.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),twist).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI));
  elbow.position.set(0,0.3,0);hand.position.set(0,0.28,0);root.updateMatrixWorld(true);
  const before=hand.getWorldPosition(new THREE.Vector3());assert.ok(before.y<1.0,'hangs down before');
  const target=new THREE.Vector3(0.3,1.1,0.8);
  aimLimb(shoulder,hand,target,1);root.updateMatrixWorld(true);
  const after=hand.getWorldPosition(new THREE.Vector3()),s=shoulder.getWorldPosition(new THREE.Vector3());
  const dir=after.clone().sub(s).normalize(),want=target.clone().sub(s).normalize();
  assert.ok(dir.dot(want)>0.999,`twist ${twist}: hand points at the target (${dir.dot(want).toFixed(4)})`);assert.ok(after.z>0.3,'the hand is in front (+z), not behind the back');
  // half weight: half way between hanging and reaching
  const root2=new THREE.Object3D(),sh2=new THREE.Bone(),h2=new THREE.Bone();root2.add(sh2);sh2.add(h2);sh2.position.copy(shoulder.position);sh2.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);h2.position.set(0,0.58,0);root2.updateMatrixWorld(true);
  aimLimb(sh2,h2,target,0.5);root2.updateMatrixWorld(true);const half=h2.getWorldPosition(new THREE.Vector3()).sub(sh2.getWorldPosition(new THREE.Vector3())).normalize();
  assert.ok(half.dot(want)>0.5&&half.dot(want)<0.95,'partial weight is a partial turn');
 }
});
