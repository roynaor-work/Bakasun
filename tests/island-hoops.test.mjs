import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {createFixedLoop} from '../workout/island/minigames/hoops-loop.mjs';
import {hoopsResult} from '../workout/island/minigames/hoops-result.mjs';
import {TEAMS,generateRoster,overall,RATING_KEYS,seasonSchedule,standings} from '../workout/island/minigames/hoops-league.mjs';
import {initialHoops,validHoops,migrateHoops,mergeHoops,matchTeams,applyResult,newSeason,setLineup,trainingOffer,train,nextGame,userCards} from '../workout/island/minigames/hoops-franchise.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,createInitialState} from '../workout/island/engine/persistence.mjs';

const root=new URL('../workout/island/',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const config=await json('data/config.json'),cfg=config.minigames.streetSlam;
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const clone=v=>structuredClone(v);

/** One whole game on autopilot (both teams by the AI), recorded step by step. */
function play({seed=11,profile='quick',hoops=initialHoops(cfg),stage=1,watch}={}){
 const setup=matchTeams(cfg,hoops,{stage});
 const e=createHoopsEngine({config:cfg,seed,teams:setup.teams,userTeam:0,profile,difficulty:setup.difficulty,assist:setup.assist,autopilot:true});
 const events=[];let n=0;
 while(e.snapshot().phase!=='final'&&n<60*60*60){e.step(NO_INPUT);n++;const ev=e.drainEvents();events.push(...ev);watch?.(e,ev);}
 return {e,setup,events,snap:e.snapshot(),result:e.result,steps:n,seed,profile,stage};
}
/** The payload the session hands to the island shell (same shape as hoops-session.mjs). */
function payload(g,gameId=null){
 const r=g.result,sc=r.score,won=sc[0]>sc[1],prof=cfg.rules.profiles[g.profile];
 const box=r.box[0].map(p=>({id:p.id,pts:p.pts,reb:p.reb,ast:p.ast,stl:p.stl,blk:p.blk,sec:p.sec,fgm:p.fgm,fga:p.fga,tpm:p.tpm,tpa:p.tpa,ftm:p.ftm,fta:p.fta,pf:p.pf,tov:p.tov}));
 return {outcome:won?'win':'lose',score:sc[0],streetSlam:{won,scoreFor:sc[0],scoreAgainst:sc[1],quarters:r.quarters,overtime:r.overtime,profile:g.profile,stage:g.stage,seed:g.seed,gameSeconds:4*prof.quarterSeconds+r.overtime*prof.overtimeSeconds,gameId,opponent:g.setup.teams[1].id,box,mvp:r.mvp}};
}
/** A live possession for team 0 with the ball in the hands of its first player. */
function live(seed=5){
 const g=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed,teams:g.teams,userTeam:0,profile:'quick',autopilot:true});
 for(let i=0;i<60*20&&!(e.snapshot().phase==='live'&&e.snapshot().ball.state==='held');i++)e.step(NO_INPUT);
 e.drainEvents();return e;
}

let shared;const game=()=>shared||(shared=play({seed:11,watch:watcher()}));
const samples={shotClock:[],onCourt:[],possessionClock:[]};
function watcher(){return (e,ev)=>{const s=e.snapshot();samples.shotClock.push(s.shotClock);samples.onCourt.push([0,1].map(t=>e.roster(t).filter(p=>p.onCourt).length+10*(s.players.filter(p=>p.team===t).length-5)));
 for(const x of ev)if(x.type==='possession')samples.possessionClock.push({reason:x.reason,shotClock:s.shotClock});};}

