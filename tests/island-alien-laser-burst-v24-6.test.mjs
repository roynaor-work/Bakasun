// v24.6 laser burst (Roy, 20/11/2026: "the laser fired just a tiny bit now and then ... if there is a short laser bonus, every press fires a
// laser for a few seconds"): while the pickup laser runs, each press of a fire button lights a beam for BURST.seconds that hits every ship in
// its column. ?alienLaserBurst=0 keeps v24.5 (the piercing cannon rounds only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {alienLaserBurstEnabled,burstStep,burstPress,BURST,drawLaserBurst} from '../workout/island/minigames/alien-laser-burst.mjs';
import {drawUltraAlienEffects} from '../workout/island/minigames/ultra-alien-effects.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
const step=1/60;
function make({search='',weapon=0,count=3,ys=[100,180,260],laser=true}={}){
 globalThis.location={search};
 const balance=structuredClone(config.alienDefense);
 Object.assign(balance.levels[0],{rows:1,columns:count,waves:1,enemyRoster:[0],enemyKinds:1});
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 balance.v11.laserEvery=[999,999];
 const model=createAlienModel({config,balance,level:1,random:()=>.5,equipment:{weapon},completion:'waves',roundChoices:false});
 model.hull={pxPerUnit:390/480};
 model.aliens.forEach((a,i)=>Object.assign(a,{x:180,y:ys[i],baseX:180,baseY:ys[i],originY:ys[i],entry:0,entrySide:0,hp:1e6,maxHp:1e6,shield:0,diveAge:-1,launched:100}));
 model.player.x=180;
 if(laser){model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});}
 return {model,balance};
}
/** Hold or tap a button; rounds of the cannon/Vulcan are removed every frame so only the beam can hit. */
function run(model,seconds,input){for(let i=0;i<Math.round(seconds/step);i++){model.update(step,typeof input==='function'?input(i*step):input);model.shots.length=0;}}

test('laser burst is on by default and ?alienLaserBurst=0 (or ?alienLaser=0) turns it off',()=>{
 assert.equal(alienLaserBurstEnabled(''),true);assert.equal(alienLaserBurstEnabled('?alienLaserBurst=0'),false);
 assert.ok(make().model.laserBurst);assert.equal(make({search:'?alienLaserBurst=0'}).model.laserBurst,undefined);
 assert.equal(make({search:'?alienLaser=0'}).model.laserBurst,undefined,'the burst rides on the v24.5 laser clock');
});
test('laser burst clock: a press lights it for BURST.seconds, a held button keeps it lit, nothing without the bonus',()=>{
 assert.deepEqual(burstPress({vulcan:true},false),{down:true,press:true});assert.deepEqual(burstPress({firing:true},true),{down:true,press:false});
 let left=burstStep(0,{press:true,down:true,bonus:true,dt:step});assert.equal(left,BURST.seconds);
 left=burstStep(left,{press:false,down:false,bonus:true,dt:1});assert.ok(Math.abs(left-(BURST.seconds-1))<1e-9);
 assert.equal(burstStep(left,{press:false,down:true,bonus:true,dt:step}),BURST.seconds,'held: stays lit');
 assert.equal(burstStep(0,{press:true,down:true,bonus:false,dt:step}),0,'no bonus, no beam');
});
test('laser burst: one tap (0.1 s) with the bonus hits every ship in the column for BURST.seconds; v24.5 hits nothing without rounds',()=>{
 const {model}=make();run(model,.1,{vulcan:true});run(model,BURST.seconds+.5,{});
 const s=model.snapshot().laserBurst;assert.equal(s.presses,1);assert.ok(Math.abs(s.lit-(BURST.seconds+.1))<.05,`lit ${s.lit} s (the 0.1 s the finger was down + BURST.seconds)`);
 for(const a of model.aliens)assert.ok(a.hp<1e6,'every ship in the column took the beam');
 const ticks=Math.round((BURST.seconds+.1)/BURST.tick);assert.ok(Math.abs(s.ticks-ticks)<=2,`ticks ${s.ticks}`);assert.ok(s.hits>=3*(ticks-2),`hits ${s.hits}`);
 assert.equal(model.aliens[0].hp,model.aliens[2].hp,'the same damage per ship along the column');
 const {model:old}=make({search:'?alienLaserBurst=0'});run(old,.1,{vulcan:true});run(old,BURST.seconds+.5,{});
 for(const a of old.aliens)assert.equal(a.hp,1e6,'v24.5: the beam does not exist (the rounds were removed in this test)');
});
test('laser burst: no beam without the pickup bonus, and not from the permanent laser (weapon 2)',()=>{
 const {model}=make({laser:false,weapon:2});run(model,.1,{vulcan:true});run(model,1,{});
 assert.equal(model.snapshot().laserBurst.lit,0);for(const a of model.aliens)assert.equal(a.hp,1e6);
});
test('laser burst: each press relights it; ships out of the column are not hit; a shield takes a charge per tick',()=>{
 const {model}=make({ys:[100,180,260]});model.aliens[1].x=model.aliens[1].baseX=40;model.aliens[2].shield=2;
 run(model,4,t=>({firing:Math.floor(t/1.5)%2===0&&t%1.5<.1}));
 const s=model.snapshot().laserBurst;assert.ok(s.presses>=2,`presses ${s.presses}`);
 assert.equal(model.aliens[1].hp,1e6,'the ship out of the column is untouched');assert.equal(model.aliens[2].shield,0,'the shield was worn down by ticks');
});
test('laser burst: drawn by both drawers while lit, nothing when off',()=>{
 const calls=[];const p=new Proxy({},{get:(o,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):(...a)=>{calls.push(k);},set:()=>true});
 drawLaserBurst(p,{time:1,laserBurst:{left:0}});assert.equal(calls.length,0);
 drawLaserBurst(p,{time:1,laserBurst:{left:1,x:180,y:400,top:-40,halfWidth:7}});assert.ok(calls.includes('stroke')&&calls.includes('arc'));
 assert.equal(typeof drawUltraAlienEffects,'function');
});
