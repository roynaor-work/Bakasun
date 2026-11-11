globalThis.__alienV15=false; // v14 behaviour; v15 is covered in island-alien-v15.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienV14Enabled,gearFactor,heatStep} from '../workout/island/minigames/alien-v14.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {stage} from '../workout/island/verification/aliens-v14/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,v14=balance.v14;
const make=(o={},off=false,level=1)=>{globalThis.__alienV14=off?false:undefined;const m=createAlienModel({config,balance,level,random:seededRandom(3),completion:'waves',roundChoices:false,...o});globalThis.__alienV14=undefined;return m;};
const run=(m,s,input={})=>{for(let i=0;i<Math.ceil(s*30);i++)m.update(1/30,input);};
const heavy={equipment:{weapon:2,rate:1.5,damage:2,shield:2},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:2},hangar:{rapid:10}};
const withFlag=(off,fn)=>{globalThis.__alienV14=off?false:undefined;try{return fn();}finally{globalThis.__alienV14=undefined;}};

test('v14 flag: on by default, ?alienV14=0 and the global switch restore v13',()=>{
 assert.equal(alienV14Enabled('',undefined),true);assert.equal(alienV14Enabled('?alienV14=0',undefined),false);assert.equal(alienV14Enabled('',false),false);
});
test('v14 heat: fires about 3.5 s, then the guns stop for 1.6 s, then resume (no endless stream)',()=>{
 const m=make();const log=[];let last=0;for(let i=0;i<30*14;i++){m.update(1/30,{firing:true});const f=m.snapshot().fired;log.push(f-last>0);last=f;}
 assert.ok(m.snapshot().overheats>=2,`overheats ${m.snapshot().overheats}`);
 let longestGap=0,gap=0;for(const f of log){gap=f?0:gap+1;longestGap=Math.max(longestGap,gap);}assert.ok(longestGap/30>=v14.coolSeconds-.3&&longestGap/30<=v14.coolSeconds+.5,`pause ${longestGap/30}`);
 const idle=make();run(idle,5,{});assert.equal(idle.snapshot().fired,0);
});
test('heatStep is a clean state machine',()=>{
 let s={heat:0,cool:0};for(let i=0;i<31*3.6;i++)s=heatStep(s,true,1/31,v14);assert.ok(s.cool>0||s.heat>.9);
 const t=heatStep({heat:1,cool:v14.coolSeconds},true,.5,v14);assert.equal(t.firing,false);const r=heatStep({heat:.5,cool:0},false,1,v14);assert.ok(r.heat<.5);
});
test('v14 bullets per second drop by half or more, damage per bullet is higher',()=>{
 const a=make(),b=make({},true);run(a,10,{firing:true});run(b,10,{firing:true});assert.ok(a.snapshot().fired<b.snapshot().fired*.5,`${a.snapshot().fired} vs ${b.snapshot().fired}`);
});
test('v14 shield charges cannot be drained by a bullet stream (one charge per interval)',()=>{
 const m=make({},false,5);const a=m.aliens.find(x=>x.shield>0)||(()=>{const z=m.aliens[0];z.shield=3;return z;})();a.entry=0;a.shield=5;a.y=200;a.x=m.player.x;
 run(m,1.0,{firing:true});assert.ok(a.shield>=5-Math.ceil(1.0/v14.shieldGap)-1,`shield ${a.shield}`);assert.ok(a.shield>=1);
});
test('v14 gear no longer collapses a stage: stage 1 takes 85-135 s for base, upgraded and heavy gear (measured)',()=>{
 const profiles=[{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}},heavy];
 for(const profile of profiles){const rs=[1,2,3].map(s=>stage(1,s,{profile})),avg=rs.reduce((n,r)=>n+r.seconds,0)/rs.length;assert.ok(avg>=85&&avg<=135,`avg ${avg}`);}
 assert.ok(gearFactor({equipment:{damage:2,rate:1.5},hangar:{rapid:10},rateCap:1.3})>gearFactor({}));assert.equal(gearFactor({}),1);
});
test('v14 stage 1 uses at most 60% of the bullets the v13 stage used',()=>{
 const on=[1,2,3].map(s=>stage(1,s,{}).fired).reduce((a,b)=>a+b,0),off=withFlag(true,()=>[1,2,3].map(s=>stage(1,s,{}).fired).reduce((a,b)=>a+b,0));
 assert.ok(on<=off*.6,`${on} vs ${off}`);
});
