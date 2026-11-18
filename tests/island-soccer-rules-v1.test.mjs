import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {resolveSoccerRules,slideFoul,foulRestart,penaltySpot,throughBallPoint,throughBallSpeed,throughMeetPoint,aiSlideAim} from '../workout/island/minigames/soccer-rules.mjs';
import {restartClipKind,restartActionProfile,sampleRestartAction,createRestartLayout} from '../workout/island/minigames/soccer-restarts.mjs';
import {soccerDesignControlState} from '../workout/island/minigames/soccer-design-controls.mjs';
import {createHumanBot} from '../workout/island/tools/soccer-gameplay-metrics.mjs';
// Sports-deep-fable M3 (11/11/2026): fouls on slide tackles, free kicks, penalties and the through ball, behind `?soccerRules=v1`.
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const dt=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Every player parked far away; the child's striker (id 0) carries the ball at (cx,cz) facing +x, a rival
 * field player slides at him from `from`. frontChance 1 makes every lost duel that reaches the carrier a foul. */
function tackle({cx=0,cz=0,from=null,slideX=1,slideZ=0,win=false,rulesVersion,ticks=30}={}){
  const cfg=JSON.parse(JSON.stringify(config));cfg.rules.foul.frontChance=1;
  const game=createSoccer({config:cfg,seed:11,role:'field',random:()=>win?0:.99,...(rulesVersion?{rulesVersion}:{})}),s=game.getState();
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.6,z:(p.id%3-1)*hz*.6,vx:0,vz:0,recover:0,cooldown:100,think:100,hands:false,hold:0,slideTime:0,slideCooldown:5});
  const carrier=s.players[0],tackler=s.players.find(p=>p.team===1&&p.role!=='keeper');
  Object.assign(carrier,{x:cx,z:cz,fx:1,fz:0,cooldown:0});s.controlled=0;
  Object.assign(s.ball,{owner:0,x:cx+config.physics.dribbleOffset,z:cz,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:0,lastTeam:0,lastPlayer:0,flight:null});
  // From behind and a little to the side: a slide straight through the carrier's body is stopped by player separation.
  const start=from||{x:cx-1.2,z:cz+.7};
  Object.assign(tackler,{x:start.x,z:start.z,fx:slideX,fz:slideZ,slideKind:'straight',slideTime:cfg.slide.variants.straight.seconds,slideX,slideZ,slideAttempted:false,slideWon:false,slideBehind:false,slideLate:false});
  game.drainEvents();const events=[];
  for(let i=0;i<ticks;i++){game.update(dt);events.push(...game.drainEvents());}
  return {game,s,cfg,carrier,tackler,events};
}
const settle=(game,s,limit=1200)=>{for(let i=0;i<limit&&s.phase!=='restartReady';i++)game.update(dt);return s.phase;};

test('flag: rules v1 by default, ?soccerRules=0 restores the old match, an explicit option wins',()=>{
  const saved=globalThis.location;
  try{
    delete globalThis.location;assert.equal(resolveSoccerRules(),'v1');assert.equal(resolveSoccerRules('off'),'off');assert.equal(resolveSoccerRules('0'),'off');assert.equal(resolveSoccerRules('nonsense'),'v1');
    globalThis.location={search:'?soccerRules=0'};assert.equal(resolveSoccerRules(),'off');assert.equal(resolveSoccerRules('v1'),'v1');
    globalThis.location={search:'?soccerRules=v1'};assert.equal(resolveSoccerRules(),'v1');
  }finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved;}
  assert.equal(createSoccer({config,seed:1}).getState().rules,'v1');assert.equal(createSoccer({config,seed:1,rulesVersion:'off'}).getState().rules,'off');
});

