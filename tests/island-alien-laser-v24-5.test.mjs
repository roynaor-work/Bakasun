// v24.5 laser (Roy, 18/11/2026: "the laser upgrade stops quite quickly and does not work"): the cannon's laser beam pierces again, the
// pickup laser keeps its own clock; plain and Vulcan rounds still stop at their first hull. ?alienLaser=0 restores v24.4.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {alienLaserV25Enabled,laser25Config,laserPierceCount,shotPierces,drawLaserBeam,drawLaserTimer,LASER25_DEFAULTS} from '../workout/island/minigames/alien-laser.mjs';
import {drawUltraAlienEffects} from '../workout/island/minigames/ultra-alien-effects.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
const step=1/60;
// v24.9: a round is a piercing beam only while the laser bonus clock runs (bonus:true takes the token); the permanent laser alone stops at the
// first hull (tests/island-alien-v24-9.test.mjs). BEAM keeps the v24.6 burst out of the way so only the round is measured.
const BEAM='?alienLaserBurst=0';
function make({search='',weapon=0,count=2,ys=[160,280],bonus=false}={}){
 globalThis.location={search};
 const balance=structuredClone(config.alienDefense);
 Object.assign(balance.levels[0],{rows:1,columns:count,waves:1,enemyRoster:[0],enemyKinds:1});
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 balance.v11.laserEvery=[999,999];/* no kind-2 volleys in the way */
 const model=createAlienModel({config,balance,level:1,random:()=>.5,equipment:{weapon},completion:'waves',roundChoices:false});
 model.hull={pxPerUnit:390/480};
 model.aliens.forEach((a,i)=>Object.assign(a,{x:180,y:ys[i],baseX:180,baseY:ys[i],originY:ys[i],entry:0,entrySide:0,hp:100,maxHp:100,shield:0,diveAge:-1,launched:100}));
 model.player.x=180;
 if(bonus){model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});}
 return {model,balance};
}
/** One real round from the production fire gate, alone on the field, straight up the column. */
function oneRound(model,input={firing:true}){
 model.update(.001,input);const shot=model.shots.find(s=>!s.wing&&s.kind!==2);assert.ok(shot,'the fire gate produced a round');
 model.shots.splice(0,model.shots.length,shot);Object.assign(shot,{x:180,y:340,vx:0});return shot;
}
const fly=(m,seconds=1)=>{for(let i=0;i<Math.ceil(seconds/step);i++)m.update(step,{});};

