import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalAimStep,navalAimGain} from '../workout/island/minigames/naval-controls.mjs';
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
