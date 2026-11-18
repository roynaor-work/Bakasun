// Soccer presentation M4 (11/11/2026, "soccerShow"): the pure rules behind the two-cut goal replay, the celebration cast and choreography, the
// crowd mood, the broadcast box zoom, the timeline (what holds the model and when) and the recorder access the replay reads. No DOM, no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {resolveSoccerShow,soccerShowEnabled,soccerShowConfig,SOCCER_SHOW_DEFAULTS,replayCuts,shortCuts,replayCursor,strikeTime,celebrationCast,celebrationPose,fulltimeRoles,crowdReaction,boxExcitement,stepCrowdMood,wideCamera,closeCamera,celebrateCamera,createSoccerShowTimeline} from '../workout/island/minigames/soccer-show.mjs';
import {playerAnimation,soccerCamera,soccerBoxFactor} from '../workout/island/minigames/soccer-presentation.mjs';
import {createSoccerDesignReplay} from '../workout/island/minigames/soccer-design-replay.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {soccerCodexStates,soccerV10States,soccerV12Overlay} from '../workout/island/minigames/soccer-codex-motion.mjs';
import {soccerV8States} from '../workout/island/minigames/soccer-v8.mjs';
import {composeSoccerRestartMotion} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion,SOCCER_SHOW_DEJECTED} from '../workout/island/minigames/soccer-design-character.mjs';

const read=f=>JSON.parse(readFileSync(new URL('../workout/island/'+f,import.meta.url),'utf8'));
const config=read('data/config.json').minigames.soccer,pitch=config.pitch,cfg=soccerShowConfig(config);
const near=(a,b,eps=1e-6,msg)=>assert.ok(Math.abs(a-b)<=eps,msg||`${a} != ${b}`);
/** A goal state: team 0 scored at the +x goal, scorer 0 near the spot, mates 1 and 6, rival keeper 5 on his line. */
const goalState=(over={})=>({phase:'goal',goalTeam:0,scorer:0,attackDir:1,score:[1,0],controlled:0,sprint:{active:false},ball:{x:pitch.length/2+.4,y:.3,z:.8,vx:1,vz:0,lastPlayer:0,owner:null},
  players:[{id:0,team:0,role:'striker',x:18,z:2,fx:1,fz:0,vx:0,vz:0},{id:1,team:0,role:'support',x:14,z:-3,fx:1,fz:0,vx:0,vz:0},{id:2,team:0,role:'keeper',x:-22,z:0,fx:1,fz:0,vx:0,vz:0},
    {id:3,team:1,role:'striker',x:10,z:0,fx:-1,fz:0,vx:0,vz:0},{id:4,team:1,role:'support',x:16,z:4,fx:-1,fz:0,vx:0,vz:0},{id:5,team:1,role:'keeper',x:22.5,z:.5,fx:-1,fz:0,vx:0,vz:0},
    {id:6,team:0,role:'wing',x:12,z:8,fx:1,fz:0,vx:0,vz:0},{id:7,team:1,role:'wing',x:8,z:-6,fx:-1,fz:0,vx:0,vz:0}],...over});

test('flag: v1 by default, ?soccerShow=0 restores the previous presentation, the query wins over the config value',()=>{
  assert.equal(resolveSoccerShow(undefined,''),'v1');assert.equal(resolveSoccerShow('v1','?soccerShow=0'),'0');assert.equal(resolveSoccerShow('0',''),'0');
  assert.equal(soccerShowEnabled(undefined,'?soccerShow=off'),false);assert.equal(soccerShowEnabled('0','?soccerShow=v1'),true);assert.equal(soccerShowEnabled(config.show.version,''),true);
  assert.equal(config.show.version,'v1','data/config.json ships the show on');
  assert.equal(cfg.replay.before,config.show.replay.before);assert.equal(cfg.camera.wide.fov,SOCCER_SHOW_DEFAULTS.camera.wide.fov,'nested defaults survive a partial config block');
  assert.deepEqual(soccerShowConfig({}),SOCCER_SHOW_DEFAULTS);
});

