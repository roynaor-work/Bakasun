import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {pitchCrossing,goalFrameContact} from '../workout/island/minigames/soccer-boundary.mjs';
import {inPenaltyArea,keeperSaveChance,rollBall} from '../workout/island/minigames/soccer-physics.mjs';
import {rosterCards,cleanFirstName,awardSoccerPractice} from '../workout/island/activity/soccer-roster.mjs';
import {createSoccerDrill} from '../workout/island/minigames/soccer-drill.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {migrations,migrateSave,validateSave,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {bot} from '../workout/island/tests/g3c-bot.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer;
const dt=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2,r=config.physics.ballRadius;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async u=>({ok:true,json:async()=>JSON.parse(await readFile(u,'utf8'))}));
function city(){return createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1_000_000});}
function advance(g,seconds,input={}){for(let i=0;i<Math.ceil(seconds/dt);i++)g.update(dt,input);}
function setup(ball={}){
  const game=createSoccer({config,seed:42,stage:3}),s=game.getState();
  for(const p of s.players)Object.assign(p,{x:p.team?8:-8,z:p.id%2?7:-7,vx:0,vz:0,recover:100,think:100});
  Object.assign(s.ball,{owner:null,x:0,y:r,z:0,vx:0,vy:0,vz:0,grace:100,lastTeam:0,flight:null,...ball});
  return game;
}
test('G3f only a whole ball crosses the line, with height interpolated at the crossing',()=>{
  const from={x:hx-.1,y:2.5,z:0};
  assert.equal(pitchCrossing(from,{x:hx+.1,y:1,z:0},config),null);
  const cross=pitchCrossing(from,{x:hx+.3,y:1,z:.4},config);
  assert.equal(cross.axis,'x');near(cross.time,.8);near(cross.y,1.3);near(cross.z,.32);
});
test('G3f a diagonal ball leaving the touchline first cannot become a goal kick',()=>{
  const cross=pitchCrossing({x:hx-.2,y:r,z:hz+.2},{x:hx+1,y:r,z:hz+1},config);
  assert.equal(cross.axis,'z');near(cross.z,hz+r);assert.ok(cross.x<hx);
});
for(const side of [-1,1])for(const frame of ['post','crossbar'])test(`G3f swept ${frame} at goal ${side} catches a ball that passes through between ticks`,()=>{
  const y=frame==='post'?1:config.pitch.goalHeight,z=frame==='post'?config.pitch.goalWidth/2:0;
  const contact=goalFrameContact({x:side*(hx-1),y,z},{x:side*(hx+1),y,z},config);
  assert.equal(contact.kind,frame);assert.ok(contact.time>0&&contact.time<.5);near(contact.normal.x,-side);
  const g=setup({x:side*(hx-.5),y,z,vx:side*80});g.update(dt);
  const s=g.getState();assert.deepEqual(s.score,[0,0]);assert.equal(s.phase,'playing');assert.equal(s.event.type,'post');assert.ok(s.ball.vx*side<0);assert.equal(s.ball.owner,null);
});
test('G3f a ball moving away from an overlapping post is not bounced back into it',()=>{
  const z=config.pitch.goalWidth/2;
  assert.equal(goalFrameContact({x:hx-.2,y:1,z},{x:hx-.4,y:1,z},config),null);
});
test('G3f a shot over the crossbar stays scoreless even if it descends below it before the tick ends',()=>{
  const g=setup({x:hx-.1,y:config.pitch.goalHeight+.5,z:0,vx:80,vy:-50});g.update(dt);
  assert.deepEqual(g.getState().score,[0,0]);
});
for(const side of [-1,1])for(const lastTeam of [0,1])test(`G3f touchline ${side}, last team ${lastTeam}: throw-in to the other team at the exit position`,()=>{
  const g=setup({x:3,z:side*(hz+.1),vx:12,vz:side*30,lastTeam});g.update(dt);
  const s=g.getState();assert.equal(s.phase,'restart');assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1-lastTeam);
  near(s.restart.x,3+(r-.1)/30*12);near(s.restart.z,side*(hz-config.rules.sideInset));
  assert.equal(s.ball.flight,null);assert.equal(s.passTarget,null);assert.ok(s.players[s.ball.owner].team===1-lastTeam);
  const time=s.elapsed;g.update(.25);near(s.elapsed,time);
});
for(const attackDir of [-1,1])for(const side of [-1,1])test(`G3f goal on side ${side} with attack direction ${attackDir} credits the correct team once`,()=>{
  const g=setup({x:side*(hx-.3),vx:side*40}),s=g.getState();s.attackDir=attackDir;
  g.update(dt);const team=side*attackDir>0?0:1;assert.equal(s.phase,'goal');assert.equal(s.score[team],1);
  const elapsed=s.elapsed;g.update(.25);assert.equal(s.score[team],1);near(s.elapsed,elapsed);
});
test('G3f an already out-of-play ball inside the goal cannot be credited as a new goal',()=>{
  const g=setup({x:hx+r+.01,vx:1});g.update(dt);assert.deepEqual(g.getState().score,[0,0]);assert.equal(g.getState().restart.type,'goalKick');
});
test('G3f a diagonal touchline exit retains its first exit position and restart type',()=>{
  const g=setup({x:hx-.2,z:hz+.2,vx:72,vz:48}),s=g.getState();g.update(dt);
  assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1);assert.ok(s.restart.x<=hx-config.rules.sideGoalInset);
});
test('G3f kickoff clears old slides, headers, recovery and actions tapped during a stoppage',()=>{
  const g=setup(),s=g.getState();s.phase='goal';s.phaseTime=dt;s.event={type:'goal',team:1};
  for(const p of s.players)Object.assign(p,{slideTime:.4,recover:.8,headerTime:.4,kickTime:.4,stealTime:.4,turnLean:.2});
  g.update(dt/2,{kickHeld:true,passHeld:true});g.update(dt/2,{});g.update(dt,{});
  assert.equal(s.phase,'playing');assert.equal(s.charging,false);assert.equal(s.ball.owner,s.controlled);
  for(const p of s.players)for(const key of ['slideTime','recover','headerTime','kickTime','stealTime'])assert.equal(p[key],0,key);
});
test('G3f frame collision and restart simulation agree at 30, 60 and 120 Hz',()=>{
  const snapshots=[30,60,120].map(hz=>{const g=setup({x:hx-2,y:1,z:config.pitch.goalWidth/2,vx:25});for(let i=0;i<hz;i++)g.update(1/hz);return g.snapshot();});
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});

