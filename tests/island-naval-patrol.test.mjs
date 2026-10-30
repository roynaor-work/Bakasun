// Naval gameplay round, stage A (27/10/2026): speed-blended aim and readable enemy patrols.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {navalPatrolSpec,createNavalPatrol,stepNavalPatrol} from '../workout/island/minigames/naval-patrol.mjs';
import {navalAimGain,navalAimStep,navalReachAim,navalReachOf,navalReachRange} from '../workout/island/minigames/naval-controls.mjs';
import {navalLaunch,navalPredict,navalLanding} from '../workout/island/minigames/naval-ballistics.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,b=config.navalDuel;
const make=(level=1,seed=0)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed)});
const near=(a,e,tol=1e-6)=>assert.ok(Math.abs(a-e)<=tol,`${a} ≉ ${e}`);
const hull=e=>{const L=b.aim.hullLength*(e.hullScale||1)/2,c=Math.cos(e.heading),s=Math.sin(e.heading);return {a:[e.x-c*L,e.z-s*L],b:[e.x+c*L,e.z+s*L],r:b.aim.hullBeam*(e.hullScale||1)/2};};
const pointSeg=(p,a,q)=>{const vx=q[0]-a[0],vz=q[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vz)/(vx*vx+vz*vz||1)));return Math.hypot(p[0]-a[0]-vx*t,p[1]-a[1]-vz*t);};
const gap=(A,B)=>Math.min(pointSeg(A.a,B.a,B.b),pointSeg(A.b,B.a,B.b),pointSeg(B.a,A.a,A.b),pointSeg(B.b,A.a,A.b))-A.r-B.r;

test('Patrol speed and width follow the stage table and blend between rows',()=>{
 assert.deepEqual(navalPatrolSpec(1,b),{speed:5,range:12});assert.deepEqual(navalPatrolSpec(3,b),{speed:8,range:24});
 assert.deepEqual(navalPatrolSpec(10,b),{speed:14,range:48});assert.deepEqual(navalPatrolSpec(20,b),{speed:18,range:65});assert.deepEqual(navalPatrolSpec(28,b),{speed:18,range:65});
 const two=navalPatrolSpec(2,b);near(two.speed,6.5);near(two.range,18);
 let last=navalPatrolSpec(1,b);for(let s=2;s<=25;s++){const now=navalPatrolSpec(s,b);assert.ok(now.speed>=last.speed&&now.range>=last.range&&now.speed-last.speed<=1.6&&now.range-last.range<=6.1,`stage ${s} changes gradually`);last=now;}
});

test('Over eight seconds every hull sails at its stage speed and stays inside its patrol width',()=>{
 for(const stage of [1,3,10,20]){
  const m=make(stage,7);for(let i=0;i<8*50;i++)m.update(.02,{});
  for(const e of m.enemies.filter(e=>e.patrol)){
   const p=e.patrol,spec=navalPatrolSpec(stage,b);assert.ok(p.speed<=spec.speed+1e-9,'never faster than the table');
   near(p.traveled/8,p.speed,p.speed*.02);assert.ok(Math.max(-p.minZ,p.maxZ)<=p.range+1e-6,`stage ${stage} stays within ${p.range}`);
  }
 }
});

test('Patrols use most of their width, the bow always follows the motion and turns build up over 0.6–1 s',()=>{
 for(const stage of [1,3,10,20]){
  const p=createNavalPatrol({x:340,z:0,seed:3,stage},b);let widest=0,turnStart=null,peak=0,rise=[];
  for(let i=0;i<60*60;i++){const before={x:p.x,z:p.z},side=p.side;stepNavalPatrol(p,1/60,{},b);const moved=Math.atan2(p.z-before.z,p.x-before.x);
   assert.ok(Math.abs(Math.atan2(Math.sin(moved-p.heading),Math.cos(moved-p.heading)))<1e-6,'no sideways slide');widest=Math.max(widest,Math.abs(p.z));
   if(side!==p.side){turnStart=i;peak=0;}
   if(turnStart!==null){peak=Math.max(peak,Math.abs(p.turn));if(Math.abs(p.turn)>=.9*p.turnRate){rise.push((i-turnStart)/60);turnStart=null;}}
  }
  assert.ok(widest>=p.range*.75&&widest<=p.range,`stage ${stage} sails ${widest.toFixed(1)} of ${p.range}`);
  assert.ok(rise.length>2);for(const t of rise)assert.ok(t>=.6&&t<=1.2,`turn builds up in ${t.toFixed(2)} s`);
 }
});

