import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {soccerCodexStates,soccerV10States,soccerV12Overlay,soccerMotionV12Enabled,SOCCER_V12_KEEP} from '../workout/island/minigames/soccer-codex-motion.mjs';

const read=f=>JSON.parse(readFileSync(new URL('../workout/island/assets/'+f,import.meta.url),'utf8'));
const v12=read('soccer-v12/clips.json'),v9=soccerCodexStates(read('soccer-v9/clips.json')),v10=soccerV10States(read('soccer-v10/clips.json'),'');

test('flag: on by default, off with ?soccerMotionV12=0', () => {
  assert.equal(soccerMotionV12Enabled(''),true);
  assert.equal(soccerMotionV12Enabled('?soccerMotionV12=0'),false);
});
test('repaired clips replace existing states, locomotion cycles are kept as shipped', () => {
  const o=soccerV12Overlay(v12,{v9,v10},'');
  for(const id of SOCCER_V12_KEEP)for(const [map,prefix] of [[o.v9,'v9_'],[o.v10,'v10_']]){if(v9[prefix+id]||v10[prefix+id])assert.deepEqual((map[prefix+id]),({v9,v10})[prefix==='v9_'?'v9':'v10'][prefix+id],id);}
  assert.ok(o.counts.v9Replaced>0&&o.counts.v10Replaced>0);
  assert.ok(v10.v10_goalkeeper_hand_roll&&o.v10.v10_goalkeeper_hand_roll);assert.notDeepEqual(o.v10.v10_goalkeeper_hand_roll.keyframes,v10.v10_goalkeeper_hand_roll.keyframes);
  assert.equal(o.counts.v10Added,0,'gated cuts stay out without soccerCuts=all');
  assert.equal(o.v10.v10_cut_45_left,undefined);
});
test('?soccerCuts=all adds the repaired cuts that pass the key gate', () => {
  const o=soccerV12Overlay(v12,{v9,v10},'?soccerCuts=all');
  assert.ok(o.v10.v10_cut_90_left&&o.v10.v10_cut_90_left.maxKeyDeg<=70);
  assert.ok(o.counts.v10Added>=6);
});
test('every repaired clip is a well-formed state (18 bones, 0..1 time, no key snap above the gate)', () => {
  for(const lib of ['v9','v10'])for(const [id,s] of Object.entries(v12.libraries[lib])){
    assert.ok(s.keyframes.length>=2,id);assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);
    assert.equal(Object.keys(s.keyframes[0].rotations).length,18,id);
    assert.ok(s.maxKeyDeg<70,`${lib}/${id} ${s.maxKeyDeg}`);
  }
});
test('v12 off leaves the inputs untouched', () => {
  const before=JSON.stringify(Object.keys(v10));soccerV12Overlay(v12,{v9,v10},'?soccerCuts=all');
  assert.equal(JSON.stringify(Object.keys(v10)),before);
});
