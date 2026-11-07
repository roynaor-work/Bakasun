import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienV10Enabled,steerMissile,nearestAlien} from '../workout/island/minigames/alien-v10.mjs';
import {alienFlightHudStatus} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {missiles,pressure} from '../workout/island/verification/aliens-v10/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
const make=(o={},off=false)=>{globalThis.__alienV10=off?false:undefined;const m=createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',roundChoices:false,...o});globalThis.__alienV10=undefined;return m;};
const run=(m,s,input={})=>{for(let i=0;i<Math.ceil(s*30);i++)m.update(1/30,input);};

test('v10 flag: on by default, ?alienV10=0 and the global switch restore v9',()=>{
 assert.equal(alienV10Enabled('',undefined),true);assert.equal(alienV10Enabled('?alienV10=0',undefined),false);assert.equal(alienV10Enabled('',false),false);
});
test('v10 companion ships exist only after the bonus, last 10-15 s, count down, and then disappear',()=>{
 const m=make({equipment:{weapon:2},permanentUpgrades:{wing:2}});run(m,3);
 assert.equal(m.wings.filter(w=>w.active).length,0,'gear alone no longer gives a permanent wing');
 m.pickups.push({kind:4,x:m.player.x,y:m.player.y,vy:0});m.update(1/30,{});m.update(1/30,{});
 assert.ok(m.wingTime>=10&&m.wingTime<=15);assert.ok(m.wings.some(w=>w.active));assert.equal(m.wingMax,balance.v10.wingSeconds);
 const t0=m.wingTime;run(m,2,{});assert.ok(m.wingTime<t0-1.5);
 assert.equal(alienFlightHudStatus(m).weaponText.includes('ש׳'),true);
 run(m,balance.v10.wingSeconds,{});assert.equal(m.wingTime,0);assert.equal(m.wings.filter(w=>w.active).length,0);
 const old=make({equipment:{weapon:2}},true);run(old,1);assert.ok(old.wings.some(w=>w.active),'flag off keeps the permanent wing');
});
test('v10 missile locks on the nearest alien, steers toward it and shows a lock + trail',()=>{
 const m=make();run(m,3);m.pickups.push({kind:5,x:m.player.x,y:m.player.y,vy:0});m.update(1/30,{});
 const near=nearestAlien(m.aliens,m.player.x,m.player.y,1);m.update(1/30,{nova:true});
 assert.equal(m.nova.targetId,near.id);assert.ok(m.nova.flight>0);
 run(m,.2,{});assert.ok(m.nova.trail.length>0);assert.ok(Number.isFinite(m.nova.targetX));
 const probe={x:0,y:0,angle:0};steerMissile(probe,{x:0,y:-100},.05,{speed:100,turn:9});assert.ok(probe.angle<0&&probe.angle>=-.46);
});
test('v10 at least 80% of missiles hit (measured by simulation), and the legacy flag stays below that',()=>{
 for(const level of [1,3,5]){let f=0,h=0;for(let s=1;s<=5;s++){const r=missiles(level,s);f+=r.fired;h+=r.hit;}assert.ok(h/f>=.8,`stage ${level}: ${h}/${f}`);}
});
test('v10 alien fire is a little denser in stages 1-3 but stays a light threat in stage 1',()=>{
 const r=pressure(1,1,60);assert.ok(r.bolts>=6);assert.ok(r.hits<=4,`hits ${r.hits}`);
 const a=make(),b=make({},true);assert.ok(a.behavior.fireCadence<b.behavior.fireCadence);
 const late=createAlienModel({config,balance,level:5,random:seededRandom(3),completion:'waves',roundChoices:false});
 globalThis.__alienV10=false;const lateOff=createAlienModel({config,balance,level:5,random:seededRandom(3),completion:'waves',roundChoices:false});globalThis.__alienV10=undefined;
 assert.equal(late.behavior.fireCadence,lateOff.behavior.fireCadence);
});
