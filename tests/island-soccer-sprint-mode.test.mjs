import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccerGestureRecognizer,soccerSprintMode} from '../workout/island/minigames/soccer-design-controls.mjs';

const interaction=JSON.parse(readFileSync(new URL('../workout/island/design/controls/interaction.json',import.meta.url),'utf8')),thresholds=interaction.gesture_thresholds;
const pad={left:0,top:0,right:104,bottom:104,width:104,height:104},button={left:200,top:0,right:264,bottom:64,width:64,height:64};
const make=opts=>{const r=createSoccerGestureRecognizer({thresholds,...opts});r.setState('attack',['stick','kick','pass','sprint','switch']);r.setEnabled(true);return r;};

test('mode: button-only with a tap burst by default; ?soccerAutoSprint=1 restores the latch', () => {
  assert.deepEqual(soccerSprintMode(''),{autoSprint:false,sprintTapMs:450});
  assert.deepEqual(soccerSprintMode('?soccerAutoSprint=1'),{autoSprint:true,sprintTapMs:0});
});
test('full-tilt stick held long does not latch a sprint when auto sprint is off', () => {
  const r=make({autoSprint:false});r.beginStick(1,104,52,pad,0);
  for(let t=0;t<2000;t+=50)assert.equal(r.sample(1,t).sprintHeld,false);
});
test('the old latch still works with auto sprint on', () => {
  const r=make({autoSprint:true});r.beginStick(1,104,52,pad,0);let on=false;
  for(let t=0;t<2000;t+=50)on=on||r.sample(1,t).sprintHeld;
  assert.equal(on,true);
});
test('a sprint tap sprints for the burst time, the button held sprints while held, then it stops', () => {
  const r=make({autoSprint:false,sprintTapMs:450});
  r.begin('sprint',2,232,32,button,0);assert.equal(r.sample(1,10).sprintHeld,true);
  r.end(2,232,32,60);
  assert.equal(r.sample(1,200).sprintHeld,true,'inside the burst');
  assert.equal(r.sample(1,600).sprintHeld,false,'burst over');
  r.begin('sprint',3,232,32,button,1000);for(const t of [1100,1500,2500])assert.equal(r.sample(1,t).sprintHeld,true);
  r.end(3,232,32,3000);assert.equal(r.sample(1,3600).sprintHeld,false);
});
test('sprinting does not press kick or pass', () => {
  const r=make({autoSprint:false,sprintTapMs:450});r.begin('sprint',2,232,32,button,0);
  const i=r.sample(1,100);assert.equal(i.kickHeld,false);assert.equal(i.passHeld,false);
});
