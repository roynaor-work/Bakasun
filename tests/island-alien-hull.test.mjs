import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// v24.4 (Roy after v24.3: "the fire still goes through"): a round that runs through the DRAWN rim of the front ship (3D view: 1.65 x the hit
// diameter) or a Vulcan side pellet that crosses it must stop there, not fly on into the ship behind. ?alienHull=0 restores v24.3.
const {createAlienModel}=await import('../workout/island/minigames/alien-flight-model.mjs');
const {alienHullRadius,pelletReach,hullContactRadius,alienHullEnabled}=await import('../workout/island/minigames/alien-hull.mjs');
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
const PX=390/480,ASPECT=(844/390)/(360/480),step=1/60;

function fixture({search='',offset,vulcan=false,hull=true}){
 globalThis.location={search};
 const balance=structuredClone(config.alienDefense);
 Object.assign(balance.levels[0],{rows:1,columns:2,waves:1,enemyRoster:[0],enemyKinds:1});
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 const model=createAlienModel({config,balance,level:1,random:()=>.5,equipment:{weapon:0},completion:'waves',roundChoices:false});
 model.effectAspect=ASPECT;if(hull)model.hull={pxPerUnit:PX};
 const [rear,front]=model.aliens;
 // The front ship is grazed `offset` logical units off centre; the rear ship sits right on the round's line, one row behind.
 for(const [a,x,y] of [[front,180,280],[rear,180+offset,238]])Object.assign(a,{x,y,baseX:x,baseY:y,originY:y,entry:0,entrySide:0,hp:100,maxHp:100,shield:0,diveAge:-1,launched:100});
 model.update(.001,{firing:true});
 const shot=model.shots.find(s=>!s.wing);assert.ok(shot);model.shots.splice(0,model.shots.length,shot);
 Object.assign(shot,{x:180+offset,y:340,vx:0,vy:-balance.shotSpeed,hp:1,damage:1,vulcan});
 return {model,front,rear,balance};
}
const fly=(m,seconds=.6)=>{for(let i=0;i<Math.ceil(seconds/step);i++)m.update(step,{});};

test('hull radius is the drawn half-width (alien-view 1.65 x, capped), never below the old circle',()=>{
 const a={radius:13.175,boss:false,shield:0};
 assert.ok(Math.abs(alienHullRadius(a,PX)-13.175*1.65)<1e-9);
 assert.ok(alienHullRadius({...a,shield:1},PX)>alienHullRadius(a,PX));
 assert.equal(alienHullRadius(a,0),0,'no 3D view: the canvas draws the hit circle');
 assert.ok(alienHullRadius({radius:30,boss:false,shield:0},2)<=62/2/2+1e-9,'the 62 px cap of alien-view');
 assert.ok(hullContactRadius(a,{shotRadius:5})===18.175);assert.ok(hullContactRadius(a,{shotRadius:5,pxPerUnit:PX})>18.175);
 assert.ok(pelletReach(160,{pellets:3,pelletSpread:.035})>8&&pelletReach(160,{pellets:1})===0);
 assert.equal(alienHullEnabled('?alienHull=0'),false);assert.equal(alienHullEnabled(''),true);
});

test('a round through the drawn rim of the front ship stops there; the ship behind is untouched',()=>{
 const {model,front,rear}=fixture({offset:7});fly(model);
 assert.ok(front.hp<100,'the grazed front ship takes the round');assert.equal(rear.hp,100,'nothing reaches the ship behind');assert.equal(model.shots.length,0);
});
test('?alienHull=0 restores v24.3: the same round misses the rim and hits the ship behind',()=>{
 for(const search of ['?alienHull=0','?phoneFixes=0&phoneFixC=1']){const {model,front,rear}=fixture({search,offset:7});fly(model);
  assert.equal(front.hp,100,search);assert.ok(rear.hp<100,search);}
 const {model,front,rear}=fixture({offset:7,hull:false});fly(model);assert.equal(front.hp,100,'without a 3D view the old circle stays');assert.ok(rear.hp<100);
});
test('a Vulcan side pellet that reaches the front ship sticks in it (hidden, a flash), without damage; the middle pellet flies on',()=>{
 const {model,front,rear}=fixture({offset:10,vulcan:true});
 for(let i=0;i<60&&!model.shots[0]?.pelletMask;i++)model.update(step,{});
 const shot=model.shots[0];assert.ok(shot,'the round itself did not touch the front hull');assert.ok(shot.pelletMask>0,'a side pellet stuck');
 assert.ok(model.vulcanImpacts.some(i=>i.pellet),'with a small impact flash');assert.equal(front.hp,100,'no damage from a side pellet: Vulcan damage unchanged');
 const old=fixture({offset:10,vulcan:true,search:'?alienHull=0'});fly(old.model);assert.equal(old.front.hp,100);assert.ok(!old.model.vulcanImpacts.some(i=>i.pellet));
});
test('the Vulcan pellet drawing skips a pellet that stuck',async()=>{
 const {drawV25Shot}=await import('../workout/island/minigames/alien-v25-draw.mjs');
 const calls=[];const p=new Proxy({},{get:(o,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):(...a)=>{calls.push(k);}});
 const m={player:{y:440},vulcanCfg:{pellets:3,pelletSpread:.035}};
 drawV25Shot(p,{x:100,y:200,vx:0,vy:-400},m);const all=calls.filter(k=>k==='stroke').length;calls.length=0;
 drawV25Shot(p,{x:100,y:200,vx:0,vy:-400,pelletMask:1},m);assert.equal(calls.filter(k=>k==='stroke').length,all-1);
});
test('a round well clear of both ships still misses (the hull is not a magnet)',()=>{
 const {model,front,rear}=fixture({offset:14});rear.x=rear.baseX=150;fly(model,1.2);
 assert.equal(front.hp,100);assert.equal(rear.hp,100);
});