test('slideFoul: a won ball, a keeper holding it or a foot that stopped short is play on; late or from behind is always a foul, a fair front challenge only by frontChance',()=>{
  const tackler={team:1},owner={x:0,z:0,team:0,hands:false},near={x:.8,z:0,late:false,behind:false};
  assert.equal(slideFoul(near,true,tackler,owner,config),null,'won the ball');
  assert.equal(slideFoul(near,false,tackler,{...owner,hands:true},config),null,'keeper with the ball in hand');
  assert.equal(slideFoul({...near,x:2.5},false,tackler,owner,config),null,'foot stopped 2.5 m away');
  assert.equal(slideFoul(near,false,tackler,{...owner,team:1},config),null,'same team');
  assert.deepEqual(slideFoul({...near,late:true},false,tackler,owner,config,.99),{late:true,behind:false});
  assert.deepEqual(slideFoul({...near,behind:true},false,tackler,owner,config,.99),{late:false,behind:true});
  assert.deepEqual(slideFoul(near,false,tackler,owner,config,config.rules.foul.frontChance-.01),{late:false,behind:false},'fair front challenge, roll under frontChance');
  assert.equal(slideFoul(near,false,tackler,owner,config,config.rules.foul.frontChance+.01),null,'fair front challenge, roll over frontChance');
});

test('foulRestart: inside the tackler’s own area it is a penalty on the spot, anywhere else a free kick where the ball was',()=>{
  const state={attackDir:1},rival={team:1};
  const fk=foulRestart(rival,{x:3,z:-4},state,config);assert.deepEqual(fk,{type:'freeKick',team:0,x:3,z:-4});
  const pen=foulRestart(rival,{x:hx-2,z:1},state,config);assert.equal(pen.type,'penalty');assert.equal(pen.team,0);assert.deepEqual({x:pen.x,z:pen.z},penaltySpot(0,state,config));
  assert.ok(Math.abs(pen.x-(hx-config.pitch.penaltySpot))<1e-9&&pen.z===0);
  // The child's own area (team 0 defends -x): a child's foul there is a rival penalty at the other end.
  const mine=foulRestart({team:0},{x:-hx+2,z:0},state,config);assert.equal(mine.type,'penalty');assert.equal(mine.team,1);assert.ok(mine.x<0);
  // A free kick spot stays a step inside the lines.
  const edge=foulRestart(rival,{x:hx-.2,z:hz-.1},state,config);assert.equal(edge.type,'freeKick');assert.ok(Math.abs(edge.x)<=hx-1&&Math.abs(edge.z)<=hz-1);
});

test('engine: a rival slide from behind that loses the ball but reaches the carrier stops play with a free kick for the child',()=>{
  const {s,events,carrier,tackler}=tackle();
  const contact=events.find(e=>e.type==='slide-contact'),foul=events.find(e=>e.type==='foul'),restart=events.find(e=>e.type==='restart');
  assert.ok(contact&&!contact.won,'the duel was lost');
  assert.ok(foul,'foul called');assert.equal(foul.player,tackler.id);assert.equal(foul.victim,carrier.id);assert.equal(foul.kind,'slide');assert.equal(foul.team,1);assert.equal(foul.penalty,false);
  assert.ok(typeof foul.late==='boolean'&&typeof foul.behind==='boolean'&&Number.isFinite(foul.x)&&Number.isFinite(foul.z));
  assert.ok(restart&&restart.restart==='freeKick'&&restart.team===0,JSON.stringify(restart));
  assert.equal(s.restart.type,'freeKick');assert.equal(s.restart.team,0);assert.ok(s.phase.startsWith('restart'));
  assert.ok(Math.abs(s.ball.x-foul.x)<1.01&&Math.abs(s.ball.z-foul.z)<1.01,'the ball is placed where the foul was');
  assert.equal(tackler.slideTime,0);assert.ok(tackler.recover>0,'the tackler gets up during the stoppage');
});

test('engine: a clean slide that wins the ball is play on, and with the flag off the same lost duel is never a foul',()=>{
  const clean=tackle({win:true});
  assert.ok(clean.events.some(e=>e.type==='slide-contact'&&e.won));assert.ok(!clean.events.some(e=>e.type==='foul'));assert.equal(clean.s.phase,'playing');
  assert.equal(clean.s.ball.owner,clean.tackler.id,'possession changed');
  const off=tackle({rulesVersion:'off'});
  assert.ok(off.events.some(e=>e.type==='slide-contact'&&!e.won),'same lost duel');assert.ok(!off.events.some(e=>e.type==='foul'||e.type==='restart'));assert.equal(off.s.phase,'playing');
  assert.equal(off.s.ball.owner,0,'the carrier keeps the ball');
});

