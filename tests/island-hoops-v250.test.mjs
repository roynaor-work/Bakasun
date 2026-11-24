// Basketball v25.0 (24/11/2026), round 2: shot meter, quiet HUD, tap on a team-mate, rebound jump timing, defender auto-stick,
// made-basket replay, special meter and the foot-slide measure. The rules live in hoops-v250.mjs; the engine takes them through
// `v250`, and `?hoopsV250=0` is the v24.9 game exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hoopsV250Flags,engineV250,FLAGS,V250,meterModel,releaseGrade,pickTapTarget,isTap,reboundTiming,reboundCue,shotCue,stickAssist,specialGain,basketReplayTrigger,broadcastReplayCamera,plantedSlide,slideSummary} from '../workout/island/minigames/hoops-v250.mjs';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
import {cutTimeline,segmentAt,replayTriggers} from '../workout/island/minigames/hoops-show.mjs';
import {decodeTallPack,chooseTallMotion} from '../workout/island/minigames/hoops-tall.mjs';
import {createHeading,stepHeading} from '../workout/island/minigames/athletes-gait.mjs';
import {FEET} from '../workout/island/minigames/hoops-v250.mjs';

const island=new URL('../workout/island/',import.meta.url);
const text=rel=>readFileSync(new URL(rel,island),'utf8');
const cfg=()=>JSON.parse(text('data/config.json')).minigames.streetSlam;
const Q=s=>new URLSearchParams(s);
function engine(flagsQuery='',seed=77,extra={}){
 const config=cfg(),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',v250:engineV250(hoopsV250Flags(Q(flagsQuery))),...extra});
 return {e,S:e.debug.state,config};
}
const live=(e,S)=>{for(let i=0;i<4000&&!(S.phase==='live'&&S.ball.state==='held');i++)e.step(NO_INPUT);e.drainEvents();};
const mine=(S)=>S.teams[0].roster.find(p=>p.id===S.controlled);

test('switches: every part is on by default, each has its own switch, `?hoopsV250=0` turns all of them off',()=>{
 const on=hoopsV250Flags(Q(''));
 assert.equal(on.on,true);for(const k of Object.keys(FLAGS))assert.equal(on[k],true,k);
 const off=hoopsV250Flags(Q('hoopsV250=0'));
 assert.equal(off.on,false);for(const k of Object.keys(FLAGS))assert.equal(off[k],false,k);
 assert.equal(engineV250(off),null);
 for(const [k,name] of Object.entries(FLAGS)){const f=hoopsV250Flags(Q(name+'=0'));assert.equal(f[k],false);assert.equal(Object.keys(FLAGS).filter(x=>!f[x]).length,1);}
 const e=engineV250(hoopsV250Flags(Q('hoopsSpecial=0&hoopsStick=0')));
 assert.equal(e.special,null);assert.equal(e.stick,null);assert.equal(e.tapPass,true);assert.ok(e.rebound);
 assert.equal(hoopsV250Flags(null).on,true);
});

test('`?hoopsV250=0` is the v24.9 engine: same events and score as an engine without the option, and no new snapshot fields',()=>{
 const run=(extra)=>{const config=cfg(),clubs=matchTeams(config,initialHoops(config),{stage:1}),e=createHoopsEngine({config,seed:5,teams:clubs.teams,userTeam:0,profile:'quick',autopilot:true,...extra});let n=0,sig=0;for(let i=0;i<2400;i++){e.step(NO_INPUT);for(const ev of e.drainEvents()){n++;sig=(sig*31+ev.type.length+ev.tick)>>>0;}}return {n,sig,s:e.snapshot()};};
 const a=run({}),b=run({v250:engineV250(hoopsV250Flags(Q('hoopsV250=0')))});
 assert.equal(a.n,b.n);assert.equal(a.sig,b.sig);assert.deepEqual(a.s.score,b.s.score);
 assert.equal('special' in b.s,false);assert.equal('rebound' in b.s,false);
 // an autopilot game with the layer on plays the same game too: every part belongs to the child's own input
 const c=run({v250:engineV250(hoopsV250Flags(Q('')))});
 assert.equal(c.n,a.n);assert.deepEqual(c.s.score,a.s.score);assert.deepEqual(c.s.special,{v:0,ready:false,used:0});
});

