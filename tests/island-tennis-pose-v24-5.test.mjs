// v24.5 tennis racket poses (Roy, 18/11/2026): the racket rises beside the head in the serve toss, and is held a little to the side for a
// backhand. ?tennisPose=0 keeps v24.4. Browser proof: workout/island/tests/aliens-tennis-v24-5-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const T=await import('../workout/island/vendor/three.module.js');
const {tennisPoseEnabled,pose25Mode,pose25Config,hold25,strokeSide,POSE25_DEFAULTS,READY_DEFAULTS,readyHold}=await import('../workout/island/minigames/tennis-grip.mjs');
const view=await readFile(new URL('../workout/island/minigames/tennis-view.mjs',import.meta.url),'utf8');
const tennis=await readFile(new URL('../workout/island/minigames/tennis.mjs',import.meta.url),'utf8');

test('tennis pose v24.5: on by default, ?tennisPose=0 keeps v24.4',()=>{
 assert.equal(tennisPoseEnabled(''),true);assert.equal(tennisPoseEnabled('?tennisPose=0'),false);
 assert.match(view,/poseHolds=tennisPoseEnabled\(\)\?/);
});
test('tennis pose v24.5: which hold applies when',()=>{
 const p={x:0,swing:0,preparing:false},rally={phase:'rally',server:1,index:0,lastHitter:1};
 assert.equal(pose25Mode(p,{phase:'toss',server:0,index:0}),'trophy','the server tossing raises the racket');
 assert.equal(pose25Mode(p,{phase:'serve',server:0,index:0}),null,'waiting to serve keeps the v24.4 ready hold');
 assert.equal(pose25Mode(p,{phase:'toss',server:1,index:0}),null,'the receiver does not');
 assert.equal(pose25Mode({...p,swing:.3},{phase:'toss',server:0,index:0}),null,'the serve swing takes over');
 assert.equal(pose25Mode(p,{...rally,contact:{side:0,x:.8}}),'backhand','ball coming to the backhand side (player 0: x above his own)');
 assert.equal(pose25Mode(p,{...rally,contact:{side:0,x:-.8}}),null,'forehand side: the ready hold in front');
 assert.equal(pose25Mode({...p,preparing:true},{...rally,contact:{side:0,x:.8}}),null,'preparing/swinging: the game\'s own backswing');
 assert.equal(pose25Mode(p,{...rally,lastHitter:0,contact:{side:1,x:.8}}),null,'the ball going away');
 assert.equal(pose25Mode({x:0,swing:0},{phase:'rally',server:0,index:1,lastHitter:0,contact:{side:1,x:-.8}}),'backhand','player 1 mirrored');
});
test('tennis pose v24.5: the stroke rule is the game\'s own (tennis.mjs)',()=>{
 assert.match(tennis,/player\.stroke=\(b\.x-player\.x\)\*\(side===0\?-1:1\)>=0\?'forehand':'backhand';/);
 for(const [x,i,want] of [[-1,0,'forehand'],[1,0,'backhand'],[1,1,'forehand'],[-1,1,'backhand']])assert.equal(strokeSide({x:0},x,i),want);
});
test('tennis pose v24.5: trophy = racket up beside and above the head; backhand = held to the other side with both hands',()=>{
 const c=pose25Config({}),shaft=q=>new T.Vector3(0,-1,0).applyQuaternion(q);
 const trophy=hold25(T,c.trophy),up=shaft(trophy.quaternion);
 assert.ok(up.y>.7,'the racket head points up');assert.ok(up.x>.45,'and out to the racket side, clear of the big hair');
 assert.ok(trophy.rightHand[1]>=1.8&&trophy.rightHand[0]>=.4,'the racket hand up beside the head (head bone ~1.7)');
 assert.ok(trophy.rightHand[0]+.575*up.x>=.75,'the racket head (0.575 m up the shaft) ends at least 0.75 m to the side');
 assert.ok(trophy.rightHand[1]+.575*up.y>READY_DEFAULTS.rightHand[1]+.8,'the racket head rises at least 0.8 m above the ready hold');
 const ready=readyHold(T,READY_DEFAULTS),back=hold25(T,c.backhand),bs=shaft(back.quaternion),rs=shaft(ready.quaternion);
 assert.ok(back.rightHand[0]<ready.rightHand[0]-.3,'the grip moves to the other side of the body');assert.ok(bs.x<rs.x-.3,'the racket head leans further to the other side');
 assert.ok(bs.y>.3,'still up (held, not hanging)');assert.ok(back.chest>0&&back.chest<.4,'a short turn, not the full backswing (backhand frame 0: 0.6)');
 assert.ok(back.leftHand&&Math.hypot(...back.leftHand.map((v,k)=>v-back.rightHand[k]))<.3,'the other hand on the throat');
 assert.ok(c.tossRise>=.3,'the rise is slow enough to see');assert.deepEqual(POSE25_DEFAULTS.trophy.dir,c.trophy.dir);
});