test('the basketball game is registered with its config, strings, assets and download budget',async()=>{
 const ext=await json('data/extensions.json'),strings=await json('data/strings.he.json'),manifest=await json('assets/models/manifest.json');
 assert.ok(ext.modules.includes('extensions/street-slam.mjs'));
 for(const k of ['court','physics','rules','timing','shot','pass','steal','block','rebound','contact','fatigue','ai','league','economy','view','assets'])assert.ok(cfg[k],k);
 assert.deepEqual(Object.keys(cfg.rules.profiles).sort(),['pro','quick','standard']);
 assert.equal(cfg.rules.profiles.pro.quarterSeconds,720,'pro profile plays real 12-minute quarters');
 assert.ok(!Object.keys(strings).some(k=>k.startsWith('slam.')),'old street-slam strings are gone');
 assert.ok(strings['minigame.streetSlam.title']);
 let total=0;
 for(const name of ['guard','wing','forward','big','anim']){
  const file=`assets/models/hoops-${name}.glb`,size=(await stat(new URL(file,root))).size;
  assert.ok(size<=2_000_000,`${file} is at most 2 MB`);assert.ok(manifest[file],`${file} is audited`);total+=size;
 }
 assert.ok(total<=config.ui.downloadBudget.gameAdditional,'all player models fit the per-game download budget');
 const {install}=await import('../workout/island/extensions/street-slam.mjs');const seen=[];
 install({registerMinigame:r=>seen.push(r)},{config,extensions:ext.records});
 assert.equal(seen[0].id,'streetSlam');assert.equal(typeof seen[0].start,'function');
});

test('eight original clubs with twelve-player rosters, generated the same way every time',()=>{
 assert.equal(TEAMS.length,8);assert.equal(new Set(TEAMS.map(t=>t.id)).size,8);
 for(const t of TEAMS){
  const a=generateRoster(t.id,72),b=generateRoster(t.id,72);
  assert.deepEqual(a,b);assert.equal(a.length,12);assert.equal(new Set(a.map(p=>p.id)).size,12);
  for(const p of a){for(const k of RATING_KEYS)assert.ok(p.ratings[k]>=20&&p.ratings[k]<=99,`${p.id}.${k}`);assert.ok(p.ratings.height>=170&&p.ratings.height<=225);}
  assert.deepEqual(a.slice(0,5).map(p=>p.pos).sort(),['C','PF','PG','SF','SG'],'starting five covers all positions');
 }
 assert.ok(overall(generateRoster('waves',80)[0])>overall(generateRoster('waves',60)[0]),'roster level moves the ratings');
});

test('same seed and teams replay identically; another seed plays another game',()=>{
 const a=play({seed:77}),b=play({seed:77}),c=play({seed:78});
 assert.equal(JSON.stringify(a.snap),JSON.stringify(b.snap));
 assert.equal(a.events.map(e=>e.type+(e.seq??'')).join(),b.events.map(e=>e.type+(e.seq??'')).join());
 assert.notEqual(JSON.stringify(a.snap.score)+a.steps,JSON.stringify(c.snap.score)+c.steps);
});

test('the fixed-step loop gives the engine the same steps at 30, 60 and 120 Hz',()=>{
 const count=hz=>{const loop=createFixedLoop();let n=0;for(let i=0;i<hz;i++)loop.advance(1/hz,()=>{n++;});return n;};
 assert.equal(count(30),60);assert.equal(count(60),60);assert.equal(count(120),60);
});

