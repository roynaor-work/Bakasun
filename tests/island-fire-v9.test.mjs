import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {fireScreenMovement} from '../workout/island/minigames/fire-navigation.mjs';
import {fireControlsV9} from '../workout/island/minigames/polish-flag.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.fireRescue,c=b.city;
const vs=c.cameraHeight*.82/Math.hypot(c.cameraHeight*.82,c.cameraBack*1.3+2.4);
const make=()=>{const m=createFireModel({config,balance:b,level:1,random:seededRandom(3)}),t=m.truck;t.x=c.roadsX[Math.floor(c.roadsX.length/2)];t.z=c.roadsZ[Math.floor(c.roadsZ.length/2)];for(let i=0;i<10;i++)m.update(.02,{});return m;};

test('Fire v9: all 8 stick directions turn the nose to the stick within 0.9 s and never drive the wrong way',()=>{
 const dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
 for(const [sx,sz] of dirs){
  const l=Math.hypot(sx,sz),mv=fireScreenMovement(sx/l,sz/l,vs),want=Math.atan2(-mv.moveX,-mv.moveZ),m=make(),t=m.truck;
  const diff=()=>Math.abs(Math.atan2(Math.sin(want-t.yaw),Math.cos(want-t.yaw)))*180/Math.PI;
  const d=Math.hypot(mv.moveX,mv.moveZ),ax=mv.moveX/d,az=mv.moveZ/d;let aligned=null,back=0,lx=t.x,lz=t.z;
  for(let i=1;i<=60;i++){m.update(.02,{moveX:mv.moveX,moveZ:mv.moveZ});const along=(t.x-lx)*ax+(t.z-lz)*az;lx=t.x;lz=t.z;if(along<0)back=Math.max(back,-along);if(aligned===null&&diff()<=10)aligned=i*.02;}
  assert.ok(aligned!==null&&aligned<=.9,`dir ${sx},${sz} aligned at ${aligned}`);assert.ok(back<.15,`dir ${sx},${sz} wrong-way ${back}`);assert.ok(diff()<=10);
 }
});
test('Fire v9: the firefighter is 1.75 m at the truck\'s scale and works on the ground beside the truck, never inside its footprint',()=>{
 assert.ok(Math.abs(b.crew.v9.height-1.75*b.vehicle.length/8)<.1,'1.75 m person next to an 8 m engine drawn at the game truck length');
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.8]){
  const m=createFireModel({config,balance:b,level:1,random:seededRandom(3)}),t=m.truck;t.yaw=yaw;let last=-1,states=new Set();
  for(let i=0;i<120;i++){m.update(.02,{firing:true,x:m.flames[0].x,y:m.flames[0].y});t.yaw=yaw;const f=m.firefighter;states.add(f.state);
   if(f.state==='exiting'||f.state==='working'){const dx=f.x-t.x,dz=f.z-t.z,fwd=dx*-Math.sin(yaw)+dz*-Math.cos(yaw),lat=Math.abs(dx*Math.cos(yaw)+dz*-Math.sin(yaw));
    assert.ok(lat>=b.vehicle.width/2*.8,`beside, not on, the truck (lat ${lat})`);if(f.state==='working'){assert.ok(lat>=b.vehicle.width/2+.5);assert.ok(Math.abs(fwd)<=b.vehicle.length/2);}
    assert.ok(f.progress>=last-1e-9,'exit progresses monotonically');last=f.progress;}}
  assert.ok(states.has('exiting')&&states.has('working'),'sequence: climbs down, then works');
 }
});
test('Fire v9: controls flag defaults on and can be switched back',()=>{
 assert.equal(fireControlsV9(''),true);assert.equal(fireControlsV9('?fireControls=v8'),false);assert.equal(fireControlsV9('?fireTruck=v1'),false);
});