test('replay cuts: wide build-up in real time, then the close angle at half speed through the net, clamped to the recording',()=>{
  const cuts=replayCuts({strike:9.4,contact:10,oldest:5.4,latest:10.45},cfg.replay);
  assert.equal(cuts.segments.length,2);
  const [wide,close]=cuts.segments;
  assert.equal(wide.cam,'wide');near(wide.from,9.4-cfg.replay.before);near(wide.to,9.4-cfg.replay.strikeLead);assert.equal(wide.rate,Math.max(1,(wide.to-wide.from)/cfg.replay.maxWideSeconds));
  assert.equal(close.cam,'close');near(close.from,wide.to);near(close.to,10.45);near(close.rate,Math.max(cfg.replay.slowRate,(close.to-close.from)/cfg.replay.maxCloseSeconds));assert.ok(close.rate<=.65,'slow motion');near(close.wall,(close.to-close.from)/close.rate);near(close.wallStart,wide.wall);
  near(cuts.wall,wide.wall+close.wall);assert.ok(cuts.wall>=3.5&&cuts.wall<=5,'about four seconds on screen: '+cuts.wall);
  // a long-range shot: the slow motion starts no earlier than closeMaxBefore before the line, the wide angle keeps the long flight
  const long=replayCuts({strike:7.4,contact:10,oldest:5,latest:10.4},cfg.replay);
  near(long.segments[1].from,10-cfg.replay.closeMaxBefore);assert.ok(long.segments[0].rate>1,'the wide angle is compressed to maxWideSeconds');near(long.segments[0].wall,cfg.replay.maxWideSeconds);
  // no kick in the recording: the strike is assumed strikeFallback before the line
  near(replayCuts({strike:null,contact:10,oldest:5,latest:10.4},cfg.replay).strike,10-cfg.replay.strikeFallback);
  // a goal straight after a restart: too little recording, no replay (the celebration starts instead)
  assert.equal(replayCuts({strike:9.9,contact:10,oldest:9.3,latest:10.2},cfg.replay),null);
  // barely enough recording: one close cut only
  const tiny=replayCuts({strike:9.8,contact:10,oldest:8.95,latest:10.3},cfg.replay);assert.equal(tiny.segments.length,1);assert.equal(tiny.segments[0].cam,'close');
  const short=shortCuts({at:20,oldest:16,latest:20.4},cfg.short);assert.equal(short.segments.length,1);near(short.segments[0].from,20-cfg.short.before);near(short.segments[0].to,20.4);assert.equal(short.segments[0].rate,cfg.short.rate);
  assert.equal(shortCuts({at:20,oldest:19.9,latest:20.1},cfg.short),null);
});

test('replay cursor walks the wall clock through the segments and reports the end',()=>{
  const cuts=replayCuts({strike:9.4,contact:10,oldest:5.4,latest:10.45},cfg.replay),[wide,close]=cuts.segments;
  const a=replayCursor(cuts,0);assert.equal(a.cut,0);assert.equal(a.cam,'wide');near(a.time,wide.from);assert.equal(a.done,false);
  const b=replayCursor(cuts,wide.wall+.4);assert.equal(b.cut,1);assert.equal(b.cam,'close');near(b.time,close.from+.4*close.rate);assert.equal(b.rate,close.rate);
  const c=replayCursor(cuts,cuts.wall+1);assert.equal(c.done,true);near(c.time,close.to);
});

test('strike time: the last rise of the scorer\'s kick or header clock before the line',()=>{
  const samples=[{time:0,kick:0,header:0},{time:.1,kick:.42,header:0},{time:.2,kick:.32,header:0},{time:.9,kick:0,header:0},{time:1,kick:.42,header:0},{time:1.5,kick:.2,header:0},{time:2,kick:0,header:.5}];
  near(strikeTime(samples,1.6),1);near(strikeTime(samples,2.1),2,1e-9,'a header counts');assert.equal(strikeTime([{time:0,kick:0,header:0},{time:1,kick:0,header:0}],1),null);
});

