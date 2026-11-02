// v4 (02/11): the dribble of the broadcast athletes: a real bounce from the hand to the floor and
// back (quick push, slower rise), the dribbling hand pumping with the ball, lower and faster at
// speed, a low crossover between the hands (hoops-view.mjs + hoops-players-v1.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {dribbleHeight,dribblePump} from '../workout/island/minigames/hoops-players-v1.mjs';

test('dribble bounce: hand at the top, floor at the push-down point, the drop quicker than the rise, continuous',()=>{
 assert.equal(dribbleHeight(0),1);assert.ok(dribbleHeight(0.42)<1e-9);assert.ok(Math.abs(dribbleHeight(0.999)-1)<0.01);
 assert.ok(dribbleHeight(0.21)<0.75,'the push takes the ball down fast');assert.ok(dribbleHeight(0.71)<=0.76&&dribbleHeight(0.71)>0.5,'half way up the rise the ball is already three quarters of the way: it slows near the hand');
 let prev=dribbleHeight(0);for(let u=0.01;u<0.42;u+=0.01){const h=dribbleHeight(u);assert.ok(h<=prev+1e-9);prev=h;}
 prev=dribbleHeight(0.42);for(let u=0.42;u<1;u+=0.01){const h=dribbleHeight(u);assert.ok(h>=prev-1e-9);prev=h;}
 for(let u=0;u<1;u+=0.01)assert.ok(dribbleHeight(u)>=0&&dribbleHeight(u)<=1);
 assert.ok(Math.abs(dribbleHeight(1.3)-dribbleHeight(0.3))<1e-12,'periodic');
});

test('dribble hand: rides the ball down, waits low, lifts to meet it at the top',()=>{
 assert.equal(dribblePump(0),0);assert.equal(dribblePump(0.25),1);assert.equal(dribblePump(0.5),1);assert.ok(dribblePump(0.85)>0.4&&dribblePump(0.85)<0.6);assert.ok(dribblePump(0.999)<0.01);
 for(let u=0;u<1;u+=0.01)assert.ok(dribblePump(u)>=0&&dribblePump(u)<=1);
});
