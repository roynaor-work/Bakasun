import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {compileSoccerTactics} from '../workout/island/minigames/soccer-design-tactics.mjs';
import {meetPoint} from '../workout/island/minigames/soccer-teamplay.mjs';
import {shapeScenarios} from '../workout/island/tools/soccer-shape-sim.mjs';

const source=JSON.parse(await readFile(new URL('../workout/island/design/tactics/soccer.json',import.meta.url),'utf8'));
const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const config={...base,squad:{formation:'4-3-3',extraPlayersPerTeam:2}};
const roles=['CF','RCM','GK','LW','LCB','RCB'],ids=[[0,1,2,6,8,10],[3,4,5,7,9,11]],runtime={CF:'striker',RCM:'support',GK:'keeper',LW:'wing',LCB:'support',RCB:'wing'};
const hx=config.pitch.length/2,hz=config.pitch.width/2;
/** Home attacks toward +x. Rivals form a block around the ball; the carrier is given. */
function scene({carrier='LW',ballX=4,ballZ=-10,hold=1,rivalLine=14,attackDir=1}={}){
 const players=[];
 for(const team of [0,1])for(let i=0;i<roles.length;i++){
  const tacticalRole=roles[i],d=attackDir*(team===0?1:-1);
  players.push({id:ids[team][i],team,role:runtime[tacticalRole],tacticalRole,x:0,z:0,vx:0,vz:0,recover:0,slideTime:0,hold:0});
 }
 players.sort((a,b)=>a.id-b.id);
 const home=players.filter(p=>p.team===0),away=players.filter(p=>p.team===1),d=attackDir;
 home.forEach((p,i)=>{p.x=d*(ballX-6+(i%2)*3);p.z=(i-2.5)*5;});
 away.forEach((p,i)=>{p.x=d*(p.role==='keeper'?hx-1.2:Math.min(hx-2,rivalLine-(i%3)*3));p.z=p.role==='keeper'?0:(i-2.5)*4;});
 const owner=home.find(p=>p.tacticalRole===carrier);owner.x=d*ballX;owner.z=ballZ;owner.hold=hold;
 return {elapsed:5,phase:'playing',attackDir,controlled:owner.id,players,ball:{owner:owner.id,lastTeam:0,lastPlayer:owner.id,x:d*ballX,z:ballZ,vx:0,vz:0},passTarget:null,restart:null,stage:1};
}
const targetOf=(controller,state,role)=>{const p=state.players.find(q=>q.team===0&&q.tacticalRole===role);return {...controller.target(p,state),player:p};};

test('v3 movement: the striker leads the line on the shoulder of the last defender and bursts after the carrier holds',()=>{
 for(const attackDir of [1,-1]){
  const controller=compileSoccerTactics(source,config);
  const quick=scene({carrier:'RCM',ballX:2,ballZ:0,hold:.1,attackDir}),early=targetOf(controller,quick,'CF');
  const last=Math.max(...quick.players.filter(p=>p.team===1&&p.role!=='keeper').map(p=>p.x*attackDir));
  assert.equal(early.duty,'lead');
  assert.ok(early.x*attackDir>quick.ball.x*attackDir+2.5,`ahead of the ball (${early.x})`);
  assert.ok(Math.abs(early.x*attackDir-last)<2.5,`on the last defender's shoulder (${early.x*attackDir} vs ${last})`);
  const held=scene({carrier:'RCM',ballX:2,ballZ:0,hold:1.4,attackDir});held.elapsed=6;const late=targetOf(controller,held,'CF');
  assert.equal(late.duty,'run');assert.ok(late.x*attackDir>early.x*attackDir+1.5,'a timed run beyond the line after third_man_run.startDelaySeconds');
 }
});