test('celebration cast: scorer, two nearest team-mates, the beaten keeper, the corner on the camera side of the goal scored in',()=>{
  const s=goalState(),cast=celebrationCast(s,pitch,cfg.celebrate);
  assert.equal(cast.scorer,0);assert.deepEqual(cast.mates,[1,6]);assert.equal(cast.keeper,5);assert.equal(cast.goalDir,1);assert.equal(cast.cameraSide,1);
  near(cast.corner.x,pitch.length/2-cfg.celebrate.cornerInset);near(cast.corner.z,pitch.width/2-cfg.celebrate.cornerInset);
  assert.ok(cast.run<=cfg.celebrate.maxRun&&cast.run>0);near(Math.hypot(cast.target.x-cast.start.x,cast.target.z-cast.start.z),cast.run);
  // second half: the camera sits on the other touchline, the corner follows it
  assert.equal(celebrationCast(goalState({attackDir:-1}),pitch,cfg.celebrate).corner.z,-(pitch.width/2-cfg.celebrate.cornerInset));
  // an own goal (last touch by the rival) casts the nearest outfield player of the scoring team
  const own=celebrationCast(goalState({scorer:4,ball:{x:pitch.length/2+.4,z:.8,lastPlayer:4}}),pitch,cfg.celebrate);assert.equal(own.scorer,0);assert.equal(own.team,0);
  // a rival goal at the -x goal: the rival scorer runs to the -x corner, the child's keeper is the beaten one
  const rival=celebrationCast(goalState({goalTeam:1,scorer:3,ball:{x:-pitch.length/2-.3,z:0,lastPlayer:3}}),pitch,cfg.celebrate);assert.equal(rival.scorer,3);assert.equal(rival.keeper,2);assert.equal(rival.goalDir,-1);
});

test('celebration choreography is pure in time: the scorer runs then celebrates, the mates arrive and clap or hop, the keeper is dejected',()=>{
  const s=goalState(),cast=celebrationCast(s,pitch,cfg.celebrate),copy=()=>s.players.map(p=>({...p})),roles={};
  let players=copy();let arrived=celebrationPose(cast,0,players,roles,cfg.celebrate);
  assert.equal(arrived,false);assert.equal(roles[0].role,'run');near(players[0].x,cast.start.x);assert.ok(players[0].sprinting);near(Math.hypot(players[0].vx,players[0].vz),cfg.celebrate.runSpeed);
  assert.equal(roles[1].role,'run');assert.equal(roles[5].role,'dejected');
  const half=cast.run/cfg.celebrate.runSpeed/2;players=copy();celebrationPose(cast,half,players,roles,cfg.celebrate);
  near(Math.hypot(players[0].x-cast.start.x,players[0].z-cast.start.z),cast.run/2,1e-6,'half way at half the run time');
  players=copy();arrived=celebrationPose(cast,10,players,roles,cfg.celebrate);
  assert.equal(arrived,true);assert.equal(roles[0].role,'celebrate');assert.equal(roles[0].clip,null);near(players[0].x,cast.target.x);near(players[0].z,cast.target.z);assert.equal(players[0].vx,0);
  assert.equal(roles[1].role,'celebrate');assert.equal(roles[1].clip,'v9_celebrate_clap');assert.equal(roles[6].role,'celebrate');assert.equal(roles[6].clip,'v9_celebrate_hop');
  for(const id of cast.mates){const d=Math.hypot(players[id].x-players[0].x,players[id].z-players[0].z);assert.ok(d>.9&&d<2.6,'a mate stands beside the scorer: '+d);}
  assert.equal(roles[5].role,'dejected');near(players[5].x,s.players[5].x,1e-9,'the keeper does not move');near(players[3].x,s.players[3].x,1e-9,'uncast players keep their positions');
  // the same elapsed time gives the same pose twice (no accumulation)
  const a=copy(),b=copy();celebrationPose(cast,1.1,a,{},cfg.celebrate);celebrationPose(cast,1.1,b,{},cfg.celebrate);assert.deepEqual(a,b);
  // the scorer faces the celebration camera (the centre spot side)
  assert.ok(players[0].fx*players[0].x+players[0].fz*players[0].z<0);
});