test('free kick layout: opponents at least 9 m from the ball, the taker faces goal, and the normal pass or kick button plays the kick',()=>{
  for(const button of ['pass','shot']){
    const {game,s,cfg}=tackle({cx:4,cz:-3});
    assert.equal(settle(game,s),'restartReady');
    const r=s.restart,taker=s.players[r.player];assert.equal(taker.team,0);
    for(const p of s.players)if(p.team===1&&p.role!=='keeper')assert.ok(distance(p,s.ball)>=cfg.rules.freeKickSpace-.05,`rival ${p.id} at ${distance(p,s.ball).toFixed(2)} m`);
    assert.ok(cfg.rules.freeKickSpace>=9.15);
    const toGoal={x:hx-r.x,z:-r.z},len=Math.hypot(toGoal.x,toGoal.z);
    assert.ok((taker.fx*toGoal.x+taker.fz*toGoal.z)/len>.98,'the taker faces the goal');
    assert.equal(s.ball.owner,taker.id);assert.ok(Math.abs(s.ball.x-r.x)<1e-6&&Math.abs(s.ball.z-r.z)<1e-6);
    game.drainEvents();
    const held=button==='shot'?{kickHeld:true}:{passHeld:true};
    for(let i=0;i<12;i++)game.update(dt,held);game.update(dt,{});
    let released=null;for(let i=0;i<120&&!released;i++){game.update(dt);released=game.drainEvents().find(e=>(e.type==='pass'||e.type==='shot'||e.type==='loft')&&e.player===taker.id)||null;}
    assert.ok(released,'the taker released the ball');assert.equal(released.type,button==='shot'?'shot':'pass');
    assert.equal(s.phase,'playing');assert.ok(s.ball.vx>0,'the ball goes toward the attacked goal');
  }
});

test('penalty: foul inside the rival area puts the ball on the spot, the keeper on his line, everybody else outside the box; the shot control takes it',()=>{
  const {game,s,cfg,events}=tackle({cx:hx-2.2,cz:.4});
  const foul=events.find(e=>e.type==='foul');assert.ok(foul?.penalty,'penalty called');
  assert.equal(s.restart.type,'penalty');assert.equal(s.restart.team,0);
  assert.ok(Math.abs(s.ball.x-(hx-cfg.pitch.penaltySpot))<1e-6&&Math.abs(s.ball.z)<1e-6,'ball on the spot');
  assert.equal(settle(game,s),'restartReady');
  const r=s.restart,taker=s.players[r.player],keeper=s.players.find(p=>p.team===1&&p.role==='keeper'),line=hx-cfg.pitch.penaltyDepth;
  assert.ok(distance(keeper,{x:hx-cfg.ai.keeperInset,z:0})<.9&&Math.abs(keeper.z)<cfg.pitch.goalWidth/2,`keeper on his line (${keeper.x.toFixed(2)},${keeper.z.toFixed(2)})`);
  for(const p of s.players){if(p.id===taker.id||p.role==='keeper')continue;assert.ok(p.x<=line-.2+1e-6||Math.abs(p.z)>=cfg.pitch.penaltyWidth/2+.3-1e-6,`player ${p.id} outside the box (${p.x.toFixed(2)},${p.z.toFixed(2)})`);}
  assert.ok(taker.fx>.98,'the taker faces the goal');
  game.drainEvents();for(let i=0;i<20;i++)game.update(dt,{kickHeld:true});game.update(dt,{});
  let shot=null;for(let i=0;i<120&&!shot;i++){game.update(dt);shot=game.drainEvents().find(e=>e.type==='shot'&&e.player===taker.id)||null;}
  assert.ok(shot,'a real shot from the spot');assert.equal(s.phase,'playing');assert.ok(s.ball.vx>8,'the ball flies at goal');
});