test('v3 movement: the far-side wing attacks the box and the near-side wing overlaps a wide carrier',()=>{
 const controller=compileSoccerTactics(source,config);
 const farSide=scene({carrier:'RCM',ballX:16,ballZ:10,hold:1}),wing=targetOf(controller,farSide,'LW');
 assert.equal(wing.duty,'box-run');assert.ok(wing.x>hx-config.pitch.penaltyDepth-.5&&wing.z<0&&Math.abs(wing.z)<config.pitch.penaltyWidth/2+.1,`into the box on the wing's own side (${wing.x},${wing.z})`);
 const nearSide=scene({carrier:'LW',ballX:8,ballZ:-10,hold:.2});
 // The wing carries; the striker and midfielder show. Move the wing back as a team-mate: the midfielder carries wide on the wing's side.
 const overlapScene=scene({carrier:'RCM',ballX:8,ballZ:-10,hold:.2});const lw=overlapScene.players.find(p=>p.team===0&&p.tacticalRole==='LW');lw.x=2;lw.z=-12;
 const overlap=controller.target(lw,overlapScene);
 assert.equal(overlap.duty,'overlap');assert.ok(overlap.x>overlapScene.ball.x+3&&overlap.z<-8,`runs ahead down the line (${overlap.x},${overlap.z})`);
 assert.ok(nearSide.players.length===12);
});

test('v3 movement: the midfielder shows diagonally ahead away from pressure, or drops as an outlet only under a tight press',()=>{
 const controller=compileSoccerTactics(source,config);
 const open=scene({carrier:'CF',ballX:0,ballZ:2,hold:.5,rivalLine:16}),support=targetOf(controller,open,'RCM');
 const nearestRival=open.players.filter(p=>p.team===1&&p.role!=='keeper').sort((a,b)=>Math.hypot(a.x-open.ball.x,a.z-open.ball.z)-Math.hypot(b.x-open.ball.x,b.z-open.ball.z))[0];
 assert.equal(support.duty,'support');
 const dx=support.x-open.ball.x,dz=support.z-open.ball.z,angle=Math.atan2(Math.abs(dz),dx)*180/Math.PI,range=Math.hypot(dx,dz);
 assert.ok(dx>0&&angle>25&&angle<70,`diagonal ahead at the design angle (${angle.toFixed(0)} degrees)`);
 assert.ok(range>4&&range<9,`a reachable support distance (${range.toFixed(1)} m)`);
 assert.ok(Math.sign(support.z-open.ball.z)===Math.sign(open.ball.z-nearestRival.z)||nearestRival.z===open.ball.z,'on the side away from the nearest rival');
 const pressed=scene({carrier:'CF',ballX:0,ballZ:2,hold:.5,rivalLine:16});const presser=pressed.players.find(p=>p.id===3);presser.x=1.6;presser.z=2;
 const outlet=targetOf(controller,pressed,'RCM');assert.equal(outlet.duty,'outlet');assert.ok(outlet.x<pressed.ball.x-2,'drops behind the pressed carrier');
});

test('v3 movement: nobody crowds the carrier, at most two run ahead and the rest defence stays goal-side yet connected',()=>{
 const controller=compileSoccerTactics(source,config);
 for(const ballX of [-10,0,8,16,21])for(const ballZ of [-12,-4,3,11]){
  const state=scene({carrier:'CF',ballX,ballZ,hold:1}),runs=[];
  for(const p of state.players.filter(p=>p.team===0&&p.role!=='keeper'&&p.id!==state.controlled)){
   const t=controller.target(p,state);
   assert.ok(Math.hypot(t.x-ballX,t.z-ballZ)>=3.3,`team-mate ${t.role} keeps a receiving radius from the carrier (${Math.hypot(t.x-ballX,t.z-ballZ).toFixed(1)} m at ${ballX},${ballZ})`);
   if(['run','box-run','overlap'].includes(t.duty))runs.push(t.role);
   if(t.role==='LCB'||t.role==='RCB'){
    const deepestRival=Math.min(...state.players.filter(p=>p.team===1&&p.role!=='keeper').map(p=>p.x));
    assert.ok(t.x<=deepestRival+1e-8,`${t.role} stays goal-side of every rival attacker`);
    assert.ok(t.x>=Math.min(ballX,deepestRival)-12-1e-8,`${t.role} stays within rest_defense.behindBallM of the ball (${t.x} vs ball ${ballX})`);
   }
  }
  assert.ok(runs.length<=2,`at most maxForwardRunners run ahead (${runs.join(',')})`);
 }
});

