// 11/11/2026 final fix (Fable), fire rescue: pure logic behind the kill switches `fireHeading`, `fireTruckModel`, `fireLadder`, `fireRescue`.
// 12/11/2026 independent QA fixes: `fireTurn` (turn at the junction where the stick was tilted), `fireMapTap` (taps on the map in the stick
// zone), `fireArrows` (edge arrows clear of the water gauge and the hydrant button); a second tap never cancels a rescue.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fireV21,fireV20} from '../workout/island/minigames/polish-flag.mjs';
import {pumperFileTurn} from '../workout/island/minigames/fire-v7.mjs';
import {ladderArmPose,autoBalanceSteer,createFireLadder} from '../workout/island/minigames/fire-ladder.mjs';
import {nextRescueLatch} from '../workout/island/minigames/fire-session.mjs';
import {waterGaugeState} from '../workout/island/minigames/fire-ui.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {fireIndicators} from '../workout/island/minigames/fire-navigation.mjs';
import {createFireDriver} from '../workout/island/minigames/fire-roads.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.fireRescue;
const deg=r=>r*180/Math.PI;

test('final fire: every v21 flag is on by default and each value switches one step back',()=>{
 for(const f of ['fireHeading','fireTruckModel','fireLadder','fireRescue','fireHud','fireTurn','fireMapTap','fireArrows']){
  assert.equal(fireV21(f,''),true);assert.equal(fireV21(f,`?${f}=v20`),false);assert.equal(fireV21(f,`?${f}=v19`),false);assert.equal(fireV21(f,'?fireTruck=v1'),false);
  assert.equal(fireV20(f,`?${f}=v20`),true,'v20 keeps the v20 behaviour under the v21 switch');
 }
});
test('final fire: the v7 pumper file (front marker at +Z) is turned half a circle so its nose points along the game forward (-Z); v20 kept the quarter turn that showed it sideways',()=>{
 const forward=[0,0,-1],turn=a=>[forward[0]*Math.cos(a)+forward[2]*Math.sin(a),0,-forward[0]*Math.sin(a)+forward[2]*Math.cos(a)];
 const nose=[0,0,1];const rotate=(v,a)=>[v[0]*Math.cos(a)+v[2]*Math.sin(a),0,-v[0]*Math.sin(a)+v[2]*Math.cos(a)];
 const fixed=rotate(nose,pumperFileTurn(true)),old=rotate(nose,pumperFileTurn(false));
 assert.ok(Math.abs(fixed[2]+1)<1e-9&&Math.abs(fixed[0])<1e-9,'fixed nose = -Z');
 assert.ok(Math.abs(old[0]+1)<1e-9&&Math.abs(old[2])<1e-9,'v20 nose = -X (sideways to the motion)');
 assert.ok(turn);
});
test('final fire: the roof ladder is stowed at extension 0 and turns, lifts and stretches toward the window when extended',()=>{
 assert.deepEqual(ladderArmPose({dx:5,dz:-3,dy:4,rootYaw:.7,extension:0,length:4.5}),{yaw:0,pitch:0,scale:1});
 // window 6 ahead of the truck (world -Z), 3 up, truck at yaw 0: the tip (-Z end) already points there, so the ladder only lifts and stretches
 const ahead=ladderArmPose({dx:0,dz:-6,dy:3,rootYaw:0,extension:1,length:4.5,tip:-1});
 assert.ok(Math.abs(ahead.yaw)<1e-9);assert.ok(ahead.pitch>0&&Math.abs(deg(ahead.pitch)-deg(Math.atan2(3,6)))<1e-6,'lifts by the window angle');assert.ok(Math.abs(ahead.scale-Math.hypot(6,3)/4.5)<1e-9,'stretches to reach');
 // window to the truck's right (world +X) at yaw 0: the tip swings a quarter turn
 const right=ladderArmPose({dx:6,dz:0,dy:0,rootYaw:0,extension:1,length:4.5,tip:-1});
 assert.ok(Math.abs(Math.abs(right.yaw)-Math.PI/2)<1e-9);assert.equal(right.pitch,0);
 // the same window with the truck already facing it (root turned a quarter) needs no swing
 const faced=ladderArmPose({dx:6,dz:0,dy:0,rootYaw:-Math.PI/2,extension:1,length:4.5,tip:-1});assert.ok(Math.abs(faced.yaw)<1e-9);
 // half way out: half the angles, half the stretch; stretch is capped (a window 30 away never makes a 7x ladder)
 const half=ladderArmPose({dx:6,dz:0,dy:0,rootYaw:0,extension:.5,length:4.5,tip:-1});assert.ok(Math.abs(Math.abs(half.yaw)-Math.PI/4)<1e-9);
 assert.ok(ladderArmPose({dx:30,dz:0,dy:0,rootYaw:0,extension:1,length:4.5}).scale<=2.6);
 // wind sway nudges the tip sideways a little
 assert.notEqual(ladderArmPose({dx:0,dz:-6,dy:3,rootYaw:0,extension:1,length:4.5,sway:.5}).yaw,0);
});
test('final fire: wind mode balances itself; even pushing the stick the wrong way the ladder stays within the tolerance (v20 needed the stick to balance)',()=>{
 for(const [search,push,expectStable] of [['',1,true],['',0,true],['?fireRescue=v20',0,false]]){
  globalThis.location={search};
  const settings={...balance.levels[6],ladderMode:'wind'},rescues=[{x:303,y:412,world:[6,3,10],fireIndex:0,rescued:false,expired:false,progress:0,seconds:1.2}],flames=[{kind:'window',active:true,heat:0}];
  const ladder=createFireLadder(settings,rescues,flames,balance),truck={x:6,z:12,driving:false};
  let unstable=0,n=0;for(let t=0;t<12;t+=.02){ladder.prepare(.02,t,{rescue:true,moveX:push},truck);if(t>2){n++;if(!ladder.state.stable)unstable++;}}
  assert.ok(ladder.state.engaged);
  if(expectStable)assert.ok(unstable===0,`unstable ${unstable}/${n} with push ${push} (${search||'default'})`);else assert.ok(unstable>n*.5,'without balancing the wind tips the ladder');
 }
 delete globalThis.location;
 assert.ok(autoBalanceSteer(.3)<0&&autoBalanceSteer(-.3)>0&&autoBalanceSteer(2)>=-1.6);
});
test('final fire: a tap latches the rescue, another tap never cancels it, and the latch drops for driving, hose, hydrant, nothing left or a finished rescue',async()=>{
 assert.equal(nextRescueLatch(false,{tapped:true,available:true}),true);
 // 12/11/2026 (QA): two taps 300 ms apart used to stop the rescue; a child taps again when nothing seems to happen.
 assert.equal(nextRescueLatch(true,{tapped:true,available:true}),true,'second tap keeps the rescue');
 let latch=false;for(let i=0;i<5;i++)latch=nextRescueLatch(latch,{tapped:true,available:true});assert.equal(latch,true,'any number of taps');
 assert.equal(nextRescueLatch(false,{tapped:true,available:false}),false,'nothing to rescue');
 // the press itself latches (no 350 ms tap window: a 0.5 s press used to lift the ladder and drop it)
 const source=await readFile(new URL('../workout/island/minigames/fire-session.mjs',import.meta.url),'utf8');
 assert.match(source,/ui\.ladder\.addEventListener\('pointerdown',\(\)=>\{if\(paused\|\|!rescueTap\)return;rescueLatch=nextRescueLatch\(rescueLatch,\{tapped:true/);
 assert.doesNotMatch(source,/ladderDownAt|>350/);
 assert.equal(nextRescueLatch(true,{available:true}),true);
 for(const drop of [{driving:true},{firing:true},{refill:true},{available:false},{completedBefore:0,completedNow:1}])assert.equal(nextRescueLatch(true,{available:true,...drop}),false,JSON.stringify(drop));
});
test('final fire: a latched rescue input (no hold) completes the stage-3 rescue in the simulation once the truck is parked at the window',()=>{
 globalThis.location={search:''};
 const m=createFireModel({config,balance,level:3,random:seededRandom(5)}),r=m.rescues[0];assert.ok(r,'stage 3 has a rescue');
 m.flames[r.fireIndex].heat=0;m.flames[r.fireIndex].warning=0;Object.assign(m.truck,{x:r.world[0],z:r.world[2]});
 for(let i=0;i<10;i++)m.update(.02,{});
 let seconds=0;while(!r.rescued&&seconds<6){m.update(.02,{rescue:true});seconds+=.02;}
 assert.ok(r.rescued,'rescued');assert.ok(seconds<=r.seconds+1.5,String(seconds));assert.equal(m.ladder.extension,1,'ladder fully out at the end of the rescue');
 for(let i=0;i<120;i++)m.update(.02,{}); // the person climbs down for descentSeconds first
 assert.equal(m.ladder.extension,0,'ladder folds back after the rescue');
 delete globalThis.location;
});
test('final fire: the water gauge reads percent of the tank and turns orange, then red at the low-water ratio, green while refilling',()=>{
 assert.deepEqual(waterGaugeState(110,110,.2),{percent:100,level:'ok'});
 assert.deepEqual(waterGaugeState(40,110,.2),{percent:36,level:'ok'});
 assert.deepEqual(waterGaugeState(38,110,.2),{percent:35,level:'low'});
 assert.deepEqual(waterGaugeState(22,110,.2),{percent:20,level:'critical'});
 assert.deepEqual(waterGaugeState(0,110,.2),{percent:0,level:'critical'});
 assert.deepEqual(waterGaugeState(22,110,.2,true),{percent:20,level:'refilling'});
 assert.deepEqual(waterGaugeState(5,0,.2),{percent:0,level:'critical'});
});

test('final fire (QA): a stick tilted at the junction or up to 3.5 past it turns into that junction\'s street; `?fireTurn=v20` drives on to the next one',()=>{
 const trial=(d,search='')=>{const saved=globalThis.location;globalThis.location={search};try{
  const truck={x:6,z:18},drive=createFireDriver(truck,balance),dt=1/60;
  for(let i=0;i<600&&truck.z-6>d;i++)drive.update(dt,{moveX:0,moveZ:-1,assisted:true}); // full speed down x=6 toward the junction (6,6)
  for(let i=0;i<Math.round(3.6/dt);i++){drive.update(dt,{moveX:-1,moveZ:0,assisted:true});const v=Math.hypot(truck.velocityX,truck.velocityZ);
   if(v>5&&-truck.velocityX/v>Math.cos(Math.PI/9))return {z:truck.z,t:i*dt};}
  return null;}finally{globalThis.location=saved;}};
 for(const d of [3,1,0,-1,-2,-3,-3.5]){const turn=trial(d);assert.ok(turn&&Math.abs(turn.z-6)<1.5,`tilt at ${d}: turned at z=${turn?.z}`);assert.ok(turn.t<1.6,`tilt at ${d}: ${turn.t}s`);}
 for(const d of [-1,-2,-3]){const old=trial(d,'?fireTurn=v20');assert.ok(old&&Math.abs(old.z+6)<1.5,`v20 tilt at ${d}: z=${old?.z}`);}
});

test('final fire (QA): edge arrows keep clear of the water gauge and the hydrant button; without HUD boxes the layout is unchanged',()=>{
 const gauge={left:16,top:72,right:216,bottom:108},refill={left:734,top:176,right:818,bottom:260};
 const run=avoid=>{const m={truck:{x:0,z:0},flames:[{x:-60,y:-60},{x:100,y:-80},{x:-80,y:150},{x:-90,y:120},{x:950,y:180},{x:960,y:220},{x:980,y:150}].map(p=>({...p,active:true,heat:1,warning:0})),rescues:[{x:120,y:-90,world:[0,3,0]}],water:1,maxWater:1};
  return fireIndicators(m,{config:{width:844,height:390},balance,...(avoid?{hudAvoid:avoid}:{})},(x,y)=>({x,y}),()=>({x:422,y:195}));};
 const boxed=run([gauge,refill]),overlap=(a,r)=>a.x+a.size>r.left&&a.x-a.size<r.right&&a.y+a.size>r.top&&a.y-a.size<r.bottom;
 assert.equal(boxed.length,8);for(const a of boxed){assert.ok(!overlap(a,gauge),`${a.kind} ${a.edge} at ${a.x},${a.y} under the gauge`);assert.ok(!overlap(a,refill),`${a.kind} ${a.edge} at ${a.x},${a.y} under the hydrant button`);}
 for(let i=0;i<boxed.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(boxed[i].x-boxed[j].x,boxed[i].y-boxed[j].y)>=boxed[i].size+boxed[j].size+6,'arrows stay apart');
 const plain=run(null);assert.ok(plain.some(a=>overlap(a,gauge)||overlap(a,refill)),'the same scene without boxes hid arrows (the QA finding)');
 assert.deepEqual(run([]).map(a=>[a.x,a.y,a.edge]),plain.map(a=>[a.x,a.y,a.edge]),'no boxes = the old layout');
});

test('final fire (QA): a tap on the map inside the stick zone is a map tap (the stick waits up to 250 ms), the canvas and the zone share one tap path',async()=>{
 const source=await readFile(new URL('../workout/island/minigames/fire-session.mjs',import.meta.url),'utf8');
 assert.match(source,/fireV21\('fireMapTap'\)\?controls\.querySelector\('\.soccer-stick-zone'\)/);
 assert.match(source,/performance\.now\(\)-zoneTap\.at<250/);assert.match(source,/zoneTap\.moved=true/);
 assert.match(source,/still=zoneTapPending\(\),stickX=still\?0:sample\.moveX,stickZ=still\?0:sample\.moveZ/);
 assert.equal(source.match(/tapObjective\(screenPoint\(event\)\)/g)?.length,2,'canvas and stick zone use the same tap');
});

test('final fire (QA): the roof ladder tip reaches the window point: run and stretch are counted from the ladder\'s rear end, `back` behind the turret centre',()=>{
 const L=4.52,back=2.2;
 const tipOf=(pose,b)=>{const a=L*pose.scale,z=b-a*Math.cos(pose.pitch),y=a*Math.sin(pose.pitch);return {x:z*Math.sin(pose.yaw),y,z:z*Math.cos(pose.yaw)};}; // turret frame, rootYaw 0, tip toward -Z
 for(const [dx,dz,dy] of [[0,-2.5,4],[1.5,-3,3.2],[-2,-2,4.6],[3,-1,2.5]]){
  const pose=ladderArmPose({dx,dz,dy,rootYaw:0,extension:1,length:L,tip:-1,back}),tip=tipOf(pose,back);
  assert.ok(Math.hypot(tip.x-dx,tip.y-dy,tip.z-dz)<.05,`target ${[dx,dz,dy]}: tip ${JSON.stringify(tip)}`);
  assert.ok(pose.scale>1.05,'the ladder stretches to the window');
  const old=ladderArmPose({dx,dz,dy,rootYaw:0,extension:1,length:L,tip:-1}),oldTip=tipOf(old,back);
  assert.ok(Math.hypot(oldTip.x-dx,oldTip.y-dy,oldTip.z-dz)>.5,'measured from the turret centre the tip stopped short (the QA finding)');
 }
 assert.deepEqual(ladderArmPose({dx:1,dz:-2,dy:3,rootYaw:0,extension:0,length:L,back}),{yaw:0,pitch:0,scale:1},'stowed is unchanged');
});