test('laser v24.5 is on by default and ?alienLaser=0 (or phoneFixC=0, which pierces anyway) turns it off',()=>{
 assert.equal(alienLaserV25Enabled(''),true);assert.equal(alienLaserV25Enabled('?alienLaser=0'),false);assert.equal(alienLaserV25Enabled('',false),false);
 const {model}=make({search:'?alienLaser=0',weapon:2});assert.equal(model.laser25,undefined);
 const {model:b}=make({search:'?phoneFixC=0',weapon:2});assert.equal(b.laser25,undefined);
 assert.equal(laserPierceCount(config.alienDefense,0,laser25Config(config.alienDefense)),config.alienDefense.pickups.laserPierce);
});
test('laser v24.5: the laser beam (bonus running) pierces the front hull and hits the aligned ship behind, each once',()=>{
 const {model}=make({weapon:2,bonus:true,search:BEAM}),[rear,front]=model.aliens,shot=oneRound(model);
 assert.equal(shot.kind,1);assert.ok(shotPierces(shot),'a cannon laser round is a beam');
 let flashes=0;for(let i=0;i<72;i++){model.update(step,{});flashes=Math.max(flashes,model.laserHits.length);}
 assert.ok(front.hp<100&&rear.hp<100,`both ships take the beam (front ${front.hp}, rear ${rear.hp})`);
 assert.equal(front.hp,rear.hp,'the same damage per ship, each ship once');assert.equal(model.snapshot().hits,2);
 assert.equal(flashes,2,'a flash on each ship it passed');assert.equal(model.laserHits.length,0,'the flashes expire');
});
test('laser v24.5: a beam stops after laserPierce ships (4), not across the whole screen',()=>{
 const ys=[40,100,160,220,280,340-60];const {model}=make({weapon:2,count:6,ys,bonus:true,search:BEAM});const shot=oneRound(model);Object.assign(shot,{y:400});fly(model,1.5);
 const hit=model.aliens.filter(a=>a.hp<100).length;assert.equal(hit,laserPierceCount(config.alienDefense,0,LASER25_DEFAULTS));assert.equal(model.shots.length,0);
});
test('laser v24.5: plain cannon rounds and Vulcan rounds still stop at the first hull (the v24.3/v24.4 fix stays)',()=>{
 {const {model}=make({weapon:0}),[rear,front]=model.aliens,shot=oneRound(model);assert.equal(shot.kind,0);assert.equal(shotPierces(shot),false);fly(model);
  assert.ok(front.hp<100);assert.equal(rear.hp,100,'plain round must not go through');assert.equal(model.shots.length,0);}
 {const {model}=make({weapon:2}),[rear,front]=model.aliens,shot=oneRound(model,{vulcan:true});assert.equal(shot.vulcan,true);assert.equal(shotPierces(shot),false);fly(model);
  assert.ok(front.hp<100);assert.equal(rear.hp,100,'a Vulcan round with the laser on must not go through');}
});
test('laser v24.5: a shield takes a charge and the beam goes on',()=>{
 const {model}=make({weapon:2,bonus:true,search:BEAM}),[rear,front]=model.aliens;front.shield=1;oneRound(model);fly(model,1.2);
 assert.equal(front.shield,0);assert.equal(front.hp,100,'the shield took that hit');assert.ok(rear.hp<100,'the beam reached the ship behind');
});
test('laser v24.5: the pickup laser lasts 16 s on its own clock; rapid fire or a shield picked up meanwhile does not end it',()=>{
 const {model}=make();model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});
 assert.ok(Math.abs(model.laserTime-LASER25_DEFAULTS.seconds)<.01);assert.notEqual(model.powerup,1);
 fly(model,3);model.pickups.push({kind:2,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});assert.equal(model.powerup,2);
 fly(model,8);assert.ok(model.laserTime>4,'still on 11 s later');const shot=oneRound(model);assert.ok(shotPierces(shot),'rapid fire on, laser beam still pierces');
 model.pickups.push({kind:3,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});assert.ok(model.laserTime>4,'a shield does not end it either');
 model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});assert.ok(model.laserTime>15.9,'a second laser refills it');
 fly(model,16.2);assert.equal(model.laserTime,0);assert.equal(oneRound(model).kind,0,'after the clock the cannon is plain again');
});
test('laser v24.5 rollback ?alienLaser=0: the v24.4 laser (stops at the first hull, the pickup on the shared slot for 10 s)',()=>{
 const {model}=make({search:'?alienLaser=0',weapon:2}),[rear,front]=model.aliens,shot=oneRound(model);assert.equal(shot.kind,1);assert.equal(shotPierces(shot),false);fly(model);
 assert.ok(front.hp<100);assert.equal(rear.hp,100);
 const {model:p}=make({search:'?alienLaser=0'});p.pickups.push({kind:1,x:p.player.x,y:p.player.y,vy:0});p.update(.001,{});assert.equal(p.powerup,1);assert.equal(p.laserTime,0);
 p.pickups.push({kind:2,x:p.player.x,y:p.player.y,vy:0});p.update(.001,{});assert.equal(p.powerup,2,'v24.4: rapid fire replaced the laser');
});
function recorder(){return new Proxy({calls:[],canvas:{clientHeight:390}},{get(p,k){if(k in p)return p[k];if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>p.calls.push([k,...args]);},set(p,k,v){p[k]=v;return true;}});}
test('laser v24.5: the beam is drawn long (78 units, was a 52-unit streak) and the ship shows the laser clock ring',()=>{
 const p=recorder();drawLaserBeam(p,{x:100,y:100,vx:0,vy:-460},1,1);const lines=p.calls.filter(c=>c[0]==='lineTo');assert.ok(lines.some(c=>c[2]>=LASER25_DEFAULTS.beamLength-1));
 const {model}=make({weapon:2});model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});oneRound(model);
 const q=recorder();drawLaserTimer(q,model,1,1,model.laser25);assert.ok(q.calls.some(c=>c[0]==='arc'&&c[3]===36));
 const r=recorder();drawUltraAlienEffects(r,model,config.alienDefense,1,{height:480});assert.ok(r.calls.some(c=>c[0]==='lineTo'&&c[2]>=LASER25_DEFAULTS.beamLength-1),'the phone renderer draws the beam');
});
test('laser v24.5: alien-laser.mjs is in the offline shell',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
 assert.ok(manifest.shell.includes('minigames/alien-laser.mjs'));assert.ok(manifest.files['minigames/alien-laser.mjs']);
});