test('v3 movement: a receiver meets a rolling pass early instead of waiting where it was aimed',()=>{
 const runner={x:6,z:0,vx:0,vz:0},ball={x:0,z:0,vx:9,vz:0},aimed={x:7,z:0};
 const meet=meetPoint(runner,ball,config,config.players.speed,aimed);
 assert.ok(meet.x>0&&meet.x<aimed.x-.5,`steps toward the ball (${meet.x.toFixed(2)})`);assert.ok(meet.time>0&&meet.time<1);
 const still={x:0,z:0,vx:0,vz:0};assert.equal(meetPoint(runner,still,config,config.players.speed,aimed),aimed,'a resting ball keeps the aimed point');
 const unreachable={x:0,z:0,vx:30,vz:0};assert.equal(meetPoint({x:0,z:20,vx:0,vz:0},unreachable,config,config.players.speed,aimed),aimed,'an unreachable ball falls back to the aimed point');
 const lane=meetPoint({x:5,z:-3,vx:0,vz:0},ball,config,config.players.speed,aimed);assert.ok(Math.abs(lane.z)<1e-9&&lane.x<=5.5,'the point lies on the ball path');
 assert.deepEqual(runner,{x:6,z:0,vx:0,vz:0});assert.deepEqual(ball,{x:0,z:0,vx:9,vz:0});
});

test('v3 movement: the human carrier accumulates hold time so team-mates can time their runs; receivers step to the ball in the real match',()=>{
 const game=createSoccer({config,seed:3,stage:1,difficulty:'normal',role:'field',league:true}),s=game.getState();
 const hold=s.players[s.controlled].hold;
 for(let i=0;i<30;i++)game.update(config.match.fixedStep,{moveX:0,moveZ:0});
 assert.ok(s.ball.owner===s.controlled);assert.ok(s.players[s.controlled].hold>hold+.4,'the controlled carrier counts its hold');
 // A ground pass aimed at an AI team-mate: the receiver moves toward the rolling ball.
 const carrier=s.players[s.controlled],mate=s.players.find(p=>p.team===0&&p.role==='wing'),aim={x:mate.x-carrier.x,z:mate.z-carrier.z},l=Math.hypot(aim.x,aim.z);
 game.update(config.match.fixedStep,{moveX:aim.x/l,moveZ:aim.z/l,passPressed:true});game.update(config.match.fixedStep,{});
 const pass=game.drainEvents().find(e=>e.type==='pass');assert.ok(pass&&pass.target!=null,'the short pass selects a team-mate');
 const receiver=s.players[pass.target],start={x:receiver.x,z:receiver.z};
 for(let i=0;i<8&&s.ball.owner===null;i++)game.update(config.match.fixedStep,{});
 const toBallStart=Math.hypot(start.x-pass.x,start.z-pass.z),toBallNow=Math.hypot(receiver.x-pass.x,receiver.z-pass.z);
 assert.ok(toBallNow<=toBallStart+1e-6,'the receiver does not run away from the aimed point');
});

test('v3 movement: deterministic shape scenarios keep more options ahead, near support and box presence than the previous controller',()=>{
 const shape=shapeScenarios(config);
 assert.ok(shape.optionsAheadPerScenario>=.95,JSON.stringify(shape));
 assert.ok(shape.nearOptionsPerScenario>=.6,JSON.stringify(shape));
 assert.ok(shape.boxShareInFinalThird>=.85,JSON.stringify(shape));
 assert.equal(shape.carrierTooCloseTargets,0);
 assert.ok(shape.minTeammateTargetGapM>=source.minSeparationM,JSON.stringify(shape));
 assert.ok(shape.rivalGoalSidePerScenario>=2&&shape.rivalMarkersPerScenario>=1.5,JSON.stringify(shape));
});
