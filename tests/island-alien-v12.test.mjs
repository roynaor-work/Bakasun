globalThis.__alienV14=false; // v13 behaviour; v14 is covered in island-alien-v14.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienV12Enabled,vulcanSamples,vulcanSpin} from '../workout/island/minigames/alien-v12.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {stage} from '../workout/island/verification/aliens-v12/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,v12=balance.v12;
const make=(o={},off=false,level=1)=>{globalThis.__alienV12=off?false:undefined;const m=createAlienModel({config,balance,level,random:seededRandom(3),completion:'waves',roundChoices:false,...o});globalThis.__alienV12=undefined;return m;};
const run=(m,s,input={})=>{for(let i=0;i<Math.ceil(s*30);i++)m.update(1/30,input);};

test('v12 flag: on by default, ?alienV12=0 and the global switch restore v11',()=>{
 assert.equal(alienV12Enabled('',undefined),true);assert.equal(alienV12Enabled('?alienV12=0',undefined),false);assert.equal(alienV12Enabled('',false),false);
});
test('v12 Vulcan stream: 20+ bullets a second from two cannons that alternate, none without firing',()=>{
 const idle=make();run(idle,10);assert.equal(idle.snapshot().fired,0);
 const m=make();const xs=new Set();let fired0=m.snapshot().fired;
 for(let i=0;i<30*3;i++){m.update(1/30,{firing:true});for(const s of m.shots)if(s.y>m.player.y-70)xs.add(Math.round((s.x-m.player.x)/1));}
 const rate=(m.snapshot().fired-fired0)/3;assert.ok(rate>=20,`rate ${rate}`);
 assert.ok([...xs].some(d=>d<=-8)&&[...xs].some(d=>d>=8),'bullets leave from both wings');
 assert.equal(m.snapshot().cannonSide===1||m.snapshot().cannonSide===-1,true);assert.ok(m.firing);run(m,.3,{});assert.equal(m.firing,false);
});
test('v12 same damage per second as before: bullet damage scales with the rate',()=>{
 const a=make(),b=make({},true);
 const dps=m=>{run(m,.01,{firing:true});const t=3;let dmg=0;const seen=new Set();for(let i=0;i<30*t;i++){m.update(1/30,{firing:true});for(const s of m.shots)if(!seen.has(s)&&!s.wing){seen.add(s);dmg+=s.damage;}}return dmg/t;};
 const da=dps(a),db=dps(b);assert.ok(da/db>=.85&&da/db<=1.05,`dps ${da} vs ${db}`);
});
test('v12 stage 1 duration stays within the target (80-130 s) with and without gear',()=>{
 for(const profile of [{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}]){const rs=[1,2,3,4,5,6].map(s=>stage(1,s,{profile})),avg=rs.reduce((n,r)=>n+r.seconds,0)/rs.length;assert.ok(avg>=80&&avg<=130,`avg ${avg}`);}
});
test('v12 Vulcan sound: 66 pulses a second, seamless one-second loop, spin-up and spin-down curves',()=>{
 const sr=44100,data=vulcanSamples(sr,66),period=Math.round(sr/66);
 assert.equal(data.length,period*66);let peaks=0;for(let k=0;k<66;k++){let m=0;for(let i=0;i<period;i++)m=Math.max(m,Math.abs(data[k*period+i]));if(m>.5)peaks++;}assert.equal(peaks,66);
 const e=a=>{let s=0;for(let i=0;i<period;i++)s+=data[a*period+i]**2;return s;};assert.ok(Math.abs(data[data.length-1])<.12,'loop end is quiet');assert.ok(e(0)>0&&e(65)>0);
 assert.deepEqual(vulcanSamples(sr,66),data);
 const up0=vulcanSpin(0,true),up1=vulcanSpin(.4,true),dn0=vulcanSpin(0,false),dn1=vulcanSpin(.5,false);
 assert.ok(up0.rate<.4&&up1.rate===1&&dn0.rate===1&&dn1.rate<.6&&dn1.gain===0);
});
test('v12 hit sounds are rate limited (not one per bullet)',()=>{
 let n=0;const m=make({sound:e=>{if(e==='hit')n++;}});run(m,20,{firing:true});const hits=m.snapshot().hits;
 assert.ok(hits>40);assert.ok(n<=20/v12.hitSoundGap+2,`sounds ${n}`);assert.ok(n<hits/2,`sounds ${n} of ${hits} hits`);assert.equal(m.cannonLast.length,2);
});
