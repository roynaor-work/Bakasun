import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {restartActionProfile,restartBallPose,createKeeperThrowFlight} from '../workout/island/minigames/soccer-restarts.mjs';
import {stepLoftBall} from '../workout/island/minigames/soccer-loft.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2;
const close=(a,b,message,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${message}: ${a} vs ${b}`);
function fixture(kind,attackDir=1){
  const keeper=kind.startsWith('keeper'),game=createSoccer({config,role:keeper?'keeper':'field',seed:92}),state=game.getState();state.attackDir=attackDir;
  for(const p of state.players)Object.assign(p,{x:(p.team?1:-1)*hx*.45,z:(p.id%3-1)*hz*.55,vx:0,vz:0,recover:0,cooldown:100,think:100,hands:false,hold:0});
  if(keeper){
    const p=state.players[2];Object.assign(p,{x:-attackDir*(hx-2),z:0,fx:attackDir,fz:0,hands:true,cooldown:0});state.controlled=p.id;
    Object.assign(state.ball,{owner:p.id,x:p.x+p.fx*config.goalkeeping.holdForward,z:0,y:config.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:1,grace:100});
  }else{
    Object.assign(state.ball,{owner:null,x:kind==='throwIn'?0:(kind==='goalKick'?-attackDir:attackDir)*(hx+.3),z:kind==='throwIn'?hz+.3:hz-1,y:config.physics.ballRadius,vx:kind==='throwIn'?0:(kind==='goalKick'?-attackDir:attackDir)*20,vz:kind==='throwIn'?20:0,vy:0,lastTeam:1,grace:100,flight:null});
    game.update(dt);assert.equal(state.restart?.type,kind);assert.equal(state.restart.team,0);
    for(let i=0;i<1200&&state.phase!=='restartReady';i++)game.update(dt);
    assert.equal(state.phase,'restartReady');
  }
  game.drainEvents();return {game,state};
}
function accept(f,kind){
  const {game,state}=f,shot=kind==='corner'||kind==='keeperPunt',aim={x:kind==='corner'?-state.attackDir*.5:state.attackDir,z:kind==='corner'?-1:kind==='throwIn'?-.6:0,manual:true};
  for(let i=0;i<(shot?24:2);i++)game.update(dt,shot?{kickHeld:true,kickAim:aim}:{passHeld:true,passAim:aim});
  game.update(dt,shot?{kickAim:aim}:{passAim:aim});
  const taker=kind.startsWith('keeper')?state.players[2]:state.players[state.restart.player];assert.equal(taker.restartMotion.kind,kind);
  return {taker,start:taker.restartMotion.elapsed,aim};
}

for(const kind of ['throwIn','corner','goalKick','keeperThrow','keeperPunt'])for(const attackDir of [-1,1])test(`${kind}, direction ${attackDir}: actual simulation retains ownership until authored contact and releases once`,()=>{
  const f=fixture(kind,attackDir),{game,state}=f,{taker,start}=accept(f,kind),contact=restartActionProfile(kind).contact;
  const expected=Math.ceil((contact-start)/dt-1e-8);let ticks=0;
  while(state.ball.owner===taker.id&&ticks<expected+2){
    if(ticks<expected)assert.equal(state.ball.owner,taker.id);game.update(dt);ticks++;
    if(taker.restartMotion.elapsed+1e-8<contact)assert.equal(state.ball.owner,taker.id,'no early physical release');
  }
  assert.equal(ticks,expected);assert.equal(state.ball.owner,null);assert.equal(taker.restartMotion.released,true);
  const events=game.drainEvents().filter(e=>['throw','pass','loft','shot'].includes(e.type)&&e.player===taker.id);assert.equal(events.length,1);
  assert.equal(events[0].type,kind==='throwIn'?'throw':kind==='corner'?'loft':kind==='keeperPunt'?'shot':'pass');
  if(['throwIn','keeperThrow'].includes(kind)){
    assert.equal(state.ball.flight.kind,'physical-loft');
    const pose=restartBallPose(kind,contact);close(state.ball.flight.fromY,pose.height,'same authored hand-release height');
    assert.ok(Math.hypot(state.ball.flight.fromX-taker.x,state.ball.flight.fromZ-taker.z)<.7,'flight starts at the taker’s actual release reach');
  }
  const next=game.drainEvents();for(let i=0;i<5;i++)game.update(dt);next.push(...game.drainEvents());assert.equal(next.filter(e=>['throw','pass','loft','shot'].includes(e.type)&&e.player===taker.id).length,0,'follow-through cannot release twice');
});

test('throw preparation moves with the taker’s authored hands before the accepted release',()=>{
  const {game,state}=fixture('throwIn'),r=state.restart,p=state.players[r.player];
  assert.equal(p.restartMotion.kind,'throwIn');const start={x:state.ball.x,y:state.ball.y,z:state.ball.z};
  for(let i=0;i<45;i++)game.update(dt,{passHeld:true});
  assert.equal(state.ball.owner,p.id);assert.equal(state.phase,'restartReady');assert.equal(p.restartMotion.released,false);
  const pose=restartBallPose('throwIn',p.restartMotion.elapsed);close(state.ball.y,pose.height,'held height follows exact motion clock');
  close(state.ball.x,p.x+p.fx*pose.forward-p.fz*pose.side,'held x');close(state.ball.z,p.z+p.fz*pose.forward+p.fx*pose.side,'held z');
  assert.ok(state.ball.y>=start.y,'preparation never drops the overhead ball into a remote ground pose');
});

for(const kind of ['throwIn','keeperThrow'])test(`${kind}: natural hand-release arc first lands inside the pitch at its recorded target`,()=>{
  const f=fixture(kind),{game,state}=f,{taker}=accept(f,kind);
  for(let i=0;i<180&&state.ball.owner===taker.id;i++)game.update(dt);
  assert.ok(state.ball.flight);const target={x:state.ball.flight.x,z:state.ball.flight.z};
  for(const p of state.players)p.recover=100;state.ball.grace=100;
  for(let i=0;i<300&&state.ball.flight;i++){game.update(dt);assert.equal(state.phase,'playing','hand arc must not immediately go out');}
  assert.equal(state.ball.flight,null);close(state.ball.y,config.physics.ballRadius,'first landing');
  close(state.ball.x,target.x,'landing x',.01);close(state.ball.z,target.z,'landing z',.01);
  assert.ok(Math.abs(state.ball.x)<hx-config.physics.ballRadius&&Math.abs(state.ball.z)<hz-config.physics.ballRadius);
});

test('automatic keeper preparation starts early enough to preserve the existing maximum hold deadline',()=>{
  const {game,state}=fixture('keeperThrow'),p=state.players[2];let ticks=0;
  while(state.ball.owner===p.id&&ticks<Math.ceil(config.goalkeeping.maxHoldSeconds/dt)+1){game.update(dt);ticks++;}
  assert.equal(state.ball.owner,null);assert.ok(ticks*dt<=config.goalkeeping.maxHoldSeconds+dt+1e-8);
  assert.ok(game.drainEvents().some(e=>e.type==='distribution-windup'));assert.ok(p.restartMotion?.released);
});

test('short and long keeper throws preserve existing speed caps and land at the physical target under real gravity',()=>{
  for(const range of [2,4,8,15,25])for(const power of [0,.5,1]){
    const ball={x:-hx+2,z:0,y:1.50631745,vx:0,vz:0,vy:0,curve:0},launch=createKeeperThrowFlight(ball,{x:ball.x+range,z:0},config,power);
    const speed=Math.hypot(launch.vx,launch.vz);assert.ok(speed>=config.goalkeeping.throwMinSpeed&&speed<=config.goalkeeping.throwMaxSpeed+1e-8,`range ${range}, power ${power}: ${speed}`);
    Object.assign(ball,launch);const target={x:launch.flight.x,z:launch.flight.z};let peak=ball.y;
    for(let i=0;i<300&&ball.flight;i++){stepLoftBall(ball,dt,config);peak=Math.max(peak,ball.y);}
    assert.equal(ball.flight,null);close(ball.x,target.x,'hand throw landing x',.01);close(ball.z,target.z,'hand throw landing z',.01);assert.ok(peak<=5,'hand pass has a natural height, not a vertical launch');
  }
});