test('full time: winners celebrate with the pack cycling, losers stand; a draw casts nobody',()=>{
  const roles={};assert.equal(fulltimeRoles(goalState({score:[2,1]}),roles,cfg.celebrate),0);
  assert.equal(roles[0].role,'celebrate');assert.equal(roles[1].role,'celebrate');assert.equal(roles[2].role,'celebrate');assert.equal(roles[3].role,'dejected');assert.equal(roles[5].role,'dejected');
  assert.notEqual(roles[0].clip,roles[1].clip);assert.ok(cfg.celebrate.winnerClips.includes(roles[0].clip));
  const lost={};assert.equal(fulltimeRoles(goalState({score:[0,3]}),lost,cfg.celebrate),1);assert.equal(lost[0].role,'dejected');assert.equal(lost[3].role,'celebrate');
  assert.equal(fulltimeRoles(goalState({score:[1,1]}),{},cfg.celebrate),null);
});

test('crowd: cheer on a home goal, groan on a rival goal, gasp at the post; the mood decays and the excitement follows the box',()=>{
  assert.equal(crowdReaction({type:'goal',team:0}),'cheer');assert.equal(crowdReaction({type:'goal',team:1}),'groan');assert.equal(crowdReaction({type:'post'}),'gasp');assert.equal(crowdReaction({type:'pass'}),null);assert.equal(crowdReaction(null),null);
  assert.equal(boxExcitement({x:pitch.length/2-1,z:0},pitch),1);assert.equal(boxExcitement({x:0,z:0},pitch),0);
  const edge=boxExcitement({x:pitch.length/2-pitch.penaltyDepth-2,z:0},pitch,4);near(edge,.5);assert.equal(boxExcitement({x:pitch.length/2-1,z:pitch.penaltyWidth/2+5},pitch,4),0,'wide of the box');
  const mood={cheer:0,groan:0,excitement:0};
  stepCrowdMood(mood,'cheer',1,.1,cfg.crowd);assert.equal(mood.cheer,1);assert.ok(mood.excitement>0&&mood.excitement<1);
  stepCrowdMood(mood,null,0,cfg.crowd.cheerSeconds/2,cfg.crowd);near(mood.cheer,.5);
  stepCrowdMood(mood,'groan',0,.1,cfg.crowd);assert.equal(mood.groan,1);stepCrowdMood(mood,null,0,10,cfg.crowd);assert.equal(mood.groan,0);assert.equal(mood.cheer,0);assert.ok(mood.excitement<.01);
  stepCrowdMood(mood,'gasp',0,.1,cfg.crowd);assert.equal(mood.cheer,cfg.crowd.gaspLevel);
});

test('show cameras: behind the goal on the camera side, a low tripod beside the strike, the celebration from the pitch side',()=>{
  const s=goalState(),cast=celebrationCast(s,pitch,cfg.celebrate);
  const wide=wideCamera(cast,s.ball,pitch,cfg.camera.wide);assert.ok(wide.position[0]>pitch.length/2,'behind the goal line');assert.equal(wide.position[1],cfg.camera.wide.height);assert.ok(wide.position[2]>0);near(wide.target[0],s.ball.x);
  const close=closeCamera({x:18,z:2},cast,s.ball,cfg.camera.close);assert.ok(close.position[0]<18&&close.position[2]>2);assert.equal(close.position[1],cfg.camera.close.height);assert.ok(close.fov<wide.fov);
  const cel=celebrateCamera({x:21.6,z:12.6},cfg.camera.celebrate);assert.ok(cel.position[0]<21.6&&cel.position[2]<12.6,'toward the centre spot');near(Math.hypot(cel.position[0]-21.6,cel.position[2]-12.6),cfg.camera.celebrate.distance);
  assert.ok(Math.abs(cel.position[0])<pitch.length/2&&Math.abs(cel.position[2])<pitch.width/2,'the celebration camera stays over the pitch, never inside the stands');
});

test('broadcast zoom: the live camera comes closer in either box in landscape only; off by default and when the show is off',()=>{
  const g=createSoccer({config,stage:2,seed:3}),s=g.getState(),aspect=844/390;
  s.ball.x=pitch.length/2-2;s.ball.z=0;s.ball.vx=s.ball.vz=0;s.players[s.controlled].x=s.ball.x-1;s.players[s.controlled].z=0;
  const plain=soccerCamera(s,aspect,config,null,0),zoomed=soccerCamera(s,aspect,config,null,0,3);
  assert.ok(zoomed.distance<plain.distance-1,'closer in the box');assert.equal(soccerBoxFactor(s.ball,pitch),1);
  assert.deepEqual(soccerCamera(s,390/844,config,null,0,3),soccerCamera(s,390/844,config,null,0),'portrait unchanged');
  s.ball.x=0;assert.deepEqual(soccerCamera(s,aspect,config,null,0,3),soccerCamera(s,aspect,config,null,0),'no zoom at the centre');
  assert.deepEqual(soccerCamera(s,aspect,config,null,0,0),soccerCamera(s,aspect,config,null,0));
});

