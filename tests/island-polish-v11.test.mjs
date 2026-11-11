import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalAimStep,navalAimGain} from '../workout/island/minigames/naval-controls.mjs';
import {navalMissionState} from '../workout/island/minigames/naval-campaign.mjs';
import {navalFollowYaw} from '../workout/island/minigames/naval-aim-flag.mjs';
import {projectNavalPoint,navalWorldPoint} from '../workout/island/minigames/naval-camera.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,nb=config.navalDuel,fb=config.fireRescue;

test('Naval: a drag to the right moves the landing mark to the right on screen, then the view catches up',()=>{
 const m=createNavalModel({config,balance:nb,level:3,seed:0,random:seededRandom(0)}),W=844,H=390;
 const mark=()=>projectNavalPoint(navalWorldPoint(m.prediction.end.x,m.prediction.end.z,nb,0),m.camera,W,H);
 for(let i=0;i<30;i++)m.update(.02,{});
 const t0=m.turret,step=(a)=>m.update(.016,{aimHeld:true,aimYaw:a.yaw,aimElevation:a.elevation,aimPower:1});
 let a={yaw:t0.yaw,elevation:t0.elevation};for(let i=0;i<40;i++)step(a);
 const base=mark(),track={},cfg={...nb};let marks=[];
 for(let f=1;f<=30;f++){a=navalAimStep(a,5,0,16,track,cfg);step(a);marks.push(mark().x-base.x);}
 assert.ok(marks.at(-1)>10,'mark leads in the drag direction: '+marks.at(-1));
 assert.ok(marks.every((x,i)=>i===0||x>=marks[i-1]-1),'monotone, no jumps back');
 for(let f=0;f<60;f++)step(a);
 assert.ok(Math.abs(mark().x-base.x)<12,'settles back near the centre: '+(mark().x-base.x));
});
test('Naval: the same finger distance gives the same turn at any drag speed (fixed yaw gain)',()=>{
 const slow=navalAimGain(10,nb).yaw,fast=navalAimGain(900,nb).yaw;assert.equal(slow,fast);
 const mid=navalAimStep({yaw:0,elevation:10},100,0,16,{},nb).yaw;assert.ok(Math.abs(mid/(Math.PI/180)-100*nb.aimControls.follow.yawFixed)<.5);
});
test('Naval: the camera lead is capped and shot yaw equals aim yaw (what you see is what fires)',()=>{
 const cap=nb.aimControls.follow.maxLeadDegrees*Math.PI/180;let cam=0;
 for(let i=0;i<200;i++)cam=navalFollowYaw(cam,1.5,.016,nb,true);assert.ok(1.5-cam<1e-3);
 assert.ok(Math.abs(navalFollowYaw(0,1.5,.016,nb,true)-1.5)<=cap+1e-9);
 const m=createNavalModel({config,balance:nb,level:3,seed:0,random:seededRandom(0)});
 m.update(.02,{aimHeld:true,aimYaw:.3,aimElevation:12,aimPower:1});m.update(.02,{fireRelease:true,aimYaw:.3,aimElevation:12,aimPower:1});
 assert.ok(Math.abs(Math.atan2(m.ball.launch.vz,m.ball.launch.vx)-.3)<1e-6,'launch direction equals aimed yaw');
});

const fire=()=>createFireModel({config,balance:fb,level:1,random:seededRandom(3)});
test('Fire: the truck always faces its direction of travel and never reverses',()=>{
 for(const [dx,dz] of [[1,0],[0,-1],[-1,0],[0,1],[.7,-.7]]){
  const m=fire(),t=m.truck;let minAlong=Infinity,lastX=t.x,lastZ=t.z,moved=0;
  for(let i=0;i<150;i++){m.update(.02,{moveX:dx,moveZ:dz});const vx=t.x-lastX,vz=t.z-lastZ;lastX=t.x;lastZ=t.z;
   if(Math.hypot(vx,vz)>.01){moved++;const along=vx*-Math.sin(t.yaw)+vz*-Math.cos(t.yaw);minAlong=Math.min(minAlong,along/Math.hypot(vx,vz));}}
  assert.ok(moved>20,`moved for ${dx},${dz}`);assert.ok(minAlong>=-.1,`never backwards (${dx},${dz}): ${minAlong}`);
 }
});
test('Fire: speed ramps up smoothly, slows for sharp turns and the wheel turns a parked truck slowly',()=>{
 const m=fire(),t=m.truck,speeds=[];for(let i=0;i<40;i++){m.update(.02,{moveX:0,moveZ:-1});speeds.push(t.speed);}
 for(let i=1;i<speeds.length;i++)assert.ok(speeds[i]-speeds[i-1]<=fb.vehicle.speed/fb.vehicle.feel.accelerationSeconds*.02+1e-6);
 const u=fire(),ut=u.truck;for(let i=0;i<60;i++)u.update(.02,{moveX:0,moveZ:-1});
 let minRatio=1;for(let i=0;i<40;i++){u.update(.02,{moveX:0,moveZ:1});minRatio=Math.min(minRatio,ut.speed/(fb.vehicle.speed));assert.ok(ut.speed>=0);}
 assert.ok(minRatio<.8,'a U-turn slows the truck: '+minRatio);
});
test('Fire: the visual front is the travel direction (config headingOffset 0, wheel roll matches)',()=>{
 assert.equal(fb.vehicle.feel.headingOffset,0);assert.equal(fb.vehicle.feel.wheelSign,-1);
});