test('shot meter: the model is the engine rule (green and yellow around the clip release), the marker rises with the hold',()=>{
 const shot=cfg().shot,rel=0.8,m0=meterModel(0,rel,shot),mi=meterModel(rel,rel,shot),ml=meterModel(rel+shot.window,rel,shot);
 assert.equal(m0.marker,0);assert.equal(ml.marker,1);assert.ok(mi.marker>mi.green[0]&&mi.marker<mi.green[1]);
 assert.equal(mi.zone,'green');assert.equal(m0.zone,'red');assert.equal(m0.early,true);assert.equal(ml.early,false);
 assert.ok(mi.yellow[0]<mi.green[0]&&mi.green[1]<mi.yellow[1]);
 // the green window is wide enough to see on a 132 px meter (more than 14 px) and sits in the upper half
 assert.ok((mi.green[1]-mi.green[0])*132>14,'green window '+((mi.green[1]-mi.green[0])*132).toFixed(1)+' px');assert.ok(mi.ideal>0.5);
 const g=shot.window*shot.green;
 assert.equal(meterModel(rel+g*0.9,rel,shot).zone,'green');assert.equal(meterModel(rel+g*1.2,rel,shot).zone,'yellow');assert.equal(meterModel(rel-shot.window*0.95,rel,shot).zone,'red');
 assert.equal(releaseGrade({zone:'green'}),'perfect');assert.equal(releaseGrade({zone:'yellow',early:true}),'good');assert.equal(releaseGrade({zone:'red',early:true}),'early');assert.equal(releaseGrade({zone:'red',early:false}),'late');
});

test('shot meter and engine agree: releasing where the model says green is graded green by the engine',()=>{
 const {e,S,config}=engine('');live(e,S);const p=mine(S);e.debug.give(p.id);e.debug.place(p.id,S.dir[0]*5,2);for(let i=0;i<20;i++)e.step(NO_INPUT);e.drainEvents();
 e.step({...NO_INPUT,shootDown:true});
 let zone=null;for(let i=0;i<120;i++){const q=mine(S);if(!q.shot)break;const m=meterModel(q.actT,q.shot.releaseAt,config.shot);if(m.zone==='green'){zone=m.zone;e.step({...NO_INPUT,shootUp:true});break;}e.step(NO_INPUT);}
 assert.equal(zone,'green');
 const t=e.drainEvents().find(ev=>ev.type==='timing');assert.ok(t);assert.equal(t.zone,'green');
});

test('tap: a short still touch on a team-mate picks him; a drag, a long press or a touch on empty floor picks nobody',()=>{
 assert.equal(isTap({x:10,y:10,t:0},{x:14,y:12,t:120}),true);
 assert.equal(isTap({x:10,y:10,t:0},{x:40,y:10,t:120}),false);
 assert.equal(isTap({x:10,y:10,t:0},{x:10,y:10,t:600}),false);
 assert.equal(isTap(null,{x:1,y:1,t:1}),false);
 const c=[{id:'a',foot:{x:100,y:200},head:{x:100,y:140}},{id:'b',foot:{x:180,y:210},head:{x:182,y:150}},{id:'c',foot:{x:300,y:100},head:{x:300,y:60},visible:false}];
 assert.equal(pickTapTarget({x:104,y:170},c),'a');
 assert.equal(pickTapTarget({x:150,y:180},c),'b');       // between two: the nearer body
 assert.equal(pickTapTarget({x:100,y:290},c),null);      // below the feet, outside the radius
 assert.equal(pickTapTarget({x:300,y:80},c),null);       // not on screen
 assert.ok(V250.tap.radius>=32,'a child finger needs at least 32 px');
});

