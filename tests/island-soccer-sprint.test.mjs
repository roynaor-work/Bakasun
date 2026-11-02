import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sprintMeterStep,sprintMeterTimes} from '../workout/island/minigames/soccer-sprint.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer.sprint;
const dt=1/120,fresh=()=>({value:c.capacity,capacity:c.capacity,active:false,locked:false,regenDelay:0});
const run=(m,seconds,input)=>{let t=0;for(;t<seconds-1e-9;t+=dt)sprintMeterStep(m,c,dt,input);return m;};

test('sprint meter: held button drains full to empty in about 3.5 seconds, then locks',()=>{
  const times=sprintMeterTimes(c);assert.ok(Math.abs(times.drainSeconds-3.5)<.05,`drain ${times.drainSeconds}`);
  const m=fresh();run(m,3,{requested:true});assert.ok(m.active&&m.value>0&&m.value<c.capacity*.2);
  run(m,.6,{requested:true});assert.equal(m.value,0);assert.equal(m.active,false);assert.equal(m.locked,true);
});
test('sprint meter: it only works while the button is held and the player moves',()=>{
  const m=fresh();sprintMeterStep(m,c,dt,{requested:true,moving:true});assert.equal(m.active,true);
  sprintMeterStep(m,c,dt,{requested:false,moving:true});assert.equal(m.active,false,'released: off on the same frame');
  sprintMeterStep(m,c,dt,{requested:true,moving:false});assert.equal(m.active,false,'standing still: no sprint');
  sprintMeterStep(m,c,dt,{requested:true,moving:true,available:false});assert.equal(m.active,false,'sliding or recovering: no sprint');
});
test('sprint meter: regeneration waits about a second after release and refills in about 6 seconds',()=>{
  const times=sprintMeterTimes(c);assert.ok(Math.abs(times.regenSeconds-6)<.05,`regen ${times.regenSeconds}`);assert.ok(Math.abs(times.delaySeconds-1)<1e-9);
  const m=fresh();run(m,1,{requested:true});const after=m.value;
  run(m,.9,{requested:false});assert.ok(Math.abs(m.value-after)<1e-9,'no regeneration during the delay');
  run(m,.2,{requested:false});assert.ok(m.value>after,'regeneration begins after the delay');
  const empty=fresh();run(empty,4,{requested:true});assert.equal(empty.value,0);
  run(empty,1+6.05,{requested:false});assert.ok(Math.abs(empty.value-c.capacity)<1e-6,`full again after delay + regen (${empty.value})`);
});
test('sprint meter: an empty meter refuses to sprint until it is back to 30 percent',()=>{
  const m=fresh();while(!m.locked)sprintMeterStep(m,c,dt,{requested:true});
  run(m,c.regenDelaySeconds+(c.minToStart-2)/c.regenPerSecond,{requested:true});assert.equal(m.active,false,'still locked below 30 percent even with the button held');assert.ok(m.value<c.minToStart&&m.value>0);
  run(m,3/c.regenPerSecond,{requested:true});assert.equal(m.locked,false);assert.equal(m.active,true);assert.ok(Math.abs(c.minToStart/c.capacity-.3)<1e-9);
});
test('sprint meter: a card bonus scales regeneration, never the drain',()=>{
  const a=fresh(),b=fresh();run(a,2,{requested:true});run(b,2,{requested:true});assert.equal(a.value,b.value);
  run(a,2,{requested:false,regen:1});run(b,2,{requested:false,regen:1.6});assert.ok(b.value>a.value);
});
