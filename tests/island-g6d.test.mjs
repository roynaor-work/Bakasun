import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createNavalModel,navalWind,navalWindLanding,navalBroadsideHeading} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {G6D_AUDIO_FILES,createNavalAudio} from '../workout/island/minigames/g6d-audio.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.navalDuel;
const make=(level=5,seed=0)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed)});
const advance=(m,t,input={})=>{for(let i=0;i<Math.ceil(t/.02);i++)m.update(.02,input);};
test('G6d joystick release brakes promptly without turning the hull and keeps the fleet visible',()=>{
 for(const direction of [-1,1]){const m=make();advance(m,1,{moveX:direction,moveZ:-.6});const released={...m.playerShip};advance(m,.3);assert.equal(m.playerShip.heading,released.heading);assert.ok(Math.hypot(m.playerShip.x-released.x,m.playerShip.z-released.z)<released.speed*.13);advance(m,.7);assert.ok(m.playerShip.speed<.03);const e=m.enemyShip,q=m.screenPoint(e.x,e.z);assert.ok(q.depth>0&&q.x>0&&q.x<config.width);}
});
test('G6d broadside takes the shortest turn across angle wrap',()=>{for(const heading of [-6,-3.13,0,3.13,6])assert.ok(Math.abs(navalBroadsideHeading({x:0,z:0,heading},{x:200,z:10})-heading)<=Math.PI/2+.001);});
test('G6d wind changes physical landing; a new salvo changes strength and direction',()=>{
 const wind=navalWind(9,0,b),next=navalWind(9,1,b),point={x:300,z:0};assert.notEqual(wind.angle,next.angle);assert.notEqual(wind.strength,next.strength);assert.deepEqual(wind,navalWind(9,0,b));assert.notDeepEqual(navalWindLanding(point,wind,.8,b),point);
 const m=make();m.update(.02,{targetX:300,targetZ:0,firing:true});assert.notEqual(m.ball.targetZ,0);assert.notEqual(m.ball.targetX,300);const first={...m.wind};advance(m,1.2);assert.notDeepEqual(m.wind,first);
});
test('G6d manual wind compensation can hit without a hidden random hit roll',()=>{
 const m=make(1,0),w=m.wind;const flight=b.targeting.flightSeconds+240*b.targeting.secondsPerRange,offset=navalWindLanding({x:0,z:0},w,flight,b,1);m.update(.02,{targetX:m.enemyShip.x-offset.x,targetZ:m.enemyShip.z-offset.z,firing:true});advance(m,1.2);assert.equal(m.snapshot().hits,1);
});
// Superseded 25/10/2026: wind is part of each shell's ballistic launch.
test('G6d overlapping shells retain their own wind launch while a later torpedo has no air drift',async()=>{
 const {navalBallisticPoint}=await import('../workout/island/minigames/naval-ballistics.mjs');
 const m=make();m.update(.02,{targetX:300,targetZ:0,firing:true});const first=m.ball.launch;assert.ok(Math.hypot(first.ax,first.az)>0);m.update(.02,{});m.update(.02,{ammoIndex:2,targetX:300,targetZ:0,firing:true});assert.equal(m.extraShots.length,1);assert.equal(m.extraShots[0].launch,first);assert.equal(m.ball.launch.kind,'water');assert.equal(m.ball.launch.ax,0);assert.equal(m.ball.launch.az,0);assert.equal(m.ball.launch.origin.h,0);
 advance(m,.2);const p=m.extraShots[0],q=navalBallisticPoint(p.launch,p.age);assert.ok(Math.abs(p.x-q.x)<1e-9&&Math.abs(p.z-q.z)<1e-9);
});
test('G6d tunings match requested reductions and cached naval modules use current version',async()=>{
 assert.equal(b.aim.assist,.1);assert.equal(b.aim.autoLead,.3);assert.equal(b.aim.previewFraction,1/3);assert.ok(b.aim.wind.driftScale<.3);assert.equal(b.aim.sway.yaw,.027);assert.ok(Math.abs(b.aim.sway.elevation-.975)<1e-8);
 const source=await readFile(new URL('../workout/island/minigames/naval.mjs',import.meta.url),'utf8');assert.match(source,/g6d-audio\.mjs\?v=island-naval-aim-20261027-2/);assert.match(source,/g6d/);assert.ok(b.render.maxTriangles<=90000&&b.render.maxDrawCalls<=70);
});
test('G6d all eight local CC0 clips fit in 400KB and no-audio platforms are safe',async()=>{
 const root=new URL('../workout/island/assets/audio/g6d/',import.meta.url);let bytes=0;for(const name of G6D_AUDIO_FILES){const path=new URL(name+'.ogg',root),data=await readFile(path);assert.equal(data.subarray(0,4).toString(),'OggS');bytes+=(await stat(path)).size;}assert.ok(bytes<=400000,bytes);assert.match(await readFile(new URL('LICENSE.txt',root),'utf8'),/CC0 1.0 Universal/);const a=createNavalAudio({AudioContext:null,storage:{getItem:()=> 'off'}});a.unlock();a.play('cannon');a.update(32);assert.equal(a.metrics().muted,true);a.setPaused(true);a.dispose();assert.equal(a.metrics().disposed,true);
});
