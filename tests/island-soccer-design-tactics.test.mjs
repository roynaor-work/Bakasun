import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileSoccerTactics} from '../workout/island/minigames/soccer-design-tactics.mjs';

const source=JSON.parse(await readFile(new URL('../workout/island/design/tactics/soccer.json',import.meta.url),'utf8'));
const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const config={...base,pitch:{...base.pitch,length:48,width:30},squad:{formation:'4-3-3',extraPlayersPerTeam:2}};
const roles=['CF','RCM','GK','LW','LCB','RCB'];
const ids=[[0,1,2,6,8,10],[3,4,5,7,9,11]];
const runtime={CF:'striker',RCM:'support',GK:'keeper',LW:'wing',LCB:'support',RCB:'wing'};
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} ~= ${b}`);
function fixture(attackDir=1){
 const formation=source.formations.find(f=>f.id==='4-3-3'),initial=formation.phases.find(p=>p.id==='build_up'),players=[];
 for(const team of [0,1])for(let i=0;i<roles.length;i++){
  const tacticalRole=roles[i],point=initial.positions[tacticalRole],d=attackDir*(team===0?1:-1);
  players.push({id:ids[team][i],team,role:runtime[tacticalRole],tacticalRole,x:d*(point.y-.5)*config.pitch.length,z:(point.x-.5)*config.pitch.width,vx:0,vz:0,recover:0,slideTime:0});
 }
 players.sort((a,b)=>a.id-b.id);const owner=players.find(p=>p.id===0);owner.x=-4;owner.z=0;
 return {elapsed:0,phase:'playing',attackDir,controlled:0,players,ball:{owner:0,lastTeam:0,lastPlayer:0,x:owner.x,z:0,vx:0,vz:0},passTarget:null,restart:null};
}
const targetCopy=(controller,state)=>state.players.map(p=>{const target=controller.target(p,state);return {id:p.id,team:p.team,role:target.role,x:target.x,z:target.z,duty:target.duty,markId:target.markId};});
function legalAndSeparated(targets,c=config){
 for(const target of targets){assert.ok(Number.isFinite(target.x)&&Number.isFinite(target.z));assert.ok(Math.abs(target.x)<=c.pitch.length/2-c.rules.playerBoundary+1e-8);assert.ok(Math.abs(target.z)<=c.pitch.width/2-c.rules.playerBoundary+1e-8);}
 for(const team of [0,1]){const members=targets.filter(p=>p.team===team);for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++)assert.ok(Math.hypot(members[i].x-members[j].x,members[i].z-members[j].z)>=source.minSeparationM-1e-8,`target overlap ${members[i].id}/${members[j].id}`);}
}

test('actual 4-3-3 design data maps twelve stable players to six unique roles per side, keeping both keepers',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config),diagnostics=controller.diagnostics(state);
 for(const team of diagnostics.teams){assert.deepEqual(new Set(team.roles.map(item=>item.role)),new Set(roles));assert.equal(team.roles.length,6);}
 assert.equal(controller.roleFor(state.players[2],state),'GK');assert.equal(controller.roleFor(state.players[5],state),'GK');
 assert.equal(diagnostics.formation,'4-3-3');assert.equal(diagnostics.decisionHz,8);assert.equal(diagnostics.minSeparation,source.minSeparationM);
 legalAndSeparated(targetCopy(controller,state));
});

test('attack direction mirrors depth only; the selected wing keeps its design width side',()=>{
 const forward=fixture(1),reverse=structuredClone(forward);reverse.attackDir=-1;
 for(const p of reverse.players){p.x=-p.x;p.vx=-p.vx;}reverse.ball.x=-reverse.ball.x;
 const a=targetCopy(compileSoccerTactics(source,config),forward),b=targetCopy(compileSoccerTactics(source,config),reverse);
 for(let i=0;i<a.length;i++){near(a[i].x,-b[i].x);near(a[i].z,b[i].z);assert.equal(a[i].role,b[i].role);}
 assert.ok(a.find(p=>p.role==='LW'&&p.team===0).z<0);
});

test('possession phases follow actual midfield hysteresis and a timed loss transition',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config),length=config.pitch.length;
 state.ball.x=-.01*length;assert.equal(controller.phase(0,state),'build_up');
 state.elapsed+=.2;state.ball.x=.01*length;assert.equal(controller.phase(0,state),'build_up');
 state.elapsed+=.2;state.ball.x=.021*length;assert.equal(controller.phase(0,state),'attack');
 state.elapsed+=.2;state.ball.x=-.01*length;assert.equal(controller.phase(0,state),'attack');
 state.elapsed+=.2;state.ball.x=-.021*length;assert.equal(controller.phase(0,state),'build_up');
 state.elapsed+=.2;state.ball.owner=3;state.ball.lastTeam=1;assert.equal(controller.phase(0,state),'defensive_transition');
 state.elapsed+=1.9;assert.equal(controller.phase(0,state),'defense');
 state.elapsed+=.2;state.ball.owner=0;assert.equal(controller.phase(0,state),'build_up');
});

test('a valid own pass retains its attacking context and sole receiver; stale loose intent expires',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config);state.ball.x=8;controller.phase(0,state);
 state.elapsed=.1;state.ball.owner=null;state.ball.flight={duration:1.4,age:.1};state.passTarget={player:6,x:11,z:-6,time:2.5};
 assert.equal(controller.phase(0,state),'attack');assert.equal(controller.diagnostics(state).teams[0].presser,6);
 state.elapsed=.9;state.ball.flight.age=.9;assert.equal(controller.phase(0,state),'attack');
 state.elapsed=1.8;state.passTarget.time=0;assert.equal(controller.phase(0,state),'defense');
 assert.equal(controller.diagnostics(state).teams[0].roles.filter(p=>p.duty==='press').length,1);
});

test('a loose ball alone does not invent an opponent possession or a defensive transition',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config);controller.phase(0,state);
 state.elapsed=.1;state.ball.owner=null;assert.equal(controller.phase(0,state),'build_up');
 state.elapsed=.4;assert.equal(controller.phase(0,state),'defense');
 assert.notEqual(controller.phase(0,state),'defensive_transition');
});

test('attaching the controller mid-flight gives own loose-ball intent a finite lifetime',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config);state.ball.owner=null;state.ball.x=8;state.ball.flight={duration:1.4,age:.3};state.passTarget={player:6,x:11,z:-6,time:2.5};
 assert.equal(controller.phase(0,state),'attack');state.elapsed=2;assert.equal(controller.phase(0,state),'defense','a stale receiver hint cannot retain the attacking phase indefinitely');
});

test('one stable presser, unique markers and remaining zone cover prevent a defensive swarm',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config);state.ball.owner=3;state.ball.lastTeam=1;state.ball.x=2;state.ball.z=1;
 const initial=controller.diagnostics(state).teams[0],pressers=initial.roles.filter(p=>p.duty==='press'),markers=initial.roles.filter(p=>p.duty==='mark');
 assert.equal(pressers.length,1);assert.ok(markers.length>=1);assert.equal(new Set(markers.map(p=>p.markId)).size,markers.length);assert.ok(initial.roles.some(p=>p.role!=='GK'&&p.duty==='cover'));
 const held=initial.presser,candidate=state.players.find(p=>p.team===0&&p.role!=='keeper'&&p.id!==held&&p.id!==state.controlled);candidate.x=state.ball.x;candidate.z=state.ball.z+.1;
 state.elapsed=.2;assert.equal(controller.diagnostics(state).teams[0].presser,held,'an equally valid presser holds its responsibility for the design interval');
 for(const target of targetCopy(controller,state).filter(p=>p.team===0&&p.markId!=null)){const attacker=state.players.find(p=>p.id===target.markId);assert.ok(target.x*state.attackDir<=attacker.x*state.attackDir+1e-8);}
});

test('all open phases and corner/throw/goal-kick layouts produce legal separated targets in both directions',()=>{
 for(const attackDir of [-1,1])for(const ownerTeam of [0,1])for(const ballX of [-20,-5,5,20])for(const ballZ of [-12,0,12]){
  const state=fixture(attackDir),controller=compileSoccerTactics(source,config);state.ball.owner=ownerTeam===0?0:3;state.ball.lastTeam=ownerTeam;state.ball.x=ballX;state.ball.z=ballZ;
  legalAndSeparated(targetCopy(controller,state));
 }
 for(const attackDir of [-1,1])for(const type of ['throwIn','corner','goalKick'])for(const side of [-1,1]){
  const state=fixture(attackDir),controller=compileSoccerTactics(source,config),d=attackDir;
  state.phase='restartReady';state.restart={id:1,type,team:0,player:type==='goalKick'?2:6,x:type==='throwIn'?3:type==='corner'?d*(config.pitch.length/2-.2):-d*(config.pitch.length/2-config.pitch.goalAreaDepth),z:type==='goalKick'?0:side*(config.pitch.width/2-.2),elapsed:2};
  state.ball.owner=state.restart.player;state.ball.x=state.restart.x;state.ball.z=state.restart.z;
  assert.equal(controller.phase(0,state),{throwIn:'throw_in',corner:'corner',goalKick:'goal_kick'}[type]);
  const targets=targetCopy(controller,state);legalAndSeparated(targets);
  const taker=targets.find(p=>p.id===state.restart.player),boundary=config.rules.playerBoundary;near(taker.x,Math.max(-config.pitch.length/2+boundary,Math.min(config.pitch.length/2-boundary,state.restart.x)));near(taker.z,Math.max(-config.pitch.width/2+boundary,Math.min(config.pitch.width/2-boundary,state.restart.z)));assert.equal(taker.duty,'restart-taker');
  if(type!=='goalKick')for(const opponent of targets.filter(p=>p.team===1&&p.role!=='GK'))assert.ok(Math.hypot(opponent.x-state.restart.x,opponent.z-state.restart.z)>=(type==='throwIn'?2:9.15)-1e-8);
 }
});

test('actual source anchors and ball-movement gains change runtime targets; compiled inputs stay detached',()=>{
 const state=fixture();state.ball.x=8;const changed=structuredClone(source),phase=changed.formations.find(f=>f.id==='4-3-3').phases.find(p=>p.id==='attack');phase.positions.LW.x+=.06;
 const first=compileSoccerTactics(source,config),second=compileSoccerTactics(changed,config),wing=state.players.find(p=>p.team===0&&p.tacticalRole==='LW');
 const a={...first.target(wing,state)},b={...second.target(wing,state)};assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>.1);
 phase.positions.LW.x+=.06;state.elapsed+=.2;const stable=second.target(wing,state);near(stable.x,b.x);near(stable.z,b.z);
 const movement=structuredClone(source),group=movement.ballMovementProfiles.find(p=>p.phase==='attack').groups.find(g=>g.roles.includes('LW'));group.lateralGain.example=0;group.maxLateralOffset.example=0;
 const wideState=fixture();wideState.ball.x=8;wideState.ball.z=4;
 const moving=compileSoccerTactics(source,config).target(wing,wideState),stationary=compileSoccerTactics(movement,config).target(wing,wideState);assert.ok(Math.abs(moving.z-stationary.z)>.1);
});

test('tactical decisions read observed positions only and retain manual bodies without mutating state',()=>{
 const state=fixture(),saved=structuredClone(state),controller=compileSoccerTactics(source,config);
 for(const key of ['aim','passAim','kickAim','input','actionAim'])Object.defineProperty(state,key,{get(){throw Error('Future human input read: '+key);}});
 const player=state.players.find(p=>p.id===state.controlled),target=controller.target(player,state);near(target.x,player.x);near(target.z,player.z);
 const originalParse=JSON.parse;JSON.parse=()=>{throw Error('JSON parsing during tactical decisions');};
 try{for(let i=0;i<200;i++)for(const p of state.players)controller.target(p,state);}finally{JSON.parse=originalParse;}
 assert.equal(controller.diagnostics(state).plans,2,'all same-tick player queries share one plan per team');
 for(const key of Object.keys(saved))assert.deepEqual(state[key],saved[key]);
});

test('explicit reduced-side role validation rejects duplicates and a seventh player instead of silently dropping one',()=>{
 const duplicate=fixture();duplicate.players.find(p=>p.id===1).tacticalRole='CF';assert.throws(()=>compileSoccerTactics(source,config).diagnostics(duplicate),/Duplicate/);
 const tooMany=fixture();tooMany.players.push({...tooMany.players[0],id:12,tacticalRole:undefined});assert.throws(()=>compileSoccerTactics(source,config).diagnostics(tooMany),/at most six/);
 const broken=structuredClone(source);broken.formations.find(f=>f.id==='4-3-3').phases[0].positions.CF.x=NaN;assert.throws(()=>compileSoccerTactics(broken,config),/Invalid soccer anchor/);
});

test('the explicit four-player option and the other authored formations retain unique available roles',()=>{
 for(const formation of ['4-3-3','4-4-2','3-5-2']){
  const state=fixture();state.players=state.players.filter(p=>!['LCB','RCB'].includes(p.tacticalRole));
  const controller=compileSoccerTactics(source,{...config,squad:{formation,extraPlayersPerTeam:0}}),diagnostics=controller.diagnostics(state);
  for(const team of diagnostics.teams){assert.equal(team.roles.length,4);assert.equal(new Set(team.roles.map(p=>p.role)).size,4);assert.ok(team.roles.some(p=>p.role==='GK'));}
  legalAndSeparated(targetCopy(controller,state));
 }
});

test('restart time is monotonic across resumption and does not extend an expired defensive transition',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config);controller.phase(0,state);state.ball.owner=3;state.elapsed=.1;assert.equal(controller.phase(0,state),'defensive_transition');
 state.phase='restartReady';state.restart={type:'throwIn',team:1,player:7,x:0,z:14.6,elapsed:2};controller.phase(0,state);
 state.phase='playing';state.restart=null;state.elapsed=.2;assert.equal(controller.phase(0,state),'defense');
});

test('the single AI presser reaches balls at the legal pitch lines instead of stopping at tactical anchor insets',()=>{
 for(const sideX of [-1,1])for(const sideZ of [-1,1]){
  const state=fixture(),controller=compileSoccerTactics(source,config),p=state.players.find(p=>p.id===1),boundary=config.rules.playerBoundary;
  state.ball.owner=3;state.ball.lastTeam=1;state.ball.x=sideX*(config.pitch.length/2-.1);state.ball.z=sideZ*(config.pitch.width/2-.1);state.ball.vx=sideX*5;state.ball.vz=sideZ*5;
  p.x=sideX*(config.pitch.length/2-.7);p.z=sideZ*(config.pitch.width/2-.7);
  const target=controller.target(p,state);assert.equal(target.duty,'press');near(target.x,sideX*(config.pitch.length/2-boundary));near(target.z,sideZ*(config.pitch.width/2-boundary));
  assert.ok(Math.hypot(target.x-state.ball.x,target.z-state.ball.z)<config.physics.pickupRadius);
 }
});

test('each player owns a stable target and querying other actors cannot overwrite it',()=>{
 const state=fixture(),controller=compileSoccerTactics(source,config),saved=structuredClone(state);
 const targets=new Map(state.players.map(player=>[player.id,controller.target(player,state)])),snapshot=targetCopy(controller,state);
 assert.equal(new Set(targets.values()).size,state.players.length,'scratch candidates must never escape as shared player targets');
 for(let repeat=0;repeat<20;repeat++)for(const player of [...state.players].reverse())assert.equal(controller.target(player,state),targets.get(player.id));
 assert.deepEqual(targetCopy(controller,state),snapshot);assert.deepEqual(state,saved);
 assert.equal(controller.diagnostics(state).plans,2);
});

test('committed plans hold repeated observations, then refresh opponent positions and velocity at the next decision',()=>{
 for(const attackDir of [-1,1]){
  const state=fixture(attackDir),controller=compileSoccerTactics(source,config),before=targetCopy(controller,state),plans=controller.diagnostics(state).plans;
  const supports=before.filter(target=>target.team===0&&target.id!==state.controlled&&target.role!=='GK');
  for(const [index,rival]of state.players.filter(player=>player.team===1).entries()){
   const target=supports[index%supports.length];rival.x=target.x+.3;rival.z=target.z-.4;rival.vx=(index%2?1:-1)*5;rival.vz=(index%2?-1:1)*3;
  }
  state.elapsed=.1;
  assert.deepEqual(targetCopy(controller,state),before,'positions and velocities do not bypass the design decision interval');
  assert.equal(controller.diagnostics(state).plans,plans);
  state.elapsed=.126;
  const refreshed=targetCopy(controller,state).filter(target=>target.team===0),fresh=targetCopy(compileSoccerTactics(source,config),state).filter(target=>target.team===0);
  assert.deepEqual(refreshed,fresh,'the next plan must read current rivals, including their observed motion');
  assert.ok(refreshed.some(target=>Math.hypot(target.x-before[target.id].x,target.z-before[target.id].z)>.01),'refreshed opposition must affect at least one support target');
 }
});