test('player animation: the show roles drive celebrate (with the clip hint), run and dejected; without roles the scorer rule is unchanged',()=>{
  const s=goalState(),p=s.players[0];
  const before=playerAnimation(p,s,config);assert.equal(before.mode,'celebrate');assert.equal(before.clipHint,null);
  assert.equal(playerAnimation(s.players[1],s,config).mode,'idle');
  s.show={roles:{0:{role:'run',clip:null},1:{role:'celebrate',clip:'v9_celebrate_clap'},5:{role:'dejected',clip:null}}};
  p.vx=4.6;const run=playerAnimation(p,s,config);assert.equal(run.mode,'run');assert.equal(run.clip,'run');
  const mate=playerAnimation(s.players[1],s,config);assert.equal(mate.mode,'celebrate');assert.equal(mate.clipHint,'v9_celebrate_clap');
  const keeper=playerAnimation(s.players[5],s,config);assert.equal(keeper.mode,'dejected');assert.equal(keeper.clip,'stand');assert.equal(keeper.bonePose,'dejected');
  assert.equal(playerAnimation(s.players[3],s,config).mode,'idle','uncast players are untouched');
});

/** A recorder view over fake numbers. */
const fakeRecorder=({clock,oldest,latest,strike=null})=>({clock,oldest,latest,strike:()=>strike,ballAt:(t,o)=>{o.x=23;o.y=.3;o.z=1;return o;}});
test('timeline: cut, replay (held), celebration (held then released), live at the kickoff; the simulation clock is never touched',()=>{
  const tl=createSoccerShowTimeline(cfg,pitch),live=goalState({phase:'playing'}),rec=fakeRecorder({clock:10,oldest:5.4,latest:10,strike:9.4});
  tl.update(live,1/60,rec);assert.equal(tl.phase,'live');assert.equal(tl.hold,false);
  live.phase='goal';tl.update(live,1/60,rec);assert.equal(tl.phase,'cut');assert.equal(tl.hold,false,'the live behind-goal angle lets the ball roll into the net');
  let t=0;while(tl.phase==='cut'&&t<5){tl.update(live,1/60,rec);t+=1/60;}
  assert.equal(tl.phase,'replay');assert.equal(tl.hold,true);near(t,cfg.cutSeconds,.02);assert.ok(tl.cuts.segments.length===2&&tl.cursor.cam==='wide');
  const wall=tl.cuts.wall;let r=0;while(tl.phase==='replay'&&r<20){tl.update(live,1/60,rec);r+=1/60;}
  near(r,wall,.03,'the replay lasts exactly its wall seconds');assert.equal(tl.phase,'celebrate');assert.equal(tl.hold,true);assert.equal(tl.reason,'complete');
  let c=0;while(tl.hold&&c<10){tl.update(live,1/60,rec);c+=1/60;}
  near(c,cfg.celebrate.holdSeconds,.03);assert.equal(tl.phase,'celebrate','the choreography keeps going while the simulation finishes the goal phase');
  live.phase='playing';tl.update(live,1/60,rec);assert.equal(tl.phase,'live');assert.equal(tl.hold,false);assert.equal(tl.reason,'kickoff');
  assert.equal(tl.metrics().starts,1);assert.equal(live.phase,'playing');assert.equal(live.phaseTime,undefined,'the timeline writes nothing into the state');
});

