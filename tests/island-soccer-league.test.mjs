import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {leagueMatch} from '../workout/island/minigames/soccer-campaign.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {createSoccerPenalties} from '../workout/island/minigames/soccer-penalties.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';

// Soccer game level round (29/10/2026): league ladder, bonus penalties, keeper throw,
// throw-in reach, wide play and the camera. Numbers come from the measured baseline
// on main 7018e63 (keeper throw 22 m/s for a 10 m pass, throw-in carried ~20 m).
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer,dt=c.match.fixedStep;
const total=c.league.leagues.length*c.league.matchesPerLeague;

test('league: three leagues of five matches, difficulty per league, tuning and keeper rise inside each',()=>{
 assert.equal(total,15);assert.deepEqual(c.league.leagues.map(l=>l.difficulty),['easy','normal','hard']);
 for(let n=1;n<=total;n++){const m=leagueMatch(c,n);assert.equal(m.stage,n);assert.equal(m.league,Math.ceil(n/5));assert.equal(m.match,(n-1)%5+1);assert.ok(Number.isFinite(m.tuning)&&m.tuning>=1&&m.tuning<=30);}
 for(const row of c.league.leagues)for(let i=1;i<row.tuning.length;i++)assert.ok(row.tuning[i]>row.tuning[i-1],'tuning rises inside a league');
 const keepers=Array.from({length:total},(_,i)=>leagueMatch(c,i+1).keeper);for(let i=1;i<keepers.length;i++)assert.ok(keepers[i]>keepers[i-1],'the rival keeper improves every match');
 assert.equal(leagueMatch(c,99).stage,total);assert.equal(leagueMatch({},4).tuning,4,'no league config keeps the legacy stage');
});

test('league: a match keeps its saved number while the model uses the league tuning and keeper',()=>{
 const g=createSoccer({config:c,stage:12,seed:3,difficulty:'hard',league:true}),s=g.getState(),m=leagueMatch(c,12);
 assert.equal(s.stage,12);assert.equal(s.league.match,2);assert.equal(s.league.nameId,'soccer.league.a');
 const legacy=createSoccer({config:c,stage:12,seed:3,difficulty:'hard'}).getState();assert.equal(legacy.league,null,'legacy callers are unchanged');
 assert.ok(Math.abs(s.campaign.stage-Math.round(m.tuning))<=1);
});

test('keeper throw: bounded underarm release, never faster than a shot (was 22 m/s for 10 m)',()=>{
 for(const seed of [1,2,3,4]){const g=createSoccer({config:c,stage:5,seed}),s=g.getState(),k=s.players[2];
  Object.assign(s,{phase:'playing',restart:null});Object.assign(k,{x:-16,z:0,hands:true,hold:0,think:0,cooldown:0});Object.assign(s.ball,{owner:2,x:-15.6,z:0,y:1.05,vx:0,vz:0,vy:0,grace:0,flight:null});
  let speed=null;for(let i=0;i<400&&speed===null;i++){g.update(dt);if(s.ball.owner===null)speed=Math.hypot(s.ball.vx,s.ball.vz);}
  assert.ok(speed!==null);assert.ok(speed<=c.goalkeeping.throwMaxSpeed+.3,`${speed}`);/* + the card pass-spread nudge */assert.ok(speed>=c.goalkeeping.throwMinSpeed-1e-9);assert.ok(speed<c.physics.shotSpeed);}
});

test('throw-in: reaches a team-mate inside restarts.throwReach, opponents give the taker room, most throws are kept',()=>{
 let kept=0,lost=0,longest=0;
 for(let seed=1;seed<=24;seed++){
  const g=createSoccer({config:c,stage:5,seed});for(let i=0;i<60*(5+seed%10);i++)g.update(dt);const s=g.getState();if(s.phase!=='playing')continue;
  const x=((seed*7)%30)-15,side=seed%2?1:-1,team=seed%3?1:0;Object.assign(s.ball,{owner:null,x,z:side*10.95,y:.22,vx:0,vz:side*30,vy:0,lastTeam:1-team,flight:null});g.drainEvents();
  let from=null;
  for(let i=0;i<60*8;i++){
   if(s.phase==='restartReady'&&s.restart?.type==='throwIn')for(const p of s.players)if(p.team!==s.restart.team&&p.role!=='keeper')assert.ok(Math.hypot(p.x-s.restart.x,p.z-s.restart.z)>=c.restarts.opponentSpace-1e-6,'opponent too close to the throw');
   g.update(dt);let done=false;
   for(const e of g.drainEvents()){if(e.type==='throw'){from={x:s.ball.x,z:s.ball.z,team:s.players[e.player].team};assert.ok(Math.hypot(s.ball.vx,s.ball.vz)<=c.restarts.throwSpeed+1e-9);}
    if(e.type==='possession'&&from){s.players[e.player].team===from.team?kept++:lost++;longest=Math.max(longest,Math.hypot(s.ball.x-from.x,s.ball.z-from.z));done=true;}}
   if(done)break;
  }
 }
 assert.ok(kept/(kept+lost)>=.6,JSON.stringify({kept,lost}));assert.ok(longest<c.pitch.width*.75,`throw travelled ${longest}`);
});