test('penalty by the child: a slide at the rival carrier in the child’s own area gives the rival a penalty, and the AI taker shoots',()=>{
  const cfg=JSON.parse(JSON.stringify(config));cfg.rules.foul.frontChance=1;
  const game=createSoccer({config:cfg,seed:5,role:'field',random:()=>.99}),s=game.getState();
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.6,z:(p.id%3-1)*hz*.6,vx:0,vz:0,recover:0,cooldown:100,think:100,hands:false,hold:0,slideTime:0,slideCooldown:5});
  const owner=s.players.find(p=>p.team===1&&p.role!=='keeper'),me=s.players[0];
  Object.assign(owner,{x:-hx+2.5,z:0,fx:-1,fz:0});Object.assign(s.ball,{owner:owner.id,x:owner.x-config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:0,lastTeam:1,lastPlayer:owner.id,flight:null});
  Object.assign(me,{x:owner.x+1.2,z:.7,fx:-1,fz:0,slideKind:'straight',slideTime:cfg.slide.variants.straight.seconds,slideX:-1,slideZ:0,slideAttempted:false,slideWon:false});s.controlled=0;
  game.drainEvents();const events=[];for(let i=0;i<30;i++){game.update(dt);events.push(...game.drainEvents());}
  const foul=events.find(e=>e.type==='foul');assert.ok(foul,'foul by the child');assert.equal(foul.team,0);assert.equal(foul.penalty,true);
  assert.equal(s.restart.type,'penalty');assert.equal(s.restart.team,1);assert.ok(Math.abs(s.ball.x-(-hx+cfg.pitch.penaltySpot))<1e-6);
  assert.equal(settle(game,s),'restartReady');
  const taker=s.players[s.restart.player];assert.equal(taker.team,1);
  let shot=null;for(let i=0;i<240&&!shot;i++){game.update(dt);shot=game.drainEvents().find(e=>e.type==='shot'&&e.player===taker.id)||null;}
  assert.ok(shot,'the AI shoots the penalty by itself');assert.ok(s.ball.vx<0,'toward the child’s goal');
});

test('restart motion: a free kick and a penalty reuse the goal-kick clip and release clock',()=>{
  assert.equal(restartClipKind('freeKick'),'goalKick');assert.equal(restartClipKind('penalty'),'goalKick');assert.equal(restartClipKind('corner'),'corner');
  assert.equal(restartActionProfile('freeKick').contact,restartActionProfile('goalKick').contact);
  const m=sampleRestartAction('penalty',.3);assert.equal(m.kind,'goalKick');assert.equal(m.released,false);
  assert.throws(()=>restartActionProfile('nonsense'));
  assert.equal(soccerDesignControlState({restart:{team:0,type:'freeKick'},phase:'restart'}),'free_kick');
  assert.equal(soccerDesignControlState({restart:{team:0,type:'penalty'},phase:'restartReady'}),'free_kick');
});

test('restart layout: penalty puts both teams on the edge of the box, free kick pushes the markers 9.15 m out',()=>{
  const game=createSoccer({config,seed:3}),s=game.getState();
  const pen={type:'penalty',team:0,player:0,x:hx-config.pitch.penaltySpot,z:0},targets=createRestartLayout(pen,s,config),line=hx-config.pitch.penaltyDepth;
  for(const p of s.players){if(p.id===0)continue;const t=targets[p.id];assert.ok(t,`target for ${p.id}`);if(p.role==='keeper')continue;assert.ok(t.x<=line-.5,`${p.id} waits outside the box (${t.x.toFixed(2)})`);}
  const fk={type:'freeKick',team:0,player:0,x:6,z:2},T=createRestartLayout(fk,s,config);
  // A marker clamped at the touchline may sit closer; the engine's restartClearance walks him to the legal arc before play.
  for(const p of s.players)if(p.team===1&&p.role!=='keeper'){const t=T[p.id];assert.ok(distance(t,fk)>=config.rules.freeKickSpace-1e-6||Math.abs(t.z)>=hz-.6||Math.abs(t.x)>=hx-.6,`marker ${p.id} at ${distance(t,fk).toFixed(2)} m`);}
  for(const p of s.players)if(p.team===0&&p.id!==0&&p.role!=='keeper')assert.ok(/^free-kick-/.test(T[p.id].duty));
});

