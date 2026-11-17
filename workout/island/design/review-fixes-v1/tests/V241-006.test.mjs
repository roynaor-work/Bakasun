import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,dt,assertFiniteBones} from './soccer-motion-fixture.mjs';

function player(){return {id:0,team:0,role:'striker',x:0,z:0,vx:0,vz:0,fx:1,fz:0,slideTime:.35,recover:0,slideKind:'straight'};}
function state(p){return {controlled:0,players:[p],ball:{x:1,z:0,owner:null},phase:'playing',mode:'attack'};}
test('V241-006: real retargeted slide stays finite and monotonic through contact, recovery, get-up and idle',()=>{
  const {motion,group}=fixture(),p=player(),s=state(p),times=[];
  const step=mode=>{
    motion.update(p,s,{mode},dt);
    assertFiniteBones(assert,group);
    if(motion.slide){
      assert.equal(motion.slide.name,'v241_slide');
      const t=motion.actions.v241_slide.time;
      assert.ok(Number.isFinite(t),'live slide time is finite on every frame');
      if(times.length)assert.ok(t>=times.at(-1)-1e-9,'slide time never reverses');
      times.push(t);
    }
  };
  for(let frame=0;frame<=21;frame++){p.slideTime=Math.max(0,.35-frame*dt);step('slide');}
  assert.ok(times.at(-1)>=.49&&times.at(-1)<=.51,'authored ball contact at end of simulated slide');
  for(let frame=0;frame<=48;frame++){p.recover=Math.max(0,.8-frame*dt);step('recover');}
  assert.ok(times.at(-1)>=1.59,'the authored get-up finishes with recovery');
  for(let frame=0;frame<90;frame++)step('idle');
  assert.equal(motion.slide,null);
  assert.equal(motion.state,'idle');
  assert.ok(times.length>40,'tests repeated live updates, not only clip selection');
});
test('V241-006: a recovered slide releases to a moving player',()=>{
  const {motion,group}=fixture(),p=player(),s=state(p);
  motion.update(p,s,{mode:'slide'},dt);
  p.slideTime=.15;motion.update(p,s,{mode:'slide'},dt);
  p.slideTime=0;p.recover=.2;motion.update(p,s,{mode:'recover'},dt);
  p.recover=0;p.vx=4.5;
  for(let frame=0;frame<40;frame++)motion.update(p,s,{mode:'run'},dt);
  assertFiniteBones(assert,group);
  assert.equal(motion.slide,null);assert.equal(motion.state,'run');
});
for(const query of ['?soccerTackleV2=0','?soccerV241=0'])test('V241-006: '+query+' keeps the real v24 slide',()=>{
  const {motion,group}=fixture(query),p=player(),s=state(p);
  for(let frame=0;frame<5;frame++){p.slideTime=.35-frame*dt;motion.update(p,s,{mode:'slide'},dt);assertFiniteBones(assert,group);}
  assert.equal(motion.slide?.v241,false);assert.equal(motion.state,'v24_slide_tackle');
  assert.ok(Number.isFinite(motion.actions.v24_slide_tackle.time));
});