test('a full game: four quarters, five a side, every basket counted once and the box adds up',()=>{
 const g=game();
 assert.equal(g.snap.phase,'final');assert.equal(g.result.quarters,4+g.result.overtime);
 assert.notEqual(g.result.score[0],g.result.score[1],'no ties: overtime decides');
 assert.ok(samples.onCourt.every(([a,b])=>a===5&&b===5),'always five on five');
 const scores=g.events.filter(e=>e.type==='score'),byShot=new Map();
 for(const s of scores){assert.ok([1,2,3].includes(s.points));if(s.shotId){assert.ok(!byShot.has(s.shotId),'one basket per shot');byShot.set(s.shotId,s);}}
 for(const t of [0,1])assert.equal(scores.filter(s=>s.team===t).reduce((a,s)=>a+s.points,0),g.result.score[t],'events add up to the score');
 const releases=new Map(g.events.filter(e=>e.type==='release').map(e=>[e.shotId,e]));
 for(const [id,s] of byShot)if(releases.has(id)&&!s.goaltend)assert.equal(s.points,releases.get(id).points,'a three counts three, a two counts two');
 for(const t of [0,1]){
  const box=g.result.box[t];assert.equal(box.reduce((a,p)=>a+p.pts,0),g.result.score[t]);
  for(const p of box){assert.ok(p.fgm<=p.fga&&p.tpm<=p.tpa&&p.ftm<=p.fta&&p.tpm<=p.fgm);assert.equal(p.pts,2*(p.fgm-p.tpm)+3*p.tpm+p.ftm,p.id);}
 }
 assert.ok(g.events.some(e=>e.type==='release'&&e.shotType==='jumpshot')&&g.events.some(e=>e.type==='release'&&e.shotType==='layup'),'jump shots and finishes at the rim');
 assert.ok(g.events.some(e=>e.type==='pass'),'the teams pass');assert.ok(g.events.some(e=>e.type==='rebound'),'rebounds');
 // quick profile = 4 x 90 s of game clock; real pace is about 2.3 points per team per minute
 const minutes=4*cfg.rules.profiles.quick.quarterSeconds/60;
 for(const t of [0,1])assert.ok(g.result.score[t]/minutes>=1.5,'a real game, not a handful of shots: '+g.result.score);
});

test('shot clock: 24 on a new possession, never above it, 14 kept after an offensive rebound off the rim',()=>{
 game();
 assert.ok(samples.shotClock.every(v=>v>=0&&v<=cfg.rules.shotClock+1e-9));
 assert.ok(samples.possessionClock.length>10);
 for(const p of samples.possessionClock)assert.ok(p.shotClock<=cfg.rules.shotClock&&p.shotClock>=0,JSON.stringify(p));
 assert.equal(cfg.rules.shotClock,24);assert.equal(cfg.rules.shotClockReset,14);
 // Running the clock out is a violation and the ball changes hands.
 const e=live(),s=e.debug.state,team=s.possession;
 e.debug.setClock(null,0.05);for(let i=0;i<20;i++)e.step(NO_INPUT);
 const ev=e.drainEvents();assert.ok(ev.some(x=>x.type==='violation'&&x.kind==='shotclock'&&x.team===team),JSON.stringify(ev.map(x=>x.type)));
 for(let i=0;i<60*6&&e.snapshot().possession===team;i++)e.step(NO_INPUT);
 assert.equal(e.snapshot().possession,1-team);
});

test('fouls: the fifth team foul is in the bonus, the sixth personal foul removes the player for good',()=>{
 const e=live(9),s=e.debug.state,off=s.possession,def=1-off;
 const offender=e.debug.api.onCourt(def)[0],victim=e.debug.api.onCourt(off)[0];
 const fouls=[];
 for(let k=0;k<6;k++){
  for(let i=0;i<60*12&&!(e.snapshot().phase==='live');i++)e.step(NO_INPUT);
  e.debug.foul(offender,victim,'reach',null);fouls.push(...e.drainEvents());
  for(let i=0;i<3;i++)e.step(NO_INPUT);fouls.push(...e.drainEvents());
 }
 const calls=fouls.filter(x=>x.type==='foul'&&x.playerId===offender.id);
 assert.equal(calls.length,6);assert.equal(calls[5].personal,6);
 assert.ok(calls.some(c=>c.bonus),'team in the bonus');assert.equal(calls[3].bonus,false);assert.ok(calls[4].bonus||calls[4].teamFouls<cfg.rules.teamFoulBonus);
 assert.ok(fouls.some(x=>x.type==='foulOut'&&x.playerId===offender.id));
 for(let i=0;i<60*15;i++){e.step(NO_INPUT);if(!offender.onCourt)break;}
 assert.equal(offender.onCourt,false,'fouled-out player leaves the floor');
 // He cannot be sent back in.
 for(let i=0;i<60*20&&!['dead','inbound','freethrow'].includes(e.snapshot().phase);i++)e.step(NO_INPUT);
 const someone=e.debug.api.onCourt(def)[0];
 assert.equal(e.substitute(def,someone.id,offender.id).reason,'invalid');
});

