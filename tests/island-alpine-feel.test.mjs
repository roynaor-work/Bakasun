import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineFeel} from '../workout/island/minigames/alpine-feel.mjs';
const data=JSON.parse(await readFile(new URL('../workout/island/design/feel/alpine.json',import.meta.url),'utf8'));
const frame=(speed,extra={})=>({phase:'racing',speedKmh:speed,player:{s:10,lean:0,airborne:false,...extra}});
test('authored speed changes FOV continuously without needing a boost flag',()=>{
 const f=createAlpineFeel(data,{maxSpeedKmh:100});for(let i=0;i<120;i++)f.update(frame(80),1/60);
 assert.ok(Math.abs(f.frame.fovAdd-4)<.001);assert.equal(f.frame.lookAhead,19.6);
 const at80=f.frame.fovAdd;for(let i=0;i<120;i++)f.update(frame(100),1/60);
 assert.ok(f.frame.fovAdd>at80+2.9);assert.equal(f.frame.lookAhead,22);
});
test('speed-line hysteresis and burst cooldown prevent threshold flicker and continuous flashes',()=>{
 const f=createAlpineFeel(data,{maxSpeedKmh:100});let starts=0;for(let i=0;i<120;i++)starts+=Number(f.update(frame(i%2?74:71),1/60).lineTrigger);
 assert.equal(starts,2);assert.equal(f.update(frame(59),1/60).lineVisible,false);
});
test('FOV uses authored smoothstep knots and reaches 95 percent in fov_in_ms',()=>{
 const f=createAlpineFeel(data,{maxSpeedKmh:100});for(let i=0;i<8;i++)f.update(frame(100),.02);
 assert.ok(Math.abs(f.frame.fovAdd-7*(1-Math.exp(-3)))<1e-10);
 const between=createAlpineFeel(data,{maxSpeedKmh:100});for(let i=0;i<120;i++)between.update(frame(60),1/60);
 assert.ok(Math.abs(between.frame.fovAdd-1.312)<1e-8);
 const invalid=createAlpineFeel(data,{maxSpeedKmh:0});invalid.update(frame(100),.016);assert.equal(invalid.frame.speedFraction,0);
});
test('camera captures a reversal once and reaches the authored endpoint on time',()=>{
 const f=createAlpineFeel(data,{maxSpeedKmh:100});for(let i=0;i<28;i++)f.update(frame(70,{lean:1}),.01);
 assert.equal(f.frame.carve,1);for(let i=0;i<28;i++)f.update(frame(70,{lean:-1}),.01);assert.equal(f.frame.carve,-1);
 for(let i=0;i<42;i++)f.update(frame(70),.01);assert.equal(f.frame.carve,0);
});
test('camera easing is frame-rate independent and pause preserves presentation state',()=>{
 const result=[];for(const fps of [30,60,120]){const f=createAlpineFeel(data,{maxSpeedKmh:100});for(let i=0;i<fps;i++)f.update(frame(90,{lean:1}),1/fps);result.push([f.frame.fovAdd,f.frame.carve]);const before={...f.frame};assert.equal(f.update({phase:'paused'},30),f.frame);assert.deepEqual(f.frame,before);}
 for(const r of result.slice(1))for(let i=0;i<2;i++)assert.ok(Math.abs(r[i]-result[0][i])<1e-10);
});
test('landing feedback is edge-triggered, bounded, reuses storage and does not mutate the engine frame',()=>{
 const f=createAlpineFeel(data),a=frame(60,{airborne:true}),b=frame(60,{landing:true});const before=structuredClone(b);
 const storage=f.update(a,.016);f.update(b,.016);assert.equal(storage,f.frame);assert.equal(f.frame.landings,1);
 for(let i=0;i<60;i++)f.update(b,1/60);assert.equal(f.frame.landings,1);assert.equal(f.frame.landingPulse,0);assert.deepEqual(b,before);
});
test('reduced motion keeps speed information with no FOV pulse, bank or lines',()=>{
 const f=createAlpineFeel(data,{maxSpeedKmh:100,reducedMotion:true});for(let i=0;i<60;i++)f.update(frame(100,{lean:1}),1/60);
 assert.equal(f.frame.speedFraction,1);assert.equal(f.frame.fovAdd,0);assert.equal(f.frame.bank,0);assert.equal(f.frame.lineOpacity,0);assert.equal(f.frame.lineVisible,false);
});
