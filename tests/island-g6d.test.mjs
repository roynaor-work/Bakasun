import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createNavalModel,navalWind,navalWindLanding,navalBroadsideHeading} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {G6D_AUDIO_FILES,createNavalAudio} from '../workout/island/minigames/g6d-audio.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.navalDuel;
const make=(level=5,seed=0)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed)});
const advance=(m,t,input={})=>{for(let i=0;i<Math.ceil(t/.02);i++)m.update(.02,input);};
const rates=new Map();
for(const level of [1,5,10])test(`G6d 200 normal unupgraded shots at stage ${level}`,()=>{
 let hits=0,fired=0;
 // Same fixed encounter distribution as G6c: all hulls, seeds 0..199,
 // release at 0..5.6s, real moving enemies and actual collision after flight.
 for(let seed=0;seed<200;seed++){const m=make(level,seed);advance(m,seed%9*.7);m.update(.02,{autoAim:true,firing:true});advance(m,1.2);hits+=m.snapshot().hits;fired+=m.fired;}
 const rate=hits/fired;rates.set(level,rate);console.log('G6d calibration',JSON.stringify({level,hits,fired,rate}));assert.equal(fired,200);
 assert.ok(rate>=.30&&rate<=.50);if(level===5)assert.ok(rate>=.35&&rate<=.45);if(level===10){assert.ok(rates.get(1)>rates.get(5));assert.ok(rate<rates.get(5));}
});
test('G6d joystick release aligns the nearest broadside in .6s and restores enemy view in 1s',()=>{
 for(const direction of [-1,1]){const m=make();advance(m,1,{moveX:direction,moveZ:-.6});const released={...m.playerShip};advance(m,.3);assert.notEqual(m.playerShip.heading,released.heading);assert.deepEqual({x:m.playerShip.x,z:m.playerShip.z},{x:released.x,z:released.z});advance(m,.3);const e=m.enemyShip,dx=e.x-m.playerShip.x,dz=e.z-m.playerShip.z;assert.ok(Math.abs((Math.cos(m.playerShip.heading)*dx+Math.sin(m.playerShip.heading)*dz)/Math.hypot(dx,dz))<.02);advance(m,.4);const q=m.screenPoint(e.x,e.z);assert.ok(q.depth>0&&q.x>0&&q.x<config.width);const bearing=Math.atan2(dz,dx);assert.ok(Math.abs(m.camera.heading-bearing)<.1);}
});
test('G6d broadside takes the shortest turn across angle wrap',()=>{for(const heading of [-6,-3.13,0,3.13,6])assert.ok(Math.abs(navalBroadsideHeading({x:0,z:0,heading},{x:200,z:10})-heading)<=Math.PI/2+.001);});
test('G6d wind changes physical landing; a new salvo changes strength and direction',()=>{
 const wind=navalWind(9,0,b),next=navalWind(9,1,b),point={x:300,z:0};assert.notEqual(wind.angle,next.angle);assert.notEqual(wind.strength,next.strength);assert.deepEqual(wind,navalWind(9,0,b));assert.notDeepEqual(navalWindLanding(point,wind,.8,b),point);
 const m=make();m.update(.02,{targetX:300,targetZ:0,firing:true});assert.notEqual(m.ball.targetZ,0);assert.notEqual(m.ball.targetX,300);const first={...m.wind};advance(m,1.2);assert.notDeepEqual(m.wind,first);
});
test('G6d manual wind compensation can hit without a hidden random hit roll',()=>{
 const m=make(1,0),w=m.wind;const flight=b.targeting.flightSeconds+240*b.targeting.secondsPerRange,offset=navalWindLanding({x:0,z:0},w,flight,b,1);m.update(.02,{targetX:m.enemyShip.x-offset.x,targetZ:m.enemyShip.z-offset.z,firing:true});advance(m,1.2);assert.equal(m.snapshot().hits,1);
});
test('G6d overlapping shells retain their wind while a later torpedo has no air drift',()=>{
 const m=make();m.update(.02,{targetX:300,targetZ:0,firing:true});const first={...m.ball};m.update(.02,{});m.update(.02,{ammoIndex:2,targetX:300,targetZ:0,firing:true});assert.equal(m.extraShots.length,1);assert.equal(m.extraShots[0].windOffsetX,first.windOffsetX);assert.equal(m.extraShots[0].windOffsetZ,first.windOffsetZ);assert.equal(m.ball.wind,undefined);assert.equal(m.ball.windOffsetX,0);assert.equal(m.ball.windOffsetZ,0);advance(m,.2);const p=m.extraShots[0],t=p.age/p.duration;assert.ok(Math.abs(p.x-(p.fromX+(p.targetX-p.fromX)*t-p.windOffsetX*t*(1-t)))<1e-8);
});
test('G6d tunings match requested reductions and cached naval modules use current version',async()=>{
 assert.equal(b.aim.assist,.1);assert.equal(b.aim.autoLead,.3);assert.equal(b.aim.previewFraction,.14);assert.equal(b.aim.sway.yaw,.027);assert.ok(Math.abs(b.aim.sway.elevation-.975)<1e-8);
 const source=await readFile(new URL('../workout/island/minigames/naval.mjs',import.meta.url),'utf8');assert.match(source,/g6d-audio\.mjs\?v=g9-20261020-1/);assert.match(source,/g6d/);assert.ok(b.render.maxTriangles<=90000&&b.render.maxDrawCalls<=70);
});
test('G6d all eight local CC0 clips fit in 400KB and no-audio platforms are safe',async()=>{
 const root=new URL('../workout/island/assets/audio/g6d/',import.meta.url);let bytes=0;for(const name of G6D_AUDIO_FILES){const path=new URL(name+'.ogg',root),data=await readFile(path);assert.equal(data.subarray(0,4).toString(),'OggS');bytes+=(await stat(path)).size;}assert.ok(bytes<=400000,bytes);assert.match(await readFile(new URL('LICENSE.txt',root),'utf8'),/CC0 1.0 Universal/);const a=createNavalAudio({AudioContext:null,storage:{getItem:()=> 'off'}});a.unlock();a.play('cannon');a.update(32);assert.equal(a.metrics().muted,true);a.setPaused(true);a.dispose();assert.equal(a.metrics().disposed,true);
});
