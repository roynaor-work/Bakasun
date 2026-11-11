import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienFrameInput} from '../workout/island/minigames/alien-session.mjs';
import {alienV15Enabled,fireInterval,chargeStep} from '../workout/island/minigames/alien-v15.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {stage} from '../workout/island/verification/aliens-v15/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,v15=balance.v15;
const make=(o={},off=false,level=1)=>{globalThis.__alienV15=off?false:undefined;const m=createAlienModel({config,balance,level,random:seededRandom(5),completion:'waves',roundChoices:false,...o});globalThis.__alienV15=undefined;return m;};
const heavy={equipment:{weapon:2,rate:1.5,damage:2,shield:2},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:2},hangar:{rapid:10}};
/** Bullets per one-second window (laser burst shots excluded) while an input source holds fire. */
function windows(m,seconds,inputAt=()=>({firing:true}),setup=()=>{}){
 const out=[];let prev=0,prevL=0;setup(m);
 for(let i=0;i<30*seconds;i++){m.update(1/30,inputAt(i));if((i+1)%30===0){const s=m.snapshot();out.push((s.fired-prev)-(s.lasersFired-prevL));prev=s.fired;prevL=s.lasersFired;}}
 return out;
}
const sum=a=>a.reduce((x,y)=>x+y,0);

test('v15 flag: on by default, ?alienV15=0 and the global switch restore v14',()=>{
 assert.equal(alienV15Enabled('',undefined),true);assert.equal(alienV15Enabled('?alienV15=0',undefined),false);assert.equal(alienV15Enabled('',false),false);
});
test('v15 normal fire is capped: at most 5.5 bullets in any second before the first Vulcan burst, no matter the gear',()=>{
 for(const profile of [{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}},heavy]){
  const w=windows(make(profile),8);assert.ok(Math.max(...w.slice(0,8))<=6,`windows ${w}`);assert.ok(sum(w)/8<=5.6,`avg ${sum(w)/8}`);
 }
});
test('v15 fire cap holds in every fire mode: touch auto-fire, keyboard, rapid bonus, spread, companion ships',()=>{
 const controls={sample:()=>({moveX:0,kickHeld:false,passHeld:false})},held={sample:()=>({moveX:0,kickHeld:true,passHeld:false})};
 const touch={sample:()=>({active:true,moveX:0,x:180,autoFire:true})};
 // touch drag with the v9+ rule: no auto-fire; keyboard/button held
 const viaButton=windows(make(),8,()=>alienFrameInput(held,1/30,touch,balance.controls.deadzone));assert.ok(Math.max(...viaButton)<=6,`button ${viaButton}`);
 const noPress=windows(make(),6,()=>alienFrameInput(controls,1/30,{sample:()=>({active:true,moveX:0,x:180,autoFire:false})},balance.controls.deadzone));assert.equal(sum(noPress),0);
 const rapid=windows(make(),8,undefined,m=>m.pickups.push({kind:2,x:m.player.x,y:m.player.y,vy:0}));assert.ok(Math.max(...rapid)<=6,`rapid ${rapid}`);
 const spread=windows(make(),8,undefined,m=>m.pickups.push({kind:0,x:m.player.x,y:m.player.y,vy:0}));assert.ok(Math.max(...spread.slice(1,8))<=9,`spread ${spread}`);
 const wings=windows(make(),6,undefined,m=>m.pickups.push({kind:4,x:m.player.x,y:m.player.y,vy:0}));assert.ok(Math.max(...wings.slice(1,6))<=10,`wings ${wings}`);
});
test('v15 Vulcan comes only in short bursts: about one second, once the meter fills (~9 s of firing), at most 15 bullets a second',()=>{
 const m=make();const log=[];let prev=0,bursts=0,burstSeconds=0,maxWin=0;
 for(let i=0;i<30*30;i++){const was=m.burst;m.update(1/30,{firing:true});if(m.burst){burstSeconds+=1/30;if(!was)bursts++;}if((i+1)%30===0){const s=m.snapshot(),n=s.fired-prev-0;prev=s.fired;log.push(n);maxWin=Math.max(maxWin,n);}}
 assert.ok(bursts>=2&&bursts<=4,`bursts ${bursts}`);assert.ok(burstSeconds/bursts<=1.2,`burst ${burstSeconds/bursts}`);
 assert.ok(maxWin<=18,`max window ${maxWin}`);assert.ok(sum(log)/30<=7.2,`avg ${sum(log)/30}`);
 const idle=make();for(let i=0;i<30*12;i++)idle.update(1/30,{});assert.equal(idle.burst,false);assert.equal(idle.snapshot().fired,0);
});
test('fireInterval and chargeStep: pure rules',()=>{
 assert.ok(fireInterval(v15,{rateGear:5})>=v15.minInterval-1e-9);assert.equal(fireInterval(v15,{rateGear:1}),v15.normalInterval);
 assert.ok(fireInterval(v15,{burst:true})<fireInterval(v15,{}));assert.equal(fireInterval(v15,{spread:true}),v15.normalInterval*v15.spreadSlow);
 let s={charge:0,burst:0},started=0;for(let i=0;i<30*10;i++){s=chargeStep(s,true,1/30,v15);if(s.started)started++;}assert.equal(started>=1,true);
 assert.equal(chargeStep({charge:.5,burst:0},false,1,v15).charge,.5-v15.restRate);
});
test('v15 stage 1 lasts 85-135 s for base, upgraded and heavy gear, with about half the bullets of v14 (measured)',()=>{
 const profiles=[{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}},heavy];
 let on=0;for(const profile of profiles){const rs=[1,2,3].map(s=>stage(1,s,{profile})),avg=rs.reduce((n,r)=>n+r.seconds,0)/3;assert.ok(avg>=85&&avg<=135,`avg ${avg}`);on+=sum(rs.map(r=>r.fired));}
 globalThis.__alienV15=false;let off=0;try{for(const profile of profiles)off+=sum([1,2,3].map(s=>stage(1,s,{profile}).fired));}finally{globalThis.__alienV15=undefined;}
 assert.ok(on<=off*.65,`bullets ${on} vs v14 ${off}`);
});