test('wide play: a wide carrier in the final third sends one runner into the box and one team-mate square',()=>{
 const g=createSoccer({config:c,stage:8,seed:5}),s=g.getState();for(let i=0;i<30;i++)g.update(dt);
 const d=-s.attackDir,w=s.players.find(p=>p.team===1&&p.role==='wing');
 Object.assign(w,{x:d*9,z:6.5,vx:0,vz:0,cooldown:100,think:100,hold:0});Object.assign(s.ball,{owner:w.id,x:w.x+d*.5,z:6.5,y:.22,vx:0,vz:0,flight:null,grace:100,lastTeam:1});
 for(let i=0;i<5;i++)g.update(dt);const duties=s.players.filter(p=>p.team===1&&p.id!==w.id&&p.role!=='keeper').map(p=>p.duty).sort();
 assert.deepEqual(duties,['box-run','square']);
});

test('wide play: rival wings cross and the receiver heads, from crossFromStage only',()=>{
 const count=stage=>{let lofts=0,headers=0;for(const seed of [1,2,3]){const g=createSoccer({config:c,stage,seed});for(let i=0;i<60*120&&!g.result;i++){g.update(dt);for(const e of g.drainEvents())if(e.team===1||g.getState().players[e.player]?.team===1){if(e.type==='loft')lofts++;if(e.type==='header')headers++;}}}return {lofts,headers};};
 const early=count(1),late=count(8);assert.equal(early.lofts,0,JSON.stringify(early));assert.ok(late.lofts>=3&&late.headers>=2,JSON.stringify(late));
});

function shootout(stage=3,seed=7){return createSoccerPenalties({config:c,stage,seed,difficulty:leagueMatch(c,stage).difficulty,league:true});}
test('bonus penalties: three kicks from the spot, the rival keeper defends, the idle child still finishes',()=>{
 const g=shootout(),s=g.getState();assert.equal(s.shootout.kicks,c.league.penalties.kicks);
 assert.ok(Math.abs(s.ball.x-(c.pitch.length/2-c.pitch.penaltySpot))<1e-9);assert.equal(s.ball.owner,0);
 for(let i=0;i<60*60&&!g.result;i++)g.update(dt);
 assert.ok(g.result);assert.equal(g.result.attempts,3);assert.ok(g.result.hits>=0&&g.result.hits<=3);
});
test('bonus penalties: an aimed corner shot scores and is counted once',()=>{
 const g=shootout(1,11),s=g.getState();let hits=0;
 for(let k=0;k<3;k++){for(let i=0;i<12;i++)g.update(dt,{kickHeld:true,moveX:1,moveZ:.42});g.update(dt,{});for(let i=0;i<60*4&&s.shootout.attempts===k&&!g.result;i++)g.update(dt,{});}
 hits=g.result?.hits??s.shootout.hits;assert.ok(hits>=1,`hits ${hits}`);assert.equal(g.result.attempts,3);
});

const payload=(extra={})=>({won:true,goalsFor:3,goalsAgainst:0,stage:1,stars:3,seed:42,difficulty:'easy',durationSeconds:150,...extra});
const env=(r,pen)=>({outcome:r.won?'win':'lose',score:r.goalsFor,soccer:r,...(pen===undefined?{}:{penalties:pen})});
test('result: bonus penalties pay per goal after a win or a loss and never change the outcome',()=>{
 const ctx={level:1,seed:42,difficulty:'easy'},per=c.league.penalties.coinsPerGoal;
 const plain=soccerResult(env(payload()),ctx,c),bonus=soccerResult(env(payload(),{attempts:3,hits:2}),ctx,c);
 assert.equal(bonus.money,plain.money+2*per);assert.equal(bonus.outcome,'win');assert.deepEqual(bonus.penalties,{attempts:3,hits:2,money:2*per});
 const lost=soccerResult(env(payload({won:false,goalsFor:0,goalsAgainst:1,stars:1}),{attempts:3,hits:3}),ctx,c);assert.equal(lost.outcome,'lose');assert.equal(lost.money,3*per);
 for(const bad of [{attempts:4,hits:1},{attempts:2,hits:3},{attempts:3},{attempts:3,hits:1,extra:1},null,[1,2]])assert.equal(soccerResult(env(payload(),bad),ctx,c),null,JSON.stringify(bad));
});

test('camera and loading: closer camera, and the old block figures are only a failure fallback',async()=>{
 assert.equal(c.view.camera.nearDistance,15);
 const view=await readFile(new URL('../workout/island/minigames/soccer-view.mjs',import.meta.url),'utf8'),session=await readFile(new URL('../workout/island/minigames/soccer-session.mjs',import.meta.url),'utf8');
 assert.match(view,/else if\(assetStatus==='fallback'\)\{/);assert.match(session,/const loading=view\.loading\(\);/);assert.match(session,/!paused&&!document\.hidden&&!loading/);
});
