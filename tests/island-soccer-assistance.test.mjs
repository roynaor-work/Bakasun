import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assistedPassDestination,selectControlledPlayer,canContactBall,receiveBallMotion,followDribbleBall,soccerActionContext} from '../workout/island/minigames/soccer-assistance.mjs';

const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const player=(id,x,z,extra={})=>({id,x,z,vx:0,vz:0,fx:1,fz:0,team:0,role:'support',speed:1,cooldown:0,recover:0,slideTime:0,...extra});
const ball=(extra={})=>({x:0,z:0,y:base.physics.ballRadius,vx:0,vz:0,vy:0,owner:null,...extra});
const state=(players=[player(0,0,0),player(1,6,1)],extra={})=>({players,ball:ball(),controlled:0,attackDir:1,role:'field',aim:{x:1,z:0},...extra});
const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} ~= ${b}`);
const degrees=n=>n*Math.PI/180;
const teammate=(id,d,angle,extra={})=>player(id,Math.cos(degrees(angle))*d,Math.sin(degrees(angle))*d,extra);

test('pass assistance corrects only toward a nearby teammate zone',()=>{
  const s=state(),result=assistedPassDestination(s,base);
  assert.equal(result.target,1);assert.equal(result.kind,'ground');assert.equal(result.assisted,true);
  assert.ok(Math.hypot(result.x-6,result.z-1)<=0.85);assert.ok(Math.abs(result.correctionRadians)<=degrees(18));
});

test('a teammate outside the cone, behind, or beyond assist range cannot steal aim',()=>{
  for(const [d,angle] of [[6,29],[6,80],[6,180],[10.01,0],[20,0],[0.8,0]]){
    const result=assistedPassDestination(state([player(0,0,0),teammate(1,d,angle)]),base);
    assert.equal(result.target,null,`range ${d}, angle ${angle}`);assert.equal(result.assisted,false);near(result.x,base.passing.minDistance);near(result.z,0);
  }
});

test('max correction remains bounded even inside a configurable wider cone',()=>{
  const c={...base,assistance:{passing:{coneDegrees:70,maxCorrectionDegrees:8,receiverZone:0.9}}};
  const result=assistedPassDestination(state([player(0,0,0),teammate(1,4,18)]),c);
  assert.equal(result.target,1);near(result.correctionRadians,degrees(8));
  assert.ok(Math.hypot(result.x-4*Math.cos(degrees(18)),result.z-4*Math.sin(degrees(18)))<0.9);
  const rejected=assistedPassDestination(state([player(0,0,0),teammate(1,9,35)]),c);
  assert.equal(rejected.target,null);near(rejected.correctionRadians,0);
});

test('manual ground drag preserves its exact direction despite a tempting teammate',()=>{
  const s=state([player(0,0,0),teammate(1,6,0)],{aim:{x:1,z:0},passAim:{x:3,z:4,manual:true}});
  const result=assistedPassDestination(s,base,0.1);
  assert.equal(result.target,null);assert.equal(result.assisted,false);near(result.z/result.x,4/3);near(result.correctionRadians,0);
});

test('lofted automatic and manual passes retain the requested ray',()=>{
  for(const manual of [false,true]){
    const s=state([player(0,0,0),teammate(1,7,0)],{aim:{x:4,z:3},passAim:{x:4,z:3,manual}});
    const result=assistedPassDestination(s,base,0.7);
    assert.equal(result.kind,'loft');assert.equal(result.target,null);near(result.z/result.x,3/4);
  }
});

test('manual ground pass can identify a local receiver without correcting its heading',()=>{
  const aim={x:4,z:3,manual:true},range=base.passing.minDistance;
  const s=state([player(0,0,0),player(1,range*0.8,range*0.6+0.9)],{aim,passAim:aim});
  const result=assistedPassDestination(s,base,0);
  assert.equal(result.target,1);assert.equal(result.assisted,false);near(result.x,range*0.8);near(result.z,range*0.6);near(result.correctionRadians,0);
});

test('a loft receiver must be near the actual unchanged landing point',()=>{
  const power=0.7,range=base.passing.minDistance+(base.passing.maxDistance-base.passing.minDistance)*power;
  const s=state([player(0,0,0),player(1,range,1.2)],{aim:{x:1,z:0},passAim:{x:1,z:0,manual:true}});
  const result=assistedPassDestination(s,base,power);
  assert.equal(result.target,1);assert.equal(result.assisted,false);near(result.x,range);near(result.z,0);near(result.correctionRadians,0);
  s.players[1].z=3;assert.equal(assistedPassDestination(s,base,power).target,null);
  s.players[1].x=2;s.players[1].z=0;assert.equal(assistedPassDestination(s,base,power).target,null);
});

test('moving teammate lead is bounded and cannot enter the cone from outside',()=>{
  const s=state([player(0,0,0),player(1,6,0,{vx:0,vz:200})]);
  const result=assistedPassDestination(s,base);
  assert.equal(result.target,1);assert.ok(result.z<=0.85+1e-9);
  const outside=state([player(0,0,0),teammate(1,6,35,{vz:-100})]);
  assert.equal(assistedPassDestination(outside,base).target,null);
});

test('destination clipping preserves manual direction and physical pitch bounds',()=>{
  for(const x of [-base.pitch.length/2+.3,0,base.pitch.length/2-.3])for(const z of [-base.pitch.width/2+.3,0,base.pitch.width/2-.3])for(let angle=-180;angle<=180;angle+=15){
    const aim={x:Math.cos(degrees(angle)),z:Math.sin(degrees(angle)),manual:true};
    const s=state([player(0,x,z)],{ball:ball({x,z}),aim});
    const result=assistedPassDestination(s,base,1);
    assert.ok(Math.abs(result.x)<=base.pitch.length/2-base.physics.ballRadius+1e-9);
    assert.ok(Math.abs(result.z)<=base.pitch.width/2-base.physics.ballRadius+1e-9);
    near((result.x-x)*aim.z-(result.z-z)*aim.x,0,1e-8);
  }
});

test('assistance target ties are deterministic independently of roster ordering',()=>{
  const players=[player(0,0,0),teammate(2,6,-10),teammate(1,6,10)];
  const a=assistedPassDestination(state(players),base),b=assistedPassDestination(state([...players].reverse()),base);
  assert.equal(a.target,1);assert.deepEqual(a,b);
});

test('pass geometry remains bounded across directions, powers and receiver distances',()=>{
  for(const power of [0,0.1,0.25])for(const range of [1,2,5,9,10.1,16])for(let aim=-180;aim<180;aim+=30)for(let angle=-90;angle<=90;angle+=10){
    const a=degrees(aim),receiver=teammate(1,range,aim+angle),s=state([player(0,0,0),receiver],{aim:{x:Math.cos(a),z:Math.sin(a)}});
    const result=assistedPassDestination(s,base,power);
    assert.ok(Math.abs(result.correctionRadians)<=degrees(18)+1e-9);
    if(result.assisted){
      assert.ok(range<=10);assert.ok(range>=1.3);assert.ok(Math.abs(angle)<=28);
      assert.ok(Math.hypot(result.x-receiver.x,result.z-receiver.z)<=0.86);
    }else near((result.x-s.ball.x)*s.aim.z-(result.z-s.ball.z)*s.aim.x,0,1e-8);
  }
});

test('manual switch anticipates a moving ball rather than taking the nearest current spot',()=>{
  const s=state([player(0,-6,0),player(1,0,2),player(2,5,0),player(3,6,0,{role:'keeper'})],{ball:ball({vx:15})});
  assert.equal(selectControlledPlayer(s,base,{manual:true}),2);
});

test('manual switch respects joystick intent when intercept times are similar',()=>{
  const s=state([player(0,0,0),player(1,3,2),player(2,3,-2)],{ball:ball({x:7})});
  assert.equal(selectControlledPlayer(s,base,{manual:true,moveZ:1}),1);
  assert.equal(selectControlledPlayer(s,base,{manual:true,moveZ:-1}),2);
});

test('automatic selection keeps near ties stable with hysteresis',()=>{
  const s=state([player(0,0,0),player(1,0.1,0)],{ball:ball({x:6})});
  assert.equal(selectControlledPlayer(s,base),0);
  s.players[1].x=4;assert.equal(selectControlledPlayer(s,base),1);
});

test('automatic selection retains control during own possession, pass and cooldown',()=>{
  const make=extra=>state([player(0,-5,0),player(1,0,0)],{ball:ball(),...extra});
  assert.equal(selectControlledPlayer(make({ball:ball({owner:1})}),base),0);
  assert.equal(selectControlledPlayer(make({passTarget:{player:0}}),base),0);
  assert.equal(selectControlledPlayer(make({switchCooldown:0.2}),base),0);
});

test('selection excludes keepers, recovering and sliding teammates',()=>{
  const s=state([player(0,-6,0),player(1,0,0,{role:'keeper'}),player(2,0,0,{recover:1}),player(3,0,0,{slideTime:1}),player(4,2,0)]);
  assert.equal(selectControlledPlayer(s,base,{manual:true}),4);
});

test('selection ties use stable IDs rather than roster order',()=>{
  const players=[player(0,-6,0),player(3,0,1),player(2,0,-1)];
  assert.equal(selectControlledPlayer(state(players),base,{manual:true}),2);
  assert.equal(selectControlledPlayer(state([...players].reverse()),base,{manual:true}),2);
});

test('foot contact is forgiving only in a genuinely local sphere and low window',()=>{
  const p=player(0,0,0);
  assert.equal(canContactBall(p,ball({x:0.9}),base),true);
  for(const x of [0.98,2,5,30])assert.equal(canContactBall(p,ball({x}),base),false);
  assert.equal(canContactBall(p,ball({x:0.2,y:base.rules.pickupHeight+0.01}),base),false);
  assert.equal(canContactBall(p,ball({x:0.2,y:-2}),base),false);
});

test('header window rejects out-of-reach, low, high and owned balls',()=>{
  const p=player(0,0,0),options={kind:'head'},reach=Math.min(base.aerial.reach,base.assistance?.contact?.headReach??1.2);
  assert.equal(canContactBall(p,ball({x:reach,y:1.7}),base,options),true);
  for(const b of [ball({x:reach+0.01,y:1.7}),ball({x:0.5,y:base.aerial.minHeight-0.01}),ball({x:0.5,y:base.aerial.maxHeight+0.01}),ball({x:0.5,y:1.7,owner:0})])assert.equal(canContactBall(p,b,base,options),false);
});

test('header reach override can narrow the window but never extend the original aerial reach',()=>{
  const p=player(0,0,0),options={kind:'head'};
  for(const requestedReach of [0.8,base.aerial.reach,base.aerial.reach+2]){
    const c={...base,assistance:{...base.assistance,contact:{...base.assistance?.contact,headReach:requestedReach}}};
    const reach=Math.min(base.aerial.reach,requestedReach);
    assert.equal(canContactBall(p,ball({x:reach,y:1.7}),c,options),true);
    assert.equal(canContactBall(p,ball({x:reach+0.01,y:1.7}),c,options),false);
  }
});

test('inactive bodies and opposing ownership cannot acquire contact privileges',()=>{
  for(const extra of [{cooldown:0.2},{recover:0.1},{slideTime:0.3}])assert.equal(canContactBall(player(0,0,0,extra),ball(),base),false);
  assert.equal(canContactBall(player(0,0,0),ball({owner:1}),base),false);
  assert.equal(canContactBall(player(0,0,0),ball({x:NaN}),base),false);
});

test('first touch retains running momentum and body direction without position changes',()=>{
  const p=player(0,2,3,{vx:6,vz:2,fx:0,fz:1}),b=ball({x:2.4,z:3,vx:-8,vz:0});
  const patch=receiveBallMotion(p,b,base);
  assert.ok(Math.hypot(patch.vx,patch.vz)>Math.hypot(p.vx,p.vz)*0.9);
  near(patch.fx,0);near(patch.fz,1);assert.equal('x' in patch,false);assert.equal('z' in patch,false);
});

test('high-speed reception impulse remains bounded and cannot launch a player',()=>{
  const p=player(0,0,0),result=receiveBallMotion(p,ball({vx:1000,vz:1000}),base);
  assert.ok(Math.hypot(result.vx,result.vz)<=0.42+1e-9);
});

test('dribble first touch visibly advances toward the foot over multiple ticks',()=>{
  const p=player(0,0,0),b=ball({x:-0.8,owner:0,vx:2}),target=base.physics.dribbleOffset;
  const first=followDribbleBall(p,b,1/60,base);
  assert.ok(first.x>b.x);assert.ok(first.x<target);assert.ok(first.x-b.x<0.12);
  let rolling={...b};for(let i=0;i<60;i++)rolling={...rolling,...followDribbleBall(p,rolling,1/60,base)};
  near(rolling.x,target,0.002);near(rolling.z,0,0.002);assert.equal(rolling.owner,0);
});

test('dribble following retains movement and contact across a running first touch',()=>{
  const p=player(0,0,0,{vx:5.3}),b=ball({x:0.3,owner:0,vx:4.6});
  let rolling={...b};for(let i=0;i<120;i++){p.x+=p.vx/60;rolling={...rolling,...followDribbleBall(p,rolling,1/60,base)};assert.equal(rolling.owner,0);assert.ok(Math.hypot(rolling.x-p.x,rolling.z-p.z)<1.3);}
  assert.ok(rolling.vx>5);assert.ok(rolling.x>p.x);
});

test('a far owned ball is released in place instead of teleported to the foot',()=>{
  const p=player(0,0,0),b=ball({x:8,z:2,y:2,owner:0,vx:12,vy:3});
  const result=followDribbleBall(p,b,1/60,base);
  assert.deepEqual(result,{x:8,z:2,y:2,vx:12,vz:0,vy:3,owner:null});
});

test('hand carry, foreign owner and zero time are unaffected by foot following',()=>{
  const p=player(0,0,0),b=ball({x:0.8,owner:0});
  for(const [body,owned,dt] of [[{...p,hands:true},b,1/60],[p,{...b,owner:1},1/60],[p,b,0]]){
    assert.deepEqual(followDribbleBall(body,owned,dt,base),{x:owned.x,z:owned.z,y:owned.y,vx:owned.vx,vz:owned.vz,vy:owned.vy,owner:owned.owner});
  }
});

test('receiving ball settles vertically gradually rather than snapping to ground',()=>{
  const result=followDribbleBall(player(0,0,0),ball({x:0.5,y:1,owner:0}),1/60,base);
  assert.ok(result.y<1);assert.ok(result.y>base.physics.ballRadius);assert.ok(result.vy<0);
});

test('free-ball context never exposes keeper actions to a field player',()=>{
  const s=state();assert.equal(soccerActionContext(s,base),'loose');
  s.ball=ball({lastTeam:1,lastPlayer:4});assert.equal(soccerActionContext(s,base),'loose');
  s.ball=ball({x:-base.pitch.length/2+2,vx:-12});assert.equal(soccerActionContext(s,base),'defense');
  s.players.push(player(2,-base.pitch.length/2+2,0,{role:'keeper'}));s.controlled=2;assert.equal(soccerActionContext(s,base),'keeper');
});

test('context handles either attacking direction, real owners and keeper possession',()=>{
  const s=state([player(0,0,0),player(1,1,0,{team:1})]);
  s.ball.owner=0;assert.equal(soccerActionContext(s,base),'attack');
  s.ball.owner=1;assert.equal(soccerActionContext(s,base),'defense');
  s.attackDir=-1;s.ball=ball({x:base.pitch.length/2-2,vx:12});assert.equal(soccerActionContext(s,base),'defense');
  s.players[0].role='keeper';s.players[0].hands=true;assert.equal(soccerActionContext(s,base),'attack');
});

test('all assistance helpers are deterministic and leave their inputs untouched',()=>{
  const s=state(),saved=structuredClone(s),c=structuredClone(base);
  for(let i=0;i<20;i++){
    assert.deepEqual(assistedPassDestination(s,c),assistedPassDestination(s,c));
    assert.equal(selectControlledPlayer(s,c),selectControlledPlayer(s,c));
    receiveBallMotion(s.players[0],s.ball,c);followDribbleBall(s.players[0],s.ball,1/60,c);canContactBall(s.players[0],s.ball,c);soccerActionContext(s,c);
  }
  assert.deepEqual(s,saved);assert.deepEqual(c,base);
});
