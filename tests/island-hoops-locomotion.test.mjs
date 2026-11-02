// v4 (02/11): natural movement for the broadcast athletes: speed bands with overlap (no clip
// flicker at a boundary) and a lean layer (acceleration, turns, the chest leading).
import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCO_BANDS,pickLocomotion} from '../workout/island/minigames/hoops-players-v1.mjs';

test('locomotion bands: the playing clip holds across its overlap, a clear speed change switches, bands cover every speed',()=>{
 const free=LOCO_BANDS.free;
 assert.equal(pickLocomotion(free,1.0,null)[0],'walk');assert.equal(pickLocomotion(free,3.0,null)[0],'jog');
 assert.equal(pickLocomotion(free,2.0,'walk')[0],'walk','just over the old walk/jog boundary a walker keeps walking');
 assert.equal(pickLocomotion(free,1.8,'jog')[0],'jog','just under it a jogger keeps jogging');
 assert.equal(pickLocomotion(free,2.4,'walk')[0],'jog','well past the band the clip changes');
 assert.equal(pickLocomotion(free,5.7,'run')[0],'run');assert.equal(pickLocomotion(free,5.7,'sprint')[0],'sprint');assert.equal(pickLocomotion(free,6.4,'run')[0],'sprint');
 for(const bands of [free,LOCO_BANDS.ball])for(let v=0;v<=9;v+=0.05){const b=pickLocomotion(bands,v,null);assert.ok(b&&v>=b[1]&&v<=b[2],`${v} m/s has a band`);}
 for(const bands of [free,LOCO_BANDS.ball])for(let i=1;i<bands.length;i++)assert.ok(bands[i][1]<bands[i-1][2],'neighbouring bands overlap');
 assert.equal(pickLocomotion(LOCO_BANDS.ball,0.1,null)[0],'dribble_stand');assert.equal(pickLocomotion(LOCO_BANDS.ball,3.0,'dribble_walk')[0],'dribble_jog');
});