test('free throws: two shots after a bonus foul, the ball goes live only after the last one',()=>{
 const e=live(13);e.debug.free(e.debug.state.possession,2);
 const s0=e.snapshot();assert.equal(s0.phase,'freethrow');assert.equal(s0.ft.total,2);
 const ev=[];for(let i=0;i<60*20&&e.snapshot().ft;i++){e.step(NO_INPUT);ev.push(...e.drainEvents());}
 const tries=ev.filter(x=>x.type==='release'&&x.shotType==='ft');assert.equal(tries.length,2);
 for(const x of ev.filter(y=>y.type==='score'))assert.equal(x.points,1);
});

test('substitutions and timeouts: only at a dead ball, the bench player comes in, timeouts run out',()=>{
 const e=live(17),me=e.debug.state.userTeam;
 const [on]=e.debug.api.onCourt(me),off=e.roster(me).find(p=>!p.onCourt);
 assert.equal(e.substitute(me,on.id,off.id).reason,'live','no subs during live play');
 const before=e.snapshot().timeouts[me];
 const t=e.timeout(me);
 if(t.ok){assert.equal(e.snapshot().timeouts[me],before-1);assert.equal(e.snapshot().phase,'timeout');
  const r=e.substitute(me,on.id===e.debug.state.ball.owner?e.debug.api.onCourt(me)[1].id:on.id,off.id);assert.equal(r.ok,true);
  assert.equal(e.roster(me).find(p=>p.id===off.id).onCourt,true);}
 else assert.equal(e.debug.state.possession===me,false,'a timeout is refused only when the other team has the ball');
 e.debug.state.teams[me].timeouts=0;assert.equal(e.timeout(me).ok,false,'no timeouts left');
});

test('man and zone defence and play calls are accepted from the child and change the AI',()=>{
 const e=live(21),ev=[];
 e.setTactics(1,{defense:'zone'});e.callPlay(0,'pnr');ev.push(...e.drainEvents());
 assert.ok(ev.some(x=>x.type==='tactics'&&x.defense==='zone'));assert.ok(ev.some(x=>x.type==='playCall'&&x.play==='pnr'));
 assert.equal(e.snapshot().call[0],'pnr');
});

test('the island accepts only a result that matches the game it started',()=>{
 const g=game(),ctx={level:1,seed:11,hoopsGame:null},raw=payload(g);
 const ok=hoopsResult(raw,ctx,cfg);assert.ok(ok);assert.equal(ok.outcome,raw.outcome);assert.equal(ok.hoops.score[0],g.result.score[0]);
 assert.ok(ok.money>=0&&Number.isSafeInteger(ok.money));if(ok.outcome==='win')assert.ok(ok.stars>=1&&ok.stars<=3);
 const bad=f=>{const r=clone(raw);f(r);return hoopsResult(r,ctx,cfg);};
 assert.equal(bad(r=>{r.streetSlam.seed++;}),null,'other seed');
 assert.equal(bad(r=>{r.streetSlam.box[0].pts+=2;}),null,'box does not add up');
 assert.equal(bad(r=>{r.streetSlam.scoreAgainst=r.streetSlam.scoreFor;r.streetSlam.won=false;r.outcome='lose';}),null,'tie');
 assert.equal(bad(r=>{r.streetSlam.extra=1;}),null,'unknown field');
 assert.equal(bad(r=>{r.streetSlam.gameSeconds=10;}),null,'too short');
 assert.equal(bad(r=>{r.streetSlam.stage=2;}),null,'other stage');
 assert.equal(bad(r=>{r.streetSlam.gameId='made-up';}),null,'a season game the island did not start');
 assert.equal(bad(r=>{r.score+=1;}),null,'shell score differs');
});

