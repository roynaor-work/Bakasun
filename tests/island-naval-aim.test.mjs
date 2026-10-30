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

// Round 2 (26/10/2026): marks, tracers, camera timing and the optional buzz.
import {drawNavalAimMarks,drawNavalShellTracers,navalMarkKind,navalPixelUnit} from '../workout/island/minigames/naval-marks.mjs';
import {navalCameraPose} from '../workout/island/minigames/naval-camera.mjs';
import {navalBuzz} from '../workout/island/minigames/naval.mjs';
function recorder(scale=1){const calls=[];let dash=[];const state={lineWidth:1};const p=new Proxy(state,{get(t,k){if(k==='setLineDash')return d=>{dash=d;};if(k==='getTransform')return ()=>({a:scale});if(k==='canvas')return {width:844*scale,clientWidth:844*scale};if(k in t)return t[k];return (...args)=>calls.push({k,args,dash:[...dash],stroke:state.strokeStyle,fill:state.fillStyle,width:state.lineWidth});},set(t,k,v){t[k]=v;return true;}});return {p,calls};}
test('Naval landing marks differ by shape: dashed ring (water), solid ring with filled diamond (hull), double ring with centre dot (weak centre)',()=>{
 const project=(x,z,y=0)=>({x:400+z,y:250-(x-60)*.4-y,depth:5}),base={aiming:true,ammoIndex:0};
 const water=recorder(),hull=recorder(),centre=recorder();
 const w=drawNavalAimMarks(water.p,{...base,prediction:{landing:{x:300,z:0},contact:null}},project,b);
 const h=drawNavalAimMarks(hull.p,{...base,prediction:{landing:{x:330,z:0},contact:{x:310,z:0,h:8,critical:false}}},project,b);
 const c=drawNavalAimMarks(centre.p,{...base,prediction:{landing:{x:340,z:0},contact:{x:312,z:0,h:8,critical:true}}},project,b);
 assert.deepEqual([w.kind,h.kind,c.kind],['water','hull','critical']);assert.deepEqual([w.ring,h.ring,c.ring],[24,30,34]);assert.deepEqual([w.diamond,h.diamond,c.diamond],[10,12,14]);
 const ellipses=r=>r.calls.filter(x=>x.k==='ellipse');assert.ok(ellipses(water).some(e=>e.dash.length>0),'water ring is dashed');assert.ok(ellipses(hull).every(e=>e.dash.length===0));assert.equal(ellipses(centre).length/2,2,'double ring, each with its dark outline');
 assert.equal(water.calls.filter(x=>x.k==='fill').length,0,'hollow diamond on water');assert.ok(hull.calls.some(x=>x.k==='fill'&&x.fill===b.aimLook.hull.color));assert.ok(centre.calls.some(x=>x.k==='arc'),'centre dot');
 assert.equal(navalMarkKind(null),'water');assert.equal(drawNavalAimMarks(water.p,{...base,aiming:false,prediction:{landing:{x:1,z:1}}},project,b),null);
});
test('Naval marks keep their pixel size on a scaled canvas',()=>{
 const small=recorder(1),large=recorder(2);assert.equal(navalPixelUnit(small.p),1);assert.equal(navalPixelUnit(large.p),.5);
 const project=()=>({x:100,y:100,depth:3}),m={aiming:true,prediction:{landing:{x:300,z:0},contact:null}};drawNavalAimMarks(small.p,m,project,b);drawNavalAimMarks(large.p,m,project,b);
 const rx=r=>r.calls.find(x=>x.k==='ellipse').args[2];assert.ok(Math.abs(rx(large)*2-rx(small))<1e-9);
});
test('Naval shell tracer follows the shared path and draws once per live shell',()=>{
 const m=make();m.update(.02,{aimYaw:0,aimElevation:12,aimPower:1,fireRelease:true});for(let i=0;i<10;i++)m.update(.02,{});
 const r=recorder();assert.equal(drawNavalShellTracers(r.p,m,b),1);const cores=r.calls.filter(x=>x.k==='arc');assert.equal(cores.length,2,'halo and core');
 const n=make();n.update(.02,{ammoIndex:4,aimYaw:0,aimElevation:12,aimPower:1,fireRelease:true});n.update(.02,{});assert.equal(drawNavalShellTracers(recorder().p,n,b),3,'the salvo draws three smaller tracers');
});
test('Naval aim camera enters in 0.22 s, returns in 0.3 s and its shoulder flips with the hand',()=>{
 const ship={x:60,z:0,heading:0},aim={x:300,z:0},framing=side=>({battle:true,enemies:[],width:844,height:390,aimYaw:0,aimSide:side,landing:aim});
 let c=navalCameraPose(ship,aim,false,b,undefined,0,framing(1));for(let i=0;i<11;i++)c=navalCameraPose(ship,aim,true,b,c,.02,framing(1));assert.ok(c.zoom>.99&&c.progress===1);
 let half=navalCameraPose(ship,aim,false,b,undefined,0,framing(1));for(let i=0;i<5;i++)half=navalCameraPose(ship,aim,true,b,half,.02,framing(1));assert.ok(half.zoom>.3&&half.zoom<.75);
 let out=c;for(let i=0;i<15;i++)out=navalCameraPose(ship,aim,false,b,out,.02,framing(1));assert.ok(out.zoom<1e-3);
 const right=c,left=(()=>{let l=navalCameraPose(ship,aim,false,b,undefined,0,framing(-1));for(let i=0;i<12;i++)l=navalCameraPose(ship,aim,true,b,l,.02,framing(-1));return l;})();assert.ok(Math.sign(right.position.x-left.position.x)!==0&&Math.abs(right.position.x+left.position.x)<1e-6,'mirrored shoulder');
});
test('Naval weak-centre buzz is optional, short and respects the off setting',()=>{
 const calls=[],nav={vibrate:ms=>{calls.push(ms);return true;}},store=v=>({getItem:()=>v});
 assert.equal(navalBuzz(store(null),nav),true);assert.equal(navalBuzz(store('off'),nav),false);assert.equal(navalBuzz(store(null),{}),false);assert.deepEqual(calls,[30]);assert.equal(b.aimControls.chargeSeconds,1.2);
});