test('through ball: aimed throughLeadSeconds ahead of a runner with a free lane, otherwise a normal pass',()=>{
  const ball={x:0,z:0},players=[{id:1,team:0,x:6,z:1,vx:4.5,vz:0,role:'striker'},{id:7,team:1,x:20,z:-8,vx:0,vz:0,role:'wing'}],mate=players[0],lead=config.passing.throughLeadSeconds;
  assert.equal(lead,.75);
  const point=throughBallPoint(ball,mate,players,config,1);assert.ok(point);assert.ok(Math.abs(point.x-(6+4.5*lead))<1e-9&&Math.abs(point.z-1)<1e-9);
  assert.equal(throughBallPoint(ball,{...mate,vx:1.5},players,config,1),null,'too slow');
  assert.equal(throughBallPoint(ball,{...mate,vx:-4.5},players,config,1),null,'running the wrong way');
  assert.equal(throughBallPoint(ball,mate,[...players,{id:8,team:1,x:8,z:1,vx:0,vz:0,role:'back'}],config,1),null,'a defender on the runner’s path');
  assert.equal(throughBallPoint(ball,mate,[...players,{id:8,team:1,x:3,z:.5,vx:0,vz:0,role:'back'}],config,1),null,'a defender in the ball’s lane');
  assert.ok(throughBallPoint(ball,mate,[...players,{id:8,team:1,x:8,z:1,vx:0,vz:0,role:'back',recover:1}],config,1),'a defender on the ground does not count');
  assert.equal(throughBallPoint(ball,{...mate,x:1.5,z:0},players,config,1),null,'a runner brushing past the carrier is a plain pass');
  assert.equal(throughBallPoint(ball,{...mate,x:hx-2,vx:5},players,config,1),null,'never into the keeper’s hands or off the pitch');
  assert.equal(throughBallPoint(ball,{...mate,role:'keeper'},players,config,1),null);
  // Weight: at the lead point the ball still rolls at throughArrivalRatio times the runner's pace.
  const f=config.ball.grassFriction,range=distance(ball,point),v0=throughBallSpeed(range,mate,config),run=Math.max(4.5,.75*config.players.speed)*config.passing.throughArrivalRatio;
  assert.ok(Math.abs(v0-(range*f+run))<1e-9);
  const t=Math.log(v0/run)/f;assert.ok(Math.abs(v0*(1-Math.exp(-f*t))/f-range)<1e-6,'the ball reaches the point exactly when it has slowed to the arrival speed');
  // The runner meets the rolling ball on its path, never back at a point the ball has passed.
  const meet=throughMeetPoint({x:5,z:0},{x:6,z:0,vx:7,vz:0},config,5.3);assert.ok(meet.x>6&&meet.time>0);
});

test('through ball in the match: the child’s quick pass to a team-mate running at goal is a through pass, the receiver collects it; flag off keeps the ordinary lead',()=>{
  const run=rulesVersion=>{
    const game=createSoccer({config,seed:21,role:'field',...(rulesVersion?{rulesVersion}:{})}),s=game.getState();
    for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.7,z:(p.id%3-1)*hz*.7,vx:0,vz:0,recover:0,cooldown:100,think:100,hands:false,hold:0});
    const me=s.players[0],mate=s.players.find(p=>p.team===0&&p.id!==0&&p.role!=='keeper');
    Object.assign(me,{x:-6,z:0,fx:1,fz:0,cooldown:0});Object.assign(mate,{x:1,z:1.5,vx:4.8,vz:0,fx:1,fz:0,cooldown:0});
    Object.assign(s.ball,{owner:0,x:me.x+config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:0,lastTeam:0,lastPlayer:0,flight:null});s.controlled=0;
    game.drainEvents();game.update(dt,{moveX:1,moveZ:.2,passPressed:true});game.update(dt,{moveX:1,moveZ:.2});
    const pass=game.drainEvents().find(e=>e.type==='pass');assert.ok(pass,'a pass was played');
    let received=null;for(let i=0;i<300&&!received;i++){game.update(dt,{moveX:1,moveZ:.2});received=game.drainEvents().find(e=>e.type==='possession')||null;}
    return {pass,received,mate,s};
  };
  const on=run(),off=run('off');
  assert.equal(on.pass.kind,'through');assert.equal(on.pass.target,on.mate.id);
  assert.ok(on.pass.x>1+4.8*config.passing.throughLeadSeconds-.6,`aimed ${on.pass.x.toFixed(2)} m, a run ahead of the receiver`);
  assert.ok(on.received&&on.received.player===on.mate.id,'the runner collects the through ball');
  assert.equal(off.pass.kind,'ground');assert.ok(off.pass.x<on.pass.x-1.5,'the ordinary pass leads far less');
});