test('club: default is valid, damaged clubs are refused, the newer of two imports wins',()=>{
 const h=initialHoops(cfg);assert.ok(validHoops(h,cfg));assert.deepEqual(initialHoops(cfg),h);
 assert.equal(h.roster.length,12);assert.equal(h.lineup.length,5);assert.ok(nextGame(h));
 assert.equal(migrateHoops(h,cfg),h);assert.equal(migrateHoops({...h,v:99},cfg),null);
 for(const f of [x=>{x.lineup.pop();},x=>{x.lineup[1]=x.lineup[0];},x=>{x.roster[0].ratings.three=150;},x=>{x.credits=-1;},x=>{x.tactics.defense='press';},x=>{x.roster.push({...x.roster[0]});}]){const c=clone(h);f(c);assert.equal(validHoops(c,cfg),false);}
 const played=clone(h);played.rewarded.push('g1');assert.equal(mergeHoops(h,played).rewarded.length,1);assert.equal(mergeHoops(played,h),played);
});

test('club: a season game is credited once, the round is completed and the season can be won',()=>{
 const h=initialHoops(cfg),g=nextGame(h),credits=h.credits;
 const res={gameId:g.id,won:true,score:[80,70],opponent:'x',box:[{id:h.roster[0].id,pts:20,reb:5,ast:3,stl:1,blk:0,sec:600}],mvp:h.roster[0].id,profile:'standard'};
 assert.equal(applyResult(h,res,cfg,1000).ok,true);assert.equal(applyResult(h,res,cfg,1001).reason,'duplicate');
 assert.equal(h.credits,credits+cfg.economy.winCredits);assert.equal(h.roster[0].pts,20);assert.equal(h.roster[0].gp,1);
 const round=h.season.schedule.find(r=>r.games.some(x=>x.id===g.id));assert.ok(round.games.every(x=>x.score),'the other games of the round are decided too');
 assert.notEqual(nextGame(h).id,g.id);assert.equal(newSeason(h).reason,'seasonRunning');
 for(let n=0;n<40&&nextGame(h);n++){const x=nextGame(h);applyResult(h,{...res,gameId:x.id},cfg,2000+n);}
 assert.equal(nextGame(h),null);assert.ok(h.season.champion);
 const table=standings(h.season.schedule,TEAMS.map(t=>t.id));assert.equal(table[0].id,h.season.champion);
 if(h.season.champion===h.team)assert.ok(h.receipts.some(r=>r.kind==='champion'));
 assert.equal(newSeason(h).ok,true);assert.equal(h.season.n,2);assert.ok(nextGame(h));assert.ok(validHoops(h,cfg));
 assert.deepEqual(seasonSchedule(TEAMS.map(t=>t.id),1),seasonSchedule(TEAMS.map(t=>t.id),1));
});

test('club: training costs credits, shows its result first and changes the player in the game',()=>{
 const h=initialHoops(cfg);h.credits=50;const id=h.roster[0].id;
 const offer=trainingOffer(h,id,'shooting',cfg);assert.ok(offer.cost>0);assert.ok(Object.keys(offer.after).length);
 const before=userCards(h)[0].ratings.three,r=train(h,id,'shooting',cfg,1000,1);
 assert.equal(r.ok,true);assert.equal(h.credits,50-offer.cost);assert.ok(userCards(h)[0].ratings.three>before);
 assert.ok(h.receipts.some(x=>x.kind==='train'&&x.amount===-offer.cost));
 h.credits=0;assert.equal(train(h,id,'shooting',cfg,1001).reason,'credits');
 assert.equal(trainingOffer(h,'nobody','shooting',cfg),null);
 const m=matchTeams(cfg,h,{stage:1}).teams[0].players.find(p=>p.id===id);assert.ok(m.ratings.three>=userCards(h)[0].ratings.three-1e-9);
});