import {navalReleaseSample} from '../workout/island/minigames/naval-aim-flag.mjs';
test('Naval v9: the thumb-lift filter returns the aim from 70 ms before release and never the jittered last sample',()=>{
 const g={engaged:true,lastT:1000,aim:{yaw:.5,elevation:20},hist:[{t:700,yaw:.10,elevation:10},{t:900,yaw:.12,elevation:10.2},{t:925,yaw:.13,elevation:10.3},{t:960,yaw:.30,elevation:12},{t:1000,yaw:.5,elevation:20}]};
 navalReleaseSample(g,70);assert.equal(g.aim.yaw,.13);assert.equal(g.aim.elevation,10.3);
 const quick={engaged:false,lastT:1000,aim:{yaw:.5,elevation:20},hist:[{t:900,yaw:.1,elevation:1}]};navalReleaseSample(quick,70);assert.equal(quick.aim.yaw,.5);
});
test('Naval v9: the aim magnet fades to nothing at the edge of its window and never moves a shot past the ideal',()=>{
 const m=createNavalModel({config,balance:nb,level:8,seed:3,random:seededRandom(3)});for(let i=0;i<150;i++)m.update(.02,{});
 const e=m.enemies.find(e=>e.active);m.update(.02,{aimHeld:true,autoAim:true,selectTargetIndex:e.index});const ideal={...m.turret},R=nb.aimControls.assist.yawRangeDeg;
 let last=-1;for(const off of [0,.5,1,2,3,R+.5,R+3]){m.update(.02,{aimHeld:true,aimYaw:ideal.yaw+off*Math.PI/180,aimElevation:ideal.elevation,aimPower:1});const got=(m.turret.yaw-ideal.yaw)*180/Math.PI;
  assert.ok(got<=off+.2&&got>=-.2,`never past ideal at ${off}: ${got}`);if(off>=R)assert.ok(Math.abs(got-off)<(off>R+1?1e-6:.05),`no pull outside the window at ${off}`);assert.ok(got>=last-1e-9);last=got;}
});