test('tap pass in the engine: `passTo` throws to that team-mate even when the stick points elsewhere; an opponent id is ignored',()=>{
 const {e,S}=engine('');live(e,S);const p=mine(S);e.debug.give(p.id);for(let i=0;i<10;i++)e.step(NO_INPUT);e.drainEvents();
 const mates=S.teams[0].roster.filter(q=>q.onCourt&&q.id!==p.id),far=mates.reduce((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)>Math.hypot(b.x-p.x,b.z-p.z)?a:b);
 e.step({...NO_INPUT,move:{x:-(far.x-p.x),z:-(far.z-p.z)},passTo:far.id});
 const ev=e.drainEvents();assert.equal(ev.find(x=>x.type==='passStart')?.targetId,far.id);assert.equal(ev.find(x=>x.type==='tapPass')?.targetId,far.id);
 // an opponent's id: nothing happens
 const b=engine('',78);live(b.e,b.S);const p2=mine(b.S);b.e.debug.give(p2.id);for(let i=0;i<10;i++)b.e.step(NO_INPUT);b.e.drainEvents();
 b.e.step({...NO_INPUT,passTo:b.S.teams[1].roster.find(q=>q.onCourt).id});assert.equal(b.e.drainEvents().some(x=>x.type==='passStart'),false);
 // switched off: the field is ignored
 const c=engine('hoopsTapPass=0',77);live(c.e,c.S);const p3=mine(c.S);c.e.debug.give(p3.id);for(let i=0;i<10;i++)c.e.step(NO_INPUT);c.e.drainEvents();
 c.e.step({...NO_INPUT,passTo:c.S.teams[0].roster.find(q=>q.onCourt&&q.id!==p3.id).id});assert.equal(c.e.drainEvents().some(x=>x.type==='passStart'),false);
});

test('tap on defence takes control of the tapped team-mate',()=>{
 const {e,S}=engine('');live(e,S);const opp=S.teams[1].roster.find(q=>q.onCourt);e.debug.give(opp.id);for(let i=0;i<6;i++)e.step(NO_INPUT);e.drainEvents();
 const p=mine(S),other=S.teams[0].roster.find(q=>q.onCourt&&q.id!==p.id);
 e.step({...NO_INPUT,passTo:other.id});
 assert.equal(S.controlled,other.id);assert.ok(e.drainEvents().some(x=>x.type==='tapSwitch'&&x.playerId===other.id));
});

test('rebound timing: the top of the jump is perfect, the edges are early (already coming down) or late (still going up)',()=>{
 assert.deepEqual(reboundTiming(0.5),{value:1,grade:'perfect'});
 assert.equal(reboundTiming(0.4).grade,'perfect');assert.equal(reboundTiming(0.75).grade,'good');
 assert.equal(reboundTiming(0.05).grade,'late');assert.equal(reboundTiming(0.97).grade,'early');
 assert.ok(reboundTiming(0.5).value>reboundTiming(0.7).value&&reboundTiming(0.7).value>reboundTiming(0.95).value);
 // the bonus is smaller than the airborne bonus every jumper already has: timing helps, it does not decide alone
 assert.ok(V250.rebound.bonus<0.35&&V250.rebound.bonus>0);
});

test('rebound cue: time to the catching height from the ball flight, green inside the jump window only',()=>{
 const g=9.8,c=reboundCue({x:10,y:3.6,z:0,vx:-1,vy:1.5,vz:0.5},g);
 // y(t)=3.6+1.5t-4.9t^2 = 3.0 -> t=0.535
 assert.ok(Math.abs(c.t-0.535)<0.01,String(c.t));assert.ok(Math.abs(c.x-(10-0.535))<0.02);assert.equal(c.go,true);
 assert.equal(reboundCue({x:0,y:6,z:0,vx:0,vy:2,vz:0},g).go,false);          // still far up: not yet
 assert.equal(reboundCue({x:0,y:2.5,z:0,vx:0,vy:-2,vz:0},g).t,0);             // already under the catching height
 const f=shotCue({x:4,y:4.2,z:0,vx:3,vy:1,vz:0},3.05,{x:11.6,z:0},g);
 assert.equal(f.flight,true);assert.equal(f.x,11.6);assert.ok(f.t>V250.rebound.bounce);
});

