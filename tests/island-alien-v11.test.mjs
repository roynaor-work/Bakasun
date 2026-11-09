globalThis.__alienV12=false;globalThis.__alienV14=false; // v11 behaviour; v12 is covered in island-alien-v12.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienV11Enabled,blastRule,BOAR_MG} from '../workout/island/minigames/alien-v11.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {stage} from '../workout/island/verification/aliens-v11/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,v11=balance.v11;
const make=(o={},off=false,level=1)=>{globalThis.__alienV11=off?false:undefined;const m=createAlienModel({config,balance,level,random:seededRandom(3),completion:'waves',roundChoices:false,...o});globalThis.__alienV11=undefined;return m;};
const run=(m,s,input={})=>{for(let i=0;i<Math.ceil(s*30);i++)m.update(1/30,input);};

test('v11 flag: on by default, ?alienV11=0 and the global switch restore v10',()=>{
 assert.equal(alienV11Enabled('',undefined),true);assert.equal(alienV11Enabled('?alienV11=0',undefined),false);assert.equal(alienV11Enabled('',false),false);
});
test('v11 player gun fires faster and the boar rifle sound parameters are reproduced exactly',()=>{
 const a=make(),b=make({},true);assert.ok(a.settings.shotSeconds<b.settings.shotSeconds);
 assert.deepEqual(BOAR_MG.layers.map(l=>[l.kind,l.dur,l.f0,l.f1,l.gain]),[['noise',.07,2200,700,.42],['tone',.08,140,45,.38],['noise',.025,5000,3000,.12]]);
});
test('v11 laser burst of 2-4 shots every 5-6 s while firing, none without firing',()=>{
 const idle=make();run(idle,20);assert.equal(idle.snapshot().lasersFired,0);
 const m=make();const seen=[];let last=0;for(let i=0;i<30*40;i++){m.update(1/30,{firing:true});const n=m.snapshot().lasersFired;if(n>last){seen.push({t:m.time,n:n-last});last=n;}}
 const lasers=m.shots.filter(s=>s.kind===2);assert.ok(seen.length>=5);
 const starts=[];let prev=-9;for(const e of seen){if(e.t-prev>.6)starts.push(e.t);prev=e.t;}
 for(let i=1;i<starts.length;i++){const gap=starts[i]-starts[i-1];assert.ok(gap>=4.9&&gap<=6.6,`gap ${gap}`);}
 const total=m.snapshot().lasersFired;assert.ok(total>=starts.length*2&&total<=starts.length*4+4);
});
test('v11 explosions: boss always big, small ones obey the cooldown and the rule',()=>{
 assert.equal(blastRule({boss:true,baseHp:1,kills:1,cooldown:5},v11),'big');
 assert.equal(blastRule({baseHp:3,kills:1,cooldown:0},v11),'small');assert.equal(blastRule({baseHp:1,kills:1,cooldown:0},v11),null);
 assert.equal(blastRule({baseHp:1,kills:v11.blastEvery,cooldown:0},v11),'small');assert.equal(blastRule({baseHp:3,kills:5,cooldown:.5},v11),null);
 const r=stage(1,1,{});assert.ok(r.blasts>=3);assert.ok(r.blasts<r.kills/2,`blasts ${r.blasts} of ${r.kills}`);
});
test('v11 alien fire is clearly denser in stages 1-3 (measured) without being a wall',()=>{
 const rs=[1,2,3].map(s=>stage(1,s,{}));const bolts=rs.reduce((n,r)=>n+r.boltsPerMin,0)/3;assert.ok(bolts>=20,`bolts/min ${bolts}`);
 const hits=rs.reduce((n,r)=>n+r.hits,0)/3;assert.ok(hits<=6,`hits ${hits}`);
 assert.ok(make().behavior.fireCadence<make({},true).behavior.fireCadence);
});
test('v11 bonuses are guaranteed (pity timer) and short, ten stages in a row never without one',()=>{
 for(let level=1;level<=10;level++){const r=stage(level,2,{});assert.ok(r.bonuses>=1,`stage ${level} had ${r.bonuses}`);}
 const m=make();m.pickups.push({kind:3,x:m.player.x,y:m.player.y,vy:0});m.update(1/30,{});m.update(1/30,{});
 assert.equal(m.powerTime<=v11.bonusSeconds&&m.powerTime>=v11.bonusSeconds-.2,true);assert.equal(m.powerMax,v11.bonusSeconds);run(m,v11.bonusSeconds+.5);assert.equal(m.powerTime,0);
 assert.ok(v11.bonusSeconds>=8&&v11.bonusSeconds<=12);
});
test('v11 stage 1 lasts about 80-130 s, with and without gear (measured by simulation, no browser)',()=>{
 for(const profile of [{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}]){
  const rs=[1,2,3,4,5,6].map(s=>stage(1,s,{profile})),avg=rs.reduce((n,r)=>n+r.seconds,0)/rs.length;assert.ok(avg>=80&&avg<=130,`avg ${avg}`);
 }
});