// Round 3 (26/10/2026): the hit moment, the lost-health trail and our ship's paint.
import {drawNavalHitFeedback,navalLostHealth} from '../workout/island/minigames/naval-marks.mjs';
import {PLAYER_PAINT} from '../workout/island/minigames/naval-view.mjs';
function painter(){const calls=[];const state={};const p=new Proxy(state,{get(t,k){if(k==='getTransform')return ()=>({a:1});if(k==='canvas')return {width:844,clientWidth:844};if(k==='createRadialGradient')return (...args)=>({addColorStop(){calls.push({k:'stop'});},args});if(k in t)return t[k];return (...args)=>calls.push({k,args});},set(t,k,v){t[k]=v;return true;}});return {p,calls};}
test('Naval hit flash and sparks run only after a real hit, in display pixels, and end within 0.18 s',()=>{
 const look=b.aimLook.hit,project=()=>({x:300,y:120,depth:4}),blast={x:320,z:0,h:8,at:10,hit:true,critical:false,owner:'player'};
 assert.equal(look.flash,'#FFE1A3');assert.equal(look.flashPixels,22);assert.equal(look.criticalFlashPixels,30);assert.equal(look.flashSeconds,.08);assert.equal(look.sparkSeconds,.18);assert.equal(look.smoke,'#58636A');assert.equal(look.starPixels,22);assert.equal(look.starSeconds,.45);
 const at=(age,extra={})=>drawNavalHitFeedback(painter().p,{time:10+age,blast:{...blast,...extra}},project,b);
 const now=at(0);assert.ok(now.flash);assert.equal(now.diameter,22);assert.ok(now.sparks>=4&&now.sparks<=6);
 assert.equal(at(0,{critical:true}).diameter,30);assert.equal(at(0,{critical:true,owner:'enemy'}).diameter,22,'only our weak-centre hit is a critical flash');
 const later=at(.1);assert.equal(later.flash,false);assert.ok(later.sparks>=4);assert.equal(at(.2),null);
 assert.equal(at(0,{hit:false}),null,'a splash shows no hit flash');assert.equal(drawNavalHitFeedback(painter().p,{time:10,blast:{...blast,at:undefined}},project,b),null);
});
test('Naval enemy bar shows the new health at once; the lost part holds 0.15 s and fades over 0.3 s',()=>{
 const look=b.aimLook.hit,e={hp:3,maxHp:5,lostFrom:4.5,lostAt:2};
 assert.equal(navalLostHealth(e,2.1,look).alpha,1);assert.ok(Math.abs(navalLostHealth(e,2.3,look).alpha-.5)<1e-9);assert.equal(navalLostHealth(e,2.5,look),null);
 assert.deepEqual([navalLostHealth(e,2.1,look).from,navalLostHealth(e,2.1,look).to],[3,4.5]);assert.equal(navalLostHealth({hp:3,maxHp:5},2.1,look),null);
 const m=make(3,0);m.update(.02,{autoAim:true,fireRelease:true});run(m,1.6);const victim=m.enemies.find(x=>x.lostAt!==undefined);
 assert.ok(victim,'a real hit records the lost part');assert.ok(victim.lostFrom>victim.hp);assert.ok(Number.isFinite(m.blast.at)&&m.blast.hit&&m.blast.h>0,'the blast keeps the contact time and height');
});
test('Naval player paint keeps the specified palette and accent colour; enemies are not repainted',async()=>{
 assert.deepEqual([PLAYER_PAINT.low,PLAYER_PAINT.deck,PLAYER_PAINT.accent,PLAYER_PAINT.contrast],['#536F80','#B9C9CC','#E07843',.8]);
 const view=await readFile(new URL('../workout/island/minigames/naval-view.mjs',import.meta.url),'utf8');
 assert.ok(view.includes("createVessel(THREE,r,model.equipment,{player:true},balance.playerModel)"));assert.ok(view.includes("if(variant.player)mat.color.set('#DDE6E5')"));assert.ok(view.includes('else hullBands(node,mat,model)'));
});
