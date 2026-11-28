import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stopClipsEnabled,engineStopClips,STOP,stopBand,stepStop,snapshotStop,decodeStopPack,pickStopVariant,slideFastPlan} from '../workout/island/minigames/hoops-stop-clips.mjs';
import {decodeTallPack} from '../workout/island/minigames/hoops-tall.mjs';

const json=JSON.parse(await readFile(new URL('../workout/island/assets/hoops-stop-clips-v1/stop-clips.json',import.meta.url),'utf8'));
const design=JSON.parse(await readFile(new URL('../workout/island/design/hoops-stop-clips-v1/runtime/catalog.json',import.meta.url),'utf8'));

test('flag: on by default, ?hoopsStopClips=0 switches engine and view off',()=>{
  assert.equal(stopClipsEnabled(new URLSearchParams('')),true);
  assert.equal(stopClipsEnabled(new URLSearchParams('hoopsStopClips=0')),false);
  assert.equal(engineStopClips(new URLSearchParams('hoopsStopClips=0')),null);
  assert.equal(engineStopClips(new URLSearchParams('')),STOP);
});

test('stop bands follow the clips braking time',()=>{
  assert.equal(stopBand(7).Ts,0.42);assert.equal(stopBand(4).Ts,0.34);assert.equal(stopBand(2.6).Ts,0.30);
});

test('stop mode: constant deceleration over Ts, then rest; not for the ball handler, the air or a sideways run',()=>{
  const p={vx:0,vz:6,face:0,act:null,stumble:0,stop:null},dt=1/60;let i=0;
  assert.equal(stepStop(p,dt,{airborne:false,hasBall:false,wantSpeed:0}),true);
  assert.ok(p.stop&&p.stop.Ts===0.42&&Math.abs(p.stop.v0-6)<1e-9);
  const dist=[p.vz*dt];
  while(p.stop&&i++<200){stepStop(p,dt,{airborne:false,hasBall:false,wantSpeed:0});dist.push(p.vz*dt);if(p.vz===0)break;}
  assert.equal(p.vz,0);
  const total=dist.reduce((a,b)=>a+b,0);assert.ok(Math.abs(total-6*0.42/2)<0.06,'stop distance '+total);
  assert.equal(stepStop({vx:0,vz:6,face:0},dt,{airborne:false,hasBall:true,wantSpeed:0}),false);
  assert.equal(stepStop({vx:0,vz:6,face:0},dt,{airborne:true,hasBall:false,wantSpeed:0}),false);
  assert.equal(stepStop({vx:6,vz:0,face:0},dt,{airborne:false,hasBall:false,wantSpeed:0}),false);
  assert.equal(stepStop({vx:0,vz:1.5,face:0},dt,{airborne:false,hasBall:false,wantSpeed:0}),false);
  const q={vx:0,vz:6,face:0};stepStop(q,dt,{airborne:false,hasBall:false,wantSpeed:0});
  assert.equal(stepStop(q,dt,{airborne:false,hasBall:false,wantSpeed:4}),false);assert.equal(q.stop,null);
  assert.equal(snapshotStop({stop:null}),null);
});

test('pack decodes, variants cover the speeds, the pick is the nearest',()=>{
  const {pack,meta}=decodeStopPack(json,decodeTallPack);
  assert.equal(meta.variants.length,13);
  for(const v of meta.variants){const c=pack.clips[v.id];assert.ok(c&&c.frames===Math.round(v.duration*30)+1);}
  assert.equal(pickStopVariant(meta,7.5*1.195,1.195,0.42).v0,7.5);
  assert.equal(pickStopVariant(meta,2.0*1.3,1.3,0.30).v0,2);
  const left=slideFastPlan(meta,4,1,1.195);assert.equal(left.clip,meta.slide.left);assert.ok(left.rate>=0.6&&left.rate<=1.45);
  assert.equal(slideFastPlan(meta,4,-1,1.195).clip,meta.slide.right);
  assert.equal(slideFastPlan(meta,1.5,1,1.195),null);assert.equal(slideFastPlan(meta,6,1,1.195),null);
  assert.ok(slideFastPlan(meta,2.1,1,1.195,meta.slide.left));
  assert.throws(()=>decodeStopPack({version:1},decodeTallPack));
});

test('design clips: planted soles within 2 cm, canonical 18 bones, no compression, size budget',async()=>{
  const m=JSON.parse(await readFile(new URL('../workout/island/design/hoops-stop-clips-v1/verification/measurements.json',import.meta.url),'utf8'));
  assert.ok(m.summary.maxSlideCm<=2,'slide '+m.summary.maxSlideCm);
  assert.ok(m.summary.maxSlideCmGlb<=2);
  assert.equal(m.summary.bridgesPassed,m.summary.bridges);
  assert.ok(m.glbEquivalence.every(g=>g.shaMatches&&g.rootIdentity&&!g.draco));
  assert.equal(design.clips.length,24);
  assert.ok(design.clips.filter(c=>c.asset).length>=8);
  assert.ok(JSON.stringify(json).length<150000);
});