test('Naval v9 bases: three base stages (9, 16, 24) with one, two and one strong base, ships that keep sailing, and a mission that ends when the bases sink',()=>{
 const stages={9:{bases:1,cannons:2},16:{bases:2,cannons:2},24:{bases:1,cannons:4}};
 for(const [stage,want] of Object.entries(stages)){
  const m=createNavalModel({config,balance:nb,level:+stage,seed:2,random:seededRandom(2)}),bases=m.enemies.filter(e=>e.behavior==='base'),ships=m.enemies.filter(e=>e.behavior!=='base');
  assert.equal(bases.length,want.bases);assert.equal(m.mission.id,'bases');assert.ok(ships.length>=3,'moving ships stay in the stage');
  assert.ok(bases.every(e=>e.cannons===want.cannons&&e.hp>m.enemies[0].hp),'a base is tougher than a ship');
  const start=ships.map(e=>[e.x,e.z]);for(let i=0;i<1500;i++)m.update(.02,{});
  assert.ok(ships.filter(e=>e.hp>0&&e.active).some((e,i)=>Math.hypot(e.x-start[ships.indexOf(e)][0],e.z-start[ships.indexOf(e)][1])>3),'ships move');
  assert.ok(bases.every(e=>e.x===nb.enemyX+e.baseX),'bases stay put on the far shore');
 }
 assert.ok(nb.levels[23].fleet.find(r=>r.behavior==='base').hpScale>nb.levels[8].fleet.find(r=>r.behavior==='base').hpScale,'the stage 24 base is the strong one');
 assert.equal(navalMissionState({id:'bases'},[{behavior:'base',hp:0},{behavior:'base',hp:1},{behavior:'patrol',hp:1}]).complete,false);
 assert.equal(navalMissionState({id:'bases'},[{behavior:'base',hp:0},{behavior:'patrol',hp:3}]).complete,true,'escorts may stay afloat');
});
test('Naval v9 bases: every cannon shows its landing point first, fires it exactly there, and sailing away from it avoids the damage',()=>{
 const run=(dodge,seed)=>{const m=createNavalModel({config,balance:nb,level:9,seed,random:seededRandom(seed*13+1)}),seen=[],marks=new Map();let hp0=m.playerShip.hp,telegraphSeconds=[];
  for(let i=0;i<3000&&!m.result;i++){
   const ps=m.playerShip;let input={};
   if(dodge){const all=m.enemies.flatMap(e=>e.attacks?.length?e.attacks:e.attack?[e.attack]:[]).concat(m.enemyShots.map(s=>({x:s.targetX,z:s.targetZ})));let best=null,bd=1e9;for(const k of all){const d=Math.hypot(k.x-ps.x,k.z-ps.z);if(d<bd){bd=d;best=k;}}
    if(best&&bd<42){const a=Math.atan2(ps.z-best.z,ps.x-best.x)-m.camera.heading;input={moveX:Math.sin(a),moveZ:-Math.cos(a)};}}
   for(const e of m.enemies)for(const k of (e.attacks||[]))if(!marks.has(k))marks.set(k,{first:m.time,fire:k.fireTime,x:k.x,z:k.z});
   const shots=m.enemyShots.length;m.update(.02,input);
   for(const sh of m.enemyShots)if(!seen.includes(sh)){seen.push(sh);const mk=[...marks.values()].find(v=>Math.hypot(v.x-sh.targetX,v.z-sh.targetZ)<1e-9);if(mk&&sh.fromX>=nb.enemyX+100)telegraphSeconds.push(mk.fire-mk.first);}
  }
  return {damage:hp0-m.playerShip.hp,telegraphSeconds};};
 let still=0,dodge=0,tele=[];for(const seed of [0,1,2,3,4]){still+=run(false,seed).damage;const d=run(true,seed);dodge+=d.damage;tele.push(...d.telegraphSeconds);}
 assert.ok(tele.length>10,'base shells were fired');assert.ok(Math.min(...tele)>=1.9,`warning is shown at least ~2 s before the shell flies: ${Math.min(...tele)}`);
 assert.ok(dodge<still*.5,`dodging cuts the damage (${dodge} vs ${still})`);
});

import {navalWideYaw} from '../workout/island/minigames/naval-aim-flag.mjs';
test('Naval v20: far-off-bow aiming is reachable: smooth, monotone, reversible, fine near the start, 40 degrees within a thumb',()=>{
 let last=-1;for(let d=0;d<=260;d+=5){const y=navalWideYaw(d,nb)*180/Math.PI;assert.ok(y>last,`monotone at ${d}`);last=y;assert.ok(Math.abs(navalWideYaw(-d,nb)+navalWideYaw(d,nb))<1e-12,'symmetric and reversible');}
 assert.ok(Math.abs(navalWideYaw(10,nb)*180/Math.PI-1.29)<.1,'fine control near the start (about 0.13 deg/px)');
 const px=target=>{let d=0;while(navalWideYaw(d,nb)*180/Math.PI<target&&d<1000)d++;return d;};
 assert.ok(px(40)<=160,`40 degrees in ${px(40)} px`);assert.ok(px(60)<=200,`60 degrees in ${px(60)} px`);
 const old=target=>Math.ceil(target/nb.aimControls.follow.yawFixed);assert.ok(old(40)>300&&px(40)<old(40)/2,'at least twice as little thumb travel as the v9 fixed gain');
});