test('Early stages hold the current leg while a player shell is airborne',()=>{
 const run=airborne=>{const p=createNavalPatrol({x:340,z:0,seed:1,stage:2},b);let flips=0;for(let i=0;i<300;i++){const s=p.side;stepNavalPatrol(p,1/60,{shellAirborne:airborne},b);if(s!==p.side)flips++;}return {flips,held:p.held,offset:Math.max(-p.minZ,p.maxZ),range:p.range};};
 const free=run(false),held=run(true);assert.ok(held.flips<=free.flips);assert.ok(held.offset<=held.range);
 const late=createNavalPatrol({x:340,z:0,seed:1,stage:12},b);for(let i=0;i<600;i++)stepNavalPatrol(late,1/60,{shellAirborne:true},b);assert.equal(late.held,0,'later stages may turn under fire');
});

test('Hulls never overlap each other across stages, seeds and waves',()=>{
 for(const stage of [5,10,15,20,25,30])for(const seed of [1,13,99]){
  const m=make(stage,seed);for(let i=0;i<40*50;i++){m.update(.02,{});const live=m.enemies.filter(e=>e.active&&e.hp>0&&e.patrol);
   for(let p=0;p<live.length;p++)for(let q=p+1;q<live.length;q++)assert.ok(gap(hull(live[p]),hull(live[q]))>0,`stage ${stage} seed ${seed} t ${m.time.toFixed(2)}`);}
 }
});

test('Aim gain blends smoothly from the slow to the fast sensitivity by drag speed',()=>{
 const slow=navalAimGain(0,b),fast=navalAimGain(1000,b);near(slow.yaw,.08);near(slow.elevation,.06);near(fast.yaw,.2);near(fast.elevation,.12);
 near(navalAimGain(80,b).yaw,.08);near(navalAimGain(240,b).yaw,.2);
 let last=slow.yaw;for(let v=0;v<=320;v+=2){const k=navalAimGain(v,b).yaw;assert.ok(k>=last-1e-12&&k-last<.004,`no step at ${v} px/s`);last=k;}
});

test('Every pixel of a drag moves the aim, slow drags finely and fast drags far, with no randomness',()=>{
 const start={yaw:0,elevation:20},DEG=Math.PI/180;
 const drag=(px,ms,steps)=>{let a={...start};const t={};for(let i=0;i<steps;i++)a=navalAimStep(a,px,0,ms,t,b);return a;};
 near(drag(1,40,60).yaw,60*.08*DEG,1e-9);
 const quick=drag(10,16,30);assert.ok(quick.yaw>300*.19*DEG&&quick.yaw<=300*.2*DEG+1e-9,'a fast swing uses the fast gain');
 const one=navalAimStep(start,0,-1,40,{},b);near(one.elevation,20.06);
 assert.deepEqual(drag(3,20,40),drag(3,20,40));
 assert.equal(navalAimStep({yaw:0,elevation:b.ballistics.maxElevation},0,-50,16,{},b).elevation,b.ballistics.maxElevation);
 assert.equal(b.aimControls.gain.startPixels,2);assert.equal(b.ballistics.defaultElevation,14);
});

test('Vertical drag sets the distance in one reversible control, with no time charge (28/10, Roy)',()=>{
 const ship={x:60,z:0,heading:0},R=navalReachRange(b);assert.equal(R.low,10);let last=null;
 for(let v=R.min;v<=R.max+1e-9;v+=.25){const a=navalReachAim(v,b),x=navalLanding(navalLaunch({ship,yaw:0,...a},b)).x;if(last!==null){assert.ok(x>=last-1e-9,'farther as the drag goes up');assert.ok(x-last<4,`no jump at ${v}`);}last=x;assert.ok(Math.abs(navalReachOf(a,b)-v)<1e-9,'the turret maps back to the same reach');}
 assert.ok(navalLanding(navalLaunch({ship,yaw:0,...navalReachAim(R.min,b)},b)).x-60<100,'short shots stay possible');assert.deepEqual(navalReachAim(14,b),{elevation:14,power:1});
 const up=navalAimStep({yaw:0,elevation:14},0,-30,40,{},{...b,ballistics:{...b.ballistics,minElevation:R.min}}),back=navalAimStep(up,0,30,40,{speed:0},{...b,ballistics:{...b.ballistics,minElevation:R.min}});near(back.elevation,14,1e-9);
});
test('A shell fired while sailing at full speed lands on the point shown at release',()=>{
 const m=make(3,5);for(let i=0;i<60;i++)m.update(.02,{moveX:1,moveZ:-.4});assert.ok(m.playerShip.speed>45,'sailing near 48');
 const input={moveX:1,moveZ:-.4,aimHeld:true,aimYaw:-.9,aimElevation:18,aimPower:1};for(let i=0;i<20;i++)m.update(.02,input);
 const shown=m.prediction;assert.equal(shown.contact,null,'the test aims at open water');
 m.update(.02,{...input,aimHeld:false,fireRelease:true,releaseCurrent:true});
 for(let i=0;i<200&&m.ball.active;i++)m.update(.02,{moveX:1,moveZ:-.4});
 near(m.lastShot.actual.x,shown.landing.x,1.5);near(m.lastShot.actual.z,shown.landing.z,1.5);
});
