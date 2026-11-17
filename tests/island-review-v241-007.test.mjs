import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,dt,assertFiniteBones} from './review-v241/soccer-motion-fixture.mjs';

function keeper(){return {id:0,team:0,role:'keeper',x:0,z:0,vx:0,vz:0,fx:1,fz:0,diveZ:-1,diveTime:.65};}
for(const [height,direction,clip] of [[.3,-1,'low_left'],[1,-1,'mid_left'],[2,-1,'high_left'],[.3,1,'low_right'],[1,1,'mid_right'],[2,1,'high_right']])test('V241-007: '+clip+' owns takeoff, contact, landing and get-up across live frames',()=>{
  const {motion,group}=fixture(),p=keeper(),s={controlled:1,players:[p],ball:{x:1,z:1,y:height,owner:null},phase:'playing',mode:'defense'};
  p.diveZ=direction;
  motion.update(p,s,{mode:'dive'},dt);
  const initial=motion.dive;assert.ok(initial);assert.equal(initial.name,'v241_keeper_dive_'+clip);
  let previous=initial.time,sawContact=false,sawLand=false;
  for(let frame=1;frame<180;frame++){
    p.diveTime=Math.max(0,.65-frame*dt);
    // Once the simulation permits movement, the authored landing/get-up still
    // owns the body until its stand event. This covers the next-frame bug and
    // the complete transition, not just the selected clip prefix.
    const active=motion.dive&&motion.dive.time<motion.dive.stand;
    const mode=p.diveTime>0?'dive':'idle';
    motion.update(p,s,{mode},dt);assertFiniteBones(assert,group);
    if(active){
      assert.equal(motion.state,initial.name,'an active dive cannot be replaced by locomotion');
      const dive=motion.dive;assert.ok(dive,'active dive plan survives');
      assert.ok(Number.isFinite(dive.time)&&dive.time>=previous-1e-9,'dive advances monotonically');
      sawContact ||= dive.time>=dive.contact;sawLand ||= dive.time>=dive.land;
      previous=dive.time;
    }else if(frame>40)break;
  }
  assert.ok(sawContact&&sawLand,'clip passes both contact and landing');
  for(let frame=0;frame<120;frame++)motion.update(p,s,{mode:'idle'},dt);
  assert.equal(motion.dive,null);assert.equal(motion.state,'idle');
});
test('V241-007: an explicit celebration can interrupt the dive',()=>{
  const {motion}=fixture(),p=keeper(),s={controlled:1,players:[p],ball:{x:1,z:1,y:1,owner:null},phase:'playing',mode:'defense'};
  motion.update(p,s,{mode:'dive'},dt);motion.update(p,s,{mode:'celebrate'},dt);
  assert.equal(motion.state,'celebrate');assert.equal(motion.dive,null);
});
for(const query of ['?soccerTackleV2=0','?soccerV241=0'])test('V241-007: '+query+' keeps legacy keeper clips',()=>{
  const {motion,group}=fixture(query),p=keeper(),s={controlled:1,players:[p],ball:{x:1,z:1,y:1,owner:null},phase:'playing',mode:'defense'};
  for(let frame=0;frame<4;frame++){p.diveTime=.65-frame*dt;motion.update(p,s,{mode:'dive'},dt);assertFiniteBones(assert,group);}
  assert.ok(!motion.state.startsWith('v241_'));assert.equal(motion.dive,null);
});
