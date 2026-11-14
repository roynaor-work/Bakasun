import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BossEncounter} from '../encounter.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url)));
const make=i=>new BossEncounter(manifest.bosses[i]);
const active=i=>{const b=make(i);b.update(1.2);b.drainEvents();return b;};
test('entrance rejects damage and holds all shots until its telegraph finishes',()=>{
  for(let i=0;i<3;i++){
    const b=make(i);assert.equal(b.hit(b.spec.targets[0].node),false);b.update(1.19);
    assert.equal(b.status,'entering');assert.equal(b.drainEvents().filter(e=>e.type==='shot').length,0);
    b.update(.01);assert.equal(b.status,'active');const e=b.drainEvents();assert.equal(e.filter(e=>e.type==='shot').length,0);assert.ok(e.some(e=>e.type==='tell'));
    b.update(.89);assert.equal(b.drainEvents().filter(e=>e.type==='shot').length,0);
  }
});
test('mothership has three attack origins; a destroyed turret permanently stops its shots',()=>{
  const b=active(0);b.update(4);const shots=b.drainEvents().filter(e=>e.type==='shot');
  assert.deepEqual([...new Set(shots.map(e=>e.node))],['turret_left','turret_center','turret_right']);
  assert.equal(b.hit('turret_center',5),true);assert.equal(b.targets.hull.hp,12);
  b.drainEvents();b.update(15);const remaining=b.drainEvents().filter(e=>e.type==='shot');
  assert.ok(remaining.length>0);assert.ok(remaining.every(e=>e.node!=='turret_center'));assert.equal(b.status,'active');
  b.hit('hull',12);assert.equal(b.status,'retreating');
});
test('guardian core is gated exclusively by generator and shield never regenerates',()=>{
  const b=active(1);assert.ok(b.shieldActive);assert.equal(b.hit('hull',100),false);assert.equal(b.targets.hull.hp,12);
  assert.equal(b.hit('generator',3),true);assert.ok(b.shieldActive);assert.equal(b.targets.hull.hp,12);
  b.hit('generator',3);assert.equal(b.shieldActive,false);assert.equal(b.hp,12);assert.equal(b.status,'active');
  assert.equal(b.drainEvents().filter(e=>e.type==='shield-down').length,1);b.update(30);assert.equal(b.shieldActive,false);
  assert.equal(b.hit('hull',12),true);assert.equal(b.status,'retreating');
});
test('each crawler segment has independent HP, state, visibility event and attack schedule',()=>{
  const b=active(2);b.hit('segment_03',3);assert.equal(b.state('segment_03'),'damaged');assert.equal(b.targets.segment_02.hp,5);
  b.hit('segment_03',1);assert.equal(b.state('segment_03'),'critical');b.hit('segment_03',1);assert.equal(b.status,'active');
  assert.equal(b.drainEvents().filter(e=>e.type==='explosion').length,1);b.update(20);
  const shots=b.drainEvents().filter(e=>e.type==='shot');assert.equal(new Set(shots.map(e=>e.node)).size,4);assert.ok(shots.every(e=>e.node!=='segment_03'));
  for(const node of ['segment_01','segment_02','segment_04','segment_05'])b.hit(node,5);
  const e=b.drainEvents();assert.equal(e.filter(e=>e.type==='explosion').length,4);assert.equal(e.filter(e=>e.type==='death').length,1);assert.equal(b.status,'retreating');
});
test('large and small timesteps yield identical ordered attack events',()=>{
  for(let i=0;i<3;i++){
    const a=make(i),b=make(i);a.update(20);for(let j=0;j<200;j++)b.update(.1);b.update(.000001);
    const select=x=>x.drainEvents().filter(e=>['tell','shot'].includes(e.type)).map(e=>({type:e.type,node:e.node,angle:e.angle,time:e.time}));
    assert.deepEqual(select(a),select(b));
  }
});
test('every attack is preceded by at least 0.9s warning for the same target',()=>{
  for(let i=0;i<3;i++){
    const b=make(i);b.update(30);const seen={};
    for(const e of b.drainEvents()){
      if(e.type==='tell')seen[e.node]=e.time;
      if(e.type==='shot'){assert.ok(e.time-seen[e.node]>=.9-1e-9);assert.ok(e.angle>=-.25&&e.angle<=.25);}
    }
  }
});
test('retreat emits once; no hits, attacks or revival after defeat',()=>{
  for(let i=0;i<3;i++){
    const b=active(i);b.retreat();b.retreat();assert.equal(b.drainEvents().filter(e=>e.type==='retreat').length,1);
    assert.equal(b.hit(b.spec.targets[0].node),false);b.update(20);assert.equal(b.status,'gone');assert.equal(b.drainEvents().length,0);
  }
});
test('invalid damage never heals or corrupts HP; a destroyed part cannot explode twice',()=>{
  const b=active(2);for(const n of [-1,0,NaN,Infinity])assert.equal(b.hit('segment_01',n),false);
  assert.equal(b.hit('missing'),false);assert.equal(b.targets.segment_01.hp,5);
  b.hit('segment_01',5);assert.equal(b.hit('segment_01',5),false);assert.equal(b.drainEvents().filter(e=>e.type==='explosion').length,1);
  for(const n of [-1,NaN,Infinity])assert.throws(()=>b.update(n),RangeError);
});
test('reset restores independent targets, shield, entry lifecycle and scheduling',()=>{
  const b=active(1);b.hit('generator',6);b.hit('hull',12);b.update(2);b.reset();
  assert.equal(b.shieldActive,true);assert.equal(b.hp,18);assert.equal(b.status,'entering');assert.equal(b.time,0);assert.equal(b.drainEvents()[0].type,'entrance');
});