test('Naval v20 air: aircraft arrive on stages 12, 20 and 27, every shot is telegraphed, and the Vulcan brings them down in bursts (heat-limited)',()=>{
 for(const stage of [12,20,27]){
  const m=createNavalModel({config,balance:nb,level:stage,seed:5,random:seededRandom(5)});let seenAir=0,tele=[],maxHeat=0,overheated=false;const marks=new Map();
  for(let i=0;i<9000&&!m.result;i++){m.update(.02,{});seenAir=Math.max(seenAir,m.air.length);
   for(const a of m.air)if(a.attack&&!marks.has(a.attack))marks.set(a.attack,{first:m.time,fire:a.attack.fireTime});
   const v=m.vulcan;maxHeat=Math.max(maxHeat,v.heat);overheated=overheated||v.overheated;}
  const v=m.vulcan;
  assert.ok(v.spawned>=2,`stage ${stage}: aircraft spawned ${v.spawned}`);assert.ok(v.kills>=1,`stage ${stage}: Vulcan kills ${v.kills}`);assert.ok(v.shots>20&&v.hits>0&&v.hits<v.shots,'it fires bursts and does not always hit');
  for(const mk of marks.values())assert.ok(mk.fire-mk.first>=1.29,`warning at least 1.3 s (${mk.fire-mk.first})`);
  assert.ok(maxHeat<=1+1e-9);
 }
 for(const stage of [1,5,11])assert.equal(createNavalModel({config,balance:nb,level:stage,seed:1,random:seededRandom(1)}).vulcan,null,'no aircraft on other stages');
});

import {navalPadReach,navalWideYaw as wideYaw2} from '../workout/island/minigames/naval-aim-flag.mjs';
import {navalMuzzle} from '../workout/island/minigames/naval-ballistics.mjs';
import {navalWaterAt} from '../workout/island/minigames/naval-camera.mjs';
test('Naval v22: from the pad at the screen edge the aim reaches at least 120 degrees to each side, and continuously',()=>{
 for(const [startX,W] of [[700,844],[760,844],[620,844],[1100,1366],[500,740]]){
  const r=navalPadReach(startX,W,nb);assert.ok(r.right>=120,`right ${r.right} at ${startX}/${W}`);assert.ok(r.left<=-120&&r.left>=-195,`left ${r.left}`);
  const avail=W-startX;let last=-1;for(let d=0;d<=avail;d+=3){const y=wideYaw2(d,nb,avail)*180/Math.PI;assert.ok(y>=last,'monotone');last=y;}
  const near=wideYaw2(60,nb,avail)*180/Math.PI;assert.ok(near<12,`fine control kept in the first 60 px (${near}°)`);
 }
 const before=700+0; // v20: 144 px toward the screen edge was all the room
 assert.ok(wideYaw2(144,nb,Infinity)*180/Math.PI<45,'v20 reached under 45 degrees toward the edge');
});
test('Naval v22: a tap on any water point maps to that point and aims the turret at it without a shot',()=>{
 const m=createNavalModel({config,balance:nb,level:3,seed:0,random:seededRandom(0)});for(let i=0;i<60;i++)m.update(.02,{});
 const W=844,H=390;let checked=0,aimedOk=0;
 for(let x=60;x<W;x+=90)for(let y=170;y<H-60;y+=40){
  const w=navalWaterAt(x,y,m.camera,W,H,nb);if(!w)continue;
  const T=nb.targeting,inside=w.x>=Math.max(T.minX,m.playerShip.x+40)&&w.x<=T.maxX&&w.z>=T.minZ&&w.z<=T.maxZ&&Math.hypot(w.x-m.playerShip.x,w.z)<=300&&Math.hypot(w.x-m.playerShip.x,w.z)>=90;
  if(!inside)continue;checked++;
  const back=projectNavalPoint(navalWorldPoint(w.x,w.z,nb,0),m.camera,W,H);assert.ok(Math.hypot(back.x-x,back.y-y)<1.5,`round trip at ${x},${y}`);
  const n=createNavalModel({config,balance:nb,level:3,seed:0,random:seededRandom(0)});for(let i=0;i<60;i++)n.update(.02,{});const fired=n.fired;
  n.update(.02,{targetX:w.x,targetZ:w.z});assert.equal(n.fired,fired,'tapping never fires');
  const land=n.prediction.landing||n.prediction.end,miss=Math.hypot(land.x-w.x,land.z-w.z);if(miss<8)aimedOk++;
 }
 assert.ok(checked>=6,`${checked} points inside the firing arena`);assert.ok(aimedOk/checked>=.8,`${aimedOk}/${checked} taps land within 8 units of the tapped water point`);
});
