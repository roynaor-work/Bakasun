import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalLaunch,navalPredict,navalAdvanceShot,navalBallisticPoint,navalLanding,navalSolveLaunch,navalBallisticConfig,NAVAL_STEP} from '../workout/island/minigames/naval-ballistics.mjs';
import {navalAimFromDrag,navalChargePower,navalHanded} from '../workout/island/minigames/naval-controls.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,b=config.navalDuel,c=navalBallisticConfig(b);
const make=(level=3,seed=0,extra={})=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed),...extra});
const run=(m,seconds,input={},dt=.02)=>{for(let i=0;i<Math.ceil(seconds/dt)&&!m.result;i++)m.update(dt,typeof input==='function'?input(m,i):input);};
/** Fly a launch with an arbitrary frame sequence, exactly like the live model. */
function fly(launch,targets,frames){let age=0,i=0;while(age<launch.duration){const dt=frames[i++%frames.length],hit=navalAdvanceShot(launch,age,age+dt,targets,b);if(hit)return hit;age=Math.min(launch.duration,age+dt);}const l=navalLanding(launch);return {x:l.x,z:l.z,t:launch.duration,index:null};}

test('Naval preview and live shell agree to 1e-9 across ranges, elevations, powers, winds and frame rates',()=>{
 const rows=[],ship={x:60,z:0,heading:0};
 for(const elevation of [3,8,15,25,42])for(const power of [c.minPower,.6,.85,1])for(const wind of [{x:0,z:0},{x:-40,z:55},{x:70,z:-20}])for(const yaw of [-.4,0,.3]){
  const launch=navalLaunch({ship,yaw,elevation,power,wind,ammo:0,pressure:12},b),preview=navalPredict(launch,[],b);
  for(const frames of [[1/60],[1/30],[.016,.033,.021,.05],[.1]]){const live=fly(launch,[],frames);rows.push(Math.hypot(live.x-preview.end.x,live.z-preview.end.z));}
 }
 assert.equal(rows.length,5*4*3*3*4);assert.ok(Math.max(...rows)<1e-9,`max ${Math.max(...rows)}`);
});
test('Naval contact with a hull is the same grid step in the preview and in flight',()=>{
 const ship={x:60,z:0,heading:0};let contacts=0;
 for(const [x,z,heading] of [[300,0,Math.PI],[250,30,2.6],[380,-40,Math.PI/2],[160,10,Math.PI]]){
  const target={x,z,heading,index:7,hullScale:1},s=navalSolveLaunch(ship,target,{power:1,wind:{x:20,z:-30},ammo:0,pressure:5},b),launch=navalLaunch({ship,...s,wind:{x:20,z:-30},ammo:0,pressure:5},b);
  const preview=navalPredict(launch,[target],b);assert.ok(preview.contact,`no contact for ${x},${z}`);
  for(const frames of [[1/60],[.016,.05,.033],[.2]]){const live=fly(launch,[target],frames);assert.equal(live.index,7);assert.equal(live.t,preview.contact.t);assert.equal(live.x,preview.contact.x);assert.equal(live.z,preview.contact.z);contacts++;}
 }
 assert.equal(contacts,12);
});
test('Naval identical input gives identical shots; there is no hidden random term',()=>{
 const shots=[];
 for(const seed of [0,0,0]){const m=make(5,seed);m.update(.02,{aimYaw:.05,aimElevation:9,aimPower:.9,fireRelease:true});run(m,2);shots.push(JSON.stringify(m.lastShot));}
 assert.equal(shots[0],shots[1]);assert.equal(shots[1],shots[2]);
 const a=make(5,1),z=make(5,2);a.update(.02,{aimYaw:.05,aimElevation:9,aimPower:.9,fireRelease:true});z.update(.02,{aimYaw:.05,aimElevation:9,aimPower:.9,fireRelease:true});
 assert.equal(a.ball.launch.vx,z.ball.launch.vx);assert.equal(a.ball.launch.vh,z.ball.launch.vh,'only the visible wind may differ between encounters');
});
test('Naval release fires exactly once; cancel never fires; holding alone never fires',()=>{
 const m=make();run(m,1,{aimHeld:true,aimYaw:0,aimElevation:10,aimPower:1});assert.equal(m.fired,0);assert.ok(m.aiming);
 m.update(.02,{fireRelease:true,aimYaw:0,aimElevation:10,aimPower:1});assert.equal(m.fired,1);for(let i=0;i<20;i++)m.update(.02,{});assert.equal(m.fired,1);
 const n=make();run(n,.6,{aimHeld:true});n.update(.02,{aimCancel:true,fireRelease:true});n.update(.02,{aimCancel:true,quickShot:true});run(n,1);assert.equal(n.fired,0);assert.equal(n.aiming,false);
});
test('Naval a close hull is hit and a moving target separates prediction error from target motion',()=>{
 const m=make(3,0);m.playerShip.x=m.enemyShip.x-120;m.playerShip.z=m.enemyShip.z;const e=m.enemyShip;
 m.update(.02,{releaseTarget:{x:e.x,z:e.z},fireRelease:true,releaseCurrent:false});const predicted=m.ball.predicted;run(m,m.ball.duration+.05);
 assert.ok(m.lastShot.actual.victim===e.index,JSON.stringify(m.lastShot));
 // A moving hull: the shell lands where it was previewed; the miss is the hull's motion.
 const n=make(9,0),target=n.enemies.find(t=>t.active&&t.hp>0);run(n,3);
 n.update(.02,{releaseTarget:{x:target.x,z:target.z},fireRelease:true,releaseCurrent:false});const shot=n.ball;run(n,shot.duration+.05);
 const report=n.lastShot;assert.ok(report.targetMoved>0,'the target moved during flight');
 if(report.actual.victim===null){assert.ok(Math.abs(report.actual.x-report.predicted.landing.x)<1e-9&&Math.abs(report.actual.z-report.predicted.landing.z)<1e-9,'a miss lands exactly on the previewed water point');}
 assert.ok(predicted.end&&predicted.landing);
});
test('Naval quick shot helps moderately only on easy; manual aim is the skill',()=>{
 const results={};
 for(const difficulty of ['easy','normal','hard']){let hits=0,shots=0;
  for(const seed of [0,1,2,3,4,5,6,7]){const m=make(6,seed,{difficulty});run(m,2.5);m.update(.02,{quickShot:true});shots++;run(m,2);if(m.lastShot?.actual.victim!==null&&m.lastShot?.actual.victim!==undefined)hits++;}
  results[difficulty]=hits/shots;
 }
 assert.ok(results.easy>=.5,JSON.stringify(results));assert.ok(results.easy>results.normal,JSON.stringify(results));assert.equal(results.normal,results.hard,'normal and hard tap shots use the player\'s own turret settings');
 const m=make(6,0,{difficulty:'easy'});run(m,2.5);m.update(.02,{quickShot:true});assert.equal(m.quickShots,1);assert.ok(m.ball.launch,'the assisted shot is a real ballistic launch');
});
test('Naval torpedo stays on the water along the turret bearing; shells arc',()=>{
 const m=make();m.update(.02,{ammoIndex:2,aimYaw:.2,aimElevation:30,aimPower:.7,fireRelease:true});const l=m.ball.launch;assert.equal(l.kind,'water');
 for(let t=0;t<l.duration;t+=.05){const q=navalBallisticPoint(l,t);assert.equal(q.h,0);assert.ok(Math.abs(Math.atan2(q.z-l.origin.z,q.x-l.origin.x)-.2)<1e-9||t===0);}
 const n=make();n.update(.02,{aimYaw:0,aimElevation:30,aimPower:1,fireRelease:true});const s=n.ball.launch,mid=navalBallisticPoint(s,s.duration/2);assert.equal(s.kind,'arc');assert.ok(mid.h>c.muzzleHeight);
});
test('Naval a dead-centre shell is a critical hit with distinct damage and score',()=>{
 const centre=make(1,0),edge=make(1,0),e=centre.enemyShip,f=edge.enemyShip;
 centre.update(.02,{releaseTarget:{x:e.x,z:e.z},fireRelease:true,releaseCurrent:false});run(centre,1.2);
 edge.update(.02,{releaseTarget:{x:f.x-b.aim.hullLength*.8,z:f.z+b.aim.hullBeam*.2},fireRelease:true,releaseCurrent:false});run(edge,1.2);
 assert.equal(centre.lastShot.actual.critical,true,JSON.stringify(centre.lastShot));assert.equal(edge.lastShot.actual.critical,false);assert.ok(centre.score>edge.score);assert.ok(e.hp<f.hp||e.hp===0);
});
test('Naval drag, power ring and handedness are deterministic pure mappings',()=>{
 const start={yaw:0,elevation:10},a=navalAimFromDrag(start,50,-40,b),z=navalAimFromDrag(start,50,-40,b);assert.deepEqual(a,z);assert.ok(a.yaw>0&&a.elevation>10);
 assert.equal(navalAimFromDrag(start,0,-99999,b).elevation,c.maxElevation);assert.equal(navalAimFromDrag(start,0,99999,b).elevation,c.minElevation);
 assert.equal(navalChargePower(0,b),c.minPower);assert.equal(navalChargePower(b.aimControls.chargeSeconds,b),1);assert.equal(navalChargePower(99,b),1);assert.ok(navalChargePower(.3,b)<navalChargePower(.6,b));
 const store=v=>({getItem:()=>v});assert.equal(navalHanded(b,store(null)),true);assert.equal(navalHanded(b,store('left')),false);assert.equal(navalHanded(b,store('right')),true);assert.equal(navalHanded(b,{getItem(){throw Error('blocked');}}),true);
});
test('Naval aim step and render budget stay inside the repository limits',()=>{
 assert.equal(NAVAL_STEP,1/120);assert.ok(b.render.maxTriangles<=90000&&b.render.maxDrawCalls<=70);
 for(const key of ['gravity','maxSpeed','minPower','muzzleHeight','hullTop','minElevation','maxElevation','weakSpot','criticalMultiplier'])assert.ok(Number.isFinite(b.ballistics[key]),key);
 assert.ok(b.ballistics.maxElevation<45,'raising the barrel always lengthens the range');
});