test('club: the lineup chosen is the five that start, changing it costs chemistry',()=>{
 const h=initialHoops(cfg);h.together=40;
 const bench=h.roster.slice(5,10).map(p=>p.id);
 assert.equal(setLineup(h,[...bench.slice(0,4),bench[0]]).ok,false);assert.equal(setLineup(h,['x','y','z','w','v']).ok,false);
 assert.equal(setLineup(h,bench).ok,true);assert.deepEqual(h.lineup,bench);assert.equal(h.together,20);
 const m=matchTeams(cfg,h,{stage:1});assert.deepEqual(m.teams[0].lineup,bench);
 const e=createHoopsEngine({config:cfg,seed:3,teams:m.teams,userTeam:0,profile:'quick'});
 assert.deepEqual(e.roster(0).filter(p=>p.onCourt).map(p=>p.id).sort(),[...bench].sort());
 // equipment from the island shop speeds up the child's team only
 const fast=matchTeams(cfg,h,{stage:1,equipment:{shoes:1.1}});
 assert.ok(fast.teams[0].players[0].ratings.speed>m.teams[0].players[0].ratings.speed||m.teams[0].players[0].ratings.speed>=99);
 assert.deepEqual(fast.teams[1].players,m.teams[1].players);
 // a later stage brings a stronger opponent
 const later=matchTeams(cfg,h,{stage:8,game:{home:'waves',away:m.teams[1].id}});
 assert.ok(overall(later.teams[1].players[0])>=overall(m.teams[1].players[0]));
});

test('island: a season game starts with the club, is paid once and the club survives save and load',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};let now=1_000_000;
 const engine=createEngine(data,{storage,now:()=>now});
 engine.skipTutorial?.();engine.state.money=50000;let placed=false;
 for(let z=0;z<engine.state.world.size&&!placed;z++)for(let x=0;x<engine.state.world.size&&!placed;x++)placed=!!engine.place('basketball',x,z)?.ok;
 assert.ok(placed,'a basketball court is built the normal way');
 // the real record (installed by the extension) with a headless start that only keeps the context
 let ctx;const real=engine.registry.minigames.get('streetSlam');assert.ok(real);engine.registry.minigames.set('streetSlam',{...real,start:c=>{ctx=c;return {dispose(){}};}});
 assert.equal(engine.hoops.settings({profile:'quick'}).ok,true);assert.equal(engine.hoops.settings({profile:'nba'}).ok,false);
 const started=engine.startMinigame('streetSlam',{seed:4321});assert.equal(started.ok,true,JSON.stringify(started));
 assert.ok(ctx.hoopsGame&&ctx.hoopsGame.id,'the next season game is handed to the game');
 assert.equal(engine.hoops.setLineup(engine.state.hoops.lineup).reason,'reason.gameBusy','club is locked while a game runs');
 const g=play({seed:4321,hoops:ctx.hoops,stage:ctx.level});
 const money=engine.state.money,credits=engine.state.hoops.credits;
 const done=ctx.finish(payload(g,ctx.hoopsGame.id));assert.equal(done.ok,true,JSON.stringify(done));
 assert.ok(engine.state.hoops.rewarded.includes(ctx.hoopsGame.id));assert.ok(engine.state.hoops.credits>credits);assert.ok(engine.state.money>=money);
 assert.equal(ctx.finish(payload(g,ctx.hoopsGame.id)).reason,'reason.duplicate');
 // a new island on the same storage loads the club exactly as it was saved
 const again=createEngine(data,{storage,now:()=>now+1000});assert.equal(again.state.money,engine.state.money);
 assert.deepEqual(again.state.hoops,engine.state.hoops);assert.ok(validateSave(again.state,data,again.registry).ok);
});

test('saves: an older save without the club gets the default club, a damaged club is refused',()=>{
 const e=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>5000});
 const old=createInitialState(data,5000);old.money=777;delete old.hoops;
 const r=migrateSave(clone(old),data,e.registry);assert.equal(r.ok,true);assert.equal(r.state.money,777);assert.deepEqual(r.state.hoops,initialHoops(cfg));
 const broken=createInitialState(data,5000);broken.hoops.v=7;assert.equal(migrateSave(broken,data,e.registry).ok,false);
 const bad=createInitialState(data,5000);bad.hoops.lineup=[];assert.equal(migrateSave(bad,data,e.registry).ok,false);
});