test('rebound in the engine: the cue is in the snapshot while a shot is in the air, and a jump at the catch is graded',()=>{
 const {e,S}=engine('',91);live(e,S);
 let cue=0,graded=null,jumped=0;
 for(let i=0;i<60*240&&S.phase!=='final'&&!graded;i++){
  const s=e.snapshot(),inp={...NO_INPUT,move:{x:0,z:0}};
  if(s.rebound){cue++;const me=s.players.find(p=>p.id===s.controlled);if(me&&!me.hasBall){const d=Math.hypot(s.rebound.x-me.x,s.rebound.z-me.z);if(d>0.2)inp.move={x:(s.rebound.x-me.x)/d,z:(s.rebound.z-me.z)/d};if(s.rebound.go&&i-jumped>40){inp.shootDown=true;jumped=i;}}}
  e.step(inp);for(const ev of e.drainEvents())if(ev.type==='reboundTiming')graded=ev;
 }
 assert.ok(cue>10,'cue frames '+cue);assert.ok(graded,'a graded rebound jump');assert.ok(['perfect','good','early','late'].includes(graded.grade));
 const off=engine('hoopsRebound250=0',91);live(off.e,off.S);assert.equal(off.e.snapshot().rebound,null);
});

test('auto-stick: steering at the man pulls to the guarding spot and settles there; steering away or far away is untouched',()=>{
 const rim={x:12.6,z:0},man={x:6,z:0},gap=1;                      // guarding spot = (7,0)
 const a=stickAssist({x:4.5,z:1.5},{x:1,z:0},man,rim,gap);        // running at the man from behind-left
 assert.ok(a&&a.z<0,'pulled across to the spot');assert.ok(Math.abs(Math.hypot(a.x,a.z)-1)<1e-6);assert.equal(a.speed,1);
 const near=stickAssist({x:6.7,z:0.1},{x:1,z:0},man,rim,gap);assert.ok(near.speed<0.5,'slows into the spot');
 assert.equal(stickAssist({x:6.5,z:1},{x:-1,z:0.2},man,rim,gap),null,'steering away breaks free');
 assert.equal(stickAssist({x:0,z:6},{x:1,z:0},man,rim,gap),null,'far away: no pull');
 assert.equal(stickAssist({x:7,z:0.05},{x:0,z:1},man,rim,gap).speed,0,'on the spot: stays');
 // the stick still matters: more than a third of the direction is the child's
 assert.ok(V250.stick.pull<=0.65);
});

test('special meter: only the child team\'s good play fills it, it becomes ready at 1, the fire shot uses it and adds to the chance',()=>{
 const ctx={userTeam:0,controlled:'me',teamOf:id=>id==='x'?1:0};
 assert.ok(specialGain({type:'timing',playerId:'me',zone:'green'},ctx)>specialGain({type:'timing',playerId:'me',zone:'yellow'},ctx));
 assert.equal(specialGain({type:'timing',playerId:'me',zone:'red'},ctx),0);
 assert.equal(specialGain({type:'score',team:1,points:3},ctx),0);assert.ok(specialGain({type:'score',team:0,points:3},ctx)>specialGain({type:'score',team:0,points:2},ctx));
 assert.equal(specialGain({type:'steal',playerId:'x'},ctx),0);assert.ok(specialGain({type:'block',playerId:'me'},ctx)>0);
 assert.equal(specialGain({type:'foul'},ctx),0);
 // it takes several good plays: no single event fills more than a quarter
 for(const v of Object.values(V250.special))assert.ok(v<=0.25);
 const {e,S}=engine('',33);live(e,S);const p=mine(S);
 S.special.v=0.95;e.debug.give(p.id);e.debug.place(p.id,S.dir[0]*5,2);for(let i=0;i<20;i++)e.step(NO_INPUT);e.drainEvents();
 // a green release fills it
 e.step({...NO_INPUT,shootDown:true});for(let i=0;i<120;i++){const q=mine(S);if(!q.shot||q.actT>=q.shot.releaseAt-1/120)break;e.step(NO_INPUT);}e.step({...NO_INPUT,shootUp:true});
 let ev=e.drainEvents();assert.ok(ev.some(x=>x.type==='specialReady'));assert.equal(e.snapshot().special.ready,true);
 for(let i=0;i<4000&&!(S.phase==='live'&&S.ball.state==='held');i++)e.step(NO_INPUT);e.drainEvents();
 const q=mine(S);e.debug.give(q.id);e.debug.place(q.id,S.dir[0]*5,2);for(let i=0;i<20;i++)e.step(NO_INPUT);e.drainEvents();
 e.step({...NO_INPUT,shootDown:true});for(let i=0;i<120;i++){const r=mine(S);if(!r.shot||r.actT>=r.shot.releaseAt-1/120)break;e.step(NO_INPUT);}e.step({...NO_INPUT,shootUp:true});
 ev=[];for(let i=0;i<40;i++){e.step(NO_INPUT);ev.push(...e.drainEvents());}
 const rel=ev.find(x=>x.type==='release');assert.equal(rel.special,true);assert.ok(ev.some(x=>x.type==='specialUsed'));
 assert.equal(e.snapshot().special.ready,false);assert.equal(e.snapshot().special.used,1);assert.ok(rel.chance<=0.97);
});