test('rival slide: a chasing defender may slide at a running carrier from stage 2, never at a standing one, at kickoff or at a keeper',()=>{
  const owner={x:0,z:0,vx:4,vz:0,fx:1,fz:0,team:0,hands:false,hold:1},ball={x:.49,z:0},p={x:-1.2,z:0,vx:4,vz:0,fx:1,fz:0,team:1,role:'back',slideCooldown:0,recover:0,slideTime:0,cooldown:0};
  const aim=aiSlideAim(p,owner,ball,config,5);assert.ok(aim&&aim.x>.99,'slides toward the ball');
  assert.equal(aiSlideAim(p,owner,ball,config,1),null,'tutorial stage');
  assert.equal(aiSlideAim(p,{...owner,vx:0},ball,config,5),null,'standing carrier');
  assert.equal(aiSlideAim(p,{...owner,hold:.1},ball,config,5),null,'first moments of the possession');
  assert.equal(aiSlideAim(p,{...owner,hands:true},ball,config,5),null,'keeper holding the ball');
  assert.equal(aiSlideAim({...p,x:-4},owner,ball,config,5),null,'too far');
  assert.equal(aiSlideAim({...p,vx:0},owner,ball,config,5),null,'a standing defender steals instead');
  assert.equal(aiSlideAim({...p,slideCooldown:1},owner,ball,config,5),null,'cooling down');
  assert.equal(aiSlideAim({...p,fx:-1},owner,ball,config,5),null,'ball behind him');
  // Against the headless child bot the rival slides a few times a match; with the flag off it never does.
  const count=rulesVersion=>{let n=0;for(const seed of [9,10,11]){const g=createSoccer({config,seed,stage:5,...(rulesVersion?{rulesVersion}:{})}),s=g.getState(),bot=createHumanBot(seed,{profile:'typical'});for(let i=0;i<60*400&&!g.result;i++){g.update(dt,bot(g,dt,config));for(const e of g.drainEvents())if(e.type==='slide'&&s.players[e.player].team===1)n++;}}return n;};
  assert.ok(count()>0,'rival slides with rules v1');assert.equal(count('off'),0);
});

test('a full seeded match with rules v1 ends normally, every restart type in play resumes, no phase is left hanging',()=>{
  for(const seed of [1,2,3]){
    const g=createSoccer({config,seed,stage:5}),s=g.getState();const types=new Set();let hanging=0,last=null,since=0;
    for(let i=0;i<60*400&&!g.result;i++){
      g.update(dt,{moveX:Math.sin(i/90),moveZ:Math.cos(i/70),kickHeld:i%97<6,passPressed:i%53===0,sprintHeld:true});
      for(const e of g.drainEvents())if(e.type==='restart')types.add(e.restart);
      if(s.phase===last)since+=dt;else{since=0;last=s.phase;}
      if(s.phase!=='playing'&&since>12)hanging++;
    }
    assert.ok(g.result,`seed ${seed} finished`);assert.equal(hanging,0,`seed ${seed}: a stoppage lasted over 12 s`);
  }
});
