import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAimRun} from '../workout/island/tests/boar-aim-acceptance.mjs';

const earned={trials:[{},{}],summary:{all:{shots:2,reached:1,hits:1}},final:{shotsBy:{button:2}},errors:[]};

test('aim acceptance requires complete trials, target acquisition and successful button shots',()=>{
  assert.doesNotThrow(()=>assertAimRun(earned,2));
  assert.throws(()=>assertAimRun(earned,0),/positive number/);
  assert.throws(()=>assertAimRun({...earned,trials:[{}]},2),/all requested/);
  for(const [key,message] of [['shots','exercise shooting'],['reached','acquire a target'],['hits','hit a boar']]){
    assert.throws(()=>assertAimRun({...earned,summary:{all:{...earned.summary.all,[key]:0}}},2),new RegExp(message));
  }
  assert.throws(()=>assertAimRun({...earned,final:{shotsBy:{button:1,stick:1}}},2),/only the fire button/);
  assert.throws(()=>assertAimRun({...earned,errors:['page failure']},2),/no page errors/);
});
