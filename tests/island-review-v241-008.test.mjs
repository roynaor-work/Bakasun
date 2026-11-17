import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
const load=p=>import(pathToFileURL(resolve(root,p)));
const {createNavalModel}=await load('workout/island/minigames/naval.mjs');
const {seededRandom}=await load('workout/island/minigames/context.mjs');
const config=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames;
const dt=1/60;
function make(search=''){
 const previous=globalThis.location;globalThis.location={search};
 try{return createNavalModel({config:{...config,width:844,height:390},balance:config.navalDuel,level:3,random:seededRandom(5)});}finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
}
function finale(search=''){
 const m=make(search);
 for(let i=0;i<60*18.1;i++)m.update(dt,{skyMode:'manual',skyHeld:true,skyYaw:Math.PI,skyPitch:.4});
 for(let i=0;i<60*60&&!m.result&&!m.missionState.complete;i++){
  const input={skyMode:'manual'};
  if(!m.homing&&!m.radar)input.lockSmart=true;
  if(m.homing?.status==='ready'&&m.cooldowns[0]<=0)input.quickShot=true;
  m.update(dt,input);
 }
 assert.equal(m.missionState.complete,true,'the real inputs sank the fleet');
 return m;
}
test('V241-008: the aerial finale accepts repair and supply while its mission clock is frozen',()=>{
 const m=finale();
 assert.ok(m.airFinale&&!m.result&&m.belt===0&&m.buoys.length,'reproduce the depleted belt at the aerial finale');
 const hp=m.lives,charge=m.ammo[5],remaining=m.remaining;
 assert.ok(hp<m.playerShip.maxHp&&charge>0,'damage and a repair charge are available');
 m.update(dt,{skyMode:'manual',ammoIndex:5,quickShot:true});
 assert.ok(m.lives>hp,'repair works while the sky is still occupied');
 assert.equal(m.ammo[5],charge-1,'exactly one repair charge spent');
 let closest=Infinity;
 for(let i=0;i<60*10&&!m.result&&m.supplies===0;i++){
  const b=m.buoys[0],input={skyMode:'manual'};
  if(b){const d=Math.atan2(b.z-m.playerShip.z,b.x-m.playerShip.x)-(m.camera?.heading||0);input.moveX=Math.sin(d);input.moveZ=-Math.cos(d);closest=Math.min(closest,Math.hypot(b.x-m.playerShip.x,b.z-m.playerShip.z));}
  m.update(dt,input);
  if(b)closest=Math.min(closest,Math.hypot(b.x-m.playerShip.x,b.z-m.playerShip.z));
 }
 assert.ok(closest<16,'real steering reached the supply buoy');
 assert.equal(m.supplies,1,'the buoy is collected during the finale');
 assert.ok(m.belt>0,'the Vulcan belt is replenished');
 assert.equal(m.remaining,remaining,'the mission clock remains frozen');
 assert.ok(m.airFinale&&!m.result,'maintenance does not end a stage with occupied sky');
 // Do not mock the completion gate: let the real aircraft leave/fall and check the normal win.
 for(let i=0;i<60*70&&!m.result;i++)m.update(dt,{skyMode:'manual'});
 assert.equal(m.result?.outcome,'win');
});
test('V241-008: navalAirEnd=v24 retains immediate fleet-completion behavior',()=>{
 const m=finale('?navalAirEnd=v24');
 for(let i=0;i<60*3&&!m.result;i++)m.update(dt,{skyMode:'manual'});
 assert.equal(m.airFinale,false);assert.equal(m.result?.outcome,'win');
});
