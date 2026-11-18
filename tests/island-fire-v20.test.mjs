import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {fireV20} from '../workout/island/minigames/polish-flag.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.fireRescue,c=b.city;
const routes=[[[0,-1,2.2],[1,0,2.4],[0,1,2.0],[-1,0,2.4],[0,-1,2.0]],[[.7,-.7,1.6],[-.7,-.7,1.6],[.7,.7,1.6],[-.7,.7,1.6]],[[0,-1,1],[1,0,1],[0,-1,1],[-1,0,1],[0,-1,1],[1,0,1]]];
test('Fire v20: the drawn nose follows the real motion; the truck is almost never drawn sideways (slip over 15 degrees at most 12% of moving time)',()=>{
 for(const steps of routes){
  const m=createFireModel({config,balance:b,level:1,random:seededRandom(3)}),t=m.truck;t.x=c.roadsX[Math.floor(c.roadsX.length/2)];t.z=c.roadsZ[Math.floor(c.roadsZ.length/2)];for(let i=0;i<10;i++)m.update(.02,{});
  let lx=t.x,lz=t.z,n=0,bad=0;
  for(const [x,z,sec] of steps)for(let i=0;i<sec*50;i++){m.update(.02,{moveX:x,moveZ:z,assisted:true});const vx=t.x-lx,vz=t.z-lz;lx=t.x;lz=t.z;if(Math.hypot(vx,vz)/.02>4){n++;const vd=Math.atan2(-vx,-vz),d=Math.abs(Math.atan2(Math.sin(vd-t.drawYaw),Math.cos(vd-t.drawYaw)))*180/Math.PI;if(d>15)bad++;}}
  assert.ok(n>100&&bad/n<=.12,`slip ${bad}/${n}`);
 }
});
test('Fire v20: flags default on and each can be switched back',()=>{
 for(const f of ['fireDraw','fireLadder','fireSound']){assert.equal(fireV20(f,''),true);assert.equal(fireV20(f,`?${f}=v19`),false);assert.equal(fireV20(f,'?fireTruck=v1'),false);}
});