test('made-basket replay: a three or a green basket of the child\'s team, never the opponents, free throws or a second one inside the cooldown',()=>{
 const st=()=>({lastWall:null,green:new Set()});
 const three={type:'score',team:0,points:3,playerId:'a',shotType:'jumpshot',shotId:4};
 let s=st();const t=basketReplayTrigger([three],{state:s,wall:100});
 assert.equal(t.reason,'three');assert.equal(t.cam,'broadcast');assert.equal(t.shotId,4);
 assert.equal(basketReplayTrigger([three],{state:s,wall:110}),null,'cooldown');
 assert.ok(basketReplayTrigger([three],{state:s,wall:100+V250.replay.cooldown+1}));
 s=st();assert.equal(basketReplayTrigger([{...three,team:1}],{state:s,wall:1}),null);
 assert.equal(basketReplayTrigger([{...three,points:1,shotType:'ft'}],{state:s,wall:1}),null);
 assert.equal(basketReplayTrigger([{...three,points:2}],{state:s,wall:1}),null,'a plain two is not replayed');
 basketReplayTrigger([{type:'timing',playerId:'a',zone:'green'}],{state:s,wall:1});
 assert.equal(basketReplayTrigger([{...three,points:2}],{state:s,wall:2}).reason,'green');
 // the show's own replays (dunk, alley-oop, buzzer) keep theirs
 s=st();assert.equal(basketReplayTrigger([three],{state:s,wall:1,existing:[{playerId:'a',reason:'buzzer'}]}),null);
 assert.deepEqual(replayTriggers([three],{clock:300,quarter:1,score:[3,0]}),[],'the old rule does not replay a plain three');
});

test('made-basket replay cut: one slow-motion segment around the net and a blend back, about three and a half seconds',()=>{
 const cut=V250.replay.cut,tl=cutTimeline(4,6,cut);
 assert.equal(tl.segments[0].wall,0);assert.equal(tl.segments[1].scale,cut.slowScale);
 assert.ok(tl.wall>3&&tl.wall<4.2,String(tl.wall));
 assert.equal(segmentAt(tl,0.01).cam,'chase');assert.equal(segmentAt(tl,tl.wall-0.1).cam,'back');
 const court={rimX:12.6},cam=broadcastReplayCamera({x:6,z:2},1,court);
 assert.ok(cam.pos[1]>3.5&&cam.pos[2]>8,'high, on the main-camera side');assert.ok(cam.look[0]>6&&cam.look[0]<12.6,'between the shooter and the rim');assert.ok(cam.fov<=36);
 assert.ok(broadcastReplayCamera({x:-6,z:0},-1,court).look[0]<0);
});

test('foot slide measure: only a planted foot counts, the summary is in metres per second',()=>{
 assert.equal(plantedSlide({x:0,y:0.05,z:0},{x:0.02,y:0.04,z:0}),0.02);
 assert.equal(plantedSlide({x:0,y:0.3,z:0},{x:0.5,y:0.04,z:0}),0);
 const s=slideSummary([0.001,0.002,0.02,0.001],60,0.6);
 assert.equal(s.n,4);assert.equal(s.badPct,25);assert.ok(Math.abs(s.mean-0.36)<1e-9);
 assert.deepEqual(slideSummary([]),{n:0,mean:0,p95:0,badPct:0});
});

