import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Run this SAME file against pristine and applied trees. The pristine run must fail.
const root=process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url));
const moduleAt=p=>import(pathToFileURL(path.join(root,p)).href);
const {createAlienModel}=await moduleAt('workout/island/minigames/alien-flight-model.mjs');
const {drawV25Fx}=await moduleAt('workout/island/minigames/alien-v25-draw.mjs');
const config=JSON.parse(await readFile(path.join(root,'workout/island/data/config.json'),'utf8')).minigames;
const step=1/60;
function fixture(search='',kind=1){
 globalThis.location={search};
 const balance=structuredClone(config.alienDefense);
 Object.assign(balance.levels[0],{rows:1,columns:2,waves:1,enemyRoster:[0],enemyKinds:1});
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 const model=createAlienModel({config,balance,level:1,random:()=>.5,equipment:{weapon:2},completion:'waves',roundChoices:false});
 // Two legal, aligned hulls; the rear hull is stored first to check contact ordering.
 const [rear,front]=model.aliens;
 for(const [a,y] of [[rear,160],[front,280]])Object.assign(a,{x:180,y,baseX:180,baseY:y,originY:y,entry:0,entrySide:0,hp:100,maxHp:100,shield:0,diveAge:-1,launched:100});
 // Use a real pooled upgraded projectile produced by the production fire gate.
 model.update(.001,{firing:true});
 const shot=model.shots.find(s=>!s.wing);assert.ok(shot);assert.equal(shot.kind,1);
 model.shots.splice(0,model.shots.length,shot);
 Object.assign(shot,{x:180,y:340,vx:0,vy:-balance.shotSpeed,kind,hp:8,damage:1,vulcan:false});
 return {model,balance,front,rear,shot};
}
function fly(m,seconds=1){for(let i=0;i<Math.ceil(seconds/step);i++)m.update(step,{});}
function recorder(){return new Proxy({calls:[],canvas:{clientHeight:390}},{get(p,k){if(k in p)return p[k];if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>p.calls.push([k,...args]);},set(p,k,v){p[k]=v;return true;}});}

test('C upgraded cannon stops on the front hull; the aligned rear hull is unharmed',()=>{
 const {model,front,rear}=fixture();fly(model);
 assert.equal(front.hp,99);assert.equal(rear.hp,100,'a single upgraded shot must not hit the ship behind');
 assert.equal(model.shots.length,0,'the projectile disappears at the first hull');assert.equal(model.snapshot().hits,1);
});
test('C a fast segment that crosses two hulls hits only the earliest contact, independent of array order',()=>{
 for(const kind of [0,1,2]){const {model,front,rear,shot}=fixture('',kind);shot.vy=-6000;model.update(.04,{});
  assert.equal(front.hp,99,`kind ${kind}: front damage`);assert.equal(rear.hp,100,`kind ${kind}: rear damage`);assert.equal(model.shots.length,0);
  assert.ok(shot.y>=front.y&&shot.y<=front.y+front.radius+config.alienDefense.shotRadius+.01,'released projectile ends at the hull, not beyond it');
 }
});
test('C an impact on the regular/upgraded cannon is drawn briefly and cleaned up',()=>{
 const {model}=fixture();while(!model.snapshot().hits)model.update(step,{});
 assert.equal(model.vulcanImpacts.length,1,'regular fire receives the existing modest impact burst');
 const impact=model.vulcanImpacts[0],p=recorder();
 assert.ok(drawV25Fx(p,{...model,time:impact.at+.05,vulcanOn:false},1)>=1,'production renderer draws the contact burst');
 assert.ok(p.calls.some(c=>c[0]==='arc'||c[0]==='drawImage'));
 fly(model,.35);assert.equal(model.vulcanImpacts.length,0,'impact records expire after 300 ms');
});
test('C shield contact absorbs the shot and protects both hulls',()=>{
 const {model,front,rear}=fixture();front.shield=1;fly(model);
 assert.equal(front.shield,0);assert.equal(front.hp,100);assert.equal(rear.hp,100);assert.equal(model.shots.length,0);
});
test('C destroying the first hull still consumes the projectile',()=>{
 const {model,front,rear}=fixture();front.hp=front.maxHp=.5;fly(model);
 assert.ok(!model.aliens.includes(front));assert.equal(rear.hp,100);assert.equal(model.shots.length,0);
});
test('C impact list is bounded at 24 even under a dense burst',()=>{
 const {model,front}=fixture();model.shots.length=0;
 for(let i=0;i<30;i++)model.shots.push({x:180,y:front.y+front.radius+4,vx:0,vy:-6000,hp:8,kind:1,damage:.01,vulcan:false,hitIds:new Set(),slot:i});
 model.update(.04,{});assert.equal(model.vulcanImpacts.length,24);assert.equal(model.shots.length,0);
});
for(const flag of ['?phoneFixC=0','?phoneFixes=0'])test(`C rollback ${flag} restores piercing and Vulcan-only effects`,()=>{
 const {model,front,rear}=fixture(flag);fly(model,.45);
 assert.equal(front.hp,99);assert.equal(rear.hp,99);assert.equal(model.snapshot().hits,2);
 assert.equal(model.vulcanImpacts.length,0);assert.equal(model.shots.length,1);
});