test('G3f all eight cards have identity, shirt, role and individual skills; stage and difficulty change enemy cards',()=>{
 const cards=rosterCards(config,config.team,null,1,'easy');assert.equal(cards.length,8);for(const card of cards){assert.ok(card.nameId);assert.ok(card.number>=1);assert.ok(card.overall>=1);for(const key of ['pace','shot','pass','defense','reactions','catching'])assert.ok(card[key]>=config.card.min&&card[key]<=config.card.max);}
 assert.equal(cards.filter(c=>c.role==='keeper').length,2);const harder=rosterCards(config,config.team,null,5,'hard');for(const card of cards.filter(c=>c.team))assert.ok(harder[card.id].overall>card.overall);for(const p of createSoccer({config}).getState().players)assert.equal(p.card.id,p.id);
});
test('G3f seeded role profiles distinguish teammates, strikers, midfielders, defenders and keeper hands',()=>{
 const cards=rosterCards(config,config.team,null);
 for(const team of [0,1]){const side=cards.filter(c=>c.team===team),striker=side.find(c=>c.role==='striker'),support=side.find(c=>c.role==='support'),defender=side.find(c=>c.role==='wing'),keeper=side.find(c=>c.role==='keeper');
  assert.ok(striker.shot>Math.max(striker.pace,striker.pass,striker.defense));assert.ok(support.pass>Math.max(support.pace,support.shot,support.defense));assert.ok(defender.defense>=Math.max(defender.pace,defender.shot,defender.pass));assert.ok(Math.min(keeper.reactions,keeper.catching)>Math.max(keeper.pace,keeper.shot,keeper.pass,keeper.defense));
  assert.equal(new Set(side.map(c=>JSON.stringify([c.pace,c.shot,c.pass,c.defense,c.reactions,c.catching]))).size,4);
 }
 assert.notDeepEqual([cards[0].pace,cards[0].shot,cards[0].pass,cards[0].defense].map(n=>n-50),[cards[3].pace,cards[3].shot,cards[3].pass,cards[3].defense].map(n=>n-config.roster.opponentBase),'same role has individual seeded variation');
});
test('G3f profiles preserve the exact previous means and integer bounds even at skill limits',()=>{
 for(const level of [1,2,50,98,99]){const team={players:config.team.players.map(p=>({...p,card:{attributes:Object.fromEntries(['pace','shot','pass','defense','reactions','catching'].map(k=>[k,level]))}}))};
  for(const card of rosterCards(config,team,null)){const keys=card.role==='keeper'?['pace','shot','pass','defense','reactions','catching']:['pace','shot','pass','defense'],expected=card.team?config.roster.opponentBase:level;assert.equal(keys.reduce((n,k)=>n+card[k],0),expected*keys.length);assert.equal(card.overall,expected);for(const k of keys)assert.ok(Number.isInteger(card[k])&&card[k]>=1&&card[k]<=99);}
 }
 for(let n=0;n<400;n++){const keys=['pace','shot','pass','defense','reactions','catching'],team={players:config.team.players.map((p,i)=>({...p,card:{attributes:Object.fromEntries(keys.map((k,j)=>[k,1+(n*17+i*23+j*19)%99]))}}))},before=structuredClone(team);
  for(const card of rosterCards(config,team,null).filter(c=>!c.team)){const relevant=card.role==='keeper'?keys:keys.slice(0,4),source=before.players[config.players.roster[card.id].template].card.attributes;assert.equal(relevant.reduce((sum,k)=>sum+card[k],0),relevant.reduce((sum,k)=>sum+source[k],0));for(const k of relevant)assert.ok(Number.isInteger(card[k])&&card[k]>=1&&card[k]<=99);}assert.deepEqual(team,before);
 }
 for(const difficulty of ['easy','normal','hard'])for(const stage of [1,5,10,30])for(const card of rosterCards(config,config.team,null,stage,difficulty).filter(c=>c.team)){const keys=card.role==='keeper'?['pace','shot','pass','defense','reactions','catching']:['pace','shot','pass','defense'],level=Math.max(1,Math.min(99,config.roster.opponentBase+(stage-1)*config.roster.stageGain+config.roster.difficultyGain[difficulty]));assert.equal(keys.reduce((n,k)=>n+card[k],0),level*keys.length);}
});
test('G3f home profiles never reroll through matches, stage, difficulty, name or shirt edits; only earned training raises the child',()=>{
 const e=city(),make=()=>({players:e.state.players.map((p,i)=>({...p,card:e.state.soccerRoster.players[i]}))}),team=make(),before=structuredClone(e.state.soccerRoster),cards=rosterCards(config,team,e.state.soccerCard),skills=p=>['pace','shot','pass','defense','reactions','catching','overall'].map(k=>p[k]);
 for(const difficulty of ['easy','normal','hard'])for(const stage of [1,5,10])assert.deepEqual(rosterCards(config,make(),e.state.soccerCard,stage,difficulty).filter(p=>!p.team).map(skills),cards.filter(p=>!p.team).map(skills));assert.deepEqual(e.state.soccerRoster,before);
 e.editSoccerPlayer(e.state.players[0].id,{name:'דני',number:12});assert.deepEqual(skills(rosterCards(config,make(),e.state.soccerCard)[0]),skills(cards[0]));
 for(const day of [0,1])for(let i=0;i<3;i++)awardSoccerPractice(e.state,config,'targets',day*config.training.dayMilliseconds);
 const after=rosterCards(config,make(),e.state.soccerCard)[0];assert.equal(after.shot,cards[0].shot+1);for(const key of ['pace','pass','defense','reactions','catching'])assert.equal(after[key],cards[0][key]);
});
for(const team of [0,1])for(const dir of [1,-1])test(`G3f keeper hands are bounded by its own area, team ${team}, direction ${dir}`,()=>{
 const p={team},s={attackDir:dir},d=dir*(team? -1:1);assert.ok(inPenaltyArea(p,{x:-d*(hx-1),z:0},s,config));assert.equal(inPenaltyArea(p,{x:-d*(hx-config.pitch.penaltyDepth-.01),z:0},s,config),false);assert.equal(inPenaltyArea(p,{x:-d*(hx-1),z:config.pitch.penaltyWidth/2+.01},s,config),false);
});
test('G3f a keeper cannot catch an airborne ball outside the area but can handle an opponent ball inside',()=>{
 for(const inside of [false,true]){const g=setup(),s=g.getState(),k=s.players[2],x=inside?-hx+1:-hx+config.pitch.penaltyDepth+1;Object.assign(k,{x,z:0,recover:0,cooldown:0,think:100});Object.assign(s.ball,{x,z:0,y:2,vx:0,vz:0,vy:0,grace:0,lastTeam:1});g.update(dt,{});assert.equal(s.ball.owner===k.id,inside);assert.equal(k.hands,inside);}
});
for(const lastTeam of [0,1])for(const side of [-1,1])test(`G3f goal-line restart uses last touch ${lastTeam} on end ${side}`,()=>{const g=setup({x:side*(hx+.1),z:hz-2,vx:side*30,lastTeam}),s=g.getState();g.update(dt);assert.equal(s.restart.type,lastTeam===(side>0?1:0)?'corner':'goalKick');assert.equal(s.restart.team,lastTeam===(side>0?1:0)?1-lastTeam:side>0?1:0);if(s.restart.type==='goalKick')assert.ok(Math.abs(s.restart.x)>hx-config.pitch.goalAreaDepth);});
test('G3f human throw waits for a pass release, raises both hands and throws inward independently of running',()=>{
 const g=setup({x:0,z:hz+.1,vz:30,lastTeam:1}),s=g.getState();g.update(dt);advance(g,config.match.restartSeconds+.1);assert.equal(s.phase,'restartReady');assert.ok(s.players[s.restart.player].throwTime>0);assert.equal(s.ball.y,config.restarts.throwHeight);advance(g,.6,{passHeld:true,moveX:-1,moveZ:-1});g.update(dt,{moveX:-1,moveZ:-1});assert.equal(s.phase,'playing');assert.equal(s.ball.owner,null);assert.ok(s.ball.vx<0&&s.ball.vz<0);assert.equal(s.event.type,'throw');
});
test('G3f human corner creates a headable loft and landing marker, without a queued stoppage kick',()=>{
 const g=setup({x:hx+.1,z:hz-1,vx:30,lastTeam:1}),s=g.getState();g.update(dt,{kickHeld:true});advance(g,config.match.restartSeconds+.6);assert.equal(s.phase,'restartReady');assert.equal(s.charging,false);advance(g,.7,{passHeld:true,moveX:-1,moveZ:-1});g.update(dt,{moveX:-1,moveZ:-1});assert.equal(s.phase,'playing');assert.ok(s.ball.flight);assert.ok(s.ball.flight.height>=config.aerial.minHeight);assert.ok(s.passTarget);
});
test('G3f grass rolling decays gradually, converges to the analytic range, and has no destination clamp',()=>{
 const b={x:0,z:0,y:r,vx:5,vz:0,vy:0,curve:0},speeds=[];for(let i=0;i<600;i++){rollBall(b,dt,config);speeds.push(b.vx);}for(let i=1;i<200;i++)assert.ok(speeds[i]>0&&speeds[i]<speeds[i-1]);assert.equal(b.vx,0);assert.ok(b.x>5/config.ball.grassFriction-.2&&b.x<5/config.ball.grassFriction+.2);
});
test('G3f each successive grass bounce loses vertical energy',()=>{
 const b={x:0,z:0,y:2,vx:1,vz:0,vy:0,curve:0},peaks=[];let prev=0;for(let i=0;i<300;i++){rollBall(b,dt,config);if(prev<0&&b.vy>0)peaks.push(b.vy);prev=b.vy;}assert.ok(peaks.length>=2);for(let i=1;i<peaks.length;i++)assert.ok(peaks[i]<peaks[i-1]);
});
test('G3f manual shot goes against movement and body faces the strike, while a short automatic tap targets goal',()=>{
 for(const manual of [true,false]){const g=setup(),s=g.getState();Object.assign(s.players[0],{x:0,z:0,recover:0,cooldown:0,fx:1,fz:0});Object.assign(s.ball,{owner:0,x:.6,z:0,grace:100});const aim={x:-1,z:0,height:0,manual};g.update(dt,{moveZ:1,kickHeld:true,kickAim:aim});g.update(dt,{moveZ:1,kickAim:aim});assert.ok(s.players[0].vz>0);assert.equal(s.ball.vx<0,manual);assert.equal(s.players[0].fx<0,manual);}
});
test('G3f save probability is monotonic in keeper and shooter cards and shot quality, with strong corner/weak centre extremes',()=>{
 const card=n=>({reactions:n,catching:n,shot:n}),shot={speed:17,aim:.5,distance:7};assert.ok(keeperSaveChance(card(90),card(60),shot,config)>keeperSaveChance(card(30),card(60),shot,config));assert.ok(keeperSaveChance(card(60),card(30),shot,config)>keeperSaveChance(card(60),card(90),shot,config));assert.ok(keeperSaveChance(card(25),card(90),{speed:28,aim:.95,distance:4},config)<=.05);assert.ok(keeperSaveChance(card(90),card(25),{speed:8,aim:0,distance:4},config)>=.95);
});
for(const difficulty of ['easy','normal','hard'])test(`G3f enemy running speed has the ninety percent floor on ${difficulty}`,()=>{
 const g=createSoccer({config,difficulty}),s=g.getState();Object.assign(s.ball,{owner:null,x:0,z:0,y:50});for(const p of s.players)Object.assign(p,{x:-15,z:p.team?0:-5,cooldown:100});s.ball.x=12;s.ball.z=9;for(let i=0;i<45;i++)g.update(dt,{moveX:1});for(const p of s.players.filter(p=>p.team===1))assert.ok(Math.hypot(p.vx,p.vz)>=config.players.speed*config.opponents.minSpeedRatio*.99);
});
test('G3f keeper mode never switches to a field player, moves on its line, dives and distributes',()=>{
 const g=createSoccer({config,role:'keeper'}),s=g.getState();assert.equal(s.controlled,2);Object.assign(s.ball,{owner:3,x:0,z:1,grace:100});advance(g,.2,{moveZ:1,kickHeld:true,switchPlayer:true,kickAim:{x:0,z:1,manual:true}});assert.equal(s.controlled,2);assert.ok(s.players[2].diveTime>0);assert.ok(s.players[2].z>0);near(s.players[2].x,-hx+config.ai.keeperInset);Object.assign(s.ball,{owner:2,x:s.players[2].x,z:s.players[2].z});s.players[2].cooldown=0;g.update(dt,{passPressed:true});assert.equal(s.ball.owner,null);assert.equal(s.event.type,'pass');assert.equal(s.controlled,2);
});
test('G3f local short first names and shirt numbers are sanitized, resettable and persist through import',()=>{
 const e=city(),id=e.state.players[1].id;assert.equal(cleanFirstName('<script> דני 123',config),'script');assert.ok(e.editSoccerPlayer(id,{name:'דני! כהן 123',number:11}).ok);assert.equal(e.state.soccerRoster.players[1].name,'דני');assert.equal(e.editSoccerPlayer(id,{name:'x',number:100}).ok,false);const other=city();assert.ok(other.importJSON(e.exportJSON()).ok);assert.equal(other.state.soccerRoster.players[1].number,11);assert.equal(other.state.soccerRoster.players[1].name,'דני');assert.ok(other.editSoccerPlayer(id,{name:'',number:8}).ok);assert.equal(other.state.soccerRoster.players[1].name,'');
});
for(const kind of ['targets','penalties','cones'])test(`G3f actual ${kind} practice is playable, finite and rewards only after three attempts`,()=>{
 const g=createSoccerDrill({config,kind,seed:42,difficulty:'easy'});for(let i=0;i<4000&&!g.result;i++){const s=g.getState();g.update(dt,kind==='cones'?{passHeld:s.ball.owner===0&&i%40<25}:{kickHeld:s.ball.owner===0&&i%40<25});}assert.ok(g.result);assert.equal(g.result.attempts,3);assert.ok(g.result.elapsed<=60);assert.ok(soccerResult({drill:g.result},{drill:kind},config));assert.equal(soccerResult({drill:{...g.result,elapsed:0}},{drill:kind},config),null);
});
test('G3f practice daily cap, outdoor once/day, rollback and slow week/month progression are enforced by engine time',()=>{
 const e=city(),s=e.state,start=0;for(let i=0;i<3;i++)assert.ok(awardSoccerPractice(s,config,'targets',start).ok);assert.equal(awardSoccerPractice(s,config,'targets',start).ok,false);assert.ok(awardSoccerPractice(s,config,'outdoor',start).ok);assert.equal(awardSoccerPractice(s,config,'outdoor',start).ok,false);assert.equal(s.soccerRoster.players[0].attributes.shot,50);for(let day=1;day<7;day++)for(const kind of ['targets','penalties','cones'])awardSoccerPractice(s,config,kind,day*config.training.dayMilliseconds);assert.equal(awardSoccerPractice(s,config,'targets',0).ok,false);assert.ok(s.soccerRoster.players[0].attributes.shot<=54);assert.equal(s.soccerCard.attributes.power,s.soccerRoster.players[0].attributes.shot);for(let day=7;day<30;day++)for(const kind of ['targets','penalties','cones'])awardSoccerPractice(s,config,kind,day*config.training.dayMilliseconds);assert.ok(s.soccerRoster.players[0].attributes.shot<=66);assert.ok(validateSave(s,data,e.registry).ok);
});
for(const version of [7,8,9,10,11,12,13])test(`G3f authentic v${version} reaches schema 13 with tennis, fourth player and training intact`,async()=>{
 const url=version===8||version>=12?new URL(`./fixtures/save-v${version}.json`,import.meta.url):new URL(`tests/fixtures/save-v${version}.json`,root),old=JSON.parse(await readFile(url,'utf8')),before=structuredClone(old),e=city(),r=migrateSave(old,data,e.registry);assert.ok(r.ok);assert.equal(CURRENT_VERSION,15);assert.equal(r.state.version,15);assert.deepEqual(old,before);assert.equal(r.state.players.length,4);assert.ok(r.state.minigameProgress.tennis);if(old.minigameProgress?.tennis)assert.deepEqual(r.state.minigameProgress.tennis,old.minigameProgress.tennis);assert.ok(validateSave(r.state,data,e.registry).ok);assert.ok(e.importJSON(old).ok);assert.ok(validateSave(e.state,data,e.registry).ok);if(version===12)assert.deepEqual(migrations[14](migrations[13](migrations[12](old,data),data),data),r.state);if(version===13){assert.deepEqual(r.state.soccerRoster,old.soccerRoster);assert.ok(r.state.soccerRoster.players[0].attributes.shot>50);assert.equal(r.state.soccerCard.attributes.power,r.state.soccerRoster.players[0].attributes.shot);}
});
test('G3f explicit full 1 through 13 chain is additive for every prior migration',()=>{
 const e=city(),old={version:1,createdAt:1_000_000,updatedAt:1_000_000,money:200,buildings:e.state.buildings,world:e.state.world,avatar:e.state.avatar,players:e.state.players,team:{...e.state.team}};let s=old;for(let v=1;v<CURRENT_VERSION;v++){s=migrations[v](s,data,e.registry);assert.equal(s.version,v+1);}assert.ok(validateSave(s,data,e.registry).ok);assert.deepEqual(migrateSave(old,data,e.registry).state,s);
});
test('G3f fixed bot wins at least seven of ten easy stage one and keeps easy >= normal >= hard',t=>{
 const wins=[];for(const difficulty of ['easy','normal','hard']){let won=0;for(let seed=1;seed<=10;seed++){const g=createSoccer({config,seed,difficulty});for(let i=0;i<24000&&!g.result;i++)g.update(dt,bot(g,config));assert.ok(g.result);won+=Number(g.result.won);}wins.push(won);}assert.ok(wins[0]>=7,JSON.stringify(wins));assert.ok(wins[0]>=wins[1]&&wins[1]>=wins[2],JSON.stringify(wins));t.diagnostic('G3f profile calibration '+JSON.stringify({stage:1,seeds:10,wins}));
});
test('G3f malformed roster fields and legacy null players reject without throwing',()=>{
 const e=city();for(const mutate of [s=>s.soccerRoster.players[0]=null,s=>s.soccerRoster.players[0].name='<img>',s=>s.soccerRoster.players[0].number=0,s=>s.soccerRoster.players[0].points.shot=99,s=>s.soccerRoster.training.awarded=99,s=>s.soccerRoster.role='admin']){const s=structuredClone(e.state);mutate(s);assert.equal(migrateSave(s,data,e.registry).ok,false);}const old=structuredClone(e.state);old.version=12;old.players=[null];assert.equal(migrateSave(old,data,e.registry).ok,false);
});
test('G3f practice finish is single-award and never grants match money, wins, stages or stars',()=>{
 const e=city();e.state.money=100000;e.skipTutorial();let placed=false;for(let z=0;z<16&&!placed;z++)for(let x=0;x<16&&!placed;x++)placed=e.place('soccer',x,z).ok;let ctx;e.registry.minigames.set('soccer',{...e.registry.minigames.get('soccer'),start:c=>(ctx=c,{dispose(){}})});assert.ok(e.startMinigame('soccer',{drill:'targets',seed:42,level:1}).ok);const before=structuredClone(e.state);assert.equal(e.editSoccerPlayer(e.state.players[0].id,{name:'x',number:5}).ok,false);assert.equal(e.setSoccerRole('keeper').ok,false);assert.equal(e.soccerOutdoorPractice().ok,false);const raw={drill:{kind:'targets',attempts:3,hits:1,elapsed:9}};assert.ok(ctx.finish(raw).ok);assert.equal(ctx.finish(raw).ok,false);assert.equal(e.state.soccerRoster.training.awarded,1);for(const key of ['money','team','minigameProgress','minigameWins','soccerCard'])assert.deepEqual(e.state[key],before[key]);
});
test('G3f an AI corner is an inward loft, leaves a landing marker and never transfers human control to the enemy',()=>{
 const g=setup({x:-hx-.1,z:hz-1,vx:-30,lastTeam:0}),s=g.getState();g.update(dt);assert.equal(s.restart.team,1);assert.equal(s.restart.type,'corner');const controlled=s.controlled;advance(g,config.match.restartSeconds+config.restarts.aiReleaseSeconds+.1);assert.equal(s.phase,'playing');assert.ok(s.ball.flight);assert.ok(s.ball.flight.x>-hx);assert.equal(s.controlled,controlled);assert.ok(s.passTarget);
});
for(const side of [-1,1])test(`G3f a direct throw into goal ${side} cannot score and awards the correct restart`,()=>{const g=setup({x:side*(hx-.1),z:0,vx:side*30,lastTeam:0,thrower:0}),s=g.getState();g.update(dt);assert.deepEqual(s.score,[0,0]);assert.equal(s.restart.type,side>0?'goalKick':'corner');assert.equal(s.restart.team,1);assert.equal(s.ball.thrower,null);});
test('G3f the actual keeper uses both cards: a powerful corner beats weak hands, a weak centre is caught by strong hands',()=>{
 for(const strongShot of [true,false]){const g=setup({x:hx-1.7,z:strongShot?2.2:0,vx:strongShot?28:10,lastTeam:0,lastPlayer:0,grace:1}),s=g.getState(),k=s.players[5];Object.assign(k,{x:hx-1.1,z:s.ball.z,cooldown:0,recover:0,think:100});k.card.reactions=k.card.catching=strongShot?20:99;s.players[0].card.shot=strongShot?99:20;s.ball.shot={speed:s.ball.vx,aim:strongShot?.85:0,distance:4,shooter:0};g.update(dt);assert.equal(s.ball.owner===k.id,!strongShot);if(!strongShot)assert.ok(k.hands);}
});
test('G3f every home pace card changes its own actual running even when another player is controlled',()=>{
 for(const id of [0,1,2,6]){const pair=[50,99].map(pace=>{const g=createSoccer({config}),s=g.getState();for(const p of s.players)Object.assign(p,{x:-15,z:8,cooldown:100,think:100,recover:p.team?100:0});Object.assign(s.players[id],{x:0,z:0});s.players[id].card.pace=pace;Object.assign(s.ball,{owner:null,x:8,z:0,y:1000,vx:0,vz:0});g.update(dt,{moveX:1});return Math.hypot(s.players[id].vx,s.players[id].vz);});assert.ok(pair[0]>0);near(pair[1]/pair[0],1+config.card.effects.pace);}
});
test('G3f importing an old v12 save preserves current custom names, shirts, role and earned practice',async()=>{const e=city(),id=e.state.players[1].id;e.editSoccerPlayer(id,{name:'דני',number:11});e.setSoccerRole('keeper');awardSoccerPractice(e.state,config,'targets',1000000);const before=structuredClone(e.state.soccerRoster),old=await readFile(new URL('./fixtures/save-v12.json',import.meta.url),'utf8');assert.ok(e.importJSON(old).ok);assert.deepEqual(e.state.soccerRoster,before);assert.ok(validateSave(e.state,data,e.registry).ok);});
