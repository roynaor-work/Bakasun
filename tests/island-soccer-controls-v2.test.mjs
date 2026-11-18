import test from 'node:test';
import assert from 'node:assert/strict';
import {directionalSwitchTarget,selectControlledPlayer} from '../workout/island/minigames/soccer-assistance.mjs';

const mk=(id,x,z,team=0,role='mid')=>({id,x,z,team,role,recover:0,slideTime:0});
const state=()=>({controlled:0,players:[mk(0,0,0),mk(1,10,0),mk(2,-10,0),mk(3,0,12),mk(4,0,-6),mk(5,30,0,0,'keeper'),mk(6,12,1,1)],ball:{x:0,z:0,vx:0,vz:0,y:.2}});

test('stick direction picks the teammate in that direction', () => {
  const s=state();
  assert.equal(directionalSwitchTarget(s,{moveX:1,moveZ:0}),1);
  assert.equal(directionalSwitchTarget(s,{moveX:-1,moveZ:0}),2);
  assert.equal(directionalSwitchTarget(s,{moveX:0,moveZ:1}),3);
  assert.equal(directionalSwitchTarget(s,{moveX:0,moveZ:-1}),4);
});
test('neutral stick, keepers and rivals are ignored', () => {
  const s=state();
  assert.equal(directionalSwitchTarget(s,{moveX:0.1,moveZ:0}),null);
  s.players=s.players.filter(p=>p.id!==1);
  assert.notEqual(directionalSwitchTarget(s,{moveX:1,moveZ:0}),5);
  assert.notEqual(directionalSwitchTarget(s,{moveX:1,moveZ:0}),6);
});
test('wide cone is the fallback; nobody that way means null', () => {
  const s=state();s.players=[mk(0,0,0),mk(1,10,8)];
  assert.equal(directionalSwitchTarget(s,{moveX:1,moveZ:0}),1);
  s.players=[mk(0,0,0),mk(1,-10,0)];
  assert.equal(directionalSwitchTarget(s,{moveX:1,moveZ:0}),null);
});
test('v1 path unchanged unless directional is requested', () => {
  const s=state();const config={pitch:{length:100,width:60},players:{speed:5},physics:{ballRadius:.2,pickupRadius:.6},aerial:{maxHeight:1},rules:{pickupHeight:.5},selection:{}};
  const a=selectControlledPlayer(s,config,{manual:true,moveX:1,moveZ:0});
  const b=selectControlledPlayer(s,config,{manual:true,moveX:1,moveZ:0,directional:false});
  assert.equal(a,b);
});