function weaponValue({rank=0,weapon=0,search='',temporary=false}={}){
 globalThis.location={search};const balance=structuredClone(config.alienDefense);
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 balance.v11.laserEvery=[0,0];
 const m=createAlienModel({config,balance,level:1,random:()=>.5,permanentUpgrades:{laser:rank},equipment:{weapon},roundChoices:false,completion:'waves'});
 const hp=m.aliens[0].maxHp;
 if(temporary){m.pickups.push({kind:1,x:m.player.x,y:m.player.y,vy:0});m.update(.001,{});}
 m.update(.001,{firing:true});const main=m.shots.find(s=>s.kind!==2&&!s.wing),volley=m.shots.find(s=>s.kind===2);
 assert.ok(main&&volley);const volleyDamage=volley.damage,target=m.aliens[0],kind=main.kind;
 m.aliens.splice(1);Object.assign(target,{x:180,y:280,baseX:180,baseY:280,originY:280,entry:0,entrySide:0,shield:0,diveAge:-1});
 m.shots.splice(0,m.shots.length,main);Object.assign(main,{x:180,y:300,vx:0,vy:-balance.shotSpeed});
 const before=target.hp;m.update(.04,{});const delivered=before-target.hp;assert.ok(delivered>0,'a production first-hull collision must deliver the upgrade damage');
 return {damage:delivered,kind,hp,volleyDamage};
}

test('C purchased laser ranks 1..max increase first-hull damage and never lose value against their own HP scaling',()=>{
 const values=Array.from({length:config.alienDefense.campaign.maxStack},(_,i)=>weaponValue({rank:i+1}));
 console.log('C laser-rank-value',JSON.stringify(values.map((v,i)=>({rank:i+1,firstHullDamage:v.damage,enemyHp:v.hp,damagePerHp:v.damage/v.hp}))));
 for(let i=1;i<values.length;i++){
  assert.ok(values[i].damage>values[i-1].damage,'another earned laser rank must increase actual first-hull damage');
  assert.ok(values[i].damage/values[i].hp>=values[i-1].damage/values[i-1].hp-1e-12,'enemy HP scaling must not make a higher rank worse');
 }
 assert.ok(values[0].damage>weaponValue({rank:1,search:'?phoneFixC=0'}).damage,'the lost penetration output is carried by the first hull hit');
});
test('C compensation uses only the existing laser output/HP coefficient; cannon, temporary laser and volley damage stay unchanged',()=>{
 const equipmentLaser=weaponValue({weapon:2}),oldEquipmentLaser=weaponValue({weapon:2,search:'?phoneFixC=0'});
 assert.ok(equipmentLaser.damage>oldEquipmentLaser.damage,'purchased weapon-2 laser retains its lost penetration output');
 for(const options of [{},{temporary:true}]){
  const current=weaponValue(options),old=weaponValue({...options,search:'?phoneFixC=0'});
  assert.equal(current.damage,old.damage,'no arbitrary buff to the cannon or a temporary pickup with no matching HP coefficient');
 }
 for(const rank of [0,1,2,3])assert.equal(weaponValue({rank}).volleyDamage,config.alienDefense.v11.laserDamage,'kind-2 volleys keep their existing damage');
 for(const search of ['?phoneFixC=0','?phoneFixes=0']){
  const values=[1,2,3].map(rank=>weaponValue({rank,search}));assert.ok(values.every(v=>v.damage===values[0].damage),'rollback retains the old penetration-based rank contract');
 }
});
