// Review-only, deterministic, real model input; run from repository root with node <this-file>.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createNavalModel} from '../../../minigames/naval.mjs';
import {seededRandom} from '../../../minigames/context.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../../../data/config.json',import.meta.url))).minigames;
const balance=config.navalDuel,dt=1/60;
const m=createNavalModel({config:{...config,width:844,height:390},balance,level:3,random:seededRandom(5)});
for(let i=0;i<60*18.1;i++)m.update(dt,{skyMode:'manual',skyHeld:true,skyYaw:Math.PI,skyPitch:.4});
const beforeKill={time:m.time,belt:m.snapshot().belt,buoys:m.buoys.map(b=>({...b}))};
for(let i=0;i<60*60&&!m.result&&!m.missionState.complete;i++){
 const input={skyMode:'manual'};
 if(!m.homing&&!m.radar)input.lockSmart=true;
 if(m.homing?.status==='ready'&&m.cooldowns[0]<=0)input.quickShot=true;
 m.update(dt,input);
}
assert.ok(m.airFinale&&m.missionState.complete&&m.buoys.length&&m.snapshot().belt===0);
const atFinale={time:m.time,belt:m.snapshot().belt,air:m.snapshot().air.map(a=>({kind:a.kind,state:a.state,hp:a.hp})),hp:m.lives};
const repairBefore={hp:m.lives,charges:m.ammo[5]};
m.update(dt,{skyMode:'manual',ammoIndex:5,quickShot:true});
const repairAfter={hp:m.lives,charges:m.ammo[5],repairLife:m.repairLife};
assert.equal(repairAfter.hp,repairBefore.hp,'BUG: repair input is skipped as well');
assert.equal(repairAfter.charges,repairBefore.charges);
let closest=Infinity;
for(let i=0;i<60*10&&!m.result;i++){
 const buoy=m.buoys[0],input={skyMode:'manual'};
 if(buoy){const d=Math.atan2(buoy.z-m.playerShip.z,buoy.x-m.playerShip.x)-(m.camera?.heading||0);input.moveX=Math.sin(d);input.moveZ=-Math.cos(d);closest=Math.min(closest,Math.hypot(buoy.x-m.playerShip.x,buoy.z-m.playerShip.z));}
 m.update(dt,input);
}
const after={time:m.time,closestBuoyDistance:closest,collectRadius:16,belt:m.snapshot().belt,supplies:m.snapshot().supplies,buoys:m.buoys.length,hp:m.lives,result:m.result||null};
assert.ok(closest<16,'the ship reached the buoy using real movement input');
assert.equal(after.supplies,0,'BUG: the finale bypassed the supply update');
assert.equal(after.belt,0,'BUG: the belt could not reload at the buoy');
console.log(JSON.stringify({merge:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',beforeKill,atFinale,repairBefore,repairAfter,after},null,2));