test('timeline: a tap skips the replay into the celebration, a second tap releases the hold; a short recording skips the replay entirely',()=>{
  const tl=createSoccerShowTimeline(cfg,pitch),live=goalState(),rec=fakeRecorder({clock:10,oldest:5.4,latest:10,strike:9.4});
  for(let i=0;i<60;i++)tl.update(live,1/60,rec);assert.equal(tl.phase,'replay');
  tl.skip();tl.update(live,1/60,rec);assert.equal(tl.phase,'celebrate');assert.equal(tl.hold,true);assert.equal(tl.reason,'skipped');
  tl.skip();tl.update(live,1/60,rec);assert.equal(tl.hold,false);assert.equal(tl.phase,'celebrate');
  const quick=createSoccerShowTimeline(cfg,pitch),fresh=goalState();
  for(let i=0;i<60;i++)quick.update(fresh,1/60,fakeRecorder({clock:10,oldest:9.5,latest:10}));
  assert.equal(quick.phase,'celebrate');assert.equal(quick.reason,'short-recording');assert.equal(quick.metrics().starts,0);
});

test('timeline: full time casts the finale, the shootout and drills never start a show, a post earns one short replay once the ball is out',()=>{
  const tl=createSoccerShowTimeline(cfg,pitch),live=goalState({phase:'playing',score:[2,0]}),rec=fakeRecorder({clock:40,oldest:35,latest:40});
  tl.update(live,1/60,rec);live.phase='finished';tl.update(live,1/60,rec);assert.equal(tl.phase,'fulltime');assert.equal(tl.hold,false);
  const pen=createSoccerShowTimeline(cfg,pitch),shoot=goalState({phase:'playing',shootout:{attempts:0}});
  pen.update(shoot,1/60,rec);shoot.phase='goal';for(let i=0;i<120;i++)pen.update(shoot,1/60,rec);
  assert.equal(pen.phase,'live','no broadcast inside the penalty shootout');
  const post=createSoccerShowTimeline(cfg,pitch),play=goalState({phase:'playing'});
  for(let i=0;i<300;i++)post.update(play,1/60,fakeRecorder({clock:i/60,oldest:0,latest:i/60}));
  post.event({type:'post',kind:'post'},5);post.update(play,1/60,fakeRecorder({clock:5.1,oldest:.6,latest:5.1}));assert.equal(post.phase,'live','play goes on after the post');
  play.phase='restart';play.restart={type:'goalKick'};post.update(play,1/60,fakeRecorder({clock:5.2,oldest:.6,latest:5.2}));
  assert.equal(post.phase,'short');assert.equal(post.hold,true);assert.equal(post.shortAnchor.kind,'post');near(post.cuts.segments[0].from,5-cfg.short.before);
  for(let i=0;i<300&&post.phase==='short';i++)post.update(play,1/60,fakeRecorder({clock:5.2,oldest:.6,latest:5.2}));
  assert.equal(post.phase,'live');assert.equal(post.hold,false);
  post.event({type:'post'},5.5);post.update(play,1/60,fakeRecorder({clock:5.6,oldest:1,latest:5.6}));assert.equal(post.phase,'live','one short replay per cooldown');
  assert.equal(post.metrics().shorts,1);
});

test('recorder: 4.6 s of history at every tier, the hold freezes it, the strike is found, readAt returns the recorded positions',()=>{
  // the match plays the expanded squad (12 on the pitch): the recorder sizes its rows from the same expanded config the view uses
  const squad=expandSoccerConfig(config),g=createSoccer({config,stage:2,seed:5}),rec=createSoccerDesignReplay({config:squad,fetcher:()=>Promise.reject(Error('offline')),historySeconds:4.6,capacity:146});
  const dt=1/60;let kicked=null;
  for(let i=0;i<60*6;i++){g.update(dt,{});const s=g.getState();rec.record(s,dt);if(s.players[0].kickTime>0&&kicked===null)kicked=rec.clock;}
  assert.ok(rec.latest-rec.oldest>=4.4&&rec.latest-rec.oldest<=4.6+1/30,'about 4.6 s of history: '+(rec.latest-rec.oldest));
  assert.ok(rec.count>=130,'samples at 30 Hz: '+rec.count);
  const live=g.getState(),before=rec.latest;rec.held=true;rec.record(live,1);assert.equal(rec.latest,before,'held: nothing recorded, the clock stands');rec.held=false;
  if(kicked!==null){const strike=rec.strike(0,rec.latest);assert.ok(strike!==null&&Math.abs(strike-kicked)<=1/30+1e-9,`strike ${strike} vs kick ${kicked}`);}
  const t=rec.oldest+1,shown=rec.readAt(t,live);assert.notEqual(shown,live);assert.equal(shown.replay,true);assert.equal(shown.phase,'playing');
  assert.equal(shown.players.length,live.players.length);assert.ok(Number.isFinite(shown.players[0].x)&&Number.isFinite(shown.ball.x));
  const ball={x:0,y:0,z:0};rec.ballAt(rec.latest,ball);near(ball.x,live.ball.x,.3);near(ball.z,live.ball.z,.3);
  // out of play empties the buffer only after a short grace (the post replay is asked for in the frame the ball goes out)
  rec.record({...live,phase:'restart'},1/60);assert.ok(rec.count>0,'still there in the next frame');rec.record({...live,phase:'restart'},.5);assert.equal(rec.count,0);
  const small=createSoccerDesignReplay({config:squad,fetcher:()=>Promise.reject(Error('offline'))});for(let i=0;i<60*4;i++){g.update(dt,{});small.record(g.getState(),dt);}
  assert.ok(small.latest-small.oldest<=2.1+1/30,'the default (show off) stays at 2.1 s');
  rec.dispose();small.dispose();
});

