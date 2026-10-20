import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFireDriver,fireThrottle,slideFireTruck,fireTruckIntersectsBuilding} from '../workout/island/minigames/fire-roads.mjs';
import {fireIndicators,fireScreenMovement,followFireCamera} from '../workout/island/minigames/fire-navigation.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.fireRescue;
const driver=()=>{const truck={x:6,z:18},drive=createFireDriver(truck,b);return {truck,drive};};
const advance=(drive,n,input)=>{for(let i=0;i<n;i++)drive.update(.01,input);};
test('G2o 90 degree turn is continuous, capped at 2.5 rad/s and reaches the heading in 0.6–0.9 seconds',()=>{
 const {truck,drive}=driver();let previous=truck.yaw,reached;
 for(let i=1;i<=90;i++){drive.update(.01,{moveX:1});assert.ok(Math.abs(truck.yaw-previous)<=2.5*.01+1e-9);previous=truck.yaw;if(reached===undefined&&Math.abs(truck.yaw+Math.PI/2)<.025)reached=i/100;}
 assert.ok(reached>=.6&&reached<=.9,String(reached));assert.ok(truck.x>6);assert.ok(truck.z<18);
});
test('G2o acceleration and release take 0.3 seconds, with quadratic speed at partial tilt',()=>{
 const full=driver(),half=driver();advance(full.drive,15,{moveZ:-1});assert.ok(Math.abs(full.truck.speed-9)<1e-9);advance(full.drive,15,{moveZ:-1});assert.equal(full.truck.speed,18);
 advance(half.drive,30,{moveZ:-.575});assert.ok(Math.abs(half.truck.speed-4.5)<1e-9);assert.equal(fireThrottle(.15,0,b.controls),0);assert.equal(fireThrottle(0,0,b.controls),0);
 advance(full.drive,15,{});assert.ok(Math.abs(full.truck.speed-9)<1e-9);advance(full.drive,16,{});assert.equal(full.truck.speed,0);assert.equal(full.truck.driving,false);
});
test('G2o screen diagonals preserve throttle and compensate for camera foreshortening',()=>{const s=34/Math.hypot(34,23),input=fireScreenMovement(.4,-.4,s);assert.ok(Math.abs(Math.hypot(input.moveX,input.moveZ)-Math.hypot(.4,.4))<1e-9);assert.ok(Math.abs(input.moveX+input.moveZ*s)<1e-9);});
test('G2o wall impact keeps tangential movement and never penetrates or tunnels',()=>{
 const building={x:0,z:0,width:6,depth:20},radius=Math.hypot(b.vehicle.length/2,b.vehicle.width/2),truck={x:-3-radius-.01,z:0};
 for(let i=0;i<30;i++){slideFireTruck(truck,.08,-.12,[building],b.vehicle);assert.equal(fireTruckIntersectsBuilding(truck,building,b.vehicle),false);}
 assert.ok(truck.z<-3.5);assert.ok(Math.abs(truck.x+3+radius)<1e-6);
 const fast={x:-15,z:0};slideFireTruck(fast,30,0,[building],b.vehicle);assert.ok(fast.x<=-3-radius+1e-6);
});
test('G2o lane assistance eases an aligned truck toward the street without teleporting',()=>{const {truck,drive}=driver();truck.x=6.1;truck.z=10;let first;for(let i=0;i<50;i++){const x=truck.x;drive.update(.01,{moveZ:-1});assert.ok(Math.abs(truck.x-x)<.01);if(i===0)first=truck.x;}assert.ok(first>6&&first<6.1);assert.ok(truck.x<first);});
test('G2o camera follows smoothly and looks ahead along the actual velocity',()=>{const camera={x:0,z:0},truck={x:6,z:18,velocityX:18,velocityZ:0};followFireCamera(camera,truck,b,.02);assert.ok(camera.x>0&&camera.x<6);for(let i=0;i<300;i++)followFireCamera(camera,truck,b,.02);assert.ok(Math.abs(camera.x-9)<.001);truck.velocityX=-18;for(let i=0;i<300;i++)followFireCamera(camera,truck,b,.02);assert.ok(Math.abs(camera.x-3)<.001);});
function markers(points,rescues=[]){const m={truck:{x:0,z:0},flames:points.map(p=>({x:p.x,y:p.y,active:p.active??true,heat:p.heat??1,warning:p.warning??0})),rescues};return fireIndicators(m,{config:{width:844,height:390},balance:b},(x,y)=>({x,y}),()=>({x:422,y:195}));}
test('G2o one arrow per off-screen fire in every direction and no arrow for visible or extinguished fires',()=>{const arrows=markers([{x:-10,y:120},{x:900,y:150},{x:420,y:-20},{x:500,y:450},{x:400,y:200},{x:-20,y:100,heat:0},{x:-30,y:130,active:false}]);assert.equal(arrows.length,4);assert.deepEqual(arrows.map(a=>a.index),[0,1,2,3]);for(const a of arrows){assert.equal(a.kind,'fire');assert.ok(a.x>=36&&a.x<=808&&a.y>=76&&a.y<=210);assert.ok(a.y===76||a.x===36||a.x===808);assert.ok(Math.abs(a.angle-Math.atan2(a.targetScreen.y-195,a.targetScreen.x-422))<1e-9);}});
test('G2o rescue arrows have a distinct icon/color and disappear when visible, rescued or expired',()=>{const rescues=[{x:-40,y:100,world:[14,3,15]},{x:400,y:200,world:[0,3,0]},{x:900,y:100,world:[0,3,0],rescued:true},{x:900,y:150,world:[0,3,0],expired:true}],arrows=markers([{x:-20,y:120}],rescues);assert.equal(arrows.length,2);assert.equal(arrows[1].kind,'rescue');assert.notEqual(arrows[0].color,arrows[1].color);assert.ok(Math.hypot(arrows[0].x-arrows[1].x,arrows[0].y-arrows[1].y)>40);});
test('G2o distance affects marker size and color, and warning fires remain discoverable',()=>{const arrows=markers([{x:-20,y:100,heat:0,warning:1},{x:400,y:200},{x:900,y:200}]);assert.equal(arrows.length,2);assert.notEqual(arrows[0].size,arrows[1].size);assert.notEqual(arrows[0].color,arrows[1].color);});

test('G2o crowded arrows stay separated on an exact edge',()=>{const arrows=markers(Array.from({length:9},(_,i)=>({x:420+i*.1,y:-20-i})));assert.equal(arrows.length,9);for(let i=0;i<arrows.length;i++){const a=arrows[i];assert.ok(a.y===76||a.x===36||a.x===808);for(let j=0;j<i;j++)assert.ok(Math.hypot(a.x-arrows[j].x,a.y-arrows[j].y)>=a.size+arrows[j].size+6);}});