test('feet: the side shuffle is kept to the speed its stride covers, a body drawn towards its travel direction runs forward',()=>{
 const tall=cfg().assets.tall,pack=decodeTallPack(JSON.parse(text(tall.base+tall.motion)));
 const st={gait:null,dribbleGait:null,cross:false,spin:false,celebrate:0,stumbleT:0,guardLocked:false},base={face:0,vx:0,vz:0,hasBall:false,dribbling:false,act:null,actT:0};
 const F=on=>({...FEET,yaw:Math.PI/2,following:on});
 // travelling along +x while the engine face is +z: v24.9 shuffles at 4 m/s
 assert.match(chooseTallMotion(pack,{...base,vx:4},{},st).clip,/^defensive_slide/);
 // v25.0: above slideMax it is a forward gait, whether or not the body already turned
 assert.doesNotMatch(chooseTallMotion(pack,{...base,vx:4},{feet250:F(false)},st).clip,/^defensive_slide/);
 assert.doesNotMatch(chooseTallMotion(pack,{...base,vx:1.8},{feet250:F(true)},st).clip,/^defensive_slide/,'drawn facing the travel direction: no shuffle');
 assert.match(chooseTallMotion(pack,{...base,vx:1.8},{feet250:F(false)},st).clip,/^defensive_slide/,'a slow sideways step is still a shuffle');
 assert.doesNotMatch(chooseTallMotion(pack,{...base,vx:3},{defending:true,feet250:F(false)},st).clip,/^defensive_slide/);
 assert.match(chooseTallMotion(pack,{...base,vx:1.5},{defending:true,feet250:F(false)},st).clip,/^defensive_slide/);
 // the shuffle clip covers refSpeed x rate: the cap keeps the worst gap under 1.3 m/s (it was above 4)
 const ref=pack.clips.defensive_slide_left.refSpeed;assert.ok(FEET.slideMax-ref*FEET.slideRate<1.3,String(FEET.slideMax-ref*FEET.slideRate));
 // a defender faster than slideMax turns his body to where he runs (v24.9 kept him sideways up to 4.2 m/s)
 const run=(h)=>{const s=createHeading(0);let y=0;for(let i=0;i<60;i++)y=stepHeading(s,{face:0,vx:3,vz:0},{defending:true,hasBall:false},1/60,h);return y;};
 assert.ok(Math.abs(run(undefined))<0.01);assert.ok(Math.abs(run(FEET.heading)-Math.PI/2)<0.05);
 assert.ok(FEET.dwell>0.1&&FEET.dwell<=0.3);
});

test('wiring: the session builds the layer behind the switch, drops the labels and the words, and the files are in the offline list',()=>{
 const session=text('minigames/hoops-session.mjs'),hud=text('minigames/hoops-v250-hud.mjs'),css=text('minigames/hoops-v250.css'),view=text('minigames/hoops-view.mjs');
 assert.match(session,/v250:engineV250\(v250\)/);assert.match(session,/if\(!v250\.hud\|\|params\.get\('hoopsLabels'\)\)roleLabels=/);
 assert.match(session,/if\(!v250\.hud&&e\.type==='pass'/);assert.match(session,/inp\.passTo=tap/);
 assert.match(view,/trigger\.cut\|\|SHOW\.cut/);assert.match(view,/broadcastReplayCamera/);
 // the layer never takes a touch away from the stick or the buttons, and has no words
 assert.match(css,/\.hv250\{[^}]*pointer-events:none/);assert.doesNotMatch(hud,/[֐-׿]/);assert.doesNotMatch(css,/[֐-׿]/);
 assert.match(hud,/passive:true/);
 for(const f of [hud,css,text('minigames/hoops-v250.mjs')]){assert.doesNotMatch(f,/[؀-ۿ]/);assert.doesNotMatch(f,/https?:\/\/(?!www\.w3\.org)/);}
 const manifest=text('offline-manifest.json');
 for(const f of ['minigames/hoops-v250.mjs','minigames/hoops-v250-hud.mjs','minigames/hoops-v250.css'])assert.ok(manifest.includes(f),f+' in the offline manifest');
});