// ---- clip hints on the real motion state machine ------------------------------------------------------------------------------------------------------
const rig=read('design/characters/rig.json'),map=read('design/viewer/retarget-map.json');
const base=read('design/motion/soccer.json'),library=composeSoccerRestartMotion(base,...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')));
function rigMotion(){
  globalThis.location={search:''};
  try{
    const v12=read('assets/soccer-v12/clips.json'),o=soccerV12Overlay(v12,{v9:soccerCodexStates(read('assets/soccer-v9/clips.json')),v10:soccerV10States(read('assets/soccer-v10/clips.json'),''),v8:soccerV8States(read('assets/soccer-v8/clips.json')),v11:{}},'');
    const data={...library,states:{...library.states,...read('assets/soccer-v7/clips.json').states,...o.v8,...o.v9,...o.v10,...o.v11}},clips=compileSoccerDesignClips(data,rig,map);
    const bones={};let root;
    for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
    const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
    return {motion:createSoccerDesignMotion(mixer,clips,data,config),data};
  }finally{delete globalThis.location;}
}
const player=over=>({id:1,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,role:'support',...over});
const sim=over=>({phase:'goal',ball:{owner:null,flight:null,y:.11,vx:0,vz:0,x:0,z:0,lastPlayer:0},mode:'attack',event:null,...over});
test('motion: a team-mate\'s clip hint picks the clap, the beaten keeper takes the first dejected clip that exists, both hold until the phase ends',()=>{
  const {motion,data}=rigMotion(),p=player(),s=sim();
  motion.update(p,s,{mode:'idle'},1/60);
  motion.update(p,s,{mode:'celebrate',clipHint:'v9_celebrate_clap'},1/60);assert.equal(motion.state,'v9_celebrate_clap');
  for(let i=0;i<120;i++)motion.update(p,s,{mode:'celebrate',clipHint:'v9_celebrate_clap'},1/60);assert.equal(motion.state,'v9_celebrate_clap','held through the celebration');
  const {motion:m2}=rigMotion(),k=player({id:5,role:'keeper'});
  m2.update(k,s,{mode:'idle'},1/60);m2.update(k,s,{mode:'dejected',clipHint:null},1/60);
  const expected=SOCCER_SHOW_DEJECTED.find(n=>data.states[n]);assert.ok(expected&&!expected.startsWith('v11_keeper_after_goal'),'no shipped pack has keeper_after_goal (documented)');
  assert.equal(m2.state,expected);for(let i=0;i<90;i++)m2.update(k,s,{mode:'dejected',clipHint:null},1/60);assert.equal(m2.state,expected);
  // without a hint the scorer's pick by id is unchanged
  const {motion:m3}=rigMotion(),scorer=player({id:0});m3.update(scorer,s,{mode:'idle'},1/60);m3.update(scorer,s,{mode:'celebrate',clipHint:null},1/60);
  assert.ok(/celebrate/.test(m3.state)&&m3.state!=='v9_celebrate_clap',m3.state);
});
