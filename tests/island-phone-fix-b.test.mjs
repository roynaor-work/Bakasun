import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../',import.meta.url));
const {createNavalModel}=await import(pathToFileURL(path.join(root,'workout/island/minigames/naval.mjs')));
const config=JSON.parse(await readFile(path.join(root,'workout/island/data/config.json'),'utf8')).minigames;
const FRAME=1/60;
function make(level=1,search='',difficulty='normal'){
 const old=globalThis.location;globalThis.location={search};
 try{return createNavalModel({config:{...config,width:844,height:390},balance:config.navalDuel,level,difficulty,seed:4,random:()=>.5});}
 finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;}
}
function step(m,n,input={}){for(let i=0;i<n&&!m.result;i++)m.update(FRAME,input);}
function acquire(m){step(m,20);const e=m.enemies.filter(e=>e.active&&e.hp>0).sort((a,b)=>Math.hypot(a.x-m.playerShip.x,a.z-m.playerShip.z)-Math.hypot(b.x-m.playerShip.x,b.z-m.playerShip.z))[0];m.update(FRAME,{lockTap:e.index});assert.ok(m.radar,'tap must begin acquisition');return e.index;}
function lock(m){const id=acquire(m);for(let i=0;i<300&&!m.homing;i++)m.update(FRAME,{});assert.equal(m.homing?.index,id);return id;}

test('B: each stage and difficulty requires a full 3.5 second acquisition',()=>{
 for(const stage of [1,5,10])for(const difficulty of ['easy','normal','hard']){const m=make(stage,'',difficulty);acquire(m);const at=m.radar.at;assert.equal(m.radar.need,3.5);step(m,179);assert.equal(m.homing,null,`${stage}/${difficulty}: no lock before 3 seconds`);assert.ok(m.radar);while(!m.homing&&m.time-at<4.1)m.update(FRAME,{});assert.ok(m.homing);assert.ok(m.time-at>=3.5-1e-9&&m.time-at<=3.5+FRAME+1e-9,`measured ${m.time-at}`);}
});
test('B: the radar continuously sweeps and tracks the live hull while acquiring',()=>{
 const m=make(),id=acquire(m);step(m,108);const a=m.radar;assert.ok(a,'radar must still be searching after 1.8 seconds');step(m,24);const b=m.radar;assert.ok(b,'radar must still be searching after 2.2 seconds');assert.ok(Number.isFinite(a.sweep)&&Number.isFinite(b.sweep),'model must expose the live sweep');assert.ok(b.sweep>a.sweep+Math.PI/2,'beam moves through the acquisition');assert.ok(b.scans>=1,'a complete search sweep');const e=m.enemies.find(e=>e.index===id);assert.equal(b.bearing,Math.atan2(e.z-m.playerShip.z,e.x-m.playerShip.x));assert.equal(m.homing,null);
});
test('B: one successful locked Fire tap consumes its lock; the next tap starts no automatic lock',()=>{
 const m=make();lock(m);step(m,30);const before=m.fired;m.update(FRAME,{quickShot:true});for(let i=0;i<30&&m.fired===before;i++)m.update(FRAME,{});assert.equal(m.fired,before+1);assert.equal(m.homing,null,'successful shot must clear homing');assert.equal(m.radar,null);assert.equal(m.lockedTargetIndex,null);assert.equal(m.stickyAt,null);step(m,30);assert.equal(m.homing,null);assert.equal(m.radar,null,'no stale automatic reacquisition');
});
test('B: a queued Fire tap fires once at the end of acquisition then clears the lock',()=>{
 const m=make();acquire(m);m.update(FRAME,{quickShot:true});assert.equal(m.radar.queued,true);const before=m.fired;for(let i=0;i<300&&m.fired===before;i++)m.update(FRAME,{});assert.equal(m.fired,before+1);assert.equal(m.homing,null);assert.equal(m.radar,null);step(m,30);assert.equal(m.fired,before+1);
});
test('B: a manual shot cancels an acquisition; a refused empty shot preserves an acquired lock',()=>{
 const m=make();acquire(m);m.update(FRAME,{firing:true});assert.equal(m.fired,1);assert.equal(m.radar,null,'manual shot clears pending acquisition');assert.equal(m.homing,null);
 const empty=make();lock(empty);empty.ammo[0]=0;const before=empty.fired;empty.update(FRAME,{quickShot:true});assert.equal(empty.fired,before);assert.ok(empty.homing,'no shot was fired, so preserve lock');
});
test('B: a successful dedicated torpedo clears the surface lock too',()=>{
 const m=make(11);lock(m);const sub=m.enemies.find(e=>e.subMode==='v24'&&e.active&&e.hp>0);assert.ok(sub);const n=m.fired;m.update(FRAME,{torpedoShot:true,torpedoTarget:sub.index});assert.equal(m.fired,n+1);assert.equal(m.homing,null);assert.equal(m.radar,null);
});
if(process.env.PHONE_FIX_ROLLBACK==='1')test('B rollback: both URL switches retain v24.1 short acquisition and persistent lock',()=>{
 for(const search of ['?phoneFixB=0','?phoneFixes=0','?phoneFixes=0&phoneFixB=1']){const m=make(1,search);acquire(m);assert.ok(m.radar.need>=.8&&m.radar.need<=1.5);assert.equal(m.radar.sweep,undefined);for(let i=0;i<120&&!m.homing;i++)m.update(FRAME,{});assert.ok(m.homing);step(m,30);const n=m.fired;m.update(FRAME,{quickShot:true});assert.equal(m.fired,n+1);assert.ok(m.homing,'legacy lock remains after shot');}
});
